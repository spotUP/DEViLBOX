import { e as encodeC67Pattern } from "./CDFM67Encoder-Dw1zKW5X.js";
import "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const HDR_SIZE = 1954;
const PAT_DATA_BASE = 2978;
const NUM_PCM_CHANNELS = 4;
const NUM_FM_CHANNELS = 9;
const NUM_CHANNELS = NUM_PCM_CHANNELS + NUM_FM_CHANNELS;
const NUM_PCM_INSTRS = 32;
const NUM_FM_INSTRS = 32;
const ROWS_PER_PATTERN = 64;
const NUM_PATTERNS = 128;
const NO_LOOP = 1048575;
function writeU8(buf, off, val) {
  buf[off] = val & 255;
}
function writeU32LE(buf, off, val) {
  buf[off] = val & 255;
  buf[off + 1] = val >>> 8 & 255;
  buf[off + 2] = val >>> 16 & 255;
  buf[off + 3] = val >>> 24 & 255;
}
function writeString(buf, off, str, maxLen) {
  for (let i = 0; i < maxLen; i++) {
    buf[off + i] = i < str.length ? str.charCodeAt(i) & 255 : 0;
  }
}
async function exportCDFM67(song) {
  var _a, _b, _c, _d;
  const warnings = [];
  const speed = Math.max(1, Math.min(15, song.initialSpeed ?? 6));
  const restartPos = Math.max(0, Math.min(255, song.restartPosition ?? 0));
  const samplePCMs = [];
  const sampleHeaders = [];
  const sampleNames = [];
  for (let i = 0; i < NUM_PCM_INSTRS; i++) {
    const inst = song.instruments[i];
    if ((_a = inst == null ? void 0 : inst.sample) == null ? void 0 : _a.audioBuffer) {
      const wavBuf = inst.sample.audioBuffer;
      const wavView = new DataView(wavBuf);
      let pcm;
      let sampleLen = 0;
      try {
        const dataLen = wavView.getUint32(40, true);
        const frames = Math.floor(dataLen / 2);
        pcm = new Uint8Array(frames);
        for (let j = 0; j < frames; j++) {
          const s16 = wavView.getInt16(44 + j * 2, true);
          pcm[j] = (s16 >> 8) + 128 & 255;
        }
        sampleLen = frames;
      } catch {
        pcm = new Uint8Array(0);
        warnings.push(`PCM instrument ${i + 1} "${inst.name}": failed to decode WAV data`);
      }
      const loopStart = ((_b = inst.sample) == null ? void 0 : _b.loopStart) ?? 0;
      const loopEnd = ((_c = inst.sample) == null ? void 0 : _c.loopEnd) ?? 0;
      const hasLoop = loopEnd > loopStart && loopEnd > 0;
      samplePCMs.push(pcm);
      sampleHeaders.push({
        length: sampleLen,
        loopStart: hasLoop ? loopStart : 0,
        loopEnd: hasLoop ? loopEnd : NO_LOOP
      });
      sampleNames.push((inst.name ?? "").slice(0, 12));
    } else {
      samplePCMs.push(new Uint8Array(0));
      sampleHeaders.push({ length: 0, loopStart: 0, loopEnd: NO_LOOP });
      sampleNames.push(((_d = inst == null ? void 0 : inst.name) == null ? void 0 : _d.slice(0, 12)) ?? "");
    }
  }
  const fmNames = [];
  const fmRegDumps = [];
  for (let i = 0; i < NUM_FM_INSTRS; i++) {
    const inst = song.instruments[NUM_PCM_INSTRS + i];
    fmNames.push(((inst == null ? void 0 : inst.name) ?? "").slice(0, 12));
    fmRegDumps.push(new Uint8Array(11));
    if ((inst == null ? void 0 : inst.name) && inst.name.length > 0) {
      if (!inst.name.match(/^FM \d+$/)) {
        warnings.push(`FM instrument ${i + 1} "${inst.name}": OPL2 register data not preserved`);
      }
    }
  }
  const usedPatternIndices = /* @__PURE__ */ new Set();
  for (const pos of song.songPositions) {
    usedPatternIndices.add(pos);
  }
  const encodedPatterns = [];
  for (let pat = 0; pat < NUM_PATTERNS; pat++) {
    const songPat = song.patterns[pat];
    if (!songPat || !usedPatternIndices.has(pat) && pat >= song.patterns.length) {
      encodedPatterns.push(new Uint8Array([96]));
      continue;
    }
    if (!songPat) {
      encodedPatterns.push(new Uint8Array([96]));
      continue;
    }
    const numRows = Math.min(songPat.length, ROWS_PER_PATTERN);
    const allChannelRows = Array.from({ length: NUM_CHANNELS }, (_, ch) => {
      const channelData = songPat.channels[ch];
      if (!channelData) {
        return Array.from({ length: numRows }, () => ({
          note: 0,
          instrument: 0,
          volume: 0,
          effTyp: 0,
          eff: 0,
          effTyp2: 0,
          eff2: 0
        }));
      }
      return channelData.rows.slice(0, numRows);
    });
    encodedPatterns.push(encodeC67Pattern(allChannelRows, numRows));
  }
  const patOffsets = [];
  const patLengths = [];
  let runningOffset = 0;
  for (let i = 0; i < NUM_PATTERNS; i++) {
    const encoded = encodedPatterns[i];
    patOffsets.push(runningOffset);
    patLengths.push(encoded.length);
    runningOffset += encoded.length;
  }
  const totalPatternData = runningOffset;
  const totalSampleData = samplePCMs.reduce((sum, pcm) => sum + pcm.length, 0);
  const totalSize = PAT_DATA_BASE + totalPatternData + totalSampleData;
  const output = new Uint8Array(totalSize);
  writeU8(output, 0, speed);
  writeU8(output, 1, restartPos);
  for (let i = 0; i < NUM_PCM_INSTRS; i++) {
    writeString(output, 2 + i * 13, sampleNames[i], 13);
  }
  for (let i = 0; i < NUM_PCM_INSTRS; i++) {
    const base = 418 + i * 16;
    writeU32LE(output, base, 0);
    writeU32LE(output, base + 4, sampleHeaders[i].length);
    writeU32LE(output, base + 8, sampleHeaders[i].loopStart);
    writeU32LE(output, base + 12, sampleHeaders[i].loopEnd);
  }
  for (let i = 0; i < NUM_FM_INSTRS; i++) {
    writeString(output, 930 + i * 13, fmNames[i], 13);
  }
  for (let i = 0; i < NUM_FM_INSTRS; i++) {
    output.set(fmRegDumps[i], 1346 + i * 11);
  }
  for (let i = 0; i < 256; i++) {
    if (i < song.songPositions.length) {
      writeU8(output, 1698 + i, song.songPositions[i]);
    } else {
      writeU8(output, 1698 + i, 255);
    }
  }
  for (let i = 0; i < NUM_PATTERNS; i++) {
    writeU32LE(output, HDR_SIZE + i * 4, patOffsets[i]);
    writeU32LE(output, HDR_SIZE + 512 + i * 4, patLengths[i]);
  }
  let patCursor = PAT_DATA_BASE;
  for (let i = 0; i < NUM_PATTERNS; i++) {
    output.set(encodedPatterns[i], patCursor);
    patCursor += encodedPatterns[i].length;
  }
  let sampleCursor = PAT_DATA_BASE + totalPatternData;
  for (let i = 0; i < NUM_PCM_INSTRS; i++) {
    output.set(samplePCMs[i], sampleCursor);
    sampleCursor += samplePCMs[i].length;
  }
  const baseName = (song.name ?? "untitled").replace(/[^a-zA-Z0-9_\- ]/g, "");
  return {
    data: new Blob([output], { type: "application/octet-stream" }),
    filename: `${baseName}.c67`,
    warnings
  };
}
export {
  exportCDFM67
};
