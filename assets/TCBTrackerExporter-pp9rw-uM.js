const NUM_SAMPLES = 16;
const HEADER_SIZE = 144;
const PATT_BASE_FMT1 = 272;
const ROWS_PER_PATTERN = 64;
const CHANNELS = 4;
const BYTES_PER_CELL = 2;
const BYTES_PER_PATTERN = ROWS_PER_PATTERN * CHANNELS * BYTES_PER_CELL;
function writeU8(buf, off, val) {
  buf[off] = val & 255;
}
function writeU16BE(buf, off, val) {
  buf[off] = val >>> 8 & 255;
  buf[off + 1] = val & 255;
}
function writeU32BE(buf, off, val) {
  buf[off] = val >>> 24 & 255;
  buf[off + 1] = val >>> 16 & 255;
  buf[off + 2] = val >>> 8 & 255;
  buf[off + 3] = val & 255;
}
function writeStr(buf, off, str, len) {
  for (let i = 0; i < len; i++) {
    buf[off + i] = i < str.length ? str.charCodeAt(i) & 255 : 0;
  }
}
function extractSampleFromInstrument(inst) {
  var _a, _b, _c;
  if (!((_a = inst == null ? void 0 : inst.sample) == null ? void 0 : _a.audioBuffer)) return null;
  const wavBuf = inst.sample.audioBuffer;
  if (wavBuf.byteLength < 44) return null;
  const wav = new DataView(wavBuf);
  const dataLen = wav.getUint32(40, true);
  const bitsPerSample = wav.getUint16(34, true);
  const frames = bitsPerSample === 16 ? Math.floor(dataLen / 2) : dataLen;
  if (frames === 0) return null;
  const pcm = new Uint8Array(frames);
  if (bitsPerSample === 16) {
    for (let j = 0; j < frames; j++) {
      const s16 = wav.getInt16(44 + j * 2, true);
      pcm[j] = s16 >> 8 & 255;
    }
  } else {
    for (let j = 0; j < frames; j++) {
      pcm[j] = (wav.getUint8(44 + j) ^ 128) & 255;
    }
  }
  let volume = 64;
  const defVol = (_c = (_b = inst.metadata) == null ? void 0 : _b.modPlayback) == null ? void 0 : _c.defaultVolume;
  if (defVol !== void 0 && defVol !== null) {
    volume = Math.min(127, Math.max(0, defVol));
  }
  return {
    name: inst.name ?? "",
    volume,
    pcmSigned: pcm,
    loopStart: inst.sample.loopStart ?? 0,
    loopEnd: inst.sample.loopEnd ?? 0
  };
}
function encodeNote(xmNote) {
  if (xmNote <= 0 || xmNote > 96) return 0;
  const val = xmNote - 40;
  if (val < 0) return 0;
  const octave = Math.floor(val / 12);
  const semitone = val % 12;
  if (octave < 1 || octave > 3 || semitone < 0 || semitone > 11) return 0;
  return octave << 4 | semitone;
}
async function exportTCBTracker(song) {
  var _a, _b;
  const warnings = [];
  const samples = [];
  for (let i = 0; i < NUM_SAMPLES; i++) {
    if (i < song.instruments.length) {
      samples.push(extractSampleFromInstrument(song.instruments[i]));
    } else {
      samples.push(null);
    }
  }
  const usedSamples = samples.filter((s) => s !== null).length;
  if (usedSamples === 0) {
    warnings.push("No valid samples found; file will contain no sample data.");
  }
  if (song.instruments.length > NUM_SAMPLES) {
    warnings.push(
      `TCB Tracker supports max ${NUM_SAMPLES} samples; ${song.instruments.length - NUM_SAMPLES} instruments were dropped.`
    );
  }
  const numPatterns = Math.min(127, song.patterns.length);
  if (song.patterns.length > 127) {
    warnings.push(`TCB Tracker supports max 127 patterns; ${song.patterns.length - 127} were dropped.`);
  }
  if (numPatterns === 0) {
    warnings.push("Song has no patterns.");
  }
  const PCM_START_OFFSET = 212;
  let totalPCM = 0;
  const sampleOffsets = [];
  const sampleLengths = [];
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const s = samples[i];
    if (s && s.pcmSigned.length > 0) {
      sampleOffsets.push(PCM_START_OFFSET + totalPCM);
      sampleLengths.push(s.pcmSigned.length);
      totalPCM += s.pcmSigned.length;
    } else {
      sampleOffsets.push(PCM_START_OFFSET);
      sampleLengths.push(0);
    }
  }
  const sampleStart = PATT_BASE_FMT1 + numPatterns * BYTES_PER_PATTERN;
  const sampleBlockSize = PCM_START_OFFSET + totalPCM;
  const totalSize = sampleStart + sampleBlockSize;
  const output = new Uint8Array(totalSize);
  writeStr(output, 0, "AN COOL!", 8);
  writeU32BE(output, 8, numPatterns);
  const speed = song.initialSpeed ?? 6;
  const tempo = Math.max(0, Math.min(15, 16 - speed));
  writeU8(output, 12, tempo);
  const orderCount = Math.min(128, song.songPositions.length);
  if (orderCount === 0) {
    warnings.push("Song has no order list entries; defaulting to 1.");
  }
  for (let i = 0; i < 128; i++) {
    if (i < orderCount) {
      output[14 + i] = Math.min(numPatterns - 1, song.songPositions[i] ?? 0);
    } else {
      output[14 + i] = 0;
    }
  }
  writeU8(output, 142, Math.max(1, orderCount));
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const name = ((_a = samples[i]) == null ? void 0 : _a.name) ?? "";
    writeStr(output, HEADER_SIZE + i * 8, name, 8);
  }
  for (let pat = 0; pat < numPatterns; pat++) {
    const pattern = song.patterns[pat];
    const patOffset = PATT_BASE_FMT1 + pat * BYTES_PER_PATTERN;
    for (let row = 0; row < ROWS_PER_PATTERN; row++) {
      for (let ch = 0; ch < CHANNELS; ch++) {
        const cellOff = patOffset + row * 8 + ch * 2;
        const cell = (_b = pattern == null ? void 0 : pattern.channels[ch]) == null ? void 0 : _b.rows[row];
        if (!cell) {
          output[cellOff] = 0;
          output[cellOff + 1] = 0;
          continue;
        }
        const noteByte = encodeNote(cell.note ?? 0);
        output[cellOff] = noteByte;
        const instr = Math.max(0, (cell.instrument ?? 0) - 1) & 15;
        let effect = 0;
        if ((cell.effTyp ?? 0) === 13) {
          effect = 13;
        }
        const hasContent = noteByte > 0 || effect > 0;
        output[cellOff + 1] = hasContent ? instr << 4 | effect & 15 : 0;
      }
    }
  }
  const sizeOfRemaining = sampleBlockSize - 4;
  writeU32BE(output, sampleStart, sizeOfRemaining);
  const h1Start = sampleStart + 4;
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const off = h1Start + i * 4;
    const s = samples[i];
    if (s && s.pcmSigned.length > 0) {
      writeU8(output, off, s.volume);
      writeU8(output, off + 1, 0);
      const length = s.pcmSigned.length;
      const hasLoop = s.loopEnd > s.loopStart && s.loopEnd > 2;
      if (hasLoop) {
        const rawLoopEnd = length - s.loopStart;
        writeU16BE(output, off + 2, rawLoopEnd);
      } else {
        writeU16BE(output, off + 2, 0);
      }
    }
  }
  const h2Start = h1Start + NUM_SAMPLES * 4;
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const off = h2Start + i * 8;
    writeU32BE(output, off, sampleOffsets[i]);
    writeU32BE(output, off + 4, sampleLengths[i]);
  }
  writeU32BE(output, sampleStart + 204, 4294967295);
  let pcmWriteOffset = sampleStart + PCM_START_OFFSET;
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const s = samples[i];
    if (s && s.pcmSigned.length > 0) {
      for (let j = 0; j < s.pcmSigned.length; j++) {
        output[pcmWriteOffset + j] = (s.pcmSigned[j] ^ 128) & 255;
      }
      pcmWriteOffset += s.pcmSigned.length;
    }
  }
  const baseName = (song.name || "untitled").replace(/\s*\[TCB Tracker\]\s*/i, "").replace(/[^a-zA-Z0-9_.-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "untitled";
  const filename = `tcb.${baseName}`;
  return {
    data: new Blob([output], { type: "application/octet-stream" }),
    filename,
    warnings
  };
}
export {
  exportTCBTracker
};
