function writeStringPadded(out, offset, str, len) {
  for (let i = 0; i < len; i++) {
    out[offset + i] = i < str.length ? str.charCodeAt(i) & 255 : 0;
  }
}
function setU16LE(view, off, val) {
  view.setUint16(off, val & 65535, true);
}
const ROWS_PER_PATTERN = 64;
const DSm_FILE_HEADER_SIZE = 64;
const DSm_SAMPLE_HEADER_SIZE = 32;
function encodeNote(xmNote) {
  if (xmNote <= 0) return 0;
  if (xmNote < 36) return 0;
  const d1 = (xmNote - 36) * 2;
  return Math.min(168, d1);
}
function encodeEffect(effTyp, eff) {
  if (effTyp === 0 && eff === 0) return [0, 0];
  if (effTyp <= 15) return [effTyp, eff];
  return [0, 0];
}
function extractPCM8(inst) {
  var _a;
  if (!((_a = inst == null ? void 0 : inst.sample) == null ? void 0 : _a.audioBuffer)) return new Uint8Array(0);
  const wav = new DataView(inst.sample.audioBuffer);
  if (wav.byteLength < 44) return new Uint8Array(0);
  const dataLen = wav.getUint32(40, true);
  const bitsPerSample = wav.getUint16(34, true);
  const frames = bitsPerSample === 16 ? Math.floor(dataLen / 2) : dataLen;
  const pcm = new Uint8Array(frames);
  if (bitsPerSample === 16) {
    for (let j = 0; j < frames; j++) {
      pcm[j] = wav.getInt16(44 + j * 2, true) >> 8 & 255;
    }
  } else {
    for (let j = 0; j < frames; j++) {
      pcm[j] = wav.getUint8(44 + j);
    }
  }
  return pcm;
}
async function exportDSMDyn(song) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j;
  const warnings = [];
  const numChannels = Math.min(16, song.numChannels);
  const numSamples = Math.min(255, song.instruments.length);
  const numOrders = Math.min(255, song.songPositions.length);
  if (numChannels < 1) {
    warnings.push("Song has no channels; writing minimum 1 channel");
  }
  const channels = Math.max(1, numChannels);
  let maxPatIdx = 0;
  for (const p of song.songPositions) {
    if (p > maxPatIdx) maxPatIdx = p;
  }
  const numPatterns = Math.max(maxPatIdx + 1, song.patterns.length);
  let globalVol = 100;
  if (song.compatFlags && typeof song.compatFlags.globalVolume === "number") {
    globalVol = Math.round(song.compatFlags.globalVolume * 100 / 256);
  }
  const samplePCMs = [];
  for (let i = 0; i < numSamples; i++) {
    samplePCMs.push(extractPCM8(song.instruments[i]));
  }
  const channelPanSize = channels;
  const orderListSize = numOrders;
  const trackNamesSize = numPatterns * channels * 8;
  const sampleHeadersSize = numSamples * DSm_SAMPLE_HEADER_SIZE;
  const patternDataSize = numPatterns * channels * ROWS_PER_PATTERN * 4;
  const totalSampleBytes = samplePCMs.reduce((s, p) => s + p.length, 0);
  const totalSize = DSm_FILE_HEADER_SIZE + channelPanSize + orderListSize + trackNamesSize + sampleHeadersSize + patternDataSize + totalSampleBytes;
  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);
  let cur = 0;
  output[0] = 68;
  output[1] = 83;
  output[2] = 109;
  output[3] = 26;
  output[4] = 32;
  writeStringPadded(output, 5, song.name || "", 20);
  writeStringPadded(output, 25, "", 20);
  output[45] = channels;
  output[46] = numSamples;
  output[47] = numOrders;
  output[48] = 0;
  output[49] = Math.min(100, Math.max(0, globalVol));
  cur = DSm_FILE_HEADER_SIZE;
  for (let ch = 0; ch < channels; ch++) {
    const pat = song.patterns[0];
    const chanPan = ((_a = pat == null ? void 0 : pat.channels[ch]) == null ? void 0 : _a.pan) ?? 0;
    const pan255 = Math.max(0, Math.min(255, chanPan + 128));
    output[cur++] = Math.round(pan255 / 17) & 15;
  }
  for (let i = 0; i < numOrders; i++) {
    output[cur++] = (song.songPositions[i] ?? 0) & 255;
  }
  for (let patIdx = 0; patIdx < numPatterns; patIdx++) {
    for (let ch = 0; ch < channels; ch++) {
      const pat = song.patterns[patIdx];
      const name = ((_b = pat == null ? void 0 : pat.channels[ch]) == null ? void 0 : _b.name) ?? `Channel ${ch + 1}`;
      writeStringPadded(output, cur, name.substring(0, 8), 8);
      cur += 8;
    }
  }
  for (let i = 0; i < numSamples; i++) {
    const inst = song.instruments[i];
    const hOff = cur;
    writeStringPadded(output, hOff, (inst == null ? void 0 : inst.name) ?? `Sample ${i + 1}`, 22);
    output[hOff + 22] = 0;
    const pcmLen = samplePCMs[i].length;
    setU16LE(view, hOff + 23, Math.floor(pcmLen / 2));
    let finetune = 0;
    const xmFt = ((_d = (_c = inst == null ? void 0 : inst.metadata) == null ? void 0 : _c.modPlayback) == null ? void 0 : _d.finetune) ?? 0;
    if (xmFt !== 0) {
      const nibble = Math.round(xmFt / 16);
      finetune = nibble < 0 ? nibble + 16 & 15 : nibble & 15;
    }
    output[hOff + 25] = finetune;
    const vol = ((_f = (_e = inst == null ? void 0 : inst.metadata) == null ? void 0 : _e.modPlayback) == null ? void 0 : _f.defaultVolume) ?? 64;
    output[hOff + 26] = Math.min(64, Math.max(0, vol));
    const loopStart = ((_g = inst == null ? void 0 : inst.sample) == null ? void 0 : _g.loopStart) ?? 0;
    setU16LE(view, hOff + 27, loopStart & 65535);
    const loopEnd = ((_h = inst == null ? void 0 : inst.sample) == null ? void 0 : _h.loopEnd) ?? 0;
    const hasLoop = ((_i = inst == null ? void 0 : inst.sample) == null ? void 0 : _i.loop) && loopEnd > loopStart;
    const loopLength = hasLoop ? loopEnd - loopStart : 0;
    setU16LE(view, hOff + 29, loopLength & 65535);
    output[hOff + 31] = 0;
    cur += DSm_SAMPLE_HEADER_SIZE;
  }
  for (let patIdx = 0; patIdx < numPatterns; patIdx++) {
    const pat = song.patterns[patIdx];
    for (let row = 0; row < ROWS_PER_PATTERN; row++) {
      for (let ch = 0; ch < channels; ch++) {
        const cell = (_j = pat == null ? void 0 : pat.channels[ch]) == null ? void 0 : _j.rows[row];
        output[cur] = ((cell == null ? void 0 : cell.instrument) ?? 0) & 255;
        output[cur + 1] = encodeNote((cell == null ? void 0 : cell.note) ?? 0);
        const [effCmd, effParam] = encodeEffect((cell == null ? void 0 : cell.effTyp) ?? 0, (cell == null ? void 0 : cell.eff) ?? 0);
        output[cur + 2] = effCmd;
        output[cur + 3] = effParam;
        cur += 4;
      }
    }
  }
  for (let i = 0; i < numSamples; i++) {
    output.set(samplePCMs[i], cur);
    cur += samplePCMs[i].length;
  }
  if (song.numChannels > 16) {
    warnings.push(`Song has ${song.numChannels} channels; DSm supports max 16. Extra channels truncated.`);
  }
  if (song.instruments.length > 255) {
    warnings.push(`Song has ${song.instruments.length} instruments; DSm supports max 255. Extra instruments dropped.`);
  }
  let lossyEffects = 0;
  for (const pat of song.patterns) {
    for (const ch of pat.channels) {
      for (const row of ch.rows) {
        if (row.effTyp > 15) lossyEffects++;
      }
    }
  }
  if (lossyEffects > 0) {
    warnings.push(`${lossyEffects} effect(s) with command > 0x0F could not be encoded in DSm format.`);
  }
  const filename = (song.name || "untitled").replace(/[^a-zA-Z0-9_\- ]/g, "") + ".dsm";
  return {
    data: new Blob([output], { type: "application/octet-stream" }),
    filename,
    warnings
  };
}
export {
  exportDSMDyn
};
