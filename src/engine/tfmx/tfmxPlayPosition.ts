/**
 * Where the TFMX grid is while the native decoder plays.
 *
 * The decoder (TFMXDecoder::getPlayPosition) reports the trackstep it plays, the mdat file
 * offset of the pattern command its first playing voice is on, and the ticks that voice
 * still waits on it. The grid has one pattern per shown trackstep (TFMXNativeData.gridSteps)
 * and its rows are pattern ticks (TFMXNativeData.gridRowTicks); a command sits on the row of
 * the tick it plays, with its file offset (UADEPatternLayout.getCellFileOffset). The row is
 * the command's tick plus the ticks of its wait already played; no time is guessed.
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
  gridRowTicks: readonly (readonly number[])[],
  /** Rows of a grid pattern (the tracker pattern's length). */
  rowCount: (pattern: number) => number,
  step: number,
  offset: number,
  /** Ticks the voice still waits on the command (decoder tr.pattern.wait); -1 when unknown. */
  wait: number,
): TFMXGridPosition | null {
  const pattern = gridSteps.indexOf(step);
  if (pattern < 0 || !layout.getCellFileOffset) return null;
  const ticks = gridRowTicks[pattern];
  const rows = rowCount(pattern);
  for (let ch = 0; ch < layout.numChannels; ch++) {
    for (let row = 0; row < rows; row++) {
      if (layout.getCellFileOffset(pattern, row, ch) !== offset) continue;
      if (!ticks || wait < 0) return { pattern, row };
      // The command's ticks run to the tick of the voice's next command.
      const tick = ticks[row];
      let next = row + 1;
      while (next < rows && (layout.getCellFileOffset(pattern, next, ch) ?? -1) < 0) next++;
      const duration = next < rows ? ticks[next] - tick : 0;
      if (duration <= 0) return { pattern, row };
      // wait counts down from duration - 1 to 0 over the command's ticks.
      const target = tick + Math.min(duration - 1, Math.max(0, duration - 1 - wait));
      const at = ticks.indexOf(target, row);
      return { pattern, row: at < 0 ? row : at };
    }
  }
  return null;
}
