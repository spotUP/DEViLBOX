function writeStr(buf, off, str) {
  for (let i = 0; i < str.length; i++) {
    buf[off + i] = str.charCodeAt(i) & 255;
  }
}
function writeU8(view, off, val) {
  view.setUint8(off, val & 255);
}
function writeI8(view, off, val) {
  view.setInt8(off, val);
}
function writeU16(view, off, val) {
  view.setUint16(off, val & 65535, false);
}
function writeI16(view, off, val) {
  view.setInt16(off, val, false);
}
function writeU32(view, off, val) {
  view.setUint32(off, val >>> 0, false);
}
function writeI32(view, off, val) {
  view.setInt32(off, val, false);
}
function writeStrPadded(buf, off, str, len) {
  for (let i = 0; i < len; i++) {
    buf[off + i] = i < str.length ? str.charCodeAt(i) & 255 : 0;
  }
}
function extractPCM8FromWAV(audioBuffer) {
  const view = new DataView(audioBuffer);
  let dataOff = 12;
  while (dataOff + 8 < audioBuffer.byteLength) {
    const chunkId = String.fromCharCode(view.getUint8(dataOff)) + String.fromCharCode(view.getUint8(dataOff + 1)) + String.fromCharCode(view.getUint8(dataOff + 2)) + String.fromCharCode(view.getUint8(dataOff + 3));
    const chunkSize = view.getUint32(dataOff + 4, true);
    if (chunkId === "data") {
      const numSamples = Math.floor(chunkSize / 2);
      const pcm = new Int8Array(numSamples);
      for (let i = 0; i < numSamples; i++) {
        const s16 = view.getInt16(dataOff + 8 + i * 2, true);
        pcm[i] = s16 >> 8;
      }
      return pcm;
    }
    dataOff += 8 + chunkSize;
    if (chunkSize & 1) dataOff++;
  }
  return new Int8Array(0);
}
function xmNoteToSA(xmNote) {
  if (xmNote === 0) return 0;
  if (xmNote === 97) return 127;
  const sa = xmNote + 36;
  return sa >= 1 && sa <= 108 ? sa : 0;
}
function xmEffectToSA(cell) {
  if (cell.saEffect !== void 0 && cell.saEffect !== 0) {
    return { effect: cell.saEffect, effArg: cell.saEffectArg ?? 0 };
  }
  if (cell.saEffectArg !== void 0 && cell.saEffectArg !== 0) {
    return { effect: cell.saEffect ?? 0, effArg: cell.saEffectArg };
  }
  const effTyp = cell.effTyp;
  const effVal = cell.eff;
  switch (effTyp) {
    case 0:
      if (effVal !== 0) return { effect: 0, effArg: effVal };
      break;
    case 11:
      return { effect: 11, effArg: effVal };
    case 13:
      return { effect: 13, effArg: 0 };
    case 14:
      return { effect: 14, effArg: effVal & 1 };
    case 15:
      return { effect: 15, effArg: effVal };
    case 16:
      return { effect: 6, effArg: Math.min(effVal, 64) };
  }
  if (cell.volume >= 16 && cell.volume <= 80) {
    return { effect: 12, effArg: cell.volume - 16 };
  }
  return { effect: 0, effArg: 0 };
}
async function exportSonicArranger(song) {
  var _a, _b;
  const warnings = [];
  const numChannels = 4;
  if (song.numChannels > 4) {
    warnings.push(`Sonic Arranger supports 4 channels; channels 5-${song.numChannels} will be dropped.`);
  }
  const instruments = song.instruments;
  const numInstruments = instruments.length;
  const samplePCMs = [];
  const sampleInstrMap = /* @__PURE__ */ new Map();
  const allWaveforms = [];
  const allAdsrTables = [];
  const allAmfTables = [];
  for (let i = 0; i < numInstruments; i++) {
    const inst = instruments[i];
    const saConfig = inst.sonicArranger;
    if (saConfig && inst.synthType === "SonicArrangerSynth") {
      if (saConfig.allWaveforms && saConfig.allWaveforms.length > 0) {
        for (const wf of saConfig.allWaveforms) {
          const existsIdx = allWaveforms.findIndex(
            (existing) => existing.length === wf.length && existing.every((v, j) => v === wf[j])
          );
          if (existsIdx === -1) {
            allWaveforms.push(wf);
          }
        }
      }
      if (saConfig.waveformData && saConfig.waveformData.length > 0) {
        const existsIdx = allWaveforms.findIndex(
          (existing) => existing.length === saConfig.waveformData.length && existing.every((v, j) => v === saConfig.waveformData[j])
        );
        if (existsIdx === -1) {
          allWaveforms.push(saConfig.waveformData);
        }
      }
      if (saConfig.adsrTable && saConfig.adsrTable.length > 0) {
        const existsIdx = allAdsrTables.findIndex(
          (existing) => existing.length === saConfig.adsrTable.length && existing.every((v, j) => v === saConfig.adsrTable[j])
        );
        if (existsIdx === -1) {
          allAdsrTables.push(saConfig.adsrTable);
        }
      }
      if (saConfig.amfTable && saConfig.amfTable.length > 0) {
        const existsIdx = allAmfTables.findIndex(
          (existing) => existing.length === saConfig.amfTable.length && existing.every((v, j) => v === saConfig.amfTable[j])
        );
        if (existsIdx === -1) {
          allAmfTables.push(saConfig.amfTable);
        }
      }
    } else if ((_a = inst.sample) == null ? void 0 : _a.audioBuffer) {
      const pcm = extractPCM8FromWAV(inst.sample.audioBuffer);
      sampleInstrMap.set(i, samplePCMs.length);
      samplePCMs.push(pcm);
    } else {
      sampleInstrMap.set(i, samplePCMs.length);
      samplePCMs.push(new Int8Array(0));
    }
  }
  if (allWaveforms.length === 0) allWaveforms.push(new Array(128).fill(0));
  if (allAdsrTables.length === 0) allAdsrTables.push(new Array(128).fill(255));
  if (allAmfTables.length === 0) allAmfTables.push(new Array(128).fill(0));
  const trackRows = [];
  const positionEntries = [];
  for (let patIdx = 0; patIdx < song.patterns.length; patIdx++) {
    const pat = song.patterns[patIdx];
    const patLen = pat.length;
    const channels = [];
    for (let ch = 0; ch < numChannels; ch++) {
      const startRow = trackRows.length / 4;
      const chanData = ch < pat.channels.length ? pat.channels[ch] : null;
      for (let row = 0; row < patLen; row++) {
        const cell = chanData == null ? void 0 : chanData.rows[row];
        if (!cell || cell.note === 0 && cell.instrument === 0 && cell.effTyp === 0 && cell.eff === 0 && cell.volume === 0) {
          trackRows.push(0, 0, 0, 0);
          continue;
        }
        const saNote = xmNoteToSA(cell.note);
        const instrByte = (cell.instrument ?? 0) & 255;
        const cellAny = cell;
        const arpTable = (typeof cellAny.saArpTable === "number" ? cellAny.saArpTable : 0) & 3;
        const { effect, effArg } = xmEffectToSA({
          effTyp: cell.effTyp,
          eff: cell.eff,
          volume: cell.volume,
          saEffect: typeof cellAny.saEffect === "number" ? cellAny.saEffect : void 0,
          saEffectArg: typeof cellAny.saEffectArg === "number" ? cellAny.saEffectArg : void 0
        });
        const byte2 = (arpTable & 3) << 4 | effect & 15;
        const byte3 = effArg & 255;
        trackRows.push(saNote, instrByte, byte2, byte3);
      }
      channels.push({
        startTrackRow: startRow,
        soundTranspose: 0,
        noteTranspose: 0
      });
    }
    positionEntries.push(channels);
  }
  const numTrackRows = trackRows.length / 4;
  const songPositions = song.songPositions.length > 0 ? song.songPositions : [0];
  const firstPos = 0;
  const lastPos = songPositions.length - 1;
  const ovtbEntries = [];
  for (const posIdx of songPositions) {
    if (posIdx < positionEntries.length) {
      ovtbEntries.push(positionEntries[posIdx]);
    } else {
      ovtbEntries.push(
        Array.from({ length: numChannels }, () => ({ startTrackRow: 0, soundTranspose: 0, noteTranspose: 0 }))
      );
    }
  }
  const numPositions = ovtbEntries.length;
  const bpm = song.initialBPM || 125;
  const saTempo = Math.max(1, Math.min(255, Math.round(bpm * 50 / 125)));
  const saSpeed = Math.max(1, Math.min(255, song.initialSpeed || 6));
  const rowsPerTrack = song.patterns.length > 0 ? song.patterns[0].length : 64;
  const MAGIC_SIZE = 8;
  const numSubSongs = 1;
  const stblSize = 4 + 4 + numSubSongs * 12;
  const ovtbSize = 4 + 4 + numPositions * 16;
  const ntblSize = 4 + 4 + numTrackRows * 4;
  const instSize = 4 + 4 + numInstruments * 152;
  const numSamples = samplePCMs.length;
  const totalPCMBytes = samplePCMs.reduce((sum, pcm) => sum + pcm.length, 0);
  const sd8bSize = 4 + 4 + numSamples * 38 + numSamples * 4 + totalPCMBytes;
  const numWaveforms = allWaveforms.length;
  const sywtSize = 4 + 4 + numWaveforms * 128;
  const numAdsrTablesOut = allAdsrTables.length;
  const syarSize = 4 + 4 + numAdsrTablesOut * 128;
  const numAmfTablesOut = allAmfTables.length;
  const syafSize = 4 + 4 + numAmfTablesOut * 128;
  const totalSize = MAGIC_SIZE + stblSize + ovtbSize + ntblSize + instSize + sd8bSize + sywtSize + syarSize + syafSize;
  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);
  let pos = 0;
  writeStr(output, pos, "SOARV1.0");
  pos += 8;
  writeStr(output, pos, "STBL");
  pos += 4;
  writeU32(view, pos, numSubSongs);
  pos += 4;
  writeU16(view, pos, saSpeed);
  pos += 2;
  writeU16(view, pos, rowsPerTrack);
  pos += 2;
  writeU16(view, pos, firstPos);
  pos += 2;
  writeU16(view, pos, lastPos);
  pos += 2;
  writeU16(view, pos, song.restartPosition ?? 0);
  pos += 2;
  writeU16(view, pos, saTempo);
  pos += 2;
  writeStr(output, pos, "OVTB");
  pos += 4;
  writeU32(view, pos, numPositions);
  pos += 4;
  for (let p = 0; p < numPositions; p++) {
    const entry = ovtbEntries[p];
    for (let ch = 0; ch < numChannels; ch++) {
      const pe = entry[ch];
      writeU16(view, pos, pe.startTrackRow);
      pos += 2;
      writeI8(view, pos, pe.soundTranspose);
      pos += 1;
      writeI8(view, pos, pe.noteTranspose);
      pos += 1;
    }
  }
  writeStr(output, pos, "NTBL");
  pos += 4;
  writeU32(view, pos, numTrackRows);
  pos += 4;
  for (let i = 0; i < trackRows.length; i++) {
    writeU8(view, pos, trackRows[i]);
    pos += 1;
  }
  writeStr(output, pos, "INST");
  pos += 4;
  writeU32(view, pos, numInstruments);
  pos += 4;
  for (let i = 0; i < numInstruments; i++) {
    const inst = instruments[i];
    const saConfig = inst.sonicArranger;
    const base = pos;
    if (saConfig && inst.synthType === "SonicArrangerSynth") {
      writeU16(view, base, 1);
      writeU16(view, base + 2, saConfig.waveformNumber);
      writeU16(view, base + 4, saConfig.waveformLength);
      writeU16(view, base + 6, 0);
      writeU16(view, base + 16, saConfig.volume & 255);
      writeI16(view, base + 18, saConfig.fineTuning);
      writeU16(view, base + 20, saConfig.portamentoSpeed);
      writeU16(view, base + 22, saConfig.vibratoDelay);
      writeU16(view, base + 24, saConfig.vibratoSpeed);
      writeU16(view, base + 26, saConfig.vibratoLevel);
      writeU16(view, base + 28, saConfig.amfNumber);
      writeU16(view, base + 30, saConfig.amfDelay);
      writeU16(view, base + 32, saConfig.amfLength);
      writeU16(view, base + 34, saConfig.amfRepeat);
      writeU16(view, base + 36, saConfig.adsrNumber);
      writeU16(view, base + 38, saConfig.adsrDelay);
      writeU16(view, base + 40, saConfig.adsrLength);
      writeU16(view, base + 42, saConfig.adsrRepeat);
      writeU16(view, base + 44, saConfig.sustainPoint);
      writeU16(view, base + 46, saConfig.sustainDelay);
      writeU16(view, base + 64, saConfig.effectArg1);
      writeU16(view, base + 66, saConfig.effect);
      writeU16(view, base + 68, saConfig.effectArg2);
      writeU16(view, base + 70, saConfig.effectArg3);
      writeU16(view, base + 72, saConfig.effectDelay);
      for (let a = 0; a < 3; a++) {
        const arpBase = base + 74 + a * 16;
        const arp = saConfig.arpeggios[a];
        if (arp) {
          writeU8(view, arpBase, arp.length);
          writeU8(view, arpBase + 1, arp.repeat);
          for (let j = 0; j < 14; j++) {
            writeI8(view, arpBase + 2 + j, j < arp.values.length ? arp.values[j] : 0);
          }
        }
      }
      writeStrPadded(output, base + 122, saConfig.name || inst.name || "", 30);
    } else {
      const sampleIdx = sampleInstrMap.get(i) ?? 0;
      const pcm = samplePCMs[sampleIdx] ?? new Int8Array(0);
      writeU16(view, base, 0);
      writeU16(view, base + 2, sampleIdx);
      const sampleConfig = inst.sample;
      let waveformLenWords = 0;
      let repeatLenWords = 1;
      if (pcm.length > 0) {
        if (sampleConfig && sampleConfig.loop && sampleConfig.loopEnd > sampleConfig.loopStart) {
          waveformLenWords = Math.floor(sampleConfig.loopStart / 2);
          repeatLenWords = Math.max(1, Math.floor((sampleConfig.loopEnd - sampleConfig.loopStart) / 2));
          if (waveformLenWords === 0 && repeatLenWords * 2 >= pcm.length) {
            repeatLenWords = 0;
          }
        } else {
          waveformLenWords = Math.floor(pcm.length / 2);
          repeatLenWords = 1;
        }
      }
      writeU16(view, base + 4, waveformLenWords);
      writeU16(view, base + 6, repeatLenWords);
      const volLinear = inst.volume >= 0 ? 64 : Math.round(64 * Math.pow(10, inst.volume / 20));
      writeU16(view, base + 16, Math.min(64, Math.max(0, volLinear)));
      writeI16(view, base + 18, 0);
      writeStrPadded(output, base + 122, inst.name || "", 30);
    }
    pos += 152;
  }
  writeStr(output, pos, "SD8B");
  pos += 4;
  writeI32(view, pos, numSamples);
  pos += 4;
  for (let i = 0; i < numSamples; i++) {
    pos += 38;
  }
  for (let i = 0; i < numSamples; i++) {
    writeU32(view, pos, samplePCMs[i].length);
    pos += 4;
  }
  for (let i = 0; i < numSamples; i++) {
    const pcm = samplePCMs[i];
    for (let j = 0; j < pcm.length; j++) {
      writeI8(view, pos, pcm[j]);
      pos += 1;
    }
  }
  writeStr(output, pos, "SYWT");
  pos += 4;
  writeU32(view, pos, numWaveforms);
  pos += 4;
  for (let i = 0; i < numWaveforms; i++) {
    const wf = allWaveforms[i];
    for (let j = 0; j < 128; j++) {
      writeI8(view, pos, j < wf.length ? wf[j] : 0);
      pos += 1;
    }
  }
  writeStr(output, pos, "SYAR");
  pos += 4;
  writeU32(view, pos, numAdsrTablesOut);
  pos += 4;
  for (let i = 0; i < numAdsrTablesOut; i++) {
    const table = allAdsrTables[i];
    for (let j = 0; j < 128; j++) {
      writeU8(view, pos, j < table.length ? table[j] : 255);
      pos += 1;
    }
  }
  writeStr(output, pos, "SYAF");
  pos += 4;
  writeU32(view, pos, numAmfTablesOut);
  pos += 4;
  for (let i = 0; i < numAmfTablesOut; i++) {
    const table = allAmfTables[i];
    for (let j = 0; j < 128; j++) {
      writeI8(view, pos, j < table.length ? table[j] : 0);
      pos += 1;
    }
  }
  const baseName = ((_b = song.name) == null ? void 0 : _b.replace(/[^a-zA-Z0-9_\- ]/g, "")) || "untitled";
  const filename = `${baseName}.sa`;
  return {
    data: new Blob([output], { type: "application/octet-stream" }),
    filename,
    warnings
  };
}
export {
  exportSonicArranger
};
