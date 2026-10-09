const MAX_TRAIL_LENGTH = 120;
const VIS_HIDDEN = 0.50;
const VIS_CONFIDENT = 0.65;
const FRAME_DT = 0.033;
const OFFSET_FALLOFF_FRAMES = 10;

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

function getVideoFrame(video) {
  if (!video) return 0;
  return Math.round((video.currentTime || 0) / FRAME_DT);
}

function setManualKeyframe(keyframes, frame, idx, offset) {
  if (!keyframes[frame]) keyframes[frame] = {};
  keyframes[frame][idx] = { x: offset.x, y: offset.y };
}

function clearKeyframeMap(keyframes) {
  Object.keys(keyframes).forEach(k => delete keyframes[k]);
}

function interpolateOffset(keyframes, idx, frame) {
  const frames = Object.keys(keyframes)
    .map(Number)
    .filter(f => keyframes[f] && keyframes[f][idx])
    .sort((a, b) => a - b);
  if (frames.length === 0) return { x: 0, y: 0 };

  if (keyframes[frame] && keyframes[frame][idx]) {
    return { x: keyframes[frame][idx].x, y: keyframes[frame][idx].y };
  }

  let prev = -1;
  let next = -1;
  for (let i = 0; i < frames.length; i++) {
    if (frames[i] <= frame) prev = frames[i];
    if (frames[i] >= frame && next === -1) next = frames[i];
  }

  if (prev !== -1 && next !== -1 && prev !== next) {
    const t = (frame - prev) / (next - prev);
    const a = keyframes[prev][idx];
    const b = keyframes[next][idx];
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t
    };
  }

  const kf = prev !== -1 ? prev : next;
  const off = keyframes[kf][idx];
  const dist = Math.abs(frame - kf);
  const w = Math.exp(-dist / OFFSET_FALLOFF_FRAMES);
  return { x: off.x * w, y: off.y * w };
}

function refreshManualOffsets(target, keyframes, video) {
  Object.keys(target).forEach(k => delete target[k]);
  if (!keyframes) return;
  const frame = getVideoFrame(video);
  const idxSet = {};
  Object.keys(keyframes).forEach(f => {
    Object.keys(keyframes[f]).forEach(idx => { idxSet[idx] = true; });
  });
  Object.keys(idxSet).forEach(idx => {
    const off = interpolateOffset(keyframes, idx, frame);
    if (Math.abs(off.x) > 1e-5 || Math.abs(off.y) > 1e-5) {
      target[idx] = off;
    }
  });
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

function colorWithAlpha(color, alpha) {
  if (!color) return `rgba(0, 229, 255, ${alpha})`;
  if (color.startsWith('rgba')) {
    return color.replace(/rgba\(([^)]+)\)/, (_, inner) => {
      const parts = inner.split(',').map(s => s.trim());
      return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
    });
  }
  const hex = color.replace('#', '');
  const n = parseInt(hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const VCalc = {
  sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: (a.z || 0) - (b.z || 0) }),
  mid: (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z || 0) + (b.z || 0)) / 2 }),
  dot: (a, b) => a.x * b.x + a.y * b.y + (a.z || 0) * (b.z || 0),
  cross: (a, b) => ({
    x: a.y * (b.z || 0) - (a.z || 0) * b.y,
    y: (a.z || 0) * b.x - a.x * (b.z || 0),
    z: a.x * b.y - a.y * b.x
  }),
  normalize: (a) => {
    const n = Math.hypot(a.x, a.y, a.z || 0) || 1;
    return { x: a.x / n, y: a.y / n, z: (a.z || 0) / n };
  },
  angleDeg: (a, b) => {
    const dot = a.x * b.x + a.y * b.y + (a.z || 0) * (b.z || 0);
    const norm = Math.hypot(a.x, a.y, a.z || 0) * Math.hypot(b.x, b.y, b.z || 0);
    if (norm === 0) return 0;
    return Math.acos(Math.min(Math.max(dot / norm, -1.0), 1.0)) * (180 / Math.PI);
  }
};

function getRoiBox(roi, vw, vh) {
  if (!roi) return { x: 0, y: 0, w: vw, h: vh, normX: 0, normY: 0, normW: 1, normH: 1 };
  const aspect = vw / vh;
  let bw = roi.boxSize;
  let bh = roi.boxSize * aspect;
  if (bh > 0.95) {
    bh = 0.95;
    bw = bh / aspect;
  }
  let minX = Math.max(0, Math.min(1 - bw, roi.cx - bw / 2));
  let minY = Math.max(0, Math.min(1 - bh, roi.cy - bh / 2));
  return {
    x: minX * vw, y: minY * vh,
    w: bw * vw, h: bh * vh,
    normX: minX, normY: minY,
    normW: bw, normH: bh
  };
}

function addPt(tb, key, pt) {
  tb[key].push(pt);
  if (tb[key].length > MAX_TRAIL_LENGTH) tb[key].shift();
}
