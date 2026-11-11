/**
 * PiyoPiyoParser.ts - Studio Pixel PiyoPiyo (.pmd, 'PMD' magic).
 *
 * Playback is PiyoPiyoEngine (a worklet port of piyopiyo-rs); this parser
 * draws the grid and carries the file as `piyoPiyoFileData`. The file is
 * four tracks of `records` events, 4 bytes each: bits 0-23 are the 24 piano
 * keys down at that step (chords), bits 24-31 the pan. piyoPiyoGrid.ts maps
 * them: a track owns one lane per key of its widest chord, and cell edits are
 * written back into the carried file. Format layout: see public/piyopiyo/PiyoPiyo.worklet.js
 * (2026-10-05 broken-formats sweep, B5).
 */
import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, ChannelData, InstrumentConfig } from '@/types';
import { decodePiyoPiyoModule, piyoPiyoEventAt, piyoPiyoEventCell, PIYOPIYO_ROWS, PIYOPIYO_TRACKS } from './piyoPiyoGrid';
import { tempoForRowMs } from '../rowTempo';

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
  return tempoForRowMs(waitMs);
}

export async function parsePiyoPiyoFile(buffer: ArrayBuffer | Uint8Array, filename = 'song.pmd'): Promise<TrackerSong> {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const h = readPiyoPiyoHeader(bytes);

  const m = decodePiyoPiyoModule(bytes);
  if (!m) throw new Error(`${filename}: PiyoPiyo file is short (${h.records} records announced)`);
  const names: string[] = [];
  m.lanes.forEach((n, t) => {
    for (let l = 0; l < n; l++) names.push(l === 0 ? TRACK_NAMES[t] : `${TRACK_NAMES[t]}.${l + 1}`);
  });
  const patterns: Pattern[] = Array.from({ length: m.patterns }, (_, p) => ({
    id: `p${p}`, name: `Pattern ${p + 1}`, length: PIYOPIYO_ROWS,
    channels: names.map((name, ch): ChannelData => ({
      id: `ch${ch}`, name, muted: false, solo: false, collapsed: false, volume: 100, pan: 0, instrumentId: null, color: null,
      rows: Array.from({ length: PIYOPIYO_ROWS }, emptyCell),
    })),
  }));
  for (let t = 0; t < PIYOPIYO_TRACKS; t++) {
    for (let r = 0; r < m.records; r++) {
      const ev = piyoPiyoEventAt(bytes, m.records, t, r);
      if (ev === 0) continue;
      for (let l = 0; l < m.lanes[t]; l++) {
        patterns[Math.floor(r / PIYOPIYO_ROWS)].channels[m.firstChannel[t] + l].rows[r % PIYOPIYO_ROWS] = piyoPiyoEventCell(m, t, l, ev);
      }
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
    restartPosition: Math.min(patterns.length - 1, Math.floor(h.repeatStart / PIYOPIYO_ROWS)),
    numChannels: m.channels,
    initialSpeed: speed,
    initialBPM: bpm,
    piyoPiyoFileData: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  };
}
