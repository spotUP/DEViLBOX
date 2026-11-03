/**
 * TimFollinEncoder - phase A (read-only grid): a Tim Follin stream is only ever written back byte-exact,
 * by concatenating the per-byte carrier cells (cutoff = 1, period = the byte) that TimFollinParser records.
 * Rows without a carrier produce no bytes; editing the display grid is phase B.
 */
import type { TrackerCell } from '@/types';
import { registerVariableEncoder, type VariableLengthEncoder } from '../UADEPatternEncoder';

function encodeTimFollinPattern(rows: TrackerCell[], _channel: number): Uint8Array {
  const bytes: number[] = [];
  for (const cell of rows) {
    if (cell.cutoff === undefined) continue;
    bytes.push((cell.period ?? 0) & 0xff);
  }
  return new Uint8Array(bytes);
}

const timFollinEncoder: VariableLengthEncoder = { formatId: 'timFollin', encodePattern: encodeTimFollinPattern };
registerVariableEncoder(timFollinEncoder);

export { encodeTimFollinPattern, timFollinEncoder };
