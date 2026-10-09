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

// 力学計算用の変数と定数
const BSIP = { trunk: 0.678, thigh: 0.100, shank: 0.046, foot: 0.014 };
let prevCoM = null, prevVelCoM = null;
let filteredGRF = { x: 0, y: 0 };
const LPF_ALPHA = 0.15; // 力の平滑化フィルタ係数
const GRAVITY = 9.81; // 必須の重力加速度
let comHistory = []; // 重心座標の移動平均用

let lastLandmarks = null;
let lastGrfR = { x: 0, y: 0 }, lastMagR = 0;
let lastGrfL = { x: 0, y: 0 }, lastMagL = 0;

// タイムラインを飛ばした時に物理演算のバグを防ぐリセット関数
function resetPhysics() {
  prevCoM = null;
  prevVelCoM = null;
  filteredGRF = { x: 0, y: 0 };
  comHistory = [];
}

function processPoseMechanics(lm) {
 if (!lm || ![11, 12, 23, 24, 25, 26, 27, 28, 31, 32].every(i => isJointUsable(lm[i]))) return;
 const mass = parseFloat(inputMass.value) || 47;
 const heightM = (parseFloat(inputHeight.value) || 140) / 100.0;

 const pxBodyHeight = Math.abs(lm[0].y - (lm[27].y + lm[28].y) / 2) * outputCanvas.height;
 const meterPerPixel = (heightM * 0.85) / (pxBodyHeight || 1);

 const getPoint = (idx) => ({
 x: lm[idx].x * outputCanvas.width * meterPerPixel,
 y: (1.0 - lm[idx].y) * outputCanvas.height * meterPerPixel
 });

 const shoulderR = getPoint(12), shoulderL = getPoint(11);
 const hipR = getPoint(24), hipL = getPoint(23);
 const kneeR = getPoint(26), kneeL = getPoint(25);
 const ankleR = getPoint(28), ankleL = getPoint(27);
 const toeR = getPoint(32), toeL = getPoint(31);

 const comTrunk = { x: (shoulderR.x + hipR.x + shoulderL.x + hipL.x) * 0.25, y: (shoulderR.y + hipR.y + shoulderL.y + hipL.y) * 0.25 };
 const comThighR = { x: hipR.x * 0.433 + kneeR.x * 0.567, y: hipR.y * 0.433 + kneeR.y * 0.567 };
 const comShankR = { x: kneeR.x * 0.433 + ankleR.x * 0.567, y: kneeR.y * 0.433 + ankleR.y * 0.567 };
 const comFootR = { x: (ankleR.x + toeR.x) * 0.5, y: (ankleR.y + toeR.y) * 0.5 };

 const comThighL = { x: hipL.x * 0.433 + kneeL.x * 0.567, y: hipL.y * 0.433 + kneeL.y * 0.567 };
 const comShankL = { x: kneeL.x * 0.433 + ankleL.x * 0.567, y: kneeL.y * 0.433 + ankleL.y * 0.567 };
 const comFootL = { x: (ankleL.x + toeL.x) * 0.5, y: (ankleL.y + toeL.y) * 0.5 };

 const currentCoM = {
 x: BSIP.trunk * comTrunk.x + BSIP.thigh * (comThighR.x + comThighL.x) + BSIP.shank * (comShankR.x + comShankL.x) + BSIP.foot * (comFootR.x + comFootL.x),
 y: BSIP.trunk * comTrunk.y + BSIP.thigh * (comThighR.y + comThighL.y) + BSIP.shank * (comShankR.y + comShankL.y) + BSIP.foot * (comFootR.y + comFootL.y)
 };

 // 1. 重心座標の移動平均（ノイズ除去）
 comHistory.push(currentCoM);
 if (comHistory.length > 5) comHistory.shift();

 const avgCoM = { x: 0, y: 0 };
 for(let p of comHistory) { avgCoM.x += p.x; avgCoM.y += p.y; }
 avgCoM.x /= comHistory.length;
 avgCoM.y /= comHistory.length;

 let totalGrf = { x: 0, y: mass * GRAVITY };
 if (prevCoM) {
   // 2. ブラウザの時間ではなく設定したFPSを基準に固定時間を算出
   const fixedDt = 1.0 / currentFPS;

   const velCoM = {
     x: (avgCoM.x - prevCoM.x) / fixedDt,
     y: (avgCoM.y - prevCoM.y) / fixedDt
   };

   if (prevVelCoM) {
     const accCoM = {
       x: (velCoM.x - prevVelCoM.x) / fixedDt,
       y: (velCoM.y - prevVelCoM.y) / fixedDt
     };
     const rawGrfX = mass * accCoM.x;
     const rawGrfY = Math.max(0, mass * (accCoM.y + GRAVITY));

     // 3. フィルタリングで動きを滑らかに
     filteredGRF.x = filteredGRF.x * (1 - LPF_ALPHA) + rawGrfX * LPF_ALPHA;
     filteredGRF.y = filteredGRF.y * (1 - LPF_ALPHA) + rawGrfY * LPF_ALPHA;
     totalGrf = filteredGRF;
   }
   prevVelCoM = velCoM;
 }
 prevCoM = avgCoM;

 // 4. 接地判定と重心距離ベースの動的な力分配
 const rContact = ankleR.y < ankleL.y + 0.08 ? 1.0 : 0.0;
 const lContact = ankleL.y < ankleR.y + 0.08 ? 1.0 : 0.0;

 let ratioR = 0;
 let ratioL = 0;

 if (rContact > 0 && lContact > 0) {
   // 両足接地時：重心のX座標の位置で力の割合を計算
   const distTotal = Math.abs(ankleL.x - ankleR.x);

   if (distTotal > 0.01) {
     const distToL = Math.abs(avgCoM.x - ankleL.x);
     const distToR = Math.abs(avgCoM.x - ankleR.x);

     // 重心が近い方に多くの力を配分（逆比）
     let rawRatioR = distToL / (distToR + distToL);
     let rawRatioL = distToR / (distToR + distToL);

     // 重心が足幅の外に出た時のための安全処理
     ratioR = Math.max(0, Math.min(1.0, rawRatioR));
     ratioL = Math.max(0, Math.min(1.0, rawRatioL));
   } else {
     ratioR = 0.5;
     ratioL = 0.5;
   }
 } else {
   // 片足立ち、あるいは両足が浮いちょる時
   const sumContact = (rContact + lContact) || 1.0;
   ratioR = rContact / sumContact;
   ratioL = lContact / sumContact;
 }

 lastGrfR = { x: totalGrf.x * ratioR, y: totalGrf.y * ratioR };
 lastGrfL = { x: totalGrf.x * ratioL, y: totalGrf.y * ratioL };

 const torqueAnkleR = (comFootR.x - ankleR.x) * lastGrfR.y - (comFootR.y - ankleR.y) * lastGrfR.x;
 const torqueKneeR = (comFootR.x - kneeR.x) * lastGrfR.y - (comFootR.y - kneeR.y) * lastGrfR.x;
 const torqueHipR = (comFootR.x - hipR.x) * lastGrfR.y - (comFootR.y - hipR.y) * lastGrfR.x;

 const torqueAnkleL = (comFootL.x - ankleL.x) * lastGrfL.y - (comFootL.y - ankleL.y) * lastGrfL.x;
 const torqueKneeL = (comFootL.x - kneeL.x) * lastGrfL.y - (comFootL.y - kneeL.y) * lastGrfL.x;
 const torqueHipL = (comFootL.x - hipL.x) * lastGrfL.y - (comFootL.y - hipL.y) * lastGrfL.x;

 document.getElementById('hud_r_knee').textContent = torqueKneeR.toFixed(1);
 document.getElementById('hud_l_knee').textContent = torqueKneeL.toFixed(1);

 lastMagR = Math.hypot(lastGrfR.x, lastGrfR.y);
 lastMagL = Math.hypot(lastGrfL.x, lastGrfL.y);

 document.getElementById('r_grf').textContent = `${Math.round(lastMagR)} N`;
 document.getElementById('r_ankle').textContent = `${torqueAnkleR.toFixed(1)} N·m`;
 document.getElementById('r_knee').textContent = `${torqueKneeR.toFixed(1)} N·m`;
 document.getElementById('r_hip').textContent = `${torqueHipR.toFixed(1)} N·m`;

 document.getElementById('l_grf').textContent = `${Math.round(lastMagL)} N`;
 document.getElementById('l_ankle').textContent = `${torqueAnkleL.toFixed(1)} N·m`;
 document.getElementById('l_knee').textContent = `${torqueKneeL.toFixed(1)} N·m`;
 document.getElementById('l_hip').textContent = `${torqueHipL.toFixed(1)} N·m`;
}
