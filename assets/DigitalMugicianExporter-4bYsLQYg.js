const MAGIC_V1 = " MUGICIAN/SOFTEYES 1990 ";
const DM_PERIODS_FT0 = [
  3220,
  3040,
  2869,
  2708,
  2556,
  2412,
  2277,
  2149,
  2029,
  1915,
  1807,
  1706,
  1610,
  1520,
  1434,
  1354,
  1278,
  1206,
  1139,
  1075,
  1014,
  957,
  904,
  853,
  805,
  760,
  717,
  677,
  639,
  603,
  569,
  537,
  507,
  479,
  452,
  426,
  403,
  380,
  359,
  338,
  319,
  302,
  285,
  269,
  254,
  239,
  226,
  213,
  201,
  190,
  179,
  169,
  160,
  151,
  142,
  134,
  127
];
function xmNoteToDMIndex(xmNote) {
  if (xmNote <= 0 || xmNote > 96) return 0;
  const idx = xmNote - 1;
  return Math.max(0, Math.min(DM_PERIODS_FT0.length - 1, idx));
}
function encodeDMCell(note, instrument, effTyp, eff) {
  const out = new Uint8Array(4);
  if (note > 0 && note <= 96) {
    out[0] = xmNoteToDMIndex(note);
  }
  out[1] = instrument & 63;
  if (effTyp === 0) {
    out[2] = 64;
  } else if (effTyp === 15 && eff > 0 && eff <= 15) {
    out[2] = 68;
  } else if (effTyp === 14 && eff === 1) {
    out[2] = 69;
  } else if (effTyp === 14 && eff === 0) {
    out[2] = 70;
  } else if (effTyp === 3) {
    out[2] = 74;
  } else if (effTyp === 1) {
    out[2] = 0;
  } else if (effTyp === 2) {
    out[2] = 0;
  } else {
    out[2] = 64;
  }
  if (effTyp === 1) {
    out[3] = Math.min(eff, 127) & 255;
  } else if (effTyp === 2) {
    out[3] = -Math.min(eff, 127) & 255;
  } else if (effTyp === 15) {
    out[3] = eff & 255;
  } else if (effTyp === 3) {
    out[3] = eff & 255;
  } else {
    out[3] = 0;
  }
  return out;
}
function writeString(buf, off, str, len) {
  for (let i = 0; i < len; i++) {
    buf[off + i] = i < str.length ? str.charCodeAt(i) & 255 : 32;
  }
}
function writeU16BE(view, off, val) {
  view.setUint16(off, val & 65535, false);
}
function writeU32BE(view, off, val) {
  view.setUint32(off, val >>> 0, false);
}
function writeS8(buf, off, val) {
  buf[off] = val & 255;
}
async function exportDigitalMugician(song) {
  var _a, _b, _c, _d;
  const warnings = [];
  const numChannels = 4;
  const instruments = song.instruments;
  const sampleCount = instruments.length;
  const instrIdToSampleIdx = /* @__PURE__ */ new Map();
  for (let i = 0; i < instruments.length; i++) {
    instrIdToSampleIdx.set(instruments[i].id, i + 1);
  }
  const wavetables = [];
  const wavetableIndexMap = /* @__PURE__ */ new Map();
  const pcmSamples = [];
  for (let i = 0; i < instruments.length; i++) {
    const inst = instruments[i];
    const digMug = inst.digMug;
    if ((digMug == null ? void 0 : digMug.waveformData) && digMug.waveformData.length > 0) {
      const waveIdx = ((_a = digMug.wavetable) == null ? void 0 : _a[0]) ?? wavetables.length;
      if (!wavetableIndexMap.has(waveIdx)) {
        wavetableIndexMap.set(waveIdx, wavetables.length);
        const waveData = new Uint8Array(128);
        const srcLen = Math.min(digMug.waveformData.length, 128);
        waveData.set(digMug.waveformData.subarray(0, srcLen));
        wavetables.push(waveData);
      }
    } else if ((digMug == null ? void 0 : digMug.pcmData) && digMug.pcmData.length > 0) {
      const pcmData = digMug.pcmData instanceof Uint8Array ? digMug.pcmData : new Uint8Array(digMug.pcmData);
      pcmSamples.push({
        data: pcmData,
        loopOffset: digMug.loopStart ?? 0,
        repeat: digMug.loopLength ?? 0,
        name: ((_b = inst.name) == null ? void 0 : _b.substring(0, 12)) ?? "",
        waveIndex: 32 + pcmSamples.length
        // assigned later
      });
    }
  }
  if (wavetables.length === 0 && pcmSamples.length === 0) {
    wavetables.push(new Uint8Array(128));
  }
  let maxWaveIndex = 0;
  for (const [idx] of wavetableIndexMap) {
    if (idx >= maxWaveIndex) maxWaveIndex = idx + 1;
  }
  if (maxWaveIndex === 0) maxWaveIndex = wavetables.length;
  const wavetableCount = maxWaveIndex;
  const wavetableBytes = wavetableCount * 128;
  const instrHeaderCount = pcmSamples.length;
  let hasArpeggios = false;
  const arpeggioData = new Uint8Array(256);
  let arpWritePos = 0;
  for (const inst of instruments) {
    const digMug = inst.digMug;
    if ((digMug == null ? void 0 : digMug.arpTable) && digMug.arpTable.some((v) => v !== 0)) {
      hasArpeggios = true;
      for (let a = 0; a < 8 && arpWritePos < 256; a++) {
        arpeggioData[arpWritePos++] = (digMug.arpTable[a] ?? 0) & 255;
      }
    }
  }
  const patternPool = [];
  const patternHash = /* @__PURE__ */ new Map();
  const channelPatternMap = [];
  for (let p = 0; p < song.patterns.length; p++) {
    const pat = song.patterns[p];
    const channelIndices = [];
    for (let ch = 0; ch < numChannels; ch++) {
      const rows = ((_c = pat.channels[ch]) == null ? void 0 : _c.rows) ?? [];
      const block = new Uint8Array(64 * 4);
      for (let row = 0; row < 64; row++) {
        const cell = rows[row];
        const xmNote = (cell == null ? void 0 : cell.note) ?? 0;
        const instId = (cell == null ? void 0 : cell.instrument) ?? 0;
        const sampleIdx = instId > 0 ? instrIdToSampleIdx.get(instId) ?? 0 : 0;
        const effTyp = (cell == null ? void 0 : cell.effTyp) ?? 0;
        const eff = (cell == null ? void 0 : cell.eff) ?? 0;
        const encoded = encodeDMCell(xmNote, sampleIdx, effTyp, eff);
        block.set(encoded, row * 4);
      }
      const hashKey = Array.from(block).join(",");
      let poolIdx = patternHash.get(hashKey);
      if (poolIdx === void 0) {
        poolIdx = patternPool.length;
        patternHash.set(hashKey, poolIdx);
        patternPool.push(block);
      }
      channelIndices.push(poolIdx);
    }
    channelPatternMap.push(channelIndices);
  }
  const totalPatternRows = patternPool.length * 64;
  const waveDataLen = patternPool.length;
  const songLen = song.songPositions.length;
  const numSteps = songLen * 4;
  const trackSteps = [];
  for (let i = 0; i < songLen; i++) {
    const patIdx = song.songPositions[i] ?? 0;
    const chMap = channelPatternMap[patIdx];
    if (!chMap) {
      for (let ch = 0; ch < 4; ch++) {
        trackSteps.push({ pattern: 0, transpose: 0 });
      }
    } else {
      for (let ch = 0; ch < 4; ch++) {
        trackSteps.push({ pattern: chMap[ch] ?? 0, transpose: 0 });
      }
    }
  }
  const songTrackCount = songLen;
  const instrDefs = [];
  let pcmSampleCounter = 0;
  for (let i = 0; i < sampleCount; i++) {
    const inst = instruments[i];
    const digMug = inst.digMug;
    const def = new Uint8Array(16);
    if (digMug) {
      if (digMug.pcmData && digMug.pcmData.length > 0) {
        def[0] = 32 + pcmSampleCounter;
        pcmSampleCounter++;
      } else {
        def[0] = ((_d = digMug.wavetable) == null ? void 0 : _d[0]) ?? 0;
      }
      const waveLen = digMug.waveformData ? Math.min(digMug.waveformData.length, 128) : 128;
      def[1] = waveLen >> 1;
      def[2] = Math.min(64, digMug.volume ?? 64);
      def[3] = 0;
      def[4] = 0;
      if (digMug.arpTable && digMug.arpTable.some((v) => v !== 0)) {
        let arpSearchPos = 0;
        for (let j = 0; j < i; j++) {
          const prevDig = instruments[j].digMug;
          if ((prevDig == null ? void 0 : prevDig.arpTable) && prevDig.arpTable.some((v) => v !== 0)) {
            arpSearchPos += 8;
          }
        }
        def[4] = arpSearchPos & 255;
      }
      def[5] = 0;
      def[6] = 0;
      def[7] = 0;
      def[8] = 0;
      def[9] = 0;
      def[10] = digMug.arpSpeed ?? 0;
      def[11] = 0;
      def[12] = 0;
      def[13] = 0;
      def[14] = 0;
      def[15] = 0;
    }
    instrDefs.push(def);
  }
  let instrDataSize = 0;
  for (const pcm of pcmSamples) {
    instrDataSize += pcm.data.length;
    if (pcm.data.length & 1) instrDataSize++;
  }
  const headerSize = 76;
  const songsBlockSize = 8 * 16;
  const trackDataSize = numSteps * 2;
  const instrDefSize = sampleCount * 16;
  const instrHeaderSize = instrHeaderCount * 32;
  const patternDataSize = totalPatternRows * 4;
  const arpeggioSize = hasArpeggios ? 256 : 0;
  const totalSize = headerSize + songsBlockSize + trackDataSize + instrDefSize + wavetableBytes + instrHeaderSize + patternDataSize + instrDataSize + arpeggioSize;
  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);
  let pos = 0;
  writeString(output, 0, MAGIC_V1, 24);
  pos = 24;
  writeU16BE(view, pos, hasArpeggios ? 1 : 0);
  pos += 2;
  writeU16BE(view, pos, waveDataLen);
  pos += 2;
  writeU32BE(view, pos, songTrackCount);
  pos += 4;
  for (let i = 1; i < 8; i++) {
    writeU32BE(view, pos, 0);
    pos += 4;
  }
  writeU32BE(view, pos, sampleCount);
  pos += 4;
  writeU32BE(view, pos, wavetableCount);
  pos += 4;
  writeU32BE(view, pos, instrHeaderCount);
  pos += 4;
  writeU32BE(view, pos, instrDataSize);
  pos += 4;
  const songSpeed = song.initialSpeed ?? 6;
  const songLength = songLen * 4;
  const restartPos = song.restartPosition ?? 0;
  const hasLoop = restartPos > 0 ? 1 : 0;
  const loopStep = restartPos * 4;
  output[pos] = hasLoop;
  output[pos + 1] = loopStep & 255;
  output[pos + 2] = songSpeed & 15;
  output[pos + 3] = songLength & 255;
  writeString(output, pos + 4, song.name ?? "Untitled", 12);
  pos += 16;
  for (let i = 1; i < 8; i++) {
    output[pos] = 0;
    output[pos + 1] = 0;
    output[pos + 2] = 6;
    output[pos + 3] = 0;
    writeString(output, pos + 4, "", 12);
    pos += 16;
  }
  for (const step of trackSteps) {
    output[pos] = step.pattern & 255;
    writeS8(output, pos + 1, step.transpose);
    pos += 2;
  }
  for (const def of instrDefs) {
    output.set(def, pos);
    pos += 16;
  }
  const wavetableBlock = new Uint8Array(wavetableBytes);
  for (const [origIdx, arrIdx] of wavetableIndexMap) {
    const offset = origIdx * 128;
    if (offset + 128 <= wavetableBlock.length) {
      wavetableBlock.set(wavetables[arrIdx], offset);
    }
  }
  if (wavetableIndexMap.size === 0) {
    for (let i = 0; i < wavetables.length && i * 128 < wavetableBytes; i++) {
      wavetableBlock.set(wavetables[i], i * 128);
    }
  }
  output.set(wavetableBlock, pos);
  pos += wavetableBytes;
  let pcmOffset = 0;
  for (const pcm of pcmSamples) {
    const headerOff = pos;
    const dataLen = pcm.data.length + (pcm.data.length & 1);
    writeU32BE(view, headerOff, pcmOffset);
    writeU32BE(view, headerOff + 4, pcmOffset + dataLen);
    if (pcm.repeat > 0) {
      writeU32BE(view, headerOff + 8, pcmOffset + pcm.loopOffset);
    } else {
      writeU32BE(view, headerOff + 8, 0);
    }
    writeString(output, headerOff + 12, pcm.name, 12);
    pcmOffset += dataLen;
    pos += 32;
  }
  for (const block of patternPool) {
    output.set(block, pos);
    pos += block.length;
  }
  for (const pcm of pcmSamples) {
    output.set(pcm.data, pos);
    pos += pcm.data.length;
    if (pcm.data.length & 1) {
      output[pos] = 0;
      pos++;
    }
  }
  if (hasArpeggios) {
    output.set(arpeggioData, pos);
    pos += 256;
  }
  if (song.numChannels > 4) {
    warnings.push(`Digital Mugician supports 4 channels; ${song.numChannels - 4} channels were dropped.`);
  }
  if (sampleCount > 63) {
    warnings.push(`Digital Mugician supports up to 63 instruments; ${sampleCount - 63} were dropped.`);
  }
  if (songLen > 255) {
    warnings.push("Song length exceeds 255 positions; truncated.");
  }
  if (patternPool.length > 255) {
    warnings.push(`Pattern pool exceeds 255 entries (${patternPool.length}); file may not load correctly.`);
  }
  const baseName = (song.name || "untitled").replace(/[^a-zA-Z0-9_-]/g, "_");
  return {
    data: new Blob([output], { type: "application/octet-stream" }),
    filename: `${baseName}.dmu`,
    warnings
  };
}
export {
  exportDigitalMugician
};
