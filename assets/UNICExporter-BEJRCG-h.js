const HEADER_SIZE = 1084;
const BYTES_PER_PATTERN = 768;
const NUM_CHANNELS = 4;
const ROWS_PER_PATTERN = 64;
const MAX_SAMPLES = 31;
const UNIC_NOTE_OFFSET = 12;
function writeStr(view, offset, str, len) {
  for (let i = 0; i < len; i++) {
    view.setUint8(offset + i, i < str.length ? str.charCodeAt(i) & 127 : 0);
  }
}
function writeU8(view, offset, val) {
  view.setUint8(offset, val & 255);
}
function writeU16BE(view, offset, val) {
  view.setUint16(offset, val & 65535, false);
}
function writeI16BE(view, offset, val) {
  view.setInt16(offset, val, false);
}
function xmFinetuneToUNICRaw(xmFinetune) {
  const table = [0, 16, 32, 48, 64, 80, 96, 112, -128, -112, -96, -80, -64, -48, -32, -16];
  let nibble = 0;
  for (let i = 0; i < 16; i++) {
    if (table[i] === xmFinetune) {
      nibble = i;
      break;
    }
  }
  return -nibble;
}
function extractPCM(inst) {
  var _a;
  if (!((_a = inst == null ? void 0 : inst.sample) == null ? void 0 : _a.audioBuffer)) return new Uint8Array(0);
  const wav = new DataView(inst.sample.audioBuffer);
  const dataLen = wav.getUint32(40, true);
  const frames = Math.floor(dataLen / 2);
  const pcm = new Uint8Array(frames);
  for (let j = 0; j < frames; j++) {
    const s16 = wav.getInt16(44 + j * 2, true);
    pcm[j] = s16 >> 8 & 255;
  }
  return pcm;
}
async function exportUNIC(song) {
  var _a, _b, _c, _d, _e, _f;
  const warnings = [];
  const songPositions = song.songPositions ?? [];
  const numOrders = Math.min(127, songPositions.length || 1);
  let maxPatIdx = 0;
  for (let i = 0; i < numOrders; i++) {
    const p = songPositions[i] ?? 0;
    if (p > maxPatIdx) maxPatIdx = p;
  }
  const numPatterns = maxPatIdx + 1;
  if (numPatterns > 128) {
    warnings.push(`Pattern count ${numPatterns} exceeds UNIC max of 128; clamping.`);
  }
  const clampedPatterns = Math.min(128, numPatterns);
  const samples = [];
  for (let i = 0; i < MAX_SAMPLES; i++) {
    const inst = i < song.instruments.length ? song.instruments[i] : void 0;
    if (inst) {
      const pcm = extractPCM(inst);
      const modVol = (_b = (_a = inst.metadata) == null ? void 0 : _a.modPlayback) == null ? void 0 : _b.defaultVolume;
      const vol = modVol !== void 0 ? Math.min(64, Math.max(0, Math.round(modVol))) : inst.volume !== void 0 && inst.volume > -60 ? Math.min(64, Math.round(Math.pow(10, inst.volume / 20) * 64)) : 0;
      const finetune = ((_d = (_c = inst.metadata) == null ? void 0 : _c.modPlayback) == null ? void 0 : _d.finetune) ?? 0;
      samples.push({
        name: (inst.name ?? `Sample ${i + 1}`).slice(0, 20),
        pcm,
        volume: pcm.length > 0 ? vol : 0,
        loopStart: ((_e = inst.sample) == null ? void 0 : _e.loopStart) ?? 0,
        loopEnd: ((_f = inst.sample) == null ? void 0 : _f.loopEnd) ?? 0,
        finetune
      });
    } else {
      samples.push({
        name: "",
        pcm: new Uint8Array(0),
        volume: 0,
        loopStart: 0,
        loopEnd: 0,
        finetune: 0
      });
    }
  }
  if (song.instruments.length > MAX_SAMPLES) {
    warnings.push(`Song has ${song.instruments.length} instruments; UNIC supports max 31. Extras ignored.`);
  }
  let totalSampleBytes = 0;
  for (const s of samples) {
    const len = s.pcm.length % 2 === 0 ? s.pcm.length : s.pcm.length + 1;
    totalSampleBytes += len;
  }
  const totalSize = HEADER_SIZE + clampedPatterns * BYTES_PER_PATTERN + totalSampleBytes;
  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);
  const title = (song.name ?? "Untitled").slice(0, 20);
  writeStr(view, 0, title, 20);
  for (let i = 0; i < MAX_SAMPLES; i++) {
    const base = 20 + i * 30;
    const s = samples[i];
    writeStr(view, base, s.name, 20);
    const rawFT = xmFinetuneToUNICRaw(s.finetune);
    writeI16BE(view, base + 20, rawFT);
    const byteLen = s.pcm.length % 2 === 0 ? s.pcm.length : s.pcm.length + 1;
    const wordLen = Math.floor(byteLen / 2);
    writeU16BE(view, base + 22, wordLen);
    writeU8(view, base + 24, 0);
    writeU8(view, base + 25, Math.min(64, s.volume));
    let loopStartWords = 0;
    let loopLenWords = 0;
    if (s.loopEnd > s.loopStart && s.loopEnd > 0) {
      loopStartWords = Math.floor(s.loopStart / 2);
      loopLenWords = Math.max(1, Math.floor((s.loopEnd - s.loopStart) / 2));
      if (loopLenWords <= 1) loopLenWords = 2;
    } else {
      loopLenWords = 1;
    }
    writeU16BE(view, base + 26, loopStartWords);
    writeU16BE(view, base + 28, loopLenWords);
  }
  writeU8(view, 950, numOrders);
  writeU8(view, 951, song.restartPosition ?? 0);
  for (let i = 0; i < 128; i++) {
    writeU8(view, 952 + i, i < numOrders ? songPositions[i] ?? 0 : 0);
  }
  writeStr(view, 1080, "M.K.", 4);
  for (let pIdx = 0; pIdx < clampedPatterns; pIdx++) {
    const pat = pIdx < song.patterns.length ? song.patterns[pIdx] : void 0;
    for (let row = 0; row < ROWS_PER_PATTERN; row++) {
      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        const cellOff = HEADER_SIZE + pIdx * BYTES_PER_PATTERN + (row * NUM_CHANNELS + ch) * 3;
        if (!pat || ch >= pat.channels.length || row >= pat.channels[ch].rows.length) {
          output[cellOff] = 0;
          output[cellOff + 1] = 0;
          output[cellOff + 2] = 0;
          continue;
        }
        const cell = pat.channels[ch].rows[row];
        const note = cell.note ?? 0;
        const instr = cell.instrument ?? 0;
        let noteIdx = 0;
        if (note > 0) {
          noteIdx = note - UNIC_NOTE_OFFSET;
          if (noteIdx < 0) noteIdx = 0;
          if (noteIdx > 63) {
            noteIdx = 63;
            if (warnings.indexOf("Note out of UNIC range (clamped to 63)") === -1) {
              warnings.push("Note out of UNIC range (clamped to 63)");
            }
          }
        }
        const instrHi = (instr & 48) << 2;
        output[cellOff] = instrHi | noteIdx & 63;
        const instrLo = (instr & 15) << 4;
        output[cellOff + 1] = instrLo | (cell.effTyp ?? 0) & 15;
        output[cellOff + 2] = (cell.eff ?? 0) & 255;
      }
    }
  }
  let pcmCursor = HEADER_SIZE + clampedPatterns * BYTES_PER_PATTERN;
  for (const s of samples) {
    if (s.pcm.length > 0) {
      output.set(s.pcm, pcmCursor);
      pcmCursor += s.pcm.length;
      if (s.pcm.length % 2 !== 0) {
        output[pcmCursor] = 0;
        pcmCursor += 1;
      }
    }
  }
  const blob = new Blob([output], { type: "application/octet-stream" });
  const baseName = (song.name ?? "untitled").replace(/[^a-zA-Z0-9_\- ]/g, "").trim() || "untitled";
  const filename = `${baseName}.unic`;
  return { data: blob, filename, warnings };
}
export {
  exportUNIC
};
