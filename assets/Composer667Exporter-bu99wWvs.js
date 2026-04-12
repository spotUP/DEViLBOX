import { e as encode669Cell } from "./Composer667Encoder-o8O1EiUD.js";
import "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const HEADER_SIZE = 497;
const SAMPLE_HDR_SIZE = 25;
const NUM_CHANNELS = 8;
const ROWS_PER_PATTERN = 64;
const BYTES_PER_CELL = 3;
const PATTERN_SIZE = ROWS_PER_PATTERN * NUM_CHANNELS * BYTES_PER_CELL;
const MAX_SAMPLES = 64;
const MAX_PATTERNS = 128;
const MAX_ORDERS = 128;
const ORDER_END = 255;
const EFF_SPEED = 15;
const EFF_PATTERN_BREAK = 13;
function writeU8(buf, off, val) {
  buf[off] = val & 255;
}
function writeU32LE(buf, off, val) {
  buf[off] = val & 255;
  buf[off + 1] = val >>> 8 & 255;
  buf[off + 2] = val >>> 16 & 255;
  buf[off + 3] = val >>> 24 & 255;
}
function writeStr(buf, off, str, len) {
  for (let i = 0; i < len; i++) {
    buf[off + i] = i < str.length ? str.charCodeAt(i) & 255 : 0;
  }
}
function extractSample(inst) {
  var _a;
  if (!((_a = inst == null ? void 0 : inst.sample) == null ? void 0 : _a.audioBuffer)) return null;
  const wavBuf = inst.sample.audioBuffer;
  if (wavBuf.byteLength < 44) return null;
  const wav = new DataView(wavBuf);
  const dataLen = wav.getUint32(40, true);
  const bitsPerSample = wav.getUint16(34, true);
  const frames = bitsPerSample === 16 ? Math.floor(dataLen / 2) : dataLen;
  if (frames === 0) return null;
  const pcm = new Uint8Array(frames);
  if (bitsPerSample === 16) {
    for (let j = 0; j < frames; j++) {
      const s16 = wav.getInt16(44 + j * 2, true);
      pcm[j] = (s16 >> 8) + 128 & 255;
    }
  } else {
    for (let j = 0; j < frames; j++) {
      pcm[j] = wav.getUint8(44 + j);
    }
  }
  const loopStart = inst.sample.loopStart ?? 0;
  const loopEnd = inst.sample.loopEnd ?? 0;
  return {
    name: (inst.name ?? "").slice(0, 13),
    pcm,
    length: frames,
    loopStart,
    loopEnd
  };
}
function extractSpeedFromPattern(song, patIdx) {
  var _a;
  const pat = song.patterns[patIdx];
  if (!pat) return 0;
  const cell = (_a = pat.channels[0]) == null ? void 0 : _a.rows[0];
  if (!cell) return 0;
  if ((cell.effTyp ?? 0) === EFF_SPEED && (cell.eff ?? 0) > 0) {
    return Math.min(15, cell.eff ?? 0);
  }
  return 0;
}
function extractBreakFromPattern(song, patIdx) {
  var _a;
  const pat = song.patterns[patIdx];
  if (!pat) return 63;
  const ch0Rows = (_a = pat.channels[0]) == null ? void 0 : _a.rows;
  if (!ch0Rows) return 63;
  for (let row = 0; row < ROWS_PER_PATTERN; row++) {
    const cell = ch0Rows[row];
    if (cell && (cell.effTyp ?? 0) === EFF_PATTERN_BREAK) {
      return Math.min(63, row);
    }
  }
  return 63;
}
async function exportComposer667(song) {
  var _a, _b;
  const warnings = [];
  const numSamples = Math.min(MAX_SAMPLES, song.instruments.length);
  if (song.instruments.length > MAX_SAMPLES) {
    warnings.push(
      `Composer 669 supports max ${MAX_SAMPLES} samples; ${song.instruments.length - MAX_SAMPLES} instruments were dropped.`
    );
  }
  const sampleSlots = [];
  for (let i = 0; i < numSamples; i++) {
    sampleSlots.push(extractSample(song.instruments[i]));
  }
  const numPatterns = Math.min(MAX_PATTERNS, song.patterns.length);
  if (song.patterns.length > MAX_PATTERNS) {
    warnings.push(
      `Composer 669 supports max ${MAX_PATTERNS} patterns; ${song.patterns.length - MAX_PATTERNS} were dropped.`
    );
  }
  const orderCount = Math.min(MAX_ORDERS, song.songPositions.length);
  if (song.songPositions.length > MAX_ORDERS) {
    warnings.push(
      `Composer 669 supports max ${MAX_ORDERS} order entries; ${song.songPositions.length - MAX_ORDERS} were dropped.`
    );
  }
  if (orderCount === 0) {
    warnings.push("Song has no order list entries; defaulting to pattern 0.");
  }
  let totalPCM = 0;
  for (let i = 0; i < numSamples; i++) {
    const s = sampleSlots[i];
    if (s) totalPCM += s.length;
  }
  const patternDataBase = HEADER_SIZE + numSamples * SAMPLE_HDR_SIZE;
  const sampleDataBase = patternDataBase + numPatterns * PATTERN_SIZE;
  const totalSize = sampleDataBase + totalPCM;
  const output = new Uint8Array(totalSize);
  output[0] = 105;
  output[1] = 102;
  const songName = (song.name || "Untitled").slice(0, 36);
  writeStr(output, 2, songName, 36);
  writeU8(output, 110, numSamples);
  writeU8(output, 111, numPatterns);
  writeU8(output, 112, Math.min(127, song.restartPosition ?? 0));
  for (let i = 0; i < 128; i++) {
    if (i < orderCount) {
      const patIdx = song.songPositions[i] ?? 0;
      output[113 + i] = Math.min(numPatterns - 1, patIdx);
    } else {
      output[113 + i] = ORDER_END;
    }
  }
  const defaultSpeed = Math.min(15, Math.max(1, song.initialSpeed ?? 4));
  for (let i = 0; i < 128; i++) {
    if (i < orderCount) {
      const patIdx = song.songPositions[i] ?? 0;
      const speed = extractSpeedFromPattern(song, patIdx);
      output[241 + i] = speed > 0 ? speed : defaultSpeed;
    } else {
      output[241 + i] = defaultSpeed;
    }
  }
  for (let i = 0; i < 128; i++) {
    if (i < orderCount) {
      const patIdx = song.songPositions[i] ?? 0;
      output[369 + i] = extractBreakFromPattern(song, patIdx);
    } else {
      output[369 + i] = 0;
    }
  }
  let hdrOff = HEADER_SIZE;
  for (let i = 0; i < numSamples; i++) {
    const s = sampleSlots[i];
    const name = (s == null ? void 0 : s.name) || ((_a = song.instruments[i]) == null ? void 0 : _a.name) || "";
    writeStr(output, hdrOff, name, 13);
    if (s) {
      writeU32LE(output, hdrOff + 13, s.length);
      writeU32LE(output, hdrOff + 17, s.loopStart);
      writeU32LE(output, hdrOff + 21, s.loopEnd);
    }
    hdrOff += SAMPLE_HDR_SIZE;
  }
  for (let p = 0; p < numPatterns; p++) {
    const pat = song.patterns[p];
    const patBase = patternDataBase + p * PATTERN_SIZE;
    for (let row = 0; row < ROWS_PER_PATTERN; row++) {
      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        const cellOff = patBase + (row * NUM_CHANNELS + ch) * BYTES_PER_CELL;
        const cell = (_b = pat == null ? void 0 : pat.channels[ch]) == null ? void 0 : _b.rows[row];
        if (!cell) {
          output[cellOff] = 255;
          output[cellOff + 1] = 0;
          output[cellOff + 2] = 255;
          continue;
        }
        const effTyp = cell.effTyp ?? 0;
        const isInjectedSpeed = effTyp === EFF_SPEED && ch === 0 && row === 0;
        const isInjectedBreak = effTyp === EFF_PATTERN_BREAK && ch === 0;
        const cellToEncode = isInjectedSpeed || isInjectedBreak ? { ...cell, effTyp: 0, eff: 0 } : cell;
        const encoded = encode669Cell(cellToEncode);
        output[cellOff] = encoded[0];
        output[cellOff + 1] = encoded[1];
        output[cellOff + 2] = encoded[2];
      }
    }
  }
  let pcmOff = sampleDataBase;
  for (let i = 0; i < numSamples; i++) {
    const s = sampleSlots[i];
    if (s && s.pcm.length > 0) {
      output.set(s.pcm, pcmOff);
      pcmOff += s.pcm.length;
    }
  }
  const baseName = (song.name || "untitled").replace(/[^a-zA-Z0-9_.-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "untitled";
  const filename = `${baseName}.669`;
  return {
    data: new Blob([output], { type: "application/octet-stream" }),
    filename,
    warnings
  };
}
export {
  exportComposer667
};
