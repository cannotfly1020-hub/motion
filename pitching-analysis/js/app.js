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
const btnConfirmScale = document.getElementById('btn-confirm-scale');
const btnStepForward = document.getElementById('btnStepForward');
const btnStepBack = document.getElementById('btnStepBack');
const btnTogglePlane = document.getElementById('btnTogglePlane');
const phaseContainer = document.getElementById('phaseContainer');
const dashboardContainer = document.getElementById('dashboardContainer');
const modeGridContainer = document.getElementById('modeGridContainer');

const STEP_SEC = 0.0166;
const playbackRates = [1.0, 0.5, 0.25];
let currentRateIdx = 0;

let isProcessing = false;
let animationFrameId = null;

let currentPlane = 'sagittal';

const planeData = {
    sagittal: {
        videoSrc: null, currentTime: 0.001,
        pxPerCm: null, scalePoints: [], manualReleasePoint: null, manualGroundYNorm: null,
        phases: { fc: null, ff: null, mer: null },
        maxRecordedXFactor: 0, leadLegSide: null, brKneeAngle: null
    },
    frontal: {
        videoSrc: null, currentTime: 0.001,
        phases: { pk: null, fc: null, br: null },
        shoulderElbowAngle: null, trunkTiltFrontal: null, pelvisObliquity: null,
        toeOutAngle: null, kneeValgusAngle: null
    }
};

let isZoomMode = false;
let isScaleMode = false;
let isReleaseMode = false;
let draggingScaleIdx = -1;
let isDraggingRelease = false;
let isDraggingGround = false;

let zoomScale = 1.0;
let panOffsetX = 0, panOffsetY = 0;
let latestLandmarks = null;

let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
const recCanvas = document.createElement('canvas');
const recCtx = recCanvas.getContext('2d');
let recDimensions = { w: 0, h: 0, bannerH: 0 };

window.addEventListener('resize', fitCanvases);

function buildUI() {
    const scaleBadge = document.getElementById('scale-info-text');

    if (currentPlane === 'sagittal') {
        btnTogglePlane.innerText = '➡️ 前額面(正面)へ';
        btnTogglePlane.style.background = '#af52de';
        scaleBadge.style.display = 'inline-block';

        phaseContainer.innerHTML = `
            <button class="phase-btn" id="btnFC" onclick="markPhase('fc')">① FC (接地)</button>
            <button class="phase-btn" id="btnFF" onclick="markPhase('ff')">② FF (完全接地)</button>
            <button class="phase-btn" id="btnMER" onclick="markPhase('mer')">③ MER (最大外旋)</button>
        `;

        modeGridContainer.style.gridTemplateColumns = '1fr 1fr 1fr 1fr';
        modeGridContainer.innerHTML = `
            <button class="ctrl-btn" id="btnModeRelease" onclick="toggleReleaseMode()">⚾️ リリース点</button>
            <button class="ctrl-btn" id="btnModeScale" onclick="toggleScaleMode()">📏 物差し設定</button>
            <button class="ctrl-btn" id="btnModeZoom" onclick="toggleZoomMode()">🔍 ズーム操作</button>
            <button class="ctrl-btn" style="background:#ff3b30;" onclick="clearAllData()">🗑 全消去</button>
        `;

        dashboardContainer.innerHTML = `
            <div class="side-box kinematics">
                <div class="side-title" style="color:#00ffcc;">🎯 投球キネマティクス (横)</div>
                <div class="metric-row"><span>FC足移動幅(歩幅):</span><span id="res_stride" class="metric-val highlight-val">--- cm</span></div>
                <div class="metric-row"><span>MER 肘屈曲角度:</span><span id="res_mer_elbow" class="metric-val" style="color:#ffd60a;">---°</span></div>
                <div class="metric-row"><span>最大 捻転差:</span><span id="res_max_xfactor" class="metric-val">0.0°</span></div>
            </div>
            <div class="side-box kinetics">
                <div class="side-title" style="color:#ff9500;">⚡ 下半身ブロック ＆ リリース</div>
                <div class="metric-row"><span>FF 前足膝角度:</span><span id="res_ff_knee" class="metric-val" style="color:#5e5ce6;">---°</span></div>
                <div class="metric-row"><span>BR 前足膝角度:</span><span id="res_br_knee" class="metric-val" style="color:#ff375f;">---°</span></div>
                <div class="metric-row"><span>リリース地上高:</span><span id="res_release_h" class="metric-val" style="color:#30d158;">--- cm</span></div>
            </div>
        `;
        mainResult.innerText = "投手バイオメカニクス解析 (矢状面/横)";
        subResult.innerText = planeData.sagittal.videoSrc ? "「📏 物差し設定」後、各フェーズ・リリース点を記録してください" : "「動画選択」ボタンから矢状面（横）の動画を選択してください";
    } else {
        btnTogglePlane.innerText = '➡️ 矢状面(横)へ';
        btnTogglePlane.style.background = '#007aff';
        scaleBadge.style.display = 'none';
        btnConfirmScale.style.display = 'none';

        isScaleMode = isReleaseMode = false;

        phaseContainer.innerHTML = `
            <button class="phase-btn" id="btnPK" onclick="markPhase('pk')">① PK (足上げ頂点)</button>
            <button class="phase-btn" id="btnFC" onclick="markPhase('fc')">② FC (接地時)</button>
            <button class="phase-btn" id="btnBR" onclick="markPhase('br')">③ BR (リリース時)</button>
        `;

        modeGridContainer.style.gridTemplateColumns = '1fr 1fr';
        modeGridContainer.innerHTML = `
            <button class="ctrl-btn" id="btnModeZoom" onclick="toggleZoomMode()">🔍 ズーム操作</button>
            <button class="ctrl-btn" style="background:#ff3b30;" onclick="clearAllData()">🗑 全消去</button>
        `;

        dashboardContainer.innerHTML = `
            <div class="side-box kinematics">
                <div class="side-title" style="color:#00ffcc;">🎯 下肢アライメント (正面)</div>
                <div class="metric-row"><span>FC つま先開き角:</span><span id="res_toe_out" class="metric-val highlight-val">---°</span></div>
                <div class="metric-row"><span>FC 膝内外反角度:</span><span id="res_knee_valgus" class="metric-val" style="color:#ffd60a;">---°</span></div>
                <div class="metric-row"><span>FC 骨盤水平傾斜:</span><span id="res_pelvis_tilt" class="metric-val">---°</span></div>
            </div>
            <div class="side-box kinetics">
                <div class="side-title" style="color:#ff9500;">⚡ 腕・体幹アライメント</div>
                <div class="metric-row"><span>BR 肘高(肩-肘線):</span><span id="res_shoulder_elbow" class="metric-val" style="color:#ff375f;">---°</span></div>
                <div class="metric-row"><span>BR 体幹側屈角度:</span><span id="res_trunk_lateral" class="metric-val" style="color:#ff9500;">---°</span></div>
                <div class="metric-row"><span>PK 軸足傾斜:</span><span id="res_pk_tilt" class="metric-val" style="color:#30d158;">---°</span></div>
            </div>
        `;
        mainResult.innerText = "投手バイオメカニクス解析 (前額面/正面)";
        subResult.innerText = planeData.frontal.videoSrc ? "各キーフェーズ（PK・FC・BR）のボタンを押して角度を記録してください" : "「動画選択」ボタンから前額面（正面/背面）の動画を選択してください";
    }
    updateScaleInfo();
    updatePhaseBtnStyles();
    recalcPitchMetrics();
    redrawOverlay();
}

function togglePlaneMode() {
    video.pause();
    btnPlayPause.innerText = '▶ 再生';
    btnPlayPause.style.background = '#34c759';

    if (video.src) {
        planeData[currentPlane].currentTime = video.currentTime;
    }

    currentPlane = (currentPlane === 'sagittal') ? 'frontal' : 'sagittal';
    buildUI();

    const nextTarget = planeData[currentPlane];
    if (nextTarget.videoSrc) {
        video.src = nextTarget.videoSrc;
        video.load();
        const onCanPlay = () => {
            video.removeEventListener('canplay', onCanPlay);
            fitCanvases();
            video.currentTime = nextTarget.currentTime || 0.001;
            loop();
        };
        video.addEventListener('canplay', onCanPlay);
    } else {
        video.removeAttribute('src');
        video.load();
        outCtx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
        intCtx.clearRect(0, 0, interactionCanvas.width, interactionCanvas.height);
        seekSlider.value = 0;
    }
}

function updateScaleInfo() {
    if (currentPlane === 'sagittal') {
        const cur = planeData.sagittal;
        document.getElementById('scale-info-text').innerText = cur.pxPerCm ? `物差し: ${(cur.pxPerCm).toFixed(1)}px/cm` : "物差し: 未設定";
    }
}

function togglePlaybackRate() {
    currentRateIdx = (currentRateIdx + 1) % playbackRates.length;
    video.playbackRate = playbackRates[currentRateIdx];
    document.getElementById('btnSpeed').innerText = `${video.playbackRate}x`;
}

function toggleZoomMode() {
    isZoomMode = !isZoomMode;
    const controls = document.getElementById('zoom-controls');
    if (isZoomMode) {
        isScaleMode = isReleaseMode = false;
        controls.style.display = 'flex';
        mainResult.innerText = "🔍 ズームモード: ピンチ / ドラッグで画面操作";
    } else {
        controls.style.display = 'none';
        buildUI();
    }
    updateButtons();
    redrawOverlay();
}

function toggleScaleMode() {
    if (currentPlane !== 'sagittal') return;
    isScaleMode = !isScaleMode;
    if (isScaleMode) {
        isZoomMode = isReleaseMode = false;
        document.getElementById('zoom-controls').style.display = 'none';
        mainResult.innerText = "📏 物差し: 基準の2点をタップ（ドラッグで微調整）";
        subResult.innerText = "位置確定後、右上の「長さ確定」ボタンを押してください";
    } else {
        buildUI();
    }
    updateButtons();
    redrawOverlay();
}

function toggleReleaseMode() {
    if (currentPlane !== 'sagittal') return;
    const cur = planeData.sagittal;
    if (isReleaseMode) {
        cur.manualReleasePoint = null;
        cur.manualGroundYNorm = null;
        cur.brKneeAngle = null;
        isReleaseMode = false;
        mainResult.innerText = "⚾️ リリース点を解除しました";
    } else {
        isReleaseMode = true;
        isZoomMode = isScaleMode = false;
        document.getElementById('zoom-controls').style.display = 'none';
        mainResult.innerText = "⚾️ リリース点: ボールを離した瞬間をタップ";
        subResult.innerText = "上の点(リリース)と下の緑の横線(地面)をドラッグして正確な高さを測ります";
    }
    updateButtons();
    recalcPitchMetrics();
    redrawOverlay();
}

function updateButtons() {
    const btnZoom = document.getElementById('btnModeZoom');
    if (btnZoom) btnZoom.classList.toggle('mode-active', isZoomMode);

    if (currentPlane === 'sagittal') {
        const cur = planeData.sagittal;
        const btnScale = document.getElementById('btnModeScale');
        const btnRel = document.getElementById('btnModeRelease');
        if (btnScale) btnScale.classList.toggle('mode-active', isScaleMode);
        if (btnRel) btnRel.classList.toggle('mode-active', isReleaseMode);
        btnConfirmScale.style.display = (isScaleMode && cur.scalePoints.length === 2) ? 'inline-block' : 'none';
    }
}

function resetZoom() {
    zoomScale = 1.0; panOffsetX = 0; panOffsetY = 0;
    document.getElementById('zoom-slider').value = 1.0;
    applyZoom();
    redrawOverlay();
}
document.getElementById('zoom-slider').addEventListener('input', (e) => {
    zoomScale = parseFloat(e.target.value);
    applyZoom();
    redrawOverlay();
});

function getCanvasPoint(e) {
    const rect = interactionCanvas.getBoundingClientRect();
    const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
    return {
        x: (clientX - rect.left) * (interactionCanvas.width / rect.width),
        y: (clientY - rect.top) * (interactionCanvas.height / rect.height)
    };
}

let isTouchPanning = false;
let panStartX = 0, panStartY = 0;
let initialPinchDist = 0, initialPinchScale = 1.0;

const stage = document.getElementById('stage');

stage.addEventListener('touchstart', (e) => {
    if (isScaleMode || isReleaseMode) return;
    if (e.touches.length === 1) {
        isTouchPanning = true;
        panStartX = e.touches[0].clientX - panOffsetX;
        panStartY = e.touches[0].clientY - panOffsetY;
    } else if (e.touches.length === 2) {
        isTouchPanning = false;
        e.preventDefault();
        initialPinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        initialPinchScale = zoomScale;
    }
}, { passive: false });

stage.addEventListener('touchmove', (e) => {
    if (isScaleMode || isReleaseMode) return;
    if (isTouchPanning && e.touches.length === 1 && zoomScale > 1.0) {
        panOffsetX = e.touches[0].clientX - panStartX;
        panOffsetY = e.touches[0].clientY - panStartY;
        applyZoom();
    } else if (e.touches.length === 2) {
        e.preventDefault();
        const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        zoomScale = Math.max(1.0, Math.min(4.0, initialPinchScale * (dist / initialPinchDist)));
        document.getElementById('zoom-slider').value = zoomScale;
        applyZoom();
        redrawOverlay();
    }
}, { passive: false });

stage.addEventListener('touchend', (e) => {
    if (e.touches.length === 0) isTouchPanning = false;
});

interactionCanvas.addEventListener('pointerdown', (e) => {
    if (currentPlane !== 'sagittal') return;
    const pt = getCanvasPoint(e);
    const box = getVideoRenderBox();
    const cur = planeData.sagittal;

    if (isReleaseMode || cur.manualReleasePoint) {
        if (cur.manualReleasePoint && cur.manualGroundYNorm !== null) {
            const curRelPx = { x: box.x + cur.manualReleasePoint.x * box.w, y: box.y + cur.manualReleasePoint.y * box.h };
            const curGndPxY = box.y + cur.manualGroundYNorm * box.h;

            if (Math.hypot(curRelPx.x - pt.x, curRelPx.y - pt.y) * zoomScale < 35) {
                isDraggingRelease = true;
                try { interactionCanvas.setPointerCapture(e.pointerId); } catch(err){}
                return;
            }
            if (Math.abs(curGndPxY - pt.y) * zoomScale < 35 && Math.abs(curRelPx.x - pt.x) * zoomScale < 70) {
                isDraggingGround = true;
                try { interactionCanvas.setPointerCapture(e.pointerId); } catch(err){}
                return;
            }
        }
        if (isReleaseMode) {
            cur.manualReleasePoint = {
                x: Math.max(0, Math.min(1.0, (pt.x - box.x) / box.w)),
                y: Math.max(0, Math.min(1.0, (pt.y - box.y) / box.h))
            };
            cur.manualGroundYNorm = (cur.phases.fc && cur.phases.fc.groundYNorm) ? cur.phases.fc.groundYNorm : 0.95;
            isDraggingRelease = true;
            try { interactionCanvas.setPointerCapture(e.pointerId); } catch(err){}

            cur.brKneeAngle = calcCurrentLeadKneeAngle(latestLandmarks, box);

            recalcPitchMetrics();
            redrawOverlay();
            return;
        }
    }

    if (isScaleMode) {
        let hitIndex = -1;
        for (let i = 0; i < cur.scalePoints.length; i++) {
            if (Math.hypot(cur.scalePoints[i].x - pt.x, cur.scalePoints[i].y - pt.y) * zoomScale < 20) {
                hitIndex = i;
                break;
            }
        }

        if (hitIndex !== -1) {
            draggingScaleIdx = hitIndex;
            try { interactionCanvas.setPointerCapture(e.pointerId); } catch(err){}
        } else {
            if (cur.scalePoints.length < 2) {
                cur.scalePoints.push(pt);
            } else {
                cur.scalePoints = [pt];
            }
            updateButtons();
            redrawOverlay();
        }
    }
});

interactionCanvas.addEventListener('pointermove', (e) => {
    if (currentPlane !== 'sagittal') return;
    const pt = getCanvasPoint(e);
    const box = getVideoRenderBox();
    const cur = planeData.sagittal;

    if (isDraggingRelease && cur.manualReleasePoint) {
        cur.manualReleasePoint = {
            x: Math.max(0, Math.min(1.0, (pt.x - box.x) / box.w)),
            y: Math.max(0, Math.min(1.0, (pt.y - box.y) / box.h))
        };
        recalcPitchMetrics();
        redrawOverlay();
        return;
    }

    if (isDraggingGround && cur.manualGroundYNorm !== null) {
        cur.manualGroundYNorm = Math.max(0, Math.min(1.0, (pt.y - box.y) / box.h));
        recalcPitchMetrics();
        redrawOverlay();
        return;
    }

    if (isScaleMode && draggingScaleIdx !== -1) {
        cur.scalePoints[draggingScaleIdx] = pt;
        redrawOverlay();
    }
});

interactionCanvas.addEventListener('pointerup', (e) => {
    if (currentPlane !== 'sagittal') return;
    if (isDraggingRelease) {
        isDraggingRelease = false;
        try { interactionCanvas.releasePointerCapture(e.pointerId); } catch(err){}
    }
    if (isDraggingGround) {
        isDraggingGround = false;
        try { interactionCanvas.releasePointerCapture(e.pointerId); } catch(err){}
    }
    if (draggingScaleIdx !== -1) {
        draggingScaleIdx = -1;
        try { interactionCanvas.releasePointerCapture(e.pointerId); } catch(err){}
        redrawOverlay();
    }
});

function openScaleModal() {
    if (currentPlane !== 'sagittal') return;
    const cur = planeData.sagittal;
    if (cur.scalePoints.length !== 2) return;
    document.getElementById('scale-modal-overlay').style.display = 'flex';
    document.getElementById('scale-input-value').focus();
}
function closeScaleModal() {
    document.getElementById('scale-modal-overlay').style.display = 'none';
}

function submitScaleModal() {
    if (currentPlane !== 'sagittal') return;
    const cur = planeData.sagittal;
    const realCm = parseFloat(document.getElementById('scale-input-value').value);
    if (realCm && realCm > 0 && cur.scalePoints.length === 2) {
        const box = getVideoRenderBox();
        const normP1 = { x: (cur.scalePoints[0].x - box.x) / box.w, y: (cur.scalePoints[0].y - box.y) / box.h };
        const normP2 = { x: (cur.scalePoints[1].x - box.x) / box.w, y: (cur.scalePoints[1].y - box.y) / box.h };
        const distPx = Math.hypot((normP2.x - normP1.x) * box.w, (normP2.y - normP1.y) * box.h);

        cur.pxPerCm = distPx / realCm;
        updateScaleInfo();
        closeScaleModal();
        isScaleMode = false;
        updateButtons();
        mainResult.innerHTML = "<span style='color:#30d158;'>✅ 物差し設定完了</span>";
        recalcPitchMetrics();
        redrawOverlay();
    } else {
        alert("有効な数値を入力してください");
    }
}

function updatePhaseBtnStyles() {
    const cur = planeData[currentPlane];
    if (currentPlane === 'sagittal') {
        document.getElementById('btnFC').className = `phase-btn ${cur.phases.fc ? 'active-fc' : ''}`;
        document.getElementById('btnFF').className = `phase-btn ${cur.phases.ff ? 'active-ff' : ''}`;
        document.getElementById('btnMER').className = `phase-btn ${cur.phases.mer ? 'active-mer' : ''}`;
    } else {
        document.getElementById('btnPK').className = `phase-btn ${cur.phases.pk ? 'active-pk' : ''}`;
        document.getElementById('btnFC').className = `phase-btn ${cur.phases.fc ? 'active-fc' : ''}`;
        document.getElementById('btnBR').className = `phase-btn ${cur.phases.br ? 'active-br' : ''}`;
    }
}

function clearAllData() {
    isScaleMode = isReleaseMode = isZoomMode = false;
    document.getElementById('zoom-controls').style.display = 'none';

    if (currentPlane === 'sagittal') {
        const cur = planeData.sagittal;
        cur.phases = { fc: null, ff: null, mer: null };
        cur.maxRecordedXFactor = 0;
        cur.leadLegSide = null;
        cur.brKneeAngle = null;
        cur.manualReleasePoint = null;
        cur.manualGroundYNorm = null;
        cur.scalePoints = [];
        cur.pxPerCm = null;
    } else {
        const cur = planeData.frontal;
        cur.phases = { pk: null, fc: null, br: null };
        cur.shoulderElbowAngle = null;
        cur.trunkTiltFrontal = null;
        cur.pelvisObliquity = null;
        cur.toeOutAngle = null;
        cur.kneeValgusAngle = null;
    }

    buildUI();
    mainResult.innerText = `データを消去しました (${currentPlane === 'sagittal' ? '矢状面' : '前額面'})`;
}

function closeSnapshotModal() {
    document.getElementById('snapshot-modal-overlay').style.display = 'none';
}

function generateComprehensiveReportCard() {
    const s = planeData.sagittal;
    const f = planeData.frontal;

    const repCanvas = document.createElement('canvas');
    const repCtx = repCanvas.getContext('2d');

    repCanvas.width = 750;
    repCanvas.height = 960;

    repCtx.fillStyle = '#1c1c1e';
    repCtx.fillRect(0, 0, repCanvas.width, repCanvas.height);

    repCtx.fillStyle = '#2c2c2e';
    repCtx.fillRect(0, 0, repCanvas.width, 90);
    repCtx.fillStyle = '#00ffcc';
    repCtx.font = 'bold 26px sans-serif';
    repCtx.fillText('⚾️ 投球バイオメカニクス解析レポート', 25, 42);
    repCtx.fillStyle = '#8e8e93';
    repCtx.font = '14px sans-serif';
    repCtx.fillText(`発行日: ${new Date().toLocaleDateString('ja-JP')} ｜ 動作分析Pro`, 25, 72);

    const snapW = 700;
    const snapH = 340;
    repCtx.fillStyle = '#000';
    repCtx.fillRect(25, 105, snapW, snapH);

    if (video.videoWidth) {
        // レポート用も画面そのままの100%比率を描画
        const box = getVideoRenderBox();
        const videoRatio = video.videoWidth / video.videoHeight;
        let dw = snapW, dh = snapW / videoRatio;
        if (dh > snapH) { dh = snapH; dw = snapH * videoRatio; }
        const dx = 25 + (snapW - dw) / 2;
        const dy = 105 + (snapH - dh) / 2;

        repCtx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, dx, dy, dw, dh);
        if (box.w > 0 && box.h > 0) {
            repCtx.drawImage(outputCanvas, box.x, box.y, box.w, box.h, dx, dy, dw, dh);
            repCtx.drawImage(interactionCanvas, box.x, box.y, box.w, box.h, dx, dy, dw, dh);
        }
    } else {
        repCtx.fillStyle = '#444';
        repCtx.font = 'bold 18px sans-serif';
        repCtx.textAlign = 'center';
        repCtx.fillText('動画未選択', 375, 275);
        repCtx.textAlign = 'left';
    }

    repCtx.strokeStyle = '#3a3a3c';
    repCtx.lineWidth = 2;
    repCtx.strokeRect(25, 105, snapW, snapH);

    const drawSection = (title, color, items, startY) => {
        repCtx.fillStyle = color;
        repCtx.font = 'bold 18px sans-serif';
        repCtx.fillText(title, 25, startY);

        repCtx.fillStyle = '#262629';
        repCtx.fillRect(25, startY + 10, snapW, 160);
        repCtx.strokeStyle = '#3a3a3c';
        repCtx.strokeRect(25, startY + 10, snapW, 160);

        items.forEach((item, idx) => {
            const col = idx % 2;
            const row = Math.floor(idx / 2);
            const x = 45 + col * 340;
            const y = startY + 45 + row * 40;

            repCtx.fillStyle = '#aaa';
            repCtx.font = '14px sans-serif';
            repCtx.fillText(item.label, x, y);

            repCtx.fillStyle = item.highlight ? '#00ffcc' : '#fff';
            repCtx.font = 'bold 16px monospace';
            repCtx.fillText(item.val, x + 200, y);
        });
    };

    const box = getVideoRenderBox();
    const stride = (s.phases.fc && s.phases.fc.stridePx && s.pxPerCm) ? `${(s.phases.fc.stridePx / s.pxPerCm).toFixed(1)} cm` : "--- cm";
    const merElbow = (s.phases.mer && s.phases.mer.elbowAngle) ? `${s.phases.mer.elbowAngle.toFixed(1)}°` : "---°";
    const xFactor = s.maxRecordedXFactor > 0 ? `${s.maxRecordedXFactor.toFixed(1)}°` : "0.0°";
    const ffKnee = (s.phases.ff && s.phases.ff.kneeAngle) ? `${s.phases.ff.kneeAngle.toFixed(1)}°` : "---°";
    const brKnee = s.brKneeAngle !== null ? `${s.brKneeAngle.toFixed(1)}°` : "---°";

    let relH = "--- cm";
    if (s.manualReleasePoint && s.manualGroundYNorm !== null && s.pxPerCm) {
        const wristY = box.y + s.manualReleasePoint.y * box.h;
        const groundY = box.y + s.manualGroundYNorm * box.h;
        relH = `${Math.max(0, (groundY - wristY) / s.pxPerCm).toFixed(1)} cm`;
    }

    const toeOut = f.toeOutAngle !== null ? `${f.toeOutAngle.toFixed(1)}°` : "---°";
    const valgus = f.kneeValgusAngle !== null ? `${f.kneeValgusAngle.toFixed(1)}°` : "---°";
    const pelvis = f.pelvisObliquity !== null ? `${f.pelvisObliquity.toFixed(1)}°` : "---°";
    const shEl = f.shoulderElbowAngle !== null ? `${f.shoulderElbowAngle.toFixed(1)}°` : "---°";
    const trunk = f.trunkTiltFrontal !== null ? `${f.trunkTiltFrontal.toFixed(1)}°` : "---°";
    const pkTilt = (f.phases.pk && f.phases.pk.tilt !== undefined) ? `${f.phases.pk.tilt.toFixed(1)}°` : "---°";

    drawSection('🎯 矢状面（横アングル）', '#00ffcc', [
        { label: 'FC 足移動幅 (歩幅):', val: stride, highlight: true },
        { label: 'FF 前足膝角度:', val: ffKnee },
        { label: 'MER 肘屈曲角度:', val: merElbow },
        { label: 'BR 前足膝角度:', val: brKnee },
        { label: '最大 捻転差:', val: xFactor },
        { label: 'リリース地上高:', val: relH }
    ], 480);

    drawSection('⚡ 前額面（正面/背面アングル）', '#ff9500', [
        { label: 'FC つま先開き角:', val: toeOut, highlight: true },
        { label: 'BR 肘高(肩-肘線):', val: shEl },
        { label: 'FC 膝内外反角度:', val: valgus },
        { label: 'BR 体幹側屈角度:', val: trunk },
        { label: 'FC 骨盤水平傾斜:', val: pelvis },
        { label: 'PK 軸足傾斜:', val: pkTilt }
    ], 700);

    repCtx.fillStyle = '#666';
    repCtx.font = '12px sans-serif';
    repCtx.textAlign = 'center';
    repCtx.fillText('Generated by 投球動作分析Pro - Baseball Biomechanics Analysis', 375, 935);
    repCtx.textAlign = 'left';

    document.getElementById('snapshot-modal-title').innerText = '📊 全体解析レポート';
    document.getElementById('snapshot-img').src = repCanvas.toDataURL('image/png');
    document.getElementById('snapshot-modal-overlay').style.display = 'flex';
}

function updateSeekBar() { if (video.duration) seekSlider.value = (video.currentTime / video.duration) * 100; }
seekSlider.addEventListener('input', () => { if (video.duration) { video.pause(); btnPlayPause.innerText = '▶ 再生'; video.currentTime = (seekSlider.value / 100) * video.duration; } });

video.addEventListener('seeked', () => {
    if (video.paused) { updateSeekBar(); renderCurrentFrame(); }
});

video.addEventListener('ended', () => {
    btnPlayPause.innerText = '▶ 再生';
    btnPlayPause.style.background = '#34c759';
    if (isRecording) toggleRecording();
});

btnPlayPause.addEventListener('click', async () => {
    if (!video.src || video.readyState < 2) return;
    if (video.paused) {
        try { await video.play(); btnPlayPause.innerText = '⏸ 停止'; btnPlayPause.style.background = '#ff9500'; } catch (e) {}
    } else {
        video.pause(); btnPlayPause.innerText = '▶ 再生'; btnPlayPause.style.background = '#34c759';
    }
});

btnStepForward.addEventListener('click', () => {
    if (!video.src) return;
    video.pause(); btnPlayPause.innerText = '▶ 再生'; btnPlayPause.style.background = '#34c759';
    video.currentTime = Math.min(video.duration, video.currentTime + STEP_SEC);
});
btnStepBack.addEventListener('click', () => {
    if (!video.src) return;
    video.pause(); btnPlayPause.innerText = '▶ 再生'; btnPlayPause.style.background = '#34c759';
    video.currentTime = Math.max(0, video.currentTime - STEP_SEC);
});

function captureSnapshot() {
    if (!video.videoWidth) { alert("動画が読み込まれていません"); return; }
    const box = getVideoRenderBox();
    const snapCanvas = document.createElement('canvas'), snapCtx = snapCanvas.getContext('2d');

    // スナップショットも動画本来の比率を100%継承する
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    let targetW = vw;
    let targetH = vh;

    const maxDim = 1280;
    if (targetW > maxDim || targetH > maxDim) {
        if (targetW > targetH) {
            targetH = Math.round((targetH * maxDim) / targetW);
            targetW = maxDim;
        } else {
            targetW = Math.round((targetW * maxDim) / targetH);
            targetH = maxDim;
        }
    }
    const bannerH = Math.round(targetH * 0.12);

    snapCanvas.width = targetW;
    snapCanvas.height = targetH + bannerH;

    snapCtx.fillStyle = '#000';
    snapCtx.fillRect(0, 0, snapCanvas.width, snapCanvas.height);
    snapCtx.drawImage(video, 0, 0, targetW, targetH);

    if (box.w > 0 && box.h > 0) {
        snapCtx.drawImage(outputCanvas, box.x, box.y, box.w, box.h, 0, 0, targetW, targetH);
        snapCtx.drawImage(interactionCanvas, box.x, box.y, box.w, box.h, 0, 0, targetW, targetH);
    }

    snapCtx.fillStyle = '#1c1c1e'; snapCtx.fillRect(0, targetH, targetW, bannerH);

    const fontSize1 = Math.max(14, Math.round(targetH * 0.024));
    const fontSize2 = Math.max(12, Math.round(targetH * 0.021));

    snapCtx.fillStyle = '#00ffcc'; snapCtx.font = `bold ${fontSize1}px sans-serif`;
    snapCtx.fillText(mainResult.innerText, Math.round(targetW * 0.03), targetH + Math.round(bannerH * 0.42));

    snapCtx.fillStyle = '#ff9500'; snapCtx.font = `bold ${fontSize2}px sans-serif`;
    if (currentPlane === 'sagittal') {
        snapCtx.fillText(`リリース高: ${document.getElementById('res_release_h').innerText}`, Math.round(targetW * 0.03), targetH + Math.round(bannerH * 0.82));
    } else {
        snapCtx.fillText(`つま先角: ${document.getElementById('res_toe_out').innerText} ｜ 肘高: ${document.getElementById('res_shoulder_elbow').innerText}`, Math.round(targetW * 0.03), targetH + Math.round(bannerH * 0.82));
    }

    document.getElementById('snapshot-modal-title').innerText = '📸 キャプチャ';
    document.getElementById('snapshot-img').src = snapCanvas.toDataURL('image/png');
    document.getElementById('snapshot-modal-overlay').style.display = 'flex';
}

function toggleRecording() {
    if (!video.videoWidth) { alert("動画が読み込まれていません"); return; }
    const btn = document.getElementById('btnRecord');

    if (!isRecording) {
        recordedChunks = [];

        // 録画キャンバスを動画本体のネイティブ解像度に完全同期
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        const maxDim = 1280;
        let targetW = vw;
        let targetH = vh;

        if (targetW > maxDim || targetH > maxDim) {
            if (targetW > targetH) {
                targetH = Math.round((targetH * maxDim) / targetW);
                targetW = maxDim;
            } else {
                targetW = Math.round((targetW * maxDim) / targetH);
                targetH = maxDim;
            }
        }

        targetW = Math.floor(targetW / 2) * 2;
        targetH = Math.floor(targetH / 2) * 2;
        const bannerH = Math.floor(Math.round(targetH * 0.12) / 2) * 2;

        recCanvas.width = targetW;
        recCanvas.height = targetH + bannerH;

        // 初回フレーム
        recCtx.fillStyle = '#000';
        recCtx.fillRect(0, 0, recCanvas.width, recCanvas.height);
        recCtx.drawImage(video, 0, 0, targetW, targetH);

        const box = getVideoRenderBox();
        if (box.w > 0 && box.h > 0) {
            recCtx.drawImage(outputCanvas, box.x, box.y, box.w, box.h, 0, 0, targetW, targetH);
            recCtx.drawImage(interactionCanvas, box.x, box.y, box.w, box.h, 0, 0, targetW, targetH);
        }

        const stream = recCanvas.captureStream(30);

        const types = [
            'video/mp4;codecs=avc1',
            'video/mp4',
            'video/webm;codecs=vp9',
            'video/webm;codecs=vp8',
            'video/webm'
        ];
        let chosenMime = '';
        for (const t of types) {
            if (MediaRecorder.isTypeSupported(t)) {
                chosenMime = t;
                break;
            }
        }

        try {
            mediaRecorder = chosenMime ? new MediaRecorder(stream, { mimeType: chosenMime }) : new MediaRecorder(stream);
        } catch (e) {
            mediaRecorder = new MediaRecorder(stream);
        }

        mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) recordedChunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
            const finalMime = mediaRecorder.mimeType || chosenMime || 'video/mp4';
            const isWebm = finalMime.includes('webm');
            const blob = new Blob(recordedChunks, { type: finalMime });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `Pitching_${currentPlane}_${Date.now()}.${isWebm ? 'webm' : 'mp4'}`;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 500);
        };

        mediaRecorder.start(100);
        isRecording = true;
        btn.innerText = "⏹ 録画停止";
        btn.classList.add('rec-active');

        if (video.paused) {
            video.play().catch(()=>{});
            btnPlayPause.innerText = '⏸ 停止';
            btnPlayPause.style.background = '#ff9500';
        }
    } else {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
        isRecording = false;
        btn.innerText = "🎥 録画開始";
        btn.classList.remove('rec-active');
    }
}

// ファイル読み込み処理
document.getElementById('inputFile').addEventListener('change', (e) => {
    const file = e.target.files[0]; if (!file) return;
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    video.pause(); resetZoom();

    const objUrl = URL.createObjectURL(file);
    planeData[currentPlane].videoSrc = objUrl;
    planeData[currentPlane].currentTime = 0.001;

    video.src = objUrl;
    video.load();
    const onCanPlay = () => {
        video.removeEventListener('canplay', onCanPlay);
        fitCanvases(); btnPlayPause.innerText = '▶ 再生';
        video.currentTime = 0.001; loop();
    };
    video.addEventListener('canplay', onCanPlay);
    e.target.value = '';
    buildUI();
});

buildUI();
