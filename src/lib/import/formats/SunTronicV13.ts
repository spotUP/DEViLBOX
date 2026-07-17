/**
 * SunTronicV13.ts — SunTronic V1.3 "Delirium module" hunk/score codec.
 *
 * The V1.3 generation (public/data/songs/formats/SUNTronicTunes/) is a 2-hunk
 * AmigaOS executable: hunk#0 = 436-byte DeliTracker wrapper ("DELIRIUM"
 * signature + "$VER: SunTronic music module V1.3"), hunk#1 = CHIP hunk with
 * the replayer code AND the per-song score fused into one blob.
 *
 * This module is the SINGLE SOURCE OF TRUTH for the V1.3 byte layout:
 *  - AmigaOS hunk walker (parseHunks) — also re-exported to the Phase 1 probe
 *    tools in tools/suntronic-re/ (they import from here; no duplicate).
 *  - Detection (isSunTronicV13Format).
 *  - Two-delta shift recovery from the 7 hunk#0→hunk#1 anchor pointers.
 *  - Track command-stream grammar (SUN_CMD_ARGC / sunCommandLen) and the
 *    carrier block decoder (decodeSunBlock) per the Rob Hubbard recipe
 *    (docs/FORMAT_COMMAND_STREAM_GRID.md).
 *  - Score structure walk (parseSunTronicV13Score): subsong table, sequences,
 *    instrument tables, unique track blocks with byte-exact carriers.
 *
 * Byte-level ground truth: thoughts/shared/research/2026-07-13_suntronic-v13-score-layout.md
 * (every offset below traces to a Phase 1 probe P1/P2/P4).
 *
 * NOTE: this file must stay free of runtime imports (type-only imports OK) so
 * the tools/suntronic-re/ tsx scripts can import it directly.
 */

import type { TrackerCell } from '@/types';
import type { VariableLengthEncoder } from '@/engine/uade/UADEPatternEncoder';
import type { SunTronicConfig } from '@typedefs/sunTronicInstrument';

// ── Binary helpers ──────────────────────────────────────────────────────────

export function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

export function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

/** Signed 16-bit big-endian read. */
export function s16BE(buf: Uint8Array, off: number): number {
  const v = u16BE(buf, off);
  return v >= 0x8000 ? v - 0x10000 : v;
}

/** Signed 8-bit read. */
export function s8(buf: Uint8Array, off: number): number {
  const v = buf[off] & 0xff;
  return v < 128 ? v : v - 256;
}

// ── AmigaOS hunk executable walker ──────────────────────────────────────────

export interface HunkBlock {
  /** hunk index */
  index: number;
  /** hunk content type (HUNK_CODE / HUNK_DATA / HUNK_BSS) */
  hunkType: number;
  /** memory flags from the size table (bits 30/31 of the size longword) */
  memFlags: number;
  /** declared size in bytes (size table entry * 4) */
  declaredSize: number;
  /** file offset of the code/data payload (after the HUNK_CODE/DATA header) */
  fileOffset: number;
  /** payload length in bytes (code-longword count * 4) */
  length: number;
  /** payload bytes */
  data: Uint8Array;
  /** RELOC32 entries: map targetHunk -> offsets (hunk-relative) */
  reloc32: Map<number, number[]>;
}

export interface HunkFile {
  numHunks: number;
  /** index of the first hunk (header `firstHunk` field, virtually always 0) */
  firstHunk: number;
  hunks: HunkBlock[];
}

export const HUNK_HEADER = 0x3f3;
export const HUNK_CODE = 0x3e9;
export const HUNK_DATA = 0x3ea;
export const HUNK_BSS = 0x3eb;
export const HUNK_RELOC32 = 0x3ec;
export const HUNK_END = 0x3f2;

/** Parse an AmigaOS hunk executable. Throws on structural violations. */
export function parseHunks(buf: Uint8Array): HunkFile {
  let pos = 0;
  if (u32BE(buf, pos) !== HUNK_HEADER) throw new Error('not a hunk executable');
  pos += 4;
  // resident library names (should be empty)
  while (u32BE(buf, pos) !== 0) {
    const nameLongs = u32BE(buf, pos);
    pos += 4 + nameLongs * 4;
  }
  pos += 4;
  const tableSize = u32BE(buf, pos); pos += 4;
  const firstHunk = u32BE(buf, pos); pos += 4;
  const lastHunk = u32BE(buf, pos); pos += 4;
  const numHunks = lastHunk - firstHunk + 1;
  if (numHunks !== tableSize) throw new Error('hunk table size mismatch');
  const sizeEntries: { memFlags: number; size: number }[] = [];
  for (let i = 0; i < numHunks; i++) {
    const v = u32BE(buf, pos); pos += 4;
    sizeEntries.push({ memFlags: v >>> 30, size: (v & 0x3fffffff) * 4 });
  }

  const hunks: HunkBlock[] = [];
  let hunkIndex = 0;
  while (pos < buf.length && hunkIndex < numHunks) {
    // The type longword may carry MEMF_* flags in its top 2 bits (some linkers
    // duplicate the size-table memflag here). Keep the RAW longword so the
    // writer reproduces it byte-exact; mask only for the type comparison.
    const rawType = u32BE(buf, pos); pos += 4;
    const type = rawType & 0x3fffffff;
    if (type === HUNK_CODE || type === HUNK_DATA) {
      const longs = u32BE(buf, pos); pos += 4;
      const fileOffset = pos;
      const length = longs * 4;
      const data = buf.slice(pos, pos + length);
      pos += length;
      hunks.push({
        index: hunkIndex,
        hunkType: rawType,
        memFlags: sizeEntries[hunkIndex].memFlags,
        declaredSize: sizeEntries[hunkIndex].size,
        fileOffset,
        length,
        data,
        reloc32: new Map(),
      });
    } else if (type === HUNK_BSS) {
      pos += 4; // size longword, no payload
      hunks.push({
        index: hunkIndex,
        hunkType: rawType,
        memFlags: sizeEntries[hunkIndex].memFlags,
        declaredSize: sizeEntries[hunkIndex].size,
        fileOffset: pos,
        length: 0,
        data: new Uint8Array(0),
        reloc32: new Map(),
      });
    } else if (type === HUNK_RELOC32) {
      const cur = hunks[hunks.length - 1];
      if (!cur) throw new Error('RELOC32 before first hunk');
      for (;;) {
        const count = u32BE(buf, pos); pos += 4;
        if (count === 0) break;
        const target = u32BE(buf, pos); pos += 4;
        const offs: number[] = [];
        for (let i = 0; i < count; i++) { offs.push(u32BE(buf, pos)); pos += 4; }
        const prev = cur.reloc32.get(target) ?? [];
        cur.reloc32.set(target, prev.concat(offs));
      }
      continue; // reloc belongs to current hunk; do not advance hunkIndex
    } else if (type === HUNK_END) {
      hunkIndex++;
      continue;
    } else {
      throw new Error(`unsupported hunk type 0x${type.toString(16)} at ${pos - 4}`);
    }
  }
  return { numHunks, firstHunk, hunks };
}

/**
 * Serialize a {@link HunkFile} back to an AmigaOS hunk executable — the exact
 * byte-inverse of {@link parseHunks}. `writeHunks(parseHunks(buf))` reproduces
 * `buf` byte-for-byte for the SunTronic V1.3 corpus (see the round-trip oracle
 * in tools/suntronic-re/probe-hunk-writer.ts and sunTronicV13Template.test.ts).
 *
 * RELOC32 blocks are emitted in the reloc map's insertion order (which
 * parseHunks builds in file order), one block per target, so a module whose
 * targets appear once each (the V1.3 shape) round-trips exactly.
 */
export function writeHunks(hf: HunkFile): Uint8Array {
  const out: number[] = [];
  const w32 = (v: number): void => {
    out.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
  };
  w32(HUNK_HEADER);
  w32(0); // resident library names: empty (null terminator)
  w32(hf.numHunks); // table size
  w32(hf.firstHunk); // first hunk
  w32(hf.firstHunk + hf.numHunks - 1); // last hunk
  for (const h of hf.hunks) {
    w32(((h.memFlags & 0x3) << 30) | ((h.declaredSize >>> 2) & 0x3fffffff));
  }
  for (const h of hf.hunks) {
    w32(h.hunkType);
    if ((h.hunkType & 0x3fffffff) === HUNK_BSS) {
      w32(h.declaredSize >>> 2); // size longword, no payload
    } else {
      w32(h.length >>> 2);
      for (let i = 0; i < h.length; i++) out.push(h.data[i]);
    }
    if (h.reloc32.size > 0) {
      w32(HUNK_RELOC32);
      for (const [target, offs] of h.reloc32) {
        w32(offs.length);
        w32(target);
        for (const o of offs) w32(o);
      }
      w32(0); // reloc block-list terminator
    }
    w32(HUNK_END);
  }
  return new Uint8Array(out);
}

// ── Detection ───────────────────────────────────────────────────────────────

const V13_VER_MARKER = '$VER: SunTronic music module';

/** Case-sensitive ASCII scan for `needle` in buf within [from, to). */
function findAscii(buf: Uint8Array, needle: string, from: number, to: number): number {
  const n = needle.length;
  const limit = Math.min(to, buf.length) - n;
  for (let i = from; i <= limit; i++) {
    let ok = true;
    for (let j = 0; j < n; j++) {
      if (buf[i + j] !== needle.charCodeAt(j)) { ok = false; break; }
    }
    if (ok) return i;
  }
  return -1;
}

/**
 * True when the buffer is a SunTronic V1.3 "Delirium module":
 *   - HUNK_HEADER (0x3F3) at offset 0,
 *   - hunk#0 guard `moveq #-1,d0; rts` + 'DELIRIUM' tag at file offset 0x24,
 *   - '$VER: SunTronic music module' version string in the wrapper.
 */
export function isSunTronicV13Format(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < 0x120) return false;
  if (u32BE(buf, 0) !== 0x000003f3) return false;
  if (u32BE(buf, 0x24) !== 0x70ff4e75) return false; // moveq #-1,d0 / rts
  if (findAscii(buf, 'DELIRIUM', 0x28, 0x30) < 0) return false;
  return findAscii(buf, V13_VER_MARKER, 0x24, 0x120) >= 0;
}

/**
 * The AmigaDOS directory the replayer prepends to sampled-instrument
 * basenames, read from the module's embedded path constant (e.g. `instr/`).
 * The module stores exactly one null-terminated printable string ending in
 * `/` — a directory, distinct from the sample basenames (which have no `/`)
 * and from `dos.library`. Verified across the whole V1.3 corpus (100/100
 * sampled modules carry a single `instr/` prefix). Returns '' if none is
 * present (a module with no external samples).
 */
function sunTronicSampleDir(buf: Uint8Array): string {
  let s = '';
  for (let i = 0; i < buf.length; i++) {
    const c = buf[i];
    if (c >= 0x20 && c <= 0x7e) {
      s += String.fromCharCode(c);
      if (s.length > 40) s = ''; // runaway — not a short path constant
      continue;
    }
    if (c === 0 && s.length >= 2 && s.endsWith('/') &&
        !s.includes(':') && !s.includes(' ') && !s.toLowerCase().endsWith('.library/')) {
      return s;
    }
    s = '';
  }
  return '';
}

/**
 * Relative paths of the external sampled-instrument files a V1.3 module opens
 * at runtime via dos.library, e.g. `['instr/perc1.x', 'instr/perc2.x']`.
 *
 * The module stores the sample basenames in its name block and the containing
 * directory as a separate embedded path constant; the replayer opens
 * `<dir><basename>`. `dos.library` is already excluded from `instrumentNames`
 * (it is an OS library, not a companion). Returns [] for non-V1.3 buffers or
 * modules with no external samples.
 *
 * SINGLE SOURCE OF TRUTH for which sidecars the in-app UADE virtual FS must be
 * pre-populated with (UADE writes them at `/uade/<relpath>`, matching the
 * replayer's open) so the sampled channels are audible — the built-in/server
 * file browser has no prefix-based companion scheme for the SunTronic `instr/`
 * subdir (see fetchCompanionFiles).
 */
export function sunTronicCompanionPaths(buffer: ArrayBuffer | Uint8Array): string[] {
  if (!isSunTronicV13Format(buffer)) return [];
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let score: SunV13Score;
  try {
    score = parseSunTronicV13Score(buf);
  } catch {
    return [];
  }
  if (score.instrumentNames.length === 0) return [];
  const dir = sunTronicSampleDir(buf);
  return score.instrumentNames.map((name) => dir + name);
}

// ── Track command-stream grammar ────────────────────────────────────────────
//
// One stream per (position, voice). The replayer fetches bytes once per row
// until a 0x00 terminator (layout spec §5):
//   0x00        end of row
//   0x01-0x3F   select sampled instrument index-1 (table of 0x1C records)
//   0x40-0x7F   select synth instrument index & 0x3F (table of 0x24 records)
//   0x8B-0x9C   command + 0-2 argument bytes (SUN_CMD_ARGC)
//   0xB8-0xFF   note (pitch = ~byte & 0xFF), MAY be followed by one
//               instrument byte (0x01-0x7F)
//   others      invalid — never emitted (0 occurrences in 199 modules)

/** Command byte → argument byte count (disassembly of handlers hunk1+0x89E-0xA1A).
 *  NOTE: 0x9a and 0x9b widths here are the DEFAULT (Main-variant) values; the real
 *  width is driver-variant-dependent and is overridden in sunCommandLen from the
 *  per-score {@link SunCmdWidths}. Do NOT read these two entries directly for length
 *  — always go through sunCommandLen so the variant override applies. */
export const SUN_CMD_ARGC: Record<number, number> = {
  0x9c: 1, // set effect/arpeggio selector (voice+0x0E)
  0x9b: 2, // pitch offset — WORD (Main) or 1 sign-ext byte (Version-A); see SunCmdWidths
  0x9a: 1, // volume slide — 1 byte, +1 rate byte when volSlideRateFromStream; see SunCmdWidths
  0x99: 1, // set volume (voice+0x0C)
  0x98: 1, // set speed (ticks/row), ALL voices
  0x97: 2, // filter/control word (a6+0xA7C, eor #$7E28)
  0x96: 0, // restart volume envelope
  0x95: 0, // restart frequency envelope
  0x94: 1, // set pitch without retrigger (~arg - transpose)
  0x93: 2, // global fade: speed + reload (a6+0xA6E/0xA70)
  0x92: 1, // master volume (a6+0xA71)
  0x91: 1, // per-voice DMA/mute flags (voice+0x38/0x39)
  0x90: 1, // set finetune (voice+0x09)
  0x8f: 1, // set speed, THIS voice only
  0x8e: 2, // CIA tempo word (a6+0xA80 + SetTimer)
  0x8d: 2, // tempo slide word (a6+0xA82)
  0x8c: 1, // rows/position, ALL voices
  0x8b: 1, // rows/position, THIS voice
};

/** Driver-variant-dependent operand widths. Two control opcodes read a different
 *  number of stream bytes depending on which SunTronic player variant compiled the
 *  module — the SAME split the audio player applies in controlOpcode. Getting these
 *  wrong desyncs the grid decode from the player mid-stream (grid stops a group
 *  early → misses later notes = invisible "ghost" notes). Single source of truth
 *  for length: the grid walk (SunTronicParser) and the carrier decoder (decodeSunBlock)
 *  BOTH consume the stream through sunCommandLen with these widths. */
export interface SunCmdWidths {
  /** 0x9b pitch-slide operand: WORD (2 bytes) when arpShift>=4 (Main variant),
   *  else 1 sign-extended byte (Version-A). Mirrors controlOpcode 0x9b. */
  arpShift: number;
  /** 0x9a vol-slide: reads a 2nd stream byte (slide rate $32) when true; when false
   *  the rate is hardwired to 1 and no 2nd byte is read. Mirrors controlOpcode 0x9a. */
  volSlideRateFromStream: boolean;
}

/**
 * Number of stream bytes the item starting at `pos` occupies.
 * The ONLY place the wire grammar's byte-consumption lives.
 * `default: 1` — an unknown byte consumes itself, never desyncs.
 * `widths` supplies the two variant-dependent operand widths (0x9a/0x9b); it must
 * match the audio player's controlOpcode for the grid and player to stay in sync.
 */
export function sunCommandLen(buf: Uint8Array, pos: number, widths: SunCmdWidths): number {
  const b = buf[pos];
  if (b >= 0xb8) {
    // note byte; MAY be followed by one instrument byte (0x01-0x7F)
    const nxt = pos + 1 < buf.length ? buf[pos + 1] : 0;
    return (nxt >= 0x01 && nxt <= 0x7f) ? 2 : 1;
  }
  if (b === 0x9b) return 1 + (widths.arpShift >= 4 ? 2 : 1);   // WORD (Main) vs 1 byte (Version-A)
  if (b === 0x9a) return 1 + (widths.volSlideRateFromStream ? 2 : 1); // +rate byte variant
  if (b >= 0x8b && b <= 0x9c) return 1 + SUN_CMD_ARGC[b];
  return 1; // 0x00 terminator, instrument selects 0x01-0x7F, unknown bytes
}

// ── Carrier block decoder (Rob Hubbard recipe §3) ───────────────────────────

/** Hard ceiling on rows per stream block: rows/position is a byte (max 255). */
export const SUN_MAX_BLOCK_ROWS = 255;

export interface SunBlockDecode {
  /** One carrier cell per stream item (event or 0x00 row terminator). */
  rows: TrackerCell[];
  /** Bytes consumed from `start` (whole grammatical rows). */
  byteSize: number;
  /** Number of note events in the block. */
  noteCount: number;
  /** Number of grammar rows (0x00 terminators consumed). */
  rowCount: number;
}

/**
 * Decode one track stream block from `start` up to `limit` (the next block's
 * start, or hunk#1 end) into carrier cells, one per stream item.
 *
 * Carriers stash the item's EXACT source bytes:
 *   cell.cutoff    = item length (1-3)
 *   cell.period    = byte 0
 *   cell.pan       = byte 1   (when length >= 2)
 *   cell.resonance = byte 2   (when length >= 3)
 * (TrackerCell has no `cutoff2`; the third-byte carrier uses the `resonance`
 * automation lane — like cutoff/pan it is ignored by cellFieldsEqual, so the
 * verbatim-when-unedited helper still works.)
 *
 * Display fields (note/instrument) are cosmetic; the carriers make the
 * round-trip byte-exact regardless of the note mapping.
 *
 * Streams may parse past `limit` by a shared 0x00 terminator (track pointers
 * alias the previous stream's final byte — observed corpus-wide, always <= 1
 * byte); the final row is completed so blocks always cover whole rows.
 */
export function decodeSunBlock(h1: Uint8Array, start: number, limit: number, widths: SunCmdWidths): SunBlockDecode {
  const rows: TrackerCell[] = [];
  let pos = start;
  let noteCount = 0;
  let rowCount = 0;
  let curInstr = 0;
  while (pos < limit && rowCount < SUN_MAX_BLOCK_ROWS) {
    // parse one whole grammar row (events until 0x00), even past `limit`
    for (;;) {
      if (pos >= h1.length) return { rows, byteSize: pos - start, noteCount, rowCount };
      const b = h1[pos];
      const len = sunCommandLen(h1, pos, widths);
      if (pos + len > h1.length) return { rows, byteSize: h1.length - start, noteCount, rowCount };

      let note = 0;
      let instrument = 0;
      if (b >= 0xb8) {
        noteCount++;
        note = sunPitchToNote((~b) & 0xff);
        if (len >= 2) curInstr = sunSelectToInstrument(h1[pos + 1]);
        instrument = curInstr;
      } else if (b >= 0x01 && b <= 0x7f) {
        curInstr = sunSelectToInstrument(b);
        instrument = curInstr;
      }

      const cell: TrackerCell = {
        note: note as TrackerCell['note'],
        instrument: instrument as TrackerCell['instrument'],
        volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
        cutoff: len,
        period: h1[pos],
      };
      if (len >= 2) cell.pan = h1[pos + 1];
      if (len >= 3) cell.resonance = h1[pos + 2];
      rows.push(cell);

      pos += len;
      if (b === 0x00) break; // end of row
    }
    rowCount++;
  }
  return { rows, byteSize: pos - start, noteCount, rowCount };
}

/**
 * Map a raw stream pitch (0x00-0x47, from `~noteByte`) to a tracker note.
 * Offset 13 places raw 0 at C-1 (display convention; carriers keep the raw
 * byte so this mapping never affects the round-trip).
 */
export function sunPitchToNote(rawPitch: number): number {
  const n = rawPitch + 13;
  return (n >= 1 && n <= 96) ? n : 0;
}

/**
 * Map an instrument-select stream byte to a display instrument number.
 * Sampled selects (0x01-0x3F) are 1-based record indices used directly;
 * synth selects (0x40-0x7F) are offset past the sampled range so both
 * families stay distinct in the grid (display-only mapping).
 */
export function sunSelectToInstrument(selectByte: number): number {
  if (selectByte >= 0x40) return SUN_SYNTH_INSTRUMENT_BASE + (selectByte & 0x3f);
  return selectByte;
}

/** Display instrument ids >= this are synth-table instruments. */
export const SUN_SYNTH_INSTRUMENT_BASE = 0x40;

// ── Score structure walk ────────────────────────────────────────────────────

/** Reference (mule.src) hunk#1 offsets — shifted per module by deltaA/deltaB. */
const REF_INIT = 0x1b0;          // init entry (deltaA anchor, lowest hunk#0 pointer)
const REF_INSTR_TABLE = 0xd9e;   // subsong table (deltaB anchor, highest hunk#0 pointer)
const REF_A6_BASE = 0x318;       // workspace base: lea $318(pc)-equivalent in code A
const REF_SYNTH_LEA = 0x1b6;     // displacement word of `lea synthTable(pc),a0` (opcode 0x41FA at 0x1B4)
const REF_SAMPLED_LEA = 0x1ba;   // displacement word of `lea sampledTable(pc),a1` (opcode 0x43FA at 0x1B8)
const REF_ROWSPOS_OP = 0x386;    // `move.b #imm,$31(a2)` — imm byte at +3 is default rows/position

// PERIODS is a replayer-CONSTANT 320-word ramp inside the player code block. That
// block relocates by the score-data size, NOT by deltaA (the init-code shift), so
// `REF_A6_BASE + deltaA + off` mislocates it on modules where the two deltas
// diverge (e.g. ballblaser). Instead, locate PERIODS by its unique ramp signature
// (identical bytes in every module); the match points at table[0x20].
const REF_PERIODS_SIG = [428, 453, 480, 508, 538, 570, 604, 640];
const REF_PERIODS_SIG_INDEX = 0x20;   // signature sits at PERIODS index 0x20

// The drin note-transpose (arp) table IS plain module data in hunk#1 — NOT runtime
// BSS-generated (an earlier comment claimed the eagleplayer allocates it; that was
// wrong, proven by per-tick Paula-log lockstep). The EFFECTS arp handler reaches it
// with `lea drin(pc),a3` (opcode 0x47FA) immediately followed by `clr.w d5;
// move.b 0x0e(a0),d5` = bytes 42 45 1A 28 00 0E, then the index shift `lsl.w #n,d5`.
// drinOff = (siteOff+2) + s16BE(siteOff+2). The shift word 5 words on selects the
// driver version: 0xE94D = lsl.w #4 (256-byte drin, phase&0x0f, "Main"); 0xE74D =
// lsl.w #3 (128-byte drin, phase&0x07, "Version-A"). Verified 321/321 modules.
const REF_DRIN_SIG = [0x42, 0x45, 0x1a, 0x28, 0x00, 0x0e]; // clr.w d5; move.b 0x0e(a0),d5
const DRIN_SHIFT_MAIN = 0xe94d;   // lsl.w #4,d5  → 256-byte drin, phase mask 0x0f
const DRIN_SHIFT_VERSA = 0xe74d;  // lsl.w #3,d5  → 128-byte drin, phase mask 0x07

const SAMPLED_RECORD_SIZE = 0x1c;
const SYNTH_RECORD_SIZE = 0x24;
const SEQ_ENTRY_SIZE = 0x14;
const MAX_SUBSONGS = 52;         // fixed 52-slot subsong table area
const MAX_SEQ_ENTRIES = 4096;

/**
 * Sampled (type-B) instrument descriptor (0x1C-byte record). The front 0x00-0x11
 * is byte-identical in structure to a synth record's env/vib block (proven from
 * the Andy Silva replayer source — EFFECTS reads 4(A1)/6(A1)/8(A1)/… the same for
 * both record types, and GNN8 @0x26a16 sets $14=0 so the SHARED EFFECTS runs).
 * Field names MIRROR `SunSynthInstrument` (volEnv/freqEnv + `vibDepth`) so one
 * structural type drives `stepEffects` for both. Offsets 0x12-0x1B are the
 * sampled-only fields (sample slot + length/loop) that Paula plays directly.
 */
export interface SunSampledInstrument {
  /** hunk#1-relative offset of the 0x1C-byte record */
  recordOff: number;
  /** volume-envelope table ptr ($00, RELOC32) */
  volEnvOff: number;
  /** volume-envelope length/loop ($04/$06; EFFECTS 4(A1)/6(A1) wrap) */
  volEnvLen: number;
  volEnvLoop: number;
  /** vibrato-depth table ptr + length/loop + speed ($08/$0c/$0e/$10) */
  freqEnvOff: number;
  freqEnvLen: number;
  freqEnvLoop: number;
  freqEnvSpeed: number;
  /** index into the 50-slot external sample table (on-disk value at +0x12) */
  slotIndex: number;
  /** sample length in words ($16) */
  lengthWords: number;
  /** loop start in words ($18) */
  loopStartWords: number;
  /** loop length in words ($1a); 1 word = one-shot, >= length = full loop */
  loopLenWords: number;
  /** vol-env table bytes (volEnvLen+1, read unsigned) */
  volEnv: Int8Array;
  /** vibrato-depth table bytes (freqEnvLen+1, signed) */
  vibDepth: Int8Array;
}

/**
 * Synth-instrument descriptor (0x24-byte record). Field semantics recovered
 * from the Andy Silva replayer source
 * (`docs/formats/Replayers/DeliPlayers/AndySilva/DP_Suntronic.s`):
 * GNN2 synth-select @543-566, MEGAEFFECTS render @594-763, EFFECTS env @415-496.
 * All pointer fields are hunk#1-relative (RELOC32 targets); resolved wave/arp/
 * envelope byte arrays are sliced from hunk#1 for the native voice engine.
 */
export interface SunSynthInstrument {
  /** hunk#1-relative offset of the 0x24-byte record */
  recordOff: number;
  /** volume-envelope table ptr + length/loop (EFFECTS 4(A1)/6(A1) wrap) */
  volEnvOff: number;
  volEnvLen: number;
  volEnvLoop: number;
  /** frequency-envelope table ptr + length/loop + speed */
  freqEnvOff: number;
  freqEnvLen: number;
  freqEnvLoop: number;
  freqEnvSpeed: number;
  /** interp/arp table ptr + length/loop (MEGAEFFECTS A1+0x12, idx=voice+0x12) */
  arpTableOff: number;
  arpLen: number;
  arpLoop: number;
  /** waveform pointer 1 / 2 (MEGAEFFECTS A3 / A4) */
  wave1Off: number;
  wave2Off: number;
  /** wave length in words (D4 = waveWordLen*2 - 1 bytes) */
  waveWordLen: number;
  /** synthesis type 0..3+ (MEGAEFFECTS branch selector at record+0x23) */
  synthType: number;
  /** resolved waveform bytes (signed 8-bit, waveWordLen*2 each) */
  wave1: Int8Array;
  wave2: Int8Array;
  /**
   * Type-5 scannable sample window (handler @0x26f2e: play buffer =
   * `*(record+0x1a) + 2*arp`, length record+0x22 words). Unlike types 0/2/3 the
   * type-5 wave is a longer PCM sample the arp value scans as a byte offset, so
   * `wave1` (the arp=0 window only) is insufficient. `sampleData` holds the full
   * window covering every arp in this record's table; `sampleZero` is the byte
   * index within it corresponding to arp=0 (>0 when negative arps reach back).
   * Empty for non-type-5 records (wave1Off is packed params for type 6).
   */
  sampleData: Int8Array;
  sampleZero: number;
  /** resolved interp/arp table bytes (signed 8-bit, arpLen entries) */
  arpTable: Int8Array;
  /** volume-envelope table bytes (record+0x00, volEnvLen entries; read unsigned) */
  volEnv: Int8Array;
  /** vibrato-depth table bytes (record+0x08, freqEnvLen entries; signed) */
  vibDepth: Int8Array;
}

/**
 * Decode one 0x24-byte synth record at `recordOff` into a descriptor and slice
 * its wave/arp table data out of `h1`. Pointer/length fields are read verbatim;
 * table slices are clamped to the hunk bounds (a corrupt/short pointer yields an
 * empty slice rather than throwing — the record still round-trips byte-exactly).
 */
export function decodeSunSynthInstrument(h1: Uint8Array, recordOff: number): SunSynthInstrument {
  const sliceI8 = (off: number, len: number): Int8Array => {
    if (off <= 0 || len <= 0 || off >= h1.length) return new Int8Array(0);
    const end = Math.min(off + len, h1.length);
    return new Int8Array(h1.buffer.slice(h1.byteOffset + off, h1.byteOffset + end));
  };
  const waveWordLen = h1[recordOff + 0x22] ?? 0;
  const arpLen = u16BE(h1, recordOff + 0x16);
  const wave1Off = u32BE(h1, recordOff + 0x1a);
  const wave2Off = u32BE(h1, recordOff + 0x1e);
  const arpTableOff = u32BE(h1, recordOff + 0x12);
  const synthType = h1[recordOff + 0x23] ?? 0;

  // Type-5 scannable sample: window h1 from wave1Off covering every arp offset
  // (2*arp bytes) this record's table can reach, plus the wwl*2 play window.
  let sampleData = new Int8Array(0);
  let sampleZero = 0;
  if (synthType === 5 && wave1Off > 0 && wave1Off < h1.length) {
    const arps = arpLen > 0 ? Array.from(sliceI8(arpTableOff, arpLen)) : [0];
    const minArp = arps.length ? Math.min(...arps) : 0;
    const maxArp = arps.length ? Math.max(...arps) : 0;
    const byteLen = waveWordLen * 2;
    const lo = Math.max(0, wave1Off + 2 * Math.min(0, minArp));
    const hi = Math.min(h1.length, wave1Off + 2 * Math.max(0, maxArp) + byteLen);
    sampleData = Int8Array.from(h1.subarray(lo, hi));
    sampleZero = wave1Off - lo;
  }

  return {
    recordOff,
    volEnvOff: u32BE(h1, recordOff + 0x00),
    volEnvLen: u16BE(h1, recordOff + 0x04),
    volEnvLoop: u16BE(h1, recordOff + 0x06),
    freqEnvOff: u32BE(h1, recordOff + 0x08),
    freqEnvLen: u16BE(h1, recordOff + 0x0c),
    freqEnvLoop: u16BE(h1, recordOff + 0x0e),
    freqEnvSpeed: u16BE(h1, recordOff + 0x10),
    arpTableOff,
    arpLen,
    arpLoop: u16BE(h1, recordOff + 0x18),
    wave1Off,
    wave2Off,
    waveWordLen,
    synthType,
    wave1: sliceI8(wave1Off, waveWordLen * 2),
    wave2: sliceI8(wave2Off, waveWordLen * 2),
    sampleData,
    sampleZero,
    arpTable: sliceI8(arpTableOff, arpLen),
    // vol-env index (voice+0x10) runs 0..volEnvLen-1; vibrato-depth index
    // (voice+0x24) runs 0..freqEnvLen-1. Slice one extra byte as a bounds guard.
    volEnv: sliceI8(u32BE(h1, recordOff + 0x00), u16BE(h1, recordOff + 0x04) + 1),
    vibDepth: sliceI8(u32BE(h1, recordOff + 0x08), u16BE(h1, recordOff + 0x0c) + 1),
  };
}

/**
 * Serialize a runtime `SunSynthInstrument` to the plain, JSON-safe
 * `SunTronicConfig` the editor persists on `InstrumentConfig.sunTronic`. Drops
 * the h1-relative pointer offsets (irrelevant once the tables are sliced) and
 * mirrors the Int8Arrays as number[] (Int8Arrays corrupt to index-objects
 * through JSON — localStorage/IDB — so the persisted shape is plain numbers).
 *
 * Lives in the lib layer (not the engine) so both the parser and the native
 * synth voice consume it without a lib→engine import cycle.
 */
export function sunSynthToConfig(inst: SunSynthInstrument): SunTronicConfig {
  return {
    sunTronic: 1,
    synthType: inst.synthType,
    waveWordLen: inst.waveWordLen,
    arpLen: inst.arpLen,
    arpLoop: inst.arpLoop,
    volEnvLen: inst.volEnvLen,
    volEnvLoop: inst.volEnvLoop,
    freqEnvLen: inst.freqEnvLen,
    freqEnvLoop: inst.freqEnvLoop,
    freqEnvSpeed: inst.freqEnvSpeed,
    wave1: Array.from(inst.wave1),
    wave2: Array.from(inst.wave2),
    arpTable: Array.from(inst.arpTable),
    volEnv: Array.from(inst.volEnv),
    vibDepth: Array.from(inst.vibDepth),
    sampleData: Array.from(inst.sampleData),
    sampleZero: inst.sampleZero,
  };
}

/**
 * Reconstruct a render-ready `SunSynthInstrument` from a persisted config. The
 * renderer only reads the tables + lengths + types, so the pointer-offset fields
 * are filled with 0 (unused at render time).
 */
export function sunConfigToInstrument(cfg: SunTronicConfig): SunSynthInstrument {
  return {
    recordOff: 0,
    volEnvOff: 0, volEnvLen: cfg.volEnvLen, volEnvLoop: cfg.volEnvLoop,
    freqEnvOff: 0, freqEnvLen: cfg.freqEnvLen, freqEnvLoop: cfg.freqEnvLoop,
    freqEnvSpeed: cfg.freqEnvSpeed,
    arpTableOff: 0, arpLen: cfg.arpLen, arpLoop: cfg.arpLoop,
    wave1Off: 0, wave2Off: 0, waveWordLen: cfg.waveWordLen, synthType: cfg.synthType,
    wave1: Int8Array.from(cfg.wave1),
    wave2: Int8Array.from(cfg.wave2),
    arpTable: Int8Array.from(cfg.arpTable),
    volEnv: Int8Array.from(cfg.volEnv),
    vibDepth: Int8Array.from(cfg.vibDepth),
    sampleData: Int8Array.from(cfg.sampleData ?? []),
    sampleZero: cfg.sampleZero ?? 0,
  };
}

export interface SunSequenceEntry {
  /** per-voice track stream pointers (hunk1-relative) */
  trackPtrs: [number, number, number, number];
  /** per-voice note transpose (signed semitones, position metadata) */
  transposes: [number, number, number, number];
}

export interface SunSubsong {
  /** hunk#1-relative offset of the sequence start */
  sequenceOff: number;
  entries: SunSequenceEntry[];
  /** how the sequence terminates: first long 0 = restart, bit31 = stop */
  endKind: 'restart' | 'stop';
}

export interface SunTrackBlock {
  /** hunk#1-relative start of the stream */
  h1Offset: number;
  /** bytes the stream occupies (whole grammar rows) */
  byteSize: number;
  /** carrier cells, one per stream item (byte-exact source of truth) */
  rows: TrackerCell[];
  /** grammar rows in the block */
  rowCount: number;
  /** note events in the block */
  noteCount: number;
}

export interface SunV13Score {
  /** hunk#1 payload */
  h1: Uint8Array;
  /** file offset of the hunk#1 payload (all h1Offsets are file = h1FileOffset + off) */
  h1FileOffset: number;
  /** name-block shift (applies to hunk#1 offsets < control word) */
  deltaA: number;
  /** table/score shift (applies from the control word onward) */
  deltaB: number;
  /** end of the instrument-name string block at hunk#1+0 */
  nameBlockEnd: number;
  /** external instrument file names in slot order (dos.library excluded) */
  instrumentNames: string[];
  /** default rows per position (per-song code operand; runtime-mutable via 0x8C/0x8B) */
  rowsPerPositionDefault: number;
  /** hunk#1-relative offset of the PERIODS table[0] (signature-located, reloc-safe) */
  periodsOff: number;
  /** hunk#1-relative offset of the drin arp note-transpose table (signature-located) */
  drinOff: number;
  /** arp index shift: 4 = Main (256-byte drin, phase&0x0f), 3 = Version-A (128-byte, &0x07) */
  arpShift: number;
  /**
   * 0x9a vol-slide operand width, INDEPENDENT of arpShift (both variants exist at
   * arpShift=4). Signature-located from the 0x9a handler in the embedded player:
   *   `11 59 00 0d 11 59 00 32` (MOVE.B (A1)+,$0D; MOVE.B (A1)+,$32) → 2 stream bytes,
   *      slide rate ($32) read from the stream. → volSlideRateFromStream = true.
   *   `11 59 00 0d 11 7c 00 01 00 32` (MOVE.B (A1)+,$0D; MOVE.B #$1,$32) → 1 stream byte,
   *      slide rate hardwired to 1. → volSlideRateFromStream = false.
   * The rate gates a per-voice $32/$33 counter so the slide advances only every
   * (rate+1) ticks (embedded EFFECTS @kompo04.dis 0x6f4 / myplay9.dis 0x6ea).
   * Corpus: 74 modules 2-byte, 125 modules 1-byte, 0 ambiguous, 0 uncovered.
   */
  volSlideRateFromStream: boolean;
  /** sliced drin table (2^arpShift rows × 16 phases, s8 transpose per (arpSel,phase)) */
  drin: Int8Array;
  /** hunk#1-relative offset of the synth instrument table (0x24-byte records) */
  synthTableOff: number;
  /** hunk#1-relative offset of the sampled instrument table (0x1C-byte records) */
  sampledTableOff: number;
  /** sampled instrument records (null-long-terminated table) */
  sampledInstruments: SunSampledInstrument[];
  /** number of synth records ((sampledTableOff - synthTableOff) / 0x24) */
  synthInstrumentCount: number;
  /** decoded synth instrument records (0x24-byte, with resolved wave/arp data) */
  synthInstruments: SunSynthInstrument[];
  /** subsongs (null-terminated table at REF_INSTR_TABLE + deltaB) */
  subsongs: SunSubsong[];
  /** deduplicated track stream blocks, sorted by h1Offset */
  blocks: SunTrackBlock[];
  /** h1Offset → index into `blocks` */
  blockIndexByOffset: Map<number, number>;
}

/**
 * Parse the full V1.3 score structure from a module file.
 * Throws when a structural guard fails (module is then treated as play-only).
 */
export function parseSunTronicV13Score(buf: Uint8Array): SunV13Score {
  const hf = parseHunks(buf);
  if (hf.hunks.length !== 2) throw new Error(`SunTronic V1.3: expected 2 hunks, got ${hf.hunks.length}`);
  const h0 = hf.hunks[0];
  const h1 = hf.hunks[1].data;
  const h1FileOffset = hf.hunks[1].fileOffset;

  // ── two-delta shift recovery from the 7 hunk#0→hunk#1 anchor pointers ──
  const ptrs = (h0.reloc32.get(1) ?? []).map((off) => u32BE(h0.data, off)).sort((a, b) => a - b);
  if (ptrs.length !== 7) throw new Error(`SunTronic V1.3: expected 7 hunk#0 anchor pointers, got ${ptrs.length}`);
  const deltaA = ptrs[0] - REF_INIT;
  const deltaB = ptrs[6] - REF_INSTR_TABLE;

  // ── PERIODS: signature-locate the replayer ramp (reloc-safe, see const) ──
  let periodsOff = -1;
  for (let o = 0; o + REF_PERIODS_SIG.length * 2 <= h1.length; o += 2) {
    let ok = true;
    for (let i = 0; i < REF_PERIODS_SIG.length; i++) {
      if (((h1[o + i * 2] << 8) | h1[o + i * 2 + 1]) !== REF_PERIODS_SIG[i]) { ok = false; break; }
    }
    if (ok) { periodsOff = o - REF_PERIODS_SIG_INDEX * 2; break; }
  }
  if (periodsOff < 0) throw new Error('SunTronic V1.3: PERIODS table signature not found');

  // ── drin arp table: signature-locate the EFFECTS `lea drin(pc),a3` site ──
  let drinOff = -1, arpShift = 0;
  for (let i = 0; i + 12 <= h1.length; i += 2) {
    if (h1[i] !== 0x47 || h1[i + 1] !== 0xfa) continue; // lea d16(pc),a3
    let ok = true;
    for (let k = 0; k < REF_DRIN_SIG.length; k++) {
      if (h1[i + 4 + k] !== REF_DRIN_SIG[k]) { ok = false; break; }
    }
    if (!ok) continue;
    const off = (i + 2) + s16BE(h1, i + 2);
    const shiftWord = u16BE(h1, i + 10);
    const shift = shiftWord === DRIN_SHIFT_MAIN ? 4 : shiftWord === DRIN_SHIFT_VERSA ? 3 : 0;
    if (shift === 0 || off < 0 || off + (1 << shift) * 16 > h1.length) continue;
    drinOff = off; arpShift = shift; break;
  }
  if (drinOff < 0) throw new Error('SunTronic V1.3: drin arp table signature not found');
  // arpSel is a full byte — the 0x9c opcode reads a raw operand (0..255) — and the
  // replayer raw-indexes module RAM at d5 = (arpSel<<shift)+phase with NO bound.
  // Songs DO use arpSel > 15 (suntronic-k3/k4 arpSel=17 → index 136..143), so the
  // old 16-selector slice ((1<<shift)*16 = 128/256 bytes) truncated those indices
  // to out-of-range → zero arp offset → the arp sweep silently vanished. Extract the
  // full byte-arpSel span (256 selectors), bounded by hunk#1 (zero past the end —
  // high indices are only reachable where h1 is longer, matching UADE's raw read).
  const drin = new Int8Array(256 << arpShift); // 2048 Version-A / 4096 Main
  for (let i = 0; i < drin.length && drinOff + i < h1.length; i++) drin[i] = s8(h1, drinOff + i);

  // ── 0x9a vol-slide operand width: signature-locate the handler in the player code ──
  // Both handlers start MOVE.B (A1)+,$0D = `11 59 00 0d`; the next word distinguishes:
  //   11 59 (MOVE.B (A1)+,$32) → rate from a 2nd stream byte; 11 7c (MOVE.B #imm,$32) → rate=1.
  let volSlideRateFromStream = false;
  for (let i = 0; i + 6 <= h1.length; i += 2) {
    if (h1[i] === 0x11 && h1[i + 1] === 0x59 && h1[i + 2] === 0x00 && h1[i + 3] === 0x0d) {
      volSlideRateFromStream = h1[i + 4] === 0x11 && h1[i + 5] === 0x59;
      break;
    }
  }

  // ── instrument name block at hunk#1+0 ──
  const { names, nameBlockEnd } = parseNameBlock(h1);
  const instrumentNames = names.filter((n) => n.toLowerCase() !== 'dos.library');

  // ── per-song default rows/position: `move.b #imm,$31(a2)` at REF_ROWSPOS_OP+deltaA ──
  let rowsPerPositionDefault = 32;
  const rp = REF_ROWSPOS_OP + deltaA;
  if (rp + 6 <= h1.length && u16BE(h1, rp) === 0x157c && u16BE(h1, rp + 4) === 0x0031) {
    rowsPerPositionDefault = h1[rp + 3] || 32;
  }

  // ── instrument tables via the per-song-patched PC-relative LEA displacements ──
  const synthLea = REF_SYNTH_LEA + deltaA;
  const sampledLea = REF_SAMPLED_LEA + deltaA;
  if (u16BE(h1, synthLea - 2) !== 0x41fa || u16BE(h1, sampledLea - 2) !== 0x43fa) {
    throw new Error('SunTronic V1.3: instrument-table LEA opcodes not found');
  }
  const synthTableOff = synthLea + s16BE(h1, synthLea);
  const sampledTableOff = sampledLea + s16BE(h1, sampledLea);
  if (synthTableOff < 0 || sampledTableOff <= synthTableOff || sampledTableOff >= h1.length) {
    throw new Error('SunTronic V1.3: instrument table offsets out of range');
  }
  const synthInstrumentCount = Math.floor((sampledTableOff - synthTableOff) / SYNTH_RECORD_SIZE);

  const synthInstruments: SunSynthInstrument[] = [];
  for (let i = 0; i < synthInstrumentCount; i++) {
    const rec = synthTableOff + i * SYNTH_RECORD_SIZE;
    if (rec + SYNTH_RECORD_SIZE > h1.length) break;
    synthInstruments.push(decodeSunSynthInstrument(h1, rec));
  }

  const sampledInstruments: SunSampledInstrument[] = [];
  // Slice an env/vib table out of hunk#1, clamped (a short/corrupt ptr yields an
  // empty slice rather than throwing — same guard as decodeSunSynthInstrument).
  const sliceSampledI8 = (off: number, len: number): Int8Array => {
    if (off <= 0 || len <= 0 || off >= h1.length) return new Int8Array(0);
    const end = Math.min(off + len, h1.length);
    return new Int8Array(h1.buffer.slice(h1.byteOffset + off, h1.byteOffset + end));
  };
  for (let rec = sampledTableOff; rec + SAMPLED_RECORD_SIZE <= h1.length; rec += SAMPLED_RECORD_SIZE) {
    if (u32BE(h1, rec) === 0) break; // null-long terminator
    const volEnvOff = u32BE(h1, rec);
    const volEnvLen = u16BE(h1, rec + 0x04);
    const freqEnvOff = u32BE(h1, rec + 0x08);
    const freqEnvLen = u16BE(h1, rec + 0x0c);
    sampledInstruments.push({
      recordOff: rec,
      volEnvOff,
      volEnvLen,
      volEnvLoop: u16BE(h1, rec + 0x06),
      freqEnvOff,
      freqEnvLen,
      freqEnvLoop: u16BE(h1, rec + 0x0e),
      freqEnvSpeed: u16BE(h1, rec + 0x10),
      slotIndex: u32BE(h1, rec + 0x12),
      lengthWords: u16BE(h1, rec + 0x16),
      loopStartWords: u16BE(h1, rec + 0x18),
      loopLenWords: u16BE(h1, rec + 0x1a),
      // vol-env index (voice+0x10) runs 0..volEnvLen-1; vib-depth index
      // (voice+0x24) runs 0..freqEnvLen-1. Slice one extra byte as a bounds guard.
      volEnv: sliceSampledI8(volEnvOff, volEnvLen + 1),
      vibDepth: sliceSampledI8(freqEnvOff, freqEnvLen + 1),
    });
    if (sampledInstruments.length >= 0x3f) break; // select byte range 0x01-0x3F
  }

  // ── subsong table → sequences ──
  const a6base = REF_A6_BASE + deltaA;
  const subsongTable = REF_INSTR_TABLE + deltaB;
  const subsongs: SunSubsong[] = [];
  for (let te = subsongTable; te + 4 <= h1.length && subsongs.length < MAX_SUBSONGS; te += 4) {
    const rel = u32BE(h1, te);
    if (rel === 0) break;
    const sequenceOff = a6base + rel;
    if (sequenceOff + 4 > h1.length) throw new Error(`SunTronic V1.3: subsong sequence 0x${sequenceOff.toString(16)} out of range`);
    const entries: SunSequenceEntry[] = [];
    let endKind: SunSubsong['endKind'] = 'restart';
    for (let se = sequenceOff; se + SEQ_ENTRY_SIZE <= h1.length && entries.length < MAX_SEQ_ENTRIES; se += SEQ_ENTRY_SIZE) {
      const first = u32BE(h1, se);
      if (first === 0) { endKind = 'restart'; break; }
      if ((first & 0x80000000) !== 0) { endKind = 'stop'; break; }
      entries.push({
        trackPtrs: [u32BE(h1, se), u32BE(h1, se + 4), u32BE(h1, se + 8), u32BE(h1, se + 12)],
        transposes: [s8(h1, se + 0x10), s8(h1, se + 0x11), s8(h1, se + 0x12), s8(h1, se + 0x13)],
      });
    }
    subsongs.push({ sequenceOff, entries, endKind });
  }

  // ── deduplicated track blocks with byte-exact carriers ──
  const startSet = new Set<number>();
  for (const sub of subsongs) {
    for (const e of sub.entries) {
      for (const tp of e.trackPtrs) {
        if (tp > 0 && tp < h1.length) startSet.add(tp);
      }
    }
  }
  const sortedStarts = [...startSet].sort((a, b) => a - b);
  const blocks: SunTrackBlock[] = [];
  const blockIndexByOffset = new Map<number, number>();
  for (let i = 0; i < sortedStarts.length; i++) {
    const start = sortedStarts[i];
    const limit = i + 1 < sortedStarts.length ? sortedStarts[i + 1] : h1.length;
    const { rows, byteSize, noteCount, rowCount } = decodeSunBlock(h1, start, limit, { arpShift, volSlideRateFromStream });
    blockIndexByOffset.set(start, blocks.length);
    blocks.push({ h1Offset: start, byteSize, rows, rowCount, noteCount });
  }

  return {
    h1,
    h1FileOffset,
    deltaA,
    deltaB,
    nameBlockEnd,
    instrumentNames,
    rowsPerPositionDefault,
    periodsOff,
    drinOff,
    arpShift,
    volSlideRateFromStream,
    drin,
    synthTableOff,
    sampledTableOff,
    sampledInstruments,
    synthInstrumentCount,
    synthInstruments,
    subsongs,
    blocks,
    blockIndexByOffset,
  };
}

/** Parse the null-terminated name strings at hunk#1+0 (block ends at a 16-byte zero run). */
function parseNameBlock(h1: Uint8Array): { names: string[]; nameBlockEnd: number } {
  const names: string[] = [];
  let pos = 0;
  while (pos < h1.length) {
    if (h1[pos] === 0) {
      let allZero = true;
      for (let i = pos; i < Math.min(pos + 16, h1.length); i++) {
        if (h1[i] !== 0) { allZero = false; break; }
      }
      if (allZero) return { names, nameBlockEnd: pos };
      pos++;
      continue;
    }
    let end = pos;
    while (end < h1.length && h1[end] !== 0) end++;
    let s = '';
    for (let i = pos; i < end; i++) s += String.fromCharCode(h1[i]);
    names.push(s);
    pos = end + 1;
  }
  return { names, nameBlockEnd: pos };
}

// ── Variable-length encoder (carrier concatenation) ─────────────────────────
//
// Pure carrier concatenation per the Rob Hubbard recipe §3: each carrier cell
// re-emits its exact source bytes, so encodePattern(blockRows[fp]) reproduces
// the block byte-for-byte. Defined here so the layout attached in Phase 2 is
// complete; Phase 3 registers it in src/engine/uade/encoders/ (until then it
// is NOT in the encoder registry, so the round-trip ratchet is untouched).

export const sunTronicV13Encoder: VariableLengthEncoder = {
  formatId: 'sunTronic',
  encodePattern(rows: TrackerCell[]): Uint8Array {
    const out: number[] = [];
    for (const cell of rows) {
      const len = cell.cutoff;
      if (len === undefined || len <= 0) continue; // padding row, not a stream item
      out.push((cell.period ?? 0) & 0xff);
      if (len >= 2) out.push((cell.pan ?? 0) & 0xff);
      if (len >= 3) out.push((cell.resonance ?? 0) & 0xff);
    }
    return new Uint8Array(out);
  },
};
