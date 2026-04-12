function emptyCell() {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}
function emptyPattern(numCh, rows) {
  return {
    id: "p0",
    name: "Pattern 1",
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
function parseSNDHTags(buf, startOff) {
  const meta = {
    title: "",
    composer: "",
    year: "",
    numSubsongs: 1,
    replayFreq: 50,
    subFormat: "SNDH"
  };
  const scanLimit = Math.min(buf.length, startOff + 2048);
  let off = startOff + 4;
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
    if (buf[off] === 84 && (buf[off + 1] === 67 || buf[off + 1] === 65) && off + 3 < scanLimit) {
      meta.replayFreq = readU16BE(buf, off + 2);
      off += 4;
      continue;
    }
    off++;
  }
  return meta;
}
function parseSC68Container(buf) {
  const meta = {
    title: "",
    composer: "",
    year: "",
    numSubsongs: 1,
    replayFreq: 50,
    subFormat: "SC68"
  };
  let off = 4;
  while (off < buf.length && buf[off] !== 10) off++;
  off++;
  while (off + 6 <= buf.length) {
    const id0 = String.fromCharCode(buf[off], buf[off + 1]);
    const size = readU32BE(buf, off + 2);
    const dataOff = off + 6;
    if (dataOff + size > buf.length) break;
    if (id0 === "NM") meta.title = readNullTerminated(buf, dataOff, size);
    else if (id0 === "AN") meta.composer = readNullTerminated(buf, dataOff, size);
    else if (id0 === "FQ" && size >= 2) meta.replayFreq = readU16BE(buf, dataOff);
    off = dataOff + size;
  }
  return meta;
}
function isSc68Format(data) {
  const bytes = new Uint8Array(data);
  if (bytes.length < 4) return false;
  if (bytes.length >= 15) {
    let match = true;
    const expected = "SC68 Music-file";
    for (let i = 0; i < 15 && match; i++) {
      if (bytes[i] !== expected.charCodeAt(i)) match = false;
    }
    if (match) return true;
  }
  if (bytes.length >= 16 && matchTag(bytes, 12, "SNDH")) return true;
  if (matchTag(bytes, 0, "ICE!")) return true;
  return false;
}
function extractMetadata(data) {
  const buf = new Uint8Array(data);
  if (buf.length >= 4 && matchTag(buf, 0, "SC68")) {
    return parseSC68Container(buf);
  }
  if (buf.length >= 16 && matchTag(buf, 12, "SNDH")) {
    return parseSNDHTags(buf, 12);
  }
  return {
    title: "",
    composer: "",
    year: "",
    numSubsongs: 1,
    replayFreq: 50,
    subFormat: "ICE"
  };
}
async function parseSc68File(fileName, data) {
  const meta = extractMetadata(data);
  const baseName = fileName.replace(/\.(sc68|sndh|snd)$/i, "");
  let title = meta.title || baseName;
  if (meta.composer) title += ` — ${meta.composer}`;
  title += ` [${meta.subFormat}]`;
  const NUM_CHANNELS = 3;
  const pattern = emptyPattern(NUM_CHANNELS, 64);
  const ymInst = {
    id: 1,
    name: "YM2149 Channel",
    type: "synth",
    synthType: "Sc68Synth",
    effects: [],
    volume: 0,
    pan: 0
  };
  return {
    name: title,
    format: "MOD",
    patterns: [pattern],
    instruments: [ymInst],
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: NUM_CHANNELS,
    initialSpeed: 6,
    initialBPM: 125,
    sc68FileData: data.slice(0)
  };
}
export {
  isSc68Format,
  parseSc68File
};
