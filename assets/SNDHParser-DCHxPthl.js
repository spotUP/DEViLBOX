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
      name: `YM ${String.fromCharCode(65 + i)}`,
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
function readNullTerminated(buf, off, maxLen = 256) {
  let text = "";
  let i = off;
  const end = Math.min(off + maxLen, buf.length);
  while (i < end && buf[i] !== 0) {
    text += String.fromCharCode(buf[i++]);
  }
  return text;
}
function readStringAdvance(buf, off, maxLen = 256) {
  let text = "";
  let i = off;
  const end = Math.min(off + maxLen, buf.length);
  while (i < end && buf[i] !== 0) {
    text += String.fromCharCode(buf[i++]);
  }
  return { text, nextOff: i + 1 };
}
function matchTag(buf, off, tag) {
  if (off + tag.length > buf.length) return false;
  for (let i = 0; i < tag.length; i++) {
    if (buf[off + i] !== tag.charCodeAt(i)) return false;
  }
  return true;
}
function readU16BE(buf, off) {
  return buf[off] << 8 | buf[off + 1];
}
function readU32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function parseSNDHTags(buf) {
  const meta = {
    title: "",
    composer: "",
    ripper: "",
    converter: "",
    year: "",
    numSubsongs: 1,
    durations: [],
    replayFreq: 50
  };
  const scanLimit = Math.min(buf.length, 2048);
  let off = 4;
  while (off < scanLimit - 3) {
    if (matchTag(buf, off, "HDNS")) break;
    if (matchTag(buf, off, "TITL")) {
      const r = readStringAdvance(buf, off + 4);
      meta.title = r.text;
      off = r.nextOff;
      continue;
    }
    if (matchTag(buf, off, "COMM")) {
      const r = readStringAdvance(buf, off + 4);
      meta.composer = r.text;
      off = r.nextOff;
      continue;
    }
    if (matchTag(buf, off, "RIPP")) {
      const r = readStringAdvance(buf, off + 4);
      meta.ripper = r.text;
      off = r.nextOff;
      continue;
    }
    if (matchTag(buf, off, "CONV")) {
      const r = readStringAdvance(buf, off + 4);
      meta.converter = r.text;
      off = r.nextOff;
      continue;
    }
    if (matchTag(buf, off, "YEAR")) {
      const r = readStringAdvance(buf, off + 4);
      meta.year = r.text;
      off = r.nextOff;
      continue;
    }
    if (buf[off] === 35 && buf[off + 1] === 35) {
      const tens = buf[off + 2] - 48;
      const ones = buf[off + 3] - 48;
      if (tens >= 0 && tens <= 9 && ones >= 0 && ones <= 9) {
        meta.numSubsongs = tens * 10 + ones;
      }
      off += 4;
      continue;
    }
    if (matchTag(buf, off, "TIME")) {
      off += 4;
      for (let s = 0; s < meta.numSubsongs && off + 1 < scanLimit; s++) {
        meta.durations.push(readU16BE(buf, off));
        off += 2;
      }
      continue;
    }
    if (buf[off] === 84 && buf[off + 1] === 67 && off + 3 < scanLimit) {
      meta.replayFreq = readU16BE(buf, off + 2);
      off += 4;
      continue;
    }
    if (buf[off] === 84 && buf[off + 1] === 65 && off + 3 < scanLimit) {
      meta.replayFreq = readU16BE(buf, off + 2);
      off += 4;
      continue;
    }
    off++;
  }
  return meta;
}
function parseSC68(buf) {
  const meta = { title: "", author: "", replayFreq: 50 };
  let off = 4;
  while (off < buf.length && buf[off] !== 10) off++;
  off++;
  while (off + 6 <= buf.length) {
    const id0 = String.fromCharCode(buf[off], buf[off + 1]);
    const size = readU32BE(buf, off + 2);
    const dataOff = off + 6;
    if (dataOff + size > buf.length) break;
    if (id0 === "NM") {
      meta.title = readNullTerminated(buf, dataOff, size);
    } else if (id0 === "AN") {
      meta.author = readNullTerminated(buf, dataOff, size);
    } else if (id0 === "FQ" && size >= 2) {
      meta.replayFreq = readU16BE(buf, dataOff);
    }
    off = dataOff + size;
  }
  return meta;
}
function buildAYInstruments() {
  const names = ["YM A", "YM B", "YM C"];
  return names.map((name, i) => ({
    id: i + 1,
    name,
    type: "synth",
    synthType: "FurnaceAY",
    furnace: { ...DEFAULT_FURNACE, chipType: 6, ops: 2 },
    effects: [],
    volume: 0,
    pan: 0
  }));
}
function parseSNDHFile(buffer) {
  const buf = new Uint8Array(buffer);
  if (buf.length < 4) throw new Error("File too small to be SNDH/SC68");
  const magic = String.fromCharCode(buf[0], buf[1], buf[2], buf[3]);
  if (magic === "ICE!" || magic === "Ice!") {
    const instruments2 = buildAYInstruments();
    const pattern2 = emptyPattern("p0", "Pattern 1", 3, 64);
    return {
      name: "ICE-packed SNDH",
      format: "SNDH",
      patterns: [pattern2],
      instruments: instruments2,
      songPositions: [0],
      songLength: 1,
      restartPosition: 0,
      numChannels: 3,
      initialSpeed: 6,
      initialBPM: 125,
      sc68FileData: buffer.slice(0)
    };
  }
  if (magic === "SC68") {
    const sc68 = parseSC68(buf);
    const instruments2 = buildAYInstruments();
    const pattern2 = emptyPattern("p0", "Pattern 1", 3, 64);
    const title2 = sc68.title || "SC68 File";
    return {
      name: title2 + (sc68.author ? ` — ${sc68.author}` : ""),
      format: "SNDH",
      patterns: [pattern2],
      instruments: instruments2,
      songPositions: [0],
      songLength: 1,
      restartPosition: 0,
      numChannels: 3,
      initialSpeed: 6,
      initialBPM: 125,
      sc68FileData: buffer.slice(0)
    };
  }
  if (magic !== "SNDH") throw new Error("Not a valid SNDH/SC68 file");
  const meta = parseSNDHTags(buf);
  const instruments = buildAYInstruments();
  const pattern = emptyPattern("p0", "Pattern 1", 3, 64);
  const title = meta.title || "SNDH File";
  return {
    name: title + (meta.composer ? ` — ${meta.composer}` : ""),
    format: "SNDH",
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: 3,
    initialSpeed: 6,
    initialBPM: 125,
    sc68FileData: buffer.slice(0)
  };
}
export {
  parseSNDHFile
};
