const video1 = document.getElementById('video1');
const canvas1 = document.getElementById('canvas1');
const ctx1 = canvas1.getContext('2d');

const video2 = document.getElementById('video2');
const canvas2 = document.getElementById('canvas2');
const ctx2 = canvas2.getContext('2d');

const pane2 = document.getElementById('pane2');
const btnPick2 = document.getElementById('btn-pick2');
const btnToggleCompare = document.getElementById('btn-toggle-compare');
const btnFps = document.getElementById('btn-fps');
const btnRecord = document.getElementById('btn-record');
const seekbar1 = document.getElementById('seekbar1');
const seekbar2 = document.getElementById('seekbar2');
const seekRow2 = document.getElementById('seek-row-2');
const mainResult = document.getElementById('main-result');
const subResult = document.getElementById('sub-result');
const btnConfirmScale = document.getElementById('btn-confirm-scale');
const scaleInfoText = document.getElementById('scale-info-text');
const btnPlay = document.getElementById('btn-play');
const btnSpeed = document.getElementById('btn-speed');

const fileInput1 = document.getElementById('file-input-1');
const fileInput2 = document.getElementById('file-input-2');

const perpSlider = document.getElementById('perp-slider');
const simSlider = document.getElementById('sim-slider');
const simDegVal = document.getElementById('sim-deg-val');

const scaleModalOverlay = document.getElementById('scale-modal-overlay');
const scaleModalTitle = document.getElementById('scale-modal-title');
const scaleInputValue = document.getElementById('scale-input-value');

let compareMode = 0;
let currentMode = 'angle';
let lastMeasureMode = 'angle';

let currentFPS = 30.0;
const fpsList = [30, 60, 120, 240];
let fpsIdx = 0;

let currentTorsionAngle = 0;

let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let recordCanvas = null;
let recordCtx = null;
let recordAnimId = null;

let isAiDetecting = false;

const state = {
    1: { points: [], scalePoints: [], perpPoints: [], cogPoints: [], aiJoints: [], limbsLandmarks: null, aiOverrides: {}, pxPerCm: null, resultMain: "", resultSub: "" },
    2: { points: [], scalePoints: [], perpPoints: [], cogPoints: [], pxPerCm: null, resultMain: "", resultSub: "" }
};

const viewState = {
    1: { scale: 1, x: 0, y: 0 },
    2: { scale: 1, x: 0, y: 0 }
};

let scaleTarget = 1;
let lastActiveTarget = 1;
let draggingPoint = null;

function toggleFPS() {
    fpsIdx = (fpsIdx + 1) % fpsList.length;
    currentFPS = fpsList[fpsIdx];
    btnFps.innerText = `${currentFPS}fps`;
    [1, 2].forEach(idx => {
        const s = state[idx];
        if (s.points.length > 0) {
            s.points.forEach(p => { if (p.frame !== undefined) p.time = p.frame / currentFPS; });
        }
        if (s.cogPoints.length > 0) {
            s.cogPoints.forEach(p => { if (p.frame !== undefined) p.time = p.frame / currentFPS; });
        }
        calcResults(s, lastMeasureMode);
    });
    updateDisplayResult();
}

let isPlaying = false;
const playbackRates = [1.0, 0.5, 0.25];
let currentRateIdx = 0;

function resetZoom() {
    viewState[lastActiveTarget] = { scale: 1, x: 0, y: 0 };
    document.getElementById('zoom-slider').value = 1;
    applyZoom(lastActiveTarget);
}
document.getElementById('zoom-slider').addEventListener('input', e => {
    viewState[lastActiveTarget].scale = parseFloat(e.target.value);
    applyZoom(lastActiveTarget);
});
perpSlider.addEventListener('input', () => { [1, 2].forEach(idx => calcResults(state[idx], currentMode)); updateDisplayResult(); redraw(); });
simSlider.addEventListener('input', e => {
    simDegVal.innerText = `${parseFloat(e.target.value) > 0 ? '+' : ''}${e.target.value}°`;
    [1, 2].forEach(idx => calcResults(state[idx], 'sim'));
    updateDisplayResult();
    redraw();
});

window.addEventListener('resize', fitCanvases);

function resetState(idx) {
    state[idx] = { points: [], scalePoints: [], perpPoints: [], cogPoints: [], aiJoints: [], limbsLandmarks: null, aiOverrides: {}, pxPerCm: null, resultMain: "", resultSub: "" };
    if (idx === 1) currentTorsionAngle = 0;
    updateScaleInfoText();
    updateDisplayResult();
    redraw();
}

function triggerPickVideo(idx) { idx === 1 ? fileInput1.click() : fileInput2.click(); }

function loadVideoFile(file, vidElem, idx) {
    if (file) {
        resetState(idx);
        vidElem.src = URL.createObjectURL(file);
        vidElem.load();
    }
}
fileInput1.addEventListener('change', e => loadVideoFile(e.target.files[0], video1, 1));
fileInput2.addEventListener('change', e => loadVideoFile(e.target.files[0], video2, 2));

video1.addEventListener('loadedmetadata', () => { fitCanvases(); seekbar1.max = video1.duration; seekbar1.value = 0; setMode(currentMode); });
video2.addEventListener('loadedmetadata', () => { fitCanvases(); seekbar2.max = video2.duration; seekbar2.value = 0; });

video1.addEventListener('ended', () => {
    if (isRecording) stopRecording();
    else if (isPlaying) togglePlay();
});

function toggleCompareMode() {
    compareMode = (compareMode + 1) % 3;
    btnToggleCompare.classList.remove('compare-parallel', 'compare-overlay');

    pane2.style.position = 'relative';
    pane2.style.top = 'auto';
    pane2.style.left = 'auto';
    pane2.style.width = '100%';
    pane2.style.height = '100%';
    pane2.style.opacity = '1';
    pane2.style.borderLeft = '2px solid #555';
    pane2.style.pointerEvents = 'auto';

    if (compareMode === 1) {
        pane2.style.display = 'flex';
        btnPick2.style.display = 'inline-block'; seekRow2.style.display = 'flex';
        btnToggleCompare.classList.add('compare-parallel'); btnToggleCompare.innerText = '並列表示';
    } else if (compareMode === 2) {
        pane2.style.display = 'flex'; pane2.style.position = 'absolute'; pane2.style.top = '0'; pane2.style.left = '0';
        pane2.style.opacity = '0.5'; pane2.style.borderLeft = 'none'; pane2.style.pointerEvents = 'none';
        btnPick2.style.display = 'inline-block'; seekRow2.style.display = 'flex';
        btnToggleCompare.classList.add('compare-overlay'); btnToggleCompare.innerText = '重ね透かし';
    } else {
        pane2.style.display = 'none';
        btnPick2.style.display = 'none'; seekRow2.style.display = 'none'; btnToggleCompare.innerText = '1画面のみ';
        if (video2) video2.pause();
    }
    updateScaleInfoText(); updateDisplayResult(); setTimeout(fitCanvases, 50);
}

async function togglePlay() {
    if (!video1.duration && !video2.duration) return;
    isPlaying = !isPlaying;
    if (isPlaying) {
        try {
            const playPromises = [];
            if (video1.duration) playPromises.push(video1.play());
            if (compareMode > 0 && video2.duration) playPromises.push(video2.play());
            await Promise.all(playPromises);
        } catch (err) {}
        btnPlay.innerText = '⏸ 停止'; btnPlay.style.background = '#ff9500';
    } else {
        if (video1.duration) video1.pause();
        if (compareMode > 0 && video2.duration) video2.pause();
        btnPlay.innerText = '▶ 再生'; btnPlay.style.background = '#34c759';
    }
}

function togglePlaybackRate() {
    currentRateIdx = (currentRateIdx + 1) % playbackRates.length;
    const rate = playbackRates[currentRateIdx];
    video1.playbackRate = rate; video2.playbackRate = rate; btnSpeed.innerText = `${rate}x`;
}

let seeking1 = false;
seekbar1.addEventListener('input', () => { seeking1 = true; video1.currentTime = seekbar1.value; });
seekbar1.addEventListener('change', () => { seeking1 = false; redraw(); });
video1.addEventListener('timeupdate', () => { if (!seeking1) seekbar1.value = video1.currentTime; });

let seeking2 = false;
seekbar2.addEventListener('input', () => { seeking2 = true; video2.currentTime = seekbar2.value; });
seekbar2.addEventListener('change', () => { seeking2 = false; redraw(); });
video2.addEventListener('timeupdate', () => { if (!seeking2) seekbar2.value = video2.currentTime; });

function stepFrame(dir) {
    const stepSec = dir / currentFPS;
    if (video1 && !isNaN(video1.duration) && video1.duration > 0) {
        video1.currentTime = Math.max(0, Math.min(video1.duration, video1.currentTime + stepSec));
    }
    if (compareMode > 0 && video2 && !isNaN(video2.duration) && video2.duration > 0) {
        video2.currentTime = Math.max(0, Math.min(video2.duration, video2.currentTime + stepSec));
    }
    redraw();
}

function updateDisplayResult() {
    if (btnConfirmScale) {
        const s = state[scaleTarget];
        btnConfirmScale.style.display = (currentMode === 'scale' && s && s.scalePoints.length === 2) ? 'inline-block' : 'none';
    }

    if (currentMode === 'zoom' || currentMode === 'ai') return;

    if (compareMode === 0) {
        mainResult.innerHTML = state[1].resultMain || "測定したい点をタップしてください"; subResult.innerHTML = state[1].resultSub || "";
    } else {
        const r1 = state[1].resultMain ? `① ${state[1].resultMain}` : "① 未測定";
        const r2 = state[2].resultMain ? `② ${state[2].resultMain}` : "② 未測定";
        mainResult.innerHTML = `${r1} ｜ ${r2}`;
        subResult.innerHTML = [state[1].resultSub ? `①: ${state[1].resultSub}` : "", state[2].resultSub ? `②: ${state[2].resultSub}` : ""].filter(Boolean).join("<br>");
    }
}

function updateScaleInfoText() {
    const s1 = state[1].pxPerCm ? `①${(state[1].pxPerCm).toFixed(1)}px/cm` : "①未設定";
    const s2 = state[2].pxPerCm ? `②${(state[2].pxPerCm).toFixed(1)}px/cm` : "②未設定";
    scaleInfoText.innerText = (compareMode > 0) ? `物差し: ${s1}|${s2}` : `物差し: ${s1}`;
}

function setMode(mode) {
    const mainModes = ['angle', 'distance', 'accel', 'sim', 'cog'];
    if (mainModes.includes(mode) && mode !== lastMeasureMode) { state[1].points = []; state[2].points = []; }

    if (mode !== 'zoom' && mode !== 'ai') { if (mainModes.includes(mode)) lastMeasureMode = mode; currentMode = mode; }
    else { currentMode = mode; }

    document.querySelectorAll('.mode-active').forEach(b => b.classList.remove('mode-active'));
    document.getElementById('zoom-controls').style.display = (mode === 'zoom') ? 'flex' : 'none';
    document.getElementById('perp-controls').style.display = (mode === 'perp' || mode === 'cog' || state[1].perpPoints.length === 2 || state[2].perpPoints.length === 2) ? 'flex' : 'none';
    document.getElementById('sim-controls').style.display = (mode === 'sim') ? 'flex' : 'none';

    if (mode === 'zoom') {
        document.getElementById('btn-mode-zoom').classList.add('mode-active');
        document.getElementById('zoom-target-label').innerText = lastActiveTarget === 1 ? '①' : '②';
        document.getElementById('zoom-slider').value = viewState[lastActiveTarget].scale;
    } else if (mode === 'ai') {
        document.getElementById('btn-mode-ai').classList.add('mode-active');
        mainResult.innerHTML = "🤖 AI読込中..."; subResult.innerHTML = "動画を再生するかコマ送りして解析を開始してください";
        currentTorsionAngle = 0;
        if (video1.readyState >= 2) pose.send({image: video1});
        redraw();
    } else {
        const btnMap = { 'angle': 'btn-mode-angle', 'distance': 'btn-mode-dist', 'accel': 'btn-mode-acc', 'scale': 'btn-mode-scale', 'perp': 'btn-mode-perp', 'sim': 'btn-mode-sim', 'cog': 'btn-mode-cog' };
        if (btnMap[mode]) document.getElementById(btnMap[mode]).classList.add('mode-active');
    }

    if (mode === 'scale') {
        state[1].scalePoints = []; state[2].scalePoints = [];
        state[1].resultMain = "物差し設定: 基準物の両端（2点）をタップ"; state[1].resultSub = "タップ後、点をドラッグして微調整できます";
        state[2].resultMain = ""; state[2].resultSub = "";
    } else if (mode !== 'zoom' && mode !== 'ai') {
        [1, 2].forEach(idx => calcResults(state[idx], mode));
    }
    updateDisplayResult(); redraw();
}

function clearCurrentPoints() {
    if (currentMode === 'zoom') return;
    if (currentMode === 'ai') {
        state[1].aiOverrides = {};
        currentTorsionAngle = 0;
        if (video1.readyState >= 2) pose.send({image: video1});
        return;
    }
    if (currentMode === 'scale') {
        state[1].scalePoints = []; state[2].scalePoints = [];
        state[1].resultMain = "物差し設定: 基準物の両端（2点）をタップ"; state[1].resultSub = "タップ後、点をドラッグして微調整できます";
        state[2].resultMain = ""; state[2].resultSub = "";
    } else if (currentMode === 'perp') {
        state[1].perpPoints = []; state[2].perpPoints = [];
        perpSlider.value = 50;
        document.getElementById('perp-controls').style.display = 'none';
    } else if (currentMode === 'cog') {
        state[1].cogPoints = []; state[2].cogPoints = [];
    } else {
        state[1].points = []; state[2].points = [];
    }
    [1, 2].forEach(idx => calcResults(state[idx], currentMode));
    if (currentMode !== 'ai') updateDisplayResult();
    redraw();
}

let isTouchPanning = false; let panStartX = 0, panStartY = 0, panStartOffsetX = 0, panStartOffsetY = 0, pinchInitialDist = 0, pinchInitialScale = 1, pinchTarget = 1;
document.getElementById('stage').addEventListener('touchstart', e => {
    if (currentMode !== 'zoom') return;
    const targetIdx = e.target.closest('#pane2') ? 2 : 1; lastActiveTarget = targetIdx;
    document.getElementById('zoom-target-label').innerText = targetIdx === 1 ? '①' : '②'; document.getElementById('zoom-slider').value = viewState[targetIdx].scale;
    if (e.touches.length === 1) {
        isTouchPanning = true; panStartX = e.touches[0].clientX; panStartY = e.touches[0].clientY;
        panStartOffsetX = viewState[targetIdx].x; panStartOffsetY = viewState[targetIdx].y;
    } else if (e.touches.length === 2) {
        isTouchPanning = false; e.preventDefault(); pinchTarget = targetIdx;
        pinchInitialDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        pinchInitialScale = viewState[targetIdx].scale;
    }
}, {passive: false});

document.getElementById('stage').addEventListener('touchmove', e => {
    if (currentMode !== 'zoom') return;
    e.preventDefault();
    if (isTouchPanning && e.touches.length === 1) {
        const scale = viewState[lastActiveTarget].scale;
        viewState[lastActiveTarget].x = panStartOffsetX + (e.touches[0].clientX - panStartX) / scale;
        viewState[lastActiveTarget].y = panStartOffsetY + (e.touches[0].clientY - panStartY) / scale;
        applyZoom(lastActiveTarget);
    } else if (e.touches.length === 2) {
        const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        viewState[pinchTarget].scale = Math.max(1, Math.min(pinchInitialScale * (dist / pinchInitialDist), 5));
        applyZoom(pinchTarget); document.getElementById('zoom-slider').value = viewState[pinchTarget].scale;
    }
}, {passive: false});
document.getElementById('stage').addEventListener('touchend', e => { if (e.touches.length === 0) isTouchPanning = false; }, {passive: false});

[ {c: canvas1, v: video1, idx: 1}, {c: canvas2, v: video2, idx: 2} ].forEach(item => {
    item.c.addEventListener('pointerdown', (e) => { e.preventDefault(); handlePointerDown(e, item.c, item.v, item.idx); });
    item.c.addEventListener('pointermove', (e) => handlePointerMove(e, item.c, item.idx));
    item.c.addEventListener('pointerup', (e) => handlePointerUp(e, item.c));
    item.c.addEventListener('pointercancel', (e) => handlePointerUp(e, item.c));
});

function getCanvasCoords(e, cvs) {
    const rect = cvs.getBoundingClientRect();
    return {
        x: (e.clientX - rect.left) * (cvs.width / rect.width),
        y: (e.clientY - rect.top) * (cvs.height / rect.height)
    };
}

function findHitPoint(s, pos, mode) {
    const HIT_RADIUS = 26;
    if (mode === 'ai') {
        if (s.aiJoints && s.aiJoints.length === 4) {
            for (let i = 0; i < s.aiJoints.length; i++) {
                if (Math.hypot(s.aiJoints[i].x - pos.x, s.aiJoints[i].y - pos.y) <= HIT_RADIUS) {
                    return { arrayName: 'aiJoints', index: i };
                }
            }
        }
        return null;
    }
    if (mode === 'scale') {
        for (let i = 0; i < s.scalePoints.length; i++) {
            if (Math.hypot(s.scalePoints[i].x - pos.x, s.scalePoints[i].y - pos.y) <= HIT_RADIUS) return { arrayName: 'scalePoints', index: i };
        }
        return null;
    }
    if (mode === 'cog') return null;
    if (mode === 'perp') {
        for (let i = 0; i < s.perpPoints.length; i++) { if (Math.hypot(s.perpPoints[i].x - pos.x, s.perpPoints[i].y - pos.y) <= HIT_RADIUS) return { arrayName: 'perpPoints', index: i }; }
        return null;
    }
    for (let i = 0; i < s.points.length; i++) { if (Math.hypot(s.points[i].x - pos.x, s.points[i].y - pos.y) <= HIT_RADIUS) return { arrayName: 'points', index: i }; }
    return null;
}

function handlePointerDown(e, cvs, vid, targetIdx) {
    if (currentMode === 'zoom') return;
    lastActiveTarget = targetIdx;
    const s = state[targetIdx], pos = getCanvasCoords(e, cvs);
    const currentTime = vid.currentTime, currentFrame = Math.round(currentTime * currentFPS);
    const hit = findHitPoint(s, pos, currentMode);
    if (hit) { draggingPoint = { targetIdx, arrayName: hit.arrayName, index: hit.index }; try { cvs.setPointerCapture(e.pointerId); } catch(err){} return; }
    if (currentMode === 'ai') return;

    if (currentMode === 'scale') {
        scaleTarget = targetIdx;
        if (s.scalePoints.length >= 2) s.scalePoints = [];
        s.scalePoints.push({ x: pos.x, y: pos.y });
        if (s.scalePoints.length === 1) {
            s.resultMain = "物差し設定: 2点目をタップ";
            s.resultSub = "タップ後、点をドラッグして位置を微調整できます";
        } else if (s.scalePoints.length === 2) {
            s.resultMain = "2点指定完了: 点をドラッグして微調整";
            s.resultSub = "位置が決まったら右上の「📏長さ確定」ボタンを押してください";
        }
        updateDisplayResult();
        redraw();
        return;
    }
    if (currentMode === 'perp') {
        if (s.perpPoints.length >= 2) s.perpPoints = [];
        s.perpPoints.push({ x: pos.x, y: pos.y }); calcResults(s, currentMode);
        if (s.perpPoints.length === 2) document.getElementById('perp-controls').style.display = 'flex';
        updateDisplayResult(); redraw(); return;
    }
    if (currentMode === 'cog') {
        if (s.perpPoints.length < 2) { alert("先に「垂直線」モードで2点をタップし、基準線を設定してください。"); return; }
        s.cogPoints.push({ x: pos.x, y: pos.y, time: currentTime, frame: currentFrame });
        calcResults(s, currentMode); updateDisplayResult(); redraw(); return;
    }
    const maxPoints = (currentMode === 'distance') ? 2 : 3;
    if (s.points.length >= maxPoints) s.points = [];
    s.points.push({ x: pos.x, y: pos.y, time: currentTime, frame: currentFrame });
    calcResults(s, currentMode); updateDisplayResult(); redraw();
}

function handlePointerMove(e, cvs, targetIdx) {
    if (!draggingPoint || draggingPoint.targetIdx !== targetIdx) return;
    const s = state[targetIdx], pos = getCanvasCoords(e, cvs);
    const pt = s[draggingPoint.arrayName][draggingPoint.index];
    if (pt) {
        pt.x = pos.x; pt.y = pos.y;
        if (currentMode === 'ai') {
            const currentFrame = Math.round(video1.currentTime * currentFPS);
            s.aiOverrides[currentFrame] = s.aiJoints.map(j => ({ x: j.x, y: j.y, z: j.z || 0 }));
            if (s.limbsLandmarks) {
                const jointMap = [11, 12, 23, 24];
                const landmarkIdx = jointMap[draggingPoint.index];
                if (s.limbsLandmarks[landmarkIdx]) {
                    s.limbsLandmarks[landmarkIdx].x = pos.x;
                    s.limbsLandmarks[landmarkIdx].y = pos.y;
                }
            }
            calcAiResults('manual');
        } else if (currentMode !== 'scale') {
            calcResults(s, currentMode); updateDisplayResult();
        }
        redraw();
    }
}

function handlePointerUp(e, cvs) {
    if (draggingPoint) { try { cvs.releasePointerCapture(e.pointerId); } catch(err){} draggingPoint = null; }
}

function openScaleModal() {
    const s = state[scaleTarget];
    if (!s || s.scalePoints.length !== 2) {
        alert("物差しの2点を画面上でタップして設定してください。");
        return;
    }
    scaleModalTitle.innerText = `基準物の長さ設定 (動画${scaleTarget === 1 ? '①' : '②'})`;
    scaleModalOverlay.style.display = 'flex';
    scaleInputValue.focus();
    scaleInputValue.select();
}

function submitScaleModal() {
    const s = state[scaleTarget];
    if (!s || s.scalePoints.length !== 2) return;
    const realCm = parseFloat(scaleInputValue.value);
    if (realCm && realCm > 0) {
        const distPx = Math.hypot(s.scalePoints[1].x - s.scalePoints[0].x, s.scalePoints[1].y - s.scalePoints[0].y);
        s.pxPerCm = distPx / realCm;
        updateScaleInfoText();
        scaleModalOverlay.style.display = 'none';
        setMode('distance');
    } else {
        alert("有効な数値を入力してください");
    }
}

function closeScaleModal() {
    scaleModalOverlay.style.display = 'none';
}

function captureSnapshot() {
    if (!video1.videoWidth && !video2.videoWidth) { alert("動画が読み込まれていません"); return; }
    const snapCanvas = document.createElement('canvas'), snapCtx = snapCanvas.getContext('2d');
    const w = (compareMode === 1 && video2.videoWidth) ? canvas1.width * 2 : canvas1.width, h = canvas1.height;
    if (w === 0 || h === 0) return;
    snapCanvas.width = w; snapCanvas.height = h + 60;
    snapCtx.fillStyle = '#000'; snapCtx.fillRect(0, 0, snapCanvas.width, snapCanvas.height);

    if (video1.videoWidth) {
        const r1 = getVideoRenderRect(video1, canvas1);
        snapCtx.drawImage(video1, r1.x, r1.y, r1.width, r1.height);
        snapCtx.drawImage(canvas1, 0, 0);
    }
    if (compareMode === 1 && video2.videoWidth) {
        const r2 = getVideoRenderRect(video2, canvas2);
        snapCtx.drawImage(video2, canvas1.width + r2.x, r2.y, r2.width, r2.height);
        snapCtx.drawImage(canvas2, canvas1.width, 0);
    }
    else if (compareMode === 2 && video2.videoWidth) {
        const r2 = getVideoRenderRect(video2, canvas2);
        snapCtx.globalAlpha = 0.5;
        snapCtx.drawImage(video2, r2.x, r2.y, r2.width, r2.height);
        snapCtx.drawImage(canvas2, 0, 0);
        snapCtx.globalAlpha = 1.0;
    }

    snapCtx.fillStyle = '#1c1c1e'; snapCtx.fillRect(0, h, snapCanvas.width, 60);
    snapCtx.fillStyle = '#00ffcc'; snapCtx.font = 'bold 14px -apple-system, sans-serif';
    snapCtx.fillText(mainResult.innerText, 15, h + 24);
    snapCtx.fillStyle = '#ccc'; snapCtx.font = '11px -apple-system, sans-serif';
    snapCtx.fillText(subResult.innerText, 15, h + 46);

    document.getElementById('snapshot-img').src = snapCanvas.toDataURL('image/png');
    document.getElementById('snapshot-modal-overlay').style.display = 'flex';
}
function closeSnapshotModal() { document.getElementById('snapshot-modal-overlay').style.display = 'none'; }

function toggleRecording() {
    if (isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
}

function startRecording() {
    if (!video1.duration) { alert("動画が読み込まれていません"); return; }

    recordedChunks = [];
    recordCanvas = document.createElement('canvas');
    const w = (compareMode === 1 && video2.videoWidth) ? canvas1.width * 2 : canvas1.width;
    const h = canvas1.height;
    if (w === 0 || h === 0) return;
    recordCanvas.width = w;
    recordCanvas.height = h + 50;
    recordCtx = recordCanvas.getContext('2d');

    function drawRecordFrame() {
        if (!isRecording) return;
        recordCtx.fillStyle = '#000';
        recordCtx.fillRect(0, 0, recordCanvas.width, recordCanvas.height);

        if (video1.videoWidth) {
            const r1 = getVideoRenderRect(video1, canvas1);
            recordCtx.drawImage(video1, r1.x, r1.y, r1.width, r1.height);
            recordCtx.drawImage(canvas1, 0, 0);
        }
        if (compareMode === 1 && video2.videoWidth) {
            const r2 = getVideoRenderRect(video2, canvas2);
            recordCtx.drawImage(video2, canvas1.width + r2.x, r2.y, r2.width, r2.height);
            recordCtx.drawImage(canvas2, canvas1.width, 0);
        } else if (compareMode === 2 && video2.videoWidth) {
            const r2 = getVideoRenderRect(video2, canvas2);
            recordCtx.globalAlpha = 0.5;
            recordCtx.drawImage(video2, r2.x, r2.y, r2.width, r2.height);
            recordCtx.drawImage(canvas2, 0, 0);
            recordCtx.globalAlpha = 1.0;
        }

        recordCtx.fillStyle = '#1c1c1e';
        recordCtx.fillRect(0, h, recordCanvas.width, 50);
        recordCtx.fillStyle = '#00ffcc';
        recordCtx.font = 'bold 13px -apple-system, sans-serif';
        recordCtx.fillText(mainResult.innerText, 12, h + 22);
        recordCtx.fillStyle = '#ccc';
        recordCtx.font = '10px -apple-system, sans-serif';
        recordCtx.fillText(subResult.innerText, 12, h + 40);

        recordAnimId = requestAnimationFrame(drawRecordFrame);
    }

    const stream = recordCanvas.captureStream(currentFPS);
    const candidateTypes = [
        'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
        'video/mp4;codecs=avc1',
        'video/mp4',
        'video/webm;codecs=h264',
        'video/webm;codecs=vp9',
        'video/webm'
    ];
    let selectedMimeType = candidateTypes.find(t => MediaRecorder.isTypeSupported(t)) || '';

    try {
        mediaRecorder = selectedMimeType
            ? new MediaRecorder(stream, { mimeType: selectedMimeType, videoBitsPerSecond: 6000000 })
            : new MediaRecorder(stream);
    } catch (e) {
        mediaRecorder = new MediaRecorder(stream);
    }

    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = exportRecordedVideo;

    mediaRecorder.start();
    isRecording = true;
    btnRecord.innerText = '⏹ 録画停止';
    btnRecord.classList.add('rec-active');

    drawRecordFrame();
    if (video1.paused) togglePlay();
}

function stopRecording() {
    if (!isRecording) return;
    isRecording = false;
    if (recordAnimId) cancelAnimationFrame(recordAnimId);
    mediaRecorder.stop();
    btnRecord.innerText = '🎥 録画開始';
    btnRecord.classList.remove('rec-active');
    if (!video1.paused) togglePlay();
}

function exportRecordedVideo() {
    const isMp4 = mediaRecorder.mimeType && mediaRecorder.mimeType.includes('mp4');
    const finalType = isMp4 ? 'video/mp4' : (mediaRecorder.mimeType || 'video/webm');
    const ext = isMp4 ? 'mp4' : 'webm';

    const blob = new Blob(recordedChunks, { type: finalType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `動作分析_${new Date().toISOString().slice(0, 10)}_${Date.now()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}
