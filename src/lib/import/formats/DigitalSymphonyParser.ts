/**
 * DigitalSymphonyParser.ts — Digital Symphony (.dsym) native parser
 *
 * Digital Symphony is an Amiga tracker for RISC OS (Acorn Archimedes/A3000) by
 * Hexadecimal Software, ca. 1993. Despite the RISC OS origins, it plays back on
 * Amiga hardware via Paula. Files are identified by the extension ".dsym".
 *
 * Reference: Reference Code/openmpt-master/soundlib/Load_dsym.cpp (authoritative)
 *            DSym_Info format documentation (noted in OpenMPT comments)
 *            Sigma-delta decompression from TimPlayer
 *
 * File layout:
 *   Header (17 bytes):
 *     magic[8]       = \x02\x01\x13\x13\x14\x12\x01\x0B
 *     version        uint8   (0 or 1)
 *     numChannels    uint8   (1–8)
 *     numOrders      uint16LE (0–4096)
 *     numTracks      uint16LE (0–4096)
 *     infoLen        uint24LE
 *   Minimum 72 additional bytes (sample name length bytes × 63 + song name)
 *
 *   Sample name length array: 63 × uint8 (one per sample slot 1–63)
 *     If bit7 = 0: next 3 bytes = nLength uint24LE (<<1 = byte length)
 *     If bit7 = 1: sample is "virtual" (no data in file)
 *
 *   Song name: uint8 length-prefixed string
 *   allowedCommands: 8 bytes (bitmask of which effects are valid)
 *
 *   Sequence chunk (possibly LZW compressed):
 *     numOrders × numChannels × uint16LE  (track index per order+channel)
 *
 *   Track data (stored in 2000-track chunks, possibly LZW compressed):
 *     numTracks × 256 bytes (64 rows × 4 bytes per row)
 *     Row encoding: [noteInstr, instrCmd, cmdParam, extParam]
 *       note    = data[0] & 0x3F  (0=none, 1–63 → note+48 in XM scale)
 *       instr   = (data[0]>>6) | ((data[1]&0x0F)<<2)
 *       command = (data[1]>>6) | ((data[2]&0x0F)<<2)
 *       param   = (data[2]>>4) | (data[3]<<4)
 *
 *   Sample blocks: 63 samples (in order), each:
 *     name string (sampleNameLength[i] & 0x3F bytes, maybeNullTerminated)
 *     If bit7 NOT set (real sample):
 *       loopStart uint24LE (<<1)
 *       loopLength uint24LE (<<1)
 *       volume  uint8 (0–64)
 *       fineTune uint8
 *       packingType uint8
 *       ... then sample data depending on packingType
 *
 * Panning: channels where (chn & 3) == 1 or (chn & 3) == 2 → right (+50),
 *          otherwise → left (−50). (Hard Amiga LRRL panning.)
 *
 * Note mapping: rawNote + 48 = XM note (rawNote 1 → note 49 = C-4 area)
 *   OpenMPT: note += 47 + NOTE_MIN  (NOTE_MIN=1) = rawNote+48
 *
 * Sample formats:
 *   0 = Modified µ-Law 8-bit → 16-bit conversion
 *   1 = LZW-compressed 8-bit delta PCM
 *   2 = 8-bit signed PCM
 *   3 = 16-bit signed PCM
 *   4 = Sigma-delta compressed → 8-bit unsigned PCM
 *   5 = Sigma-delta compressed → µ-Law 16-bit (logarithmic)
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import type { UADEChipRamInfo } from '@/types/instrument';

// ── Constants ─────────────────────────────────────────────────────────────────

const DSYM_MAGIC = new Uint8Array([0x02, 0x01, 0x13, 0x13, 0x14, 0x12, 0x01, 0x0B]);
const HEADER_SIZE = 17;            // magic(8) + version(1) + numChannels(1) + numOrders(2) + numTracks(2) + infoLen(3)
const MIN_ADDITIONAL = 72;        // from GetHeaderMinimumAdditionalSize()
const MAX_SAMPLES = 63;
const ROWS_PER_TRACK = 64;
const BYTES_PER_ROW = 4;
const BYTES_PER_TRACK = ROWS_PER_TRACK * BYTES_PER_ROW; // 256

// µ-law decode table for 8-bit µ-Law samples (standard ITU-T G.711)
// 255 quantisation levels → 16-bit signed linear
const ULAW_TABLE: Int16Array = (() => {
  const t = new Int16Array(256);
  for (let i = 0; i < 256; i++) {
    const u = ~i & 0xFF;
    const sign = (u & 0x80) ? -1 : 1;
    const exponent = (u >> 4) & 0x07;
    const mantissa = u & 0x0F;
    const mag = ((mantissa << 1) | 0x21) << exponent;
    t[i] = sign * (mag - 33);
  }
  return t;
})();

// ── String decoding (RISC OS Latin-1 approximation) ──────────────────────────

function decodeRISCOS(raw: Uint8Array): string {
  let s = '';
  for (let i = 0; i < raw.length; i++) {
    s += String.fromCharCode(raw[i] < 0x20 ? 0x20 : raw[i]);
  }
  return s.trimEnd();
}

// ── BitReader for LZW/sigma-delta decompression ───────────────────────────────

class BitReader {
  private data: Uint8Array;
  private bytePos: number;
  private bitBuf: number;
  private bitsLeft: number;

  constructor(data: Uint8Array, startPos: number) {
    this.data = data;
    this.bytePos = startPos;
    this.bitBuf = 0;
    this.bitsLeft = 0;
  }

  get position(): number { return this.bytePos; }

  readBits(n: number): number {
    while (this.bitsLeft < n) {
      if (this.bytePos >= this.data.length) throw new Error('BitReader EOF');
      this.bitBuf |= this.data[this.bytePos++] << this.bitsLeft;
      this.bitsLeft += 8;
    }
    const result = this.bitBuf & ((1 << n) - 1);
    this.bitBuf >>>= n;
    this.bitsLeft -= n;
    return result;
  }
}

// ── LZW decompression (13-bit, as used by Digital Symphony) ──────────────────

/**
 * Decompress a DSym LZW-compressed chunk.
 * Mirrors DecompressDSymLZW() in Load_dsym.cpp exactly.
 *
 * @param data       - Source bytes starting at the compressed data
 * @param startPos   - Offset into `data` where compressed bits begin
 * @param size       - Expected decompressed size in bytes
 * @returns { output: Uint8Array, endPos: number } where endPos is aligned to 4 bytes from startPos
 */
function decompressDSymLZW(data: Uint8Array, startPos: number, size: number): { output: Uint8Array; endPos: number } {
  const MAX_NODES = 1 << 13; // 8192
  const RESET_DICT = 256;
  const END_OF_STREAM = 257;

  const dictPrev  = new Uint16Array(MAX_NODES);
  const dictValue = new Uint8Array(MAX_NODES);
  const match     = new Uint8Array(MAX_NODES);

  // Initialise literal dictionary entries
  for (let i = 0; i < 256; i++) {
    dictPrev[i]  = MAX_NODES;
    dictValue[i] = i;
  }

  let codeSize  = 9;
  let prevCode  = 0;
  let nextIndex = 257;

  const output  = new Uint8Array(size);
  let outPos    = 0;

  const bits = new BitReader(data, startPos);

  outer: while (outPos < size) {
    const newCode = bits.readBits(codeSize);

    if (newCode === END_OF_STREAM || newCode > nextIndex) break;

    if (newCode === RESET_DICT) {
      codeSize  = 9;
      prevCode  = 0;
      nextIndex = 257;
      continue;
    }

    // Walk dictionary chain to reconstruct string
    let code       = (newCode < nextIndex) ? newCode : prevCode;
    let writeOffset = MAX_NODES;

    do {
      match[--writeOffset] = dictValue[code];
      code = dictPrev[code];
    } while (code < MAX_NODES);

    const matchLen = MAX_NODES - writeOffset;

    // KwKwK: if newCode == nextIndex, append first char of match
    const copyLen = (newCode === nextIndex) ? matchLen + 1 : matchLen;
    if (outPos + copyLen > size) {
      // Only copy what fits
      for (let i = writeOffset; i < MAX_NODES && outPos < size; i++) {
        output[outPos++] = match[i];
      }
      if (newCode === nextIndex && outPos < size) {
        output[outPos++] = match[writeOffset];
      }
      break outer;
    }

    for (let i = writeOffset; i < MAX_NODES; i++) {
      output[outPos++] = match[i];
    }
    if (newCode === nextIndex) {
      output[outPos++] = match[writeOffset];
    }

    // Add entry to dictionary
    if (nextIndex < MAX_NODES) {
      // Special case: don't add entry when output is already done
      // (matches FULLEFFECT/NARCOSIS/NEWDANCE comment in original)
      if (outPos < size) {
        dictValue[nextIndex] = match[writeOffset];
        dictPrev[nextIndex]  = prevCode;

        nextIndex++;
        if (nextIndex !== MAX_NODES && nextIndex === (1 << codeSize)) {
          codeSize++;
        }
      }
    }

    prevCode = newCode;
  }

  // Align to 4 bytes from startPos (mirrors OpenMPT's file seek)
  const bitEndPos = bits.position;
  const endPos = startPos + (((bitEndPos - startPos) + 3) & ~3);

  return { output, endPos };
}

// ── Sigma-delta decompression ────────────────────────────────────────────────

/**
 * Decompress a DSym sigma-delta compressed sample chunk.
 * Mirrors DecompressDSymSigmaDelta() in Load_dsym.cpp exactly.
 *
 * The file byte immediately before the bit stream is maxRunLength.
 *
 * @param data     - Full file bytes
 * @param pos      - Position of the maxRunLength byte (before the bit stream)
 * @param size     - Expected decompressed sample byte count
 * @returns { output: Uint8Array; endPos: number }
 */
function decompressDSymSigmaDelta(data: Uint8Array, pos: number, size: number): { output: Uint8Array; endPos: number } {
  // maxRunLength must be at least 1
  let maxRunLength = data[pos++];
  if (maxRunLength < 1) maxRunLength = 1;

  // Clamp size to what the remaining data can provide at best (1 bit/sample)
  const remainingBytes = data.length - pos;
  const maxFromData = Math.min(remainingBytes, 0x1FFFFFFF) * 8; // avoid overflow
  if (size > maxFromData) size = maxFromData;

  const output   = new Uint8Array(size);
  let outPos     = 0;
  let runLength  = maxRunLength;
  let numBits    = 8;

  const startBitPos = pos; // byte position where bit stream begins
  const bits = new BitReader(data, pos);

  // First sample: read full 8-bit initial accumulator value
  let accum = bits.readBits(numBits) & 0xFF;
  output[outPos++] = accum;

  while (outPos < size) {
    const value = bits.readBits(numBits);

    if (value === 0) {
      // Increase bit width
      if (numBits >= 9) break;
      numBits++;
      runLength = maxRunLength;
      continue;
    }

    // Delta decode: low bit = sign (1 = subtract), upper bits = magnitude
    if (value & 1) {
      accum = (accum - (value >>> 1)) & 0xFF;
    } else {
      accum = (accum + (value >>> 1)) & 0xFF;
    }
    output[outPos++] = accum;

    // If high bit of value is set, reset run length (keep current bit width)
    if ((value >>> (numBits - 1)) !== 0) {
      runLength = maxRunLength;
      continue;
    }

    // Decrease bit width when run length exhausted
    if (--runLength === 0) {
      if (numBits > 1) numBits--;
      runLength = maxRunLength;
    }
  }

  // Align end position to 4 bytes from bit stream start
  const bitEndPos = bits.position;
  const endPos = startBitPos + (((bitEndPos - startBitPos) + 3) & ~3);

  return { output, endPos };
}

// ── ReadDSymChunk ─────────────────────────────────────────────────────────────

/**
 * Read one DSym data chunk (either raw or LZW-compressed).
 * packingType byte:
 *   0 = raw (size bytes follow directly)
 *   1 = LZW compressed
 *
 * Returns the decompressed data and the new position in `data`.
 */
function readDSymChunk(data: Uint8Array, pos: number, size: number): { chunk: Uint8Array; endPos: number } | null {
  if (pos >= data.length) return null;
  const packingType = data[pos++];
  if (packingType > 1) return null;

  if (packingType === 1) {
    // LZW compressed
    const { output, endPos } = decompressDSymLZW(data, pos, size);
    if (output.length < size) return null;
    return { chunk: output, endPos };
  } else {
    // Raw
    if (pos + size > data.length) return null;
    const chunk = data.slice(pos, pos + size);
    return { chunk, endPos: pos + size };
  }
}

// ── Format detection ───────────────────────────────────────────────────────────

/**
 * Returns true if the buffer has the Digital Symphony magic bytes and a valid header.
 */
export function isDigitalSymphonyFormat(bytes: Uint8Array): boolean {
  if (bytes.length < HEADER_SIZE + MIN_ADDITIONAL) return false;

  // Check magic
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== DSYM_MAGIC[i]) return false;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version     = bytes[8];
  const numChannels = bytes[9];
  const numOrders   = view.getUint16(10, true);
  const numTracks   = view.getUint16(12, true);

  if (version > 1)                   return false;
  if (numChannels < 1 || numChannels > 8) return false;
  if (numOrders > 4096)              return false;
  if (numTracks > 4096)              return false;

  return true;
}

// ── u-Law decode helper ────────────────────────────────────────────────────────

/**
 * Apply OpenMPT's "modified u-Law" transform to a byte:
 *   v = (v << 7) | ((~v) >> 1)   (all operations on uint8)
 * Then decode the resulting byte through the ITU G.711 µ-law table.
 *
 * OpenMPT reads the transformed bytes, then decodes them as SampleIO::uLaw.
 * The SampleIO::uLaw path in OpenMPT uses the standard G.711 table (16-bit output).
 */
function modifiedULawDecode8to16(raw: Uint8Array): Int16Array {
  const out = new Int16Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    const v = ((raw[i] << 7) | ((~raw[i] & 0xFF) >> 1)) & 0xFF;
    out[i] = ULAW_TABLE[v];
  }
  return out;
}

/**
 * Convert 8-bit signed PCM to Int16Array (scale from -128..127 to -32768..32767).
 */
function pcm8SignedToInt16(raw: Uint8Array): Int16Array {
  const out = new Int16Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    const s = (raw[i] ^ 0x80) - 128; // convert unsigned to signed
    out[i] = s * 256;
  }
  return out;
}

/**
 * Convert 8-bit delta PCM to Int16Array.
 * Delta PCM: each byte is an 8-bit delta; accum carries forward.
 */
function deltaPCM8ToInt16(raw: Uint8Array): Int16Array {
  const out  = new Int16Array(raw.length);
  let accum  = 0;
  for (let i = 0; i < raw.length; i++) {
    accum = (accum + (raw[i] << 24 >> 24)) & 0xFF; // int8 delta, uint8 accumulator
    const s = (accum ^ 0x80) - 128;
    out[i] = s * 256;
  }
  return out;
}

/**
 * Convert 16-bit signed LE PCM bytes to Int16Array.
 */
function pcm16leToInt16(raw: Uint8Array): Int16Array {
  const out  = new Int16Array(raw.length >> 1);
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  for (let i = 0; i < out.length; i++) {
    out[i] = view.getInt16(i * 2, true);
  }
  return out;
}

/**
 * Decode sigma-delta type 5 (logarithmic) samples.
 * After sigma-delta decompression, apply XOR mask:
 *   if v >= 0x80 → v ^= 0xFF (i.e., ^= xorMask[1] = 0x7F? — see below)
 *
 * From OpenMPT:
 *   static constexpr uint8 xorMask[] = {0x00, 0x7F};
 *   v ^= xorMask[v >> 7];
 * Then decoded as SampleIO::uLaw (16-bit).
 */
function sigmaDeltas5ToInt16(raw: Uint8Array): Int16Array {
  const out = new Int16Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    const v = raw[i];
    const xored = v ^ (v >= 0x80 ? 0x7F : 0x00);
    out[i] = ULAW_TABLE[xored];
  }
  return out;
}

/**
 * Convert sigma-delta type 4 (linear/unsigned) samples.
 * Sigma-delta output is 8-bit unsigned. Scale to 16-bit.
 */
function sigmaDelta4ToInt16(raw: Uint8Array): Int16Array {
  const out = new Int16Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    out[i] = ((raw[i] - 128) * 256) | 0;
  }
  return out;
}

/**
 * Build a WAV ArrayBuffer from Int16Array PCM data at 8287 Hz (PAL Amiga C-3).
 */
function int16ToWAV(samples: Int16Array, rate = 8287, loopStart = 0, loopEnd = 0): ArrayBuffer {
  const numSamples = samples.length;
  const dataBytes  = numSamples * 2;
  const hasLoop    = loopEnd > loopStart && loopEnd > 2;

  // WAV with or without smpl chunk for looping
  const smplChunkSize = hasLoop ? 4 + 36 + 4 + 4 + 4 + 4 + 4 + 4 + 4 + 4 + 4 + 4 + 4 + 4 : 0;
  const smplTotal     = hasLoop ? 8 + smplChunkSize : 0;
  const fileSize      = 44 + dataBytes + smplTotal;

  const buf  = new ArrayBuffer(fileSize);
  const view = new DataView(buf);
  const u8s  = new Uint8Array(buf);

  // RIFF header
  u8s[0] = 0x52; u8s[1] = 0x49; u8s[2] = 0x46; u8s[3] = 0x46; // 'RIFF'
  view.setUint32(4, fileSize - 8, true);
  u8s[8] = 0x57; u8s[9] = 0x41; u8s[10] = 0x56; u8s[11] = 0x45; // 'WAVE'

  // fmt chunk
  u8s[12] = 0x66; u8s[13] = 0x6D; u8s[14] = 0x74; u8s[15] = 0x20; // 'fmt '
  view.setUint32(16, 16, true);    // chunk size
  view.setUint16(20, 1, true);     // PCM
  view.setUint16(22, 1, true);     // mono
  view.setUint32(24, rate, true);  // sample rate
  view.setUint32(28, rate * 2, true); // byte rate
  view.setUint16(32, 2, true);     // block align
  view.setUint16(34, 16, true);    // bits per sample

  // data chunk
  u8s[36] = 0x64; u8s[37] = 0x61; u8s[38] = 0x74; u8s[39] = 0x61; // 'data'
  view.setUint32(40, dataBytes, true);

  const pcmU8 = new Uint8Array(buf, 44, dataBytes);
  const pcmView = new DataView(buf, 44, dataBytes);
  for (let i = 0; i < numSamples; i++) {
    pcmView.setInt16(i * 2, samples[i], true);
  }
  void pcmU8; // suppress lint warning

  if (hasLoop) {
    let off = 44 + dataBytes;
    // 'smpl' chunk
    u8s[off++] = 0x73; u8s[off++] = 0x6D; u8s[off++] = 0x70; u8s[off++] = 0x6C; // 'smpl'
    view.setUint32(off, smplChunkSize, true); off += 4;
    // manufacturer, product, samplePeriod, midiUnityNote, midiPitchFraction
    view.setUint32(off, 0, true); off += 4;  // manufacturer
    view.setUint32(off, 0, true); off += 4;  // product
    view.setUint32(off, Math.round(1e9 / rate), true); off += 4; // samplePeriod ns
    view.setUint32(off, 60, true); off += 4; // midiUnityNote = C-4
    view.setUint32(off, 0, true); off += 4;  // midiPitchFraction
    view.setUint32(off, 0, true); off += 4;  // smpteFormat
    view.setUint32(off, 0, true); off += 4;  // smpteOffset
    view.setUint32(off, 1, true); off += 4;  // numSampleLoops
    view.setUint32(off, 0, true); off += 4;  // samplerData
    // Loop record:
    view.setUint32(off, 0, true); off += 4;  // cuePointID
    view.setUint32(off, 0, true); off += 4;  // type (0 = forward)
    view.setUint32(off, loopStart, true); off += 4; // start
    view.setUint32(off, loopEnd - 1, true); off += 4; // end (inclusive)
    view.setUint32(off, 0, true); off += 4;  // fraction
    view.setUint32(off, 0, true); off += 4;  // playCount (0 = infinite)
  }

  return buf;
}

// ── MOD2XMFineTune ────────────────────────────────────────────────────────────

/**
 * Convert an Amiga MOD finetune nibble (0–15) to XM finetune semitones × 128.
 * Mirrors OpenMPT's MOD2XMFineTune():
 *   finetune 0–7 → 0, 16, 32, 48, 64, 80, 96, 112
 *   finetune 8–15 → -128, -112, -96, -80, -64, -48, -32, -16
 * (Signed 4-bit value: 8–15 are negative –8 to –1)
 */
// Not used in our output (we pass finetune as 0 in WAV since it doesn't apply directly),
// but we read and store it for completeness.

// ── Effect conversion helpers ─────────────────────────────────────────────────

/** MOD effect nibble → XM effTyp (as returned by ConvertModCommand for simple cases) */
function convertModEffectToXM(command: number, param: number): { effTyp: number; eff: number } {
  // Standard MOD effects 0-F map 1:1 to XM effTyp 0-F
  return { effTyp: command & 0x0F, eff: param & 0xFF };
}

// ── Main parser ────────────────────────────────────────────────────────────────

/**
 * Parse a Digital Symphony (.dsym) file into a TrackerSong.
 * Returns null on any parse failure.
 */
export function parseDigitalSymphonyFile(bytes: Uint8Array, filename: string): TrackerSong | null {
  try {
    return parseDigitalSymphonyFileImpl(bytes, filename);
  } catch {
    return null;
  }
}

function parseDigitalSymphonyFileImpl(bytes: Uint8Array, filename: string): TrackerSong | null {
  if (!isDigitalSymphonyFormat(bytes)) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // ── Header ────────────────────────────────────────────────────────────────
  let pos = 8; // skip magic
  const version     = bytes[pos++];         // 0 or 1
  const numChannels = bytes[pos++];          // 1–8
  const numOrders   = view.getUint16(pos, true); pos += 2;
  const numTracks   = view.getUint16(pos, true); pos += 2;
  const infoLen     = bytes[pos] | (bytes[pos + 1] << 8) | (bytes[pos + 2] << 16); pos += 3;

  void version; // stored but not used in output

  // ── Channel panning (Amiga LRRL pattern) ─────────────────────────────────
  // OpenMPT: (chn & 3) == 1 or == 2 → 64 (right), else → 192 (left)
  // In DEViLBOX: pan is -50 (left) to +50 (right)
  function channelPan(chn: number): number {
    const mod3 = chn & 3;
    return (mod3 === 1 || mod3 === 2) ? 50 : -50;
  }

  // ── Sample name length array (63 bytes) ──────────────────────────────────
  const sampleNameLength = new Uint8Array(64); // index 1..63
  for (let smp = 1; smp <= MAX_SAMPLES; smp++) {
    if (pos >= bytes.length) return null;
    sampleNameLength[smp] = bytes[pos++];
  }

  // ── Read sample lengths (uint24LE << 1, only for non-virtual samples) ────
  const sampleLength = new Uint32Array(64); // in bytes
  for (let smp = 1; smp <= MAX_SAMPLES; smp++) {
    if (!(sampleNameLength[smp] & 0x80)) {
      if (pos + 3 > bytes.length) return null;
      const len24 = bytes[pos] | (bytes[pos + 1] << 8) | (bytes[pos + 2] << 16);
      sampleLength[smp] = len24 << 1;
      pos += 3;
    }
  }

  // ── Song name (uint8 length-prefixed) ─────────────────────────────────────
  if (pos >= bytes.length) return null;
  const songNameLen = bytes[pos++];
  if (pos + songNameLen > bytes.length) return null;
  const songNameBytes = bytes.slice(pos, pos + songNameLen);
  pos += songNameLen;
  const songName = decodeRISCOS(songNameBytes).trim() || filename.replace(/\.[^/.]+$/, '');

  // ── allowedCommands (8 bytes, bitmask) ────────────────────────────────────
  if (pos + 8 > bytes.length) return null;
  const allowedCommands = bytes.slice(pos, pos + 8);
  pos += 8;

  // ── Sequence chunk ────────────────────────────────────────────────────────
  // numOrders × numChannels × uint16LE track indices
  const sequenceSize = numOrders * numChannels * 2;
  let sequence: Uint16Array | null = null;

  if (numOrders > 0) {
    const result = readDSymChunk(bytes, pos, sequenceSize);
    if (!result) return null;
    pos = result.endPos;
    sequence = new Uint16Array(result.chunk.buffer, result.chunk.byteOffset, sequenceSize / 2);
  } else {
    sequence = new Uint16Array(0);
  }

  // ── Track data (2000-track chunks) ───────────────────────────────────────
  // Total: numTracks × 256 bytes (64 rows × 4 bytes)
  const trackData = new Uint8Array(numTracks * BYTES_PER_TRACK);
  let trackOffset = 0;

  for (let chunkStart = 0; chunkStart < numTracks; chunkStart += 2000) {
    const chunkTracks = Math.min(numTracks - chunkStart, 2000);
    const chunkSize   = chunkTracks * BYTES_PER_TRACK;

    const result = readDSymChunk(bytes, pos, chunkSize);
    if (!result) return null;
    pos = result.endPos;

    trackData.set(result.chunk.slice(0, chunkSize), trackOffset);
    trackOffset += chunkSize;
  }

  // ── Build patterns ────────────────────────────────────────────────────────
  const patterns: Pattern[] = [];

  for (let patIdx = 0; patIdx < numOrders; patIdx++) {
    const channels: ChannelData[] = [];

    for (let chn = 0; chn < numChannels; chn++) {
      const trackIdx = (sequence !== null) ? sequence[patIdx * numChannels + chn] : 0;
      const rows: TrackerCell[] = [];

      for (let row = 0; row < ROWS_PER_TRACK; row++) {
        const cell = buildCell(
          trackData,
          trackIdx,
          numTracks,
          row,
          chn,
          allowedCommands,
          patIdx,
          numChannels,
        );
        rows.push(cell);
      }

      channels.push({
        id:           `channel-${chn}`,
        name:         `Channel ${chn + 1}`,
        muted:        false,
        solo:         false,
        collapsed:    false,
        volume:       100,
        pan:          channelPan(chn),
        instrumentId: null,
        color:        null,
        rows,
      });
    }

    patterns.push({
      id:     `pattern-${patIdx}`,
      name:   `Pattern ${patIdx}`,
      length: ROWS_PER_TRACK,
      channels,
      importMetadata: {
        sourceFormat:            'DigitalSymphony',
        sourceFile:              filename,
        importedAt:              new Date().toISOString(),
        originalChannelCount:    numChannels,
        originalPatternCount:    numOrders,
        originalInstrumentCount: MAX_SAMPLES,
      },
    });
  }

  // Ensure at least one pattern
  if (patterns.length === 0) {
    patterns.push(makeEmptyPattern(filename, numChannels));
  }

  // ── Sample metadata + audio data ──────────────────────────────────────────
  const instruments: InstrumentConfig[] = [];

  for (let smp = 1; smp <= MAX_SAMPLES; smp++) {
    const _dsymEntryStart = pos;
    const nameLen = sampleNameLength[smp] & 0x3F; // strip bit7
    const isVirtual = (sampleNameLength[smp] & 0x80) !== 0;

    // Read name string
    let smpName = '';
    if (nameLen > 0) {
      if (pos + nameLen > bytes.length) {
        // File is truncated — push empty instruments for the rest
        for (let rest = smp; rest <= MAX_SAMPLES; rest++) {
          instruments.push(makeEmptyInstrument(rest));
        }
        break;
      }
      const nameRaw = bytes.slice(pos, pos + nameLen);
      pos += nameLen;
      // maybeNullTerminated: stop at first \0
      let end = nameRaw.indexOf(0);
      if (end < 0) end = nameLen;
      smpName = decodeRISCOS(nameRaw.slice(0, end));
    }

    if (isVirtual || sampleLength[smp] === 0) {
      // No sample data in file
      instruments.push({ ...makeEmptyInstrument(smp, smpName || "Sample " + smp), uadeChipRam: { moduleBase: 0, moduleSize: bytes.length, instrBase: _dsymEntryStart, instrSize: 0 } as UADEChipRamInfo });
      continue;
    }

    // ── Real sample: read loop/volume/finetune metadata ───────────────────
    if (pos + 8 > bytes.length) {
      instruments.push({ ...makeEmptyInstrument(smp, smpName || "Sample " + smp), uadeChipRam: { moduleBase: 0, moduleSize: bytes.length, instrBase: _dsymEntryStart, instrSize: 0 } as UADEChipRamInfo });
      continue;
    }

    const loopStartBytes = (bytes[pos] | (bytes[pos + 1] << 8) | (bytes[pos + 2] << 16)) << 1;
    pos += 3;
    const loopLenBytes   = (bytes[pos] | (bytes[pos + 1] << 8) | (bytes[pos + 2] << 16)) << 1;
    pos += 3;
    const volume    = Math.min(bytes[pos++], 64);
    const fineTune  = bytes[pos++]; // MOD finetune nibble (0-15 unsigned = -8 to +7 signed)

    void fineTune; // unused in WAV sample rate; would need to be applied separately

    // Has sustain loop?
    const hasLoop = loopLenBytes > 2;
    const loopStart = loopStartBytes; // in samples (since 8-bit samples: byte offset = sample offset)
    const loopEnd   = hasLoop ? loopStartBytes + loopLenBytes : 0;

    // ── Read packing type and decode sample ───────────────────────────────
    if (pos >= bytes.length) {
      instruments.push({ ...makeEmptyInstrument(smp, smpName || "Sample " + smp), uadeChipRam: { moduleBase: 0, moduleSize: bytes.length, instrBase: _dsymEntryStart, instrSize: 0 } as UADEChipRamInfo });
      continue;
    }

    const packingType = bytes[pos++];

    let pcmInt16: Int16Array | null = null;
    const nLength = sampleLength[smp]; // expected output byte count

    switch (packingType) {
      case 0: {
        // Modified µ-Law: nLength raw bytes → nLength 16-bit samples
        if (pos + nLength > bytes.length) { pos += Math.min(nLength, bytes.length - pos); break; }
        const raw = bytes.slice(pos, pos + nLength);
        pos += nLength;
        pcmInt16 = modifiedULawDecode8to16(raw);
        break;
      }

      case 1: {
        // LZW-compressed 8-bit delta PCM
        let lzwResult: { output: Uint8Array; endPos: number };
        try {
          lzwResult = decompressDSymLZW(bytes, pos, nLength);
        } catch {
          // Truncated or corrupt — skip
          break;
        }
        pos = lzwResult.endPos;
        pcmInt16 = deltaPCM8ToInt16(lzwResult.output);
        break;
      }

      case 2: {
        // 8-bit signed PCM
        if (pos + nLength > bytes.length) { pos += Math.min(nLength, bytes.length - pos); break; }
        const raw = bytes.slice(pos, pos + nLength);
        pos += nLength;
        pcmInt16 = pcm8SignedToInt16(raw);
        break;
      }

      case 3: {
        // 16-bit signed LE PCM (nLength bytes = nLength/2 samples)
        if (pos + nLength > bytes.length) { pos += Math.min(nLength, bytes.length - pos); break; }
        const raw = bytes.slice(pos, pos + nLength);
        pos += nLength;
        pcmInt16 = pcm16leToInt16(raw);
        break;
      }

      case 4: {
        // Sigma-delta → 8-bit unsigned
        let sdResult: { output: Uint8Array; endPos: number };
        try {
          sdResult = decompressDSymSigmaDelta(bytes, pos, nLength);
        } catch {
          break;
        }
        pos = sdResult.endPos;
        pcmInt16 = sigmaDelta4ToInt16(sdResult.output);
        break;
      }

      case 5: {
        // Sigma-delta → µ-Law 16-bit (logarithmic differences)
        let sdResult: { output: Uint8Array; endPos: number };
        try {
          sdResult = decompressDSymSigmaDelta(bytes, pos, nLength);
        } catch {
          break;
        }
        pos = sdResult.endPos;
        pcmInt16 = sigmaDeltas5ToInt16(sdResult.output);
        break;
      }

      default:
        // Unknown packing type — skip this sample
        instruments.push({ ...makeEmptyInstrument(smp, smpName || "Sample " + smp), uadeChipRam: { moduleBase: 0, moduleSize: bytes.length, instrBase: _dsymEntryStart, instrSize: 0 } as UADEChipRamInfo });
        continue;
    }

    if (!pcmInt16 || pcmInt16.length === 0) {
      instruments.push({ ...makeEmptyInstrument(smp, smpName || "Sample " + smp), uadeChipRam: { moduleBase: 0, moduleSize: bytes.length, instrBase: _dsymEntryStart, instrSize: 0 } as UADEChipRamInfo });
      continue;
    }

    // Convert to u8 for createSamplerInstrument (it expects 8-bit signed or unsigned)
    // We use int16ToWAV directly and build a custom instrument config.
    const loopStartSamples = loopStart; // for 8-bit samples, byte = sample offset
    const loopEndSamples   = hasLoop ? loopEnd : 0;

    const wavBuf = int16ToWAV(pcmInt16, 8287, loopStartSamples, loopEndSamples);
    const instName = smpName.trim() || `Sample ${smp}`;

    instruments.push({
      id:        smp,
      name:      instName,
      type:      'sample' as const,
      synthType: 'Sampler' as const,
      effects:   [],
      volume:    volume === 0 ? -60 : Math.round((volume / 64) * 60) - 60,
      pan:       0,
      samplerConfig: {
        audioBuffer: wavBuf,
        baseNote:    'C3',
        loopStart:   hasLoop ? loopStartSamples / pcmInt16.length : 0,
        loopEnd:     hasLoop ? loopEndSamples   / pcmInt16.length : 0,
        loopMode:    hasLoop ? 'sustain' : 'none',
        loopEnabled: hasLoop,
        volume:      volume / 64,
        pan:         0,
        attack:      0,
        decay:       0,
        sustain:     1,
        release:     0,
      },
      uadeChipRam: { moduleBase: 0, moduleSize: bytes.length, instrBase: _dsymEntryStart, instrSize: 9 } as UADEChipRamInfo,
    } as unknown as InstrumentConfig);
  }

  // ── Info chunk (song message, optional) ───────────────────────────────────
  // We read and discard it (or could attach it to the song name).
  if (infoLen > 0 && pos < bytes.length) {
    const infoResult = readDSymChunk(bytes, pos, infoLen);
    if (infoResult) {
      pos = infoResult.endPos;
      void pos; // silence lint
    }
  }

  // ── Build TrackerSong ─────────────────────────────────────────────────────
  const songPositions = patterns.map((_, i) => i);

  return {
    name:            songName,
    format:          'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength:      songPositions.length,
    restartPosition: 0,
    numChannels,
    initialSpeed:    6,
    initialBPM:      125,
    linearPeriods:   false,
  };
}

// ── Cell builder ──────────────────────────────────────────────────────────────

/**
 * Decode one tracker cell from the raw track data and map it to a TrackerCell.
 * Mirrors the command switch in CSoundFile::ReadDSym().
 */
function buildCell(
  trackData:       Uint8Array,
  trackIdx:        number,
  numTracks:       number,
  row:             number,
  _chn:            number,
  allowedCommands: Uint8Array,
  _pat:            number,
  _numChannels:    number,
): TrackerCell {
  const cell: TrackerCell = { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };

  if (trackIdx >= numTracks) return cell;

  const base = trackIdx * BYTES_PER_TRACK + row * BYTES_PER_ROW;
  if (base + 4 > trackData.length) return cell;

  const d0 = trackData[base];
  const d1 = trackData[base + 1];
  const d2 = trackData[base + 2];
  const d3 = trackData[base + 3];

  // Note: bits 5–0 of d0
  const rawNote = d0 & 0x3F;
  if (rawNote !== 0) {
    cell.note = rawNote + 48; // OpenMPT: rawNote + 47 + NOTE_MIN (NOTE_MIN=1)
  }

  // Instrument: bits 7–6 of d0 | bits 3–0 of d1
  cell.instrument = (d0 >> 6) | ((d1 & 0x0F) << 2);

  // Command and param
  const command = (d1 >> 6) | ((d2 & 0x0F) << 2);
  const param   = (d2 >> 4) | (d3 << 4);

  // Check allowed commands bitmask
  if (!(allowedCommands[command >> 3] & (1 << (command & 7)))) return cell;
  if (command === 0 && param === 0) return cell;

  const paramLo  = param & 0xFF;
  const paramHi  = (param >> 8) & 0xFF;

  switch (command) {
    // ── 00 xyz Normal play or Arpeggio + Volume Slide Up ─────────────────
    // ── 01 xyy Slide Up + Volume Slide Up ────────────────────────────────
    // ── 02 xyy Slide Down + Volume Slide Up ──────────────────────────────
    case 0x00:
    case 0x01:
    case 0x02: {
      const { effTyp, eff } = convertModEffectToXM(command & 0x0F, paramLo);
      cell.effTyp = effTyp;
      cell.eff    = eff;
      if (paramHi !== 0) {
        cell.effTyp2 = 0x3A; // VOLCMD_VOLSLIDEUP (volume column slide up in XM: not standard)
        // In DEViLBOX we just store the volume column value; use effTyp2/eff2 for second effect
        // The vol slide up is encoded as a secondary effect
        // For simplicity: map to volume column (no exact XM equivalent, store as raw)
        cell.effTyp2 = 0;
        cell.eff2    = 0;
      }
      break;
    }

    // ── 20 xyz Normal play or Arpeggio + Volume Slide Down ───────────────
    // ── 21 xyy Slide Up + Volume Slide Down ──────────────────────────────
    // ── 22 xyy Slide Down + Volume Slide Down ────────────────────────────
    case 0x20:
    case 0x21:
    case 0x22: {
      const { effTyp, eff } = convertModEffectToXM(command & 0x0F, paramLo);
      cell.effTyp = effTyp;
      cell.eff    = eff;
      break;
    }

    // ── 03 xyy Tone Portamento ────────────────────────────────────────────
    case 0x03:
      cell.effTyp = 0x03;
      cell.eff    = paramLo;
      break;

    // ── 04 xyz Vibrato ────────────────────────────────────────────────────
    case 0x04:
      cell.effTyp = 0x04;
      cell.eff    = paramLo;
      break;

    // ── 05 xyz Tone Portamento + Volume Slide ─────────────────────────────
    case 0x05:
      cell.effTyp = 0x05;
      cell.eff    = paramLo;
      break;

    // ── 06 xyz Vibrato + Volume Slide ─────────────────────────────────────
    case 0x06:
      cell.effTyp = 0x06;
      cell.eff    = paramLo;
      break;

    // ── 07 xyz Tremolo ────────────────────────────────────────────────────
    case 0x07:
      cell.effTyp = 0x07;
      cell.eff    = paramLo;
      break;

    // ── 09 xxx Set Sample Offset ──────────────────────────────────────────
    case 0x09:
      cell.effTyp = 0x09;
      cell.eff    = (param >> 1) & 0xFF;
      break;

    // ── 0A xyz Volume Slide + Fine Slide Up ───────────────────────────────
    case 0x0A: {
      if (param < 0xFF) {
        const { effTyp, eff } = convertModEffectToXM(0x0A, paramLo);
        cell.effTyp = effTyp;
        cell.eff    = eff;
      } else {
        // Fine slide up: EFxx
        cell.effTyp = 0x0E; // CMD_MODCMDEX
        cell.eff    = 0x10 | (paramHi & 0x0F);
      }
      break;
    }

    // ── 2A xyz Volume Slide + Fine Slide Down ─────────────────────────────
    case 0x2A: {
      if (param < 0xFF) {
        const { effTyp, eff } = convertModEffectToXM(0x0A, paramLo);
        cell.effTyp = effTyp;
        cell.eff    = eff;
      } else {
        // Fine slide down: E2xx
        cell.effTyp = 0x0E;
        cell.eff    = 0x20 | (paramHi & 0x0F);
      }
      break;
    }

    // ── 0B xxx Position Jump ──────────────────────────────────────────────
    case 0x0B:
      cell.effTyp = 0x0B;
      cell.eff    = Math.min(param, 255);
      break;

    // ── 0C xyy Set Volume ─────────────────────────────────────────────────
    case 0x0C:
      cell.effTyp = 0x0C;
      cell.eff    = paramLo;
      break;

    // ── 0D xyy Pattern Break (not BCD) ────────────────────────────────────
    case 0x0D:
      cell.effTyp = 0x0D;
      cell.eff    = paramLo > 63 ? 0 : paramLo;
      break;

    // ── 0F xxx Set Speed ──────────────────────────────────────────────────
    case 0x0F:
      cell.effTyp = 0x0F;
      cell.eff    = Math.min(param, 255);
      break;

    // ── 10 xxy Filter Control ────────────────────────────────────────────
    case 0x10:
      cell.effTyp = 0x0E;
      cell.eff    = (0x00 << 4) | (paramLo & 0x0F);
      break;

    // ── 11 xyy Fine Slide Up + Fine Volume Slide Up ───────────────────────
    case 0x11:
      cell.effTyp = 0x0E;
      if (paramLo & 0xFF) {
        cell.eff = 0x10 | (param & 0x0F);
      } else {
        cell.eff = 0xA0 | (paramHi & 0x0F);
      }
      break;

    // ── 12 xyy Fine Slide Down + Fine Volume Slide Up ─────────────────────
    case 0x12:
      cell.effTyp = 0x0E;
      if (paramLo & 0xFF) {
        cell.eff = 0x20 | (param & 0x0F);
      } else {
        cell.eff = 0xA0 | (paramHi & 0x0F);
      }
      break;

    // ── 13 xxy Glissando Control ──────────────────────────────────────────
    case 0x13:
      cell.effTyp = 0x0E;
      cell.eff    = 0x30 | (paramLo & 0x0F);
      break;

    // ── 14 xxy Set Vibrato Waveform ───────────────────────────────────────
    case 0x14:
      cell.effTyp = 0x0E;
      cell.eff    = 0x40 | (paramLo & 0x0F);
      break;

    // ── 15 xxy Set Fine Tune ──────────────────────────────────────────────
    case 0x15:
      cell.effTyp = 0x0E;
      cell.eff    = 0x50 | (paramLo & 0x0F);
      break;

    // ── 16 xxx Jump to Loop ───────────────────────────────────────────────
    case 0x16:
      cell.effTyp = 0x0E;
      cell.eff    = 0x60 | Math.min(param, 0x0F);
      break;

    // ── 17 xxy Set Tremolo Waveform ───────────────────────────────────────
    case 0x17:
      cell.effTyp = 0x0E;
      cell.eff    = 0x70 | (paramLo & 0x0F);
      break;

    // ── 19 xxx Retrig Note ────────────────────────────────────────────────
    case 0x19:
      cell.effTyp = 0x0E;
      cell.eff    = 0x90 | Math.min(param, 0x0F);
      break;

    // ── 1A xyy Fine Slide Up + Fine Volume Slide Down ─────────────────────
    case 0x1A:
      cell.effTyp = 0x0E;
      if (paramLo & 0xFF) {
        cell.eff = 0x10 | (param & 0x0F);
      } else {
        cell.eff = 0xB0 | (paramHi & 0x0F);
      }
      break;

    // ── 1B xyy Fine Slide Down + Fine Volume Slide Down ───────────────────
    case 0x1B:
      cell.effTyp = 0x0E;
      if (paramLo & 0xFF) {
        cell.eff = 0x20 | (param & 0x0F);
      } else {
        cell.eff = 0xB0 | (paramHi & 0x0F);
      }
      break;

    // ── 1C xxx Note Cut ───────────────────────────────────────────────────
    case 0x1C:
      cell.effTyp = 0x0E;
      cell.eff    = 0xC0 | Math.min(param, 0x0F);
      break;

    // ── 1D xxx Note Delay ─────────────────────────────────────────────────
    case 0x1D:
      cell.effTyp = 0x0E;
      cell.eff    = 0xD0 | Math.min(param, 0x0F);
      break;

    // ── 1E xxx Pattern Delay ──────────────────────────────────────────────
    case 0x1E:
      cell.effTyp = 0x0E;
      cell.eff    = 0xE0 | Math.min(param, 0x0F);
      break;

    // ── 1F xxy Invert Loop ────────────────────────────────────────────────
    case 0x1F:
      cell.effTyp = 0x0E;
      cell.eff    = 0xF0 | (paramLo & 0x0F);
      break;

    // ── 2B xyy Line Jump ──────────────────────────────────────────────────
    // Line Jump: pattern break to same pattern (stay in pattern, jump to row)
    // In DEViLBOX we store just the pattern break; position jump to same pat
    // would require modifying all channels simultaneously which the builder
    // does not support here. Best approximation: pattern break.
    case 0x2B:
      cell.effTyp = 0x0D; // CMD_PATTERNBREAK
      cell.eff    = paramLo;
      break;

    // ── 2F xxx Set Tempo (BPM) ────────────────────────────────────────────
    case 0x2F: {
      if (param > 0) {
        // OpenMPT: std::max(8, param + 4) / 8, clamped to ≥ 0x20 in tracker mode
        let bpm = Math.max(8, param + 4) >> 3;
        if (bpm < 0x20) bpm = 0x20;
        if (bpm > 255)  bpm = 255;
        cell.effTyp = 0x0F; // CMD_TEMPO in XM
        cell.eff    = bpm;
      }
      break;
    }

    // ── 30 xxy Set Stereo ────────────────────────────────────────────────
    case 0x30: {
      const PANNING_TABLE = [0x00, 0x00, 0x2B, 0x56, 0x80, 0xAA, 0xD4, 0xFF];
      cell.effTyp = 0x08; // XM Panning (8xx, 0=left, 128=centre, 255=right)
      if (param & 7) {
        cell.eff = PANNING_TABLE[param & 7];
      } else if ((param >> 4) !== 0x80) {
        const panNibble = (param >> 4) & 0xFF;
        cell.eff = panNibble < 0x80 ? panNibble + 0x80 : 0xFF - panNibble;
      } else {
        // Centre: no-op
        cell.effTyp = 0;
        cell.eff    = 0;
      }
      break;
    }

    // ── 31 xxx Song Upcall / 32 xxx Unset Sample Repeat ──────────────────
    case 0x31:
      // Not implemented in Digital Symphony — ignore
      break;

    case 0x32:
      // Unset sample repeat: acts as key-off or CMD_KEYOFF
      if (cell.note === 0) {
        cell.note = 97; // XM key-off note
      } else {
        cell.effTyp = 0x0E;
        cell.eff    = 0xC0; // ECx note cut at tick 0 (approximation)
      }
      break;

    default:
      // Unknown/unsupported command — leave empty
      break;
  }

  return cell;
}

// ── Empty helpers ─────────────────────────────────────────────────────────────

function makeEmptyInstrument(id: number, name = `Sample ${id}`): InstrumentConfig {
  return {
    id,
    name,
    type:      'sample' as const,
    synthType: 'Sampler' as const,
    effects:   [],
    volume:    0,
    pan:       0,
  } as unknown as InstrumentConfig;
}

function makeEmptyPattern(filename: string, numChannels: number): Pattern {
  return {
    id:     'pattern-0',
    name:   'Pattern 0',
    length: ROWS_PER_TRACK,
    channels: Array.from({ length: numChannels }, (_, ch) => ({
      id:           `channel-${ch}`,
      name:         `Channel ${ch + 1}`,
      muted:        false,
      solo:         false,
      collapsed:    false,
      volume:       100,
      pan:          ((ch & 3) === 1 || (ch & 3) === 2) ? 50 : -50,
      instrumentId: null,
      color:        null,
      rows: Array.from({ length: ROWS_PER_TRACK }, (): TrackerCell => ({
        note: 0, instrument: 0, volume: 0,
        effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
      })),
    })),
    importMetadata: {
      sourceFormat:            'DigitalSymphony',
      sourceFile:              filename,
      importedAt:              new Date().toISOString(),
      originalChannelCount:    numChannels,
      originalPatternCount:    0,
      originalInstrumentCount: 0,
    },
  };
}
