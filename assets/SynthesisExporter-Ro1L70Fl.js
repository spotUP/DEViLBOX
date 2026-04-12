function writeU16BE(view, off, val) {
  view.setUint16(off, val & 65535, false);
}
function writeU32BE(view, off, val) {
  view.setUint32(off, val >>> 0, false);
}
function writeString(buf, off, str, len) {
  for (let i = 0; i < len; i++) {
    buf[off + i] = i < str.length ? str.charCodeAt(i) & 255 : 0;
  }
}
function xmNoteToSynIdx(xmNote) {
  if (xmNote <= 0) return 0;
  const synIdx = xmNote + 36;
  return Math.max(1, Math.min(108, synIdx));
}
function xmEffectToSyn(effTyp, eff) {
  switch (effTyp) {
    case 3:
      return { effect: 1, effectArg: eff };
    case 15:
      return { effect: 8, effectArg: eff };
    case 12:
      return { effect: 15, effectArg: Math.min(255, eff) };
    default:
      return { effect: 0, effectArg: 0 };
  }
}
function extractPCM(audioBuffer) {
  const wav = new DataView(audioBuffer);
  const dataLen = wav.getUint32(40, true);
  const frames = Math.floor(dataLen / 2);
  const pcm = new Uint8Array(frames);
  for (let j = 0; j < frames; j++) {
    const s16 = wav.getInt16(44 + j * 2, true);
    pcm[j] = s16 >> 8 & 255;
  }
  return pcm;
}
async function exportSynthesis(song) {
  var _a, _b;
  const warnings = [];
  const numChannels = 4;
  if (song.numChannels > numChannels) {
    warnings.push(`Synthesis supports 4 channels; ${song.numChannels - numChannels} channels were dropped.`);
  }
  const instruments = song.instruments;
  const NOI = instruments.length;
  const samplePCMs = [];
  const sampleNames = [];
  const sampleLengths = [];
  const waveformData = [];
  const instrDefs = [];
  for (let i = 0; i < NOI; i++) {
    const inst = instruments[i];
    const vol = Math.min(64, Math.round((inst.volume ?? 100) * 64 / 100));
    if ((_a = inst.sample) == null ? void 0 : _a.audioBuffer) {
      const pcm = extractPCM(inst.sample.audioBuffer);
      const sampleIdx = samplePCMs.length;
      samplePCMs.push(pcm);
      sampleNames.push((inst.name ?? `Sample ${sampleIdx}`).substring(0, 27));
      sampleLengths.push(pcm.length);
      const loopStart = inst.sample.loopStart ?? 0;
      const loopEnd = inst.sample.loopEnd ?? 0;
      let waveformLength = 0;
      let repeatLength = 2;
      if (loopEnd > loopStart && loopStart === 0 && loopEnd >= pcm.length) {
        repeatLength = 0;
        waveformLength = 0;
      } else if (loopEnd > loopStart) {
        waveformLength = loopStart;
        repeatLength = loopEnd - loopStart;
      }
      instrDefs.push({
        waveformNumber: sampleIdx,
        synthesisEnabled: false,
        waveformLength,
        repeatLength,
        volume: vol
      });
    } else {
      instrDefs.push({
        waveformNumber: 0,
        synthesisEnabled: true,
        waveformLength: 256,
        repeatLength: 0,
        // full loop
        volume: vol
      });
    }
  }
  const NOS = samplePCMs.length;
  const NOW = waveformData.length > 0 ? waveformData.length : instrDefs.some((d) => d.synthesisEnabled) ? 1 : 0;
  if (NOW > 0 && waveformData.length === 0) {
    const wave = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      wave[i] = Math.round(Math.sin(i / 256 * 2 * Math.PI) * 127) & 255;
    }
    waveformData.push(wave);
  }
  const songLen = song.songPositions.length;
  const rowsPerTrack = song.patterns.length > 0 ? song.patterns[0].length : 16;
  const trackRows = [];
  const trackRowStartMap = [];
  for (let p = 0; p < song.patterns.length; p++) {
    const pat = song.patterns[p];
    const channelStarts = [];
    for (let ch = 0; ch < numChannels; ch++) {
      const startRow = trackRows.length;
      channelStarts.push(startRow);
      const rows = ((_b = pat.channels[ch]) == null ? void 0 : _b.rows) ?? [];
      const patLen = pat.length || rowsPerTrack;
      for (let row = 0; row < patLen; row++) {
        const cell = rows[row];
        const xmNote = (cell == null ? void 0 : cell.note) ?? 0;
        const instrNum = (cell == null ? void 0 : cell.instrument) ?? 0;
        const effTyp = (cell == null ? void 0 : cell.effTyp) ?? 0;
        const eff = (cell == null ? void 0 : cell.eff) ?? 0;
        const synNote = xmNoteToSynIdx(xmNote);
        const { effect, effectArg } = xmEffectToSyn(effTyp, eff);
        trackRows.push({
          note: synNote,
          instrument: instrNum,
          arpeggio: 0,
          effect,
          effectArg
        });
      }
    }
    trackRowStartMap.push(channelStarts);
  }
  while (trackRows.length < 64) {
    trackRows.push({ note: 0, instrument: 0, arpeggio: 0, effect: 0, effectArg: 0 });
  }
  const NOR = trackRows.length - 64;
  const positionsData = [];
  for (let i = 0; i < songLen; i++) {
    const patIdx = song.songPositions[i] ?? 0;
    const chMap = trackRowStartMap[patIdx];
    const voices = [];
    for (let ch = 0; ch < numChannels; ch++) {
      voices.push({
        startTrackRow: chMap ? chMap[ch] : 0,
        soundTranspose: 0,
        noteTranspose: 0
      });
    }
    positionsData.push(voices);
  }
  const NOP = positionsData.length;
  const NSS = 1;
  const NOE = 0;
  const NOADSR = 0;
  const headerSize = 8 + 2 + 2 + 4 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 13 + 28 + 140;
  const sampleInfoSize = NOS * 28;
  const sampleLengthsSize = NOS * 4;
  const egSize = NOE * 128;
  const adsrSize = NOADSR * 256;
  const instrSize = NOI * 28;
  const arpeggioSize = 16 * 16;
  const subSongSize = NSS * 14 + 14;
  const waveformSize = NOW * 256;
  const positionSize = NOP * 16;
  const trackRowSize = trackRows.length * 4;
  const totalSamplePCM = sampleLengths.reduce((a, b) => a + b, 0);
  const totalSize = headerSize + sampleInfoSize + sampleLengthsSize + egSize + adsrSize + instrSize + arpeggioSize + subSongSize + waveformSize + positionSize + trackRowSize + totalSamplePCM;
  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);
  let pos = 0;
  writeString(output, pos, "Synth4.0", 8);
  pos = 8;
  writeU16BE(view, pos, NOP);
  pos += 2;
  writeU16BE(view, pos, NOR);
  pos += 2;
  pos += 4;
  output[pos++] = NOS;
  output[pos++] = NOW;
  output[pos++] = NOI;
  output[pos++] = NSS;
  output[pos++] = NOE;
  output[pos++] = NOADSR;
  output[pos++] = 0;
  pos += 13;
  writeString(output, pos, song.name ?? "Untitled", 28);
  pos += 28;
  pos += 140;
  for (let i = 0; i < NOS; i++) {
    output[pos++] = 0;
    writeString(output, pos, sampleNames[i] ?? "", 27);
    pos += 27;
  }
  for (let i = 0; i < NOS; i++) {
    writeU32BE(view, pos, sampleLengths[i]);
    pos += 4;
  }
  for (let i = 0; i < NOI; i++) {
    const def = instrDefs[i];
    const instrOff = pos;
    output[instrOff + 0] = def.waveformNumber & 255;
    output[instrOff + 1] = def.synthesisEnabled ? 1 : 0;
    view.setUint16(instrOff + 2, def.waveformLength & 65535, false);
    view.setUint16(instrOff + 4, def.repeatLength & 65535, false);
    output[instrOff + 6] = def.volume & 255;
    pos += 28;
  }
  pos += 16 * 16;
  for (let i = 0; i < NSS; i++) {
    pos += 4;
    output[pos++] = song.initialSpeed ?? 6;
    output[pos++] = rowsPerTrack & 255;
    writeU16BE(view, pos, 0);
    pos += 2;
    writeU16BE(view, pos, Math.max(0, NOP - 1));
    pos += 2;
    writeU16BE(view, pos, song.restartPosition ?? 0);
    pos += 2;
    pos += 2;
  }
  pos += 14;
  for (let i = 0; i < NOW; i++) {
    if (i < waveformData.length) {
      output.set(waveformData[i].subarray(0, 256), pos);
    }
    pos += 256;
  }
  for (let p = 0; p < NOP; p++) {
    const voices = positionsData[p];
    for (let v = 0; v < 4; v++) {
      const voice = voices[v];
      writeU16BE(view, pos, voice.startTrackRow);
      pos += 2;
      output[pos++] = voice.soundTranspose & 255;
      output[pos++] = voice.noteTranspose & 255;
    }
  }
  for (let i = 0; i < trackRows.length; i++) {
    const tr = trackRows[i];
    output[pos++] = tr.note & 255;
    output[pos++] = tr.instrument & 255;
    output[pos++] = (tr.arpeggio & 15) << 4 | tr.effect & 15;
    output[pos++] = tr.effectArg & 255;
  }
  for (let i = 0; i < NOS; i++) {
    output.set(samplePCMs[i], pos);
    pos += samplePCMs[i].length;
  }
  if (NOI > 255) {
    warnings.push(`Synthesis supports up to 255 instruments; ${NOI - 255} were dropped.`);
  }
  if (NOP > 65535) {
    warnings.push("Position count exceeds 65535; truncated.");
  }
  const baseName = (song.name || "untitled").replace(/[^a-zA-Z0-9_-]/g, "_");
  return {
    data: new Blob([output], { type: "application/octet-stream" }),
    filename: `${baseName}.syn`,
    warnings
  };
}
export {
  exportSynthesis
};
