const MAX_INSTRUMENTS = 20;
const MAX_CHANNELS = 4;
const ROWS_PER_BLOCK = 16;
const BYTES_PER_CELL = 4;
const BYTES_PER_BLOCK = ROWS_PER_BLOCK * BYTES_PER_CELL;
const HEADER_SIZE = 104;
function xmNoteToDM1(xmNote) {
  if (xmNote <= 0 || xmNote === 97) return 0;
  const amigaIdx = xmNote - 36;
  if (amigaIdx < 0) return 0;
  const dm1Note = amigaIdx + 1;
  return Math.min(83, Math.max(1, dm1Note));
}
function xmEffectToDM1(effTyp, eff) {
  switch (effTyp) {
    case 15:
      return [1, eff];
    case 1:
      return [2, eff];
    case 2:
      return [3, eff];
    case 3:
      return [9, eff];
    case 12:
      return [10, Math.min(64, eff)];
    default:
      return [0, 0];
  }
}
function blockKey(block) {
  return block.rows.map((r) => `${r.instrument}:${r.note}:${r.effect}:${r.effectArg}`).join("|");
}
async function exportDeltaMusic1(song) {
  var _a, _b, _c, _d;
  const warnings = [];
  const instCount = Math.min(MAX_INSTRUMENTS, song.instruments.length);
  if (song.instruments.length > MAX_INSTRUMENTS) {
    warnings.push(`DM1 supports max ${MAX_INSTRUMENTS} instruments; ${song.instruments.length - MAX_INSTRUMENTS} will be dropped.`);
  }
  const instrumentSlots = [];
  for (let i = 0; i < MAX_INSTRUMENTS; i++) {
    if (i >= instCount) {
      instrumentSlots.push({ headerBytes: new Uint8Array(0), sampleData: new Uint8Array(0), totalLength: 0 });
      continue;
    }
    const inst = song.instruments[i];
    const dm1Cfg = inst.deltaMusic1;
    const isSample = (dm1Cfg == null ? void 0 : dm1Cfg.isSample) ?? !!((_a = inst.sample) == null ? void 0 : _a.audioBuffer);
    let sampleBytes = new Uint8Array(0);
    let sampleLenWords = 0;
    let repeatStartWords = 0;
    let repeatLenWords = 0;
    if ((_b = inst.sample) == null ? void 0 : _b.audioBuffer) {
      const wav = new DataView(inst.sample.audioBuffer);
      const dataLen = wav.getUint32(40, true);
      const frames = Math.floor(dataLen / 2);
      sampleBytes = new Uint8Array(frames);
      for (let j = 0; j < frames; j++) {
        const s16 = wav.getInt16(44 + j * 2, true);
        sampleBytes[j] = s16 >> 8 & 255;
      }
      sampleLenWords = Math.ceil(frames / 2);
      const loopStart = ((_c = inst.sample) == null ? void 0 : _c.loopStart) ?? 0;
      const loopEnd = ((_d = inst.sample) == null ? void 0 : _d.loopEnd) ?? 0;
      if (loopEnd > loopStart) {
        repeatStartWords = Math.floor(loopStart / 2);
        repeatLenWords = Math.ceil((loopEnd - loopStart) / 2);
      }
    } else if (!isSample && (dm1Cfg == null ? void 0 : dm1Cfg.table)) {
      let maxWaveIdx = 0;
      for (const entry of dm1Cfg.table) {
        if (entry === 255) break;
        if (entry < 128 && entry > maxWaveIdx) maxWaveIdx = entry;
      }
      const neededBytes = (maxWaveIdx + 1) * 32;
      sampleBytes = new Uint8Array(neededBytes);
      sampleLenWords = Math.ceil(neededBytes / 2);
      if (sampleLenWords === 0) sampleLenWords = 16;
      if (sampleBytes.length === 0) sampleBytes = new Uint8Array(sampleLenWords * 2);
      repeatStartWords = 0;
      repeatLenWords = sampleLenWords;
    }
    if (sampleLenWords === 0 && !dm1Cfg) {
      instrumentSlots.push({ headerBytes: new Uint8Array(0), sampleData: new Uint8Array(0), totalLength: 0 });
      continue;
    }
    if (sampleLenWords === 0 && dm1Cfg) {
      sampleLenWords = 16;
      sampleBytes = new Uint8Array(sampleLenWords * 2);
      repeatStartWords = 0;
      repeatLenWords = sampleLenWords;
    }
    const headerSize = isSample ? 30 : 78;
    const header = new Uint8Array(headerSize);
    const volume = (dm1Cfg == null ? void 0 : dm1Cfg.volume) ?? 64;
    const attackStep = (dm1Cfg == null ? void 0 : dm1Cfg.attackStep) ?? 0;
    const attackDelay = (dm1Cfg == null ? void 0 : dm1Cfg.attackDelay) ?? 0;
    const decayStep = (dm1Cfg == null ? void 0 : dm1Cfg.decayStep) ?? 0;
    const decayDelay = (dm1Cfg == null ? void 0 : dm1Cfg.decayDelay) ?? 0;
    const sustain = (dm1Cfg == null ? void 0 : dm1Cfg.sustain) ?? 0;
    const releaseStep = (dm1Cfg == null ? void 0 : dm1Cfg.releaseStep) ?? 0;
    const releaseDelay = (dm1Cfg == null ? void 0 : dm1Cfg.releaseDelay) ?? 0;
    const vibratoWait = (dm1Cfg == null ? void 0 : dm1Cfg.vibratoWait) ?? 0;
    const vibratoStep = (dm1Cfg == null ? void 0 : dm1Cfg.vibratoStep) ?? 0;
    const vibratoLength = (dm1Cfg == null ? void 0 : dm1Cfg.vibratoLength) ?? 0;
    const bendRate = (dm1Cfg == null ? void 0 : dm1Cfg.bendRate) ?? 0;
    const portamento = (dm1Cfg == null ? void 0 : dm1Cfg.portamento) ?? 0;
    const tableDelay = (dm1Cfg == null ? void 0 : dm1Cfg.tableDelay) ?? 0;
    const arpeggio = (dm1Cfg == null ? void 0 : dm1Cfg.arpeggio) ?? [0, 0, 0, 0, 0, 0, 0, 0];
    header[0] = attackStep & 255;
    header[1] = attackDelay & 255;
    header[2] = decayStep & 255;
    header[3] = decayDelay & 255;
    header[4] = sustain >> 8 & 255;
    header[5] = sustain & 255;
    header[6] = releaseStep & 255;
    header[7] = releaseDelay & 255;
    header[8] = volume & 255;
    header[9] = vibratoWait & 255;
    header[10] = vibratoStep & 255;
    header[11] = vibratoLength & 255;
    header[12] = bendRate & 255;
    header[13] = portamento & 255;
    header[14] = isSample ? 1 : 0;
    header[15] = tableDelay & 255;
    for (let a = 0; a < 8; a++) {
      header[16 + a] = (arpeggio[a] ?? 0) & 255;
    }
    header[24] = sampleLenWords >> 8 & 255;
    header[25] = sampleLenWords & 255;
    header[26] = repeatStartWords >> 8 & 255;
    header[27] = repeatStartWords & 255;
    header[28] = repeatLenWords >> 8 & 255;
    header[29] = repeatLenWords & 255;
    if (!isSample) {
      const table = (dm1Cfg == null ? void 0 : dm1Cfg.table) ?? [];
      for (let t = 0; t < 48; t++) {
        header[30 + t] = (table[t] ?? 0) & 255;
      }
    }
    instrumentSlots.push({
      headerBytes: header,
      sampleData: sampleBytes,
      totalLength: header.length + sampleBytes.length
    });
  }
  const allBlocks = [];
  const blockMap = /* @__PURE__ */ new Map();
  const trackEntries = [[], [], [], []];
  const songLen = song.songPositions.length;
  if (songLen === 0) {
    warnings.push("Song has no positions; exporting empty module.");
  }
  for (let pos = 0; pos < songLen; pos++) {
    const patIdx = song.songPositions[pos] ?? 0;
    const pat = song.patterns[patIdx];
    if (!pat) {
      for (let ch = 0; ch < MAX_CHANNELS; ch++) {
        const emptyBlock = {
          rows: Array.from({ length: ROWS_PER_BLOCK }, () => ({
            instrument: 0,
            note: 0,
            effect: 0,
            effectArg: 0
          }))
        };
        const key = blockKey(emptyBlock);
        if (!blockMap.has(key)) {
          blockMap.set(key, allBlocks.length);
          allBlocks.push(emptyBlock);
        }
        trackEntries[ch].push({ blockNum: blockMap.get(key), transpose: 0 });
      }
      continue;
    }
    for (let ch = 0; ch < MAX_CHANNELS; ch++) {
      const channel = pat.channels[ch];
      const block = {
        rows: Array.from({ length: ROWS_PER_BLOCK }, (_, row) => {
          const cell = channel == null ? void 0 : channel.rows[row];
          if (!cell) return { instrument: 0, note: 0, effect: 0, effectArg: 0 };
          const xmNote = cell.note ?? 0;
          const dm1Note = xmNoteToDM1(xmNote);
          const instrId = cell.instrument ?? 0;
          const dm1Instr = instrId > 0 ? instrId - 1 & 255 : 0;
          const [effType, effArg] = xmEffectToDM1(cell.effTyp ?? 0, cell.eff ?? 0);
          return {
            instrument: dm1Note > 0 ? dm1Instr : 0,
            note: dm1Note,
            effect: effType,
            effectArg: effArg
          };
        })
      };
      const key = blockKey(block);
      if (!blockMap.has(key)) {
        blockMap.set(key, allBlocks.length);
        allBlocks.push(block);
      }
      trackEntries[ch].push({ blockNum: blockMap.get(key), transpose: 0 });
    }
  }
  if (allBlocks.length === 0) {
    allBlocks.push({
      rows: Array.from({ length: ROWS_PER_BLOCK }, () => ({
        instrument: 0,
        note: 0,
        effect: 0,
        effectArg: 0
      }))
    });
    for (let ch = 0; ch < MAX_CHANNELS; ch++) {
      trackEntries[ch].push({ blockNum: 0, transpose: 0 });
    }
  }
  if (allBlocks.length > 255) {
    warnings.push(`DM1 block index is 8-bit; ${allBlocks.length} blocks may cause issues.`);
  }
  const trackBuffers = [];
  for (let ch = 0; ch < MAX_CHANNELS; ch++) {
    const entries = trackEntries[ch];
    const buf = new Uint8Array((entries.length + 2) * 2);
    let off2 = 0;
    for (const entry of entries) {
      buf[off2++] = entry.blockNum & 255;
      buf[off2++] = entry.transpose & 255;
    }
    buf[off2++] = 255;
    buf[off2++] = 255;
    const loopTarget = (song.restartPosition ?? 0) & 2047;
    buf[off2++] = loopTarget >> 8 & 255;
    buf[off2++] = loopTarget & 255;
    trackBuffers.push(buf);
  }
  const trackLengths = trackBuffers.map((b) => b.length);
  const blockSectionLength = allBlocks.length * BYTES_PER_BLOCK;
  const instrumentLengths = instrumentSlots.map((s) => s.totalLength);
  const totalTrackBytes = trackLengths.reduce((a, b) => a + b, 0);
  const totalInstrBytes = instrumentLengths.reduce((a, b) => a + b, 0);
  const totalSize = HEADER_SIZE + totalTrackBytes + blockSectionLength + totalInstrBytes;
  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);
  let off = 0;
  output[0] = 65;
  output[1] = 76;
  output[2] = 76;
  output[3] = 32;
  off = 4;
  for (let ch = 0; ch < 4; ch++) {
    view.setUint32(off, trackLengths[ch], false);
    off += 4;
  }
  view.setUint32(off, blockSectionLength, false);
  off += 4;
  for (let i = 0; i < MAX_INSTRUMENTS; i++) {
    view.setUint32(off, instrumentLengths[i], false);
    off += 4;
  }
  for (let ch = 0; ch < 4; ch++) {
    output.set(trackBuffers[ch], off);
    off += trackBuffers[ch].length;
  }
  for (const block of allBlocks) {
    for (let row = 0; row < ROWS_PER_BLOCK; row++) {
      const r = block.rows[row];
      output[off++] = r.instrument & 255;
      output[off++] = r.note & 255;
      output[off++] = r.effect & 255;
      output[off++] = r.effectArg & 255;
    }
  }
  for (let i = 0; i < MAX_INSTRUMENTS; i++) {
    const slot = instrumentSlots[i];
    if (slot.totalLength === 0) continue;
    output.set(slot.headerBytes, off);
    off += slot.headerBytes.length;
    output.set(slot.sampleData, off);
    off += slot.sampleData.length;
  }
  const baseName = song.name || "untitled";
  const filename = baseName.endsWith(".dm1") ? baseName : `${baseName}.dm1`;
  return {
    data: new Blob([output], { type: "application/octet-stream" }),
    filename,
    warnings
  };
}
export {
  exportDeltaMusic1
};
