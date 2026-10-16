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
let lastSetupMode = 'scale';
let workspaceTab = 'manual';
let zoomArmed = false;
let isPanningCanvas = false;

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

const motionTimeline = { torsion: {} };

function resetMotionTimeline() {
    motionTimeline.torsion = {};
    const chartCur = document.getElementById('chart-current');
    if (chartCur) chartCur.textContent = '--°';
    if (typeof drawTorsionChart === 'function') drawTorsionChart();
}

function createPaneState(withAi) {
    const base = { points: [], scalePoints: [], perpPoints: [], cogPoints: [], pxPerCm: null, resultMain: "", resultSub: "" };
    if (!withAi) return base;
    return { ...base, aiJoints: [], limbsLandmarks: null, worldLandmarks: null, aiOverrides: {}, manualOffsets: {}, manualKeyframes: {} };
}

const state = {
    1: createPaneState(true),
    2: createPaneState(false)
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
    updateSeekReadout();
}

let isPlaying = false;
const playbackRates = [1.0, 0.5, 0.25];
let currentRateIdx = 0;

function resetZoom() {
    viewState[lastActiveTarget] = { scale: 1, x: 0, y: 0 };
    document.getElementById('zoom-slider').value = 1;
    applyZoom(lastActiveTarget);
    updateHintBanner();
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
    state[idx] = createPaneState(idx === 1);
    if (idx === 1) {
        currentTorsionAngle = 0;
        resetMotionTimeline();
        if (typeof holdStore !== 'undefined') holdStore.pts = {};
        if (typeof holdStoreWorld !== 'undefined') holdStoreWorld.pts = {};
    }
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

video1.addEventListener('loadedmetadata', () => { fitCanvases(); seekbar1.max = video1.duration; seekbar1.value = 0; setMode(currentMode); updateSeekReadout(); updateHintBanner(); });
video2.addEventListener('loadedmetadata', () => { fitCanvases(); seekbar2.max = video2.duration; seekbar2.value = 0; updateSeekReadout(); });

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
        btnToggleCompare.classList.add('compare-parallel'); btnToggleCompare.innerText = '並列';
    } else if (compareMode === 2) {
        pane2.style.display = 'flex'; pane2.style.position = 'absolute'; pane2.style.top = '0'; pane2.style.left = '0';
        pane2.style.opacity = '0.5'; pane2.style.borderLeft = 'none'; pane2.style.pointerEvents = 'none';
        btnPick2.style.display = 'inline-block'; seekRow2.style.display = 'flex';
        btnToggleCompare.classList.add('compare-overlay'); btnToggleCompare.innerText = '重ね';
    } else {
        pane2.style.display = 'none';
        btnPick2.style.display = 'none'; seekRow2.style.display = 'none'; btnToggleCompare.innerText = '1画面';
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
        btnPlay.innerText = '⏸ 停止';
        btnPlay.classList.add('is-paused');
        btnPlay.style.background = '';
    } else {
        if (video1.duration) video1.pause();
        if (compareMode > 0 && video2.duration) video2.pause();
        btnPlay.innerText = '▶ 再生';
        btnPlay.classList.remove('is-paused');
        btnPlay.style.background = '';
    }
}

function togglePlaybackRate() {
    currentRateIdx = (currentRateIdx + 1) % playbackRates.length;
    const rate = playbackRates[currentRateIdx];
    video1.playbackRate = rate; video2.playbackRate = rate; btnSpeed.innerText = `${rate}x`;
}

let seeking1 = false;
seekbar1.addEventListener('input', () => {
    seeking1 = true;
    video1.currentTime = seekbar1.value;
    if (currentMode === 'ai') drawTorsionChart();
    updateSeekReadout();
});
seekbar1.addEventListener('change', () => { seeking1 = false; redraw(); });
video1.addEventListener('timeupdate', () => {
    if (!seeking1) seekbar1.value = video1.currentTime;
    if (currentMode === 'ai') drawTorsionChart();
    updateSeekReadout();
});

let seeking2 = false;
seekbar2.addEventListener('input', () => { seeking2 = true; video2.currentTime = seekbar2.value; updateSeekReadout(); });
seekbar2.addEventListener('change', () => { seeking2 = false; redraw(); });
video2.addEventListener('timeupdate', () => { if (!seeking2) seekbar2.value = video2.currentTime; updateSeekReadout(); });

(function setupChartSeek() {
    const chartCvs = document.getElementById('chart-canvas');
    if (!chartCvs) return;
    const seekFromEvent = (e) => {
        if (currentMode !== 'ai' || !video1.duration) return;
        const rect = chartCvs.getBoundingClientRect();
        const t = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const totalFrames = Math.max(1, Math.round(video1.duration * currentFPS));
        const frame = Math.round(t * totalFrames);
        video1.currentTime = Math.min(video1.duration, frame / currentFPS);
        drawTorsionChart();
        updateSeekReadout();
    };
    chartCvs.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        seekFromEvent(e);
        try { chartCvs.setPointerCapture(e.pointerId); } catch (err) {}
    });
    chartCvs.addEventListener('pointermove', (e) => {
        if (e.buttons) seekFromEvent(e);
    });
})();

function stepFrame(dir) {
    const stepSec = dir / currentFPS;
    if (video1 && !isNaN(video1.duration) && video1.duration > 0) {
        video1.currentTime = Math.max(0, Math.min(video1.duration, video1.currentTime + stepSec));
    }
    if (compareMode > 0 && video2 && !isNaN(video2.duration) && video2.duration > 0) {
        video2.currentTime = Math.max(0, Math.min(video2.duration, video2.currentTime + stepSec));
    }
    redraw();
    updateSeekReadout();
}

function formatSeekReadout(video) {
    const t = video && video.currentTime ? video.currentTime : 0;
    const dur = video && video.duration ? video.duration : 0;
    const frame = Math.round(t * currentFPS);
    const total = Math.max(0, Math.round(dur * currentFPS));
    return `${frame} / ${total} Frame · ${t.toFixed(2)}s`;
}

function updateSeekReadout() {
    const a = document.getElementById('seek-readout-1');
    const b = document.getElementById('seek-readout-2');
    if (a) a.textContent = formatSeekReadout(video1);
    if (b) b.textContent = formatSeekReadout(video2);
}

function setHint(text, tone) {
    const el = document.getElementById('hint-banner');
    if (!el) return;
    el.textContent = text;
    el.className = '';
    el.id = 'hint-banner';
    if (tone) el.classList.add('tone-' + tone);
}

function updateHintBanner() {
    const s = state[1];
    if (zoomArmed) {
        setHint('ドラッグで移動 · 🔍 で終了', 'setup');
        return;
    }
    if (!video1.duration) {
        setHint('①動画を選んでください', 'setup');
        return;
    }
    if (currentMode === 'ai') {
        setHint('再生またはコマ送りで解析。肩・股の点をドラッグして補正できます', 'ai');
        return;
    }
    if (currentMode === 'angle') {
        const n = s.points.length;
        setHint(n === 0 ? '1点目をタップ' : n === 1 ? '関節中心（頂点）をタップ' : n === 2 ? '3点目をタップ' : '3点測定中。点をドラッグして微調整できます', 'manual');
        return;
    }
    if (currentMode === 'distance') {
        const n = s.points.length;
        setHint(n === 0 ? '始点をタップ' : n === 1 ? 'コマ送りして2点目をタップ' : '距離・速度を表示中。点をドラッグして微調整できます', 'manual');
        return;
    }
    if (currentMode === 'accel') {
        const n = s.points.length;
        setHint(n === 0 ? '1点目（始点）をタップ' : n === 1 ? 'コマ送りして中間点をタップ' : n === 2 ? 'コマ送りして終点をタップ' : '加速度を表示中', 'manual');
        return;
    }
    if (currentMode === 'cog') {
        if (s.perpPoints.length < 2) setHint('先に「校正・設定」で垂直線を2点タップしてください', 'warn');
        else setHint('コマ送りしながら重心の点をタップ（何点でも可）', 'manual');
        return;
    }
    if (currentMode === 'scale') {
        const n = s.scalePoints.length;
        setHint(n === 0 ? '物差しの1点目をタップ' : n === 1 ? '2点目をタップ' : '位置を微調整したら「長さ確定」', 'setup');
        return;
    }
    if (currentMode === 'perp') {
        const n = s.perpPoints.length;
        setHint(n === 0 ? '垂直線の1点目をタップ' : n === 1 ? '2点目をタップ' : 'スライダーで垂直線を動かせます', 'setup');
        return;
    }
    if (currentMode === 'sim') {
        const n = s.points.length;
        setHint(n === 0 ? '根元をタップ' : n === 1 ? '関節中心をタップ' : n === 2 ? '先端をタップ' : 'スライダーで改善角度を予測', 'manual');
        return;
    }
    setHint('下のタブから操作を選んでください', 'setup');
}

function setMainTab(tab) {
    workspaceTab = tab;
    document.getElementById('tab-ai').className = 'main-tab' + (tab === 'ai' ? ' active-ai' : '');
    document.getElementById('tab-manual').className = 'main-tab' + (tab === 'manual' ? ' active-manual' : '');
    document.getElementById('tab-setup').className = 'main-tab' + (tab === 'setup' ? ' active-setup' : '');
    document.getElementById('manual-sub').classList.toggle('visible', tab === 'manual');
    document.getElementById('setup-sub').classList.toggle('visible', tab === 'setup');
    if (tab === 'ai') setMode('ai');
    else if (tab === 'manual') {
        const m = ['angle', 'distance', 'accel', 'cog'].includes(lastMeasureMode) ? lastMeasureMode : 'angle';
        setMode(m);
    } else {
        const m = ['scale', 'perp', 'sim'].includes(lastSetupMode) ? lastSetupMode : 'scale';
        setMode(m);
    }
}

function toggleZoomUi() {
    zoomArmed = !zoomArmed;
    const fab = document.getElementById('fab-zoom');
    const panel = document.getElementById('zoom-float-panel');
    if (fab) fab.classList.toggle('active', zoomArmed);
    if (panel) panel.style.display = zoomArmed ? 'flex' : 'none';
    document.getElementById('zoom-target-label').innerText = lastActiveTarget === 1 ? '①' : '②';
    document.getElementById('zoom-slider').value = viewState[lastActiveTarget].scale;
    updateHintBanner();
}

function updateDisplayResult() {
    if (btnConfirmScale) {
        const s = state[scaleTarget];
        btnConfirmScale.style.display = (currentMode === 'scale' && s && s.scalePoints.length === 2) ? 'inline-block' : 'none';
    }
    updateHintBanner();
    if (currentMode === 'ai') return;

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
    if (mode === 'zoom') {
        if (!zoomArmed) toggleZoomUi();
        else updateHintBanner();
        return;
    }
    const mainModes = ['angle', 'distance', 'accel', 'sim', 'cog'];
    if (mainModes.includes(mode) && mode !== lastMeasureMode) { state[1].points = []; state[2].points = []; }

    if (mode !== 'ai') { if (mainModes.includes(mode)) lastMeasureMode = mode; currentMode = mode; }
    else { currentMode = mode; }
    if (mode === 'scale' || mode === 'perp' || mode === 'sim') lastSetupMode = mode;

    if (['angle', 'distance', 'accel', 'cog'].includes(mode)) workspaceTab = 'manual';
    else if (['scale', 'perp', 'sim'].includes(mode)) workspaceTab = 'setup';
    else if (mode === 'ai') workspaceTab = 'ai';

    document.getElementById('tab-ai').className = 'main-tab' + (workspaceTab === 'ai' ? ' active-ai' : '');
    document.getElementById('tab-manual').className = 'main-tab' + (workspaceTab === 'manual' ? ' active-manual' : '');
    document.getElementById('tab-setup').className = 'main-tab' + (workspaceTab === 'setup' ? ' active-setup' : '');
    document.getElementById('manual-sub').classList.toggle('visible', workspaceTab === 'manual');
    document.getElementById('setup-sub').classList.toggle('visible', workspaceTab === 'setup');

    document.querySelectorAll('.ctrl-btn.mode-active').forEach(b => b.classList.remove('mode-active'));
    document.getElementById('perp-controls').classList.toggle('visible', mode === 'perp' || mode === 'cog' || state[1].perpPoints.length === 2 || state[2].perpPoints.length === 2);
    document.getElementById('sim-controls').classList.toggle('visible', mode === 'sim');
    const chartPanel = document.getElementById('chart-panel');
    if (chartPanel) chartPanel.classList.toggle('visible', mode === 'ai');

    if (mode === 'ai') {
        document.getElementById('btn-mode-ai').classList.add('mode-active');
        if (!state[1].aiJoints || state[1].aiJoints.length !== 4) {
            mainResult.innerHTML = "AI自動解析";
            subResult.innerHTML = "再生またはコマ送りすると骨格と捻転差が出ます";
        }
        if (video1.readyState >= 2) pose.send({image: video1});
        redraw();
    } else {
        const btnMap = { 'angle': 'btn-mode-angle', 'distance': 'btn-mode-dist', 'accel': 'btn-mode-acc', 'scale': 'btn-mode-scale', 'perp': 'btn-mode-perp', 'sim': 'btn-mode-sim', 'cog': 'btn-mode-cog' };
        if (btnMap[mode]) document.getElementById(btnMap[mode]).classList.add('mode-active');
    }

    if (mode === 'scale') {
        state[1].scalePoints = []; state[2].scalePoints = [];
        state[1].resultMain = "物差し: 基準物の両端をタップ"; state[1].resultSub = "2点のあと、点をドラッグして微調整できます";
        state[2].resultMain = ""; state[2].resultSub = "";
    } else if (mode !== 'ai') {
        [1, 2].forEach(idx => calcResults(state[idx], mode));
    }
    updateDisplayResult();
    updateHintBanner();
    redraw();
}

function clearCurrentPoints() {
    if (currentMode === 'zoom') return;
    if (currentMode === 'ai') {
        state[1].aiOverrides = {};
        state[1].manualOffsets = {};
        state[1].manualKeyframes = {};
        currentTorsionAngle = 0;
        resetMotionTimeline();
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
        document.getElementById('perp-controls').classList.remove('visible');
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
    if (!zoomArmed) return;
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
    if (!zoomArmed) return;
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
            const jointMap = [11, 12, 23, 24];
            for (let i = 0; i < s.aiJoints.length; i++) {
                const idx = jointMap[i];
                if (isJointHidden(s.aiJoints[i]) && !(s.manualOffsets && s.manualOffsets[idx])) continue;
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
    lastActiveTarget = targetIdx;
    if (zoomArmed) {
        if (e.pointerType === 'touch') return;
        isPanningCanvas = true;
        panStartX = e.clientX;
        panStartY = e.clientY;
        panStartOffsetX = viewState[targetIdx].x;
        panStartOffsetY = viewState[targetIdx].y;
        try { cvs.setPointerCapture(e.pointerId); } catch (err) {}
        return;
    }
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
        if (s.perpPoints.length === 2) document.getElementById('perp-controls').classList.add('visible');
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
    if (zoomArmed && isPanningCanvas && draggingPoint === null) {
        const scale = viewState[targetIdx].scale;
        viewState[targetIdx].x = panStartOffsetX + (e.clientX - panStartX) / scale;
        viewState[targetIdx].y = panStartOffsetY + (e.clientY - panStartY) / scale;
        applyZoom(targetIdx);
        return;
    }
    if (!draggingPoint || draggingPoint.targetIdx !== targetIdx) return;
    const s = state[targetIdx], pos = getCanvasCoords(e, cvs);
    const pt = s[draggingPoint.arrayName][draggingPoint.index];
    if (pt) {
        pt.x = pos.x; pt.y = pos.y;
        if (currentMode === 'ai') {
            const currentFrame = Math.round(video1.currentTime * currentFPS);
            const jointMap = [11, 12, 23, 24];
            const landmarkIdx = jointMap[draggingPoint.index];
            const raw = s.limbsLandmarks && s.limbsLandmarks[landmarkIdx];
            if (raw) {
                const off = { x: pos.x - raw.x, y: pos.y - raw.y };
                s.manualOffsets[landmarkIdx] = off;
                setManualKeyframe(s.manualKeyframes, currentFrame, landmarkIdx, off);
            }
            s.aiOverrides[currentFrame] = s.aiJoints.map(j => ({ x: j.x, y: j.y, z: j.z || 0 }));
            calcAiResults('manual');
        } else if (currentMode !== 'scale') {
            calcResults(s, currentMode); updateDisplayResult();
        }
        redraw();
    }
}

function handlePointerUp(e, cvs) {
    isPanningCanvas = false;
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
    btnRecord.innerText = '録画停止';
    btnRecord.classList.add('rec-active');

    drawRecordFrame();
    if (video1.paused) togglePlay();
}

function stopRecording() {
    if (!isRecording) return;
    isRecording = false;
    if (recordAnimId) cancelAnimationFrame(recordAnimId);
    mediaRecorder.stop();
    btnRecord.innerText = '録画';
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
