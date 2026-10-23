/**
 * Song time to tracker position: the (songPos, row) a song reaches after `ms` of playback.
 *
 * Walks the song order from the start exactly as the replayer advances it: a row lasts
 * `speed * 2.5 / bpm` seconds (ticks of 2.5/bpm), Fxx sets speed (1-31) or tempo (32+),
 * Bxx jumps to an order, Dxx breaks to a row of the next order (BCD in MOD, hex in XM).
 * A jump back to an order already played ends the walk (the song loops there), so a time
 * past the song's end holds the last row reached. Pattern loops and pattern delays are
 * not simulated (they need per-channel state the replayer owns).
 */
import type { TrackerSong } from '@engine/TrackerReplayer';
import type { TrackerCell } from '@/types/tracker';

export type TimedSong = Pick<TrackerSong, 'initialSpeed' | 'initialBPM' | 'songPositions' | 'patterns' | 'songLength'>;

export interface SongPosition { songPos: number; pattPos: number }

type EffectPair = [number | undefined, number | undefined];

function effectsOf(cell: TrackerCell): EffectPair[] {
  const pairs: EffectPair[] = [[cell.effTyp, cell.eff]];
  const c = cell as unknown as Record<string, number | undefined>;
  for (let i = 2; i <= 8; i++) pairs.push([c[`effTyp${i}`], c[`eff${i}`]]);
  return pairs;
}

export function songPositionAtMs(song: TimedSong, ms: number, xmBreakRows = false): SongPosition {
  let speed = song.initialSpeed || 6;
  let bpm = song.initialBPM || 125;
  let remaining = Math.max(0, ms);
  const visited = new Set<number>();
  let songPos = 0;
  let row = 0;
  const last = Math.min(song.songLength, song.songPositions.length);
  let at: SongPosition = { songPos: 0, pattPos: 0 };

  // Bound the walk: a jump into the middle of an order already played could cycle without row 0.
  for (let steps = 0; songPos < last && steps < 1_000_000; steps++) {
    const pattern = song.patterns[song.songPositions[songPos]];
    if (!pattern) break;
    if (row === 0) {
      if (visited.has(songPos)) break;
      visited.add(songPos);
    }
    if (row >= pattern.length) { songPos++; row = 0; continue; }

    let jumpTo: number | null = null;
    let breakRow: number | null = null;
    for (const ch of pattern.channels) {
      const cell = ch.rows[row];
      if (!cell) continue;
      for (const [typ, param] of effectsOf(cell)) {
        if (param === undefined) continue;
        if (typ === 0xF && param > 0) { if (param < 32) speed = param; else bpm = param; }
        else if (typ === 0xB) jumpTo = param;
        else if (typ === 0xD) breakRow = xmBreakRows ? param : (param >> 4) * 10 + (param & 0xF);
      }
    }

    at = { songPos, pattPos: row };
    const rowMs = (speed * 2500) / bpm;
    if (remaining < rowMs) return at;
    remaining -= rowMs;

    if (jumpTo !== null) { songPos = jumpTo; row = breakRow ?? 0; }
    else if (breakRow !== null) { songPos++; row = breakRow; }
    else row++;
  }
  return at;
}
