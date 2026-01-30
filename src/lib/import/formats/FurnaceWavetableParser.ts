/**
 * Furnace Wavetable Parser (.fuw files)
 *
 * File format:
 * - 16 bytes: "-Furnace waveta-" header
 * - 2 bytes: version (little-endian)
 * - 2 bytes: reserved
 * - 4 bytes: "WAVE" chunk magic
 * - 4 bytes: block size (little-endian)
 * - 1 byte: name length (usually 0)
 * - 4 bytes: len (wavetable length, e.g., 32 or 128)
 * - 4 bytes: min (usually 0)
 * - 4 bytes: max (e.g., 15, 31, or 255)
 * - len x 4 bytes: sample data as 32-bit integers (little-endian)
 */

export interface FurnaceWavetableData {
  name: string;
  len: number;
  min: number;
  max: number;
  data: number[];
}

/**
 * Parse a .fuw file buffer
 */
export function parseFurnaceWavetable(buffer: ArrayBuffer): FurnaceWavetableData | null {
  const view = new DataView(buffer);

  // Verify header
  const header = String.fromCharCode(
    view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3),
    view.getUint8(4), view.getUint8(5), view.getUint8(6), view.getUint8(7),
    view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11),
    view.getUint8(12), view.getUint8(13), view.getUint8(14), view.getUint8(15)
  );

  if (header !== '-Furnace waveta-') {
    console.error('[FurnaceWavetableParser] Invalid header:', header);
    return null;
  }

  // Skip version (2 bytes) and reserved (2 bytes)
  let offset = 20;

  // Verify WAVE chunk
  const magic = String.fromCharCode(
    view.getUint8(offset), view.getUint8(offset + 1),
    view.getUint8(offset + 2), view.getUint8(offset + 3)
  );
  offset += 4;

  if (magic !== 'WAVE') {
    console.error('[FurnaceWavetableParser] Missing WAVE chunk:', magic);
    return null;
  }

  // Block size (skip it, we parse by structure)
  offset += 4;

  // Name (null-terminated string, usually empty)
  const nameLen = view.getUint8(offset);
  offset += 1;
  let name = '';
  if (nameLen > 0) {
    const nameBytes = new Uint8Array(buffer, offset, nameLen);
    name = String.fromCharCode(...nameBytes);
    offset += nameLen;
  }

  // Wavetable length
  const len = view.getInt32(offset, true);
  offset += 4;

  // Min value
  const min = view.getInt32(offset, true);
  offset += 4;

  // Max value
  const max = view.getInt32(offset, true);
  offset += 4;

  // Validate
  if (len < 1 || len > 256) {
    console.error('[FurnaceWavetableParser] Invalid length:', len);
    return null;
  }

  // Read sample data
  const data: number[] = [];
  for (let i = 0; i < len; i++) {
    data.push(view.getInt32(offset, true));
    offset += 4;
  }

  return { name, len, min, max, data };
}

/**
 * Convert wavetable to normalized float array (-1 to 1)
 */
export function normalizeWavetable(wave: FurnaceWavetableData): Float32Array {
  const result = new Float32Array(wave.len);
  const range = wave.max - wave.min;

  for (let i = 0; i < wave.len; i++) {
    // Normalize to 0..1, then to -1..1
    const normalized = range > 0 ? (wave.data[i] - wave.min) / range : 0;
    result[i] = normalized * 2 - 1;
  }

  return result;
}

/**
 * Resample wavetable to target length using linear interpolation
 */
export function resampleWavetable(data: number[], targetLen: number): number[] {
  if (data.length === targetLen) return data;

  const result: number[] = [];
  const ratio = data.length / targetLen;

  for (let i = 0; i < targetLen; i++) {
    const srcPos = i * ratio;
    const srcIndex = Math.floor(srcPos);
    const frac = srcPos - srcIndex;

    const a = data[srcIndex];
    const b = data[(srcIndex + 1) % data.length];

    result.push(Math.round(a + (b - a) * frac));
  }

  return result;
}

/**
 * Convert wavetable data for specific chip types
 */
export function convertForChip(wave: FurnaceWavetableData, chipType: 'gb' | 'pce' | 'n163' | 'scc' | 'swan' | 'snes' | 'lynx'): number[] {
  // Most chips need specific sizes and bit depths
  switch (chipType) {
    case 'gb': {
      // Game Boy: 32 samples, 4-bit (0-15)
      const resampled = resampleWavetable(wave.data, 32);
      const scale = wave.max > 0 ? 15 / wave.max : 1;
      return resampled.map(v => Math.round(Math.max(0, Math.min(15, v * scale))));
    }

    case 'pce': {
      // PC Engine: 32 samples, 5-bit (0-31)
      const resampled = resampleWavetable(wave.data, 32);
      const scale = wave.max > 0 ? 31 / wave.max : 1;
      return resampled.map(v => Math.round(Math.max(0, Math.min(31, v * scale))));
    }

    case 'n163': {
      // Namco 163: 128 samples max, 4-bit (0-15)
      // But typically uses shorter waves, keep original length if ≤128
      const len = Math.min(wave.len, 128);
      const resampled = wave.len === len ? wave.data : resampleWavetable(wave.data, len);
      const scale = wave.max > 0 ? 15 / wave.max : 1;
      return resampled.map(v => Math.round(Math.max(0, Math.min(15, v * scale))));
    }

    case 'scc': {
      // Konami SCC: 32 samples, 8-bit signed (-128 to 127)
      const resampled = resampleWavetable(wave.data, 32);
      const center = (wave.min + wave.max) / 2;
      const scale = wave.max > center ? 127 / (wave.max - center) : 1;
      return resampled.map(v => Math.round(Math.max(-128, Math.min(127, (v - center) * scale))));
    }

    case 'swan': {
      // WonderSwan: 32 samples, 4-bit (0-15)
      const resampled = resampleWavetable(wave.data, 32);
      const scale = wave.max > 0 ? 15 / wave.max : 1;
      return resampled.map(v => Math.round(Math.max(0, Math.min(15, v * scale))));
    }

    case 'snes': {
      // SNES: BRR compression, but raw is 16 samples, 4-bit signed
      const resampled = resampleWavetable(wave.data, 16);
      const center = (wave.min + wave.max) / 2;
      const scale = wave.max > center ? 7 / (wave.max - center) : 1;
      return resampled.map(v => Math.round(Math.max(-8, Math.min(7, (v - center) * scale))));
    }

    case 'lynx': {
      // Atari Lynx: variable length, 8-bit (0-255)
      const scale = wave.max > 0 ? 255 / wave.max : 1;
      return wave.data.map(v => Math.round(Math.max(0, Math.min(255, v * scale))));
    }

    default:
      return wave.data;
  }
}
