const HEADER_SIZE = 276;
const PAL_CLOCK = 3546895;
const INSTR_HEADER_SIZE = 34;
const Op = {
  Pause: 128,
  SetVolume: 129,
  UseInstrument: 131,
  DefineInstrument: 132,
  End: 142
};
function xmNoteToPsf(xmNote) {
  if (xmNote <= 0 || xmNote > 96) return -1;
  const noteByte = xmNote - 13;
  return noteByte >= 0 && noteByte <= 127 ? noteByte : -1;
}
function freqToPeriod(freq) {
  if (freq <= 0) return 214;
  return Math.round(PAL_CLOCK / (2 * freq));
}
function extractPcm(inst) {
  var _a;
  const buf = (_a = inst.sample) == null ? void 0 : _a.audioBuffer;
  if (!buf || buf.byteLength < 44) return new Int8Array(0);
  const wav = new DataView(buf);
  const dataLen = wav.getUint32(40, true);
  const frames = Math.floor(dataLen / 2);
  const pcm = new Int8Array(frames);
  for (let i = 0; i < frames; i++) {
    const s16 = wav.getInt16(44 + i * 2, true);
    pcm[i] = s16 >> 8;
  }
  return pcm;
}
function buildChannelOpcodes(song, channelIdx, definedInstrSlots, instrumentPcms, instrumentPeriods, warnings) {
  const chunks = [];
  let currentInstrId = 0;
  let currentVolume = 64;
  for (let posIdx = 0; posIdx < song.songPositions.length; posIdx++) {
    const patIdx = song.songPositions[posIdx];
    const pattern = song.patterns[patIdx];
    if (!pattern || channelIdx >= pattern.channels.length) continue;
    const channel = pattern.channels[channelIdx];
    const rows = channel.rows;
    let rowIdx = 0;
    while (rowIdx < rows.length) {
      const cell = rows[rowIdx];
      const xmNote = cell.note ?? 0;
      const instrId = cell.instrument ?? 0;
      if (instrId > 0 && instrId !== currentInstrId) {
        if (!definedInstrSlots.has(instrId)) {
          const defBytes = buildDefineInstrument(
            instrId - 1,
            // slot is 0-based
            instrumentPcms.get(instrId) ?? new Int8Array(0),
            instrumentPeriods.get(instrId) ?? 214,
            song.instruments[instrId - 1]
          );
          if (defBytes) {
            chunks.push(defBytes);
            definedInstrSlots.add(instrId);
          }
        } else {
          const useBytes = new Uint8Array(2);
          useBytes[0] = Op.UseInstrument;
          useBytes[1] = instrId - 1;
          chunks.push(useBytes);
        }
        currentInstrId = instrId;
      }
      const cellVol = cell.volume ?? 0;
      if (cellVol > 0 && cellVol !== currentVolume) {
        const vol = Math.min(64, cellVol);
        const volBytes = new Uint8Array(2);
        volBytes[0] = Op.SetVolume;
        volBytes[1] = vol;
        chunks.push(volBytes);
        currentVolume = vol;
      }
      if (xmNote > 0 && xmNote <= 96) {
        const noteByte = xmNoteToPsf(xmNote);
        if (noteByte >= 0) {
          let duration = 1;
          while (rowIdx + duration < rows.length) {
            const next = rows[rowIdx + duration];
            if ((next.note ?? 0) > 0 || (next.instrument ?? 0) > 0 || (next.effTyp ?? 0) > 0 || (next.volume ?? 0) > 0) {
              break;
            }
            duration++;
          }
          const noteBytes = new Uint8Array(3);
          noteBytes[0] = noteByte;
          noteBytes[1] = duration >> 8 & 255;
          noteBytes[2] = duration & 255;
          chunks.push(noteBytes);
          rowIdx += duration;
          continue;
        } else {
          warnings.push(`Ch${channelIdx + 1}: Note ${xmNote} out of PSF range, converted to pause`);
          const pauseBytes = new Uint8Array(3);
          pauseBytes[0] = Op.Pause;
          pauseBytes[1] = 0;
          pauseBytes[2] = 1;
          chunks.push(pauseBytes);
          rowIdx++;
          continue;
        }
      } else if (xmNote === 97) {
        const pauseBytes = new Uint8Array(3);
        pauseBytes[0] = Op.Pause;
        pauseBytes[1] = 0;
        pauseBytes[2] = 1;
        chunks.push(pauseBytes);
        rowIdx++;
        continue;
      } else {
        let duration = 1;
        while (rowIdx + duration < rows.length) {
          const next = rows[rowIdx + duration];
          if ((next.note ?? 0) > 0 || (next.instrument ?? 0) > 0 || (next.effTyp ?? 0) > 0 || (next.volume ?? 0) > 0) {
            break;
          }
          duration++;
        }
        const pauseBytes = new Uint8Array(3);
        pauseBytes[0] = Op.Pause;
        pauseBytes[1] = duration >> 8 & 255;
        pauseBytes[2] = duration & 255;
        chunks.push(pauseBytes);
        rowIdx += duration;
        continue;
      }
    }
  }
  const endByte = new Uint8Array(1);
  endByte[0] = Op.End;
  chunks.push(endByte);
  const totalLen = chunks.reduce((s, c) => s + c.length, 0);
  const result = new Uint8Array(totalLen);
  let off = 0;
  for (const chunk of chunks) {
    result.set(chunk, off);
    off += chunk.length;
  }
  return result;
}
function buildDefineInstrument(slot, pcm, period, inst) {
  var _a;
  const sampleLengthWords = Math.floor(pcm.length / 2);
  const totalPayload = INSTR_HEADER_SIZE + sampleLengthWords * 2;
  const wordCount = (totalPayload + 4) / 2;
  const totalSize = 1 + 1 + 2 + totalPayload;
  const out = new Uint8Array(totalSize);
  let off = 0;
  out[off++] = Op.DefineInstrument;
  out[off++] = slot & 255;
  out[off++] = wordCount >> 8 & 255;
  out[off++] = wordCount & 255;
  out[off++] = sampleLengthWords >> 8 & 255;
  out[off++] = sampleLengthWords & 255;
  out[off++] = period >> 8 & 255;
  out[off++] = period & 255;
  const isLoop = ((_a = inst == null ? void 0 : inst.sample) == null ? void 0 : _a.loop) ?? false;
  out[off++] = isLoop ? 0 : 1;
  off += 3;
  off += 4;
  off += 4;
  off += 4;
  off += 4;
  off += 2;
  off += 3;
  off += 1;
  off += 4;
  for (let i = 0; i < pcm.length; i++) {
    out[off++] = pcm[i] & 255;
  }
  return out;
}
async function exportSoundFactory(song) {
  var _a;
  const warnings = [];
  const NUM_CHANNELS = 4;
  const instrumentPcms = /* @__PURE__ */ new Map();
  const instrumentPeriods = /* @__PURE__ */ new Map();
  for (let i = 0; i < song.instruments.length; i++) {
    const inst = song.instruments[i];
    const id = i + 1;
    const pcm = extractPcm(inst);
    instrumentPcms.set(id, pcm);
    const sampleRate = ((_a = inst.sample) == null ? void 0 : _a.sampleRate) ?? 8287;
    const period = freqToPeriod(sampleRate);
    instrumentPeriods.set(id, period);
  }
  const definedInstrSlots = /* @__PURE__ */ new Set();
  const channelOpcodes = [];
  for (let ch = 0; ch < NUM_CHANNELS; ch++) {
    const opcodes = buildChannelOpcodes(
      song,
      ch,
      definedInstrSlots,
      instrumentPcms,
      instrumentPeriods,
      warnings
    );
    channelOpcodes.push(opcodes);
  }
  const totalOpcodeLen = channelOpcodes.reduce((s, c) => s + c.length, 0);
  const moduleLength = HEADER_SIZE + totalOpcodeLen;
  const fileSize = moduleLength;
  const output = new Uint8Array(fileSize);
  const view = new DataView(output.buffer);
  view.setUint32(0, moduleLength, false);
  let voiceMask = 0;
  for (let ch = 0; ch < NUM_CHANNELS; ch++) {
    if (channelOpcodes[ch].length > 1) {
      voiceMask |= 1 << ch;
    }
  }
  output[4] = voiceMask;
  let opcodeOffset = 0;
  for (let ch = 0; ch < NUM_CHANNELS; ch++) {
    const fileOffset = HEADER_SIZE + opcodeOffset;
    view.setUint32(20 + ch * 4, fileOffset, false);
    opcodeOffset += channelOpcodes[ch].length;
  }
  let writeOff = HEADER_SIZE;
  for (let ch = 0; ch < NUM_CHANNELS; ch++) {
    output.set(channelOpcodes[ch], writeOff);
    writeOff += channelOpcodes[ch].length;
  }
  const baseName = (song.name || "untitled").replace(/[^a-zA-Z0-9_\- ]/g, "_");
  const data = new Blob([output.buffer], { type: "application/octet-stream" });
  if (song.instruments.length > 256) {
    warnings.push(`Song has ${song.instruments.length} instruments; PSF supports up to 256 slots.`);
  }
  return { data, filename: `${baseName}.psf`, warnings };
}
export {
  exportSoundFactory
};
