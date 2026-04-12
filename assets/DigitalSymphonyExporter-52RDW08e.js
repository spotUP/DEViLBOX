const MAX_NODES = 1 << 13;
const RESET_DICT = 256;
const END_OF_STREAM = 257;
const FIRST_CODE = 258;
const INITIAL_CODE_SIZE = 9;
class BitWriter {
  bytes = [];
  bitBuf = 0;
  bitsUsed = 0;
  writeBits(value, n) {
    this.bitBuf |= (value & (1 << n) - 1) << this.bitsUsed;
    this.bitsUsed += n;
    while (this.bitsUsed >= 8) {
      this.bytes.push(this.bitBuf & 255);
      this.bitBuf >>>= 8;
      this.bitsUsed -= 8;
    }
  }
  /** Flush remaining bits and return the byte array. */
  finish() {
    if (this.bitsUsed > 0) {
      this.bytes.push(this.bitBuf & 255);
    }
    return new Uint8Array(this.bytes);
  }
}
function compressDSymLZW(input) {
  if (input.length === 0) {
    const writer2 = new BitWriter();
    writer2.writeBits(END_OF_STREAM, INITIAL_CODE_SIZE);
    const raw2 = writer2.finish();
    const padded2 = new Uint8Array(raw2.length + 3 & -4);
    padded2.set(raw2);
    return padded2;
  }
  const writer = new BitWriter();
  let children = /* @__PURE__ */ new Map();
  let nextIndex = FIRST_CODE;
  let codeSize = INITIAL_CODE_SIZE;
  for (let i = 0; i < 256; i++) {
    children.set(i, /* @__PURE__ */ new Map());
  }
  function resetDict() {
    writer.writeBits(RESET_DICT, codeSize);
    children = /* @__PURE__ */ new Map();
    for (let i = 0; i < 256; i++) {
      children.set(i, /* @__PURE__ */ new Map());
    }
    nextIndex = FIRST_CODE;
    codeSize = INITIAL_CODE_SIZE;
  }
  let currentCode = input[0];
  let pos = 1;
  while (pos < input.length) {
    const byte = input[pos];
    const currentChildren = children.get(currentCode);
    if (currentChildren && currentChildren.has(byte)) {
      currentCode = currentChildren.get(byte);
      pos++;
    } else {
      writer.writeBits(currentCode, codeSize);
      if (nextIndex < MAX_NODES) {
        if (!currentChildren) {
          children.set(currentCode, /* @__PURE__ */ new Map([[byte, nextIndex]]));
        } else {
          currentChildren.set(byte, nextIndex);
        }
        children.set(nextIndex, /* @__PURE__ */ new Map());
        nextIndex++;
        if (nextIndex !== MAX_NODES && nextIndex === (1 << codeSize) + 1) {
          codeSize++;
        }
      }
      if (nextIndex >= MAX_NODES) {
        resetDict();
      }
      currentCode = byte;
      pos++;
    }
  }
  writer.writeBits(currentCode, codeSize);
  writer.writeBits(END_OF_STREAM, codeSize);
  const raw = writer.finish();
  const padded = new Uint8Array(raw.length + 3 & -4);
  padded.set(raw);
  return padded;
}
const DSYM_MAGIC = new Uint8Array([2, 1, 19, 19, 20, 18, 1, 11]);
const ROWS_PER_TRACK = 64;
const BYTES_PER_ROW = 4;
const BYTES_PER_TRACK = ROWS_PER_TRACK * BYTES_PER_ROW;
const MAX_SAMPLES = 63;
function reverseEffect(cell) {
  const effTyp = cell.effTyp ?? 0;
  const eff = cell.eff ?? 0;
  if (effTyp === 0 && eff === 0) return { command: 0, param: 0 };
  switch (effTyp) {
    case 0:
      return { command: 0, param: eff };
    // Arpeggio
    case 1:
      return { command: 1, param: eff };
    // Slide up
    case 2:
      return { command: 2, param: eff };
    // Slide down
    case 3:
      return { command: 3, param: eff };
    // Tone portamento
    case 4:
      return { command: 4, param: eff };
    // Vibrato
    case 5:
      return { command: 5, param: eff };
    // Tone porta + vol slide
    case 6:
      return { command: 6, param: eff };
    // Vibrato + vol slide
    case 7:
      return { command: 7, param: eff };
    // Tremolo
    case 9:
      return { command: 9, param: eff << 1 & 4095 };
    // Sample offset
    case 10:
      return { command: 10, param: eff };
    // Volume slide
    case 11:
      return { command: 11, param: eff };
    // Position jump
    case 12:
      return { command: 12, param: eff };
    // Set volume
    case 13:
      return { command: 13, param: eff };
    // Pattern break
    case 15:
      return { command: 15, param: eff };
    // Set speed
    // Extended effects (E-commands)
    case 14: {
      const subCmd = eff >> 4 & 15;
      const subParam = eff & 15;
      switch (subCmd) {
        case 0:
          return { command: 16, param: subParam };
        // Filter
        case 1:
          return { command: 17, param: subParam };
        // Fine slide up
        case 2:
          return { command: 18, param: subParam };
        // Fine slide down
        case 3:
          return { command: 19, param: subParam };
        // Glissando
        case 4:
          return { command: 20, param: subParam };
        // Vibrato waveform
        case 5:
          return { command: 21, param: subParam };
        // Fine tune
        case 6:
          return { command: 22, param: subParam };
        // Jump to loop
        case 7:
          return { command: 23, param: subParam };
        // Tremolo waveform
        case 9:
          return { command: 25, param: subParam };
        // Retrig
        case 10:
          return { command: 17, param: subParam << 8 };
        // Fine vol slide up
        case 11:
          return { command: 26, param: subParam << 8 };
        // Fine vol slide down
        case 12:
          return { command: 28, param: subParam };
        // Note cut
        case 13:
          return { command: 29, param: subParam };
        // Note delay
        case 14:
          return { command: 30, param: subParam };
        // Pattern delay
        case 15:
          return { command: 31, param: subParam };
      }
      break;
    }
  }
  return { command: 0, param: 0 };
}
function encodeDSymCell(cell) {
  const out = new Uint8Array(4);
  const xmNote = cell.note ?? 0;
  let rawNote = 0;
  if (xmNote > 0 && xmNote <= 96) {
    rawNote = xmNote - 48;
    if (rawNote < 0) rawNote = 0;
    if (rawNote > 63) rawNote = 63;
  }
  const instr = (cell.instrument ?? 0) & 63;
  const { command, param } = reverseEffect(cell);
  out[0] = rawNote & 63 | (instr & 3) << 6;
  out[1] = instr >> 2 & 15 | (command & 3) << 6;
  out[2] = command >> 2 & 15 | (param & 15) << 4;
  out[3] = param >> 4 & 255;
  return out;
}
function trackHash(trackData, offset) {
  let h = "";
  for (let i = 0; i < BYTES_PER_TRACK; i++) {
    h += String.fromCharCode(trackData[offset + i]);
  }
  return h;
}
function exportDigitalSymphony(song) {
  var _a;
  const numChannels = song.numChannels;
  const numOrders = song.songLength;
  const allTrackData = [];
  const trackMap = /* @__PURE__ */ new Map();
  const sequence = new Uint16Array(numOrders * numChannels);
  for (let ord = 0; ord < numOrders; ord++) {
    const patIdx = song.songPositions[ord] ?? 0;
    const pat = song.patterns[patIdx];
    if (!pat) continue;
    for (let chn = 0; chn < numChannels; chn++) {
      const channelData = pat.channels[chn];
      const track = new Uint8Array(BYTES_PER_TRACK);
      for (let row = 0; row < ROWS_PER_TRACK; row++) {
        const cell = (channelData == null ? void 0 : channelData.rows[row]) ?? { note: 0, instrument: 0, effTyp: 0, eff: 0 };
        const encoded = encodeDSymCell(cell);
        track.set(encoded, row * BYTES_PER_ROW);
      }
      const hash = trackHash(track, 0);
      let trackIdx = trackMap.get(hash);
      if (trackIdx === void 0) {
        trackIdx = allTrackData.length;
        trackMap.set(hash, trackIdx);
        allTrackData.push(track);
      }
      sequence[ord * numChannels + chn] = trackIdx;
    }
  }
  const numTracks = allTrackData.length;
  const songNameBytes = encodeString(song.name || "Untitled", 255);
  const allowedCommands = new Uint8Array(8);
  allowedCommands.fill(255);
  const sequenceRaw = new Uint8Array(sequence.buffer, sequence.byteOffset, sequence.byteLength);
  const sequenceCompressed = compressDSymLZW(sequenceRaw);
  const useCompressedSeq = sequenceCompressed.length < sequenceRaw.length;
  const trackChunks = [];
  for (let chunkStart = 0; chunkStart < numTracks; chunkStart += 2e3) {
    const chunkTracks = Math.min(numTracks - chunkStart, 2e3);
    const chunkSize = chunkTracks * BYTES_PER_TRACK;
    const chunkData = new Uint8Array(chunkSize);
    for (let t = 0; t < chunkTracks; t++) {
      chunkData.set(allTrackData[chunkStart + t], t * BYTES_PER_TRACK);
    }
    const compressed = compressDSymLZW(chunkData);
    trackChunks.push({
      compressed,
      useCompression: compressed.length < chunkData.length
    });
  }
  const sampleEntries = [];
  for (let smp = 0; smp < MAX_SAMPLES; smp++) {
    const instr = song.instruments[smp];
    if (!instr || !((_a = instr.sample) == null ? void 0 : _a.audioBuffer)) {
      sampleEntries.push({
        name: (instr == null ? void 0 : instr.name) || `Sample ${smp + 1}`,
        isVirtual: true,
        length: 0,
        loopStart: 0,
        loopLength: 0,
        volume: 64,
        fineTune: 0,
        pcm8: null
      });
      continue;
    }
    const cfg = instr.sample;
    const pcm8 = extractPCM8FromWAV(cfg.audioBuffer);
    const nLength = pcm8 ? pcm8.length : 0;
    const loopEnabled = cfg.loop && cfg.loopType !== "off";
    const loopStart = loopEnabled ? Math.round((cfg.loopStart ?? 0) * nLength) : 0;
    const loopEnd = loopEnabled ? Math.round((cfg.loopEnd ?? 0) * nLength) : 0;
    const loopLength = loopEnabled ? Math.max(loopEnd - loopStart, 0) : 0;
    const volDb = instr.volume ?? 0;
    const volLin = Math.round((volDb + 60) / 60 * 64);
    const volume = Math.max(0, Math.min(64, volLin));
    sampleEntries.push({
      name: instr.name || `Sample ${smp + 1}`,
      isVirtual: false,
      length: nLength,
      loopStart,
      loopLength,
      volume,
      fineTune: 0,
      pcm8
    });
  }
  let totalSize = 17;
  totalSize += 63;
  for (const s of sampleEntries) {
    if (!s.isVirtual) totalSize += 3;
  }
  totalSize += 1 + songNameBytes.length;
  totalSize += 8;
  totalSize += 1;
  if (useCompressedSeq) {
    totalSize += sequenceCompressed.length;
  } else {
    totalSize += sequenceRaw.length;
  }
  for (let chunkStart = 0; chunkStart < numTracks; chunkStart += 2e3) {
    const chunkTracks = Math.min(numTracks - chunkStart, 2e3);
    const chunkIdx = Math.floor(chunkStart / 2e3);
    totalSize += 1;
    if (trackChunks[chunkIdx].useCompression) {
      totalSize += trackChunks[chunkIdx].compressed.length;
    } else {
      totalSize += chunkTracks * BYTES_PER_TRACK;
    }
  }
  for (const s of sampleEntries) {
    const nameLen = Math.min(s.name.length, 63);
    totalSize += nameLen;
    if (!s.isVirtual) {
      totalSize += 3 + 3 + 1 + 1;
      totalSize += 1;
      totalSize += s.length;
    }
  }
  const buf = new ArrayBuffer(totalSize);
  const u8 = new Uint8Array(buf);
  const view = new DataView(buf);
  let pos = 0;
  u8.set(DSYM_MAGIC, 0);
  pos = 8;
  u8[pos++] = 1;
  u8[pos++] = numChannels;
  view.setUint16(pos, numOrders, true);
  pos += 2;
  view.setUint16(pos, numTracks, true);
  pos += 2;
  u8[pos++] = 0;
  u8[pos++] = 0;
  u8[pos++] = 0;
  for (let smp = 0; smp < MAX_SAMPLES; smp++) {
    const s = sampleEntries[smp];
    const nameLen = Math.min(s.name.length, 63) & 63;
    u8[pos++] = s.isVirtual ? nameLen | 128 : nameLen;
  }
  for (const s of sampleEntries) {
    if (!s.isVirtual) {
      const len24 = s.length >> 1;
      u8[pos++] = len24 & 255;
      u8[pos++] = len24 >> 8 & 255;
      u8[pos++] = len24 >> 16 & 255;
    }
  }
  u8[pos++] = songNameBytes.length;
  u8.set(songNameBytes, pos);
  pos += songNameBytes.length;
  u8.set(allowedCommands, pos);
  pos += 8;
  if (useCompressedSeq) {
    u8[pos++] = 1;
    u8.set(sequenceCompressed, pos);
    pos += sequenceCompressed.length;
  } else {
    u8[pos++] = 0;
    u8.set(sequenceRaw, pos);
    pos += sequenceRaw.length;
  }
  for (let chunkStart = 0; chunkStart < numTracks; chunkStart += 2e3) {
    const chunkTracks = Math.min(numTracks - chunkStart, 2e3);
    const chunkIdx = Math.floor(chunkStart / 2e3);
    const chunk = trackChunks[chunkIdx];
    if (chunk.useCompression) {
      u8[pos++] = 1;
      u8.set(chunk.compressed, pos);
      pos += chunk.compressed.length;
    } else {
      u8[pos++] = 0;
      for (let t = 0; t < chunkTracks; t++) {
        u8.set(allTrackData[chunkStart + t], pos);
        pos += BYTES_PER_TRACK;
      }
    }
  }
  for (const s of sampleEntries) {
    const nameLen = Math.min(s.name.length, 63);
    const nameBytes = encodeString(s.name, nameLen);
    u8.set(nameBytes, pos);
    pos += nameLen;
    if (!s.isVirtual) {
      const ls = s.loopStart >> 1;
      u8[pos++] = ls & 255;
      u8[pos++] = ls >> 8 & 255;
      u8[pos++] = ls >> 16 & 255;
      const ll = s.loopLength >> 1;
      u8[pos++] = ll & 255;
      u8[pos++] = ll >> 8 & 255;
      u8[pos++] = ll >> 16 & 255;
      u8[pos++] = s.volume;
      u8[pos++] = s.fineTune;
      u8[pos++] = 2;
      if (s.pcm8 && s.pcm8.length > 0) {
        u8.set(s.pcm8, pos);
        pos += s.pcm8.length;
      }
    }
  }
  return buf;
}
function encodeString(s, maxLen) {
  const len = Math.min(s.length, maxLen);
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = s.charCodeAt(i) & 255;
  }
  return out;
}
function extractPCM8FromWAV(wavBuf) {
  try {
    const view = new DataView(wavBuf);
    const u8 = new Uint8Array(wavBuf);
    let dataOffset = 12;
    let dataSize = 0;
    while (dataOffset < u8.length - 8) {
      const chunkId = String.fromCharCode(u8[dataOffset], u8[dataOffset + 1], u8[dataOffset + 2], u8[dataOffset + 3]);
      const chunkSize = view.getUint32(dataOffset + 4, true);
      if (chunkId === "data") {
        dataOffset += 8;
        dataSize = chunkSize;
        break;
      }
      dataOffset += 8 + chunkSize;
    }
    if (dataSize === 0) return null;
    const numSamples = dataSize >> 1;
    const pcm8 = new Uint8Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      const s16 = view.getInt16(dataOffset + i * 2, true);
      pcm8[i] = (s16 >> 8) + 128 & 255;
    }
    return pcm8;
  } catch {
    return null;
  }
}
export {
  exportDigitalSymphony
};
