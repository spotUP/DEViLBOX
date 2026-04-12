import { b$ as registerPatternEncoder } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function xmNoteToIMS(xmNote) {
  if (xmNote === 0) return 63;
  const imsIdx = xmNote - 37;
  if (imsIdx >= 0 && imsIdx < 48) return imsIdx;
  return 63;
}
function encodeIMSCell(cell) {
  const out = new Uint8Array(3);
  const noteIdx = xmNoteToIMS(cell.note ?? 0);
  const instr = cell.instrument ?? 0;
  const effTyp = cell.effTyp ?? 0;
  const eff = cell.eff ?? 0;
  const instrHi = (instr & 48) << 2;
  out[0] = instrHi | noteIdx & 63;
  const instrLo = (instr & 15) << 4;
  out[1] = instrLo | effTyp & 15;
  out[2] = eff & 255;
  return out;
}
registerPatternEncoder("ims", () => encodeIMSCell);
const HEADER_SIZE = 1084;
const BYTES_PER_CELL = 3;
const NUM_CHANNELS = 4;
const ROWS_PER_PATTERN = 64;
const BYTES_PER_PATTERN = BYTES_PER_CELL * ROWS_PER_PATTERN * NUM_CHANNELS;
const MAX_SAMPLES = 31;
function writeU16BE(view, off, val) {
  view.setUint16(off, val, false);
}
function writeU32BE(view, off, val) {
  view.setUint32(off, val, false);
}
function writeString(output, off, str, maxLen) {
  for (let i = 0; i < maxLen; i++) {
    output[off + i] = i < str.length ? str.charCodeAt(i) & 127 : 0;
  }
}
function emptyCell() {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}
async function exportIMS(song) {
  var _a, _b, _c, _d;
  const warnings = [];
  if (song.numChannels > NUM_CHANNELS) {
    warnings.push(
      `IMS supports 4 channels but song has ${song.numChannels}. Extra channels will be truncated.`
    );
  }
  const maxInstruments = Math.min(song.instruments.length, MAX_SAMPLES);
  const samplePCMs = [];
  const sampleLengths = [];
  const sampleLoopStarts = [];
  const sampleLoopLens = [];
  const sampleVolumes = [];
  const sampleNames = [];
  for (let i = 0; i < MAX_SAMPLES; i++) {
    if (i < maxInstruments) {
      const inst = song.instruments[i];
      const name = (inst == null ? void 0 : inst.name) ?? `Sample ${i + 1}`;
      sampleNames.push(name);
      if ((_a = inst == null ? void 0 : inst.sample) == null ? void 0 : _a.audioBuffer) {
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
        const lenWords = Math.ceil(frames / 2);
        sampleLengths.push(lenWords);
        const loopStart = ((_b = inst.sample) == null ? void 0 : _b.loopStart) ?? 0;
        const loopEnd = ((_c = inst.sample) == null ? void 0 : _c.loopEnd) ?? 0;
        const loopStartWords = Math.floor(loopStart / 2);
        const loopLenWords = loopEnd > loopStart ? Math.ceil((loopEnd - loopStart) / 2) : 1;
        if (loopEnd > loopStart) {
          sampleLoopStarts.push(loopStartWords);
          sampleLoopLens.push(loopLenWords);
        } else {
          sampleLoopStarts.push(0);
          sampleLoopLens.push(1);
        }
        const vol = (inst == null ? void 0 : inst.volume) != null ? Math.round(Math.pow(10, inst.volume / 20) * 64) : 64;
        sampleVolumes.push(Math.max(0, Math.min(64, vol)));
      } else {
        samplePCMs.push(new Uint8Array(0));
        sampleLengths.push(0);
        sampleLoopStarts.push(0);
        sampleLoopLens.push(1);
        sampleVolumes.push(0);
      }
    } else {
      sampleNames.push(`Sample ${i + 1}`);
      samplePCMs.push(new Uint8Array(0));
      sampleLengths.push(0);
      sampleLoopStarts.push(0);
      sampleLoopLens.push(1);
      sampleVolumes.push(0);
    }
  }
  const numPatterns = song.patterns.length || 1;
  const patternBlockSize = numPatterns * BYTES_PER_PATTERN;
  const patternBytes = new Uint8Array(patternBlockSize);
  for (let p = 0; p < numPatterns; p++) {
    const pat = song.patterns[p];
    for (let row = 0; row < ROWS_PER_PATTERN; row++) {
      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        const cell = ((_d = pat == null ? void 0 : pat.channels[ch]) == null ? void 0 : _d.rows[row]) ?? emptyCell();
        const encoded = encodeIMSCell(cell);
        const offset = p * BYTES_PER_PATTERN + (row * NUM_CHANNELS + ch) * BYTES_PER_CELL;
        patternBytes.set(encoded, offset);
      }
    }
    if (pat && pat.length > ROWS_PER_PATTERN) {
      warnings.push(
        `Pattern ${p} has ${pat.length} rows but IMS supports max ${ROWS_PER_PATTERN}. Extra rows truncated.`
      );
    }
  }
  const sampleDataOffset = HEADER_SIZE + patternBlockSize;
  const totalSampleBytes = samplePCMs.reduce((s, p) => s + p.length, 0);
  const totalSize = sampleDataOffset + totalSampleBytes;
  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);
  writeString(output, 0, song.name || "Untitled", 20);
  for (let s = 0; s < MAX_SAMPLES; s++) {
    const base = 20 + s * 30;
    writeString(output, base, sampleNames[s], 22);
    writeU16BE(view, base + 22, sampleLengths[s]);
    output[base + 24] = 0;
    output[base + 25] = sampleVolumes[s];
    writeU16BE(view, base + 26, sampleLoopStarts[s]);
    writeU16BE(view, base + 28, sampleLoopLens[s]);
  }
  const songLen = Math.min(128, song.songPositions.length || 1);
  output[950] = songLen;
  output[951] = Math.min(song.restartPosition ?? 0, songLen);
  for (let i = 0; i < 128; i++) {
    output[952 + i] = i < songLen ? song.songPositions[i] ?? 0 : 0;
  }
  writeU32BE(view, 1080, sampleDataOffset);
  output.set(patternBytes, HEADER_SIZE);
  let pcmWriteOffset = sampleDataOffset;
  for (let s = 0; s < MAX_SAMPLES; s++) {
    if (samplePCMs[s].length > 0) {
      output.set(samplePCMs[s], pcmWriteOffset);
      pcmWriteOffset += samplePCMs[s].length;
    }
  }
  if (maxInstruments === 0) {
    warnings.push("No instruments found; exported with empty sample headers.");
  }
  const baseName = (song.name || "untitled").replace(/[^a-zA-Z0-9_\- ]/g, "_");
  const data = new Blob([output.buffer], { type: "application/octet-stream" });
  return {
    data,
    filename: `${baseName}.ims`,
    warnings
  };
}
export {
  exportIMS
};
