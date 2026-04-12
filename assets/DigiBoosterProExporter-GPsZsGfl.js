function writeStr(buf, offset, str, len) {
  for (let i = 0; i < len; i++) {
    buf[offset + i] = i < str.length ? str.charCodeAt(i) & 255 : 0;
  }
}
function iffChunk(id, data) {
  const result = new Uint8Array(8 + data.length);
  for (let i = 0; i < 4; i++) result[i] = id.charCodeAt(i) & 255;
  const view = new DataView(result.buffer);
  view.setUint32(4, data.length, false);
  result.set(data, 8);
  return result;
}
const XM_TO_DBM = /* @__PURE__ */ new Map([
  [0, 0],
  // Arpeggio
  [1, 1],
  // Portamento Up
  [2, 2],
  // Portamento Down
  [3, 3],
  // Tone Portamento
  [4, 4],
  // Vibrato
  [5, 5],
  // Tone Porta + Vol Slide
  [6, 6],
  // Vibrato + Vol Slide
  [7, 7],
  // Tremolo
  [8, 8],
  // Set Panning
  [9, 9],
  // Sample Offset
  [10, 10],
  // Volume Slide
  [11, 11],
  // Position Jump
  [12, 12],
  // Set Volume
  [13, 13],
  // Pattern Break
  [14, 14],
  // Extended (Exx)
  [15, 15],
  // Set Tempo/Speed
  [16, 16],
  // Global Volume
  [17, 17],
  // Global Vol Slide
  [20, 20],
  // Key Off
  [21, 21],
  // Set Envelope Position
  [25, 25]
  // Panning Slide
]);
function reverseDBMEffect(effTyp, eff) {
  if (effTyp === 0 && eff === 0) return { cmd: 0, param: 0 };
  const dbmCmd = XM_TO_DBM.get(effTyp);
  if (dbmCmd === void 0) return { cmd: 0, param: 0 };
  let param = eff;
  switch (dbmCmd) {
    case 13:
      param = (Math.floor(eff / 10) & 15) << 4 | eff % 10;
      break;
    case 16:
      param = Math.min(64, Math.floor(eff / 2));
      break;
  }
  return { cmd: dbmCmd, param };
}
function xmNoteToDBM(xmNote) {
  if (xmNote === 97) return 31;
  if (xmNote <= 0) return 0;
  const semi = xmNote - 13;
  if (semi < 0 || semi >= 120) return 0;
  const octave = Math.floor(semi / 12);
  const noteInOctave = semi % 12;
  return octave << 4 | noteInOctave;
}
function packPattern(channels, numRows, numChannels) {
  var _a;
  const buf = [];
  for (let row = 0; row < numRows; row++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const cell = (_a = channels[ch]) == null ? void 0 : _a.rows[row];
      if (!cell) continue;
      const note = cell.note ?? 0;
      const instr = cell.instrument ?? 0;
      const effTyp = cell.effTyp ?? 0;
      const eff = cell.eff ?? 0;
      const effTyp2 = cell.effTyp2 ?? 0;
      const eff2 = cell.eff2 ?? 0;
      const hasNote = note !== 0;
      const hasInstr = instr !== 0;
      const fx1 = reverseDBMEffect(effTyp, eff);
      const fx2 = reverseDBMEffect(effTyp2, eff2);
      const hasFx1 = fx1.cmd !== 0 || fx1.param !== 0;
      const hasFx2 = fx2.cmd !== 0 || fx2.param !== 0;
      if (!hasNote && !hasInstr && !hasFx1 && !hasFx2) continue;
      buf.push(ch + 1);
      let mask = 0;
      if (hasNote) mask |= 1;
      if (hasInstr) mask |= 2;
      if (hasFx2) {
        mask |= 4;
        mask |= 8;
      }
      if (hasFx1) {
        mask |= 16;
        mask |= 32;
      }
      buf.push(mask);
      if (mask & 1) buf.push(xmNoteToDBM(note));
      if (mask & 2) buf.push(instr & 255);
      if (mask & 4) buf.push(fx2.cmd & 255);
      if (mask & 8) buf.push(fx2.param & 255);
      if (mask & 16) buf.push(fx1.cmd & 255);
      if (mask & 32) buf.push(fx1.param & 255);
    }
    buf.push(0);
  }
  return new Uint8Array(buf);
}
function extractSampleData(inst) {
  var _a;
  if (!((_a = inst.sample) == null ? void 0 : _a.audioBuffer)) return null;
  const wav = new DataView(inst.sample.audioBuffer);
  if (inst.sample.audioBuffer.byteLength < 46) return null;
  const bitsPerSample = wav.getUint16(34, true);
  const dataLen = wav.getUint32(40, true);
  const sampleRate = inst.sample.sampleRate ?? wav.getUint32(24, true);
  if (bitsPerSample === 16) {
    const frames = Math.floor(dataLen / 2);
    const pcmBE = new Uint8Array(frames * 2);
    const beView = new DataView(pcmBE.buffer);
    for (let i = 0; i < frames; i++) {
      const s16 = wav.getInt16(44 + i * 2, true);
      beView.setInt16(i * 2, s16, false);
    }
    const hasLoop = inst.sample.loop === true;
    const loopStart = inst.sample.loopStart ?? 0;
    const loopEnd = inst.sample.loopEnd ?? frames;
    const loopLength = hasLoop ? Math.max(0, loopEnd - loopStart) : 0;
    let flags = 0;
    if (hasLoop) {
      flags |= 1;
      if (inst.sample.loopType === "pingpong") flags |= 2;
    }
    return { frames, bits: 16, pcmBE, sampleRate, loopStart, loopLength, flags };
  } else {
    const frames = dataLen;
    const pcmBE = new Uint8Array(frames);
    for (let i = 0; i < frames; i++) {
      const u8 = wav.getUint8(44 + i);
      pcmBE[i] = u8 - 128 & 255;
    }
    const hasLoop = inst.sample.loop === true;
    const loopStart = inst.sample.loopStart ?? 0;
    const loopEnd = inst.sample.loopEnd ?? frames;
    const loopLength = hasLoop ? Math.max(0, loopEnd - loopStart) : 0;
    let flags = 0;
    if (hasLoop) {
      flags |= 1;
      if (inst.sample.loopType === "pingpong") flags |= 2;
    }
    return { frames, bits: 8, pcmBE, sampleRate, loopStart, loopLength, flags };
  }
}
async function exportDigiBoosterPro(song) {
  var _a, _b, _c, _d;
  const warnings = [];
  const numChannels = song.numChannels;
  const numPatterns = song.patterns.length;
  const numInstruments = Math.min(255, song.instruments.length);
  const songLen = Math.min(256, song.songPositions.length);
  const chunks = [];
  const header = new Uint8Array(8);
  header[0] = 68;
  header[1] = 66;
  header[2] = 77;
  header[3] = 48;
  header[4] = 2;
  header[5] = 0;
  header[6] = 0;
  header[7] = 0;
  chunks.push(header);
  const songName = song.name ?? "Untitled";
  const nameBytes = new Uint8Array(songName.length);
  writeStr(nameBytes, 0, songName, songName.length);
  chunks.push(iffChunk("NAME", nameBytes));
  const sampleDatas = [];
  for (let i = 0; i < numInstruments; i++) {
    const sd = extractSampleData(song.instruments[i]);
    sampleDatas.push(sd);
  }
  const numSamples = numInstruments;
  const info = new Uint8Array(10);
  const infoView = new DataView(info.buffer);
  infoView.setUint16(0, numInstruments, false);
  infoView.setUint16(2, numSamples, false);
  infoView.setUint16(4, 1, false);
  infoView.setUint16(6, numPatterns, false);
  infoView.setUint16(8, numChannels, false);
  chunks.push(iffChunk("INFO", info));
  const songChunkSize = 44 + 2 + songLen * 2;
  const songData = new Uint8Array(songChunkSize);
  const songView = new DataView(songData.buffer);
  writeStr(songData, 0, songName, 44);
  songView.setUint16(44, songLen, false);
  for (let i = 0; i < songLen; i++) {
    const pos2 = song.songPositions[i] ?? 0;
    songView.setUint16(46 + i * 2, pos2, false);
  }
  chunks.push(iffChunk("SONG", songData));
  const instData = new Uint8Array(numInstruments * 50);
  const instView = new DataView(instData.buffer);
  for (let i = 0; i < numInstruments; i++) {
    const inst = song.instruments[i];
    const base = i * 50;
    const instName = (inst == null ? void 0 : inst.name) ?? "";
    writeStr(instData, base, instName, 30);
    const sd = sampleDatas[i];
    instView.setUint16(base + 30, sd ? i + 1 : 0, false);
    const vol = ((_b = (_a = inst == null ? void 0 : inst.metadata) == null ? void 0 : _a.modPlayback) == null ? void 0 : _b.defaultVolume) ?? 64;
    instView.setUint16(base + 32, Math.min(64, vol), false);
    const sampleRate = (sd == null ? void 0 : sd.sampleRate) ?? ((_c = inst == null ? void 0 : inst.sample) == null ? void 0 : _c.sampleRate) ?? 8287;
    const rawRate = Math.round(sampleRate * 8363 / 8303);
    instView.setUint32(base + 34, rawRate, false);
    const loopStart = (sd == null ? void 0 : sd.loopStart) ?? 0;
    const loopLength = (sd == null ? void 0 : sd.loopLength) ?? 0;
    instView.setUint32(base + 38, loopStart, false);
    instView.setUint32(base + 42, loopLength, false);
    const panPos = i % 4;
    const pan = panPos === 0 || panPos === 3 ? -50 : 50;
    instView.setInt16(base + 46, pan, false);
    const flags = (sd == null ? void 0 : sd.flags) ?? 0;
    instView.setUint16(base + 48, flags, false);
  }
  chunks.push(iffChunk("INST", instData));
  const patternParts = [];
  let unmappedEffects = 0;
  for (let p = 0; p < numPatterns; p++) {
    const pattern = song.patterns[p];
    const numRows = pattern.length;
    for (let ch = 0; ch < numChannels; ch++) {
      const rows = (_d = pattern.channels[ch]) == null ? void 0 : _d.rows;
      if (!rows) continue;
      for (let r = 0; r < numRows; r++) {
        const cell = rows[r];
        if (cell.effTyp && !XM_TO_DBM.has(cell.effTyp)) unmappedEffects++;
        if (cell.effTyp2 && !XM_TO_DBM.has(cell.effTyp2)) unmappedEffects++;
      }
    }
    const packed = packPattern(pattern.channels, numRows, numChannels);
    const patPart = new Uint8Array(6 + packed.length);
    const patPartView = new DataView(patPart.buffer);
    patPartView.setUint16(0, numRows, false);
    patPartView.setUint32(2, packed.length, false);
    patPart.set(packed, 6);
    patternParts.push(patPart);
  }
  if (unmappedEffects > 0) {
    warnings.push(`${unmappedEffects} effect(s) could not be mapped to DBM format and were dropped.`);
  }
  const pattTotalSize = patternParts.reduce((s, p) => s + p.length, 0);
  const pattData = new Uint8Array(pattTotalSize);
  let pattPos = 0;
  for (const pp of patternParts) {
    pattData.set(pp, pattPos);
    pattPos += pp.length;
  }
  chunks.push(iffChunk("PATT", pattData));
  const smplParts = [];
  for (let i = 0; i < numSamples; i++) {
    const sd = sampleDatas[i];
    if (!sd || sd.frames === 0) {
      const empty = new Uint8Array(8);
      smplParts.push(empty);
      continue;
    }
    const entrySize = 8 + sd.pcmBE.length;
    const entry = new Uint8Array(entrySize);
    const entryView = new DataView(entry.buffer);
    const flagBits = sd.bits === 16 ? 2 : 1;
    entryView.setUint32(0, flagBits, false);
    entryView.setUint32(4, sd.frames, false);
    entry.set(sd.pcmBE, 8);
    smplParts.push(entry);
  }
  const smplTotalSize = smplParts.reduce((s, p) => s + p.length, 0);
  const smplData = new Uint8Array(smplTotalSize);
  let smplPos = 0;
  for (const sp of smplParts) {
    smplData.set(sp, smplPos);
    smplPos += sp.length;
  }
  chunks.push(iffChunk("SMPL", smplData));
  const totalSize = chunks.reduce((s, c) => s + c.length, 0);
  const output = new Uint8Array(totalSize);
  let pos = 0;
  for (const chunk of chunks) {
    output.set(chunk, pos);
    pos += chunk.length;
  }
  const baseName = (song.name ?? "untitled").replace(/[^a-zA-Z0-9_\- ]/g, "").trim() || "untitled";
  const filename = `${baseName}.dbm`;
  return {
    data: new Blob([output], { type: "application/octet-stream" }),
    filename,
    warnings
  };
}
export {
  exportDigiBoosterPro
};
