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
function encodeWantedTeamDaveLoweCell(cell) {
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
registerPatternEncoder("wantedTeamDaveLowe", () => encodeWantedTeamDaveLoweCell);
function emptyCell() {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}
function isWantedTeamDaveLoweFormat(buffer) {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (data.length < 40) return false;
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return dv.getUint32(0, false) === 1011;
}
function parseWantedTeamDaveLoweFile(_buffer, filename) {
  const name = filename.replace(/\.[^.]+$/, "").replace(/^[^.]+\./, "");
  const NUM_CHANNELS = 4;
  const ROWS = 64;
  const pattern = {
    id: "pattern-0",
    name: "Pattern 0",
    length: ROWS,
    channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `DL ${ch + 1}`,
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
  const instruments = Array.from({ length: 4 }, (_, i) => ({
    id: i + 1,
    name: `DaveLowe ${i + 1}`,
    type: "sample",
    synthType: "Sampler",
    effects: [],
    volume: -6,
    pan: 0
  }));
  const uadePatternLayout = {
    formatId: "wantedTeamDaveLowe",
    patternDataFileOffset: 0,
    bytesPerCell: 4,
    rowsPerPattern: ROWS,
    numChannels: NUM_CHANNELS,
    numPatterns: 1,
    moduleSize: _buffer.byteLength,
    encodeCell: encodeWantedTeamDaveLoweCell,
    getCellFileOffset: (pat, row, channel) => {
      const patternByteSize = ROWS * NUM_CHANNELS * 4;
      return pat * patternByteSize + row * NUM_CHANNELS * 4 + channel * 4;
    }
  };
  return {
    name,
    format: "MOD",
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: 125,
    uadePatternLayout
  };
}
export {
  isWantedTeamDaveLoweFormat,
  parseWantedTeamDaveLoweFile
};
