const video = document.getElementById('videoElement');
const outputCanvas = document.getElementById('outputCanvas');
const outCtx = outputCanvas.getContext('2d');
const interactionCanvas = document.getElementById('interactionCanvas');
const intCtx = interactionCanvas.getContext('2d');
const zoomTarget = document.getElementById('zoomTarget');
const seekSlider = document.getElementById('seekSlider');
const btnPlayPause = document.getElementById('btnPlayPause');
const mainResult = document.getElementById('main-result');
const subResult = document.getElementById('sub-result');

let currentFPS = 60.0;
const fpsList = [30, 60, 120, 240];
let fpsIdx = 1;
const playbackRates = [1.0, 0.5, 0.25];
let currentRateIdx = 0;

let isProcessing = false;
let animationFrameId = null;
let currentBlobUrl = null;

// Scale, Floor & Zoom
let pxPerCm = null;
let isZoomMode = false;
let isScaleMode = false;
let isFloorMode = false;
let isFloorDragging = false;
let userFloorY = null;
let scalePoints = [];
let zoomScale = 1.0;
let panOffsetX = 0, panOffsetY = 0;
let isPanning = false;

// ROI
let isRoiMode = false;
let isRoiDrawing = false;
let isRoiEnabled = false;
let roiStart = { x: 0, y: 0 };
let roiNorm = { x: 0.2, y: 0.1, w: 0.6, h: 0.8 };
const roiCanvas = document.createElement('canvas');
const roiCtx = roiCanvas.getContext('2d');

// Screen Recording
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
const recCanvas = document.createElement('canvas');
const recCtx = recCanvas.getContext('2d');

window.addEventListener('resize', fitCanvases);

function toggleFPS() {
    fpsIdx = (fpsIdx + 1) % fpsList.length;
    currentFPS = fpsList[fpsIdx];
    document.getElementById('btnFps').innerText = `${currentFPS}fps`;
    calculateMetrics();
}

function togglePlaybackRate() {
    currentRateIdx = (currentRateIdx + 1) % playbackRates.length;
    video.playbackRate = playbackRates[currentRateIdx];
    document.getElementById('btnSpeed').innerText = `${video.playbackRate}x`;
}

function toggleZoomMode() {
    isZoomMode = !isZoomMode;
    const btn = document.getElementById('btnModeZoom');
    const controls = document.getElementById('zoom-controls');
    if (isZoomMode) {
        isScaleMode = isRoiMode = isFloorMode = false;
        btn.classList.add('mode-active');
        controls.style.display = 'flex';
    } else {
        btn.classList.remove('mode-active');
        controls.style.display = 'none';
    }
    updateButtons();
}

function resetZoom() { zoomScale = 1.0; panOffsetX = 0; panOffsetY = 0; document.getElementById('zoom-slider').value = 1.0; applyZoom(); }
document.getElementById('zoom-slider').addEventListener('input', (e) => { zoomScale = parseFloat(e.target.value); applyZoom(); });

function toggleScaleMode() {
    isScaleMode = !isScaleMode;
    if (isScaleMode) {
        isZoomMode = isRoiMode = isFloorMode = false;
        scalePoints = [];
        mainResult.innerText = "📏 物差し：基準の長さを2点タップ";
        subResult.innerText = "動画内で長さが分かるものの両端をタップしてください";
    } else {
        mainResult.innerText = "連続ジャンプ・リバウンド解析";
    }
    updateButtons();
    redrawOverlay();
}

function toggleFloorMode() {
    isFloorMode = !isFloorMode;
    if (isFloorMode) {
        isZoomMode = isRoiMode = isScaleMode = false;
        mainResult.innerHTML = "<span style='color:#00ffcc;'>🟦 地面ライン設定 (ドラッグ可能)</span>";
        subResult.innerText = "ラインを上下にドラッグして地面に合わせ、「🟦 地面」を再タップで確定";
    } else {
        mainResult.innerText = "連続ジャンプ・リバウンド解析";
    }
    updateButtons();
    redrawOverlay();
}

function toggleRoiMode() {
    isRoiMode = !isRoiMode;
    if (isRoiMode) {
        isZoomMode = isScaleMode = isFloorMode = false;
        mainResult.innerText = "🔲 対象者を画面ドラッグで囲んでください";
    } else {
        mainResult.innerText = "連続ジャンプ・リバウンド解析";
    }
    updateButtons();
    redrawOverlay();
}

function updateButtons() {
    document.getElementById('btnModeZoom').classList.toggle('mode-active', isZoomMode);
    document.getElementById('btnModeScale').classList.toggle('mode-active', isScaleMode);
    document.getElementById('btnModeFloor').classList.toggle('mode-floor-active', isFloorMode);
    document.getElementById('btnToggleRoi').classList.toggle('roi-active', isRoiMode);
}

function getPointerNorm(e) {
    const rect = interactionCanvas.getBoundingClientRect();
    const clickRelX = e.clientX - (rect.left + rect.width / 2), clickRelY = e.clientY - (rect.top + rect.height / 2);
    const cvsX = (clickRelX - panOffsetX) / zoomScale + interactionCanvas.width / 2;
    const cvsY = (clickRelY - panOffsetY) / zoomScale + interactionCanvas.height / 2;
    return { x: Math.max(0, Math.min(1.0, cvsX / interactionCanvas.width)), y: Math.max(0, Math.min(1.0, cvsY / interactionCanvas.height)) };
}

interactionCanvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (isFloorMode) {
        const p = getPointerNorm(e);
        userFloorY = p.y;
        isFloorDragging = true;
        try { interactionCanvas.setPointerCapture(e.pointerId); } catch(err){}
        redrawOverlay();
        return;
    }
    if (isRoiMode) {
        isRoiDrawing = true; roiStart = getPointerNorm(e); roiNorm = { x: roiStart.x, y: roiStart.y, w: 0, h: 0 };
        isRoiEnabled = true; try { interactionCanvas.setPointerCapture(e.pointerId); } catch(err){} return;
    }
    if (isScaleMode) {
        const p = getPointerNorm(e);
        scalePoints.push({ x: p.x * interactionCanvas.width, y: p.y * interactionCanvas.height });
        if (scalePoints.length === 2) {
            document.getElementById('scale-modal-overlay').style.display = 'flex';
            document.getElementById('scale-input-value').focus();
        }
        redrawOverlay(); return;
    }
    if (isZoomMode || zoomScale > 1.0) {
        isPanning = true; panStartX = e.clientX - panOffsetX; panStartY = e.clientY - panOffsetY;
        try { interactionCanvas.setPointerCapture(e.pointerId); } catch(err){}
    }
});

interactionCanvas.addEventListener('pointermove', (e) => {
    if (isFloorMode && isFloorDragging) {
        const p = getPointerNorm(e);
        userFloorY = p.y;
        redrawOverlay();
        return;
    }
    if (isRoiDrawing && isRoiMode) {
        const p = getPointerNorm(e);
        roiNorm.x = Math.min(roiStart.x, p.x); roiNorm.y = Math.min(roiStart.y, p.y);
        roiNorm.w = Math.abs(p.x - roiStart.x); roiNorm.h = Math.abs(p.y - roiStart.y);
        redrawOverlay(); return;
    }
    if (isPanning) { panOffsetX = e.clientX - panStartX; panOffsetY = e.clientY - panStartY; applyZoom(); }
});

interactionCanvas.addEventListener('pointerup', (e) => {
    if (isFloorMode && isFloorDragging) {
        isFloorDragging = false;
        try { interactionCanvas.releasePointerCapture(e.pointerId); } catch(err){}
        mainResult.innerHTML = "<span style='color:#30d158;'>✅ 地面ライン調整完了</span>";
        subResult.innerText = "位置が決まったら「🟦 地面」ボタンを押して確定してください";
        return;
    }
    if (isRoiDrawing) { isRoiDrawing = false; try { interactionCanvas.releasePointerCapture(e.pointerId); } catch(err){} toggleRoiMode(); renderCurrentFrame(); }
    if (isPanning) { isPanning = false; try { interactionCanvas.releasePointerCapture(e.pointerId); } catch(err){} }
});

function closeScaleModal(isCancel = true) {
    document.getElementById('scale-modal-overlay').style.display = 'none';
    if (isCancel) scalePoints = [];
    isScaleMode = false;
    updateButtons();
    redrawOverlay();
}

function submitScaleModal() {
    const realCm = parseFloat(document.getElementById('scale-input-value').value);
    if (realCm && realCm > 0) {
        const distPx = Math.hypot(scalePoints[1].x - scalePoints[0].x, scalePoints[1].y - scalePoints[0].y);
        pxPerCm = distPx / realCm;
        document.getElementById('scale-info-text').innerText = `物差し: ${(pxPerCm).toFixed(1)}px/cm`;
        closeScaleModal(false);

        mainResult.innerHTML = "<span style='color:#30d158;'>✅ 物差し設定完了</span>";
        subResult.innerText = "コマ送り（<-1, +1>）で1回目と2回目のジャンプを記録してください";
        calculateMetrics();
    } else {
        alert("有効な数値を入力してください");
    }
}

function updateJumpBtnStyles() {
    document.getElementById('btnJ1Takeoff').className = `jump-btn ${jumps.j1.takeoff ? 'active-takeoff' : ''}`;
    document.getElementById('btnJ1Peak').className = `jump-btn ${jumps.j1.peak ? 'active-peak' : ''}`;
    document.getElementById('btnJ1Landing').className = `jump-btn ${jumps.j1.landing ? 'active-landing' : ''}`;

    document.getElementById('btnJ2Takeoff').className = `jump-btn ${jumps.j2.takeoff ? 'active-takeoff' : ''}`;
    document.getElementById('btnJ2Peak').className = `jump-btn ${jumps.j2.peak ? 'active-peak' : ''}`;
    document.getElementById('btnJ2Landing').className = `jump-btn ${jumps.j2.landing ? 'active-landing' : ''}`;
}

function markJumpPhase(key) {
    if (!currentCoM || !currentFeetCenter) {
        alert("人物が検出できていません"); return;
    }
    if (!pxPerCm) {
        alert("先に「📏 物差し」で基準の長さを設定してください"); return;
    }

    const frame = Math.round(video.currentTime * currentFPS);
    const data = { time: frame / currentFPS, frame: frame, com: { ...currentCoM }, feet: { ...currentFeetCenter } };

    const [jId, phase] = key.split('_');
    jumps[jId][phase] = data;

    updateJumpBtnStyles();
    calculateMetrics();
    redrawJumpVisuals();
}

function clearJumpData() {
    jumps.j1 = { takeoff: null, peak: null, landing: null };
    jumps.j2 = { takeoff: null, peak: null, landing: null };
    updateJumpBtnStyles();
    calculateMetrics();
    redrawJumpVisuals();
}

function updateSeekBar() { if (video.duration) seekSlider.value = (video.currentTime / video.duration) * 100; }
seekSlider.addEventListener('input', () => { if (video.duration) { video.pause(); btnPlayPause.innerText = '▶ 再生'; video.currentTime = (seekSlider.value / 100) * video.duration; } });
video.addEventListener('seeked', () => { if (video.paused) { updateSeekBar(); renderCurrentFrame(); } });

btnPlayPause.addEventListener('click', async () => {
    if (video.paused) {
        try {
            await video.play();
            btnPlayPause.innerText = '⏸ 停止';
            btnPlayPause.style.background = '#ff9500';
        } catch (e) {}
    } else {
        video.pause();
        btnPlayPause.innerText = '▶ 再生';
        btnPlayPause.style.background = '#34c759';
    }
});

const btnStepForward = document.getElementById('btnStepForward');
const btnStepBack = document.getElementById('btnStepBack');
btnStepForward.addEventListener('click', () => { video.pause(); btnPlayPause.innerText = '▶ 再生'; btnPlayPause.style.background = '#34c759'; video.currentTime = Math.min(video.duration, video.currentTime + (1 / currentFPS)); });
btnStepBack.addEventListener('click', () => { video.pause(); btnPlayPause.innerText = '▶ 再生'; btnPlayPause.style.background = '#34c759'; video.currentTime = Math.max(0, video.currentTime - (1 / currentFPS)); });

function captureSnapshot() {
    if (!video.videoWidth) { alert("動画が読み込まれていません"); return; }
    const snapCanvas = document.createElement('canvas'), snapCtx = snapCanvas.getContext('2d');
    snapCanvas.width = outputCanvas.width; snapCanvas.height = outputCanvas.height + 70;
    snapCtx.fillStyle = '#000'; snapCtx.fillRect(0, 0, snapCanvas.width, snapCanvas.height);
    snapCtx.drawImage(video, 0, 0, outputCanvas.width, outputCanvas.height); snapCtx.drawImage(outputCanvas, 0, 0);
    snapCtx.drawImage(interactionCanvas, 0, 0);
    snapCtx.fillStyle = '#1c1c1e'; snapCtx.fillRect(0, outputCanvas.height, snapCanvas.width, 70);
    snapCtx.fillStyle = '#00ffcc'; snapCtx.font = 'bold 13px sans-serif';
    snapCtx.fillText(`1回目高: ${document.getElementById('res_j1_h').innerText} ｜ 2回目高: ${document.getElementById('res_j2_h').innerText}`, 15, outputCanvas.height + 26);
    snapCtx.fillStyle = '#ff375f'; snapCtx.font = 'bold 12px sans-serif';
    snapCtx.fillText(`接地時間: ${document.getElementById('res_contact_t').innerText} ｜ RSI: ${document.getElementById('res_rsi').innerText}`, 15, outputCanvas.height + 50);
    document.getElementById('snapshot-img').src = snapCanvas.toDataURL('image/png'); document.getElementById('snapshot-modal-overlay').style.display = 'flex';
}
function closeSnapshotModal() { document.getElementById('snapshot-modal-overlay').style.display = 'none'; }

// 録画機能 (MediaRecorder)
function toggleRecording() {
    if (!video.videoWidth) { alert("動画が読み込まれていません"); return; }
    const btn = document.getElementById('btnRecord');

    if (!isRecording) {
        recordedChunks = [];
        const stream = recCanvas.captureStream(30);

        let mimeType = 'video/webm;codecs=vp9';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = 'video/webm';
            if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/mp4';
        }

        try {
            mediaRecorder = new MediaRecorder(stream, { mimeType });
        } catch (e) {
            mediaRecorder = new MediaRecorder(stream);
        }

        mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
        mediaRecorder.onstop = () => {
            const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'video/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `RJ_Analysis_${Date.now()}.mp4`;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
        };

        mediaRecorder.start();
        isRecording = true;
        btn.innerText = "⏹ 録画停止";
        btn.classList.add('rec-active');

        if (video.paused) {
            video.play();
            btnPlayPause.innerText = '⏸ 停止';
            btnPlayPause.style.background = '#ff9500';
        }
    } else {
        mediaRecorder.stop();
        isRecording = false;
        btn.innerText = "🎥 録画開始";
        btn.classList.remove('rec-active');
    }
}

document.getElementById('inputFile').addEventListener('change', (e) => {
    const file = e.target.files[0]; if (!file) return;
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    if (currentBlobUrl) { URL.revokeObjectURL(currentBlobUrl); currentBlobUrl = null; }
    video.pause(); resetZoom(); clearJumpData();
    currentBlobUrl = URL.createObjectURL(file); video.src = currentBlobUrl; video.load();
    const onCanPlay = () => { video.removeEventListener('canplay', onCanPlay); fitCanvases(); btnPlayPause.innerText = '▶ 再生'; video.currentTime = 0.001; loop(); };
    video.addEventListener('canplay', onCanPlay); e.target.value = '';
});
