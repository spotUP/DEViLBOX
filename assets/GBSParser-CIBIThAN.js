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
      name: GB_CHANNEL_NAMES[i] ?? `GB ${i + 1}`,
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
function readFixedString(buf, off, len) {
  let text = "";
  for (let i = 0; i < len; i++) {
    const b = buf[off + i];
    if (b === 0) break;
    text += String.fromCharCode(b);
  }
  return text;
}
const GBS_HEADER_SIZE = 112;
const GB_NUM_CHANNELS = 4;
const GB_CHANNEL_NAMES = ["Pulse 1", "Pulse 2", "Wave", "Noise"];
const DEFAULT_PATTERN_ROWS = 64;
function parseGBSHeader(buf) {
  if (buf.length < GBS_HEADER_SIZE) throw new Error("File too small for GBS header");
  if (buf[0] !== 71 || buf[1] !== 66 || buf[2] !== 83) {
    throw new Error("Not a valid GBS file (bad magic)");
  }
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return {
    version: buf[3],
    numSongs: buf[4],
    firstSong: buf[5],
    loadAddr: dv.getUint16(6, true),
    initAddr: dv.getUint16(8, true),
    playAddr: dv.getUint16(10, true),
    stackPointer: dv.getUint16(12, true),
    timerModulo: buf[14],
    timerControl: buf[15],
    title: readFixedString(buf, 16, 32),
    author: readFixedString(buf, 48, 32),
    copyright: readFixedString(buf, 80, 32)
  };
}
function buildGBInstruments() {
  return GB_CHANNEL_NAMES.map((name, i) => ({
    id: i + 1,
    name,
    type: "synth",
    synthType: "FurnaceGB",
    furnace: { ...DEFAULT_FURNACE, chipType: 6, ops: 2 },
    effects: [],
    volume: 0,
    pan: 0
  }));
}
function parseGBSFile(buffer) {
  const buf = new Uint8Array(buffer);
  const hdr = parseGBSHeader(buf);
  const pattern = emptyPattern("p0", "Pattern 1", GB_NUM_CHANNELS, DEFAULT_PATTERN_ROWS);
  const instruments = buildGBInstruments();
  const name = hdr.title || "Untitled GBS";
  return {
    name: name + (hdr.author ? ` — ${hdr.author}` : ""),
    format: "GBS",
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: GB_NUM_CHANNELS,
    initialSpeed: 1,
    initialBPM: 60
  };
}
export {
  parseGBSFile
};
