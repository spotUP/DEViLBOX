/**
 * XMFExporter.ts — Export TrackerSong to Astroidea XMF format (.xmf)
 *
 * Reconstructs the binary layout documented in XMFParser.ts:
 *   +0    type (uint8)          — file type (default 4 = normal finetune, manual portamento)
 *   +1    sampleHeaders[256]    — 256 × 16 bytes
 *   +4097 orders[256]           — uint8 order list, 0xFF terminated
 *   +4353 lastChannel (uint8)   — 0-based last active channel index
 *   +4354 lastPattern (uint8)   — 0-based last pattern index
 *   +4355 channelPans[channels] — uint8 pan per channel
 *   +4355+channels  pattern data — numPatterns × channels × 64 rows × 6 bytes
 *   after patterns  sample data  — raw signed PCM (8-bit or 16-bit LE)
 *
 * Uses encodeXMFCell from XMFEncoder for cell-level encoding.
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import { encodeXMFCell } from '@/engine/uade/encoders/XMFEncoder';

// ── Constants ──────────────────────────────────────────────────────────────

const SAMPLE_HDR_SIZE  = 16;
const NUM_SAMPLE_SLOTS = 256;
const ROWS_PER_PATTERN = 64;
const CELL_SIZE        = 6;

// Sample flag bits
const SMP_LOOP     = 0x08;
const SMP_BIDI     = 0x10;

// Fixed offsets
const TYPE_OFFSET    = 0;
const SAMPLES_OFFSET = 1;
const ORDERS_OFFSET  = 1 + NUM_SAMPLE_SLOTS * SAMPLE_HDR_SIZE; // 4097
const CHANNEL_OFFSET = ORDERS_OFFSET + NUM_SAMPLE_SLOTS;       // 4353

// ── Binary helpers ─────────────────────────────────────────────────────────

function writeU8(view: DataView, off: number, val: number): void {
  view.setUint8(off, val & 0xFF);
}

function writeU16LE(view: DataView, off: number, val: number): void {
  view.setUint16(off, val & 0xFFFF, true);
}

/** Write a 24-bit little-endian unsigned integer */
function writeU24LE(view: DataView, off: number, val: number): void {
  view.setUint8(off, val & 0xFF);
  view.setUint8(off + 1, (val >> 8) & 0xFF);
  view.setUint8(off + 2, (val >> 16) & 0xFF);
}

// ── Sample extraction ──────────────────────────────────────────────────────

interface XMFSampleData {
  pcm: Uint8Array;        // raw PCM bytes (8-bit signed or 16-bit LE signed)
  loopStart: number;      // in sample frames
  loopEnd: number;        // in sample frames
  defaultVolume: number;  // 0-255
  flags: number;          // SMP_* flags
  sampleRate: number;     // Hz
  is16Bit: boolean;
  lengthBytes: number;    // byte length of PCM data
  lengthFrames: number;   // length in sample frames
}

/**
 * Extract sample PCM data from an InstrumentConfig's WAV audioBuffer.
 * Returns 8-bit signed PCM (matching XMF's native format).
 */
function extractSampleData(inst: TrackerSong['instruments'][0]): XMFSampleData | null {
  const sample = inst?.sample;
  if (!sample?.audioBuffer) return null;

  const wav = new DataView(sample.audioBuffer);

  // Basic WAV validation: find data chunk size
  if (sample.audioBuffer.byteLength < 44) return null;

  const dataLen = wav.getUint32(40, true);
  const bitsPerSample = wav.getUint16(34, true);
  const wavSampleRate = wav.getUint16(24, true) | (wav.getUint16(26, true) << 16);
  const frames = bitsPerSample === 16 ? Math.floor(dataLen / 2) : dataLen;

  // Convert to 8-bit signed PCM for XMF
  const pcm = new Uint8Array(frames);
  if (bitsPerSample === 16) {
    for (let j = 0; j < frames; j++) {
      const off = 44 + j * 2;
      if (off + 2 > sample.audioBuffer.byteLength) break;
      const s16 = wav.getInt16(off, true);
      pcm[j] = (s16 >> 8) & 0xFF; // 16-bit signed → 8-bit signed (two's complement)
    }
  } else {
    // 8-bit WAV is unsigned; convert to signed
    const raw = new Uint8Array(sample.audioBuffer, 44, Math.min(frames, sample.audioBuffer.byteLength - 44));
    for (let j = 0; j < raw.length; j++) {
      pcm[j] = (raw[j] - 128) & 0xFF;
    }
  }

  // Loop info
  const hasLoop = sample.loop || (sample.loopType === 'forward' || sample.loopType === 'pingpong');
  const hasBidi = sample.loopType === 'pingpong';
  const loopStart = hasLoop ? (sample.loopStart ?? 0) : 0;
  const loopEnd = hasLoop ? (sample.loopEnd ?? 0) : 0;

  let flags = 0;
  if (hasLoop) flags |= SMP_LOOP;
  if (hasBidi) flags |= SMP_BIDI;
  // Keep as 8-bit (no SMP_16BIT flag)

  const modPlayback = (inst as unknown as Record<string, unknown>).modPlayback as { defaultVolume?: number } | undefined;
  const defaultVolume = modPlayback?.defaultVolume ?? Math.min(255, Math.round((inst.volume ?? 64) * 4));

  return {
    pcm,
    loopStart: hasLoop ? Math.max(0, loopStart - 1) : 0, // parser adds +1, so subtract
    loopEnd: hasLoop && loopEnd > 0 ? Math.max(0, loopEnd - 1) : 0,
    defaultVolume: Math.min(255, defaultVolume),
    flags,
    sampleRate: wavSampleRate > 0 ? wavSampleRate : 8363,
    is16Bit: false,
    lengthBytes: frames,
    lengthFrames: frames,
  };
}

// ── Main exporter ──────────────────────────────────────────────────────────

export async function exportXMF(
  song: TrackerSong
): Promise<{ data: Blob; filename: string; warnings: string[] }> {
  const warnings: string[] = [];

  // ── Determine channel count ────────────────────────────────────────────
  const numChannels = Math.min(32, song.numChannels ?? song.patterns[0]?.channels.length ?? 4);
  if (numChannels > 32) {
    warnings.push(`XMF supports max 32 channels; truncating from ${numChannels}`);
  }

  // ── Build de-duplicated pattern table ──────────────────────────────────
  // TrackerSong patterns are per-order-position; XMF has a separate order list
  // referencing unique pattern indices.
  // Use songPositions to build orders, and deduplicate patterns by their
  // importMetadata pattern index or by content identity.

  // Collect unique pattern indices from songPositions
  const uniquePatternIndices = [...new Set(song.songPositions)];
  const numPatterns = uniquePatternIndices.length;

  if (numPatterns > 256) {
    warnings.push(`XMF supports max 256 patterns; truncating from ${numPatterns}`);
  }
  const clampedPatterns = Math.min(256, numPatterns);

  // Map old pattern index → new sequential index
  const patternIndexMap = new Map<number, number>();
  for (let i = 0; i < clampedPatterns; i++) {
    patternIndexMap.set(uniquePatternIndices[i], i);
  }

  // Build order list from songPositions
  const orders: number[] = [];
  for (const pos of song.songPositions) {
    const mapped = patternIndexMap.get(pos);
    if (mapped !== undefined) {
      orders.push(mapped);
    }
  }
  if (orders.length > 256) {
    warnings.push(`XMF supports max 256 order entries; truncating from ${orders.length}`);
    orders.length = 256;
  }

  // ── Extract sample data ────────────────────────────────────────────────
  const sampleDatas: (XMFSampleData | null)[] = [];
  let numSamples = 0;
  for (let i = 0; i < Math.min(NUM_SAMPLE_SLOTS, song.instruments.length); i++) {
    const sd = extractSampleData(song.instruments[i]);
    sampleDatas.push(sd);
    if (sd) numSamples = i + 1;
  }
  // Pad to NUM_SAMPLE_SLOTS
  while (sampleDatas.length < NUM_SAMPLE_SLOTS) {
    sampleDatas.push(null);
  }

  // ── Calculate sample data offsets ──────────────────────────────────────
  // Sample headers use absolute dataStart/dataEnd offsets within the file.
  // Samples are stored sequentially after pattern data.
  const pansOffset = CHANNEL_OFFSET + 2;
  const patternStart = pansOffset + numChannels;
  const patternDataSize = clampedPatterns * numChannels * ROWS_PER_PATTERN * CELL_SIZE;
  let sampleDataOffset = patternStart + patternDataSize;

  // Precompute absolute offsets for each sample
  const sampleOffsets: { dataStart: number; dataEnd: number }[] = [];
  let currentOffset = sampleDataOffset;
  for (let i = 0; i < numSamples; i++) {
    const sd = sampleDatas[i];
    if (sd && sd.lengthBytes > 0) {
      sampleOffsets.push({ dataStart: currentOffset, dataEnd: currentOffset + sd.lengthBytes });
      currentOffset += sd.lengthBytes;
    } else {
      sampleOffsets.push({ dataStart: 0, dataEnd: 0 });
    }
  }
  // Pad remaining slots
  while (sampleOffsets.length < NUM_SAMPLE_SLOTS) {
    sampleOffsets.push({ dataStart: 0, dataEnd: 0 });
  }

  const totalSize = currentOffset;

  // ── Allocate output buffer ─────────────────────────────────────────────
  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);

  // ── Type byte ──────────────────────────────────────────────────────────
  // Default to type 4 (normal finetune, manual tone portamento — MOD-like)
  writeU8(view, TYPE_OFFSET, 4);

  // ── Sample headers ─────────────────────────────────────────────────────
  for (let i = 0; i < NUM_SAMPLE_SLOTS; i++) {
    const off = SAMPLES_OFFSET + i * SAMPLE_HDR_SIZE;
    const sd = sampleDatas[i];

    if (sd && sd.lengthBytes > 0) {
      writeU24LE(view, off + 0, sd.loopStart);
      writeU24LE(view, off + 3, sd.loopEnd);
      // dataStart and dataEnd are absolute file offsets in the original format,
      // but XMF stores them as offsets relative to sample data region.
      // Looking at the parser: it reads dataEnd - dataStart as lengthBytes,
      // and then reads sample data sequentially. The absolute values don't
      // matter for sequential reading, but we store them as 0-based relative
      // to maintain consistency: dataStart=0, dataEnd=lengthBytes.
      writeU24LE(view, off + 6, 0);  // dataStart (relative)
      writeU24LE(view, off + 9, sd.lengthBytes);  // dataEnd (relative)
      writeU8(view, off + 12, sd.defaultVolume);
      writeU8(view, off + 13, sd.flags);
      writeU16LE(view, off + 14, sd.sampleRate);
    }
    // Empty samples: all zeros (already initialized)
  }

  // ── Order list ─────────────────────────────────────────────────────────
  for (let i = 0; i < 256; i++) {
    if (i < orders.length) {
      writeU8(view, ORDERS_OFFSET + i, orders[i]);
    } else {
      writeU8(view, ORDERS_OFFSET + i, 0xFF); // terminator
    }
  }

  // ── Channel count and pattern count ────────────────────────────────────
  writeU8(view, CHANNEL_OFFSET, numChannels - 1);     // lastChannel (0-based)
  writeU8(view, CHANNEL_OFFSET + 1, clampedPatterns - 1); // lastPattern (0-based)

  // ── Channel panning ────────────────────────────────────────────────────
  for (let ch = 0; ch < numChannels; ch++) {
    // TrackerSong pan is -100..+100; XMF raw pan is 0-15 (×0x11 → 0-255)
    // Parser: rawPan = u8 * 0x11; devilboxPan = (rawPan/255)*200 - 100
    // Reverse: rawPan = ((pan+100)/200)*255; xmfByte = rawPan / 0x11
    const pat = song.patterns[0];
    const pan = pat?.channels[ch]?.pan ?? 0;
    const rawPan = Math.round(((pan + 100) / 200) * 255);
    const xmfPanByte = Math.round(rawPan / 0x11);
    writeU8(view, pansOffset + ch, Math.max(0, Math.min(0x0F, xmfPanByte)));
  }

  // ── Pattern data ───────────────────────────────────────────────────────
  // Layout: pattern[p], row-major: for each row, for each channel, 6 bytes
  for (let pi = 0; pi < clampedPatterns; pi++) {
    const origPatIdx = uniquePatternIndices[pi];
    const pat = song.patterns[origPatIdx];
    const patBase = patternStart + pi * numChannels * ROWS_PER_PATTERN * CELL_SIZE;

    for (let row = 0; row < ROWS_PER_PATTERN; row++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const cell = pat?.channels[ch]?.rows[row];
        const cellBytes = encodeXMFCell(cell ?? {
          note: 0, instrument: 0, volume: 0,
          effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
        });
        const off = patBase + (row * numChannels + ch) * CELL_SIZE;
        output.set(cellBytes, off);
      }
    }
  }

  // ── Sample PCM data ────────────────────────────────────────────────────
  // Written sequentially for samples 0..numSamples-1
  let writeOffset = sampleDataOffset;
  for (let i = 0; i < numSamples; i++) {
    const sd = sampleDatas[i];
    if (sd && sd.lengthBytes > 0) {
      output.set(sd.pcm.subarray(0, sd.lengthBytes), writeOffset);
      writeOffset += sd.lengthBytes;
    }
  }

  // ── Build result ───────────────────────────────────────────────────────
  const songName = song.name ?? 'untitled';
  const filename = `${songName.replace(/[^a-zA-Z0-9_\-. ]/g, '_')}.xmf`;

  return {
    data: new Blob([output], { type: 'application/octet-stream' }),
    filename,
    warnings,
  };
}
