/**
 * Furnace sub-parser module index — re-exports for clean imports.
 */

export { decompressFur, readString } from './FurnaceBinaryReader';

export {
  parsePattern,
  convertFurnaceCell,
  convertFurnaceNoteValue,
  mapFurnaceEffect,
  NOTE_OFF,
  NOTE_RELEASE,
  MACRO_RELEASE,
} from './FurnacePatternParser';
export type {
  FurnacePatternCell,
  FurnacePattern,
  ConvertedPatternCell,
  FurnaceSubSongRef,
} from './FurnacePatternParser';

export {
  parseInstrument,
  parseFMData,
  parseMacroData,
  parseOperatorMacroData,
} from './FurnaceInstrumentParser';
export type {
  FurnaceInstrument,
  FurnaceMacro,
  FurnaceGBData,
  FurnaceC64Data,
  FurnaceSNESData,
  FurnaceN163Data,
  FurnaceFDSData,
} from './FurnaceInstrumentParser';
