import { a as actionamicsEncoder } from "./ActionamicsEncoder-CxUzspTM.js";
import "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const SIGNATURE = "ACTIONAMICS SOUND TOOL";
const ROWS_PER_PATTERN = 64;
const NUM_CHANNELS = 4;
const INSTRUMENT_RECORD_SIZE = 32;
const SAMPLE_HEADER_SIZE = 64;
function writeU16BE(view, off, val) {
  view.setUint16(off, val & 65535, false);
}
function writeU32BE(view, off, val) {
  view.setUint32(off, val >>> 0, false);
}
function writeString(arr, off, str, maxLen) {
  for (let i = 0; i < maxLen; i++) {
    arr[off + i] = i < str.length ? str.charCodeAt(i) & 127 : 0;
  }
}
function extractPCM(inst) {
  var _a;
  if (!((_a = inst == null ? void 0 : inst.sample) == null ? void 0 : _a.audioBuffer)) return null;
  try {
    const wav = new DataView(inst.sample.audioBuffer);
    const dataLen = wav.getUint32(40, true);
    const frames = Math.floor(dataLen / 2);
    if (frames <= 0) return null;
    const pcm = new Int8Array(frames);
    for (let j = 0; j < frames; j++) {
      const s16 = wav.getInt16(44 + j * 2, true);
      pcm[j] = s16 >> 8;
    }
    return pcm;
  } catch {
    return null;
  }
}
async function exportActionamics(song) {
  var _a, _b, _c;
  const warnings = [];
  const numPatterns = song.patterns.length;
  const songLen = Math.min(256, song.songPositions.length);
  const numInstruments = Math.min(255, song.instruments.length);
  const encodedTracks = [];
  const trackIndex = [];
  const trackMap = /* @__PURE__ */ new Map();
  for (let p = 0; p < numPatterns; p++) {
    const pat = song.patterns[p];
    const chIndices = [];
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const rows = ((_a = pat.channels[ch]) == null ? void 0 : _a.rows) ?? [];
      const paddedRows = Array.from({ length: ROWS_PER_PATTERN }, (_, i) => rows[i] ?? {
        note: 0,
        instrument: 0,
        volume: 0,
        effTyp: 0,
        eff: 0,
        effTyp2: 0,
        eff2: 0
      });
      const encoded = actionamicsEncoder.encodePattern(paddedRows, ch);
      const key = Array.from(encoded).join(",");
      let idx = trackMap.get(key);
      if (idx === void 0) {
        idx = encodedTracks.length;
        trackMap.set(key, idx);
        encodedTracks.push(encoded);
      }
      chIndices.push(idx);
    }
    trackIndex.push(chIndices);
  }
  const numTracks = encodedTracks.length;
  const numPositions = songLen;
  const trackNumbers = new Uint8Array(NUM_CHANNELS * numPositions);
  const noteTransposes = new Uint8Array(NUM_CHANNELS * numPositions);
  const instrTransposes = new Uint8Array(NUM_CHANNELS * numPositions);
  for (let posIdx = 0; posIdx < numPositions; posIdx++) {
    const patIdx = song.songPositions[posIdx] ?? 0;
    const indices = trackIndex[patIdx] ?? [0, 0, 0, 0];
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      trackNumbers[ch * numPositions + posIdx] = indices[ch] & 255;
      noteTransposes[ch * numPositions + posIdx] = 0;
      instrTransposes[ch * numPositions + posIdx] = 0;
    }
  }
  const positionBlockSize = NUM_CHANNELS * numPositions;
  const trackNumberLength = positionBlockSize;
  const instrTransposeLength = positionBlockSize;
  const noteTransposeLength = positionBlockSize;
  const instrumentBlock = new Uint8Array(numInstruments * INSTRUMENT_RECORD_SIZE);
  const sampleNumberListEntries = numInstruments;
  const sampleNumberListBlock = new Uint8Array(sampleNumberListEntries * 16);
  for (let i = 0; i < sampleNumberListEntries; i++) {
    sampleNumberListBlock[i * 16] = i;
  }
  for (let i = 0; i < numInstruments; i++) {
    const off = i * INSTRUMENT_RECORD_SIZE;
    instrumentBlock[off + 0] = i;
    instrumentBlock[off + 1] = 1;
    instrumentBlock[off + 2] = 0;
    instrumentBlock[off + 3] = 0;
    instrumentBlock[off + 4] = 0;
    instrumentBlock[off + 5] = 0;
    instrumentBlock[off + 6] = 0;
    instrumentBlock[off + 7] = 0;
    instrumentBlock[off + 8] = 0;
    instrumentBlock[off + 9] = 0;
    instrumentBlock[off + 10] = 0;
    instrumentBlock[off + 11] = 0;
    instrumentBlock[off + 12] = 0;
    instrumentBlock[off + 13] = 0;
    instrumentBlock[off + 14] = 0;
    instrumentBlock[off + 15] = 0;
    instrumentBlock[off + 16] = 64;
    instrumentBlock[off + 17] = 1;
    instrumentBlock[off + 18] = 64;
    instrumentBlock[off + 19] = 0;
    instrumentBlock[off + 20] = 0;
    instrumentBlock[off + 21] = 0;
    instrumentBlock[off + 22] = 0;
  }
  const arpeggioListBlock = new Uint8Array(16);
  const frequencyListBlock = new Uint8Array(16);
  const subSongBlock = new Uint8Array(4);
  subSongBlock[0] = 0;
  subSongBlock[1] = Math.max(0, numPositions - 1) & 255;
  subSongBlock[2] = 0;
  subSongBlock[3] = (song.initialSpeed ?? 6) & 255;
  const samplePCMs = [];
  const sampleHeaderBlock = new Uint8Array(numInstruments * SAMPLE_HEADER_SIZE);
  for (let i = 0; i < numInstruments; i++) {
    const inst = song.instruments[i];
    const pcm = extractPCM(inst);
    const hdrOff = i * SAMPLE_HEADER_SIZE;
    if (pcm && pcm.length > 0) {
      const lengthWords = Math.ceil(pcm.length / 2);
      const loopStart = ((_b = inst.sample) == null ? void 0 : _b.loopStart) ?? 0;
      const loopEnd = ((_c = inst.sample) == null ? void 0 : _c.loopEnd) ?? 0;
      const hasLoop = loopEnd > loopStart;
      const loopStartWords = hasLoop ? Math.floor(loopStart / 2) : 0;
      const loopLenWords = hasLoop ? Math.max(1, Math.ceil((loopEnd - loopStart) / 2)) : 1;
      const hdrView = new DataView(sampleHeaderBlock.buffer, sampleHeaderBlock.byteOffset);
      hdrView.setUint16(hdrOff + 4, lengthWords, false);
      hdrView.setUint16(hdrOff + 6, loopStartWords, false);
      hdrView.setUint16(hdrOff + 8, loopLenWords, false);
      const name = inst.name || `Sample ${i + 1}`;
      writeString(sampleHeaderBlock, hdrOff + 32, name, 32);
      const evenLen = lengthWords * 2;
      const paddedPCM = new Int8Array(evenLen);
      paddedPCM.set(pcm.subarray(0, Math.min(pcm.length, evenLen)));
      samplePCMs.push(paddedPCM);
    } else {
      const hdrView = new DataView(sampleHeaderBlock.buffer, sampleHeaderBlock.byteOffset);
      hdrView.setUint16(hdrOff + 8, 1, false);
      const name = (inst == null ? void 0 : inst.name) || `Sample ${i + 1}`;
      writeString(sampleHeaderBlock, hdrOff + 32, name, 32);
      samplePCMs.push(new Int8Array(0));
      warnings.push(`Instrument ${i + 1} "${name}" has no sample data.`);
    }
  }
  const trackOffsetTableSize = (numTracks + 1) * 2;
  let trackDataTotalSize = 0;
  for (const t of encodedTracks) trackDataTotalSize += t.length;
  const trackBlock = new Uint8Array(trackOffsetTableSize + trackDataTotalSize);
  const trackBlockView = new DataView(trackBlock.buffer, trackBlock.byteOffset);
  let trackDataOffset = 0;
  for (let i = 0; i < numTracks; i++) {
    trackBlockView.setUint16(i * 2, trackDataOffset, false);
    trackDataOffset += encodedTracks[i].length;
  }
  trackBlockView.setUint16(numTracks * 2, trackDataOffset, false);
  let tOff = trackOffsetTableSize;
  for (const t of encodedTracks) {
    trackBlock.set(t, tOff);
    tOff += t.length;
  }
  const sectionLengths = [
    SIGNATURE.length,
    // [0] signature
    4,
    // [1] moduleInfo (totalLength u32)
    trackNumberLength,
    // [2]
    instrTransposeLength,
    // [3]
    noteTransposeLength,
    // [4]
    numInstruments * INSTRUMENT_RECORD_SIZE,
    // [5]
    sampleNumberListEntries * 16,
    // [6]
    arpeggioListBlock.length,
    // [7]
    frequencyListBlock.length,
    // [8]
    0,
    // [9] skipped
    0,
    // [10] skipped
    subSongBlock.length,
    // [11]
    0,
    // [12] skipped
    numInstruments * SAMPLE_HEADER_SIZE,
    // [13]
    trackOffsetTableSize
    // [14]
  ];
  const headerSize = 2 + 15 * 4;
  let bodySize = 0;
  for (const sl of sectionLengths) bodySize += sl;
  bodySize += trackDataTotalSize;
  const totalSampleBytes = samplePCMs.reduce((acc, p) => acc + p.length, 0);
  const totalLength = headerSize + bodySize + totalSampleBytes;
  const output = new Uint8Array(totalLength);
  const view = new DataView(output.buffer);
  writeU16BE(view, 0, song.initialBPM ?? 125);
  for (let i = 0; i < 15; i++) {
    writeU32BE(view, 2 + i * 4, sectionLengths[i]);
  }
  let cursor = headerSize;
  writeString(output, cursor, SIGNATURE, SIGNATURE.length);
  cursor += sectionLengths[0];
  writeU32BE(view, cursor, totalLength);
  cursor += sectionLengths[1];
  output.set(trackNumbers, cursor);
  cursor += sectionLengths[2];
  output.set(instrTransposes, cursor);
  cursor += sectionLengths[3];
  output.set(noteTransposes, cursor);
  cursor += sectionLengths[4];
  output.set(instrumentBlock, cursor);
  cursor += sectionLengths[5];
  output.set(sampleNumberListBlock, cursor);
  cursor += sectionLengths[6];
  output.set(arpeggioListBlock, cursor);
  cursor += sectionLengths[7];
  output.set(frequencyListBlock, cursor);
  cursor += sectionLengths[8];
  cursor += sectionLengths[9] + sectionLengths[10];
  output.set(subSongBlock, cursor);
  cursor += sectionLengths[11];
  cursor += sectionLengths[12];
  output.set(sampleHeaderBlock, cursor);
  cursor += sectionLengths[13];
  output.set(trackBlock, cursor);
  cursor += trackBlock.length;
  for (const pcm of samplePCMs) {
    for (let j = 0; j < pcm.length; j++) {
      output[cursor + j] = pcm[j] & 255;
    }
    cursor += pcm.length;
  }
  const baseName = (song.name || "untitled").replace(/[^a-zA-Z0-9_-]/g, "_");
  return {
    data: new Blob([output], { type: "application/octet-stream" }),
    filename: `${baseName}.act`,
    warnings
  };
}
export {
  exportActionamics
};
