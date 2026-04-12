import { e as encodeEarAcheCell } from "./EarAcheEncoder-DTpkdNs_.js";
import "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function emptyCell() {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}
function isEarAcheFormat(buffer) {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (data.length < 4) return false;
  return data[0] === 69 && data[1] === 65 && data[2] === 83 && data[3] === 79;
}
function parseEarAcheFile(buffer, filename) {
  const name = filename.replace(/\.[^.]+$/, "").replace(/^[^.]+\./, "");
  const NUM_CHANNELS = 4;
  const ROWS = 64;
  const pattern = {
    id: "pattern-0",
    name: "Pattern 0",
    length: ROWS,
    channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `EarAche ${ch + 1}`,
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
    name: `EarAche ${i + 1}`,
    type: "sample",
    synthType: "Sampler",
    effects: [],
    volume: -6,
    pan: 0
  }));
  const uadePatternLayout = {
    formatId: "earAche",
    patternDataFileOffset: 0,
    bytesPerCell: 4,
    rowsPerPattern: ROWS,
    numChannels: NUM_CHANNELS,
    numPatterns: 1,
    moduleSize: buffer.byteLength,
    encodeCell: encodeEarAcheCell,
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
    uadePatternLayout,
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename
  };
}
export {
  isEarAcheFormat,
  parseEarAcheFile
};
