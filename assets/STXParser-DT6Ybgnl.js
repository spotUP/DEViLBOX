import { c5 as registerVariableEncoder, dz as convertToInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const XM_NOTE_OFF$1 = 97;
function reverseSTMEffect(effTyp, eff) {
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
    case 10: {
      let p = eff;
      if (p & 15) {
        p = p & 15;
      } else {
        p = p & 240;
      }
      return { stmIdx: 4, param: p };
    }
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
const stxEncoder = {
  formatId: "stx",
  /**
   * Encode rows for a single channel in STX (S3M packed) format.
   * Each non-empty cell: flagByte + optional [note, instr] + optional [volume] + optional [cmd, param]
   * Each row ends with 0x00.
   */
  encodePattern(rows, channel) {
    const buf = [];
    for (let row = 0; row < rows.length; row++) {
      const cell = rows[row];
      const note = cell.note ?? 0;
      const instr = cell.instrument ?? 0;
      const vol = cell.volume ?? 0;
      const { stmIdx, param } = reverseSTMEffect(cell.effTyp ?? 0, cell.eff ?? 0);
      const hasNote = note !== 0 || instr !== 0;
      const hasVol = vol !== 0;
      const hasEffect = stmIdx !== 0 || param !== 0;
      if (hasNote || hasVol || hasEffect) {
        let flag = channel & 31;
        if (hasNote) flag |= 32;
        if (hasVol) flag |= 64;
        if (hasEffect) flag |= 128;
        buf.push(flag);
        if (hasNote) {
          let noteByte = 255;
          if (note === XM_NOTE_OFF$1) {
            noteByte = 254;
          } else if (note >= 1 && note <= 120) {
            const n = note - 1;
            const octave = Math.floor(n / 12);
            const semitone = n % 12;
            noteByte = octave << 4 | semitone;
          }
          buf.push(noteByte);
          buf.push(instr & 255);
        }
        if (hasVol) {
          buf.push(Math.min(64, vol));
        }
        if (hasEffect) {
          buf.push(stmIdx & 255);
          buf.push(param & 255);
        }
      }
      buf.push(0);
    }
    return new Uint8Array(buf);
  }
};
registerVariableEncoder(stxEncoder);
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
const FILE_HDR_SIZE = 64;
const ROWS_PER_PATTERN = 64;
const NUM_CHANNELS = 4;
const S3M_NOTE_OFF = 254;
const S3M_NOTE_NONE = 255;
const XM_NOTE_OFF = 97;
const S3M_END_OF_ROW = 0;
const S3M_CHANNEL_MASK = 31;
const S3M_NOTE_PRESENT = 32;
const S3M_VOLUME_PRESENT = 64;
const S3M_EFFECT_PRESENT = 128;
const STM_EFFECTS = [
  0,
  // 0x0 → none
  15,
  // 0x1 → Axx set speed    (CMD_SPEED)
  11,
  // 0x2 → Bxx pos jump     (CMD_POSITIONJUMP)
  13,
  // 0x3 → Cxx pat break    (CMD_PATTERNBREAK)
  10,
  // 0x4 → Dxx vol slide    (CMD_VOLUMESLIDE)
  2,
  // 0x5 → Exx porta down   (CMD_PORTAMENTODOWN)
  1,
  // 0x6 → Fxx porta up     (CMD_PORTAMENTOUP)
  3,
  // 0x7 → Gxx tone porta   (CMD_TONEPORTAMENTO)
  4,
  // 0x8 → Hxx vibrato      (CMD_VIBRATO)
  29,
  // 0x9 → Ixx tremor       (CMD_TREMOR)
  0,
  // 0xA → Jxx arpeggio (no-op in ST2)
  0,
  // 0xB → K (no-op)
  0,
  // 0xC → L (no-op)
  0,
  // 0xD → M (no-op)
  0,
  // 0xE → N (no-op)
  0
  // 0xF → O (no-op)
];
function isSTXFormat(buffer) {
  if (buffer.byteLength < FILE_HDR_SIZE) return false;
  const v = new DataView(buffer);
  if (u8(v, 60) !== 83 || u8(v, 61) !== 67 || u8(v, 62) !== 82 || u8(v, 63) !== 77) return false;
  const patternSize = u16le(v, 28);
  const unknown1 = u16le(v, 30);
  const unknown2 = u32le(v, 38);
  const globalVolume = u8(v, 42);
  const unknown3 = u32le(v, 44);
  const numPatterns = u16le(v, 48);
  const numSamples = u16le(v, 50);
  const numOrders = u16le(v, 52);
  if (unknown1 !== 0) return false;
  if (unknown2 !== 0) return false;
  if (unknown3 !== 1) return false;
  if (patternSize < 64 && patternSize !== 26) return false;
  if (patternSize > 2112) return false;
  if (globalVolume > 64 && globalVolume !== 88) return false;
  if (numPatterns > 64) return false;
  if (numSamples > 96) return false;
  if (numOrders > 129 && numOrders !== 257) return false;
  for (let i = 20; i < 28; i++) {
    const c = u8(v, i);
    if (c < 32 || c >= 127) return false;
  }
  return true;
}
function convertSTMEffect(effIdx, param) {
  const idx = effIdx & 15;
  const xmEff = STM_EFFECTS[idx];
  if (idx === 0 || idx >= 10) return { effTyp: 0, eff: 0 };
  switch (idx) {
    case 1: {
      if (param === 0) return { effTyp: 0, eff: 0 };
      return { effTyp: xmEff, eff: param >> 4 };
    }
    case 2:
      return { effTyp: xmEff, eff: param };
    case 3: {
      const bcdParam = (param >> 4) * 10 + (param & 15);
      return { effTyp: xmEff, eff: bcdParam };
    }
    case 4: {
      let p = param;
      if (p & 15) {
        p &= 15;
      } else {
        p &= 240;
      }
      return { effTyp: xmEff, eff: p };
    }
    default:
      if (param === 0) return { effTyp: 0, eff: 0 };
      return { effTyp: xmEff, eff: param };
  }
}
function readS3MSampleHeader(v, base) {
  const sampleType = u8(v, base);
  const dpLo = u8(v, base + 14);
  const dpHi = u8(v, base + 15);
  const dpHigh = u8(v, base + 13);
  const dataOffset = (dpLo | dpHi << 8 | dpHigh << 16) * 16;
  return {
    sampleType,
    filename: readString(v, base + 1, 12),
    dataOffset,
    length: u32le(v, base + 16),
    loopStart: u32le(v, base + 20),
    loopEnd: u32le(v, base + 24),
    defaultVolume: Math.min(u8(v, base + 28), 64),
    pack: u8(v, base + 30),
    flags: u8(v, base + 31),
    c5speed: u32le(v, base + 32),
    name: readString(v, base + 48, 28)
  };
}
function decodeSTXPattern(rowData, numChannels) {
  const emptyCell = () => ({
    note: 0,
    instrument: 0,
    volume: 0,
    effTyp: 0,
    eff: 0,
    effTyp2: 0,
    eff2: 0
  });
  const cells = Array.from(
    { length: ROWS_PER_PATTERN },
    () => Array.from({ length: numChannels }, emptyCell)
  );
  let pos = 0;
  let row = 0;
  while (row < ROWS_PER_PATTERN && pos < rowData.length) {
    const flagByte = rowData[pos++];
    if (flagByte === S3M_END_OF_ROW) {
      row++;
      continue;
    }
    const ch = flagByte & S3M_CHANNEL_MASK;
    let note = 0;
    let instrument = 0;
    let volume = 0;
    let effTyp = 0;
    let eff = 0;
    if (flagByte & S3M_NOTE_PRESENT) {
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
    if (flagByte & S3M_VOLUME_PRESENT) {
      const rawVol = rowData[pos++];
      volume = rawVol <= 64 ? rawVol : 0;
    }
    if (flagByte & S3M_EFFECT_PRESENT) {
      const command = rowData[pos++];
      const param = rowData[pos++];
      const { effTyp: et, eff: ep } = convertSTMEffect(command, param);
      effTyp = et;
      eff = ep;
    }
    if (ch < numChannels) {
      cells[row][ch] = { note, instrument, volume, effTyp, eff, effTyp2: 0, eff2: 0 };
    }
  }
  return cells;
}
function makeEmptyPattern(patIdx, numChannels, filename, maxPatIdx, numSamples) {
  const emptyCell = {
    note: 0,
    instrument: 0,
    volume: 0,
    effTyp: 0,
    eff: 0,
    effTyp2: 0,
    eff2: 0
  };
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
      sourceFormat: "STX",
      sourceFile: filename,
      importedAt: (/* @__PURE__ */ new Date()).toISOString(),
      originalChannelCount: numChannels,
      originalPatternCount: maxPatIdx + 1,
      originalInstrumentCount: numSamples
    }
  };
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
function extractPCM(raw, offset, byteLength) {
  const end = Math.min(offset + byteLength, raw.length);
  const actualLen = end - offset;
  const buf = new ArrayBuffer(actualLen);
  const out = new Uint8Array(buf);
  for (let i = 0; i < actualLen; i++) {
    out[i] = raw[offset + i];
  }
  return buf;
}
function parseSTXFile(buffer, filename) {
  var _a;
  if (!isSTXFormat(buffer)) throw new Error("Not a valid STX file");
  const v = new DataView(buffer);
  const raw = new Uint8Array(buffer);
  const songName = readString(v, 0, 20);
  const patternSize = u16le(v, 28);
  const patTableOffset = u16le(v, 32);
  const smpTableOffset = u16le(v, 34);
  const chnTableOffset = u16le(v, 36);
  Math.min(u8(v, 42), 64);
  const initTempo = u8(v, 43) || 96;
  const numPatterns = u16le(v, 48);
  const numSamples = u16le(v, 50);
  const numOrders = u16le(v, 52);
  const initialSpeed = Math.max(1, initTempo >> 4);
  const initialBPM = 125;
  const patTableBase = patTableOffset << 4;
  const patternParapointers = [];
  for (let i = 0; i < numPatterns; i++) {
    patternParapointers.push(u16le(v, patTableBase + i * 2));
  }
  const smpTableBase = smpTableOffset << 4;
  const sampleParapointers = [];
  for (let i = 0; i < numSamples; i++) {
    sampleParapointers.push(u16le(v, smpTableBase + i * 2));
  }
  const chnTableBase = (chnTableOffset << 4) + 32;
  const rawOrders = [];
  for (let i = 0; i < numOrders; i++) {
    const patIdx = u8(v, chnTableBase + i * 5);
    if (patIdx === 99 || patIdx === 255) break;
    if (patIdx <= 63) rawOrders.push(patIdx);
  }
  if (rawOrders.length === 0) rawOrders.push(0);
  let formatVersion = 1;
  if (numPatterns > 0 && patternSize !== 26) {
    const firstPatOff = patternParapointers[0] << 4;
    if (firstPatOff + 2 <= buffer.byteLength) {
      if (u16le(v, firstPatOff) === patternSize) {
        formatVersion = 0;
      }
    }
  }
  const instruments = [];
  for (let si = 0; si < numSamples; si++) {
    const id = si + 1;
    const smpOff = sampleParapointers[si] << 4;
    if (smpOff === 0 || smpOff + 80 > buffer.byteLength) {
      instruments.push(makeEmptyInstrumentConfig(id, `Sample ${id}`));
      continue;
    }
    const hdr = readS3MSampleHeader(v, smpOff);
    if (hdr.sampleType !== 1) {
      const name2 = hdr.name.replace(/\0/g, "").trim() || `Sample ${id}`;
      instruments.push(makeEmptyInstrumentConfig(id, name2));
      continue;
    }
    const name = hdr.name.replace(/\0/g, "").trim() || hdr.filename.replace(/\0/g, "").trim() || `Sample ${id}`;
    if (hdr.pack === 1 || hdr.length === 0 || hdr.dataOffset === 0 || hdr.dataOffset >= buffer.byteLength) {
      instruments.push(makeEmptyInstrumentConfig(id, name));
      continue;
    }
    const is16bit = !!(hdr.flags & 4);
    const bytesPerSample = is16bit ? 2 : 1;
    const byteLength = hdr.length * bytesPerSample;
    const pcmData = extractPCM(raw, hdr.dataOffset, byteLength);
    const hasLoop = !!(hdr.flags & 1) && hdr.loopEnd > hdr.loopStart && hdr.loopEnd <= hdr.length;
    const loopLength = hasLoop ? hdr.loopEnd - hdr.loopStart : 0;
    const sample = {
      id,
      name,
      pcmData,
      bitDepth: is16bit ? 16 : 8,
      sampleRate: hdr.c5speed || 8363,
      length: hdr.length,
      loopStart: hasLoop ? hdr.loopStart : 0,
      loopLength,
      loopType: hasLoop ? "forward" : "none",
      volume: hdr.defaultVolume,
      finetune: 0,
      relativeNote: 0,
      panning: 128
      // center
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
  const referencedPats = new Set(rawOrders);
  for (let i = 0; i < numPatterns; i++) referencedPats.add(i);
  const allPatIdxs = Array.from(referencedPats).sort((a, b) => a - b);
  const maxPatIdx = allPatIdxs.length > 0 ? allPatIdxs[allPatIdxs.length - 1] : 0;
  const patterns = [];
  const patIndexToArrayIdx = /* @__PURE__ */ new Map();
  const stxPatFileAddrs = [];
  const stxPatFileSizes = [];
  for (const patIdx of allPatIdxs) {
    if (patIdx >= patternParapointers.length || patternParapointers[patIdx] === 0) {
      patIndexToArrayIdx.set(patIdx, patterns.length);
      patterns.push(makeEmptyPattern(patIdx, NUM_CHANNELS, filename, maxPatIdx, numSamples));
      stxPatFileAddrs.push(0);
      stxPatFileSizes.push(0);
      continue;
    }
    const patOff = patternParapointers[patIdx] << 4;
    if (patOff + 2 > buffer.byteLength) {
      patIndexToArrayIdx.set(patIdx, patterns.length);
      patterns.push(makeEmptyPattern(patIdx, NUM_CHANNELS, filename, maxPatIdx, numSamples));
      stxPatFileAddrs.push(0);
      stxPatFileSizes.push(0);
      continue;
    }
    let dataStart = patOff;
    if (formatVersion === 0) {
      const declaredSize = u16le(v, patOff);
      if (declaredSize > 2112) {
        patIndexToArrayIdx.set(patIdx, patterns.length);
        patterns.push(makeEmptyPattern(patIdx, NUM_CHANNELS, filename, maxPatIdx, numSamples));
        continue;
      }
      dataStart = patOff + 2;
    }
    let rowDataLen;
    if (formatVersion === 0) {
      rowDataLen = u16le(v, patOff);
    } else {
      rowDataLen = Math.min(2048, buffer.byteLength - dataStart);
    }
    stxPatFileAddrs.push(dataStart);
    stxPatFileSizes.push(rowDataLen);
    const rowData = raw.subarray(dataStart, dataStart + rowDataLen);
    const cells = decodeSTXPattern(rowData, NUM_CHANNELS);
    const channels = [];
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const rows = [];
      for (let row = 0; row < ROWS_PER_PATTERN; row++) {
        rows.push(((_a = cells[row]) == null ? void 0 : _a[ch]) ?? {
          note: 0,
          instrument: 0,
          volume: 0,
          effTyp: 0,
          eff: 0,
          effTyp2: 0,
          eff2: 0
        });
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
        sourceFormat: "STX",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: NUM_CHANNELS,
        originalPatternCount: maxPatIdx + 1,
        originalInstrumentCount: numSamples
      }
    });
  }
  const songPositions = [];
  for (const patIdx of rawOrders) {
    const arrIdx = patIndexToArrayIdx.get(patIdx);
    if (arrIdx !== void 0) songPositions.push(arrIdx);
  }
  if (songPositions.length === 0) songPositions.push(0);
  const stxTrackMap = [];
  for (let p = 0; p < patterns.length; p++) {
    stxTrackMap.push(Array.from({ length: NUM_CHANNELS }, () => p < stxPatFileAddrs.length ? p : -1));
  }
  const uadeVariableLayout = {
    formatId: "stx",
    numChannels: NUM_CHANNELS,
    numFilePatterns: stxPatFileAddrs.length,
    rowsPerPattern: ROWS_PER_PATTERN,
    moduleSize: buffer.byteLength,
    encoder: stxEncoder,
    filePatternAddrs: stxPatFileAddrs,
    filePatternSizes: stxPatFileSizes,
    trackMap: stxTrackMap
  };
  return {
    name: songName.replace(/\0/g, "").trim() || filename.replace(/\.[^/.]+$/, ""),
    format: "S3M",
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: NUM_CHANNELS,
    initialSpeed,
    initialBPM,
    linearPeriods: false,
    uadeVariableLayout
  };
}
export {
  isSTXFormat,
  parseSTXFile
};
