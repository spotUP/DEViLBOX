const NUM_SAMPLES = 31;
const SAMPLE_HDR_SIZE = 30;
const NAME_SIZE = 22;
const MAGIC_OFFSET = 952;
const TRACK_REF_OFFSET = 958;
const TRACKS_OFFSET = 1982;
const NUM_CHANNELS = 4;
const ROWS_PER_TRACK = 64;
const BYTES_PER_TRACK = ROWS_PER_TRACK * 4;
function writeStr(buf, off, str, len) {
  for (let i = 0; i < len; i++) {
    buf[off + i] = i < str.length ? str.charCodeAt(i) & 127 : 32;
  }
}
function writeU8(buf, off, val) {
  buf[off] = val & 255;
}
function writeI8(buf, off, val) {
  buf[off] = val & 255;
}
function writeU16BE(buf, off, val) {
  buf[off] = val >>> 8 & 255;
  buf[off + 1] = val & 255;
}
function extractSample(inst) {
  var _a, _b, _c, _d, _e;
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
  const volume = Math.min(64, Math.max(0, ((_c = (_b = inst.metadata) == null ? void 0 : _b.modPlayback) == null ? void 0 : _c.defaultVolume) ?? 64));
  const finetune = ((_e = (_d = inst.metadata) == null ? void 0 : _d.modPlayback) == null ? void 0 : _e.finetune) ?? 0;
  const loopStart = inst.sample.loopStart ?? 0;
  const loopEnd = inst.sample.loopEnd ?? 0;
  const loopLen = loopEnd > loopStart ? loopEnd - loopStart : 2;
  return {
    name: inst.name ?? "",
    pcm,
    volume,
    finetune,
    loopStart,
    loopLen: loopEnd > loopStart ? loopLen : 2
    // MOD convention: 2 = no loop
  };
}
function xmNoteToKRIS(xmNote) {
  if (xmNote <= 0 || xmNote > 96) return 168;
  if (xmNote === 97) return 168;
  const noteIdx = xmNote - 37;
  if (noteIdx < 0) return 168;
  const noteByte = noteIdx * 2 + 24;
  if (noteByte > 158) return 168;
  return noteByte & 255;
}
function encodeTrack(song, patIdx, chIdx) {
  const track = new Uint8Array(BYTES_PER_TRACK);
  const pattern = song.patterns[patIdx];
  if (!pattern) return track;
  const channel = pattern.channels[chIdx];
  if (!channel) return track;
  for (let row = 0; row < ROWS_PER_TRACK; row++) {
    const cell = channel.rows[row];
    const off = row * 4;
    if (!cell) {
      track[off] = 168;
      track[off + 1] = 0;
      track[off + 2] = 0;
      track[off + 3] = 0;
      continue;
    }
    track[off] = xmNoteToKRIS(cell.note ?? 0);
    track[off + 1] = (cell.instrument ?? 0) & 255;
    track[off + 2] = (cell.effTyp ?? 0) & 15;
    track[off + 3] = (cell.eff ?? 0) & 255;
  }
  return track;
}
function trackKey(data) {
  const parts = [];
  for (let i = 0; i < data.length; i++) {
    parts.push(data[i].toString(16).padStart(2, "0"));
  }
  return parts.join("");
}
async function exportKRIS(song) {
  const warnings = [];
  const samples = [];
  for (let i = 0; i < NUM_SAMPLES; i++) {
    if (i < song.instruments.length) {
      samples.push(extractSample(song.instruments[i]));
    } else {
      samples.push(null);
    }
  }
  if (song.instruments.length > NUM_SAMPLES) {
    warnings.push(
      `KRIS format supports max ${NUM_SAMPLES} samples; ${song.instruments.length - NUM_SAMPLES} instruments were dropped.`
    );
  }
  if (song.numChannels > NUM_CHANNELS) {
    warnings.push(
      `KRIS format is 4-channel only; channels 5-${song.numChannels} were dropped.`
    );
  }
  const numOrders = Math.min(128, song.songPositions.length);
  if (numOrders === 0) {
    warnings.push("Song has no order list entries.");
  }
  const trackDataMap = /* @__PURE__ */ new Map();
  const trackDataList = [];
  const trackRefs = [];
  for (let o = 0; o < numOrders; o++) {
    const patIdx = song.songPositions[o] ?? 0;
    const refs = [];
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const data = encodeTrack(song, patIdx, ch);
      const key = trackKey(data);
      let idx = trackDataMap.get(key);
      if (idx === void 0) {
        idx = trackDataList.length;
        trackDataMap.set(key, idx);
        trackDataList.push(data);
      }
      refs.push(idx);
    }
    trackRefs.push(refs);
  }
  if (trackDataList.length > 255) {
    warnings.push(
      `Track count ${trackDataList.length} exceeds KRIS max 255; some tracks will wrap.`
    );
  }
  let totalPCM = 0;
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const s = samples[i];
    if (s) totalPCM += s.pcm.length;
  }
  const numTracks = trackDataList.length;
  const trackDataSize = numTracks * BYTES_PER_TRACK;
  const totalSize = TRACKS_OFFSET + trackDataSize + totalPCM;
  const output = new Uint8Array(totalSize);
  const songName = (song.name || "Untitled").slice(0, NAME_SIZE);
  writeStr(output, 0, songName, NAME_SIZE);
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const base = NAME_SIZE + i * SAMPLE_HDR_SIZE;
    const s = samples[i];
    if (s && s.pcm.length > 0) {
      writeStr(output, base, s.name.slice(0, 22), 22);
      const lenWords = Math.floor(s.pcm.length / 2);
      writeU16BE(output, base + 22, lenWords);
      writeI8(output, base + 24, s.finetune);
      writeU8(output, base + 25, Math.min(64, s.volume));
      const loopStartWords = Math.floor(s.loopStart / 2);
      writeU16BE(output, base + 26, loopStartWords);
      const loopLenWords = Math.max(1, Math.floor(s.loopLen / 2));
      writeU16BE(output, base + 28, loopLenWords);
    } else {
      writeU16BE(output, base + 28, 1);
    }
  }
  output[MAGIC_OFFSET] = 75;
  output[MAGIC_OFFSET + 1] = 82;
  output[MAGIC_OFFSET + 2] = 73;
  output[MAGIC_OFFSET + 3] = 83;
  writeU8(output, 956, Math.max(1, numOrders));
  const restartPos = Math.min(127, song.restartPosition ?? 0);
  writeU8(output, 957, restartPos);
  for (let o = 0; o < 128; o++) {
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const off = TRACK_REF_OFFSET + (o * NUM_CHANNELS + ch) * 2;
      if (o < numOrders) {
        writeU8(output, off, trackRefs[o][ch] & 255);
        writeI8(output, off + 1, 0);
      } else {
        output[off] = 0;
        output[off + 1] = 0;
      }
    }
  }
  for (let t = 0; t < numTracks; t++) {
    output.set(trackDataList[t], TRACKS_OFFSET + t * BYTES_PER_TRACK);
  }
  let pcmOffset = TRACKS_OFFSET + trackDataSize;
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const s = samples[i];
    if (s && s.pcm.length > 0) {
      output.set(s.pcm, pcmOffset);
      pcmOffset += s.pcm.length;
    }
  }
  const baseName = (song.name || "untitled").replace(/\s*\[KRIS\s*(?:Tracker)?\]\s*/i, "").replace(/[^a-zA-Z0-9_.-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "untitled";
  const filename = `${baseName}.kris`;
  return {
    data: new Blob([output], { type: "application/octet-stream" }),
    filename,
    warnings
  };
}
export {
  exportKRIS
};
