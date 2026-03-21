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
import type { SteveTurnerConfig } from '@/types/instrument/exotic';
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

// ── Frequency table (from lbW000000 in ASM — 84 period values) ────────────

const FREQ_TABLE = [
  0xEEE4, 0xE17B, 0xD4D4, 0xC8E1, 0xBD9C, 0xB2F6, 0xA8EC, 0x9F71,
  0x967D, 0x8E0B, 0x8612, 0x7E8C, 0x7772, 0x70BE, 0x6A6A, 0x6471,
  0x5ECE, 0x597B, 0x5476, 0x4FB9, 0x4B3F, 0x4706, 0x4309, 0x3F46,
  0x3BB9, 0x385F, 0x3535, 0x3239, 0x2F67, 0x2CBE, 0x2A3B, 0x27DD,
  0x25A0, 0x2383, 0x2185, 0x1FA3, 0x1DDD, 0x1C30, 0x1A9B, 0x191D,
  0x17B4, 0x165F, 0x151E, 0x13EF, 0x12D0, 0x11C2, 0x10C3, 0x0FD2,
  0x0EEF, 0x0E18, 0x0D4E, 0x0C8F, 0x0BDA, 0x0B30, 0x0A8F, 0x09F8,
  0x0968, 0x08E1, 0x0862, 0x07E9, 0x0778, 0x070C, 0x06A7, 0x0648,
  0x05ED, 0x0598, 0x0548, 0x04FC, 0x04B4, 0x0471, 0x0431, 0x03F5,
  0x03BC, 0x0386, 0x0354, 0x0324, 0x02F7, 0x02CC, 0x02A4, 0x027E,
  0x025A, 0x0239, 0x0219, 0x01FB,
];

/**
 * Derive a note index (0-83) from an instrument's vibrato initial value + pitch shift.
 * The period is vib_initial >> shift, then we find the closest match in FREQ_TABLE.
 * Returns -1 if no reasonable match (e.g. period is 0 or ultrasonic).
 */
function deriveNoteFromInstrument(buf: Uint8Array, instrOffset: number, instIdx: number): number {
  const off = instrOffset + instIdx * INSTR_SIZE;
  if (off + INSTR_SIZE > buf.length) return -1;

  const vibInitial = u16BE(buf, off);  // first word of instrument = vibrato initial value
  const shift = buf[off + 0x25];       // I_SHIFT
  if (vibInitial === 0 || shift > 15) return -1;

  const period = vibInitial >>> shift;
  if (period === 0) return -1;

  // Find closest match in frequency table
  let bestIdx = -1;
  let bestDiff = Infinity;
  for (let i = 0; i < FREQ_TABLE.length; i++) {
    const diff = Math.abs(FREQ_TABLE[i] - period);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  }

  // Reject if the match is too far off (> 50% deviation)
  if (bestIdx >= 0 && bestDiff > FREQ_TABLE[bestIdx] * 0.5) return -1;

  return bestIdx;
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
 * @param instrOffset   File offset of the instrument table (for deriving notes from B0-CF).
 *
 * Returns an array of blocks. Each block is { events, rowCount } where events
 * have row offsets relative to the block start (0-based).
 */
interface ChannelBlock {
  events: NoteEvent[];
  rowCount: number;
}

function decodeChannel(
  buf: Uint8Array,
  posListStart: number,
  offtblOffset: number,
  instrOffset: number,
): ChannelBlock[] {
  const blocks: ChannelBlock[] = [];
  let pos = posListStart;
  let duration = 1;
  let currentInstrument = 0;
  let blockCount = 0;

  while (pos < buf.length && blockCount < MAX_PATTERN_BLOCKS) {
    const posByte = buf[pos++];

    if (posByte >= 0xfe) break;

    const offtblByteOff = offtblOffset + posByte * 2;
    if (offtblByteOff + 1 >= buf.length) break;

    const signedOffset = s16BE(buf, offtblByteOff);
    const patBlockStart = offtblOffset + signedOffset;

    if (patBlockStart < 0 || patBlockStart >= buf.length) break;
    blockCount++;

    const events: NoteEvent[] = [];
    let row = 0;
    let p = patBlockStart;
    let blockDone = false;

    while (!blockDone && p < buf.length) {
      const b = buf[p++];

      if (b <= 0x7f) {
        const xmNote = b + 13;
        events.push({
          row: Math.min(row, MAX_ROWS - 1),
          note: Math.min(xmNote, 96),
          instrument: currentInstrument + 1,
          effTyp: 0, eff: 0,
        });
        row += duration;
      } else if (b <= 0xaf) {
        duration = b - 0x7f;
      } else if (b <= 0xcf) {
        currentInstrument = b - 0xb0;
        const derivedIdx = deriveNoteFromInstrument(buf, instrOffset, currentInstrument);
        const derivedNote = derivedIdx >= 0 ? derivedIdx + 13 : 37;
        events.push({
          row: Math.min(row, MAX_ROWS - 1),
          note: Math.min(derivedNote, 96),
          instrument: currentInstrument + 1,
          effTyp: 0, eff: 0,
        });
        row += duration;
      } else if (b <= 0xef) {
        currentInstrument = b - 0xd0;
      } else if (b <= 0xf8) {
        const effectNum = b - 0xf0;
        if (effectNum > 0 && events.length > 0) {
          const last = events[events.length - 1];
          last.effTyp = 0x0e;
          last.eff = (5 << 4) | (effectNum & 0x0f);
        }
      } else if (b === 0xfe) {
        // Loop point marker — continue decoding
      } else {
        blockDone = true;
      }
    }

    blocks.push({ events, rowCount: row });
  }

  return blocks;
}

// ── Instrument names ────────────────────────────────────────────────────────

/**
 * Extract up to 16 instrument entries from the instrument table.
 * Instrument struct is INSTR_SIZE (0x30) bytes each.
 * No names are stored in the format — use numbered labels.
 */
function buildInstruments(count: number, buf?: Uint8Array, instrOffset?: number): InstrumentConfig[] {
  return Array.from({ length: count }, (_, i) => {
    const inst: InstrumentConfig = {
      id: i + 1,
      name: `Instr ${(i + 1).toString().padStart(2, '0')}`,
      type: 'synth' as const,
      synthType: 'SteveTurnerSynth' as const,
      effects: [],
      volume: 0,
      pan: 0,
    };
    // Extract Steve Turner synth config from instrument binary data
    if (buf && instrOffset !== undefined) {
      const off = instrOffset + i * INSTR_SIZE;
      if (off + INSTR_SIZE <= buf.length) {
        const s8 = (v: number) => v > 127 ? v - 256 : v;
        inst.steveTurner = {
          priority: buf[off + 0x1E],
          sampleIdx: buf[off + 0x1F],
          initDelay: buf[off + 0x20],
          env1Duration: buf[off + 0x21],
          env1Delta: s8(buf[off + 0x22]),
          env2Duration: buf[off + 0x23],
          env2Delta: s8(buf[off + 0x24]),
          pitchShift: buf[off + 0x25],
          oscCount: (buf[off + 0x26] << 8) | buf[off + 0x27],
          oscDelta: s8(buf[off + 0x28]),
          oscLoop: buf[off + 0x29],
          decayDelta: s8(buf[off + 0x2A]),
          numVibrato: buf[off + 0x2B],
          vibratoDelay: buf[off + 0x2C],
          vibratoSpeed: buf[off + 0x2D],
          vibratoMaxDepth: buf[off + 0x2E],
          chain: buf[off + 0x2F],
        } satisfies SteveTurnerConfig;
      }
    }
    return inst;
  });
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
    modData?: { initialSpeed: number; initialBPM: number };
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
    name: `Pattern ${patternIndex}`,
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
      modData: {
        initialSpeed: _subsong.speed,
        initialBPM: 250,
      },
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

  const instruments = buildInstruments(16, buf, hdr.instrOffset);

  // ── Build patterns from subsongs ──────────────────────────────────────────

  const patterns: ReturnType<typeof buildPattern>[] = [];
  const songPositions: number[] = [];

  // Only decode subsong 0 (the main song). Additional subsongs are SFX/alternate tunes.
  {
    const sub = subsongs[0] || { priority: 0, speed: 6, chanPosOffsets: [0, 0, 0, 0] };

    // Decode each of the 4 channels into per-block arrays
    const channelBlocks: ChannelBlock[][] = [];
    for (let ch = 0; ch < 4; ch++) {
      const wordOffset = sub.chanPosOffsets[ch];
      if (wordOffset === 0) {
        channelBlocks.push([]);
        continue;
      }
      const posListStart = hdr.seqOffset + wordOffset;
      if (posListStart >= buf.length) {
        channelBlocks.push([]);
        continue;
      }
      channelBlocks.push(
        decodeChannel(buf, posListStart, hdr.offtblOffset, hdr.instrOffset),
      );
    }

    // The number of order positions = max block count across channels
    const numSteps = Math.max(...channelBlocks.map(b => b.length), 1);

    for (let step = 0; step < numSteps; step++) {
      // Gather this step's events from each channel
      const channelEvents: NoteEvent[][] = [];
      let maxRow = 15;
      for (let ch = 0; ch < 4; ch++) {
        const block = channelBlocks[ch]?.[step];
        if (block) {
          channelEvents.push(block.events);
          if (block.rowCount > maxRow) maxRow = block.rowCount;
        } else {
          channelEvents.push([]);
        }
      }

      // Round row count to nearest multiple of 4 (minimum 4)
      const numRows = Math.min(Math.max(Math.ceil((maxRow) / 4) * 4, 4), MAX_ROWS);

      patterns.push(buildPattern(patterns.length, sub, channelEvents, numRows, filename));
      songPositions.push(patterns.length - 1);
    }
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
    format: 'SteveTurner' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: subsongs[0]?.speed ?? 6,
    // Steve Turner timer $1BC0 = 100Hz (2× standard 50Hz VBlank).
    // BPM 250 gives 250*2/5 = 100 ticks/sec, matching the engine.
    initialBPM: 250,
    linearPeriods: false,
    // WASM engine playback (replaces UADE)
    steveTurnerFileData: buffer.slice(0),
    uadeVariableLayout,
  } as TrackerSong;

  // Count instrument entries actually used in INSTR table
  // (instrument structs are at hdr.instrOffset, 0x30 bytes each; up to 16)
  let instrCount = 0;
  for (let i = 0; i < 16; i++) {
    const off = hdr.instrOffset + i * INSTR_SIZE;
    if (off + INSTR_SIZE > buf.length) break;
    instrCount++;
  }
  // Replace instrument list with actual count
  result.instruments = buildInstruments(instrCount, buf, hdr.instrOffset);

  return result;
}
