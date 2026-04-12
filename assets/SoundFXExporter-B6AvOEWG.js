import { e as encodeSoundFXCell } from "./SoundFXEncoder-BhznWvHj.js";
import "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function extractPCM8(audioBuffer) {
  const view = new DataView(audioBuffer);
  if (audioBuffer.byteLength < 44) return new Int8Array(0);
  const dataLen = view.getUint32(40, true);
  const frames = Math.floor(dataLen / 2);
  const result = new Int8Array(frames);
  for (let i = 0; i < frames; i++) {
    result[i] = view.getInt16(44 + i * 2, true) >> 8;
  }
  return result;
}
async function exportSoundFX(song) {
  var _a, _b;
  const warnings = [];
  const NUM_CHANNELS = 4;
  const ROWS_PER_PATTERN = 64;
  const MAX_SAMPLES = 15;
  const sampleSlots = [];
  const maxInstruments = Math.min(MAX_SAMPLES, song.instruments.length);
  for (let i = 0; i < MAX_SAMPLES; i++) {
    if (i < maxInstruments) {
      const inst = song.instruments[i];
      if ((_a = inst == null ? void 0 : inst.sample) == null ? void 0 : _a.audioBuffer) {
        const pcm = extractPCM8(inst.sample.audioBuffer);
        if (pcm.length === 0) {
          sampleSlots.push(null);
          continue;
        }
        const loopStart = inst.sample.loopStart ?? 0;
        const loopEnd = inst.sample.loopEnd ?? 0;
        const loopLength = loopEnd > loopStart ? loopEnd - loopStart : 0;
        let vol = 64;
        if (inst.volume !== void 0 && inst.volume <= -60) {
          vol = 0;
        } else if (inst.volume !== void 0) {
          vol = Math.round(Math.min(64, Math.max(0, (inst.volume + 60) / 60 * 64)));
        }
        sampleSlots.push({
          name: (inst.name || `Sample ${i + 1}`).slice(0, 22),
          pcm,
          volume: vol,
          loopStart,
          loopLength: loopLength > 2 ? loopLength : 0,
          finetune: 0
        });
      } else {
        sampleSlots.push(null);
      }
    } else {
      sampleSlots.push(null);
    }
  }
  if (song.instruments.length > MAX_SAMPLES) {
    warnings.push(`SoundFX v1 supports max 15 instruments; ${song.instruments.length - MAX_SAMPLES} were dropped.`);
  }
  const songPositions = song.songPositions.slice(0, 128);
  const songLength = songPositions.length;
  if (song.songPositions.length > 128) {
    warnings.push(`Song has ${song.songPositions.length} positions; truncated to 128.`);
  }
  let highestPattern = 0;
  for (const pos of songPositions) {
    if (pos > highestPattern) highestPattern = pos;
  }
  const numPatterns = highestPattern + 1;
  if (song.numChannels > NUM_CHANNELS) {
    warnings.push(`SoundFX is 4-channel; channels ${NUM_CHANNELS + 1}+ were dropped.`);
  }
  const bpm = song.initialBPM || 125;
  const tempo = Math.round(14565 * 122 / bpm);
  const SONG_INFO_OFFSET = 530;
  const PATTERN_DATA_OFFSET = 660;
  const patternDataSize = numPatterns * ROWS_PER_PATTERN * NUM_CHANNELS * 4;
  let totalSamplePCMSize = 0;
  for (const slot of sampleSlots) {
    if (slot) totalSamplePCMSize += slot.pcm.length;
  }
  const totalSize = PATTERN_DATA_OFFSET + patternDataSize + totalSamplePCMSize;
  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);
  view.setUint32(0, 0, false);
  for (let i = 0; i < MAX_SAMPLES; i++) {
    const slot = sampleSlots[i];
    const size = slot ? slot.pcm.length : 0;
    view.setUint32((i + 1) * 4, size, false);
  }
  output[60] = 83;
  output[61] = 79;
  output[62] = 78;
  output[63] = 71;
  view.setUint16(64, tempo, false);
  let metaPos = 84;
  for (let i = 0; i < MAX_SAMPLES; i++) {
    const slot = sampleSlots[i];
    if (slot) {
      for (let j = 0; j < 22; j++) {
        output[metaPos + j] = j < slot.name.length ? slot.name.charCodeAt(j) & 255 : 0;
      }
      view.setUint16(metaPos + 22, Math.floor(slot.pcm.length / 2), false);
      output[metaPos + 24] = slot.finetune & 255;
      output[metaPos + 25] = slot.volume & 255;
      view.setUint16(metaPos + 26, slot.loopStart, false);
      view.setUint16(metaPos + 28, Math.floor(slot.loopLength / 2), false);
    }
    metaPos += 30;
  }
  output[SONG_INFO_OFFSET] = songLength & 255;
  output[SONG_INFO_OFFSET + 1] = 0;
  for (let i = 0; i < songLength; i++) {
    output[SONG_INFO_OFFSET + 2 + i] = songPositions[i] & 255;
  }
  let patPos = PATTERN_DATA_OFFSET;
  for (let p = 0; p < numPatterns; p++) {
    const pat = p < song.patterns.length ? song.patterns[p] : null;
    for (let row = 0; row < ROWS_PER_PATTERN; row++) {
      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        const cell = (_b = pat == null ? void 0 : pat.channels[ch]) == null ? void 0 : _b.rows[row];
        if (cell) {
          const encoded = encodeSoundFXCell(cell);
          output[patPos] = encoded[0];
          output[patPos + 1] = encoded[1];
          output[patPos + 2] = encoded[2];
          output[patPos + 3] = encoded[3];
        }
        patPos += 4;
      }
    }
  }
  let samplePos = patPos;
  for (const slot of sampleSlots) {
    if (slot) {
      const unsigned = new Uint8Array(slot.pcm.buffer, slot.pcm.byteOffset, slot.pcm.length);
      output.set(unsigned, samplePos);
      samplePos += slot.pcm.length;
    }
  }
  const basename = (song.name || "untitled").replace(/[^a-zA-Z0-9_\-. ]/g, "").slice(0, 40);
  const filename = `${basename}.sfx`;
  return {
    data: new Blob([output], { type: "application/octet-stream" }),
    filename,
    warnings
  };
}
export {
  exportSoundFX
};
