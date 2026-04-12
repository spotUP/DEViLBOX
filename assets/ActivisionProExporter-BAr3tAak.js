const MAX_SAMPLES = 27;
const AVP_REF_XM = 37;
const AVP_REF_IDX = 60;
const AVP_PERIODS_LEN = 85;
function writeU16BE(view, off, val) {
  view.setUint16(off, val & 65535, false);
}
function writeU32BE(view, off, val) {
  view.setUint32(off, val >>> 0, false);
}
function writeI16BE(view, off, val) {
  view.setInt16(off, val, false);
}
function encodeAvpNoteByte(xmNote, instrument) {
  let noteIdx = 0;
  if (xmNote > 0 && xmNote <= 96) {
    noteIdx = xmNote - AVP_REF_XM + AVP_REF_IDX;
    noteIdx = Math.max(0, Math.min(AVP_PERIODS_LEN - 1, noteIdx));
  }
  const instrField = (instrument & 3) << 6;
  return instrField | noteIdx & 63;
}
async function exportActivisionPro(song) {
  var _a, _b, _c, _d;
  const warnings = [];
  const numChannels = 4;
  if (song.numChannels > 4) {
    warnings.push(`Activision Pro supports 4 channels; ${song.numChannels - 4} channels were dropped.`);
  }
  const sampleSlots = [];
  const instrToSampleIdx = /* @__PURE__ */ new Map();
  for (let i = 0; i < song.instruments.length && sampleSlots.length < MAX_SAMPLES; i++) {
    const inst = song.instruments[i];
    const slotIdx = sampleSlots.length;
    instrToSampleIdx.set(inst.id, slotIdx);
    if ((_a = inst.sample) == null ? void 0 : _a.audioBuffer) {
      const wav = new DataView(inst.sample.audioBuffer);
      if (wav.byteLength >= 44) {
        const dataLen = wav.getUint32(40, true);
        const frames = Math.floor(dataLen / 2);
        const pcm = new Uint8Array(frames);
        for (let j = 0; j < frames; j++) {
          if (44 + j * 2 + 1 < wav.byteLength) {
            const s16 = wav.getInt16(44 + j * 2, true);
            pcm[j] = s16 >> 8 & 255;
          }
        }
        const loopStart = ((_b = inst.sample) == null ? void 0 : _b.loopStart) ?? 0;
        const loopEnd = ((_c = inst.sample) == null ? void 0 : _c.loopEnd) ?? 0;
        const hasLoop = loopEnd > loopStart;
        sampleSlots.push({
          pcm,
          length: Math.floor(frames / 2),
          loopStart: hasLoop ? Math.floor(loopStart / 2) : 0,
          loopLength: hasLoop ? Math.max(1, Math.floor((loopEnd - loopStart) / 2)) : 1
        });
      } else {
        sampleSlots.push({ pcm: new Uint8Array(0), length: 0, loopStart: 0, loopLength: 1 });
      }
    } else {
      sampleSlots.push({ pcm: new Uint8Array(0), length: 0, loopStart: 0, loopLength: 1 });
    }
  }
  while (sampleSlots.length < MAX_SAMPLES) {
    sampleSlots.push({ pcm: new Uint8Array(0), length: 0, loopStart: 0, loopLength: 1 });
  }
  const encodedTracks = [];
  const trackKeyToIdx = /* @__PURE__ */ new Map();
  for (let p = 0; p < song.patterns.length; p++) {
    const pat = song.patterns[p];
    for (let ch = 0; ch < numChannels; ch++) {
      const rows = ((_d = pat.channels[ch]) == null ? void 0 : _d.rows) ?? [];
      const rowCount = Math.min(64, rows.length);
      const bytes = [];
      for (let r = 0; r < rowCount; r++) {
        const cell = rows[r];
        const xmNote = (cell == null ? void 0 : cell.note) ?? 0;
        const instId = (cell == null ? void 0 : cell.instrument) ?? 0;
        const sampleIdx = instId > 0 ? instrToSampleIdx.get(instId) ?? 0 : 0;
        const controlByte = 0;
        const noteByte = encodeAvpNoteByte(xmNote, sampleIdx);
        bytes.push(controlByte);
        bytes.push(noteByte);
      }
      bytes.push(255);
      const trackData = new Uint8Array(bytes);
      const key = Array.from(trackData).join(",");
      let idx = trackKeyToIdx.get(key);
      if (idx === void 0) {
        idx = encodedTracks.length;
        trackKeyToIdx.set(key, idx);
        encodedTracks.push(trackData);
      }
      const mapKey = `${p}:${ch}`;
      if (!trackKeyToIdx.has(mapKey + "#ref")) {
        trackKeyToIdx.set(mapKey + "#ref", idx);
      }
    }
  }
  const getTrackIdx = (patIdx, ch) => {
    var _a2, _b2;
    const rows = ((_b2 = (_a2 = song.patterns[patIdx]) == null ? void 0 : _a2.channels[ch]) == null ? void 0 : _b2.rows) ?? [];
    const rowCount = Math.min(64, rows.length);
    const bytes = [];
    for (let r = 0; r < rowCount; r++) {
      const cell = rows[r];
      const xmNote = (cell == null ? void 0 : cell.note) ?? 0;
      const instId = (cell == null ? void 0 : cell.instrument) ?? 0;
      const sampleIdx = instId > 0 ? instrToSampleIdx.get(instId) ?? 0 : 0;
      bytes.push(0);
      bytes.push(encodeAvpNoteByte(xmNote, sampleIdx));
    }
    bytes.push(255);
    const key = Array.from(bytes).join(",");
    return trackKeyToIdx.get(key) ?? 0;
  };
  const TRACK_BASE = 64;
  const maxTrackIdx = TRACK_BASE + encodedTracks.length - 1;
  if (maxTrackIdx >= 253) {
    warnings.push(`Too many unique tracks (${encodedTracks.length}); max is ${253 - TRACK_BASE}. Extra tracks will be lost.`);
  }
  const positionLists = [];
  const songLen = song.songPositions.length;
  for (let ch = 0; ch < numChannels; ch++) {
    const entries = [];
    for (let i = 0; i < songLen; i++) {
      const songPatIdx = song.songPositions[i] ?? 0;
      if (songPatIdx >= song.patterns.length) continue;
      const trackIdx = getTrackIdx(songPatIdx, ch);
      const posListByte = TRACK_BASE + Math.min(trackIdx, 253 - TRACK_BASE - 1);
      entries.push(posListByte);
    }
    entries.push(255);
    positionLists.push(new Uint8Array(entries));
  }
  const numInstruments = Math.min(song.instruments.length, 255);
  const instrDefs = [];
  for (let i = 0; i < numInstruments; i++) {
    const inst = song.instruments[i];
    const def = new Uint8Array(16);
    const sampleIdx = instrToSampleIdx.get(inst.id) ?? 0;
    def[0] = sampleIdx & 255;
    def[1] = Math.min(64, inst.volume ?? 64);
    def[2] = 0;
    def[3] = 0;
    def[4] = 0;
    def[5] = 0;
    def[6] = 0;
    def[7] = 0;
    def[8] = sampleIdx & 255;
    def[9] = 0;
    def[10] = 0;
    def[11] = 0;
    def[12] = 0;
    def[13] = 0;
    def[14] = 0;
    def[15] = 0;
    instrDefs.push(def);
  }
  if (instrDefs.length === 0) {
    instrDefs.push(new Uint8Array(16));
    warnings.push("No instruments found; exported with one empty instrument.");
  }
  let posListTotalSize = 0;
  const posListOffsets = [];
  for (let ch = 0; ch < numChannels; ch++) {
    posListOffsets.push(posListTotalSize);
    posListTotalSize += positionLists[ch].length;
  }
  const speedVariation = new Int8Array(8);
  const subSongEntrySize = 16;
  const subSongCount = 1;
  const sampleChunks = [];
  const sampleStartOffsets = [];
  let sampleAccum = 0;
  for (let i = 0; i < MAX_SAMPLES; i++) {
    sampleStartOffsets.push(sampleAccum);
    const s = sampleSlots[i];
    if (s.pcm.length === 0 && s.length === 0) {
      sampleChunks.push(new Uint8Array(0));
      continue;
    }
    const headerSize = 6;
    const chunkSize = headerSize + s.pcm.length;
    const chunk = new Uint8Array(chunkSize);
    const chunkView = new DataView(chunk.buffer);
    chunkView.setUint16(0, s.length & 65535, false);
    chunkView.setUint16(2, s.loopStart & 65535, false);
    chunkView.setUint16(4, s.loopLength & 65535, false);
    chunk.set(s.pcm, 6);
    sampleChunks.push(chunk);
    sampleAccum += chunkSize;
  }
  sampleStartOffsets.push(sampleAccum);
  const sampleOffsetsTableSize = (MAX_SAMPLES + 1) * 4;
  const totalSampleDataSize = sampleAccum;
  const numberOfTracks = TRACK_BASE + encodedTracks.length;
  const trackOffsetsTableSize = numberOfTracks * 2;
  let trackDataTotalSize = 0;
  const trackDataOffsets = [];
  for (const td of encodedTracks) {
    trackDataOffsets.push(trackDataTotalSize);
    trackDataTotalSize += td.length;
  }
  const CODE_SIZE = 512;
  const subSongListPos = CODE_SIZE;
  const posListsPos = subSongListPos + subSongCount * subSongEntrySize;
  const instrumentsPos = posListsPos + posListTotalSize;
  const trackOffsetsPos = instrumentsPos + instrDefs.length * 16;
  const tracksPos = trackOffsetsPos + trackOffsetsTableSize;
  const sampleStartOffsetsPos = tracksPos + trackDataTotalSize;
  const sampleDataPos = sampleStartOffsetsPos + sampleOffsetsTableSize;
  const totalFileSize = sampleDataPos + totalSampleDataSize;
  const output = new Uint8Array(totalFileSize);
  const view = new DataView(output.buffer);
  let pos = 0;
  output[pos++] = 72;
  output[pos++] = 231;
  output[pos++] = 252;
  output[pos++] = 254;
  output[pos++] = 233;
  output[pos++] = 65;
  output[pos++] = 112;
  output[pos++] = 0;
  output[pos++] = 65;
  output[pos++] = 250;
  const subSongDisp = subSongListPos - pos;
  writeI16BE(view, pos, subSongDisp);
  pos += 2;
  output[pos++] = 97;
  output[pos++] = 0;
  const bsrDispOffset = pos;
  pos += 2;
  const bsrTarget = pos;
  writeI16BE(view, bsrDispOffset, bsrTarget - bsrDispOffset);
  output[pos++] = 122;
  output[pos++] = 0;
  output[pos++] = 0;
  output[pos++] = 0;
  output[pos++] = 0;
  output[pos++] = 0;
  output[pos++] = 73;
  output[pos++] = 250;
  const posListDisp = posListsPos - pos;
  writeI16BE(view, pos, posListDisp);
  pos += 2;
  output[pos++] = 67;
  output[pos++] = 250;
  writeI16BE(view, pos, 0);
  pos += 2;
  output[pos++] = 75;
  output[pos++] = 250;
  const instrDisp = instrumentsPos - pos;
  writeI16BE(view, pos, instrDisp);
  pos += 2;
  output[pos++] = 44;
  output[pos++] = 124;
  output[pos++] = 0;
  output[pos++] = 0;
  output[pos++] = 0;
  output[pos++] = 0;
  output[pos++] = 74;
  output[pos++] = 41;
  output[pos++] = 83;
  output[pos++] = 105;
  output[pos++] = 0;
  output[pos++] = 0;
  output[pos++] = 103;
  output[pos++] = 0;
  output[pos++] = 112;
  output[pos++] = 3;
  output[pos++] = 122;
  output[pos++] = 0;
  output[pos++] = 26;
  output[pos++] = 49;
  output[pos++] = 0;
  output[pos++] = 0;
  output[pos++] = 218;
  output[pos++] = 69;
  output[pos++] = 73;
  output[pos++] = 250;
  const trackOffsetsDisp = trackOffsetsPos - pos;
  writeI16BE(view, pos, trackOffsetsDisp);
  pos += 2;
  output[pos++] = 58;
  output[pos++] = 52;
  output[pos++] = 0;
  output[pos++] = 0;
  output[pos++] = 73;
  output[pos++] = 250;
  const tracksDisp = tracksPos - pos;
  writeI16BE(view, pos, tracksDisp);
  pos += 2;
  output[pos++] = 24;
  output[pos++] = 49;
  output[pos++] = 0;
  output[pos++] = 0;
  output[pos++] = 0;
  output[pos++] = 0;
  output[pos++] = 66;
  output[pos++] = 49;
  output[pos++] = 0;
  output[pos++] = 0;
  output[pos++] = 0;
  output[pos++] = 0;
  output[pos++] = 0;
  output[pos++] = 0;
  output[pos++] = 8;
  output[pos++] = 49;
  output[pos++] = 49;
  output[pos++] = 133;
  output[pos++] = 0;
  output[pos++] = 0;
  output[pos++] = 17;
  output[pos++] = 181;
  output[pos++] = 80;
  output[pos++] = 1;
  output[pos++] = 0;
  output[pos++] = 0;
  output[pos++] = 19;
  output[pos++] = 181;
  output[pos++] = 80;
  output[pos++] = 2;
  output[pos++] = 0;
  output[pos++] = 0;
  output[pos++] = 19;
  output[pos++] = 181;
  output[pos++] = 80;
  output[pos++] = 7;
  output[pos++] = 0;
  output[pos++] = 0;
  output[pos++] = 19;
  output[pos++] = 181;
  output[pos++] = 80;
  output[pos++] = 15;
  output[pos++] = 229;
  output[pos++] = 69;
  output[pos++] = 69;
  output[pos++] = 250;
  const sampleOffsetsDisp = sampleStartOffsetsPos - pos;
  writeI16BE(view, pos, sampleOffsetsDisp);
  pos += 2;
  output[pos++] = 0;
  output[pos++] = 0;
  output[pos++] = 0;
  output[pos++] = 0;
  output[pos++] = 69;
  output[pos++] = 250;
  const sampleDataDisp = sampleDataPos - pos;
  writeI16BE(view, pos, sampleDataDisp);
  pos += 2;
  output[pos++] = 107;
  output[pos++] = 0;
  output[pos++] = 0;
  output[pos++] = 0;
  output[pos++] = 74;
  output[pos++] = 49;
  output[pos++] = 0;
  output[pos++] = 0;
  output[pos++] = 0;
  output[pos++] = 0;
  output[pos++] = 218;
  output[pos++] = 69;
  output[pos++] = 155;
  output[pos++] = 112;
  output[pos++] = 0;
  output[pos++] = 0;
  output[pos++] = 0;
  output[pos++] = 0;
  output[pos++] = 83;
  output[pos++] = 49;
  output[pos++] = 0;
  output[pos++] = 0;
  output[pos++] = 0;
  output[pos++] = 0;
  output[pos++] = 0;
  output[pos++] = 0;
  output[pos++] = 0;
  output[pos++] = 0;
  output[pos++] = 0;
  output[pos++] = 0;
  if (pos > CODE_SIZE) {
    warnings.push(`Code stub exceeded ${CODE_SIZE} bytes (${pos} bytes). File may not parse correctly.`);
  }
  pos = CODE_SIZE;
  pos = subSongListPos;
  for (let ch = 0; ch < numChannels; ch++) {
    writeU16BE(view, pos, posListOffsets[ch]);
    pos += 2;
  }
  for (let i = 0; i < 8; i++) {
    output[pos++] = speedVariation[i] & 255;
  }
  pos = posListsPos;
  for (let ch = 0; ch < numChannels; ch++) {
    output.set(positionLists[ch], pos);
    pos += positionLists[ch].length;
  }
  pos = instrumentsPos;
  for (const def of instrDefs) {
    output.set(def, pos);
    pos += 16;
  }
  pos = trackOffsetsPos;
  for (let i = 0; i < numberOfTracks; i++) {
    if (i >= TRACK_BASE && i - TRACK_BASE < encodedTracks.length) {
      const trackRelOffset = trackDataOffsets[i - TRACK_BASE];
      writeI16BE(view, pos, trackRelOffset);
    } else {
      writeI16BE(view, pos, -1);
    }
    pos += 2;
  }
  pos = tracksPos;
  for (const td of encodedTracks) {
    output.set(td, pos);
    pos += td.length;
  }
  pos = sampleStartOffsetsPos;
  for (let i = 0; i <= MAX_SAMPLES; i++) {
    writeU32BE(view, pos, sampleStartOffsets[i]);
    pos += 4;
  }
  pos = sampleDataPos;
  for (const chunk of sampleChunks) {
    if (chunk.length > 0) {
      output.set(chunk, pos);
      pos += chunk.length;
    }
  }
  if (song.instruments.length > MAX_SAMPLES) {
    warnings.push(`Activision Pro supports ${MAX_SAMPLES} samples; ${song.instruments.length - MAX_SAMPLES} instruments were dropped.`);
  }
  const baseName = (song.name || "untitled").replace(/[^a-zA-Z0-9_-]/g, "_");
  return {
    data: new Blob([output], { type: "application/octet-stream" }),
    filename: `${baseName}.avp`,
    warnings
  };
}
export {
  exportActivisionPro
};
