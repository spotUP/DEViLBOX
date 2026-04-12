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
      name: `CH ${i + 1}`,
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
function parseHeader(buf, dv) {
  const magic = String.fromCharCode(buf[0], buf[1], buf[2], buf[3]);
  if (magic !== "KSCC" && magic !== "KSSX") throw new Error("Not a valid KSS file");
  const header = {
    magic,
    loadAddress: dv.getUint16(4, true),
    loadSize: dv.getUint16(6, true),
    initAddress: dv.getUint16(8, true),
    playAddress: dv.getUint16(10, true),
    bankMode: buf[12],
    extraHeaderSize: buf[13],
    deviceFlags: buf[14],
    extraDataStart: 0,
    extraDataSize: 0
  };
  if (magic === "KSSX" && buf.length >= 32) {
    header.extraDataStart = dv.getUint32(16, true);
    header.extraDataSize = dv.getUint32(20, true);
  }
  return header;
}
function detectChips(flags) {
  return {
    ay8910: true,
    scc: true,
    opll: (flags & 1) !== 0,
    sn76489: (flags & 2) !== 0,
    y8950: (flags & 8) !== 0
  };
}
function buildInstruments(chips) {
  const insts = [];
  let id = 1;
  let totalChannels = 0;
  const add = (name, synthType, chipType, ops, channels) => {
    insts.push({
      id: id++,
      name,
      type: "synth",
      synthType,
      furnace: { ...DEFAULT_FURNACE, chipType, ops },
      effects: [],
      volume: 0,
      pan: 0
    });
    totalChannels += channels;
  };
  add("AY PSG", "FurnaceAY", 6, 2, 3);
  add("SCC Wave", "FurnaceSCC", 53, 2, 5);
  if (chips.opll) add("OPLL FM", "FurnaceOPLL", 13, 2, 9);
  if (chips.sn76489) add("SN PSG", "FurnacePSG", 0, 2, 4);
  if (chips.y8950) add("MSX-AUDIO", "FurnaceY8950", 14, 2, 10);
  if (totalChannels === 0) {
    add("AY PSG", "FurnaceAY", 6, 2, 3);
  }
  return { instruments: insts, totalChannels };
}
function parseKSSFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  const dv = new DataView(buffer);
  if (buf.length < 16) throw new Error("KSS file too small");
  const header = parseHeader(buf, dv);
  const chips = detectChips(header.deviceFlags);
  const layout = buildInstruments(chips);
  const { instruments, totalChannels } = layout;
  const numCh = Math.max(totalChannels, 1);
  const numRows = 64;
  const pattern = emptyPattern("p0", "Pattern 0", numCh, numRows);
  const title = (filename || "KSS File").replace(/\.kss$/i, "");
  return {
    name: title,
    format: "KSS",
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
  parseKSSFile
};
