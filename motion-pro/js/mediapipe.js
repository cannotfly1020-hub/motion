const pose = new Pose({locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
}});

pose.setOptions({
    modelComplexity: 2,
    smoothLandmarks: true,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6
});

pose.onResults((results) => {
    if (currentMode !== 'ai') return;

    const currentFrame = Math.round(video1.currentTime * currentFPS);

    if (!results.poseLandmarks) {
        state[1].limbsLandmarks = null;
        mainResult.innerHTML = `🤖 AI自動計測 ｜ 人物が検出できません`;
        return;
    }

    const landmarks = results.poseLandmarks;
    const rect = getVideoRenderRect(video1, canvas1);

    const getPos = (lm) => ({
        x: rect.x + lm.x * rect.width,
        y: rect.y + lm.y * rect.height,
        z: (lm.z || 0) * rect.width
    });

    const mappedLandmarks = {};
    for (let i = 0; i < landmarks.length; i++) {
        mappedLandmarks[i] = getPos(landmarks[i]);
    }
    state[1].limbsLandmarks = mappedLandmarks;

    const overrideData = getInterpolatedAiPoints(currentFrame);
    if (overrideData) {
        state[1].aiJoints = overrideData.joints.map(j => ({ x: j.x, y: j.y, z: j.z || 0 }));
        calcAiResults(overrideData.type);
        redraw();
        return;
    }

    state[1].aiJoints = [mappedLandmarks[11], mappedLandmarks[12], mappedLandmarks[23], mappedLandmarks[24]];
    calcAiResults('ai');
    redraw();
});

async function detectFrame() {
    if (currentMode === 'ai' && !video1.paused && !video1.ended && video1.readyState >= 2) {
        await pose.send({image: video1});
        requestAnimationFrame(detectFrame);
    } else {
        isAiDetecting = false;
    }
}

video1.addEventListener('play', () => {
    if (currentMode === 'ai' && !isAiDetecting) {
        isAiDetecting = true;
        detectFrame();
    }
});

video1.addEventListener('seeked', async () => {
    if (currentMode === 'ai' && video1.readyState >= 2 && !isAiDetecting) {
        isAiDetecting = true;
        await pose.send({image: video1});
        isAiDetecting = false;
    }
});
