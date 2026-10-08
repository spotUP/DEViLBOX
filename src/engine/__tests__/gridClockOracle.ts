/**
 * The clock oracle shared by the tick-grid tests (dwGridMatchesPaula, bdGridMatchesPaula): the
 * seconds a grid note sits at on the tracker's scheduler, against the seconds the ORIGINAL player
 * starts a note at (UADE's Paula register writes read by gridOracle).
 *
 * The scheduler (TrackerReplayer) moves the cursor one row every initialSpeed * 2.5 / initialBPM
 * seconds. A grid whose rows are 50 Hz replayer ticks therefore needs initialSpeed 1 at 125 BPM;
 * the module's own song speed there puts the cursor at a third, a fifth or a sixth of the sound.
 */
import { PaulaSession, PaulaNoteOns, PAULA_CHUNK, type PaulaLogModule, type PaulaWrite } from './gridOracle';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const MS_PER_CHUNK = (PAULA_CHUNK / 44100) * 1000;
/** A period rewritten within this long of the voice's last note-on is the same note (arpeggio, a re-armed pointer). */
const SAME_NOTE_MS = 40;

/** Seconds a grid row lasts on the tracker's scheduler. */
export function rowSeconds(song: Pick<TrackerSong, 'initialSpeed' | 'initialBPM'>): number {
  return ((song.initialSpeed ?? 6) * 2.5) / (song.initialBPM ?? 125);
}

/** Per voice, the seconds at which the grid starts a note, rows laid out in song order on the scheduler's clock. */
export function gridOnsets(song: Pick<TrackerSong, 'patterns' | 'songPositions' | 'initialSpeed' | 'initialBPM'>): number[][] {
  const out: number[][] = song.patterns[0].channels.map(() => []);
  const sec = rowSeconds(song);
  let row = 0;
  for (const p of song.songPositions) {
    const pat = song.patterns[p];
    pat.channels.forEach((c, ch) => c.rows.forEach((r, i) => { if (r.note > 0 && r.note < 97) out[ch].push((row + i) * sec); }));
    row += pat.length;
  }
  return out;
}

/** Per Paula voice, the seconds at which the player started a note in the first `seconds` of the session. */
export function paulaOnsetsOf(sess: PaulaSession, seconds: number): number[][] {
  const ons = new PaulaNoteOns('armed');
  const out: number[][] = [[], [], [], []];
  const feed = (writes: PaulaWrite[], ms: number): void => {
    for (const w of writes) {
      if (ons.push(w) === null || w.voice > 3) continue;
      const l = out[w.voice];
      if (l.length === 0 || ms - l[l.length - 1] > SAME_NOTE_MS) l.push(ms);
    }
  };
  feed(sess.drain(), 0);
  for (let i = 0; i < (seconds * 1000) / MS_PER_CHUNK; i++) {
    const w = sess.step();
    if (!w) break;
    feed(w, (i + 1) * MS_PER_CHUNK);
  }
  sess.close();
  return out.map((l) => l.map((ms) => ms / 1000));
}

export interface VoiceCoverage { voice: number; notes: number; hit: number }

/** Per voice with at least `minNotes` grid notes up to `span` seconds: how many sit within `toleranceMs` of a note the player starts. */
export function onsetCoverage(grid: number[][], paula: number[][], span: number, toleranceMs: number, minNotes = 5): VoiceCoverage[] {
  const out: VoiceCoverage[] = [];
  grid.forEach((onsets, voice) => {
    const inSpan = onsets.filter((t) => t <= span);
    if (inSpan.length < minNotes || !paula[voice]) return;
    out.push({ voice, notes: inSpan.length, hit: inSpan.filter((t) => paula[voice].some((p) => Math.abs(p - t) * 1000 <= toleranceMs)).length });
  });
  return out;
}

export { MS_PER_CHUNK };
export type { PaulaLogModule };
