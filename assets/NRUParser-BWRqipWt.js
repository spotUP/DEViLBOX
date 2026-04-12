import { b$ as registerPatternEncoder, c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function reverseNRUEffect(effTyp, eff) {
  if (effTyp === 0 && eff === 0) return { d0: 0, d1: 0 };
  let d0;
  switch (effTyp) {
    case 3:
      d0 = 0;
      break;
    // tone portamento → d0=0
    case 0:
      d0 = 12;
      break;
    // arpeggio → d0=0x0C
    default:
      d0 = effTyp << 2 & 252;
      break;
  }
  return { d0, d1: eff & 255 };
}
function encodeNRUCell(cell) {
  const out = new Uint8Array(4);
  const note = cell.note ?? 0;
  const { d0, d1 } = reverseNRUEffect(cell.effTyp ?? 0, cell.eff ?? 0);
  out[0] = d0;
  out[1] = d1;
  if (note > 0 && note >= 36) {
    out[2] = (note - 36) * 2 & 255;
  } else {
    out[2] = 0;
  }
  out[3] = (cell.instrument ?? 0) << 3 & 255;
  return out;
}
registerPatternEncoder("nru", () => encodeNRUCell);
function u8(v, off) {
  return v.getUint8(off);
}
function u16(v, off) {
  return v.getUint16(off, false);
}
function i16(v, off) {
  return v.getInt16(off, false);
}
function u32(v, off) {
  return v.getUint32(off, false);
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
const HEADER_SIZE = 1084;
const SAMPLE_HEADER_SIZE = 16;
const NUM_SAMPLES = 31;
const NUM_CHANNELS = 4;
const ROWS_PER_PATTERN = 64;
const BYTES_PER_CELL = 4;
const BYTES_PER_PATTERN = ROWS_PER_PATTERN * NUM_CHANNELS * BYTES_PER_CELL;
const MAGIC_OFFSET = 1080;
const ORDER_OFFSET = 950;
const SAMPLE_RATE = 8287;
const CHANNEL_PAN = [-50, 50, 50, -50];
function convertModEffect(modEffect, modParam) {
  let effTyp = modEffect;
  let eff = modParam;
  switch (modEffect) {
    case 0:
      effTyp = 0;
      break;
    case 1:
      effTyp = 1;
      break;
    case 2:
      effTyp = 2;
      break;
    case 3:
      effTyp = 3;
      break;
    case 4:
      effTyp = 4;
      break;
    case 5:
      effTyp = 5;
      break;
    case 6:
      effTyp = 6;
      break;
    case 7:
      effTyp = 7;
      break;
    case 8:
      effTyp = 8;
      break;
    case 9:
      effTyp = 9;
      break;
    case 10:
      effTyp = 10;
      break;
    case 11:
      effTyp = 11;
      break;
    case 12:
      effTyp = 12;
      break;
    case 13:
      effTyp = 13;
      break;
    case 14:
      effTyp = 14;
      break;
    case 15:
      effTyp = 15;
      break;
    default:
      effTyp = modEffect;
      break;
  }
  return { effTyp, eff };
}
function nruFinetune(finetune) {
  if (finetune >= 0) return 0;
  const idx = finetune / -72;
  return (idx < 8 ? idx : idx - 16) * 16;
}
function isNRUFormat(buffer) {
  if (buffer.byteLength < HEADER_SIZE) return false;
  const v = new DataView(buffer);
  if (readString(v, MAGIC_OFFSET, 4) !== "M.K.") return false;
  const numOrders = u8(v, ORDER_OFFSET);
  if (numOrders === 0 || numOrders > 127) return false;
  let maxPattern = 0;
  for (let i = 0; i < 128; i++) {
    const pat = u8(v, ORDER_OFFSET + 2 + i);
    if (i < numOrders) {
      if (pat > 63) return false;
      if (pat > maxPattern) maxPattern = pat;
    } else {
      if (pat !== 0) return false;
    }
  }
  let totalSampleWords = 0;
  for (let s = 0; s < NUM_SAMPLES; s++) {
    const base = s * SAMPLE_HEADER_SIZE;
    const volume = u16(v, base + 0);
    const sampleAddr = u32(v, base + 2);
    const length = u16(v, base + 6);
    const loopStartAddr = u32(v, base + 8);
    const loopLength = u16(v, base + 12);
    const finetune = i16(v, base + 14);
    if (volume > 64) return false;
    if (sampleAddr > 2097151 || sampleAddr & 1) return false;
    if (length === 0) {
      if (loopStartAddr !== sampleAddr || loopLength !== 1) return false;
    } else {
      if (length >= 32768) return false;
      if (loopStartAddr < sampleAddr) return false;
      const loopStart = loopStartAddr - sampleAddr;
      if (loopStart >= length * 2) return false;
      if (loopStart + loopLength * 2 > length * 2) return false;
      totalSampleWords += length;
    }
    if (finetune < 0) {
      if (finetune < -1080 || finetune % 72 !== 0) return false;
    }
  }
  if (totalSampleWords < 32) return false;
  const numPatterns = maxPattern + 1;
  const requiredSize = HEADER_SIZE + numPatterns * BYTES_PER_PATTERN;
  if (buffer.byteLength < requiredSize) return false;
  for (let pat = 0; pat < numPatterns; pat++) {
    const patBase = HEADER_SIZE + pat * BYTES_PER_PATTERN;
    for (let row = 0; row < ROWS_PER_PATTERN; row++) {
      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        const cellOff = patBase + (row * NUM_CHANNELS + ch) * BYTES_PER_CELL;
        const d0 = u8(v, cellOff + 0);
        const d2 = u8(v, cellOff + 2);
        const d3 = u8(v, cellOff + 3);
        if (d0 & 3) return false;
        if (d2 > 72 || d2 & 1) return false;
        if (d3 & 7) return false;
      }
    }
  }
  return true;
}
async function parseNRUFile(buffer, filename) {
  var _a, _b;
  const _base = ((_a = filename.split("/").pop()) == null ? void 0 : _a.toLowerCase()) ?? "";
  if (!_base.endsWith(".nru") && !isNRUFormat(buffer)) {
    throw new Error("NRUParser: file does not pass NRU format validation");
  }
  const v = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const numOrders = u8(v, ORDER_OFFSET);
  const restartPos = u8(v, ORDER_OFFSET + 1);
  let maxPattern = 0;
  const orderList = [];
  for (let i = 0; i < numOrders; i++) {
    const pat = u8(v, ORDER_OFFSET + 2 + i);
    orderList.push(pat);
    if (pat > maxPattern) maxPattern = pat;
  }
  const numPatterns = maxPattern + 1;
  const sampleHeaders = [];
  for (let s = 0; s < NUM_SAMPLES; s++) {
    const base = s * SAMPLE_HEADER_SIZE;
    sampleHeaders.push({
      volume: u16(v, base + 0),
      sampleAddr: u32(v, base + 2),
      length: u16(v, base + 6),
      loopStartAddr: u32(v, base + 8),
      loopLength: u16(v, base + 12),
      finetune: i16(v, base + 14)
    });
  }
  const songName = filename.replace(/\.[^/.]+$/, "");
  const patterns = [];
  for (let pIdx = 0; pIdx < numPatterns; pIdx++) {
    const patBase = HEADER_SIZE + pIdx * BYTES_PER_PATTERN;
    const channels = Array.from(
      { length: NUM_CHANNELS },
      (_, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: CHANNEL_PAN[ch],
        instrumentId: null,
        color: null,
        rows: []
      })
    );
    for (let row = 0; row < ROWS_PER_PATTERN; row++) {
      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        const cellOff = patBase + (row * NUM_CHANNELS + ch) * BYTES_PER_CELL;
        const d0 = u8(v, cellOff + 0);
        const d1 = u8(v, cellOff + 1);
        const d2 = u8(v, cellOff + 2);
        const d3 = u8(v, cellOff + 3);
        const instrument = d3 >> 3;
        const xmNote = d2 > 0 ? d2 / 2 + 36 : 0;
        let modEffect;
        if (d0 === 0) {
          modEffect = 3;
        } else if (d0 === 12) {
          modEffect = 0;
        } else {
          modEffect = d0 >> 2;
        }
        let effTyp = 0;
        let eff = 0;
        if (modEffect !== 0 || d1 !== 0) {
          const converted = convertModEffect(modEffect, d1);
          effTyp = converted.effTyp;
          eff = converted.eff;
        }
        const cell = {
          note: xmNote,
          instrument,
          volume: 0,
          // NRU has no volume column
          effTyp,
          eff,
          effTyp2: 0,
          eff2: 0
        };
        channels[ch].rows.push(cell);
      }
    }
    patterns.push({
      id: `pattern-${pIdx}`,
      name: `Pattern ${pIdx}`,
      length: ROWS_PER_PATTERN,
      channels,
      importMetadata: {
        sourceFormat: "NRU",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: NUM_CHANNELS,
        originalPatternCount: numPatterns,
        originalInstrumentCount: NUM_SAMPLES
      }
    });
  }
  let pcmCursor = HEADER_SIZE + numPatterns * BYTES_PER_PATTERN;
  const samplePCM = [];
  for (let s = 0; s < NUM_SAMPLES; s++) {
    const hdr = sampleHeaders[s];
    const byteLen = hdr.length * 2;
    if (byteLen > 0 && pcmCursor + byteLen <= buffer.byteLength) {
      samplePCM.push(bytes.slice(pcmCursor, pcmCursor + byteLen));
    } else {
      samplePCM.push(null);
    }
    pcmCursor += byteLen;
  }
  const instruments = [];
  for (let s = 0; s < NUM_SAMPLES; s++) {
    const hdr = sampleHeaders[s];
    const id = s + 1;
    const pcm = samplePCM[s];
    if (!pcm || pcm.length === 0) {
      instruments.push({
        id,
        name: `Sample ${id}`,
        type: "sample",
        synthType: "Sampler",
        effects: [],
        volume: -60,
        pan: 0
      });
      continue;
    }
    let loopStart = 0;
    let loopEnd = 0;
    if (hdr.loopLength > 1) {
      loopStart = hdr.loopStartAddr - hdr.sampleAddr;
      loopEnd = loopStart + hdr.loopLength * 2;
      loopEnd = Math.min(loopEnd, pcm.length);
    }
    const finetune = nruFinetune(hdr.finetune);
    const instr = createSamplerInstrument(
      id,
      `Sample ${id}`,
      pcm,
      hdr.volume,
      SAMPLE_RATE,
      loopStart,
      loopEnd
    );
    if (finetune !== 0 && ((_b = instr.metadata) == null ? void 0 : _b.modPlayback)) {
      instr.metadata.modPlayback.finetune = finetune;
    }
    instruments.push(instr);
  }
  const uadePatternLayout = {
    formatId: "nru",
    patternDataFileOffset: HEADER_SIZE,
    bytesPerCell: BYTES_PER_CELL,
    rowsPerPattern: ROWS_PER_PATTERN,
    numChannels: NUM_CHANNELS,
    numPatterns,
    moduleSize: buffer.byteLength,
    encodeCell: encodeNRUCell
  };
  return {
    name: songName,
    format: "MOD",
    patterns,
    instruments,
    songPositions: orderList,
    songLength: orderList.length,
    restartPosition: restartPos,
    numChannels: NUM_CHANNELS,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadePatternLayout
  };
}
export {
  isNRUFormat,
  parseNRUFile
};
