/**
 * DX7 SysEx Cartridge Parser
 *
 * Parses DX7 .syx bulk dump files (32 packed voices → 156-byte VCED patches).
 * Standard Yamaha DX7 cartridge format: F0 43 00 09 20 00 [4096 bytes] [checksum] F7
 *
 * References:
 * - Yamaha DX7 MIDI Data Format (Service Manual)
 * - Each packed voice = 128 bytes, unpacked VCED = 155 bytes + name
 */

export interface DX7Patch {
  name: string;
  data: Uint8Array; // 156-byte VCED format
}

/**
 * Unpack a single DX7 voice from packed (128-byte) to VCED (156-byte) format.
 *
 * Packed format: 6 operators × 17 bytes + 27 global bytes = 128 bytes
 * VCED format: 6 operators × 21 bytes + 30 global bytes = 156 bytes
 */
export function unpackDX7Voice(packed: Uint8Array): Uint8Array {
  const vced = new Uint8Array(156);

  // Unpack 6 operators (packed: 17 bytes each → unpacked: 21 bytes each)
  for (let op = 0; op < 6; op++) {
    const pi = op * 17; // packed index
    const ui = op * 21; // unpacked index

    // Direct copy: EG rates 1-4, EG levels 1-4, breakpoint, left/right depth
    for (let j = 0; j < 11; j++) {
      vced[ui + j] = packed[pi + j];
    }

    // Packed[11]: Left Curve (bits 0-1) | Right Curve (bits 2-3)
    vced[ui + 11] = packed[pi + 11] & 0x03;        // Left Curve
    vced[ui + 12] = (packed[pi + 11] >> 2) & 0x03;  // Right Curve

    // Packed[12]: Rate Scaling (bits 0-2) | Detune (bits 3-6)
    vced[ui + 13] = packed[pi + 12] & 0x07;         // Rate Scaling
    vced[ui + 20] = (packed[pi + 12] >> 3) & 0x0F;  // Detune (0-14)

    // Packed[13]: Amp Mod Sensitivity (bits 0-1) | Key Velocity Sensitivity (bits 2-4)
    vced[ui + 14] = packed[pi + 13] & 0x03;         // Amp Mod Sensitivity
    vced[ui + 15] = (packed[pi + 13] >> 2) & 0x07;  // Key Velocity Sensitivity

    // Packed[14]: Output Level
    vced[ui + 16] = packed[pi + 14];

    // Packed[15]: Oscillator Mode (bit 0) | Frequency Coarse (bits 1-6)
    vced[ui + 17] = packed[pi + 15] & 0x01;         // Osc Mode
    vced[ui + 18] = (packed[pi + 15] >> 1) & 0x1F;  // Freq Coarse

    // Packed[16]: Frequency Fine
    vced[ui + 19] = packed[pi + 16];
  }

  // Global parameters (packed bytes 102-127 → unpacked bytes 126-155)
  const gi = 102; // global packed index start

  // Pitch EG rates and levels (direct copy, 8 bytes)
  for (let j = 0; j < 8; j++) {
    vced[126 + j] = packed[gi + j];
  }

  // Packed[110]: Algorithm (0-31)
  vced[134] = packed[gi + 8] & 0x1F;

  // Packed[111]: Feedback (bits 0-2) | Osc Key Sync (bit 3)
  vced[135] = packed[gi + 9] & 0x07;         // Feedback
  vced[136] = (packed[gi + 9] >> 3) & 0x01;  // Osc Key Sync

  // LFO Speed, Delay, PMD, AMD (direct copy)
  vced[137] = packed[gi + 10]; // LFO Speed
  vced[138] = packed[gi + 11]; // LFO Delay
  vced[139] = packed[gi + 12]; // LFO PMD
  vced[140] = packed[gi + 13]; // LFO AMD

  // Packed[116]: LFO Sync (bit 0) | LFO Wave (bits 1-3) | Pitch Mod Sensitivity (bits 4-6)
  vced[141] = packed[gi + 14] & 0x01;          // LFO Sync
  vced[142] = (packed[gi + 14] >> 1) & 0x07;   // LFO Wave
  vced[143] = (packed[gi + 14] >> 4) & 0x07;   // LFO PMS

  // Transpose
  vced[144] = packed[gi + 15];

  // Voice name (10 ASCII chars)
  for (let j = 0; j < 10; j++) {
    vced[145 + j] = packed[gi + 16 + j];
  }

  // Byte 155 = 0 (padding)
  vced[155] = 0;

  return vced;
}

/**
 * Extract the 10-character patch name from a VCED patch.
 */
export function getVCEDPatchName(vced: Uint8Array): string {
  let name = '';
  for (let i = 145; i < 155; i++) {
    const ch = vced[i];
    name += (ch >= 32 && ch < 127) ? String.fromCharCode(ch) : ' ';
  }
  return name.trim();
}

/**
 * Parse a DX7 .syx bulk dump file into 32 VCED patches.
 *
 * Accepts standard Yamaha DX7 cartridge format:
 * - Full SysEx: F0 43 00 09 20 00 [4096 bytes] [checksum] F7
 * - Raw bulk: just 4096 bytes of 32 packed voices
 * - With/without SysEx framing bytes
 */
export function parseDX7Cartridge(syx: Uint8Array): DX7Patch[] {
  // Find the start of voice data
  let dataStart = 0;

  if (syx.length >= 4104 && syx[0] === 0xF0 && syx[1] === 0x43) {
    // Standard SysEx framing: F0 43 ss 09 20 00 [data] [checksum] F7
    dataStart = 6;
  } else if (syx.length >= 4096) {
    // Raw bulk data (no SysEx header)
    dataStart = 0;
  } else {
    console.warn('[DX7] Invalid cartridge: expected >= 4096 bytes, got', syx.length);
    return [];
  }

  const patches: DX7Patch[] = [];
  for (let i = 0; i < 32; i++) {
    const offset = dataStart + i * 128;
    if (offset + 128 > syx.length) break;
    const packed = syx.slice(offset, offset + 128);
    const vced = unpackDX7Voice(packed);
    const name = getVCEDPatchName(vced);
    patches.push({ name: name || `Voice ${i + 1}`, data: vced });
  }

  return patches;
}

/**
 * Convert a DexedConfig (flat preset object) to a 156-byte VCED patch.
 * Used to convert existing flat presets to proper VCED format.
 */
export function configToVCED(config: {
  algorithm?: number;
  feedback?: number;
  oscSync?: boolean;
  operators?: Array<{
    level?: number; coarse?: number; fine?: number; detune?: number;
    mode?: number;
    egRates?: [number, number, number, number];
    egLevels?: [number, number, number, number];
    breakPoint?: number; leftDepth?: number; rightDepth?: number;
    leftCurve?: number; rightCurve?: number;
    rateScaling?: number; ampModSens?: number; velocitySens?: number;
  }>;
  pitchEgRates?: [number, number, number, number];
  pitchEgLevels?: [number, number, number, number];
  lfoSpeed?: number; lfoDelay?: number; lfoPmd?: number; lfoAmd?: number;
  lfoSync?: boolean; lfoWave?: number; lfoPms?: number;
  transpose?: number;
}): Uint8Array {
  const vced = new Uint8Array(156);

  // Default operator: sine wave, max level, fast attack/sustain envelope
  // DX7 VCED format stores operators in reverse: OP6 at offset 0, OP1 at offset 105.
  // Config operators[0] = OP1 (carrier in most algorithms), so we reverse the mapping.
  for (let op = 0; op < 6; op++) {
    const src = config.operators?.[5 - op]; // Config[0]=OP1 → VCED slot 5 (offset 105)
    const ui = op * 21;

    // EG rates (default: instant attack, sustain)
    const rates = src?.egRates ?? [99, 99, 99, 99];
    const levels = src?.egLevels ?? [99, 99, 99, 0];
    for (let j = 0; j < 4; j++) {
      vced[ui + j] = rates[j];
      vced[ui + 4 + j] = levels[j];
    }

    vced[ui + 8] = src?.breakPoint ?? 39;    // Middle C
    vced[ui + 9] = src?.leftDepth ?? 0;
    vced[ui + 10] = src?.rightDepth ?? 0;
    vced[ui + 11] = src?.leftCurve ?? 0;
    vced[ui + 12] = src?.rightCurve ?? 0;
    vced[ui + 13] = src?.rateScaling ?? 0;
    vced[ui + 14] = src?.ampModSens ?? 0;
    vced[ui + 15] = src?.velocitySens ?? 0;
    vced[ui + 16] = src?.level ?? (op === 5 ? 99 : 0); // OP1 (VCED slot 5) on by default
    vced[ui + 17] = src?.mode ?? 0;
    vced[ui + 18] = src?.coarse ?? 1;
    vced[ui + 19] = src?.fine ?? 0;
    vced[ui + 20] = src?.detune ?? 7;        // Center
  }

  // Pitch EG
  const pRates = config.pitchEgRates ?? [99, 99, 99, 99];
  const pLevels = config.pitchEgLevels ?? [50, 50, 50, 50];
  for (let j = 0; j < 4; j++) {
    vced[126 + j] = pRates[j];
    vced[130 + j] = pLevels[j];
  }

  vced[134] = config.algorithm ?? 0;
  vced[135] = config.feedback ?? 0;
  vced[136] = config.oscSync ? 1 : 0;
  vced[137] = config.lfoSpeed ?? 0;
  vced[138] = config.lfoDelay ?? 0;
  vced[139] = config.lfoPmd ?? 0;
  vced[140] = config.lfoAmd ?? 0;
  vced[141] = config.lfoSync ? 1 : 0;
  vced[142] = config.lfoWave ?? 0;
  vced[143] = config.lfoPms ?? 0;
  vced[144] = config.transpose ?? 24;

  return vced;
}

/** Convert VCED (155 bytes unpacked) to VMEM (128 bytes packed). */
export function packDX7Voice(vced: Uint8Array): Uint8Array {
  const vmem = new Uint8Array(128);
  // 6 operators: VCED has 21 bytes/op, VMEM has 17 bytes/op
  for (let op = 0; op < 6; op++) {
    const vs = op * 21; // VCED source offset
    const vd = op * 17; // VMEM dest offset
    // Bytes 0-7: EG rates and levels — direct copy
    for (let i = 0; i < 8; i++) vmem[vd + i] = vced[vs + i];
    // Byte 8: KLS break point
    vmem[vd + 8] = vced[vs + 8];
    // Bytes 9-10: KLS left/right depth
    vmem[vd + 9] = vced[vs + 9];
    vmem[vd + 10] = vced[vs + 10];
    // Byte 11: KLS left curve (0-3) | right curve (0-3) packed
    vmem[vd + 11] = (vced[vs + 11] & 0x03) | ((vced[vs + 12] & 0x03) << 2);
    // Byte 12: Rate scaling (0-7) | detune (0-14) packed
    vmem[vd + 12] = (vced[vs + 13] & 0x07) | ((vced[vs + 20] & 0x0F) << 3);
    // Byte 13: Amp mod sens (0-3) | key vel sens (0-7) packed
    vmem[vd + 13] = (vced[vs + 14] & 0x03) | ((vced[vs + 15] & 0x07) << 2);
    // Byte 14: Output level
    vmem[vd + 14] = vced[vs + 16];
    // Byte 15: Freq coarse (0-31) | osc mode (0-1) packed
    vmem[vd + 15] = (vced[vs + 17] & 0x01) | ((vced[vs + 18] & 0x1F) << 1);
    // Byte 16: Freq fine
    vmem[vd + 16] = vced[vs + 19];
  }
  // Global params start at VCED offset 126, VMEM offset 102
  // Pitch EG rates and levels (8 bytes)
  for (let i = 0; i < 8; i++) vmem[102 + i] = vced[126 + i];
  // Byte 110: Algorithm (0-31)
  vmem[110] = vced[134] & 0x1F;
  // Byte 111: Feedback (0-7) | Osc key sync (0-1) packed
  vmem[111] = (vced[135] & 0x07) | ((vced[136] & 0x01) << 3);
  // Bytes 112-115: LFO speed, delay, PMD, AMD
  vmem[112] = vced[137];
  vmem[113] = vced[138];
  vmem[114] = vced[139];
  vmem[115] = vced[140];
  // Byte 116: LFO sync (0-1) | LFO wave (0-5) | LFO PMS (0-7) packed
  vmem[116] = (vced[141] & 0x01) | ((vced[142] & 0x07) << 1) | ((vced[143] & 0x07) << 4);
  // Byte 117: Transpose
  vmem[117] = vced[144];
  // Bytes 118-127: Voice name (10 ASCII chars)
  for (let i = 0; i < 10; i++) vmem[118 + i] = vced[145 + i];
  return vmem;
}

/* ── Validation, framing and file inspection (shared by every .syx entry point) ── */

/** Largest legal value of each of the 155 VCED parameters (Yamaha DX7 data format). */
export const VCED_MAX: readonly number[] = (() => {
  const max: number[] = [];
  // Per operator (21 bytes): EG rates 1-4, EG levels 1-4, break point, left/right depth,
  // left/right curve, rate scaling, amp mod sens, velocity sens, output level,
  // osc mode, coarse, fine, detune.
  const op = [99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 3, 3, 7, 3, 7, 99, 1, 31, 99, 14];
  for (let i = 0; i < 6; i++) max.push(...op);
  // Pitch EG rates/levels, algorithm, feedback, osc key sync, LFO speed/delay/PMD/AMD,
  // LFO sync, LFO wave, LFO PMS, transpose.
  max.push(99, 99, 99, 99, 99, 99, 99, 99, 31, 7, 1, 99, 99, 99, 99, 1, 5, 7, 48);
  // Voice name: 10 printable ASCII characters.
  for (let i = 0; i < 10; i++) max.push(127);
  return max;
})();

/** Human-readable list of VCED bytes outside their legal range (empty = valid). */
export function vcedRangeErrors(vced: Uint8Array): string[] {
  const errors: string[] = [];
  for (let i = 0; i < 155; i++) {
    if (vced[i] > VCED_MAX[i]) errors.push(`byte ${i} = ${vced[i]} (max ${VCED_MAX[i]})`);
  }
  return errors;
}

/**
 * Clamp every VCED parameter into its legal range and make the name printable ASCII.
 * Returns the number of bytes changed. Hardware and Dexed clamp the same way on load.
 */
export function repairVced(vced: Uint8Array): number {
  let fixed = 0;
  for (let i = 0; i < 155; i++) {
    let v = vced[i];
    if (i >= 145) {
      if (v < 32 || v > 126) v = 32;
    } else if (v > VCED_MAX[i]) {
      v = VCED_MAX[i];
    }
    if (v !== vced[i]) { vced[i] = v; fixed++; }
  }
  return fixed;
}

/** DX7 checksum: two's complement of the data sum, low 7 bits. */
export function dx7Checksum(data: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i];
  return (-sum) & 0x7F;
}

/** Wrap 4096 bytes of packed voices into a framed 4104-byte bulk dump. */
export function toBulkSysex(packed4096: Uint8Array): Uint8Array {
  const sysex = new Uint8Array(4104);
  sysex.set([0xF0, 0x43, 0x00, 0x09, 0x20, 0x00], 0);
  sysex.set(packed4096.subarray(0, 4096), 6);
  sysex[4102] = dx7Checksum(packed4096.subarray(0, 4096));
  sysex[4103] = 0xF7;
  return sysex;
}

export type DX7SysexKind = 'bulk32' | 'single' | 'unknown';

export interface DX7SysexInspection {
  kind: DX7SysexKind;
  /** Parameter bytes clamped or name bytes made printable while importing. */
  repairs: number;
  /** Framed checksum matched (true for unframed data, which carries none). */
  checksumOk: boolean;
  /** One entry for a single-voice dump, 32 for a bulk dump. */
  patches: DX7Patch[];
  /** Framed 4104-byte bulk dump, ready for DX7Synth.loadSysex (bulk32 only). */
  bulkSysex?: Uint8Array;
  /** 155 VCED bytes (single only). */
  vced?: Uint8Array;
}

/**
 * Classify a user-supplied or shipped .syx file: 32-voice bulk dump (framed 4104 or raw 4096),
 * single-voice VCED dump (framed 163, F0 43 0n 00 01 1B ... F7, or raw 155), or unknown.
 */
export function inspectDX7Sysex(data: Uint8Array): DX7SysexInspection {
  if (data.length === 4104 || data.length === 4096) {
    const framed = data.length === 4104;
    if (framed && (data[0] !== 0xF0 || data[1] !== 0x43 || data[3] !== 0x09)) {
      return { kind: 'unknown', checksumOk: false, repairs: 0, patches: [] };
    }
    const packed = framed ? data.subarray(6, 4102) : data;
    const checksumOk = framed ? data[4102] === dx7Checksum(packed) : true;
    const patches = parseDX7Cartridge(framed ? data : packed);
    let repairs = 0;
    const clean = new Uint8Array(4096);
    patches.forEach((p, i) => {
      repairs += repairVced(p.data);
      clean.set(packDX7Voice(p.data), i * 128);
    });
    return {
      kind: 'bulk32',
      checksumOk,
      repairs,
      patches,
      bulkSysex: toBulkSysex(clean),
    };
  }
  if (data.length === 163 || data.length === 155) {
    const framed = data.length === 163;
    if (framed && (data[0] !== 0xF0 || data[1] !== 0x43 || data[3] !== 0x00 || data[4] !== 0x01 || data[5] !== 0x1B)) {
      return { kind: 'unknown', checksumOk: false, repairs: 0, patches: [] };
    }
    const vced = new Uint8Array(156);
    vced.set(data.subarray(framed ? 6 : 0, (framed ? 6 : 0) + 155));
    const checksumOk = framed ? data[161] === dx7Checksum(vced.subarray(0, 155)) : true;
    const repairs = repairVced(vced);
    return {
      kind: 'single',
      checksumOk,
      repairs,
      patches: [{ name: getVCEDPatchName(vced) || 'Voice', data: vced }],
      vced: vced.subarray(0, 155),
    };
  }
  return { kind: 'unknown', checksumOk: false, repairs: 0, patches: [] };
}
