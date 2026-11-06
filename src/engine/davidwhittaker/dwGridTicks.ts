import type { RowClock } from '@/lib/import/formats/stepRowClock';
import { ROWS_PER_PATTERN } from '@/lib/import/formats/davidWhittakerGrid';

/** The processed tick the replayer must have run for the next tick it plays to be the first of grid row `row` of pattern `pattern`. */
export function dwRowStartTick(clock: RowClock, pattern: number, row = 0): number {
  return clock.rowToTick(Math.max(0, pattern) * ROWS_PER_PATTERN + Math.max(0, row));
}
