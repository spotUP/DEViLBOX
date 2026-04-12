import { b$ as registerPatternEncoder, c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function reversePLMEffect(effTyp, eff) {
  if (effTyp === 0 && eff === 0) return { cmd: 0, param: 0 };
  switch (effTyp) {
    case 1:
      return { cmd: 1, param: eff };
    // portamento up
    case 2:
      return { cmd: 2, param: eff };
    // portamento down
    case 3:
      return { cmd: 3, param: eff };
    // tone portamento
    case 4:
      return { cmd: 4, param: eff };
    // vibrato
    case 5:
      return { cmd: 5, param: eff };
    // tone porta + vol slide
    case 6:
      return { cmd: 6, param: eff };
    // vibrato + vol slide
    case 7:
      return { cmd: 7, param: eff };
    // tremolo
    case 8:
      return { cmd: 8, param: eff };
    // panning
    case 9:
      return { cmd: 9, param: eff };
    // sample offset
    case 10:
      return { cmd: 10, param: eff };
    // volume slide
    case 11:
      return { cmd: 11, param: eff };
    // position jump
    case 12:
      return { cmd: 12, param: eff };
    // set volume
    case 13:
      return { cmd: 13, param: eff };
    // pattern break
    case 14:
      return { cmd: 14, param: eff };
    // extended
    case 15:
      return { cmd: 15, param: eff };
    // set speed/tempo
    default:
      return { cmd: 0, param: 0 };
  }
}
function encodePLMCell(cell) {
  const out = new Uint8Array(5);
  const note = cell.note ?? 0;
  if (note > 0 && note >= 37) {
    const raw = note - 37;
    const octave = Math.floor(raw / 12);
    const semi = raw % 12;
    out[0] = octave << 4 | semi;
  } else {
    out[0] = 0;
  }
  out[1] = (cell.instrument ?? 0) & 255;
  out[2] = (cell.volume ?? 0) & 255;
  const { cmd, param } = reversePLMEffect(cell.effTyp ?? 0, cell.eff ?? 0);
  out[3] = cmd & 255;
  out[4] = param & 255;
  return out;
}
registerPatternEncoder("plm", () => encodePLMCell);
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
    const ch = v.getUint8(off + i);
    if (ch === 0) break;
    s += String.fromCharCode(ch);
  }
  return s.replace(/\s+$/, "");
}
const PLM_VERSION = 16;
const ROWS_PER_PAT = 64;
const MAX_CHANNELS = 32;
const SMP_16BIT = 1;
const SMP_PINGPONG = 2;
const EFF_TRANS = [
  0,
  //  0 — none
  1,
  //  1 — portamento up
  2,
  //  2 — portamento down
  3,
  //  3 — tone portamento
  10,
  //  4 — volume slide
  7,
  //  5 — tremolo
  4,
  //  6 — vibrato
  14,
  //  7 — S3M Sxx: tremolo waveform  (param = 0x40|(p&3))
  14,
  //  8 — S3M Sxx: vibrato waveform  (param = 0x30|(p&3))
  15,
  //  9 — tempo (BPM ≥ 0x20 in XM convention)
  15,
  // 10 — speed (ticks per row)
  11,
  // 11 — position jump (to order)
  11,
  // 12 — position jump (break to end of order)
  9,
  // 13 — sample offset
  14,
  // 14 — S3M Sxx: GUS panning       (param = 0x80|(p&0xF))
  27,
  // 15 — retrigger
  14,
  // 16 — S3M Sxx: note delay        (param = 0xD0|min(p,0xF))
  14,
  // 17 — S3M Sxx: note cut          (param = 0xC0|min(p,0xF))
  14,
  // 18 — S3M Sxx: pattern delay     (param = 0xE0|min(p,0xF))
  21,
  // 19 — fine vibrato
  6,
  // 20 — vibrato + volume slide
  5,
  // 21 — tone portamento + volume slide
  9
  // 22 — offset percentage (treated as sample offset)
];
function plmPanToChannelPan(panByte) {
  const raw = Math.min(panByte, 15) * 17;
  return Math.round((raw - 128) * 50 / 128);
}
function isPLMFormat(buffer) {
  if (buffer.byteLength < 96) return false;
  const v = new DataView(buffer);
  if (u8(v, 0) !== 80) return false;
  if (u8(v, 1) !== 76) return false;
  if (u8(v, 2) !== 77) return false;
  if (u8(v, 3) !== 26) return false;
  const headerSize = u8(v, 4);
  const version = u8(v, 5);
  const numChannels = u8(v, 54);
  if (version !== PLM_VERSION) return false;
  if (numChannels < 1) return false;
  if (numChannels > MAX_CHANNELS) return false;
  if (headerSize < 96) return false;
  return true;
}
function transformEffect(cmd, param) {
  if (cmd >= EFF_TRANS.length) return [0, 0];
  const effTyp = EFF_TRANS[cmd];
  let effParam = param;
  switch (cmd) {
    case 7:
      effParam = 64 | param & 3;
      break;
    case 8:
      effParam = 48 | param & 3;
      break;
    case 14:
      effParam = 128 | param & 15;
      break;
    case 16:
      effParam = 208 | Math.min(param, 15);
      break;
    case 17:
      effParam = 192 | Math.min(param, 15);
      break;
    case 18:
      effParam = 224 | Math.min(param, 15);
      break;
    case 4:
    // Volume slide
    case 20:
    // Vibrato + volume slide
    case 21:
      if (param & 240 && param & 15 && (param & 240) !== 240) {
        effParam = param | 15;
      }
      break;
  }
  return [effTyp, effParam];
}
async function parsePLMFile(buffer, filename) {
  var _a;
  if (!isPLMFormat(buffer)) {
    throw new Error("PLMParser: file does not pass PLM format validation");
  }
  const v = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const headerSize = u8(v, 4);
  const songName = readString(v, 6, 48) || filename.replace(/\.[^/.]+$/, "");
  const numChannels = u8(v, 54);
  const tempo = u8(v, 58);
  const speed = u8(v, 59);
  const panPos = [];
  for (let c = 0; c < MAX_CHANNELS; c++) {
    panPos.push(u8(v, 60 + c));
  }
  const numSamples = u8(v, 92);
  const numPatterns = u8(v, 93);
  const numOrders = u16le(v, 94);
  let cursor = headerSize;
  const orderItems = [];
  for (let i = 0; i < numOrders; i++) {
    orderItems.push({
      x: u16le(v, cursor),
      y: u8(v, cursor + 2),
      pattern: u8(v, cursor + 3)
    });
    cursor += 4;
  }
  const patternOffsets = [];
  for (let i = 0; i < numPatterns; i++) {
    patternOffsets.push(u32le(v, cursor));
    cursor += 4;
  }
  const sampleOffsets = [];
  for (let i = 0; i < numSamples; i++) {
    sampleOffsets.push(u32le(v, cursor));
    cursor += 4;
  }
  const sampleMeta = [];
  for (let smp = 0; smp < numSamples; smp++) {
    const smpOff = sampleOffsets[smp];
    if (smpOff === 0 || smpOff + 71 > buffer.byteLength || u8(v, smpOff + 0) !== 80 || // 'P'
    u8(v, smpOff + 1) !== 76 || // 'L'
    u8(v, smpOff + 2) !== 83 || // 'S'
    u8(v, smpOff + 3) !== 26) {
      sampleMeta.push(makeEmptySampleMeta(smp));
      continue;
    }
    const smpHeaderSize = u8(v, smpOff + 4);
    const smpName = readString(v, smpOff + 6, 32) || `Sample ${smp + 1}`;
    const panningByte = u8(v, smpOff + 50);
    const volume = Math.min(u8(v, smpOff + 51), 64);
    const flags = u8(v, smpOff + 52);
    const sampleRate = u16le(v, smpOff + 53);
    const loopStartBytes = u32le(v, smpOff + 59);
    const loopEndBytes = u32le(v, smpOff + 63);
    const lengthBytes = u32le(v, smpOff + 67);
    const is16Bit = (flags & SMP_16BIT) !== 0;
    const isPingPong = (flags & SMP_PINGPONG) !== 0;
    const divisor = is16Bit ? 2 : 1;
    const loopStart = Math.floor(loopStartBytes / divisor);
    const loopEnd = Math.floor(loopEndBytes / divisor);
    const length = Math.floor(lengthBytes / divisor);
    sampleMeta.push({
      name: smpName,
      panning: panningByte <= 15 ? panningByte * 17 : null,
      volume,
      is16Bit,
      isPingPong,
      sampleRate: sampleRate || 8363,
      // default to FT2 C-5 rate if zero
      loopStart,
      loopEnd,
      length,
      pcmOffset: smpOff + smpHeaderSize,
      pcmBytes: lengthBytes
      // raw byte count before /2 adjustment
    });
  }
  const patternCells = /* @__PURE__ */ new Map();
  const cellFileOffsets = /* @__PURE__ */ new Map();
  let maxAbsRow = 0;
  for (const ord of orderItems) {
    if (ord.pattern >= numPatterns) continue;
    if (ord.y >= numChannels) continue;
    const patOff = patternOffsets[ord.pattern];
    if (patOff === 0 || patOff + 32 > buffer.byteLength) continue;
    const patNumRows = u8(v, patOff + 4);
    const patNumChans = u8(v, patOff + 5);
    if (patNumRows === 0) continue;
    const writableChans = Math.min(patNumChans, numChannels - ord.y);
    let absRow = ord.x;
    let cellOff = patOff + 32;
    for (let r = 0; r < patNumRows; r++, absRow++) {
      const chunkIdx = Math.floor(absRow / ROWS_PER_PAT);
      const rowInChunk = absRow % ROWS_PER_PAT;
      if (!patternCells.has(chunkIdx)) {
        const grid2 = [];
        for (let ch = 0; ch < numChannels; ch++) {
          const col = [];
          for (let row = 0; row < ROWS_PER_PAT; row++) {
            col.push(makeEmptyCell());
          }
          grid2.push(col);
        }
        patternCells.set(chunkIdx, grid2);
      }
      const grid = patternCells.get(chunkIdx);
      for (let c = 0; c < patNumChans; c++, cellOff += 5) {
        if (cellOff + 5 > buffer.byteLength) break;
        const noteByte = u8(v, cellOff);
        const instr = u8(v, cellOff + 1);
        const volByte = u8(v, cellOff + 2);
        const cmd = u8(v, cellOff + 3);
        const param = u8(v, cellOff + 4);
        if (c >= writableChans) continue;
        const destCh = ord.y + c;
        if (destCh >= numChannels) continue;
        cellFileOffsets.set(`${chunkIdx}:${rowInChunk}:${destCh}`, cellOff);
        let note = 0;
        if (noteByte > 0 && noteByte < 144) {
          note = (noteByte >> 4) * 12 + (noteByte & 15) + 12 + 1;
        }
        const volume = volByte !== 255 ? 16 + Math.min(volByte, 64) : 0;
        const [effTyp, eff] = transformEffect(cmd, param);
        grid[destCh][rowInChunk] = {
          note,
          instrument: instr,
          volume,
          effTyp,
          eff,
          effTyp2: 0,
          eff2: 0
        };
      }
      maxAbsRow = Math.max(maxAbsRow, absRow);
    }
  }
  const chunkIndices = Array.from(patternCells.keys()).sort((a, b) => a - b);
  const maxChunk = chunkIndices.length > 0 ? chunkIndices[chunkIndices.length - 1] : 0;
  const songPositions = [];
  const patterns = [];
  for (let ci = 0; ci <= maxChunk; ci++) {
    songPositions.push(ci);
    const grid = patternCells.get(ci);
    let numRows = ROWS_PER_PAT;
    if (ci === Math.floor(maxAbsRow / ROWS_PER_PAT)) {
      const usedRows = maxAbsRow % ROWS_PER_PAT + 1;
      if (usedRows < ROWS_PER_PAT) numRows = usedRows;
    }
    const channels = [];
    for (let ch = 0; ch < numChannels; ch++) {
      const rows = [];
      for (let row = 0; row < numRows; row++) {
        rows.push(((_a = grid == null ? void 0 : grid[ch]) == null ? void 0 : _a[row]) ?? makeEmptyCell());
      }
      channels.push({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: plmPanToChannelPan(panPos[ch] ?? 7),
        instrumentId: null,
        color: null,
        rows
      });
    }
    patterns.push({
      id: `pattern-${ci}`,
      name: `Pattern ${ci}`,
      length: numRows,
      channels,
      importMetadata: {
        sourceFormat: "PLM",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: numChannels,
        originalPatternCount: numPatterns,
        originalInstrumentCount: numSamples
      }
    });
  }
  const instruments = [];
  for (let smp = 0; smp < numSamples; smp++) {
    const meta = sampleMeta[smp];
    const id = smp + 1;
    if (meta.length === 0 || meta.pcmOffset === 0 || meta.pcmOffset + meta.pcmBytes > buffer.byteLength) {
      instruments.push(makeSilentInstrument(id, meta.name));
      continue;
    }
    const rawPcm = bytes.slice(meta.pcmOffset, meta.pcmOffset + meta.pcmBytes);
    const signed8 = new Uint8Array(meta.length);
    if (meta.is16Bit) {
      for (let i = 0; i < meta.length; i++) {
        const hi = rawPcm[i * 2 + 1] ?? 128;
        signed8[i] = hi ^ 128;
      }
    } else {
      for (let i = 0; i < meta.length; i++) {
        signed8[i] = rawPcm[i] ^ 128;
      }
    }
    const hasLoop = meta.loopEnd > meta.loopStart;
    const loopStart = hasLoop ? meta.loopStart : 0;
    const loopEnd = hasLoop ? Math.min(meta.loopEnd, meta.length) : 0;
    const instrument = createSamplerInstrument(
      id,
      meta.name,
      signed8,
      meta.volume,
      meta.sampleRate,
      loopStart,
      loopEnd
    );
    if (hasLoop && meta.isPingPong && instrument.sample) {
      instrument.sample.loopType = "pingpong";
    }
    instruments.push(instrument);
  }
  const uadePatternLayout = {
    formatId: "plm",
    patternDataFileOffset: patternOffsets.length > 0 ? patternOffsets[0] + 32 : 0,
    bytesPerCell: 5,
    rowsPerPattern: ROWS_PER_PAT,
    numChannels,
    numPatterns,
    moduleSize: buffer.byteLength,
    encodeCell: encodePLMCell,
    getCellFileOffset: (pattern, row, channel) => {
      const key = `${pattern}:${row}:${channel}`;
      return cellFileOffsets.get(key) ?? 0;
    }
  };
  return {
    name: songName,
    format: "MOD",
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels,
    initialSpeed: speed || 6,
    initialBPM: tempo || 125,
    linearPeriods: false,
    uadePatternLayout
  };
}
function makeEmptyCell() {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}
function makeEmptySampleMeta(idx) {
  return {
    name: `Sample ${idx + 1}`,
    panning: null,
    volume: 64,
    is16Bit: false,
    isPingPong: false,
    sampleRate: 8363,
    loopStart: 0,
    loopEnd: 0,
    length: 0,
    pcmOffset: 0,
    pcmBytes: 0
  };
}
function makeSilentInstrument(id, name) {
  return {
    id,
    name,
    type: "sample",
    synthType: "Sampler",
    effects: [],
    volume: -60,
    pan: 0
  };
}
export {
  isPLMFormat,
  parsePLMFile
};
