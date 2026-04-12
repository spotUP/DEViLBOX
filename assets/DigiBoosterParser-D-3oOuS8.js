import { b$ as registerPatternEncoder, c2 as createSamplerInstrument, c3 as periodToNoteIndex } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function encodeDigiBoosterCell(cell) {
  const out = new Uint8Array(4);
  const note = cell.note ?? 0;
  if (note > 0 && note > 36) {
    out[0] = Math.min(96, note - 36);
  } else {
    out[0] = 0;
  }
  const instr = cell.instrument ?? 0;
  out[1] = instr > 0 ? instr - 1 & 255 : 0;
  out[2] = (cell.effTyp ?? 0) & 255;
  out[3] = (cell.eff ?? 0) & 255;
  return out;
}
registerPatternEncoder("digiBooster", () => encodeDigiBoosterCell);
const TEXT_DECODER = new TextDecoder("iso-8859-1");
function str4(buf, off) {
  return TEXT_DECODER.decode(buf.subarray(off, off + 4));
}
function readStr(buf, off, len) {
  let end = off;
  while (end < off + len && buf[end] !== 0) end++;
  return TEXT_DECODER.decode(buf.subarray(off, end)).trim();
}
function u16(buf, off) {
  return buf[off] << 8 | buf[off + 1];
}
function u32(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function parseDigiBoosterFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  const magic = str4(buf, 0);
  if (magic === "DIGI" && buf.length >= 1572) {
    const hdr = readStr(buf, 0, 20);
    if (hdr.startsWith("DIGI Booster module")) {
      return parseOriginalDigiBooster(buf, filename);
    }
  }
  if (magic !== "DBMX" && magic !== "DBM0") {
    throw new Error(`Not a DigiBooster file: magic="${magic}"`);
  }
  let offset = 4;
  if (magic === "DBM0") {
    offset = 12;
  }
  let numChannels = 8;
  let numPatterns = 0;
  let numInstruments = 0;
  let numSamples = 0;
  let numSongs = 1;
  let moduleName = filename.replace(/\.[^/.]+$/, "");
  const songPositions = [];
  let songLength = 0;
  let speed = 6;
  let bpm = 125;
  const dbInstruments = [];
  const dbSamples = [];
  const dbPatterns = [];
  while (offset + 8 < buf.length) {
    const chunkId = str4(buf, offset);
    const chunkSize = u32(buf, offset + 4);
    const dataStart = offset + 8;
    offset += 8 + chunkSize;
    switch (chunkId) {
      case "INFO": {
        if (magic === "DBM0") {
          numInstruments = u16(buf, dataStart);
          numSamples = u16(buf, dataStart + 2);
          numSongs = u16(buf, dataStart + 4);
          numPatterns = u16(buf, dataStart + 6);
          numChannels = u16(buf, dataStart + 8);
        } else {
          numChannels = u16(buf, dataStart);
          numPatterns = u16(buf, dataStart + 2);
          numInstruments = u16(buf, dataStart + 4);
          numSamples = u16(buf, dataStart + 6);
        }
        break;
      }
      case "NAME": {
        moduleName = readStr(buf, dataStart, Math.min(chunkSize, 44));
        break;
      }
      case "SONG": {
        let soff = dataStart;
        for (let s = 0; s < numSongs && soff + 46 <= dataStart + chunkSize; s++) {
          const len = u16(buf, soff + 44);
          if (s === 0) {
            songLength = len;
            for (let i = 0; i < len && i < 128; i++) {
              songPositions.push(u16(buf, soff + 46 + i * 2));
            }
          }
          soff += 46 + 128 * 2;
        }
        break;
      }
      case "INST": {
        const instrSize = magic === "DBM0" ? 50 : 28;
        for (let i = 0; i < numInstruments; i++) {
          const base = dataStart + i * instrSize;
          if (base + instrSize > buf.length) break;
          const name = readStr(buf, base, 30);
          const sampleIdx = u16(buf, base + 30);
          const volume = buf[base + 32];
          const flags = u16(buf, base + 33);
          const finetune = buf[base + 35] < 128 ? buf[base + 35] : buf[base + 35] - 256;
          const loopStart = u32(buf, base + 36);
          const loopEnd = u32(buf, base + 40);
          dbInstruments.push({ name, sampleNum: sampleIdx, volume, finetune, loopStart, loopEnd, flags });
        }
        break;
      }
      case "SMPL": {
        let soff = dataStart;
        for (let i = 0; i < numSamples; i++) {
          if (soff + 4 > dataStart + chunkSize) break;
          const name = readStr(buf, soff, 30);
          const length = u32(buf, soff + 30);
          const loopStart = u32(buf, soff + 34);
          const loopEnd = u32(buf, soff + 38);
          const volume = buf[soff + 42];
          const flags = u16(buf, soff + 43);
          const bits = flags & 1 ? 16 : 8;
          soff += 50;
          const byteLen = length * (bits === 16 ? 2 : 1);
          const pcmSlice = buf.slice(soff, soff + byteLen);
          soff += byteLen;
          dbSamples.push({
            name,
            length,
            loopStart,
            loopEnd,
            volume: volume || 64,
            finetune: 0,
            bits,
            pcm: pcmSlice
          });
        }
        break;
      }
      case "PATT": {
        let poff = dataStart;
        while (poff + 4 < dataStart + chunkSize) {
          const rows = u16(buf, poff);
          const chans = u16(buf, poff + 2);
          poff += 4;
          const dataBytes = rows * chans * 4;
          const patDataOff = poff;
          const data = buf.slice(poff, poff + dataBytes);
          poff += dataBytes;
          dbPatterns.push({ rows, channels: chans, data, fileDataOffset: patDataOff });
          if (dbPatterns.length >= numPatterns) break;
        }
        break;
      }
    }
  }
  const instruments = dbInstruments.map((instr, i) => {
    const sampleIdx = instr.sampleNum - 1;
    if (sampleIdx < 0 || sampleIdx >= dbSamples.length) {
      return {
        id: i + 1,
        name: instr.name || `Instrument ${i + 1}`,
        type: "synth",
        synthType: "Synth",
        effects: [],
        volume: -6,
        pan: 0
      };
    }
    const samp = dbSamples[sampleIdx];
    let pcm8;
    if (samp.pcm === null || samp.pcm.length === 0) {
      pcm8 = new Uint8Array(0);
    } else if (samp.bits === 16) {
      const frames = Math.floor(samp.pcm.length / 2);
      pcm8 = new Uint8Array(frames);
      const view = new DataView(samp.pcm.buffer, samp.pcm.byteOffset);
      for (let j = 0; j < frames; j++) {
        const s16 = view.getInt16(j * 2, false);
        pcm8[j] = (s16 >> 8) + 128 & 255;
      }
    } else {
      pcm8 = samp.pcm;
    }
    return createSamplerInstrument(
      i + 1,
      instr.name || samp.name || `Sample ${i + 1}`,
      pcm8,
      samp.volume,
      8287,
      samp.loopStart,
      samp.loopEnd
    );
  });
  const trackerPatterns = dbPatterns.map((pat, patIdx) => {
    const channels = Array.from({ length: pat.channels }, (_, ch) => {
      const rows = [];
      for (let row = 0; row < pat.rows; row++) {
        const base = (row * pat.channels + ch) * 4;
        const rawNote = pat.data[base];
        const inst = pat.data[base + 1];
        const eff = pat.data[base + 2];
        const param = pat.data[base + 3];
        const xmNote = rawNote > 0 ? rawNote + 12 : 0;
        const { effTyp, effParam } = mapDBMEffect(eff, param);
        rows.push({ note: xmNote, instrument: inst, volume: 0, effTyp, eff: effParam, effTyp2: 0, eff2: 0 });
      }
      return {
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: ch % 2 === 0 ? -25 : 25,
        instrumentId: null,
        color: null,
        rows
      };
    });
    return {
      id: `pattern-${patIdx}`,
      name: `Pattern ${patIdx}`,
      length: pat.rows,
      channels,
      importMetadata: {
        sourceFormat: "DIGI",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: pat.channels,
        originalPatternCount: numPatterns,
        originalInstrumentCount: numInstruments
      }
    };
  });
  const uadePatternLayout = {
    formatId: "digiBooster",
    patternDataFileOffset: 0,
    // overridden by getCellFileOffset
    bytesPerCell: 4,
    rowsPerPattern: 64,
    numChannels,
    numPatterns: trackerPatterns.length,
    moduleSize: buffer.byteLength,
    encodeCell: encodeDigiBoosterCell,
    getCellFileOffset: (pattern, row, channel) => {
      const pat = dbPatterns[pattern];
      if (!pat) return 0;
      return pat.fileDataOffset + (row * pat.channels + channel) * 4;
    }
  };
  return {
    name: moduleName,
    format: "DIGI",
    patterns: trackerPatterns,
    instruments,
    songPositions: songPositions.length > 0 ? songPositions : [0],
    songLength: songLength || 1,
    restartPosition: 0,
    numChannels,
    initialSpeed: speed,
    initialBPM: bpm,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename,
    uadePatternLayout
  };
}
function mapDBMEffect(cmd, param) {
  switch (cmd) {
    case 0:
      return { effTyp: 0, effParam: param };
    // Arpeggio
    case 1:
      return { effTyp: 1, effParam: param };
    // Portamento up
    case 2:
      return { effTyp: 2, effParam: param };
    // Portamento down
    case 3:
      return { effTyp: 3, effParam: param };
    // Tone portamento
    case 4:
      return { effTyp: 4, effParam: param };
    // Vibrato
    case 5:
      return { effTyp: 5, effParam: param };
    // Tone porta + vol slide
    case 6:
      return { effTyp: 6, effParam: param };
    // Vibrato + vol slide
    case 7:
      return { effTyp: 7, effParam: param };
    // Tremolo
    case 8:
      return { effTyp: 8, effParam: param };
    // Set panning
    case 9:
      return { effTyp: 9, effParam: param };
    // Sample offset
    case 10:
      return { effTyp: 10, effParam: param };
    // Volume slide
    case 11:
      return { effTyp: 11, effParam: param };
    // Position jump
    case 12:
      return { effTyp: 12, effParam: param };
    // Set volume
    case 13:
      return { effTyp: 13, effParam: param };
    // Pattern break
    case 14:
      return { effTyp: 14, effParam: param };
    // Extended
    case 15:
      return { effTyp: 15, effParam: param };
    // Set speed/tempo
    // DigiBooster extended effects 0x10-0x1F
    case 16:
      return { effTyp: 16, effParam: param };
    // Set global volume
    case 17:
      return { effTyp: 17, effParam: param };
    // Global volume slide
    default:
      return { effTyp: 0, effParam: 0 };
  }
}
function parseOriginalDigiBooster(buf, filename) {
  const numChannels = buf[25] || 4;
  const packed = buf[26] !== 0;
  const numPatterns = (buf[46] & 255) + 1;
  const songLength = (buf[47] & 255) + 1;
  const versionByte = buf[24];
  const songPositions = [];
  for (let i = 0; i < songLength; i++) {
    songPositions.push(buf[48 + i]);
  }
  const samples = [];
  for (let i = 0; i < 31; i++) {
    const length = u32(buf, 176 + i * 4);
    let loopStart = u32(buf, 300 + i * 4);
    let loopLength = u32(buf, 424 + i * 4);
    const volume = Math.min(64, buf[548 + i]);
    let fineTune = buf[579 + i] << 24 >> 24;
    if (versionByte >= 16 && versionByte <= 19) fineTune = 0;
    if (loopStart > length || loopLength === 0) {
      loopStart = 0;
      loopLength = 0;
    } else if (loopStart + loopLength > length) {
      loopLength = length - loopStart;
    }
    const name = readStr(buf, 642 + i * 30, 30);
    samples.push({ length, loopStart, loopLength, volume, fineTune, name });
  }
  const songName = readStr(buf, 610, 32);
  let off = 1572;
  const trackerPatterns = [];
  for (let patIdx = 0; patIdx < numPatterns; patIdx++) {
    const rows = 64;
    const cells = [];
    for (let ch = 0; ch < numChannels; ch++) cells.push([]);
    if (!packed) {
      for (let ch = 0; ch < numChannels; ch++) {
        for (let row = 0; row < rows; row++) {
          if (off + 4 > buf.length) {
            cells[ch].push({ period: 0, sample: 0, effect: 0, param: 0 });
            continue;
          }
          const data = u32(buf, off);
          off += 4;
          const period = data >>> 16 & 4095;
          const sample = data >>> 24 & 240 | data >>> 12 & 15;
          const effect = data >>> 8 & 15;
          const param = data & 255;
          cells[ch].push({ period, sample, effect, param });
        }
      }
    } else {
      if (off + 2 > buf.length) break;
      const patLen = u16(buf, off);
      off += 2;
      const patEnd = off + patLen;
      const bitmask = [];
      for (let row = 0; row < rows; row++) {
        bitmask.push(off < buf.length ? buf[off++] : 0);
      }
      for (let ch = 0; ch < numChannels; ch++) {
        for (let row = 0; row < rows; row++) {
          cells[ch].push({ period: 0, sample: 0, effect: 0, param: 0 });
        }
      }
      for (let row = 0; row < rows; row++) {
        const mask = bitmask[row];
        for (let ch = 0; ch < numChannels; ch++) {
          const bit = 7 - ch;
          if (mask & 1 << bit) {
            if (off + 4 > buf.length) continue;
            const data = u32(buf, off);
            off += 4;
            const period = data >>> 16 & 4095;
            const sample = data >>> 24 & 240 | data >>> 12 & 15;
            const effect = data >>> 8 & 15;
            const param = data & 255;
            cells[ch][row] = { period, sample, effect, param };
          }
        }
      }
      off = Math.max(off, patEnd);
    }
    const channels = [];
    for (let ch = 0; ch < numChannels; ch++) {
      const channelCells = cells[ch].map((c) => {
        let note = 0;
        if (c.period > 0) {
          const noteIdx = periodToNoteIndex(c.period);
          note = noteIdx >= 0 ? noteIdx + 1 : 0;
        }
        const mapped = mapDBMEffect(c.effect, c.param);
        return {
          note,
          instrument: c.sample,
          volume: 0,
          effTyp: mapped.effTyp,
          eff: mapped.effParam,
          effTyp2: 0,
          eff2: 0
        };
      });
      channels.push({
        id: `ch-${ch}`,
        name: `Ch ${ch + 1}`,
        rows: channelCells,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: 0,
        instrumentId: null,
        color: null
      });
    }
    trackerPatterns.push({
      id: `pattern-${patIdx}`,
      name: `Pattern ${patIdx}`,
      length: rows,
      channels,
      importMetadata: {
        sourceFormat: "DIGI",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: numChannels,
        originalPatternCount: numPatterns,
        originalInstrumentCount: 31
      }
    });
  }
  const instruments = [];
  for (let i = 0; i < 31; i++) {
    const s = samples[i];
    const id = i + 1;
    if (s.length === 0) {
      instruments.push({
        id,
        name: s.name || `Sample ${id}`,
        type: "sample",
        synthType: "Sampler",
        effects: [],
        volume: -6,
        pan: 0
      });
      continue;
    }
    const pcmLen = Math.min(s.length, buf.length - off);
    if (pcmLen <= 0) {
      instruments.push({
        id,
        name: s.name || `Sample ${id}`,
        type: "sample",
        synthType: "Sampler",
        effects: [],
        volume: -6,
        pan: 0
      });
      continue;
    }
    const pcm = new Uint8Array(pcmLen);
    for (let j = 0; j < pcmLen; j++) pcm[j] = buf[off + j];
    off += s.length;
    const hasLoop = s.loopLength > 2;
    const loopEnd = hasLoop ? s.loopStart + s.loopLength : 0;
    const inst = createSamplerInstrument(id, s.name || `Sample ${id}`, pcm, s.volume, 8287, s.loopStart, loopEnd);
    instruments.push(inst);
  }
  return {
    name: songName || filename.replace(/\.[^/.]+$/, ""),
    format: "DIGI",
    patterns: trackerPatterns,
    instruments,
    songPositions,
    songLength,
    restartPosition: 0,
    numChannels,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    uadeEditableFileName: filename
  };
}
export {
  parseDigiBoosterFile
};
