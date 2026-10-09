const pose = new Pose({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}` });
pose.setOptions({ modelComplexity: 1, smoothLandmarks: true, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });
pose.onResults(onResults);

function onResults(results) {
    if (!results.poseLandmarks) {
        outCtx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
        return;
    }
    latestLandmarks = results.poseLandmarks;
    drawPitchingBiomechanics(latestLandmarks);
}

async function renderCurrentFrame() {
    if (isProcessing || video.readyState < 2) return;
    isProcessing = true;
    try {
        await pose.send({ image: video });
    } catch(e) {} finally { isProcessing = false; }
}

async function loop() {
    if (!video.paused && !video.ended) {
        await renderCurrentFrame();
        updateSeekBar();
    }

    // 【録画時の完全同期描画】動画本来のファイルサイズ（縦横比）を100%基準にする
    if (isRecording && video.videoWidth > 0 && recCanvas.width > 0) {
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        const bannerH = recCanvas.height - recCanvas.width * (vh / vw);

        recCtx.fillStyle = '#000';
        recCtx.fillRect(0, 0, recCanvas.width, recCanvas.height);

        // 1. 動画本来のアスペクト比でキャンバス上部に描画（歪みゼロ）
        recCtx.drawImage(video, 0, 0, recCanvas.width, recCanvas.height - bannerH);

        // 2. 骨格キャンバスから動画領域（box）だけを正確に切り抜き、動画に完全フィットさせて描画
        const box = getVideoRenderBox();
        if (box.w > 0 && box.h > 0) {
            recCtx.drawImage(outputCanvas, box.x, box.y, box.w, box.h, 0, 0, recCanvas.width, recCanvas.height - bannerH);
            recCtx.drawImage(interactionCanvas, box.x, box.y, box.w, box.h, 0, 0, recCanvas.width, recCanvas.height - bannerH);
        }

        // 3. 情報バナー領域
        const textStartY = recCanvas.height - bannerH;
        recCtx.fillStyle = '#1c1c1e';
        recCtx.fillRect(0, textStartY, recCanvas.width, bannerH);

        const fontSize = Math.max(14, Math.floor(recCanvas.width * 0.025));
        recCtx.font = `bold ${fontSize}px sans-serif`;

        recCtx.fillStyle = '#00ffcc';
        recCtx.fillText(mainResult.innerText, Math.floor(recCanvas.width * 0.03), textStartY + Math.floor(bannerH * 0.42));

        recCtx.fillStyle = '#ff9500';
        if (currentPlane === 'sagittal') {
            recCtx.fillText(`歩幅: ${document.getElementById('res_stride').innerText} ｜ MER肘角: ${document.getElementById('res_mer_elbow').innerText} ｜ リリース高: ${document.getElementById('res_release_h').innerText}`, Math.floor(recCanvas.width * 0.03), textStartY + Math.floor(bannerH * 0.82));
        } else {
            recCtx.fillText(`つま先角: ${document.getElementById('res_toe_out').innerText} ｜ 膝内外反: ${document.getElementById('res_knee_valgus').innerText} ｜ 肘高: ${document.getElementById('res_shoulder_elbow').innerText}`, Math.floor(recCanvas.width * 0.03), textStartY + Math.floor(bannerH * 0.82));
        }
    }
    animationFrameId = requestAnimationFrame(loop);
}
