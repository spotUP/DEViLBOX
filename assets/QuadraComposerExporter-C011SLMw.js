import { e as encodeQCCell } from "./QuadraComposerEncoder-JE3-GGZi.js";
import "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function writeStr(view, offset, str, maxLen) {
  for (let i = 0; i < maxLen; i++) {
    view.setUint8(offset + i, i < str.length ? str.charCodeAt(i) & 255 : 0);
  }
}
function writeU8(view, offset, val) {
  view.setUint8(offset, val & 255);
}
function writeU16BE(view, offset, val) {
  view.setUint16(offset, val, false);
}
function writeU32BE(view, offset, val) {
  view.setUint32(offset, val, false);
}
function writeI8(view, offset, val) {
  view.setInt8(offset, val);
}
function extractSample(inst) {
  var _a, _b, _c, _d;
  const name = ((inst == null ? void 0 : inst.name) ?? "").slice(0, 20);
  const volume = Math.min(64, Math.max(0, Math.round(64)));
  let pcm = new Uint8Array(0);
  if ((_a = inst == null ? void 0 : inst.sample) == null ? void 0 : _a.audioBuffer) {
    const wav = new DataView(inst.sample.audioBuffer);
    const dataLen = wav.getUint32(40, true);
    const frames = Math.floor(dataLen / 2);
    pcm = new Uint8Array(frames);
    for (let j = 0; j < frames; j++) {
      const s16 = wav.getInt16(44 + j * 2, true);
      pcm[j] = s16 >> 8 & 255;
    }
  }
  if (pcm.length & 1) {
    const padded = new Uint8Array(pcm.length + 1);
    padded.set(pcm);
    pcm = padded;
  }
  const loopStart = ((_b = inst == null ? void 0 : inst.sample) == null ? void 0 : _b.loopStart) ?? 0;
  const loopEnd = ((_c = inst == null ? void 0 : inst.sample) == null ? void 0 : _c.loopEnd) ?? 0;
  const hasLoop = loopEnd > loopStart && loopEnd <= pcm.length;
  const loopLength = hasLoop ? loopEnd - loopStart : 0;
  return {
    name,
    volume,
    pcm,
    hasLoop,
    loopStart: hasLoop ? loopStart : 0,
    loopLength,
    finetune: ((_d = inst == null ? void 0 : inst.sample) == null ? void 0 : _d.detune) ? Math.round(inst.sample.detune / 12.5) : 0
  };
}
async function exportQuadraComposer(song) {
  var _a;
  const warnings = [];
  const numChannels = 4;
  const maxInstruments = Math.min(song.instruments.length, 63);
  const samples = [];
  for (let i = 0; i < maxInstruments; i++) {
    samples.push(extractSample(song.instruments[i]));
  }
  if (song.instruments.length > 63) {
    warnings.push(`Quadra Composer supports up to 63 instruments. ${song.instruments.length - 63} instruments truncated.`);
  }
  const numPatterns = song.patterns.length;
  if (numPatterns > 255) {
    warnings.push(`Quadra Composer supports up to 255 patterns. ${numPatterns - 255} patterns truncated.`);
  }
  const patternCount = Math.min(numPatterns, 255);
  const patternRows = [];
  for (let p = 0; p < patternCount; p++) {
    const rows = Math.min(256, Math.max(1, song.patterns[p].length));
    patternRows.push(rows);
  }
  const pattChunks = [];
  let totalPattBytes = 0;
  for (let p = 0; p < patternCount; p++) {
    const pat = song.patterns[p];
    const rows = patternRows[p];
    const pattData = new Uint8Array(rows * numChannels * 4);
    for (let row = 0; row < rows; row++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const cell = (_a = pat.channels[ch]) == null ? void 0 : _a.rows[row];
        const offset = (row * numChannels + ch) * 4;
        if (cell) {
          let cellToEncode = cell;
          if (cell.volume >= 16 && cell.volume <= 80 && cell.effTyp === 0 && cell.eff === 0) {
            cellToEncode = {
              ...cell,
              effTyp: 12,
              eff: cell.volume - 16,
              volume: 0
            };
          }
          const encoded = encodeQCCell(cellToEncode);
          pattData.set(encoded, offset);
        } else {
          pattData[offset + 1] = 255;
        }
      }
    }
    pattChunks.push(pattData);
    totalPattBytes += pattData.length;
  }
  let totalSampleBytes = 0;
  for (const s of samples) {
    totalSampleBytes += s.pcm.length;
  }
  const numSamples = samples.length;
  const numPositions = Math.min(255, song.songPositions.length);
  const emicSize = 2 + 20 + 20 + 1 + 1 + numSamples * 34 + 1 + 1 + patternCount * 26 + 1 + numPositions;
  const emicPadded = emicSize + (emicSize & 1);
  const pattPadded = totalPattBytes + (totalPattBytes & 1);
  const smpPadded = totalSampleBytes + (totalSampleBytes & 1);
  const formContentSize = 4 + // EMOD
  8 + emicPadded + // EMIC chunk
  8 + pattPadded + // PATT chunk
  8 + smpPadded;
  const totalFileSize = 8 + formContentSize;
  const output = new Uint8Array(totalFileSize);
  const view = new DataView(output.buffer);
  let pos = 0;
  writeStr(view, pos, "FORM", 4);
  pos += 4;
  writeU32BE(view, pos, formContentSize);
  pos += 4;
  writeStr(view, pos, "EMOD", 4);
  pos += 4;
  writeStr(view, pos, "EMIC", 4);
  pos += 4;
  writeU32BE(view, pos, emicSize);
  pos += 4;
  const emicStart = pos;
  writeU16BE(view, pos, 1);
  pos += 2;
  writeStr(view, pos, (song.name ?? "Untitled").slice(0, 20), 20);
  pos += 20;
  writeStr(view, pos, "", 20);
  pos += 20;
  writeU8(view, pos, Math.max(1, Math.min(255, song.initialBPM ?? 125)));
  pos += 1;
  writeU8(view, pos, numSamples);
  pos += 1;
  let sampleFileOffset = 0;
  for (let i = 0; i < numSamples; i++) {
    const s = samples[i];
    writeU8(view, pos, i + 1);
    pos += 1;
    writeU8(view, pos, s.volume);
    pos += 1;
    writeU16BE(view, pos, Math.floor(s.pcm.length / 2));
    pos += 2;
    writeStr(view, pos, s.name, 20);
    pos += 20;
    writeU8(view, pos, s.hasLoop ? 1 : 0);
    pos += 1;
    writeI8(view, pos, s.finetune);
    pos += 1;
    writeU16BE(view, pos, Math.floor(s.loopStart / 2));
    pos += 2;
    writeU16BE(view, pos, Math.floor(s.loopLength / 2));
    pos += 2;
    writeU32BE(view, pos, sampleFileOffset);
    pos += 4;
    sampleFileOffset += s.pcm.length;
  }
  writeU8(view, pos, 0);
  pos += 1;
  writeU8(view, pos, patternCount);
  pos += 1;
  let patternFileOffset = 0;
  for (let p = 0; p < patternCount; p++) {
    writeU8(view, pos, p);
    pos += 1;
    writeU8(view, pos, patternRows[p] - 1);
    pos += 1;
    const patName = (song.patterns[p].name ?? `Pattern ${p}`).slice(0, 20);
    writeStr(view, pos, patName, 20);
    pos += 20;
    writeU32BE(view, pos, patternFileOffset);
    pos += 4;
    patternFileOffset += patternRows[p] * numChannels * 4;
  }
  writeU8(view, pos, numPositions);
  pos += 1;
  for (let i = 0; i < numPositions; i++) {
    const patIdx = Math.min(patternCount - 1, Math.max(0, song.songPositions[i] ?? 0));
    writeU8(view, pos, patIdx);
    pos += 1;
  }
  if (pos - emicStart & 1) {
    pos += 1;
  }
  writeStr(view, pos, "PATT", 4);
  pos += 4;
  writeU32BE(view, pos, totalPattBytes);
  pos += 4;
  for (const chunk of pattChunks) {
    output.set(chunk, pos);
    pos += chunk.length;
  }
  if (totalPattBytes & 1) {
    pos += 1;
  }
  writeStr(view, pos, "8SMP", 4);
  pos += 4;
  writeU32BE(view, pos, totalSampleBytes);
  pos += 4;
  for (const s of samples) {
    output.set(s.pcm, pos);
    pos += s.pcm.length;
  }
  const data = new Blob([output], { type: "application/octet-stream" });
  const baseName = (song.name || "untitled").replace(/[^a-zA-Z0-9_-]/g, "_");
  return {
    data,
    filename: `${baseName}.emod`,
    warnings
  };
}
export {
  exportQuadraComposer
};
