/**
 * DesireParser.ts — Desire Amiga music format (DSR.*) native parser
 *
 * Desire is an Amiga music format by Dentons, adapted for EaglePlayer by Wanted Team.
 * The module file is a compiled 68k executable containing both player code and music
 * data in a single self-contained file.
 *
 * Detection (from UADE Desire_v1.asm, DTP_Check2 routine):
 *   1. File size must be > 2500 bytes.
 *   2. Check 4 consecutive longs of 0x00010101 starting at offset 8, spaced 16 bytes
 *      apart: offsets 8, 24, 40, 56.
 *   3. Scan forward from offset 72 for up to 400 bytes looking for the word 0x49FA.
 *      When found, verify the following bytes:
 *        - skip 2 bytes (addq.l #2, A0 after cmp.w post-increment)
 *        - long at +0: 0x45F900DF
 *        - long at +4: 0xF000357C
 *        - long at +8: 0x00FF009E
 *        - word at +12: 0x41FA
 *        - word at +14: relative offset that, when added to the current position
 *          (A0 after the word read), makes A0 equal to the file base (A2=0).
 *          That means u16BE(buf, pos+14) interpreted as signed and added to
 *          (foundPos + 16) must equal 0.
 *
 * Single-file format: player code + music data + samples all in one binary blob.
 * This parser extracts metadata only; UADE handles actual audio playback.
 *
 * Reference: third-party/uade-3.05/amigasrc/players/wanted_team/Desire/src/Desire_v1.asm
 * Reference parsers: DaveLoweParser.ts, JeroenTelParser.ts
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { encodeMODCell, decodeMODCell } from '@/engine/uade/encoders/MODEncoder';
import { createSamplerInstrument } from './AmigaUtils';
import { encodeDesireCell, decodeDesireCell } from '@/engine/uade/encoders/DesireEncoder';

// ── Constants ───────────────────────────────────────────────────────────────

/** Minimum file size enforced by the Check2 routine (ble.b Return if <= 2500). */
const MIN_FILE_SIZE = 2501;

/** Number of fallback placeholder instruments if opcode scan fails. */
const NUM_PLACEHOLDER_INSTRUMENTS = 8;

// ── Binary helpers ──────────────────────────────────────────────────────────

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function s16BE(buf: Uint8Array, off: number): number {
  const v = (buf[off] << 8) | buf[off + 1];
  return v < 0x8000 ? v : v - 0x10000;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

/**
 * Scan for Desire opcode chain to locate sample lengths, offsets, and shift factor.
 *
 * Opcode chain:
 *   0xE341 → anchor
 *   3 sequential 0x47FA matches:
 *     1st 47FA → SamplesLengths (PC-relative displacement)
 *     2nd 47FA → SamplesOffsets (PC-relative displacement)
 *     3rd+4 → Ruch shift factor: ((word & 0xE00) ? (val >> 8) >> 1 : 8)
 *
 * Returns { lengthsOff, offsetsOff, ruch, count } or null.
 */
function scanDesireSamplePointers(buf: Uint8Array): {
  lengthsOff: number; offsetsOff: number; ruch: number; count: number;
} | null {
  const len = buf.length;

  // Find 0xE341 in the code area
  let e341Pos = -1;
  for (let pos = 72; pos + 1 < len && pos < 2000; pos += 2) {
    if (u16BE(buf, pos) === 0xE341) {
      e341Pos = pos;
      break;
    }
  }
  if (e341Pos < 0) return null;

  // Find 3 sequential 0x47FA (lea xx(PC),An) after E341
  const matches47FA: number[] = [];
  for (let pos = e341Pos + 2; pos + 3 < len && matches47FA.length < 3; pos += 2) {
    if (u16BE(buf, pos) === 0x47FA) {
      matches47FA.push(pos);
    }
  }
  if (matches47FA.length < 3) return null;

  // 1st 47FA → SamplesLengths: PC-relative displacement at +2
  const disp1 = s16BE(buf, matches47FA[0] + 2);
  const lengthsOff = matches47FA[0] + 2 + disp1;

  // 2nd 47FA → SamplesOffsets: PC-relative displacement at +2
  const disp2 = s16BE(buf, matches47FA[1] + 2);
  const offsetsOff = matches47FA[1] + 2 + disp2;

  // 3rd 47FA + 4 → Ruch shift factor word
  const ruchWordPos = matches47FA[2] + 4;
  if (ruchWordPos + 1 >= len) return null;
  const ruchWord = u16BE(buf, ruchWordPos);
  const ruch = (ruchWord & 0xE00) ? ((ruchWord >> 8) >> 1) : 8;

  // Determine count: scan lengths table for non-zero entries
  let count = 0;
  for (let off = lengthsOff; off + 1 < len; off += 2) {
    const val = u16BE(buf, off);
    if (val === 0) break;
    count++;
  }

  if (count === 0 || lengthsOff < 0 || offsetsOff < 0) return null;
  // The two tables are adjacent (spec: 27 instruments = 0x36 bytes between them); the zero-length scan stops at the first empty slot.
  const gap = Math.abs(lengthsOff - offsetsOff) / 2;
  return { lengthsOff, offsetsOff, ruch, count: gap > count && gap <= 256 ? gap : count };
}

// ── Format detection ────────────────────────────────────────────────────────

/**
 * Return true if the buffer is a Desire format module.
 *
 * Mirrors the DTP_Check2 routine from Desire_v1.asm exactly:
 *
 *   1. File > 2500 bytes.
 *   2. Four longs of 0x00010101 at offsets 8, 24, 40, 56.
 *   3. Scan offset 72..471 for word 0x49FA; when found verify the magic sequence
 *      that follows, ending with a relative back-reference to the file base.
 */
export function isDesireFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  // Step 1 — minimum file size
  if (buf.length < MIN_FILE_SIZE) return false;

  // Step 2 — four longs of 0x00010101 at offsets 8, 24, 40, 56
  // Assembly: addq.l #8,A0; loop 4 times (D1=3,dbf): cmp.l #$00010101,(A0); lea 16(A0),A0
  for (let i = 0; i < 4; i++) {
    const off = 8 + i * 16;
    if (off + 3 >= buf.length) return false;
    if (u32BE(buf, off) !== 0x00010101) return false;
  }

  // After the loop A0 = 8 + 4*16 = 72; A1 = A0 + 400 = 472
  // Step 3 — scan [72..472) for word 0x49FA
  // Assembly: cmp.w #$49FA,(A0)+ — post-increments A0 by 2 on each iteration
  const scanStart = 72;
  const scanEnd = 472; // exclusive upper bound (A0 must be < A1=472 when checked)

  for (let pos = scanStart; pos < scanEnd; pos += 2) {
    if (pos + 1 >= buf.length) return false;
    if (u16BE(buf, pos) !== 0x49FA) continue;

    // Found 0x49FA at pos. Assembly then does:
    //   (A0)+ already consumed the word, so A0 = pos+2
    //   addq.l #2,A0  →  A0 = pos+4
    //   cmp.l #$45F900DF,(A0)+  →  check [pos+4..pos+7], A0 = pos+8
    //   cmp.l #$F000357C,(A0)+  →  check [pos+8..pos+11], A0 = pos+12
    //   cmp.l #$00FF009E,(A0)+  →  check [pos+12..pos+15], A0 = pos+16
    //   cmp.w #$41FA,(A0)+      →  check [pos+16..pos+17], A0 = pos+18
    //   add.w (A0),A0           →  A0 += s16(pos+18); A0 = pos+18 + s16(pos+18)
    //   cmp.l A0,A2             →  require A0 == A2 == file_base (absolute address 0 in our model)
    //
    // In our relative offset model (A2 = buf+0, all offsets relative to buf start):
    //   The final A0 value in absolute Amiga memory would be:
    //     fileBase + pos + 18 + s16(pos+18)  (the add.w uses the current word then A0 points past it)
    //   Wait — add.w (A0),A0 reads at A0=pos+18, adds to A0, giving pos+18+s16.
    //   Then cmp.l A0,A2: A0 must equal A2 = fileBase.
    //   So: fileBase + (pos+18) + s16(buf, pos+18) == fileBase
    //   →  (pos+18) + s16(buf, pos+18) == 0  (relative to file base)
    //   →  s16(buf, pos+18) == -(pos+18)

    if (pos + 19 >= buf.length) return false;

    if (u32BE(buf, pos + 4) !== 0x45F900DF) continue;
    if (u32BE(buf, pos + 8) !== 0xF000357C) continue;
    if (u32BE(buf, pos + 12) !== 0x00FF009E) continue;
    if (u16BE(buf, pos + 16) !== 0x41FA) continue;

    // Back-reference check: pos+18 + s16(buf, pos+18) == 0
    const rel = s16BE(buf, pos + 18);
    if ((pos + 18 + rel) !== 0) continue;

    // All checks passed
    return true;
  }

  return false;
}

// ── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse a Desire module file into a TrackerSong.
 *
 * The format is a compiled 68k executable; there is no public specification
 * of the internal layout beyond what the UADE EaglePlayer uses for detection.
 * This parser creates a metadata-only TrackerSong with placeholder instruments.
 * Actual audio playback is always delegated to UADE.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive the module name)
 */
export function parseDesireFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);

  if (!isDesireFormat(buf)) {
    throw new Error('Not a Desire module');
  }

  // ── Module name from filename ─────────────────────────────────────────────

  const baseName = filename.split('/').pop() ?? filename;
  // Strip "DSR." prefix (case-insensitive)
  const moduleName = baseName.replace(/^dsr\./i, '').replace(/\.dsr$/i, '') || baseName;

  // ── Extract samples via opcode scanning ──────────────────────────────────

  const instruments: InstrumentConfig[] = [];
  const ptrs = scanDesireSamplePointers(buf);

  if (ptrs) {
    const { lengthsOff, offsetsOff, ruch, count } = ptrs;
    for (let i = 0; i < count; i++) {
      const lengthWord = u16BE(buf, lengthsOff + i * 2);
      const offsetWord = u16BE(buf, offsetsOff + i * 2);
      const pcmOffset = offsetWord << ruch;
      const pcmLength = lengthWord * 2;

      if (pcmOffset + pcmLength <= buf.length && pcmLength > 0) {
        const pcm = buf.slice(pcmOffset, pcmOffset + pcmLength);
        instruments.push(createSamplerInstrument(
          i + 1, '', pcm, 64, 8287, 0, 0,
        ));
      } else {
        instruments.push({
          id: i + 1, name: '', type: 'synth' as const,
          synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
        } as InstrumentConfig);
      }
    }
  }

  if (instruments.length === 0) {
    for (let i = 0; i < NUM_PLACEHOLDER_INSTRUMENTS; i++) {
      instruments.push({
        id: i + 1, name: '', type: 'synth' as const,
        synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
      } as InstrumentConfig);
    }
  }

  // ── Editable grid: the four voice streams of one song, decoded in place ──

  const grid = walkDesire(buf);
  const patterns = grid ? grid.patterns(filename, instruments.length) : [placeholderPattern(filename, instruments.length)];
  const layout: UADEPatternLayout = grid
    ? {
        formatId: 'desire',
        patternDataFileOffset: 0,
        bytesPerCell: 1,
        rowsPerPattern: DESIRE_ROWS,
        numChannels: 4,
        numPatterns: patterns.length,
        moduleSize: buffer.byteLength,
        encodeCell: encodeDesireCell,
        encodeOverStored: true,
        decodeCell: decodeDesireCell,
        getCellFileOffset: (p, r, c) => grid.at.get(`${p}:${r}:${c}`)?.off ?? -1,
        effectPatches: (p, r, c, cell) => {
          const it = grid.at.get(`${p}:${r}:${c}`);
          const patches: Array<[number, number]> = [];
          // The instrument is stream state (0x88 n): editing it rewrites the operand in force for this note and every note after it.
          if (it && it.instOff >= 0 && cell.instrument >= 1 && cell.instrument <= instruments.length && cell.instrument - 1 !== it.inst) {
            patches.push([it.instOff, cell.instrument - 1]);
          }
          return { patches, noteUnchanged: false };
        },
      }
    : ({
        formatId: 'desire', patternDataFileOffset: 0, bytesPerCell: 4, rowsPerPattern: 64, numChannels: 4, numPatterns: 1,
        moduleSize: buffer.byteLength, encodeCell: encodeMODCell, decodeCell: decodeMODCell,
      } as UADEPatternLayout);

  return {
    name: `${moduleName} [Desire]`,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions: patterns.map((_, i) => i),
    songLength: patterns.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadePatternLayout: layout,
  };
}

// ── Command-stream walk (spec sections 2 and 4) ─────────────────────────────

const DESIRE_ROWS = 64;
/** Operand byte counts of the commands that have any; every other byte >= 0x80 has none. */
const OPERANDS: Record<number, number> = { 0x80: 1, 0x81: 1, 0x84: 1, 0x85: 5, 0x86: 1, 0x87: 2, 0x88: 1, 0x8a: 1, 0x8b: 1, 0x8c: 1, 0x8f: 2 };
const VOICE_OFFSET = [0, 0x20, 0x3f, 0x5e]; // T offset of voice v (asm 0x1f4-0x204)

interface DesireItem { off: number; ticks: number; note: number; inst: number; instOff: number }

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** Stream pointer table W (u16 BE file offsets) and song table T (u8): the 2nd and 1st 0x47FA lea after the Play entry 0x49FA. */
function findStreamTables(buf: Uint8Array): { t: number; w: number } | null {
  let play = -1;
  for (let p = 72; p + 1 < 472 && p + 1 < buf.length; p += 2) if (u16BE(buf, p) === 0x49FA) { play = p; break; }
  if (play < 0) return null;
  const leas: number[] = [];
  for (let p = play + 2; p + 3 < buf.length && p < play + 0x400 && leas.length < 2; p += 2) {
    if (u16BE(buf, p) === 0x47FA) leas.push(p + 2 + s16BE(buf, p + 2));
  }
  return leas.length === 2 ? { t: leas[0], w: leas[1] } : null;
}

/** One voice from its start to the first terminator: a note/rest per item; loops are read once (shortcut: not expanded). */
function decodeStream(buf: Uint8Array, start: number): DesireItem[] {
  const items: DesireItem[] = [];
  let pos = start, dur = 1, inst = -1, instOff = -1, loop = -1;
  while (pos < buf.length && items.length < 20000) {
    const b = buf[pos];
    if (b < 0x80) { items.push({ off: pos, ticks: dur, note: b, inst, instOff }); pos++; continue; }
    if (b === 0x80) dur = Math.max(1, buf[pos + 1]);
    else if (b === 0x81) loop = buf[pos + 1];
    else if (b === 0x88) { inst = buf[pos + 1]; instOff = pos + 1; }
    else if (b === 0x82 && loop <= 0) break; // endless loop (or none open): the stream ends here
    else if (b === 0x83 || b === 0x8c || b === 0x8d) break;
    pos += 1 + (OPERANDS[b] ?? 0);
  }
  return items;
}

function walkDesire(buf: Uint8Array) {
  const tab = findStreamTables(buf);
  if (!tab) return null;
  // First song with a note on any voice (UADE also skips the silent song 1).
  for (let song = 1; song < 32; song++) {
    const voices: DesireItem[][] = [];
    for (let v = 0; v < 4; v++) {
      const w = buf[tab.t + VOICE_OFFSET[v] + song];
      const start = tab.w + 2 * w < buf.length - 1 ? u16BE(buf, tab.w + 2 * w) : 0;
      voices.push(start > 0 && start < buf.length ? decodeStream(buf, start) : []);
    }
    if (!voices.some((it) => it.some((x) => x.note > 0))) continue;
    const g = voices.flat().reduce((a, x) => gcd(a, x.ticks), 0) || 1;
    const rowsOf = voices.map((it) => it.reduce((a, x) => a + x.ticks / g, 0));
    const total = Math.max(...rowsOf);
    const count = Math.max(1, Math.ceil(total / DESIRE_ROWS));
    const at = new Map<string, DesireItem>();
    voices.forEach((its, v) => {
      let row = 0;
      for (const it of its) {
        at.set(`${Math.floor(row / DESIRE_ROWS)}:${row % DESIRE_ROWS}:${v}`, it);
        row += it.ticks / g;
      }
    });
    return {
      at,
      ticksPerRow: g,
      patterns: (filename: string, instrumentCount: number) => buildPatterns(at, count, filename, instrumentCount),
    };
  }
  return null;
}

function emptyRow() {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

function buildPatterns(at: Map<string, DesireItem>, count: number, filename: string, instrumentCount: number) {
  return Array.from({ length: count }, (_, p) => ({
    id: `pattern-${p}`,
    name: `Pattern ${p}`,
    length: DESIRE_ROWS,
    channels: Array.from({ length: 4 }, (_c, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null,
      color: null,
      rows: Array.from({ length: DESIRE_ROWS }, (_r, r) => {
        const it = at.get(`${p}:${r}:${ch}`);
        if (!it || it.note === 0) return emptyRow();
        return { ...emptyRow(), ...decodeDesireCell(new Uint8Array([it.note])), instrument: it.inst >= 0 ? it.inst + 1 : 0 };
      }),
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const,
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: 4,
      originalPatternCount: count,
      originalInstrumentCount: instrumentCount,
    },
  }));
}

function placeholderPattern(filename: string, instrumentCount: number) {
  return buildPatterns(new Map(), 1, filename, instrumentCount)[0];
}
