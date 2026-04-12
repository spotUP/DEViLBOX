const NUM_CHANNELS = 8;
const HEADER_SIZE = 82;
const SAMPLE_HDR_SIZE = 32;
const MAX_SAMPLES = 63;
function writeU8(view, off, val) {
  view.setUint8(off, val & 255);
}
function writeU16BE(view, off, val) {
  view.setUint16(off, val & 65535, false);
}
function writeU32BE(view, off, val) {
  view.setUint32(off, val >>> 0, false);
}
function writeString(view, off, str, maxLen) {
  for (let i = 0; i < maxLen; i++) {
    view.setUint8(off + i, i < str.length ? str.charCodeAt(i) & 127 : 0);
  }
}
function encodeChannelStream(song, channelIdx, rowsPerMeasure) {
  const buf = [];
  let currentSpacing = 0;
  let emptyRows = 0;
  const numMeasures = song.songPositions.length;
  for (let m = 0; m < numMeasures; m++) {
    const patIdx = song.songPositions[m];
    const pat = song.patterns[patIdx];
    if (!pat) continue;
    const channel = pat.channels[channelIdx];
    if (!channel) continue;
    for (let row = 0; row < rowsPerMeasure; row++) {
      const cell = channel.rows[row];
      if (!cell) {
        emptyRows++;
        continue;
      }
      const note = cell.note ?? 0;
      const instr = cell.instrument ?? 0;
      const volume = cell.volume ?? 0;
      const effTyp = cell.effTyp ?? 0;
      const eff = cell.eff ?? 0;
      const hasContent = note !== 0 || instr !== 0 || effTyp === 65 && volume !== 0 || effTyp === 28 || effTyp === 3 || effTyp === 10;
      if (!hasContent) {
        emptyRows++;
        continue;
      }
      const neededSpacing = emptyRows;
      if (neededSpacing !== currentSpacing) {
        const sp = neededSpacing & 4095;
        buf.push(240 | sp >> 8 & 15);
        buf.push(sp & 255);
        currentSpacing = neededSpacing;
      }
      emptyRows = 0;
      let noteBits = 0;
      if (note === 97) {
        noteBits = 35;
      } else if (note > 0) {
        noteBits = note - 48;
        if (noteBits < 1) noteBits = 1;
        if (noteBits > 34) noteBits = 34;
      }
      let data0 = 0;
      let data1 = 0;
      const param = instr & 63;
      const paramHi = param >> 2 & 15;
      const paramLo = param & 3;
      if (effTyp === 65) {
        let volNibble = Math.round(volume * 9 / 64) + 1;
        if (volNibble < 1) volNibble = 1;
        if (volNibble > 9) volNibble = 9;
        data0 = volNibble << 4 | paramHi;
        data1 = paramLo << 6 | noteBits & 63;
      } else if (effTyp === 28) {
        const selParam = eff & 63;
        data0 = 176 | selParam >> 2 & 15;
        data1 = (selParam & 3) << 6 | noteBits & 63;
      } else if (effTyp === 3) {
        const pbParam = eff & 63;
        data0 = 192 | pbParam >> 2 & 15;
        data1 = (pbParam & 3) << 6 | noteBits & 63;
      } else if (effTyp === 10) {
        const vdParam = eff & 63;
        data0 = 208 | vdParam >> 2 & 15;
        data1 = (vdParam & 3) << 6 | noteBits & 63;
      } else {
        data0 = 0 | paramHi;
        data1 = paramLo << 6 | noteBits & 63;
      }
      buf.push(data0);
      buf.push(data1);
      currentSpacing = neededSpacing;
      emptyRows = 0;
    }
  }
  return new Uint8Array(buf);
}
function extractSample(inst, warnings) {
  const name = (inst.name || "").slice(0, 30);
  if (!name) return null;
  const sample = inst.sample;
  if (!(sample == null ? void 0 : sample.audioBuffer)) return null;
  const wav = new DataView(sample.audioBuffer);
  let dataOffset = 44;
  let dataLen = 0;
  if (wav.byteLength >= 44) {
    dataLen = wav.getUint32(40, true);
  }
  if (dataLen === 0 || dataOffset + dataLen > wav.byteLength) {
    dataLen = wav.byteLength - dataOffset;
  }
  if (dataLen <= 0) return null;
  let bitsPerSample = 16;
  if (wav.byteLength >= 36) {
    bitsPerSample = wav.getUint16(34, true);
  }
  let frames;
  const bytesPerFrame = bitsPerSample / 8;
  frames = Math.floor(dataLen / bytesPerFrame);
  if (frames <= 0) return null;
  if (frames % 2 !== 0) frames--;
  const pcm = new Uint8Array(frames);
  for (let j = 0; j < frames; j++) {
    if (bitsPerSample === 16) {
      const s16 = wav.getInt16(dataOffset + j * 2, true);
      pcm[j] = s16 >> 8 & 255;
    } else {
      pcm[j] = wav.getUint8(dataOffset + j) - 128 & 255;
    }
  }
  const loopStart = sample.loopStart ?? 0;
  const loopEnd = sample.loopEnd ?? 0;
  const loopLength = loopEnd > loopStart ? loopEnd - loopStart : 0;
  const clampedLoopStart = Math.min(loopStart, frames);
  const clampedLoopLength = loopLength > 0 ? Math.min(loopLength, frames - clampedLoopStart) : 0;
  if (loopStart > frames || loopLength > 0 && loopStart + loopLength > frames) {
    warnings.push(`Sample "${name}": loop points clamped to fit PCM length.`);
  }
  return {
    name,
    pcm,
    loopStartWords: Math.floor(clampedLoopStart / 2),
    loopLengthWords: clampedLoopLength > 0 ? Math.floor(clampedLoopLength / 2) : Math.floor(frames / 2)
  };
}
async function exportFaceTheMusic(song) {
  var _a, _b;
  const warnings = [];
  const numChannels = Math.min(NUM_CHANNELS, song.numChannels ?? NUM_CHANNELS);
  if ((song.numChannels ?? NUM_CHANNELS) > NUM_CHANNELS) {
    warnings.push(`FTM supports max ${NUM_CHANNELS} channels; extra channels will be dropped.`);
  }
  const numSamples = Math.min(MAX_SAMPLES, song.instruments.length);
  if (song.instruments.length > MAX_SAMPLES) {
    warnings.push(`FTM supports max ${MAX_SAMPLES} samples; ${song.instruments.length - MAX_SAMPLES} will be dropped.`);
  }
  const numMeasures = song.songPositions.length;
  const initialBPM = song.initialBPM ?? 125;
  const tempo = Math.round(1777517482e-3 / initialBPM);
  const clampedTempo = Math.max(4096, Math.min(20479, tempo));
  const ticksPerRow = Math.max(1, Math.min(24, song.initialSpeed ?? 6));
  const rowsPerMeasure = Math.floor(96 / ticksPerRow);
  let muteStatus = 0;
  if (song.patterns.length > 0) {
    const firstPat = song.patterns[song.songPositions[0] ?? 0];
    if (firstPat) {
      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        if ((_a = firstPat.channels[ch]) == null ? void 0 : _a.muted) {
          muteStatus |= 1 << ch;
        }
      }
    }
  }
  const globalVolume = 63;
  const samples = [];
  for (let i = 0; i < numSamples; i++) {
    const inst = song.instruments[i];
    if (inst) {
      samples.push(extractSample(inst, warnings));
    } else {
      samples.push(null);
    }
  }
  const channelStreams = [];
  for (let ch = 0; ch < NUM_CHANNELS; ch++) {
    if (ch < numChannels) {
      channelStreams.push(encodeChannelStream(song, ch, rowsPerMeasure));
    } else {
      channelStreams.push(new Uint8Array(0));
    }
  }
  let totalSize = HEADER_SIZE;
  totalSize += numSamples * SAMPLE_HDR_SIZE;
  for (let ch = 0; ch < NUM_CHANNELS; ch++) {
    totalSize += 2 + 4 + channelStreams[ch].length;
  }
  for (let s = 0; s < numSamples; s++) {
    const sd = samples[s];
    if (sd && sd.name) {
      totalSize += 4 + sd.pcm.length;
    }
  }
  const output = new ArrayBuffer(totalSize);
  const view = new DataView(output);
  const bytes = new Uint8Array(output);
  let pos = 0;
  bytes[0] = 70;
  bytes[1] = 84;
  bytes[2] = 77;
  bytes[3] = 78;
  pos = 4;
  writeU8(view, pos, 3);
  pos += 1;
  writeU8(view, pos, numSamples);
  pos += 1;
  writeU16BE(view, pos, numMeasures);
  pos += 2;
  writeU16BE(view, pos, clampedTempo);
  pos += 2;
  writeU8(view, pos, 0);
  pos += 1;
  writeU8(view, pos, muteStatus);
  pos += 1;
  writeU8(view, pos, globalVolume);
  pos += 1;
  writeU8(view, pos, 1);
  pos += 1;
  writeU8(view, pos, ticksPerRow);
  pos += 1;
  writeU8(view, pos, rowsPerMeasure);
  pos += 1;
  const title = (song.name || "").slice(0, 32);
  writeString(view, pos, title, 32);
  pos += 32;
  writeString(view, pos, "", 32);
  pos += 32;
  writeU8(view, pos, 0);
  pos += 1;
  writeU8(view, pos, 0);
  pos += 1;
  for (let s = 0; s < numSamples; s++) {
    const sd = samples[s];
    const name = (sd == null ? void 0 : sd.name) || ((_b = song.instruments[s]) == null ? void 0 : _b.name) || "";
    writeString(view, pos, name.slice(0, 30), 30);
    pos += 30;
    writeU8(view, pos, 0);
    pos += 1;
    writeU8(view, pos, 0);
    pos += 1;
  }
  for (let ch = 0; ch < NUM_CHANNELS; ch++) {
    const stream = channelStreams[ch];
    writeU16BE(view, pos, 0);
    pos += 2;
    writeU32BE(view, pos, stream.length);
    pos += 4;
    bytes.set(stream, pos);
    pos += stream.length;
  }
  for (let s = 0; s < numSamples; s++) {
    const sd = samples[s];
    if (!sd || !sd.name) continue;
    writeU16BE(view, pos, sd.loopStartWords);
    pos += 2;
    writeU16BE(view, pos, sd.loopLengthWords);
    pos += 2;
    bytes.set(sd.pcm, pos);
    pos += sd.pcm.length;
  }
  const baseName = (song.name || "untitled").replace(/[^a-zA-Z0-9_\- ]/g, "").trim() || "untitled";
  const filename = `${baseName}.ftm`;
  return {
    data: new Blob([output], { type: "application/octet-stream" }),
    filename,
    warnings
  };
}
export {
  exportFaceTheMusic
};
