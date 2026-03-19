/**
 * TCBTrackerExporter.ts — Export TrackerSong to TCB Tracker binary format.
 *
 * Produces a valid TCB Tracker format 1 ("AN COOL!") file with the following layout:
 *
 *   Header (144 bytes):
 *     +0    magic[8]        "AN COOL!"
 *     +8    numPatterns     uint32BE
 *     +12   tempo           uint8 (0-15)
 *     +13   unused1         uint8 (0)
 *     +14   order[128]      pattern order table
 *     +142  numOrders       uint8
 *     +143  unused2         uint8 (0)
 *
 *   Instrument names: 16 × 8 chars (128 bytes)
 *
 *   Patterns: numPatterns × 512 bytes (64 rows × 4 channels × 2 bytes)
 *
 *   Sample block:
 *     +0    sizeOfRemaining uint32BE
 *     +4    sampleHeaders1  16 × 4 bytes: [volume(u8), skip(u8), rawLoopEnd(u16BE)]
 *     +68   sampleHeaders2  16 × 8 bytes: [offset(u32BE), length(u32BE)]
 *     +196  sentinel area   16 bytes (0xFFFFFFFF, 0x00000000, padding)
 *     +0xD4 PCM data (8-bit unsigned, XOR 0x80 from signed)
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';

const NUM_SAMPLES = 16;
const HEADER_SIZE = 144;
const PATT_BASE_FMT1 = 0x110; // 272 = header(144) + instrNames(128)
const ROWS_PER_PATTERN = 64;
const CHANNELS = 4;
const BYTES_PER_CELL = 2;
const BYTES_PER_PATTERN = ROWS_PER_PATTERN * CHANNELS * BYTES_PER_CELL; // 512

// ── Binary write helpers ────────────────────────────────────────────────────

function writeU8(buf: Uint8Array, off: number, val: number): void {
  buf[off] = val & 0xFF;
}

function writeU16BE(buf: Uint8Array, off: number, val: number): void {
  buf[off] = (val >>> 8) & 0xFF;
  buf[off + 1] = val & 0xFF;
}

function writeU32BE(buf: Uint8Array, off: number, val: number): void {
  buf[off] = (val >>> 24) & 0xFF;
  buf[off + 1] = (val >>> 16) & 0xFF;
  buf[off + 2] = (val >>> 8) & 0xFF;
  buf[off + 3] = val & 0xFF;
}

function writeStr(buf: Uint8Array, off: number, str: string, len: number): void {
  for (let i = 0; i < len; i++) {
    buf[off + i] = i < str.length ? str.charCodeAt(i) & 0xFF : 0;
  }
}

// ── Sample extraction ───────────────────────────────────────────────────────

interface SampleInfo {
  name: string;
  volume: number;      // 0-127
  pcmSigned: Uint8Array; // 8-bit signed PCM
  loopStart: number;   // in samples
  loopEnd: number;     // in samples
}

/**
 * Extract 8-bit signed PCM from a WAV audioBuffer stored in an instrument.
 * Returns null if no valid sample data exists.
 */
function extractSampleFromInstrument(
  inst: TrackerSong['instruments'][number],
): SampleInfo | null {
  if (!inst?.sample?.audioBuffer) return null;

  const wavBuf = inst.sample.audioBuffer;
  if (wavBuf.byteLength < 44) return null;

  const wav = new DataView(wavBuf);
  const dataLen = wav.getUint32(40, true);
  const bitsPerSample = wav.getUint16(34, true);
  const frames = bitsPerSample === 16
    ? Math.floor(dataLen / 2)
    : dataLen;

  if (frames === 0) return null;

  const pcm = new Uint8Array(frames);
  if (bitsPerSample === 16) {
    for (let j = 0; j < frames; j++) {
      const s16 = wav.getInt16(44 + j * 2, true);
      pcm[j] = (s16 >> 8) & 0xFF; // signed 8-bit
    }
  } else {
    // 8-bit WAV is unsigned; convert to signed
    for (let j = 0; j < frames; j++) {
      pcm[j] = (wav.getUint8(44 + j) ^ 0x80) & 0xFF;
    }
  }

  // Volume: prefer original TCB volume from metadata (0-127 range)
  // Parser stores it in metadata.modPlayback.defaultVolume
  let volume = 64; // default
  const defVol = inst.metadata?.modPlayback?.defaultVolume;
  if (defVol !== undefined && defVol !== null) {
    volume = Math.min(127, Math.max(0, defVol));
  }

  return {
    name: inst.name ?? '',
    volume,
    pcmSigned: pcm,
    loopStart: inst.sample.loopStart ?? 0,
    loopEnd: inst.sample.loopEnd ?? 0,
  };
}

// ── Note encoding ───────────────────────────────────────────────────────────

/**
 * Convert XM note back to TCB note byte.
 *
 * Parser mapping: xmNote = octave * 12 + semitone + 37 + noteOffset
 * We export format 1 with noteOffset=3 (non-Amiga freqs default):
 *   xmNote = octave * 12 + semitone + 40
 *   reverse: raw = xmNote - 40, octave = floor(raw/12), semitone = raw%12
 *   noteByte = (octave << 4) | semitone, valid range 0x10-0x3B
 *
 * Actually the encoder already handles this — we use encodeTCBTrackerCell logic
 * but inline it here since the encoder's noteOffset assumption may differ.
 * The encoder uses xmNote-1 directly which assumes noteOffset was factored in
 * during parsing. For format 1, noteOffset=3, so:
 *   parser: xmNote = octave*12 + semitone + 37 + 3 = octave*12 + semitone + 40
 *   reverse: adjusted = xmNote - 40, octave = floor(adjusted/12), semi = adjusted%12
 */
function encodeNote(xmNote: number): number {
  if (xmNote <= 0 || xmNote > 96) return 0;

  // For format 1 with noteOffset=3:
  // xmNote = octave*12 + semitone + 37 + 3 = octave*12 + semitone + 40
  // But the encoder subtracts 1: octave = floor((xmNote-1)/12), semi = (xmNote-1)%12
  // That gives the raw noteByte. Let's check: if octave=1, semi=0, xmNote=40+12=52
  //   encoder: octave=floor(51/12)=4, semi=51%12=3 → noteByte=0x43 (WRONG)
  //
  // The existing encoder is designed for chip-RAM patching where noteOffset is already
  // baked into the stored note value. We need to reverse the parser's mapping properly.
  //
  // Parser: xmNote = octave*12 + semitone + 37 + noteOffset
  // For fmt1 noteOffset=3: xmNote = octave*12 + semitone + 40
  // Reverse: val = xmNote - 40; octave = floor(val/12); semitone = val % 12
  const val = xmNote - 40;
  if (val < 0) return 0;
  const octave = Math.floor(val / 12);
  const semitone = val % 12;
  if (octave < 1 || octave > 3 || semitone < 0 || semitone > 11) return 0;
  return (octave << 4) | semitone;
}

// ── Main exporter ───────────────────────────────────────────────────────────

export async function exportTCBTracker(
  song: TrackerSong,
): Promise<{ data: Blob; filename: string; warnings: string[] }> {
  const warnings: string[] = [];

  // ── Collect samples ─────────────────────────────────────────────────────
  const samples: (SampleInfo | null)[] = [];
  for (let i = 0; i < NUM_SAMPLES; i++) {
    if (i < song.instruments.length) {
      samples.push(extractSampleFromInstrument(song.instruments[i]));
    } else {
      samples.push(null);
    }
  }

  const usedSamples = samples.filter((s) => s !== null).length;
  if (usedSamples === 0) {
    warnings.push('No valid samples found; file will contain no sample data.');
  }
  if (song.instruments.length > NUM_SAMPLES) {
    warnings.push(
      `TCB Tracker supports max ${NUM_SAMPLES} samples; ${song.instruments.length - NUM_SAMPLES} instruments were dropped.`,
    );
  }

  // ── Pattern count ───────────────────────────────────────────────────────
  const numPatterns = Math.min(127, song.patterns.length);
  if (song.patterns.length > 127) {
    warnings.push(`TCB Tracker supports max 127 patterns; ${song.patterns.length - 127} were dropped.`);
  }
  if (numPatterns === 0) {
    warnings.push('Song has no patterns.');
  }

  // ── Compute total PCM size and sample offsets ───────────────────────────
  // All sample offsets are relative to sampleStart.
  // First sample PCM is always at offset 0xD4 from sampleStart.
  const PCM_START_OFFSET = 0xD4; // from sampleStart

  let totalPCM = 0;
  const sampleOffsets: number[] = [];
  const sampleLengths: number[] = [];
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const s = samples[i];
    if (s && s.pcmSigned.length > 0) {
      sampleOffsets.push(PCM_START_OFFSET + totalPCM);
      sampleLengths.push(s.pcmSigned.length);
      totalPCM += s.pcmSigned.length;
    } else {
      sampleOffsets.push(PCM_START_OFFSET); // point to start (length=0)
      sampleLengths.push(0);
    }
  }

  // ── Compute total file size ─────────────────────────────────────────────
  const sampleStart = PATT_BASE_FMT1 + numPatterns * BYTES_PER_PATTERN;
  const sampleBlockSize = PCM_START_OFFSET + totalPCM;
  const totalSize = sampleStart + sampleBlockSize;

  const output = new Uint8Array(totalSize);

  // ── Write magic "AN COOL!" ──────────────────────────────────────────────
  writeStr(output, 0, 'AN COOL!', 8);

  // ── Write numPatterns (u32BE) ───────────────────────────────────────────
  writeU32BE(output, 8, numPatterns);

  // ── Write tempo (u8) ────────────────────────────────────────────────────
  // Parser: initialSpeed = 16 - tempo → tempo = 16 - initialSpeed
  const speed = song.initialSpeed ?? 6;
  const tempo = Math.max(0, Math.min(15, 16 - speed));
  writeU8(output, 12, tempo);

  // ── byte[13] = 0 (already zero) ────────────────────────────────────────

  // ── Write order table (128 bytes at offset 14) ──────────────────────────
  const orderCount = Math.min(128, song.songPositions.length);
  if (orderCount === 0) {
    warnings.push('Song has no order list entries; defaulting to 1.');
  }
  for (let i = 0; i < 128; i++) {
    if (i < orderCount) {
      output[14 + i] = Math.min(numPatterns - 1, song.songPositions[i] ?? 0);
    } else {
      output[14 + i] = 0;
    }
  }

  // ── Write numOrders (u8 at offset 142) ──────────────────────────────────
  writeU8(output, 142, Math.max(1, orderCount));

  // ── byte[143] = 0 (already zero) ───────────────────────────────────────

  // ── Write instrument names (16 × 8 chars at offset 144) ────────────────
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const name = samples[i]?.name ?? '';
    writeStr(output, HEADER_SIZE + i * 8, name, 8);
  }

  // ── Write pattern data ──────────────────────────────────────────────────
  for (let pat = 0; pat < numPatterns; pat++) {
    const pattern = song.patterns[pat];
    const patOffset = PATT_BASE_FMT1 + pat * BYTES_PER_PATTERN;

    for (let row = 0; row < ROWS_PER_PATTERN; row++) {
      for (let ch = 0; ch < CHANNELS; ch++) {
        const cellOff = patOffset + row * 8 + ch * 2;
        const cell = pattern?.channels[ch]?.rows[row];

        if (!cell) {
          output[cellOff] = 0;
          output[cellOff + 1] = 0;
          continue;
        }

        // Byte 0: note
        const noteByte = encodeNote(cell.note ?? 0);
        output[cellOff] = noteByte;

        // Byte 1: (instrument << 4) | effect
        // Parser adds 1 to instrument index, so subtract 1 for encoding
        const instr = Math.max(0, ((cell.instrument ?? 0) - 1)) & 0x0F;
        let effect = 0;
        if ((cell.effTyp ?? 0) === 0x0D) {
          effect = 0x0D; // pattern break
        }

        // Only write instrument if there's a note or effect
        const hasContent = noteByte > 0 || effect > 0;
        output[cellOff + 1] = hasContent ? ((instr << 4) | (effect & 0x0F)) : 0;
      }
    }
  }

  // ── Write sample block ──────────────────────────────────────────────────

  // sizeOfRemaining (u32BE at sampleStart)
  const sizeOfRemaining = sampleBlockSize - 4;
  writeU32BE(output, sampleStart, sizeOfRemaining);

  // sampleHeaders1: 16 × [volume(u8), skip(u8), rawLoopEnd(u16BE)]
  const h1Start = sampleStart + 4;
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const off = h1Start + i * 4;
    const s = samples[i];
    if (s && s.pcmSigned.length > 0) {
      writeU8(output, off, s.volume);      // volume (0-127)
      writeU8(output, off + 1, 0);          // skip byte

      // rawLoopEnd = distance from end of sample to loop start
      // If loop enabled: rawLoopEnd = length - loopStart
      // If no loop: rawLoopEnd = 0
      const length = s.pcmSigned.length;
      const hasLoop = s.loopEnd > s.loopStart && s.loopEnd > 2;
      if (hasLoop) {
        const rawLoopEnd = length - s.loopStart;
        writeU16BE(output, off + 2, rawLoopEnd);
      } else {
        writeU16BE(output, off + 2, 0);
      }
    }
    // else: all zeros (already initialized)
  }

  // sampleHeaders2: 16 × [offset(u32BE), length(u32BE)]
  const h2Start = h1Start + NUM_SAMPLES * 4; // = sampleStart + 68
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const off = h2Start + i * 8;
    writeU32BE(output, off, sampleOffsets[i]);
    writeU32BE(output, off + 4, sampleLengths[i]);
  }

  // ── Sentinel area ───────────────────────────────────────────────────────
  // The detection routine checks:
  //   u32BE(A3 - 8) = 0xFFFFFFFF
  //   u32BE(A3 - 4) = 0x00000000
  //   u32BE(A3 - 0x90) = 0x000000D4
  // where A3 = sampleStart + 0xD4
  //
  // A3 - 8 = sampleStart + 0xCC → write 0xFFFFFFFF
  // A3 - 4 = sampleStart + 0xD0 → write 0x00000000 (already zero)
  // A3 - 0x90 = sampleStart + 0x44 → this is inside sampleHeaders2
  //   For first sample (i=0): offset at h2Start = sampleStart + 68 = sampleStart + 0x44
  //   First sample offset must be 0xD4 — this is satisfied by our sampleOffsets[0] = 0xD4

  writeU32BE(output, sampleStart + 0xCC, 0xFFFFFFFF);
  // sampleStart + 0xD0 is already 0x00000000

  // ── Write PCM data (convert signed → unsigned via XOR 0x80) ─────────────
  let pcmWriteOffset = sampleStart + PCM_START_OFFSET;
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const s = samples[i];
    if (s && s.pcmSigned.length > 0) {
      for (let j = 0; j < s.pcmSigned.length; j++) {
        output[pcmWriteOffset + j] = (s.pcmSigned[j] ^ 0x80) & 0xFF;
      }
      pcmWriteOffset += s.pcmSigned.length;
    }
  }

  // ── Generate filename ───────────────────────────────────────────────────
  const baseName = (song.name || 'untitled')
    .replace(/\s*\[TCB Tracker\]\s*/i, '')
    .replace(/[^a-zA-Z0-9_.-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    || 'untitled';
  const filename = `tcb.${baseName}`;

  return {
    data: new Blob([output], { type: 'application/octet-stream' }),
    filename,
    warnings,
  };
}
