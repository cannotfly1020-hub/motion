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

 const box = getVideoDrawRect(interactionCanvas, video);
 const rx = box.drawX + roiNorm.x * box.drawW;
 const ry = box.drawY + roiNorm.y * box.drawH;
 const rw = roiNorm.w * box.drawW;
 const rh = roiNorm.h * box.drawH;

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
 const box = getVideoDrawRect(outputCanvas, video);
 const pt = (idx) => landmarkToCanvas(lm[idx], box);

 outCtx.save();
 outCtx.lineWidth = 3.5 / zoomScale;
 const drawSeg = (a, b, color) => {
  if (!isJointDrawable(lm[a]) || !isJointDrawable(lm[b])) return;
  const pa = pt(a), pb = pt(b);
  outCtx.strokeStyle = color;
  outCtx.beginPath();
  outCtx.moveTo(pa.x, pa.y);
  outCtx.lineTo(pb.x, pb.y);
  outCtx.stroke();
 };

 const trunkColor = 'rgba(0, 229, 255, 0.55)';
 drawSeg(11, 12, trunkColor);
 drawSeg(11, 23, trunkColor);
 drawSeg(12, 24, trunkColor);
 drawSeg(23, 24, trunkColor);

 drawSeg(23, 25, '#ffd60a');
 drawSeg(25, 27, '#ffd60a');
 drawSeg(27, 29, '#ffd60a');
 drawSeg(29, 31, '#ffd60a');
 drawSeg(27, 31, '#ffd60a');

 drawSeg(24, 26, '#00e5ff');
 drawSeg(26, 28, '#00e5ff');
 drawSeg(28, 30, '#00e5ff');
 drawSeg(30, 32, '#00e5ff');
 drawSeg(28, 32, '#00e5ff');

 const drawDot = (idx, color) => {
  if (!isJointDrawable(lm[idx])) return;
  const p = pt(idx);
  outCtx.globalAlpha = isJointWarn(lm[idx]) ? 0.38 : 1;
  outCtx.fillStyle = color;
  outCtx.beginPath();
  outCtx.arc(p.x, p.y, 4.5 / zoomScale, 0, Math.PI * 2);
  outCtx.fill();
  outCtx.globalAlpha = 1;
 };
 [11, 23, 25, 27, 29, 31].forEach(idx => drawDot(idx, '#ffd60a'));
 [12, 24, 26, 28, 30, 32].forEach(idx => drawDot(idx, '#00e5ff'));

 if (isJointDrawable(lm[28]) && isJointDrawable(lm[32]) && lastMagR > 25) {
  const rCop = {
   x: (pt(28).x + pt(32).x) * 0.5,
   y: (pt(28).y + pt(32).y) * 0.5
  };
  drawDynamicForceArrow(rCop.x, rCop.y, lastGrfR.x, lastGrfR.y, lastMagR);
 }

 if (isJointDrawable(lm[27]) && isJointDrawable(lm[31]) && lastMagL > 25) {
  const lCop = {
   x: (pt(27).x + pt(31).x) * 0.5,
   y: (pt(27).y + pt(31).y) * 0.5
  };
  drawDynamicForceArrow(lCop.x, lCop.y, lastGrfL.x, lastGrfL.y, lastMagL);
 }

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
