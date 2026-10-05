/**
 * PiyoPiyoParser.ts - Studio Pixel PiyoPiyo (.pmd, 'PMD' magic).
 *
 * Playback is PiyoPiyoEngine (a worklet port of piyopiyo-rs); this parser
 * draws the grid and carries the file as `piyoPiyoFileData`. The file is
 * four tracks of `records` events, 4 bytes each: bits 0-23 are the 24 piano
 * keys down at that step (chords), bits 24-31 the pan. The grid shows the
 * lowest key of each chord as the row's note, one channel per track; every
 * key still plays. Format layout: see public/piyopiyo/PiyoPiyo.worklet.js
 * (2026-10-05 broken-formats sweep, B5).
 */
import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, ChannelData, InstrumentConfig } from '@/types';

const ROWS_PER_PATTERN = 64;
const TRACK_NAMES = ['Track 1', 'Track 2', 'Track 3', 'Drums'];

export function isPiyoPiyoFormat(bytes: Uint8Array): boolean {
  return bytes.length > 0x418 && bytes[0] === 0x50 && bytes[1] === 0x4d && bytes[2] === 0x44;
}

const emptyCell = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
const u32 = (b: Uint8Array, o: number): number => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

export interface PiyoPiyoHeader {
  waitMs: number;
  repeatStart: number;
  repeatEnd: number;
  records: number;
  octaves: [number, number, number];
}

/** The header fields the grid needs. */
export function readPiyoPiyoHeader(bytes: Uint8Array): PiyoPiyoHeader {
  if (!isPiyoPiyoFormat(bytes)) throw new Error('Not a PiyoPiyo file');
  const octaves: [number, number, number] = [bytes[0x18], bytes[0x18 + 340], bytes[0x18 + 680]];
  return { waitMs: u32(bytes, 8), repeatStart: u32(bytes, 12), repeatEnd: u32(bytes, 16), records: u32(bytes, 20), octaves };
}

/** Tracker tempo for `waitMs` per row: the smallest speed that keeps the BPM in range. */
export function piyoPiyoTempo(waitMs: number): { speed: number; bpm: number } {
  const wait = Math.max(1, waitMs);
  const speed = Math.max(1, Math.ceil(32 * wait / 2500));
  const bpm = Math.max(32, Math.min(255, Math.round(2500 * speed / wait)));
  return { speed, bpm };
}

export async function parsePiyoPiyoFile(buffer: ArrayBuffer | Uint8Array, filename = 'song.pmd'): Promise<TrackerSong> {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const h = readPiyoPiyoHeader(bytes);
  const eventsAt = 0x418;
  if (eventsAt + h.records * 16 > bytes.length) throw new Error(`${filename}: PiyoPiyo file is short (${h.records} records announced)`);

  const patternCount = Math.max(1, Math.ceil(h.records / ROWS_PER_PATTERN));
  const patterns: Pattern[] = Array.from({ length: patternCount }, (_, p) => ({
    id: `p${p}`, name: `Pattern ${p + 1}`, length: ROWS_PER_PATTERN,
    channels: TRACK_NAMES.map((name, ch): ChannelData => ({
      id: `ch${ch}`, name, muted: false, solo: false, collapsed: false, volume: 100, pan: 0, instrumentId: null, color: null,
      rows: Array.from({ length: ROWS_PER_PATTERN }, emptyCell),
    })),
  }));

  for (let t = 0; t < 4; t++) {
    const base = eventsAt + t * h.records * 4;
    for (let r = 0; r < h.records; r++) {
      const ev = u32(bytes, base + r * 4);
      const keys = ev & 0xffffff;
      if (keys === 0) continue;
      let key = 0;
      while (!(keys & (1 << key))) key++;
      const cell = patterns[Math.floor(r / ROWS_PER_PATTERN)].channels[t].rows[r % ROWS_PER_PATTERN];
      // XM note numbers: 1 = C-0. Melody keys sit on the track's octave; drums on their key index.
      cell.note = Math.min(96, 1 + key + 12 * (t < 3 ? h.octaves[t] + 1 : 1));
      cell.instrument = t + 1;
    }
  }

  const instruments: InstrumentConfig[] = TRACK_NAMES.map((name, i) => ({
    id: i + 1, name, type: 'synth' as const, synthType: 'PiyoPiyoSynth' as const, effects: [] as [], volume: 0, pan: 0,
  }));
  const { speed, bpm } = piyoPiyoTempo(h.waitMs);
  return {
    name: filename.replace(/\.pmd$/i, ''),
    format: 'PiyoPiyo' as TrackerFormat,
    patterns,
    instruments,
    songPositions: patterns.map((_, i) => i),
    songLength: patterns.length,
    restartPosition: Math.min(patterns.length - 1, Math.floor(h.repeatStart / ROWS_PER_PATTERN)),
    numChannels: 4,
    initialSpeed: speed,
    initialBPM: bpm,
    piyoPiyoFileData: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  };
}
