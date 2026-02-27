/**
 * SoundControlParser.ts — Sound Control native parser
 *
 * Sound Control is an Amiga tracker format that supports PCM sample playback
 * with up to 6 channels, independent track/position lists, and instruments
 * with ADSR envelopes + sample command sequences.
 *
 * Three sub-formats exist based on the magic/version bytes at offset 0x20:
 *   3.x — version word < 0x0400 (no instruments section)
 *   4.0 — version word = 0x0400
 *   5.0 — version word = 0x0500
 *
 * Reference: NostalgicPlayer SoundControlWorker.cs (authoritative loader)
 * Reference spec: thoughts/shared/research/nostalgicplayer/Sound Control.txt
 *
 * File layout (big-endian):
 *   0x00  10 bytes  Song name
 *   0x0A   4 bytes  TL — Length of tracks
 *   0x0E   4 bytes  SL — Length of samples
 *   0x12   4 bytes  PLL — Length of position list
 *   0x16   4 bytes  IL — Length of instruments (only from 4.0; else 0)
 *   0x1A   2 bytes  Version? (skip)
 *   0x1C   2 bytes  Speed (only from 4.0)
 *   0x40  TL bytes  Tracks section (offset table + track data)
 *   0x40+TL  SL bytes  Samples section (offset table + sample info + PCM data)
 *   0x40+TL+SL  PLL bytes  Position list (6 channels × 2 bytes each entry)
 *   0x40+TL+SL+PLL  IL bytes  Instruments section (4.0+ only)
 *
 * Tracks section:
 *   0x000  256×uint16  Offsets to each track (relative to 0x40), 0 = empty
 *   Each track: 10-byte name, then pairs { dat1, dat2 }
 *     dat1=0xFF → end of track
 *     dat1=0x00 → wait: xx=dat2 ticks
 *     otherwise → note+sample/instrument+volume row (4 bytes: nn xx yy zz)
 *
 * Samples section:
 *   0x000  256×uint32  Offsets to sample info (relative to 0x40+TL), 0 = empty
 *   Each sample: 10-byte name + 2-byte length + 2-byte loopStart + 2-byte loopEnd
 *     + 20 skip + 2-byte noteTranspose + 16 skip + 4-byte totalLen + PCM data
 *
 * Position list:
 *   Each entry = 12 bytes: 6 channels × { uint8 trackNum, uint8 unused }
 *
 * Detection: total module size = 64 + TL + SL + PLL + IL must match file size (approx)
 * We identify by checking that:
 *   - file length >= 64
 *   - version word (at 0x1C after 2 skip) — see LoadTracks
 *   - track section length field > 0
 *
 * Extensions: .sc, .sct (but .sc extension is also used by other formats)
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';

// ── Utility ────────────────────────────────────────────────────────────────

const PAL_CLOCK = 3546895;

function u8(buf: Uint8Array, off: number): number { return buf[off]; }
function u16BE(buf: Uint8Array, off: number): number { return (buf[off] << 8) | buf[off + 1]; }
function s16BE(buf: Uint8Array, off: number): number {
  const v = u16BE(buf, off); return v < 32768 ? v : v - 65536;
}
function u32BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0;
}

function readString(buf: Uint8Array, off: number, len: number): string {
  let str = '';
  for (let i = 0; i < len; i++) {
    const c = buf[off + i];
    if (c === 0) break;
    str += String.fromCharCode(c);
  }
  return str.trimEnd();
}

/**
 * Period to frequency (PAL Amiga).
 * freq = PAL_CLOCK / (2 * period)
 */
function periodToFreq(period: number): number {
  if (period <= 0) return 8287;
  return Math.round(PAL_CLOCK / (2 * period));
}

// Sound Control period table from internal structures
// Player 3.0 has 8 octaves × 10 notes, Player 4.0/5.0 uses a standard period table.
// BasePeriod from Tables.cs: [0xd600, 0xca00, 0xbe80, 0xb400, 0xa980, 0xa000,
//                             0x9700, 0x8e80, 0x8680, 0x7f00, 0x7800, 0x7100,
//                             0x6b00, 0x0000, 0x0000, 0x0000]
// The period table is built per octave: period = basePeriod[noteInOctave] >> octave
// Standard Amiga period table (3 octaves, 12 notes each):
const SC_PERIOD_TABLE: number[] = [
  // Octave 1
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
  // Octave 2
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
  // Octave 3
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,
];

/**
 * Convert Sound Control note byte to XM note number.
 * Format 3.x: hi-nibble = octave (1-8), lo-nibble = note (0-9), 0=empty
 * Format 4.0+: direct index into period table (1-based; 0=empty)
 */
function sc3xNoteToXm(noteByte: number): number {
  if (noteByte === 0) return 0;
  const octave = (noteByte >> 4) & 0x0f;
  const noteInOct = noteByte & 0x0f;
  if (octave === 0 || octave > 8 || noteInOct > 9) return 0;
  // Map 10-note octave to standard 12-note: SC uses only C,D,E,F,G,A,B + accidentals
  // Best approximation: map the 10 notes linearly across 12 semitones
  const semitone = Math.round((noteInOct / 10) * 12);
  const xmNote = (octave - 1) * 12 + semitone + 13; // +13 to start at C-1 (XM note 13)
  return Math.max(1, Math.min(96, xmNote));
}

function sc40NoteToXm(noteIndex: number): number {
  if (noteIndex === 0) return 0;
  const idx = noteIndex - 1;
  if (idx < SC_PERIOD_TABLE.length) {
    // Map period table index to XM note
    return Math.max(1, Math.min(96, idx + 13));
  }
  return Math.max(1, Math.min(96, noteIndex));
}

// ── Format Identification ──────────────────────────────────────────────────

/**
 * Returns true if `bytes` is a Sound Control module.
 *
 * Detection mirrors SoundControlIdentifier.cs (NostalgicPlayer):
 *   1. File length >= 576 (minimum useful size)
 *   2. tracksLen at offset 16 must be < 0x8000 and even
 *   3. At position (tracksLen + 64 - 2): uint16 must be 0xFFFF
 *   4. At position (tracksLen + 64):     uint32 must be 0x00000400
 *
 * Header layout (big-endian):
 *   0x00  16 bytes  Song name
 *   0x10   4 bytes  tracksLen
 *   0x14   4 bytes  samplesLen
 *   0x18   4 bytes  posListLen
 *   0x1C   4 bytes  sampleCommandsLen (instruments section, 4.0+ only)
 *   0x20   2 bytes  skip
 *   0x22   2 bytes  version: 2 = 3.x, 3 = 4.0/5.0
 *   0x24   2 bytes  speed (4.0+ only)
 */
export function isSoundControlFormat(bytes: Uint8Array): boolean {
  if (bytes.length < 576) return false;

  // tracksLen at offset 16 (after 16-byte song name)
  const tracksLen = u32BE(bytes, 16);
  if (tracksLen === 0 || tracksLen >= 0x8000) return false;
  if ((tracksLen & 1) !== 0) return false;  // must be even

  // At (tracksLen + 64 - 2): must be 0xFFFF
  const checkPos = tracksLen + 64 - 2;
  if (checkPos + 6 > bytes.length) return false;
  if (u16BE(bytes, checkPos) !== 0xFFFF) return false;

  // At (tracksLen + 64): must be 0x00000400
  if (u32BE(bytes, checkPos + 2) !== 0x00000400) return false;

  return true;
}

// ── Internal types ─────────────────────────────────────────────────────────

interface SCTrackRow {
  wait: number;      // ticks to wait (dat1=0x00 rows)
  note: number;      // raw note byte
  sampleOrInstr: number;
  volume: number;
  isNote: boolean;
  isEnd: boolean;
  isWait: boolean;
}

interface SCSample {
  name: string;
  length: number;
  loopStart: number;
  loopEnd: number;
  noteTranspose: number;
  sampleData: Uint8Array | null;
}

// ── Main Parser ────────────────────────────────────────────────────────────

/**
 * Parse a Sound Control module file and return a TrackerSong.
 * Returns null if the file cannot be parsed.
 */
export function parseSoundControlFile(bytes: Uint8Array, filename: string): TrackerSong | null {
  if (!isSoundControlFormat(bytes)) return null;

  // ── Header ────────────────────────────────────────────────────────────
  // Song name: 16 bytes at 0x00
  // tracksLen:         uint32 BE at 0x10
  // samplesLen:        uint32 BE at 0x14
  // posListLen:        uint32 BE at 0x18
  // sampleCommandsLen: uint32 BE at 0x1C
  // skip 2 bytes at 0x20
  // version:           uint16 BE at 0x22  (2 = SC3.x, 3 = SC4.x/5.x)
  // speed:             uint16 BE at 0x24  (SC4.0+)
  const songName   = readString(bytes, 0x00, 16).trim() || filename.replace(/\.[^/.]+$/, '');
  const tracksLen  = u32BE(bytes, 0x10);
  const samplesLen = u32BE(bytes, 0x14);
  const posListLen = u32BE(bytes, 0x18);
  const instrLen   = u32BE(bytes, 0x1C);

  // version at 0x22 (after 2 skip bytes at 0x20)
  // 3 = SC4.0/5.0; 2 = SC3.x
  const versionWord = u16BE(bytes, 0x22);
  let speed = 6;
  if (versionWord >= 3) {
    speed = u16BE(bytes, 0x24) || 6;
    if (speed < 1 || speed > 31) speed = 6;
  }

  const is40orHigher = versionWord >= 3;

  // Section offsets
  const tracksBase   = 64;
  const samplesBase  = tracksBase + tracksLen;
  const posListBase  = samplesBase + samplesLen;

  // ── Load Track Offset Table ───────────────────────────────────────────
  // 256 × uint16 offsets at start of tracks section (512 bytes)
  const trackOffsets: number[] = [];
  for (let i = 0; i < 256; i++) {
    const relOff = tracksBase + i * 2;
    if (relOff + 2 > bytes.length) { trackOffsets.push(0); continue; }
    trackOffsets.push(u16BE(bytes, relOff));
  }

  // ── Parse Tracks ─────────────────────────────────────────────────────
  // Each track: 10-byte name then pairs/quads until 0xFF 0xFF
  const tracks: Array<SCTrackRow[] | null> = new Array(256).fill(null);

  for (let t = 0; t < 256; t++) {
    const relOff = trackOffsets[t];
    if (relOff === 0) continue;

    const absOff = tracksBase + relOff;
    if (absOff + 10 > bytes.length) continue;

    // Skip 16-byte track name (spec says 10 bytes = "10 Track name")
    let off = absOff + 16;
    const rows: SCTrackRow[] = [];

    for (;;) {
      if (off + 2 > bytes.length) break;
      const dat1 = u8(bytes, off++);
      const dat2 = u8(bytes, off++);

      if (dat1 === 0xff) {
        rows.push({ wait: 0, note: 0, sampleOrInstr: 0, volume: 0, isNote: false, isEnd: true, isWait: false });
        break;
      }

      if (dat1 === 0x00) {
        // Wait: xx ticks
        rows.push({ wait: dat2, note: 0, sampleOrInstr: 0, volume: 0, isNote: false, isEnd: false, isWait: true });
      } else {
        // Note row: nn xx yy zz (4 bytes, dat1=nn already read)
        if (off + 2 > bytes.length) break;
        const yy = u8(bytes, off++);
        const zz = u8(bytes, off++);

        // zz=0x80 means "store note+sample in list" (4.0+), else volume
        const volume = (zz === 0x80) ? 64 : Math.min(64, zz & 0x7f);
        const sampleOrInstr = dat2;

        rows.push({
          wait: 0,
          note: dat1,
          sampleOrInstr,
          volume,
          isNote: true,
          isEnd: false,
          isWait: false,
        });

        void yy; // yy is unused per spec ("ignored")
      }
    }

    tracks[t] = rows;
  }

  // ── Load Sample Offset Table ──────────────────────────────────────────
  // 256 × uint32 offsets at start of samples section (1024 bytes)
  const sampleOffsets: number[] = [];
  for (let i = 0; i < 256; i++) {
    const relOff = samplesBase + i * 4;
    if (relOff + 4 > bytes.length) { sampleOffsets.push(0); continue; }
    sampleOffsets.push(u32BE(bytes, relOff));
  }

  // ── Parse Samples ─────────────────────────────────────────────────────
  const samples: (SCSample | null)[] = new Array(256).fill(null);
  let lastSample = 0;

  for (let s = 0; s < 256; s++) {
    const relOff = sampleOffsets[s];
    if (relOff === 0) continue;

    const absOff = samplesBase + relOff;
    if (absOff + 64 > bytes.length) continue;

    const name   = readString(bytes, absOff + 0x00, 16);
    const length = u16BE(bytes, absOff + 0x10);
    const loopStart = u16BE(bytes, absOff + 0x12);
    const loopEnd   = u16BE(bytes, absOff + 0x14);
    // skip 20 bytes (0x16 - 0x29)
    const noteTranspose = s16BE(bytes, absOff + 0x2A);
    // skip 16 bytes (0x2C - 0x3B)
    const realSampleLengthWithHeader = u32BE(bytes, absOff + 0x3C);
    const realSampleLen = realSampleLengthWithHeader > 64 ? realSampleLengthWithHeader - 64 : 0;

    let sampleData: Uint8Array | null = null;
    const dataStart = absOff + 0x40;
    if (realSampleLen > 0 && dataStart + realSampleLen <= bytes.length) {
      sampleData = bytes.slice(dataStart, dataStart + realSampleLen);
    }

    samples[s] = { name, length, loopStart, loopEnd, noteTranspose, sampleData };
    lastSample = s;
  }

  const sampleList = samples.slice(0, lastSample + 1);

  // ── Load Position List ────────────────────────────────────────────────
  // Each position = 12 bytes: 6 channels × { uint8 trackNum, uint8 unused }
  const numPositions = Math.floor(posListLen / 12);
  const positions: number[][] = [];
  for (let p = 0; p < numPositions; p++) {
    const base = posListBase + p * 12;
    const row: number[] = [];
    for (let ch = 0; ch < 6; ch++) {
      if (base + ch * 2 + 1 > bytes.length) { row.push(0); continue; }
      row.push(u8(bytes, base + ch * 2));
    }
    positions.push(row);
  }

  // ── Build InstrumentConfig[] ─────────────────────────────────────────
  const instrConfigs: InstrumentConfig[] = [];
  let instrId = 1;
  const sampleIdMap: Map<number, number> = new Map();

  for (let s = 0; s <= lastSample; s++) {
    const samp = sampleList[s];
    if (!samp) {
      instrConfigs.push({
        id: instrId,
        name: `Sample ${s}`,
        type: 'synth' as const,
        synthType: 'Synth' as const,
        effects: [],
        volume: 0,
        pan: 0,
      } as InstrumentConfig);
    } else {
      const c3Rate = periodToFreq(214); // C-3 period
      if (samp.sampleData && samp.sampleData.length > 0) {
        const hasLoop = samp.loopEnd > samp.loopStart;
        const loopStart = hasLoop ? samp.loopStart * 2 : 0;
        const loopEnd   = hasLoop ? samp.loopEnd * 2 : 0;
        instrConfigs.push(
          createSamplerInstrument(instrId, samp.name || `Sample ${s}`, samp.sampleData, 64, c3Rate, loopStart, loopEnd)
        );
      } else {
        instrConfigs.push({
          id: instrId,
          name: samp.name || `Sample ${s}`,
          type: 'synth' as const,
          synthType: 'Synth' as const,
          effects: [],
          volume: 0,
          pan: 0,
        } as InstrumentConfig);
      }
    }
    sampleIdMap.set(s, instrId);
    instrId++;
  }

  // ── Convert tracks to flat row arrays ────────────────────────────────
  // Each track is a list of row events. We convert to flat rows with tick-based timing.
  // Each note row = 1 pattern row; wait rows add empty rows.
  function trackToRows(trackNum: number): TrackerCell[] {
    const track = tracks[trackNum];
    if (!track) return [emptyCell()];
    const cells: TrackerCell[] = [];
    for (const row of track) {
      if (row.isEnd) break;
      if (row.isWait) {
        for (let w = 0; w < Math.max(1, row.wait); w++) cells.push(emptyCell());
        continue;
      }
      if (row.isNote) {
        const xmNote = is40orHigher
          ? sc40NoteToXm(row.note)
          : sc3xNoteToXm(row.note);
        const sampIdx = row.sampleOrInstr;
        const id = sampleIdMap.get(sampIdx) ?? 0;
        cells.push({
          note: xmNote,
          instrument: id,
          volume: row.volume > 0 ? row.volume : 0,
          effTyp: 0,
          eff: 0,
          effTyp2: 0,
          eff2: 0,
        });
      }
    }
    if (cells.length === 0) cells.push(emptyCell());
    return cells;
  }

  // ── Build patterns ────────────────────────────────────────────────────
  const numChannels = 6;
  const trackerPatterns: Pattern[] = [];
  // Amiga-style pan: channels alternate L/R
  const CHAN_PAN = [-50, 50, 50, -50, -50, 50];

  for (let posIdx = 0; posIdx < numPositions; posIdx++) {
    const pos = positions[posIdx];
    const channelCells: TrackerCell[][] = [];
    let maxRows = 1;

    for (let ch = 0; ch < numChannels; ch++) {
      const trackNum = pos[ch] ?? 0;
      const rows = trackToRows(trackNum);
      channelCells.push(rows);
      if (rows.length > maxRows) maxRows = rows.length;
    }

    // Pad shorter channels to maxRows
    for (let ch = 0; ch < numChannels; ch++) {
      while (channelCells[ch].length < maxRows) channelCells[ch].push(emptyCell());
    }

    trackerPatterns.push({
      id: `pattern-${posIdx}`,
      name: `Position ${posIdx}`,
      length: maxRows,
      channels: channelCells.map((rows, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: CHAN_PAN[ch] ?? 0,
        instrumentId: null,
        color: null,
        rows,
      })),
      importMetadata: {
        sourceFormat: 'SC',
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: numChannels,
        originalPatternCount: numPositions,
        originalInstrumentCount: instrConfigs.length,
      },
    });
  }

  if (trackerPatterns.length === 0) {
    trackerPatterns.push(makeEmptyPattern(filename, numChannels, 64));
  }

  void instrLen; // used for 4.0+ instruments section validation (not parsed here)

  return {
    name: songName,
    format: 'SC' as TrackerFormat,
    patterns: trackerPatterns,
    instruments: instrConfigs,
    songPositions: trackerPatterns.map((_, i) => i),
    songLength: trackerPatterns.length,
    restartPosition: 0,
    numChannels,
    initialSpeed: speed,
    initialBPM: 125,
    linearPeriods: false,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

function makeEmptyPattern(filename: string, numChannels: number, rowCount: number): Pattern {
  return {
    id: 'pattern-0',
    name: 'Pattern 0',
    length: rowCount,
    channels: Array.from({ length: numChannels }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: 0,
      instrumentId: null,
      color: null,
      rows: Array.from({ length: rowCount }, () => emptyCell()),
    })),
    importMetadata: {
      sourceFormat: 'SC',
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: numChannels,
      originalPatternCount: 0,
      originalInstrumentCount: 0,
    },
  };
}
