const HEADER_SIZE = 1084;
const SAMPLE_HEADER_SIZE = 16;
const NUM_SAMPLES = 31;
const NUM_CHANNELS = 4;
const ROWS_PER_PATTERN = 64;
const BYTES_PER_CELL = 4;
const BYTES_PER_PATTERN = ROWS_PER_PATTERN * NUM_CHANNELS * BYTES_PER_CELL;
const ORDER_OFFSET = 950;
const MAGIC_OFFSET = 1080;
const BASE_SAMPLE_ADDR = 65536;
function writeU8(buf, off, val) {
  buf[off] = val & 255;
}
function writeU16BE(buf, off, val) {
  buf[off] = val >> 8 & 255;
  buf[off + 1] = val & 255;
}
function writeI16BE(buf, off, val) {
  const u = val < 0 ? val + 65536 : val;
  buf[off] = u >> 8 & 255;
  buf[off + 1] = u & 255;
}
function writeU32BE(buf, off, val) {
  buf[off] = val >> 24 & 255;
  buf[off + 1] = val >> 16 & 255;
  buf[off + 2] = val >> 8 & 255;
  buf[off + 3] = val & 255;
}
function reverseNRUFinetune(xmFinetune) {
  if (xmFinetune === 0) return 0;
  let idx;
  if (xmFinetune > 0) {
    idx = Math.round(xmFinetune / 16);
  } else {
    idx = Math.round(xmFinetune / 16) + 16;
  }
  idx = Math.max(0, Math.min(15, idx));
  if (idx === 0) return 0;
  return -idx * 72;
}
function reverseNRUEffect(effTyp, eff) {
  if (effTyp === 0 && eff === 0) return { d0: 0, d1: 0 };
  let d0;
  switch (effTyp) {
    case 3:
      d0 = 0;
      break;
    // tone portamento -> d0=0
    case 0:
      d0 = 12;
      break;
    // arpeggio -> d0=0x0C
    default:
      d0 = effTyp << 2 & 252;
      break;
  }
  return { d0, d1: eff & 255 };
}
function extractPCM(inst) {
  const sample = inst == null ? void 0 : inst.sample;
  if (!(sample == null ? void 0 : sample.audioBuffer)) return null;
  const wav = new DataView(sample.audioBuffer);
  if (sample.audioBuffer.byteLength < 46) return null;
  const dataLen = wav.getUint32(40, true);
  const frames = Math.floor(dataLen / 2);
  if (frames === 0) return null;
  const pcm = new Uint8Array(frames);
  for (let j = 0; j < frames; j++) {
    const s16 = wav.getInt16(44 + j * 2, true);
    pcm[j] = s16 >> 8 & 255;
  }
  return pcm;
}
async function exportNRU(song) {
  var _a, _b, _c, _d, _e, _f, _g, _h;
  const warnings = [];
  if (song.numChannels !== NUM_CHANNELS) {
    warnings.push(
      `NRU supports exactly 4 channels; song has ${song.numChannels}. Only the first 4 channels will be exported.`
    );
  }
  const songLen = Math.min(127, song.songPositions.length);
  if (songLen === 0) {
    warnings.push("Song has no positions; exporting with 1 position pointing to pattern 0.");
  }
  const numOrders = Math.max(1, songLen);
  const orderList = [];
  let maxPattern = 0;
  for (let i = 0; i < numOrders; i++) {
    const pat = Math.min(63, song.songPositions[i] ?? 0);
    orderList.push(pat);
    if (pat > maxPattern) maxPattern = pat;
  }
  const numPatterns = maxPattern + 1;
  const restartPos = Math.min(numOrders - 1, song.restartPosition ?? 0);
  const samples = [];
  for (let s = 0; s < NUM_SAMPLES; s++) {
    const inst = s < song.instruments.length ? song.instruments[s] : null;
    if (!inst) {
      samples.push({ pcm: null, volume: 0, lengthW: 0, loopStartW: 0, loopLenW: 1, finetune: 0 });
      continue;
    }
    const pcm = extractPCM(inst);
    if (!pcm || pcm.length === 0) {
      samples.push({ pcm: null, volume: 0, lengthW: 0, loopStartW: 0, loopLenW: 1, finetune: 0 });
      continue;
    }
    const volume = Math.min(64, Math.max(
      0,
      ((_b = (_a = inst.metadata) == null ? void 0 : _a.modPlayback) == null ? void 0 : _b.defaultVolume) ?? 64
    ));
    const byteLen = pcm.length & -2;
    const lengthW = byteLen >> 1;
    const loopStart = ((_c = inst.sample) == null ? void 0 : _c.loopStart) ?? 0;
    const loopEnd = ((_d = inst.sample) == null ? void 0 : _d.loopEnd) ?? 0;
    const hasLoop = ((_e = inst.sample) == null ? void 0 : _e.loop) && loopEnd > loopStart;
    let loopStartW = 0;
    let loopLenW = 1;
    if (hasLoop) {
      loopStartW = Math.floor(loopStart / 2);
      const loopEndW = Math.min(lengthW, Math.ceil(loopEnd / 2));
      loopLenW = Math.max(1, loopEndW - loopStartW);
    }
    const xmFinetune = ((_g = (_f = inst.metadata) == null ? void 0 : _f.modPlayback) == null ? void 0 : _g.finetune) ?? 0;
    const finetune = reverseNRUFinetune(xmFinetune);
    samples.push({ pcm, volume, lengthW, loopStartW, loopLenW, finetune });
  }
  if (song.instruments.length > NUM_SAMPLES) {
    warnings.push(
      `NRU supports max 31 samples; song has ${song.instruments.length}. Instruments beyond 31 will be dropped.`
    );
  }
  let totalSampleBytes = 0;
  for (const s of samples) {
    if (s.pcm) totalSampleBytes += s.lengthW * 2;
  }
  const totalSize = HEADER_SIZE + numPatterns * BYTES_PER_PATTERN + totalSampleBytes;
  const output = new Uint8Array(totalSize);
  let sampleAddr = BASE_SAMPLE_ADDR;
  for (let s = 0; s < NUM_SAMPLES; s++) {
    const info = samples[s];
    const base = s * SAMPLE_HEADER_SIZE;
    writeU16BE(output, base + 0, info.volume);
    if (info.lengthW === 0) {
      writeU32BE(output, base + 2, sampleAddr);
      writeU16BE(output, base + 6, 0);
      writeU32BE(output, base + 8, sampleAddr);
      writeU16BE(output, base + 12, 1);
      writeI16BE(output, base + 14, 0);
    } else {
      writeU32BE(output, base + 2, sampleAddr);
      writeU16BE(output, base + 6, info.lengthW);
      const loopStartAddr = sampleAddr + info.loopStartW * 2;
      writeU32BE(output, base + 8, loopStartAddr);
      writeU16BE(output, base + 12, info.loopLenW);
      writeI16BE(output, base + 14, info.finetune);
      sampleAddr += info.lengthW * 2;
    }
  }
  writeU8(output, ORDER_OFFSET, numOrders);
  writeU8(output, ORDER_OFFSET + 1, restartPos);
  for (let i = 0; i < 128; i++) {
    output[ORDER_OFFSET + 2 + i] = i < numOrders ? orderList[i] & 255 : 0;
  }
  output[MAGIC_OFFSET] = 77;
  output[MAGIC_OFFSET + 1] = 46;
  output[MAGIC_OFFSET + 2] = 75;
  output[MAGIC_OFFSET + 3] = 46;
  for (let pIdx = 0; pIdx < numPatterns; pIdx++) {
    const pat = pIdx < song.patterns.length ? song.patterns[pIdx] : null;
    const patBase = HEADER_SIZE + pIdx * BYTES_PER_PATTERN;
    for (let row = 0; row < ROWS_PER_PATTERN; row++) {
      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        const cellOff = patBase + (row * NUM_CHANNELS + ch) * BYTES_PER_CELL;
        const cell = (_h = pat == null ? void 0 : pat.channels[ch]) == null ? void 0 : _h.rows[row];
        if (!cell) {
          continue;
        }
        const note = cell.note ?? 0;
        const instrument = cell.instrument ?? 0;
        const effTyp = cell.effTyp ?? 0;
        const eff = cell.eff ?? 0;
        const { d0, d1 } = reverseNRUEffect(effTyp, eff);
        output[cellOff + 0] = d0;
        output[cellOff + 1] = d1;
        if (note > 0 && note >= 37) {
          const nruNote = (note - 36) * 2 & 255;
          output[cellOff + 2] = nruNote <= 72 ? nruNote : 0;
        } else {
          output[cellOff + 2] = 0;
        }
        output[cellOff + 3] = instrument << 3 & 255;
      }
    }
  }
  let pcmCursor = HEADER_SIZE + numPatterns * BYTES_PER_PATTERN;
  for (let s = 0; s < NUM_SAMPLES; s++) {
    const info = samples[s];
    if (info.pcm && info.lengthW > 0) {
      const byteLen = info.lengthW * 2;
      output.set(info.pcm.subarray(0, byteLen), pcmCursor);
      pcmCursor += byteLen;
    }
  }
  const baseName = (song.name || "untitled").replace(/[^a-zA-Z0-9_\- ]/g, "");
  const filename = `${baseName}.nru`;
  return {
    data: new Blob([output], { type: "application/octet-stream" }),
    filename,
    warnings
  };
}
export {
  exportNRU
};
