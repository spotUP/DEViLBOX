function writeU16BE(view, off, val) {
  view.setUint16(off, val, false);
}
function writeU32BE(view, off, val) {
  view.setUint32(off, val, false);
}
function writeStr(view, off, str, len) {
  for (let i = 0; i < len; i++) {
    view.setUint8(off + i, i < str.length ? str.charCodeAt(i) & 255 : 0);
  }
}
const PERIODS = [
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
  453,
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
  113
];
function xmNoteToPeriod(xmNote) {
  if (xmNote === 0) return 0;
  const idx = xmNote - 13;
  if (idx < 0 || idx >= PERIODS.length) return 0;
  return PERIODS[idx];
}
function exportMED(song) {
  var _a, _b, _c, _d;
  const nChannels = Math.min(4, song.numChannels);
  const nBlocks = song.patterns.length;
  const nInstrs = Math.min(63, song.instruments.length);
  const songLen = Math.min(256, song.songPositions.length);
  const samplePCMs = [];
  for (let i = 0; i < nInstrs; i++) {
    const inst = song.instruments[i];
    if ((_a = inst == null ? void 0 : inst.sample) == null ? void 0 : _a.audioBuffer) {
      const wav = new DataView(inst.sample.audioBuffer);
      const dataLen = wav.getUint32(40, true);
      const frames = Math.floor(dataLen / 2);
      const pcm = new Uint8Array(frames);
      for (let j = 0; j < frames; j++) {
        const s16 = wav.getInt16(44 + j * 2, true);
        pcm[j] = (s16 >> 8) + 128 & 255;
      }
      samplePCMs.push(pcm);
    } else {
      samplePCMs.push(new Uint8Array(0));
    }
  }
  const HEADER_SIZE = 52;
  const INSTR_SIZE = 63 * 8;
  const SONG_MISC = 268;
  const SONG_SIZE = INSTR_SIZE + SONG_MISC;
  const BLOCK_PTRS = nBlocks * 4;
  const blockSizes = song.patterns.map((p) => {
    const lines = p.length;
    return 4 + lines * nChannels * 3;
  });
  const totalBlockBytes = blockSizes.reduce((a, b) => a + b, 0);
  const sampleTotalBytes = samplePCMs.reduce((a, p) => a + (p.length + 1 & -2), 0);
  const songOffset = HEADER_SIZE;
  const blockPtrOff = songOffset + SONG_SIZE;
  const blockDataOff = blockPtrOff + BLOCK_PTRS;
  const sampleDataOff = blockDataOff + totalBlockBytes;
  const totalSize = sampleDataOff + sampleTotalBytes;
  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);
  writeStr(view, 0, "MMD0", 4);
  writeU32BE(view, 4, totalSize);
  writeU32BE(view, 8, songOffset);
  writeU32BE(view, 16, blockPtrOff);
  let so = songOffset;
  for (let i = 0; i < 63; i++) {
    const base = so + i * 8;
    if (i < nInstrs) {
      const pcm = samplePCMs[i];
      writeU32BE(view, base, Math.ceil(pcm.length / 2));
      view.setUint8(base + 4, 0);
      view.setUint8(base + 5, 64);
      const inst = song.instruments[i];
      const loopStart = ((_b = inst == null ? void 0 : inst.sample) == null ? void 0 : _b.loopStart) ?? 0;
      const loopEnd = ((_c = inst == null ? void 0 : inst.sample) == null ? void 0 : _c.loopEnd) ?? 0;
      writeU16BE(view, base + 6, Math.ceil(loopStart / 2));
      writeU16BE(view, base + 8, Math.ceil(Math.max(0, loopEnd - loopStart) / 2));
    }
  }
  so += INSTR_SIZE;
  writeU16BE(view, so, nBlocks);
  writeU16BE(view, so + 2, songLen);
  for (let i = 0; i < 256; i++) {
    output[so + 4 + i] = i < songLen ? song.songPositions[i] ?? 0 : 0;
  }
  writeU16BE(view, so + 260, song.initialBPM ?? 125);
  output[so + 263] = 0;
  output[so + 264] = song.initialSpeed ?? 6;
  output[so + 265] = nInstrs;
  so += SONG_MISC;
  let blockOff = blockDataOff;
  for (let i = 0; i < nBlocks; i++) {
    writeU32BE(view, blockPtrOff + i * 4, blockOff);
    blockOff += blockSizes[i];
  }
  let bpos = blockDataOff;
  for (const pattern of song.patterns) {
    const nLines = pattern.length;
    writeU16BE(view, bpos, nChannels);
    writeU16BE(view, bpos + 2, nLines - 1);
    bpos += 4;
    for (let row = 0; row < nLines; row++) {
      for (let ch = 0; ch < nChannels; ch++) {
        const cell = (_d = pattern.channels[ch]) == null ? void 0 : _d.rows[row];
        const period = xmNoteToPeriod((cell == null ? void 0 : cell.note) ?? 0);
        const inst = (cell == null ? void 0 : cell.instrument) ?? 0;
        const eff = (cell == null ? void 0 : cell.effTyp) ?? 0;
        const param = (cell == null ? void 0 : cell.eff) ?? 0;
        output[bpos] = (inst >> 4 & 15) << 4 | period >> 8 & 15;
        output[bpos + 1] = period & 255;
        output[bpos + 2] = (inst & 15) << 4 | eff & 15;
        output[bpos + 3] = param;
        bpos += 4;
      }
    }
  }
  let spos = sampleDataOff;
  for (const pcm of samplePCMs) {
    output.set(pcm, spos);
    spos += pcm.length;
    if (pcm.length & 1) spos++;
  }
  return output.buffer;
}
export {
  exportMED
};
