/**
 * JochenHippel7VParser.ts — Jochen Hippel 7V (TFMX-7V) format parser
 *
 * Detection (from "Jochen Hippel 7V_v2.asm", DTP_Check2):
 *
 * Two code paths:
 *
 * Path A — wrapped in a loader stub (starts with $6000):
 *   cmp.w #$6000,(A0)   — no post-increment, just check byte 0
 *   addq.l #2,A0        — A0 = 2
 *   move.w (A0),D1      — read dist from offset 2, no post-increment
 *   D1 must be > 0, even, non-negative
 *   lea (A0,D1.W),A0    — scanOff = 2 + D1
 *   Scan up to 11 words (dbf D1=10) at scanOff for $308141FA
 *   On match (OK_1):
 *     addq.l #4,A0      — skip the found long
 *     move.w (A0),D1    — read next dist (no post-increment), validate
 *     lea (A0,D1.W),A0  — songOff = (matchOff+4) + D1  (no +2)
 *   Falls into TFMX-7V song check
 *
 * Path B — raw TFMX-7V song (Song label):
 *   'TFMX' at A0+0..3
 *   byte at A0+4 == 0 (null byte after 'TFMX')
 *   Then calculates expected size from header fields and validates:
 *     D1 = (word[4]+2 + word[5]+2) << 6          (pattern data size)
 *     D2 = (word[6]+1) * word[8]                   (track/seq data)
 *     D3 = (word[7]+1) * 28                        (macro data)
 *     D2 = (word[9]+1) << 3                        (sample table)
 *     advance A0 by D1+D2+D3+D2+32
 *     long at A0 must be 0
 *     word at A0+4 (== D2) must be > 0
 *     D2 * 2 must == long at A0+26+4 = A0+30
 *
 * Prefix: 'S7G.' (the player also accepts 'hip7.' prefix from UADE eagleplayer.conf)
 * Minimum file size: at least 32 bytes for the TFMX header fields.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, TFMXConfig, UADEChipRamInfo, Pattern, TrackerCell } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { encodeTFMX7VCell } from '@/engine/uade/encoders/TFMX7VEncoder';
import type { HippelAuxSpan, HippelCellSpan, HippelCellSpans } from '@/engine/hippel/hippelCellSpans';
import { hippelCellNote, hippelGrid, hippelNoteByteFor, readHippelTfmx, type HippelGrid, type HippelPlayed } from './HippelTfmxWalk';

const MIN_FILE_SIZE = 32;

// ── Layout constants (from libtfmxaudiodecoder Jochen/HippelDecoder.h) ───────
const TFMX_SAMPLE_STRUCT_SIZE = 0x12 + 4 + 2 + 4 + 2; // 30 bytes

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

/** 'TFMX' as a 32-bit big-endian value */
const MAGIC_TFMX = (0x54 << 24 | 0x46 << 16 | 0x4D << 8 | 0x58) >>> 0;
/** $308141FA — the Find_1 search pattern */
const MAGIC_FIND1 = (0x30 << 24 | 0x81 << 16 | 0x41 << 8 | 0xFA) >>> 0;

/**
 * Validate the TFMX-7V song header starting at songOff.
 * Mirrors the Song: label in Check2 of Jochen Hippel 7V_v2.asm.
 */
function checkTFMX7VSong(buf: Uint8Array, songOff: number): boolean {
  if (songOff + 20 > buf.length) return false;

  // 'TFMX' magic
  if (u32BE(buf, songOff) !== MAGIC_TFMX) return false;
  // byte after 'TFMX' must be 0
  if (buf[songOff + 4] !== 0) return false;

  let a0 = songOff + 4; // points at the null byte, then words follow

  // Read 7V header fields (offsets relative to a0 which starts at songOff+4)
  // word at a0+0 is already the null, so word accesses are:
  //   (A0)+ reads word at a0, advances a0 by 2
  // Following the ASM:
  //   moveq #2,D1
  //   add.w (A0)+,D1    → D1 = 2 + word[a0]; a0+=2
  //   add.w (A0)+,D1    → D1 += word[a0]; a0+=2  → D1 = 2 + w0 + w1
  //   lsl.l #6,D1       → D1 <<= 6

  if (a0 + 2 > buf.length) return false;
  const w0 = u16BE(buf, a0); a0 += 2;
  if (a0 + 2 > buf.length) return false;
  const w1 = u16BE(buf, a0); a0 += 2;
  let d1 = ((2 + w0 + w1) << 6) >>> 0;

  //   moveq #1,D2
  //   add.w (A0)+,D2    → D2 = 1 + w2; a0+=2
  if (a0 + 2 > buf.length) return false;
  const w2 = u16BE(buf, a0); a0 += 2;
  let d2 = (1 + w2) >>> 0;

  //   moveq #1,D3
  //   add.w (A0)+,D3    → D3 = 1 + w3; a0+=2
  //   mulu.w #28,D3
  if (a0 + 2 > buf.length) return false;
  const w3 = u16BE(buf, a0); a0 += 2;
  const d3 = Math.imul(1 + w3, 28) >>> 0;

  //   mulu.w (A0)+,D2   → D2 = (1+w2) * w4; a0+=2
  if (a0 + 2 > buf.length) return false;
  const w4 = u16BE(buf, a0); a0 += 2;
  d2 = Math.imul(d2, w4) >>> 0;

  //   add.l D2,D1
  //   add.l D3,D1
  d1 = (d1 + d2 + d3) >>> 0;

  //   addq.l #2,A0      → skip 1 word
  a0 += 2;

  //   moveq #1,D2
  //   add.w (A0)+,D2    → D2 = 1 + w5; a0+=2
  //   lsl.l #3,D2       → D2 <<= 3
  if (a0 + 2 > buf.length) return false;
  const w5 = u16BE(buf, a0); a0 += 2;
  d2 = ((1 + w5) << 3) >>> 0;

  //   moveq #32,D2 is a NEW d2 — no wait, add.l D2,D1 uses the same D2 then reuses D2=#32
  // Re-read: add.l D2,D1 uses (1+w5)<<3, then moveq #32,D2; add.l D2,D1
  d1 = (d1 + d2 + 32) >>> 0;

  // advance A0 by D1 from songOff+4: we need absolute position
  // a0 is the current pointer position in buf; add d1 to it
  const checkOff = a0 + d1;
  if (checkOff + 32 > buf.length) return false;

  // tst.l (A0)+  → must be 0
  if (u32BE(buf, checkOff) !== 0) return false;

  // move.w (A0),D2 → D2 = word at checkOff+4 (after the long)
  const d2final = u16BE(buf, checkOff + 4);
  if (d2final === 0) return false;

  // add.l D2,D2 → D2 *= 2
  const d2times2 = (d2final * 2) >>> 0;

  // cmp.l 26(A0),D2 → compare D2 with long at checkOff+4+26 = checkOff+30
  if (checkOff + 34 > buf.length) return false;
  const cmpVal = u32BE(buf, checkOff + 30);
  return d2times2 === cmpVal;
}

/**
 * Find the byte offset of the TFMX-7V song header inside `buf`. Mirrors the
 * detection logic — returns -1 if the buffer doesn't contain a valid 7V song.
 *
 * The detection has two paths:
 *   A) Loader stub at offset 0 starting with $6000; scan forward for
 *      $308141FA, then read another distance word and add to find the song.
 *   B) Direct TFMX-7V song at offset 0 (no stub).
 */
function findTFMX7VSongOffset(buf: Uint8Array): number {
  // Path A: loader stub
  if (buf.length >= 4 && u16BE(buf, 0) === 0x6000) {
    if (2 + 2 > buf.length) return -1;
    const d1 = u16BE(buf, 2);
    if (d1 === 0 || (d1 & 0x8000) || (d1 & 1)) return -1;
    let scanOff = 2 + d1;
    let found = -1;
    for (let i = 0; i <= 10; i++) {
      if (scanOff + 4 > buf.length) break;
      if (u32BE(buf, scanOff) === MAGIC_FIND1) { found = scanOff; break; }
      scanOff += 2;
    }
    if (found < 0) return -1;
    const afterFind = found + 4;
    if (afterFind + 2 > buf.length) return -1;
    const d1b = u16BE(buf, afterFind);
    if (d1b === 0 || (d1b & 0x8000) || (d1b & 1)) return -1;
    const songOff = afterFind + d1b;
    return checkTFMX7VSong(buf, songOff) ? songOff : -1;
  }
  // Path B: direct song at offset 0
  return checkTFMX7VSong(buf, 0) ? 0 : -1;
}

/**
 * Detect Jochen Hippel 7V format.
 *
 * Mirrors Check2 in "Jochen Hippel 7V_v2.asm":
 *   - Path A: loader stub starting with $6000, scanning for $308141FA
 *   - Path B: direct TFMX-7V song ('TFMX' magic + structural validation)
 */
export function isJochenHippel7VFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  // Path A: loader stub
  // ASM: cmp.w #$6000,(A0) — NO post-increment, just compare
  if (u16BE(buf, 0) === 0x6000) {
    // addq.l #2,A0  → A0 = 2
    // move.w (A0),D1  → read dist at offset 2, NO post-increment
    if (2 + 2 > buf.length) return false;
    const d1 = u16BE(buf, 2);
    if (d1 === 0) return false;
    if (d1 & 0x8000) return false; // negative
    if (d1 & 1) return false;      // odd

    // lea (A0,D1.W),A0 → scanOff = 2 + D1  (A0 was at 2, no additional advance)
    let scanOff = 2 + d1;
    let found = -1;
    for (let i = 0; i <= 10; i++) {
      if (scanOff + 4 > buf.length) break;
      if (u32BE(buf, scanOff) === MAGIC_FIND1) {
        found = scanOff;
        break;
      }
      scanOff += 2;
    }
    if (found < 0) return false;

    // OK_1: addq.l #4,A0 → afterFind = found + 4
    // move.w (A0),D1 → read dist at afterFind, NO post-increment
    const afterFind = found + 4;
    if (afterFind + 2 > buf.length) return false;
    const d1b = u16BE(buf, afterFind);
    if (d1b === 0) return false;
    if (d1b & 0x8000) return false;
    if (d1b & 1) return false;
    // lea (A0,D1.W),A0 → songOff = afterFind + D1b  (no +2)
    const songOff = afterFind + d1b;
    return checkTFMX7VSong(buf, songOff);
  }

  // Path B: direct song
  return checkTFMX7VSong(buf, 0);
}

/**
 * Read the TFMX-7V binary layout starting at `songOff`. Mirrors the
 * HippelDecoder::TFMX_init + TFMX_7V_subInit C++ logic, layout reference
 * is third-party/libtfmxaudiodecoder-main/src/Jochen/TFMX.cpp + TFMX7V.cpp.
 *
 * Returns absolute byte offsets into `buf` for each section.
 */
function readTFMX7VLayout(buf: Uint8Array, songOff: number) {
  // The sections and the 4 / 7 voice choice are HippelTfmxWalk's, the decoder's own rule
  // (TFMX_init, TFMX_4V_maybe / TFMX_7V_maybe); the walk is verified against the decoder
  // (hippelTfmxWalkMatchesDecoder.test.ts).
  const m = readHippelTfmx(buf, songOff);
  if (!m) throw new Error('TFMX-7V: layout did not fit in buffer');
  const sndModSeqsOff = songOff + 0x20;
  return {
    m, songOff,
    numSndSeqs: m.nSound, numVolSeqs: m.nVolume, numPatterns: m.nPatterns, numTrackSteps: m.nSteps,
    numSongs: m.nSongs, numSamples: m.nSamples,
    sndModSeqsOff, volModSeqsOff: sndModSeqsOff + m.nSound * 64,
    patternsOff: m.patternsOff, trackTableOff: m.trackOff,
    trackStepLen: m.stepLen, subSongTabOff: m.songTabOff,
    sampleHeadersOff: m.sampleHeadersOff, sampleDataOff: m.sampleDataOff,
    voices: m.voices,
  };
}

/**
 * Read sample headers (30 bytes each) starting at sampleHeadersOff.
 * Returns the raw header bytes plus the sample data slice for the entire bank.
 */
function extractSamples(buf: Uint8Array, sampleHeadersOff: number, numSamples: number, sampleDataOff: number) {
  const headerBlockSize = numSamples * TFMX_SAMPLE_STRUCT_SIZE;
  const sampleHeaders = buf.slice(sampleHeadersOff, sampleHeadersOff + headerBlockSize);
  // Sample data extends to end of file (no explicit length stored)
  const sampleData = buf.slice(sampleDataOff);
  return { sampleHeaders, sampleData };
}

/** Empty TrackerCell helper. */
function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

/**
 * One grid pattern of a walked step: `rows` rows per voice, each cell the row
 * the voice reads (HippelDecoder::TFMX_processPattern) with the step's
 * transposes on it, and the byte span behind it. A row's note is the pattern
 * note plus the step's transpose, named by the period the player looks up
 * (hippelCellNote); its instrument is the volume sequence the player starts,
 * (info & $1F) + the step's sound transpose, none when the song has no such
 * sequence or the note byte's bit 7 says the sequence keeps playing. A
 * sound sequence's own pitch (a transposition or a fixed note) is the
 * instrument's, not the pattern's, and is not in the cell.
 */
function decodeTFMX7VPattern(
  walked: HippelGrid,
  stepIdx: number,
  trackColumnSize: number,
  numChannels: number,
): { rows: TrackerCell[][]; spans: (HippelCellSpan | null)[][] } {
  const step = walked.steps[stepIdx];
  const rows: TrackerCell[][] = Array.from({ length: numChannels }, () => Array.from({ length: step.rows }, () => emptyCell()));
  const spans: (HippelCellSpan | null)[][] = Array.from({ length: numChannels }, () => new Array(step.rows).fill(null));
  for (let voice = 0; voice < numChannels; voice++) {
    const sv = step.voices[voice];
    for (let row = 0; row < step.rows; row++) {
      const c = walked.cells[stepIdx][voice][row];
      const cell = rows[voice][row];
      cell.note = c.note;
      cell.instrument = c.instrument;
      if (c.seq !== 0) cell.hippelSeq = c.seq;
      if (c.note > 0 && walked.bias !== 0) cell.hippelBias = walked.bias;
      spans[voice][row] = tfmx7VSpan(c.offset, cell, sv.transpose, sv.soundTranspose, c.noteByte, walked.bias);
    }
    // The step's fourth byte per voice is a track-table command. `0xFx` sets
    // the voice's volume for the step (TFMX_7V_trackTabCmd); the grid shows
    // it in row 0's volume column, where a listener can see why a voice
    // with notes is barely heard (lethalxcess-intro: 245 of 1449 voice-steps
    // at 36 % or less, 2026-10-03).
    if (trackColumnSize === 4) {
      rows[voice][0].volume = tfmx7VVoiceVolumeColumn(sv.command);
      spans[voice][0]!.aux = tfmx7VVoiceVolumeSpan(sv.offset + 3);
    }
  }
  return { rows, spans };
}

/** The decoder's voice volume (percent) for a `0xFx` track-table command. */
function tfmx7VVoiceVolumePercent(cmd: number): number {
  const v2 = cmd & 0x0f;
  return v2 === 0 ? 100 : ((15 - v2) + 1) * 6;
}

/**
 * Volume column for a track-table command byte: `0x10 + 0..64` for a `0xFx`
 * voice-volume command, 0 (nothing shown) for any other byte.
 */
export function tfmx7VVoiceVolumeColumn(cmd: number): number {
  if ((cmd >> 4) !== 0x0f) return 0;
  return 0x10 + Math.round(tfmx7VVoiceVolumePercent(cmd) * 64 / 100);
}

/**
 * Track-table command byte for a volume column value, or null when it cannot
 * be written: a byte holding another command (`0xDx` sets the rate) stays.
 * No volume (`< 0x10`) clears a voice-volume command; a volume picks the
 * `0xFx` step whose decoder percent is nearest.
 */
export function tfmx7VVoiceVolumeCommand(volume: number, oldCmd: number): number | null {
  const hi = oldCmd >> 4;
  if (hi !== 0x0f && oldCmd !== 0) return null;
  if (volume < 0x10) return 0;
  const pct = Math.min(64, volume - 0x10) * 100 / 64;
  if (pct >= 95) return 0xf0;
  const v2 = Math.min(15, Math.max(1, 16 - Math.round(pct / 6)));
  return 0xf0 | v2;
}

/** Row 0's volume column edits the step's voice-volume command byte. */
function tfmx7VVoiceVolumeSpan(cmdOff: number): HippelAuxSpan {
  return {
    offset: cmdOff, length: 1,
    encode(cell, file) {
      const cmd = tfmx7VVoiceVolumeCommand(cell.volume ?? 0, file[cmdOff]);
      return cmd === null ? null : new Uint8Array([cmd]);
    },
  };
}

/**
 * A 7V pattern cell: note byte (bit 7 = portamento, which triggers no
 * instrument) and info byte (low five bits + sound transpose = instrument).
 * Writing a cell subtracts the step's transposes again and keeps the bits the
 * grid does not show: portamento and the info byte's top three bits.
 */
function tfmx7VSpan(offset: number, baseline: TrackerCell, tr: number, st: number, baseNoteByte: number, bias: number): HippelCellSpan {
  return {
    offset, length: 2, baseline,
    // The cell as the file decodes it, under the sound-sequence transpose the cell carries (hippelSeq).
    baselineFor: (cell) => ({ ...baseline, note: hippelCellNote(baseNoteByte, tr, cell.hippelSeq ?? 0, bias) }),
    encode(cell, file) {
      const oldNote = file[offset];
      const oldInfo = file[offset + 1];
      if ((cell.note ?? 0) === 0) return new Uint8Array([0, 0]);
      const seq = cell.hippelSeq ?? 0;
      // The pattern note under which the player plays the typed note. A note the byte already plays is kept.
      const noteVal = (oldNote & 0x7F) >= 2 && hippelCellNote(oldNote, tr, seq, bias) === cell.note
        ? oldNote & 0x7F
        : hippelNoteByteFor(cell.note, tr, seq, bias);
      if (noteVal === null) return null; // a fixed-pitch sound sequence, or a note the table does not reach
      const porta = (oldNote & 0x7F) !== 0 ? oldNote & 0x80 : 0;
      let info = oldInfo;
      if (!porta) {
        const inst = cell.instrument ?? 0;
        const low = inst > 0 ? ((inst - 1) - st) & 0xFF : oldInfo & 0x1F;
        if (low > 31) return null;
        info = (oldInfo & 0xE0) | low;
      }
      return new Uint8Array([porta | noteVal, info]);
    },
  };
}

/** The XM speed effect. */
const EFFECT_SPEED = 0x0f;

/**
 * The grid of subsong 0, as the decoder walks it: one pattern per track step
 * (HippelTfmxWalk.hippelGrid), the rows the voices read in it, each cell with
 * the byte span behind it. A speed change shows as the speed effect on the
 * first row that runs at the new speed. `unmatched` says why there is no grid.
 */
function decodeTFMX7VGrid(layout: ReturnType<typeof readTFMX7VLayout>, played?: HippelPlayed, bias?: number): {
  rows: TrackerCell[][][]; spans: HippelCellSpans; walked: HippelGrid; speed: number;
} {
  const walked = hippelGrid(layout.m, 0, played, bias);
  const trackColumnSize = (layout.trackStepLen / layout.voices) | 0; // 3 (4V) or 4 (7V)
  const rows: TrackerCell[][][] = [];
  const spans: HippelCellSpans = [];
  let speed = 0;
  let previous = 0;
  walked.steps.forEach((step, i) => {
    const decoded = decodeTFMX7VPattern(walked, i, trackColumnSize, layout.voices);
    step.rowSpeeds.forEach((rowSpeed, r) => {
      if (speed === 0) speed = rowSpeed;
      if (previous !== 0 && rowSpeed !== previous) {
        decoded.rows[0][r].effTyp = EFFECT_SPEED;
        decoded.rows[0][r].eff = rowSpeed;
      }
      previous = rowSpeed;
    });
    rows.push(decoded.rows);
    spans.push(decoded.spans);
  });
  return { rows, spans, walked, speed: speed || 3 };
}

/** The byte span behind every grid cell of a Hippel TFMX module (4 or 7 voices), as the parser lays the grid out. */
export function mapJochenHippel7VCells(buf: Uint8Array, bias?: number): HippelCellSpans {
  // A 7V file's song is where the 7V player's check finds it; any other Hippel TFMX file's (.hip) where the decoder does.
  const songOff = isJochenHippel7VFormat(buf) ? findTFMX7VSongOffset(buf) : -1;
  const m = readHippelTfmx(buf, songOff >= 0 ? songOff : undefined);
  if (!m) return [];
  return decodeTFMX7VGrid(readTFMX7VLayout(buf, m.header), undefined, bias).spans;
}

export function parseJochenHippel7VFile(buffer: ArrayBuffer, filename: string, played?: HippelPlayed): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isJochenHippel7VFormat(buf)) throw new Error('Not a Jochen Hippel 7V module');
  // Find the song header inside the file (handles loader-stub wrapping)
  const songOff = findTFMX7VSongOffset(buf);
  if (songOff < 0) {
    throw new Error('TFMX-7V: could not locate song header');
  }
  const baseName = filename.split('/').pop() ?? filename;
  return buildHippelTfmxSong(buffer, filename, songOff, `${baseName.replace(/^(hip7|s7g)\./i, '') || baseName} [Jochen Hippel 7V]`, 'tfmx7v', played);
}

/**
 * The Amiga Hippel TFMX song (4 voices, or 7V's 7) behind a replay-code prefix
 * (.hip, SOG.), as the grid the decoder walks. Null when the file has no TFMX
 * song the decoder finds (MCMD modules).
 */
export function parseHippelTfmxAmigaFile(buffer: ArrayBuffer, filename: string, played?: HippelPlayed): TrackerSong | null {
  const buf = new Uint8Array(buffer);
  const m = readHippelTfmx(buf);
  if (!m) return null;
  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^(sog|mcmd)\./i, '').replace(/\.(hip|mcmd)$/i, '') || baseName;
  return buildHippelTfmxSong(buffer, filename, m.header, `${moduleName} [Jochen Hippel]`, 'tfmx7v', played);
}

function buildHippelTfmxSong(buffer: ArrayBuffer, filename: string, songOff: number, name: string, layoutId: string, played?: HippelPlayed): TrackerSong {
  const buf = new Uint8Array(buffer);
  const layout = readTFMX7VLayout(buf, songOff);
  const { sampleHeaders, sampleData } = extractSamples(
    buf, layout.sampleHeadersOff, layout.numSamples, layout.sampleDataOff,
  );

  // Slice the entire SndModSeq pool once — every instrument exposes the
  // full pool so the editor can browse all sequences (UI lets user pick
  // which seq is active via a tab/dropdown).
  const sndModPool = buf.slice(layout.sndModSeqsOff, layout.sndModSeqsOff + layout.numSndSeqs * 64);

  // Build one instrument per VolModSeq entry. Each VolModSeq is 64 bytes
  // and lives at volModSeqsOff + i*64. The first byte after the 5-byte
  // header indexes into the SndModSeq pool (sndSeqNum).
  const instruments: InstrumentConfig[] = [];
  for (let i = 0; i < layout.numVolSeqs; i++) {
    const volSeqAbsOff = layout.volModSeqsOff + i * 64;
    const volModSeqData = buf.slice(volSeqAbsOff, volSeqAbsOff + 64);

    // Skip empty volume sequences (all zeros = unused slot)
    let nonZero = false;
    for (let b = 0; b < volModSeqData.length; b++) {
      if (volModSeqData[b] !== 0) { nonZero = true; break; }
    }
    if (!nonZero) continue;

    const tfmxConfig: TFMXConfig = {
      sndSeqsCount: layout.numSndSeqs,
      sndModSeqData: sndModPool,
      volModSeqData,
      sampleCount: layout.numSamples,
      sampleHeaders,
      sampleData,
    };

    const uadeChipRam: UADEChipRamInfo = {
      moduleBase: 0,
      moduleSize: buf.length,
      // Per-instrument chip RAM base = the absolute offset of this VolModSeq.
      // setVolByte writes to instrBase + N (vol bytes 0..63), setSndByte writes
      // to instrBase + 64 + N which is wrong for 7V because SndModSeq is a
      // SHARED pool, not contiguous with VolModSeq. We expose a special
      // metadata field below so the editor can compute the correct address.
      instrBase: volSeqAbsOff,
      instrSize: 64,
      sections: {
        volModSeqsBase: layout.volModSeqsOff,
        sndModSeqsBase: layout.sndModSeqsOff,
        sampleHeadersBase: layout.sampleHeadersOff,
        sampleDataBase: layout.sampleDataOff,
        patternsBase: layout.patternsOff,
        trackTableBase: layout.trackTableOff,
      },
    };

    instruments.push({
      id: i + 1,
      name: '',
      type: 'synth' as const,
      synthType: 'TFMXSynth' as const,
      tfmx: tfmxConfig,
      uadeChipRam,
      effects: [],
      volume: 64,
      pan: 0,
    } as InstrumentConfig);
  }

  // ── The grid is the decoder's walk (HippelTfmxWalk.hippelGrid) ──
  // Mirrors HippelDecoder::TFMX_nextNote / TFMX_processPattern. Subsong 0's steps
  // (the one the engine plays) become one Pattern each, as many rows as the
  // voices read in the step (a break note ends it early); a speed change shows
  // as the speed effect. A song whose voices do not walk their steps together
  // has no pattern-per-step grid: it opens in the scope view with the reason.
  const channelPan: number[] = [-50, 50, 50, -50, -50, 50, 50];

  const trackerPatterns: Pattern[] = [];
  const songPositions: number[] = [];

  const grid = decodeTFMX7VGrid(layout, played);
  grid.rows.forEach((channelRows, patIdx) => {
    const step = grid.walked.steps[patIdx].step;
    trackerPatterns.push({
      id: `pattern-${patIdx}`,
      name: `Pattern ${patIdx + 1} (step ${step})`,
      length: grid.walked.steps[patIdx].rows,
      channels: Array.from({ length: layout.voices }, (_, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: channelPan[ch] ?? 0,
        instrumentId: null,
        color: null,
        rows: channelRows[ch],
      })),
      importMetadata: {
        sourceFormat: 'MOD' as const,
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: layout.voices,
        originalPatternCount: layout.numPatterns,
        originalInstrumentCount: instruments.length,
      },
    });
    songPositions.push(patIdx);
  });

  // No guessed grid: an empty pattern, and the scope view with the reason.
  const unmatched = grid.walked.unmatched;
  if (trackerPatterns.length === 0) {
    const emptyRows: TrackerCell[] = Array.from({ length: 32 }, () => emptyCell());
    trackerPatterns.push({
      id: 'pattern-0',
      name: 'Pattern 0',
      length: 32,
      channels: Array.from({ length: layout.voices }, (_, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: channelPan[ch] ?? 0,
        instrumentId: null,
        color: null,
        rows: emptyRows.map(c => ({ ...c })),
      })),
      importMetadata: {
        sourceFormat: 'MOD' as const,
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: layout.voices,
        originalPatternCount: layout.numPatterns,
        originalInstrumentCount: instruments.length,
      },
    });
    songPositions.push(0);
  }

  // Build a UADEPatternLayout so the standard tracker setCell path can write
  // edited cells back to chip RAM via UADE. Mapping rules:
  //
  //   DOM pattern P  →  the P-th trackstep the walk loads (grid.walked.steps[P].step)
  //   trackstep entry → PT byte at trackTableOff + step*trackStepLen + voice*trackColumnSize
  //   pattern body bytes start at patternsOff + PT*64
  //   row R, channel C cell → patternsOff + PT*64 + R*2
  //
  // Multiple trackstep entries may share a PT, so editing a cell affects every
  // pattern in the song that references it — that's the correct TFMX semantic
  // (patterns are pooled, not duplicated per trackstep).
  const uadePatternLayout: UADEPatternLayout = {
    formatId: layoutId,
    patternDataFileOffset: layout.patternsOff,
    bytesPerCell: 2,
    rowsPerPattern: 32,
    numChannels: layout.voices,
    numPatterns: trackerPatterns.length,
    moduleSize: buffer.byteLength,
    encodeCell: encodeTFMX7VCell,
    decodeCell: (raw: Uint8Array): TrackerCell => {
      const noteByte = raw[0];
      const infoByte = raw[1];
      const note = hippelCellNote(noteByte, 0);
      const instrument = (infoByte & 0x1F) + 1; // 1-based, as the grid shows it
      // Byte-exact carriers: the note/instrument view above discards the portamento
      // bit (noteByte bit7), the 0/1 note sentinels, and the info byte's high 3 bits;
      // note-0 rows still carry an info byte the encoder would otherwise zero. Stash
      // the exact source bytes so encodeTFMX7VCell reproduces them verbatim. Private to
      // the round-trip codec — the grid is built by decodeTFMX7VPattern (with per-voice
      // transpose) and tfmx7v has no chip-RAM edit / native export path — so an edited
      // cell arrives carrier-less and keeps the derivation.
      return {
        note, instrument, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
        period: noteByte, pan: infoByte,
      };
    },
    getCellFileOffset: (pattern: number, row: number, channel: number): number => {
      const cell = grid.walked.cells[pattern]?.[channel]?.[row];
      return cell && cell.offset + 2 <= buf.length ? cell.offset : -1;
    },
  };

  return {
    name,
    format: 'MOD' as TrackerFormat,
    patterns: trackerPatterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: layout.voices,
    initialSpeed: grid.speed,
    initialBPM: 125,
    linearPeriods: false,
    // Audio: libtfmxaudiodecoder (TFMX WASM) decodes Hippel 7V natively —
    // measured on ghostbattle_gameover.hip7, 2026-09-28. The silence recorded
    // on 2026-09-22 came from the old Hippel WASM, which played nothing at all.
    hippelFileData: buffer.slice(0),
    uadePatternLayout,
    ...(unmatched ? { gridUnmatchedReason: unmatched } : {}),
  };
}
