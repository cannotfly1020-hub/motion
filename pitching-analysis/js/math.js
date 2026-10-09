function calcCurrentLeadKneeAngle(lm, box) {
    if (!lm) return null;
    const toPx = (p) => ({ x: box.x + p.x * box.w, y: box.y + p.y * box.h });
    const hipL = lm[23], hipR = lm[24], kneeL = lm[25], kneeR = lm[26], ankL = lm[27], ankR = lm[28];
    if (!hipL || !hipR || !kneeL || !kneeR || !ankL || !ankR) return null;

    const cur = planeData.sagittal;
    let useLeft = (cur.leadLegSide === 'left');
    if (!cur.leadLegSide) {
        useLeft = ankL.y > ankR.y || Math.abs(ankL.x - (hipL.x + hipR.x)/2) > Math.abs(ankR.x - (hipL.x + hipR.x)/2);
    }
    const leadHip = useLeft ? toPx(hipL) : toPx(hipR);
    const leadKnee = useLeft ? toPx(kneeL) : toPx(kneeR);
    const leadAnk = useLeft ? toPx(ankL) : toPx(ankR);
    return calcAngle(leadHip, leadKnee, leadAnk);
}

function calcAngle(p1, p2, p3) {
    const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
    const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };
    const dot = v1.x * v2.x + v1.y * v2.y;
    const mag1 = Math.hypot(v1.x, v1.y), mag2 = Math.hypot(v2.x, v2.y);
    if (mag1 === 0 || mag2 === 0) return 0;
    return Math.acos(Math.max(-1, Math.min(1, dot / (mag1 * mag2)))) * (180 / Math.PI);
}

function markPhase(key) {
    const cur = planeData[currentPlane];
    const names = {
        fc: currentPlane === 'sagittal' ? "① 接地(FC)" : "② 接地時(FC)",
        ff: "② 完全接地(FF)",
        mer: "③ 最大外旋(MER)",
        pk: "① 足上げ頂点(PK)",
        br: "③ リリース時(BR)"
    };

    if (cur.phases[key]) {
        cur.phases[key] = null;
        if (currentPlane === 'sagittal') {
            if (key === 'fc') cur.leadLegSide = null;
        } else {
            if (key === 'fc') {
                cur.toeOutAngle = null;
                cur.kneeValgusAngle = null;
                cur.pelvisObliquity = null;
            } else if (key === 'br') {
                cur.trunkTiltFrontal = null;
                cur.shoulderElbowAngle = null;
            }
        }
        updatePhaseBtnStyles();
        recalcPitchMetrics();
        redrawOverlay();
        mainResult.innerHTML = `<span style='color:#ff9500;'>${names[key]} を解除しました</span>`;
        return;
    }

    if (!video.videoWidth || !latestLandmarks) return;
    const box = getVideoRenderBox();
    const lm = latestLandmarks;
    const toPx = (p) => ({ x: box.x + p.x * box.w, y: box.y + p.y * box.h });

    cur.phases[key] = { time: video.currentTime };

    if (currentPlane === 'sagittal') {
        if (key === 'fc') {
            const ankL = lm[27], ankR = lm[28], heelL = lm[29], heelR = lm[30];
            const p1 = (ankL && ankL.visibility > 0.3) ? ankL : heelL;
            const p2 = (ankR && ankR.visibility > 0.3) ? ankR : heelR;
            if (p1 && p2) {
                const px1 = toPx(p1), px2 = toPx(p2);
                cur.phases.fc.stridePx = Math.hypot(px1.x - px2.x, px1.y - px2.y);
                cur.phases.fc.groundYNorm = Math.max(p1.y, p2.y);
                if (cur.manualGroundYNorm === null) cur.manualGroundYNorm = cur.phases.fc.groundYNorm;
            }
            const hipL = lm[23], hipR = lm[24];
            if (hipL && hipR && ankL && ankR) {
                cur.leadLegSide = (ankL.y > ankR.y || Math.abs(ankL.x - (hipL.x + hipR.x)/2) > Math.abs(ankR.x - (hipL.x + hipR.x)/2)) ? 'left' : 'right';
            }
        }
        if (key === 'ff') cur.phases.ff.kneeAngle = calcCurrentLeadKneeAngle(lm, box);
        if (key === 'mer') {
            const shR = lm[12], elR = lm[14], wrR = lm[16];
            if (shR && elR && wrR) cur.phases.mer.elbowAngle = calcAngle(toPx(shR), toPx(elR), toPx(wrR));
        }
    } else {
        if (key === 'pk') {
            const hipR = lm[24], ankR = lm[28];
            if (hipR && ankR) {
                const tilt = Math.atan2(hipR.x - ankR.x, -(hipR.y - ankR.y)) * (180 / Math.PI);
                cur.phases.pk.tilt = Math.abs(tilt);
            }
        }
        if (key === 'fc') {
            const ankL = lm[27], ankR = lm[28], hipL = lm[23], hipR = lm[24], kneeL = lm[25], kneeR = lm[26];
            const footL = lm[31], footR = lm[32];

            const isLeftLead = (ankL && ankR) ? (ankL.y > ankR.y) : true;
            const leadHip = isLeftLead ? hipL : hipR;
            const leadKnee = isLeftLead ? kneeL : kneeR;
            const leadAnk = isLeftLead ? ankL : ankR;
            const leadFoot = isLeftLead ? footL : footR;

            if (leadHip && leadKnee && leadAnk) {
                cur.kneeValgusAngle = calcAngle(toPx(leadHip), toPx(leadKnee), toPx(leadAnk));
            }

            if (leadAnk && leadFoot) {
                const pAnk = toPx(leadAnk), pFoot = toPx(leadFoot);
                const toeAngle = Math.atan2(pFoot.x - pAnk.x, pFoot.y - pAnk.y) * (180 / Math.PI);
                cur.toeOutAngle = Math.abs(toeAngle);
            }

            if (hipL && hipR) {
                const p1 = toPx(hipL), p2 = toPx(hipR);
                const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI);
                cur.pelvisObliquity = Math.abs(angle);
            }
        }
        if (key === 'br') {
            const shL = lm[11], shR = lm[12], elR = lm[14], hipL = lm[23], hipR = lm[24];
            if (shL && shR && hipL && hipR) {
                const midSh = { x: (shL.x + shR.x) / 2, y: (shL.y + shR.y) / 2 };
                const midHip = { x: (hipL.x + hipR.x) / 2, y: (hipL.y + hipR.y) / 2 };
                const spineAngle = Math.atan2(midSh.x - midHip.x, -(midSh.y - midHip.y)) * (180 / Math.PI);
                cur.trunkTiltFrontal = Math.abs(spineAngle);
            }
            if (shL && shR && elR) {
                const shVec = { x: shR.x - shL.x, y: shR.y - shL.y };
                const armVec = { x: elR.x - shR.x, y: elR.y - shR.y };
                const dot = shVec.x * armVec.x + shVec.y * armVec.y;
                const mag = Math.hypot(shVec.x, shVec.y) * Math.hypot(armVec.x, armVec.y);
                if (mag > 0) cur.shoulderElbowAngle = Math.acos(Math.max(-1, Math.min(1, dot / mag))) * (180 / Math.PI);
            }
        }
    }

    updatePhaseBtnStyles();
    recalcPitchMetrics();
    redrawOverlay();
    mainResult.innerHTML = `<span style='color:#00ffcc;'>${names[key]} を記録しました</span>`;
}

function recalcPitchMetrics() {
    const box = getVideoRenderBox();

    if (currentPlane === 'sagittal') {
        const cur = planeData.sagittal;
        const resStride = document.getElementById('res_stride');
        if (resStride) resStride.innerText = (cur.phases.fc && cur.phases.fc.stridePx && cur.pxPerCm) ? `${(cur.phases.fc.stridePx / cur.pxPerCm).toFixed(1)} cm` : "--- cm";

        const resMer = document.getElementById('res_mer_elbow');
        if (resMer) resMer.innerText = (cur.phases.mer && cur.phases.mer.elbowAngle) ? `${cur.phases.mer.elbowAngle.toFixed(1)}°` : "---°";

        const resFFKnee = document.getElementById('res_ff_knee');
        if (resFFKnee) resFFKnee.innerText = (cur.phases.ff && cur.phases.ff.kneeAngle) ? `${cur.phases.ff.kneeAngle.toFixed(1)}°` : "---°";

        const resBRKnee = document.getElementById('res_br_knee');
        if (resBRKnee) resBRKnee.innerText = (cur.brKneeAngle !== null) ? `${cur.brKneeAngle.toFixed(1)}°` : "---°";

        const resRelH = document.getElementById('res_release_h');
        if (resRelH) {
            if (cur.manualReleasePoint && cur.manualGroundYNorm !== null && cur.pxPerCm) {
                const wristY = box.y + cur.manualReleasePoint.y * box.h;
                const groundY = box.y + cur.manualGroundYNorm * box.h;
                resRelH.innerText = `${Math.max(0, (groundY - wristY) / cur.pxPerCm).toFixed(1)} cm`;
            } else {
                resRelH.innerText = "--- cm";
            }
        }
    } else {
        const cur = planeData.frontal;
        const resToe = document.getElementById('res_toe_out');
        if (resToe) resToe.innerText = (cur.toeOutAngle !== null) ? `${cur.toeOutAngle.toFixed(1)}°` : "---°";

        const resValgus = document.getElementById('res_knee_valgus');
        if (resValgus) resValgus.innerText = (cur.kneeValgusAngle !== null) ? `${cur.kneeValgusAngle.toFixed(1)}°` : "---°";

        const resPelvis = document.getElementById('res_pelvis_tilt');
        if (resPelvis) resPelvis.innerText = (cur.pelvisObliquity !== null) ? `${cur.pelvisObliquity.toFixed(1)}°` : "---°";

        const resTrunk = document.getElementById('res_trunk_lateral');
        if (resTrunk) resTrunk.innerText = (cur.trunkTiltFrontal !== null) ? `${cur.trunkTiltFrontal.toFixed(1)}°` : "---°";

        const resShEl = document.getElementById('res_shoulder_elbow');
        if (resShEl) resShEl.innerText = (cur.shoulderElbowAngle !== null) ? `${cur.shoulderElbowAngle.toFixed(1)}°` : "---°";

        const resPK = document.getElementById('res_pk_tilt');
        if (resPK) resPK.innerText = (cur.phases.pk && cur.phases.pk.tilt !== undefined) ? `${cur.phases.pk.tilt.toFixed(1)}°` : "---°";
    }
}
