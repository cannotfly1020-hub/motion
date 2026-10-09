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
    lastLandmarksA = stabilizeLandmarks(results.poseLandmarks.map(pt => ({
      x: roiBox.normX + pt.x * roiBox.normW,
      y: roiBox.normY + pt.y * roiBox.normH,
      z: pt.z,
      visibility: pt.visibility
    })), holdStoreA);

    if (targetRoiA) {
      const roiPts = [11, 12, 23, 24].map(i => lastLandmarksA[i]).filter(isJointUsable);
      if (roiPts.length >= 2) {
        const cx = roiPts.reduce((s, p) => s + p.x, 0) / roiPts.length;
        const cy = roiPts.reduce((s, p) => s + p.y, 0) / roiPts.length;
        targetRoiA.cx = targetRoiA.cx * 0.7 + cx * 0.3;
        targetRoiA.cy = targetRoiA.cy * 0.7 + cy * 0.3;
      }
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
    lastLandmarksB = stabilizeLandmarks(results.poseLandmarks.map(pt => ({
      x: roiBox.normX + pt.x * roiBox.normW,
      y: roiBox.normY + pt.y * roiBox.normH,
      z: pt.z,
      visibility: pt.visibility
    })), holdStoreB);

    if (targetRoiB) {
      const roiPts = [11, 12, 23, 24].map(i => lastLandmarksB[i]).filter(isJointUsable);
      if (roiPts.length >= 2) {
        const cx = roiPts.reduce((s, p) => s + p.x, 0) / roiPts.length;
        const cy = roiPts.reduce((s, p) => s + p.y, 0) / roiPts.length;
        targetRoiB.cx = targetRoiB.cx * 0.7 + cx * 0.3;
        targetRoiB.cy = targetRoiB.cy * 0.7 + cy * 0.3;
      }
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
