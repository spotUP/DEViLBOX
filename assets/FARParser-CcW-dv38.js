import { b$ as registerPatternEncoder, c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function reverseFAREffect(effTyp, eff) {
  if (effTyp === 0 && eff === 0) return 0;
  switch (effTyp) {
    case 1:
      return 1 << 4 | eff & 15;
    // portamento up
    case 2:
      return 2 << 4 | eff & 15;
    // portamento down
    case 3:
      return 3 << 4 | eff & 15;
    // tone portamento
    case 4:
      return 4 << 4 | eff & 15;
    // retrigger
    case 5:
      return 5 << 4 | eff & 15;
    // vibrato depth
    case 10: {
      const up = eff >> 4 & 15;
      const down = eff & 15;
      if (up > 0) return 7 << 4 | up & 15;
      return 8 << 4 | down & 15;
    }
    case 14:
      return 11 << 4 | eff & 15;
    // panning
    case 15:
      return 15 << 4 | eff & 15;
    // set speed
    default:
      return 0;
  }
}
function encodeFARCell(cell) {
  const out = new Uint8Array(4);
  const note = cell.note ?? 0;
  if (note > 0 && note > 36) {
    out[0] = Math.min(72, note - 36);
  } else {
    out[0] = 0;
  }
  const instr = cell.instrument ?? 0;
  out[1] = instr > 0 ? instr - 1 & 255 : 0;
  const vol = cell.volume ?? 0;
  if (vol > 0) {
    out[2] = Math.min(16, Math.round(vol * 15 / 64) + 1);
  } else {
    out[2] = 0;
  }
  out[3] = reverseFAREffect(cell.effTyp ?? 0, cell.eff ?? 0);
  return out;
}
registerPatternEncoder("far", () => encodeFARCell);
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
const FAR_MAGIC = "FARþ";
const FAR_EOF = [13, 10, 26];
const FILE_HEADER_SIZE = 98;
const ORDER_HEADER_SIZE = 771;
const SAMPLE_HEADER_SIZE = 48;
const NUM_CHANNELS = 16;
const MAX_PATTERNS = 256;
const MAX_SAMPLES = 64;
const INITIAL_BPM = 80;
const FAR_C5_SPEED = 16726;
const SMP_16BIT = 1;
const SMP_LOOP = 8;
const FAR_EFFECTS = [
  0,
  // 0x0 = none
  1,
  // 0x1 = portamento up
  2,
  // 0x2 = portamento down
  3,
  // 0x3 = tone portamento
  4,
  // 0x4 = retrig           (CMD_RETRIG mapped to XM Rxy via 0x1B, but OpenMPT uses 0x04 directly — see below)
  5,
  // 0x5 = vibrato depth    (CMD_VIBRATO)
  5,
  // 0x6 = vibrato speed    (CMD_VIBRATO)
  10,
  // 0x7 = volume slide up  (CMD_VOLUMESLIDE)
  10,
  // 0x8 = volume slide down (CMD_VOLUMESLIDE)
  5,
  // 0x9 = vibrato sustained (CMD_VIBRATO)
  0,
  // 0xA = vol+portamento   (handled specially — see below)
  14,
  // 0xB = panning          (CMD_S3MCMDEX → extended effect 0x8x)
  14,
  // 0xC = note offset/delay (CMD_S3MCMDEX → extended effect 0xDx)
  0,
  // 0xD = fine tempo down  (CMD_NONE — ignored)
  0,
  // 0xE = fine tempo up    (CMD_NONE — ignored)
  15
  // 0xF = speed            (CMD_SPEED)
];
function isFARFormat(buffer) {
  if (buffer.byteLength < FILE_HEADER_SIZE) return false;
  const v = new DataView(buffer);
  for (let i = 0; i < 4; i++) {
    if (u8(v, i) !== FAR_MAGIC.charCodeAt(i)) return false;
  }
  for (let i = 0; i < 3; i++) {
    if (u8(v, 44 + i) !== FAR_EOF[i]) return false;
  }
  const headerLength = u16(v, 47);
  if (headerLength < FILE_HEADER_SIZE) return false;
  return true;
}
function convertFAREffect(effectByte) {
  const type = effectByte >> 4 & 15;
  let param = effectByte & 15;
  switch (type) {
    case 0:
      return { effTyp: 0, eff: 0 };
    case 1:
    case 2:
      param |= 240;
      return { effTyp: FAR_EFFECTS[type], eff: param };
    case 3:
      if (param !== 0) param = Math.min(255, Math.floor(60 / param));
      return { effTyp: FAR_EFFECTS[type], eff: param };
    case 4:
      param = Math.floor(6 / (1 + (param & 15))) + 1;
      return { effTyp: FAR_EFFECTS[type], eff: param };
    case 5:
      return { effTyp: FAR_EFFECTS[type], eff: param };
    case 6:
      param = Math.min(255, param * 8);
      return { effTyp: FAR_EFFECTS[type], eff: param };
    case 7:
      param = Math.min(15, Math.floor(param * 8 / 16));
      return { effTyp: FAR_EFFECTS[type], eff: Math.min(255, (effectByte & 15) * 8) };
    case 8:
      return { effTyp: FAR_EFFECTS[type], eff: param };
    case 9:
      return { effTyp: FAR_EFFECTS[type], eff: param };
    case 10: {
      const vol = Math.min(255, (param << 2) + 4);
      return { effTyp: 0, eff: 0, volColOverride: vol, skipEffect: true };
    }
    case 11:
      param |= 128;
      return { effTyp: FAR_EFFECTS[type], eff: param };
    case 12:
      param = Math.floor(6 / (1 + param)) + 1;
      param = 13 << 4 | param & 15;
      return { effTyp: FAR_EFFECTS[type], eff: param };
    case 13:
    // Fine tempo down — ignored
    case 14:
      return { effTyp: 0, eff: 0 };
    case 15:
      return { effTyp: FAR_EFFECTS[type], eff: param };
    default:
      return { effTyp: 0, eff: 0 };
  }
}
async function parseFARFile(buffer, filename) {
  if (!isFARFormat(buffer)) {
    throw new Error("FARParser: file does not pass FAR format validation");
  }
  const v = new DataView(buffer);
  const raw = new Uint8Array(buffer);
  const songName = readString(v, 4, 40) || filename.replace(/\.[^/.]+$/, "");
  const headerLength = u16(v, 47);
  const defaultSpeed = u8(v, 75);
  const messageLength = u16(v, 96);
  const initialSpeed = defaultSpeed > 0 ? defaultSpeed : 6;
  const channelMuted = [];
  const channelPan = [];
  for (let ch = 0; ch < NUM_CHANNELS; ch++) {
    channelMuted.push(u8(v, 50 + ch) === 0);
    const panRaw = ((u8(v, 76 + ch) & 15) << 4) + 8;
    channelPan.push(Math.round((panRaw - 128) / 128 * 100));
  }
  const orderHeaderOff = FILE_HEADER_SIZE + messageLength;
  if (buffer.byteLength < orderHeaderOff + ORDER_HEADER_SIZE) {
    throw new Error("FARParser: file truncated reading order header");
  }
  const numOrders = u8(v, orderHeaderOff + 257);
  const restartPos = u8(v, orderHeaderOff + 258);
  const orderList = [];
  for (let i = 0; i < numOrders; i++) {
    const ord = u8(v, orderHeaderOff + i);
    if (ord === 255) break;
    orderList.push(ord);
  }
  const patternSizes = [];
  for (let p = 0; p < MAX_PATTERNS; p++) {
    patternSizes.push(u16(v, orderHeaderOff + 259 + p * 2));
  }
  let cursor = headerLength;
  const patterns = new Array(MAX_PATTERNS).fill(null);
  const patternCellOffsets = new Array(MAX_PATTERNS).fill(0);
  const patternRowCounts = new Array(MAX_PATTERNS).fill(0);
  for (let pat = 0; pat < MAX_PATTERNS; pat++) {
    const chunkSize = patternSizes[pat];
    if (chunkSize === 0) continue;
    if (cursor + chunkSize > buffer.byteLength) {
      cursor += chunkSize;
      continue;
    }
    const numRows = Math.floor((chunkSize - 2) / (NUM_CHANNELS * 4));
    if (numRows <= 0) {
      cursor += chunkSize;
      continue;
    }
    const breakRow = u8(v, cursor);
    cursor += 2;
    patternCellOffsets[pat] = cursor;
    patternRowCounts[pat] = numRows;
    let effectiveBreakRow = -1;
    if (breakRow > 0 && breakRow < numRows - 2) {
      effectiveBreakRow = breakRow + 1;
    }
    const channels = Array.from(
      { length: NUM_CHANNELS },
      (_, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: channelMuted[ch],
        solo: false,
        collapsed: false,
        volume: 100,
        pan: channelPan[ch],
        instrumentId: null,
        color: null,
        rows: []
      })
    );
    for (let row = 0; row < numRows; row++) {
      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        const cellOff = cursor + (row * NUM_CHANNELS + ch) * 4;
        const noteRaw = u8(v, cellOff);
        const instrRaw = u8(v, cellOff + 1);
        const volRaw = u8(v, cellOff + 2);
        const effByte = u8(v, cellOff + 3);
        let xmNote = 0;
        let xmInstr = 0;
        if (noteRaw > 0 && noteRaw <= 72) {
          xmNote = noteRaw + 36;
          xmInstr = instrRaw + 1;
        }
        let volumeCol = 0;
        if (volRaw > 0 && volRaw <= 16) {
          const volVal = Math.round((volRaw - 1) * 64 / 15);
          volumeCol = 16 + volVal;
        }
        const fx = convertFAREffect(effByte);
        let finalVolCol = volumeCol;
        let finalEffTyp = fx.effTyp;
        let finalEff = fx.eff;
        if (fx.skipEffect && fx.volColOverride !== void 0) {
          const volColVal = Math.min(64, fx.volColOverride);
          finalVolCol = 16 + volColVal;
          finalEffTyp = 0;
          finalEff = 0;
        }
        const cell = {
          note: xmNote,
          instrument: xmInstr,
          volume: finalVolCol,
          effTyp: finalEffTyp,
          eff: finalEff,
          effTyp2: 0,
          eff2: 0
        };
        if (row === effectiveBreakRow) {
          if (cell.effTyp === 0 && cell.eff === 0) {
            cell.effTyp = 13;
            cell.eff = 0;
          } else {
            cell.effTyp2 = 13;
            cell.eff2 = 0;
          }
        }
        channels[ch].rows.push(cell);
      }
    }
    cursor += numRows * NUM_CHANNELS * 4;
    patterns[pat] = {
      id: `pattern-${pat}`,
      name: `Pattern ${pat}`,
      length: numRows,
      channels,
      importMetadata: {
        sourceFormat: "FAR",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: NUM_CHANNELS,
        originalPatternCount: MAX_PATTERNS,
        originalInstrumentCount: MAX_SAMPLES
      }
    };
  }
  const uadePatternLayout = {
    formatId: "far",
    patternDataFileOffset: headerLength,
    // patterns start at headerLength
    bytesPerCell: 4,
    rowsPerPattern: 64,
    // variable per pattern, but this is the nominal value
    numChannels: NUM_CHANNELS,
    numPatterns: MAX_PATTERNS,
    moduleSize: buffer.byteLength,
    encodeCell: encodeFARCell,
    getCellFileOffset: (pattern, row, channel) => {
      const cellDataStart = patternCellOffsets[pattern];
      if (cellDataStart === 0) return 0;
      return cellDataStart + (row * NUM_CHANNELS + channel) * 4;
    }
  };
  if (cursor + 8 > buffer.byteLength) {
    return assembleSong(
      songName,
      orderList,
      restartPos,
      patterns,
      [],
      initialSpeed,
      NUM_CHANNELS,
      uadePatternLayout
    );
  }
  const sampleMap = new Uint8Array(8);
  for (let b = 0; b < 8; b++) {
    sampleMap[b] = u8(v, cursor + b);
  }
  cursor += 8;
  const instruments = [];
  const instrSlots = new Array(MAX_SAMPLES + 1).fill(null);
  for (let smp = 0; smp < MAX_SAMPLES; smp++) {
    const present = (sampleMap[smp >> 3] & 1 << (smp & 7)) !== 0;
    if (!present) continue;
    if (cursor + SAMPLE_HEADER_SIZE > buffer.byteLength) break;
    const smpOff = cursor;
    const smpName = readString(v, smpOff, 32) || `Sample ${smp + 1}`;
    const smpLength = u32(v, smpOff + 32);
    const smpVol = u8(v, smpOff + 37);
    let loopStart = u32(v, smpOff + 38);
    let loopEnd = u32(v, smpOff + 42);
    const smpType = u8(v, smpOff + 46);
    const smpLoop = u8(v, smpOff + 47);
    cursor += SAMPLE_HEADER_SIZE;
    const is16bit = (smpType & SMP_16BIT) !== 0;
    const hasLoop = (smpLoop & SMP_LOOP) !== 0 && loopEnd > loopStart;
    const volFor64 = smpVol * 4;
    const rawByteLen = smpLength;
    if (rawByteLen === 0 || cursor + rawByteLen > buffer.byteLength) {
      instrSlots[smp + 1] = {
        id: smp + 1,
        name: smpName,
        type: "sample",
        synthType: "Sampler",
        effects: [],
        volume: -60,
        pan: 0
      };
      cursor += rawByteLen;
      continue;
    }
    if (is16bit) {
      const numFrames = Math.floor(rawByteLen / 2);
      const loopStartF = hasLoop ? Math.floor(loopStart / 2) : 0;
      const loopEndF = hasLoop ? Math.min(numFrames, Math.floor(loopEnd / 2)) : 0;
      const pcm8 = new Uint8Array(numFrames);
      for (let f = 0; f < numFrames; f++) {
        const lo = raw[cursor + f * 2];
        const hi = raw[cursor + f * 2 + 1];
        const s16 = hi << 8 | lo;
        const s16s = s16 < 32768 ? s16 : s16 - 65536;
        const s8 = Math.round(s16s / 256);
        pcm8[f] = s8 < 0 ? s8 + 256 : s8;
      }
      instrSlots[smp + 1] = createSamplerInstrument(
        smp + 1,
        smpName,
        pcm8,
        volFor64,
        FAR_C5_SPEED,
        hasLoop ? loopStartF : 0,
        hasLoop ? loopEndF : 0
      );
    } else {
      const pcm8 = raw.subarray(cursor, cursor + rawByteLen);
      instrSlots[smp + 1] = createSamplerInstrument(
        smp + 1,
        smpName,
        pcm8,
        volFor64,
        FAR_C5_SPEED,
        hasLoop ? loopStart : 0,
        hasLoop ? Math.min(rawByteLen, loopEnd) : 0
      );
    }
    cursor += rawByteLen;
  }
  for (let i = 1; i <= MAX_SAMPLES; i++) {
    const slot = instrSlots[i];
    if (slot !== null) {
      instruments.push(slot);
    }
  }
  return assembleSong(
    songName,
    orderList,
    restartPos,
    patterns,
    instruments,
    initialSpeed,
    NUM_CHANNELS,
    uadePatternLayout
  );
}
function assembleSong(name, orderList, restartPos, patternSlots, instruments, initialSpeed, numChannels, uadeLayout) {
  const patterns = patternSlots.filter((p) => p !== null);
  return {
    name,
    format: "MOD",
    // Closest XM-compatible format for playback
    patterns,
    instruments,
    songPositions: orderList.length > 0 ? orderList : [0],
    songLength: orderList.length,
    restartPosition: restartPos,
    numChannels,
    initialSpeed,
    initialBPM: INITIAL_BPM,
    linearPeriods: false,
    // FAR uses Amiga-style periods
    ...uadeLayout ? { uadePatternLayout: uadeLayout } : {}
  };
}
export {
  isFARFormat,
  parseFARFile
};
