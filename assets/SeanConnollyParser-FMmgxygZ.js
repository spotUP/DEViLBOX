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
function encodeSeanConnollyCell(cell) {
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
registerPatternEncoder("seanConnolly", () => encodeSeanConnollyCell);
function emptyCell() {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}
function u16BE(buf, off) {
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function isSeanConnollyFormat(buffer) {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (data.length < 16) return false;
  return data[0] === 96 && data[1] === 0;
}
function parseSeanConnollyFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  const name = filename.replace(/\.[^.]+$/, "").replace(/^[^.]+\./, "");
  const NUM_CHANNELS = 4;
  const ROWS = 64;
  let sampleCount = NUM_CHANNELS;
  try {
    const braDisp = u16BE(buf, 2);
    const initOffset = 2 + braDisp;
    if (initOffset > 4 && initOffset < buf.length - 4) {
      for (let off = initOffset; off < Math.min(initOffset + 256, buf.length - 4); off += 2) {
        const op = u16BE(buf, off);
        if ((op & 61951) === 12348) {
          const val = u16BE(buf, off + 2);
          if (val >= 1 && val <= 32) {
            sampleCount = val;
            break;
          }
        }
      }
    }
  } catch {
  }
  const pattern = {
    id: "pattern-0",
    name: "Pattern 0",
    length: ROWS,
    channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `EMS ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null,
      color: null,
      rows: Array.from({ length: ROWS }, () => emptyCell())
    })),
    importMetadata: {
      sourceFormat: "MOD",
      sourceFile: filename,
      importedAt: (/* @__PURE__ */ new Date()).toISOString(),
      originalChannelCount: NUM_CHANNELS,
      originalPatternCount: 1,
      originalInstrumentCount: sampleCount
    }
  };
  const instruments = Array.from({ length: sampleCount }, (_, i) => ({
    id: i + 1,
    name: `EMS Sample ${i + 1}`,
    type: "sample",
    synthType: "Sampler",
    effects: [],
    volume: -6,
    pan: 0
  }));
  const uadePatternLayout = {
    formatId: "seanConnolly",
    patternDataFileOffset: 0,
    bytesPerCell: 4,
    rowsPerPattern: ROWS,
    numChannels: NUM_CHANNELS,
    numPatterns: 1,
    moduleSize: buffer.byteLength,
    encodeCell: encodeSeanConnollyCell
  };
  return {
    name: `${name} [Sean Connolly EMS]`,
    format: "MOD",
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: NUM_CHANNELS,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename,
    uadePatternLayout
  };
}
export {
  isSeanConnollyFormat,
  parseSeanConnollyFile
};
