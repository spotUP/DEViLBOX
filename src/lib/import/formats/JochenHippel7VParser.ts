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

const MIN_FILE_SIZE = 32;

// ── Layout constants (from libtfmxaudiodecoder Jochen/HippelDecoder.h) ───────
const TFMX_TRACKTAB_STEP_SIZE_4V = 0x0c;   // 3 * 4 voices
const TFMX_TRACKTAB_STEP_SIZE_7V = 0x1c;   // 4 * 7 voices
const TFMX_SONGTAB_ENTRY_SIZE_4V = 6;
const TFMX_SONGTAB_ENTRY_SIZE_7V = 8;
const TFMX_SAMPLE_STRUCT_SIZE = 0x12 + 4 + 2 + 4 + 2; // 30 bytes
const PATTERN_LENGTH = 0x40;

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
  // Header at songOff:
  //   +0  4  'TFMX' magic + null
  //   +4  2  numSndSeqs - 1
  //   +6  2  numVolSeqs - 1
  //   +8  2  numPatterns - 1
  //   +A  2  numTrackSteps - 1
  //   +C  1  ???
  //   +D  1  patternSize (must be 0x40)
  //   +E  2  ???
  //   +10 2  numSongs
  //   +12 2  numSamples
  //   +14..1F padding
  //   +20 onward: section data
  const h = songOff;
  const numSndSeqs   = u16BE(buf, h + 4) + 1;
  const numVolSeqs   = u16BE(buf, h + 6) + 1;
  const numPatterns  = u16BE(buf, h + 8) + 1;
  const numTrackSteps= u16BE(buf, h + 0xA) + 1;
  const numSongs     = u16BE(buf, h + 0x10);
  const numSamples   = Math.min(u16BE(buf, h + 0x12), 256);

  // Section offsets (constant +0x20 from header)
  let offs = h + 0x20;
  const sndModSeqsOff = offs; offs += numSndSeqs * 64;
  const volModSeqsOff = offs; offs += numVolSeqs * 64;
  const patternsOff   = offs; offs += numPatterns * PATTERN_LENGTH;
  const trackTableOff = offs;

  // Decide 4V vs 7V purely from layout: try 7V step size first; if the
  // resulting offsets push past EOF, fall back to 4V.
  const tryStepSize = (stepSize: number, songtabSize: number) => {
    let p = trackTableOff + numTrackSteps * stepSize;
    const subSongTabOff = p;
    p += (numSongs + 1) * songtabSize;
    if (p >= buf.length) return null;
    const sampleHeadersOff = p;
    p += numSamples * TFMX_SAMPLE_STRUCT_SIZE;
    if (p > buf.length) return null;
    return { trackStepLen: stepSize, subSongTabOff, sampleHeadersOff, sampleDataOff: p };
  };
  const layout7V = tryStepSize(TFMX_TRACKTAB_STEP_SIZE_7V, TFMX_SONGTAB_ENTRY_SIZE_7V);
  const layout4V = tryStepSize(TFMX_TRACKTAB_STEP_SIZE_4V, TFMX_SONGTAB_ENTRY_SIZE_4V);
  // The detector validated the file as 7V — prefer 7V layout when both fit.
  const chosen = layout7V ?? layout4V;
  if (!chosen) {
    throw new Error('TFMX-7V: layout did not fit in buffer');
  }

  return {
    songOff,
    numSndSeqs, numVolSeqs, numPatterns, numTrackSteps, numSongs, numSamples,
    sndModSeqsOff, volModSeqsOff, patternsOff, trackTableOff,
    ...chosen,
    voices: chosen === layout7V ? 7 : 4,
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
 * Convert a TFMX raw note byte (after `& 0x7f`) plus per-voice transpose to an
 * XM note index (1..96). The TFMX period table starts at TFMX note 0 = period
 * 0x6b0 = ProTracker C-0 = XM note 1, so the mapping is simply `tfmxNote + 1`.
 *
 * Returns 0 (empty) if `tfmxNote` is 0 or 1 (1 is the pattern-break sentinel
 * — see TFMX_processPattern in libtfmxaudiodecoder Jochen/TFMX.cpp:153).
 */
function tfmxNoteToXM(tfmxNote: number, transpose: number): number {
  if (tfmxNote === 0 || tfmxNote === 1) return 0;
  // sbyte transpose, signed addition
  const t = (transpose << 24) >> 24;
  let n = (tfmxNote + t) | 0;
  if (n <= 1) return 0;
  if (n > 95) n = 95;
  return n + 1;
}

/**
 * Decode one TFMX-7V trackstep entry into per-voice TrackerCell rows
 * (32 rows × `numChannels` voices). Mirrors HippelDecoder::TFMX_processPattern
 * in third-party/libtfmxaudiodecoder-main/src/Jochen/TFMX.cpp lines 201-238.
 *
 * For each voice the trackstep entry stores `[PT, TR(sbyte), ST(sbyte)(, CMD)]`.
 * PT picks a 64-byte pattern (32 rows × 2 bytes); TR is added to the row's
 * note value; ST is added to the row's `(infoByte & 0x1f)` to compute the
 * absolute instrument index. The high bit of the note byte marks portamento
 * (no instrument change); a row note of 0 is empty.
 */
function decodeTFMX7VPattern(
  buf: Uint8Array,
  patternsBase: number,
  trackStepBuf: Uint8Array,
  trackColumnSize: number,
  numChannels: number,
): TrackerCell[][] {
  const rows: TrackerCell[][] = Array.from({ length: numChannels }, () => {
    const arr: TrackerCell[] = [];
    for (let r = 0; r < 32; r++) arr.push(emptyCell());
    return arr;
  });

  for (let voice = 0; voice < numChannels; voice++) {
    const colOff = voice * trackColumnSize;
    const pt = trackStepBuf[colOff] | 0;
    const tr = (trackStepBuf[colOff + 1] << 24) >> 24; // sbyte transpose
    const st = (trackStepBuf[colOff + 2] << 24) >> 24; // sbyte sound transpose

    const patOff = patternsBase + pt * PATTERN_LENGTH;
    if (patOff < 0 || patOff + PATTERN_LENGTH > buf.length) continue;

    for (let row = 0; row < 32; row++) {
      const noteByte = buf[patOff + row * 2];
      const infoByte = buf[patOff + row * 2 + 1];
      const noteVal = noteByte & 0x7f;
      if (noteVal === 0) continue; // empty cell — nothing to do

      const cell = rows[voice][row];
      cell.note = tfmxNoteToXM(noteVal, tr);

      // High bit set = portamento / modifier — no new instrument trigger.
      if ((noteByte & 0x80) === 0) {
        const instr = ((infoByte & 0x1f) + st) & 0xff;
        // TrackerCell instrument is 1-based for display; clamp into byte range.
        cell.instrument = instr > 0 ? instr : 0;
      }
    }
  }

  return rows;
}

export function parseJochenHippel7VFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isJochenHippel7VFormat(buf)) throw new Error('Not a Jochen Hippel 7V module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^(hip7|s7g)\./i, '') || baseName;

  // Find the song header inside the file (handles loader-stub wrapping)
  const songOff = findTFMX7VSongOffset(buf);
  if (songOff < 0) {
    throw new Error('TFMX-7V: could not locate song header');
  }

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
      name: `Instrument ${i + 1}`,
      type: 'synth' as const,
      synthType: 'TFMXSynth' as const,
      tfmx: tfmxConfig,
      uadeChipRam,
      effects: [],
      volume: 64,
      pan: 0,
    } as InstrumentConfig);
  }

  // ── Build per-trackstep tracker patterns (Option A from the cleanup plan) ──
  // Mirrors HippelDecoder::TFMX_nextNote / TFMX_processPattern. Each subsong's
  // trackstep range becomes a sequence of 32-row Pattern objects, one per
  // trackstep entry. This matches the WASM replayer's playback structure and
  // gives click-to-seek for free.
  //
  // We default to subsong 0 (the first entry in the subSongTab). The 7V songtab
  // entry stores firstStep at +0 and lastStep at +2 (TFMX_7V_startSong); the 4V
  // entry uses the same +0/+2 layout.
  let firstStep = 0;
  let lastStep = layout.numTrackSteps - 1;
  if (layout.subSongTabOff + 4 <= buf.length) {
    firstStep = u16BE(buf, layout.subSongTabOff + 0);
    lastStep = u16BE(buf, layout.subSongTabOff + 2);
  }
  if (firstStep < 0 || firstStep >= layout.numTrackSteps) firstStep = 0;
  if (lastStep < firstStep || lastStep >= layout.numTrackSteps) {
    lastStep = layout.numTrackSteps - 1;
  }

  const trackColumnSize = (layout.trackStepLen / layout.voices) | 0; // 3 (4V) or 4 (7V)
  const channelPan: number[] = [-50, 50, 50, -50, -50, 50, 50];

  const trackerPatterns: Pattern[] = [];
  const songPositions: number[] = [];

  for (let step = firstStep; step <= lastStep; step++) {
    const stepOff = layout.trackTableOff + step * layout.trackStepLen;
    if (stepOff + layout.trackStepLen > buf.length) break;
    const trackStepBuf = buf.slice(stepOff, stepOff + layout.trackStepLen);

    const channelRows = decodeTFMX7VPattern(
      buf,
      layout.patternsOff,
      trackStepBuf,
      trackColumnSize,
      layout.voices,
    );

    const patIdx = trackerPatterns.length;
    trackerPatterns.push({
      id: `pattern-${patIdx}`,
      name: `Pattern ${patIdx + 1} (step ${step})`,
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
  }

  // Safety net: never return zero patterns even on degenerate input.
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
  //   DOM pattern P  →  trackstep (firstStep + P)
  //   trackstep entry → PT byte at trackTableOff + step*trackStepLen + voice*trackColumnSize
  //   pattern body bytes start at patternsOff + PT*64
  //   row R, channel C cell → patternsOff + PT*64 + R*2
  //
  // Multiple trackstep entries may share a PT, so editing a cell affects every
  // pattern in the song that references it — that's the correct TFMX semantic
  // (patterns are pooled, not duplicated per trackstep).
  const uadePatternLayout: UADEPatternLayout = {
    formatId: 'tfmx7v',
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
      const tfmxNote = noteByte & 0x7F;
      // tfmxNoteToXM(note, 0): note > 1 ? note + 1 : 0
      const note = (tfmxNote > 1) ? Math.min(96, tfmxNote + 1) : 0;
      const instrument = (infoByte & 0x1F) > 0 ? (infoByte & 0x1F) : 0;
      return { note, instrument, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
    },
    getCellFileOffset: (pattern: number, row: number, channel: number): number => {
      if (pattern < 0 || pattern >= trackerPatterns.length) return -1;
      if (row < 0 || row >= 32) return -1;
      if (channel < 0 || channel >= layout.voices) return -1;
      const step = firstStep + pattern;
      const stepOff = layout.trackTableOff + step * layout.trackStepLen;
      if (stepOff + layout.trackStepLen > buf.length) return -1;
      const pt = buf[stepOff + channel * trackColumnSize];
      const patAbs = layout.patternsOff + pt * PATTERN_LENGTH;
      const cellAbs = patAbs + row * 2;
      if (cellAbs + 2 > buf.length) return -1;
      return cellAbs;
    },
  };

  return {
    name: `${moduleName} [Jochen Hippel 7V]`,
    format: 'MOD' as TrackerFormat,
    patterns: trackerPatterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: layout.voices,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    hippelFileData: buffer.slice(0),
    uadePatternLayout,
  };
}
