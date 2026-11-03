/**
 * Where the TFMX grid is while the native decoder plays.
 *
 * The decoder (TFMXDecoder::getPlayPosition) reports the trackstep it plays and the mdat
 * file offset of the pattern command its first playing voice is on. The grid has one
 * pattern per shown trackstep (TFMXNativeData.gridSteps) and its rows are pattern
 * commands, each with its file offset (UADEPatternLayout.getCellFileOffset). The row
 * is the one whose command sits at that offset; no time is guessed.
 */
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';

export interface TFMXGridPosition {
  /** Grid pattern index (= song position: the TFMX grid order is 0..n-1). */
  pattern: number;
  row: number;
}

/**
 * The grid pattern and row the decoder is at, or null when the step has no grid
 * pattern or the offset is no command of it (the grid then stays where it was).
 */
export function tfmxGridPositionAt(
  layout: Pick<UADEPatternLayout, 'getCellFileOffset' | 'numChannels'>,
  gridSteps: readonly number[],
  /** Rows of a grid pattern (the tracker pattern's length). */
  rowCount: (pattern: number) => number,
  step: number,
  offset: number,
): TFMXGridPosition | null {
  const pattern = gridSteps.indexOf(step);
  if (pattern < 0 || !layout.getCellFileOffset) return null;
  for (let ch = 0; ch < layout.numChannels; ch++) {
    for (let row = 0, rows = rowCount(pattern); row < rows; row++) {
      if (layout.getCellFileOffset(pattern, row, ch) === offset) return { pattern, row };
    }
  }
  return null;
}
