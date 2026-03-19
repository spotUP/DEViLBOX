/**
 * Composer667Exporter.ts -- Export TrackerSong to Composer 669 / UNIS 669 (.669) format
 *
 * Reconstructs a valid .669 binary from TrackerSong data. Uses "if" magic (Composer 669).
 *
 * Binary layout (matches parser):
 *   +0    magic[2]         -- 'if' (0x69 0x66)
 *   +2    songMessage[108] -- 3 x 36-char message lines (padded with spaces)
 *   +110  samples (uint8)  -- number of samples (0-64)
 *   +111  patterns (uint8) -- number of patterns (0-128)
 *   +112  restartPos (uint8)
 *   +113  orders[128]      -- pattern order (0xFF = end)
 *   +241  tempoList[128]   -- speed per order (0-15)
 *   +369  breaks[128]      -- break row per order (0-63)
 *   +497  sample headers   -- numSamples x 25 bytes
 *         filename[13] + length(uint32le) + loopStart(uint32le) + loopEnd(uint32le)
 *   after headers: numPatterns x 1536 bytes (64 rows x 8 ch x 3 bytes/cell)
 *   after patterns: raw 8-bit unsigned PCM sample data
 *
 * Cell encoding is delegated to encode669Cell from the Composer667Encoder.
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import { encode669Cell } from '@/engine/uade/encoders/Composer667Encoder';

// -- Constants ----------------------------------------------------------------

const HEADER_SIZE       = 497;
const SAMPLE_HDR_SIZE   = 25;
const NUM_CHANNELS      = 8;
const ROWS_PER_PATTERN  = 64;
const BYTES_PER_CELL    = 3;
const PATTERN_SIZE      = ROWS_PER_PATTERN * NUM_CHANNELS * BYTES_PER_CELL; // 1536

const MAX_SAMPLES  = 64;
const MAX_PATTERNS = 128;
const MAX_ORDERS   = 128;

const ORDER_END = 0xFF;

const EFF_SPEED         = 0x0F;
const EFF_PATTERN_BREAK = 0x0D;

// -- Binary write helpers -----------------------------------------------------

function writeU8(buf: Uint8Array, off: number, val: number): void {
  buf[off] = val & 0xFF;
}

function writeU32LE(buf: Uint8Array, off: number, val: number): void {
  buf[off]     =  val        & 0xFF;
  buf[off + 1] = (val >>> 8) & 0xFF;
  buf[off + 2] = (val >>> 16) & 0xFF;
  buf[off + 3] = (val >>> 24) & 0xFF;
}

function writeStr(buf: Uint8Array, off: number, str: string, len: number): void {
  for (let i = 0; i < len; i++) {
    buf[off + i] = i < str.length ? str.charCodeAt(i) & 0xFF : 0;
  }
}

// -- Sample extraction --------------------------------------------------------

interface SampleSlot {
  name: string;
  pcm: Uint8Array;         // 8-bit unsigned PCM (669 stores unsigned, center = 0x80)
  length: number;
  loopStart: number;
  loopEnd: number;
}

/**
 * Extract 8-bit PCM from instrument's WAV audioBuffer and convert to unsigned
 * (669 stores unsigned 8-bit samples, center = 0x80).
 */
function extractSample(
  inst: TrackerSong['instruments'][number],
): SampleSlot | null {
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

  // Convert to unsigned 8-bit (center 0x80)
  const pcm = new Uint8Array(frames);
  if (bitsPerSample === 16) {
    for (let j = 0; j < frames; j++) {
      const s16 = wav.getInt16(44 + j * 2, true);
      // signed 8-bit → unsigned: add 128
      pcm[j] = ((s16 >> 8) + 128) & 0xFF;
    }
  } else {
    // 8-bit WAV is already unsigned
    for (let j = 0; j < frames; j++) {
      pcm[j] = wav.getUint8(44 + j);
    }
  }

  const loopStart = inst.sample.loopStart ?? 0;
  const loopEnd = inst.sample.loopEnd ?? 0;

  return {
    name: (inst.name ?? '').slice(0, 13),
    pcm,
    length: frames,
    loopStart,
    loopEnd,
  };
}

// -- Speed/break extraction from pattern data ---------------------------------

/**
 * Scan row 0, channel 0 of a pattern for a speed effect (0x0F).
 * Returns the speed value or 0 if not found.
 */
function extractSpeedFromPattern(song: TrackerSong, patIdx: number): number {
  const pat = song.patterns[patIdx];
  if (!pat) return 0;
  const cell = pat.channels[0]?.rows[0];
  if (!cell) return 0;
  if ((cell.effTyp ?? 0) === EFF_SPEED && (cell.eff ?? 0) > 0) {
    return Math.min(15, cell.eff ?? 0);
  }
  return 0;
}

/**
 * Scan channel 0 for the first pattern break effect (0x0D) and return the row.
 * Returns 63 if no break found (meaning play all 64 rows).
 */
function extractBreakFromPattern(song: TrackerSong, patIdx: number): number {
  const pat = song.patterns[patIdx];
  if (!pat) return 63;
  const ch0Rows = pat.channels[0]?.rows;
  if (!ch0Rows) return 63;
  for (let row = 0; row < ROWS_PER_PATTERN; row++) {
    const cell = ch0Rows[row];
    if (cell && (cell.effTyp ?? 0) === EFF_PATTERN_BREAK) {
      return Math.min(63, row);
    }
  }
  return 63;
}

// -- Main exporter ------------------------------------------------------------

export async function exportComposer667(
  song: TrackerSong,
): Promise<{ data: Blob; filename: string; warnings: string[] }> {
  const warnings: string[] = [];

  // -- Collect samples --------------------------------------------------------

  const numSamples = Math.min(MAX_SAMPLES, song.instruments.length);
  if (song.instruments.length > MAX_SAMPLES) {
    warnings.push(
      `Composer 669 supports max ${MAX_SAMPLES} samples; ${song.instruments.length - MAX_SAMPLES} instruments were dropped.`,
    );
  }

  const sampleSlots: (SampleSlot | null)[] = [];
  for (let i = 0; i < numSamples; i++) {
    sampleSlots.push(extractSample(song.instruments[i]));
  }

  // -- Determine unique patterns to write -------------------------------------
  // The song may reference the same pattern index multiple times in songPositions.
  // We need to collect all unique pattern indices that are used.

  const numPatterns = Math.min(MAX_PATTERNS, song.patterns.length);
  if (song.patterns.length > MAX_PATTERNS) {
    warnings.push(
      `Composer 669 supports max ${MAX_PATTERNS} patterns; ${song.patterns.length - MAX_PATTERNS} were dropped.`,
    );
  }

  // -- Order list, tempo list, break list -------------------------------------

  const orderCount = Math.min(MAX_ORDERS, song.songPositions.length);
  if (song.songPositions.length > MAX_ORDERS) {
    warnings.push(
      `Composer 669 supports max ${MAX_ORDERS} order entries; ${song.songPositions.length - MAX_ORDERS} were dropped.`,
    );
  }
  if (orderCount === 0) {
    warnings.push('Song has no order list entries; defaulting to pattern 0.');
  }

  // -- Calculate total sample PCM size ----------------------------------------

  let totalPCM = 0;
  for (let i = 0; i < numSamples; i++) {
    const s = sampleSlots[i];
    if (s) totalPCM += s.length;
  }

  // -- Allocate output buffer -------------------------------------------------

  const patternDataBase = HEADER_SIZE + numSamples * SAMPLE_HDR_SIZE;
  const sampleDataBase = patternDataBase + numPatterns * PATTERN_SIZE;
  const totalSize = sampleDataBase + totalPCM;

  const output = new Uint8Array(totalSize);

  // -- Write magic ("if") -----------------------------------------------------

  output[0] = 0x69; // 'i'
  output[1] = 0x66; // 'f'

  // -- Write song message (108 bytes at offset 2) -----------------------------
  // Pad the song name into the first 36-char line; leave lines 2-3 blank.

  const songName = (song.name || 'Untitled').slice(0, 36);
  writeStr(output, 2, songName, 36);
  // Lines 2 and 3 are left as zeros (null-padded).

  // -- Write header fields ----------------------------------------------------

  writeU8(output, 110, numSamples);
  writeU8(output, 111, numPatterns);
  writeU8(output, 112, Math.min(127, song.restartPosition ?? 0));

  // -- Write order table (128 bytes at offset 113) ----------------------------

  for (let i = 0; i < 128; i++) {
    if (i < orderCount) {
      const patIdx = song.songPositions[i] ?? 0;
      output[113 + i] = Math.min(numPatterns - 1, patIdx);
    } else {
      output[113 + i] = ORDER_END;
    }
  }

  // -- Write tempo list (128 bytes at offset 241) -----------------------------
  // Extract speed from each pattern's row 0 ch0 speed effect, or use defaults.

  const defaultSpeed = Math.min(15, Math.max(1, song.initialSpeed ?? 4));
  for (let i = 0; i < 128; i++) {
    if (i < orderCount) {
      const patIdx = song.songPositions[i] ?? 0;
      const speed = extractSpeedFromPattern(song, patIdx);
      output[241 + i] = speed > 0 ? speed : defaultSpeed;
    } else {
      output[241 + i] = defaultSpeed;
    }
  }

  // -- Write break list (128 bytes at offset 369) -----------------------------

  for (let i = 0; i < 128; i++) {
    if (i < orderCount) {
      const patIdx = song.songPositions[i] ?? 0;
      output[369 + i] = extractBreakFromPattern(song, patIdx);
    } else {
      output[369 + i] = 0;
    }
  }

  // -- Write sample headers (numSamples x 25 bytes at offset 497) -------------

  let hdrOff = HEADER_SIZE;
  for (let i = 0; i < numSamples; i++) {
    const s = sampleSlots[i];
    const name = s?.name || song.instruments[i]?.name || '';
    writeStr(output, hdrOff, name, 13);

    if (s) {
      writeU32LE(output, hdrOff + 13, s.length);
      writeU32LE(output, hdrOff + 17, s.loopStart);
      writeU32LE(output, hdrOff + 21, s.loopEnd);
    }
    // else: all zeros (no sample data)

    hdrOff += SAMPLE_HDR_SIZE;
  }

  // -- Write pattern data (numPatterns x 1536 bytes) --------------------------
  // We encode each cell using encode669Cell, but we need to strip out the
  // speed/break effects that were injected by the parser (they're stored in
  // the tempo/break tables instead of the pattern data in .669 format).

  for (let p = 0; p < numPatterns; p++) {
    const pat = song.patterns[p];
    const patBase = patternDataBase + p * PATTERN_SIZE;

    for (let row = 0; row < ROWS_PER_PATTERN; row++) {
      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        const cellOff = patBase + (row * NUM_CHANNELS + ch) * BYTES_PER_CELL;
        const cell = pat?.channels[ch]?.rows[row];

        if (!cell) {
          // Empty cell: 0xFF = no note/instr/vol, 0x00, 0xFF = no effect
          output[cellOff]     = 0xFF;
          output[cellOff + 1] = 0x00;
          output[cellOff + 2] = 0xFF;
          continue;
        }

        // Strip speed and pattern-break effects that the parser injected
        // into channel 0 (these are encoded in the tempo/break tables).
        const effTyp = cell.effTyp ?? 0;
        const isInjectedSpeed = (effTyp === EFF_SPEED && ch === 0 && row === 0);
        const isInjectedBreak = (effTyp === EFF_PATTERN_BREAK && ch === 0);

        const cellToEncode = (isInjectedSpeed || isInjectedBreak)
          ? { ...cell, effTyp: 0, eff: 0 }
          : cell;

        const encoded = encode669Cell(cellToEncode);
        output[cellOff]     = encoded[0];
        output[cellOff + 1] = encoded[1];
        output[cellOff + 2] = encoded[2];
      }
    }
  }

  // -- Write sample PCM data --------------------------------------------------

  let pcmOff = sampleDataBase;
  for (let i = 0; i < numSamples; i++) {
    const s = sampleSlots[i];
    if (s && s.pcm.length > 0) {
      output.set(s.pcm, pcmOff);
      pcmOff += s.pcm.length;
    }
  }

  // -- Generate filename ------------------------------------------------------

  const baseName = (song.name || 'untitled')
    .replace(/[^a-zA-Z0-9_.-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    || 'untitled';
  const filename = `${baseName}.669`;

  return {
    data: new Blob([output], { type: 'application/octet-stream' }),
    filename,
    warnings,
  };
}
