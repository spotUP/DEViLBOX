// Serato library — barrel export
export { parseTLVStream, parseNestedTLV, decodeUTF16BE, decodeUTF8 } from './seratoParser';
export { parseSeratoDatabase, type SeratoTrack } from './seratoDatabase';
export { parseSeratoCrate, type SeratoCrate } from './seratoCrates';
export {
  readSeratoMetadata,
  type SeratoCuePoint,
  type SeratoLoop,
  type SeratoBeatMarker,
  type SeratoMetadata,
} from './seratoMetadata';
export {
  pickAndReadSeratoLibrary,
  autoDetectSeratoLibrary,
  readSeratoLibraryElectron,
  readSeratoLibraryBrowser,
  isSeratoLibrary,
  getDefaultSeratoPath,
  type SeratoLibrary,
} from './seratoLocator';
