const pose = new Pose({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}` });
pose.setOptions({ modelComplexity: 1, smoothLandmarks: true, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });
pose.onResults(onResults);

function onResults(results) {
    if (!results.poseLandmarks) {
        currentLandmarks = null; currentCoM = null; currentFeetCenter = null;
        outCtx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
        return;
    }

    const rawLm = results.poseLandmarks;
    const lm = rawLm.map(p => {
        if (isRoiEnabled && roiNorm.w > 0.05) { return { x: roiNorm.x + p.x * roiNorm.w, y: roiNorm.y + p.y * roiNorm.h, visibility: p.visibility }; }
        return p;
    });

    currentLandmarks = lm;
    const w = outputCanvas.width, h = outputCanvas.height;

    updateBodyCenters(lm, w, h);

    drawSkeleton(lm, w, h);
    redrawJumpVisuals();
}

async function renderCurrentFrame() {
    if (isProcessing || video.readyState < 2) return;
    isProcessing = true;
    try {
        let inputSource = video;
        if (isRoiEnabled && roiNorm.w > 0.05) {
            const sx = roiNorm.x * video.videoWidth, sy = roiNorm.y * video.videoHeight;
            const sw = roiNorm.w * video.videoWidth, sh = roiNorm.h * video.videoHeight;
            if (sw > 10 && sh > 10) { roiCanvas.width = sw; roiCanvas.height = sh; roiCtx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh); inputSource = roiCanvas; }
        }
        await pose.send({ image: inputSource });
    } catch(e) {} finally { isProcessing = false; }
}

async function loop() {
    if (!video.paused && !video.ended) {
        await renderCurrentFrame();
        updateSeekBar();
    }

    // 録画合成処理
    if (isRecording) {
        recCanvas.width = outputCanvas.width;
        recCanvas.height = outputCanvas.height + 70;
        recCtx.fillStyle = '#000';
        recCtx.fillRect(0, 0, recCanvas.width, recCanvas.height);
        recCtx.drawImage(video, 0, 0, outputCanvas.width, outputCanvas.height);
        recCtx.drawImage(outputCanvas, 0, 0);
        recCtx.drawImage(interactionCanvas, 0, 0);

        recCtx.fillStyle = '#1c1c1e';
        recCtx.fillRect(0, outputCanvas.height, recCanvas.width, 70);
        recCtx.fillStyle = '#00ffcc';
        recCtx.font = 'bold 13px sans-serif';
        recCtx.fillText(`1回目高: ${document.getElementById('res_j1_h').innerText} ｜ 2回目高: ${document.getElementById('res_j2_h').innerText}`, 15, outputCanvas.height + 26);
        recCtx.fillStyle = '#ff375f';
        recCtx.font = 'bold 12px sans-serif';
        recCtx.fillText(`接地時間: ${document.getElementById('res_contact_t').innerText} ｜ RSI: ${document.getElementById('res_rsi').innerText}`, 15, outputCanvas.height + 50);
    }

    animationFrameId = requestAnimationFrame(loop);
}
