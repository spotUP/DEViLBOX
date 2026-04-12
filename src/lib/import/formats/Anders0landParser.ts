/**
 * Anders0landParser.ts — Anders 0land Amiga music format (hot.*) native parser
 *
 * Anders 0land (Anders Öland) is a 4-channel Amiga tracker format. Files are
 * identified by a multi-chunk binary structure with chunk type tags.
 *
 * Detection (from UADE "Anders 0land_v1.asm", DTP_Check2 routine):
 *   The file is a chain of variable-length chunks. Each chunk starts with:
 *     - 3-byte ASCII tag
 *     - 1 byte (padding / reserved)
 *     - uint32 BE: chunk size (D1)
 *   Validation:
 *     D2 = fileSize - u32BE(buf, 4)   ; must not go negative (chunk fits in file)
 *     buf[0..1] == 'mp' (0x6D70)
 *     buf[2]    == 'l'  (0x6C)
 *     D1 (chunk size) must be even (btst #0,D1)
 *   Then advance to next chunk (A0 += D1):
 *     new D1 = u32BE(A0+4)
 *     D2 -= D1 ; must not go negative
 *     buf[0..1] == 'md' (0x6D64)
 *     buf[2]    == 't'  (0x74)
 *     D1 must be even
 *   Then advance again:
 *     new D1 = u32BE(A0+4)
 *     D2 -= D1 ; must not go negative
 *     buf[0..1] == 'ms' (0x6D73)
 *     buf[2]    == 'm'  (0x6D)
 *
 *   Full 3-byte tags: "mpl", "mdt", "msm"
 *   Each stored with the tag at bytes 0-2 and the chunk size at offset 4.
 *
 * Prefix: hot
 * UADE eagleplayer.conf: Anders0land  prefixes=hot
 *
 * UADE handles actual audio playback. This parser extracts metadata only.
 *
 * Reference:
 *   third-party/uade-3.05/amigasrc/players/wanted_team/Anders0land/SRC_Anders0land/Anders 0land_v1.asm
 * Reference parsers: BenDaglishParser.ts
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, Pattern, TrackerCell, ChannelData } from '@/types';

// NOTE: uadePatternLayout not added — Anders 0land uses variable-length byte stream
// encoding per voice (not fixed-size cells). Requires UADEVariablePatternLayout with
// per-track address/size tracking during parsing.

// ── Constants ───────────────────────────────────────────────────────────────

// Minimum size: 3 chunks × minimum 8 bytes header each
const MIN_FILE_SIZE = 24;

const DEFAULT_INSTRUMENTS = 8;
const NUM_CHANNELS = 4;
const ROWS_PER_PATTERN = 64;
const MAX_EVENTS = 4096;

// ── Binary helpers ──────────────────────────────────────────────────────────

function u16BE(buf: Uint8Array, off: number): number {
  if (off + 1 >= buf.length) return 0;
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

/** Signed 16-bit big-endian read. */
function i16BE(buf: Uint8Array, off: number): number {
  const v = u16BE(buf, off);
  return v < 0x8000 ? v : v - 0x10000;
}

function u32BE(buf: Uint8Array, off: number): number {
  if (off + 3 >= buf.length) return 0;
  return (
    ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0
  );
}

// ── Format detection ────────────────────────────────────────────────────────

/**
 * Return true if the buffer passes the DTP_Check2 detection algorithm
 * from Anders 0land_v1.asm.
 *
 * When `filename` is supplied the basename is checked for the expected UADE
 * prefix (`hot.`). The binary scan is always performed.
 *
 * @param buffer    Raw file bytes
 * @param filename  Original filename (optional; used for prefix check)
 */
export function isAnders0landFormat(buffer: ArrayBuffer, filename?: string): boolean {
  const buf = new Uint8Array(buffer);

  // ── Prefix check (optional fast-reject) ──────────────────────────────────
  if (filename !== undefined) {
    const base = (filename.split('/').pop() ?? filename).toLowerCase();
    if (!base.startsWith('hot.')) return false;
  }

  if (buf.length < MIN_FILE_SIZE) return false;

  let off = 0;
  let d2 = buf.length;

  // ── Chunk 1: "mpl" ────────────────────────────────────────────────────────
  if (off + 8 > buf.length) return false;
  const d1a = u32BE(buf, off + 4);
  d2 -= d1a;
  if (d2 < 0) return false;

  // Tag at bytes 0-2 of chunk: 'mp' then 'l'
  if (buf[off + 0] !== 0x6d || buf[off + 1] !== 0x70) return false; // 'mp'
  if (buf[off + 2] !== 0x6c) return false;                            // 'l'

  // Chunk size must be even
  if (d1a & 1) return false;

  off += d1a;

  // ── Chunk 2: "mdt" ────────────────────────────────────────────────────────
  if (off + 8 > buf.length) return false;
  const d1b = u32BE(buf, off + 4);
  d2 -= d1b;
  if (d2 < 0) return false;

  // Tag: 'md' then 't'
  if (buf[off + 0] !== 0x6d || buf[off + 1] !== 0x64) return false; // 'md'
  if (buf[off + 2] !== 0x74) return false;                            // 't'

  // Chunk size must be even
  if (d1b & 1) return false;

  off += d1b;

  // ── Chunk 3: "msm" ────────────────────────────────────────────────────────
  if (off + 8 > buf.length) return false;
  const d1c = u32BE(buf, off + 4);
  d2 -= d1c;
  if (d2 < 0) return false;

  // Tag: 'ms' then 'm'
  if (buf[off + 0] !== 0x6d || buf[off + 1] !== 0x73) return false; // 'ms'
  if (buf[off + 2] !== 0x6d) return false;                            // 'm'

  return true;
}

// ── Note conversion ─────────────────────────────────────────────────────────

/**
 * Convert an Amiga period table index to an XM tracker note value.
 * Index 0 = C-1 (Amiga) → tracker note 25 (C-3 in FT2).
 */
function amigaIndexToTrackerNote(idx: number): number {
  const n = idx + 25;
  return (n >= 1 && n <= 96) ? n : 0;
}

// ── Pattern extraction types ────────────────────────────────────────────────

/** An event parsed from the pattern byte stream */
interface A0Event {
  tick: number;
  note: number;       // tracker note (1-96), 0 = no note
  instrument: number; // 1-based, 0 = no change
}

// ── Pattern byte stream parsing ─────────────────────────────────────────────

/**
 * Parse a single pattern data block for one voice channel.
 *
 * Pattern byte encoding (from transpiled C source, Init/Play functions):
 *   First byte (d1):
 *     Bit 7: has extra instrument/parameter byte following
 *     Bit 6: command/effect byte (not a direct note trigger)
 *     Bit 5: sustain flag (hold previous note)
 *     Bits 0-4: duration (ticks to wait before next event)
 *
 *   When bit 7 or bit 6 is set:
 *     Second byte (d2): instrument number (bit 7 set) or command param (bit 6 set)
 *     If d2 & 0x80 == 0: third byte is the note byte, 3-byte event
 *     If d2 & 0x80 != 0: no note byte, 2-byte event (sustain)
 *
 *   When bits 7,6 clear, bit 5 set: 1-byte event (sustain)
 *   When bits 7,6,5 all clear: second byte is the note byte, 2-byte event
 *
 *   Note byte: bit 7 = slide flag, bits 0-6 = period table index
 *   $FF = end of pattern data block
 */
function parseA0PatternBlock(
  buf: Uint8Array,
  off: number,
  transpose: number,
): A0Event[] {
  const events: A0Event[] = [];
  let pos = 0;
  let tick = 0;
  let currentInstr = 1;
  let safety = 0;

  while (safety++ < MAX_EVENTS) {
    const absPos = off + pos;
    if (absPos >= buf.length) break;

    const d1 = buf[absPos];
    if (d1 === 0xFF) break;  // end of pattern data block

    const duration = d1 & 0x1F;
    const hasBit7 = (d1 & 0x80) !== 0;
    const hasBit6 = (d1 & 0x40) !== 0;
    const hasBit5 = (d1 & 0x20) !== 0;

    let advance: number;
    let noteOff = -1;

    if (hasBit7 || hasBit6) {
      // Bit 7 or bit 6 set: read extra byte d2
      if (absPos + 1 >= buf.length) break;
      const d2 = buf[absPos + 1];

      if (hasBit7) {
        // Instrument change: d2 & 0x7F = instrument number
        currentInstr = (d2 & 0x7F) + 1;
      }

      if ((d2 & 0x80) === 0) {
        // d2 bit 7 clear: 3-byte event, note byte at byte[2]
        advance = 3;
        noteOff = absPos + 2;
      } else {
        // d2 bit 7 set: 2-byte event, sustain (no note)
        advance = 2;
      }
    } else if (hasBit5) {
      // Sustain: 1-byte event, no note
      advance = 1;
    } else {
      // Normal note trigger: 2-byte event, note byte at byte[1]
      advance = 2;
      noteOff = absPos + 1;
    }

    if (noteOff >= 0 && noteOff < buf.length) {
      const noteByte = buf[noteOff];
      const noteIndex = (noteByte & 0x7F) + transpose;
      const trackerNote = amigaIndexToTrackerNote(noteIndex);
      if (trackerNote > 0) {
        events.push({ tick, note: trackerNote, instrument: currentInstr });
      }
    }

    tick += Math.max(1, duration);
    pos += advance;
  }

  return events;
}

/**
 * Read a per-voice position list from the binary.
 * Each byte is a position entry until $FF (loop) or $FE (end).
 *
 * Returns { indices, transposes } arrays parallel to each other.
 * Position bytes with bit 7 set encode an instrument/transpose change
 * (bits 0-6), followed by the actual pattern index byte.
 */
function readA0PositionList(
  buf: Uint8Array,
  off: number,
): { indices: number[]; transposes: number[] } {
  const indices: number[] = [];
  const transposes: number[] = [];
  let pos = 0;
  let currentTranspose = 0;

  for (let safety = 0; safety < 512; safety++) {
    const absPos = off + pos;
    if (absPos >= buf.length) break;

    const b = buf[absPos];
    if (b === 0xFF || b === 0xFE) break;

    if (b & 0x80) {
      // Instrument/transpose change: bits 0-6 = new transpose
      currentTranspose = b & 0x7F;
      pos++;
      // Next byte is the actual pattern index
      if (off + pos >= buf.length) break;
      const patIdx = buf[off + pos];
      if (patIdx === 0xFF || patIdx === 0xFE) break;
      indices.push(patIdx);
      transposes.push(currentTranspose);
      pos++;
    } else {
      indices.push(b);
      transposes.push(currentTranspose);
      pos++;
    }
  }

  return { indices, transposes };
}

/**
 * Extract pattern data from the mdt chunk.
 *
 * mdt header layout (relative to mdt data start):
 *   i16@0:  offset to position data table (4 × u32 offsets to per-voice position lists)
 *   i16@2:  offset to song entries table
 *   i16@4:  offset to voice config table
 *   i16@10: offset to pattern pointer table (u32 offsets relative to table start)
 *   i16@12: offset to instrument table (8 bytes per instrument)
 *
 * The position data table at i16@0 contains 4 longword offsets (one per voice),
 * each pointing (relative to the table itself) to a per-voice position list.
 * Each position list is a byte array of pattern indices.
 *
 * The pattern pointer table at i16@10 maps pattern indices to pattern data:
 *   patternDataAddr = patternTable + u32BE(patternTable + index * 4)
 */
function extractA0Patterns(
  buf: Uint8Array,
  mdtDataOff: number,
  _numPatterns: number,
): { events: A0Event[][], maxPositions: number } | null {
  try {
    if (mdtDataOff + 14 > buf.length) return null;

    // Read mdt header offsets (signed 16-bit, relative to mdtDataOff)
    const posTableOff = mdtDataOff + i16BE(buf, mdtDataOff + 0);
    const patternTableOff = mdtDataOff + i16BE(buf, mdtDataOff + 10);

    // Validate offsets
    if (posTableOff < 0 || posTableOff + 16 > buf.length) return null;
    if (patternTableOff < 0 || patternTableOff + 4 > buf.length) return null;

    // Read per-voice position list pointers from posTable (4 × u32)
    const voiceEvents: A0Event[][] = [[], [], [], []];
    let maxPositions = 0;

    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      // Each voice's position list pointer is a u32 offset from posTable
      const posListRelOff = u32BE(buf, posTableOff + ch * 4);
      // Handle as signed for relative offset
      const posListOff = posTableOff + posListRelOff;
      if (posListOff < 0 || posListOff >= buf.length) continue;

      const { indices, transposes } = readA0PositionList(buf, posListOff);
      if (indices.length > maxPositions) maxPositions = indices.length;

      // Walk position entries and parse each pattern data block
      let globalTick = 0;
      for (let p = 0; p < indices.length; p++) {
        const patIdx = indices[p];
        const transpose = transposes[p];

        // Look up pattern data address from pattern pointer table
        const patPtrOff = patternTableOff + patIdx * 4;
        if (patPtrOff + 4 > buf.length) continue;

        const patRelOff = u32BE(buf, patPtrOff);
        const patDataOff = patternTableOff + patRelOff;
        if (patDataOff < 0 || patDataOff >= buf.length) continue;

        // Parse the pattern data block
        const blockEvents = parseA0PatternBlock(buf, patDataOff, transpose);

        // Offset events by globalTick and add to voice events
        for (const ev of blockEvents) {
          voiceEvents[ch].push({
            tick: globalTick + ev.tick,
            note: ev.note,
            instrument: ev.instrument,
          });
        }

        // Advance globalTick by the max tick in this block + 1
        let maxTick = 0;
        for (const ev of blockEvents) {
          if (ev.tick > maxTick) maxTick = ev.tick;
        }
        globalTick += maxTick + 1;
      }
    }

    // Count total notes extracted
    let totalNotes = 0;
    for (const events of voiceEvents) {
      totalNotes += events.filter(e => e.note > 0).length;
    }

    if (totalNotes === 0) return null;
    return { events: voiceEvents, maxPositions };
  } catch {
    return null;
  }
}

/**
 * Convert per-channel events into unified tracker patterns.
 * Groups events into 64-row patterns, aligned by tick count.
 */
function buildA0Patterns(
  channelEvents: A0Event[][],
  filename: string,
  numPatterns: number,
  numInstruments: number,
): Pattern[] {
  const patterns: Pattern[] = [];

  // Find total number of rows needed (max tick across channels)
  let maxTick = 0;
  for (const events of channelEvents) {
    for (const ev of events) {
      if (ev.tick > maxTick) maxTick = ev.tick;
    }
  }

  const totalRows = maxTick + 1;
  const patCount = Math.max(1, Math.min(256, Math.ceil(totalRows / ROWS_PER_PATTERN)));

  for (let p = 0; p < patCount; p++) {
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
          effTyp: ev?.note ? 0 : 0,
          eff: 0,
          effTyp2: 0,
          eff2: 0,
        });
      }

      channels.push({
        id: `p${p}-ch${ch}`,
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
      importMetadata: {
        sourceFormat: 'MOD' as const,
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: NUM_CHANNELS,
        originalPatternCount: numPatterns,
        originalInstrumentCount: numInstruments,
      },
    });
  }

  return patterns;
}

// ── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse an Anders 0land module file into a TrackerSong.
 *
 * The format is a structured Amiga multi-chunk binary. This parser extracts
 * pattern note data from the mdt chunk's byte stream encoding. Actual audio
 * playback is always delegated to UADE.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive module name)
 */
export async function parseAnders0landFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  if (!isAnders0landFormat(buffer, filename)) {
    throw new Error('Not an Anders 0land module');
  }

  const buf = new Uint8Array(buffer);

  // ── Module name from filename ─────────────────────────────────────────────

  const baseName = filename.split('/').pop() ?? filename;
  // Strip "hot." prefix (case-insensitive)
  const moduleName = baseName.replace(/^hot\./i, '') || baseName;

  // ── Parse chunk offsets to extract metadata from mdt ──────────────────────

  const mplSize = u32BE(buf, 4);
  const mdtOff = mplSize;           // mdt chunk starts after mpl
  const mdtDataOff = mdtOff + 8;    // mdt data starts after 8-byte header

  // Extract pattern count and instrument count from mdt header
  // Reference: Anders 0land_v1.asm EP_NewModuleInfo (lines 415-426)
  let numPatterns = 1;
  let numInstruments = DEFAULT_INSTRUMENTS;

  if (mdtDataOff + 22 <= buf.length) {
    // Instrument count: (word@20 - word@18) >> 2
    const w18 = (buf[mdtDataOff + 18] << 8) | buf[mdtDataOff + 19];
    const w20 = (buf[mdtDataOff + 20] << 8) | buf[mdtDataOff + 21];
    if (w20 > w18) {
      numInstruments = Math.max(1, Math.min(64, (w20 - w18) >> 2));
    }

    // Pattern count: (word@6 - word@4) >> 2
    if (mdtDataOff + 8 <= buf.length) {
      const w4 = (buf[mdtDataOff + 4] << 8) | buf[mdtDataOff + 5];
      const w6 = (buf[mdtDataOff + 6] << 8) | buf[mdtDataOff + 7];
      if (w6 > w4) {
        numPatterns = Math.max(1, Math.min(256, (w6 - w4) >> 2));
      }
    }
  }

  // ── Instrument placeholders ───────────────────────────────────────────────

  const instruments: InstrumentConfig[] = [];

  for (let i = 0; i < numInstruments; i++) {
    instruments.push({
      id: i + 1,
      name: `Sample ${i + 1}`,
      type: 'synth' as const,
      synthType: 'Synth' as const,
      effects: [],
      volume: 0,
      pan: 0,
    } as InstrumentConfig);
  }

  // ── Extract patterns from mdt chunk or fall back to empty ─────────────────

  let patterns: Pattern[];
  let songPositions: number[];

  const extracted = extractA0Patterns(buf, mdtDataOff, numPatterns);

  if (extracted && extracted.events.some(ch => ch.length > 0)) {
    patterns = buildA0Patterns(extracted.events, filename, numPatterns, numInstruments);
    songPositions = patterns.map((_, i) => i);
  } else {
    // Fallback: empty patterns
    patterns = [];
    for (let p = 0; p < numPatterns; p++) {
      const emptyRows = Array.from({ length: ROWS_PER_PATTERN }, () => ({
        note: 0, instrument: 0, volume: 0,
        effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
      }));

      patterns.push({
        id: `pattern-${p}`,
        name: `Pattern ${p}`,
        length: ROWS_PER_PATTERN,
        channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
          id: `p${p}-ch${ch}`,
          name: `Channel ${ch + 1}`,
          muted: false,
          solo: false,
          collapsed: false,
          volume: 100,
          pan: ch === 0 || ch === 3 ? -50 : 50,
          instrumentId: null,
          color: null,
          rows: emptyRows,
        })),
        importMetadata: {
          sourceFormat: 'MOD' as const,
          sourceFile: filename,
          importedAt: new Date().toISOString(),
          originalChannelCount: NUM_CHANNELS,
          originalPatternCount: numPatterns,
          originalInstrumentCount: numInstruments,
        },
      });
    }
    songPositions = Array.from({ length: numPatterns }, (_, i) => i);
  }

  return {
    name: `${moduleName} [Anders 0land]`,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: NUM_CHANNELS,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
  };
}
