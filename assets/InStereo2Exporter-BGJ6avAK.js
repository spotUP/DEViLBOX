function writeU8(buf, off, val) {
  buf[off] = val & 255;
}
function writeU16BE(buf, off, val) {
  buf[off] = val >> 8 & 255;
  buf[off + 1] = val & 255;
}
function writeU32BE(buf, off, val) {
  buf[off] = val >> 24 & 255;
  buf[off + 1] = val >> 16 & 255;
  buf[off + 2] = val >> 8 & 255;
  buf[off + 3] = val & 255;
}
function writeS8(buf, off, val) {
  buf[off] = val & 255;
}
function writeString(buf, off, str, maxLen) {
  for (let i = 0; i < maxLen; i++) {
    buf[off + i] = i < str.length ? str.charCodeAt(i) & 255 : 0;
  }
}
function writeTag(buf, off, tag) {
  for (let i = 0; i < 4; i++) {
    buf[off + i] = tag.charCodeAt(i);
  }
}
function xmNoteToIs20(xmNote) {
  if (xmNote === 0) return 0;
  if (xmNote === 97) return 127;
  const idx = xmNote + 36;
  return Math.max(1, Math.min(108, idx));
}
function xmEffectToIs20(effTyp, eff) {
  switch (effTyp) {
    case 0:
      if (eff !== 0) return { effect: 0, arg: eff };
      return { effect: 0, arg: 0 };
    case 3:
      return { effect: 7, arg: eff };
    case 10:
      if ((eff & 240) !== 0) {
        return { effect: 10, arg: eff >> 4 & 15 };
      } else {
        return { effect: 10, arg: 256 - (eff & 15) & 255 };
      }
    case 11:
      return { effect: 11, arg: eff };
    case 12:
      return { effect: 12, arg: Math.min(64, eff) };
    case 13:
      return { effect: 13, arg: 0 };
    case 15:
      if (eff > 0 && eff <= 31) return { effect: 15, arg: eff };
      return { effect: 0, arg: 0 };
    default:
      return { effect: 0, arg: 0 };
  }
}
function extractSamplePCM(inst) {
  var _a;
  if (!((_a = inst.sample) == null ? void 0 : _a.audioBuffer)) return new Uint8Array(0);
  const wav = new DataView(inst.sample.audioBuffer);
  if (wav.byteLength < 44) return new Uint8Array(0);
  const dataLen = wav.getUint32(40, true);
  const frames = Math.floor(dataLen / 2);
  const pcm = new Uint8Array(frames);
  for (let j = 0; j < frames; j++) {
    const s16 = wav.getInt16(44 + j * 2, true);
    pcm[j] = s16 >> 8 & 255;
  }
  return pcm;
}
async function exportInStereo2(song) {
  var _a, _b;
  const warnings = [];
  const sampleInsts = [];
  const synthInsts = [];
  for (const inst of song.instruments) {
    if (inst.synthType === "InStereo2Synth" || inst.inStereo2) {
      synthInsts.push(inst);
    } else {
      sampleInsts.push(inst);
    }
  }
  const numSamples = sampleInsts.length;
  const numSynths = synthInsts.length;
  const idToIs20Num = /* @__PURE__ */ new Map();
  for (let i = 0; i < sampleInsts.length; i++) {
    idToIs20Num.set(sampleInsts[i].id, 64 + i);
  }
  for (let i = 0; i < synthInsts.length; i++) {
    idToIs20Num.set(synthInsts[i].id, 1 + i);
  }
  const rowsPerTrack = song.patterns.length > 0 ? song.patterns[0].length : 64;
  const numPositions = song.songPositions.length;
  const allTrackRows = [];
  const positionEntries = [];
  for (let posIdx = 0; posIdx < numPositions; posIdx++) {
    const patIdx = song.songPositions[posIdx] ?? 0;
    const pat = song.patterns[patIdx];
    const posChannels = [];
    for (let ch = 0; ch < 4; ch++) {
      const startRow = allTrackRows.length;
      if (pat && ch < pat.channels.length) {
        const rows = pat.channels[ch].rows;
        const patLen = pat.length;
        for (let row = 0; row < rowsPerTrack; row++) {
          const cell = row < patLen ? rows[row] : void 0;
          const trackRow = new Uint8Array(4);
          if (!cell || cell.note === 0 && cell.instrument === 0 && cell.effTyp === 0 && cell.eff === 0) {
            allTrackRows.push(trackRow);
            continue;
          }
          trackRow[0] = xmNoteToIs20(cell.note ?? 0);
          const instId = cell.instrument ?? 0;
          trackRow[1] = instId > 0 ? idToIs20Num.get(instId) ?? 0 : 0;
          const { effect, arg } = xmEffectToIs20(cell.effTyp ?? 0, cell.eff ?? 0);
          trackRow[2] = effect & 15;
          trackRow[3] = arg & 255;
          allTrackRows.push(trackRow);
        }
      } else {
        for (let row = 0; row < rowsPerTrack; row++) {
          allTrackRows.push(new Uint8Array(4));
        }
      }
      posChannels.push({ startTrackRow: startRow, soundTranspose: 0, noteTranspose: 0 });
    }
    positionEntries.push(posChannels);
  }
  const samplePCMs = [];
  const sampleDescs = [];
  for (let i = 0; i < numSamples; i++) {
    const inst = sampleInsts[i];
    const pcm = extractSamplePCM(inst);
    samplePCMs.push(pcm);
    const loopStart = ((_a = inst.sample) == null ? void 0 : _a.loopStart) ?? 0;
    const loopEnd = ((_b = inst.sample) == null ? void 0 : _b.loopEnd) ?? 0;
    const hasLoop = loopEnd > loopStart && loopEnd > 0;
    let oneShotLength;
    let repeatLength;
    if (hasLoop) {
      oneShotLength = Math.floor(loopStart / 2);
      repeatLength = Math.floor((loopEnd - loopStart) / 2);
    } else {
      oneShotLength = Math.floor(pcm.length / 2);
      repeatLength = 1;
    }
    sampleDescs.push({
      oneShotLength,
      repeatLength,
      sampleNumber: i,
      // self-referencing
      volume: Math.min(64, inst.volume ?? 64)
    });
  }
  const synthConfigs = [];
  for (let i = 0; i < numSynths; i++) {
    const inst = synthInsts[i];
    if (inst.inStereo2) {
      synthConfigs.push(inst.inStereo2);
    } else {
      warnings.push(`Synth instrument ${inst.id} (${inst.name}) missing InStereo2 config, using defaults`);
      synthConfigs.push(makeDefaultSynthConfig(inst.name || `Synth ${i}`));
    }
  }
  const magicSize = 8;
  const stblSize = 4 + 4 + 10;
  const ovtbSize = 4 + 4 + numPositions * 4 * 4;
  const ntblSize = 4 + 4 + allTrackRows.length * 4;
  const totalPCMBytes = samplePCMs.reduce((sum, pcm) => sum + pcm.length, 0);
  const sampSize = 4 + 4 + numSamples * 16 + numSamples * 20 + numSamples * 4 * 2 + numSamples * 4 + totalPCMBytes;
  const syntSize = 4 + 4 + numSynths * 1010;
  const totalSize = magicSize + stblSize + ovtbSize + ntblSize + sampSize + syntSize;
  const output = new Uint8Array(totalSize);
  let off = 0;
  writeString(output, off, "IS20DF10", 8);
  off += 8;
  writeTag(output, off, "STBL");
  off += 4;
  writeU32BE(output, off, 1);
  off += 4;
  writeU8(output, off, song.initialSpeed);
  off += 1;
  writeU8(output, off, rowsPerTrack);
  off += 1;
  writeU16BE(output, off, 0);
  off += 2;
  writeU16BE(output, off, Math.max(0, numPositions - 1));
  off += 2;
  writeU16BE(output, off, song.restartPosition);
  off += 2;
  const tempoHz = Math.round(song.initialBPM * 50 / 125);
  writeU16BE(output, off, tempoHz > 0 ? tempoHz : 50);
  off += 2;
  writeTag(output, off, "OVTB");
  off += 4;
  writeU32BE(output, off, numPositions);
  off += 4;
  for (let posIdx = 0; posIdx < numPositions; posIdx++) {
    const posChannels = positionEntries[posIdx];
    for (let ch = 0; ch < 4; ch++) {
      const entry = posChannels[ch];
      writeU16BE(output, off, entry.startTrackRow);
      off += 2;
      writeS8(output, off, entry.soundTranspose);
      off += 1;
      writeS8(output, off, entry.noteTranspose);
      off += 1;
    }
  }
  writeTag(output, off, "NTBL");
  off += 4;
  writeU32BE(output, off, allTrackRows.length);
  off += 4;
  for (const row of allTrackRows) {
    output[off] = row[0];
    off += 1;
    output[off] = row[1];
    off += 1;
    output[off] = row[2];
    off += 1;
    output[off] = row[3];
    off += 1;
  }
  writeTag(output, off, "SAMP");
  off += 4;
  writeU32BE(output, off, numSamples);
  off += 4;
  for (let i = 0; i < numSamples; i++) {
    const desc = sampleDescs[i];
    writeU16BE(output, off, desc.oneShotLength);
    off += 2;
    writeU16BE(output, off, desc.repeatLength);
    off += 2;
    writeS8(output, off, desc.sampleNumber);
    off += 1;
    writeU8(output, off, desc.volume);
    off += 1;
    writeU8(output, off, 0);
    off += 1;
    writeU8(output, off, 0);
    off += 1;
    writeU8(output, off, 0);
    off += 1;
    writeU8(output, off, 0);
    off += 1;
    off += 6;
  }
  for (let i = 0; i < numSamples; i++) {
    writeString(output, off, sampleInsts[i].name || "", 20);
    off += 20;
  }
  for (let i = 0; i < numSamples; i++) {
    const desc = sampleDescs[i];
    writeU16BE(output, off, desc.oneShotLength);
    off += 2;
    writeU16BE(output, off, desc.repeatLength);
    off += 2;
    writeU16BE(output, off, desc.oneShotLength);
    off += 2;
    writeU16BE(output, off, desc.repeatLength);
    off += 2;
  }
  for (let i = 0; i < numSamples; i++) {
    writeU32BE(output, off, samplePCMs[i].length);
    off += 4;
  }
  for (let i = numSamples - 1; i >= 0; i--) {
    const pcm = samplePCMs[i];
    output.set(pcm, off);
    off += pcm.length;
  }
  writeTag(output, off, "SYNT");
  off += 4;
  writeU32BE(output, off, numSynths);
  off += 4;
  for (let i = 0; i < numSynths; i++) {
    const cfg = synthConfigs[i];
    writeTag(output, off, "IS20");
    off += 4;
    writeString(output, off, cfg.name || "", 20);
    off += 20;
    writeU16BE(output, off, cfg.waveformLength);
    off += 2;
    writeU8(output, off, cfg.volume);
    off += 1;
    writeU8(output, off, cfg.vibratoDelay);
    off += 1;
    writeU8(output, off, cfg.vibratoSpeed);
    off += 1;
    writeU8(output, off, cfg.vibratoLevel);
    off += 1;
    writeU8(output, off, cfg.portamentoSpeed);
    off += 1;
    writeU8(output, off, cfg.adsrLength);
    off += 1;
    writeU8(output, off, cfg.adsrRepeat);
    off += 1;
    off += 4;
    writeU8(output, off, cfg.sustainPoint);
    off += 1;
    writeU8(output, off, cfg.sustainSpeed);
    off += 1;
    writeU8(output, off, cfg.amfLength);
    off += 1;
    writeU8(output, off, cfg.amfRepeat);
    off += 1;
    let fileEgMode = 0;
    let fileEgEnabled = 0;
    if (cfg.egMode === 1) {
      fileEgMode = 0;
      fileEgEnabled = 1;
    } else if (cfg.egMode === 2) {
      fileEgMode = 1;
      fileEgEnabled = 1;
    }
    writeU8(output, off, fileEgMode);
    off += 1;
    writeU8(output, off, fileEgEnabled);
    off += 1;
    writeU8(output, off, cfg.egStartLen);
    off += 1;
    writeU8(output, off, cfg.egStopRep);
    off += 1;
    writeU8(output, off, cfg.egSpeedUp);
    off += 1;
    writeU8(output, off, cfg.egSpeedDown);
    off += 1;
    off += 19;
    for (let j = 0; j < 128; j++) {
      writeU8(output, off, cfg.adsrTable[j] ?? 0);
      off += 1;
    }
    for (let j = 0; j < 128; j++) {
      writeS8(output, off, cfg.lfoTable[j] ?? 0);
      off += 1;
    }
    for (let a = 0; a < 3; a++) {
      const arp = cfg.arpeggios[a];
      writeU8(output, off, (arp == null ? void 0 : arp.length) ?? 0);
      off += 1;
      writeU8(output, off, (arp == null ? void 0 : arp.repeat) ?? 0);
      off += 1;
      for (let v = 0; v < 14; v++) {
        writeS8(output, off, (arp == null ? void 0 : arp.values[v]) ?? 0);
        off += 1;
      }
    }
    for (let j = 0; j < 128; j++) {
      writeU8(output, off, cfg.egTable[j] ?? 0);
      off += 1;
    }
    for (let j = 0; j < 256; j++) {
      writeS8(output, off, cfg.waveform1[j] ?? 0);
      off += 1;
    }
    for (let j = 0; j < 256; j++) {
      writeS8(output, off, cfg.waveform2[j] ?? 0);
      off += 1;
    }
  }
  if (numSamples > 63) {
    warnings.push(`IS20 supports max 63 samples, song has ${numSamples}. Extras will be truncated.`);
  }
  if (numSynths > 63) {
    warnings.push(`IS20 supports max 63 synth instruments, song has ${numSynths}. Extras will be truncated.`);
  }
  if (numPositions > 65535) {
    warnings.push(`IS20 position count exceeds uint16 limit. Song may not load correctly.`);
  }
  const baseName = (song.name || "untitled").replace(/[^a-zA-Z0-9_.-]/g, "_");
  const filename = baseName.endsWith(".is20") ? baseName : `${baseName}.is20`;
  const data = new Blob([output], { type: "application/octet-stream" });
  return { data, filename, warnings };
}
function makeDefaultSynthConfig(name) {
  return {
    volume: 64,
    waveformLength: 64,
    portamentoSpeed: 0,
    vibratoDelay: 0,
    vibratoSpeed: 0,
    vibratoLevel: 0,
    adsrLength: 0,
    adsrRepeat: 0,
    sustainPoint: 0,
    sustainSpeed: 0,
    amfLength: 0,
    amfRepeat: 0,
    egMode: 0,
    egStartLen: 0,
    egStopRep: 0,
    egSpeedUp: 0,
    egSpeedDown: 0,
    arpeggios: [
      { length: 0, repeat: 0, values: new Array(14).fill(0) },
      { length: 0, repeat: 0, values: new Array(14).fill(0) },
      { length: 0, repeat: 0, values: new Array(14).fill(0) }
    ],
    adsrTable: new Array(128).fill(0),
    lfoTable: new Array(128).fill(0),
    egTable: new Array(128).fill(0),
    waveform1: new Array(256).fill(0),
    waveform2: new Array(256).fill(0),
    name
  };
}
export {
  exportInStereo2
};
