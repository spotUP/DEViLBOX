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
function writeS16BE(buf, off, val) {
  const v = val < 0 ? val + 65536 : val;
  writeU16BE(buf, off, v & 65535);
}
function xmToSc40Note(xmNote) {
  if (xmNote === 0 || xmNote === 97) return 0;
  const idx = xmNote - 13;
  if (idx < 0 || idx >= 36) return 0;
  return idx + 1;
}
function extractSample(inst) {
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
  const loopStartSamples = ((_b = inst.sample) == null ? void 0 : _b.loopStart) ?? 0;
  const loopEndSamples = ((_c = inst.sample) == null ? void 0 : _c.loopEnd) ?? 0;
  return {
    name: inst.name ?? "",
    pcmSigned: pcm,
    length: Math.floor(frames / 2),
    // in words
    loopStart: Math.floor(loopStartSamples / 2),
    // in words
    loopEnd: Math.floor(loopEndSamples / 2),
    // in words
    noteTranspose: 0
  };
}
const HEADER_SIZE = 64;
const TRACK_NAME_SIZE = 16;
const SAMPLE_HEADER_SIZE = 64;
const MAX_SAMPLES = 256;
const MAX_TRACKS = 256;
const NUM_CHANNELS = 6;
async function exportSoundControl(song) {
  const warnings = [];
  if (song.numChannels > NUM_CHANNELS) {
    warnings.push(
      `Sound Control supports 6 channels; ${song.numChannels - NUM_CHANNELS} channels will be dropped.`
    );
  }
  const sampleExports = [];
  for (let i = 0; i < Math.min(MAX_SAMPLES, song.instruments.length); i++) {
    sampleExports.push(extractSample(song.instruments[i]));
  }
  if (song.instruments.length > MAX_SAMPLES) {
    warnings.push(
      `Sound Control supports max ${MAX_SAMPLES} samples; ${song.instruments.length - MAX_SAMPLES} instruments were dropped.`
    );
  }
  const trackDataList = [];
  const trackMap = /* @__PURE__ */ new Map();
  const emptyTrackEvents = new Uint8Array([255, 255]);
  trackDataList.push({ name: "Empty", events: emptyTrackEvents });
  for (let p = 0; p < song.patterns.length; p++) {
    const pat = song.patterns[p];
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const key = `${p}:${ch}`;
      const channel = pat.channels[ch];
      if (!channel) {
        trackMap.set(key, 0);
        continue;
      }
      const eventBytes = [];
      let pendingWaits = 0;
      const flushWaits = () => {
        while (pendingWaits > 0) {
          const w = Math.min(255, pendingWaits);
          eventBytes.push(0, w);
          pendingWaits -= w;
        }
      };
      for (let row = 0; row < pat.length; row++) {
        const cell = channel.rows[row];
        const note = (cell == null ? void 0 : cell.note) ?? 0;
        const instr = (cell == null ? void 0 : cell.instrument) ?? 0;
        const vol = (cell == null ? void 0 : cell.volume) ?? 0;
        if (note === 0 && instr === 0 && vol === 0) {
          pendingWaits++;
          continue;
        }
        flushWaits();
        const scNote = xmToSc40Note(note);
        const scInstr = instr > 0 ? instr - 1 : 0;
        eventBytes.push(
          scNote > 0 ? scNote : 1,
          // dat1 must be non-zero for note event
          scInstr & 255,
          0,
          // unused byte (yy)
          vol & 127
        );
      }
      flushWaits();
      eventBytes.push(255, 255);
      if (eventBytes.length === 2) {
        trackMap.set(key, 0);
      } else {
        const trackIdx = trackDataList.length;
        if (trackIdx >= MAX_TRACKS) {
          warnings.push(`Too many unique tracks (>${MAX_TRACKS}); some channels will be empty.`);
          trackMap.set(key, 0);
        } else {
          trackMap.set(key, trackIdx);
          trackDataList.push({
            name: `P${p}Ch${ch + 1}`,
            events: new Uint8Array(eventBytes)
          });
        }
      }
    }
  }
  const trackOffsetTableSize = 256 * 2;
  let trackDataSize = 0;
  const trackAbsOffsets = [];
  for (let i = 0; i < trackDataList.length; i++) {
    trackAbsOffsets.push(trackOffsetTableSize + trackDataSize);
    trackDataSize += TRACK_NAME_SIZE + trackDataList[i].events.length;
  }
  const tracksLen = trackOffsetTableSize + trackDataSize;
  const tracksPadding = tracksLen & 1 ? 1 : 0;
  const tracksLenPadded = tracksLen + tracksPadding;
  const sampleOffsetTableSize = 256 * 4;
  let sampleDataSize = 0;
  const sampleEntries = [];
  for (let i = 0; i < Math.min(MAX_SAMPLES, song.instruments.length); i++) {
    const s = sampleExports[i];
    if (!s) continue;
    const pcmLen = s.pcmSigned.length;
    const entrySize = SAMPLE_HEADER_SIZE + pcmLen;
    const entry = new Uint8Array(entrySize);
    writeStr(entry, 0, s.name, 16);
    writeU16BE(entry, 16, s.length);
    writeU16BE(entry, 18, s.loopStart);
    writeU16BE(entry, 20, s.loopEnd);
    writeS16BE(entry, 42, s.noteTranspose);
    writeU32BE(entry, 60, entrySize);
    entry.set(s.pcmSigned, SAMPLE_HEADER_SIZE);
    sampleEntries.push({
      headerAndPcm: entry,
      offset: sampleOffsetTableSize + sampleDataSize
    });
    sampleDataSize += entrySize;
  }
  const samplesLen = sampleOffsetTableSize + sampleDataSize;
  const songLen = Math.min(256, song.songPositions.length);
  if (songLen === 0) {
    warnings.push("Song has no order list entries.");
  }
  const posListLen = songLen * 12;
  const totalSize = HEADER_SIZE + tracksLenPadded + samplesLen + posListLen;
  const output = new Uint8Array(totalSize);
  writeStr(output, 0, song.name || "Untitled", 16);
  writeU32BE(output, 16, tracksLenPadded);
  writeU32BE(output, 20, samplesLen);
  writeU32BE(output, 24, posListLen);
  writeU32BE(output, 28, 0);
  writeU16BE(output, 32, 0);
  writeU16BE(output, 34, 3);
  const speed = Math.max(1, Math.min(31, song.initialSpeed ?? 6));
  writeU16BE(output, 36, speed);
  const tracksBase = HEADER_SIZE;
  for (let t = 0; t < MAX_TRACKS; t++) {
    if (t < trackDataList.length && t > 0) {
      writeU16BE(output, tracksBase + t * 2, trackAbsOffsets[t]);
    }
  }
  for (let t = 0; t < trackDataList.length; t++) {
    const absOff = tracksBase + trackAbsOffsets[t];
    writeStr(output, absOff, trackDataList[t].name, TRACK_NAME_SIZE);
    output.set(trackDataList[t].events, absOff + TRACK_NAME_SIZE);
  }
  if (tracksPadding > 0) {
    output[tracksBase + tracksLenPadded - 1] = 255;
  }
  const samplesBase = tracksBase + tracksLenPadded;
  let sampleIdx = 0;
  for (let i = 0; i < Math.min(MAX_SAMPLES, song.instruments.length); i++) {
    const s = sampleExports[i];
    if (!s) continue;
    const entry = sampleEntries[sampleIdx];
    writeU32BE(output, samplesBase + i * 4, entry.offset);
    sampleIdx++;
  }
  for (const entry of sampleEntries) {
    output.set(entry.headerAndPcm, samplesBase + entry.offset);
  }
  const posListBase = samplesBase + samplesLen;
  for (let p = 0; p < songLen; p++) {
    const songPatIdx = song.songPositions[p] ?? 0;
    const base = posListBase + p * 12;
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const key = `${songPatIdx}:${ch}`;
      const trackIdx = trackMap.get(key) ?? 0;
      output[base + ch * 2] = trackIdx & 255;
      output[base + ch * 2 + 1] = 0;
    }
  }
  const baseName = (song.name || "untitled").replace(/\s*\[Sound Control\]\s*/i, "").replace(/[^a-zA-Z0-9_.-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "untitled";
  const filename = `${baseName}.sc`;
  return {
    data: new Blob([output], { type: "application/octet-stream" }),
    filename,
    warnings
  };
}
export {
  exportSoundControl
};
