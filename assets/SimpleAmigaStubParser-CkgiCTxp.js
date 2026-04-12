import { b$ as registerPatternEncoder } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const MOD_PERIODS = [
  856,
  808,
  762,
  720,
  678,
  640,
  604,
  570,
  538,
  508,
  480,
  453,
  428,
  404,
  381,
  360,
  339,
  320,
  302,
  285,
  269,
  254,
  240,
  226,
  214,
  202,
  190,
  180,
  170,
  160,
  151,
  143,
  135,
  127,
  120,
  113
];
function xmNoteToPeriod(xmNote) {
  if (xmNote === 0) return 0;
  const periodIdx = xmNote - 37;
  if (periodIdx < 0 || periodIdx >= MOD_PERIODS.length) return 0;
  return MOD_PERIODS[periodIdx];
}
function encodeSimpleAmigaStubCell(cell) {
  const out = new Uint8Array(4);
  const period = xmNoteToPeriod(cell.note ?? 0);
  const instr = cell.instrument ?? 0;
  const effTyp = cell.effTyp ?? 0;
  const eff = cell.eff ?? 0;
  out[0] = instr & 240 | period >> 8 & 15;
  out[1] = period & 255;
  out[2] = (instr & 15) << 4 | effTyp & 15;
  out[3] = eff & 255;
  return out;
}
registerPatternEncoder("sonicArrangerSas", () => encodeSimpleAmigaStubCell);
registerPatternEncoder("soundFactoryStub", () => encodeSimpleAmigaStubCell);
registerPatternEncoder("leggless", () => encodeSimpleAmigaStubCell);
registerPatternEncoder("mikeDavies", () => encodeSimpleAmigaStubCell);
registerPatternEncoder("markII", () => encodeSimpleAmigaStubCell);
registerPatternEncoder("aProSys", () => encodeSimpleAmigaStubCell);
registerPatternEncoder("artAndMagic", () => encodeSimpleAmigaStubCell);
function emptyCell() {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}
function makeStubSong(buffer, filename, formatName, formatId, channels = 4) {
  const name = filename.replace(/\.[^.]+$/, "").replace(/^[^.]+\./, "");
  const ROWS = 64;
  const pattern = {
    id: "pattern-0",
    name: "Pattern 0",
    length: ROWS,
    channels: Array.from({ length: channels }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `${formatName} ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null,
      color: null,
      rows: Array.from({ length: ROWS }, () => emptyCell())
    }))
  };
  const instruments = Array.from({ length: channels }, (_, i) => ({
    id: i + 1,
    name: `${formatName} ${i + 1}`,
    type: "sample",
    synthType: "Sampler",
    effects: [],
    volume: -6,
    pan: 0
  }));
  const uadePatternLayout = {
    formatId,
    patternDataFileOffset: 0,
    bytesPerCell: 4,
    rowsPerPattern: ROWS,
    numChannels: channels,
    numPatterns: 1,
    moduleSize: buffer.byteLength,
    encodeCell: encodeSimpleAmigaStubCell
  };
  return {
    name,
    format: "MOD",
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: channels,
    initialSpeed: 6,
    initialBPM: 125,
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename,
    uadePatternLayout
  };
}
function parseMarkIIFile(buffer, filename) {
  return makeStubSong(buffer, filename, "MK2", "markII");
}
function parseAProSysFile(buffer, filename) {
  return makeStubSong(buffer, filename, "APS", "aProSys");
}
function parseArtAndMagicFile(buffer, filename) {
  return makeStubSong(buffer, filename, "AAM", "artAndMagic");
}
export {
  parseAProSysFile,
  parseArtAndMagicFile,
  parseMarkIIFile
};
