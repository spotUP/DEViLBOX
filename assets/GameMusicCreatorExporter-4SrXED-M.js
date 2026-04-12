import { e as encodeGameMusicCreatorCell } from "./GameMusicCreatorEncoder-BgzDEazu.js";
import "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const NUM_SAMPLES = 15;
const NUM_CHANNELS = 4;
const NUM_ROWS = 64;
const SAMPLE_HDR_SIZE = 16;
const HEADER_SIZE = NUM_SAMPLES * SAMPLE_HDR_SIZE + 3 + 1 + 100 * 2;
const BYTES_PER_CELL = 4;
const PATTERN_SIZE = NUM_ROWS * NUM_CHANNELS * BYTES_PER_CELL;
async function exportGameMusicCreator(song) {
  var _a, _b;
  const warnings = [];
  const samples = [];
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const inst = i < song.instruments.length ? song.instruments[i] : void 0;
    if ((_a = inst == null ? void 0 : inst.sample) == null ? void 0 : _a.audioBuffer) {
      const wav = new DataView(inst.sample.audioBuffer);
      const dataLen = wav.getUint32(40, true);
      const frameCount = Math.floor(dataLen / 2);
      const pcm = new Uint8Array(frameCount);
      for (let j = 0; j < frameCount; j++) {
        const s16 = wav.getInt16(44 + j * 2, true);
        pcm[j] = s16 >> 8 & 255;
      }
      const volume = Math.min(64, Math.max(0, inst.volume ?? 64));
      const loopStart = inst.sample.loopStart ?? 0;
      const loopEnd = inst.sample.loopEnd ?? 0;
      let loopLengthWords = 0;
      if (loopEnd > loopStart) {
        loopLengthWords = Math.ceil((loopEnd - loopStart) / 2);
      }
      const lengthWords = Math.ceil(frameCount / 2);
      samples.push({ pcm, volume, loopLengthWords, lengthWords });
    } else {
      samples.push({ pcm: new Uint8Array(0), volume: 0, loopLengthWords: 0, lengthWords: 0 });
    }
  }
  if (song.instruments.length > NUM_SAMPLES) {
    warnings.push(
      `GMC supports max ${NUM_SAMPLES} samples; ${song.instruments.length - NUM_SAMPLES} instruments were dropped.`
    );
  }
  const numPatterns = song.patterns.length;
  const numOrders = Math.min(100, song.songPositions.length);
  if (song.songPositions.length > 100) {
    warnings.push(
      `GMC supports max 100 order positions; truncated from ${song.songPositions.length}.`
    );
  }
  if (numPatterns > 64) {
    warnings.push(
      `GMC typically supports up to 64 patterns; song has ${numPatterns}.`
    );
  }
  const sampleDataStart = HEADER_SIZE + numPatterns * PATTERN_SIZE;
  const sampleOffsets = [];
  let currentOffset = sampleDataStart;
  for (let i = 0; i < NUM_SAMPLES; i++) {
    if (samples[i].pcm.length > 0) {
      if (currentOffset & 1) currentOffset++;
      sampleOffsets.push(currentOffset);
      currentOffset += samples[i].pcm.length;
      if (currentOffset & 1) currentOffset++;
    } else {
      sampleOffsets.push(0);
    }
  }
  const totalFileSize = currentOffset;
  const output = new Uint8Array(totalFileSize);
  const view = new DataView(output.buffer);
  let pos = 0;
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const s = samples[i];
    const offset = sampleOffsets[i];
    view.setUint32(pos, offset, false);
    pos += 4;
    view.setUint16(pos, s.lengthWords & 32767, false);
    pos += 2;
    view.setUint8(pos, 0);
    pos += 1;
    view.setUint8(pos, s.volume & 127);
    pos += 1;
    view.setUint32(pos, offset, false);
    pos += 4;
    view.setUint16(pos, s.loopLengthWords & 65535, false);
    pos += 2;
    view.setUint16(pos, 0, false);
    pos += 2;
  }
  output[pos++] = 0;
  output[pos++] = 0;
  output[pos++] = 0;
  output[pos++] = numOrders;
  for (let i = 0; i < 100; i++) {
    const patIdx = i < numOrders ? song.songPositions[i] ?? 0 : 0;
    view.setUint16(pos, patIdx * 1024 & 65535, false);
    pos += 2;
  }
  for (let pat = 0; pat < numPatterns; pat++) {
    const pattern = song.patterns[pat];
    for (let row = 0; row < NUM_ROWS; row++) {
      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        const cell = (_b = pattern.channels[ch]) == null ? void 0 : _b.rows[row];
        const cellData = cell ? encodeGameMusicCreatorCell(cell) : new Uint8Array(4);
        output.set(cellData, pos);
        pos += BYTES_PER_CELL;
      }
    }
  }
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const s = samples[i];
    if (s.pcm.length === 0) continue;
    while (pos < sampleOffsets[i]) {
      output[pos++] = 0;
    }
    output.set(s.pcm, pos);
    pos += s.pcm.length;
    if (pos & 1) {
      output[pos++] = 0;
    }
  }
  const baseName = (song.name || "untitled").replace(/[^a-zA-Z0-9_.-]/g, "_");
  const data = new Blob([output.buffer], { type: "application/octet-stream" });
  return {
    data,
    filename: `${baseName}.gmc`,
    warnings
  };
}
export {
  exportGameMusicCreator
};
