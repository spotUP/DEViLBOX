import { c5 as registerVariableEncoder, c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const XM_NOTE_CUT = 97;
const ptmEncoder = {
  formatId: "ptm",
  /**
   * Encode rows for a single channel in PTM packed format.
   */
  encodePattern(rows, channel) {
    const buf = [];
    for (let row = 0; row < rows.length; row++) {
      const cell = rows[row];
      const note = cell.note ?? 0;
      const instr = cell.instrument ?? 0;
      const vol = cell.volume ?? 0;
      const effTyp = cell.effTyp ?? 0;
      const eff = cell.eff ?? 0;
      const hasNote = note !== 0 || instr !== 0;
      const hasEffect = effTyp !== 0 || eff !== 0;
      const hasVol = vol !== 0;
      if (hasNote || hasEffect || hasVol) {
        let flag = channel & 31;
        if (hasNote) flag |= 32;
        if (hasEffect) flag |= 64;
        if (hasVol) flag |= 128;
        buf.push(flag);
        if (hasNote) {
          let rawNote = 0;
          if (note === XM_NOTE_CUT) {
            rawNote = 254;
          } else if (note >= 1 && note <= 120) {
            rawNote = note;
          }
          buf.push(rawNote);
          buf.push(instr & 255);
        }
        if (hasEffect) {
          const command = effTyp <= 15 ? effTyp : 0;
          buf.push(command & 255);
          buf.push(eff & 255);
        }
        if (hasVol) {
          buf.push(Math.min(64, vol));
        }
      }
      buf.push(0);
    }
    return new Uint8Array(buf);
  }
};
registerVariableEncoder(ptmEncoder);
function u8(v, off) {
  return v.getUint8(off);
}
function u16(v, off) {
  return v.getUint16(off, true);
}
function u32(v, off) {
  return v.getUint32(off, true);
}
function readString(v, off, len) {
  let s = "";
  for (let i = 0; i < len; i++) {
    const ch = v.getUint8(off + i);
    if (ch === 0) break;
    s += String.fromCharCode(ch);
  }
  return s.trim();
}
const HEADER_SIZE = 608;
const SAMPLE_HEADER_SIZE = 80;
const ROWS_PER_PATTERN = 64;
const MAX_CHANNELS = 32;
const SMP_TYPE_MASK = 3;
const SMP_PCM = 1;
const SMP_LOOP = 4;
const SMP_16BIT = 16;
const ORDER_END = 255;
const ORDER_SKIP = 254;
function isPTMFormat(buffer) {
  if (buffer.byteLength < HEADER_SIZE) return false;
  const v = new DataView(buffer);
  if (v.getUint8(44) !== 80 || // P
  v.getUint8(45) !== 84 || // T
  v.getUint8(46) !== 77 || // M
  v.getUint8(47) !== 70) return false;
  if (u8(v, 28) !== 26) return false;
  if (u8(v, 30) > 2) return false;
  if (u16(v, 40) !== 0) return false;
  const numChannels = u16(v, 38);
  const numOrders = u16(v, 32);
  const numSamples = u16(v, 34);
  const numPatterns = u16(v, 36);
  if (numChannels < 1 || numChannels > 32) return false;
  if (numOrders < 1 || numOrders > 256) return false;
  if (numSamples < 1 || numSamples > 255) return false;
  if (numPatterns < 1 || numPatterns > 128) return false;
  return true;
}
function decodeDeltaPCM8(raw) {
  const out = new Uint8Array(raw.length);
  let running = 0;
  for (let i = 0; i < raw.length; i++) {
    running = running + raw[i] & 255;
    out[i] = running;
  }
  return out;
}
function convertPTMEffect(command, param) {
  switch (command) {
    case 0:
      return { effTyp: 0, eff: param };
    // Arpeggio
    case 1:
      return { effTyp: 1, eff: param };
    // Porta up
    case 2:
      return { effTyp: 2, eff: param };
    // Porta down
    case 3:
      return { effTyp: 3, eff: param };
    // Tone portamento
    case 4:
      return { effTyp: 4, eff: param };
    // Vibrato
    case 5:
      return { effTyp: 5, eff: param };
    // Tone porta + vol slide
    case 6:
      return { effTyp: 6, eff: param };
    // Vibrato + vol slide
    case 7:
      return { effTyp: 7, eff: param };
    // Tremolo
    case 8: {
      const panVal = Math.max(param >> 3, 1) - 1 & 15;
      return { effTyp: 83, eff: 128 | panVal };
    }
    case 9:
      return { effTyp: 9, eff: param };
    // Sample offset
    case 10:
      return { effTyp: 10, eff: param };
    // Volume slide
    case 11:
      return { effTyp: 11, eff: param };
    // Position jump
    case 12:
      return { effTyp: 12, eff: param };
    // Set volume
    case 13:
      return { effTyp: 13, eff: param };
    // Pattern break
    case 14:
      return { effTyp: 14, eff: param };
    // Extended MOD (Exy)
    case 15:
      return { effTyp: 15, eff: param };
    // Set speed / BPM
    default:
      return { effTyp: 0, eff: 0 };
  }
}
function parseSampleHeader(v, off) {
  return {
    flags: u8(v, off + 0),
    filename: readString(v, off + 1, 12),
    volume: u8(v, off + 13),
    c4speed: u16(v, off + 14),
    dataOffset: u32(v, off + 18),
    length: u32(v, off + 22),
    loopStart: u32(v, off + 26),
    loopEnd: u32(v, off + 30),
    name: readString(v, off + 48, 28)
  };
}
async function parsePTMFile(buffer, filename) {
  if (!isPTMFormat(buffer)) {
    throw new Error("PTMParser: file does not pass PTM format validation");
  }
  const v = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const songName = readString(v, 0, 28) || filename.replace(/\.[^/.]+$/, "");
  const numOrders = u16(v, 32);
  const numSamples = u16(v, 34);
  const numPatterns = u16(v, 36);
  const numChannels = u16(v, 38);
  const channelPan = [];
  for (let ch = 0; ch < MAX_CHANNELS; ch++) {
    const raw = u8(v, 64 + ch) & 15;
    channelPan.push(Math.round((raw / 7.5 - 1) * 100));
  }
  const orderList = [];
  let restartPosition = 0;
  for (let i = 0; i < numOrders; i++) {
    const ord = u8(v, 96 + i);
    if (ord === ORDER_END) break;
    if (ord === ORDER_SKIP) {
      restartPosition = orderList.length;
      continue;
    }
    orderList.push(ord);
  }
  const patOffsets = [];
  for (let i = 0; i < 128; i++) {
    patOffsets.push(u16(v, 352 + i * 2) * 16);
  }
  const sampleHeaders = [];
  const sampleBase = HEADER_SIZE;
  for (let s = 0; s < numSamples; s++) {
    sampleHeaders.push(parseSampleHeader(v, sampleBase + s * SAMPLE_HEADER_SIZE));
  }
  const patterns = [];
  const patFileAddrs = [];
  const patFileSizes = [];
  for (let pat = 0; pat < numPatterns; pat++) {
    const channels = Array.from(
      { length: numChannels },
      (_, ch) => ({
        id: `channel-${ch}`,
        name: `Ch ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: ch < MAX_CHANNELS ? channelPan[ch] : 0,
        instrumentId: null,
        color: null,
        rows: []
      })
    );
    const grid = Array.from(
      { length: ROWS_PER_PATTERN },
      () => Array.from({ length: numChannels }, () => ({
        note: 0,
        instrument: 0,
        volume: 0,
        effTyp: 0,
        eff: 0,
        effTyp2: 0,
        eff2: 0
      }))
    );
    const patOffset = patOffsets[pat];
    if (patOffset !== 0 && patOffset + 1 < buffer.byteLength) {
      patFileAddrs.push(patOffset);
      let pos = patOffset;
      let row = 0;
      while (row < ROWS_PER_PATTERN && pos < buffer.byteLength) {
        const b = bytes[pos++];
        if (b === 0) {
          row++;
          continue;
        }
        const ch = b & 31;
        const cell = ch < numChannels ? grid[row][ch] : {
          note: 0,
          instrument: 0,
          volume: 0,
          effTyp: 0,
          eff: 0
        };
        if (b & 32) {
          if (pos + 1 >= buffer.byteLength) break;
          const rawNote = bytes[pos++];
          const rawInstr = bytes[pos++];
          cell.instrument = rawInstr;
          if (rawNote === 254) {
            cell.note = 97;
          } else if (rawNote >= 1 && rawNote <= 120) {
            cell.note = rawNote;
          } else {
            cell.note = 0;
          }
        }
        if (b & 64) {
          if (pos + 1 >= buffer.byteLength) break;
          const command = bytes[pos++];
          const param = bytes[pos++];
          if (command <= 15) {
            const effParam = param;
            const { effTyp, eff } = convertPTMEffect(command, effParam);
            cell.effTyp = effTyp;
            cell.eff = eff;
          }
        }
        if (b & 128) {
          if (pos >= buffer.byteLength) break;
          const vol = bytes[pos++];
          cell.volume = Math.min(vol, 64);
        }
      }
      patFileSizes.push(pos - patOffset);
    } else {
      patFileAddrs.push(0);
      patFileSizes.push(0);
    }
    for (let ch = 0; ch < numChannels; ch++) {
      for (let row = 0; row < ROWS_PER_PATTERN; row++) {
        channels[ch].rows.push(grid[row][ch]);
      }
    }
    patterns.push({
      id: `pattern-${pat}`,
      name: `Pattern ${pat}`,
      length: ROWS_PER_PATTERN,
      channels,
      importMetadata: {
        sourceFormat: "PTM",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: numChannels,
        originalPatternCount: numPatterns,
        originalInstrumentCount: numSamples
      }
    });
  }
  const instruments = [];
  for (let s = 0; s < numSamples; s++) {
    const hdr = sampleHeaders[s];
    const id = s + 1;
    const isPCM = (hdr.flags & SMP_TYPE_MASK) === SMP_PCM;
    const is16Bit = (hdr.flags & SMP_16BIT) !== 0;
    const hasLoop = (hdr.flags & SMP_LOOP) !== 0;
    if (!isPCM || hdr.length === 0 || hdr.dataOffset === 0) {
      instruments.push({
        id,
        name: hdr.name || hdr.filename || `Sample ${id}`,
        type: "sample",
        synthType: "Sampler",
        effects: [],
        volume: -60,
        pan: 0
      });
      continue;
    }
    const sampleRate = hdr.c4speed > 0 ? hdr.c4speed * 2 : 8363;
    const byteLength = hdr.length;
    const loopStartB = hdr.loopStart;
    const loopEndB = hdr.loopEnd > 0 ? hdr.loopEnd - 1 : 0;
    const frameDivisor = is16Bit ? 2 : 1;
    const loopStartF = loopStartB / frameDivisor;
    const loopEndF = hasLoop && loopEndB > loopStartB ? loopEndB / frameDivisor : 0;
    const dataEnd = hdr.dataOffset + byteLength;
    if (dataEnd > buffer.byteLength) {
      instruments.push({
        id,
        name: hdr.name || hdr.filename || `Sample ${id}`,
        type: "sample",
        synthType: "Sampler",
        effects: [],
        volume: -60,
        pan: 0
      });
      continue;
    }
    const rawBytes = bytes.slice(hdr.dataOffset, dataEnd);
    const pcmBytes = decodeDeltaPCM8(rawBytes);
    const volume = Math.min(hdr.volume, 64);
    const loopStartBytes = hasLoop ? Math.round(loopStartF) : 0;
    const loopEndBytes = hasLoop && loopEndF > loopStartF ? Math.round(loopEndF) : 0;
    const name = hdr.name || hdr.filename || `Sample ${id}`;
    instruments.push(
      createSamplerInstrument(id, name, pcmBytes, volume, sampleRate, loopStartBytes, loopEndBytes)
    );
  }
  const trackMap = [];
  for (let p = 0; p < patterns.length; p++) {
    trackMap.push(Array.from({ length: numChannels }, () => p < patFileAddrs.length ? p : -1));
  }
  const uadeVariableLayout = {
    formatId: "ptm",
    numChannels,
    numFilePatterns: patFileAddrs.length,
    rowsPerPattern: ROWS_PER_PATTERN,
    moduleSize: buffer.byteLength,
    encoder: ptmEncoder,
    filePatternAddrs: patFileAddrs,
    filePatternSizes: patFileSizes,
    trackMap
  };
  return {
    name: songName,
    format: "S3M",
    // PTM is S3M-compatible; use S3M playback engine
    patterns,
    instruments,
    songPositions: orderList.length > 0 ? orderList : [0],
    songLength: orderList.length > 0 ? orderList.length : 1,
    restartPosition,
    numChannels,
    initialSpeed: 6,
    // PTM has no speed field in header; 6 is the tracker default
    initialBPM: 125,
    // PTM has no BPM field in header; 125 is the DOS tracker default
    linearPeriods: false,
    uadeVariableLayout
  };
}
export {
  isPTMFormat,
  parsePTMFile
};
