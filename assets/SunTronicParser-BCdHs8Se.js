import { c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function u16BE(buf, off) {
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function s16BE(buf, off) {
  const v = buf[off] << 8 | buf[off + 1];
  return v < 32768 ? v : v - 65536;
}
function isSunTronicFormat(buffer) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < 16) return false;
  if (u32BE(buf, 0) !== 1223163902) return false;
  if (u16BE(buf, 4) !== 19962) return false;
  const off8 = u32BE(buf, 8);
  return off8 === 1244528664 || off8 === 1244528656;
}
function resolveDataPointers(buf) {
  const len = buf.length;
  if (len < 8) return null;
  const baseDisp = s16BE(buf, 6);
  const maxWords = Math.min(Math.floor(len / 2), 32768);
  let pos = 0;
  let found43EE = -1;
  for (let i = 0; i < maxWords && pos + 3 < len; i++, pos += 2) {
    if (u16BE(buf, pos) === 17390) {
      found43EE = pos;
      break;
    }
  }
  if (found43EE < 0 || found43EE + 3 >= len) return null;
  const disp43EE = s16BE(buf, found43EE + 2);
  const ptrDA = disp43EE + baseDisp + 6;
  if (ptrDA < 0 || ptrDA >= len) return null;
  pos = 0;
  let wordsLeft = maxWords;
  let found45EE_1 = -1;
  for (; wordsLeft >= 0 && pos + 3 < len; wordsLeft--, pos += 2) {
    if (u16BE(buf, pos) === 17902) {
      found45EE_1 = pos;
      pos += 2;
      wordsLeft--;
      break;
    }
  }
  if (found45EE_1 < 0) return null;
  let found45EE_2 = -1;
  for (; wordsLeft >= 0 && pos + 3 < len; wordsLeft--, pos += 2) {
    if (u16BE(buf, pos) === 17902) {
      found45EE_2 = pos;
      pos += 2;
      break;
    }
  }
  if (found45EE_2 < 0 || found45EE_2 + 3 >= len) return null;
  const disp45EE_2 = s16BE(buf, found45EE_2 + 2);
  const ptrE2 = disp45EE_2 + baseDisp + 6;
  if (ptrE2 < 0 || ptrE2 >= len) return null;
  let found45EE_3 = -1;
  for (; wordsLeft >= 0 && pos + 3 < len; wordsLeft--, pos += 2) {
    if (u16BE(buf, pos) === 17902) {
      found45EE_3 = pos;
      break;
    }
  }
  if (found45EE_3 < 0 || found45EE_3 + 3 >= len) return null;
  const disp45EE_3 = s16BE(buf, found45EE_3 + 2);
  const ptrD6 = disp45EE_3 + baseDisp + 6;
  if (ptrD6 < 0 || ptrD6 >= len) return null;
  return { ptrDA, ptrE2, ptrD6 };
}
function extractSamples(buf, ptrDA, ptrE2, ptrD6) {
  const instruments = [];
  if (ptrE2 + 3 >= buf.length) return makePlaceholderInstruments(4);
  const origin = u32BE(buf, ptrE2);
  const samplePtrs = [];
  for (let i = 0; i < 4; i++) {
    const off = ptrDA + i * 4;
    if (off + 3 >= buf.length) break;
    const absPtr = u32BE(buf, off);
    samplePtrs.push(absPtr);
  }
  if (samplePtrs.length < 4) {
    return makePlaceholderInstruments(4);
  }
  const fileOffsets = samplePtrs.map((p) => p - origin);
  const validOffsets = [...new Set(fileOffsets.filter((o) => o >= 0 && o < buf.length))].sort((a, b) => a - b);
  const upperBound = Math.min(ptrDA, ptrE2, ptrD6, buf.length);
  validOffsets.push(upperBound);
  for (let i = 0; i < 4; i++) {
    const fileOff = fileOffsets[i];
    if (fileOff < 0 || fileOff >= buf.length) {
      instruments.push({
        id: i + 1,
        name: `SunTronic ${i + 1}`,
        type: "synth",
        synthType: "Synth",
        effects: [],
        volume: 0,
        pan: 0
      });
      continue;
    }
    const bIdx = validOffsets.indexOf(fileOff);
    const end = bIdx >= 0 && bIdx + 1 < validOffsets.length ? validOffsets[bIdx + 1] : Math.min(fileOff + 65536, buf.length);
    const pcmLength = end - fileOff;
    if (pcmLength > 0 && fileOff + pcmLength <= buf.length) {
      const pcm = buf.slice(fileOff, fileOff + pcmLength);
      instruments.push(createSamplerInstrument(
        i + 1,
        `SunTronic ${i + 1}`,
        pcm,
        64,
        8287,
        0,
        0
      ));
    } else {
      instruments.push({
        id: i + 1,
        name: `SunTronic ${i + 1}`,
        type: "synth",
        synthType: "Synth",
        effects: [],
        volume: 0,
        pan: 0
      });
    }
  }
  return instruments;
}
function makePlaceholderInstruments(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `SunTronic ${i + 1}`,
    type: "synth",
    synthType: "Synth",
    effects: [],
    volume: 0,
    pan: 0
  }));
}
function parseSunTronicFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (!isSunTronicFormat(buf)) {
    throw new Error("Not a SunTronic module");
  }
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/\.sun$/i, "").replace(/\.tsm$/i, "") || baseName;
  const variantByte = buf[11];
  const ptrs = resolveDataPointers(buf);
  let instruments;
  if (ptrs) {
    const { ptrDA, ptrE2, ptrD6 } = ptrs;
    if (variantByte === 16 && ptrDA + 16 < buf.length) ;
    instruments = extractSamples(buf, ptrDA, ptrE2, ptrD6);
  } else {
    instruments = makePlaceholderInstruments(4);
  }
  if (instruments.length === 0) {
    instruments = makePlaceholderInstruments(4);
  }
  const emptyRows = Array.from({ length: 64 }, () => ({
    note: 0,
    instrument: 0,
    volume: 0,
    effTyp: 0,
    eff: 0,
    effTyp2: 0,
    eff2: 0
  }));
  const pattern = {
    id: "pattern-0",
    name: "Pattern 0",
    length: 64,
    channels: Array.from({ length: 4 }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null,
      color: null,
      rows: emptyRows
    })),
    importMetadata: {
      sourceFormat: "MOD",
      sourceFile: filename,
      importedAt: (/* @__PURE__ */ new Date()).toISOString(),
      originalChannelCount: 4,
      originalPatternCount: 1,
      originalInstrumentCount: instruments.length
    }
  };
  if (instruments.length === 0) console.warn("[SunTronic] no instruments extracted");
  const song = {
    name: `${moduleName} [SunTronic]`,
    format: "SunTronic",
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename
  };
  if (song.patterns.length === 0) console.warn("[SunTronic] no patterns extracted");
  if (song.instruments.length === 0) console.warn("[SunTronic] no instruments extracted");
  return song;
}
export {
  isSunTronicFormat,
  parseSunTronicFile
};
