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
function readNullTermString(buf, off, maxLen) {
  let end = off;
  const limit = Math.min(off + maxLen, buf.length);
  while (end < limit && buf[end] !== 0) end++;
  const decoder = new TextDecoder("latin1");
  return decoder.decode(buf.subarray(off, end)).trim();
}
function readAsciiInt(buf, off, len) {
  const s = readNullTermString(buf, off, len);
  const n = parseInt(s, 10);
  return isNaN(n) ? 0 : n;
}
function parseID666(buf) {
  const hasTag = buf[35] === 26;
  if (!hasTag) {
    return {
      title: "",
      game: "",
      dumper: "",
      comments: "",
      dateDumped: "",
      songLengthSec: 0,
      fadeLengthMs: 0,
      artist: ""
    };
  }
  const title = readNullTermString(buf, 46, 32);
  const game = readNullTermString(buf, 78, 16);
  const dumper = readNullTermString(buf, 94, 16);
  const comments = readNullTermString(buf, 110, 32);
  const dateDumped = readNullTermString(buf, 142, 11);
  const songLengthSec = readAsciiInt(buf, 153, 3);
  const fadeLengthMs = readAsciiInt(buf, 156, 5);
  const artist = readNullTermString(buf, 161, 32);
  return { title, game, dumper, comments, dateDumped, songLengthSec, fadeLengthMs, artist };
}
const XID6_TITLE = 1;
const XID6_GAME = 2;
const XID6_ARTIST = 3;
const XID6_DUMPER = 4;
function parseXid6(buf, tags) {
  const off = 66048;
  if (buf.length < off + 8) return tags;
  if (buf[off] !== 120 || buf[off + 1] !== 105 || buf[off + 2] !== 100 || buf[off + 3] !== 54) return tags;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const chunkDataSize = dv.getUint32(off + 4, true);
  const endOff = Math.min(off + 8 + chunkDataSize, buf.length);
  let pos = off + 8;
  while (pos + 4 <= endOff) {
    const id = buf[pos];
    const type = buf[pos + 1];
    const data = dv.getUint16(pos + 2, true);
    pos += 4;
    if (type === 0) {
      continue;
    }
    const payloadLen = data;
    if (pos + payloadLen > endOff) break;
    if (type === 1) {
      const str = readNullTermString(buf, pos, payloadLen);
      if (id === XID6_TITLE && str) tags = { ...tags, title: str };
      if (id === XID6_GAME && str) tags = { ...tags, game: str };
      if (id === XID6_ARTIST && str) tags = { ...tags, artist: str };
      if (id === XID6_DUMPER && str) tags = { ...tags, dumper: str };
    }
    pos += payloadLen + 3 & -4;
  }
  return tags;
}
function readDSPVoices(buf) {
  const dspBase = 65792;
  if (buf.length < dspBase + 128) return [];
  const voices = [];
  for (let v = 0; v < 8; v++) {
    const base = dspBase + v * 16;
    voices.push({
      volL: buf[base + 0],
      volR: buf[base + 1],
      pitchL: buf[base + 2],
      pitchH: buf[base + 3],
      srcn: buf[base + 4],
      adsr1: buf[base + 5],
      adsr2: buf[base + 6],
      gain: buf[base + 7]
    });
  }
  return voices;
}
function buildInstruments(_voices) {
  const insts = [];
  for (let v = 0; v < 8; v++) {
    insts.push({
      id: v + 1,
      name: `Voice ${v + 1}`,
      type: "synth",
      synthType: "FurnaceSNES",
      furnace: { ...DEFAULT_FURNACE, chipType: 41 },
      effects: [],
      volume: 0,
      pan: 0
    });
  }
  return insts;
}
function isSPCFormat(buffer) {
  if (buffer.byteLength < 256) return false;
  const b = new Uint8Array(buffer);
  const magic = "SNES-SPC700 Sound File Data";
  for (let i = 0; i < magic.length; i++) {
    if (b[i] !== magic.charCodeAt(i)) return false;
  }
  return true;
}
function parseSPCFile(buffer) {
  if (!isSPCFormat(buffer)) throw new Error("Not a valid SPC file");
  const buf = new Uint8Array(buffer);
  let tags = parseID666(buf);
  tags = parseXid6(buf, tags);
  readDSPVoices(buf);
  const instruments = buildInstruments();
  const numCh = 8;
  const numRows = 64;
  const pattern = emptyPattern("p0", "Pattern 1", numCh, numRows);
  const title = tags.title || tags.game || "SPC";
  const name = title + (tags.artist ? ` — ${tags.artist}` : "") + (tags.game && tags.title ? ` (${tags.game})` : "");
  return {
    name,
    format: "SPC",
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
  isSPCFormat,
  parseSPCFile
};
