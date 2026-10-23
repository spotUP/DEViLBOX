/**
 * SoundFXEncoder -- registers the SoundFX cell encoder with the UADE pattern-encoder registry.
 * The codec itself (decode + encode, effect map, carrier) lives in soundfxCellCodec.ts.
 */
import { registerPatternEncoder } from '../UADEPatternEncoder';
import { encodeSoundFXCell } from './soundfxCellCodec';

registerPatternEncoder('soundfx', () => (cell) => encodeSoundFXCell(cell));

export { encodeSoundFXCell };
