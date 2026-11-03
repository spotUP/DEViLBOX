/**
 * BeathovenEncoder - phase A (read-only grid): a Beathoven stream is only ever written back byte-exact,
 * by concatenating the per-word carrier cells (cutoff = 2, period = the 16-bit word, big-endian) that
 * BeathovenParser records. Rows without a carrier produce no bytes.
 */
import type { TrackerCell } from '@/types';
import { registerVariableEncoder, type VariableLengthEncoder } from '../UADEPatternEncoder';

function encodeBeathovenPattern(rows: TrackerCell[], _channel: number): Uint8Array {
  const bytes: number[] = [];
  for (const cell of rows) {
    if (cell.cutoff === undefined) continue;
    const w = cell.period ?? 0;
    bytes.push((w >> 8) & 0xff, w & 0xff);
  }
  return new Uint8Array(bytes);
}

const beathovenEncoder: VariableLengthEncoder = { formatId: 'beathoven', encodePattern: encodeBeathovenPattern };
registerVariableEncoder(beathovenEncoder);

export { encodeBeathovenPattern, beathovenEncoder };
