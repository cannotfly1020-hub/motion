// 実際の画面上のレンダリング位置とアスペクト比を取得
function getVideoRenderBox() {
    const cWidth = outputCanvas.width, cHeight = outputCanvas.height;
    if (!video.videoWidth || !video.videoHeight || cWidth === 0 || cHeight === 0) {
        return { x: 0, y: 0, w: cWidth, h: cHeight };
    }
    const videoRatio = video.videoWidth / video.videoHeight;
    const canvasRatio = cWidth / cHeight;
    let renderW, renderH, offsetX, offsetY;

    if (canvasRatio > videoRatio) {
        renderH = cHeight; renderW = cHeight * videoRatio;
        offsetX = (cWidth - renderW) / 2; offsetY = 0;
    } else {
        renderW = cWidth; renderH = cWidth / videoRatio;
        offsetX = 0; offsetY = (cHeight - renderH) / 2;
    }
    return { x: offsetX, y: offsetY, w: renderW, h: renderH };
}

function fitCanvases() {
    const rect = video.parentElement.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
        outputCanvas.width = interactionCanvas.width = rect.width;
        outputCanvas.height = interactionCanvas.height = rect.height;
    }
    redrawOverlay();
    if (latestLandmarks) drawPitchingBiomechanics(latestLandmarks);
}

function applyZoom() {
    zoomTarget.style.transform = `translate(${panOffsetX}px, ${panOffsetY}px) scale(${zoomScale})`;
}

function redrawOverlay() {
    intCtx.clearRect(0, 0, interactionCanvas.width, interactionCanvas.height);
    if (currentPlane !== 'sagittal') return;

    const box = getVideoRenderBox();
    const cur = planeData.sagittal;

    if (cur.scalePoints.length > 0) {
        intCtx.save();
        if (isScaleMode) {
            intCtx.fillStyle = '#ff9500';
            intCtx.strokeStyle = '#ff9500';
            intCtx.lineWidth = Math.max(1, 3 / zoomScale);

            cur.scalePoints.forEach((pt, i) => {
                intCtx.beginPath();
                intCtx.arc(pt.x, pt.y, 8 / zoomScale, 0, Math.PI * 2);
                intCtx.fill();
                intCtx.fillStyle = '#fff';
                intCtx.font = `bold ${Math.max(9, 12 / zoomScale)}px sans-serif`;
                intCtx.fillText(`点${i + 1}`, pt.x + (10 / zoomScale), pt.y - (6 / zoomScale));
                intCtx.fillStyle = '#ff9500';
            });

            if (cur.scalePoints.length === 2) {
                intCtx.beginPath();
                intCtx.moveTo(cur.scalePoints[0].x, cur.scalePoints[0].y);
                intCtx.lineTo(cur.scalePoints[1].x, cur.scalePoints[1].y);
                intCtx.stroke();
            }
        } else {
            intCtx.strokeStyle = 'rgba(255, 149, 0, 0.3)';
            intCtx.fillStyle = 'rgba(255, 149, 0, 0.4)';
            intCtx.lineWidth = Math.max(1, 1.5 / zoomScale);
            intCtx.setLineDash([4 / zoomScale, 4 / zoomScale]);

            cur.scalePoints.forEach(pt => {
                intCtx.beginPath();
                intCtx.arc(pt.x, pt.y, 4 / zoomScale, 0, Math.PI * 2);
                intCtx.fill();
            });

            if (cur.scalePoints.length === 2) {
                intCtx.beginPath();
                intCtx.moveTo(cur.scalePoints[0].x, cur.scalePoints[0].y);
                intCtx.lineTo(cur.scalePoints[1].x, cur.scalePoints[1].y);
                intCtx.stroke();
            }
        }
        intCtx.restore();
    }

    if (cur.manualReleasePoint && cur.manualGroundYNorm !== null) {
        const rx = box.x + cur.manualReleasePoint.x * box.w;
        const ry = box.y + cur.manualReleasePoint.y * box.h;
        const groundY = box.y + cur.manualGroundYNorm * box.h;

        intCtx.save();
        intCtx.strokeStyle = '#30d158';
        intCtx.lineWidth = Math.max(1, 2 / zoomScale);
        intCtx.setLineDash([4 / zoomScale, 4 / zoomScale]);
        intCtx.beginPath(); intCtx.moveTo(rx, ry); intCtx.lineTo(rx, groundY); intCtx.stroke(); intCtx.setLineDash([]);

        intCtx.fillStyle = '#30d158';
        intCtx.fillRect(rx - (25 / zoomScale), groundY - (3 / zoomScale), 50 / zoomScale, 6 / zoomScale);

        intCtx.strokeStyle = '#ff375f'; intCtx.fillStyle = '#ff375f';
        intCtx.lineWidth = Math.max(1, 2.5 / zoomScale);
        intCtx.beginPath(); intCtx.arc(rx, ry, 9 / zoomScale, 0, Math.PI * 2); intCtx.stroke();
        intCtx.beginPath(); intCtx.arc(rx, ry, 3.5 / zoomScale, 0, Math.PI * 2); intCtx.fill();

        const heightCm = cur.pxPerCm ? ((groundY - ry) / cur.pxPerCm).toFixed(1) : null;
        intCtx.fillStyle = '#fff';
        intCtx.font = `bold ${Math.max(9, 12 / zoomScale)}px sans-serif`;
        intCtx.fillText(`⚾️ リリース高: ${heightCm ? heightCm + 'cm' : '物差し未設定'}`, rx + (12 / zoomScale), ry - (6 / zoomScale));
        intCtx.restore();
    }
}

function drawPitchingBiomechanics(lm) {
    outCtx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
    outCtx.save();
    outCtx.lineWidth = Math.max(1, 3 / zoomScale);

    const box = getVideoRenderBox();
    const toPx = (p) => ({ x: box.x + p.x * box.w, y: box.y + p.y * box.h });

    const shL = lm[11], shR = lm[12], hipL = lm[23], hipR = lm[24];

    if (isJointUsable(shL) && isJointUsable(shR) && isJointUsable(hipL) && isJointUsable(hipR)) {
        const pShL = toPx(shL), pShR = toPx(shR), pHipL = toPx(hipL), pHipR = toPx(hipR);

        if (currentPlane === 'sagittal') {
            const cur = planeData.sagittal;
            const shAngle = Math.atan2((shR.z || 0) - (shL.z || 0), (shR.x - shL.x)) * (180 / Math.PI);
            const hipAngle = Math.atan2((hipR.z || 0) - (hipL.z || 0), (hipR.x - hipL.x)) * (180 / Math.PI);
            let xFactor = Math.abs(shAngle - hipAngle);
            if (xFactor > 90) xFactor = 180 - xFactor;
            if (xFactor > cur.maxRecordedXFactor && !video.paused) {
                cur.maxRecordedXFactor = xFactor;
                const elem = document.getElementById('res_max_xfactor');
                if (elem) elem.innerText = `${cur.maxRecordedXFactor.toFixed(1)}°`;
            }
        }

        if (isJointConfident(shL) && isJointConfident(shR)) {
            outCtx.strokeStyle = '#00ffcc'; outCtx.beginPath(); outCtx.moveTo(pShL.x, pShL.y); outCtx.lineTo(pShR.x, pShR.y); outCtx.stroke();
        }
        if (isJointConfident(hipL) && isJointConfident(hipR)) {
            outCtx.strokeStyle = '#ffd60a'; outCtx.beginPath(); outCtx.moveTo(pHipL.x, pHipL.y); outCtx.lineTo(pHipR.x, pHipR.y); outCtx.stroke();
        }
    }

    const drawL = (p1, p2, color) => {
        if (isJointConfident(lm[p1]) && isJointConfident(lm[p2])) {
            const pt1 = toPx(lm[p1]), pt2 = toPx(lm[p2]);
            outCtx.strokeStyle = color; outCtx.beginPath(); outCtx.moveTo(pt1.x, pt1.y); outCtx.lineTo(pt2.x, pt2.y); outCtx.stroke();
        }
    };
    drawL(12, 14, '#ff9500'); drawL(14, 16, '#ff9500');
    drawL(11, 13, '#00ffcc'); drawL(13, 15, '#00ffcc');
    drawL(24, 26, '#ffd60a'); drawL(26, 28, '#ffd60a');
    drawL(23, 25, '#ffd60a'); drawL(25, 27, '#ffd60a');

    [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].forEach(idx => {
        if (isJointHidden(lm[idx])) return;
        const pt = toPx(lm[idx]);
        outCtx.globalAlpha = isJointWarn(lm[idx]) ? 0.38 : 1;
        outCtx.fillStyle = '#ffffff';
        outCtx.beginPath();
        outCtx.arc(pt.x, pt.y, 3.5 / zoomScale, 0, Math.PI * 2);
        outCtx.fill();
        outCtx.globalAlpha = 1;
    });

    outCtx.restore();
}
