/**
 * SteveTurnerParser.ts — Steve Turner Amiga music format native parser
 *
 * Steve Turner composed music for many classic Amiga games using a custom
 * proprietary format. The files are compiled 68k executables with
 * a distinctive instruction pattern at fixed offsets.
 *
 * Detection (from UADE Steve Turner_v4.asm, DTP_Check2 routine):
 *   1. u16BE(0x00) == 0x2B7C   (MOVE.L #...,D(An) — channel 0 init)
 *   2. u16BE(0x08) == 0x2B7C   (channel 1 init)
 *   3. u16BE(0x10) == 0x2B7C   (channel 2 init)
 *   4. u16BE(0x18) == 0x2B7C   (channel 3 init)
 *   5. u32BE(0x20) == 0x303C00FF  (MOVE.W #$00FF,D0 — voice count)
 *   6. u32BE(0x24) == 0x32004EB9  (MOVE.W D0,D1; JSR abs.l — combined instructions)
 *   7. u16BE(0x2C) == 0x4E75   (RTS — end of setup routine)
 *
 * File extension: .jpo, .jpold  (prefix "JPO.")
 *
 * Format layout (computed in DTP_InitPlayer from Steve Turner_v4.asm):
 *   base        = u32BE(buf, 0x02)          — module load address
 *   INSTR_OFFSET = 0x2E                     — always fixed (module_base + 0x2E in file terms)
 *   SEQ_OFFSET   = u32BE(buf, 0x0A) - base + 0x2E   — subsong/sequence table
 *   OFFTBL_OFFSET = u32BE(buf, 0x12) - base + 0x2E  — pattern index→block offset table
 *   SAMP_OFFSET  = u32BE(buf, 0x1A) - base + 0x2E   — sample pointer table
 *
 * Subsong entries (12 bytes each at SEQ_OFFSET):
 *   byte 0: priority, byte 1: speed (ticks/step), byte 2: extra speed, byte 3: pad
 *   word 4-5: channel 0 position list offset from SEQ_OFFSET (0 = unused)
 *   word 6-7: channel 1 position list offset
 *   word 8-9:  channel 2 position list offset
 *   word 10-11: channel 3 position list offset
 *   Count: scan until (u16BE(buf, SEQ+i*12) & 0xFFF0) != 0
 *
 * Position list (bytes at SEQ_OFFSET + word_offset):
 *   0x00-0xFD: pattern index → OFFTBL lookup → pattern block
 *   0xFE: channel stop
 *   0xFF: song end
 *
 * OFFTBL: signed 16-bit word per entry; pattern_block = OFFTBL_BASE + int16(OFFTBL[pos_byte])
 *
 * Pattern block byte encoding:
 *   0x00-0x7F: trigger note at pitch index (0=C-1); save resume ptr; wait `duration` ticks
 *   0x80-0xAF: set duration = byte - 0x7F (1-48 ticks per step)
 *   0xB0-0xCF: trigger note at current pitch with instrument (byte - 0xB0)
 *   0xD0-0xEF: select instrument (byte - 0xD0), no trigger
 *   0xF0-0xF8: set pitch effect = byte - 0xF0
 *   0xFE: set loop-back point (next duration expiry resumes after this byte)
 *   0xFF (or 0xF9-0xFD): end of pattern block → back to position list
 *
 * Period table (84 entries, 7 octaves × 12 semitones, index 0 = C-1 lowest):
 *   Hardcoded at lbW000000 in Steve Turner_v4.asm.
 *   Maps to XM note: note_index + 13 (1=C-0, 13=C-1, 25=C-2 ... 96=B-7)
 *
 * Reference: third-party/uade-3.05/amigasrc/players/wanted_team/SteveTurner/src/Steve Turner_v4.asm
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { encodeSteveTurnerPattern } from '@/engine/uade/encoders/SteveTurnerEncoder';

// ── Constants ─────────────────────────────────────────────────────────────

/** Minimum file size to contain all detection offsets (0x2E = 46 bytes). */
const MIN_FILE_SIZE = 0x2e;

/** Instrument struct size in bytes (from lbC000842: mulu.w #$30,D0). */
const INSTR_SIZE = 0x30;

/** Max pattern blocks per channel (loop guard). */
const MAX_PATTERN_BLOCKS = 256;

/** Max total rows per subsong pattern. */
const MAX_ROWS = 1024;

// ── Binary helpers ─────────────────────────────────────────────────────────

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (
    ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0
  );
}

/** Read a signed 16-bit big-endian value. */
function s16BE(buf: Uint8Array, off: number): number {
  const v = u16BE(buf, off);
  return v >= 0x8000 ? v - 0x10000 : v;
}

// ── Format detection ───────────────────────────────────────────────────────

/**
 * Return true if the buffer is a Steve Turner format module.
 *
 * Detection mirrors DTP_Check2 from Steve Turner_v4.asm.
 * The format is identified by a series of 68k instruction patterns
 * at fixed byte offsets in the compiled executable.
 */
export function isSteveTurnerFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  // Four MOVE.L #...,D(An) instructions (0x2B7C) at offsets 0, 8, 16, 24
  if (u16BE(buf, 0x00) !== 0x2b7c) return false;
  if (u16BE(buf, 0x08) !== 0x2b7c) return false;
  if (u16BE(buf, 0x10) !== 0x2b7c) return false;
  if (u16BE(buf, 0x18) !== 0x2b7c) return false;

  // MOVE.W #$00FF,D0 at offset 0x20
  if (u32BE(buf, 0x20) !== 0x303c00ff) return false;

  // MOVE.W D0,D1; JSR abs.l at offsets 0x24-0x27
  if (u32BE(buf, 0x24) !== 0x32004eb9) return false;

  // RTS at offset 0x2C
  if (u16BE(buf, 0x2c) !== 0x4e75) return false;

  return true;
}

// ── Subsong/header parsing ─────────────────────────────────────────────────

interface SteveTurnerHeader {
  seqOffset: number;
  offtblOffset: number;
  instrOffset: number;
  sampOffset: number;
}

function parseHeader(buf: Uint8Array): SteveTurnerHeader {
  const base = u32BE(buf, 0x02);

  // All offsets: (module_base + pointer_value - base_addr) = pointer_value - base + 0x2E
  const seqOffset    = (u32BE(buf, 0x0a) - base + 0x2e) >>> 0;
  const offtblOffset = (u32BE(buf, 0x12) - base + 0x2e) >>> 0;
  const sampOffset   = (u32BE(buf, 0x1a) - base + 0x2e) >>> 0;

  return {
    seqOffset,
    offtblOffset,
    instrOffset: 0x2e,
    sampOffset,
  };
}

interface SubsongEntry {
  priority: number;
  speed: number;
  /** Channel position list offsets from seqOffset (0 = unused). */
  chanPosOffsets: [number, number, number, number];
}

/**
 * Count and parse subsong entries from the sequence table.
 * Entries are 12 bytes each; scan stops when (u16BE(entry) & 0xFFF0) != 0.
 */
function parseSubsongs(buf: Uint8Array, seqOffset: number): SubsongEntry[] {
  const subsongs: SubsongEntry[] = [];
  let off = seqOffset;

  while (off + 12 <= buf.length) {
    // Stop condition from InitPlayer loops: (u16BE & 0xFFF0) != 0
    if ((u16BE(buf, off) & 0xfff0) !== 0) break;

    const priority = buf[off + 0];
    const speed    = buf[off + 1] || 6; // default 6 if zero
    // byte 2 = extra speed, byte 3 = pad
    const ch0 = u16BE(buf, off + 4);
    const ch1 = u16BE(buf, off + 6);
    const ch2 = u16BE(buf, off + 8);
    const ch3 = u16BE(buf, off + 10);

    subsongs.push({
      priority,
      speed,
      chanPosOffsets: [ch0, ch1, ch2, ch3],
    });

    off += 12;
  }

  return subsongs;
}

// ── Pattern block decoder ──────────────────────────────────────────────────

interface NoteEvent {
  /** Row number (tick / speed). */
  row: number;
  /** XM note number (1-96, 0 = no note); 13 = C-1. */
  note: number;
  /** 1-based instrument index (0 = no change). */
  instrument: number;
  /** Effect type (0 = none). */
  effTyp: number;
  /** Effect parameter. */
  eff: number;
}

/**
 * Decode a single channel's pattern data from the position list into note events.
 *
 * Timing: The replayer's duration counter ($58) is already in "row" units.
 * Each duration byte (0x80-0xAF → 1-48) advances by that many rows directly.
 * The subsong speed byte controls VBI rate but does NOT scale durations; it is
 * NOT used here.
 *
 * @param buf           Full file buffer.
 * @param posListStart  File offset of the position list start.
 * @param offtblOffset  File offset of the offset table.
 */
function decodeChannel(
  buf: Uint8Array,
  posListStart: number,
  offtblOffset: number,
): NoteEvent[] {
  const events: NoteEvent[] = [];
  let pos = posListStart; // current position in position list
  let row = 0;            // current row (duration bytes are already in row units)
  let duration = 1;
  let currentInstrument = 0; // 0-based
  let blockCount = 0;

  while (pos < buf.length && blockCount < MAX_PATTERN_BLOCKS) {
    const posByte = buf[pos++];

    if (posByte >= 0xfe) break; // 0xFE = channel stop, 0xFF = song end

    // Compute pattern block address via OFFTBL
    const offtblByteOff = offtblOffset + posByte * 2;
    if (offtblByteOff + 1 >= buf.length) break;

    const signedOffset = s16BE(buf, offtblByteOff);
    const patBlockStart = offtblOffset + signedOffset;

    if (patBlockStart < 0 || patBlockStart >= buf.length) break;
    blockCount++;

    // Decode pattern block bytes
    let p = patBlockStart;
    let blockDone = false;

    while (!blockDone && p < buf.length) {
      const b = buf[p++];

      if (b <= 0x7f) {
        // Note trigger at pitch b, current instrument
        const xmNote = b + 13; // map note byte 0-83 → XM 13-96 (C-1..B-7)
        events.push({
          row: Math.min(row, MAX_ROWS - 1),
          note: Math.min(xmNote, 96),
          instrument: currentInstrument + 1,
          effTyp: 0, eff: 0,
        });
        row += duration;
        if (events.length >= MAX_ROWS) { blockDone = true; }
      } else if (b <= 0xaf) {
        // Set duration: 0x80-0xAF → duration = b - 0x7F (1-48 rows)
        duration = b - 0x7f;
      } else if (b <= 0xcf) {
        // Instrument change + implicit retrigger at current pitch (b - 0xB0).
        // Display as instrument-only row (no note pitch): in tracker notation an
        // instrument number without a note means "retrigger at previous pitch with
        // new instrument" — avoids flooding the note column with repeated pitches.
        currentInstrument = b - 0xb0;
        events.push({
          row: Math.min(row, MAX_ROWS - 1),
          note: 0,
          instrument: currentInstrument + 1,
          effTyp: 0, eff: 0,
        });
        row += duration;
        if (events.length >= MAX_ROWS) { blockDone = true; }
      } else if (b <= 0xef) {
        // Select instrument (b - 0xD0), no trigger
        currentInstrument = b - 0xd0;
      } else if (b <= 0xf8) {
        // Pitch effect command (b - 0xF0): 0=none,1=portUp,2=portDown,3=portToNote,
        // 4=vibrato,5-8=format-specific.  Attach to the last row as an effect.
        const effectNum = b - 0xf0;
        if (effectNum > 0 && events.length > 0) {
          // Map to a tracker effect code: use E5x (finetune) slot as a generic
          // "pitch mod" placeholder until exact meanings are confirmed.
          const last = events[events.length - 1];
          last.effTyp = 0x0e; // Extended effect 'E'
          last.eff = (5 << 4) | (effectNum & 0x0f); // E5n — pitch effect n
        }
      } else if (b === 0xfe) {
        // Loop point marker — no note triggered; decoding continues after this byte
        // (runtime: after next note's duration expires, jump back here)
        // For display: just continue (skip the loop-back behaviour)
      } else {
        // 0xFF or 0xF9-0xFD: end of pattern block → back to position list
        blockDone = true;
      }
    }

    if (row >= MAX_ROWS) break;
  }

  return events;
}

// ── Instrument names ────────────────────────────────────────────────────────

/**
 * Extract up to 16 instrument entries from the instrument table.
 * Instrument struct is INSTR_SIZE (0x30) bytes each.
 * No names are stored in the format — use numbered labels.
 */
function buildInstruments(count: number): InstrumentConfig[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Instr ${(i + 1).toString().padStart(2, '0')}`,
    type: 'synth' as const,
    synthType: 'Synth' as const,
    effects: [],
    volume: 0,
    pan: 0,
  } as InstrumentConfig));
}

// ── Row builder ─────────────────────────────────────────────────────────────

const CHANNEL_PANS: [number, number, number, number] = [-50, 50, 50, -50];

type TrackerRow = {
  note: number; instrument: number; volume: number;
  effTyp: number; eff: number; effTyp2: number; eff2: number;
};

type TrackerPattern = {
  id: string; name: string; length: number;
  channels: Array<{
    id: string; name: string; muted: boolean; solo: boolean; collapsed: boolean;
    volume: number; pan: number; instrumentId: null; color: null;
    rows: TrackerRow[];
  }>;
  importMetadata: {
    sourceFormat: 'MOD'; sourceFile: string; importedAt: string;
    originalChannelCount: number; originalPatternCount: number; originalInstrumentCount: number;
  };
};

function buildPattern(
  patternIndex: number,
  _subsong: SubsongEntry,
  channelEvents: NoteEvent[][],
  numRows: number,
  filename: string,
): TrackerPattern {

  // Pre-fill rows with empty data
  const channelRows: TrackerRow[][] = channelEvents.map(() =>
    Array.from({ length: numRows }, () => ({
      note: 0, instrument: 0, volume: 0,
      effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
    })),
  );

  // Place events into rows.
  // Merge strategy: a note pitch wins over an instrument-only event on the same row;
  // effect data from any event is preserved (last writer wins for effects).
  channelEvents.forEach((events, ch) => {
    for (const ev of events) {
      if (ev.row >= numRows) continue;
      const row = channelRows[ch][ev.row];
      // Only overwrite note/instrument if this event carries a pitched note,
      // or if the row has no note yet (instrument-only event populates instrument col).
      if (ev.note > 0) {
        row.note       = ev.note;
        row.instrument = ev.instrument;
      } else if (ev.instrument > 0 && row.note === 0) {
        row.instrument = ev.instrument;
      }
      if (ev.effTyp > 0) {
        row.effTyp = ev.effTyp;
        row.eff    = ev.eff;
      }
    }
  });

  return {
    id: `pattern-${patternIndex}`,
    name: `Subsong ${patternIndex + 1}`,
    length: numRows,
    channels: channelRows.map((rows, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: CHANNEL_PANS[ch],
      instrumentId: null,
      color: null,
      rows,
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const,
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: 4,
      originalPatternCount: channelEvents[0]?.length ?? 0,
      originalInstrumentCount: 16,
    },
  };
}

// ── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse a Steve Turner module file into a TrackerSong.
 *
 * Extracts all subsongs as patterns. Actual audio playback is delegated to
 * UADE; the pattern data provides visual display in the tracker editor.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive the module name)
 */
export function parseSteveTurnerFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);

  if (!isSteveTurnerFormat(buf)) {
    throw new Error('Not a Steve Turner module');
  }

  // ── Module name from filename ─────────────────────────────────────────────

  const baseName = filename.split('/').pop() ?? filename;
  // Strip "JPO." prefix (case-insensitive) or .jpo/.jpold extension
  const moduleName =
    baseName.replace(/^jpo\./i, '').replace(/\.jpold?$/i, '').replace(/\.jpo$/i, '') || baseName;

  // ── Parse header offsets ──────────────────────────────────────────────────

  const hdr = parseHeader(buf);

  // Guard: offsets must be within file
  if (
    hdr.seqOffset    >= buf.length ||
    hdr.offtblOffset >= buf.length ||
    hdr.instrOffset  >= buf.length
  ) {
    throw new Error('Steve Turner: corrupt header offsets');
  }

  // ── Parse subsongs ────────────────────────────────────────────────────────

  const subsongs = parseSubsongs(buf, hdr.seqOffset);

  if (subsongs.length === 0) {
    // Fallback: single empty pattern
    subsongs.push({ priority: 0, speed: 6, chanPosOffsets: [0, 0, 0, 0] });
  }

  // ── Count instruments used (max 16) ──────────────────────────────────────

  const instruments = buildInstruments(16);

  // ── Build patterns from subsongs ──────────────────────────────────────────

  const patterns: ReturnType<typeof buildPattern>[] = [];
  const songPositions: number[] = [];

  for (let si = 0; si < subsongs.length; si++) {
    const sub = subsongs[si];

    // Decode each of the 4 channels
    const channelEvents: NoteEvent[][] = [];
    for (let ch = 0; ch < 4; ch++) {
      const wordOffset = sub.chanPosOffsets[ch];
      if (wordOffset === 0) {
        channelEvents.push([]); // unused channel
        continue;
      }
      const posListStart = hdr.seqOffset + wordOffset;
      if (posListStart >= buf.length) {
        channelEvents.push([]);
        continue;
      }
      channelEvents.push(
        decodeChannel(buf, posListStart, hdr.offtblOffset),
      );
    }

    // Determine number of rows: max event row across all channels + 1
    let maxRow = 15; // minimum 16 rows
    for (const evs of channelEvents) {
      for (const ev of evs) {
        if (ev.row > maxRow) maxRow = ev.row;
      }
    }
    // Round up to nearest multiple of 16 for nice display
    const numRows = Math.min(Math.ceil((maxRow + 1) / 16) * 16, MAX_ROWS);

    patterns.push(buildPattern(si, sub, channelEvents, numRows, filename));
    songPositions.push(si);
  }

  // ── Build TrackerSong ─────────────────────────────────────────────────────
  // UADE plays subsong 0 by default and loops it. Limit songPositions to only
  // subsong 0 so the pattern cursor stays in sync with the audio. All patterns
  // remain available in the patterns array for the pattern list UI.

  // ── Build uadeVariableLayout for chip RAM editing ─────────────────────────
  // Steve Turner uses variable-length pattern blocks addressed via an offset
  // table. Each channel decodes its own byte stream independently. We treat
  // each channel's decoded event stream as a single file-level "pattern".
  // The offset table provides per-pattern-block addresses but blocks are
  // shared across channels via the position list, so we use placeholder
  // addresses. Real chip RAM patching resolves at runtime.
  const filePatternAddrs: number[] = [];
  const filePatternSizes: number[] = [];
  for (let ch = 0; ch < 4; ch++) {
    // Use the position list start as the file pattern address
    const wordOffset = subsongs[0]?.chanPosOffsets[ch] ?? 0;
    const posListStart = wordOffset > 0 ? hdr.seqOffset + wordOffset : 0;
    filePatternAddrs.push(posListStart);
    // Estimate size: number of events * ~3 bytes avg + overhead
    const numEvents = patterns[0]?.channels[ch]?.rows.filter(
      (r: TrackerRow) => r.note > 0 || r.instrument > 0
    ).length ?? 0;
    filePatternSizes.push(Math.max(numEvents * 4, 64));
  }

  const trackMap: number[][] = [];
  for (let si = 0; si < patterns.length; si++) {
    trackMap.push([0, 1, 2, 3]); // each tracker pattern maps to the 4 channel streams
  }

  const uadeVariableLayout: UADEVariablePatternLayout = {
    formatId: 'steveTurner',
    numChannels: 4,
    numFilePatterns: 4,
    rowsPerPattern: patterns[0]?.length ?? 64,
    moduleSize: buf.length,
    encoder: {
      formatId: 'steveTurner',
      encodePattern: encodeSteveTurnerPattern,
    },
    filePatternAddrs,
    filePatternSizes,
    trackMap,
  };

  const result: TrackerSong = {
    name: `${moduleName} [Steve Turner]`,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: subsongs[0]?.speed ?? 6,
    initialBPM: 125,
    linearPeriods: false,
    // Mark for UADE playback + subsong switching
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename,
    uadeEditableSubsongs: subsongs.length > 1 ? {
      count: subsongs.length,
      speeds: subsongs.map(s => s.speed),
    } : undefined,
    uadeVariableLayout,
  } as TrackerSong & { uadeEditableFileData?: ArrayBuffer; uadeEditableFileName?: string };

  // Count instrument entries actually used in INSTR table
  // (instrument structs are at hdr.instrOffset, 0x30 bytes each; up to 16)
  let instrCount = 0;
  for (let i = 0; i < 16; i++) {
    const off = hdr.instrOffset + i * INSTR_SIZE;
    if (off + INSTR_SIZE > buf.length) break;
    instrCount++;
  }
  // Replace instrument list with actual count
  result.instruments = buildInstruments(instrCount);

  return result;
}
