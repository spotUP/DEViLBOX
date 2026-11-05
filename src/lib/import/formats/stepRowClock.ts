/**
 * stepRowClock.ts - the one conversion between a command-stream format's ticks and its grid rows.
 *
 * Rule (thoughts/shared/plans/2026-11-05-step-grid.md): 1 grid row = 1 song step = `speed` ticks. The
 * ticks are the player's PROCESSED ticks (frames the player skips are not counted). A tick that is not
 * the first of its row has an offset (1..speed-1) inside the row. A speed change starts a new row at
 * the tick it runs on: the rows before it keep the old speed, the last of them may be short.
 *
 * Every consumer that turns a tick into a row (grid builder, edit layer, live setCell, export) goes
 * through this module; none divides by the speed itself.
 */

export interface SpeedChange {
  /** Processed tick the speed takes effect on. */
  tick: number;
  /** Ticks per row from then on (an integer, at least 1). */
  speed: number;
}

export interface RowPosition {
  row: number;
  /** Ticks into the row: 0 when the tick is the row's first. */
  offset: number;
}

export interface RowClock {
  /** The row a tick falls in and how far into it. */
  tickToRow(tick: number): RowPosition;
  /** The tick of a row's first tick plus `offset`. */
  rowToTick(row: number, offset?: number): number;
  /** The ticks per row in force at a tick. */
  speedAtTick(tick: number): number;
  /** Rows needed to hold ticks 0..ticks-1. */
  rowsForTicks(ticks: number): number;
}

interface Segment { tick: number; row: number; speed: number }

/**
 * `speedChanges` lists the speed in force from a tick on; the first entry must be at tick 0 and ticks must not
 * decrease. Entries at the same tick: the last wins. A repeat of the speed in force changes nothing.
 */
export function makeRowClock(speedChanges: readonly SpeedChange[]): RowClock {
  if (speedChanges.length === 0 || speedChanges[0].tick !== 0) throw new Error('the row clock needs the speed at tick 0');
  const segs: Segment[] = [];
  for (const c of speedChanges) {
    if (!Number.isInteger(c.speed) || c.speed < 1) throw new Error(`the row clock cannot step by ${c.speed} ticks`);
    const last = segs[segs.length - 1];
    if (last && c.tick < last.tick) throw new Error('the row clock needs speed changes in tick order');
    if (last && c.tick === last.tick) { last.speed = c.speed; continue; }
    if (last && last.speed === c.speed) continue;
    if (last) segs.push({ tick: c.tick, row: last.row + Math.ceil((c.tick - last.tick) / last.speed), speed: c.speed });
    else segs.push({ tick: 0, row: 0, speed: c.speed });
  }
  const segAtTick = (tick: number): Segment => {
    let s = segs[0];
    for (const g of segs) { if (g.tick > tick) break; s = g; }
    return s;
  };
  const segAtRow = (row: number): Segment => {
    let s = segs[0];
    for (const g of segs) { if (g.row > row) break; s = g; }
    return s;
  };
  return {
    tickToRow(tick) {
      const s = segAtTick(tick);
      const d = tick - s.tick;
      return { row: s.row + Math.floor(d / s.speed), offset: d % s.speed };
    },
    rowToTick(row, offset = 0) {
      const s = segAtRow(row);
      return s.tick + (row - s.row) * s.speed + offset;
    },
    speedAtTick: (tick) => segAtTick(tick).speed,
    rowsForTicks(ticks) {
      if (ticks <= 0) return 0;
      return this.tickToRow(ticks - 1).row + 1;
    },
  };
}

/** Greatest common divisor of two positive integers. */
export function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

/**
 * The main step of a format whose notes carry authored durations and no speed command: the GCD of the two most
 * common gaps between consecutive onsets on one voice (deterministic, no threshold; ties go to the shorter gap).
 * `onsetsPerVoice` lists each voice's onset ticks in ascending order. With one distinct gap that gap is the step;
 * with none the step is 1. Shared by every format that derives its step from the notes (Ben Daglish, Sound Factory).
 */
export function mainStepFromOnsets(onsetsPerVoice: readonly (readonly number[])[]): number {
  const counts = new Map<number, number>();
  for (const onsets of onsetsPerVoice) {
    for (let i = 1; i < onsets.length; i++) {
      const d = onsets[i] - onsets[i - 1];
      if (d > 0) counts.set(d, (counts.get(d) ?? 0) + 1);
    }
  }
  const ranked = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  if (ranked.length === 0) return 1;
  return ranked.length === 1 ? ranked[0][0] : gcd(ranked[0][0], ranked[1][0]);
}
