import { e as encodeXMFCell } from "./XMFEncoder-q5F4y1aF.js";
import "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const SAMPLE_HDR_SIZE = 16;
const NUM_SAMPLE_SLOTS = 256;
const ROWS_PER_PATTERN = 64;
const CELL_SIZE = 6;
const SMP_LOOP = 8;
const SMP_BIDI = 16;
const TYPE_OFFSET = 0;
const SAMPLES_OFFSET = 1;
const ORDERS_OFFSET = 1 + NUM_SAMPLE_SLOTS * SAMPLE_HDR_SIZE;
const CHANNEL_OFFSET = ORDERS_OFFSET + NUM_SAMPLE_SLOTS;
function writeU8(view, off, val) {
  view.setUint8(off, val & 255);
}
function writeU16LE(view, off, val) {
  view.setUint16(off, val & 65535, true);
}
function writeU24LE(view, off, val) {
  view.setUint8(off, val & 255);
  view.setUint8(off + 1, val >> 8 & 255);
  view.setUint8(off + 2, val >> 16 & 255);
}
function extractSampleData(inst) {
  const sample = inst == null ? void 0 : inst.sample;
  if (!(sample == null ? void 0 : sample.audioBuffer)) return null;
  const wav = new DataView(sample.audioBuffer);
  if (sample.audioBuffer.byteLength < 44) return null;
  const dataLen = wav.getUint32(40, true);
  const bitsPerSample = wav.getUint16(34, true);
  const wavSampleRate = wav.getUint16(24, true) | wav.getUint16(26, true) << 16;
  const frames = bitsPerSample === 16 ? Math.floor(dataLen / 2) : dataLen;
  const pcm = new Uint8Array(frames);
  if (bitsPerSample === 16) {
    for (let j = 0; j < frames; j++) {
      const off = 44 + j * 2;
      if (off + 2 > sample.audioBuffer.byteLength) break;
      const s16 = wav.getInt16(off, true);
      pcm[j] = s16 >> 8 & 255;
    }
  } else {
    const raw = new Uint8Array(sample.audioBuffer, 44, Math.min(frames, sample.audioBuffer.byteLength - 44));
    for (let j = 0; j < raw.length; j++) {
      pcm[j] = raw[j] - 128 & 255;
    }
  }
  const hasLoop = sample.loop || (sample.loopType === "forward" || sample.loopType === "pingpong");
  const hasBidi = sample.loopType === "pingpong";
  const loopStart = hasLoop ? sample.loopStart ?? 0 : 0;
  const loopEnd = hasLoop ? sample.loopEnd ?? 0 : 0;
  let flags = 0;
  if (hasLoop) flags |= SMP_LOOP;
  if (hasBidi) flags |= SMP_BIDI;
  const modPlayback = inst.modPlayback;
  const defaultVolume = (modPlayback == null ? void 0 : modPlayback.defaultVolume) ?? Math.min(255, Math.round((inst.volume ?? 64) * 4));
  return {
    pcm,
    loopStart: hasLoop ? Math.max(0, loopStart - 1) : 0,
    // parser adds +1, so subtract
    loopEnd: hasLoop && loopEnd > 0 ? Math.max(0, loopEnd - 1) : 0,
    defaultVolume: Math.min(255, defaultVolume),
    flags,
    sampleRate: wavSampleRate > 0 ? wavSampleRate : 8363,
    is16Bit: false,
    lengthBytes: frames,
    lengthFrames: frames
  };
}
async function exportXMF(song) {
  var _a, _b, _c;
  const warnings = [];
  const numChannels = Math.min(32, song.numChannels ?? ((_a = song.patterns[0]) == null ? void 0 : _a.channels.length) ?? 4);
  if (numChannels > 32) {
    warnings.push(`XMF supports max 32 channels; truncating from ${numChannels}`);
  }
  const uniquePatternIndices = [...new Set(song.songPositions)];
  const numPatterns = uniquePatternIndices.length;
  if (numPatterns > 256) {
    warnings.push(`XMF supports max 256 patterns; truncating from ${numPatterns}`);
  }
  const clampedPatterns = Math.min(256, numPatterns);
  const patternIndexMap = /* @__PURE__ */ new Map();
  for (let i = 0; i < clampedPatterns; i++) {
    patternIndexMap.set(uniquePatternIndices[i], i);
  }
  const orders = [];
  for (const pos of song.songPositions) {
    const mapped = patternIndexMap.get(pos);
    if (mapped !== void 0) {
      orders.push(mapped);
    }
  }
  if (orders.length > 256) {
    warnings.push(`XMF supports max 256 order entries; truncating from ${orders.length}`);
    orders.length = 256;
  }
  const sampleDatas = [];
  let numSamples = 0;
  for (let i = 0; i < Math.min(NUM_SAMPLE_SLOTS, song.instruments.length); i++) {
    const sd = extractSampleData(song.instruments[i]);
    sampleDatas.push(sd);
    if (sd) numSamples = i + 1;
  }
  while (sampleDatas.length < NUM_SAMPLE_SLOTS) {
    sampleDatas.push(null);
  }
  const pansOffset = CHANNEL_OFFSET + 2;
  const patternStart = pansOffset + numChannels;
  const patternDataSize = clampedPatterns * numChannels * ROWS_PER_PATTERN * CELL_SIZE;
  let sampleDataOffset = patternStart + patternDataSize;
  const sampleOffsets = [];
  let currentOffset = sampleDataOffset;
  for (let i = 0; i < numSamples; i++) {
    const sd = sampleDatas[i];
    if (sd && sd.lengthBytes > 0) {
      sampleOffsets.push({ dataStart: currentOffset, dataEnd: currentOffset + sd.lengthBytes });
      currentOffset += sd.lengthBytes;
    } else {
      sampleOffsets.push({ dataStart: 0, dataEnd: 0 });
    }
  }
  while (sampleOffsets.length < NUM_SAMPLE_SLOTS) {
    sampleOffsets.push({ dataStart: 0, dataEnd: 0 });
  }
  const totalSize = currentOffset;
  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);
  writeU8(view, TYPE_OFFSET, 4);
  for (let i = 0; i < NUM_SAMPLE_SLOTS; i++) {
    const off = SAMPLES_OFFSET + i * SAMPLE_HDR_SIZE;
    const sd = sampleDatas[i];
    if (sd && sd.lengthBytes > 0) {
      writeU24LE(view, off + 0, sd.loopStart);
      writeU24LE(view, off + 3, sd.loopEnd);
      writeU24LE(view, off + 6, 0);
      writeU24LE(view, off + 9, sd.lengthBytes);
      writeU8(view, off + 12, sd.defaultVolume);
      writeU8(view, off + 13, sd.flags);
      writeU16LE(view, off + 14, sd.sampleRate);
    }
  }
  for (let i = 0; i < 256; i++) {
    if (i < orders.length) {
      writeU8(view, ORDERS_OFFSET + i, orders[i]);
    } else {
      writeU8(view, ORDERS_OFFSET + i, 255);
    }
  }
  writeU8(view, CHANNEL_OFFSET, numChannels - 1);
  writeU8(view, CHANNEL_OFFSET + 1, clampedPatterns - 1);
  for (let ch = 0; ch < numChannels; ch++) {
    const pat = song.patterns[0];
    const pan = ((_b = pat == null ? void 0 : pat.channels[ch]) == null ? void 0 : _b.pan) ?? 0;
    const rawPan = Math.round((pan + 100) / 200 * 255);
    const xmfPanByte = Math.round(rawPan / 17);
    writeU8(view, pansOffset + ch, Math.max(0, Math.min(15, xmfPanByte)));
  }
  for (let pi = 0; pi < clampedPatterns; pi++) {
    const origPatIdx = uniquePatternIndices[pi];
    const pat = song.patterns[origPatIdx];
    const patBase = patternStart + pi * numChannels * ROWS_PER_PATTERN * CELL_SIZE;
    for (let row = 0; row < ROWS_PER_PATTERN; row++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const cell = (_c = pat == null ? void 0 : pat.channels[ch]) == null ? void 0 : _c.rows[row];
        const cellBytes = encodeXMFCell(cell ?? {
          note: 0,
          instrument: 0,
          effTyp: 0,
          eff: 0,
          effTyp2: 0,
          eff2: 0
        });
        const off = patBase + (row * numChannels + ch) * CELL_SIZE;
        output.set(cellBytes, off);
      }
    }
  }
  let writeOffset = sampleDataOffset;
  for (let i = 0; i < numSamples; i++) {
    const sd = sampleDatas[i];
    if (sd && sd.lengthBytes > 0) {
      output.set(sd.pcm.subarray(0, sd.lengthBytes), writeOffset);
      writeOffset += sd.lengthBytes;
    }
  }
  const songName = song.name ?? "untitled";
  const filename = `${songName.replace(/[^a-zA-Z0-9_\-. ]/g, "_")}.xmf`;
  return {
    data: new Blob([output], { type: "application/octet-stream" }),
    filename,
    warnings
  };
}
export {
  exportXMF
};
