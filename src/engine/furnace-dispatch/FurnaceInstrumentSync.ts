/**
 * FurnaceInstrumentSync — Sync instrument changes to running WASM sequencer
 *
 * Two paths:
 *   1. rawBinaryData available (preset loads from .fur) → loadIns2() direct upload
 *   2. Parameter edits → serialize FurnaceConfig to platform binary → chip setter
 *
 * After upload, calls forceIns() so changes take effect on active channels.
 */

import type { InstrumentConfig } from '@typedefs/instrument';
import type { FurnaceConfig, FurnaceOperatorConfig } from '@typedefs/instrument/furnace';
import { FurnaceDispatchEngine } from './FurnaceDispatchEngine';

/**
 * Sync a Furnace instrument from the store to the running WASM sequencer.
 * @param insIndex - 0-based Furnace instrument index
 * @param config - Full instrument config from the store
 */
export function syncInstrumentToWasm(insIndex: number, config: InstrumentConfig): void {
  const furnace = config.furnace;
  if (!furnace) return;

  let engine: FurnaceDispatchEngine;
  try {
    engine = FurnaceDispatchEngine.getInstance();
  } catch {
    return; // Engine not available
  }

  // Path 1: If rawBinaryData is INS2 format, upload directly (fastest, most complete)
  const raw = furnace.rawBinaryData;
  if (raw && raw.length > 4 &&
      raw[0] === 0x49 && raw[1] === 0x4E && raw[2] === 0x53 && raw[3] === 0x32) {
    const data = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
    engine.loadIns2(insIndex, data);
    engine.forceIns(furnace.chipType);
    return;
  }

  // Path 2: Serialize from FurnaceConfig fields to platform-specific binary
  const chipType = furnace.chipType ?? 0;
  const data = serializeForPlatform(furnace);
  if (data) {
    engine.uploadFurnaceInstrument(insIndex, data, chipType);
    engine.forceIns(chipType);
  }
}

/**
 * Serialize FurnaceConfig to the appropriate platform-specific binary format.
 * Returns null if the platform type doesn't have a dedicated serializer
 * (those platforms still work via rawBinaryData/INS2 path for preset loads).
 */
function serializeForPlatform(config: FurnaceConfig): Uint8Array | null {
  if (config.gb) return serializeGB(config);
  if (config.c64) return serializeC64(config);
  if (config.operators && config.operators.length > 0) return serializeFM(config);
  return null;
}

// ============================================================================
// FM Instrument Serializer
// Binary layout: 16-byte header + 4 operators × 24 bytes = 112 bytes
// Matches furnace_dispatch_set_fm_instrument() in FurnaceDispatchWrapper.cpp:1599
// Covers: OPN, OPM, OPL, OPZ, ESFM, OPLL and all FM variants
// ============================================================================

function serializeFM(config: FurnaceConfig): Uint8Array {
  const ops = config.operators || [];
  const numOps = Math.min(ops.length, 4);
  const buf = new Uint8Array(16 + 4 * 24);

  // Header (16 bytes)
  buf[0] = config.chipType ?? 0;
  buf[1] = config.algorithm ?? 0;
  buf[2] = config.feedback ?? 0;
  buf[3] = config.fms ?? 0;
  buf[4] = config.ams ?? 0;
  buf[5] = config.fms2 ?? 0;
  buf[6] = config.ams2 ?? 0;
  buf[7] = numOps;
  buf[8] = config.opllPreset ?? 0;

  const kick = config.kickFreq ?? 0;
  buf[9] = kick & 0xFF;
  buf[10] = (kick >> 8) & 0xFF;

  const snare = config.snareHatFreq ?? 0;
  buf[11] = snare & 0xFF;
  buf[12] = (snare >> 8) & 0xFF;

  const tom = config.tomTopFreq ?? 0;
  buf[13] = tom & 0xFF;
  buf[14] = (tom >> 8) & 0xFF;

  buf[15] = config.fixedDrums ? 1 : 0;

  // Operators (4 × 24 bytes each)
  for (let i = 0; i < 4; i++) {
    const op: Partial<FurnaceOperatorConfig> = i < numOps ? ops[i] : {};
    const off = 16 + i * 24;

    buf[off + 0] = (op.enabled !== false) ? 1 : 0;
    buf[off + 1] = op.am ? 1 : 0;
    buf[off + 2] = op.ar ?? 0;
    buf[off + 3] = op.dr ?? 0;
    buf[off + 4] = op.mult ?? 0;
    buf[off + 5] = op.rr ?? 0;
    buf[off + 6] = op.sl ?? 0;
    buf[off + 7] = op.tl ?? 0;
    buf[off + 8] = op.dt2 ?? 0;
    buf[off + 9] = op.rs ?? 0;
    buf[off + 10] = (op.dt ?? 0) & 0xFF; // signed → unsigned byte
    buf[off + 11] = op.d2r ?? 0;
    buf[off + 12] = op.ssg ?? 0;
    buf[off + 13] = op.dam ?? 0;
    buf[off + 14] = op.dvb ?? 0;
    buf[off + 15] = op.egt ? 1 : 0;
    buf[off + 16] = op.ksl ?? 0;
    buf[off + 17] = op.sus ? 1 : 0;
    buf[off + 18] = op.vib ? 1 : 0;
    buf[off + 19] = op.ws ?? 0;
    buf[off + 20] = op.ksr ? 1 : 0;
    buf[off + 21] = op.kvs ?? 0;
    // bytes 22-23 reserved
  }

  return buf;
}

// ============================================================================
// Game Boy Instrument Serializer
// Binary layout: 8-byte header + hwSeq entries (2 bytes each)
// Matches furnace_dispatch_set_gb_instrument() in FurnaceDispatchWrapper.cpp:1487
// ============================================================================

function serializeGB(config: FurnaceConfig): Uint8Array {
  const gb = config.gb!;
  const hwSeq = gb.hwSeq || [];
  const seqLen = Math.min(hwSeq.length, 255);
  const buf = new Uint8Array(8 + seqLen * 2);

  buf[0] = gb.envVol ?? 0;
  buf[1] = gb.envDir ?? 0;
  buf[2] = gb.envLen ?? 0;
  buf[3] = gb.soundLen ?? 0;
  buf[4] = gb.softEnv ? 1 : 0;
  buf[5] = gb.alwaysInit ? 1 : 0;
  buf[6] = 0; // doubleWave
  buf[7] = seqLen;

  for (let i = 0; i < seqLen; i++) {
    buf[8 + i * 2] = hwSeq[i].cmd ?? 0;
    buf[8 + i * 2 + 1] = hwSeq[i].data ?? 0;
  }

  return buf;
}

// ============================================================================
// C64 (SID) Instrument Serializer
// Binary layout: 15 bytes fixed
// Matches furnace_dispatch_set_c64_instrument() in FurnaceDispatchWrapper.cpp:1668
// ============================================================================

function serializeC64(config: FurnaceConfig): Uint8Array {
  const c64 = config.c64!;
  const buf = new Uint8Array(15);

  buf[0] = config.chipType ?? 0;

  buf[1] = (c64.triOn ? 1 : 0) |
           (c64.sawOn ? 2 : 0) |
           (c64.pulseOn ? 4 : 0) |
           (c64.noiseOn ? 8 : 0);

  buf[2] = c64.a ?? 0;
  buf[3] = c64.d ?? 0;
  buf[4] = c64.s ?? 0;
  buf[5] = c64.r ?? 0;

  const duty = c64.duty ?? 0;
  buf[6] = duty & 0xFF;
  buf[7] = (duty >> 8) & 0xFF;

  buf[8] = c64.ringMod ? 1 : 0;
  buf[9] = c64.oscSync ? 1 : 0;

  buf[10] = (c64.toFilter ? 1 : 0) |
            (c64.initFilter ? 2 : 0) |
            (c64.dutyIsAbs ? 4 : 0) |
            (c64.filterIsAbs ? 8 : 0) |
            (c64.noTest ? 16 : 0) |
            (c64.resetDuty ? 32 : 0);

  buf[11] = c64.filterResonance ?? c64.filterRes ?? 0;

  const cut = c64.filterCutoff ?? 0;
  buf[12] = cut & 0xFF;
  buf[13] = (cut >> 8) & 0xFF;

  buf[14] = (c64.filterHP ? 1 : 0) |
            (c64.filterLP ? 2 : 0) |
            (c64.filterBP ? 4 : 0) |
            (c64.filterCh3Off ? 8 : 0);

  return buf;
}
