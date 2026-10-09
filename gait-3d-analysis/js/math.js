const MAX_TRAIL_LENGTH = 120;

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
