/**
 * TonyWilliamsEncoder.ts - byte-exact carrier encoder for Tony Williams (Sound Images) blocks.
 * A block is a list of carrier cells, one per stream command: cutoff = byte length, period = op,
 * pan/resonance/eff/eff2 = operand bytes 1..4 (docs/FORMAT_COMMAND_STREAM_GRID.md).
 */
import type { TrackerCell } from '@/types';
import { registerVariableEncoder, type VariableLengthEncoder } from '../UADEPatternEncoder';

export function encodeTonyWilliamsBlock(rows: TrackerCell[]): Uint8Array {
  const out: number[] = [];
  for (const c of rows) {
    const len = c.cutoff;
    if (len === undefined) continue;
    const ops = [c.period, c.pan, c.resonance, c.eff, c.eff2];
    for (let i = 0; i < len; i++) out.push((ops[i] ?? 0) & 0xff);
  }
  return new Uint8Array(out);
}

export const tonyWilliamsEncoder: VariableLengthEncoder = {
  formatId: 'tonyWilliams',
  encodePattern: (rows: TrackerCell[]) => encodeTonyWilliamsBlock(rows),
};

registerVariableEncoder(tonyWilliamsEncoder);
