import { c5 as registerVariableEncoder, dz as convertToInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const XM_NOTE_OFF$1 = 97;
const S3M_NOTE_OFF$1 = 254;
const S3M_NOTE_NONE$1 = 255;
function xmNoteToS3M(xmNote) {
  if (xmNote === XM_NOTE_OFF$1) return S3M_NOTE_OFF$1;
  if (xmNote <= 0) return S3M_NOTE_NONE$1;
  const semi = (xmNote - 1) % 12;
  const octave = Math.floor((xmNote - 1) / 12);
  return octave << 4 | semi;
}
function xmVolToS3M(xmVol) {
  if (xmVol >= 16 && xmVol <= 80) {
    return { hasVol: true, vol: xmVol - 16 };
  }
  return { hasVol: false, vol: 255 };
}
function reverseS3MEffect(effTyp, eff) {
  if (effTyp === 0 && eff === 0) return { cmd: 0, param: 0 };
  switch (effTyp) {
    case 0:
      return { cmd: 10, param: eff };
    // J: arpeggio
    case 1:
      return { cmd: 6, param: eff };
    // F: portamento up
    case 2:
      return { cmd: 5, param: eff };
    // E: portamento down
    case 3:
      return { cmd: 7, param: eff };
    // G: tone portamento
    case 4:
      return { cmd: 8, param: eff };
    // H: vibrato
    case 5:
      return { cmd: 12, param: eff };
    // L: tone porta + vol slide
    case 6:
      return { cmd: 11, param: eff };
    // K: vibrato + vol slide
    case 7:
      return { cmd: 18, param: eff };
    // R: tremolo
    case 8:
      return { cmd: 24, param: Math.min(127, eff >> 1) };
    // X: set pan 0-255 → 0-127
    case 9:
      return { cmd: 15, param: eff };
    // O: sample offset
    case 10:
      return { cmd: 4, param: eff };
    // D: volume slide
    case 11:
      return { cmd: 2, param: eff };
    // B: position jump
    case 13:
      return { cmd: 3, param: eff };
    // C: pattern break
    case 14: {
      const sub = eff >> 4 & 15;
      const val = eff & 15;
      switch (sub) {
        case 1:
          return { cmd: 6, param: 240 | val };
        // Fine porta up → FFx
        case 2:
          return { cmd: 5, param: 240 | val };
        // Fine porta dn → EFx
        case 3:
          return { cmd: 19, param: 48 | val };
        // S3x
        case 4:
          return { cmd: 19, param: 64 | val };
        // S4x
        case 5:
          return { cmd: 19, param: 80 | val };
        // S5x
        case 6:
          return { cmd: 19, param: 96 | val };
        // S6x
        case 8:
          return { cmd: 19, param: 128 | val };
        // S8x
        case 9:
          return { cmd: 17, param: val };
        // Q: retrig
        case 12:
          return { cmd: 19, param: 192 | val };
        // SCx
        case 13:
          return { cmd: 19, param: 208 | val };
        // SDx
        case 14:
          return { cmd: 19, param: 224 | val };
        // SEx
        default:
          return { cmd: 0, param: 0 };
      }
    }
    case 15: {
      if (eff < 32) return { cmd: 1, param: eff };
      return { cmd: 20, param: eff };
    }
    case 16:
      return { cmd: 22, param: eff };
    // V: global volume
    case 17:
      return { cmd: 23, param: eff };
    // W: global vol slide
    case 25:
      return { cmd: 25, param: eff };
    // Y: panbrello
    case 29:
      return { cmd: 9, param: eff };
    // I: tremor
    case 33: {
      const sub = eff >> 4 & 15;
      const val = eff & 15;
      if (sub === 1) return { cmd: 6, param: 224 | val };
      if (sub === 2) return { cmd: 5, param: 224 | val };
      return { cmd: 0, param: 0 };
    }
    default:
      return { cmd: 0, param: 0 };
  }
}
const s3mEncoder = {
  formatId: "s3m",
  encodePattern(rows, channel) {
    const buf = [];
    const ch = channel & 31;
    for (let row = 0; row < rows.length; row++) {
      const cell = rows[row];
      const note = cell.note ?? 0;
      const instr = cell.instrument ?? 0;
      const effTyp = cell.effTyp ?? 0;
      const eff = cell.eff ?? 0;
      const vol = cell.volume ?? 0;
      const hasNote = note !== 0 || instr !== 0;
      const { hasVol, vol: s3mVol } = xmVolToS3M(vol);
      const fx = reverseS3MEffect(effTyp, eff);
      const hasFx = fx.cmd !== 0 || fx.param !== 0;
      if (!hasNote && !hasVol && !hasFx) {
        buf.push(0);
        continue;
      }
      let flagByte = ch;
      if (hasNote) flagByte |= 32;
      if (hasVol) flagByte |= 64;
      if (hasFx) flagByte |= 128;
      buf.push(flagByte);
      if (hasNote) {
        buf.push(xmNoteToS3M(note));
        buf.push(instr & 255);
      }
      if (hasVol) {
        buf.push(s3mVol);
      }
      if (hasFx) {
        buf.push(fx.cmd & 255);
        buf.push(fx.param & 255);
      }
      buf.push(0);
    }
    return new Uint8Array(buf);
  }
};
registerVariableEncoder(s3mEncoder);
function u8(v, off) {
  return v.getUint8(off);
}
function u16le(v, off) {
  return v.getUint16(off, true);
}
function u32le(v, off) {
  return v.getUint32(off, true);
}
function readString(v, off, len) {
  let s = "";
  for (let i = 0; i < len; i++) {
    const c = v.getUint8(off + i);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}
const ROWS_PER_PATTERN = 64;
const S3M_NOTE_OFF = 254;
const S3M_NOTE_NONE = 255;
const XM_NOTE_OFF = 97;
function isS3MFormat(buffer) {
  const raw = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (raw.length < 96) return false;
  return raw[44] === 83 && // 'S'
  raw[45] === 67 && // 'C'
  raw[46] === 82 && // 'R'
  raw[47] === 77;
}
function countActiveChannels(v) {
  let highest = 0;
  for (let i = 0; i < 32; i++) {
    if (u8(v, 64 + i) !== 255) highest = i + 1;
  }
  return Math.max(highest, 1);
}
function extractPCM(raw, offset, byteLength, is16bit, isUnsigned) {
  const end = Math.min(offset + byteLength, raw.length);
  const actualLen = end - offset;
  if (!is16bit) {
    const buf = new ArrayBuffer(actualLen);
    const out = new Uint8Array(buf);
    for (let i = 0; i < actualLen; i++) {
      out[i] = isUnsigned ? raw[offset + i] ^ 128 : raw[offset + i];
    }
    return buf;
  } else {
    const numSamples = actualLen >> 1;
    const buf = new ArrayBuffer(numSamples * 2);
    const outView = new DataView(buf);
    for (let i = 0; i < numSamples; i++) {
      const byteOff = offset + i * 2;
      if (byteOff + 1 >= raw.length) break;
      if (isUnsigned) {
        const uval = raw[byteOff] | raw[byteOff + 1] << 8;
        outView.setInt16(i * 2, uval - 32768 & 65535, true);
      } else {
        outView.setInt16(i * 2, raw[byteOff] | raw[byteOff + 1] << 8, true);
      }
    }
    return buf;
  }
}
function makeEmptyInstrumentConfig(id, name) {
  return {
    id,
    name: name || `Sample ${id}`,
    type: "sample",
    synthType: "Sampler",
    effects: [],
    volume: -60,
    pan: 0
  };
}
function makeEmptyPattern(patIdx, numChannels, filename, maxPatIdx, smpNum) {
  const emptyCell = { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
  const channels = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: 0,
      instrumentId: null,
      color: null,
      rows: Array.from({ length: ROWS_PER_PATTERN }, () => ({ ...emptyCell }))
    });
  }
  return {
    id: `pattern-${patIdx}`,
    name: `Pattern ${patIdx}`,
    length: ROWS_PER_PATTERN,
    channels,
    importMetadata: {
      sourceFormat: "S3M",
      sourceFile: filename,
      importedAt: (/* @__PURE__ */ new Date()).toISOString(),
      originalChannelCount: numChannels,
      originalPatternCount: maxPatIdx + 1,
      originalInstrumentCount: smpNum
    }
  };
}
function mapS3MVolume(rawVol) {
  if (rawVol <= 64) return 16 + rawVol;
  return 0;
}
function mapS3MEffect(cmd, param) {
  switch (cmd) {
    case 0:
      return [0, 0];
    case 1:
      return [15, param];
    // A: set speed → Fxx
    case 2:
      return [11, param];
    // B: position jump
    case 3:
      return [13, param];
    // C: pattern break
    case 4:
      return [10, param];
    // D: volume slide
    case 5:
      if (param >= 240) return [14, 32 | param & 15];
      if (param >= 224) return [33, 32 | param & 15];
      return [2, param];
    case 6:
      if (param >= 240) return [14, 16 | param & 15];
      if (param >= 224) return [33, 16 | param & 15];
      return [1, param];
    case 7:
      return [3, param];
    // G: tone portamento
    case 8:
      return [4, param];
    // H: vibrato
    case 9:
      return [29, param];
    // I: tremor
    case 10:
      return [0, param];
    // J: arpeggio
    case 11:
      return [6, param];
    // K: vibrato + vol slide
    case 12:
      return [5, param];
    // L: tone porta + vol slide
    case 13:
      return [0, 0];
    // M: channel volume (no XM equiv)
    case 14:
      return [0, 0];
    // N: channel vol slide (no XM equiv)
    case 15:
      return [9, param];
    // O: sample offset
    case 16:
      return [0, 0];
    // P: panning slide (no XM effect equiv)
    case 17:
      return [14, 144 | param & 15];
    // Q: retrig → E9x
    case 18:
      return [7, param];
    // R: tremolo
    case 19: {
      const sub = param >> 4 & 15;
      const val = param & 15;
      switch (sub) {
        case 3:
          return [14, 48 | val];
        // S3x → E3x glissando
        case 4:
          return [14, 64 | val];
        // S4x → E4x vibrato waveform
        case 5:
          return [14, 80 | val];
        // S5x → E5x finetune
        case 6:
          return [14, 96 | val];
        // S6x → E6x pattern loop
        case 8:
          return [14, 128 | val];
        // S8x → E8x set panning (coarse)
        case 12:
          return [14, 192 | val];
        // SCx → ECx note cut
        case 13:
          return [14, 208 | val];
        // SDx → EDx note delay
        case 14:
          return [14, 224 | val];
        // SEx → EEx pattern delay
        default:
          return [0, 0];
      }
    }
    case 20:
      return param >= 32 ? [15, param] : [0, 0];
    case 21:
      return [4, param];
    // U: fine vibrato (approx as vibrato)
    case 22:
      return [16, param];
    // V: global volume
    case 23:
      return [17, param];
    // W: global vol slide
    case 24:
      return [8, Math.min(255, param << 1)];
    // X: set pan 0-127 → 0-255
    case 25:
      return [25, param];
    // Y: panbrello
    case 26:
      return [0, 0];
    // Z: MIDI (drop)
    default:
      return [0, 0];
  }
}
function decodeS3MPattern(rowData, numChannels) {
  const emptyCell = () => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
  const cells = Array.from(
    { length: ROWS_PER_PATTERN },
    () => Array.from({ length: numChannels }, emptyCell)
  );
  let pos = 0;
  let row = 0;
  while (row < ROWS_PER_PATTERN && pos < rowData.length) {
    const flagByte = rowData[pos++];
    if (flagByte === 0) {
      row++;
      continue;
    }
    const ch = flagByte & 31;
    let note = 0;
    let instrument = 0;
    let volume = 0;
    let effTyp = 0;
    let eff = 0;
    if (flagByte & 32) {
      const noteByte = rowData[pos++];
      instrument = rowData[pos++];
      if (noteByte === S3M_NOTE_OFF) {
        note = XM_NOTE_OFF;
      } else if (noteByte !== S3M_NOTE_NONE) {
        const octave = noteByte >> 4 & 15;
        const semitone = noteByte & 15;
        note = octave * 12 + semitone + 1;
      }
    }
    if (flagByte & 64) {
      volume = mapS3MVolume(rowData[pos++]);
    }
    if (flagByte & 128) {
      [effTyp, eff] = mapS3MEffect(rowData[pos++], rowData[pos++]);
    }
    if (ch < numChannels) {
      cells[row][ch] = { note, instrument, volume, effTyp, eff, effTyp2: 0, eff2: 0 };
    }
  }
  return cells;
}
function parseS3MFile(buffer, filename) {
  var _a;
  if (!isS3MFormat(buffer)) throw new Error("Not a valid S3M file");
  const v = new DataView(buffer);
  const raw = new Uint8Array(buffer);
  const songName = readString(v, 0, 28);
  const ordNum = u16le(v, 32);
  const smpNum = u16le(v, 34);
  const patNum = u16le(v, 36);
  const formatVersion = u16le(v, 42);
  const initialSpeed = u8(v, 49) || 6;
  const initialBPM = u8(v, 50) || 125;
  const numChannels = countActiveChannels(v);
  const isUnsigned = formatVersion === 2;
  let cursor = 96;
  const orders = [];
  for (let i = 0; i < ordNum; i++) {
    const val = u8(v, cursor + i);
    if (val === 255) break;
    if (val !== 254) orders.push(val);
  }
  cursor += ordNum;
  const sampleParapointers = [];
  for (let i = 0; i < smpNum; i++) {
    sampleParapointers.push(u16le(v, cursor + i * 2));
  }
  cursor += smpNum * 2;
  const patternParapointers = [];
  for (let i = 0; i < patNum; i++) {
    patternParapointers.push(u16le(v, cursor + i * 2));
  }
  const instruments = [];
  for (let si = 0; si < smpNum; si++) {
    const id = si + 1;
    const smpOff = sampleParapointers[si] * 16;
    if (smpOff === 0 || smpOff + 80 > buffer.byteLength) {
      instruments.push(makeEmptyInstrumentConfig(id, `Sample ${id}`));
      continue;
    }
    const sampleType = u8(v, smpOff);
    if (sampleType !== 1) {
      const name2 = readString(v, smpOff + 48, 28).replace(/\0/g, "").trim() || `Sample ${id}`;
      instruments.push(makeEmptyInstrumentConfig(id, name2));
      continue;
    }
    const dpHigh = u8(v, smpOff + 13);
    const dpLo = u8(v, smpOff + 14);
    const dpHi = u8(v, smpOff + 15);
    const dataPointer = (dpLo | dpHi << 8 | dpHigh << 16) * 16;
    const length = u32le(v, smpOff + 16);
    const loopStart = u32le(v, smpOff + 20);
    const loopEnd = u32le(v, smpOff + 24);
    const defaultVolume = Math.min(u8(v, smpOff + 28), 64);
    const pack = u8(v, smpOff + 30);
    const flags = u8(v, smpOff + 31);
    const c5speed = u32le(v, smpOff + 32);
    const sampleName = readString(v, smpOff + 48, 28);
    const name = sampleName.replace(/\0/g, "").trim() || `Sample ${id}`;
    if (pack === 1 || length === 0 || dataPointer === 0 || dataPointer >= buffer.byteLength) {
      instruments.push(makeEmptyInstrumentConfig(id, name));
      continue;
    }
    const is16bit = !!(flags & 4);
    const bytesPerSample = is16bit ? 2 : 1;
    const byteLength = length * bytesPerSample;
    const pcmData = extractPCM(raw, dataPointer, byteLength, is16bit, isUnsigned);
    const hasLoop = !!(flags & 1) && loopEnd > loopStart && loopEnd <= length;
    const loopLength = hasLoop ? loopEnd - loopStart : 0;
    const sample = {
      id,
      name,
      pcmData,
      bitDepth: is16bit ? 16 : 8,
      sampleRate: c5speed || 8363,
      length,
      loopStart: hasLoop ? loopStart : 0,
      loopLength,
      loopType: hasLoop ? "forward" : "none",
      volume: defaultVolume,
      finetune: 0,
      relativeNote: 0,
      panning: 128
    };
    const parsedInst = {
      id,
      name,
      samples: [sample],
      fadeout: 0
    };
    const converted = convertToInstrument(parsedInst, id, "S3M");
    if (converted.length > 0) {
      instruments.push(converted[0]);
    } else {
      instruments.push(makeEmptyInstrumentConfig(id, name));
    }
  }
  const patterns = [];
  const patIndexToArrayIdx = /* @__PURE__ */ new Map();
  const filePatternAddrs = [];
  const filePatternSizes = [];
  const referencedPats = new Set(orders);
  for (let i = 0; i < patNum; i++) referencedPats.add(i);
  const allPatIdxs = Array.from(referencedPats).sort((a, b) => a - b);
  const maxPatIdx = allPatIdxs.length > 0 ? allPatIdxs[allPatIdxs.length - 1] : 0;
  for (const patIdx of allPatIdxs) {
    if (patIdx >= patternParapointers.length || patternParapointers[patIdx] === 0) {
      patIndexToArrayIdx.set(patIdx, patterns.length);
      filePatternAddrs.push(0);
      filePatternSizes.push(0);
      patterns.push(makeEmptyPattern(patIdx, numChannels, filename, maxPatIdx, smpNum));
      continue;
    }
    const patOff = patternParapointers[patIdx] * 16;
    if (patOff + 2 > buffer.byteLength) {
      patIndexToArrayIdx.set(patIdx, patterns.length);
      filePatternAddrs.push(0);
      filePatternSizes.push(0);
      patterns.push(makeEmptyPattern(patIdx, numChannels, filename, maxPatIdx, smpNum));
      continue;
    }
    const packedLen = u16le(v, patOff);
    filePatternAddrs.push(patOff + 2);
    filePatternSizes.push(packedLen);
    const rowData = raw.subarray(patOff + 2, patOff + 2 + packedLen);
    const cells = decodeS3MPattern(rowData, numChannels);
    const channels = [];
    for (let ch = 0; ch < numChannels; ch++) {
      const rows = [];
      for (let row = 0; row < ROWS_PER_PATTERN; row++) {
        rows.push(((_a = cells[row]) == null ? void 0 : _a[ch]) ?? { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
      }
      channels.push({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: 0,
        instrumentId: null,
        color: null,
        rows
      });
    }
    patIndexToArrayIdx.set(patIdx, patterns.length);
    patterns.push({
      id: `pattern-${patIdx}`,
      name: `Pattern ${patIdx}`,
      length: ROWS_PER_PATTERN,
      channels,
      importMetadata: {
        sourceFormat: "S3M",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: numChannels,
        originalPatternCount: maxPatIdx + 1,
        originalInstrumentCount: smpNum
      }
    });
  }
  const songPositions = [];
  for (const patIdx of orders) {
    const arrIdx = patIndexToArrayIdx.get(patIdx);
    if (arrIdx !== void 0) songPositions.push(arrIdx);
  }
  if (songPositions.length === 0) songPositions.push(0);
  const trackMap = patterns.map((_, arrIdx) => {
    return Array.from({ length: numChannels }, () => arrIdx);
  });
  const uadeVariableLayout = {
    formatId: "s3m",
    numChannels,
    numFilePatterns: patterns.length,
    rowsPerPattern: ROWS_PER_PATTERN,
    moduleSize: buffer.byteLength,
    encoder: s3mEncoder,
    filePatternAddrs,
    filePatternSizes,
    trackMap
  };
  return {
    name: songName.replace(/\0/g, "").trim() || filename.replace(/\.[^/.]+$/, ""),
    format: "S3M",
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels,
    initialSpeed,
    initialBPM,
    linearPeriods: false,
    uadeVariableLayout
  };
}
export {
  isS3MFormat,
  parseS3MFile
};
