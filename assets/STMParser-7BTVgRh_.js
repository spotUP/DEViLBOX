import { b$ as registerPatternEncoder, c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const XM_NOTE_CUT$1 = 97;
function reverseEffect(effTyp, eff) {
  if (effTyp === 0 && eff === 0) return { stmIdx: 0, param: 0 };
  switch (effTyp) {
    case 15:
      return { stmIdx: 1, param: eff << 4 };
    // set speed (pack as high nibble)
    case 11:
      return { stmIdx: 2, param: eff };
    // position jump
    case 13: {
      const bcdParam = (Math.floor(eff / 10) & 15) << 4 | eff % 10;
      return { stmIdx: 3, param: bcdParam };
    }
    case 10:
      return { stmIdx: 4, param: eff };
    // volume slide
    case 2:
      return { stmIdx: 5, param: eff };
    // portamento down
    case 1:
      return { stmIdx: 6, param: eff };
    // portamento up
    case 3:
      return { stmIdx: 7, param: eff };
    // tone portamento
    case 4:
      return { stmIdx: 8, param: eff };
    // vibrato
    case 29:
      return { stmIdx: 9, param: eff };
    // tremor
    default:
      return { stmIdx: 0, param: 0 };
  }
}
function encodeSTMCell(cell) {
  const out = new Uint8Array(4);
  const note = cell.note ?? 0;
  if (note === 0) {
    out[0] = 251;
  } else if (note === XM_NOTE_CUT$1) {
    out[0] = 254;
  } else {
    const n = note - 37;
    if (n >= 0 && n < 96) {
      const octave = Math.floor(n / 12);
      const semitone = n % 12;
      out[0] = octave << 4 | semitone;
    } else {
      out[0] = 251;
    }
  }
  const instr = Math.min(31, cell.instrument ?? 0);
  const vol = Math.min(64, cell.volume ?? 0);
  out[1] = (instr & 31) << 3 | vol & 7;
  const { stmIdx, param } = reverseEffect(cell.effTyp ?? 0, cell.eff ?? 0);
  out[2] = (vol & 120) << 1 | stmIdx & 15;
  out[3] = param & 255;
  return out;
}
registerPatternEncoder("stm", () => encodeSTMCell);
function u8(v, off) {
  return v.getUint8(off);
}
function u16le(v, off) {
  return v.getUint16(off, true);
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
const FILE_HDR_SIZE = 48;
const SAMPLE_HDR_SIZE = 32;
const NUM_SAMPLES = 31;
const NUM_CHANNELS = 4;
const ROWS_PER_PATTERN = 64;
const PATTERN_SIZE = ROWS_PER_PATTERN * NUM_CHANNELS * 4;
const NOTE_MIN = 1;
const XM_NOTE_CUT = 97;
const STM_EFFECTS = [
  0,
  // 0x0 -> none           (CMD_NONE)
  15,
  // 0x1 -> Axx set speed  (CMD_SPEED) — also sets tempo, handled specially
  11,
  // 0x2 -> Bxx pos jump   (CMD_POSITIONJUMP) — deferred in STM
  13,
  // 0x3 -> Cxx pat break  (CMD_PATTERNBREAK)
  10,
  // 0x4 -> Dxx vol slide  (CMD_VOLUMESLIDE)
  2,
  // 0x5 -> Exx porta down (CMD_PORTAMENTODOWN)
  1,
  // 0x6 -> Fxx porta up   (CMD_PORTAMENTOUP)
  3,
  // 0x7 -> Gxx tone porta (CMD_TONEPORTAMENTO)
  4,
  // 0x8 -> Hxx vibrato    (CMD_VIBRATO)
  29,
  // 0x9 -> Ixx tremor     (CMD_TREMOR)
  0,
  // 0xA -> Jxx arpeggio   (CMD_ARPEGGIO)
  0,
  // 0xB -> K              (no-op)
  0,
  // 0xC -> L              (no-op)
  0,
  // 0xD -> M              (no-op)
  0,
  // 0xE -> N              (no-op)
  0
  // 0xF -> O              (no-op)
];
const ST2_TEMPO_FACTOR = [140, 50, 25, 15, 10, 7, 6, 4, 3, 3, 2, 2, 2, 2, 1, 1];
const ST2_MIXING_RATE = 23863;
function convertST2Tempo(tempo) {
  const hiNib = tempo >> 4 & 15;
  const loNib = tempo & 15;
  let samplesPerTick = Math.floor(ST2_MIXING_RATE / (50 - (ST2_TEMPO_FACTOR[hiNib] * loNib >> 4)));
  if (samplesPerTick <= 0) samplesPerTick += 65536;
  const bpm = Math.round(ST2_MIXING_RATE * 5 / (samplesPerTick * 2));
  return Math.max(32, Math.min(255, bpm));
}
function isSTMFormat(buffer) {
  if (buffer.byteLength < FILE_HDR_SIZE) return false;
  const v = new DataView(buffer);
  const dosEof = u8(v, 28);
  const filetype = u8(v, 29);
  const verMajor = u8(v, 30);
  const verMinor = u8(v, 31);
  const numPatterns = u8(v, 33);
  const globalVolume = u8(v, 34);
  if (filetype !== 2) return false;
  if (dosEof !== 26 && dosEof !== 2) return false;
  if (verMajor !== 2) return false;
  if (verMinor !== 0 && verMinor !== 10 && verMinor !== 20 && verMinor !== 21) return false;
  if (numPatterns > 64) return false;
  if (globalVolume > 64 && globalVolume !== 88) return false;
  for (let i = 20; i < 28; i++) {
    const c = u8(v, i);
    if (c < 32 || c >= 127) return false;
  }
  return true;
}
function readSampleHeader(v, base) {
  return {
    filename: readString(v, base, 12),
    zero: u8(v, base + 12),
    // +13 = disk (ignored)
    offset: u16le(v, base + 14),
    length: u16le(v, base + 16),
    loopStart: u16le(v, base + 18),
    loopEnd: u16le(v, base + 20),
    volume: Math.min(u8(v, base + 22), 64),
    // +23 = reserved2
    sampleRate: u16le(v, base + 24)
    // +26..+31 = reserved3[6]
  };
}
function convertSTMEffect(effIdx, param, verMinor) {
  const idx = effIdx & 15;
  const none = { effTyp: 0, eff: 0, tempoValue: 0, breakPos: -1 };
  if (idx === 0) return none;
  if (idx >= 11) return none;
  if (idx === 10) {
    if (param === 0) return none;
    return { effTyp: 0, eff: param, tempoValue: 0, breakPos: -1 };
  }
  const xmEff = STM_EFFECTS[idx];
  switch (idx) {
    case 1: {
      let p = param;
      if (verMinor < 21) {
        p = (Math.floor(p / 10) << 4) + p % 10;
      }
      if (p === 0) return none;
      const speed = Math.max(1, p >> 4);
      const tempoValue = convertST2Tempo(p);
      return { effTyp: xmEff, eff: speed, tempoValue, breakPos: -1 };
    }
    case 2:
      return { effTyp: 0, eff: 0, tempoValue: 0, breakPos: param };
    case 3: {
      const bcdParam = (param >> 4) * 10 + (param & 15);
      return { effTyp: xmEff, eff: bcdParam, tempoValue: 0, breakPos: -1 };
    }
    case 4: {
      let p = param;
      if (p & 15) {
        p &= 15;
      } else {
        p &= 240;
      }
      return { effTyp: xmEff, eff: p, tempoValue: 0, breakPos: -1 };
    }
    default:
      if (param === 0) return none;
      return { effTyp: xmEff, eff: param, tempoValue: 0, breakPos: -1 };
  }
}
async function parseSTMFile(buffer, filename) {
  const v = new DataView(buffer);
  const raw = new Uint8Array(buffer);
  const songName = readString(v, 0, 20);
  const verMinor = u8(v, 31);
  let initTempo = u8(v, 32);
  const numPatterns = u8(v, 33);
  if (verMinor < 21) {
    initTempo = (Math.floor(initTempo / 10) << 4) + initTempo % 10;
  }
  if (initTempo === 0) initTempo = 96;
  const initialSpeed = Math.max(1, initTempo >> 4);
  const initialBPM = convertST2Tempo(initTempo);
  const sampleHeaders = [];
  let cursor = FILE_HDR_SIZE;
  for (let s = 0; s < NUM_SAMPLES; s++) {
    sampleHeaders.push(readSampleHeader(v, cursor));
    cursor += SAMPLE_HDR_SIZE;
  }
  const orderListSize = verMinor === 0 ? 64 : 128;
  const rawOrders = [];
  for (let i = 0; i < orderListSize; i++) {
    const val = u8(v, cursor + i);
    if (val === 99 || val === 255) break;
    if (val <= 63) rawOrders.push(val);
  }
  cursor += orderListSize;
  if (rawOrders.length === 0) rawOrders.push(0);
  const patternDataStart = cursor;
  const referencedPats = new Set(rawOrders);
  for (let i = 0; i < numPatterns; i++) referencedPats.add(i);
  const allPatIdxs = Array.from(referencedPats).sort((a, b) => a - b);
  const maxPatIdx = allPatIdxs.length > 0 ? allPatIdxs[allPatIdxs.length - 1] : 0;
  const patIndexToArrayIdx = /* @__PURE__ */ new Map();
  const patterns = [];
  for (const patIdx of allPatIdxs) {
    const patOff = patternDataStart + patIdx * PATTERN_SIZE;
    const channelRows = Array.from({ length: NUM_CHANNELS }, () => []);
    let breakPos = -1;
    let breakRow = 63;
    for (let row = 0; row < ROWS_PER_PATTERN; row++) {
      let rowTempoValue = 0;
      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        const cellOff = patOff + (row * NUM_CHANNELS + ch) * 4;
        if (cellOff + 3 >= buffer.byteLength) {
          channelRows[ch].push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
          continue;
        }
        const noteByte = u8(v, cellOff);
        const insVol = u8(v, cellOff + 1);
        const volCmd = u8(v, cellOff + 2);
        const cmdInf = u8(v, cellOff + 3);
        let note = 0;
        if (noteByte === 251 || noteByte === 252) {
          note = 0;
        } else if (noteByte === 253 || noteByte === 254) {
          note = XM_NOTE_CUT;
        } else if (noteByte < 96) {
          const octave = noteByte >> 4 & 15;
          const semitone = noteByte & 15;
          note = octave * 12 + semitone + 36 + NOTE_MIN;
        }
        let instrument = insVol >> 3;
        if (instrument > 31) instrument = 0;
        const volLo = insVol & 7;
        const volHi = (volCmd & 240) >> 1;
        const rawVol = volLo | volHi;
        const volume = rawVol <= 64 ? rawVol : 0;
        const result = convertSTMEffect(volCmd & 15, cmdInf, verMinor);
        let { effTyp, eff } = result;
        if (result.breakPos >= 0) {
          breakPos = result.breakPos;
          breakRow = 63;
        }
        if (effTyp === 13 && breakPos >= 0 && eff === 0) {
          effTyp = 11;
          eff = breakPos;
          breakPos = -1;
        }
        if (effTyp === 13) {
          if (row < breakRow) breakRow = row;
        }
        if (result.tempoValue > 0) {
          rowTempoValue = result.tempoValue;
        }
        channelRows[ch].push({
          note,
          instrument,
          volume,
          effTyp,
          eff,
          effTyp2: 0,
          eff2: 0
        });
      }
      if (rowTempoValue > 0) {
        let injected = false;
        for (let ch = 0; ch < NUM_CHANNELS; ch++) {
          const cell = channelRows[ch][row];
          if (cell.effTyp2 === 0 && cell.eff2 === 0) {
            cell.effTyp2 = 15;
            cell.eff2 = rowTempoValue;
            injected = true;
            break;
          }
        }
        if (!injected) {
          for (let ch = 0; ch < NUM_CHANNELS; ch++) {
            const cell = channelRows[ch][row];
            if (cell.effTyp === 0 && cell.eff === 0) {
              cell.effTyp = 15;
              cell.eff = rowTempoValue;
              break;
            }
          }
        }
      }
    }
    if (breakPos >= 0) {
      let injected = false;
      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        const cell = channelRows[ch][breakRow];
        if (cell.effTyp === 0 && cell.eff === 0) {
          cell.effTyp = 11;
          cell.eff = breakPos;
          injected = true;
          break;
        }
      }
      if (!injected) {
        for (let ch = 0; ch < NUM_CHANNELS; ch++) {
          const cell = channelRows[ch][breakRow];
          if (cell.effTyp2 === 0 && cell.eff2 === 0) {
            cell.effTyp2 = 11;
            cell.eff2 = breakPos;
            break;
          }
        }
      }
    }
    const channels = channelRows.map((rows, ch) => ({
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
    }));
    const arrIdx = patterns.length;
    patIndexToArrayIdx.set(patIdx, arrIdx);
    patterns.push({
      id: `pattern-${patIdx}`,
      name: `Pattern ${patIdx}`,
      length: ROWS_PER_PATTERN,
      channels,
      importMetadata: {
        sourceFormat: "STM",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: NUM_CHANNELS,
        originalPatternCount: maxPatIdx + 1,
        originalInstrumentCount: NUM_SAMPLES
      }
    });
  }
  const songPositions = [];
  for (const patIdx of rawOrders) {
    const arrIdx = patIndexToArrayIdx.get(patIdx);
    if (arrIdx !== void 0) songPositions.push(arrIdx);
  }
  if (songPositions.length === 0) songPositions.push(0);
  const instruments = sampleHeaders.map((hdr, i) => {
    const id = i + 1;
    const name = hdr.filename.replace(/\0/g, "").trim() || `Sample ${id}`;
    const sampleFileOff = hdr.offset << 4;
    const length = hdr.length;
    const isEmpty = length < 2 || sampleFileOff < FILE_HDR_SIZE || sampleFileOff >= buffer.byteLength || hdr.volume === 0;
    if (isEmpty) {
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
    const readEnd = Math.min(sampleFileOff + length, buffer.byteLength);
    const readLen = readEnd - sampleFileOff;
    if (readLen <= 0) {
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
    const pcm = raw.slice(sampleFileOff, sampleFileOff + readLen);
    const hasLoop = hdr.loopStart < length && hdr.loopEnd > hdr.loopStart && hdr.loopEnd !== 65535;
    const loopStart = hasLoop ? hdr.loopStart : 0;
    const loopEnd = hasLoop ? hdr.loopEnd : 0;
    const sampleRate = hdr.sampleRate > 0 ? hdr.sampleRate : 8363;
    return createSamplerInstrument(
      id,
      name,
      pcm,
      hdr.volume,
      sampleRate,
      loopStart,
      loopEnd
    );
  });
  const uadePatternLayout = {
    formatId: "stm",
    patternDataFileOffset: patternDataStart,
    bytesPerCell: 4,
    rowsPerPattern: ROWS_PER_PATTERN,
    numChannels: NUM_CHANNELS,
    numPatterns,
    moduleSize: buffer.byteLength,
    encodeCell: encodeSTMCell
  };
  return {
    name: songName.replace(/\0/g, "").trim() || filename.replace(/\.[^/.]+$/, ""),
    format: "MOD",
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: NUM_CHANNELS,
    initialSpeed,
    initialBPM,
    linearPeriods: false,
    uadePatternLayout
  };
}
export {
  isSTMFormat,
  parseSTMFile
};
