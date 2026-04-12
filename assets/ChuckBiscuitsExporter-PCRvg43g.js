import { b$ as registerPatternEncoder } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const CMD_NOTE_CUT = 254;
const CMD_SET_SPEED = 15;
const CMD_RETRIG = 27;
function reverseEffect(effTyp, eff) {
  if (effTyp === 0 && eff === 0) return { command: 0, param: 0 };
  if (effTyp === 14) {
    const subCmd = eff >> 4 & 15;
    const subParam = eff & 15;
    return { command: 16 + subCmd, param: subParam };
  }
  if (effTyp === CMD_RETRIG) {
    return { command: 24, param: eff };
  }
  if (effTyp === CMD_SET_SPEED) {
    if (eff >= 20) {
      return { command: 32, param: eff };
    }
    return { command: 31, param: eff };
  }
  if (effTyp >= 0 && effTyp <= 13) {
    return { command: effTyp + 1, param: eff };
  }
  return { command: 0, param: 0 };
}
function encodeCBACell(cell) {
  const out = new Uint8Array(5);
  out[0] = cell.instrument ?? 0;
  const note = cell.note ?? 0;
  if (note === 0) {
    out[1] = 0;
  } else if (note === CMD_NOTE_CUT) {
    out[1] = 255;
  } else {
    const cbaNote = note - 36;
    out[1] = cbaNote >= 1 && cbaNote <= 96 ? cbaNote : 0;
  }
  const vol = cell.volume ?? 0;
  out[2] = vol > 0 ? Math.min(vol + 1, 65) : 0;
  const { command, param } = reverseEffect(cell.effTyp ?? 0, cell.eff ?? 0);
  out[3] = command;
  out[4] = param;
  return out;
}
registerPatternEncoder("chuckBiscuits", () => encodeCBACell);
const HEADER_SIZE = 332;
const SAMPLE_HEADER_SIZE = 48;
const ROWS_PER_PATTERN = 64;
const BYTES_PER_CELL = 5;
const MAX_CHANNELS = 32;
const MAX_ORDERS = 255;
function writeU8(v, off, val) {
  v.setUint8(off, val & 255);
}
function writeU16LE(v, off, val) {
  v.setUint16(off, val & 65535, true);
}
function writeU32LE(v, off, val) {
  v.setUint32(off, val >>> 0, true);
}
function writeString(out, off, str, maxLen) {
  for (let i = 0; i < maxLen; i++) {
    out[off + i] = i < str.length ? str.charCodeAt(i) & 255 : 0;
  }
}
function extractSample(inst) {
  var _a, _b, _c, _d;
  const name = (inst.name ?? "").slice(0, 32);
  const volume = Math.min(64, Math.max(0, Math.round((inst.volume ?? 100) * 64 / 100)));
  if ((_a = inst.sample) == null ? void 0 : _a.audioBuffer) {
    const wav = new DataView(inst.sample.audioBuffer);
    let dataLen = 0;
    try {
      dataLen = wav.getUint32(40, true);
    } catch {
    }
    const frames = Math.floor(dataLen / 2);
    if (frames > 0) {
      const pcm = new Uint8Array(frames);
      for (let j = 0; j < frames; j++) {
        const s16 = wav.getInt16(44 + j * 2, true);
        pcm[j] = s16 >> 8 & 255;
      }
      const loopStart = ((_b = inst.sample) == null ? void 0 : _b.loopStart) ?? 0;
      const loopEnd = ((_c = inst.sample) == null ? void 0 : _c.loopEnd) ?? 0;
      const hasLoop = loopEnd > loopStart;
      const sampleRate = ((_d = inst.sample) == null ? void 0 : _d.sampleRate) ?? 8363;
      return {
        name,
        flags: hasLoop ? 8 : 0,
        volume,
        sampleRate,
        pcmLength: frames,
        loopStart: hasLoop ? loopStart : 0,
        loopEnd: hasLoop ? Math.min(loopEnd, frames) : 0,
        pcm
      };
    }
  }
  return {
    name,
    flags: 0,
    volume,
    sampleRate: 8363,
    pcmLength: 0,
    loopStart: 0,
    loopEnd: 0,
    pcm: new Uint8Array(0)
  };
}
function deltaEncode(pcm) {
  const out = new Uint8Array(pcm.length);
  let prev = 0;
  for (let i = 0; i < pcm.length; i++) {
    const delta = pcm[i] - prev & 255;
    out[i] = delta;
    prev = pcm[i];
  }
  return out;
}
async function exportChuckBiscuits(song) {
  var _a, _b, _c;
  const warnings = [];
  const numChannels = Math.min(MAX_CHANNELS, song.numChannels ?? ((_a = song.patterns[0]) == null ? void 0 : _a.channels.length) ?? 4);
  const numOrders = Math.min(MAX_ORDERS, song.songPositions.length);
  const speed = Math.max(1, song.initialSpeed ?? 6);
  const tempo = Math.max(32, song.initialBPM ?? 125);
  const title = (song.name ?? "").slice(0, 32);
  if (numChannels > MAX_CHANNELS) {
    warnings.push(`Channel count clamped from ${song.numChannels} to ${MAX_CHANNELS}`);
  }
  const usedPatternIndices = /* @__PURE__ */ new Set();
  const orderList = [];
  for (let i = 0; i < numOrders; i++) {
    const patIdx = song.songPositions[i] ?? 0;
    usedPatternIndices.add(patIdx);
    orderList.push(patIdx);
  }
  const sortedPatIndices = [...usedPatternIndices].sort((a, b) => a - b);
  const patIdxMap = /* @__PURE__ */ new Map();
  sortedPatIndices.forEach((songIdx, cbaIdx) => patIdxMap.set(songIdx, cbaIdx));
  const numPatterns = sortedPatIndices.length;
  const lastPattern = Math.max(0, numPatterns - 1);
  const cbaOrderList = orderList.map((idx) => patIdxMap.get(idx) ?? 0);
  const numSamples = Math.min(255, song.instruments.length);
  const samples = [];
  for (let i = 0; i < numSamples; i++) {
    samples.push(extractSample(song.instruments[i]));
  }
  if (song.instruments.length > 255) {
    warnings.push(`Instrument count clamped from ${song.instruments.length} to 255`);
  }
  const patternDataSize = numPatterns * ROWS_PER_PATTERN * numChannels * BYTES_PER_CELL;
  const sampleHeadersSize = numSamples * SAMPLE_HEADER_SIZE;
  const totalSamplePCM = samples.reduce((sum, s) => sum + s.pcmLength, 0);
  const totalSize = HEADER_SIZE + sampleHeadersSize + patternDataSize + totalSamplePCM;
  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);
  output[0] = 67;
  output[1] = 66;
  output[2] = 65;
  output[3] = 249;
  writeString(output, 4, title, 32);
  writeU8(view, 36, 26);
  writeU16LE(view, 37, 0);
  writeU8(view, 39, numChannels);
  writeU8(view, 40, lastPattern);
  writeU8(view, 41, numOrders);
  writeU8(view, 42, numSamples);
  writeU8(view, 43, speed);
  writeU8(view, 44, tempo);
  for (let ch = 0; ch < 32; ch++) {
    if (ch < numChannels && ((_b = song.patterns[0]) == null ? void 0 : _b.channels[ch])) {
      const pan = song.patterns[0].channels[ch].pan ?? 0;
      const panMPT = Math.round(pan / 50 * 256 + 256);
      const panPos = Math.max(0, Math.min(255, Math.round(panMPT / 2)));
      writeU8(view, 45 + ch, panPos);
    } else {
      writeU8(view, 45 + ch, 128);
    }
  }
  for (let i = 0; i < 255; i++) {
    if (i < cbaOrderList.length) {
      writeU8(view, 77 + i, cbaOrderList[i]);
    } else if (i === cbaOrderList.length) {
      writeU8(view, 77 + i, 255);
    } else {
      writeU8(view, 77 + i, 255);
    }
  }
  let pos = HEADER_SIZE;
  for (let i = 0; i < numSamples; i++) {
    const s = samples[i];
    writeString(output, pos, s.name, 32);
    writeU8(view, pos + 32, s.flags);
    writeU8(view, pos + 33, s.volume);
    writeU16LE(view, pos + 34, s.sampleRate);
    writeU32LE(view, pos + 36, s.pcmLength);
    writeU32LE(view, pos + 40, s.loopStart);
    writeU32LE(view, pos + 44, s.loopEnd);
    pos += SAMPLE_HEADER_SIZE;
  }
  for (let cbaPatIdx = 0; cbaPatIdx < numPatterns; cbaPatIdx++) {
    const songPatIdx = sortedPatIndices[cbaPatIdx];
    const pat = songPatIdx < song.patterns.length ? song.patterns[songPatIdx] : null;
    for (let row = 0; row < ROWS_PER_PATTERN; row++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const cell = (_c = pat == null ? void 0 : pat.channels[ch]) == null ? void 0 : _c.rows[row];
        if (cell) {
          const encoded = encodeCBACell(cell);
          output.set(encoded, pos);
        }
        pos += BYTES_PER_CELL;
      }
    }
  }
  for (let i = 0; i < numSamples; i++) {
    const s = samples[i];
    if (s.pcmLength > 0) {
      const deltaPCM = deltaEncode(s.pcm);
      output.set(deltaPCM, pos);
      pos += s.pcmLength;
    }
  }
  const baseName = (song.name ?? "untitled").replace(/[^a-zA-Z0-9_\- ]/g, "").trim() || "untitled";
  const filename = `${baseName}.cba`;
  return {
    data: new Blob([output], { type: "application/octet-stream" }),
    filename,
    warnings
  };
}
export {
  exportChuckBiscuits
};
