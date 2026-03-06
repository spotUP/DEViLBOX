/**
 * FurnaceSequencerSerializer - Upload FurnaceNativeData to the WASM sequencer
 *
 * Uses the per-cell API:
 *   1. seqLoadSong(numChannels, patLen, ordersLen) -- initialize
 *   2. seqSetEffectCols(ch, cols) -- per channel
 *   3. seqSetOrder(ch, pos, patIdx) -- for each order entry
 *   4. seqSetCell(ch, pat, row, col, val) -- for each non-empty cell
 *   5. seqSetSpeed/seqSetTempo -- configuration
 */

import type { FurnaceNativeData } from '@/types';
import { FurnaceDispatchEngine } from '@/engine/furnace-dispatch/FurnaceDispatchEngine';

/**
 * Upload a Furnace subsong's pattern data to the WASM sequencer.
 */
export async function uploadFurnaceToSequencer(
  native: FurnaceNativeData,
  subsongIdx = 0
): Promise<void> {
  const sub = native.subsongs[subsongIdx];
  if (!sub) throw new Error(`Subsong ${subsongIdx} not found`);

  const engine = FurnaceDispatchEngine.getInstance();
  const numChannels = sub.channels.length;
  const patLen = sub.patLen;
  const ordersLen = sub.ordersLen;

  // 1. Initialize sequencer with song dimensions
  await engine.seqLoadSong(numChannels, patLen, ordersLen);

  // 2. Set effect columns per channel
  for (let ch = 0; ch < numChannels; ch++) {
    const effectCols = sub.channels[ch]?.effectCols ?? 1;
    engine.seqSetEffectCols(ch, effectCols);
  }

  // 3. Set order table
  for (let ch = 0; ch < numChannels; ch++) {
    for (let pos = 0; pos < ordersLen; pos++) {
      const patIdx = sub.orders[ch]?.[pos] ?? 0;
      engine.seqSetOrder(ch, pos, patIdx);
    }
  }

  // 4. Upload pattern data (only non-empty cells)
  for (let ch = 0; ch < numChannels; ch++) {
    const chanData = sub.channels[ch];
    if (!chanData) continue;
    const effectCols = chanData.effectCols;

    for (const [patIdx, patData] of chanData.patterns) {
      for (let row = 0; row < patLen; row++) {
        const fRow = patData.rows[row];
        if (!fRow) continue;

        // Col 0: note
        // convertFurnaceNoteValue stores notes as octave*12+note (0-179).
        // The WASM sequencer expects Furnace C++ convention: note+60 (so C-4=108).
        // Special values 253/254/255 (off/release/macro-release) pass through unchanged.
        if (fRow.note !== -1) {
          const noteForSeq = fRow.note >= 253 ? fRow.note : fRow.note + 60;
          engine.seqSetCell(ch, patIdx, row, 0, noteForSeq);
        }
        // Col 1: instrument
        if (fRow.ins !== -1) {
          engine.seqSetCell(ch, patIdx, row, 1, fRow.ins);
        }
        // Col 2: volume
        if (fRow.vol !== -1) {
          engine.seqSetCell(ch, patIdx, row, 2, fRow.vol);
        }
        // Effects: col 3+fx*2 = cmd, col 4+fx*2 = val
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

  // 5. Configuration
  engine.seqPostMessage({ type: 'seqSetSpeed', speed1: sub.speed1, speed2: sub.speed2 });
  // Set virtual tempo (N/D ratio controls row advancement per tick)
  engine.seqPostMessage({
    type: 'seqSetTempo',
    virtualN: sub.virtualTempoN,
    virtualD: sub.virtualTempoD
  });
  // Set tick rate (hz) — controls how often ticks fire (e.g. 60 for NTSC, 50 for PAL)
  // This updates both the sequencer divider AND the worklet's samplesPerTick
  engine.seqPostMessage({ type: 'setTickRate', hz: sub.hz || 60 });

  // 6. Upload compat flags to the WASM sequencer
  if (native.compatFlags) {
    const { flags, flagsExt, pitchSlideSpeed } = packCompatFlags(native.compatFlags);
    engine.seqPostMessage({ type: 'seqSetCompatFlags', flags, flagsExt, pitchSlideSpeed });
    console.log(`[FurnaceSequencer] Compat flags: 0x${flags.toString(16)}, ext: 0x${flagsExt.toString(16)}, pitchSlideSpeed: ${pitchSlideSpeed}`);
  }

  // 7. Upload groove patterns for 09xx effect
  if (native.grooves && native.grooves.length > 0) {
    for (let i = 0; i < native.grooves.length; i++) {
      const groove = native.grooves[i];
      engine.seqPostMessage({
        type: 'seqSetGrooveEntry',
        index: i,
        values: groove.val.slice(0, groove.len),
        len: groove.len,
      });
    }
    console.log(`[FurnaceSequencer] Uploaded ${native.grooves.length} groove patterns`);
  }

  // 8. Upload per-channel chip type for platform-specific effect handling
  if (native.chipIds && native.chipIds.length > 0) {
    // Build channel → (chipId, subIdx) mapping from chip channel counts
    // Each chip owns N sequential channels; subIdx is the channel's index within its chip
    let chanOffset = 0;
    for (const chipId of native.chipIds) {
      const chipChans = engine.getChannelCount(chipId);
      for (let subIdx = 0; subIdx < chipChans && (chanOffset + subIdx) < numChannels; subIdx++) {
        engine.seqPostMessage({
          type: 'seqSetChannelChip',
          channel: chanOffset + subIdx,
          chipId,
          subIdx,
        });
      }
      chanOffset += chipChans;
    }
    console.log(`[FurnaceSequencer] Uploaded chip types for ${chanOffset} channels`);
  }

  console.log(`[FurnaceSequencer] Uploaded: ${numChannels}ch, ${patLen} rows, ${ordersLen} orders`);
}

/**
 * Pack compat flags object into the uint32 bitmasks expected by the WASM sequencer.
 * See FurnaceSequencer.h for the bit layout.
 */
function packCompatFlags(cf: Record<string, unknown>): { flags: number; flagsExt: number; pitchSlideSpeed: number } {
  let flags = 0;
  if (cf.limitSlides)           flags |= (1 << 0);
  if (cf.properNoiseLayout)     flags |= (1 << 1);
  if (cf.waveDutyIsVol)         flags |= (1 << 2);
  if (cf.resetMacroOnPorta)     flags |= (1 << 3);
  if (cf.legacyVolumeSlides)    flags |= (1 << 4);
  if (cf.compatibleArpeggio)    flags |= (1 << 5);
  if (cf.noteOffResetsSlides)   flags |= (1 << 6);
  if (cf.targetResetsSlides)    flags |= (1 << 7);
  if (cf.arpNonPorta)           flags |= (1 << 8);
  if (cf.algMacroBehavior)      flags |= (1 << 9);
  if (cf.brokenShortcutSlides)  flags |= (1 << 10);
  if (cf.ignoreDuplicateSlides) flags |= (1 << 11);
  if (cf.stopPortaOnNoteOff)    flags |= (1 << 12);
  if (cf.continuousVibrato)     flags |= (1 << 13);
  if (cf.oneTickCut)            flags |= (1 << 14);
  if (cf.newInsTriggersInPorta) flags |= (1 << 15);
  if (cf.arp0Reset)             flags |= (1 << 16);
  if (cf.noSlidesOnFirstTick)   flags |= (1 << 17);
  if (cf.brokenPortaLegato)     flags |= (1 << 18);
  if (cf.buggyPortaAfterSlide)  flags |= (1 << 19);
  if (cf.ignoreJumpAtEnd)       flags |= (1 << 20);
  if (cf.brokenSpeedSel)        flags |= (1 << 21);
  if (cf.e1e2StopOnSameNote)    flags |= (1 << 22);
  if (cf.e1e2AlsoTakePriority)  flags |= (1 << 23);
  if (cf.rowResetsArpPos)       flags |= (1 << 24);
  if (cf.oldSampleOffset)       flags |= (1 << 25);
  if (cf.noVolSlideReset)       flags |= (1 << 26);
  if (cf.resetArpPhaseOnNewNote) flags |= (1 << 27);
  if (cf.oldAlwaysSetVolume)     flags |= (1 << 28);

  // Extended flags: multi-bit values packed into uint32
  let flagsExt = 0;
  const linearPitch = (cf.linearPitch as number) ?? 2;  // Default: full linear
  flagsExt |= (linearPitch & 0x3) << 0;   // bits 0-1
  // pitchSlideSpeed is passed separately (full 0-255 range, doesn't fit in 2 bits)
  const loopModality = (cf.loopModality as number) ?? 0;
  flagsExt |= (loopModality & 0x3) << 4;  // bits 4-5
  const delayBehavior = (cf.delayBehavior as number) ?? 0;
  flagsExt |= (delayBehavior & 0x3) << 6; // bits 6-7
  const jumpTreatment = (cf.jumpTreatment as number) ?? 0;
  flagsExt |= (jumpTreatment & 0x3) << 8; // bits 8-9

  const pitchSlideSpeed = (cf.pitchSlideSpeed as number) || 4; // Default: 4 (Furnace song.cpp:1114)

  return { flags, flagsExt, pitchSlideSpeed };
}
