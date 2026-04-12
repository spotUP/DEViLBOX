import { b$ as registerPatternEncoder, bR as arrayBufferToBase64 } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const CMD_KEYON$1 = 0;
const CMD_VOLSLIDE_UP$1 = 1;
const CMD_VOLSLIDE_DOWN$1 = 2;
const CMD_PITCH_UP$1 = 3;
const CMD_PITCH_DOWN$1 = 4;
const CMD_REPLAY_FROM$1 = 5;
const CMD_SET_SPEED$1 = 9;
const CMD_TREMOLO$1 = 12;
const CMD_VIBRATO$1 = 13;
const CMD_ADD_HALFTONE$1 = 18;
function encodeSymphonieProCell(cell) {
  const out = new Uint8Array(4);
  const xmNote = cell.note ?? 0;
  const xmInstr = cell.instrument ?? 0;
  const xmVol = cell.volume ?? 0;
  const effTyp = cell.effTyp ?? 0;
  const eff = cell.eff ?? 0;
  if (xmNote === 0 && effTyp !== 0) {
    switch (effTyp) {
      case 15:
        out[0] = CMD_SET_SPEED$1;
        out[1] = 0;
        out[2] = eff > 0 ? eff : 4;
        out[3] = 0;
        return out;
      case 10: {
        const upVal = eff >> 4 & 15;
        const downVal = eff & 15;
        if (upVal > 0) {
          out[0] = CMD_VOLSLIDE_UP$1;
          out[2] = upVal;
        } else {
          out[0] = CMD_VOLSLIDE_DOWN$1;
          out[2] = downVal;
        }
        out[1] = 0;
        out[3] = 0;
        return out;
      }
      case 1:
        out[0] = CMD_PITCH_UP$1;
        out[1] = 0;
        out[2] = eff & 255;
        out[3] = 0;
        return out;
      case 2:
        out[0] = CMD_PITCH_DOWN$1;
        out[1] = 0;
        out[2] = eff & 255;
        out[3] = 0;
        return out;
      case 4:
        out[0] = CMD_VIBRATO$1;
        out[1] = 0;
        out[2] = eff & 15;
        out[3] = (eff >> 4 & 15) << 3;
        return out;
      case 7:
        out[0] = CMD_TREMOLO$1;
        out[1] = 0;
        out[2] = (eff & 15) << 3 & 255;
        out[3] = (eff >> 4 & 15) << 3 & 255;
        return out;
      case 9:
        out[0] = CMD_REPLAY_FROM$1;
        out[1] = 0;
        out[2] = eff & 255;
        out[3] = 0;
        return out;
      case 3:
        out[0] = CMD_ADD_HALFTONE$1;
        out[1] = 0;
        out[2] = 0;
        out[3] = 0;
        return out;
      default:
        return out;
    }
  }
  out[0] = CMD_KEYON$1;
  if (xmNote > 0 && xmNote <= 119) {
    const symNote = xmNote - 25;
    out[1] = symNote < 0 ? symNote + 256 & 255 : symNote & 255;
  } else {
    out[1] = 255 & 255;
  }
  if (xmVol > 0 && xmVol <= 64) {
    out[2] = Math.min(100, Math.round(xmVol / 0.64));
  } else {
    out[2] = 0;
  }
  if (xmInstr > 0) {
    out[3] = xmInstr - 1 & 255;
  } else {
    out[3] = 0;
  }
  return out;
}
registerPatternEncoder("symphoniePro", () => encodeSymphonieProCell);
class Reader {
  pos;
  data;
  view;
  constructor(data, offset = 0) {
    this.data = data;
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    this.pos = offset;
  }
  get length() {
    return this.data.length;
  }
  get remaining() {
    return this.data.length - this.pos;
  }
  canRead(n) {
    return this.pos + n <= this.data.length;
  }
  u8() {
    if (this.pos >= this.data.length) throw new Error("EOF");
    return this.data[this.pos++];
  }
  s8() {
    const v = this.u8();
    return v >= 128 ? v - 256 : v;
  }
  u16be() {
    if (!this.canRead(2)) throw new Error("EOF");
    const v = this.view.getUint16(this.pos, false);
    this.pos += 2;
    return v;
  }
  s16be() {
    if (!this.canRead(2)) throw new Error("EOF");
    const v = this.view.getInt16(this.pos, false);
    this.pos += 2;
    return v;
  }
  u32be() {
    if (!this.canRead(4)) throw new Error("EOF");
    const v = this.view.getUint32(this.pos, false);
    this.pos += 4;
    return v;
  }
  s32be() {
    if (!this.canRead(4)) throw new Error("EOF");
    const v = this.view.getInt32(this.pos, false);
    this.pos += 4;
    return v;
  }
  bytes(n) {
    if (!this.canRead(n)) throw new Error("EOF");
    const slice = this.data.slice(this.pos, this.pos + n);
    this.pos += n;
    return slice;
  }
  skip(n) {
    this.pos = Math.min(this.pos + n, this.data.length);
  }
  readMagic(magic) {
    if (!this.canRead(magic.length)) return false;
    for (let i = 0; i < magic.length; i++) {
      if (this.data[this.pos + i] !== magic.charCodeAt(i)) return false;
    }
    this.pos += magic.length;
    return true;
  }
  peekMagic(magic) {
    if (!this.canRead(magic.length)) return false;
    for (let i = 0; i < magic.length; i++) {
      if (this.data[this.pos + i] !== magic.charCodeAt(i)) return false;
    }
    return true;
  }
}
function decodeSymChunk(r) {
  if (!r.canRead(4)) return new Uint8Array(0);
  const packedLength = r.u32be();
  if (packedLength === 0 || !r.canRead(packedLength)) {
    r.skip(r.remaining);
    return new Uint8Array(0);
  }
  const chunkStart = r.pos;
  const chunkEnd = chunkStart + packedLength;
  if (packedLength >= 10 && r.peekMagic("PACK")) {
    r.skip(4);
    if (r.u8() !== 255 || r.u8() !== 255) {
      r.pos = chunkStart;
      const raw = r.bytes(packedLength);
      return raw;
    }
    const unpackedLength = r.u32be();
    const maxLength = Math.min(unpackedLength, packedLength * 170);
    const data = new Uint8Array(maxLength);
    let offset = 0;
    let remain = maxLength;
    let done = false;
    while (!done && r.pos < chunkEnd && remain > 0) {
      const type = r.s8();
      switch (type) {
        case 0: {
          if (!r.canRead(1)) {
            done = true;
            break;
          }
          const len = r.u8();
          if (remain < len || !r.canRead(len)) {
            done = true;
            break;
          }
          for (let i = 0; i < len; i++) {
            data[offset++] = r.u8();
          }
          remain -= len;
          break;
        }
        case 1: {
          if (!r.canRead(1)) {
            done = true;
            break;
          }
          const len = r.u8();
          if (remain < len * 4 || !r.canRead(4)) {
            done = true;
            break;
          }
          const b0 = r.u8(), b1 = r.u8(), b2 = r.u8(), b3 = r.u8();
          for (let i = 0; i < len && remain >= 4; i++) {
            data[offset++] = b0;
            data[offset++] = b1;
            data[offset++] = b2;
            data[offset++] = b3;
            remain -= 4;
          }
          break;
        }
        case 2: {
          if (remain < 8 || !r.canRead(4)) {
            done = true;
            break;
          }
          const b0 = r.u8(), b1 = r.u8(), b2 = r.u8(), b3 = r.u8();
          data[offset++] = b0;
          data[offset++] = b1;
          data[offset++] = b2;
          data[offset++] = b3;
          data[offset++] = b0;
          data[offset++] = b1;
          data[offset++] = b2;
          data[offset++] = b3;
          remain -= 8;
          break;
        }
        case 3: {
          if (!r.canRead(1)) {
            done = true;
            break;
          }
          const len = r.u8();
          if (remain < len) {
            done = true;
            break;
          }
          offset += len;
          remain -= len;
          break;
        }
        case -1:
          done = true;
          break;
        default:
          done = true;
          break;
      }
    }
    r.pos = chunkEnd;
    if (remain > 0) return new Uint8Array(0);
    return data;
  } else {
    const raw = r.bytes(packedLength);
    return raw;
  }
}
function decodeSymArray(r) {
  return decodeSymChunk(r);
}
function readAmigaString(data, offset, maxLen) {
  let s = "";
  for (let i = 0; i < maxLen; i++) {
    const c = data[offset + i];
    if (c === 0) break;
    s += c >= 32 && c < 128 ? String.fromCharCode(c) : c >= 160 ? String.fromCharCode(c) : " ";
  }
  return s.trimEnd();
}
function readSymEvents(data) {
  const count = Math.floor(data.length / 4);
  const events = [];
  for (let i = 0; i < count; i++) {
    const base = i * 4;
    const command = data[base];
    const note = data[base + 1] >= 128 ? data[base + 1] - 256 : data[base + 1];
    events.push({
      command,
      note,
      param: data[base + 2],
      inst: data[base + 3]
    });
  }
  return events;
}
function readSymSequences(data) {
  const count = Math.floor(data.length / 16);
  const seqs = [];
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let i = 0; i < count; i++) {
    const base = i * 16;
    seqs.push({
      start: view.getUint16(base, false),
      length: view.getUint16(base + 2, false),
      loop: view.getUint16(base + 4, false),
      info: view.getInt16(base + 6, false),
      transpose: view.getInt16(base + 8, false)
    });
  }
  return seqs;
}
function readSymPositions(data) {
  const count = Math.floor(data.length / 32);
  const positions = [];
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let i = 0; i < count; i++) {
    const base = i * 32;
    positions.push({
      loopNum: view.getUint16(base + 4, false),
      pattern: view.getUint16(base + 8, false),
      start: view.getUint16(base + 10, false),
      length: view.getUint16(base + 12, false),
      speed: view.getUint16(base + 14, false),
      transpose: view.getInt16(base + 16, false)
    });
  }
  return positions;
}
function readSymInstruments(data) {
  const INST_SIZE = 256;
  const count = Math.floor(data.length / INST_SIZE);
  const insts = [];
  for (let i = 0; i < count; i++) {
    const base = i * INST_SIZE;
    const nameOrHeader = data.slice(base, base + 128);
    const type = data[base + 128] >= 128 ? data[base + 128] - 256 : data[base + 128];
    const volume = data[base + 134];
    const channel = data[base + 132];
    const instFlags = data[base + 142];
    const transpose = data[base + 139] >= 128 ? data[base + 139] - 256 : data[base + 139];
    const isVirt = nameOrHeader[0] === 86 && nameOrHeader[1] === 105 && nameOrHeader[2] === 82 && nameOrHeader[3] === 84;
    const rawName = isVirt ? "Virtual" : readAmigaString(nameOrHeader, 0, 128);
    const slashIdx = rawName.lastIndexOf("/");
    const colonIdx = rawName.lastIndexOf(":");
    const stripIdx = Math.max(slashIdx, colonIdx);
    const name = stripIdx >= 0 ? rawName.substring(stripIdx + 1) : rawName;
    insts.push({ nameOrHeader, type, volume, channel, instFlags, transpose, name });
  }
  return insts;
}
function isSymphonieProFormat(bytes) {
  if (bytes.length < 16) return false;
  if (bytes[0] !== 83 || bytes[1] !== 121 || bytes[2] !== 109 || bytes[3] !== 77) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(4, false) !== 1) return false;
  if (view.getInt32(8, false) !== -1) return false;
  const numChannels = view.getUint32(12, false);
  if (numChannels < 1 || numChannels > 256) return false;
  return true;
}
const CMD_KEYON = 0;
const CMD_VOLSLIDE_UP = 1;
const CMD_VOLSLIDE_DOWN = 2;
const CMD_PITCH_UP = 3;
const CMD_PITCH_DOWN = 4;
const CMD_REPLAY_FROM = 5;
const CMD_FROM_AND_PITCH = 6;
const CMD_SET_SPEED = 9;
const CMD_TREMOLO = 12;
const CMD_VIBRATO = 13;
const CMD_RETRIG = 16;
const CMD_ADD_HALFTONE = 18;
const CMD_DSP_ECHO = 24;
const CMD_DSP_DELAY = 25;
const VOL_COMMAND = 200;
const VOL_STOP = 254;
const VOL_KEYOFF = 251;
const VOL_SPEEDDOWN = 250;
const VOL_SPEEDUP = 249;
const VOL_SETPITCH = 248;
function float32ToWav(samples, sampleRate) {
  const numSamples = samples.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);
  const writeStr = (off, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, numSamples * 2, true);
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 32768 : s * 32767, true);
  }
  return buffer;
}
async function parseSymphonieProFile(bytes, filename) {
  try {
    const song = _parseSymphonieProFile(bytes, filename);
    if (!song) return null;
    song.symphonieFileData = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    song.libopenmptFileData = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    try {
      const playbackData = await parseSymphonieForPlayback(bytes.buffer, filename);
      for (let i = 0; i < playbackData.instruments.length && i < song.instruments.length; i++) {
        const si = playbackData.instruments[i];
        const inst = song.instruments[i];
        if (si.samples && si.samples.length > 0) {
          const sampleRate = si.sampledFrequency > 0 ? si.sampledFrequency : 8363;
          const wavBuffer = float32ToWav(si.samples, sampleRate);
          const dataUrl = `data:audio/wav;base64,${arrayBufferToBase64(wavBuffer)}`;
          const loopEnabled = si.type === 4 || si.type === 8;
          const loopStart = Math.floor(si.loopStart / (100 * 65536) * si.samples.length);
          const loopEnd = Math.floor((si.loopStart + si.loopLen) / (100 * 65536) * si.samples.length);
          inst["name"] = si.name || `Instrument ${i + 1}`;
          inst["volume"] = si.volume > 0 ? -12 + si.volume / 100 * 12 : -60;
          inst["sample"] = {
            audioBuffer: wavBuffer,
            url: dataUrl,
            sampleRate,
            baseNote: "C4",
            detune: 0,
            loop: loopEnabled,
            loopType: loopEnabled ? "forward" : "off",
            loopStart,
            loopEnd,
            reverse: false,
            playbackRate: 1
          };
          inst["parameters"] = {
            sampleUrl: dataUrl
          };
        }
        inst["symphonie"] = {
          type: si.type,
          volume: si.volume,
          tune: si.tune,
          fineTune: si.fineTune,
          noDsp: si.noDsp,
          multiChannel: si.multiChannel,
          loopStart: si.loopStart,
          loopLen: si.loopLen,
          numLoops: si.numLoops,
          newLoopSystem: si.newLoopSystem,
          sampledFrequency: si.sampledFrequency
        };
      }
    } catch (err) {
      console.warn("[SymphonieProParser] parseSymphonieForPlayback failed (sample editor data unavailable):", err);
    }
    for (let i = 0; i < song.instruments.length; i++) {
      song.instruments[i]["synthType"] = "SymphonieSynth";
    }
    return song;
  } catch {
    return null;
  }
}
function _parseSymphonieProFile(bytes, filename) {
  if (!isSymphonieProFormat(bytes)) return null;
  const r = new Reader(bytes);
  r.skip(4);
  r.skip(4);
  r.skip(4);
  const numChannels = Math.min(r.u32be(), 256);
  const CHUNK_NUM_CHANNELS = -1;
  const CHUNK_TRACK_LENGTH = -2;
  const CHUNK_PATTERN_SIZE = -3;
  const CHUNK_NUM_INSTRUMENTS = -4;
  const CHUNK_EVENT_SIZE = -5;
  const CHUNK_TEMPO = -6;
  const CHUNK_EXTERNAL_SAMPLES = -7;
  const CHUNK_POSITION_LIST = -10;
  const CHUNK_SAMPLE_FILE = -11;
  const CHUNK_EMPTY_SAMPLE = -12;
  const CHUNK_PATTERN_EVENTS = -13;
  const CHUNK_INSTRUMENT_LIST = -14;
  const CHUNK_SEQUENCES = -15;
  const CHUNK_INFO_TEXT = -16;
  const CHUNK_SAMPLE_PACKED = -17;
  const CHUNK_SAMPLE_PACKED16 = -18;
  const CHUNK_INFO_TYPE = -19;
  const CHUNK_INFO_BINARY = -20;
  const CHUNK_INFO_STRING = -21;
  const CHUNK_SAMPLE_BOOST = 10;
  const CHUNK_STEREO_DETUNE = 11;
  const CHUNK_STEREO_PHASE = 12;
  let trackLen = 0;
  let initialBPM = 125;
  let initialSpeed = 6;
  let positionsData = new Uint8Array(0);
  let sequencesData = new Uint8Array(0);
  let patternData = new Uint8Array(0);
  let instrumentData = new Uint8Array(0);
  let infoText = "";
  let instrumentChunkFileOffset = 0;
  let patternEventsFileOffset = 0;
  let displaySampleCount = 0;
  while (r.canRead(4)) {
    const chunkType = r.s32be();
    switch (chunkType) {
      case CHUNK_NUM_CHANNELS:
        r.skip(4);
        break;
      case CHUNK_TRACK_LENGTH: {
        const tl = r.u32be();
        if (tl > 1024) return null;
        trackLen = tl;
        break;
      }
      case CHUNK_EVENT_SIZE: {
        const es = r.u32be() & 65535;
        if (es !== 4) return null;
        break;
      }
      case CHUNK_TEMPO: {
        const rawTempo = r.u32be();
        const clamped = Math.min(rawTempo, 800);
        initialBPM = Math.floor(1.24 * clamped);
        if (initialBPM < 32) initialBPM = 32;
        if (initialBPM > 999) initialBPM = 999;
        break;
      }
      case CHUNK_PATTERN_SIZE:
      case CHUNK_NUM_INSTRUMENTS:
        r.skip(4);
        break;
      case CHUNK_SAMPLE_BOOST:
      case CHUNK_STEREO_DETUNE:
      case CHUNK_STEREO_PHASE:
        r.skip(4);
        break;
      case CHUNK_EXTERNAL_SAMPLES:
        r.skip(4);
        break;
      case CHUNK_POSITION_LIST:
        if (positionsData.length === 0) {
          positionsData = new Uint8Array(decodeSymArray(r));
        } else {
          if (r.canRead(4)) {
            const l = r.u32be();
            r.skip(l);
          }
        }
        break;
      case CHUNK_SAMPLE_FILE:
      case CHUNK_SAMPLE_PACKED:
      case CHUNK_SAMPLE_PACKED16:
        if (r.canRead(4)) {
          const l = r.u32be();
          r.skip(l);
        }
        displaySampleCount++;
        break;
      case CHUNK_EMPTY_SAMPLE:
        displaySampleCount++;
        break;
      case CHUNK_PATTERN_EVENTS:
        if (patternData.length === 0) {
          patternEventsFileOffset = r.pos;
          patternData = new Uint8Array(decodeSymArray(r));
        } else {
          if (r.canRead(4)) {
            const l = r.u32be();
            r.skip(l);
          }
        }
        break;
      case CHUNK_INSTRUMENT_LIST:
        if (instrumentData.length === 0) {
          instrumentChunkFileOffset = r.pos;
          instrumentData = new Uint8Array(decodeSymArray(r));
        } else {
          if (r.canRead(4)) {
            const l = r.u32be();
            r.skip(l);
          }
        }
        break;
      case CHUNK_SEQUENCES:
        if (sequencesData.length === 0) {
          sequencesData = new Uint8Array(decodeSymArray(r));
        } else {
          if (r.canRead(4)) {
            const l = r.u32be();
            r.skip(l);
          }
        }
        break;
      case CHUNK_INFO_TEXT: {
        const textData = decodeSymChunk(r);
        if (textData.length > 0) {
          let end = 0;
          while (end < textData.length && textData[end] !== 10 && textData[end] !== 13 && textData[end] !== 0) {
            end++;
          }
          infoText = readAmigaString(textData, 0, end);
        }
        break;
      }
      case CHUNK_INFO_TYPE:
      case CHUNK_INFO_BINARY:
      case CHUNK_INFO_STRING:
        if (r.canRead(4)) {
          const l = r.u32be();
          r.skip(l);
        }
        break;
    }
  }
  if (trackLen === 0 || instrumentData.length === 0) return null;
  if (positionsData.length === 0 || patternData.length === 0 || sequencesData.length === 0) return null;
  const symInstruments = readSymInstruments(instrumentData);
  const symEvents = readSymEvents(patternData);
  const symSequences = readSymSequences(sequencesData);
  const symPositions = readSymPositions(positionsData);
  const numInstruments = Math.min(symInstruments.length, 255);
  const patternSize = numChannels * trackLen;
  const numRawPatterns = patternSize > 0 ? Math.floor(symEvents.length / patternSize) : 0;
  const songTitle = infoText || filename.replace(/\.symmod$/i, "");
  const SYMMOD_INST_SIZE = 256;
  let realCount = displaySampleCount;
  for (let i = symInstruments.length - 1; i >= realCount; i--) {
    if (symInstruments[i].name) {
      realCount = i + 1;
      break;
    }
  }
  const cappedInstruments = symInstruments.slice(0, Math.min(realCount, 128));
  const instruments = cappedInstruments.length > 0 ? cappedInstruments.map((si, i) => ({
    id: i + 1,
    name: si.name || `Instrument ${i + 1}`,
    type: "synth",
    synthType: "SymphonieSynth",
    effects: [],
    volume: si.volume ?? 0,
    pan: 0,
    uadeChipRam: {
      moduleBase: 0,
      moduleSize: bytes.length,
      instrBase: instrumentChunkFileOffset + i * SYMMOD_INST_SIZE,
      instrSize: SYMMOD_INST_SIZE
    }
  })) : [{
    id: 1,
    name: songTitle,
    type: "synth",
    synthType: "SymphonieSynth",
    effects: [],
    volume: 0,
    pan: 0,
    uadeChipRam: {
      moduleBase: 0,
      moduleSize: bytes.length,
      instrBase: instrumentChunkFileOffset,
      instrSize: SYMMOD_INST_SIZE
    }
  }];
  const patternMap = /* @__PURE__ */ new Map();
  const patterns = [];
  const sequence = [];
  let foundSpeed = false;
  for (const seq of symSequences) {
    if (seq.info === 1) continue;
    if (seq.info === -1) break;
    if (seq.start >= symPositions.length || seq.length === 0 || seq.length > symPositions.length || symPositions.length - seq.length < seq.start) {
      continue;
    }
    for (let pi = seq.start; pi < seq.start + seq.length; pi++) {
      const pos = symPositions[pi];
      if (!pos) continue;
      const effectiveTranspose = pos.transpose + seq.transpose;
      const key = `${pos.pattern}-${pos.start}-${pos.length}-${effectiveTranspose}-${pos.speed}`;
      if (!patternMap.has(key)) {
        const patIdx2 = patterns.length;
        patternMap.set(key, patIdx2);
        const numRows = pos.length;
        const rowStart = pos.start;
        const patSpeed = pos.speed > 0 ? pos.speed : 6;
        if (!foundSpeed) {
          initialSpeed = patSpeed;
          foundSpeed = true;
        }
        const channels = [];
        for (let ch = 0; ch < numChannels; ch++) {
          const rows = [];
          for (let row = 0; row < numRows; row++) {
            const cell = {
              note: 0,
              instrument: 0,
              volume: 0,
              effTyp: 0,
              eff: 0,
              effTyp2: 0,
              eff2: 0
            };
            const srcRow = rowStart + row;
            const eventIdx = pos.pattern * patternSize + srcRow * numChannels + ch;
            if (eventIdx >= 0 && eventIdx < symEvents.length) {
              const ev = symEvents[eventIdx];
              _convertEvent(ev, cell, effectiveTranspose, numInstruments);
            }
            if (row === 0 && ch === 0) {
              cell.effTyp = 15;
              cell.eff = patSpeed;
            }
            rows.push(cell);
          }
          const pan = ch & 1 ? 50 : -50;
          channels.push({
            id: `channel-${ch}`,
            name: `Channel ${ch + 1}`,
            muted: false,
            solo: false,
            collapsed: false,
            volume: 100,
            pan,
            instrumentId: null,
            color: null,
            rows
          });
        }
        patterns.push({
          id: `pattern-${patIdx2}`,
          name: `Pattern ${patIdx2}`,
          length: numRows,
          channels,
          importMetadata: {
            sourceFormat: "Symphonie",
            sourceFile: filename,
            importedAt: (/* @__PURE__ */ new Date()).toISOString(),
            originalChannelCount: numChannels,
            originalPatternCount: numRawPatterns,
            originalInstrumentCount: numInstruments
          }
        });
      }
      const patIdx = patternMap.get(key);
      const loopCount = Math.max(pos.loopNum, 1);
      for (let lp = 0; lp < loopCount; lp++) {
        sequence.push(patIdx);
      }
    }
  }
  if (patterns.length === 0) {
    const emptyRows = Array.from({ length: 64 }, () => ({
      note: 0,
      instrument: 0,
      volume: 0,
      effTyp: 0,
      eff: 0,
      effTyp2: 0,
      eff2: 0
    }));
    const emptyChannels = Array.from({ length: numChannels }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: ch & 1 ? 50 : -50,
      instrumentId: null,
      color: null,
      rows: emptyRows
    }));
    patterns.push({
      id: "pattern-0",
      name: "Pattern 0",
      length: 64,
      channels: emptyChannels,
      importMetadata: {
        sourceFormat: "Symphonie",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: numChannels,
        originalPatternCount: 0,
        originalInstrumentCount: numInstruments
      }
    });
    sequence.push(0);
  }
  const baseName = filename.replace(/\.[^/.]+$/, "");
  const songName = infoText.trim() || baseName;
  const uadePatternLayout = {
    formatId: "symphoniePro",
    patternDataFileOffset: patternEventsFileOffset,
    bytesPerCell: 4,
    rowsPerPattern: trackLen,
    numChannels,
    numPatterns: patterns.length,
    moduleSize: bytes.length,
    encodeCell: encodeSymphonieProCell,
    getCellFileOffset(pattern, row, channel) {
      return patternEventsFileOffset + (pattern * patternSize + row * numChannels + channel) * 4;
    }
  };
  return {
    name: songName,
    format: "MOD",
    patterns,
    instruments,
    songPositions: sequence,
    songLength: sequence.length,
    restartPosition: 0,
    numChannels,
    initialSpeed,
    initialBPM,
    linearPeriods: false,
    uadePatternLayout
  };
}
function _convertEvent(ev, cell, transpose, numInstruments) {
  switch (ev.command) {
    case CMD_KEYON: {
      if (ev.param > VOL_COMMAND) {
        switch (ev.param) {
          case VOL_STOP:
            break;
          case VOL_KEYOFF:
            break;
          case VOL_SPEEDDOWN:
          case VOL_SPEEDUP:
            break;
          case VOL_SETPITCH:
            if (ev.note >= 0 && ev.note <= 84) {
              const n = clampNote(ev.note + 25 + transpose);
              if (n > 0) cell.note = n;
            }
            break;
        }
      } else {
        if (ev.note >= 0 && ev.note <= 84) {
          const n = clampNote(ev.note + 25 + transpose);
          if (n > 0) {
            cell.note = n;
            if (ev.inst < numInstruments) {
              cell.instrument = ev.inst + 1;
            }
          }
        }
        if (ev.param > 0 && ev.param <= 100) {
          const vol = Math.round(ev.param * 0.64);
          cell.volume = Math.min(vol, 64);
        }
      }
      break;
    }
    case CMD_SET_SPEED:
      cell.effTyp = 15;
      cell.eff = ev.param > 0 ? ev.param : 4;
      break;
    case CMD_VOLSLIDE_UP:
      cell.effTyp = 10;
      cell.eff = Math.min(ev.param, 15) << 4;
      break;
    case CMD_VOLSLIDE_DOWN:
      cell.effTyp = 10;
      cell.eff = Math.min(ev.param, 15);
      break;
    case CMD_PITCH_UP:
      cell.effTyp = 1;
      cell.eff = Math.min(ev.param, 255);
      break;
    case CMD_PITCH_DOWN:
      cell.effTyp = 2;
      cell.eff = Math.min(ev.param, 255);
      break;
    case CMD_VIBRATO:
      cell.effTyp = 4;
      cell.eff = Math.min(ev.inst >> 3, 15) << 4 | Math.min(ev.param, 15);
      break;
    case CMD_TREMOLO:
      cell.effTyp = 7;
      cell.eff = Math.min(ev.inst >> 3, 15) << 4 | Math.min(ev.param >> 3, 15);
      break;
    case CMD_RETRIG:
      cell.effTyp = 27;
      cell.eff = Math.min(ev.inst + 1, 15);
      break;
    case CMD_ADD_HALFTONE:
      if (ev.note >= 0 && ev.note <= 84) {
        const n = clampNote(ev.note + 25 + transpose);
        if (n > 0) {
          cell.note = n;
          cell.effTyp = 3;
          cell.eff = 0;
        }
      }
      break;
    case CMD_REPLAY_FROM:
    case CMD_FROM_AND_PITCH:
      cell.effTyp = 9;
      cell.eff = Math.min(ev.param, 255);
      break;
    case CMD_DSP_ECHO: {
      const dspType = ev.note >= 0 && ev.note <= 4 ? ev.note : 0;
      cell.effTyp = 80;
      cell.eff = Math.min(ev.param, 127);
      cell.effTyp2 = 80 + dspType;
      cell.eff2 = Math.min(ev.inst, 127);
      break;
    }
  }
}
function clampNote(n) {
  if (n < 1) return 0;
  if (n > 119) return 119;
  return n;
}
function _decodeDelta8(bytes) {
  const out = new Float32Array(bytes.length);
  let acc = 0;
  for (let i = 0; i < bytes.length; i++) {
    acc = acc + bytes[i] & 255;
    out[i] = (acc < 128 ? acc : acc - 256) / 128;
  }
  return out;
}
function _decodeDelta16(bytes) {
  const BLOCK_BYTES = 4096;
  const totalBytes = bytes.length;
  const fileBytes = new Uint8Array(totalBytes);
  let outIdx = 0;
  let srcOffset = 0;
  let remaining = totalBytes;
  while (remaining > 0) {
    const blockSize = Math.min(remaining, BLOCK_BYTES);
    const halfBlock = blockSize >> 1;
    const decoded = new Uint8Array(blockSize);
    let acc = bytes[srcOffset];
    decoded[0] = acc;
    for (let i = 1; i < blockSize; i++) {
      acc = acc + bytes[srcOffset + i] & 255;
      decoded[i] = acc;
    }
    for (let i = 0; i < halfBlock; i++) {
      const lsb = decoded[i];
      const msb = decoded[halfBlock + i];
      fileBytes[outIdx++] = msb;
      fileBytes[outIdx++] = lsb;
    }
    if (blockSize & 1) {
      fileBytes[outIdx++] = decoded[blockSize - 1];
    }
    srcOffset += blockSize;
    remaining -= blockSize;
  }
  const reconstructed = fileBytes.subarray(0, outIdx);
  if (reconstructed.length >= 4) {
    const magic4 = String.fromCharCode(reconstructed[0], reconstructed[1], reconstructed[2], reconstructed[3]);
    if (magic4 === "RIFF" || magic4 === "FORM" || magic4 === "16BT" || reconstructed.length >= 8 && magic4 === "MAES") {
      return _decodeRaw8(reconstructed);
    }
  }
  return _decode16bitBE(reconstructed, 0, false);
}
function _decodeRaw8(bytes) {
  if (bytes.length < 4) return _decodeRawFallback(bytes);
  const magic4 = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic4 === "FORM" && bytes.length >= 12) {
    const formType = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (formType === "8SVX") return _decodeIFF8SVX(bytes);
    if (formType === "AIFF") return _decodeAIFF(bytes);
  }
  if (magic4 === "RIFF") return _decodeWAV(bytes);
  if (bytes.length >= 24 && bytes[0] === 77 && bytes[1] === 65 && bytes[2] === 69 && bytes[3] === 83 && bytes[4] === 84 && bytes[5] === 82 && bytes[6] === 79 && bytes[7] === 0) {
    const isStereo = (bytes[12] | bytes[13] | bytes[14] | bytes[15]) === 0;
    return _decode16bitBE(bytes, 24, isStereo);
  }
  if (magic4 === "16BT") {
    return _decode16bitBE(bytes, 0, false);
  }
  const out = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    out[i] = (b < 128 ? b : b - 256) / 128;
  }
  return out;
}
function _decode16bitBE(bytes, offset, stereo) {
  const bytesPerFrame = stereo ? 4 : 2;
  const numSamples = Math.floor((bytes.length - offset) / bytesPerFrame);
  if (stereo) {
    const out2 = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      const p = offset + i * 4;
      const rawL = bytes[p] << 8 | bytes[p + 1];
      const rawR = bytes[p + 2] << 8 | bytes[p + 3];
      const sL = rawL > 32767 ? rawL - 65536 : rawL;
      const sR = rawR > 32767 ? rawR - 65536 : rawR;
      out2[i] = (sL + sR) / 2 / 32768;
    }
    return out2;
  }
  const out = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const p = offset + i * 2;
    const raw = bytes[p] << 8 | bytes[p + 1];
    out[i] = (raw > 32767 ? raw - 65536 : raw) / 32768;
  }
  return out;
}
function _decodeIFF8SVX(bytes) {
  let pos = 12;
  while (pos + 8 <= bytes.length) {
    const id = String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]);
    const size = bytes[pos + 4] << 24 | bytes[pos + 5] << 16 | bytes[pos + 6] << 8 | bytes[pos + 7];
    pos += 8;
    if (id === "BODY") {
      const bodyLen = Math.min(size, bytes.length - pos);
      const out = new Float32Array(bodyLen);
      for (let i = 0; i < bodyLen; i++) {
        const b = bytes[pos + i];
        out[i] = (b < 128 ? b : b - 256) / 128;
      }
      return out;
    }
    pos += size + (size & 1);
  }
  return _decodeRawFallback(bytes);
}
function _decodeAIFF(bytes) {
  let pos = 12;
  let numCh = 1;
  let bits = 8;
  while (pos + 8 <= bytes.length) {
    const id = String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]);
    const size = bytes[pos + 4] << 24 | bytes[pos + 5] << 16 | bytes[pos + 6] << 8 | bytes[pos + 7];
    pos += 8;
    if (id === "COMM" && size >= 8) {
      numCh = bytes[pos] << 8 | bytes[pos + 1];
      bits = bytes[pos + 6] << 8 | bytes[pos + 7];
      pos += size + (size & 1);
    } else if (id === "SSND") {
      const ssndOff = bytes[pos] << 24 | bytes[pos + 1] << 16 | bytes[pos + 2] << 8 | bytes[pos + 3];
      const dataStart = pos + 8 + ssndOff;
      const dataLen = Math.min(size - 8 - ssndOff, bytes.length - dataStart);
      if (bits === 16) {
        const n2 = Math.floor(dataLen / (2 * numCh));
        const out2 = new Float32Array(n2);
        for (let i = 0; i < n2; i++) {
          const p = dataStart + i * 2 * numCh;
          const raw = bytes[p] << 8 | bytes[p + 1];
          out2[i] = (raw > 32767 ? raw - 65536 : raw) / 32768;
        }
        return out2;
      }
      const n = Math.floor(dataLen / numCh);
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const b = bytes[dataStart + i * numCh];
        out[i] = (b < 128 ? b : b - 256) / 128;
      }
      return out;
    } else {
      pos += size + (size & 1);
    }
  }
  return _decodeRawFallback(bytes);
}
function _decodeWAV(bytes) {
  if (bytes.length < 44) return _decodeRawFallback(bytes);
  let pos = 12;
  let bitsPerSample = 8;
  while (pos + 8 <= bytes.length) {
    const id = String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]);
    const size = bytes[pos + 4] | bytes[pos + 5] << 8 | bytes[pos + 6] << 16 | bytes[pos + 7] << 24;
    pos += 8;
    if (id === "fmt ") {
      if (size >= 16) {
        bitsPerSample = bytes[pos + 14] | bytes[pos + 15] << 8;
      }
      pos += size;
    } else if (id === "data") {
      const dataLen = Math.min(size, bytes.length - pos);
      if (bitsPerSample === 16) {
        const numSamples = Math.floor(dataLen / 2);
        const out2 = new Float32Array(numSamples);
        for (let i = 0; i < numSamples; i++) {
          const raw = bytes[pos + i * 2] | bytes[pos + i * 2 + 1] << 8;
          out2[i] = (raw > 32767 ? raw - 65536 : raw) / 32768;
        }
        return out2;
      }
      const out = new Float32Array(dataLen);
      for (let i = 0; i < dataLen; i++) {
        out[i] = (bytes[pos + i] - 128) / 128;
      }
      return out;
    } else {
      pos += size + (size & 1);
    }
  }
  return _decodeRawFallback(bytes);
}
function _decodeRawFallback(bytes) {
  const out = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    out[i] = (bytes[i] < 128 ? bytes[i] : bytes[i] - 256) / 128;
  }
  return out;
}
async function parseSymphonieForPlayback(buffer, filename) {
  const bytes = new Uint8Array(buffer);
  if (!isSymphonieProFormat(bytes)) {
    throw new Error(`parseSymphonieForPlayback: not a SymMOD file (${filename})`);
  }
  const r = new Reader(bytes);
  r.skip(4);
  r.skip(4);
  r.skip(4);
  const numChannels = Math.min(r.u32be(), 256);
  const CHUNK_NUM_CHANNELS = -1;
  const CHUNK_TRACK_LENGTH = -2;
  const CHUNK_PATTERN_SIZE = -3;
  const CHUNK_NUM_INSTRUMENTS = -4;
  const CHUNK_EVENT_SIZE = -5;
  const CHUNK_TEMPO = -6;
  const CHUNK_EXTERNAL_SAMPLES = -7;
  const CHUNK_POSITION_LIST = -10;
  const CHUNK_SAMPLE_FILE = -11;
  const CHUNK_EMPTY_SAMPLE = -12;
  const CHUNK_PATTERN_EVENTS = -13;
  const CHUNK_INSTRUMENT_LIST = -14;
  const CHUNK_SEQUENCES = -15;
  const CHUNK_INFO_TEXT = -16;
  const CHUNK_SAMPLE_PACKED = -17;
  const CHUNK_SAMPLE_PACKED16 = -18;
  const CHUNK_INFO_TYPE = -19;
  const CHUNK_INFO_BINARY = -20;
  const CHUNK_INFO_STRING = -21;
  const CHUNK_SAMPLE_BOOST = 10;
  const CHUNK_STEREO_DETUNE = 11;
  const CHUNK_STEREO_PHASE = 12;
  let trackLen = 0;
  let initialBPM = 125;
  let positionsData = new Uint8Array(0);
  let sequencesData = new Uint8Array(0);
  let patternData = new Uint8Array(0);
  let instrumentData = new Uint8Array(0);
  let infoText = "";
  const rawSampleData = [];
  let sampleIndex = 0;
  while (r.canRead(4)) {
    const chunkType = r.s32be();
    switch (chunkType) {
      case CHUNK_NUM_CHANNELS:
        r.skip(4);
        break;
      case CHUNK_TRACK_LENGTH: {
        const tl = r.u32be();
        if (tl > 1024) throw new Error("trackLen > 1024");
        trackLen = tl;
        break;
      }
      case CHUNK_EVENT_SIZE: {
        const es = r.u32be() & 65535;
        if (es !== 4) throw new Error(`eventSize must be 4, got ${es}`);
        break;
      }
      case CHUNK_TEMPO: {
        const rawTempo = r.u32be();
        const clamped = Math.min(rawTempo, 800);
        initialBPM = Math.floor(1.24 * clamped);
        if (initialBPM < 32) initialBPM = 32;
        if (initialBPM > 999) initialBPM = 999;
        break;
      }
      case CHUNK_PATTERN_SIZE:
      case CHUNK_NUM_INSTRUMENTS:
        r.skip(4);
        break;
      case CHUNK_SAMPLE_BOOST:
      case CHUNK_STEREO_DETUNE:
      case CHUNK_STEREO_PHASE:
      case CHUNK_EXTERNAL_SAMPLES:
        r.skip(4);
        break;
      case CHUNK_POSITION_LIST:
        if (positionsData.length === 0) {
          positionsData = new Uint8Array(decodeSymArray(r));
        } else {
          if (r.canRead(4)) {
            const l = r.u32be();
            r.skip(l);
          }
        }
        break;
      case CHUNK_SAMPLE_FILE: {
        const bytes2 = decodeSymChunk(r);
        rawSampleData[sampleIndex] = { kind: "raw8", bytes: bytes2 };
        sampleIndex++;
        break;
      }
      case CHUNK_SAMPLE_PACKED: {
        const bytes2 = decodeSymChunk(r);
        rawSampleData[sampleIndex] = { kind: "delta8", bytes: bytes2 };
        sampleIndex++;
        break;
      }
      case CHUNK_SAMPLE_PACKED16: {
        const bytes2 = decodeSymChunk(r);
        rawSampleData[sampleIndex] = { kind: "delta16", bytes: bytes2 };
        sampleIndex++;
        break;
      }
      case CHUNK_EMPTY_SAMPLE:
        sampleIndex++;
        break;
      case CHUNK_PATTERN_EVENTS:
        if (patternData.length === 0) {
          patternData = new Uint8Array(decodeSymArray(r));
        } else {
          if (r.canRead(4)) {
            const l = r.u32be();
            r.skip(l);
          }
        }
        break;
      case CHUNK_INSTRUMENT_LIST:
        if (instrumentData.length === 0) {
          instrumentData = new Uint8Array(decodeSymArray(r));
        } else {
          if (r.canRead(4)) {
            const l = r.u32be();
            r.skip(l);
          }
        }
        break;
      case CHUNK_SEQUENCES:
        if (sequencesData.length === 0) {
          sequencesData = new Uint8Array(decodeSymArray(r));
        } else {
          if (r.canRead(4)) {
            const l = r.u32be();
            r.skip(l);
          }
        }
        break;
      case CHUNK_INFO_TEXT: {
        const textData = decodeSymChunk(r);
        if (textData.length > 0) {
          let end = 0;
          while (end < textData.length && textData[end] !== 10 && textData[end] !== 13 && textData[end] !== 0) {
            end++;
          }
          infoText = readAmigaString(textData, 0, end);
        }
        break;
      }
      case CHUNK_INFO_TYPE:
      case CHUNK_INFO_BINARY:
      case CHUNK_INFO_STRING:
        if (r.canRead(4)) {
          const l = r.u32be();
          r.skip(l);
        }
        break;
    }
  }
  if (trackLen === 0 || instrumentData.length === 0) {
    throw new Error("parseSymphonieForPlayback: missing trackLen or instrument data");
  }
  if (positionsData.length === 0 || patternData.length === 0 || sequencesData.length === 0) {
    throw new Error("parseSymphonieForPlayback: missing position/pattern/sequence data");
  }
  const symInstrumentsRaw = readSymInstruments(instrumentData);
  const symEventsRaw = readSymEvents(patternData);
  const symSequences = readSymSequences(sequencesData);
  const symPositions = readSymPositions(positionsData);
  const numInstruments = Math.min(symInstrumentsRaw.length, 255);
  const patternSize = numChannels * trackLen;
  const INST_SIZE = 256;
  let numStereoR = 0;
  for (let i = 0; i < numInstruments; i++) {
    if (symInstrumentsRaw[i].channel === 2) numStereoR++;
  }
  const expectedChunks = numInstruments - numStereoR;
  console.log(`[SymphonieParser] sampleIndex=${sampleIndex} numInstruments=${numInstruments} stereoR=${numStereoR} expectedChunks=${expectedChunks}`);
  let chunkIdx = 0;
  const instruments = [];
  for (let i = 0; i < numInstruments; i++) {
    const si = symInstrumentsRaw[i];
    const base = i * INST_SIZE;
    const loopStartHigh = instrumentData[base + 129];
    const loopLenHigh = instrumentData[base + 130];
    const numRepetitions = instrumentData[base + 131];
    const fineTune = instrumentData[base + 138] >= 128 ? instrumentData[base + 138] - 256 : instrumentData[base + 138];
    const lineSampleFlags = instrumentData[base + 140];
    const downsample = instrumentData[base + 143];
    const tune = si.transpose - 12 * downsample;
    const volume = si.volume === 0 ? 100 : Math.min(si.volume, 100);
    const noDsp = (si.instFlags & 2) !== 0;
    const newLoopSystem = (lineSampleFlags & 16) !== 0;
    const loopStartLo = base + 151 < instrumentData.length ? instrumentData[base + 150] << 8 | instrumentData[base + 151] : 0;
    const loopLenLo = base + 153 < instrumentData.length ? instrumentData[base + 152] << 8 | instrumentData[base + 153] : 0;
    const loopStart = loopStartHigh * 65536 + loopStartLo;
    const loopLen = loopLenHigh * 65536 + loopLenLo;
    const isStereoR = si.channel === 2;
    let samples = null;
    if (!isStereoR) {
      const entry = rawSampleData[chunkIdx];
      if (entry) {
        if (entry.kind === "raw8") {
          samples = _decodeRaw8(entry.bytes);
        } else if (entry.kind === "delta8") {
          samples = _decodeDelta8(entry.bytes);
        } else {
          samples = _decodeDelta16(entry.bytes);
        }
      }
      chunkIdx++;
    }
    instruments.push({
      name: si.name || `Instrument ${i + 1}`,
      type: si.type,
      volume,
      tune,
      fineTune,
      noDsp,
      multiChannel: si.channel,
      loopStart,
      loopLen,
      numLoops: numRepetitions,
      newLoopSystem,
      samples,
      sampledFrequency: 0
      // unknown → worklet assumes 8363 Hz
    });
  }
  while (instruments.length > 0) {
    const last = instruments[instruments.length - 1];
    if (last.samples !== null || last.type >= 0 && last.name !== `Instrument ${instruments.length}`) break;
    instruments.pop();
  }
  let initialCycle = 6;
  outerCycle:
    for (const seq of symSequences) {
      if (seq.info === 1) continue;
      if (seq.info === -1) break;
      if (seq.start >= symPositions.length || seq.length === 0 || seq.length > symPositions.length || symPositions.length - seq.length < seq.start) continue;
      for (let pi = seq.start; pi < seq.start + seq.length; pi++) {
        const pos = symPositions[pi];
        if (!pos) continue;
        if (pos.speed > 0) {
          initialCycle = pos.speed;
          break outerCycle;
        }
      }
    }
  const patternMap = /* @__PURE__ */ new Map();
  const patterns = [];
  const orderList = [];
  const orderSpeeds = [];
  const orderTranspose = [];
  for (const seq of symSequences) {
    if (seq.info === 1) continue;
    if (seq.info === -1) break;
    if (seq.start >= symPositions.length || seq.length === 0 || seq.length > symPositions.length || symPositions.length - seq.length < seq.start) {
      continue;
    }
    for (let pi = seq.start; pi < seq.start + seq.length; pi++) {
      const pos = symPositions[pi];
      if (!pos) continue;
      const effectiveTranspose = pos.transpose + seq.transpose;
      const key = `${pos.pattern}-${pos.start}-${pos.length}-${effectiveTranspose}-${pos.speed}`;
      if (!patternMap.has(key)) {
        const patIdx2 = patterns.length;
        patternMap.set(key, patIdx2);
        const numRows = pos.length;
        const rowStart = pos.start;
        const events = [];
        const dspEvents = [];
        for (let row = 0; row < numRows; row++) {
          for (let ch = 0; ch < numChannels; ch++) {
            const srcRow = rowStart + row;
            const eventIdx = pos.pattern * patternSize + srcRow * numChannels + ch;
            if (eventIdx < 0 || eventIdx >= symEventsRaw.length) continue;
            const ev = symEventsRaw[eventIdx];
            if (ev.command === CMD_DSP_ECHO || ev.command === CMD_DSP_DELAY) {
              dspEvents.push({
                row,
                channel: ch,
                type: ev.note,
                feedback: ev.inst,
                bufLen: ev.param
              });
              events.push({
                row,
                channel: ch,
                note: ev.note >= 0 && ev.note <= 255 ? ev.note + 1 : 0,
                instrument: ev.inst + 1,
                volume: 255,
                cmd: ev.command,
                param: ev.param
              });
            } else {
              let note = 0;
              let instrument = 0;
              let volume = 255;
              if (ev.command === CMD_KEYON) {
                if (ev.note >= 0 && ev.note <= 84) {
                  note = ev.note + 1;
                }
                if (ev.inst < numInstruments) {
                  instrument = ev.inst + 1;
                }
                if (ev.param > 0 && ev.param <= 100) {
                  volume = ev.param;
                } else if (ev.param > 200) {
                  volume = ev.param;
                } else if (ev.param === 0) {
                  volume = 255;
                }
              } else {
                note = ev.note >= 0 && ev.note <= 255 ? ev.note + 1 : 0;
                instrument = ev.inst + 1;
              }
              events.push({
                row,
                channel: ch,
                note,
                instrument,
                volume,
                cmd: ev.command,
                param: ev.param
              });
            }
          }
        }
        patterns.push({ numRows, events, dspEvents });
      }
      const patIdx = patternMap.get(key);
      const loopCount = Math.max(pos.loopNum, 1);
      for (let lp = 0; lp < loopCount; lp++) {
        orderList.push(patIdx);
        orderSpeeds.push(pos.speed > 0 ? pos.speed : initialCycle);
        orderTranspose.push(effectiveTranspose);
      }
    }
  }
  if (patterns.length === 0) {
    patterns.push({ numRows: 64, events: [], dspEvents: [] });
    orderList.push(0);
  }
  const baseName = filename.replace(/\.[^/.]+$/, "");
  const title = infoText.trim() || baseName;
  return {
    title,
    bpm: initialBPM,
    cycle: initialCycle,
    numChannels,
    orderList,
    orderSpeeds,
    orderTranspose,
    patterns,
    instruments,
    globalDspType: 0,
    globalDspFeedback: 0,
    globalDspBufLen: 0
  };
}
export {
  isSymphonieProFormat,
  parseSymphonieForPlayback,
  parseSymphonieProFile
};
