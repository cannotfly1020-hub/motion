let currentMode = 'split';
let currentTouchMode = 'zoom';

let targetRoiA = null;
let targetRoiB = null;

const selectedOverlays = new Set(['r_knee']);
const selectedTrails = new Set(['headTop', 'chin', 'trunkCenter']);

const createTrailBuffer = () => ({
  headTop: [], chin: [], trunkCenter: [],
  rShoulder: [], lShoulder: [], rElbow: [], lElbow: [], rWrist: [], lWrist: [],
  rHip: [], lHip: [], rKnee: [], lKnee: [], rAnkle: [], lAnkle: []
});

const trailsA = createTrailBuffer();
const trailsB = createTrailBuffer();

const manualOffsetsA = {};
const manualOffsetsB = {};

let lastLandmarksA = null;
let lastLandmarksB = null;

const trailColors = {
  headTop: "#00f0ff", chin: "#ff3399", trunkCenter: "#51cf66",
  rShoulder: "#ff6b6b", lShoulder: "#339af0", rElbow: "#f76707", lElbow: "#22b8cf",
  rWrist: "#ff922b", lWrist: "#20c997", rHip: "#e8590c", lHip: "#4263eb",
  rKnee: "#fcc419", lKnee: "#748ffc", rAnkle: "#ffd43b", lAnkle: "#94d82d"
};

let isPoseA_Busy = false;
let isPoseB_Busy = false;
let animFrameId = null;

let urlA = null;
let urlB = null;

const mainViewport = document.getElementById('mainViewport');
const paneA = document.getElementById('paneA');
const paneB = document.getElementById('paneB');
const btnModeSingle = document.getElementById('btnModeSingle');
const btnModeSplit = document.getElementById('btnModeSplit');
const btnModeOverlay = document.getElementById('btnModeOverlay');
const btnTouchModeZoom = document.getElementById('btnTouchModeZoom');
const btnTouchModeEdit = document.getElementById('btnTouchModeEdit');
const btnTouchModeTarget = document.getElementById('btnTouchModeTarget');

const rowSeekB = document.getElementById('rowSeekB');
const togglePanelBtn = document.getElementById('togglePanelBtn');
const dataPanel = document.getElementById('dataPanel');

const videoA = document.getElementById('videoA');
const canvasA = document.getElementById('canvasA');
const ctxA = canvasA.getContext('2d');
const seekBarA = document.getElementById('seekBarA');
const timeDisplayA = document.getElementById('timeDisplayA');
const btnPrevA = document.getElementById('btnPrevA');
const btnNextA = document.getElementById('btnNextA');
const uploaderA = document.getElementById('uploaderA');

const videoB = document.getElementById('videoB');
const canvasB = document.getElementById('canvasB');
const ctxB = canvasB.getContext('2d');
const seekBarB = document.getElementById('seekBarB');
const timeDisplayB = document.getElementById('timeDisplayB');
const btnPrevB = document.getElementById('btnPrevB');
const btnNextB = document.getElementById('btnNextB');
const uploaderB = document.getElementById('uploaderB');

const btnSyncPlay = document.getElementById('btnSyncPlay');
const btnResetAdjust = document.getElementById('btnResetAdjust');
const btnClearTrail = document.getElementById('btnClearTrail');
const tabAngle = document.getElementById('tabAngle');
const tabTrail = document.getElementById('tabTrail');
const angleChipsRow = document.getElementById('angleChipsRow');
const trailChipsRow = document.getElementById('trailChipsRow');

function setTouchMode(mode) {
  currentTouchMode = mode;
  btnTouchModeZoom.classList.toggle('active', mode === 'zoom');
  btnTouchModeEdit.classList.toggle('active', mode === 'edit');
  btnTouchModeTarget.classList.toggle('active', mode === 'target');
}

btnTouchModeZoom.addEventListener('click', () => setTouchMode('zoom'));
btnTouchModeEdit.addEventListener('click', () => setTouchMode('edit'));
btnTouchModeTarget.addEventListener('click', () => setTouchMode('target'));

function getNormalizedVideoCoord(clientX, clientY, pane, canvas, scale, panX, panY) {
  const paneRect = pane.getBoundingClientRect();
  const localX = clientX - paneRect.left;
  const localY = clientY - paneRect.top;

  const paneW = paneRect.width;
  const paneH = paneRect.height;
  if (paneW === 0 || paneH === 0 || !canvas.width || !canvas.height) return { normX: 0, normY: 0 };

  const centerX = paneW / 2;
  const centerY = paneH / 2;
  const unscaledX = (localX - centerX - panX) / scale + centerX;
  const unscaledY = (localY - centerY - panY) / scale + centerY;

  const canvasAspect = canvas.width / canvas.height;
  const paneAspect = paneW / paneH;

  let drawW, drawH, drawX, drawY;
  if (paneAspect > canvasAspect) {
    drawH = paneH;
    drawW = paneH * canvasAspect;
    drawX = (paneW - drawW) / 2;
    drawY = 0;
  } else {
    drawW = paneW;
    drawH = paneW / canvasAspect;
    drawX = 0;
    drawY = (paneH - drawH) / 2;
  }

  return {
    normX: (unscaledX - drawX) / drawW,
    normY: (unscaledY - drawY) / drawH
  };
}

function setupInteractions(pane, canvas, offsets, getLmFunc, drawCallback, isPaneA) {
  let scale = 1.0;
  let panX = 0, panY = 0;
  let startDist = 0;
  let initialScale = 1.0;
  let isPanning = false;
  let startX = 0, startY = 0;
  let lastTapTime = 0;
  let draggingLandmarkIdx = null;

  function updateTransform() {
    canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  }

  function handleStart(e) {
    if (e.touches && e.touches.length === 2) {
      isPanning = false;
      draggingLandmarkIdx = null;
      startDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      initialScale = scale;
      return;
    }

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    if (currentTouchMode === 'target') {
      const { normX, normY } = getNormalizedVideoCoord(clientX, clientY, pane, canvas, scale, panX, panY);
      if (normX >= 0 && normX <= 1 && normY >= 0 && normY <= 1) {
        const newRoi = { cx: normX, cy: normY, boxSize: 0.65 };
        if (isPaneA) {
          targetRoiA = newRoi;
          triggerPoseA();
        } else {
          targetRoiB = newRoi;
          triggerPoseB();
        }
        setTouchMode('zoom');
      }
      return;
    }

    if (currentTouchMode === 'edit') {
      const { normX, normY } = getNormalizedVideoCoord(clientX, clientY, pane, canvas, scale, panX, panY);
      const lm = getLmFunc();

      if (lm) {
        const minD = 0.07 / Math.sqrt(scale);
        let targetIdx = null;
        let closestDist = minD;

        for (let i = 0; i < lm.length; i++) {
          if (!lm[i] || lm[i].visibility < 0.2) continue;
          const off = offsets[i] || { x: 0, y: 0 };
          const curX = lm[i].x + off.x;
          const curY = lm[i].y + off.y;
          const d = Math.hypot(curX - normX, curY - normY);
          if (d < closestDist) {
            closestDist = d;
            targetIdx = i;
          }
        }

        if (targetIdx !== null) {
          draggingLandmarkIdx = targetIdx;
          return;
        }
      }
      return;
    }

    if (currentTouchMode === 'zoom') {
      const now = Date.now();
      if (now - lastTapTime < 300) {
        scale = 1.0; panX = 0; panY = 0;
        updateTransform();
        lastTapTime = 0;
        return;
      }
      lastTapTime = now;

      isPanning = true;
      startX = clientX - panX;
      startY = clientY - panY;
    }
  }

  function handleMove(e) {
    if (e.touches && e.touches.length === 2) {
      e.preventDefault();
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      if (startDist > 0) {
        scale = Math.min(Math.max(1.0, initialScale * (dist / startDist)), 6.0);
        updateTransform();
      }
      return;
    }

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    if (draggingLandmarkIdx !== null && currentTouchMode === 'edit') {
      e.preventDefault();
      const { normX, normY } = getNormalizedVideoCoord(clientX, clientY, pane, canvas, scale, panX, panY);
      const lm = getLmFunc();
      if (lm && lm[draggingLandmarkIdx]) {
        const orig = lm[draggingLandmarkIdx];
        offsets[draggingLandmarkIdx] = {
          x: normX - orig.x,
          y: normY - orig.y
        };
        drawCallback();
      }
      return;
    }

    if (isPanning && scale > 1.0 && currentTouchMode === 'zoom') {
      e.preventDefault();
      panX = clientX - startX;
      panY = clientY - startY;
      updateTransform();
    }
  }

  function handleEnd(e) {
    if (e.touches && e.touches.length < 2) startDist = 0;
    if (!e.touches || e.touches.length === 0) {
      draggingLandmarkIdx = null;
      isPanning = false;
    }
  }

  pane.addEventListener('touchstart', handleStart, { passive: false });
  pane.addEventListener('touchmove', handleMove, { passive: false });
  pane.addEventListener('touchend', handleEnd);
  pane.addEventListener('mousedown', handleStart);
  window.addEventListener('mousemove', handleMove);
  window.addEventListener('mouseup', handleEnd);
}

setupInteractions(paneA, canvasA, manualOffsetsA, () => lastLandmarksA, () => {
  drawFrame(canvasA, ctxA, videoA, lastLandmarksA, trailsA, "#00e5ff", "A", manualOffsetsA, targetRoiA);
}, true);

setupInteractions(paneB, canvasB, manualOffsetsB, () => lastLandmarksB, () => {
  drawFrame(canvasB, ctxB, videoB, lastLandmarksB, trailsB, currentMode === 'overlay' ? "#ff922b" : "#00e5ff", "B", manualOffsetsB, targetRoiB);
}, false);

togglePanelBtn.addEventListener('click', () => {
  dataPanel.classList.toggle('collapsed');
  document.getElementById('collapseIcon').innerText = dataPanel.classList.contains('collapsed') ? '▲ タップで開く' : '▼ タップで閉じる';
});

function setMode(mode) {
  currentMode = mode;
  mainViewport.className = `compare-viewport mode-${mode}`;
  btnModeSingle.classList.toggle('active', mode === 'single');
  btnModeSplit.classList.toggle('active', mode === 'split');
  btnModeOverlay.classList.toggle('active', mode === 'overlay');

  if (mode === 'single') {
    rowSeekB.style.display = 'none';
    btnSyncPlay.innerText = (!videoA.paused && !videoA.ended) ? '⏸ 一時停止' : '▶ 再生';
  } else {
    rowSeekB.style.display = 'flex';
    btnSyncPlay.innerText = (!videoA.paused || !videoB.paused) ? '⏸ 一時停止' : '▶ 同期再生';
  }
  renderSafe();
}

btnModeSingle.addEventListener('click', () => setMode('single'));
btnModeSplit.addEventListener('click', () => setMode('split'));
btnModeOverlay.addEventListener('click', () => setMode('overlay'));

tabAngle.addEventListener('click', () => {
  tabAngle.classList.add('active');
  tabTrail.classList.remove('active');
  angleChipsRow.style.display = 'flex';
  trailChipsRow.style.display = 'none';
});

tabTrail.addEventListener('click', () => {
  tabTrail.classList.add('active');
  tabAngle.classList.remove('active');
  trailChipsRow.style.display = 'flex';
  angleChipsRow.style.display = 'none';
});

document.querySelectorAll('.chip-angle').forEach(chip => {
  chip.addEventListener('click', () => {
    const k = chip.getAttribute('data-joint');
    selectedOverlays.has(k) ? selectedOverlays.delete(k) : selectedOverlays.add(k);
    chip.classList.toggle('active');
    renderSafe();
  });
});

document.querySelectorAll('.chip-trail').forEach(chip => {
  chip.addEventListener('click', () => {
    const k = chip.getAttribute('data-trail');
    selectedTrails.has(k) ? selectedTrails.delete(k) : selectedTrails.add(k);
    chip.classList.toggle('active');
    renderSafe();
  });
});

btnResetAdjust.addEventListener('click', () => {
  Object.keys(manualOffsetsA).forEach(k => delete manualOffsetsA[k]);
  Object.keys(manualOffsetsB).forEach(k => delete manualOffsetsB[k]);
  targetRoiA = null;
  targetRoiB = null;
  renderSafe();
});

btnClearTrail.addEventListener('click', () => {
  Object.keys(trailsA).forEach(k => trailsA[k].length = 0);
  Object.keys(trailsB).forEach(k => trailsB[k].length = 0);
  renderSafe();
});

function renderSafe() {
  if (videoA.readyState >= 2) {
    drawFrame(canvasA, ctxA, videoA, lastLandmarksA, trailsA, "#00e5ff", "A", manualOffsetsA, targetRoiA);
    triggerPoseA();
    seekBarA.value = videoA.currentTime;
    timeDisplayA.innerText = `${videoA.currentTime.toFixed(2)}s`;
  }
  if (currentMode !== 'single' && videoB.readyState >= 2) {
    drawFrame(canvasB, ctxB, videoB, lastLandmarksB, trailsB, currentMode === 'overlay' ? "#ff922b" : "#00e5ff", "B", manualOffsetsB, targetRoiB);
    triggerPoseB();
    seekBarB.value = videoB.currentTime;
    timeDisplayB.innerText = `${videoB.currentTime.toFixed(2)}s`;
  }
}

function syncPlayLoop() {
  const anyPlaying = (!videoA.paused && !videoA.ended) || (currentMode !== 'single' && !videoB.paused && !videoB.ended);
  if (anyPlaying) {
    if (!videoA.paused && !videoA.ended) {
      drawFrame(canvasA, ctxA, videoA, lastLandmarksA, trailsA, "#00e5ff", "A", manualOffsetsA, targetRoiA);
      triggerPoseA();
      seekBarA.value = videoA.currentTime;
      timeDisplayA.innerText = `${videoA.currentTime.toFixed(2)}s`;
    }
    if (currentMode !== 'single' && !videoB.paused && !videoB.ended) {
      drawFrame(canvasB, ctxB, videoB, lastLandmarksB, trailsB, currentMode === 'overlay' ? "#ff922b" : "#00e5ff", "B", manualOffsetsB, targetRoiB);
      triggerPoseB();
      seekBarB.value = videoB.currentTime;
      timeDisplayB.innerText = `${videoB.currentTime.toFixed(2)}s`;
    }
    animFrameId = requestAnimationFrame(syncPlayLoop);
  }
}

uploaderA.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (urlA) URL.revokeObjectURL(urlA);
  urlA = URL.createObjectURL(file);

  Object.keys(trailsA).forEach(k => trailsA[k].length = 0);
  Object.keys(manualOffsetsA).forEach(k => delete manualOffsetsA[k]);
  targetRoiA = null;
  lastLandmarksA = null;

  videoA.src = urlA;
  videoA.load();
  videoA.onloadeddata = () => {
    seekBarA.max = videoA.duration;
    seekBarA.value = 0;
    seekBarA.disabled = false;
    btnSyncPlay.disabled = false;
    videoA.currentTime = 0.001;
    renderSafe();
  };
});
videoA.addEventListener('seeked', () => { if (videoA.paused) renderSafe(); });

uploaderB.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (urlB) URL.revokeObjectURL(urlB);
  urlB = URL.createObjectURL(file);

  Object.keys(trailsB).forEach(k => trailsB[k].length = 0);
  Object.keys(manualOffsetsB).forEach(k => delete manualOffsetsB[k]);
  targetRoiB = null;
  lastLandmarksB = null;

  videoB.src = urlB;
  videoB.load();
  videoB.onloadeddata = () => {
    seekBarB.max = videoB.duration;
    seekBarB.value = 0;
    seekBarB.disabled = false;
    btnSyncPlay.disabled = false;
    videoB.currentTime = 0.001;
    renderSafe();
  };
});
videoB.addEventListener('seeked', () => { if (videoB.paused) renderSafe(); });

btnSyncPlay.addEventListener('click', () => {
  const isPlaying = (!videoA.paused && !videoA.ended) || (currentMode !== 'single' && !videoB.paused && !videoB.ended);
  if (isPlaying) {
    if (animFrameId) cancelAnimationFrame(animFrameId);
    videoA.pause();
    videoB.pause();
    btnSyncPlay.innerText = currentMode === 'single' ? '▶ 再生' : '▶ 同期再生';
  } else {
    if (animFrameId) cancelAnimationFrame(animFrameId);
    if (videoA.src) videoA.play();
    if (currentMode !== 'single' && videoB.src) videoB.play();
    btnSyncPlay.innerText = '⏸ 一時停止';
    syncPlayLoop();
  }
});

seekBarA.addEventListener('input', () => { videoA.currentTime = parseFloat(seekBarA.value); renderSafe(); });
seekBarB.addEventListener('input', () => { videoB.currentTime = parseFloat(seekBarB.value); renderSafe(); });

btnPrevA.addEventListener('click', () => {
  videoA.pause();
  btnSyncPlay.innerText = currentMode === 'single' ? '▶ 再生' : '▶ 同期再生';
  videoA.currentTime = Math.max(0, videoA.currentTime - 0.033);
  renderSafe();
});
btnNextA.addEventListener('click', () => {
  videoA.pause();
  btnSyncPlay.innerText = currentMode === 'single' ? '▶ 再生' : '▶ 同期再生';
  videoA.currentTime = Math.min(videoA.duration, videoA.currentTime + 0.033);
  renderSafe();
});

btnPrevB.addEventListener('click', () => {
  videoB.pause();
  btnSyncPlay.innerText = '▶ 同期再生';
  videoB.currentTime = Math.max(0, videoB.currentTime - 0.033);
  renderSafe();
});
btnNextB.addEventListener('click', () => {
  videoB.pause();
  btnSyncPlay.innerText = '▶ 同期再生';
  videoB.currentTime = Math.min(videoB.duration, videoB.currentTime + 0.033);
  renderSafe();
});
