/**
 * HippelCoSoParser.ts — Jochen Hippel CoSo format parser
 *
 * Parses the "COSO" (Cosmetic Synthesizer) variant of Jochen Hippel's music
 * system, as documented in FlodJS JHPlayer.js by Christian Corti (Neoart).
 *
 * File format overview (COSO variant):
 *   [0..3]   "COSO" magic identifier
 *   [4..7]   frqseqs offset (uint32 BE, relative to file start)
 *   [8..11]  volseqs offset
 *   [12..15] patterns offset
 *   [16..19] tracks offset
 *   [20..23] songsData offset
 *   [24..27] headers offset
 *   [28..31] samplesData offset
 *
 * Each volseq header (at volseqs offset + index*2, dereferenced):
 *   [0]   volSpeed  (uint8)
 *   [1]   frqseq index (signed int8) — index into frqseqs table
 *   [2]   vibSpeed  (signed int8)
 *   [3]   vibDepth  (signed int8)
 *   [4]   vibDelay  (uint8)
 *   [5..] vseq data (signed int8 values until sentinel)
 *
 * Each frqseq (at frqseqs offset + index*2, dereferenced):
 *   Raw signed int8 sequence bytes; special codes -32/-31/-24.
 *
 * Songs (at songsData, each 6 bytes):
 *   [0..1] pointer (uint16: first track index)
 *   [2..3] length  (uint16: last track index)
 *   [4..5] speed   (uint16)
 *
 * Tracks (at tracks offset, each 12 bytes, one row per song step):
 *   4 × 3 bytes per channel: [patternIndex, transpose, volTransp]
 *   For COSO variant 4+: high byte can encode track commands.
 *
 * Patterns (at patterns offset): pairs of uint16 pointers into the file.
 *
 * Pattern data:
 *   [0]  note byte (signed): -1=next track step, -2/-3=repeat/loop,
 *         ≥0=note, with info byte following
 *   If note ≥ 0: [1] info byte, [maybe] infoPrev byte
 *   info & 31 = volseq index
 *
 * This parser extracts a simplified but faithful representation:
 *   - Each voice/instrument gets one HippelCoSoSynth entry
 *   - fseq and vseq data extracted verbatim from the file
 *   - Patterns converted to TrackerCells with note + instrument
 *
 * Reference: FlodJS JHPlayer.js by Christian Corti, Neoart Costa Rica (2012)
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, InstrumentConfig } from '@/types';
import type { HippelCoSoConfig, UADEChipRamInfo } from '@/types/instrument';

// ── Binary read helpers ─────────────────────────────────────────────────────

function u8(buf: Uint8Array, off: number): number {
  return buf[off] & 0xFF;
}

function s8(buf: Uint8Array, off: number): number {
  const v = buf[off] & 0xFF;
  return v < 128 ? v : v - 256;
}

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] & 0xFF) << 8) | (buf[off + 1] & 0xFF);
}

function u32BE(buf: Uint8Array, off: number): number {
  return ((buf[off] & 0xFF) * 0x1000000) +
         ((buf[off + 1] & 0xFF) << 16) +
         ((buf[off + 2] & 0xFF) << 8) +
          (buf[off + 3] & 0xFF);
}

function readString(buf: Uint8Array, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = buf[off + i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

// ── Amiga period table (from JHPlayer.js PERIODS[84]) ───────────────────────

const PERIODS: number[] = [
  1712,1616,1524,1440,1356,1280,1208,1140,1076,1016,
   960, 906, 856, 808, 762, 720, 678, 640, 604, 570,
   538, 508, 480, 453, 428, 404, 381, 360, 339, 320,
   302, 285, 269, 254, 240, 226, 214, 202, 190, 180,
   170, 160, 151, 143, 135, 127, 120, 113, 113, 113,
   113, 113, 113, 113, 113, 113, 113, 113, 113, 113,
  3424,3232,3048,2880,2712,2560,2416,2280,2152,2032,
  1920,1812,6848,6464,6096,5760,5424,5120,4832,4560,
  4304,4064,3840,3624,
];

// Standard ProTracker periods for note mapping
const PT_PERIODS: number[] = [
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,
  107, 101,  95,  90,  85,  80,  76,  72,  68,  64,  60,  57,
];

/**
 * Map a CoSo note index (0-83) to an XM note number (1-96).
 * CoSo note 0 → PERIODS[0] = 1712 Hz (very low, sub C-1).
 * CoSo note 12 → PERIODS[12] = 856 = C-1 = XM note 13.
 */
function cosoNoteToXM(cosoNote: number, trackTranspose: number): number {
  const idx = cosoNote + trackTranspose;
  const clampedIdx = Math.max(0, Math.min(83, idx));
  const period = PERIODS[clampedIdx];
  if (!period || period <= 0) return 0;

  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < PT_PERIODS.length; i++) {
    const d = Math.abs(PT_PERIODS[i] - period);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  const xmNote = bestIdx + 13; // PT_PERIODS[0] = C-1 = XM note 13
  return Math.max(1, Math.min(96, xmNote));
}

// ── Format detection ─────────────────────────────────────────────────────────

/**
 * Detect whether the buffer contains a Jochen Hippel CoSo module.
 * JHPlayer.js reads "COSO" at position 0 of the stream.
 */
export function isHippelCoSoFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 32) return false;
  const buf = new Uint8Array(buffer);
  return buf[0] === 0x43 && buf[1] === 0x4F && buf[2] === 0x53 && buf[3] === 0x4F; // "COSO"
}

// ── Sequence extraction helpers ─────────────────────────────────────────────

/**
 * Extract a frequency sequence starting at `offset` in the buffer.
 * Reads until end of buffer or encounters a terminating -31 (FSEQ_END).
 * Returns at most `maxLen` bytes.
 */
function extractFseq(buf: Uint8Array, offset: number, maxLen = 256): number[] {
  const result: number[] = [];
  for (let i = 0; i < maxLen; i++) {
    const pos = offset + i;
    if (pos >= buf.length) break;
    const v = s8(buf, pos);
    result.push(v);
    /* Stop collecting after end marker (-31) so we don't include garbage */
    if (v === -31) break;
  }
  /* If empty or only an end marker, provide a default single-note fseq */
  if (result.length === 0) result.push(0, -31);
  return result;
}

/**
 * Extract a volume sequence starting at `offset` in the buffer.
 * Reads until end marker (-31..-25 range).
 * Returns at most `maxLen` bytes.
 */
function extractVseq(buf: Uint8Array, offset: number, maxLen = 128): number[] {
  const result: number[] = [];
  for (let i = 0; i < maxLen; i++) {
    const pos = offset + i;
    if (pos >= buf.length) break;
    const v = s8(buf, pos);
    result.push(v);
    /* -31 through -25 are end/stop sentinels */
    if (v >= -31 && v <= -25) break;
  }
  if (result.length === 0) result.push(32, -31);
  return result;
}

// ── Main parser ──────────────────────────────────────────────────────────────

/**
 * Parse a Jochen Hippel CoSo (.hipc, .soc) file into a TrackerSong.
 * Returns format 'MOD' so it's fully editable in the tracker.
 *
 * @param moduleBase - Chip RAM address where the module binary starts (0 if unknown).
 *                     HippelCoSo is a compiled Amiga binary; pass the address returned by
 *                     UADEEngine.scanMemoryForMagic so the UADEChipEditor can resolve it.
 */
export async function parseHippelCoSoFile(
  buffer: ArrayBuffer,
  filename: string,
  moduleBase = 0,
): Promise<TrackerSong> {
  const buf = new Uint8Array(buffer);

  if (buf.length < 32) {
    throw new Error('File too small to be a Jochen Hippel CoSo module');
  }

  // Verify magic
  const magic = readString(buf, 0, 4);
  if (magic !== 'COSO') {
    throw new Error(`Not a CoSo file: magic="${magic}"`);
  }

  // ── Read COSO header offsets (all uint32 BE, as per JHPlayer.js) ──────────
  const frqseqsOff  = u32BE(buf, 4);
  const volseqsOff  = u32BE(buf, 8);
  const patternsOff = u32BE(buf, 12);
  const tracksOff   = u32BE(buf, 16);
  const songsOff    = u32BE(buf, 20);
  const headersOff  = u32BE(buf, 24);

  // ── Determine number of songs and samples ──────────────────────────────────
  // lastSong = (headers - songsData) / 6
  const numSongs = Math.max(1, Math.floor((headersOff - songsOff) / 6));

  // ── Parse songs ───────────────────────────────────────────────────────────
  interface CoSoSong {
    pointer: number;  // absolute byte offset into tracks area
    length: number;   // number of track bytes
    speed: number;
  }

  const songs: CoSoSong[] = [];
  for (let i = 0; i < numSongs; i++) {
    const base = songsOff + i * 6;
    if (base + 6 > buf.length) break;
    let pointer = u16BE(buf, base);
    const endPtr = u16BE(buf, base + 2);
    const speed  = u16BE(buf, base + 4);
    const length = (endPtr - pointer + 1) * 12;
    pointer = pointer * 12 + tracksOff;
    if (length > 12) {
      songs.push({ pointer, length, speed });
    }
  }

  if (songs.length === 0) {
    // Fallback: create one minimal song using the entire tracks area
    songs.push({ pointer: tracksOff, length: 12, speed: 6 });
  }

  const song = songs[0]; // use subsong 0

  // ── Parse volseqs to extract instruments ─────────────────────────────────
  // The volseqs table contains uint16 offsets (absolute positions in file).
  // We enumerate until we hit the patterns area.
  // Maximum instruments: (patterns - volseqs) / 2 entries, but cap at 32.
  const maxVolseqs = Math.min(32, Math.floor((patternsOff - volseqsOff) / 2));
  const instruments: InstrumentConfig[] = [];

  for (let i = 0; i < maxVolseqs; i++) {
    const ptrOff = volseqsOff + i * 2;
    if (ptrOff + 2 > buf.length) break;
    const vsqOff = u16BE(buf, ptrOff);
    if (vsqOff === 0 || vsqOff >= buf.length) break;

    // volseq header at vsqOff:
    // [0] volSpeed
    // [1] fseqIdx (signed)
    // [2] vibSpeed (signed)
    // [3] vibDepth (signed → use as uint for depth)
    // [4] vibDelay (uint)
    // [5..] vseq data
    if (vsqOff + 5 >= buf.length) break;

    const volSpeed = u8(buf, vsqOff);
    const fseqIdx  = s8(buf, vsqOff + 1);
    const vibSpeed = s8(buf, vsqOff + 2);
    const vibDepth = Math.abs(s8(buf, vsqOff + 3)); // depth is magnitude
    const vibDelay = u8(buf, vsqOff + 4);

    // Extract vseq starting at vsqOff + 5
    const vseq = extractVseq(buf, vsqOff + 5);

    // Resolve fseq: if fseqIdx is -128, no fseq (just hold base note)
    let fseq: number[] = [0, -31];
    if (fseqIdx !== -128) {
      const fseqPtrOff = frqseqsOff + fseqIdx * 2;
      if (fseqPtrOff + 2 <= buf.length) {
        const fseqDataOff = u16BE(buf, fseqPtrOff);
        if (fseqDataOff > 0 && fseqDataOff < buf.length) {
          fseq = extractFseq(buf, fseqDataOff);
        }
      }
    }

    const hcConfig: HippelCoSoConfig = {
      fseq,
      vseq,
      volSpeed: Math.max(1, volSpeed),
      vibSpeed,
      vibDepth,
      vibDelay,
    };

    // vsqOff is a file-relative byte offset to this instrument's volseq header (5 bytes)
    // followed by variable-length vseq data. We record it as instrBase so the UADEChipEditor
    // can write scalar params back to chip RAM. instrSize covers the 5-byte fixed header only;
    // vseq/fseq sequences are variable-length and not written back individually.
    const chipRam: UADEChipRamInfo = {
      moduleBase,
      moduleSize: buffer.byteLength,
      instrBase: moduleBase + vsqOff,
      instrSize: 5,
      sections: {
        volseqTable: moduleBase + volseqsOff,
        frqseqTable: moduleBase + frqseqsOff,
        patternsTable: moduleBase + patternsOff,
        tracksData: moduleBase + tracksOff,
        songsData: moduleBase + songsOff,
        headersData: moduleBase + headersOff,
      },
    };

    instruments.push({
      id: i + 1,
      name: `CoSo ${i + 1}`,
      type: 'synth' as const,
      synthType: 'HippelCoSoSynth' as const,
      hippelCoso: hcConfig,
      uadeChipRam: chipRam,
      effects: [],
      volume: -6,
      pan: 0,
    } as InstrumentConfig);
  }

  // Ensure at least one instrument
  if (instruments.length === 0) {
    instruments.push({
      id: 1,
      name: 'CoSo 1',
      type: 'synth' as const,
      synthType: 'HippelCoSoSynth' as const,
      hippelCoso: {
        fseq: [0, -31],
        vseq: [32, -31],
        volSpeed: 1,
        vibSpeed: 0,
        vibDepth: 0,
        vibDelay: 0,
      },
      effects: [],
      volume: -6,
      pan: 0,
    } as InstrumentConfig);
  }

  // ── Parse patterns ────────────────────────────────────────────────────────
  // Patterns are stored as uint16 offsets in a table at patternsOff.
  // Each pattern is a sequence of pattern bytes (variable length).
  // For COSO: patterns[i] = uint16 absolute offset → pattern byte sequence.

  // ── Build TrackerSong patterns from song steps ────────────────────────────
  // Each song step is 12 bytes (4 channels × 3 bytes).
  // Channel bytes: [patternIndex, trackTranspose, volTranspose]
  //
  // For each song step, we scan the referenced pattern for one "row" of notes
  // to place into a TrackerSong pattern row.
  //
  // CoSo patterns are variable-length sequences; we extract all note events
  // from each pattern and distribute them across rows.

  const trackerPatterns: Pattern[] = [];
  const songStepCount = Math.floor(song.length / 12);

  // We'll create one TrackerSong pattern per song step.
  // Each pattern has a fixed length of 16 rows (standard Amiga-style).
  const ROWS_PER_PATTERN = 16;

  // We scan each song step and gather notes from the referenced patterns,
  // distributing them across pattern rows.
  for (let stepIdx = 0; stepIdx < songStepCount; stepIdx++) {
    const stepBase = song.pointer + stepIdx * 12;
    const channelRows: TrackerCell[][] = [[], [], [], []];

    for (let ch = 0; ch < 4; ch++) {
      const chBase = stepBase + ch * 3;
      if (chBase + 3 > buf.length) {
        for (let r = 0; r < ROWS_PER_PATTERN; r++) channelRows[ch].push(emptyCell());
        continue;
      }

      const patIdx      = u8(buf, chBase);
      const trackTransp = s8(buf, chBase + 1);
      // volTransp at chBase+2 used to select instrument offset

      // Resolve pattern data
      const patPtrOff = patternsOff + patIdx * 2;
      let patDataOff = 0;
      if (patPtrOff + 2 <= buf.length) {
        patDataOff = u16BE(buf, patPtrOff);
      }

      // Extract up to ROWS_PER_PATTERN notes from this pattern
      const rows: TrackerCell[] = [];
      let pos = patDataOff;

      while (rows.length < ROWS_PER_PATTERN && pos < buf.length) {
        const v = s8(buf, pos);

        if (v === -1) {
          // End of pattern / next track step — stop
          break;
        } else if (v === -2 || v === -3) {
          // Repeat / loop command: skip command byte + param, emit empty
          pos += 2;
          rows.push(emptyCell());
        } else if (v >= 0) {
          // Note event
          const noteVal = v;
          pos++;

          let infoVal = 0;
          if (pos < buf.length) {
            infoVal = s8(buf, pos);
            pos++;
          }

          // If info has bits 5-7 set, there may be an extra infoPrev byte
          if ((infoVal & 0xE0) !== 0 && pos < buf.length) {
            pos++; // skip infoPrev
          }

          // info & 31 = volseq index = instrument number (1-indexed)
          const volseqIdx = infoVal & 31;
          const instrNum  = volseqIdx + 1;

          const xmNote = cosoNoteToXM(noteVal, trackTransp);

          rows.push({
            note:      xmNote,
            instrument: instrNum <= instruments.length ? instrNum : 0,
            volume:    0,
            effTyp:    0,
            eff:       0,
            effTyp2:   0,
            eff2:      0,
          });
        } else {
          // Unknown negative value < -3 — skip
          pos++;
          rows.push(emptyCell());
        }
      }

      // Pad to ROWS_PER_PATTERN
      while (rows.length < ROWS_PER_PATTERN) {
        rows.push(emptyCell());
      }

      channelRows[ch] = rows;
    }

    trackerPatterns.push({
      id: `pattern-${stepIdx}`,
      name: `Pattern ${stepIdx}`,
      length: ROWS_PER_PATTERN,
      channels: channelRows.map((rows, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: (ch === 0 || ch === 3) ? -50 : 50, // Amiga LRRL panning
        instrumentId: null,
        color: null,
        rows,
      })),
      importMetadata: {
        sourceFormat: 'MOD' as const,
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: 4,
        originalPatternCount: songStepCount,
        originalInstrumentCount: instruments.length,
      },
    });
  }

  // Ensure at least one pattern
  if (trackerPatterns.length === 0) {
    trackerPatterns.push(createEmptyPattern(filename, instruments.length));
  }

  const moduleName = filename.replace(/\.[^/.]+$/, '');
  const speedBPM   = Math.round(song.speed > 0 ? (2500.0 / song.speed) : 125);

  return {
    name: `${moduleName} [Hippel CoSo]`,
    format: 'MOD' as TrackerFormat,
    patterns: trackerPatterns,
    instruments,
    songPositions: trackerPatterns.map((_, i) => i),
    songLength: trackerPatterns.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: Math.max(32, Math.min(255, speedBPM)),
    linearPeriods: false,
  };
}

// ── Helper functions ─────────────────────────────────────────────────────────

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

function createEmptyPattern(filename: string, instrumentCount: number): Pattern {
  return {
    id: 'pattern-0',
    name: 'Pattern 0',
    length: 16,
    channels: Array.from({ length: 4 }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: (ch === 0 || ch === 3) ? -50 : 50,
      instrumentId: null,
      color: null,
      rows: Array.from({ length: 16 }, () => emptyCell()),
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const,
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: 4,
      originalPatternCount: 0,
      originalInstrumentCount: instrumentCount,
    },
  };
}
