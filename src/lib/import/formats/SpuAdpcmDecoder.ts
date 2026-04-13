/**
 * SPU ADPCM Decoder — PlayStation 1 audio codec
 *
 * Decodes VAG (with header) and raw VB/SPU (headerless) ADPCM data
 * to PCM audio. Each 16-byte block produces 28 signed 16-bit samples.
 *
 * Reference: PlayStation SPU hardware documentation, nocash PSX specs.
 */

/** Fixed filter coefficient pairs used by the SPU ADPCM codec */
const FILTER_COEFS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [60, 0],
  [115, -52],
  [98, -55],
  [122, -60],
];

const VAG_MAGIC = 0x56414770; // "VAGp" big-endian
const VAG_HEADER_SIZE = 48;
const BLOCK_SIZE = 16;
const SAMPLES_PER_BLOCK = 28;

export interface SpuAdpcmInfo {
  pcm: Float32Array;
  sampleRate: number;
  name: string;
}

/**
 * Detect whether a file is an SPU ADPCM format (.vag, .vb, .spu)
 */
export function isSpuFormat(filename: string, buffer: ArrayBuffer): boolean {
  const ext = filename.toLowerCase().split('.').pop();
  if (ext === 'vb' || ext === 'spu') return true;
  if (ext === 'vag') {
    if (buffer.byteLength < 4) return false;
    const view = new DataView(buffer);
    return view.getUint32(0, false) === VAG_MAGIC;
  }
  return false;
}

/**
 * Decode a single block of SPU ADPCM data (16 bytes -> 28 samples)
 */
function decodeBlock(
  data: Uint8Array,
  offset: number,
  prev1: number,
  prev2: number,
): { samples: Int16Array; prev1: number; prev2: number; flags: number } {
  const header = data[offset];
  const flags = data[offset + 1];

  const shift = header & 0x0f;
  const filterIdx = (header >> 4) & 0x07;

  // Clamp filter index to valid range
  const [coef1, coef2] = FILTER_COEFS[Math.min(filterIdx, 4)];

  const samples = new Int16Array(SAMPLES_PER_BLOCK);

  for (let i = 0; i < SAMPLES_PER_BLOCK; i++) {
    // Each byte holds two 4-bit nibbles; low nibble first, then high
    const byteIdx = offset + 2 + (i >> 1);
    const nibble = (i & 1) === 0
      ? (data[byteIdx] & 0x0f)
      : ((data[byteIdx] >> 4) & 0x0f);

    // Sign-extend 4-bit to signed integer
    const signed = nibble >= 8 ? nibble - 16 : nibble;

    // Apply shift and filter
    let sample = (signed << (12 - shift)) + ((prev1 * coef1 + prev2 * coef2 + 32) >> 6);

    // Clamp to 16-bit signed range
    if (sample > 32767) sample = 32767;
    else if (sample < -32768) sample = -32768;

    samples[i] = sample;
    prev2 = prev1;
    prev1 = sample;
  }

  return { samples, prev1, prev2, flags };
}

/**
 * Decode SPU ADPCM data to float32 PCM.
 *
 * @param buffer - Raw file data
 * @param filename - Used to detect format (VAG header vs raw)
 * @returns Decoded PCM, sample rate, and name
 */
export function decodeSpuAdpcm(buffer: ArrayBuffer, filename: string): SpuAdpcmInfo {
  const data = new Uint8Array(buffer);
  const ext = filename.toLowerCase().split('.').pop();

  let dataOffset = 0;
  let sampleRate = 44100;
  let name = filename.replace(/\.[^.]+$/, '');

  // Parse VAG header if present
  if (ext === 'vag' && buffer.byteLength >= VAG_HEADER_SIZE) {
    const view = new DataView(buffer);
    if (view.getUint32(0, false) === VAG_MAGIC) {
      dataOffset = VAG_HEADER_SIZE;
      sampleRate = view.getUint32(16, false) || 44100;

      // Extract name from bytes 32-47 (null-terminated ASCII)
      const nameBytes: number[] = [];
      for (let i = 32; i < 48; i++) {
        const b = data[i];
        if (b === 0) break;
        nameBytes.push(b);
      }
      if (nameBytes.length > 0) {
        name = String.fromCharCode(...nameBytes);
      }
    }
  }

  // Count valid blocks
  const dataLen = data.length - dataOffset;
  const numBlocks = Math.floor(dataLen / BLOCK_SIZE);

  if (numBlocks === 0) {
    return { pcm: new Float32Array(0), sampleRate, name };
  }

  // Decode all blocks
  const totalSamples = numBlocks * SAMPLES_PER_BLOCK;
  const pcmI16 = new Int16Array(totalSamples);
  let prev1 = 0;
  let prev2 = 0;
  let sampleIdx = 0;

  for (let block = 0; block < numBlocks; block++) {
    const blockOffset = dataOffset + block * BLOCK_SIZE;
    const result = decodeBlock(data, blockOffset, prev1, prev2);

    pcmI16.set(result.samples, sampleIdx);
    sampleIdx += SAMPLES_PER_BLOCK;
    prev1 = result.prev1;
    prev2 = result.prev2;

    // Flag bit 0 = loop end / end of data
    if (result.flags & 1) {
      // Trim to actual decoded length
      const trimmed = pcmI16.subarray(0, sampleIdx);
      return {
        pcm: int16ToFloat32(trimmed),
        sampleRate,
        name,
      };
    }
  }

  return {
    pcm: int16ToFloat32(pcmI16),
    sampleRate,
    name,
  };
}

/**
 * Convert Int16 PCM to Float32 [-1, 1]
 */
function int16ToFloat32(i16: Int16Array): Float32Array {
  const f32 = new Float32Array(i16.length);
  for (let i = 0; i < i16.length; i++) {
    f32[i] = i16[i] / 32768;
  }
  return f32;
}
