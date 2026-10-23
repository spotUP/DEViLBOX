/**
 * Song time to tracker position: the (songPos, row) a song reaches after `ms` of playback.
 *
 * Walks the song order from the start exactly as the replayer advances it: a row lasts
 * `speed * 2.5 / bpm` seconds (ticks of 2.5/bpm), Fxx sets speed (1-31) or tempo (32+),
 * Bxx jumps to an order, Dxx breaks to a row of the next order (BCD in MOD, hex in XM).
 * A jump back to an order already played ends the walk (the song loops there), so a time
 * past the song's end holds the last row reached.
 *
 * E6x pattern loops (per channel: E60 marks the start row, E6n loops back n times) and EEx
 * pattern delay (XM only: the row lasts x extra rows of time, effects are not re-read on the
 * repeats) follow TrackerReplayer.advanceRow / processRowForSynths (pBreakFlag, pattDelTime).
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
  // Replayer state: pBreakPos is shared by Dxx and E6x and reset only at an order change.
  let pBreakPos = 0;
  let pBreakFlag = false;
  let posJumpFlag = false;
  let jumpTo: number | null = null;
  let pattDelTime = 0;
  let pattDelTime2 = 0;
  let repeatingRow = false;
  const loopStart: number[] = [];
  const loopCount: number[] = [];

  // Bound the walk: a jump into the middle of an order already played could cycle without row 0.
  for (let steps = 0; songPos < last && steps < 1_000_000; steps++) {
    const pattern = song.patterns[song.songPositions[songPos]];
    if (!pattern) break;
    if (row === 0 && !repeatingRow) {
      if (visited.has(songPos)) break;
      visited.add(songPos);
    }
    if (row >= pattern.length) { songPos++; row = 0; continue; }

    if (!repeatingRow) {
      pattern.channels.forEach((ch, chIdx) => {
        const cell = ch.rows[row];
        if (!cell) return;
        for (const [typ, param] of effectsOf(cell)) {
          if (param === undefined) continue;
          if (typ === 0xF && param > 0) { if (param < 32) speed = param; else bpm = param; }
          else if (typ === 0xB) { jumpTo = param; posJumpFlag = true; }
          else if (typ === 0xD) { pBreakPos = xmBreakRows ? param : (param >> 4) * 10 + (param & 0xF); posJumpFlag = true; }
          else if (typ === 0xE) {
            const sub = (param >> 4) & 0xF;
            const val = param & 0xF;
            if (sub === 0x6) {
              if (val === 0) loopStart[chIdx] = row;
              else if (!loopCount[chIdx]) { loopCount[chIdx] = val; pBreakPos = loopStart[chIdx] ?? 0; pBreakFlag = true; }
              else if (--loopCount[chIdx] > 0) { pBreakPos = loopStart[chIdx] ?? 0; pBreakFlag = true; }
              else loopCount[chIdx] = 0;
            } else if (sub === 0xE && xmBreakRows && val > 0) pattDelTime = val;
          }
        }
      });
    }

    at = { songPos, pattPos: row };
    const rowMs = (speed * 2500) / bpm;
    if (remaining < rowMs) return at;
    remaining -= rowMs;

    // Row advance, in the replayer's order: row++, pattern delay, E6x loop, then order change.
    row++;
    repeatingRow = false;
    if (xmBreakRows) {
      if (pattDelTime > 0) { pattDelTime2 = pattDelTime; pattDelTime = 0; }
      if (pattDelTime2 > 0 && --pattDelTime2 > 0) { row--; repeatingRow = true; }
    }
    if (pBreakFlag) { pBreakFlag = false; row = pBreakPos; }
    if (row >= pattern.length || posJumpFlag) {
      row = pBreakPos;
      pBreakPos = 0;
      songPos = jumpTo !== null ? jumpTo : songPos + 1;
      jumpTo = null;
      posJumpFlag = false;
      repeatingRow = false;
    }
  }
  return at;
}
