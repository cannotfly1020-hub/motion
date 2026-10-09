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

    if (userFloorY !== null) {
        const fy = userFloorY * interactionCanvas.height;
        intCtx.save();
        intCtx.strokeStyle = isFloorMode ? '#00ffcc' : 'rgba(0, 255, 204, 0.7)';
        intCtx.lineWidth = (isFloorMode ? 3.5 : 2.5) / zoomScale;
        intCtx.setLineDash(isFloorMode ? [] : [6 / zoomScale, 4 / zoomScale]);
        intCtx.beginPath();
        intCtx.moveTo(0, fy);
        intCtx.lineTo(interactionCanvas.width, fy);
        intCtx.stroke();

        if (isFloorMode) {
            intCtx.fillStyle = '#00ffcc';
            intCtx.beginPath();
            intCtx.arc(interactionCanvas.width / 2, fy, 8 / zoomScale, 0, Math.PI * 2);
            intCtx.fill();
        }

        intCtx.fillStyle = '#00ffcc';
        intCtx.font = `bold ${Math.max(10, 11/zoomScale)}px sans-serif`;
        intCtx.fillText(isFloorMode ? "↕️ 地面ライン (ドラッグして移動)" : "🟦 地面基準ライン", 10/zoomScale, fy - 8/zoomScale);
        intCtx.restore();
    }

    if (isRoiEnabled && roiNorm.w > 0.05) {
        const rx = roiNorm.x * interactionCanvas.width, ry = roiNorm.y * interactionCanvas.height;
        const rw = roiNorm.w * interactionCanvas.width, rh = roiNorm.h * interactionCanvas.height;
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
    outCtx.save();
    outCtx.lineWidth = 3 / zoomScale;

    if ([11, 12, 23, 24].every(i => isJointConfident(lm[i]))) {
        outCtx.strokeStyle = 'rgba(0, 255, 204, 0.7)';
        outCtx.beginPath(); outCtx.moveTo(lm[11].x*w, lm[11].y*h); outCtx.lineTo(lm[12].x*w, lm[12].y*h);
        outCtx.lineTo(lm[24].x*w, lm[24].y*h); outCtx.lineTo(lm[23].x*w, lm[23].y*h); outCtx.closePath(); outCtx.stroke();
    }
    const drawLine = (p1, p2, color) => {
        if (isJointConfident(lm[p1]) && isJointConfident(lm[p2])) {
            outCtx.strokeStyle = color; outCtx.beginPath(); outCtx.moveTo(lm[p1].x*w, lm[p1].y*h); outCtx.lineTo(lm[p2].x*w, lm[p2].y*h); outCtx.stroke();
        }
    };
    drawLine(24, 26, '#ffd60a'); drawLine(26, 28, '#ffd60a'); drawLine(28, 32, '#ffd60a');
    drawLine(23, 25, '#00ffcc'); drawLine(25, 27, '#00ffcc'); drawLine(27, 31, '#00ffcc');
    [24, 26, 28, 32, 23, 25, 27, 31].forEach(idx => {
        if (isJointHidden(lm[idx])) return;
        outCtx.globalAlpha = isJointWarn(lm[idx]) ? 0.38 : 1;
        outCtx.fillStyle = idx % 2 === 0 ? '#ffd60a' : '#00ffcc';
        outCtx.beginPath(); outCtx.arc(lm[idx].x*w, lm[idx].y*h, 4/zoomScale, 0, Math.PI*2); outCtx.fill();
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
