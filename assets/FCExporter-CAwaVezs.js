function writeU16BE(view, off, val) {
  view.setUint16(off, val, false);
}
function writeU32BE(view, off, val) {
  view.setUint32(off, val, false);
}
function xmNoteToFC(xmNote) {
  if (xmNote === 0) return 0;
  if (xmNote === 97) return 73;
  const fc = xmNote - 12;
  return fc < 1 || fc > 72 ? 0 : fc;
}
function exportFC(song) {
  var _a, _b, _c, _d;
  const nChannels = 4;
  const nInstrs = Math.min(10, song.instruments.length);
  const samplePCMs = [];
  const sampleDefs = [];
  for (let i = 0; i < 10; i++) {
    if (i < nInstrs) {
      const inst = song.instruments[i];
      if ((_a = inst == null ? void 0 : inst.sample) == null ? void 0 : _a.audioBuffer) {
        const wav = new DataView(inst.sample.audioBuffer);
        const dataLen = wav.getUint32(40, true);
        const frames = Math.floor(dataLen / 2);
        const pcm = new Uint8Array(frames);
        for (let j = 0; j < frames; j++) {
          const s16 = wav.getInt16(44 + j * 2, true);
          pcm[j] = (s16 >> 8) + 128 & 255;
          pcm[j] = s16 >> 8 & 255;
        }
        samplePCMs.push(pcm);
        const loopStart = ((_b = inst.sample) == null ? void 0 : _b.loopStart) ?? 0;
        const loopEnd = ((_c = inst.sample) == null ? void 0 : _c.loopEnd) ?? 0;
        const loopLen = loopEnd > loopStart ? Math.ceil((loopEnd - loopStart) / 2) : 0;
        sampleDefs.push({
          len: Math.ceil(frames / 2),
          // len in words
          loopStart: Math.ceil(loopStart / 2),
          loopLen
        });
      } else {
        samplePCMs.push(new Uint8Array(0));
        sampleDefs.push({ len: 0, loopStart: 0, loopLen: 0 });
      }
    } else {
      samplePCMs.push(new Uint8Array(0));
      sampleDefs.push({ len: 0, loopStart: 0, loopLen: 0 });
    }
  }
  const nSongPatterns = song.patterns.length;
  const songLen = Math.min(128, song.songPositions.length);
  const fcPatterns = [];
  const patMap = /* @__PURE__ */ new Map();
  for (let p = 0; p < nSongPatterns; p++) {
    const pat = song.patterns[p];
    for (let ch = 0; ch < nChannels; ch++) {
      const key = `${p}:${ch}`;
      const fcIdx = fcPatterns.length;
      patMap.set(key, fcIdx);
      const note = new Uint8Array(32);
      const val = new Uint8Array(32);
      for (let row = 0; row < 32; row++) {
        const cell = (_d = pat.channels[ch]) == null ? void 0 : _d.rows[row];
        const xmNote = (cell == null ? void 0 : cell.note) ?? 0;
        const inst = (cell == null ? void 0 : cell.instrument) ?? 0;
        if (xmNote === 97) {
          note[row] = 240;
          val[row] = 240;
        } else {
          note[row] = xmNoteToFC(xmNote);
          val[row] = inst > 0 ? Math.min(9, inst - 1) : 0;
        }
      }
      fcPatterns.push({ note, val });
    }
  }
  const sequences = [];
  for (let i = 0; i < songLen; i++) {
    const songPatIdx = song.songPositions[i] ?? 0;
    sequences.push({
      pat: [
        patMap.get(`${songPatIdx}:0`) ?? 0,
        patMap.get(`${songPatIdx}:1`) ?? 0,
        patMap.get(`${songPatIdx}:2`) ?? 0,
        patMap.get(`${songPatIdx}:3`) ?? 0
      ],
      transpose: [0, 0, 0, 0],
      offsetIns: [0, 0, 0, 0],
      speed: i === 0 ? song.initialSpeed ?? 3 : 0
    });
  }
  const volMacros = [];
  const freqMacros = [];
  for (let i = 0; i < nInstrs; i++) {
    const fm = new Uint8Array(64).fill(0);
    fm[0] = 226;
    fm[1] = i;
    fm[2] = 224;
    fm[3] = 0;
    freqMacros.push(fm);
    const vm = new Uint8Array(64).fill(0);
    vm[0] = 1;
    vm[1] = i;
    vm[2] = 0;
    vm[3] = 0;
    vm[4] = 0;
    vm[5] = 64;
    vm[6] = 232;
    vm[7] = 0;
    vm[8] = 225;
    volMacros.push(vm);
  }
  const MAGIC_SIZE = 4;
  const HEADER_SIZE = 9 * 4;
  const SAMPLE_DEFS = 10 * 6;
  const WAVE_LENS = 80;
  const FIXED_HEADER = MAGIC_SIZE + HEADER_SIZE + SAMPLE_DEFS + WAVE_LENS;
  const seqBlockLen = sequences.length * 13;
  const patBlockLen = fcPatterns.length * 64;
  const freqMacroBlock = freqMacros.length * 64;
  const volMacroBlock = volMacros.length * 64;
  const totalSampleBytes = samplePCMs.reduce((s, p) => s + p.length, 0);
  const seqOffset = FIXED_HEADER;
  const patPtrValue = seqOffset + seqBlockLen;
  const freqMacroPtrVal = patPtrValue + patBlockLen;
  const volMacroPtrVal = freqMacroPtrVal + freqMacroBlock;
  const samplePtrValue = volMacroPtrVal + volMacroBlock;
  const wavePtrValue = samplePtrValue + totalSampleBytes;
  const totalSize = wavePtrValue;
  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);
  output[0] = 70;
  output[1] = 67;
  output[2] = 49;
  output[3] = 52;
  let h = 4;
  writeU32BE(view, h, seqBlockLen);
  h += 4;
  writeU32BE(view, h, patPtrValue);
  h += 4;
  writeU32BE(view, h, patBlockLen);
  h += 4;
  writeU32BE(view, h, freqMacroPtrVal);
  h += 4;
  writeU32BE(view, h, freqMacroBlock);
  h += 4;
  writeU32BE(view, h, volMacroPtrVal);
  h += 4;
  writeU32BE(view, h, volMacroBlock);
  h += 4;
  writeU32BE(view, h, samplePtrValue);
  h += 4;
  writeU32BE(view, h, wavePtrValue);
  h += 4;
  for (let i = 0; i < 10; i++) {
    writeU16BE(view, h, sampleDefs[i].len);
    h += 2;
    writeU16BE(view, h, sampleDefs[i].loopStart);
    h += 2;
    writeU16BE(view, h, sampleDefs[i].loopLen);
    h += 2;
  }
  h += 80;
  for (const seq of sequences) {
    for (let ch = 0; ch < 4; ch++) {
      output[h++] = seq.pat[ch] & 255;
      output[h++] = seq.transpose[ch] & 255;
      output[h++] = seq.offsetIns[ch] & 255;
    }
    output[h++] = seq.speed;
  }
  for (const fp of fcPatterns) {
    for (let row = 0; row < 32; row++) {
      output[h++] = fp.note[row];
      output[h++] = fp.val[row];
    }
  }
  for (const fm of freqMacros) {
    output.set(fm, h);
    h += 64;
  }
  for (const vm of volMacros) {
    output.set(vm, h);
    h += 64;
  }
  for (const pcm of samplePCMs) {
    output.set(pcm, h);
    h += pcm.length;
  }
  return output.buffer;
}
export {
  exportFC
};
