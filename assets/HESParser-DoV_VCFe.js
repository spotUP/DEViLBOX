import { D as DEFAULT_FURNACE } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function emptyCell() {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}
function emptyPattern(id, name, numCh, rows) {
  return {
    id,
    name,
    length: rows,
    channels: Array.from({ length: numCh }, (_, i) => ({
      id: `ch${i}`,
      name: `Wave Ch ${i + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: 0,
      instrumentId: null,
      color: null,
      rows: Array.from({ length: rows }, emptyCell)
    }))
  };
}
function buildPCEInstruments() {
  const insts = [];
  let id = 1;
  for (let i = 0; i < 6; i++) {
    insts.push({
      id: id++,
      name: `PCE Wave ${i + 1}`,
      type: "synth",
      synthType: "FurnacePCE",
      furnace: { ...DEFAULT_FURNACE, chipType: 6, ops: 2 },
      effects: [],
      volume: 0,
      pan: 0
    });
  }
  return insts;
}
function isHESFormat(buffer) {
  const b = new Uint8Array(buffer);
  return b.length >= 4 && b[0] === 72 && b[1] === 69 && b[2] === 83 && b[3] === 77;
}
function parseHESFile(buffer, filename) {
  if (!isHESFormat(buffer)) throw new Error("Not a valid HES file");
  const numCh = 6;
  const instruments = buildPCEInstruments();
  const pattern = emptyPattern("p0", "Pattern 1", numCh, 64);
  const title = (filename ?? "PC Engine Music").replace(/\.hes$/i, "");
  return {
    name: title,
    format: "HES",
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: numCh,
    initialSpeed: 6,
    initialBPM: 125
  };
}
export {
  isHESFormat,
  parseHESFile
};
