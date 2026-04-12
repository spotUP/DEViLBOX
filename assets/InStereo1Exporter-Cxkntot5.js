function writeU8(buf, off, val) {
  buf[off] = val & 255;
}
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
function writeS8(buf, off, val) {
  buf[off] = val & 255;
}
function writeString(buf, off, str, maxLen) {
  for (let i = 0; i < maxLen; i++) {
    buf[off + i] = i < str.length ? str.charCodeAt(i) & 255 : 0;
  }
}
function xmNoteToIS10(xmNote) {
  if (xmNote === 0) return 0;
  if (xmNote === 97) return 127;
  const noteIdx = xmNote + 36;
  return noteIdx >= 1 && noteIdx <= 108 ? noteIdx : 0;
}
function xmEffectToIS10(effTyp, eff) {
  switch (effTyp) {
    case 12:
      return { effect: 7, effectArg: Math.min(63, eff) & 63 };
    case 15:
      if (eff > 0 && eff <= 31) return { effect: 15, effectArg: eff };
      return { effect: 0, effectArg: 0 };
    default:
      return { effect: 0, effectArg: 0 };
  }
}
function extractPCMFromWAV(audioBuffer) {
  const view = new DataView(audioBuffer);
  let dataOffset = 12;
  while (dataOffset + 8 <= audioBuffer.byteLength) {
    const chunkId = String.fromCharCode(
      view.getUint8(dataOffset),
      view.getUint8(dataOffset + 1),
      view.getUint8(dataOffset + 2),
      view.getUint8(dataOffset + 3)
    );
    const chunkSize = view.getUint32(dataOffset + 4, true);
    if (chunkId === "data") {
      const frames = Math.floor(chunkSize / 2);
      const pcm = new Uint8Array(frames);
      for (let i = 0; i < frames; i++) {
        const s16 = view.getInt16(dataOffset + 8 + i * 2, true);
        pcm[i] = s16 >> 8 & 255;
      }
      return pcm;
    }
    dataOffset += 8 + chunkSize;
    if (chunkSize & 1) dataOffset++;
  }
  return new Uint8Array(0);
}
async function exportInStereo1(song) {
  var _a, _b;
  const warnings = [];
  const NUM_CHANNELS = 4;
  const waveformsList = [];
  const egcTablesList = [];
  const adsrTablesList = [];
  const waveformMap = /* @__PURE__ */ new Map();
  const egcMap = /* @__PURE__ */ new Map();
  const adsrMap = /* @__PURE__ */ new Map();
  function getOrAddWaveform(wave) {
    const key = wave.slice(0, 256).join(",");
    if (waveformMap.has(key)) return waveformMap.get(key);
    const idx = waveformsList.length;
    const padded = new Array(256).fill(0);
    for (let i = 0; i < Math.min(256, wave.length); i++) padded[i] = wave[i];
    waveformsList.push(padded);
    waveformMap.set(key, idx);
    return idx;
  }
  function getOrAddEGC(tbl) {
    const key = tbl.slice(0, 128).join(",");
    if (egcMap.has(key)) return egcMap.get(key);
    const idx = egcTablesList.length;
    const padded = new Array(128).fill(0);
    for (let i = 0; i < Math.min(128, tbl.length); i++) padded[i] = tbl[i];
    egcTablesList.push(padded);
    egcMap.set(key, idx);
    return idx;
  }
  function getOrAddADSR(tbl) {
    const key = tbl.slice(0, 256).join(",");
    if (adsrMap.has(key)) return adsrMap.get(key);
    const idx = adsrTablesList.length;
    const padded = new Array(256).fill(0);
    for (let i = 0; i < Math.min(256, tbl.length); i++) padded[i] = tbl[i];
    adsrTablesList.push(padded);
    adsrMap.set(key, idx);
    return idx;
  }
  const samples = [];
  const sampleMap = /* @__PURE__ */ new Map();
  const instrEntries = [];
  for (const inst of song.instruments) {
    const is10 = inst.inStereo1;
    if (is10 && inst.synthType === "InStereo1Synth") {
      const waveIdx = is10.waveform1 ? getOrAddWaveform(is10.waveform1) : 0;
      const egcIdx = is10.egTable ? getOrAddEGC(is10.egTable) : 0;
      const adsrIdx = is10.adsrTable ? getOrAddADSR(is10.adsrTable) : 0;
      instrEntries.push({
        waveformNumber: waveIdx,
        synthesisEnabled: true,
        waveformLength: is10.waveformLength ?? 256,
        repeatLength: 0,
        volume: is10.volume ?? 64,
        portamentoSpeed: is10.portamentoSpeed > 0 ? is10.portamentoSpeed : 0,
        adsrEnabled: (is10.adsrLength ?? 0) > 0,
        adsrTableNumber: adsrIdx,
        adsrTableLength: is10.adsrLength ?? 0,
        portamentoEnabled: (is10.portamentoSpeed ?? 0) > 0,
        vibratoDelay: is10.vibratoDelay ?? 0,
        vibratoSpeed: is10.vibratoSpeed ?? 0,
        vibratoLevel: is10.vibratoLevel ?? 0,
        egcOffset: is10.egStartLen ?? 0,
        egcMode: is10.egMode ?? 0,
        egcTableNumber: egcIdx,
        egcTableLength: is10.egTable ? is10.egTable.length : 0
      });
    } else if ((_a = inst.sample) == null ? void 0 : _a.audioBuffer) {
      const pcmData = extractPCMFromWAV(inst.sample.audioBuffer);
      if (pcmData.length > 0) {
        const sampleIdx = samples.length;
        sampleMap.set(inst.id, sampleIdx);
        samples.push({
          name: inst.name || `Sample ${inst.id}`,
          pcmData
        });
        const loopStart = inst.sample.loopStart ?? 0;
        const loopEnd = inst.sample.loopEnd ?? 0;
        const hasLoop = inst.sample.loop && loopEnd > loopStart;
        let repeatLength = 2;
        let waveformLength = 0;
        if (hasLoop) {
          if (loopStart === 0 && loopEnd >= pcmData.length) {
            repeatLength = 0;
          } else {
            waveformLength = loopStart;
            repeatLength = loopEnd - loopStart;
          }
        }
        const vol = inst.volume != null ? Math.round(Math.pow(10, inst.volume / 20) * 64) : 64;
        instrEntries.push({
          waveformNumber: sampleIdx,
          synthesisEnabled: false,
          waveformLength,
          repeatLength,
          volume: Math.max(0, Math.min(64, vol)),
          portamentoSpeed: 0,
          adsrEnabled: false,
          adsrTableNumber: 0,
          adsrTableLength: 0,
          portamentoEnabled: false,
          vibratoDelay: 0,
          vibratoSpeed: 0,
          vibratoLevel: 0,
          egcOffset: 0,
          egcMode: 0,
          egcTableNumber: 0,
          egcTableLength: 0
        });
      } else {
        instrEntries.push(emptyInstrEntry());
        warnings.push(`Instrument ${inst.id} "${inst.name}" has no audio data`);
      }
    } else {
      instrEntries.push(emptyInstrEntry());
    }
  }
  if (instrEntries.length === 0) {
    instrEntries.push(emptyInstrEntry());
    warnings.push("No instruments found; added empty placeholder");
  }
  const trackRowPool = [];
  const positionEntries = [];
  const songLen = song.songPositions.length;
  const rowsPerTrack = songLen > 0 && song.patterns.length > 0 ? ((_b = song.patterns[0]) == null ? void 0 : _b.length) ?? 64 : 64;
  for (let posIdx = 0; posIdx < songLen; posIdx++) {
    const patIdx = song.songPositions[posIdx] ?? 0;
    const pat = song.patterns[patIdx];
    const posRow = [];
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const startTrackRow = trackRowPool.length;
      const channel = pat == null ? void 0 : pat.channels[ch];
      for (let row = 0; row < rowsPerTrack; row++) {
        const cell = channel == null ? void 0 : channel.rows[row];
        if (!cell || cell.note === 0 && cell.instrument === 0 && cell.effTyp === 0) {
          trackRowPool.push({ note: 0, instrument: 0, arpeggio: 0, effect: 0, effectArg: 0 });
          continue;
        }
        const note = xmNoteToIS10(cell.note ?? 0);
        const instrument = cell.instrument ?? 0;
        const { effect, effectArg } = xmEffectToIS10(cell.effTyp ?? 0, cell.eff ?? 0);
        trackRowPool.push({ note, instrument, arpeggio: 0, effect, effectArg });
      }
      posRow.push({ startTrackRow, soundTranspose: 0, noteTranspose: 0 });
    }
    positionEntries.push(posRow);
  }
  if (positionEntries.length === 0) {
    const posRow = [];
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const startTrackRow = trackRowPool.length;
      for (let row = 0; row < rowsPerTrack; row++) {
        trackRowPool.push({ note: 0, instrument: 0, arpeggio: 0, effect: 0, effectArg: 0 });
      }
      posRow.push({ startTrackRow, soundTranspose: 0, noteTranspose: 0 });
    }
    positionEntries.push(posRow);
  }
  const totalNumberOfTrackRows = trackRowPool.length;
  const totalNumberOfPositions = positionEntries.length;
  const arpTables = [];
  for (let i = 0; i < 16; i++) {
    arpTables.push(new Array(16).fill(0));
  }
  const numberOfSubSongs = 1;
  const startSpeed = song.initialSpeed ?? 6;
  const numberOfSamples = samples.length;
  const numberOfWaveforms = waveformsList.length;
  const numberOfInstruments = instrEntries.length;
  const numberOfEGC = egcTablesList.length;
  const numberOfADSR = adsrTablesList.length;
  let fileSize = 0;
  fileSize += 8;
  fileSize += 2 + 2 + 4;
  fileSize += 6;
  fileSize += 14;
  fileSize += 28;
  fileSize += 140;
  fileSize += numberOfSamples * 28;
  fileSize += numberOfSamples * 4;
  fileSize += numberOfEGC * 128;
  fileSize += numberOfADSR * 256;
  fileSize += numberOfInstruments * 28;
  fileSize += 16 * 16;
  fileSize += numberOfSubSongs * 16;
  fileSize += 14;
  fileSize += numberOfWaveforms * 256;
  fileSize += totalNumberOfPositions * NUM_CHANNELS * 4;
  fileSize += (totalNumberOfTrackRows + 64) * 4;
  for (const s of samples) {
    fileSize += s.pcmData.length;
  }
  const output = new Uint8Array(fileSize);
  let off = 0;
  const magic = [73, 83, 77, 33, 86, 49, 46, 50];
  for (let i = 0; i < 8; i++) output[off++] = magic[i];
  writeU16BE(output, off, totalNumberOfPositions);
  off += 2;
  writeU16BE(output, off, totalNumberOfTrackRows);
  off += 2;
  off += 4;
  writeU8(output, off++, numberOfSamples);
  writeU8(output, off++, numberOfWaveforms);
  writeU8(output, off++, numberOfInstruments);
  writeU8(output, off++, numberOfSubSongs);
  writeU8(output, off++, numberOfEGC);
  writeU8(output, off++, numberOfADSR);
  off += 14;
  writeString(output, off, song.name || "Untitled", 28);
  off += 28;
  off += 140;
  for (let i = 0; i < numberOfSamples; i++) {
    off += 1;
    writeString(output, off, samples[i].name, 23);
    off += 23;
    off += 4;
  }
  for (let i = 0; i < numberOfSamples; i++) {
    writeU32BE(output, off, samples[i].pcmData.length);
    off += 4;
  }
  for (let i = 0; i < numberOfEGC; i++) {
    for (let j = 0; j < 128; j++) {
      writeU8(output, off++, egcTablesList[i][j] ?? 0);
    }
  }
  for (let i = 0; i < numberOfADSR; i++) {
    for (let j = 0; j < 256; j++) {
      writeU8(output, off++, adsrTablesList[i][j] ?? 0);
    }
  }
  for (const instr of instrEntries) {
    writeU8(output, off++, instr.waveformNumber);
    writeU8(output, off++, instr.synthesisEnabled ? 1 : 0);
    writeU16BE(output, off, instr.waveformLength);
    off += 2;
    writeU16BE(output, off, instr.repeatLength);
    off += 2;
    writeU8(output, off++, instr.volume);
    writeS8(output, off++, instr.portamentoSpeed);
    writeU8(output, off++, instr.adsrEnabled ? 1 : 0);
    writeU8(output, off++, instr.adsrTableNumber);
    writeU16BE(output, off, instr.adsrTableLength);
    off += 2;
    off += 2;
    writeU8(output, off++, instr.portamentoEnabled ? 1 : 0);
    off += 5;
    writeU8(output, off++, instr.vibratoDelay);
    writeU8(output, off++, instr.vibratoSpeed);
    writeU8(output, off++, instr.vibratoLevel);
    writeU8(output, off++, instr.egcOffset);
    writeU8(output, off++, instr.egcMode);
    writeU8(output, off++, instr.egcTableNumber);
    writeU16BE(output, off, instr.egcTableLength);
    off += 2;
  }
  for (let i = 0; i < 16; i++) {
    for (let j = 0; j < 16; j++) {
      writeS8(output, off++, arpTables[i][j]);
    }
  }
  for (let i = 0; i < numberOfSubSongs; i++) {
    off += 4;
    writeU8(output, off++, startSpeed);
    writeU8(output, off++, rowsPerTrack);
    writeU16BE(output, off, 0);
    off += 2;
    writeU16BE(output, off, totalNumberOfPositions - 1);
    off += 2;
    writeU16BE(output, off, 0);
    off += 2;
    off += 2;
  }
  off += 14;
  for (let i = 0; i < numberOfWaveforms; i++) {
    for (let j = 0; j < 256; j++) {
      writeS8(output, off++, waveformsList[i][j]);
    }
  }
  for (let i = 0; i < totalNumberOfPositions; i++) {
    const posRow = positionEntries[i];
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const pos = posRow[ch];
      writeU16BE(output, off, pos.startTrackRow);
      off += 2;
      writeS8(output, off++, pos.soundTranspose);
      writeS8(output, off++, pos.noteTranspose);
    }
  }
  for (const line of trackRowPool) {
    output[off++] = line.note & 255;
    output[off++] = line.instrument & 255;
    output[off++] = (line.arpeggio & 15) << 4 | line.effect & 15;
    output[off++] = line.effectArg & 255;
  }
  for (let i = 0; i < 64; i++) {
    off += 4;
  }
  for (const s of samples) {
    output.set(s.pcmData, off);
    off += s.pcmData.length;
  }
  const baseName = (song.name || "untitled").replace(/[^a-zA-Z0-9_\- ]/g, "_");
  const data = new Blob([output.buffer], { type: "application/octet-stream" });
  return {
    data,
    filename: `${baseName}.is`,
    warnings
  };
}
function emptyInstrEntry() {
  return {
    waveformNumber: 0,
    synthesisEnabled: false,
    waveformLength: 0,
    repeatLength: 2,
    volume: 0,
    portamentoSpeed: 0,
    adsrEnabled: false,
    adsrTableNumber: 0,
    adsrTableLength: 0,
    portamentoEnabled: false,
    vibratoDelay: 0,
    vibratoSpeed: 0,
    vibratoLevel: 0,
    egcOffset: 0,
    egcMode: 0,
    egcTableNumber: 0,
    egcTableLength: 0
  };
}
export {
  exportInStereo1
};
