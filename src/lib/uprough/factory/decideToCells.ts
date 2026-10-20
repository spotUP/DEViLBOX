/**
 * Act 2 (R2f): one host `decide` event -> the tracker cells it writes. The event's `cells` are the host's raw
 * section-record entries (protocol section 3.1), so this is the inverse direction of barEvents.songFileToBarEvents:
 * the same lane homes, the same volume rounding, the same note numbering as tools/song_file.py export.
 *
 *   drums   dev_merged entry [voice, step, vel, role] or a hat object {step, voice, vel, ...}
 *   bass    bev: the 808 dict {trap808: [{step, semi}], ...} or the gen_bass tuple list [semi, step, dur, glide, vel]
 *   melody  notes [midi, step, len]
 * `chops` and `vocals` are not grid lanes: they write no cells.
 */
import { roundHalfEven } from '@/engine/dj/scratch/scratchGrit';
import { FILE_VOICES, LANES, ROWS_PER_BAR, noteFromText, type Lane } from '../songFile';
import { hostNoteName } from '../barEvents';

export interface FillCell { lane: Lane; row: number; note: number; instrument: number; volume: number }

/** Voice -> home lane (tools/song_file.py _HOME_LANE; the voices not named go to perc1, a taken row to perc2). */
const HOME: Record<string, Lane> = {
  kick: 'kick', snare: 'snare', snare_accent: 'snare', snare_ghost: 'snare', clap: 'clap', ch: 'hat', oh: 'hat',
};
const DRUM_NOTE = 'C-4';
const VOLUME_BASE = 0x10; // XM volume column: 0x10-0x50 = volume 0-64, as songFile.importChannel writes it

/** The provisional instrument number of a file voice; the finished song's own table replaces it on load. */
export const provisionalInstrument = (fileVoice: string): number => FILE_VOICES.indexOf(fileVoice as typeof FILE_VOICES[number]) + 1;

const asList = (x: unknown): unknown[] => (x === null || x === undefined ? [] : Array.isArray(x) ? x : [x]);

/** Lane of a voice, given which lane/rows are already taken (the overflow rule). */
function placeDrum(voice: string, row: number, taken: Set<string>): Lane {
  const home: Lane = HOME[voice] ?? 'perc1';
  const lane: Lane = home !== 'perc2' && !taken.has(`${home}:${row}`) ? home : 'perc2';
  taken.add(`${lane}:${row}`);
  return lane;
}

export function decideToCells(
  lane: string, bar: number, cells: readonly unknown[], taken: Set<string> = new Set(),
): FillCell[] {
  const base = bar * ROWS_PER_BAR;
  const out: FillCell[] = [];
  if (lane === 'drums') {
    for (const hit of asList(cells)) {
      let voice: string; let step: number; let volume: number;
      if (Array.isArray(hit)) {
        voice = String(hit[0]); step = Number(hit[1]); volume = roundHalfEven(Number(hit[2]) * 64);
      } else if (hit && typeof hit === 'object') {
        const h = hit as { voice: string; step: number; vel: number };
        voice = h.voice; step = h.step; volume = roundHalfEven((h.vel * 64) / 127);
      } else continue;
      const row = base + step;
      out.push({ lane: placeDrum(voice, row, taken), row, note: noteFromText(DRUM_NOTE), instrument: provisionalInstrument(voice), volume: VOLUME_BASE + volume });
    }
  } else if (lane === 'bass') {
    for (const bev of asList(cells)) {
      const events: { semi: number; step: number }[] = [];
      if (bev && !Array.isArray(bev) && typeof bev === 'object' && Array.isArray((bev as { trap808?: unknown }).trap808)) {
        for (const e of (bev as { trap808: { semi: number; step: number }[] }).trap808) events.push({ semi: e.semi, step: e.step });
      } else if (Array.isArray(bev)) {
        for (const e of bev) if (Array.isArray(e)) events.push({ semi: Number(e[0]), step: Number(e[1]) });
      }
      for (const e of events) {
        out.push({ lane: 'bass', row: base + e.step, note: noteFromText(hostNoteName(36 + e.semi)), instrument: provisionalInstrument('bass808'), volume: VOLUME_BASE + 64 });
      }
    }
  } else if (lane === 'melody') {
    // The melody window decides the row; a polyphonic bar spreads its overlapping notes over melody1..4.
    const busyUntil: number[] = [0, 0, 0, 0];
    for (const n of asList(cells)) {
      if (!Array.isArray(n)) continue;
      const [midi, step, len] = n as [number, number, number];
      const slot = busyUntil.findIndex((until) => until <= step);
      const k = slot < 0 ? 0 : slot;
      busyUntil[k] = step + Math.max(1, len);
      const target = LANES[LANES.indexOf('melody1') + k]!;
      out.push({ lane: target, row: base + step, note: noteFromText(hostNoteName(midi)), instrument: provisionalInstrument('melody'), volume: VOLUME_BASE + 64 });
    }
  }
  return out;
}
