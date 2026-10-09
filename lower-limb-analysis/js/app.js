const video = document.getElementById('videoElement');
const outputCanvas = document.getElementById('outputCanvas');
const outCtx = outputCanvas.getContext('2d');
const interactionCanvas = document.getElementById('interactionCanvas');
const intCtx = interactionCanvas.getContext('2d');
const zoomTarget = document.getElementById('zoomTarget');

const btnToggleRoi = document.getElementById('btnToggleRoi');
const inputFile = document.getElementById('inputFile');
const seekSlider = document.getElementById('seekSlider');
const btnPlayPause = document.getElementById('btnPlayPause');
const btnStepBack = document.getElementById('btnStepBack');
const btnStepForward = document.getElementById('btnStepForward');
const btnFps = document.getElementById('btnFps');
const btnRecord = document.getElementById('btnRecord');
const btnSpeed = document.getElementById('btnSpeed');
const bodyInfoText = document.getElementById('body-info-text');

const btnModeZoom = document.getElementById('btnModeZoom');
const zoomControls = document.getElementById('zoom-controls');
const zoomSlider = document.getElementById('zoom-slider');

const inputMass = document.getElementById('inputMass');
const inputHeight = document.getElementById('inputHeight');

let isProcessing = false;
let isBusy = false;
let animationFrameId = null;
let currentBlobUrl = null;

let currentFPS = 30.0;
const fpsList = [30, 60, 120, 240];
let fpsIdx = 0;

const playbackRates = [1.0, 0.5, 0.25];
let currentRateIdx = 0;

// ズーム & パン管理
let isZoomMode = false;
let zoomScale = 1.0;
let panOffsetX = 0, panOffsetY = 0;
let isPanning = false;
let panStartX = 0, panStartY = 0;

// ROI（患者さん枠）
let isRoiMode = false;
let isRoiDrawing = false;
let isRoiEnabled = false;
let roiStart = { x: 0, y: 0 };
let roiNorm = { x: 0.2, y: 0.1, w: 0.6, h: 0.8 };
const roiCanvas = document.createElement('canvas');
const roiCtx = roiCanvas.getContext('2d');

let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let recordCanvas = null;
let recordCtx = null;
let recordAnimId = null;

window.addEventListener('resize', fitCanvases);

function toggleFPS() {
 fpsIdx = (fpsIdx + 1) % fpsList.length;
 currentFPS = fpsList[fpsIdx];
 btnFps.innerText = `${currentFPS}fps`;
}

function togglePlaybackRate() {
 currentRateIdx = (currentRateIdx + 1) % playbackRates.length;
 const rate = playbackRates[currentRateIdx];
 video.playbackRate = rate;
 btnSpeed.innerText = `${rate}x`;
}

function openBodyModal() { document.getElementById('body-modal-overlay').style.display = 'flex'; }
function closeBodyModal() {
 document.getElementById('body-modal-overlay').style.display = 'none';
 bodyInfoText.innerText = `${inputMass.value}kg/${inputHeight.value}cm ⚙️`;
}

function toggleZoomMode() {
 isZoomMode = !isZoomMode;
 if (isZoomMode) {
 isRoiMode = false;
 btnToggleRoi.classList.remove('roi-active');
 btnModeZoom.classList.add('mode-active');
 zoomControls.style.display = 'flex';
 document.getElementById('main-result').innerHTML = "🔍 ズーム操作中（スライダーまたは画面ドラッグで移動）";
 } else {
 btnModeZoom.classList.remove('mode-active');
 zoomControls.style.display = 'none';
 document.getElementById('main-result').innerHTML = "解析待機中";
 }
}

function resetZoom() {
 zoomScale = 1.0;
 panOffsetX = 0;
 panOffsetY = 0;
 zoomSlider.value = 1.0;
 applyZoom();
}

zoomSlider.addEventListener('input', (e) => {
 zoomScale = parseFloat(e.target.value);
 if (zoomScale === 1.0) { panOffsetX = 0; panOffsetY = 0; }
 applyZoom();
});

function toggleRoiMode() {
 isRoiMode = !isRoiMode;
 if (isRoiMode) {
 isZoomMode = false;
 btnModeZoom.classList.remove('mode-active');
 zoomControls.style.display = 'none';
 btnToggleRoi.classList.add('roi-active');
 document.getElementById('main-result').innerHTML = "🔲 画面をドラッグして対象者を四角く囲んでください";
 document.getElementById('sub-result').innerHTML = "囲んだ枠内のみをAIが追跡します（背景の人物を除外）";
 } else {
 btnToggleRoi.classList.remove('roi-active');
 document.getElementById('main-result').innerHTML = "解析待機中";
 document.getElementById('sub-result').innerHTML = "下肢関節モーメント & 床反力ベクトルをリアルタイム解析";
 }
 redrawOverlay();
}

function clearRoi() {
 isRoiEnabled = false;
 isRoiMode = false;
 btnToggleRoi.classList.remove('roi-active');
 redrawOverlay();
 renderCurrentFrame();
}

function getPointerNorm(e) {
 const rect = interactionCanvas.getBoundingClientRect();
 const clickRelX = e.clientX - (rect.left + rect.width / 2);
 const clickRelY = e.clientY - (rect.top + rect.height / 2);
 const targetRelX = (clickRelX - panOffsetX) / zoomScale;
 const targetRelY = (clickRelY - panOffsetY) / zoomScale;
 const cvsX = targetRelX + interactionCanvas.width / 2;
 const cvsY = targetRelY + interactionCanvas.height / 2;
 const box = getVideoDrawRect(interactionCanvas, video);
 return canvasToVideoNorm(cvsX, cvsY, box);
}

interactionCanvas.addEventListener('pointerdown', (e) => {
 e.preventDefault();
 if (isRoiMode) {
 isRoiDrawing = true;
 const p = getPointerNorm(e);
 roiStart = p;
 roiNorm = { x: p.x, y: p.y, w: 0, h: 0 };
 isRoiEnabled = true;
 try { interactionCanvas.setPointerCapture(e.pointerId); } catch(err){}
 redrawOverlay();
 return;
 }

 if (isZoomMode || zoomScale > 1.0) {
 isPanning = true;
 panStartX = e.clientX - panOffsetX;
 panStartY = e.clientY - panOffsetY;
 try { interactionCanvas.setPointerCapture(e.pointerId); } catch(err){}
 }
});

interactionCanvas.addEventListener('pointermove', (e) => {
 if (isRoiDrawing && isRoiMode) {
 const p = getPointerNorm(e);
 roiNorm.x = Math.min(roiStart.x, p.x);
 roiNorm.y = Math.min(roiStart.y, p.y);
 roiNorm.w = Math.abs(p.x - roiStart.x);
 roiNorm.h = Math.abs(p.y - roiStart.y);
 redrawOverlay();
 return;
 }

 if (isPanning && (isZoomMode || zoomScale > 1.0)) {
 panOffsetX = e.clientX - panStartX;
 panOffsetY = e.clientY - panStartY;
 applyZoom();
 }
});

interactionCanvas.addEventListener('pointerup', (e) => {
 if (isRoiDrawing) {
 isRoiDrawing = false;
 try { interactionCanvas.releasePointerCapture(e.pointerId); } catch(err){}
 toggleRoiMode();
 renderCurrentFrame();
 }
 if (isPanning) {
 isPanning = false;
 try { interactionCanvas.releasePointerCapture(e.pointerId); } catch(err){}
 }
});

function updateSeekBar() {
 if (video.duration) {
 seekSlider.value = (video.currentTime / video.duration) * 100;
 }
}

seekSlider.addEventListener('input', () => {
 if (video.duration) {
 video.pause();
 btnPlayPause.textContent = '▶ 再生';
 video.currentTime = (seekSlider.value / 100) * video.duration;
 }
});

// シーク（飛ばし）操作時に物理演算履歴をリセットして暴れを防ぐ
video.addEventListener('seeked', () => {
 resetPhysics();
 if (video.paused) {
 updateSeekBar();
 renderCurrentFrame();
 }
});

btnPlayPause.addEventListener('click', async () => {
 if (video.paused) {
 try {
 await video.play();
 btnPlayPause.textContent = '⏸ 停止';
 btnPlayPause.style.background = '#ff9500';
 } catch (e) {
 console.error(e);
 }
 } else {
 video.pause();
 btnPlayPause.textContent = '▶ 再生';
 btnPlayPause.style.background = '#34c759';
 }
});

btnStepForward.addEventListener('click', () => {
 video.pause();
 btnPlayPause.textContent = '▶ 再生';
 video.currentTime = Math.min(video.duration, video.currentTime + (1 / currentFPS));
});

btnStepBack.addEventListener('click', () => {
 video.pause();
 btnPlayPause.textContent = '▶ 再生';
 video.currentTime = Math.max(0, video.currentTime - (1 / currentFPS));
});

function captureSnapshot() {
 if (!video.videoWidth) { alert("動画が読み込まれていません"); return; }
 const snapCanvas = document.createElement('canvas');
 const snapCtx = snapCanvas.getContext('2d');
 snapCanvas.width = outputCanvas.width;
 snapCanvas.height = outputCanvas.height + 60;

 snapCtx.fillStyle = '#000';
 snapCtx.fillRect(0, 0, snapCanvas.width, snapCanvas.height);
 snapCtx.drawImage(video, 0, 0, outputCanvas.width, outputCanvas.height);
 snapCtx.drawImage(outputCanvas, 0, 0);

 snapCtx.fillStyle = '#1c1c1e';
 snapCtx.fillRect(0, outputCanvas.height, snapCanvas.width, 60);
 snapCtx.fillStyle = '#00ffcc';
 snapCtx.font = 'bold 13px -apple-system, sans-serif';
 snapCtx.fillText(`右膝トルク: ${document.getElementById('hud_r_knee').textContent} N·m ｜ 左膝トルク: ${document.getElementById('hud_l_knee').textContent} N·m`, 15, outputCanvas.height + 24);
 snapCtx.fillStyle = '#ccc';
 snapCtx.font = '11px -apple-system, sans-serif';
 snapCtx.fillText(`右床反力: ${document.getElementById('r_grf').textContent} ｜ 左床反力: ${document.getElementById('l_grf').textContent}`, 15, outputCanvas.height + 46);

 document.getElementById('snapshot-img').src = snapCanvas.toDataURL('image/png');
 document.getElementById('snapshot-modal-overlay').style.display = 'flex';
}
function closeSnapshotModal() { document.getElementById('snapshot-modal-overlay').style.display = 'none'; }

function toggleRecording() {
 if (isRecording) stopRecording();
 else startRecording();
}

function startRecording() {
 if (!video.duration) { alert("動画が開始されていません"); return; }

 recordedChunks = [];
 recordCanvas = document.createElement('canvas');
 recordCanvas.width = outputCanvas.width;
 recordCanvas.height = outputCanvas.height + 50;
 recordCtx = recordCanvas.getContext('2d');

 function drawRecordFrame() {
 if (!isRecording) return;
 recordCtx.fillStyle = '#000';
 recordCtx.fillRect(0, 0, recordCanvas.width, recordCanvas.height);
 recordCtx.drawImage(video, 0, 0, outputCanvas.width, outputCanvas.height);
 recordCtx.drawImage(outputCanvas, 0, 0);

 recordCtx.fillStyle = '#1c1c1e';
 recordCtx.fillRect(0, outputCanvas.height, recordCanvas.width, 50);
 recordCtx.fillStyle = '#00ffcc';
 recordCtx.font = 'bold 12px -apple-system, sans-serif';
 recordCtx.fillText(`右膝: ${document.getElementById('hud_r_knee').textContent} N·m ｜ 左膝: ${document.getElementById('hud_l_knee').textContent} N·m`, 12, outputCanvas.height + 22);
 recordCtx.fillStyle = '#ccc';
 recordCtx.font = '10px -apple-system, sans-serif';
 recordCtx.fillText(`右床反力: ${document.getElementById('r_grf').textContent} ｜ 左床反力: ${document.getElementById('l_grf').textContent}`, 12, outputCanvas.height + 40);

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
 if (video.paused) btnPlayPause.click();
}

function stopRecording() {
 if (!isRecording) return;
 isRecording = false;
 if (recordAnimId) cancelAnimationFrame(recordAnimId);
 mediaRecorder.stop();
 btnRecord.innerText = '🎥 録画開始';
 btnRecord.classList.remove('rec-active');
 if (!video.paused) btnPlayPause.click();
}

function exportRecordedVideo() {
 const isMp4 = mediaRecorder.mimeType && mediaRecorder.mimeType.includes('mp4');
 const finalType = isMp4 ? 'video/mp4' : (mediaRecorder.mimeType || 'video/webm');
 const ext = isMp4 ? 'mp4' : 'webm';

 const blob = new Blob(recordedChunks, { type: finalType });
 const url = URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.href = url;
 a.download = `下肢動作分析_${new Date().toISOString().slice(0, 10)}_${Date.now()}.${ext}`;
 document.body.appendChild(a);
 a.click();
 document.body.removeChild(a);
 setTimeout(() => URL.revokeObjectURL(url), 2000);
}

inputFile.addEventListener('change', (e) => {
 const file = e.target.files[0];
 if (!file) return;

 if (animationFrameId) cancelAnimationFrame(animationFrameId);
 if (currentBlobUrl) {
 URL.revokeObjectURL(currentBlobUrl);
 currentBlobUrl = null;
 }
 video.pause();
 resetZoom();
 resetPhysics(); // 新しい動画読み込み時も物理演算をリセット

 currentBlobUrl = URL.createObjectURL(file);
 video.src = currentBlobUrl;
 video.load();

 const onCanPlay = () => {
 video.removeEventListener('canplay', onCanPlay);
 fitCanvases();
 isProcessing = true;
 btnPlayPause.textContent = '▶ 再生';
 video.currentTime = 0.001;
 loop();
 };

 video.addEventListener('canplay', onCanPlay);
 inputFile.value = '';
});
