import { c2 as createSamplerInstrument, c6 as encodeMODCell } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function u8(v, off) {
  return v.getUint8(off);
}
function u16be(v, off) {
  return v.getUint16(off, false);
}
function readString(v, off, len) {
  let s = "";
  for (let i = 0; i < len; i++) {
    const c = v.getUint8(off + i);
    if (c === 0) break;
    if (c >= 32) s += String.fromCharCode(c);
  }
  return s.trim();
}
function countInvalidChars(v, off, len) {
  let count = 0;
  for (let i = 0; i < len; i++) {
    const c = v.getUint8(off + i);
    if (c !== 0 && (c < 32 || c > 126)) count++;
  }
  return count;
}
const SONG_NAME_SIZE = 20;
const SAMPLE_HDR_SIZE = 30;
const NUM_SAMPLES = 15;
const FILE_HDR_SIZE = 130;
const HEADER_BLOCK_SIZE = SONG_NAME_SIZE + NUM_SAMPLES * SAMPLE_HDR_SIZE + FILE_HDR_SIZE;
const NUM_CHANNELS = 4;
const ROWS_PER_PATTERN = 64;
const PATTERN_BYTES = NUM_CHANNELS * ROWS_PER_PATTERN * 4;
const AMIGA_PERIOD_TABLE = [
  // Octave 1: C-1 to B-1
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
  // Octave 2: C-2 to B-2
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
  // Octave 3: C-3 to B-3
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
function periodToNote(period) {
  if (period === 0) return 0;
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < AMIGA_PERIOD_TABLE.length; i++) {
    const d = Math.abs(AMIGA_PERIOD_TABLE[i] - period);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx + 13;
}
function isSTKFormat(buffer) {
  if (buffer.byteLength < HEADER_BLOCK_SIZE + PATTERN_BYTES) return false;
  const v = new DataView(buffer);
  if (v.getUint8(0) === 83 && v.getUint8(1) === 80 && v.getUint8(2) === 83) return true;
  let invalidCharsInTitle = countInvalidChars(v, 0, SONG_NAME_SIZE);
  let invalidChars = invalidCharsInTitle;
  let totalSampleLen = 0;
  let allVolumes = 0;
  let validNameCount = 0;
  let invalidNames = false;
  for (let smp = 0; smp < NUM_SAMPLES; smp++) {
    const base = SONG_NAME_SIZE + smp * SAMPLE_HDR_SIZE;
    const nameInvalid = countInvalidChars(v, base, 22);
    invalidChars += nameInvalid;
    const finetune = u8(v, base + 24);
    if (finetune !== 0) invalidChars += 16;
    const volume = u8(v, base + 25);
    const lengthW = u16be(v, base + 22);
    let hasValidChars = false;
    let hasInvalidChars = false;
    for (let i = 0; i < 22; i++) {
      const c = v.getUint8(base + i);
      if (c === 0) break;
      if (c >= 32 && c <= 126) hasValidChars = true;
      else hasInvalidChars = true;
    }
    if (hasValidChars && !hasInvalidChars) validNameCount++;
    if (hasInvalidChars) invalidNames = true;
    if (invalidChars > 48) return false;
    if (volume > 64) return false;
    if (lengthW > 37e3) return false;
    totalSampleLen += lengthW;
    allVolumes |= volume;
  }
  if (invalidCharsInTitle > 5 && (validNameCount < 4 || invalidNames)) return false;
  if (totalSampleLen === 0 || allVolumes === 0) return false;
  const fhBase = SONG_NAME_SIZE + NUM_SAMPLES * SAMPLE_HDR_SIZE;
  const numOrders = u8(v, fhBase);
  const restartPos = u8(v, fhBase + 1);
  if (numOrders > 128) return false;
  if (restartPos > 220) return false;
  let maxPattern = 0;
  for (let i = 0; i < 128; i++) {
    const p = u8(v, fhBase + 2 + i);
    if (p > maxPattern) maxPattern = p;
  }
  if (maxPattern > 63) return false;
  if (restartPos === 0 && numOrders === 0 && maxPattern === 0) return false;
  if (buffer.byteLength < HEADER_BLOCK_SIZE + PATTERN_BYTES) return false;
  return true;
}
async function parseSTKFile(buffer, filename) {
  const v = new DataView(buffer);
  const raw = new Uint8Array(buffer);
  const songName = readString(v, 0, SONG_NAME_SIZE);
  const sampleInfos = [];
  for (let smp = 0; smp < NUM_SAMPLES; smp++) {
    const base = SONG_NAME_SIZE + smp * SAMPLE_HDR_SIZE;
    const name = readString(v, base, 22);
    const lengthWords = u16be(v, base + 22);
    const volume = Math.min(u8(v, base + 25), 64);
    const loopStart = u16be(v, base + 26);
    const loopLengthWords = u16be(v, base + 28);
    sampleInfos.push({ name, lengthWords, volume, loopStart, loopLengthWords });
  }
  const fhBase = SONG_NAME_SIZE + NUM_SAMPLES * SAMPLE_HDR_SIZE;
  const numOrders = u8(v, fhBase);
  let restartPos = u8(v, fhBase + 1);
  const titleBuf = raw.slice(0, 6);
  const titleStr = String.fromCharCode(...titleBuf);
  if (titleStr === "jjk55\0" || titleStr.startsWith("jjk55")) {
    restartPos = 120;
  }
  if (!restartPos) restartPos = 120;
  const orderList = [];
  for (let i = 0; i < 128; i++) {
    orderList.push(u8(v, fhBase + 2 + i));
  }
  const usedOrders = numOrders > 0 ? orderList.slice(0, numOrders) : orderList;
  let numPatterns = 0;
  for (const p of usedOrders) {
    if (p + 1 > numPatterns) numPatterns = p + 1;
  }
  if (numPatterns === 0) numPatterns = 1;
  let maxPatFromAll = 0;
  for (let i = 0; i < 128; i++) {
    const p = u8(v, fhBase + 2 + i);
    if (p > maxPatFromAll) maxPatFromAll = p;
  }
  const maxPossiblePats = Math.floor(
    (buffer.byteLength - HEADER_BLOCK_SIZE) / PATTERN_BYTES
  );
  numPatterns = Math.min(Math.max(numPatterns, maxPatFromAll + 1), maxPossiblePats, 64);
  let initialBPM = 125;
  if (restartPos !== 120) {
    initialBPM = Math.round(709379 * 125 / 50 / ((240 - restartPos) * 122));
    initialBPM = Math.max(1, Math.min(255, initialBPM));
  }
  const initialSpeed = 6;
  const effectiveNumOrders = Math.max(1, Math.min(numOrders, 128));
  const songOrders = orderList.slice(0, effectiveNumOrders);
  const patternStart = HEADER_BLOCK_SIZE;
  const patternArray = [];
  const patIdxToArrayIdx = /* @__PURE__ */ new Map();
  const patternSet = /* @__PURE__ */ new Set();
  for (const p of songOrders) patternSet.add(p);
  for (let p = 0; p < numPatterns; p++) patternSet.add(p);
  const sortedPatterns = Array.from(patternSet).sort((a, b) => a - b);
  for (const patIdx of sortedPatterns) {
    const patOff = patternStart + patIdx * PATTERN_BYTES;
    if (patOff + PATTERN_BYTES > buffer.byteLength) continue;
    const channels = [];
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const rows = [];
      for (let row = 0; row < ROWS_PER_PATTERN; row++) {
        const cellBase = patOff + (row * NUM_CHANNELS + ch) * 4;
        const b0 = u8(v, cellBase);
        const b1 = u8(v, cellBase + 1);
        const b2 = u8(v, cellBase + 2);
        const b3 = u8(v, cellBase + 3);
        const sampleHi = b0 >> 4 & 15;
        const period = (b0 & 15) << 8 | b1;
        const sampleLo = b2 >> 4 & 15;
        const effect = b2 & 15;
        const param = b3;
        const instrument = sampleHi << 4 | sampleLo;
        const note = periodToNote(period);
        let effTyp = 0;
        let eff = 0;
        if (effect !== 0 || param !== 0) {
          switch (effect) {
            case 0:
              if (param >= 3) {
                effTyp = 0;
                eff = param;
              }
              break;
            case 1:
              effTyp = 0;
              eff = param;
              break;
            case 2:
              if (param & 15) {
                effTyp = 2;
                eff = param & 15;
              } else if (param >> 4) {
                effTyp = 1;
                eff = param >> 4;
              }
              break;
            case 12:
              effTyp = 12;
              eff = param & 127;
              break;
            case 13:
              effTyp = 10;
              eff = param;
              break;
            case 14:
              effTyp = 14;
              eff = param;
              break;
            case 15:
              effTyp = 15;
              eff = param & 15;
              break;
          }
        }
        rows.push({
          note,
          instrument,
          volume: 0,
          effTyp,
          eff,
          effTyp2: 0,
          eff2: 0
        });
      }
      channels.push({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: ch % 2 === 0 ? -50 : 50,
        // Amiga LRRL panning
        instrumentId: null,
        color: null,
        rows
      });
    }
    const arrIdx = patternArray.length;
    patIdxToArrayIdx.set(patIdx, arrIdx);
    patternArray.push({
      id: `pattern-${patIdx}`,
      name: `Pattern ${patIdx}`,
      length: ROWS_PER_PATTERN,
      channels,
      importMetadata: {
        sourceFormat: "STK",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: NUM_CHANNELS,
        originalPatternCount: numPatterns,
        originalInstrumentCount: NUM_SAMPLES
      }
    });
  }
  const songPositions = [];
  for (const patIdx of songOrders) {
    const arrIdx = patIdxToArrayIdx.get(patIdx);
    if (arrIdx !== void 0) songPositions.push(arrIdx);
  }
  if (songPositions.length === 0) songPositions.push(0);
  let sampleDataOff = HEADER_BLOCK_SIZE + numPatterns * PATTERN_BYTES;
  const instruments = [];
  for (let smp = 0; smp < NUM_SAMPLES; smp++) {
    const info = sampleInfos[smp];
    const id = smp + 1;
    const name = info.name || `Sample ${id}`;
    const lengthBytes = info.lengthWords * 2;
    if (lengthBytes < 4 || info.volume === 0) {
      sampleDataOff += lengthBytes;
      instruments.push({
        id,
        name,
        type: "sample",
        synthType: "Sampler",
        effects: [],
        volume: -60,
        pan: 0
      });
      continue;
    }
    const loopStart = info.loopStart;
    const loopLenBytes = info.loopLengthWords * 2;
    const hasLoop = loopLenBytes > 2;
    const skipBytes = hasLoop ? loopStart : 0;
    const actualOff = sampleDataOff + skipBytes;
    const actualLen = lengthBytes - skipBytes;
    let pcm;
    if (actualOff + actualLen <= buffer.byteLength && actualLen > 0) {
      pcm = raw.slice(actualOff, actualOff + actualLen);
    } else if (sampleDataOff + lengthBytes <= buffer.byteLength) {
      pcm = raw.slice(sampleDataOff, sampleDataOff + lengthBytes);
    } else {
      const avail = Math.max(0, buffer.byteLength - sampleDataOff);
      pcm = avail > 0 ? raw.slice(sampleDataOff, sampleDataOff + avail) : new Uint8Array(0);
    }
    sampleDataOff += lengthBytes;
    if (pcm.length === 0) {
      instruments.push({
        id,
        name,
        type: "sample",
        synthType: "Sampler",
        effects: [],
        volume: -60,
        pan: 0
      });
      continue;
    }
    const effectiveLoopEnd = hasLoop ? loopLenBytes : 0;
    instruments.push(
      createSamplerInstrument(
        id,
        name,
        pcm,
        info.volume,
        8287,
        // Amiga C-3 playback rate for period-based samples
        0,
        // loopStart = 0 after skip
        effectiveLoopEnd
      )
    );
  }
  const uadePatternLayout = {
    formatId: "stk",
    patternDataFileOffset: HEADER_BLOCK_SIZE,
    bytesPerCell: 4,
    rowsPerPattern: ROWS_PER_PATTERN,
    numChannels: NUM_CHANNELS,
    numPatterns,
    moduleSize: buffer.byteLength,
    encodeCell: encodeMODCell
  };
  return {
    name: songName || filename.replace(/\.[^/.]+$/, ""),
    format: "MOD",
    patterns: patternArray,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: NUM_CHANNELS,
    initialSpeed,
    initialBPM,
    linearPeriods: false,
    uadePatternLayout
  };
}
export {
  isSTKFormat,
  parseSTKFile
};
