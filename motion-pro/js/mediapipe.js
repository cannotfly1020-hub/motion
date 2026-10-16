const pose = new Pose({locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
}});

pose.setOptions({
    modelComplexity: 2,
    smoothLandmarks: true,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6
});

const holdStore = { pts: {} };
const holdStoreWorld = { pts: {} };

function updateAiDebugFromResults(results) {
    const now = performance.now();
    if (aiDebug.sendStartedAt) {
        aiDebug.inferenceTimeMs = now - aiDebug.sendStartedAt;
        aiDebug.inferTimes.push(now);
        const cutoff = now - 1000;
        aiDebug.inferTimes = aiDebug.inferTimes.filter(t => t > cutoff);
        aiDebug.actualFps = aiDebug.inferTimes.length;
        aiDebug.lastResultAt = now;
    }

    const lm = results && results.poseLandmarks;
    const world = results && results.poseWorldLandmarks;
    aiDebug.hasPoseLandmarks = !!(lm && lm.length);
    aiDebug.hasWorldLandmarks = !!(world && world.length);
    aiDebug.worldLandmarkCount = world && world.length ? world.length : 0;

    [11, 12, 23, 24].forEach(i => {
        aiDebug.keyJointVis[i] = (lm && lm[i] && lm[i].visibility != null) ? lm[i].visibility : 0;
        aiDebug.current3DCoords[i] = (world && world[i])
            ? { x: world[i].x, y: world[i].y, z: world[i].z }
            : null;
    });

    if (world && world[11] && world[12] && world[23] && world[24]) {
        let thorax = Math.atan2(world[12].z - world[11].z, world[12].x - world[11].x) * (180 / Math.PI);
        let pelvis = Math.atan2(world[24].z - world[23].z, world[24].x - world[23].x) * (180 / Math.PI);
        if (typeof wrapDeg180 === 'function') {
            thorax = wrapDeg180(thorax);
            pelvis = wrapDeg180(pelvis);
        }
        aiDebug.thoraxYaw = thorax;
        aiDebug.pelvisYaw = pelvis;
    } else {
        aiDebug.thoraxYaw = null;
        aiDebug.pelvisYaw = null;
    }

    if (aiDebug.status === 'ERROR') return;

    const playing = video1 && !video1.paused && !video1.ended;
    const slow = aiDebug.inferenceTimeMs > Math.max(80, 2000 / Math.max(1, currentFPS));
    const lowRate = playing && aiDebug.actualFps < Math.max(8, currentFPS * 0.35);
    if (!playing && !isAiDetecting) aiDebug.status = 'IDLE';
    else if (slow || lowRate) aiDebug.status = 'DROP';
    else aiDebug.status = 'RUNNING';
}

async function sendPoseFrame() {
    if (currentMode !== 'ai' || !videoFrameReady(video1)) return false;
    aiDebug.sendStartedAt = performance.now();
    try {
        await pose.send({ image: video1 });
        return true;
    } catch (err) {
        aiDebug.status = 'ERROR';
        aiDebug.lastError = (err && err.message) ? err.message : String(err);
        console.error('pose.send failed', err);
        if (typeof redraw === 'function') redraw();
        return false;
    }
}

pose.onResults((results) => {
    updateAiDebugFromResults(results);
    if (currentMode !== 'ai') return;

    const currentFrame = Math.round(video1.currentTime * currentFPS);

    if (!results.poseLandmarks) {
        state[1].limbsLandmarks = null;
        mainResult.innerHTML = `🤖 AI自動計測 ｜ 人物が検出できません`;
        redraw();
        return;
    }

    aiDebug.lastError = '';

    const landmarks = results.poseLandmarks;
    const rect = getVideoRenderRect(video1, canvas1);

    const getPos = (lm) => ({
        x: rect.x + lm.x * rect.width,
        y: rect.y + lm.y * rect.height,
        z: (lm.z || 0) * rect.width,
        visibility: lm.visibility
    });

    const mappedLandmarks = {};
    for (let i = 0; i < landmarks.length; i++) {
        mappedLandmarks[i] = getPos(landmarks[i]);
    }
    state[1].limbsLandmarks = stabilizeLandmarksMap(mappedLandmarks, holdStore);

    const worldSrc = results.poseWorldLandmarks || [];
    const mappedWorld = {};
    for (let i = 0; i < worldSrc.length; i++) {
        mappedWorld[i] = {
            x: worldSrc[i].x,
            y: worldSrc[i].y,
            z: worldSrc[i].z,
            visibility: landmarks[i] ? landmarks[i].visibility : 1
        };
    }
    state[1].worldLandmarks = worldSrc.length ? stabilizeLandmarksMap(mappedWorld, holdStoreWorld) : null;

    if (!state[1].manualOffsets) state[1].manualOffsets = {};
    if (!state[1].manualKeyframes) state[1].manualKeyframes = {};
    refreshManualOffsets(state[1].manualOffsets, state[1].manualKeyframes, video1);
    const displayLm = applyLandmarkOffsets(state[1].limbsLandmarks, state[1].manualOffsets);
    state[1].aiJoints = [displayLm[11], displayLm[12], displayLm[23], displayLm[24]];

    const hasExact = state[1].manualKeyframes[currentFrame];
    const hasOff = Object.keys(state[1].manualOffsets).length > 0;
    calcAiResults(hasExact ? 'manual' : (hasOff ? 'interpolated' : 'ai'));
    redraw();
});

async function detectFrame() {
    if (currentMode !== 'ai' || video1.paused || video1.ended) {
        isAiDetecting = false;
        if (aiDebug.status !== 'ERROR') aiDebug.status = 'IDLE';
        if (showAiDebugHud) redraw();
        return;
    }
    if (!videoFrameReady(video1)) {
        if (aiDebug.status !== 'ERROR') aiDebug.status = 'DROP';
        requestAnimationFrame(detectFrame);
        return;
    }
    await sendPoseFrame();
    requestAnimationFrame(detectFrame);
}

video1.addEventListener('play', () => {
    if (currentMode === 'ai' && !isAiDetecting) {
        isAiDetecting = true;
        requestAnimationFrame(() => detectFrame());
    }
});

video1.addEventListener('pause', () => {
    if (aiDebug.status !== 'ERROR') aiDebug.status = 'IDLE';
    if (currentMode === 'ai' && showAiDebugHud) redraw();
});

video1.addEventListener('seeked', async () => {
    if (currentMode !== 'ai') return;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (!videoFrameReady(video1)) return;
    if (!isAiDetecting) {
        isAiDetecting = true;
        await sendPoseFrame();
        isAiDetecting = false;
    }
});
