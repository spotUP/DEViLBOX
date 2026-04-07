/**
 * RobHubbardSTParser.ts — Rob Hubbard ST format detection and parser
 *
 * Detection (from "Rob Hubbard ST_v2.asm", DTP_Check2):
 *
 *   cmp.l   #$00407F40,(A0)+    → long[0] must be $00407F40; A0 now at offset 4
 *   bne.b   fail
 *   cmp.l   #$00C081C0,(A0)     → long[4] must be $00C081C0 (no advance)
 *   bne.b   fail
 *   cmp.l   #$41FAFFEE,52(A0)   → long at offset 4+52 = 56 must be $41FAFFEE
 *   bne.b   fail
 *
 * All three checks must pass. The constants are 68000 machine code patterns
 * specific to the Rob Hubbard ST player init routine.
 *
 * Pattern extraction:
 *   Offset 56 contains $41FA (LEA d16(PC),An). The displacement at offset 58
 *   gives a PC-relative offset to the song data pointer (SongPtr). Pattern
 *   data is walked from there: each row = 4 channels × 4 bytes. A $87 byte
 *   terminates a voice section.
 *
 * Minimum file size: 4 + 52 + 4 = 60 bytes (to reach the check at offset 56).
 *
 * Prefix: 'RHO.'
 *
 * Reference: third-party/uade-3.05/amigasrc/players/wanted_team/RobHubbardST/Rob Hubbard ST_v2.asm
 * Reference parsers: RobHubbardParser.ts, DavidWhittakerParser.ts
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, Pattern, TrackerCell, ChannelData } from '@/types';

// ── Constants ───────────────────────────────────────────────────────────────

const MIN_FILE_SIZE = 60;
const NUM_CHANNELS = 4;
const ROWS_PER_PATTERN = 64;
const MAX_EVENTS = 16384;

/**
 * Standard Amiga period table (3 octaves, 12 notes each).
 * Used to convert RH ST period values to tracker note indices.
 */
const AMIGA_PERIODS = [
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,  // C-1 to B-1
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,  // C-2 to B-2
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,  // C-3 to B-3
];

// ── Binary helpers ──────────────────────────────────────────────────────────

function u8(buf: Uint8Array, off: number): number {
  if (off < 0 || off >= buf.length) return 0;
  return buf[off] & 0xFF;
}

function s8(buf: Uint8Array, off: number): number {
  const v = u8(buf, off);
  return v < 128 ? v : v - 256;
}

function u16BE(buf: Uint8Array, off: number): number {
  if (off + 1 >= buf.length) return 0;
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function i16BE(buf: Uint8Array, off: number): number {
  const v = u16BE(buf, off);
  return v >= 0x8000 ? v - 0x10000 : v;
}

function u32BE(buf: Uint8Array, off: number): number {
  if (off + 3 >= buf.length) return 0;
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

// ── Note conversion ─────────────────────────────────────────────────────────

/**
 * Convert an Amiga period to a tracker note (1-96, FT2 style).
 * Period table index 0 = C-1 (ProTracker) = note 13 in FT2 mapping.
 */
function periodToNote(period: number): number {
  if (period === 0) return 0;
  let bestIdx = -1;
  let bestDist = Infinity;
  for (let i = 0; i < AMIGA_PERIODS.length; i++) {
    const dist = Math.abs(AMIGA_PERIODS[i] - period);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  if (bestIdx < 0) return 0;
  const note = bestIdx + 13; // C-1 (PT) = note 13 (FT2)
  return (note >= 1 && note <= 96) ? note : 0;
}

/**
 * Convert RH ST note index to tracker note.
 * Index 0 = C-1 (ProTracker) = note 13 (FT2).
 */
function rhstNoteToTrackerNote(idx: number): number {
  const n = idx + 13;
  return (n >= 1 && n <= 96) ? n : 0;
}

// ── Format detection ────────────────────────────────────────────────────────

/**
 * Detect Rob Hubbard ST format.
 *
 * Mirrors Check2 in "Rob Hubbard ST_v2.asm":
 *   long[0]  == $00407F40
 *   long[4]  == $00C081C0
 *   long[56] == $41FAFFEE
 */
export function isRobHubbardSTFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  if (u32BE(buf, 0) !== 0x00407F40) return false;
  if (u32BE(buf, 4) !== 0x00C081C0) return false;
  if (u32BE(buf, 56) !== 0x41FAFFEE) return false;

  return true;
}

// ── Song pointer and pattern extraction ─────────────────────────────────────

interface RHSTEvent {
  tick: number;
  note: number;       // tracker note (1-96), 0 = no note, 97 = note off
  instrument: number; // 1-based, 0 = no change
  effTyp: number;
  eff: number;
}

/**
 * Locate the song data pointer via the LEA instruction at offset 56.
 * $41FA = LEA d16(PC),A0. The displacement word at offset 58 gives the
 * PC-relative offset: songPtr = 58 + displacement.
 */
function findSongPtr(buf: Uint8Array): number | null {
  // Verify the LEA opcode at offset 56
  if (u16BE(buf, 56) !== 0x41FA) return null;
  const displacement = i16BE(buf, 58);
  const songPtr = 58 + displacement;
  if (songPtr < 0 || songPtr >= buf.length) return null;
  return songPtr;
}

/**
 * Walk the RH ST song data structure to find voice pointers and extract events.
 *
 * The song data starts with a pointer table or direct pattern data.
 * The RH ST format typically has:
 *   - Song speed byte(s) followed by per-voice track pointers
 *   - Each voice stream: sequence of [note byte, duration byte] pairs
 *   - $87 = terminator for a voice section
 *
 * Since exact header format varies, we try multiple approaches:
 *   1. Look for 4 × u16BE voice offsets (relative to songPtr)
 *   2. If that fails, try interpreting data as direct pattern rows
 */
function extractRHSTPatterns(buf: Uint8Array, songPtr: number): {
  channelEvents: RHSTEvent[][];
  speed: number;
} | null {
  // Approach 1: Try reading as song header with speed + voice pointers
  // Scan for a speed byte followed by voice offset table
  // The RH ST format from the assembly uses a structure at SongPtr:
  //   The data referenced by SongPtr is the song table.
  //   Each song entry: speed byte + 4 voice pointers (u16BE offsets from songPtr)

  // Try reading speed from the first byte
  const speed = u8(buf, songPtr);
  if (speed === 0 || speed > 32) {
    // Try approach 2: direct pattern data at songPtr
    return extractDirectPatternData(buf, songPtr);
  }

  // Try reading 4 voice offsets as u16BE, relative to songPtr
  if (songPtr + 1 + 8 > buf.length) return null;

  const voiceOffsets: number[] = [];
  let validPointers = true;
  for (let ch = 0; ch < NUM_CHANNELS; ch++) {
    const off = u16BE(buf, songPtr + 1 + ch * 2);
    const absOff = songPtr + off;
    if (absOff <= songPtr || absOff >= buf.length) {
      validPointers = false;
      break;
    }
    voiceOffsets.push(absOff);
  }

  if (validPointers && voiceOffsets.length === NUM_CHANNELS) {
    const channelEvents: RHSTEvent[][] = [];
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      channelEvents.push(parseRHSTVoiceStream(buf, voiceOffsets[ch]));
    }
    const totalNotes = channelEvents.reduce(
      (sum, evts) => sum + evts.filter(e => e.note > 0 && e.note < 97).length, 0);
    if (totalNotes > 0) {
      return { channelEvents, speed };
    }
  }

  // Approach 2: Try u32BE pointers
  if (songPtr + 1 + 16 <= buf.length) {
    const voiceOffsets32: number[] = [];
    let valid32 = true;
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const ptr = u32BE(buf, songPtr + 1 + ch * 4);
      if (ptr === 0 || ptr >= buf.length) {
        valid32 = false;
        break;
      }
      voiceOffsets32.push(ptr);
    }
    if (valid32 && voiceOffsets32.length === NUM_CHANNELS) {
      const channelEvents: RHSTEvent[][] = [];
      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        channelEvents.push(parseRHSTVoiceStream(buf, voiceOffsets32[ch]));
      }
      const totalNotes = channelEvents.reduce(
        (sum, evts) => sum + evts.filter(e => e.note > 0 && e.note < 97).length, 0);
      if (totalNotes > 0) {
        return { channelEvents, speed };
      }
    }
  }

  // Approach 3: scan forward from songPtr for pattern-like data
  return extractDirectPatternData(buf, songPtr);
}

/**
 * Try to extract pattern data by interpreting raw bytes as interleaved
 * 4-channel MOD-style rows (4 bytes per cell × 4 channels = 16 bytes per row).
 */
function extractDirectPatternData(buf: Uint8Array, startOff: number): {
  channelEvents: RHSTEvent[][];
  speed: number;
} | null {
  const channelEvents: RHSTEvent[][] = [[], [], [], []];
  let pos = startOff;
  let tick = 0;
  const bytesPerRow = NUM_CHANNELS * 4; // 16 bytes per row
  let emptyRows = 0;
  let safety = 0;

  while (pos + bytesPerRow <= buf.length && safety++ < MAX_EVENTS) {
    // Check for $87 terminator in any of the first bytes
    if (u8(buf, pos) === 0x87) break;

    let rowHasData = false;
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const cellOff = pos + ch * 4;
      const b0 = u8(buf, cellOff);
      const b1 = u8(buf, cellOff + 1);
      const b2 = u8(buf, cellOff + 2);
      const b3 = u8(buf, cellOff + 3);

      if (b0 === 0x87) { // terminator in channel data
        return finishExtraction(channelEvents);
      }

      // Standard MOD cell: (instr_hi | period_hi) period_lo (instr_lo | effTyp) effParam
      const instrument = (b0 & 0xF0) | ((b2 >> 4) & 0x0F);
      const period = ((b0 & 0x0F) << 8) | b1;
      const effTyp = b2 & 0x0F;
      const eff = b3;

      const note = periodToNote(period);
      if (note > 0 || instrument > 0 || effTyp > 0 || eff > 0) {
        rowHasData = true;
        channelEvents[ch].push({
          tick,
          note,
          instrument,
          effTyp,
          eff,
        });
      }
    }

    if (!rowHasData) {
      emptyRows++;
      if (emptyRows > 128) break; // too many empty rows — probably not pattern data
    } else {
      emptyRows = 0;
    }

    tick++;
    pos += bytesPerRow;
  }

  return finishExtraction(channelEvents);
}

function finishExtraction(channelEvents: RHSTEvent[][]): {
  channelEvents: RHSTEvent[][];
  speed: number;
} | null {
  const totalNotes = channelEvents.reduce(
    (sum, evts) => sum + evts.filter(e => e.note > 0 && e.note < 97).length, 0);
  if (totalNotes === 0) return null;
  return { channelEvents, speed: 6 };
}

/**
 * Parse an RH ST voice byte stream. Similar to RH format:
 *   Positive byte (0-127): Note index, followed by duration
 *   Negative bytes: commands
 *   $87 (-121): Terminator
 */
function parseRHSTVoiceStream(buf: Uint8Array, startPos: number): RHSTEvent[] {
  const events: RHSTEvent[] = [];
  let pos = startPos;
  let tick = 0;
  let currentSample = 1;
  let safety = 0;

  while (pos < buf.length && safety++ < MAX_EVENTS) {
    const value = s8(buf, pos);
    pos++;

    if (value === -121 || (value & 0xFF) === 0x87) {
      // $87 = terminator
      break;
    }

    if (value >= 0) {
      // Note: value = note index, next byte = duration
      if (pos >= buf.length) break;
      const duration = u8(buf, pos);
      pos++;

      if (duration === 0x87) break; // terminator in duration byte

      const trackerNote = rhstNoteToTrackerNote(value);
      if (trackerNote > 0) {
        events.push({
          tick,
          note: trackerNote,
          instrument: currentSample,
          effTyp: 0,
          eff: 0,
        });
      }
      tick += duration || 1;
    } else {
      // Commands
      switch (value) {
        case -128: {
          // Sample change
          if (pos >= buf.length) { safety = MAX_EVENTS; break; }
          const smpIdx = u8(buf, pos);
          pos++;
          if (smpIdx === 0x87) { safety = MAX_EVENTS; break; }
          currentSample = (smpIdx & 0x7F) + 1;
          break;
        }
        case -127:
          // Portamento or similar: skip 1 param byte
          pos++;
          break;
        case -126: {
          // Rest: next byte = duration
          if (pos >= buf.length) { safety = MAX_EVENTS; break; }
          const dur = u8(buf, pos);
          pos++;
          if (dur === 0x87) { safety = MAX_EVENTS; break; }
          events.push({ tick, note: 97, instrument: 0, effTyp: 0, eff: 0 });
          tick += dur || 1;
          break;
        }
        case -125:
        case -124:
          // End of pattern / song end
          safety = MAX_EVENTS;
          break;
        case -123:
        case -122:
          // Volume/transpose: skip 1 byte
          pos++;
          break;
        default:
          // Unknown — skip to avoid infinite loop
          break;
      }
    }
  }

  return events;
}

/**
 * Convert per-channel events into unified tracker patterns.
 */
function buildRHSTPatterns(channelEvents: RHSTEvent[][]): { patterns: Pattern[]; songPositions: number[] } {
  let maxTick = 0;
  for (const events of channelEvents) {
    for (const ev of events) {
      if (ev.tick > maxTick) maxTick = ev.tick;
    }
  }

  const totalRows = maxTick + 1;
  const numPatterns = Math.max(1, Math.ceil(totalRows / ROWS_PER_PATTERN));
  const patternLimit = Math.min(numPatterns, 256);

  const patterns: Pattern[] = [];

  for (let p = 0; p < patternLimit; p++) {
    const startTick = p * ROWS_PER_PATTERN;
    const channels: ChannelData[] = [];

    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const rows: TrackerCell[] = [];
      const events = channelEvents[ch] || [];

      for (let r = 0; r < ROWS_PER_PATTERN; r++) {
        const targetTick = startTick + r;
        const ev = events.find(e => e.tick === targetTick);
        rows.push({
          note: ev?.note ?? 0,
          instrument: ev?.instrument ?? 0,
          volume: 0,
          effTyp: ev?.effTyp ?? 0,
          eff: ev?.eff ?? 0,
          effTyp2: 0,
          eff2: 0,
        });
      }

      channels.push({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: (ch === 0 || ch === 3) ? -50 : 50,
        instrumentId: null,
        color: null,
        rows,
      });
    }

    patterns.push({
      id: `pattern-${p}`,
      name: `Pattern ${p}`,
      length: ROWS_PER_PATTERN,
      channels,
    });
  }

  return { patterns, songPositions: patterns.map((_, i) => i) };
}

// ── Main parser ─────────────────────────────────────────────────────────────

export function parseRobHubbardSTFile(buffer: ArrayBuffer, filename: string, _moduleBase = 0): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isRobHubbardSTFormat(buf)) throw new Error('Not a Rob Hubbard ST module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^rho\./i, '').replace(/\.rho$/i, '') || baseName;

  const instruments: InstrumentConfig[] = [{
    id: 1, name: 'Sample 1', type: 'synth' as const,
    synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
  } as InstrumentConfig];

  // ── Extract patterns ──────────────────────────────────────────────────────
  let patterns: Pattern[] = [];
  let songPositions: number[] = [0];
  let initialSpeed = 6;

  const songPtr = findSongPtr(buf);
  if (songPtr !== null) {
    const result = extractRHSTPatterns(buf, songPtr);
    if (result) {
      initialSpeed = result.speed || 6;
      const built = buildRHSTPatterns(result.channelEvents);
      patterns = built.patterns;
      songPositions = built.songPositions;

      // Ensure we have enough instruments for all referenced indices
      let maxInstr = 0;
      for (const evts of result.channelEvents) {
        for (const e of evts) {
          if (e.instrument > maxInstr) maxInstr = e.instrument;
        }
      }
      while (instruments.length < maxInstr) {
        instruments.push({
          id: instruments.length + 1,
          name: `Sample ${instruments.length + 1}`,
          type: 'synth' as const,
          synthType: 'Synth' as const,
          effects: [],
          volume: 0,
          pan: 0,
        } as InstrumentConfig);
      }
    }
  }

  // Fallback: empty pattern if extraction failed
  if (patterns.length === 0) {
    const emptyRows: TrackerCell[] = Array.from({ length: ROWS_PER_PATTERN }, () => ({
      note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
    }));
    patterns = [{
      id: 'pattern-0',
      name: 'Pattern 0',
      length: ROWS_PER_PATTERN,
      channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: (ch === 0 || ch === 3) ? -50 : 50,
        instrumentId: null,
        color: null,
        rows: emptyRows.map(r => ({ ...r })),
      })),
    }];
    songPositions = [0];
  }

  const extractInfo = patterns.length > 1
    ? ` (${patterns.length} pat)`
    : '';

  return {
    name: `${moduleName} [Rob Hubbard ST]${extractInfo}`,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: NUM_CHANNELS,
    initialSpeed,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
  };
}
