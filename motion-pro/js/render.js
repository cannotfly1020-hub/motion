function applyZoom(idx) {
    const target = document.getElementById(`zoom-target-${idx}`);
    target.style.transform = `translate(${viewState[idx].x}px, ${viewState[idx].y}px) scale(${viewState[idx].scale})`;
}

function fitCanvases() {
    [ {c: canvas1}, {c: canvas2} ].forEach(item => {
        const rect = item.c.parentElement.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) { item.c.width = rect.width; item.c.height = rect.height; }
    });
    redraw();
}

function getVideoRenderRect(vid, cvs) {
    if (!vid.videoWidth) return { width: cvs.width, height: cvs.height, x: 0, y: 0 };
    const videoRatio = vid.videoWidth / vid.videoHeight;
    const canvasRatio = cvs.width / cvs.height;
    let renderWidth, renderHeight, offsetX = 0, offsetY = 0;

    if (videoRatio > canvasRatio) {
        renderWidth = cvs.width;
        renderHeight = cvs.width / videoRatio;
        offsetY = (cvs.height - renderHeight) / 2;
    } else {
        renderHeight = cvs.height;
        renderWidth = cvs.height * videoRatio;
        offsetX = (cvs.width - renderWidth) / 2;
    }
    return { width: renderWidth, height: renderHeight, x: offsetX, y: offsetY };
}

function redraw() {
    [ {idx: 1, c: canvas1, ctx: ctx1, v: video1}, {idx: 2, c: canvas2, ctx: ctx2, v: video2} ].forEach(item => {
        if (compareMode === 0 && item.idx === 2) return; // 1画面時はCanvas2の描画をスキップ
        const s = state[item.idx];
        item.ctx.clearRect(0, 0, item.c.width, item.c.height);

        if (currentMode === 'ai') {
            if (item.idx === 1) {
                if (s.limbsLandmarks) {
                    const lm = s.limbsLandmarks;
                    const leftConnections = [[11, 13], [13, 15], [23, 25], [25, 27], [27, 29], [29, 31]];
                    item.ctx.save();
                    item.ctx.strokeStyle = 'rgba(0, 255, 204, 0.55)';
                    item.ctx.lineWidth = 3;
                    leftConnections.forEach(([i, j]) => {
                        if (lm[i] && lm[j]) {
                            item.ctx.beginPath();
                            item.ctx.moveTo(lm[i].x, lm[i].y);
                            item.ctx.lineTo(lm[j].x, lm[j].y);
                            item.ctx.stroke();
                        }
                    });

                    const rightConnections = [[12, 14], [14, 16], [24, 26], [26, 28], [28, 30], [30, 32]];
                    item.ctx.strokeStyle = 'rgba(255, 214, 10, 0.65)';
                    rightConnections.forEach(([i, j]) => {
                        if (lm[i] && lm[j]) {
                            item.ctx.beginPath();
                            item.ctx.moveTo(lm[i].x, lm[i].y);
                            item.ctx.lineTo(lm[j].x, lm[j].y);
                            item.ctx.stroke();
                        }
                    });

                    const leftJoints = [13, 15, 25, 27, 29, 31];
                    item.ctx.fillStyle = '#00ffcc';
                    leftJoints.forEach(idx => {
                        if (lm[idx]) {
                            item.ctx.beginPath();
                            item.ctx.arc(lm[idx].x, lm[idx].y, 4, 0, Math.PI * 2);
                            item.ctx.fill();
                        }
                    });

                    const rightJoints = [14, 16, 26, 28, 30, 32];
                    item.ctx.fillStyle = '#ffd60a';
                    rightJoints.forEach(idx => {
                        if (lm[idx]) {
                            item.ctx.beginPath();
                            item.ctx.arc(lm[idx].x, lm[idx].y, 4, 0, Math.PI * 2);
                            item.ctx.fill();
                        }
                    });
                    item.ctx.restore();
                }

                if (s.aiJoints && s.aiJoints.length === 4) {
                    const [shoulderL, shoulderR, hipL, hipR] = s.aiJoints;
                    const midThorax = { x: (shoulderL.x + shoulderR.x) / 2, y: (shoulderL.y + shoulderR.y) / 2 };
                    const midHip = { x: (hipL.x + hipR.x) / 2, y: (hipL.y + hipR.y) / 2 };

                    const currentFrame = Math.round(video1.currentTime * currentFPS);
                    const overrideData = getInterpolatedAiPoints(currentFrame);

                    item.ctx.beginPath();
                    item.ctx.moveTo(shoulderL.x, shoulderL.y);
                    item.ctx.lineTo(shoulderR.x, shoulderR.y);
                    item.ctx.strokeStyle = '#ff375f';
                    item.ctx.lineWidth = 4;
                    item.ctx.stroke();

                    item.ctx.beginPath();
                    item.ctx.moveTo(hipL.x, hipL.y);
                    item.ctx.lineTo(hipR.x, hipR.y);
                    item.ctx.strokeStyle = '#007aff';
                    item.ctx.lineWidth = 4;
                    item.ctx.stroke();

                    let lineColor = '#00ffcc';
                    if (overrideData && overrideData.type === 'manual') lineColor = '#ff9500';
                    else if (overrideData && overrideData.type === 'interpolated') lineColor = '#ffcc00';

                    item.ctx.beginPath();
                    item.ctx.moveTo(midHip.x, midHip.y);
                    item.ctx.lineTo(midThorax.x, midThorax.y);
                    item.ctx.strokeStyle = lineColor;
                    item.ctx.lineWidth = 4;
                    item.ctx.stroke();

                    [
                        { pt: shoulderL, color: '#00ffcc' },
                        { pt: shoulderR, color: '#ffd60a' },
                        { pt: hipL, color: '#00ffcc' },
                        { pt: hipR, color: '#ffd60a' }
                    ].forEach(({ pt, color }) => {
                        item.ctx.fillStyle = color;
                        item.ctx.beginPath();
                        item.ctx.arc(pt.x, pt.y, 8, 0, Math.PI * 2);
                        item.ctx.fill();
                        item.ctx.strokeStyle = '#fff';
                        item.ctx.lineWidth = 2;
                        item.ctx.stroke();
                    });
                }
            }
            return;
        }

        if (s.scalePoints.length === 2 && currentMode !== 'scale') {
            item.ctx.save(); item.ctx.strokeStyle = 'rgba(255, 149, 0, 0.4)'; item.ctx.lineWidth = 2; item.ctx.setLineDash([4, 4]);
            item.ctx.beginPath(); item.ctx.moveTo(s.scalePoints[0].x, s.scalePoints[0].y); item.ctx.lineTo(s.scalePoints[1].x, s.scalePoints[1].y); item.ctx.stroke(); item.ctx.restore();
        }
        if (currentMode === 'scale') {
            item.ctx.strokeStyle = '#ff9500'; item.ctx.fillStyle = '#ff9500'; item.ctx.lineWidth = 3;
            drawPointList(item.ctx, s.scalePoints, ["点1", "点2"]);
            return;
        }
        if (s.perpPoints.length > 0) {
            if (s.perpPoints.length === 1) {
                item.ctx.fillStyle = '#ff2d55'; item.ctx.beginPath(); item.ctx.arc(s.perpPoints[0].x, s.perpPoints[0].y, 6, 0, Math.PI * 2); item.ctx.fill();
            } else if (s.perpPoints.length === 2) {
                const p1 = s.perpPoints[0], p2 = s.perpPoints[1];
                item.ctx.strokeStyle = '#00ffcc'; item.ctx.lineWidth = 2; item.ctx.beginPath(); item.ctx.moveTo(p1.x, p1.y); item.ctx.lineTo(p2.x, p2.y); item.ctx.stroke();
                item.ctx.fillStyle = '#ff2d55'; item.ctx.beginPath(); item.ctx.arc(p2.x, p2.y, 6, 0, Math.PI * 2); item.ctx.fill();
                const t = parseFloat(perpSlider.value) / 100, pmX = p1.x + (p2.x - p1.x) * t, pmY = p1.y + (p2.y - p1.y) * t, dx = p2.x - p1.x, dy = p2.y - p1.y, len = Math.hypot(dx, dy);
                if (len > 0) {
                    const nx = -dy / len, ny = dx / len, perpLen = 2000;
                    item.ctx.strokeStyle = '#ff2d55'; item.ctx.lineWidth = 2; item.ctx.setLineDash([4, 4]);
                    item.ctx.beginPath(); item.ctx.moveTo(pmX - nx * perpLen, pmY - ny * perpLen); item.ctx.lineTo(pmX + nx * perpLen, pmY + ny * perpLen); item.ctx.stroke();
                    item.ctx.setLineDash([]);
                }
            }
        }
        if (lastMeasureMode === 'cog' && s.cogPoints.length > 0) {
            item.ctx.save(); item.ctx.strokeStyle = 'rgba(255, 204, 0, 0.6)'; item.ctx.lineWidth = 2; item.ctx.beginPath();
            s.cogPoints.forEach((pt, i) => { if (i === 0) item.ctx.moveTo(pt.x, pt.y); else item.ctx.lineTo(pt.x, pt.y); }); item.ctx.stroke();
            s.cogPoints.forEach((pt, i) => {
                const isLatest = (i === s.cogPoints.length - 1);
                item.ctx.fillStyle = isLatest ? '#ff375f' : '#ffcc00'; item.ctx.beginPath(); item.ctx.arc(pt.x, pt.y, isLatest ? 7 : 5, 0, Math.PI * 2); item.ctx.fill();
                item.ctx.fillStyle = '#fff'; item.ctx.font = isLatest ? 'bold 12px sans-serif' : '10px sans-serif'; item.ctx.fillText(`${i + 1}`, pt.x + 8, pt.y - 6);
                if (pt.par !== undefined && pt.per !== undefined) {
                    const xVal = s.pxPerCm ? (pt.par / s.pxPerCm).toFixed(1) : pt.par.toFixed(1), yVal = s.pxPerCm ? (pt.per / s.pxPerCm).toFixed(1) : pt.per.toFixed(1);
                    item.ctx.fillStyle = '#00ffcc'; item.ctx.font = '9px sans-serif'; item.ctx.fillText(`左右 ${xVal > 0 ? '+' : ''}${xVal}`, pt.x + 8, pt.y + 6);
                    item.ctx.fillStyle = '#ff9500'; item.ctx.fillText(`上下 ${yVal > 0 ? '+' : ''}${yVal}`, pt.x + 8, pt.y + 16);
                }
            });
            item.ctx.restore();
        }
        if (s.points.length > 0 && lastMeasureMode !== 'cog') {
            if (lastMeasureMode === 'angle') item.ctx.strokeStyle = item.ctx.fillStyle = '#00ffcc';
            else if (lastMeasureMode === 'distance') item.ctx.strokeStyle = item.ctx.fillStyle = '#ffcc00';
            else if (lastMeasureMode === 'accel') item.ctx.strokeStyle = item.ctx.fillStyle = '#ff375f';
            else if (lastMeasureMode === 'sim') item.ctx.strokeStyle = item.ctx.fillStyle = '#00ffcc';
            item.ctx.lineWidth = 3;
            let labels = lastMeasureMode === 'distance' ? ["始点", "終点"] : (lastMeasureMode === 'accel' ? ["点1", "点2", "点3"] : (lastMeasureMode === 'sim' ? ["根元", "関節", "先端"] : null));
            drawPointList(item.ctx, s.points, labels);
            if (lastMeasureMode === 'sim' && s.points.length === 3) {
                const p2 = s.points[1], p3 = s.points[2], deltaDeg = parseFloat(simSlider.value), simP3 = simulateJointAngle(p2, p3, deltaDeg);
                item.ctx.save(); item.ctx.strokeStyle = '#30d158'; item.ctx.fillStyle = '#30d158'; item.ctx.lineWidth = 3; item.ctx.setLineDash([5, 4]);
                item.ctx.beginPath(); item.ctx.moveTo(p2.x, p2.y); item.ctx.lineTo(simP3.x, simP3.y); item.ctx.stroke(); item.ctx.setLineDash([]);
                item.ctx.beginPath(); item.ctx.arc(simP3.x, simP3.y, 6, 0, Math.PI * 2); item.ctx.fill();
                item.ctx.fillStyle = '#30d158'; item.ctx.font = 'bold 11px sans-serif'; item.ctx.fillText(`予測(${deltaDeg > 0 ? '+' : ''}${deltaDeg}°)`, simP3.x + 8, simP3.y - 4); item.ctx.restore();
            }
        }
    });
}

function drawPointList(cContext, ptList, labels) {
    if (ptList.length === 0) return;
    cContext.beginPath();
    for (let i = 0; i < ptList.length; i++) { if (i === 0) cContext.moveTo(ptList[i].x, ptList[i].y); else cContext.lineTo(ptList[i].x, ptList[i].y); }
    cContext.stroke();
    for (let i = 0; i < ptList.length; i++) {
        cContext.beginPath(); cContext.arc(ptList[i].x, ptList[i].y, 6, 0, Math.PI * 2); cContext.fill();
        if (labels) {
            const text = Array.isArray(labels) ? labels[i] : `${labels}${i + 1}`;
            if (text) { cContext.fillStyle = '#fff'; cContext.font = 'bold 10px sans-serif'; cContext.fillText(text, ptList[i].x + 7, ptList[i].y - 5); cContext.fillStyle = cContext.strokeStyle; }
        }
    }
}
