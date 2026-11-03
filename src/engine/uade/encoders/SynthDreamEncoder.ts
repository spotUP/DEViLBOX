/**
 * SynthDreamEncoder - phase A (read-only grid): a SynthDream stream is only ever written back byte-exact,
 * by concatenating the per-word carrier cells (cutoff = 2, period = the 16-bit word, big-endian) that
 * SynthDreamParser records. Rows without a carrier produce no bytes; editing the display grid is phase B.
 */
import type { TrackerCell } from '@/types';
import { registerVariableEncoder, type VariableLengthEncoder } from '../UADEPatternEncoder';

function encodeSynthDreamPattern(rows: TrackerCell[], _channel: number): Uint8Array {
  const bytes: number[] = [];
  for (const cell of rows) {
    if (cell.cutoff === undefined) continue;
    const w = cell.period ?? 0;
    bytes.push((w >> 8) & 0xff, w & 0xff);
  }
  return new Uint8Array(bytes);
}

const synthDreamEncoder: VariableLengthEncoder = { formatId: 'synthDream', encodePattern: encodeSynthDreamPattern };
registerVariableEncoder(synthDreamEncoder);

export { encodeSynthDreamPattern, synthDreamEncoder };
