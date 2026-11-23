/**
 * ArtAndMagicEncoder.ts - Art and Magic note-stream encoder. A pattern's carrier rows (ArtAndMagicParser.ts) hold its
 * bytes one per row in the Rob Hubbard carrier fields (cutoff = 1, period = byte), so encoding is the Rob Hubbard
 * concatenation under its own format id.
 */
import type { TrackerCell } from '@/types';
import { registerVariableEncoder, type VariableLengthEncoder } from '../UADEPatternEncoder';
import { encodeRobHubbardPattern } from './RobHubbardEncoder';

export const artAndMagicEncoder: VariableLengthEncoder = {
  formatId: 'artAndMagic',
  encodePattern: (rows: TrackerCell[]) => encodeRobHubbardPattern(rows),
};

registerVariableEncoder(artAndMagicEncoder);
