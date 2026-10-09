function drawFrame(canvas, ctx, video, lmRaw, trailBuf, skeletonColor, label, offsets = {}, targetRoi = null) {
  if (!video.videoWidth || !video.videoHeight || video.readyState < 2) return;
  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
  const w = canvas.width;
  const h = canvas.height;

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

    ctx.strokeStyle = skeletonColor;
    ctx.lineWidth = Math.max(2, Math.floor(w / 220));
    connections.forEach(([i, j]) => {
      if (lm[i] && lm[j] && lm[i].visibility > 0.4 && lm[j].visibility > 0.4) {
        ctx.beginPath();
        ctx.moveTo(lm[i].x * w, lm[i].y * h);
        ctx.lineTo(lm[j].x * w, lm[j].y * h);
        ctx.stroke();
      }
    });

    const validJoints = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
    validJoints.forEach(i => {
      if (lm[i] && lm[i].visibility > 0.4) {
        ctx.fillStyle = offsets[i] ? "#ffd43b" : (label === "B" && currentMode === 'overlay' ? "#ffa94d" : "#ff0055");
        ctx.beginPath();
        ctx.arc(lm[i].x * w, lm[i].y * h, Math.max(5, Math.floor(w / 120)), 0, 2 * Math.PI);
        ctx.fill();
        if (offsets[i]) {
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    });

    let trunkCenter = null;
    if (lm[11] && lm[12] && lm[23] && lm[24] && lm[11].visibility > 0.4 && lm[12].visibility > 0.4 && lm[23].visibility > 0.4 && lm[24].visibility > 0.4) {
      const shoMid = { x: (lm[11].x + lm[12].x) / 2, y: (lm[11].y + lm[12].y) / 2 };
      const hipMid = { x: (lm[23].x + lm[24].x) / 2, y: (lm[23].y + lm[24].y) / 2 };
      trunkCenter = { x: (shoMid.x + hipMid.x) / 2 * w, y: (shoMid.y + hipMid.y) / 2 * h };
      addPt(trailBuf, 'trunkCenter', trunkCenter);
    }

    if (lm[0] && lm[11] && lm[12] && lm[0].visibility > 0.4 && lm[11].visibility > 0.4 && lm[12].visibility > 0.4) {
      const shoMid = { x: (lm[11].x + lm[12].x) / 2, y: (lm[11].y + lm[12].y) / 2 };
      const headUpVec = { x: lm[0].x - shoMid.x, y: lm[0].y - shoMid.y };
      const headDist = Math.hypot(headUpVec.x, headUpVec.y) || 1;

      const headTop = {
        x: (lm[0].x + (headUpVec.x / headDist) * headDist * 0.65) * w,
        y: (lm[0].y + (headUpVec.y / headDist) * headDist * 0.65) * h
      };
      let mouthMid = lm[0];
      if (lm[9] && lm[10] && lm[9].visibility > 0.3 && lm[10].visibility > 0.3) {
        mouthMid = { x: (lm[9].x + lm[10].x) / 2, y: (lm[9].y + lm[10].y) / 2 };
      }
      const chin = {
        x: (mouthMid.x - (headUpVec.x / headDist) * headDist * 0.2) * w,
        y: (mouthMid.y - (headUpVec.y / headDist) * headDist * 0.2) * h
      };
      addPt(trailBuf, 'headTop', headTop);
      addPt(trailBuf, 'chin', chin);
    }

    if (lm[12] && lm[12].visibility > 0.4) addPt(trailBuf, 'rShoulder', { x: lm[12].x * w, y: lm[12].y * h });
    if (lm[11] && lm[11].visibility > 0.4) addPt(trailBuf, 'lShoulder', { x: lm[11].x * w, y: lm[11].y * h });
    if (lm[14] && lm[14].visibility > 0.4) addPt(trailBuf, 'rElbow', { x: lm[14].x * w, y: lm[14].y * h });
    if (lm[13] && lm[13].visibility > 0.4) addPt(trailBuf, 'lElbow', { x: lm[13].x * w, y: lm[13].y * h });
    if (lm[16] && lm[16].visibility > 0.4) addPt(trailBuf, 'rWrist', { x: lm[16].x * w, y: lm[16].y * h });
    if (lm[15] && lm[15].visibility > 0.4) addPt(trailBuf, 'lWrist', { x: lm[15].x * w, y: lm[15].y * h });
    if (lm[24] && lm[24].visibility > 0.4) addPt(trailBuf, 'rHip', { x: lm[24].x * w, y: lm[24].y * h });
    if (lm[23] && lm[23].visibility > 0.4) addPt(trailBuf, 'lHip', { x: lm[23].x * w, y: lm[23].y * h });
    if (lm[26] && lm[26].visibility > 0.4) addPt(trailBuf, 'rKnee', { x: lm[26].x * w, y: lm[26].y * h });
    if (lm[25] && lm[25].visibility > 0.4) addPt(trailBuf, 'lKnee', { x: lm[25].x * w, y: lm[25].y * h });
    if (lm[28] && lm[28].visibility > 0.4) addPt(trailBuf, 'rAnkle', { x: lm[28].x * w, y: lm[28].y * h });
    if (lm[27] && lm[27].visibility > 0.4) addPt(trailBuf, 'lAnkle', { x: lm[27].x * w, y: lm[27].y * h });

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

function drawAngles(ctx, lm, w, h, trunkCenter, label) {
  if (!lm[11] || !lm[12] || !lm[23] || !lm[24]) return;

  const shoMid = VCalc.mid(lm[11], lm[12]);
  const hipMid = VCalc.mid(lm[23], lm[24]);
  const trunkVec = VCalc.sub(shoMid, hipMid);
  const shoulderLine = VCalc.sub(lm[12], lm[11]);
  const pelvisLine = VCalc.sub(lm[24], lm[23]);

  const trunkY = VCalc.normalize(trunkVec);
  const trunkX = VCalc.normalize(VCalc.sub(lm[11], lm[12]));
  const trunkZ = VCalc.normalize(VCalc.cross(trunkX, trunkY));

  const prefix = currentMode === 'overlay' ? `[${label}] ` : '';

  const flex = Math.atan2(trunkVec.z || 0, trunkVec.y) * (180 / Math.PI);
  const lat = Math.atan2(trunkVec.x, trunkVec.y) * (180 / Math.PI);
  const rot = (Math.atan2(shoulderLine.z || 0, shoulderLine.x) - Math.atan2(pelvisLine.z || 0, pelvisLine.x)) * (180 / Math.PI);

  if (label === 'A') {
    document.getElementById('trunk_fe').innerText = `${flex >= 0 ? '屈 ' : '伸 '}${Math.abs(flex).toFixed(1)}°`;
    document.getElementById('trunk_lb').innerText = `${lat >= 0 ? '右 ' : '左 '}${Math.abs(lat).toFixed(1)}°`;
    document.getElementById('trunk_rot').innerText = `${rot >= 0 ? '右 ' : '左 '}${Math.abs(rot).toFixed(1)}°`;
  }

  if (selectedOverlays.has('trunk_fe') && trunkCenter) drawBadge(ctx, trunkCenter, `${prefix}体幹:${flex >= 0 ? '屈' : '伸'}${Math.abs(flex).toFixed(0)}°`);
  if (selectedOverlays.has('trunk_lb') && trunkCenter) drawBadge(ctx, trunkCenter, `${prefix}側屈:${lat >= 0 ? '右' : '左'}${Math.abs(lat).toFixed(0)}°`);
  if (selectedOverlays.has('trunk_rot') && trunkCenter) drawBadge(ctx, trunkCenter, `${prefix}回旋:${rot >= 0 ? '右' : '左'}${Math.abs(rot).toFixed(0)}°`);

  if (lm[14] && lm[16] && lm[13] && lm[15]) {
    const rElbow = Math.max(0, 180 - VCalc.angleDeg(VCalc.sub(lm[12], lm[14]), VCalc.sub(lm[16], lm[14])));
    const lElbow = Math.max(0, 180 - VCalc.angleDeg(VCalc.sub(lm[11], lm[13]), VCalc.sub(lm[15], lm[13])));
    if (label === 'A') {
      document.getElementById('r_elbow_fe').innerText = `屈 ${rElbow.toFixed(1)}°`;
      document.getElementById('l_elbow_fe').innerText = `屈 ${lElbow.toFixed(1)}°`;
    }
    if (selectedOverlays.has('r_elbow') && lm[14].visibility > 0.4) drawBadge(ctx, { x: lm[14].x * w, y: lm[14].y * h }, `${prefix}右肘:${rElbow.toFixed(0)}°`);
    if (selectedOverlays.has('l_elbow') && lm[13].visibility > 0.4) drawBadge(ctx, { x: lm[13].x * w, y: lm[13].y * h }, `${prefix}左肘:${lElbow.toFixed(0)}°`);
  }

  if (lm[26] && lm[28] && lm[25] && lm[27]) {
    const rKnee = Math.max(0, 180 - VCalc.angleDeg(VCalc.sub(lm[24], lm[26]), VCalc.sub(lm[28], lm[26])));
    const lKnee = Math.max(0, 180 - VCalc.angleDeg(VCalc.sub(lm[23], lm[25]), VCalc.sub(lm[27], lm[25])));
    if (label === 'A') {
      document.getElementById('r_knee_fe').innerText = `屈 ${rKnee.toFixed(1)}°`;
      document.getElementById('l_knee_fe').innerText = `屈 ${lKnee.toFixed(1)}°`;
    }
    if (selectedOverlays.has('r_knee') && lm[26].visibility > 0.4) drawBadge(ctx, { x: lm[26].x * w, y: lm[26].y * h }, `${prefix}右膝:${rKnee.toFixed(0)}°`);
    if (selectedOverlays.has('l_knee') && lm[25].visibility > 0.4) drawBadge(ctx, { x: lm[25].x * w, y: lm[25].y * h }, `${prefix}左膝:${lKnee.toFixed(0)}°`);
  }

  if (lm[14] && lm[13] && lm[16] && lm[15]) {
    const rArm = VCalc.normalize(VCalc.sub(lm[14], lm[12]));
    const lArm = VCalc.normalize(VCalc.sub(lm[13], lm[11]));

    const rShoFlex = Math.asin(Math.min(Math.max(VCalc.dot(rArm, trunkZ), -1), 1)) * (180 / Math.PI);
    const lShoFlex = Math.asin(Math.min(Math.max(VCalc.dot(lArm, trunkZ), -1), 1)) * (180 / Math.PI);

    const rShoAbd = Math.asin(Math.min(Math.max(VCalc.dot(rArm, trunkX), -1), 1)) * (180 / Math.PI);
    const lShoAbd = Math.asin(Math.min(Math.max(-VCalc.dot(lArm, trunkX), -1), 1)) * (180 / Math.PI);

    const rShoHa = Math.atan2(VCalc.dot(rArm, trunkZ), VCalc.dot(rArm, trunkX)) * (180 / Math.PI);
    const lShoHa = Math.atan2(VCalc.dot(lArm, trunkZ), -VCalc.dot(lArm, trunkX)) * (180 / Math.PI);

    const rForeArm = VCalc.normalize(VCalc.sub(lm[16], lm[14]));
    const lForeArm = VCalc.normalize(VCalc.sub(lm[15], lm[13]));
    const rShoRot = Math.asin(Math.min(Math.max(-VCalc.dot(rForeArm, trunkX), -1), 1)) * (180 / Math.PI);
    const lShoRot = Math.asin(Math.min(Math.max(VCalc.dot(lForeArm, trunkX), -1), 1)) * (180 / Math.PI);

    if (label === 'A') {
      document.getElementById('r_sho_fe_aa').innerText = `${rShoFlex >= 0 ? '屈' : '伸'}${Math.abs(rShoFlex).toFixed(0)}° / ${rShoAbd >= 0 ? '外' : '内'}${Math.abs(rShoAbd).toFixed(0)}°`;
      document.getElementById('l_sho_fe_aa').innerText = `${lShoFlex >= 0 ? '屈' : '伸'}${Math.abs(lShoFlex).toFixed(0)}° / ${lShoAbd >= 0 ? '外' : '内'}${Math.abs(lShoAbd).toFixed(0)}°`;
      document.getElementById('r_sho_ha').innerText = `${rShoHa >= 0 ? '水内 ' : '水外 '}${Math.abs(rShoHa).toFixed(1)}°`;
      document.getElementById('l_sho_ha').innerText = `${lShoHa >= 0 ? '水内 ' : '水外 '}${Math.abs(lShoHa).toFixed(1)}°`;
      document.getElementById('r_sho_rot').innerText = `${rShoRot >= 0 ? '内旋 ' : '外旋 '}${Math.abs(rShoRot).toFixed(1)}°`;
      document.getElementById('l_sho_rot').innerText = `${lShoRot >= 0 ? '内旋 ' : '外旋 '}${Math.abs(lShoRot).toFixed(1)}°`;
    }

    if (selectedOverlays.has('r_sho') && lm[12].visibility > 0.4) drawBadge(ctx, { x: lm[12].x * w, y: lm[12].y * h }, `${prefix}右肩:${rShoFlex >= 0 ? '屈' : '伸'}${Math.abs(rShoFlex).toFixed(0)}°`);
    if (selectedOverlays.has('l_sho') && lm[11].visibility > 0.4) drawBadge(ctx, { x: lm[11].x * w, y: lm[11].y * h }, `${prefix}左肩:${lShoFlex >= 0 ? '屈' : '伸'}${Math.abs(lShoFlex).toFixed(0)}°`);
  }

  if (lm[26] && lm[25] && lm[28] && lm[27]) {
    const rThigh = VCalc.normalize(VCalc.sub(lm[26], lm[24]));
    const lThigh = VCalc.normalize(VCalc.sub(lm[25], lm[23]));

    const rHipFlex = Math.asin(Math.min(Math.max(VCalc.dot(rThigh, trunkZ), -1), 1)) * (180 / Math.PI);
    const lHipFlex = Math.asin(Math.min(Math.max(VCalc.dot(lThigh, trunkZ), -1), 1)) * (180 / Math.PI);

    const rHipAbd = Math.asin(Math.min(Math.max(VCalc.dot(rThigh, trunkX), -1), 1)) * (180 / Math.PI);
    const lHipAbd = Math.asin(Math.min(Math.max(-VCalc.dot(lThigh, trunkX), -1), 1)) * (180 / Math.PI);

    const rShank = VCalc.normalize(VCalc.sub(lm[28], lm[26]));
    const lShank = VCalc.normalize(VCalc.sub(lm[27], lm[25]));
    const rHipRot = Math.asin(Math.min(Math.max(-VCalc.dot(rShank, trunkX), -1), 1)) * (180 / Math.PI);
    const lHipRot = Math.asin(Math.min(Math.max(VCalc.dot(lShank, trunkX), -1), 1)) * (180 / Math.PI);

    if (label === 'A') {
      document.getElementById('r_hip_fe_aa').innerText = `${rHipFlex >= 0 ? '屈' : '伸'}${Math.abs(rHipFlex).toFixed(0)}° / ${rHipAbd >= 0 ? '外' : '内'}${Math.abs(rHipAbd).toFixed(0)}°`;
      document.getElementById('l_hip_fe_aa').innerText = `${lHipFlex >= 0 ? '屈' : '伸'}${Math.abs(lHipFlex).toFixed(0)}° / ${lHipAbd >= 0 ? '外' : '内'}${Math.abs(lHipAbd).toFixed(0)}°`;
      document.getElementById('r_hip_rot').innerText = `${rHipRot >= 0 ? '内旋 ' : '外旋 '}${Math.abs(rHipRot).toFixed(1)}°`;
      document.getElementById('l_hip_rot').innerText = `${lHipRot >= 0 ? '内旋 ' : '外旋 '}${Math.abs(lHipRot).toFixed(1)}°`;
    }

    if (selectedOverlays.has('r_hip') && lm[24].visibility > 0.4) drawBadge(ctx, { x: lm[24].x * w, y: lm[24].y * h }, `${prefix}右股:${rHipFlex >= 0 ? '屈' : '伸'}${Math.abs(rHipFlex).toFixed(0)}°`);
    if (selectedOverlays.has('l_hip') && lm[23].visibility > 0.4) drawBadge(ctx, { x: lm[23].x * w, y: lm[23].y * h }, `${prefix}左股:${lHipFlex >= 0 ? '屈' : '伸'}${Math.abs(lHipFlex).toFixed(0)}°`);
  }

  if (lm[26] && lm[28] && lm[32] && lm[25] && lm[27] && lm[31]) {
    const rAnk = 90 - VCalc.angleDeg(VCalc.sub(lm[26], lm[28]), VCalc.sub(lm[32], lm[28]));
    const lAnk = 90 - VCalc.angleDeg(VCalc.sub(lm[25], lm[27]), VCalc.sub(lm[31], lm[27]));
    if (label === 'A') {
      document.getElementById('r_ank_df').innerText = `${rAnk >= 0 ? '背 ' : '底 '}${Math.abs(rAnk).toFixed(1)}°`;
      document.getElementById('l_ank_df').innerText = `${lAnk >= 0 ? '背 ' : '底 '}${Math.abs(lAnk).toFixed(1)}°`;
    }
    if (selectedOverlays.has('r_ank') && lm[28].visibility > 0.4) drawBadge(ctx, { x: lm[28].x * w, y: lm[28].y * h }, `${prefix}右足:${rAnk >= 0 ? '背' : '底'}${Math.abs(rAnk).toFixed(0)}°`);
    if (selectedOverlays.has('l_ank') && lm[27].visibility > 0.4) drawBadge(ctx, { x: lm[27].x * w, y: lm[27].y * h }, `${prefix}左足:${lAnk >= 0 ? '背' : '底'}${Math.abs(lAnk).toFixed(0)}°`);
  }
}
