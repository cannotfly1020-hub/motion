function canDrawJoint(pt, idx, offsets) {
  if (!pt) return false;
  if (offsets && offsets[idx]) return true;
  return !isJointHidden(pt);
}

function canDrawBone(a, ia, b, ib, offsets) {
  const aOk = (offsets && offsets[ia]) || isJointConfident(a);
  const bOk = (offsets && offsets[ib]) || isJointConfident(b);
  return aOk && bOk;
}

function jointDrawAlpha(pt, idx, offsets) {
  if (offsets && offsets[idx]) return 1;
  if (isJointWarn(pt)) return 0.38;
  return 1;
}

function drawFrame(canvas, ctx, video, lmRaw, trailBuf, skeletonColor, label, offsets = {}, targetRoi = null) {
  if (!video.videoWidth || !video.videoHeight || video.readyState < 2) return;
  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
  const w = canvas.width;
  const h = canvas.height;

  const keyframes = label === "A" ? manualKeyframesA : manualKeyframesB;
  if (keyframes) refreshManualOffsets(offsets, keyframes, video);

  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(video, 0, 0, w, h);

  if (targetRoi) {
    const box = getRoiBox(targetRoi, w, h);
    ctx.save();
    ctx.strokeStyle = "rgba(247, 131, 172, 0.85)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    ctx.fillStyle = "rgba(247, 131, 172, 0.85)";
    ctx.font = "bold 11px sans-serif";
    ctx.fillText("🎯 追跡中", box.x + 4, Math.max(16, box.y - 4));
    ctx.restore();
  }

  if (lmRaw) {
    const lm = lmRaw.map((pt, idx) => {
      const off = offsets[idx] || { x: 0, y: 0 };
      return { ...pt, x: pt.x + off.x, y: pt.y + off.y };
    });

    const connections = [
      [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
      [11, 23], [12, 24], [23, 24],
      [23, 25], [25, 27], [27, 31],
      [24, 26], [26, 28], [28, 32],
      [27, 29], [28, 30]
    ];

    ctx.lineWidth = Math.max(2, Math.floor(w / 220));
    connections.forEach(([i, j]) => {
      if (!canDrawBone(lm[i], i, lm[j], j, offsets)) return;
      ctx.strokeStyle = skeletonColor;
      ctx.beginPath();
      ctx.moveTo(lm[i].x * w, lm[i].y * h);
      ctx.lineTo(lm[j].x * w, lm[j].y * h);
      ctx.stroke();
    });

    const validJoints = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
    validJoints.forEach(i => {
      if (!canDrawJoint(lm[i], i, offsets)) return;
      const alpha = jointDrawAlpha(lm[i], i, offsets);
      const base = offsets[i] ? "#ffd43b" : (label === "B" && currentMode === 'overlay' ? "#ffa94d" : "#ff0055");
      ctx.fillStyle = colorWithAlpha(base, alpha);
      ctx.beginPath();
      ctx.arc(lm[i].x * w, lm[i].y * h, Math.max(5, Math.floor(w / 120)), 0, 2 * Math.PI);
      ctx.fill();
      if (offsets[i]) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (isJointWarn(lm[i])) {
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = colorWithAlpha("#ffffff", 0.55);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });

    let trunkCenter = null;
    if ([11, 12, 23, 24].every(i => isJointUsable(lm[i]))) {
      const shoMid = { x: (lm[11].x + lm[12].x) / 2, y: (lm[11].y + lm[12].y) / 2 };
      const hipMid = { x: (lm[23].x + lm[24].x) / 2, y: (lm[23].y + lm[24].y) / 2 };
      trunkCenter = { x: (shoMid.x + hipMid.x) / 2 * w, y: (shoMid.y + hipMid.y) / 2 * h };
      if ([11, 12, 23, 24].every(i => isJointConfident(lm[i]) || (offsets && offsets[i]))) {
        addPt(trailBuf, 'trunkCenter', trunkCenter);
      }
    }

    if (isJointUsable(lm[0]) && isJointUsable(lm[11]) && isJointUsable(lm[12]) &&
        canDrawJoint(lm[0], 0, offsets) && canDrawJoint(lm[11], 11, offsets) && canDrawJoint(lm[12], 12, offsets)) {
      const shoMid = { x: (lm[11].x + lm[12].x) / 2, y: (lm[11].y + lm[12].y) / 2 };
      const headUpVec = { x: lm[0].x - shoMid.x, y: lm[0].y - shoMid.y };
      const headDist = Math.hypot(headUpVec.x, headUpVec.y) || 1;

      const headTop = {
        x: (lm[0].x + (headUpVec.x / headDist) * headDist * 0.65) * w,
        y: (lm[0].y + (headUpVec.y / headDist) * headDist * 0.65) * h
      };
      let mouthMid = lm[0];
      if (canDrawJoint(lm[9], 9, offsets) && canDrawJoint(lm[10], 10, offsets)) {
        mouthMid = { x: (lm[9].x + lm[10].x) / 2, y: (lm[9].y + lm[10].y) / 2 };
      }
      const chin = {
        x: (mouthMid.x - (headUpVec.x / headDist) * headDist * 0.2) * w,
        y: (mouthMid.y - (headUpVec.y / headDist) * headDist * 0.2) * h
      };
      addPt(trailBuf, 'headTop', headTop);
      addPt(trailBuf, 'chin', chin);
    }

    const trailJointMap = [
      [12, 'rShoulder'], [11, 'lShoulder'], [14, 'rElbow'], [13, 'lElbow'],
      [16, 'rWrist'], [15, 'lWrist'], [24, 'rHip'], [23, 'lHip'],
      [26, 'rKnee'], [25, 'lKnee'], [28, 'rAnkle'], [27, 'lAnkle']
    ];
    trailJointMap.forEach(([i, key]) => {
      if (isJointConfident(lm[i]) || (offsets && offsets[i])) addPt(trailBuf, key, { x: lm[i].x * w, y: lm[i].y * h });
    });

    selectedTrails.forEach(key => {
      if (trailBuf[key] && trailBuf[key].length > 0) {
        const pts = trailBuf[key];
        for (let i = 1; i < pts.length; i++) {
          ctx.strokeStyle = trailColors[key];
          ctx.globalAlpha = (i / pts.length) * 0.85;
          ctx.lineWidth = Math.max(2, Math.floor(w / 240));
          ctx.beginPath();
          ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
          ctx.lineTo(pts[i].x, pts[i].y);
          ctx.stroke();
        }
        const last = pts[pts.length - 1];
        ctx.fillStyle = trailColors[key];
        ctx.beginPath();
        ctx.arc(last.x, last.y, 4, 0, 2 * Math.PI);
        ctx.fill();
      }
    });

    drawAngles(ctx, lm, w, h, trunkCenter, label);
  }
  ctx.restore();
}

function drawBadge(ctx, pos, text) {
  ctx.save();
  const fontSize = Math.max(11, Math.floor(ctx.canvas.width / 38));
  ctx.font = `bold ${fontSize}px sans-serif`;
  const metrics = ctx.measureText(text);
  const bgW = metrics.width + 10;
  const bgH = fontSize + 6;
  const x = pos.x + 6;
  const y = pos.y - bgH / 2;

  ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
  ctx.strokeStyle = "#ffd43b";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(x, y, bgW, bgH, 4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#ffd43b";
  ctx.fillText(text, x + 5, y + fontSize);
  ctx.restore();
}

const lastAngleHold = {};

function setAnglePanel(id, text, ok) {
  if (!ok) return;
  lastAngleHold[id] = text;
  const el = document.getElementById(id);
  if (el) el.innerText = text;
}

function drawAngles(ctx, lm, w, h, trunkCenter, label) {
  const prefix = currentMode === 'overlay' ? `[${label}] ` : '';
  const trunkReady = [11, 12, 23, 24].every(i => isJointUsable(lm[i]));
  if (!trunkReady) return;

  const shoMid = VCalc.mid(lm[11], lm[12]);
  const hipMid = VCalc.mid(lm[23], lm[24]);
  const trunkVec = VCalc.sub(shoMid, hipMid);
  const shoulderLine = VCalc.sub(lm[12], lm[11]);
  const pelvisLine = VCalc.sub(lm[24], lm[23]);

  const trunkY = VCalc.normalize(trunkVec);
  const trunkX = VCalc.normalize(VCalc.sub(lm[11], lm[12]));
  const trunkZ = VCalc.normalize(VCalc.cross(trunkX, trunkY));

  const flex = Math.atan2(trunkVec.z || 0, trunkVec.y) * (180 / Math.PI);
  const lat = Math.atan2(trunkVec.x, trunkVec.y) * (180 / Math.PI);
  const rot = (Math.atan2(shoulderLine.z || 0, shoulderLine.x) - Math.atan2(pelvisLine.z || 0, pelvisLine.x)) * (180 / Math.PI);

  if (label === 'A') {
    setAnglePanel('trunk_fe', `${flex >= 0 ? '屈 ' : '伸 '}${Math.abs(flex).toFixed(1)}°`, true);
    setAnglePanel('trunk_lb', `${lat >= 0 ? '右 ' : '左 '}${Math.abs(lat).toFixed(1)}°`, true);
    setAnglePanel('trunk_rot', `${rot >= 0 ? '右 ' : '左 '}${Math.abs(rot).toFixed(1)}°`, true);
  }

  if (selectedOverlays.has('trunk_fe') && trunkCenter) drawBadge(ctx, trunkCenter, `${prefix}体幹:${flex >= 0 ? '屈' : '伸'}${Math.abs(flex).toFixed(0)}°`);
  if (selectedOverlays.has('trunk_lb') && trunkCenter) drawBadge(ctx, trunkCenter, `${prefix}側屈:${lat >= 0 ? '右' : '左'}${Math.abs(lat).toFixed(0)}°`);
  if (selectedOverlays.has('trunk_rot') && trunkCenter) drawBadge(ctx, trunkCenter, `${prefix}回旋:${rot >= 0 ? '右' : '左'}${Math.abs(rot).toFixed(0)}°`);

  const rElbowOk = [12, 14, 16].every(i => isJointUsable(lm[i]));
  const lElbowOk = [11, 13, 15].every(i => isJointUsable(lm[i]));
  if (rElbowOk || lElbowOk) {
    const rElbow = rElbowOk ? Math.max(0, 180 - VCalc.angleDeg(VCalc.sub(lm[12], lm[14]), VCalc.sub(lm[16], lm[14]))) : null;
    const lElbow = lElbowOk ? Math.max(0, 180 - VCalc.angleDeg(VCalc.sub(lm[11], lm[13]), VCalc.sub(lm[15], lm[13]))) : null;
    if (label === 'A') {
      if (rElbow != null) setAnglePanel('r_elbow_fe', `屈 ${rElbow.toFixed(1)}°`, true);
      if (lElbow != null) setAnglePanel('l_elbow_fe', `屈 ${lElbow.toFixed(1)}°`, true);
    }
    if (selectedOverlays.has('r_elbow') && rElbow != null && !isJointHidden(lm[14])) drawBadge(ctx, { x: lm[14].x * w, y: lm[14].y * h }, `${prefix}右肘:${rElbow.toFixed(0)}°`);
    if (selectedOverlays.has('l_elbow') && lElbow != null && !isJointHidden(lm[13])) drawBadge(ctx, { x: lm[13].x * w, y: lm[13].y * h }, `${prefix}左肘:${lElbow.toFixed(0)}°`);
  }

  const rKneeOk = [24, 26, 28].every(i => isJointUsable(lm[i]));
  const lKneeOk = [23, 25, 27].every(i => isJointUsable(lm[i]));
  if (rKneeOk || lKneeOk) {
    const rKnee = rKneeOk ? Math.max(0, 180 - VCalc.angleDeg(VCalc.sub(lm[24], lm[26]), VCalc.sub(lm[28], lm[26]))) : null;
    const lKnee = lKneeOk ? Math.max(0, 180 - VCalc.angleDeg(VCalc.sub(lm[23], lm[25]), VCalc.sub(lm[27], lm[25]))) : null;
    if (label === 'A') {
      if (rKnee != null) setAnglePanel('r_knee_fe', `屈 ${rKnee.toFixed(1)}°`, true);
      if (lKnee != null) setAnglePanel('l_knee_fe', `屈 ${lKnee.toFixed(1)}°`, true);
    }
    if (selectedOverlays.has('r_knee') && rKnee != null && !isJointHidden(lm[26])) drawBadge(ctx, { x: lm[26].x * w, y: lm[26].y * h }, `${prefix}右膝:${rKnee.toFixed(0)}°`);
    if (selectedOverlays.has('l_knee') && lKnee != null && !isJointHidden(lm[25])) drawBadge(ctx, { x: lm[25].x * w, y: lm[25].y * h }, `${prefix}左膝:${lKnee.toFixed(0)}°`);
  }

  const rShoOk = [12, 14, 16].every(i => isJointUsable(lm[i]));
  const lShoOk = [11, 13, 15].every(i => isJointUsable(lm[i]));
  if (rShoOk || lShoOk) {
    const rArm = rShoOk ? VCalc.normalize(VCalc.sub(lm[14], lm[12])) : null;
    const lArm = lShoOk ? VCalc.normalize(VCalc.sub(lm[13], lm[11])) : null;
    const rForeArm = rShoOk ? VCalc.normalize(VCalc.sub(lm[16], lm[14])) : null;
    const lForeArm = lShoOk ? VCalc.normalize(VCalc.sub(lm[15], lm[13])) : null;

    const rShoFlex = rArm ? Math.asin(Math.min(Math.max(VCalc.dot(rArm, trunkZ), -1), 1)) * (180 / Math.PI) : null;
    const lShoFlex = lArm ? Math.asin(Math.min(Math.max(VCalc.dot(lArm, trunkZ), -1), 1)) * (180 / Math.PI) : null;
    const rShoAbd = rArm ? Math.asin(Math.min(Math.max(VCalc.dot(rArm, trunkX), -1), 1)) * (180 / Math.PI) : null;
    const lShoAbd = lArm ? Math.asin(Math.min(Math.max(-VCalc.dot(lArm, trunkX), -1), 1)) * (180 / Math.PI) : null;
    const rShoHa = rArm ? Math.atan2(VCalc.dot(rArm, trunkZ), VCalc.dot(rArm, trunkX)) * (180 / Math.PI) : null;
    const lShoHa = lArm ? Math.atan2(VCalc.dot(lArm, trunkZ), -VCalc.dot(lArm, trunkX)) * (180 / Math.PI) : null;
    const rShoRot = rForeArm ? Math.asin(Math.min(Math.max(-VCalc.dot(rForeArm, trunkX), -1), 1)) * (180 / Math.PI) : null;
    const lShoRot = lForeArm ? Math.asin(Math.min(Math.max(VCalc.dot(lForeArm, trunkX), -1), 1)) * (180 / Math.PI) : null;

    if (label === 'A') {
      if (rShoFlex != null) setAnglePanel('r_sho_fe_aa', `${rShoFlex >= 0 ? '屈' : '伸'}${Math.abs(rShoFlex).toFixed(0)}° / ${rShoAbd >= 0 ? '外' : '内'}${Math.abs(rShoAbd).toFixed(0)}°`, true);
      if (lShoFlex != null) setAnglePanel('l_sho_fe_aa', `${lShoFlex >= 0 ? '屈' : '伸'}${Math.abs(lShoFlex).toFixed(0)}° / ${lShoAbd >= 0 ? '外' : '内'}${Math.abs(lShoAbd).toFixed(0)}°`, true);
      if (rShoHa != null) setAnglePanel('r_sho_ha', `${rShoHa >= 0 ? '水内 ' : '水外 '}${Math.abs(rShoHa).toFixed(1)}°`, true);
      if (lShoHa != null) setAnglePanel('l_sho_ha', `${lShoHa >= 0 ? '水内 ' : '水外 '}${Math.abs(lShoHa).toFixed(1)}°`, true);
      if (rShoRot != null) setAnglePanel('r_sho_rot', `${rShoRot >= 0 ? '内旋 ' : '外旋 '}${Math.abs(rShoRot).toFixed(1)}°`, true);
      if (lShoRot != null) setAnglePanel('l_sho_rot', `${lShoRot >= 0 ? '内旋 ' : '外旋 '}${Math.abs(lShoRot).toFixed(1)}°`, true);
    }

    if (selectedOverlays.has('r_sho') && rShoFlex != null && !isJointHidden(lm[12])) drawBadge(ctx, { x: lm[12].x * w, y: lm[12].y * h }, `${prefix}右肩:${rShoFlex >= 0 ? '屈' : '伸'}${Math.abs(rShoFlex).toFixed(0)}°`);
    if (selectedOverlays.has('l_sho') && lShoFlex != null && !isJointHidden(lm[11])) drawBadge(ctx, { x: lm[11].x * w, y: lm[11].y * h }, `${prefix}左肩:${lShoFlex >= 0 ? '屈' : '伸'}${Math.abs(lShoFlex).toFixed(0)}°`);
  }

  const rHipOk = [24, 26, 28].every(i => isJointUsable(lm[i]));
  const lHipOk = [23, 25, 27].every(i => isJointUsable(lm[i]));
  if (rHipOk || lHipOk) {
    const rThigh = rHipOk ? VCalc.normalize(VCalc.sub(lm[26], lm[24])) : null;
    const lThigh = lHipOk ? VCalc.normalize(VCalc.sub(lm[25], lm[23])) : null;
    const rShank = rHipOk ? VCalc.normalize(VCalc.sub(lm[28], lm[26])) : null;
    const lShank = lHipOk ? VCalc.normalize(VCalc.sub(lm[27], lm[25])) : null;

    const rHipFlex = rThigh ? Math.asin(Math.min(Math.max(VCalc.dot(rThigh, trunkZ), -1), 1)) * (180 / Math.PI) : null;
    const lHipFlex = lThigh ? Math.asin(Math.min(Math.max(VCalc.dot(lThigh, trunkZ), -1), 1)) * (180 / Math.PI) : null;
    const rHipAbd = rThigh ? Math.asin(Math.min(Math.max(VCalc.dot(rThigh, trunkX), -1), 1)) * (180 / Math.PI) : null;
    const lHipAbd = lThigh ? Math.asin(Math.min(Math.max(-VCalc.dot(lThigh, trunkX), -1), 1)) * (180 / Math.PI) : null;
    const rHipRot = rShank ? Math.asin(Math.min(Math.max(-VCalc.dot(rShank, trunkX), -1), 1)) * (180 / Math.PI) : null;
    const lHipRot = lShank ? Math.asin(Math.min(Math.max(VCalc.dot(lShank, trunkX), -1), 1)) * (180 / Math.PI) : null;

    if (label === 'A') {
      if (rHipFlex != null) setAnglePanel('r_hip_fe_aa', `${rHipFlex >= 0 ? '屈' : '伸'}${Math.abs(rHipFlex).toFixed(0)}° / ${rHipAbd >= 0 ? '外' : '内'}${Math.abs(rHipAbd).toFixed(0)}°`, true);
      if (lHipFlex != null) setAnglePanel('l_hip_fe_aa', `${lHipFlex >= 0 ? '屈' : '伸'}${Math.abs(lHipFlex).toFixed(0)}° / ${lHipAbd >= 0 ? '外' : '内'}${Math.abs(lHipAbd).toFixed(0)}°`, true);
      if (rHipRot != null) setAnglePanel('r_hip_rot', `${rHipRot >= 0 ? '内旋 ' : '外旋 '}${Math.abs(rHipRot).toFixed(1)}°`, true);
      if (lHipRot != null) setAnglePanel('l_hip_rot', `${lHipRot >= 0 ? '内旋 ' : '外旋 '}${Math.abs(lHipRot).toFixed(1)}°`, true);
    }

    if (selectedOverlays.has('r_hip') && rHipFlex != null && !isJointHidden(lm[24])) drawBadge(ctx, { x: lm[24].x * w, y: lm[24].y * h }, `${prefix}右股:${rHipFlex >= 0 ? '屈' : '伸'}${Math.abs(rHipFlex).toFixed(0)}°`);
    if (selectedOverlays.has('l_hip') && lHipFlex != null && !isJointHidden(lm[23])) drawBadge(ctx, { x: lm[23].x * w, y: lm[23].y * h }, `${prefix}左股:${lHipFlex >= 0 ? '屈' : '伸'}${Math.abs(lHipFlex).toFixed(0)}°`);
  }

  const rAnkOk = [26, 28, 32].every(i => isJointUsable(lm[i]));
  const lAnkOk = [25, 27, 31].every(i => isJointUsable(lm[i]));
  if (rAnkOk || lAnkOk) {
    const rAnk = rAnkOk ? 90 - VCalc.angleDeg(VCalc.sub(lm[26], lm[28]), VCalc.sub(lm[32], lm[28])) : null;
    const lAnk = lAnkOk ? 90 - VCalc.angleDeg(VCalc.sub(lm[25], lm[27]), VCalc.sub(lm[31], lm[27])) : null;
    if (label === 'A') {
      if (rAnk != null) setAnglePanel('r_ank_df', `${rAnk >= 0 ? '背 ' : '底 '}${Math.abs(rAnk).toFixed(1)}°`, true);
      if (lAnk != null) setAnglePanel('l_ank_df', `${lAnk >= 0 ? '背 ' : '底 '}${Math.abs(lAnk).toFixed(1)}°`, true);
    }
    if (selectedOverlays.has('r_ank') && rAnk != null && !isJointHidden(lm[28])) drawBadge(ctx, { x: lm[28].x * w, y: lm[28].y * h }, `${prefix}右足:${rAnk >= 0 ? '背' : '底'}${Math.abs(rAnk).toFixed(0)}°`);
    if (selectedOverlays.has('l_ank') && lAnk != null && !isJointHidden(lm[27])) drawBadge(ctx, { x: lm[27].x * w, y: lm[27].y * h }, `${prefix}左足:${lAnk >= 0 ? '背' : '底'}${Math.abs(lAnk).toFixed(0)}°`);
  }
}
