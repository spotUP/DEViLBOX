/**
 * SunTronicPlayhead.ts - the grid row the music is on, for the playhead.
 *
 * The native SunTronic engine renders on the main thread: the renderer's player
 * decodes voice 0's rows as it renders, ahead of what the worklet has played. This
 * log keeps (sample the row was decoded at, grid row) and answers "which grid row is
 * the music on at sample N" from the samples the worklet reports as consumed.
 *
 * The grid is one pass of the replayer's walk (SunTronicWalk): flat row i = the i-th
 * group voice 0 decoded, drawn as pattern floor(i / rowsPerPattern), row i % rowsPerPattern.
 * A live group is placed on that walk by its (position,row) key, following the walk
 * in order and re-finding its place when the song loops.
 */
import type { SunWalkGroup } from './SunTronicPlayer';

export interface SunPlayheadRow { songPos: number; row: number }

export class SunPlayhead {
  private readonly keys: string[];
  private readonly log: Array<{ sample: number; idx: number }> = [];
  private next = 0;

  private readonly rowsPerPattern: number;

  constructor(walkVoice0: SunWalkGroup[], rowsPerPattern = 64) {
    this.rowsPerPattern = rowsPerPattern;
    this.keys = walkVoice0.map((g) => `${g.position}:${g.row}`);
  }

  /** Voice 0 decoded `group` when the renderer was at `sample`. */
  push(sample: number, group: { position: number; row: number }): void {
    const key = `${group.position}:${group.row}`;
    let idx = this.next;
    if (this.keys[idx] !== key) {
      // The song looped (or the walk ended): find the group's place from the top.
      idx = this.keys.indexOf(key);
      if (idx < 0) return;
    }
    this.log.push({ sample, idx });
    this.next = idx + 1;
  }

  /** The row the music is on at `sample` (consumed samples), or null before the first row. */
  at(sample: number): SunPlayheadRow | null {
    let k = -1;
    for (let i = 0; i < this.log.length && this.log[i].sample <= sample; i++) k = i;
    if (k < 0) return null;
    if (k > 0) this.log.splice(0, k);
    const idx = this.log[0].idx;
    return { songPos: Math.floor(idx / this.rowsPerPattern), row: idx % this.rowsPerPattern };
  }

  clear(): void { this.log.length = 0; this.next = 0; }
}
