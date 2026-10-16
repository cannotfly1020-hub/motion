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
                refreshManualOffsets(s.manualOffsets, s.manualKeyframes, video1);
                const lm = applyLandmarkOffsets(s.limbsLandmarks, s.manualOffsets);
                const offsets = s.manualOffsets || {};
                if (lm) {
                    s.aiJoints = [lm[11], lm[12], lm[23], lm[24]].filter(Boolean);
                    const leftConnections = [[11, 13], [13, 15], [23, 25], [25, 27], [27, 29], [29, 31]];
                    item.ctx.save();
                    item.ctx.lineWidth = 3;
                    const drawConn = (pairs, color) => {
                        pairs.forEach(([i, j]) => {
                            if (!canDrawBone(lm[i], lm[j], offsets, i, j)) return;
                            item.ctx.strokeStyle = color;
                            item.ctx.beginPath();
                            item.ctx.moveTo(lm[i].x, lm[i].y);
                            item.ctx.lineTo(lm[j].x, lm[j].y);
                            item.ctx.stroke();
                        });
                    };
                    drawConn(leftConnections, 'rgba(0, 255, 204, 0.55)');
                    const rightConnections = [[12, 14], [14, 16], [24, 26], [26, 28], [28, 30], [30, 32]];
                    drawConn(rightConnections, 'rgba(255, 214, 10, 0.65)');

                    const drawDots = (indices, color) => {
                        indices.forEach(idx => {
                            if (!canDrawJoint(lm[idx], idx, offsets)) return;
                            item.ctx.globalAlpha = (offsets[idx] || isJointConfident(lm[idx])) ? 1 : 0.38;
                            item.ctx.fillStyle = color;
                            item.ctx.beginPath();
                            item.ctx.arc(lm[idx].x, lm[idx].y, 4, 0, Math.PI * 2);
                            item.ctx.fill();
                            item.ctx.globalAlpha = 1;
                        });
                    };
                    drawDots([13, 15, 25, 27, 29, 31], '#00ffcc');
                    drawDots([14, 16, 26, 28, 30, 32], '#ffd60a');
                    item.ctx.restore();
                }

                if (s.aiJoints && s.aiJoints.length === 4) {
                    const [shoulderL, shoulderR, hipL, hipR] = s.aiJoints;
                    const midThorax = { x: (shoulderL.x + shoulderR.x) / 2, y: (shoulderL.y + shoulderR.y) / 2 };
                    const midHip = { x: (hipL.x + hipR.x) / 2, y: (hipL.y + hipR.y) / 2 };
                    const frame = getVideoFrameFromTime(video1);
                    const hasExact = s.manualKeyframes && s.manualKeyframes[frame];
                    const hasOff = offsets[11] || offsets[12] || offsets[23] || offsets[24];

                    if (canDrawBone(shoulderL, shoulderR, offsets, 11, 12)) {
                        item.ctx.beginPath();
                        item.ctx.moveTo(shoulderL.x, shoulderL.y);
                        item.ctx.lineTo(shoulderR.x, shoulderR.y);
                        item.ctx.strokeStyle = '#ff375f';
                        item.ctx.lineWidth = 4;
                        item.ctx.stroke();
                    }

                    if (canDrawBone(hipL, hipR, offsets, 23, 24)) {
                        item.ctx.beginPath();
                        item.ctx.moveTo(hipL.x, hipL.y);
                        item.ctx.lineTo(hipR.x, hipR.y);
                        item.ctx.strokeStyle = '#007aff';
                        item.ctx.lineWidth = 4;
                        item.ctx.stroke();
                    }

                    let lineColor = '#00ffcc';
                    if (hasExact) lineColor = '#ff9500';
                    else if (hasOff) lineColor = '#ffcc00';

                    if (canDrawBone(shoulderL, hipL, offsets, 11, 23) && canDrawBone(shoulderR, hipR, offsets, 12, 24)) {
                        item.ctx.beginPath();
                        item.ctx.moveTo(midHip.x, midHip.y);
                        item.ctx.lineTo(midThorax.x, midThorax.y);
                        item.ctx.strokeStyle = lineColor;
                        item.ctx.lineWidth = 4;
                        item.ctx.stroke();
                    }

                    [
                        { pt: shoulderL, idx: 11, color: '#00ffcc' },
                        { pt: shoulderR, idx: 12, color: '#ffd60a' },
                        { pt: hipL, idx: 23, color: '#00ffcc' },
                        { pt: hipR, idx: 24, color: '#ffd60a' }
                    ].forEach(({ pt, idx, color }) => {
                        if (!canDrawJoint(pt, idx, offsets)) return;
                        item.ctx.globalAlpha = (offsets[idx] || isJointConfident(pt)) ? 1 : 0.38;
                        item.ctx.fillStyle = color;
                        item.ctx.beginPath();
                        item.ctx.arc(pt.x, pt.y, 8, 0, Math.PI * 2);
                        item.ctx.fill();
                        if (offsets[idx] || isJointConfident(pt)) {
                            item.ctx.strokeStyle = '#fff';
                            item.ctx.lineWidth = 2;
                            item.ctx.stroke();
                        }
                        item.ctx.globalAlpha = 1;
                    });
                }
                drawAiDebugHud(item.ctx, item.c);
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
    if (currentMode === 'ai') drawTorsionChart();
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

function visHudColor(v) {
    if (v >= 0.65) return '#30d158';
    if (v >= 0.50) return '#ffd60a';
    return '#ff3b30';
}

function statusHudColor(status) {
    if (status === 'RUNNING') return '#30d158';
    if (status === 'IDLE') return '#ffd60a';
    return '#ff3b30';
}

function fmtVis(v) {
    return (v == null ? 0 : v).toFixed(2);
}

function drawAiDebugHud(ctx, cvs) {
    if (!showAiDebugHud || typeof aiDebug === 'undefined') return;
    const d = aiDebug;
    const x = 8;
    const y = 8;
    const w = Math.min(240, Math.max(168, cvs.clientWidth - 56));
    const errLine = (d.status === 'ERROR' && d.lastError) ? 14 : 0;
    const h = 130 + errLine;
    const visLSh = d.keyJointVis[11] || 0;
    const visRSh = d.keyJointVis[12] || 0;
    const visLHip = d.keyJointVis[23] || 0;
    const visRHip = d.keyJointVis[24] || 0;
    const worldOk = d.hasWorldLandmarks && d.worldLandmarkCount > 0;
    const pelvis = d.pelvisYaw == null ? '--' : `${d.pelvisYaw >= 0 ? '+' : ''}${d.pelvisYaw.toFixed(1)}°`;
    const thorax = d.thoraxYaw == null ? '--' : `${d.thoraxYaw >= 0 ? '+' : ''}${d.thoraxYaw.toFixed(1)}°`;

    const sx = cvs.width / Math.max(1, cvs.clientWidth);
    const sy = cvs.height / Math.max(1, cvs.clientHeight);
    ctx.save();
    ctx.setTransform(sx, 0, 0, sy, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, 10);
    else ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.strokeStyle = 'rgba(191, 90, 242, 0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = '#f5f5f7';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    let ty = y + 8;
    ctx.fillText('🤖 AI Diagnostics', x + 10, ty);
    ty += 16;

    ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = '#aeaeb2';
    ctx.fillText('Status:', x + 10, ty);
    ctx.fillStyle = statusHudColor(d.status);
    ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(d.status, x + 56, ty);
    ty += 14;

    if (errLine) {
        ctx.font = '9px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillStyle = '#ff3b30';
        const msg = String(d.lastError).slice(0, 36);
        ctx.fillText(msg, x + 10, ty);
        ty += 14;
    }

    ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = '#f5f5f7';
    const lat = `${Math.round(d.inferenceTimeMs)}ms`;
    const rate = `${d.actualFps}fps`;
    ctx.fillText(`Latency: ${lat}  |  AI Rate: ${rate}`, x + 10, ty);
    ty += 14;

    ctx.fillStyle = '#aeaeb2';
    ctx.fillText('3D World:', x + 10, ty);
    ctx.fillStyle = worldOk ? '#30d158' : '#ff3b30';
    ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(worldOk ? `OK (${d.worldLandmarkCount} landmarks)` : 'NG (none)', x + 72, ty);
    ty += 14;

    ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = '#aeaeb2';
    ctx.fillText('Vis:', x + 10, ty);
    ctx.fillStyle = visHudColor(visLSh);
    ctx.fillText(`L-Sh:${fmtVis(visLSh)}`, x + 36, ty);
    ctx.fillStyle = visHudColor(visRSh);
    ctx.fillText(`R-Sh:${fmtVis(visRSh)}`, x + 118, ty);
    ty += 13;
    ctx.fillStyle = visHudColor(visLHip);
    ctx.fillText(`L-Hip:${fmtVis(visLHip)}`, x + 36, ty);
    ctx.fillStyle = visHudColor(visRHip);
    ctx.fillText(`R-Hip:${fmtVis(visRHip)}`, x + 118, ty);
    ty += 14;

    ctx.fillStyle = '#f5f5f7';
    ctx.fillText(`Pelvis Yaw: ${pelvis}  Thorax: ${thorax}`, x + 10, ty);
    ctx.restore();
}

function torsionToChartY(deg, h) {
    const clamped = Math.max(-40, Math.min(40, deg));
    const pad = 4;
    return pad + (1 - (clamped + 40) / 80) * (h - pad * 2);
}

function drawTorsionChart() {
    const cvs = document.getElementById('chart-canvas');
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    const cssW = Math.max(1, cvs.clientWidth || cvs.parentElement.clientWidth || 300);
    const cssH = Math.max(1, cvs.clientHeight || 45);
    const dpr = window.devicePixelRatio || 1;
    if (cvs.width !== Math.round(cssW * dpr) || cvs.height !== Math.round(cssH * dpr)) {
        cvs.width = Math.round(cssW * dpr);
        cvs.height = Math.round(cssH * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = cssW;
    const h = cssH;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0b0b0d';
    ctx.fillRect(0, 0, w, h);

    const zeroY = torsionToChartY(0, h);
    const p40 = torsionToChartY(40, h);
    const m40 = torsionToChartY(-40, h);
    ctx.strokeStyle = 'rgba(142, 142, 147, 0.35)';
    ctx.lineWidth = 1;
    [p40, zeroY, m40].forEach(y => {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
    });

    const duration = video1 && video1.duration ? video1.duration : 0;
    const totalFrames = Math.max(1, Math.round(duration * currentFPS));
    const log = (typeof motionTimeline !== 'undefined' && motionTimeline.torsion) ? motionTimeline.torsion : {};
    const frames = Object.keys(log).map(Number).sort((a, b) => a - b);

    if (frames.length > 0) {
        ctx.beginPath();
        frames.forEach((f, i) => {
            const x = (f / totalFrames) * w;
            const y = torsionToChartY(log[f], h);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.lineTo((frames[frames.length - 1] / totalFrames) * w, zeroY);
        ctx.lineTo((frames[0] / totalFrames) * w, zeroY);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 214, 10, 0.14)';
        ctx.fill();

        ctx.beginPath();
        ctx.strokeStyle = '#ffd60a';
        ctx.lineWidth = 1.8;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        frames.forEach((f, i) => {
            const x = (f / totalFrames) * w;
            const y = torsionToChartY(log[f], h);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();

        for (let i = 1; i < frames.length - 1; i++) {
            const a = log[frames[i - 1]], b = log[frames[i]], c = log[frames[i + 1]];
            const isPeak = (b > a && b >= c) || (b < a && b <= c);
            if (!isPeak || Math.abs(b) < 4) continue;
            ctx.beginPath();
            ctx.fillStyle = b >= 0 ? '#ffd60a' : '#bf5af2';
            ctx.arc((frames[i] / totalFrames) * w, torsionToChartY(b, h), 2.8, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    const curFrame = getVideoFrameFromTime(video1);
    const headX = Math.max(0, Math.min(w, (curFrame / totalFrames) * w));
    ctx.strokeStyle = '#ff375f';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(headX, 0);
    ctx.lineTo(headX, h);
    ctx.stroke();
}
