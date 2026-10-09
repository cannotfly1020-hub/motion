function fitCanvases() {
 const rect = video.parentElement.getBoundingClientRect();
 if (rect.width > 0 && rect.height > 0) {
 [outputCanvas, interactionCanvas].forEach(c => {
 c.width = rect.width;
 c.height = rect.height;
 });
 }
 redrawOverlay();
}

function applyZoom() {
 zoomTarget.style.transform = `translate(${panOffsetX}px, ${panOffsetY}px) scale(${zoomScale})`;
 redrawSkeletons();
 redrawOverlay();
}

function redrawOverlay() {
 intCtx.clearRect(0, 0, interactionCanvas.width, interactionCanvas.height);
 if (!isRoiEnabled) return;

 const rx = roiNorm.x * interactionCanvas.width;
 const ry = roiNorm.y * interactionCanvas.height;
 const rw = roiNorm.w * interactionCanvas.width;
 const rh = roiNorm.h * interactionCanvas.height;

 if (rw < 5 || rh < 5) return;

 intCtx.save();
 intCtx.fillStyle = 'rgba(0, 0, 0, 0.35)';
 intCtx.fillRect(0, 0, interactionCanvas.width, interactionCanvas.height);
 intCtx.clearRect(rx, ry, rw, rh);

 intCtx.strokeStyle = '#ff9500';
 intCtx.lineWidth = 2.5 / zoomScale;
 intCtx.setLineDash([6 / zoomScale, 4 / zoomScale]);
 intCtx.strokeRect(rx, ry, rw, rh);

 const badgeH = 18 / zoomScale;
 const badgeW = 70 / zoomScale;
 intCtx.fillStyle = '#ff9500';
 intCtx.fillRect(rx, Math.max(0, ry - badgeH), badgeW, badgeH);
 intCtx.fillStyle = '#000';
 intCtx.font = `bold ${Math.max(8, 10 / zoomScale)}px sans-serif`;
 intCtx.fillText("🎯 追跡エリア", rx + (4 / zoomScale), Math.max(12 / zoomScale, ry - (5 / zoomScale)));
 intCtx.restore();
}

function redrawSkeletons() {
 outCtx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
 if (!lastLandmarks) return;
 const lm = lastLandmarks;

 outCtx.save();
 outCtx.strokeStyle = '#00e5ff';
 outCtx.lineWidth = 3.5 / zoomScale;
 outCtx.beginPath();
 outCtx.moveTo(lm[24].x * outputCanvas.width, lm[24].y * outputCanvas.height);
 outCtx.lineTo(lm[26].x * outputCanvas.width, lm[26].y * outputCanvas.height);
 outCtx.lineTo(lm[28].x * outputCanvas.width, lm[28].y * outputCanvas.height);
 outCtx.lineTo(lm[32].x * outputCanvas.width, lm[32].y * outputCanvas.height);
 outCtx.stroke();

 outCtx.strokeStyle = '#ffd60a';
 outCtx.lineWidth = 3.5 / zoomScale;
 outCtx.beginPath();
 outCtx.moveTo(lm[23].x * outputCanvas.width, lm[23].y * outputCanvas.height);
 outCtx.lineTo(lm[25].x * outputCanvas.width, lm[25].y * outputCanvas.height);
 outCtx.lineTo(lm[27].x * outputCanvas.width, lm[27].y * outputCanvas.height);
 outCtx.lineTo(lm[31].x * outputCanvas.width, lm[31].y * outputCanvas.height);
 outCtx.stroke();

 [24, 26, 28, 32].forEach(idx => {
 outCtx.fillStyle = '#00e5ff';
 outCtx.beginPath();
 outCtx.arc(lm[idx].x * outputCanvas.width, lm[idx].y * outputCanvas.height, 4.5 / zoomScale, 0, Math.PI * 2);
 outCtx.fill();
 });
 [23, 25, 27, 31].forEach(idx => {
 outCtx.fillStyle = '#ffd60a';
 outCtx.beginPath();
 outCtx.arc(lm[idx].x * outputCanvas.width, lm[idx].y * outputCanvas.height, 4.5 / zoomScale, 0, Math.PI * 2);
 outCtx.fill();
 });

 const rCopPxX = (lm[28].x + lm[32].x) * 0.5 * outputCanvas.width;
 const rCopPxY = (lm[28].y + lm[32].y) * 0.5 * outputCanvas.height;
 if (lastMagR > 25) drawDynamicForceArrow(rCopPxX, rCopPxY, lastGrfR.x, lastGrfR.y, lastMagR);

 const lCopPxX = (lm[27].x + lm[31].x) * 0.5 * outputCanvas.width;
 const lCopPxY = (lm[27].y + lm[31].y) * 0.5 * outputCanvas.height;
 if (lastMagL > 25) drawDynamicForceArrow(lCopPxX, lCopPxY, lastGrfL.x, lastGrfL.y, lastMagL);

 outCtx.restore();
}

function drawDynamicForceArrow(fromX, fromY, fx, fy, mag) {
 const scale = 0.28;
 const toX = fromX + fx * scale;
 const toY = fromY - fy * scale;
 const angle = Math.atan2(toY - fromY, toX - fromX);

 const headLen = Math.min(36, Math.max(14, mag * 0.045)) / zoomScale;
 const lineWidth = Math.min(12, Math.max(3.5, mag * 0.015)) / zoomScale;

 let color = '#38bdf8';
 if (mag > 900) color = '#ff1744';
 else if (mag > 600) color = '#ff9100';
 else if (mag > 300) color = '#00e676';

 outCtx.save();
 outCtx.strokeStyle = color;
 outCtx.fillStyle = color;
 outCtx.lineWidth = lineWidth;
 outCtx.lineCap = 'round';
 outCtx.lineJoin = 'round';

 outCtx.beginPath();
 outCtx.moveTo(fromX, fromY);
 outCtx.lineTo(toX, toY);
 outCtx.stroke();

 outCtx.beginPath();
 outCtx.moveTo(toX, toY);
 outCtx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 5), toY - headLen * Math.sin(angle - Math.PI / 5));
 outCtx.lineTo(toX - (headLen * 0.6) * Math.cos(angle), toY - (headLen * 0.6) * Math.sin(angle));
 outCtx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 5), toY - headLen * Math.sin(angle + Math.PI / 5));
 outCtx.closePath();
 outCtx.fill();

 const text = `${Math.round(mag)} N`;
 outCtx.font = `bold ${Math.max(8, Math.round(11 / zoomScale))}px monospace`;
 const textMetrics = outCtx.measureText(text);
 const badgeW = textMetrics.width + (8 / zoomScale);
 const badgeH = 16 / zoomScale;
 const badgeX = toX + (10 / zoomScale) * Math.cos(angle) - badgeW / 2;
 const badgeY = toY + (10 / zoomScale) * Math.sin(angle) - badgeH / 2;

 outCtx.fillStyle = 'rgba(0, 0, 0, 0.85)';
 outCtx.strokeStyle = color;
 outCtx.lineWidth = 1.2 / zoomScale;
 outCtx.beginPath();
 outCtx.rect(badgeX, badgeY, badgeW, badgeH);
 outCtx.fill();
 outCtx.stroke();

 outCtx.fillStyle = '#ffffff';
 outCtx.textAlign = 'center';
 outCtx.textBaseline = 'middle';
 outCtx.fillText(text, badgeX + badgeW / 2, badgeY + badgeH / 2);

 outCtx.beginPath();
 outCtx.arc(fromX, fromY, Math.min(7, Math.max(3.5, mag * 0.009)) / zoomScale, 0, 2 * Math.PI);
 outCtx.fillStyle = color;
 outCtx.fill();

 outCtx.restore();
}
