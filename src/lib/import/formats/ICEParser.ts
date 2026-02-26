/**
 * ICEParser.ts — Ice Tracker / SoundTracker 2.6 format parser
 *
 * Supports two magic variants:
 *   "MTN\0" at offset 1464 → SoundTracker 2.6
 *   "IT10"  at offset 1464 → Ice Tracker 1.0 / 1.1
 *
 * File structure:
 *   +0:    Song name (20 bytes, space-padded)
 *   +20:   31 × MOD sample headers (30 bytes each = 930 bytes)
 *            Each: name(22) + length(uint16BE, words) + finetune(int8)
 *                  + volume(uint8) + loopStart(uint16BE, words) + loopLen(uint16BE, words)
 *   +950:  numOrders (uint8, 1-128)
 *   +951:  numTracks (uint8) — total reusable tracks in file
 *   +952:  track reference table [128 × 4] (uint8 each)
 *            trackRefs[orderIdx * 4 + ch] = track index for that channel
 *   +1464: magic ("MTN\0" or "IT10", 4 bytes)
 *   +1468: track data — 64 rows × 4 bytes = 256 bytes per track
 *   After all tracks: sample PCM data (signed int8, sequential)
 *
 * Reference: OpenMPT Load_ice.cpp
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument, periodToNoteIndex, amigaNoteToXM } from './AmigaUtils';

// ── Constants ─────────────────────────────────────────────────────────────

const NUM_CHANNELS = 4;
const ROWS_PER_TRACK = 64;
const BYTES_PER_TRACK = ROWS_PER_TRACK * 4; // 256

const OFFSET_SONG_NAME = 0;
const OFFSET_SAMPLES = 20;
const OFFSET_NUM_ORDERS = 950;
const OFFSET_NUM_TRACKS = 951;
const OFFSET_TRACK_REFS = 952;
const OFFSET_MAGIC = 1464;
const OFFSET_TRACK_DATA = 1468;

const MAGIC_MTN = [0x4D, 0x54, 0x4E, 0x00]; // "MTN\0" — SoundTracker 2.6
const MAGIC_IT10 = [0x49, 0x54, 0x31, 0x30]; // "IT10" — Ice Tracker 1.0/1.1

// Channel panning: LRRL (hard Amiga stereo, -50/50/50/-50 scaled to ±25 for ChannelData)
const CHANNEL_PANNING = [-50, 50, 50, -50];

// ── Helpers ────────────────────────────────────────────────────────────────

const TEXT_DECODER = new TextDecoder('iso-8859-1');

function readStr(buf: Uint8Array, offset: number, len: number): string {
  let end = offset;
  while (end < offset + len && buf[end] !== 0) end++;
  return TEXT_DECODER.decode(buf.subarray(offset, end)).trim();
}

function readU16BE(buf: Uint8Array, offset: number): number {
  return (buf[offset] << 8) | buf[offset + 1];
}

function magicMatch(buf: Uint8Array, offset: number, magic: number[]): boolean {
  for (let i = 0; i < magic.length; i++) {
    if (buf[offset + i] !== magic[i]) return false;
  }
  return true;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Detect whether a buffer is an Ice Tracker / SoundTracker 2.6 file.
 * Checks for "MTN\0" or "IT10" magic at offset 1464, and sanity-checks numOrders.
 */
export function isICEFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < OFFSET_MAGIC + 4) return false;
  const buf = new Uint8Array(buffer);
  if (!magicMatch(buf, OFFSET_MAGIC, MAGIC_MTN) && !magicMatch(buf, OFFSET_MAGIC, MAGIC_IT10)) {
    return false;
  }
  const numOrders = buf[OFFSET_NUM_ORDERS];
  return numOrders >= 1 && numOrders <= 128;
}

/**
 * Parse an Ice Tracker / SoundTracker 2.6 file into a TrackerSong.
 */
export async function parseICEFile(buffer: ArrayBuffer, filename: string): Promise<TrackerSong> {
  const buf = new Uint8Array(buffer);

  if (!isICEFormat(buffer)) {
    throw new Error('ICEParser: not a valid Ice Tracker / SoundTracker 2.6 file');
  }

  // ── Determine variant ────────────────────────────────────────────────────
  const isMTN = magicMatch(buf, OFFSET_MAGIC, MAGIC_MTN);
  const variant = isMTN ? 'SoundTracker 2.6' : 'Ice Tracker';
  console.log(`[ICEParser] Detected ${variant}`);

  // ── Read song name ────────────────────────────────────────────────────────
  const songName = readStr(buf, OFFSET_SONG_NAME, 20) ||
    filename.replace(/\.[^/.]+$/, '');

  // ── Read sample headers ──────────────────────────────────────────────────
  interface ICESampleHeader {
    name: string;
    lengthWords: number;   // in words (multiply by 2 for bytes)
    finetune: number;      // signed -8..+7
    volume: number;        // 0-64
    loopStartWords: number;
    loopLenWords: number;
  }

  const sampleHeaders: ICESampleHeader[] = [];
  for (let i = 0; i < 31; i++) {
    const base = OFFSET_SAMPLES + i * 30;
    const name = readStr(buf, base, 22);
    const lengthWords = readU16BE(buf, base + 22);
    const rawFinetune = buf[base + 24] & 0x0F;
    const finetune = rawFinetune > 7 ? rawFinetune - 16 : rawFinetune;
    const volume = Math.min(buf[base + 25], 64);
    const loopStartWords = readU16BE(buf, base + 26);
    const loopLenWords = readU16BE(buf, base + 28);
    sampleHeaders.push({ name, lengthWords, finetune, volume, loopStartWords, loopLenWords });
  }

  // ── Read order / track info ───────────────────────────────────────────────
  const numOrders = buf[OFFSET_NUM_ORDERS];
  const numTracks = buf[OFFSET_NUM_TRACKS];

  console.log(`[ICEParser] numOrders=${numOrders} numTracks=${numTracks}`);

  // Track reference table: 128 entries × 4 channels
  // trackRefs[orderIdx * 4 + ch] = track index (0-based)
  const trackRefs = buf.subarray(OFFSET_TRACK_REFS, OFFSET_TRACK_REFS + 128 * 4);

  // ── Decode tracks ─────────────────────────────────────────────────────────
  // Each track is BYTES_PER_TRACK (256) bytes starting at OFFSET_TRACK_DATA
  // Track cell (4 bytes, standard ProTracker MOD format):
  //   byte0: [instHiNibble(4)] [periodHi(4)]
  //   byte1: [periodLo(8)]
  //   byte2: [instLoNibble(4)] [effectType(4)]
  //   byte3: [effectParam(8)]

  interface ICECell {
    note: number;      // XM note (0=none)
    instrument: number; // 1-31, 0=none
    effTyp: number;
    eff: number;
  }

  // Parse all tracks into cell arrays
  const tracks: ICECell[][] = [];
  for (let t = 0; t < numTracks; t++) {
    const trackOffset = OFFSET_TRACK_DATA + t * BYTES_PER_TRACK;
    const cells: ICECell[] = [];

    for (let row = 0; row < ROWS_PER_TRACK; row++) {
      const off = trackOffset + row * 4;
      const byte0 = buf[off];
      const byte1 = buf[off + 1];
      const byte2 = buf[off + 2];
      const byte3 = buf[off + 3];

      // Decode ProTracker-style cell
      const period = ((byte0 & 0x0F) << 8) | byte1;
      const instrument = (byte0 & 0xF0) | (byte2 >> 4);
      const effectType = byte2 & 0x0F;
      const effectParam = byte3;

      // Sanitize extended (E) effects: if E sub-command >= 0x10, it's a
      // SoundTracker filter command — discard it (set to no-op).
      let effTyp = effectType;
      let eff = effectParam;
      if (effectType === 0x0E && effectParam >= 0x10) {
        effTyp = 0;
        eff = 0;
      }

      // Convert Amiga period to XM note
      const noteIdx = period > 0 ? periodToNoteIndex(period) : 0;
      const xmNote = amigaNoteToXM(noteIdx);

      cells.push({ note: xmNote, instrument, effTyp, eff });
    }

    tracks.push(cells);
  }

  // ── Build patterns ────────────────────────────────────────────────────────
  // Each song order position becomes one pattern.
  // The 4 channels of a pattern are assembled from 4 tracks via trackRefs.

  const trackerPatterns: Pattern[] = [];

  for (let orderIdx = 0; orderIdx < numOrders; orderIdx++) {
    const channels: ChannelData[] = Array.from({ length: NUM_CHANNELS }, (_, ch) => {
      const trackIdx = trackRefs[orderIdx * 4 + ch];

      // Bounds check — use an empty track if index is out of range
      const trackCells: ICECell[] = (trackIdx < tracks.length)
        ? tracks[trackIdx]
        : Array.from({ length: ROWS_PER_TRACK }, () => ({ note: 0, instrument: 0, effTyp: 0, eff: 0 }));

      const rows: TrackerCell[] = trackCells.map(cell => ({
        note: cell.note,
        instrument: cell.instrument,
        volume: 0,
        effTyp: cell.effTyp,
        eff: cell.eff,
        effTyp2: 0,
        eff2: 0,
      }));

      return {
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: CHANNEL_PANNING[ch],
        instrumentId: null,
        color: null,
        rows,
      };
    });

    trackerPatterns.push({
      id: `pattern-${orderIdx}`,
      name: `Pattern ${orderIdx}`,
      length: ROWS_PER_TRACK,
      channels,
      importMetadata: {
        sourceFormat: 'ICE',
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: NUM_CHANNELS,
        originalPatternCount: numOrders,
        originalInstrumentCount: 31,
      },
    });
  }

  // ── Read sample PCM data ──────────────────────────────────────────────────
  // Sample data begins immediately after all track data
  let sampleDataOffset = OFFSET_TRACK_DATA + numTracks * BYTES_PER_TRACK;

  // ── Build instruments ─────────────────────────────────────────────────────
  const instruments: InstrumentConfig[] = [];

  for (let i = 0; i < 31; i++) {
    const hdr = sampleHeaders[i];
    const id = i + 1;
    const byteLength = hdr.lengthWords * 2;

    if (byteLength === 0) {
      // Silent placeholder
      instruments.push({
        id,
        name: hdr.name || `Sample ${id}`,
        type: 'sample' as const,
        synthType: 'Sampler' as const,
        effects: [],
        volume: -60,
        pan: 0,
      } as InstrumentConfig);
      continue;
    }

    // Slice PCM data
    const end = Math.min(sampleDataOffset + byteLength, buf.byteLength);
    const rawPcm = buf.subarray(sampleDataOffset, end);
    sampleDataOffset += byteLength;

    // Convert loop points from words to bytes
    const loopStartBytes = hdr.loopStartWords * 2;
    const loopLenBytes = hdr.loopLenWords * 2;

    // Loop is active only if loopLen > 1 word (2 bytes)
    const hasLoop = hdr.loopLenWords > 1;
    const loopStart = hasLoop ? loopStartBytes : 0;
    const loopEnd = hasLoop ? loopStartBytes + loopLenBytes : 0;

    instruments.push(
      createSamplerInstrument(
        id,
        hdr.name || `Sample ${id}`,
        rawPcm,
        hdr.volume,
        8287,      // Amiga standard C-3 sample rate
        loopStart,
        loopEnd
      )
    );
  }

  // ── Song positions (one per order, pointing to matching pattern index) ────
  const songPositions = Array.from({ length: numOrders }, (_, i) => i);

  return {
    name: songName,
    format: 'MOD' as TrackerFormat,
    patterns: trackerPatterns,
    instruments,
    songPositions,
    songLength: numOrders,
    restartPosition: 0,
    numChannels: NUM_CHANNELS,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
  };
}
