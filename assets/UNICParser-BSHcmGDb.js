import { b$ as registerPatternEncoder, c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function encodeUNICCell(cell) {
  const out = new Uint8Array(3);
  const note = cell.note ?? 0;
  const instr = cell.instrument ?? 0;
  let noteIdx = 0;
  if (note > 0 && note >= 37) {
    noteIdx = Math.min(63, note - 36);
  }
  const instrHi = (instr & 48) << 2;
  out[0] = instrHi | noteIdx & 63;
  const instrLo = (instr & 15) << 4;
  out[1] = instrLo | (cell.effTyp ?? 0) & 15;
  out[2] = (cell.eff ?? 0) & 255;
  return out;
}
registerPatternEncoder("unic", () => encodeUNICCell);
function u8(v, off) {
  return v.getUint8(off);
}
function i8(v, off) {
  return v.getInt8(off);
}
function u16(v, off) {
  return v.getUint16(off, false);
}
function i16(v, off) {
  return v.getInt16(off, false);
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
function hasInvalidChars(v, off, len) {
  for (let i = 0; i < len; i++) {
    const ch = v.getUint8(off + i);
    if (ch !== 0 && (ch < 32 || ch > 126)) return true;
  }
  return false;
}
const HEADER_SIZE = 1084;
const BYTES_PER_PATTERN = 768;
const NUM_CHANNELS = 4;
const ROWS_PER_PATTERN = 64;
const MAX_SAMPLES = 31;
const SAMPLE_RATE = 8287;
const UNIC_NOTE_OFFSET = 12;
const CHANNEL_PAN = [-50, 50, 50, -50];
function mod2XMFinetune(negatedRawFinetune) {
  let idx = negatedRawFinetune;
  if (idx < 0) idx = 0;
  idx = idx & 15;
  const table = [0, 16, 32, 48, 64, 80, 96, 112, -128, -112, -96, -80, -64, -48, -32, -16];
  return table[idx];
}
function isValidSampleHeader(v, base) {
  if (hasInvalidChars(v, base, 20)) return false;
  const finetune = i16(v, base + 20);
  if (finetune < -42 || finetune > 8) return false;
  if (i8(v, base + 24) !== 0) return false;
  if (u8(v, base + 25) > 64) return false;
  const length = u16(v, base + 22);
  const loopStart = u16(v, base + 26);
  const loopLen = u16(v, base + 28);
  if (length >= 32768) return false;
  if (loopStart >= 32768) return false;
  if (loopLen >= 32768) return false;
  if (!length && (loopStart > 0 || loopLen > 1 || finetune !== 0)) return false;
  if (length && length < loopStart + loopLen) return false;
  return true;
}
function isValidPatternCell(v, off, lastSample) {
  const b0 = u8(v, off);
  const b1 = u8(v, off + 1);
  const b2 = u8(v, off + 2);
  if (b0 > 116) return false;
  if ((b0 & 63) > 36) return false;
  const command = b1 & 15;
  const param = b2;
  if (command === 12 && param > 80) return false;
  if (command === 11 && param > 127) return false;
  if (command === 13 && param > 64) return false;
  const instr = b0 >> 2 & 48 | b1 >> 4 & 15;
  if (instr > lastSample) return false;
  return true;
}
function isUNICFormat(buffer) {
  if (buffer.byteLength < HEADER_SIZE + BYTES_PER_PATTERN) return false;
  const v = new DataView(buffer);
  const magic = readString(v, 1080, 4);
  const b1080 = u8(v, 1080);
  const b1081 = u8(v, 1081);
  const b1082 = u8(v, 1082);
  const b1083 = u8(v, 1083);
  const isNullMagic = b1080 === 0 && b1081 === 0 && b1082 === 0 && b1083 === 0;
  const isMKMagic = magic === "M.K.";
  const isUNICMagic = magic === "UNIC";
  if (!isMKMagic && !isUNICMagic && !isNullMagic) return false;
  if (hasInvalidChars(v, 0, 20)) return false;
  let totalSampleBytes = 0;
  let lastSample = 0;
  for (let s = 0; s < MAX_SAMPLES; s++) {
    const base = 20 + s * 30;
    if (!isValidSampleHeader(v, base)) return false;
    const len = u16(v, base + 22);
    totalSampleBytes += len * 2;
    if (len > 0) lastSample = s + 1;
  }
  if (totalSampleBytes < 256) return false;
  const numOrders = u8(v, 950);
  if (numOrders === 0 || numOrders >= 128) return false;
  let maxPattern = 0;
  for (let i = 0; i < 128; i++) {
    const pat = u8(v, 952 + i);
    if (pat >= 128) return false;
    if (i > numOrders + 1 && pat !== 0) return false;
    if (pat > maxPattern) maxPattern = pat;
  }
  const numPatterns = maxPattern + 1;
  let numNotes = 0;
  let allInstrs = 0;
  const firstPatBase = HEADER_SIZE;
  for (let cell = 0; cell < ROWS_PER_PATTERN * NUM_CHANNELS; cell++) {
    const off = firstPatBase + cell * 3;
    if (!isValidPatternCell(v, off, lastSample)) return false;
    const b0 = u8(v, off);
    const b1 = u8(v, off + 1);
    const noteIdx = b0 & 63;
    const instr = b0 >> 2 & 48 | b1 >> 4 & 15;
    if (noteIdx > 0) numNotes++;
    allInstrs |= instr;
  }
  if (numNotes < 16 || allInstrs === 0) return false;
  const patternDataSize = numPatterns * BYTES_PER_PATTERN;
  if (buffer.byteLength < HEADER_SIZE + patternDataSize + totalSampleBytes) return false;
  return true;
}
async function parseUNICFile(buffer, filename) {
  var _a;
  if (!isUNICFormat(buffer)) {
    throw new Error("UNICParser: file does not pass UNIC format validation");
  }
  const v = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const songName = readString(v, 0, 20) || filename.replace(/\.[^/.]+$/, "");
  const numOrders = u8(v, 950);
  const restartPos = u8(v, 951);
  let numPatterns = 0;
  for (let i = 0; i < 128; i++) {
    const pat = u8(v, 952 + i);
    if (pat + 1 > numPatterns) numPatterns = pat + 1;
  }
  const orderList = [];
  for (let i = 0; i < numOrders; i++) {
    orderList.push(u8(v, 952 + i));
  }
  const sampleHeaders = [];
  for (let s = 0; s < MAX_SAMPLES; s++) {
    const base = 20 + s * 30;
    const rawFT = i16(v, base + 20);
    const xmFinetune = mod2XMFinetune(-rawFT);
    sampleHeaders.push({
      name: readString(v, base, 20) || `Sample ${s + 1}`,
      length: u16(v, base + 22),
      volume: u8(v, base + 25),
      loopStart: u16(v, base + 26),
      loopLen: u16(v, base + 28),
      finetune: xmFinetune
    });
  }
  const patterns = [];
  let numNotes = 0;
  let allInstrs = 0;
  let lastSample = 0;
  for (let s = 0; s < MAX_SAMPLES; s++) {
    if (sampleHeaders[s].length > 0) lastSample = s + 1;
  }
  for (let pIdx = 0; pIdx < numPatterns; pIdx++) {
    const patternBase = HEADER_SIZE + pIdx * BYTES_PER_PATTERN;
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
        const cellOff = patternBase + (row * NUM_CHANNELS + ch) * 3;
        const b0 = u8(v, cellOff);
        const b1 = u8(v, cellOff + 1);
        const b2 = u8(v, cellOff + 2);
        if (!isValidPatternCell(v, cellOff, lastSample)) {
          throw new Error(
            `UNICParser: invalid cell at pattern ${pIdx} row ${row} ch ${ch}`
          );
        }
        const noteIdx = b0 & 63;
        const instrHi = b0 >> 2 & 48;
        const instrLo = b1 >> 4 & 15;
        const instr = instrHi | instrLo;
        const command = b1 & 15;
        const param = b2;
        const xmNote = noteIdx > 0 ? noteIdx + UNIC_NOTE_OFFSET : 0;
        if (noteIdx > 0) numNotes++;
        allInstrs |= instr;
        const cell = {
          note: xmNote,
          instrument: instr,
          volume: 0,
          // UNIC has no volume column
          effTyp: command,
          eff: param,
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
        sourceFormat: "UNIC",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: NUM_CHANNELS,
        originalPatternCount: numPatterns,
        originalInstrumentCount: MAX_SAMPLES
      }
    });
  }
  if (numNotes < 16 || allInstrs === 0) {
    throw new Error("UNICParser: insufficient note/instrument data across all patterns");
  }
  let pcmCursor = HEADER_SIZE + numPatterns * BYTES_PER_PATTERN;
  const instruments = [];
  for (let s = 0; s < MAX_SAMPLES; s++) {
    const hdr = sampleHeaders[s];
    const byteLen = hdr.length * 2;
    if (byteLen === 0 || pcmCursor + byteLen > buffer.byteLength) {
      pcmCursor += byteLen;
      instruments.push({
        id: s + 1,
        name: hdr.name,
        type: "sample",
        synthType: "Sampler",
        effects: [],
        volume: -60,
        pan: 0
      });
      continue;
    }
    const pcm = bytes.slice(pcmCursor, pcmCursor + byteLen);
    pcmCursor += byteLen;
    let loopStart = hdr.loopStart * 2;
    let loopEnd = (hdr.loopStart + hdr.loopLen) * 2;
    if (hdr.loopLen > 1) {
      if (hdr.loopStart > 0 && loopStart + loopEnd >= byteLen - 2 && loopStart + loopEnd <= byteLen) {
        loopEnd += loopStart;
        loopStart += loopStart;
      }
      loopEnd = Math.min(loopEnd, pcm.length);
    } else {
      loopStart = 0;
      loopEnd = 0;
    }
    const inst = createSamplerInstrument(
      s + 1,
      hdr.name,
      pcm,
      hdr.volume,
      SAMPLE_RATE,
      loopStart,
      loopEnd
    );
    if ((_a = inst.metadata) == null ? void 0 : _a.modPlayback) {
      inst.metadata.modPlayback.finetune = hdr.finetune;
    }
    instruments.push(inst);
  }
  const uadePatternLayout = {
    formatId: "unic",
    patternDataFileOffset: HEADER_SIZE,
    bytesPerCell: 3,
    rowsPerPattern: ROWS_PER_PATTERN,
    numChannels: NUM_CHANNELS,
    numPatterns,
    moduleSize: buffer.byteLength,
    encodeCell: encodeUNICCell,
    getCellFileOffset: (pattern, row, channel) => HEADER_SIZE + pattern * (ROWS_PER_PATTERN * NUM_CHANNELS * 3) + row * (NUM_CHANNELS * 3) + channel * 3
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
  isUNICFormat,
  parseUNICFile
};
