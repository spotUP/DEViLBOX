const DM2_PERIODS = [
  0,
  6848,
  6464,
  6096,
  5760,
  5424,
  5120,
  4832,
  4560,
  4304,
  4064,
  3840,
  3616,
  3424,
  3232,
  3048,
  2880,
  2712,
  2560,
  2416,
  2280,
  2152,
  2032,
  1920,
  1808,
  1712,
  1616,
  1524,
  1440,
  1356,
  1280,
  1208,
  1140,
  1076,
  1016,
  960,
  904,
  856,
  808,
  762,
  720,
  678,
  640,
  604,
  570,
  538,
  508,
  480,
  452,
  428,
  404,
  381,
  360,
  339,
  320,
  302,
  285,
  269,
  254,
  240,
  226,
  214,
  202,
  190,
  180,
  170,
  160,
  151,
  143,
  135,
  127,
  120,
  113,
  113,
  113,
  113,
  113,
  113,
  113,
  113,
  113,
  113,
  113,
  113,
  113
];
const PERIOD_TABLE_OFFSET = 2786;
const START_SPEED_OFFSET = 3003;
const MAGIC_OFFSET = 3014;
const TRACK_HEADER_OFFSET = 4042;
const TRACK_DATA_OFFSET = 4058;
const FIXED_HEADER_SIZE = TRACK_DATA_OFFSET;
function writeU16BE(view, off, val) {
  view.setUint16(off, val & 65535, false);
}
function writeU32BE(view, off, val) {
  view.setUint32(off, val >>> 0, false);
}
function writeS8(arr, off, val) {
  arr[off] = val & 255;
}
function extractPCMFromWav(audioBuffer) {
  if (audioBuffer.byteLength < 44) return null;
  const wav = new DataView(audioBuffer);
  const dataLen = wav.getUint32(40, true);
  const frames = Math.floor(dataLen / 2);
  const pcm = new Int8Array(frames);
  for (let j = 0; j < frames; j++) {
    const s16 = wav.getInt16(44 + j * 2, true);
    pcm[j] = s16 >> 8;
  }
  return pcm;
}
function buildBlock(song, patternIndex, channel) {
  const block = new Uint8Array(64);
  const pattern = song.patterns[patternIndex];
  if (!pattern) return block;
  const ch = pattern.channels[channel];
  if (!ch) return block;
  for (let row = 0; row < 16; row++) {
    const cell = ch.rows[row];
    if (!cell) continue;
    const off = row * 4;
    const note = cell.note ?? 0;
    block[off] = note > 0 && note <= 96 ? note : 0;
    const instr = cell.instrument ?? 0;
    block[off + 1] = instr > 0 ? instr - 1 & 255 : 0;
    const effTyp = cell.effTyp ?? 0;
    const eff = cell.eff ?? 0;
    const vol = cell.volume ?? 0;
    let dm2Eff = 0;
    let dm2Param = 0;
    if (vol >= 16 && vol <= 80) {
      const xmVol = vol - 16;
      dm2Eff = 6;
      dm2Param = Math.round(xmVol / 64 * 63) & 63;
    } else {
      switch (effTyp) {
        case 15:
          dm2Eff = 1;
          dm2Param = eff & 15;
          break;
        case 1:
          dm2Eff = 3;
          dm2Param = eff;
          break;
        case 2:
          dm2Eff = 4;
          dm2Param = eff;
          break;
        case 3:
          dm2Eff = 5;
          dm2Param = eff;
          break;
        case 16:
          dm2Eff = 7;
          dm2Param = Math.round(Math.min(64, eff) / 64 * 63) & 63;
          break;
        case 0:
          if (eff !== 0) {
            dm2Eff = 8;
            dm2Param = eff & 63;
          }
          break;
      }
    }
    block[off + 2] = dm2Eff & 255;
    block[off + 3] = dm2Param & 255;
  }
  return block;
}
function blocksEqual(a, b) {
  for (let i = 0; i < 64; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
async function exportDeltaMusic2(song) {
  var _a, _b;
  const warnings = [];
  const nChannels = 4;
  const numPatterns = song.patterns.length;
  const songLen = Math.min(256, song.songPositions.length || numPatterns);
  const uniqueBlocks = [];
  const trackEntries = [
    [],
    [],
    [],
    []
  ];
  for (let pos = 0; pos < songLen; pos++) {
    const patIdx = song.songPositions[pos] ?? pos;
    for (let ch = 0; ch < nChannels; ch++) {
      const blockData = buildBlock(song, patIdx, ch);
      let blockNum = -1;
      for (let b = 0; b < uniqueBlocks.length; b++) {
        if (blocksEqual(uniqueBlocks[b].data, blockData)) {
          blockNum = b;
          break;
        }
      }
      if (blockNum < 0) {
        blockNum = uniqueBlocks.length;
        uniqueBlocks.push({ data: blockData });
      }
      if (blockNum > 255) {
        warnings.push(`Block count exceeds 255; channel ${ch + 1} position ${pos} may be incorrect.`);
        blockNum = 255;
      }
      trackEntries[ch].push({ blockNumber: blockNum, transpose: 0 });
    }
  }
  const maxInstruments = Math.min(128, song.instruments.length);
  const sampleSlots = new Array(8).fill(null);
  let nextSampleSlot = 0;
  const instrumentHeaders = [];
  for (let i = 0; i < maxInstruments; i++) {
    const inst = song.instruments[i];
    const header = new Uint8Array(88);
    const hv = new DataView(header.buffer);
    const dm2 = inst == null ? void 0 : inst.deltaMusic2;
    const hasSample = ((_a = inst == null ? void 0 : inst.sample) == null ? void 0 : _a.audioBuffer) && inst.sample.audioBuffer.byteLength > 44;
    const isSample = (dm2 == null ? void 0 : dm2.isSample) ?? !!hasSample;
    let sampleSlotIdx = 0;
    let sampleLenWords = 0;
    let repeatStartBytes = 0;
    let repeatLenWords = 0;
    if (isSample && hasSample) {
      const pcm = extractPCMFromWav(inst.sample.audioBuffer);
      if (pcm && pcm.length > 0) {
        sampleSlotIdx = nextSampleSlot < 8 ? nextSampleSlot++ : 7;
        sampleSlots[sampleSlotIdx] = { pcm };
        sampleLenWords = Math.floor(pcm.length / 2);
        const loopStart = inst.sample.loopStart ?? 0;
        const loopEnd = inst.sample.loopEnd ?? 0;
        if (loopEnd > loopStart && inst.sample.loop) {
          repeatStartBytes = loopStart;
          repeatLenWords = Math.floor((loopEnd - loopStart) / 2);
        }
      }
    } else if (!isSample && dm2) {
      sampleLenWords = 128;
    }
    hv.setUint16(0, sampleLenWords, false);
    hv.setUint16(2, repeatStartBytes, false);
    hv.setUint16(4, repeatLenWords, false);
    if (dm2 == null ? void 0 : dm2.volTable) {
      for (let v = 0; v < 5; v++) {
        const entry = dm2.volTable[v];
        if (entry) {
          header[6 + v * 3] = entry.speed & 255;
          header[6 + v * 3 + 1] = entry.level & 255;
          header[6 + v * 3 + 2] = entry.sustain & 255;
        }
      }
    }
    if (dm2 == null ? void 0 : dm2.vibTable) {
      for (let v = 0; v < 5; v++) {
        const entry = dm2.vibTable[v];
        if (entry) {
          header[21 + v * 3] = entry.speed & 255;
          header[21 + v * 3 + 1] = entry.delay & 255;
          header[21 + v * 3 + 2] = entry.sustain & 255;
        }
      }
    }
    hv.setUint16(36, ((dm2 == null ? void 0 : dm2.pitchBend) ?? 0) & 65535, false);
    header[38] = isSample ? 255 : 0;
    header[39] = sampleSlotIdx & 7;
    if (dm2 == null ? void 0 : dm2.table) {
      const tbl = dm2.table;
      for (let t = 0; t < 48; t++) {
        header[40 + t] = t < tbl.length ? tbl[t] : 255;
      }
    } else {
      for (let t = 40; t < 88; t++) {
        header[t] = 255;
      }
    }
    instrumentHeaders.push(header);
  }
  if (maxInstruments === 0) {
    warnings.push("No instruments found; output may not play correctly.");
  }
  const waveforms = [];
  const waveformMap = /* @__PURE__ */ new Map();
  for (let i = 0; i < maxInstruments; i++) {
    const inst = song.instruments[i];
    const dm2 = inst == null ? void 0 : inst.deltaMusic2;
    if (!dm2 || dm2.isSample) continue;
    if ((_b = inst == null ? void 0 : inst.sample) == null ? void 0 : _b.audioBuffer) {
      const pcm = extractPCMFromWav(inst.sample.audioBuffer);
      if (pcm) {
        for (let t = 0; t < 48; t++) {
          const wIdx = dm2.table[t];
          if (wIdx === 255) break;
          if (!waveformMap.has(wIdx)) {
            const wave = new Uint8Array(256);
            for (let j = 0; j < 256; j++) {
              wave[j] = j < pcm.length ? pcm[j] & 255 : 0;
            }
            waveformMap.set(wIdx, wave);
          }
        }
      }
    }
  }
  if (waveformMap.size > 0) {
    const maxWaveIdx = Math.max(...waveformMap.keys());
    for (let w = 0; w <= maxWaveIdx; w++) {
      waveforms.push(waveformMap.get(w) ?? new Uint8Array(256));
    }
  }
  const trackDataSize = nChannels * songLen * 2;
  const blockDataSize = uniqueBlocks.length * 64;
  const instrOffsetTableSize = 256;
  const instrDataSize = maxInstruments * 88;
  const waveformDataSize = waveforms.length * 256;
  const unknownBytes = 64;
  const sampleOffsetTableSize = 32;
  let totalSamplePCMSize = 0;
  const samplePCMOffsets = new Array(8).fill(0);
  for (let s = 0; s < 8; s++) {
    samplePCMOffsets[s] = totalSamplePCMSize;
    if (sampleSlots[s]) {
      totalSamplePCMSize += sampleSlots[s].pcm.length;
    }
  }
  const totalSize = FIXED_HEADER_SIZE + trackDataSize + 4 + blockDataSize + // u32 blockDataLen + block data
  instrOffsetTableSize + instrDataSize + 4 + waveformDataSize + // u32 waveformDataLen + waveform data
  unknownBytes + sampleOffsetTableSize + totalSamplePCMSize;
  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);
  for (let i = 0; i < 85; i++) {
    writeU16BE(view, PERIOD_TABLE_OFFSET + i * 2, DM2_PERIODS[i]);
  }
  const speed = Math.max(1, Math.min(15, song.initialSpeed ?? 3));
  output[START_SPEED_OFFSET] = speed & 255;
  output[MAGIC_OFFSET] = 46;
  output[MAGIC_OFFSET + 1] = 70;
  output[MAGIC_OFFSET + 2] = 78;
  output[MAGIC_OFFSET + 3] = 76;
  for (let ch = 0; ch < 4; ch++) {
    const entryCount = trackEntries[ch].length;
    writeU16BE(view, TRACK_HEADER_OFFSET + ch * 4, 0);
    writeU16BE(view, TRACK_HEADER_OFFSET + ch * 4 + 2, entryCount * 2);
  }
  let off = TRACK_DATA_OFFSET;
  for (let ch = 0; ch < 4; ch++) {
    for (const entry of trackEntries[ch]) {
      output[off] = entry.blockNumber & 255;
      writeS8(output, off + 1, entry.transpose);
      off += 2;
    }
  }
  writeU32BE(view, off, blockDataSize);
  off += 4;
  for (const block of uniqueBlocks) {
    output.set(block.data, off);
    off += 64;
  }
  const breakOffset = maxInstruments * 88;
  for (let i = 1; i <= 127; i++) {
    if (i < maxInstruments) {
      writeU16BE(view, off + (i - 1) * 2, i * 88);
    } else {
      writeU16BE(view, off + (i - 1) * 2, breakOffset);
    }
  }
  off += 256;
  for (let i = 0; i < maxInstruments; i++) {
    output.set(instrumentHeaders[i], off);
    off += 88;
  }
  writeU32BE(view, off, waveformDataSize);
  off += 4;
  for (const wave of waveforms) {
    output.set(wave, off);
    off += 256;
  }
  off += 64;
  for (let s = 0; s < 8; s++) {
    writeU32BE(view, off + s * 4, samplePCMOffsets[s]);
  }
  off += 32;
  for (let s = 0; s < 8; s++) {
    const slot = sampleSlots[s];
    if (slot) {
      for (let j = 0; j < slot.pcm.length; j++) {
        output[off + j] = slot.pcm[j] & 255;
      }
      off += slot.pcm.length;
    }
  }
  const baseName = (song.name || "untitled").replace(/[^a-zA-Z0-9_\- ]/g, "_");
  return {
    data: new Blob([output], { type: "application/octet-stream" }),
    filename: `${baseName}.dm2`,
    warnings
  };
}
export {
  exportDeltaMusic2
};
