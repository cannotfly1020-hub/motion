const VIS_HIDDEN = 0.50;
const VIS_CONFIDENT = 0.65;
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
function stabilizeLandmarksMap(lm, holdStore) {
  if (!lm) return null;
  if (!holdStore.pts) holdStore.pts = {};
  const out = {};
  const keys = Object.keys(lm);
  keys.forEach(i => {
    const pt = lm[i];
    const vis = jointVis(pt);
    if (vis >= VIS_CONFIDENT) {
      holdStore.pts[i] = { x: pt.x, y: pt.y, z: pt.z || 0, visibility: vis };
      out[i] = { x: pt.x, y: pt.y, z: pt.z || 0, visibility: vis, _held: false };
    } else if (vis >= VIS_HIDDEN) {
      out[i] = { x: pt.x, y: pt.y, z: pt.z || 0, visibility: vis, _held: false };
    } else if (holdStore.pts[i]) {
      const held = holdStore.pts[i];
      out[i] = { x: held.x, y: held.y, z: held.z, visibility: vis, _held: true };
    } else {
      out[i] = { x: pt.x, y: pt.y, z: pt.z || 0, visibility: vis, _held: false };
    }
  });
  return out;
}

function getVideoFrameFromTime(video) {
  return Math.round((video && video.currentTime ? video.currentTime : 0) * (typeof currentFPS === 'number' ? currentFPS : 30));
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
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }
  const kf = prev !== -1 ? prev : next;
  const off = keyframes[kf][idx];
  const w = Math.exp(-Math.abs(frame - kf) / OFFSET_FALLOFF_FRAMES);
  return { x: off.x * w, y: off.y * w };
}

function refreshManualOffsets(target, keyframes, video) {
  Object.keys(target).forEach(k => delete target[k]);
  if (!keyframes) return;
  const frame = getVideoFrameFromTime(video);
  const idxSet = {};
  Object.keys(keyframes).forEach(f => {
    Object.keys(keyframes[f]).forEach(idx => { idxSet[idx] = true; });
  });
  Object.keys(idxSet).forEach(idx => {
    const off = interpolateOffset(keyframes, idx, frame);
    if (Math.abs(off.x) > 1e-5 || Math.abs(off.y) > 1e-5) target[idx] = off;
  });
}

function applyLandmarkOffsets(lm, offsets) {
  if (!lm) return lm;
  const out = {};
  Object.keys(lm).forEach(k => {
    const off = offsets[k] || { x: 0, y: 0 };
    out[k] = { ...lm[k], x: lm[k].x + off.x, y: lm[k].y + off.y };
  });
  return out;
}

function canDrawBone(a, b, offsets, ia, ib) {
  const aOk = (offsets && offsets[ia]) || isJointConfident(a);
  const bOk = (offsets && offsets[ib]) || isJointConfident(b);
  return aOk && bOk;
}

function canDrawJoint(pt, idx, offsets) {
  if (!pt) return false;
  if (offsets && offsets[idx]) return true;
  return !isJointHidden(pt);
}

function simulateJointAngle(p2, p3, deltaDeg) {
    const rad = deltaDeg * (Math.PI / 180);
    const dx = p3.x - p2.x;
    const dy = p3.y - p2.y;
    return {
        x: p2.x + (dx * Math.cos(rad) - dy * Math.sin(rad)),
        y: p2.y + (dx * Math.sin(rad) + dy * Math.cos(rad))
    };
}

function calcResults(s, mode) {
    if (mode === 'angle') {
        if (s.points.length === 3) {
            const p1 = s.points[0], p2 = s.points[1], p3 = s.points[2];
            const v1 = {x: p1.x - p2.x, y: p1.y - p2.y};
            const v2 = {x: p3.x - p2.x, y: p3.y - p2.y};
            const dot = v1.x * v2.x + v1.y * v2.y;
            const mag = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
            if (mag !== 0) {
                const angle = Math.acos(Math.max(-1.0, Math.min(1.0, dot / mag))) * (180 / Math.PI);
                s.resultMain = `関節角度: ${angle.toFixed(1)}°`;
                s.resultSub = `頂点(2点目)を中心とした角度`;
            }
        } else {
            s.resultMain = s.points.length === 0 ? "角度モード: 3点をタップ" : `点 ${s.points.length}/3`;
            s.resultSub = "頂点(2点目)を中心とした角度を測定";
        }
    } else if (mode === 'sim') {
        if (s.points.length === 3) {
            const p1 = s.points[0], p2 = s.points[1], p3 = s.points[2];
            const v1 = {x: p1.x - p2.x, y: p1.y - p2.y};
            const v2 = {x: p3.x - p2.x, y: p3.y - p2.y};
            const dot = v1.x * v2.x + v1.y * v2.y;
            const mag = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
            let curAngle = 0;
            if (mag !== 0) {
                curAngle = Math.acos(Math.max(-1.0, Math.min(1.0, dot / mag))) * (180 / Math.PI);
            }
            const deltaDeg = parseFloat(simSlider.value);
            const simPt = simulateJointAngle(p2, p3, deltaDeg);
            const diffPx = Math.hypot(simPt.x - p3.x, simPt.y - p3.y);
            const shiftText = s.pxPerCm ? `(先端移動: ${(diffPx / s.pxPerCm).toFixed(1)}cm)` : `(先端移動: ${diffPx.toFixed(1)}px)`;
            s.resultMain = `<span class="highlight-sim">可動域予測: ${curAngle.toFixed(1)}° → ${(curAngle + deltaDeg).toFixed(1)}° (${deltaDeg > 0 ? '+' : ''}${deltaDeg}°)</span>`;
            s.resultSub = `緑の破線が改善後の予測位置 ${shiftText}`;
        } else {
            s.resultMain = s.points.length === 0 ? "予測モード: 根元→関節中心→先端をタップ" : `点 ${s.points.length}/3`;
            s.resultSub = "3点打つと、下のスライダーで角度改善シミュレーションが動きます";
        }
    } else if (mode === 'cog') {
        if (s.perpPoints.length < 2) {
            s.resultMain = "📍 基準エラー: 先に「垂直線」を設定してください";
            s.resultSub = "垂直線モードで2点をタップし、基準線を引いてから測定します";
        } else if (s.cogPoints.length === 0) {
            s.resultMain = "基準線設定完了: 重心・頭の点をタップ";
            s.resultSub = "コマ送りしながら、追跡したい重心の点を何個でもタップできます";
        } else {
            const p1 = s.perpPoints[0], p2 = s.perpPoints[1];
            const t = parseFloat(perpSlider.value) / 100;
            const pmX = p1.x + (p2.x - p1.x) * t;
            const pmY = p1.y + (p2.y - p1.y) * t;

            const bx = p2.x - p1.x, by = p2.y - p1.y;
            const bLen = Math.hypot(bx, by);
            const ux = bx / bLen, uy = by / bLen;
            const nx = -uy, ny = ux;

            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            s.cogPoints.forEach(p => {
                const vx = p.x - pmX, vy = p.y - pmY;
                p.par = vx * ux + vy * uy;
                p.per = -(vx * nx + vy * ny);
                if (p.par < minX) minX = p.par; if (p.par > maxX) maxX = p.par;
                if (p.per < minY) minY = p.per; if (p.per > maxY) maxY = p.per;
            });
            const rangeX = maxX - minX, rangeY = maxY - minY;
            const lastPt = s.cogPoints[s.cogPoints.length - 1];
            s.resultMain = `<span class="highlight-cog">重心変位 [点${s.cogPoints.length}]: 左右 ${formatDelta(lastPt.par, s.pxPerCm)} ｜ 上下 ${formatDelta(lastPt.per, s.pxPerCm)}</span>`;
            s.resultSub = `最大移動幅: 左右ブレ ${formatDistance(rangeX, s.pxPerCm)} ｜ 上下ブレ ${formatDistance(rangeY, s.pxPerCm)}`;
        }
    } else if (mode === 'distance') {
        if (s.points.length === 2) {
            const dist = Math.hypot(s.points[1].x - s.points[0].x, s.points[1].y - s.points[0].y);
            const dt = Math.abs(s.points[1].time - s.points[0].time);
            s.resultMain = `距離: ${formatDistance(dist, s.pxPerCm)}`;
            if (dt > 0 && s.pxPerCm) {
                const speedKMH = ((dist / s.pxPerCm) / 100) / dt * 3.6;
                s.resultSub = `速度: <span class="highlight-speed">${speedKMH.toFixed(1)}km/h</span> (${currentFPS}fps)`;
            } else if (!s.pxPerCm) {
                s.resultSub = "⚠️速度計算には「📏物差し」の設定が必要です";
            } else {
                s.resultSub = "⚠️速度計算には動画のコマ送りが必要です";
            }
        } else {
            s.resultMain = s.points.length === 0 ? "速度モード: 始点→終点をタップ" : "始点を記録";
            s.resultSub = "1点目タップ後、コマ送りして2点目をタップ";
        }
    } else if (mode === 'accel') {
        if (s.points.length === 3) {
            const p1 = s.points[0], p2 = s.points[1], p3 = s.points[2];
            const dt1 = Math.abs(p2.time - p1.time), dt2 = Math.abs(p3.time - p2.time);
            const dist1 = Math.hypot(p2.x - p1.x, p2.y - p1.y), dist2 = Math.hypot(p3.x - p2.x, p3.y - p2.y);
            if (!s.pxPerCm) {
                s.resultMain = `<span style="color:#ff9500;">⚠️物差し未設定</span>`;
                s.resultSub = "先に「📏物差し」モードで長さを設定してください";
            } else if (dt1 === 0 || dt2 === 0) {
                s.resultMain = `<span style="color:#ff9500;">⚠️時間が経過していません</span>`;
                s.resultSub = "コマ送りをして、違う時間の3点をタップしてください";
            } else {
                const v1 = ((dist1 / s.pxPerCm) / 100) / dt1, v2 = ((dist2 / s.pxPerCm) / 100) / dt2;
                const accel = (v2 - v1) / ((dt1 + dt2) / 2), gForce = accel / 9.80665;
                s.resultMain = `<span class="highlight-acc">加速度: ${accel > 0 ? '+' : ''}${accel.toFixed(2)}m/s² (${gForce > 0 ? '+' : ''}${gForce.toFixed(2)}G)</span>`;
                s.resultSub = `①:${(v1 * 3.6).toFixed(1)}k → ②:${(v2 * 3.6).toFixed(1)}k (${currentFPS}fps)`;
            }
        } else {
            s.resultMain = s.points.length === 0 ? "加速度モード: 連続3点をタップ" : `点 ${s.points.length}/3`;
            s.resultSub = "コマ送りしながら 始点 → 中間 → 終点 をタップ";
        }
    } else if (mode === 'perp') {
        s.resultMain = `垂直線モード`; s.resultSub = `下のスライダーで垂直線を動かせます`;
    }
}

let lastAiResultHtml = null;

function calcAiResults(type = 'ai') {
    const s = state[1];
    if (s.aiJoints && s.aiJoints.length === 4) {
        const [shoulderL, shoulderR, hipL, hipR] = s.aiJoints;
        if (![shoulderL, shoulderR, hipL, hipR].every(isJointUsable)) return;
        const midThorax = { x: (shoulderL.x + shoulderR.x) / 2, y: (shoulderL.y + shoulderR.y) / 2 };
        const midHip = { x: (hipL.x + hipR.x) / 2, y: (hipL.y + hipR.y) / 2 };

        const angleDeg = Math.atan2(midThorax.x - midHip.x, -(midThorax.y - midHip.y)) * (180 / Math.PI);
        const pelvisAngleDeg = Math.atan2((hipR.z || 0) - (hipL.z || 0), hipR.x - hipL.x) * (180 / Math.PI);
        const thoraxAngleDeg = Math.atan2((shoulderR.z || 0) - (shoulderL.z || 0), shoulderR.x - shoulderL.x) * (180 / Math.PI);

        let torsionDiff = thoraxAngleDeg - pelvisAngleDeg;
        if (torsionDiff > 180) torsionDiff -= 360;
        if (torsionDiff < -180) torsionDiff += 360;
        currentTorsionAngle = torsionDiff;

        let typeLabel = "🤖 AI", color = "#00ffcc";
        if (type === 'manual') { typeLabel = "✋ 手動"; color = "#ff9500"; }
        else if (type === 'interpolated') { typeLabel = "✨ 補間"; color = "#ffcc00"; }

        const torsionText = `<span class="highlight-speed" style="font-size:13px;">${Math.abs(currentTorsionAngle).toFixed(1)}°</span>`;
        lastAiResultHtml = `${typeLabel} ｜ 体幹傾斜: <span style="color:${color}; font-size:13px;">${angleDeg.toFixed(1)}°</span> ｜ 捻転差(X-Factor): ${torsionText}`;
        mainResult.innerHTML = lastAiResultHtml;
        subResult.innerHTML = `<span style="color:#00ffcc;">左半身:水色</span> / <span style="color:#ffd60a;">右半身:黄色</span> ｜ 端点ドラッグで修正可能`;
    }
}

function formatDistance(px, pxPerCm) {
    if (!pxPerCm) return `${px.toFixed(1)} px`;
    const cm = px / pxPerCm;
    return cm >= 100 ? `${(cm / 100).toFixed(2)} m (${cm.toFixed(1)} cm)` : `${cm.toFixed(1)} cm`;
}

function formatDelta(px, pxPerCm) {
    if (!pxPerCm) return `${px > 0 ? '+' : ''}${px.toFixed(1)}px`;
    const cm = px / pxPerCm;
    return `${cm > 0 ? '+' : ''}${cm.toFixed(1)} cm`;
}

function getInterpolatedAiPoints(currentFrame, liveJoints) {
    const s = state[1];
    if (s.aiOverrides[currentFrame]) return { joints: s.aiOverrides[currentFrame], type: 'manual' };

    const frames = Object.keys(s.aiOverrides).map(Number).sort((a, b) => a - b);
    if (frames.length === 0) return null;

    let prev = -1, next = -1;
    for (let i = 0; i < frames.length; i++) {
        if (frames[i] < currentFrame) prev = frames[i];
        if (frames[i] > currentFrame && next === -1) next = frames[i];
    }

    if (prev !== -1 && next !== -1) {
        const ratio = (currentFrame - prev) / (next - prev);
        const joints = [];
        for (let j = 0; j < 4; j++) {
            joints.push({
                x: s.aiOverrides[prev][j].x + (s.aiOverrides[next][j].x - s.aiOverrides[prev][j].x) * ratio,
                y: s.aiOverrides[prev][j].y + (s.aiOverrides[next][j].y - s.aiOverrides[prev][j].y) * ratio,
                z: (s.aiOverrides[prev][j].z || 0) + ((s.aiOverrides[next][j].z || 0) - (s.aiOverrides[prev][j].z || 0)) * ratio
            });
        }
        return { joints, type: 'interpolated' };
    }

    const kf = prev !== -1 ? prev : next;
    if (kf === -1 || !liveJoints || liveJoints.length < 4) return null;
    const w = Math.exp(-Math.abs(currentFrame - kf) / OFFSET_FALLOFF_FRAMES);
    if (w < 0.02) return null;
    const src = s.aiOverrides[kf];
    const joints = liveJoints.map((live, j) => ({
        x: live.x + (src[j].x - live.x) * w,
        y: live.y + (src[j].y - live.y) * w,
        z: (live.z || 0) + ((src[j].z || 0) - (live.z || 0)) * w
    }));
    return { joints, type: 'interpolated' };
}
