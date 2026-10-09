const cropCanvasA = document.createElement('canvas');
const cropCtxA = cropCanvasA.getContext('2d');
const cropCanvasB = document.createElement('canvas');
const cropCtxB = cropCanvasB.getContext('2d');

const poseA = new Pose({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}` });
poseA.setOptions({ modelComplexity: 1, smoothLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
poseA.onResults(results => {
  isPoseA_Busy = false;
  if (results.poseLandmarks) {
    const roiBox = getRoiBox(targetRoiA, videoA.videoWidth, videoA.videoHeight);
    lastLandmarksA = results.poseLandmarks.map(pt => ({
      x: roiBox.normX + pt.x * roiBox.normW,
      y: roiBox.normY + pt.y * roiBox.normH,
      z: pt.z,
      visibility: pt.visibility
    }));

    if (targetRoiA && lastLandmarksA[11] && lastLandmarksA[12] && lastLandmarksA[23] && lastLandmarksA[24]) {
      const cx = (lastLandmarksA[11].x + lastLandmarksA[12].x + lastLandmarksA[23].x + lastLandmarksA[24].x) / 4;
      const cy = (lastLandmarksA[11].y + lastLandmarksA[12].y + lastLandmarksA[23].y + lastLandmarksA[24].y) / 4;
      targetRoiA.cx = targetRoiA.cx * 0.7 + cx * 0.3;
      targetRoiA.cy = targetRoiA.cy * 0.7 + cy * 0.3;
    }
  }
  drawFrame(canvasA, ctxA, videoA, lastLandmarksA, trailsA, "#00e5ff", "A", manualOffsetsA, targetRoiA);
});

const poseB = new Pose({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}` });
poseB.setOptions({ modelComplexity: 1, smoothLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
poseB.onResults(results => {
  isPoseB_Busy = false;
  if (results.poseLandmarks) {
    const roiBox = getRoiBox(targetRoiB, videoB.videoWidth, videoB.videoHeight);
    lastLandmarksB = results.poseLandmarks.map(pt => ({
      x: roiBox.normX + pt.x * roiBox.normW,
      y: roiBox.normY + pt.y * roiBox.normH,
      z: pt.z,
      visibility: pt.visibility
    }));

    if (targetRoiB && lastLandmarksB[11] && lastLandmarksB[12] && lastLandmarksB[23] && lastLandmarksB[24]) {
      const cx = (lastLandmarksB[11].x + lastLandmarksB[12].x + lastLandmarksB[23].x + lastLandmarksB[24].x) / 4;
      const cy = (lastLandmarksB[11].y + lastLandmarksB[12].y + lastLandmarksB[23].y + lastLandmarksB[24].y) / 4;
      targetRoiB.cx = targetRoiB.cx * 0.7 + cx * 0.3;
      targetRoiB.cy = targetRoiB.cy * 0.7 + cy * 0.3;
    }
  }
  drawFrame(canvasB, ctxB, videoB, lastLandmarksB, trailsB, currentMode === 'overlay' ? "#ff922b" : "#00e5ff", "B", manualOffsetsB, targetRoiB);
});

async function triggerPoseA() {
  if (isPoseA_Busy || videoA.readyState < 2) return;
  isPoseA_Busy = true;
  try {
    const vw = videoA.videoWidth;
    const vh = videoA.videoHeight;
    if (!vw || !vh) { isPoseA_Busy = false; return; }
    const box = getRoiBox(targetRoiA, vw, vh);

    cropCanvasA.width = 384;
    cropCanvasA.height = 384;
    cropCtxA.drawImage(videoA, box.x, box.y, box.w, box.h, 0, 0, 384, 384);
    await poseA.send({ image: cropCanvasA });
  } catch (e) {
    isPoseA_Busy = false;
  }
}

async function triggerPoseB() {
  if (isPoseB_Busy || videoB.readyState < 2) return;
  isPoseB_Busy = true;
  try {
    const vw = videoB.videoWidth;
    const vh = videoB.videoHeight;
    if (!vw || !vh) { isPoseB_Busy = false; return; }
    const box = getRoiBox(targetRoiB, vw, vh);

    cropCanvasB.width = 384;
    cropCanvasB.height = 384;
    cropCtxB.drawImage(videoB, box.x, box.y, box.w, box.h, 0, 0, 384, 384);
    await poseB.send({ image: cropCanvasB });
  } catch (e) {
    isPoseB_Busy = false;
  }
}
