/**
 * Ben Daglish SID encoder: every file pattern is one track of carrier rows (benDaglishSIDGrid.ts: cutoff = length,
 * period/pan/resonance/envMod = bytes 0..3), so a track encodes back through the Rob Hubbard carrier encoder.
 */
import type { TrackerCell } from '@/types';
import { registerVariableEncoder, type VariableLengthEncoder } from '../UADEPatternEncoder';
import { encodeRobHubbardPattern } from './RobHubbardEncoder';

export const benDaglishSIDEncoder: VariableLengthEncoder = {
  formatId: 'benDaglishSID',
  encodePattern: (rows: TrackerCell[]) => encodeRobHubbardPattern(rows),
};

registerVariableEncoder(benDaglishSIDEncoder);
