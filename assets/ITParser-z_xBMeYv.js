import { c5 as registerVariableEncoder, dz as convertToInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const XM_NOTE_OFF$1 = 97;
const IT_NOTE_CUT$1 = 254;
const IT_NOTE_NONE$1 = 255;
function xmNoteToIT(xmNote) {
  if (xmNote === XM_NOTE_OFF$1) return IT_NOTE_CUT$1;
  if (xmNote <= 0) return IT_NOTE_NONE$1;
  return xmNote - 1;
}
function xmVolToIT(xmVol) {
  if (xmVol === 0) return { hasVol: false, vol: 0 };
  if (xmVol >= 16 && xmVol <= 80) return { hasVol: true, vol: xmVol - 16 };
  if (xmVol >= 96 && xmVol <= 105) return { hasVol: true, vol: 95 + (xmVol & 15) };
  if (xmVol >= 112 && xmVol <= 121) return { hasVol: true, vol: 85 + (xmVol & 15) };
  if (xmVol >= 128 && xmVol <= 137) return { hasVol: true, vol: 75 + (xmVol & 15) };
  if (xmVol >= 144 && xmVol <= 153) return { hasVol: true, vol: 65 + (xmVol & 15) };
  if (xmVol >= 160 && xmVol <= 169) return { hasVol: true, vol: 193 + (xmVol & 15) };
  if (xmVol >= 176 && xmVol <= 185) return { hasVol: true, vol: 203 + (xmVol & 15) };
  if (xmVol >= 192 && xmVol <= 207) {
    return { hasVol: true, vol: 128 + Math.round((xmVol & 15) * 64 / 15) };
  }
  return { hasVol: false, vol: 0 };
}
function reverseITEffect(effTyp, eff) {
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
    // X: set pan
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
        case 2:
          return { cmd: 5, param: 240 | val };
        case 3:
          return { cmd: 19, param: 48 | val };
        case 4:
          return { cmd: 19, param: 64 | val };
        case 5:
          return { cmd: 19, param: 80 | val };
        case 6:
          return { cmd: 19, param: 96 | val };
        case 8:
          return { cmd: 19, param: 128 | val };
        case 9:
          return { cmd: 17, param: val };
        case 12:
          return { cmd: 19, param: 192 | val };
        case 13:
          return { cmd: 19, param: 208 | val };
        case 14:
          return { cmd: 19, param: 224 | val };
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
    case 17:
      return { cmd: 23, param: eff };
    case 25:
      return { cmd: 25, param: eff };
    case 29:
      return { cmd: 9, param: eff };
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
const itEncoder = {
  formatId: "it",
  encodePattern(rows, channel) {
    const buf = [];
    const ch = channel & 63;
    for (let row = 0; row < rows.length; row++) {
      const cell = rows[row];
      const note = cell.note ?? 0;
      const instr = cell.instrument ?? 0;
      const vol = cell.volume ?? 0;
      const effTyp = cell.effTyp ?? 0;
      const eff = cell.eff ?? 0;
      const hasNote = note !== 0;
      const hasInstr = instr !== 0;
      const { hasVol, vol: itVol } = xmVolToIT(vol);
      const fx = reverseITEffect(effTyp, eff);
      const hasFx = fx.cmd !== 0 || fx.param !== 0;
      if (!hasNote && !hasInstr && !hasVol && !hasFx) {
        buf.push(0);
        continue;
      }
      const channelByte = ch + 1 & 127 | 128;
      buf.push(channelByte);
      let mask = 0;
      if (hasNote) mask |= 1;
      if (hasInstr) mask |= 2;
      if (hasVol) mask |= 4;
      if (hasFx) mask |= 8;
      buf.push(mask);
      if (hasNote) buf.push(xmNoteToIT(note));
      if (hasInstr) buf.push(instr & 255);
      if (hasVol) buf.push(itVol & 255);
      if (hasFx) {
        buf.push(fx.cmd & 255);
        buf.push(fx.param & 255);
      }
      buf.push(0);
    }
    return new Uint8Array(buf);
  }
};
registerVariableEncoder(itEncoder);
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
const IT_NOTE_FADE = 120;
const IT_NOTE_CUT = 254;
const IT_NOTE_NONE = 255;
const XM_NOTE_OFF = 97;
function isITFormat(buffer) {
  const raw = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (raw.length < 192) return false;
  return raw[0] === 73 && // 'I'
  raw[1] === 77 && // 'M'
  raw[2] === 80 && // 'P'
  raw[3] === 77;
}
function decompressITSamples(src, destLen, is16bit) {
  const out = new ArrayBuffer(destLen * (is16bit ? 2 : 1));
  const outI8 = new Int8Array(out);
  const outI16 = new Int16Array(out);
  let srcPos = 0;
  let destPos = 0;
  let blockBits = 0;
  let bitBuf = 0;
  let blockBytes = null;
  let blockPos = 0;
  function readBit() {
    if (blockBits === 0) return 0;
    const bit = bitBuf & 1;
    bitBuf >>= 1;
    blockBits--;
    if (blockBits === 0 && blockPos < ((blockBytes == null ? void 0 : blockBytes.length) ?? 0)) {
      bitBuf = blockBytes[blockPos++];
      blockBits = 8;
    }
    return bit;
  }
  function readBits(n) {
    let val = 0;
    for (let i = 0; i < n; i++) {
      val |= readBit() << i;
    }
    return val;
  }
  while (srcPos + 2 <= src.length && destPos < destLen) {
    const blockSize = src[srcPos] | src[srcPos + 1] << 8;
    srcPos += 2;
    if (srcPos + blockSize > src.length) break;
    blockBytes = src.subarray(srcPos, srcPos + blockSize);
    srcPos += blockSize;
    blockPos = 0;
    bitBuf = blockBytes.length > 0 ? blockBytes[blockPos++] : 0;
    blockBits = blockBytes.length > 0 ? 8 : 0;
    if (!is16bit) {
      let width = 9;
      let accum = 0;
      while (destPos < destLen) {
        const raw = readBits(width);
        if (width < 7) {
          const limit = (1 << width) - 1;
          if (raw === limit) {
            width++;
            continue;
          }
          const delta = raw - ((1 << width - 1) - 1);
          accum = (accum + delta & 255) << 24 >> 24;
          outI8[destPos++] = accum;
        } else if (width < 9) {
          const hi = 1 << width - 1;
          if (raw === hi + 1) {
            const newWidth = raw & 255;
            width = newWidth === 0 ? 1 : Math.min(newWidth, 9);
            continue;
          } else if (raw === hi) {
            width++;
            continue;
          } else {
            const delta = raw < hi ? raw : raw - (hi << 1);
            accum = (accum + delta & 255) << 24 >> 24;
            outI8[destPos++] = accum;
          }
        } else {
          if (raw < 256) {
            accum = (raw & 255) << 24 >> 24;
            outI8[destPos++] = accum;
          } else {
            const inner = raw >> 1 & 255;
            if (inner) {
              width = inner + 1;
            } else {
              width++;
            }
          }
        }
      }
    } else {
      let width = 17;
      let accum = 0;
      while (destPos < destLen) {
        const raw = readBits(width);
        if (width < 7) {
          const limit = (1 << width) - 1;
          if (raw === limit) {
            width++;
            continue;
          }
          const delta = raw - ((1 << width - 1) - 1);
          accum = (accum + delta & 65535) << 16 >> 16;
          outI16[destPos++] = accum;
        } else if (width < 17) {
          const hi = 1 << width - 1;
          if (raw === hi + 1) {
            const newWidth = raw & 255;
            width = newWidth === 0 ? 1 : Math.min(newWidth, 17);
            continue;
          } else if (raw === hi) {
            width++;
            continue;
          } else {
            const delta = raw < hi ? raw : raw - (hi << 1);
            accum = (accum + delta & 65535) << 16 >> 16;
            outI16[destPos++] = accum;
          }
        } else {
          if (raw < 65536) {
            accum = (raw & 65535) << 16 >> 16;
            outI16[destPos++] = accum;
          } else {
            const inner = raw >> 1 & 255;
            if (inner) {
              width = inner + 1;
            } else {
              width++;
            }
          }
        }
      }
    }
  }
  return out;
}
function readEnvelope(v, off) {
  const flags = u8(v, off);
  const num = u8(v, off + 1);
  const lpb = u8(v, off + 2);
  const lpe = u8(v, off + 3);
  const slb = u8(v, off + 4);
  if (!(flags & 1) || num === 0) return void 0;
  const points = [];
  for (let i = 0; i < num && i < 25; i++) {
    const nodeOff = off + 6 + i * 3;
    const value = u8(v, nodeOff);
    const tick = u16le(v, nodeOff + 1);
    points.push({ tick, value });
  }
  return {
    enabled: true,
    points,
    sustainPoint: flags & 4 ? slb : null,
    loopStartPoint: flags & 2 ? lpb : null,
    loopEndPoint: flags & 2 ? lpe : null
  };
}
function readITSample(v, raw, smpOff, id) {
  if (smpOff + 80 > v.byteLength) return null;
  if (u8(v, smpOff) !== 73 || u8(v, smpOff + 1) !== 77 || u8(v, smpOff + 2) !== 80 || u8(v, smpOff + 3) !== 83) {
    return null;
  }
  const flags = u8(v, smpOff + 18);
  const vol = Math.min(u8(v, smpOff + 19), 64);
  const sampleName = readString(v, smpOff + 20, 26);
  const name = sampleName.replace(/\0/g, "").trim() || `Sample ${id}`;
  const cvt = u8(v, smpOff + 46);
  const dfp = u8(v, smpOff + 47);
  const length = u32le(v, smpOff + 48);
  const loopbegin = u32le(v, smpOff + 52);
  const loopend = u32le(v, smpOff + 56);
  const c5speed = u32le(v, smpOff + 60);
  const samplepointer = u32le(v, smpOff + 72);
  if (!(flags & 1) || length === 0 || samplepointer === 0 || samplepointer >= v.byteLength) {
    return null;
  }
  const is16bit = !!(flags & 2);
  const compressed = !!(flags & 8);
  const isUnsigned = !(cvt & 1);
  let pcmData;
  if (compressed) {
    const compressedBytes = raw.subarray(samplepointer);
    pcmData = decompressITSamples(compressedBytes, length, is16bit);
    if (isUnsigned) {
      if (!is16bit) {
        const bytes = new Uint8Array(pcmData);
        for (let i = 0; i < bytes.length; i++) bytes[i] ^= 128;
      } else {
        const shorts = new Int16Array(pcmData);
        for (let i = 0; i < shorts.length; i++) shorts[i] = shorts[i] + 32768 & 65535;
      }
    }
  } else {
    const bytesPerSample = is16bit ? 2 : 1;
    const byteLength = length * bytesPerSample;
    const end = Math.min(samplepointer + byteLength, raw.length);
    const actualLen = end - samplepointer;
    if (!is16bit) {
      const buf = new ArrayBuffer(actualLen);
      const out = new Uint8Array(buf);
      for (let i = 0; i < actualLen; i++) {
        out[i] = isUnsigned ? raw[samplepointer + i] ^ 128 : raw[samplepointer + i];
      }
      pcmData = buf;
    } else {
      const numSamples = actualLen >> 1;
      const buf = new ArrayBuffer(numSamples * 2);
      const outView = new DataView(buf);
      for (let i = 0; i < numSamples; i++) {
        const bOff = samplepointer + i * 2;
        if (bOff + 1 >= raw.length) break;
        if (isUnsigned) {
          const uval = raw[bOff] | raw[bOff + 1] << 8;
          outView.setInt16(i * 2, uval - 32768 & 65535, true);
        } else {
          outView.setInt16(i * 2, raw[bOff] | raw[bOff + 1] << 8, true);
        }
      }
      pcmData = buf;
    }
  }
  const hasLoop = !!(flags & 16) && loopend > loopbegin;
  const hasPingpong = !!(flags & 64);
  const loopLength = hasLoop ? loopend - loopbegin : 0;
  const panning = dfp & 128 ? Math.min((dfp & 127) * 4, 255) : 128;
  return {
    id,
    name,
    pcmData,
    bitDepth: is16bit ? 16 : 8,
    sampleRate: c5speed || 8363,
    length,
    loopStart: hasLoop ? loopbegin : 0,
    loopLength,
    loopType: !hasLoop ? "none" : hasPingpong ? "pingpong" : "forward",
    volume: vol,
    finetune: 0,
    relativeNote: 0,
    panning
  };
}
function mapITVolume(rawVol) {
  if (rawVol <= 64) return 16 + rawVol;
  if (rawVol <= 74) return 144 | rawVol - 65;
  if (rawVol <= 84) return 128 | rawVol - 75;
  if (rawVol <= 94) return 112 | rawVol - 85;
  if (rawVol <= 104) return 96 | rawVol - 95;
  if (rawVol >= 128 && rawVol <= 192) return 192 | Math.round((rawVol - 128) * 15 / 64);
  if (rawVol >= 193 && rawVol <= 202) return 160 | rawVol - 193;
  if (rawVol >= 203 && rawVol <= 212) return 176 | rawVol - 203;
  return 0;
}
function mapITEffect(cmd, param) {
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
    // P: set envelope position (no XM equiv)
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
function decodeITPattern(rowData, numRows, numChannels) {
  const emptyCell = () => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
  const cells = Array.from(
    { length: numRows },
    () => Array.from({ length: numChannels }, emptyCell)
  );
  const lastMask = new Uint8Array(64);
  const lastNote = new Uint8Array(64);
  const lastInst = new Uint8Array(64);
  const lastVol = new Uint8Array(64);
  const lastEffTyp = new Uint8Array(64);
  const lastEff = new Uint8Array(64);
  let pos = 0;
  let row = 0;
  while (row < numRows && pos < rowData.length) {
    const channelByte = rowData[pos++];
    if (channelByte === 0) {
      row++;
      continue;
    }
    const ch = channelByte - 1 & 63;
    let mask;
    if (channelByte & 128) {
      mask = rowData[pos++];
      lastMask[ch] = mask;
    } else {
      mask = lastMask[ch];
    }
    let note = 0;
    let instrument = 0;
    let volume = 0;
    let effTyp = 0;
    let eff = 0;
    if (mask & 1) {
      const noteByte = rowData[pos++];
      lastNote[ch] = noteByte;
      if (noteByte === IT_NOTE_CUT) {
        note = XM_NOTE_OFF;
      } else if (noteByte !== IT_NOTE_NONE && noteByte !== IT_NOTE_FADE) {
        note = noteByte + 1;
      }
    }
    if (mask & 2) {
      instrument = rowData[pos++];
      lastInst[ch] = instrument;
    }
    if (mask & 4) {
      volume = mapITVolume(rowData[pos++]);
      lastVol[ch] = volume;
    }
    if (mask & 8) {
      [effTyp, eff] = mapITEffect(rowData[pos++], rowData[pos++]);
      lastEffTyp[ch] = effTyp;
      lastEff[ch] = eff;
    }
    if (mask & 16) {
      const noteByte = lastNote[ch];
      if (noteByte === IT_NOTE_CUT) {
        note = XM_NOTE_OFF;
      } else if (noteByte !== IT_NOTE_NONE && noteByte !== IT_NOTE_FADE) {
        note = noteByte + 1;
      }
    }
    if (mask & 32) {
      instrument = lastInst[ch];
    }
    if (mask & 64) {
      volume = lastVol[ch];
    }
    if (mask & 128) {
      effTyp = lastEffTyp[ch];
      eff = lastEff[ch];
    }
    if (ch < numChannels) {
      cells[row][ch] = { note, instrument, volume, effTyp, eff, effTyp2: 0, eff2: 0 };
    }
  }
  return cells;
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
      sourceFormat: "IT",
      sourceFile: filename,
      importedAt: (/* @__PURE__ */ new Date()).toISOString(),
      originalChannelCount: numChannels,
      originalPatternCount: maxPatIdx + 1,
      originalInstrumentCount: smpNum
    }
  };
}
function countITChannels(v) {
  let highest = 0;
  for (let i = 0; i < 64; i++) {
    if (u8(v, 64 + i) < 128) highest = i + 1;
  }
  return Math.max(highest, 1);
}
function parseITFile(buffer, filename) {
  var _a;
  if (!isITFormat(buffer)) throw new Error("Not a valid IT file");
  const v = new DataView(buffer);
  const raw = new Uint8Array(buffer);
  const songName = readString(v, 4, 26);
  const ordNum = u16le(v, 32);
  const insNum = u16le(v, 34);
  const smpNum = u16le(v, 36);
  const patNum = u16le(v, 38);
  const cmwt = u16le(v, 42);
  const flags = u16le(v, 44);
  const speed = u8(v, 50) || 6;
  const tempo = u8(v, 51) || 125;
  const linearPeriods = !!(flags & 8);
  const useInstruments = !!(flags & 4) && cmwt >= 512 && insNum > 0;
  const numChannels = countITChannels(v);
  let cursor = 192;
  const orders = [];
  for (let i = 0; i < ordNum; i++) {
    const val = u8(v, cursor + i);
    if (val === 255) break;
    if (val !== 254) orders.push(val);
  }
  cursor += ordNum;
  const instOffsets = [];
  for (let i = 0; i < insNum; i++) {
    instOffsets.push(u32le(v, cursor + i * 4));
  }
  cursor += insNum * 4;
  const sampleOffsets = [];
  for (let i = 0; i < smpNum; i++) {
    sampleOffsets.push(u32le(v, cursor + i * 4));
  }
  cursor += smpNum * 4;
  const patternOffsets = [];
  for (let i = 0; i < patNum; i++) {
    patternOffsets.push(u32le(v, cursor + i * 4));
  }
  const parsedSamples = sampleOffsets.map(
    (off, si) => readITSample(v, raw, off, si + 1)
  );
  const instruments = [];
  if (useInstruments) {
    for (let ii = 0; ii < insNum; ii++) {
      const id = ii + 1;
      const insOff = instOffsets[ii];
      if (insOff === 0 || insOff + 554 > buffer.byteLength) {
        instruments.push(makeEmptyInstrumentConfig(id, `Instrument ${id}`));
        continue;
      }
      if (u8(v, insOff) !== 73 || u8(v, insOff + 1) !== 77 || u8(v, insOff + 2) !== 80 || u8(v, insOff + 3) !== 73) {
        instruments.push(makeEmptyInstrumentConfig(id, `Instrument ${id}`));
        continue;
      }
      const insName = readString(v, insOff + 32, 26).replace(/\0/g, "").trim() || `Instrument ${id}`;
      const fadeout = u16le(v, insOff + 20);
      const volEnv = readEnvelope(v, insOff + 304);
      const panEnv = readEnvelope(v, insOff + 386);
      const sampleIndices = /* @__PURE__ */ new Set();
      for (let n = 0; n < 120; n++) {
        const smpIdx1 = u8(v, insOff + 64 + 120 + n);
        if (smpIdx1 > 0 && smpIdx1 <= smpNum) sampleIndices.add(smpIdx1 - 1);
      }
      const sampleMap = new Array(96).fill(0);
      const sampleList = [];
      const sampleIdxToListIdx = /* @__PURE__ */ new Map();
      for (const smpIdx of Array.from(sampleIndices).sort((a, b) => a - b)) {
        const ps = parsedSamples[smpIdx];
        if (ps) {
          sampleIdxToListIdx.set(smpIdx, sampleList.length);
          sampleList.push({ ...ps, id: sampleList.length + 1 });
        }
      }
      for (let n = 0; n < 96; n++) {
        const smpIdx1 = u8(v, insOff + 64 + 120 + n);
        if (smpIdx1 > 0) {
          const listIdx = sampleIdxToListIdx.get(smpIdx1 - 1);
          if (listIdx !== void 0) sampleMap[n] = listIdx;
        }
      }
      if (sampleList.length === 0) {
        instruments.push(makeEmptyInstrumentConfig(id, insName));
        continue;
      }
      const parsedInst = {
        id,
        name: insName,
        samples: sampleList,
        volumeEnvelope: volEnv,
        panningEnvelope: panEnv,
        sampleMap,
        fadeout,
        volumeType: (volEnv == null ? void 0 : volEnv.enabled) ? "envelope" : "none",
        panningType: (panEnv == null ? void 0 : panEnv.enabled) ? "envelope" : "none"
      };
      const converted = convertToInstrument(parsedInst, id, "IT");
      if (converted.length > 0) {
        instruments.push(converted[0]);
      } else {
        instruments.push(makeEmptyInstrumentConfig(id, insName));
      }
    }
  } else {
    for (let si = 0; si < smpNum; si++) {
      const id = si + 1;
      const ps = parsedSamples[si];
      if (!ps) {
        const name = `Sample ${id}`;
        instruments.push(makeEmptyInstrumentConfig(id, name));
        continue;
      }
      const parsedInst = {
        id,
        name: ps.name,
        samples: [ps],
        fadeout: 0
      };
      const converted = convertToInstrument(parsedInst, id, "IT");
      if (converted.length > 0) {
        instruments.push(converted[0]);
      } else {
        instruments.push(makeEmptyInstrumentConfig(id, ps.name));
      }
    }
  }
  const patterns = [];
  const patIndexToArrayIdx = /* @__PURE__ */ new Map();
  const filePatternAddrs = [];
  const filePatternSizes = [];
  const rowsPerPatternArr = [];
  const referencedPats = new Set(orders);
  for (let i = 0; i < patNum; i++) referencedPats.add(i);
  const allPatIdxs = Array.from(referencedPats).sort((a, b) => a - b);
  const maxPatIdx = allPatIdxs.length > 0 ? allPatIdxs[allPatIdxs.length - 1] : 0;
  const numInst = useInstruments ? insNum : smpNum;
  for (const patIdx of allPatIdxs) {
    if (patIdx >= patternOffsets.length || patternOffsets[patIdx] === 0) {
      patIndexToArrayIdx.set(patIdx, patterns.length);
      filePatternAddrs.push(0);
      filePatternSizes.push(0);
      rowsPerPatternArr.push(ROWS_PER_PATTERN);
      patterns.push(makeEmptyPattern(patIdx, numChannels, filename, maxPatIdx, numInst));
      continue;
    }
    const patOff = patternOffsets[patIdx];
    if (patOff + 8 > buffer.byteLength) {
      patIndexToArrayIdx.set(patIdx, patterns.length);
      filePatternAddrs.push(0);
      filePatternSizes.push(0);
      rowsPerPatternArr.push(ROWS_PER_PATTERN);
      patterns.push(makeEmptyPattern(patIdx, numChannels, filename, maxPatIdx, numInst));
      continue;
    }
    const packedLen = u16le(v, patOff);
    const numRows = u16le(v, patOff + 2) || ROWS_PER_PATTERN;
    filePatternAddrs.push(patOff + 8);
    filePatternSizes.push(packedLen);
    rowsPerPatternArr.push(numRows);
    const rowData = raw.subarray(patOff + 8, patOff + 8 + packedLen);
    const cells = decodeITPattern(rowData, numRows, numChannels);
    const channels = [];
    for (let ch = 0; ch < numChannels; ch++) {
      const rows = [];
      for (let row = 0; row < numRows; row++) {
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
      length: numRows,
      channels,
      importMetadata: {
        sourceFormat: "IT",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: numChannels,
        originalPatternCount: maxPatIdx + 1,
        originalInstrumentCount: numInst
      }
    });
  }
  const songPositions = [];
  for (const patIdx of orders) {
    const arrIdx = patIndexToArrayIdx.get(patIdx);
    if (arrIdx !== void 0) songPositions.push(arrIdx);
  }
  if (songPositions.length === 0) songPositions.push(0);
  const trackMap = patterns.map(
    (_, arrIdx) => Array.from({ length: numChannels }, () => arrIdx)
  );
  const uadeVariableLayout = {
    formatId: "it",
    numChannels,
    numFilePatterns: patterns.length,
    rowsPerPattern: rowsPerPatternArr,
    moduleSize: buffer.byteLength,
    encoder: itEncoder,
    filePatternAddrs,
    filePatternSizes,
    trackMap
  };
  return {
    name: songName.replace(/\0/g, "").trim() || filename.replace(/\.[^/.]+$/, ""),
    format: "IT",
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels,
    initialSpeed: speed,
    initialBPM: tempo,
    linearPeriods,
    uadeVariableLayout
  };
}
export {
  isITFormat,
  parseITFile
};
