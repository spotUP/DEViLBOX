/**
 * SpecialFXEncoder.ts - Special FX (JD) stream encoder. A track list's or pattern's carrier rows (SpecialFXParser.ts)
 * hold its bytes in the Rob Hubbard carrier fields (cutoff = byte count, period/pan/resonance = the bytes), so encoding
 * is the Rob Hubbard concatenation under its own format id.
 */
import type { TrackerCell } from '@/types';
import { registerVariableEncoder, type VariableLengthEncoder } from '../UADEPatternEncoder';
import { encodeRobHubbardPattern } from './RobHubbardEncoder';

export const specialFXEncoder: VariableLengthEncoder = {
  formatId: 'specialFX',
  encodePattern: (rows: TrackerCell[]) => encodeRobHubbardPattern(rows),
};

registerVariableEncoder(specialFXEncoder);
