import { c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import { e as encodeXMFCell } from "./XMFEncoder-q5F4y1aF.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function u8(v, off) {
  return v.getUint8(off);
}
function u16le(v, off) {
  return v.getUint16(off, true);
}
function u24le(v, off) {
  return v.getUint8(off) | v.getUint8(off + 1) << 8 | v.getUint8(off + 2) << 16;
}
const SAMPLE_HDR_SIZE = 16;
const NUM_SAMPLE_SLOTS = 256;
const ROWS_PER_PATTERN = 64;
const CELL_SIZE = 6;
const SMP_16BIT = 4;
const SMP_LOOP = 8;
const SMP_BIDI_LOOP = 16;
const SAMPLES_OFFSET = 1;
const ORDERS_OFFSET = 1 + NUM_SAMPLE_SLOTS * SAMPLE_HDR_SIZE;
const CHANNEL_OFFSET = ORDERS_OFFSET + NUM_SAMPLE_SLOTS;
const CMD_NONE = 0;
const CMD_PORTA_UP = 1;
const CMD_PORTA_DOWN = 2;
const CMD_TONE_PORTA = 3;
const CMD_VIBRATO = 4;
const CMD_TREMOLO = 7;
const CMD_PAN = 8;
const CMD_OFFSET = 9;
const CMD_VOLSLIDE = 10;
const CMD_POSIJMP = 11;
const CMD_VOLUME = 12;
const CMD_PATBRK = 13;
const CMD_EXTFX = 14;
const CMD_SPEED = 15;
const CMD_VOLUME8 = 16;
function translateXMFEffect(rawCmd, rawParam, type) {
  if (rawCmd === 0 && rawParam === 0) {
    return { command: CMD_NONE, param: 0 };
  }
  let cmd = rawCmd;
  let param = rawParam;
  if (cmd === 11 && param < 255) {
    param++;
  } else if (cmd === 16 || cmd === 17) {
    param = 128 | (cmd & 15) << 4 | param & 15;
    cmd = 14;
  } else if (cmd === 18) {
    return { command: CMD_NONE, param: 0 };
  } else if (cmd > 18) {
    return null;
  }
  let outCmd;
  switch (cmd) {
    case 0:
      outCmd = 0;
      break;
    // Arpeggio
    case 1:
      outCmd = CMD_PORTA_UP;
      break;
    case 2:
      outCmd = CMD_PORTA_DOWN;
      break;
    case 3:
      outCmd = CMD_TONE_PORTA;
      break;
    case 4:
      outCmd = CMD_VIBRATO;
      break;
    case 5:
      outCmd = CMD_TONE_PORTA;
      break;
    // Tone porta + vol slide
    case 6:
      outCmd = CMD_VIBRATO;
      break;
    // Vibrato + vol slide
    case 7:
      outCmd = CMD_TREMOLO;
      break;
    case 8:
      outCmd = CMD_PAN;
      break;
    case 9:
      outCmd = CMD_OFFSET;
      break;
    case 10:
      outCmd = CMD_VOLSLIDE;
      break;
    case 11:
      outCmd = CMD_POSIJMP;
      break;
    case 12:
      outCmd = CMD_VOLUME;
      break;
    case 13:
      outCmd = CMD_PATBRK;
      break;
    case 14:
      outCmd = CMD_EXTFX;
      break;
    case 15:
      outCmd = CMD_SPEED;
      break;
    default:
      outCmd = CMD_NONE;
      param = 0;
  }
  if (type === 4 && outCmd === CMD_VOLUME) {
    if (!(param & 3) || param === 255) {
      param = Math.floor((param + 3) / 4);
    } else {
      outCmd = CMD_VOLUME8;
    }
  } else if (outCmd === CMD_VOLUME) {
    outCmd = CMD_VOLUME8;
  }
  return { command: outCmd, param };
}
function readSampleHeader(v, off, type) {
  const loopStart = u24le(v, off + 0);
  const loopEnd = u24le(v, off + 3);
  const dataStart = u24le(v, off + 6);
  const dataEnd = u24le(v, off + 9);
  const defVol = u8(v, off + 12);
  const flags = u8(v, off + 13);
  const sampleRate = u16le(v, off + 14);
  if (flags & -29) return null;
  if ((flags & (SMP_LOOP | SMP_BIDI_LOOP)) === SMP_BIDI_LOOP) return null;
  if (dataStart > dataEnd) return null;
  const lengthBytes = dataEnd - dataStart;
  if (type !== 2 && lengthBytes > 0 && sampleRate < 100) return null;
  if (type === 2 && lengthBytes > 0 && sampleRate >= 32768) return null;
  if (flags & SMP_16BIT && lengthBytes % 2 !== 0) return null;
  if (flags & SMP_LOOP && !loopEnd) return null;
  if (loopStart > loopEnd || loopStart > lengthBytes) return null;
  if (loopEnd !== 0 && (loopEnd >= lengthBytes || loopStart >= loopEnd)) return null;
  const is16Bit = (flags & SMP_16BIT) !== 0;
  const length = is16Bit ? lengthBytes / 2 : lengthBytes;
  return {
    loopStart,
    loopEnd,
    dataStart,
    dataEnd,
    defaultVolume: defVol,
    flags,
    sampleRate,
    is16Bit,
    hasLoop: (flags & SMP_LOOP) !== 0,
    hasBidiLoop: (flags & SMP_BIDI_LOOP) !== 0,
    length,
    lengthBytes,
    hasSampleData: dataEnd > dataStart
  };
}
function isXMFFormat(bytes) {
  if (bytes.length < 1 + SAMPLE_HDR_SIZE) return false;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const type = u8(v, 0);
  if (type < 2 || type > 4) return false;
  const minSize = 1 + NUM_SAMPLE_SLOTS * SAMPLE_HDR_SIZE + NUM_SAMPLE_SLOTS + 3;
  if (bytes.length < minSize) return false;
  const toCheck = Math.min(NUM_SAMPLE_SLOTS, Math.floor((bytes.length - 1) / SAMPLE_HDR_SIZE));
  for (let i = 0; i < toCheck; i++) {
    const off = SAMPLES_OFFSET + i * SAMPLE_HDR_SIZE;
    if (off + SAMPLE_HDR_SIZE > bytes.length) break;
    if (readSampleHeader(v, off, type) === null) return false;
  }
  return true;
}
function parseXMFFile(bytes, filename) {
  try {
    return _parse(bytes, filename);
  } catch {
    return null;
  }
}
function _parse(bytes, filename) {
  if (!isXMFFormat(bytes)) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const type = u8(v, 0);
  const sampleInfos = [];
  let numSamples = 0;
  for (let i = 0; i < NUM_SAMPLE_SLOTS; i++) {
    const off = SAMPLES_OFFSET + i * SAMPLE_HDR_SIZE;
    const info = readSampleHeader(v, off, type);
    if (info === null) return null;
    sampleInfos.push(info);
    if (info.hasSampleData) numSamples = i + 1;
  }
  if (numSamples === 0) return null;
  const orders = [];
  for (let i = 0; i < NUM_SAMPLE_SLOTS; i++) {
    const ord = u8(v, ORDERS_OFFSET + i);
    if (ord === 255) break;
    orders.push(ord);
  }
  if (orders.length === 0) orders.push(0);
  const lastChannel = u8(v, CHANNEL_OFFSET);
  if (lastChannel > 31) return null;
  const numChannels = lastChannel + 1;
  const numPatterns = u8(v, CHANNEL_OFFSET + 1) + 1;
  const patternDataSize = numPatterns * numChannels * ROWS_PER_PATTERN * CELL_SIZE;
  const pansOffset = CHANNEL_OFFSET + 2;
  const patternStart = pansOffset + numChannels;
  if (patternStart + patternDataSize > bytes.length) return null;
  const channelPans = [];
  for (let chn = 0; chn < numChannels; chn++) {
    const rawPan = u8(v, pansOffset + chn) * 17;
    channelPans.push(Math.round(rawPan / 255 * 200 - 100));
  }
  const patternCells = /* @__PURE__ */ new Map();
  for (let pat = 0; pat < numPatterns; pat++) {
    const patBase = patternStart + pat * numChannels * ROWS_PER_PATTERN * CELL_SIZE;
    const cells = Array.from(
      { length: numChannels },
      () => Array.from({ length: ROWS_PER_PATTERN }, () => ({
        note: 0,
        instrument: 0,
        volume: 0,
        effTyp: 0,
        eff: 0,
        effTyp2: 0,
        eff2: 0
      }))
    );
    let patOk = true;
    for (let row = 0; row < ROWS_PER_PATTERN && patOk; row++) {
      for (let chn = 0; chn < numChannels && patOk; chn++) {
        const off = patBase + (row * numChannels + chn) * CELL_SIZE;
        if (off + CELL_SIZE > bytes.length) {
          patOk = false;
          break;
        }
        const noteRaw = u8(v, off + 0);
        const instr = u8(v, off + 1);
        const eff1Cmd = u8(v, off + 2);
        const eff2Cmd = u8(v, off + 3);
        const eff2Prm = u8(v, off + 4);
        const eff1Prm = u8(v, off + 5);
        let note = 0;
        if (noteRaw > 0 && noteRaw <= 77) {
          note = 36 + noteRaw;
        }
        const e1 = translateXMFEffect(eff1Cmd, eff1Prm, type);
        const e2 = translateXMFEffect(eff2Cmd, eff2Prm, type);
        if (e1 === null || e2 === null) {
          patOk = false;
          break;
        }
        cells[chn][row].note = note;
        cells[chn][row].instrument = instr;
        cells[chn][row].effTyp = e1.command;
        cells[chn][row].eff = e1.param;
        cells[chn][row].effTyp2 = e2.command;
        cells[chn][row].eff2 = e2.param;
      }
    }
    patternCells.set(pat, cells);
  }
  const patterns = orders.map((patIdx, orderPos) => {
    const cells = patternCells.get(patIdx);
    const channels = Array.from({ length: numChannels }, (_, chn) => {
      const rows = Array.from({ length: ROWS_PER_PATTERN }, (_2, row) => {
        if (!cells) {
          return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
        }
        return { ...cells[chn][row] };
      });
      return {
        id: `c${orderPos}-ch${chn}`,
        name: `Channel ${chn + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: channelPans[chn] ?? 0,
        instrumentId: null,
        color: null,
        rows
      };
    });
    return {
      id: `pattern-${orderPos}-${patIdx}`,
      name: `Pattern ${patIdx}`,
      length: ROWS_PER_PATTERN,
      channels,
      importMetadata: {
        sourceFormat: "xmf",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: numChannels,
        originalPatternCount: numPatterns,
        originalInstrumentCount: numSamples
      }
    };
  });
  let sampleDataOffset = patternStart + patternDataSize;
  const instruments = [];
  for (let i = 0; i < numSamples; i++) {
    const id = i + 1;
    const info = sampleInfos[i];
    if (!info || !info.hasSampleData || info.lengthBytes === 0) {
      instruments.push({
        id,
        name: `Sample ${id}`,
        type: "sample",
        synthType: "Sampler",
        effects: [],
        volume: 0,
        pan: 0
      });
      if (info && info.hasSampleData) sampleDataOffset += info.lengthBytes;
      continue;
    }
    const endOff = sampleDataOffset + info.lengthBytes;
    if (endOff > bytes.length) {
      instruments.push({
        id,
        name: `Sample ${id}`,
        type: "sample",
        synthType: "Sampler",
        effects: [],
        volume: 0,
        pan: 0
      });
      sampleDataOffset += info.lengthBytes;
      continue;
    }
    const loopStart = info.hasLoop ? info.loopStart + 1 : 0;
    const loopEnd = info.hasLoop ? info.loopEnd + 1 : 0;
    const sampleRate = info.sampleRate > 0 ? info.sampleRate : 8363;
    if (info.is16Bit) {
      const numFrames = info.length;
      const pcm8 = new Uint8Array(numFrames);
      for (let j = 0; j < numFrames; j++) {
        const sampleOff = sampleDataOffset + j * 2;
        if (sampleOff + 2 > bytes.length) break;
        const s16 = v.getInt16(sampleOff, true);
        pcm8[j] = (s16 >> 8) + 128;
      }
      instruments.push(createSamplerInstrument(
        id,
        `Sample ${id}`,
        pcm8,
        info.defaultVolume,
        sampleRate,
        loopStart,
        loopEnd
      ));
    } else {
      const pcm = bytes.subarray(sampleDataOffset, endOff);
      instruments.push(createSamplerInstrument(
        id,
        `Sample ${id}`,
        pcm,
        info.defaultVolume,
        sampleRate,
        loopStart,
        loopEnd
      ));
    }
    sampleDataOffset += info.lengthBytes;
  }
  const songPositions = patterns.map((_, i) => i);
  const songName = filename.replace(/\.[^/.]+$/, "");
  const uadePatternLayout = {
    formatId: "xmf",
    patternDataFileOffset: patternStart,
    bytesPerCell: CELL_SIZE,
    rowsPerPattern: ROWS_PER_PATTERN,
    numChannels,
    numPatterns,
    moduleSize: bytes.length,
    encodeCell: encodeXMFCell,
    getCellFileOffset: (pattern, row, channel) => patternStart + pattern * (ROWS_PER_PATTERN * numChannels * CELL_SIZE) + (row * numChannels + channel) * CELL_SIZE
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
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadePatternLayout
  };
}
export {
  isXMFFormat,
  parseXMFFile
};
