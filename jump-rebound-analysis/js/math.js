const VIS_HIDDEN = 0.50;
const VIS_CONFIDENT = 0.65;

function jointVis(pt) {
  return pt && pt.visibility != null ? pt.visibility : 0;
}
function isJointHidden(pt) {
  return !pt || jointVis(pt) < VIS_HIDDEN;
}
function isJointWarn(pt) {
  const v = jointVis(pt);
  return pt && v >= VIS_HIDDEN && v < VIS_CONFIDENT;
}
function isJointConfident(pt) {
  return pt && jointVis(pt) >= VIS_CONFIDENT;
}
function isJointUsable(pt) {
  return pt && (jointVis(pt) >= VIS_HIDDEN || pt._held);
}
const VIS_DRAW = 0.60;
function isJointDrawable(pt) {
  return pt && jointVis(pt) >= VIS_DRAW;
}

function getVideoDrawRect(canvas, vid) {
  const cw = canvas.width || 0;
  const ch = canvas.height || 0;
  const vw = vid && vid.videoWidth;
  const vh = vid && vid.videoHeight;
  if (!cw || !ch || !vw || !vh) {
    return { drawX: 0, drawY: 0, drawW: cw, drawH: ch };
  }
  const canvasRatio = cw / ch;
  const videoRatio = vw / vh;
  let drawW, drawH, drawX, drawY;
  if (canvasRatio > videoRatio) {
    drawH = ch;
    drawW = drawH * videoRatio;
    drawX = (cw - drawW) / 2;
    drawY = 0;
  } else {
    drawW = cw;
    drawH = drawW / videoRatio;
    drawX = 0;
    drawY = (ch - drawH) / 2;
  }
  return { drawX, drawY, drawW, drawH };
}

function landmarkToCanvas(pt, box) {
  return {
    x: box.drawX + pt.x * box.drawW,
    y: box.drawY + pt.y * box.drawH
  };
}

function canvasToVideoNorm(cvsX, cvsY, box) {
  if (!box.drawW || !box.drawH) return { x: 0, y: 0 };
  return {
    x: Math.max(0, Math.min(1, (cvsX - box.drawX) / box.drawW)),
    y: Math.max(0, Math.min(1, (cvsY - box.drawY) / box.drawH))
  };
}
function stabilizeLandmarks(lm, holdStore) {
  if (!lm) return null;
  if (!holdStore.pts) holdStore.pts = [];
  return lm.map((pt, i) => {
    const vis = jointVis(pt);
    if (vis >= VIS_CONFIDENT) {
      holdStore.pts[i] = { x: pt.x, y: pt.y, z: pt.z || 0, visibility: vis };
      return { x: pt.x, y: pt.y, z: pt.z || 0, visibility: vis, _held: false };
    }
    if (vis >= VIS_HIDDEN) {
      return { x: pt.x, y: pt.y, z: pt.z || 0, visibility: vis, _held: false };
    }
    const held = holdStore.pts[i];
    if (held) {
      return { x: held.x, y: held.y, z: held.z, visibility: vis, _held: true };
    }
    return { x: pt.x, y: pt.y, z: pt.z || 0, visibility: vis, _held: false };
  });
}

// Jump Data (1回目 & 2回目)
const jumps = {
    j1: { takeoff: null, peak: null, landing: null },
    j2: { takeoff: null, peak: null, landing: null }
};

let currentLandmarks = null;
let currentCoM = null;
let currentFeetCenter = null;

function updateBodyCenters(lm, w, h, originX = 0, originY = 0) {
    // 4点（両肩・両股関節）中心モデル。w/h は動画描画領域サイズ。
    const shL = lm[11], shR = lm[12], hipL = lm[23], hipR = lm[24];
    const ankleL = lm[27], ankleR = lm[28];
    const toX = (nx) => originX + nx * w;
    const toY = (ny) => originY + ny * h;

    if ([shL, shR, hipL, hipR].every(isJointUsable)) {
        currentCoM = {
            x: toX((shL.x + shR.x + hipL.x + hipR.x) * 0.25),
            y: toY((shL.y + shR.y + hipL.y + hipR.y) * 0.25)
        };
    } else if (isJointUsable(hipL) && isJointUsable(hipR)) {
        currentCoM = { x: toX((hipL.x + hipR.x) * 0.5), y: toY((hipL.y + hipR.y) * 0.5) };
    }

    if (isJointUsable(ankleL) && isJointUsable(ankleR)) {
        currentFeetCenter = { x: toX((ankleL.x + ankleR.x) * 0.5), y: toY((ankleL.y + ankleR.y) * 0.5) };
    }
}

function calculateMetrics() {
    // 1回目
    let j1HeightM = 0;
    if (pxPerCm && jumps.j1.takeoff && jumps.j1.peak) {
        const dy = jumps.j1.takeoff.com.y - jumps.j1.peak.com.y;
        const hCm = Math.max(0, dy / pxPerCm);
        j1HeightM = hCm / 100;
        document.getElementById('res_j1_h').innerText = `${hCm.toFixed(1)} cm`;
    } else { document.getElementById('res_j1_h').innerText = "--- cm"; }

    if (jumps.j1.takeoff && jumps.j1.landing) {
        const t = Math.max(0, jumps.j1.landing.time - jumps.j1.takeoff.time);
        document.getElementById('res_j1_t').innerText = `${t.toFixed(3)} s`;
    } else { document.getElementById('res_j1_t').innerText = "--- s"; }

    // 2回目
    let j2HeightM = 0;
    if (pxPerCm && jumps.j2.takeoff && jumps.j2.peak) {
        const dy = jumps.j2.takeoff.com.y - jumps.j2.peak.com.y;
        const hCm = Math.max(0, dy / pxPerCm);
        j2HeightM = hCm / 100;
        document.getElementById('res_j2_h').innerText = `${hCm.toFixed(1)} cm`;
    } else { document.getElementById('res_j2_h').innerText = "--- cm"; }

    if (jumps.j2.takeoff && jumps.j2.landing) {
        const t = Math.max(0, jumps.j2.landing.time - jumps.j2.takeoff.time);
        document.getElementById('res_j2_t').innerText = `${t.toFixed(3)} s`;
    } else { document.getElementById('res_j2_t').innerText = "--- s"; }

    // リバウンド（接地時間 ＆ RSI）
    let contactTimeS = 0;
    if (jumps.j1.landing && jumps.j2.takeoff) {
        contactTimeS = Math.max(0, jumps.j2.takeoff.time - jumps.j1.landing.time);
        document.getElementById('res_contact_t').innerText = `${contactTimeS.toFixed(3)} s`;
    } else { document.getElementById('res_contact_t').innerText = "--- s"; }

    if (j2HeightM > 0 && contactTimeS > 0) {
        const rsi = j2HeightM / contactTimeS;
        document.getElementById('res_rsi').innerText = `${rsi.toFixed(2)}`;
    } else { document.getElementById('res_rsi').innerText = "---"; }
}
