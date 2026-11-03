/**
 * HowieDaviesEncoder - phase A (read-only grid): a pattern or position list stream is only ever written back
 * byte-exact, by concatenating the per-byte carrier cells (cutoff = 2, period = the byte) that HowieDaviesParser records.
 * Rows without a carrier produce no bytes.
 */
import type { TrackerCell } from '@/types';
import { registerVariableEncoder, type VariableLengthEncoder } from '../UADEPatternEncoder';

function encodeHowieDaviesPattern(rows: TrackerCell[], _channel: number): Uint8Array {
  const bytes: number[] = [];
  for (const cell of rows) {
    if (cell.cutoff === undefined) continue;
    bytes.push((cell.period ?? 0) & 0xff);
  }
  return new Uint8Array(bytes);
}

const howieDaviesEncoder: VariableLengthEncoder = { formatId: 'howieDavies', encodePattern: encodeHowieDaviesPattern };
registerVariableEncoder(howieDaviesEncoder);

export { encodeHowieDaviesPattern, howieDaviesEncoder };
