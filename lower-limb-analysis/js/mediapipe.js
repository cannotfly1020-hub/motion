const pose = new Pose({
 locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
});
pose.setOptions({
 modelComplexity: 1,
 smoothLandmarks: true,
 minDetectionConfidence: 0.6,
 minTrackingConfidence: 0.6
});
pose.onResults(onResults);

function onResults(results) {
 if (!results.poseLandmarks) {
 lastLandmarks = null;
 outCtx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
 return;
 }

 const rawLm = results.poseLandmarks;
 const lm = rawLm.map(p => {
 if (isRoiEnabled && roiNorm.w > 0.05 && roiNorm.h > 0.05) {
 return {
 x: roiNorm.x + p.x * roiNorm.w,
 y: roiNorm.y + p.y * roiNorm.h,
 z: p.z
 };
 }
 return p;
 });

 lastLandmarks = lm;

 processPoseMechanics(lm);
 redrawSkeletons();
}

async function renderCurrentFrame() {
 if (isBusy || video.readyState < 2) return;
 isBusy = true;
 try {
 let inputSource = video;

 if (isRoiEnabled && roiNorm.w > 0.05 && roiNorm.h > 0.05) {
 const sx = roiNorm.x * video.videoWidth;
 const sy = roiNorm.y * video.videoHeight;
 const sw = roiNorm.w * video.videoWidth;
 const sh = roiNorm.h * video.videoHeight;

 if (sw > 10 && sh > 10) {
 roiCanvas.width = sw;
 roiCanvas.height = sh;
 roiCtx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
 inputSource = roiCanvas;
 }
 }

 await pose.send({ image: inputSource });
 } catch(e) {
 console.error("Frame render error:", e);
 } finally {
 isBusy = false;
 }
}

async function loop() {
 if (!isProcessing) return;
 if (!video.paused && !video.ended) {
 await renderCurrentFrame();
 updateSeekBar();
 }
 animationFrameId = requestAnimationFrame(loop);
}
