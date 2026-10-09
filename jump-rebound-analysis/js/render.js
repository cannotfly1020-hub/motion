function fitCanvases() {
    const rect = video.parentElement.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
        [outputCanvas, interactionCanvas].forEach(c => { c.width = rect.width; c.height = rect.height; });
    }
    redrawOverlay();
    redrawJumpVisuals();
}

function applyZoom() { zoomTarget.style.transform = `translate(${panOffsetX}px, ${panOffsetY}px) scale(${zoomScale})`; }

function redrawOverlay() {
    intCtx.clearRect(0, 0, interactionCanvas.width, interactionCanvas.height);

    const box = getVideoDrawRect(interactionCanvas, video);

    if (userFloorY !== null) {
        const fy = box.drawY + userFloorY * box.drawH;
        intCtx.save();
        intCtx.strokeStyle = isFloorMode ? '#00ffcc' : 'rgba(0, 255, 204, 0.7)';
        intCtx.lineWidth = (isFloorMode ? 3.5 : 2.5) / zoomScale;
        intCtx.setLineDash(isFloorMode ? [] : [6 / zoomScale, 4 / zoomScale]);
        intCtx.beginPath();
        intCtx.moveTo(box.drawX, fy);
        intCtx.lineTo(box.drawX + box.drawW, fy);
        intCtx.stroke();

        if (isFloorMode) {
            intCtx.fillStyle = '#00ffcc';
            intCtx.beginPath();
            intCtx.arc(box.drawX + box.drawW / 2, fy, 8 / zoomScale, 0, Math.PI * 2);
            intCtx.fill();
        }

        intCtx.fillStyle = '#00ffcc';
        intCtx.font = `bold ${Math.max(10, 11/zoomScale)}px sans-serif`;
        intCtx.fillText(isFloorMode ? "↕️ 地面ライン (ドラッグして移動)" : "🟦 地面基準ライン", box.drawX + 10/zoomScale, fy - 8/zoomScale);
        intCtx.restore();
    }

    if (isRoiEnabled && roiNorm.w > 0.05) {
        const rx = box.drawX + roiNorm.x * box.drawW, ry = box.drawY + roiNorm.y * box.drawH;
        const rw = roiNorm.w * box.drawW, rh = roiNorm.h * box.drawH;
        intCtx.save();
        intCtx.fillStyle = 'rgba(0, 0, 0, 0.35)'; intCtx.fillRect(0, 0, interactionCanvas.width, interactionCanvas.height);
        intCtx.clearRect(rx, ry, rw, rh);
        intCtx.strokeStyle = '#ff9500'; intCtx.lineWidth = 2.5 / zoomScale; intCtx.setLineDash([6 / zoomScale, 4 / zoomScale]);
        intCtx.strokeRect(rx, ry, rw, rh);
        intCtx.restore();
    }

    if (scalePoints.length > 0) {
        intCtx.save();
        intCtx.fillStyle = '#ff9500';
        intCtx.strokeStyle = isScaleMode ? '#ff9500' : 'rgba(255, 149, 0, 0.4)';
        intCtx.lineWidth = 3 / zoomScale;
        if (!isScaleMode) intCtx.setLineDash([4/zoomScale, 4/zoomScale]);

        intCtx.beginPath();
        intCtx.arc(scalePoints[0].x, scalePoints[0].y, 6 / zoomScale, 0, Math.PI*2);
        intCtx.fill();
        if (scalePoints.length === 2) {
            intCtx.beginPath();
            intCtx.arc(scalePoints[1].x, scalePoints[1].y, 6 / zoomScale, 0, Math.PI*2);
            intCtx.fill();
            intCtx.beginPath();
            intCtx.moveTo(scalePoints[0].x, scalePoints[0].y);
            intCtx.lineTo(scalePoints[1].x, scalePoints[1].y);
            intCtx.stroke();
        }
        intCtx.restore();
    }
}

function drawSkeleton(lm, w, h) {
    outCtx.clearRect(0, 0, w, h);
    if (!lm) return;
    const box = getVideoDrawRect(outputCanvas, video);
    const pt = (idx) => landmarkToCanvas(lm[idx], box);
    outCtx.save();
    outCtx.lineWidth = 3 / zoomScale;

    const drawLine = (p1, p2, color) => {
        if (!isJointDrawable(lm[p1]) || !isJointDrawable(lm[p2])) return;
        const a = pt(p1), b = pt(p2);
        outCtx.strokeStyle = color;
        outCtx.beginPath();
        outCtx.moveTo(a.x, a.y);
        outCtx.lineTo(b.x, b.y);
        outCtx.stroke();
    };
    const trunk = 'rgba(0, 255, 204, 0.7)';
    drawLine(11, 12, trunk);
    drawLine(11, 23, trunk);
    drawLine(12, 24, trunk);
    drawLine(23, 24, trunk);
    drawLine(23, 25, '#00ffcc'); drawLine(25, 27, '#00ffcc');
    drawLine(27, 29, '#00ffcc'); drawLine(29, 31, '#00ffcc'); drawLine(27, 31, '#00ffcc');
    drawLine(24, 26, '#ffd60a'); drawLine(26, 28, '#ffd60a');
    drawLine(28, 30, '#ffd60a'); drawLine(30, 32, '#ffd60a'); drawLine(28, 32, '#ffd60a');
    [11, 23, 25, 27, 29, 31, 12, 24, 26, 28, 30, 32].forEach(idx => {
        if (!isJointDrawable(lm[idx])) return;
        const p = pt(idx);
        outCtx.globalAlpha = isJointWarn(lm[idx]) ? 0.38 : 1;
        outCtx.fillStyle = idx % 2 === 0 ? '#ffd60a' : '#00ffcc';
        outCtx.beginPath(); outCtx.arc(p.x, p.y, 4/zoomScale, 0, Math.PI*2); outCtx.fill();
        outCtx.globalAlpha = 1;
    });

    if(currentCoM) {
        outCtx.fillStyle = '#ff375f'; outCtx.beginPath(); outCtx.arc(currentCoM.x, currentCoM.y, 6/zoomScale, 0, Math.PI*2); outCtx.fill();
    }
    outCtx.restore();
}

function redrawJumpVisuals() {
    const drawMark = (pt, label, color) => {
        if (!pt) return;
        outCtx.save();
        outCtx.fillStyle = color;
        outCtx.beginPath(); outCtx.arc(pt.com.x, pt.com.y, 6/zoomScale, 0, Math.PI*2); outCtx.fill();
        outCtx.fillStyle = '#fff'; outCtx.font = `bold ${10/zoomScale}px sans-serif`;
        outCtx.fillText(label, pt.com.x + 8/zoomScale, pt.com.y - 4/zoomScale);
        outCtx.restore();
    };

    drawMark(jumps.j1.takeoff, "①離地", "#00ffcc");
    drawMark(jumps.j1.peak, "①頂点", "#00ffcc");
    drawMark(jumps.j1.landing, "①着地", "#00ffcc");

    drawMark(jumps.j2.takeoff, "②離地", "#ffd60a");
    drawMark(jumps.j2.peak, "②頂点", "#ffd60a");
    drawMark(jumps.j2.landing, "②着地", "#ffd60a");
}
