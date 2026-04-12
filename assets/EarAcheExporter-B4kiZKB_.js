import { e as encodeEarAcheCell } from "./EarAcheEncoder-DTpkdNs_.js";
import "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function writeU32BE(view, off, val) {
  view.setUint32(off, val, false);
}
function emptyCell() {
  return { note: 0, instrument: 0, effTyp: 0, eff: 0 };
}
async function exportEarAche(song) {
  var _a, _b;
  const warnings = [];
  const NUM_CHANNELS = 4;
  const ROWS_PER_PATTERN = 64;
  const BYTES_PER_CELL = 4;
  const HEADER_SIZE = 4 + 5 * 4;
  if (song.numChannels > NUM_CHANNELS) {
    warnings.push(
      `EarAche supports 4 channels but song has ${song.numChannels}. Extra channels will be truncated.`
    );
  }
  const numPatterns = song.patterns.length || 1;
  const patternBlockSize = numPatterns * ROWS_PER_PATTERN * NUM_CHANNELS * BYTES_PER_CELL;
  const patternBytes = new Uint8Array(patternBlockSize);
  for (let p = 0; p < numPatterns; p++) {
    const pat = song.patterns[p];
    for (let row = 0; row < ROWS_PER_PATTERN; row++) {
      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        const cell = ((_a = pat == null ? void 0 : pat.channels[ch]) == null ? void 0 : _a.rows[row]) ?? emptyCell();
        const encoded = encodeEarAcheCell(cell);
        const offset = p * ROWS_PER_PATTERN * NUM_CHANNELS * BYTES_PER_CELL + row * NUM_CHANNELS * BYTES_PER_CELL + ch * BYTES_PER_CELL;
        patternBytes.set(encoded, offset);
      }
    }
    if (pat && pat.length > ROWS_PER_PATTERN) {
      warnings.push(
        `Pattern ${p} has ${pat.length} rows but EarAche supports max ${ROWS_PER_PATTERN}. Extra rows truncated.`
      );
    }
  }
  const maxInstruments = Math.min(song.instruments.length, 31);
  const samplePCMs = [];
  for (let i = 0; i < maxInstruments; i++) {
    const inst = song.instruments[i];
    if ((_b = inst == null ? void 0 : inst.sample) == null ? void 0 : _b.audioBuffer) {
      const wav = new DataView(inst.sample.audioBuffer);
      let dataOffset = 12;
      let dataLen = 0;
      while (dataOffset + 8 <= inst.sample.audioBuffer.byteLength) {
        const chunkId = String.fromCharCode(
          wav.getUint8(dataOffset),
          wav.getUint8(dataOffset + 1),
          wav.getUint8(dataOffset + 2),
          wav.getUint8(dataOffset + 3)
        );
        const chunkSize = wav.getUint32(dataOffset + 4, true);
        if (chunkId === "data") {
          dataLen = chunkSize;
          dataOffset += 8;
          break;
        }
        dataOffset += 8 + chunkSize;
        if (chunkSize & 1) dataOffset++;
      }
      const frames = Math.floor(dataLen / 2);
      const pcm = new Uint8Array(frames);
      for (let j = 0; j < frames; j++) {
        const s16 = wav.getInt16(dataOffset + j * 2, true);
        pcm[j] = s16 >> 8 & 255;
      }
      samplePCMs.push(pcm);
    } else {
      samplePCMs.push(new Uint8Array(0));
    }
  }
  const INSTR_DEF_SIZE = 16;
  const ENVELOPE_SIZE = 32;
  const waveformBlockSize = maxInstruments * 12;
  const instrDefBlockSize = maxInstruments * INSTR_DEF_SIZE;
  const envelopeBlockSize = maxInstruments * ENVELOPE_SIZE;
  const totalSampleBytes = samplePCMs.reduce((s, p) => s + p.length, 0);
  const patternDataOffset = HEADER_SIZE;
  const instrumentsOffset = patternDataOffset + patternBlockSize;
  const instrDefsOffset = instrumentsOffset + waveformBlockSize;
  const envelopeDataOffset = instrDefsOffset + instrDefBlockSize;
  const sampleDataOffset = envelopeDataOffset + envelopeBlockSize;
  const totalSize = sampleDataOffset + totalSampleBytes;
  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);
  output[0] = 69;
  output[1] = 65;
  output[2] = 83;
  output[3] = 79;
  writeU32BE(view, 4, patternDataOffset);
  writeU32BE(view, 8, instrumentsOffset);
  writeU32BE(view, 12, instrDefsOffset);
  writeU32BE(view, 16, sampleDataOffset);
  writeU32BE(view, 20, envelopeDataOffset);
  output.set(patternBytes, patternDataOffset);
  let sampleOffset = 0;
  for (let i = 0; i < maxInstruments; i++) {
    const base = instrumentsOffset + i * 12;
    const pcmLen = samplePCMs[i].length;
    writeU32BE(view, base, sampleOffset);
    writeU32BE(view, base + 4, pcmLen);
    writeU32BE(view, base + 8, pcmLen > 2 ? pcmLen : 0);
    sampleOffset += pcmLen;
  }
  for (let i = 0; i < maxInstruments; i++) {
    const base = instrDefsOffset + i * INSTR_DEF_SIZE;
    const inst = song.instruments[i];
    const vol = (inst == null ? void 0 : inst.volume) != null ? Math.round(Math.pow(10, inst.volume / 20) * 64) : 64;
    output[base] = Math.max(0, Math.min(64, vol));
    output[base + 1] = 0;
  }
  for (let i = 0; i < maxInstruments; i++) {
    const base = envelopeDataOffset + i * ENVELOPE_SIZE;
    output[base] = 64;
  }
  let pcmWriteOffset = sampleDataOffset;
  for (let i = 0; i < maxInstruments; i++) {
    if (samplePCMs[i].length > 0) {
      output.set(samplePCMs[i], pcmWriteOffset);
      pcmWriteOffset += samplePCMs[i].length;
    }
  }
  if (maxInstruments === 0) {
    warnings.push("No instruments found; exported with empty instrument block.");
  }
  const baseName = (song.name || "untitled").replace(/[^a-zA-Z0-9_\- ]/g, "_");
  const data = new Blob([output.buffer], { type: "application/octet-stream" });
  return {
    data,
    filename: `${baseName}.ea`,
    warnings
  };
}
export {
  exportEarAche
};
