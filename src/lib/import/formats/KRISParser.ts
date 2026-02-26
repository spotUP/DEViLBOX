/**
 * KRISParser.ts — ChipTracker KRIS format parser
 *
 * ChipTracker is a 4-channel Amiga tracker format identified by the "KRIS" magic
 * at offset 952. It supports a track reference table with per-entry transpose values
 * and optional synthetic instrument waveforms.
 *
 * Binary layout:
 *   +0    song name (22 bytes, space-padded)
 *   +22   31 × MOD sample headers (30 bytes each = 930 bytes)
 *         Each: name(22) + length(uint16BE, words) + finetune(int8) + volume(uint8)
 *               + loopStart(uint16BE, words) + loopLen(uint16BE, words)
 *   +952  "KRIS" magic (4 bytes)
 *   +956  numOrders (uint8, 1–128)
 *   +957  restartPos (uint8, 0–127)
 *   +958  track reference table [128 × 4 × 2 bytes] = 1024 bytes
 *         Entry at [orderIdx * 4 + ch]: byte[0] = track index (uint8), byte[1] = transpose (int8)
 *   +1982 synth waveforms: numSynthWaveforms × 64 bytes (if any)
 *         tracksOffset = 1982 + numSynthWaveforms * 64
 *   +tracksOffset: sequential track data. Track t at tracksOffset + t * 256.
 *         Each track: 64 rows × 4 bytes.
 *
 * Track cell (4 bytes):
 *   byte0: note byte (0x18–0x9E even = note, 0xA8 = empty, other = treat as empty)
 *   byte1: instrument (1-based; 0 = none)
 *   byte2: high nibble must be 0; low nibble = effect type
 *   byte3: effect parameter
 *
 * Reference: OpenMPT Load_kris.cpp
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument, periodToNoteIndex, amigaNoteToXM } from './AmigaUtils';

// ── Binary helpers ────────────────────────────────────────────────────────────

function u8(v: DataView, off: number): number  { return v.getUint8(off); }
function i8(v: DataView, off: number): number  { return v.getInt8(off); }
function u16(v: DataView, off: number): number { return v.getUint16(off, false); }

function readString(v: DataView, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const ch = v.getUint8(off + i);
    if (ch === 0) break;
    s += String.fromCharCode(ch);
  }
  return s.trim();
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAGIC_OFFSET      = 952;
const MAGIC             = 'KRIS';
const NUM_SAMPLES       = 31;
const SAMPLE_HDR_SIZE   = 30;
const TRACK_REF_OFFSET  = 958;
const TRACK_REF_SIZE    = 128 * 4 * 2;   // 1024 bytes
const SYNTH_WAV_OFFSET  = 1982;          // where synth waveforms begin (or tracks if none)
const SYNTH_WAV_SIZE    = 64;
const ROWS_PER_TRACK    = 64;
const BYTES_PER_TRACK   = ROWS_PER_TRACK * 4;   // 256 bytes
const NUM_CHANNELS      = 4;
const SAMPLE_RATE       = 8287;
const CHANNEL_PAN       = [-50, 50, 50, -50] as const;

// ── Sample header ─────────────────────────────────────────────────────────────

interface KRISSample {
  name:      string;
  nameRaw:   number[];   // raw bytes for synth detection
  length:    number;     // in words
  finetune:  number;     // int8
  volume:    number;     // 0–64
  loopStart: number;     // in words
  loopLen:   number;     // in words (>1 means loop)
  isSynth:   boolean;    // name[0] === 0
}

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Returns true if the buffer has the "KRIS" magic at offset 952 and is large
 * enough to contain the minimum header (960 bytes).
 */
export function isKRISFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 960) return false;
  const v = new DataView(buffer);
  return (
    v.getUint8(MAGIC_OFFSET)     === 0x4B &&  // 'K'
    v.getUint8(MAGIC_OFFSET + 1) === 0x52 &&  // 'R'
    v.getUint8(MAGIC_OFFSET + 2) === 0x49 &&  // 'I'
    v.getUint8(MAGIC_OFFSET + 3) === 0x53     // 'S'
  );
}

// ── Parser ────────────────────────────────────────────────────────────────────

export async function parseKRISFile(
  buffer: ArrayBuffer,
  filename: string
): Promise<TrackerSong> {
  const v   = new DataView(buffer);
  const raw = new Uint8Array(buffer);

  // ── Song name ───────────────────────────────────────────────────────────────
  const songName = readString(v, 0, 22) || filename.replace(/\.[^/.]+$/, '');

  // ── Sample headers (31 × 30 bytes, starting at +22) ────────────────────────
  const samples: KRISSample[] = [];
  for (let s = 0; s < NUM_SAMPLES; s++) {
    const base     = 22 + s * SAMPLE_HDR_SIZE;
    const nameRaw  = Array.from(raw.subarray(base, base + 22));
    const name     = readString(v, base, 22);
    const length   = u16(v, base + 22);
    const finetune = i8(v, base + 24);
    const volume   = Math.min(u8(v, base + 25), 64);
    const loopStart = u16(v, base + 26);
    const loopLen   = u16(v, base + 28);
    const isSynth   = nameRaw[0] === 0;

    samples.push({ name, nameRaw, length, finetune, volume, loopStart, loopLen, isSynth });
  }

  // ── Song header ─────────────────────────────────────────────────────────────
  const numOrders  = Math.max(1, Math.min(u8(v, 956), 128));
  const restartPos = Math.min(u8(v, 957), 127);

  // ── Track reference table [128][4]: each entry is [trackIdx(u8), transpose(i8)] ──
  // Layout: entry for order o, channel c at TRACK_REF_OFFSET + (o * 4 + c) * 2
  interface TrackRef { trackIdx: number; transpose: number; }
  const trackRefs: TrackRef[][] = [];
  for (let o = 0; o < 128; o++) {
    const row: TrackRef[] = [];
    for (let c = 0; c < NUM_CHANNELS; c++) {
      const off = TRACK_REF_OFFSET + (o * NUM_CHANNELS + c) * 2;
      row.push({
        trackIdx: u8(v, off),
        transpose: i8(v, off + 1),
      });
    }
    trackRefs.push(row);
  }

  // ── Count synth waveforms ───────────────────────────────────────────────────
  // Scan sample headers: if isSynth, check name bytes [1], [5], [10], [19] for
  // max waveform index to determine how many 64-byte waveform blocks follow the
  // track ref table before the actual track data.
  let numSynthWaveforms = 0;
  for (const samp of samples) {
    if (!samp.isSynth) continue;
    const candidates = [samp.nameRaw[1], samp.nameRaw[5], samp.nameRaw[10], samp.nameRaw[19]];
    for (const idx of candidates) {
      if (typeof idx === 'number' && idx > numSynthWaveforms) {
        numSynthWaveforms = idx;
      }
    }
  }

  const tracksOffset = SYNTH_WAV_OFFSET + numSynthWaveforms * SYNTH_WAV_SIZE;

  // ── Determine max track index used (for sample data offset calculation) ─────
  let maxTrackIdx = 0;
  for (let o = 0; o < numOrders; o++) {
    for (let c = 0; c < NUM_CHANNELS; c++) {
      const ti = trackRefs[o][c].trackIdx;
      if (ti > maxTrackIdx) maxTrackIdx = ti;
    }
  }

  const sampleDataOffset = tracksOffset + (maxTrackIdx + 1) * BYTES_PER_TRACK;

  // ── Read track data into a cache ─────────────────────────────────────────────
  // Each track: 64 rows × 4 bytes = 256 bytes. Accessed by track index.
  interface TrackRow { noteByte: number; instrument: number; effTyp: number; eff: number; }
  const trackCache = new Map<number, TrackRow[]>();

  function getTrack(trackIdx: number): TrackRow[] {
    if (trackCache.has(trackIdx)) return trackCache.get(trackIdx)!;
    const off = tracksOffset + trackIdx * BYTES_PER_TRACK;
    const rows: TrackRow[] = [];
    for (let row = 0; row < ROWS_PER_TRACK; row++) {
      const cellOff = off + row * 4;
      if (cellOff + 3 >= buffer.byteLength) {
        // Past end of file — pad with empty cells
        rows.push({ noteByte: 0xA8, instrument: 0, effTyp: 0, eff: 0 });
        continue;
      }
      const b0 = u8(v, cellOff);
      const b1 = u8(v, cellOff + 1);
      const b2 = u8(v, cellOff + 2);
      const b3 = u8(v, cellOff + 3);
      rows.push({ noteByte: b0, instrument: b1, effTyp: b2 & 0x0F, eff: b3 });
    }
    trackCache.set(trackIdx, rows);
    return rows;
  }

  // ── Convert KRIS note byte to XM note ────────────────────────────────────────
  function krisNoteToXM(noteByte: number, transpose: number): number {
    if (noteByte === 0xA8) return 0;                 // explicit empty
    if (noteByte & 1) return 0;                      // odd byte → treat as empty
    if (noteByte < 0x18 || noteByte > 0x9E) return 0; // out of range → treat as empty

    const rawNote = Math.floor((noteByte - 0x18) / 2); // 0-based
    const xmNote  = 25 + rawNote + transpose;          // apply transpose
    return Math.max(1, Math.min(96, xmNote));
  }

  // ── Build patterns (one per order position) ──────────────────────────────────
  const patterns: Pattern[] = [];
  const songPositions: number[] = [];

  for (let o = 0; o < numOrders; o++) {
    songPositions.push(o);

    const channels: ChannelData[] = [];
    for (let c = 0; c < NUM_CHANNELS; c++) {
      const ref       = trackRefs[o][c];
      const trackRows = getTrack(ref.trackIdx);
      const transpose = ref.transpose;

      const rows: TrackerCell[] = trackRows.map(row => {
        const note = krisNoteToXM(row.noteByte, transpose);
        return {
          note,
          instrument: row.instrument,
          volume: 0,
          effTyp: row.effTyp,
          eff: row.eff,
          effTyp2: 0,
          eff2: 0,
        };
      });

      channels.push({
        id: `channel-${c}`,
        name: `Channel ${c + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: CHANNEL_PAN[c],
        instrumentId: null,
        color: null,
        rows,
      });
    }

    patterns.push({
      id: `pattern-${o}`,
      name: `Pattern ${o}`,
      length: ROWS_PER_TRACK,
      channels,
      importMetadata: {
        sourceFormat: 'KRIS',
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: NUM_CHANNELS,
        originalPatternCount: numOrders,
        originalInstrumentCount: NUM_SAMPLES,
      },
    });
  }

  // ── Build instruments ─────────────────────────────────────────────────────────
  const instruments: InstrumentConfig[] = samples.map((samp, i) => {
    const id = i + 1;

    // Synthetic instrument — no PCM data, return silent placeholder
    if (samp.isSynth) {
      return {
        id,
        name: samp.name.replace(/\0/g, '').trim() || 'Synthetic',
        type: 'sample' as const,
        synthType: 'Sampler' as const,
        effects: [],
        volume: -60,
        pan: 0,
      } as InstrumentConfig;
    }

    const lengthBytes   = samp.length * 2;
    const loopStartBytes = samp.loopStart * 2;
    const loopLenBytes  = samp.loopLen * 2;
    const hasLoop       = samp.loopLen > 1;
    const loopEnd       = hasLoop ? loopStartBytes + loopLenBytes : lengthBytes;

    if (lengthBytes === 0 || sampleDataOffset + lengthBytes > buffer.byteLength) {
      // No sample data — return silent placeholder
      return {
        id,
        name: samp.name || `Sample ${id}`,
        type: 'sample' as const,
        synthType: 'Sampler' as const,
        effects: [],
        volume: -60,
        pan: 0,
      } as InstrumentConfig;
    }

    // Accumulate sample start position (sequential in file after track data)
    // We need to find which sample this is in the sequential run.
    // Compute start by summing previous sample sizes.
    let startOff = sampleDataOffset;
    for (let j = 0; j < i; j++) {
      startOff += samples[j].isSynth ? 0 : samples[j].length * 2;
    }

    const pcm = raw.subarray(startOff, startOff + lengthBytes);

    return createSamplerInstrument(
      id,
      samp.name || `Sample ${id}`,
      pcm,
      samp.volume,
      SAMPLE_RATE,
      hasLoop ? loopStartBytes : 0,
      hasLoop ? loopEnd : 0,
    );
  });

  return {
    name: songName,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: restartPos,
    numChannels: NUM_CHANNELS,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
  };
}

// Satisfy the unused import lint (periodToNoteIndex and amigaNoteToXM are referenced
// by other parsers and are re-exported via AmigaUtils — imported here for consistency
// with the format's spec doc but not directly needed for KRIS note decoding).
void periodToNoteIndex;
void amigaNoteToXM;
