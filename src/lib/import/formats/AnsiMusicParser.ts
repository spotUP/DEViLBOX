/**
 * AnsiMusicParser - ANSI music (BASIC PLAY strings inside .ANS files) as a song.
 *
 * One subsong per music block (SMILE `;` blocks are sound effects and yield
 * none), one channel, the PC speaker instrument. Import only (decision D1).
 * The byte scan and PLAY interpreter live in ansiMusic.ts.
 *
 * Grid: a row is the finest note length the block uses (R rows per whole
 * note). Tracker timing is `speed` ticks per row at `bpm`; a quarter note
 * lasts 60 / T seconds, so bpm = T x speed x R / 96 (24 ticks per quarter note
 * gives BPM = T). Mid-block T changes
 * become Fxx on channel 0 (the MDXParser pattern). Articulation (MN 7/8,
 * ML full, MS 3/4) becomes NOTE_OFF 97 at the gate end, rounded to a row.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell } from '@/types';
import type { InstrumentConfig } from '@/types/instrument';
import { FURNACE_CHIP_PRESETS } from '@/constants/furnaceChipPresets';
import { emptyPattern } from './Sc68Parser';
import { scanAnsiMusicBlocks, interpretPlay, type PlayEvent } from './ansiMusic';

const NOTE_OFF = 97;
const PATTERN_ROWS = 64;
const SET_TEMPO = 0x0f;
const MIN_BPM = 32;
const MAX_BPM = 255;
/** Rows per whole note to try, finest-first never needed: smallest that fits every length wins. */
const MAX_ROWS_PER_WHOLE = 384;
const FALLBACK_ROWS_PER_WHOLE = 96;

/** Music blocks that make a subsong: everything but SMILE sound effects. */
function musicBlocks(bytes: Uint8Array): { events: PlayEvent[] }[] {
  return scanAnsiMusicBlocks(bytes).blocks
    .filter((b) => !b.smile)
    .map((b) => ({ events: interpretPlay(b.payload) }));
}

/** True when the file holds at least one non-SMILE music block that plays a note. */
export function isAnsiMusicFormat(buffer: ArrayBuffer): boolean {
  return musicBlocks(new Uint8Array(buffer)).some((b) => b.events.some((e) => !e.rest));
}

/** Number of subsongs (non-SMILE music blocks). */
export function countAnsiMusicSubsongs(buffer: ArrayBuffer): number {
  return musicBlocks(new Uint8Array(buffer)).length;
}

/** Title from a trailing SAUCE record (35 bytes at offset 7), else ''. */
function sauceTitle(bytes: Uint8Array): string {
  const at = bytes.length - 128;
  if (at < 0) return '';
  const tag = String.fromCharCode(...bytes.subarray(at, at + 5));
  if (tag !== 'SAUCE') return '';
  let t = '';
  for (let i = at + 7; i < at + 42; i++) {
    const c = bytes[i];
    if (c >= 0x20 && c < 0x7f) t += String.fromCharCode(c);
  }
  return t.trim();
}

const near = (x: number): boolean => Math.abs(x - Math.round(x)) < 1e-6;

/** Smallest rows-per-whole-note that puts every event on a whole row. */
function rowsPerWhole(events: PlayEvent[]): number {
  for (let r = 1; r <= MAX_ROWS_PER_WHOLE; r++) {
    if (events.every((e) => near(e.whole * r))) return r;
  }
  return FALLBACK_ROWS_PER_WHOLE;
}

/** Ticks per row and BPM: BPM = T x k with 96 x k ticks per whole note when that fits, else the smallest speed with an in-range BPM. */
function speedAndBpm(tempo: number, r: number): { speed: number; bpm: number } {
  // Preferred: speed x R is a multiple k of 96 ticks per whole note, so the BPM is k x T
  // (k = 1: BPM equals the file's T, 24 ticks per quarter note).
  for (let speed = 1; speed <= 31; speed++) {
    if ((speed * r) % 96 !== 0) continue;
    const bpm = (tempo * speed * r) / 96;
    if (bpm >= MIN_BPM && bpm <= MAX_BPM) return { speed, bpm };
  }
  let fallback: { speed: number; bpm: number } | null = null;
  for (let speed = 1; speed <= 31; speed++) {
    const raw = (tempo * speed * r) / 96;
    if (raw < MIN_BPM || raw > MAX_BPM) continue;
    if (near(raw)) return { speed, bpm: Math.round(raw) };
    fallback ??= { speed, bpm: Math.round(raw) };
  }
  if (fallback) return fallback;
  const speed = tempo * r / 96 < MIN_BPM ? 31 : 1;
  return { speed, bpm: Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round((tempo * speed * r) / 96))) };
}

function pcSpeakerInstrument(): InstrumentConfig {
  const preset = FURNACE_CHIP_PRESETS.find((p) => p.synthType === 'FurnacePCSPKR');
  if (!preset) throw new Error('AnsiMusicParser: PC Speaker preset missing');
  return { ...preset, id: 1, name: 'PC Speaker' } as InstrumentConfig;
}

export function parseAnsiMusicFile(buffer: ArrayBuffer, filename = 'song', subsong = 0): TrackerSong {
  const bytes = new Uint8Array(buffer);
  const blocks = musicBlocks(bytes);
  if (blocks.length === 0) throw new Error(`${filename}: no ANSI music block`);
  const current = subsong >= 0 && subsong < blocks.length ? subsong : 0;
  const events = blocks[current].events;

  const r = rowsPerWhole(events);
  const initialTempo = events.length > 0 ? events[0].tempo : 120;
  const { speed, bpm } = speedAndBpm(initialTempo, r);

  // Place events on a flat row list first, then cut it into patterns.
  const cells = new Map<number, Partial<TrackerCell>>();
  const put = (row: number, c: Partial<TrackerCell>): void => {
    cells.set(row, { ...cells.get(row), ...c });
  };
  let row = 0;
  let tempo = initialTempo;
  // A note-off ends a sounding note; silence before the first note or after a
  // note-off needs no cell (a run of rests is one silence, not many note-offs).
  let sounding = false;
  for (const e of events) {
    if (e.tempo !== tempo) {
      const raw = (e.tempo * speed * r) / 96;
      put(row, { effTyp: SET_TEMPO, eff: Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(raw))) });
      tempo = e.tempo;
    }
    const len = Math.max(1, Math.round(e.whole * r));
    if (e.rest) {
      const prev = cells.get(row);
      if (sounding && (!prev || prev.note === undefined)) put(row, { note: NOTE_OFF });
      sounding = false;
    } else {
      put(row, { note: e.semi + 1, instrument: 1 });
      const gateRows = Math.round(e.whole * r * (e.ms > 0 ? e.gate / e.ms : 1));
      const gated = gateRows > 0 && gateRows < len;
      if (gated) put(row + gateRows, { note: NOTE_OFF });
      sounding = !gated;
    }
    row += len;
  }
  const total = Math.max(1, row);

  const patterns: Pattern[] = [];
  for (let p = 0; p * PATTERN_ROWS < total; p++) {
    const pat = emptyPattern(1, PATTERN_ROWS);
    pat.id = `p${p}`;
    pat.name = `Pattern ${p + 1}`;
    pat.channels[0].name = 'PC Speaker';
    for (let i = 0; i < PATTERN_ROWS; i++) {
      const c = cells.get(p * PATTERN_ROWS + i);
      if (c) Object.assign(pat.channels[0].rows[i], c);
    }
    patterns.push(pat);
  }

  const base = sauceTitle(bytes) || filename.replace(/\.[^.]+$/, '');
  const sub = blocks.length > 1 ? ` [${current + 1}/${blocks.length}]` : '';
  return {
    name: base + sub,
    format: 'AnsiMusic' as TrackerFormat,
    patterns,
    instruments: [pcSpeakerInstrument()],
    songPositions: patterns.map((_, i) => i),
    songLength: patterns.length,
    restartPosition: 0,
    numChannels: 1,
    initialSpeed: speed,
    initialBPM: bpm,
    fileSubsongs: { count: blocks.length, current, fileName: filename },
  };
}
