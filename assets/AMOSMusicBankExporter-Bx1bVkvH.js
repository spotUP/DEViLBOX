const AMIGA_PERIODS = [
  // Octave 1 (C-1 to B-1)
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
  // Octave 2 (C-2 to B-2)
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
  // Octave 3 (C-3 to B-3)
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
  const idx = xmNote - 12 - 1;
  if (idx < 0 || idx >= AMIGA_PERIODS.length) return 0;
  return AMIGA_PERIODS[idx];
}
function writeU16BE(view, offset, val) {
  view.setUint16(offset, val & 65535, false);
}
function writeU32BE(view, offset, val) {
  view.setUint32(offset, val >>> 0, false);
}
function writeString(view, offset, str, len) {
  for (let i = 0; i < len; i++) {
    view.setUint8(offset + i, i < str.length ? str.charCodeAt(i) & 255 : 0);
  }
}
function mapXMEffectToAMOS(effTyp, eff) {
  if (effTyp === 0 && eff === 0) return null;
  switch (effTyp) {
    case 0:
      return { cmd: 10, param: eff & 127, persistent: true };
    case 1:
      return { cmd: 1, param: eff & 127, persistent: false };
    case 2:
      return { cmd: 2, param: eff & 127, persistent: false };
    case 3:
      return { cmd: 11, param: eff & 127, persistent: true };
    case 4:
      return { cmd: 12, param: eff & 127, persistent: true };
    case 10:
      if (eff === 0) return { cmd: 13, param: 0, persistent: true };
      return { cmd: 13, param: eff & 127, persistent: true };
    case 11:
      return { cmd: 17, param: eff & 127, persistent: false };
    case 14:
      if (eff === 0) return { cmd: 6, param: 0, persistent: false };
      if (eff === 1) return { cmd: 7, param: 0, persistent: false };
      if ((eff & 240) === 80) return { cmd: 5, param: 0, persistent: false };
      if ((eff & 240) === 96) return { cmd: 5, param: eff & 15, persistent: false };
      return null;
    case 15:
      if (eff > 0 && eff <= 31) {
        const amosTempo = Math.max(1, Math.round(100 / eff));
        return { cmd: 8, param: amosTempo & 127, persistent: false };
      }
      return null;
    default:
      return null;
  }
}
function encodeABKChannelPattern(rows) {
  const words = [];
  let currentInst = 0;
  let activePersistent = null;
  let pendingDelay = 0;
  function flushDelay() {
    while (pendingDelay > 0) {
      const d = Math.min(pendingDelay, 127);
      words.push(32768 | 16 << 8 | d);
      pendingDelay -= d;
    }
  }
  for (let row = 0; row < 64; row++) {
    const cell = rows[row] ?? { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0 };
    const hasNote = cell.note > 0;
    const hasInst = cell.instrument > 0;
    const hasVolume = cell.volume >= 16 && cell.volume <= 80;
    const effInfo = mapXMEffectToAMOS(cell.effTyp ?? 0, cell.eff ?? 0);
    const hasContent = hasNote || hasInst || hasVolume || effInfo !== null;
    if (!hasContent) {
      pendingDelay++;
      continue;
    }
    flushDelay();
    if (hasInst && cell.instrument !== currentInst) {
      currentInst = cell.instrument;
      words.push(32768 | 9 << 8 | currentInst - 1 & 127);
    }
    if (hasVolume) {
      const vol = Math.min((cell.volume ?? 0) - 16, 64);
      words.push(32768 | 3 << 8 | vol & 127);
    }
    if (effInfo !== null) {
      if (effInfo.persistent) {
        if (!activePersistent || activePersistent.cmd !== effInfo.cmd || activePersistent.param !== effInfo.param) {
          words.push(32768 | effInfo.cmd << 8 | effInfo.param & 127);
          activePersistent = { cmd: effInfo.cmd, param: effInfo.param };
        }
      } else {
        if (effInfo.cmd !== 3 && effInfo.cmd !== 9 && effInfo.cmd !== 11 && effInfo.cmd !== 12 && effInfo.cmd !== 13) {
          activePersistent = null;
        }
        words.push(32768 | effInfo.cmd << 8 | effInfo.param & 127);
      }
    }
    if (hasNote) {
      const period = xmNoteToPeriod(cell.note);
      if (period > 0) {
        words.push(period & 4095);
      }
    }
    pendingDelay = 1;
  }
  flushDelay();
  words.push(32768);
  return words;
}
function extractPCM(inst) {
  var _a;
  if (!((_a = inst == null ? void 0 : inst.sample) == null ? void 0 : _a.audioBuffer)) return new Uint8Array(0);
  const wav = new DataView(inst.sample.audioBuffer);
  if (inst.sample.audioBuffer.byteLength < 44) return new Uint8Array(0);
  const dataLen = wav.getUint32(40, true);
  const frameCount = dataLen / 2;
  const pcm = new Uint8Array(frameCount);
  const dataOffset = 44;
  for (let j = 0; j < frameCount; j++) {
    if (dataOffset + j * 2 + 2 > inst.sample.audioBuffer.byteLength) break;
    const s16 = wav.getInt16(dataOffset + j * 2, true);
    pcm[j] = (s16 >> 8) + 256 & 255;
  }
  return pcm;
}
function exportAMOSMusicBank(song) {
  var _a, _b, _c, _d, _e, _f;
  const numPatterns = song.patterns.length;
  const numInstr = Math.min(song.instruments.length, 255);
  const samplePCMs = [];
  for (let i = 0; i < numInstr; i++) {
    samplePCMs.push(extractPCM(song.instruments[i]));
  }
  const encodedPatterns = [];
  for (const pattern of song.patterns) {
    const channels = [];
    for (let ch = 0; ch < 4; ch++) {
      const rows = ((_a = pattern.channels[ch]) == null ? void 0 : _a.rows) ?? [];
      channels.push(encodeABKChannelPattern(rows));
    }
    encodedPatterns.push(channels);
  }
  const instrHeaderSize = 2 + numInstr * 32;
  let totalSampleBytes = 0;
  for (const pcm of samplePCMs) {
    totalSampleBytes += pcm.length;
  }
  const instrSectionSize = instrHeaderSize + totalSampleBytes;
  const songOrder = song.songPositions;
  const playlistLen = songOrder.length + 1;
  const songDataSize = 8 + 2 + 2 + 16 + playlistLen * 2 * 4;
  const songsSectionSize = 2 + 4 + songDataSize;
  const pattHeaderSize = 2 + numPatterns * 8;
  let totalPatternWords = 0;
  for (const channels of encodedPatterns) {
    for (const words of channels) {
      totalPatternWords += words.length;
    }
  }
  const pattSectionSize = pattHeaderSize + totalPatternWords * 2;
  const mainHeaderSize = 12;
  const amosHeaderSize = 20;
  const totalSize = amosHeaderSize + mainHeaderSize + instrSectionSize + songsSectionSize + pattSectionSize;
  const buf = new ArrayBuffer(totalSize);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  writeString(view, 0, "AmBk", 4);
  writeU16BE(view, 4, 3);
  writeU16BE(view, 6, 0);
  writeU32BE(view, 8, totalSize - amosHeaderSize);
  writeString(view, 12, "Music   ", 8);
  const instrOffset = mainHeaderSize;
  const songsOffset = mainHeaderSize + instrSectionSize;
  const pattOffset = mainHeaderSize + instrSectionSize + songsSectionSize;
  writeU32BE(view, 20, instrOffset);
  writeU32BE(view, 24, songsOffset);
  writeU32BE(view, 28, pattOffset);
  const instrBase = amosHeaderSize + mainHeaderSize;
  writeU16BE(view, instrBase, numInstr);
  let sampleDataPos = instrBase + instrHeaderSize;
  for (let i = 0; i < numInstr; i++) {
    const hdrBase = instrBase + 2 + i * 32;
    const inst = song.instruments[i];
    const pcm = samplePCMs[i];
    const sampleLenWords = Math.floor(pcm.length / 2);
    const sampleOff = sampleDataPos - instrBase;
    writeU32BE(view, hdrBase + 0, sampleOff);
    const hasLoop = ((_b = inst == null ? void 0 : inst.sample) == null ? void 0 : _b.loop) && (inst.sample.loopEnd ?? 0) > (inst.sample.loopStart ?? 0);
    const loopStartBytes = hasLoop ? ((_c = inst.sample) == null ? void 0 : _c.loopStart) ?? 0 : 0;
    const loopLenWords = hasLoop ? Math.floor(((((_d = inst.sample) == null ? void 0 : _d.loopEnd) ?? 0) - loopStartBytes) / 2) : 2;
    const repeatOff = hasLoop ? sampleOff + loopStartBytes : sampleOff;
    writeU32BE(view, hdrBase + 4, repeatOff);
    writeU16BE(view, hdrBase + 8, sampleLenWords);
    writeU16BE(view, hdrBase + 10, hasLoop ? loopLenWords : 2);
    const vol = ((_f = (_e = inst == null ? void 0 : inst.metadata) == null ? void 0 : _e.modPlayback) == null ? void 0 : _f.defaultVolume) ?? 64;
    writeU16BE(view, hdrBase + 12, Math.min(vol, 64));
    writeU16BE(view, hdrBase + 14, sampleLenWords);
    writeString(view, hdrBase + 16, (inst == null ? void 0 : inst.name) ?? "", 16);
    bytes.set(pcm, sampleDataPos);
    sampleDataPos += pcm.length;
  }
  const songsBase = amosHeaderSize + songsOffset;
  writeU16BE(view, songsBase, 1);
  const songDataOffset = 6;
  writeU32BE(view, songsBase + 2, songDataOffset);
  const songDataBase = songsBase + songDataOffset;
  const playlistDataOffset = 28;
  for (let ch = 0; ch < 4; ch++) {
    writeU16BE(view, songDataBase + ch * 2, playlistDataOffset + ch * playlistLen * 2);
  }
  const speed = song.initialSpeed ?? 6;
  const amosTempo = Math.max(1, Math.min(100, Math.round(100 / speed)));
  writeU16BE(view, songDataBase + 8, amosTempo);
  writeU16BE(view, songDataBase + 10, 0);
  writeString(view, songDataBase + 12, song.name ?? "", 16);
  for (let ch = 0; ch < 4; ch++) {
    let plPos = songDataBase + playlistDataOffset + ch * playlistLen * 2;
    for (const pattIdx of songOrder) {
      writeU16BE(view, plPos, pattIdx);
      plPos += 2;
    }
    writeU16BE(view, plPos, 65534);
  }
  const pattBase = amosHeaderSize + pattOffset;
  writeU16BE(view, pattBase, numPatterns);
  let patternDataPos = pattBase + pattHeaderSize;
  for (let pIdx = 0; pIdx < numPatterns; pIdx++) {
    const chanOffsetBase = pattBase + 2 + pIdx * 8;
    for (let ch = 0; ch < 4; ch++) {
      const chanOff = patternDataPos - pattBase;
      writeU16BE(view, chanOffsetBase + ch * 2, chanOff);
      const words = encodedPatterns[pIdx][ch];
      for (const word of words) {
        writeU16BE(view, patternDataPos, word);
        patternDataPos += 2;
      }
    }
  }
  return buf;
}
export {
  exportAMOSMusicBank
};
