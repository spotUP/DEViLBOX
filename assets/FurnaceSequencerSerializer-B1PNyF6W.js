import { bZ as FurnaceDispatchEngine } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
async function uploadFurnaceToSequencer(native, subsongIdx = 0) {
  var _a, _b, _c;
  const sub = native.subsongs[subsongIdx];
  if (!sub) throw new Error(`Subsong ${subsongIdx} not found`);
  const engine = FurnaceDispatchEngine.getInstance();
  const numChannels = sub.channels.length;
  const patLen = sub.patLen;
  const ordersLen = sub.ordersLen;
  await engine.seqLoadSong(numChannels, patLen, ordersLen);
  for (let ch = 0; ch < numChannels; ch++) {
    const effectCols = ((_a = sub.channels[ch]) == null ? void 0 : _a.effectCols) ?? 1;
    engine.seqSetEffectCols(ch, effectCols);
  }
  for (let ch = 0; ch < numChannels; ch++) {
    for (let pos = 0; pos < ordersLen; pos++) {
      const patIdx = ((_b = sub.orders[ch]) == null ? void 0 : _b[pos]) ?? 0;
      engine.seqSetOrder(ch, pos, patIdx);
    }
  }
  for (let ch = 0; ch < numChannels; ch++) {
    const chanData = sub.channels[ch];
    if (!chanData) continue;
    const effectCols = chanData.effectCols;
    for (const [patIdx, patData] of chanData.patterns) {
      for (let row = 0; row < patLen; row++) {
        const fRow = patData.rows[row];
        if (!fRow) continue;
        if (fRow.note !== -1) {
          const noteForSeq = fRow.note >= 253 ? fRow.note : fRow.note + 60;
          engine.seqSetCell(ch, patIdx, row, 0, noteForSeq);
        }
        if (fRow.ins !== -1) {
          engine.seqSetCell(ch, patIdx, row, 1, fRow.ins);
        }
        if (fRow.vol !== -1) {
          engine.seqSetCell(ch, patIdx, row, 2, fRow.vol);
        }
        for (let fx = 0; fx < effectCols && fx < fRow.effects.length; fx++) {
          const eff = fRow.effects[fx];
          if (!eff) continue;
          if (eff.cmd !== -1) {
            engine.seqSetCell(ch, patIdx, row, 3 + fx * 2, eff.cmd);
          }
          if (eff.val !== -1) {
            engine.seqSetCell(ch, patIdx, row, 4 + fx * 2, eff.val);
          }
        }
      }
    }
  }
  if (sub.speedPattern && sub.speedPattern.length > 0) {
    engine.seqPostMessage({ type: "seqSetSpeedPattern", values: sub.speedPattern });
  } else {
    engine.seqPostMessage({ type: "seqSetSpeed", speed1: sub.speed1, speed2: sub.speed2 });
  }
  engine.seqPostMessage({
    type: "seqSetTempo",
    virtualN: sub.virtualTempoN,
    virtualD: sub.virtualTempoD
  });
  engine.seqPostMessage({ type: "setTickRate", hz: sub.hz || 60 });
  if (native.compatFlags) {
    let flags, flagsExt, pitchSlideSpeed;
    if (native.compatFlags._packed) {
      const cf = native.compatFlags;
      flags = cf._flags;
      flagsExt = cf._flagsExt;
      pitchSlideSpeed = cf._pitchSlideSpeed;
    } else {
      ({ flags, flagsExt, pitchSlideSpeed } = packCompatFlags(native.compatFlags));
    }
    engine.seqPostMessage({ type: "seqSetCompatFlags", flags, flagsExt, pitchSlideSpeed });
    console.log(`[FurnaceSequencer] Compat flags: 0x${flags.toString(16)}, ext: 0x${flagsExt.toString(16)}, pitchSlideSpeed: ${pitchSlideSpeed}`);
  }
  if (native.grooves && native.grooves.length > 0) {
    for (let i = 0; i < native.grooves.length; i++) {
      const groove = native.grooves[i];
      engine.seqPostMessage({
        type: "seqSetGrooveEntry",
        index: i,
        values: groove.val.slice(0, groove.len),
        len: groove.len
      });
    }
    console.log(`[FurnaceSequencer] Uploaded ${native.grooves.length} groove patterns`);
  }
  if (native.chipIds && native.chipIds.length > 0) {
    let chanOffset = 0;
    for (let ci = 0; ci < native.chipIds.length; ci++) {
      const chipId = native.chipIds[ci];
      const chipChans = ((_c = native.systemChans) == null ? void 0 : _c[ci]) ?? engine.getChannelCount(chipId);
      const chipHandle = engine.getChipHandle(chipId);
      for (let subIdx = 0; subIdx < chipChans && chanOffset + subIdx < numChannels; subIdx++) {
        engine.seqPostMessage({
          type: "seqSetChannelChip",
          channel: chanOffset + subIdx,
          chipId,
          subIdx,
          handle: chipHandle
        });
      }
      chanOffset += chipChans;
    }
    console.log(`[FurnaceSequencer] Uploaded chip types for ${chanOffset} channels`);
  }
  console.log(`[FurnaceSequencer] Uploaded: ${numChannels}ch, ${patLen} rows, ${ordersLen} orders`);
}
function packCompatFlags(cf) {
  let flags = 0;
  if (cf.limitSlides) flags |= 1 << 0;
  if (cf.properNoiseLayout) flags |= 1 << 1;
  if (cf.waveDutyIsVol) flags |= 1 << 2;
  if (cf.resetMacroOnPorta) flags |= 1 << 3;
  if (cf.legacyVolumeSlides) flags |= 1 << 4;
  if (cf.compatibleArpeggio) flags |= 1 << 5;
  if (cf.noteOffResetsSlides) flags |= 1 << 6;
  if (cf.targetResetsSlides) flags |= 1 << 7;
  if (cf.arpNonPorta) flags |= 1 << 8;
  if (cf.algMacroBehavior) flags |= 1 << 9;
  if (cf.brokenShortcutSlides) flags |= 1 << 10;
  if (cf.ignoreDuplicateSlides) flags |= 1 << 11;
  if (cf.stopPortaOnNoteOff) flags |= 1 << 12;
  if (cf.continuousVibrato) flags |= 1 << 13;
  if (cf.oneTickCut) flags |= 1 << 14;
  if (cf.newInsTriggersInPorta) flags |= 1 << 15;
  if (cf.arp0Reset) flags |= 1 << 16;
  if (cf.noSlidesOnFirstTick) flags |= 1 << 17;
  if (cf.brokenPortaLegato) flags |= 1 << 18;
  if (cf.buggyPortaAfterSlide) flags |= 1 << 19;
  if (cf.ignoreJumpAtEnd) flags |= 1 << 20;
  if (cf.brokenSpeedSel) flags |= 1 << 21;
  if (cf.e1e2StopOnSameNote) flags |= 1 << 22;
  if (cf.e1e2AlsoTakePriority) flags |= 1 << 23;
  if (cf.rowResetsArpPos) flags |= 1 << 24;
  if (cf.oldSampleOffset) flags |= 1 << 25;
  if (cf.noVolSlideReset) flags |= 1 << 26;
  if (cf.resetArpPhaseOnNewNote) flags |= 1 << 27;
  if (cf.oldAlwaysSetVolume) flags |= 1 << 28;
  if (cf.preNoteNoEffect) flags |= 1 << 29;
  let flagsExt = 0;
  const linearPitch = cf.linearPitch ?? 2;
  flagsExt |= (linearPitch & 3) << 0;
  const loopModality = cf.loopModality ?? 0;
  flagsExt |= (loopModality & 3) << 4;
  const delayBehavior = cf.delayBehavior ?? 0;
  flagsExt |= (delayBehavior & 3) << 6;
  const jumpTreatment = cf.jumpTreatment ?? 0;
  flagsExt |= (jumpTreatment & 3) << 8;
  const pitchSlideSpeed = cf.pitchSlideSpeed || 4;
  return { flags, flagsExt, pitchSlideSpeed };
}
export {
  uploadFurnaceToSequencer
};
