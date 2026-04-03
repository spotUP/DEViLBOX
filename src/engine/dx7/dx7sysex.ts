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
