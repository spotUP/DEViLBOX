function writeU8(view, off, val) {
  view.setUint8(off, val & 255);
}
function writeU16BE(view, off, val) {
  view.setUint16(off, val & 65535, false);
}
function writeU32BE(view, off, val) {
  view.setUint32(off, val >>> 0, false);
}
function writeStringFixed(buf, off, str, len) {
  for (let i = 0; i < len; i++) {
    buf[off + i] = i < str.length ? str.charCodeAt(i) & 255 : 0;
  }
}
const STP_NOTE_OFFSET = 25;
function xmNoteToSTP(xmNote) {
  if (xmNote <= 0) return 0;
  if (xmNote === 97) return 0;
  const stp = xmNote - STP_NOTE_OFFSET;
  return stp > 0 ? Math.min(stp, 255) : 0;
}
function reverseEffect(effTyp, eff) {
  if (effTyp === 0 && eff === 0) return { cmd: 0, param: 0 };
  switch (effTyp) {
    case 0:
      return eff ? { cmd: 0, param: eff } : { cmd: 0, param: 0 };
    case 1:
      return { cmd: 1, param: eff };
    case 2:
      return { cmd: 2, param: eff };
    case 3:
      return { cmd: 19, param: eff };
    case 4:
      return { cmd: 16, param: eff };
    case 7:
      return { cmd: 17, param: eff };
    case 9:
      return { cmd: 73, param: eff };
    case 10: {
      const up = eff >> 4 & 15;
      const down = eff & 15;
      return { cmd: 13, param: down << 4 | up };
    }
    case 11:
      return { cmd: 20, param: eff };
    case 12:
      return { cmd: 12, param: Math.min(eff, 64) };
    case 13:
      return { cmd: 18, param: 0 };
    case 14: {
      const subCmd = eff >> 4 & 15;
      const subParam = eff & 15;
      switch (subCmd) {
        case 0:
          return { cmd: 14, param: subParam ? 0 : 1 };
        case 1:
          return { cmd: 9, param: subParam };
        case 2:
          return { cmd: 10, param: subParam };
        case 9:
          return { cmd: 34, param: subParam };
        case 10:
          return { cmd: 29, param: subParam };
        // up in lo nibble
        case 11:
          return { cmd: 29, param: subParam << 4 };
        // down in hi nibble
        case 12:
          return { cmd: 32, param: subParam };
        case 13:
          return { cmd: 33, param: subParam };
        case 6:
        // Pattern loop → STP 0x4E
        case 14:
          return { cmd: 78, param: eff };
        default:
          return { cmd: 0, param: 0 };
      }
    }
    case 15:
      return { cmd: 79, param: eff };
    case 16:
      return { cmd: 7, param: Math.min(eff, 64) };
    default:
      return { cmd: 0, param: 0 };
  }
}
function bpmToCIATimer(bpm) {
  if (bpm <= 0) return 3546;
  return Math.round(125 * 3546 / bpm);
}
function extractSample(inst) {
  var _a;
  if (!((_a = inst.sample) == null ? void 0 : _a.audioBuffer) || inst.sample.audioBuffer.byteLength < 44) return null;
  const wav = new DataView(inst.sample.audioBuffer);
  const bitsPerSample = wav.getUint16(34, true);
  const dataChunkSize = wav.getUint32(40, true);
  let pcm;
  if (bitsPerSample === 16) {
    const frames = Math.floor(dataChunkSize / 2);
    pcm = new Uint8Array(frames);
    for (let j = 0; j < frames; j++) {
      pcm[j] = wav.getInt16(44 + j * 2, true) >> 8 & 255;
    }
  } else {
    const frames = dataChunkSize;
    pcm = new Uint8Array(frames);
    for (let j = 0; j < frames; j++) {
      pcm[j] = wav.getUint8(44 + j) - 128 & 255;
    }
  }
  const loopStart = inst.sample.loopStart ?? 0;
  const loopEnd = inst.sample.loopEnd ?? 0;
  const loopLength = loopEnd > loopStart ? loopEnd - loopStart : 0;
  let vol = 64;
  if (inst.volume !== void 0 && inst.volume < 0) {
    vol = Math.round(Math.pow(10, inst.volume / 20) * 64);
    vol = Math.max(0, Math.min(64, vol));
  }
  return {
    name: inst.name ?? "",
    pcm,
    volume: vol,
    loopStart,
    loopLength
  };
}
const FILE_HEADER_SIZE = 204;
const SAMPLE_CHUNK_SIZE = 82;
async function exportSTP(song) {
  var _a, _b;
  const warnings = [];
  const numChannels = 4;
  if (song.numChannels > 4) {
    warnings.push(`STP supports 4 channels; channels 5-${song.numChannels} will be discarded`);
  }
  const songLen = Math.min(128, song.songPositions.length);
  const patternLength = song.patterns.length > 0 ? Math.min(255, song.patterns[0].length) : 64;
  const usedPatternSet = /* @__PURE__ */ new Set();
  for (let i = 0; i < songLen; i++) {
    usedPatternSet.add(song.songPositions[i] ?? 0);
  }
  const patternMap = /* @__PURE__ */ new Map();
  let nextPatIdx = 0;
  for (const idx of usedPatternSet) {
    if (idx < song.patterns.length) {
      patternMap.set(idx, nextPatIdx++);
    }
  }
  const numPatterns = nextPatIdx;
  const maxSamples = Math.min(255, song.instruments.length);
  const samples = [];
  let numSamples = 0;
  for (let i = 0; i < maxSamples; i++) {
    const inst = song.instruments[i];
    const sd = inst ? extractSample(inst) : null;
    samples.push(sd);
    if (sd) numSamples = i + 1;
  }
  const sampleHeaderBytes = numSamples * (2 + SAMPLE_CHUNK_SIZE);
  const patternBlockBytes = 2 + numPatterns * (numChannels * patternLength * 4);
  let totalSamplePCM = 0;
  for (let i = 0; i < numSamples; i++) {
    totalSamplePCM += ((_a = samples[i]) == null ? void 0 : _a.pcm.length) ?? 0;
  }
  const totalSize = FILE_HEADER_SIZE + sampleHeaderBytes + patternBlockBytes + totalSamplePCM;
  const buf = new ArrayBuffer(totalSize);
  const out = new Uint8Array(buf);
  const view = new DataView(buf);
  let cursor = 0;
  out[0] = 83;
  out[1] = 84;
  out[2] = 80;
  out[3] = 51;
  cursor = 4;
  writeU16BE(view, cursor, 0);
  cursor += 2;
  writeU8(view, cursor, songLen);
  cursor += 1;
  writeU8(view, cursor, patternLength);
  cursor += 1;
  for (let i = 0; i < 128; i++) {
    const songPatIdx = i < songLen ? song.songPositions[i] ?? 0 : 0;
    const stpPatIdx = patternMap.get(songPatIdx) ?? 0;
    writeU8(view, cursor + i, stpPatIdx);
  }
  cursor += 128;
  writeU16BE(view, cursor, song.initialSpeed ?? 6);
  cursor += 2;
  writeU16BE(view, cursor, 0);
  cursor += 2;
  const bpm = song.initialBPM ?? 125;
  writeU16BE(view, cursor, bpmToCIATimer(bpm));
  cursor += 2;
  writeU16BE(view, cursor, 0);
  cursor += 2;
  writeU32BE(view, cursor, 0);
  cursor += 4;
  writeU16BE(view, cursor, 50);
  cursor += 2;
  cursor += 50;
  writeU16BE(view, cursor, numSamples);
  cursor += 2;
  writeU16BE(view, cursor, SAMPLE_CHUNK_SIZE);
  cursor += 2;
  for (let i = 0; i < numSamples; i++) {
    const sd = samples[i];
    const actualSmp = i + 1;
    writeU16BE(view, cursor, actualSmp);
    cursor += 2;
    const chunkStart = cursor;
    writeStringFixed(out, cursor, "", 31);
    cursor += 31;
    writeU8(view, cursor, 0);
    cursor += 1;
    writeStringFixed(out, cursor, (sd == null ? void 0 : sd.name) ?? `Sample ${actualSmp}`, 30);
    cursor += 30;
    const sampleLen = (sd == null ? void 0 : sd.pcm.length) ?? 0;
    writeU32BE(view, cursor, sampleLen);
    cursor += 4;
    writeU8(view, cursor, (sd == null ? void 0 : sd.volume) ?? 64);
    cursor += 1;
    writeU8(view, cursor, 0);
    cursor += 1;
    writeU32BE(view, cursor, (sd == null ? void 0 : sd.loopStart) ?? 0);
    cursor += 4;
    writeU32BE(view, cursor, (sd == null ? void 0 : sd.loopLength) ?? 0);
    cursor += 4;
    writeU16BE(view, cursor, 0);
    cursor += 2;
    writeU16BE(view, cursor, 0);
    cursor += 2;
    writeU8(view, cursor, 0);
    cursor += 1;
    writeU8(view, cursor, 0);
    cursor += 1;
    const written = cursor - chunkStart;
    if (written !== SAMPLE_CHUNK_SIZE) {
      cursor = chunkStart + SAMPLE_CHUNK_SIZE;
    }
  }
  writeU16BE(view, cursor, numPatterns);
  cursor += 2;
  for (const [songPatIdx] of [...patternMap.entries()].sort((a, b) => a[1] - b[1])) {
    const pat = song.patterns[songPatIdx];
    if (!pat) {
      cursor += numChannels * patternLength * 4;
      continue;
    }
    for (let row = 0; row < patternLength; row++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const cell = (_b = pat.channels[ch]) == null ? void 0 : _b.rows[row];
        if (!cell || cursor + 4 > totalSize) {
          cursor += 4;
          continue;
        }
        out[cursor] = (cell.instrument ?? 0) & 255;
        out[cursor + 1] = xmNoteToSTP(cell.note ?? 0);
        const { cmd, param } = reverseEffect(cell.effTyp ?? 0, cell.eff ?? 0);
        out[cursor + 2] = cmd & 255;
        out[cursor + 3] = param & 255;
        cursor += 4;
      }
    }
  }
  for (let i = 0; i < numSamples; i++) {
    const sd = samples[i];
    if (sd && sd.pcm.length > 0) {
      out.set(sd.pcm, cursor);
      cursor += sd.pcm.length;
    }
  }
  const filename = (song.name || "export").replace(/[^a-zA-Z0-9_\-. ]/g, "_") + ".stp";
  return {
    data: new Blob([buf], { type: "application/octet-stream" }),
    filename,
    warnings
  };
}
export {
  exportSTP
};
