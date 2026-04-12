import { b$ as registerPatternEncoder } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const NOTE_KEYOFF$1 = 121;
function reverseMT2Effect(effTyp, eff) {
  if (effTyp === 0 && eff === 0) return { fxcmd: 0, fxparam1: 0, fxparam2: 0 };
  switch (effTyp) {
    case 15:
      return { fxcmd: 0, fxparam1: eff, fxparam2: 15 };
    // speed/tempo
    case 11:
      return { fxcmd: 0, fxparam1: eff, fxparam2: 11 };
    // position jump
    case 13:
      return { fxcmd: 0, fxparam1: eff, fxparam2: 13 };
    // pattern break
    case 1:
      return { fxcmd: 0, fxparam1: eff, fxparam2: 1 };
    // porta up
    case 2:
      return { fxcmd: 0, fxparam1: eff, fxparam2: 2 };
    // porta down
    case 3:
      return { fxcmd: 0, fxparam1: eff, fxparam2: 3 };
    // tone porta
    case 4:
      return { fxcmd: 0, fxparam1: eff, fxparam2: 4 };
    // vibrato
    case 10:
      return { fxcmd: 0, fxparam1: eff, fxparam2: 10 };
    // vol slide
    case 8:
      return { fxcmd: 8, fxparam1: eff, fxparam2: 0 };
    // panning
    case 12:
      return { fxcmd: 12, fxparam1: 0, fxparam2: Math.min(255, eff << 1) };
    // set volume
    default:
      return { fxcmd: 0, fxparam1: 0, fxparam2: 0 };
  }
}
function encodeMT2Cell(cell) {
  const out = new Uint8Array(7);
  const note = cell.note ?? 0;
  if (note === 0) {
    out[0] = 0;
  } else if (note === NOTE_KEYOFF$1 || note === 97) {
    out[0] = 97;
  } else {
    const raw = note - 12;
    out[0] = raw >= 1 && raw <= 96 ? raw : 0;
  }
  out[1] = cell.instrument ?? 0;
  const vol = cell.volume ?? 0;
  if (vol > 0) {
    out[2] = Math.min(144, Math.max(16, vol * 2 + 16));
  }
  out[3] = 0;
  const { fxcmd, fxparam1, fxparam2 } = reverseMT2Effect(cell.effTyp ?? 0, cell.eff ?? 0);
  out[4] = fxcmd;
  out[5] = fxparam1;
  out[6] = fxparam2;
  return out;
}
registerPatternEncoder("mt2", () => encodeMT2Cell);
function u8(buf, off) {
  return buf[off] ?? 0;
}
function u16le(buf, off) {
  return (buf[off] ?? 0) | (buf[off + 1] ?? 0) << 8;
}
function u32le(buf, off) {
  return ((buf[off] ?? 0) | (buf[off + 1] ?? 0) << 8 | (buf[off + 2] ?? 0) << 16 | (buf[off + 3] ?? 0) << 24) >>> 0;
}
function f64le(buf, off) {
  const view = new DataView(buf.buffer, buf.byteOffset + off, 8);
  return view.getFloat64(0, true);
}
function readString(buf, off, len) {
  let s = "";
  for (let i = 0; i < len; i++) {
    const c = buf[off + i] ?? 0;
    if (c === 0) break;
    s += String.fromCharCode(c >= 32 ? c : 32);
  }
  return s.trimEnd();
}
const FLAG_PACKED_PATTERNS = 1;
const FLAG_AUTOMATION = 2;
const FLAG_DRUMS_AUTO = 8;
const FLAG_MASTER_AUTO = 16;
const HEADER_SIZE = 126;
const DRUMS_DATA_SIZE = 274;
const CMD_SIZE = 7;
const SAMPLE_HEADER_SIZE = 26;
const GROUP_SIZE = 8;
const INSTR_HEADER_SIZE = 106;
const ENVELOPE_SIZE = 72;
const ENV_POINT_SIZE = 4;
const NOTE_KEYOFF = 121;
function convertMT2Note(rawNote) {
  if (rawNote === 0) return 0;
  if (rawNote > 96) return NOTE_KEYOFF;
  const n = rawNote + 12;
  return Math.max(1, Math.min(120, n));
}
function convertMT2Vol(rawVol) {
  if (rawVol >= 16 && rawVol <= 144) {
    return Math.round((rawVol - 16) / 2);
  }
  return 0;
}
function convertMT2Effect(fxcmd, fxparam1, fxparam2) {
  if (!fxcmd && !fxparam1 && !fxparam2) return [0, 0];
  switch (fxcmd) {
    case 0: {
      const xmCmd = fxparam2;
      const xmParam = fxparam1;
      if (xmCmd === 15) {
        if (xmParam < 32) return [15, xmParam];
        return [15, xmParam];
      }
      if (xmCmd === 11) return [11, xmParam];
      if (xmCmd === 13) return [13, xmParam];
      if (xmCmd === 1) return [1, xmParam];
      if (xmCmd === 2) return [2, xmParam];
      if (xmCmd === 3) return [3, xmParam];
      if (xmCmd === 4) return [4, xmParam];
      if (xmCmd === 10) return [10, xmParam];
      return [0, 0];
    }
    case 1:
      return [1, Math.min(255, fxparam2 << 4 | fxparam1 >> 4)];
    case 2:
      return [2, Math.min(255, fxparam2 << 4 | fxparam1 >> 4)];
    case 3:
      return [3, Math.min(255, fxparam2 << 4 | fxparam1 >> 4)];
    case 4:
      return [4, (fxparam2 & 240 | fxparam1 >> 4) & 255];
    case 8:
      if (fxparam1) return [8, fxparam1];
      return [0, 0];
    case 12:
      return [12, Math.min(64, fxparam2 >> 1)];
    case 15:
      if (fxparam2 !== 0) return [15, fxparam2];
      return [15, fxparam1 & 15];
    // speed
    case 16:
      return [fxparam2, fxparam1];
    case 29:
      return [29, fxparam1];
    case 36:
      return [19, 159];
    // S3MCMDEX: SBx sample reverse
    case 128:
      return [17, Math.min(64, fxparam2 >> 2)];
    // channel volume
    default:
      return [0, 0];
  }
}
function isMadTracker2Format(bytes) {
  if (bytes.length < HEADER_SIZE + 256) return false;
  if (bytes[0] !== 77 || bytes[1] !== 84 || bytes[2] !== 50 || bytes[3] !== 48) return false;
  const version = u16le(bytes, 6);
  if (version < 512 || version >= 768) return false;
  const numChannels = u16le(bytes, 42);
  if (numChannels < 1 || numChannels > 64) return false;
  const numOrders = u16le(bytes, 38);
  if (numOrders > 256) return false;
  const numInstruments = u16le(bytes, 48);
  if (numInstruments >= 255) return false;
  const numSamples = u16le(bytes, 50);
  if (numSamples >= 256) return false;
  return true;
}
function parseMadTracker2File(bytes, filename) {
  try {
    return _parseMadTracker2(bytes, filename);
  } catch {
    return null;
  }
}
function _parseMadTracker2(bytes, filename) {
  if (!isMadTracker2Format(bytes)) return null;
  let pos = 0;
  const version = u16le(bytes, 6);
  const songNameStr = readString(bytes, 40, 64);
  const numOrders2 = u16le(bytes, 104);
  const restartPos2 = u16le(bytes, 106);
  const numPatterns2 = u16le(bytes, 108);
  const numChannels = u16le(bytes, 110);
  const samplesPerTick = u16le(bytes, 112);
  const ticksPerLine = u8(bytes, 114);
  const linesPerBeat = u8(bytes, 115);
  const flags = u32le(bytes, 116);
  const numInstruments = u16le(bytes, 120);
  const numSamples2 = u16le(bytes, 122);
  if (numChannels < 1 || numChannels > 64) return null;
  if (numOrders2 > 256) return null;
  pos = HEADER_SIZE;
  if (pos + 256 > bytes.length) return null;
  const orders = [];
  for (let i = 0; i < numOrders2; i++) {
    orders.push(u8(bytes, pos + i));
  }
  pos += 256;
  if (pos + 2 > bytes.length) return null;
  const drumsSizeHint = u16le(bytes, pos);
  pos += 2;
  const hasDrumChannels = drumsSizeHint !== 0;
  const drumsData = [];
  let numDrumChannels = 0;
  if (hasDrumChannels) {
    if (pos + DRUMS_DATA_SIZE > bytes.length) return null;
    numDrumChannels = 8;
    for (let i = 0; i < DRUMS_DATA_SIZE; i++) {
      drumsData.push(u8(bytes, pos + i));
    }
    pos += DRUMS_DATA_SIZE;
  }
  if (pos + 4 > bytes.length) return null;
  const extraDataSize = u32le(bytes, pos);
  pos += 4;
  const extraDataStart = pos;
  if (pos + extraDataSize > bytes.length) return null;
  const extraDataEnd = pos + extraDataSize;
  pos += extraDataSize;
  const totalChannels = numChannels + numDrumChannels;
  const packedPatterns = (flags & FLAG_PACKED_PATTERNS) !== 0;
  const patterns = [];
  const patternChunkStarts = [];
  for (let pat = 0; pat < numPatterns2; pat++) {
    if (pos + 6 > bytes.length) break;
    const numRows = u16le(bytes, pos);
    pos += 2;
    const rawChunkSize = u32le(bytes, pos);
    pos += 4;
    const chunkSize = rawChunkSize + 1 & -2;
    const chunkStart = pos;
    const chunkEnd = pos + chunkSize;
    pos = chunkEnd;
    patternChunkStarts.push(chunkStart);
    if (chunkEnd > bytes.length) break;
    const clampedRows = Math.min(numRows, 256);
    if (clampedRows === 0) {
      patterns.push(makeEmptyPattern(pat, clampedRows, totalChannels, filename, numPatterns2, numInstruments));
      continue;
    }
    const cellGrid = Array.from(
      { length: clampedRows },
      () => Array.from({ length: totalChannels }, () => ({
        note: 0,
        instrument: 0,
        volume: 0,
        effTyp: 0,
        eff: 0,
        effTyp2: 0,
        eff2: 0
      }))
    );
    let cp = chunkStart;
    if (packedPatterns) {
      let row = 0;
      let chn = 0;
      while (cp < chunkEnd && chn < numChannels) {
        if (cp >= bytes.length) break;
        const infobyte = u8(bytes, cp++);
        let repeatCount = 0;
        let actualInfo = infobyte;
        if (infobyte === 255) {
          if (cp >= chunkEnd) break;
          repeatCount = u8(bytes, cp++);
          if (cp >= chunkEnd) break;
          actualInfo = u8(bytes, cp++);
        }
        if (actualInfo & 127) {
          const cmd = { note: 0, instr: 0, vol: 0, pan: 0, fxcmd: 0, fxparam1: 0, fxparam2: 0 };
          if (actualInfo & 1) {
            if (cp < chunkEnd) cmd.note = u8(bytes, cp++);
          }
          if (actualInfo & 2) {
            if (cp < chunkEnd) cmd.instr = u8(bytes, cp++);
          }
          if (actualInfo & 4) {
            if (cp < chunkEnd) cmd.vol = u8(bytes, cp++);
          }
          if (actualInfo & 8) {
            if (cp < chunkEnd) cmd.pan = u8(bytes, cp++);
          }
          if (actualInfo & 16) {
            if (cp < chunkEnd) cmd.fxcmd = u8(bytes, cp++);
          }
          if (actualInfo & 32) {
            if (cp < chunkEnd) cmd.fxparam1 = u8(bytes, cp++);
          }
          if (actualInfo & 64) {
            if (cp < chunkEnd) cmd.fxparam2 = u8(bytes, cp++);
          }
          if (row < clampedRows && chn < numChannels) {
            writeCell(cellGrid[row][chn], cmd);
          }
          const fillCount = Math.min(repeatCount, clampedRows - (row + 1));
          for (let r = 0; r < fillCount; r++) {
            if (row + 1 + r < clampedRows && chn < numChannels) {
              writeCell(cellGrid[row + 1 + r][chn], cmd);
            }
          }
        }
        row += repeatCount + 1;
        while (row >= clampedRows) {
          row -= clampedRows;
          chn++;
        }
        if (chn >= numChannels) break;
      }
    } else {
      for (let row = 0; row < clampedRows; row++) {
        for (let chn = 0; chn < numChannels; chn++) {
          if (cp + CMD_SIZE > chunkEnd) break;
          const cmd = {
            note: u8(bytes, cp),
            instr: u8(bytes, cp + 1),
            vol: u8(bytes, cp + 2),
            pan: u8(bytes, cp + 3),
            fxcmd: u8(bytes, cp + 4),
            fxparam1: u8(bytes, cp + 5),
            fxparam2: u8(bytes, cp + 6)
          };
          cp += CMD_SIZE;
          writeCell(cellGrid[row][chn], cmd);
        }
      }
    }
    patterns.push(buildPattern(pat, clampedRows, totalChannels, cellGrid, filename, numPatterns2, numInstruments));
  }
  let bpmOverride = 0;
  {
    let xp = extraDataStart;
    while (xp + 8 <= extraDataEnd) {
      const chunkId = u32le(bytes, xp);
      const chunkSize2 = u32le(bytes, xp + 4);
      xp += 8;
      const chunkBodyEnd = xp + chunkSize2;
      if (chunkBodyEnd > extraDataEnd) break;
      if (chunkId === 726487106) {
        const b0 = u8(bytes, xp - 8), b1 = u8(bytes, xp - 7), b2 = u8(bytes, xp - 6), b3 = u8(bytes, xp - 5);
        if (b0 === 66 && b1 === 80 && b2 === 77 && b3 === 43) {
          if (chunkSize2 >= 8) {
            bpmOverride = f64le(bytes, xp);
          }
        }
      } else {
        const id0 = u8(bytes, xp - 8), id1 = u8(bytes, xp - 7), id2 = u8(bytes, xp - 6), id3 = u8(bytes, xp - 5);
        const idStr = String.fromCharCode(id0, id1, id2, id3);
        if (idStr === "BPM+" && chunkSize2 >= 8) {
          bpmOverride = f64le(bytes, xp);
        } else if (idStr === "SUM\0") {
          if (chunkSize2 > 7) {
            const nameStart = xp + 6;
            let nameEnd = nameStart;
            while (nameEnd < chunkBodyEnd && u8(bytes, nameEnd) !== 0) nameEnd++;
          }
        }
      }
      xp = chunkBodyEnd;
    }
  }
  if (flags & FLAG_AUTOMATION) {
    const numVSTFromExtra = 0;
    const numEnvelopes = (flags & FLAG_DRUMS_AUTO ? totalChannels : numChannels) + (version >= 592 ? numVSTFromExtra : 0) + (flags & FLAG_MASTER_AUTO ? 1 : 0);
    for (let pat = 0; pat < numPatterns2; pat++) {
      for (let env = 0; env < numEnvelopes; env++) {
        if (pos + 4 > bytes.length) break;
        let autoFlags;
        if (version >= 515) {
          if (pos + 8 > bytes.length) break;
          autoFlags = u32le(bytes, pos);
          pos += 4;
          pos += 4;
        } else {
          if (pos + 4 > bytes.length) break;
          autoFlags = u16le(bytes, pos);
          pos += 2;
          pos += 2;
        }
        let af = autoFlags;
        while (af !== 0) {
          if (af & 1) {
            pos += 4 + ENV_POINT_SIZE * 64;
          }
          af >>>= 1;
        }
      }
    }
  }
  const instrChunks = [];
  for (let i = 0; i < 255; i++) {
    if (pos + 32 + 4 > bytes.length) {
      instrChunks.push({ start: 0, size: 0, name: "" });
      continue;
    }
    const instrName = readString(bytes, pos, 32);
    pos += 32;
    let dataLength = u32le(bytes, pos);
    pos += 4;
    if (dataLength === 32) dataLength += 108 + ENVELOPE_SIZE * 4;
    if (version > 513 && dataLength > 0) dataLength += 4;
    instrChunks.push({ start: pos, size: dataLength, name: instrName });
    pos += dataLength;
  }
  for (let i = 0; i < 256; i++) {
    if (pos + 32 + 4 > bytes.length) {
      continue;
    }
    const sName = readString(bytes, pos, 32);
    pos += 32;
    const dataLength = u32le(bytes, pos);
    pos += 4;
    const smpChunkStart = pos;
    if (dataLength >= SAMPLE_HEADER_SIZE && i < numSamples2) {
      ({
        name: sName,
        length: u32le(bytes, smpChunkStart),
        frequency: u32le(bytes, smpChunkStart + 4),
        depth: u8(bytes, smpChunkStart + 8),
        channels: u8(bytes, smpChunkStart + 9),
        flags: u8(bytes, smpChunkStart + 10),
        loopType: u8(bytes, smpChunkStart + 11),
        loopStart: u32le(bytes, smpChunkStart + 12),
        loopEnd: u32le(bytes, smpChunkStart + 16),
        volume: u16le(bytes, smpChunkStart + 20),
        panning: u8(bytes, smpChunkStart + 22) >= 128 ? u8(bytes, smpChunkStart + 22) - 256 : u8(bytes, smpChunkStart + 22),
        note: u8(bytes, smpChunkStart + 23)
      });
    }
    pos += dataLength;
  }
  const groupsByInstr = Array.from({ length: numInstruments }, () => []);
  for (let ins = 0; ins < numInstruments; ins++) {
    const ic = instrChunks[ins];
    if (ic.size === 0) continue;
    if (ic.start + INSTR_HEADER_SIZE > bytes.length) continue;
    const numGroups = u16le(bytes, ic.start);
    if (numGroups === 0 || numGroups > 256) continue;
    const groups = [];
    for (let g = 0; g < numGroups; g++) {
      if (pos + GROUP_SIZE > bytes.length) break;
      groups.push({
        sample: u8(bytes, pos),
        vol: u8(bytes, pos + 1),
        pitch: u8(bytes, pos + 2) >= 128 ? u8(bytes, pos + 2) - 256 : u8(bytes, pos + 2)
      });
      pos += GROUP_SIZE;
    }
    groupsByInstr[ins] = groups;
  }
  const instruments = [];
  for (let i = 0; i < numInstruments; i++) {
    const ic = instrChunks[i];
    const id = i + 1;
    instruments.push({
      id,
      name: ic.name || `Instrument ${id}`,
      type: "sample",
      synthType: "Sampler",
      effects: [],
      volume: 0,
      pan: 0
    });
  }
  let initialBPM = 125;
  const clampedSpeed = Math.max(1, Math.min(31, ticksPerLine));
  const clampedLPB = Math.max(1, Math.min(32, linesPerBeat));
  if (samplesPerTick > 1 && samplesPerTick < 5e3) {
    if (bpmOverride > 1e-8) {
      const bpm = 44100 * 60 / (clampedSpeed * clampedLPB * bpmOverride);
      initialBPM = Math.round(Math.max(32, Math.min(999, bpm)));
    } else {
      const bpm = 44100 * 60 / (clampedSpeed * clampedLPB * samplesPerTick);
      initialBPM = Math.round(Math.max(32, Math.min(999, bpm)));
    }
  }
  const songPositions = orders.slice(0, numOrders2);
  const maxPat = Math.max(...songPositions, 0);
  while (patterns.length <= maxPat) {
    const pi = patterns.length;
    patterns.push(makeEmptyPattern(pi, 64, totalChannels, filename, numPatterns2, numInstruments));
  }
  if (patterns.length === 0) {
    patterns.push(makeEmptyPattern(0, 64, totalChannels, filename, 0, numInstruments));
  }
  if (songPositions.length === 0) {
    songPositions.push(0);
  }
  const baseName = filename.replace(/\.[^/.]+$/, "");
  const name = songNameStr.trim() || baseName;
  return {
    name,
    format: "XM",
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: Math.min(restartPos2, songPositions.length - 1),
    numChannels: totalChannels,
    initialSpeed: clampedSpeed,
    initialBPM,
    linearPeriods: true,
    ...packedPatterns ? {} : {
      uadePatternLayout: {
        formatId: "mt2",
        patternDataFileOffset: 0,
        // not used — getCellFileOffset overrides
        bytesPerCell: CMD_SIZE,
        rowsPerPattern: 64,
        numChannels: totalChannels,
        numPatterns: numPatterns2,
        moduleSize: bytes.length,
        encodeCell: encodeMT2Cell,
        getCellFileOffset: (pattern, row, channel) => {
          const start = patternChunkStarts[pattern] ?? 0;
          return start + (row * numChannels + channel) * CMD_SIZE;
        }
      }
    }
  };
}
function writeCell(cell, cmd) {
  cell.note = convertMT2Note(cmd.note);
  cell.instrument = cmd.instr;
  cell.volume = convertMT2Vol(cmd.vol);
  const [effTyp, eff] = convertMT2Effect(cmd.fxcmd, cmd.fxparam1, cmd.fxparam2);
  cell.effTyp = effTyp;
  cell.eff = eff;
  if (cmd.pan && cell.effTyp === 0) {
    cell.effTyp = 8;
    cell.eff = cmd.pan;
  }
}
function buildPattern(idx, numRows, numChannels, cellGrid, filename, totalPats, numInstruments) {
  var _a;
  const channels = [];
  for (let ch = 0; ch < numChannels; ch++) {
    const rows = [];
    for (let row = 0; row < numRows; row++) {
      rows.push(((_a = cellGrid[row]) == null ? void 0 : _a[ch]) ?? { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
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
  return {
    id: `pattern-${idx}`,
    name: `Pattern ${idx}`,
    length: numRows,
    channels,
    importMetadata: {
      sourceFormat: "MadTracker2",
      sourceFile: filename,
      importedAt: (/* @__PURE__ */ new Date()).toISOString(),
      originalChannelCount: numChannels,
      originalPatternCount: totalPats,
      originalInstrumentCount: numInstruments
    }
  };
}
function makeEmptyPattern(idx, numRows, numChannels, filename, totalPats, numInstruments) {
  const emptyRow = () => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
  const channels = Array.from({ length: numChannels }, (_, ch) => ({
    id: `channel-${ch}`,
    name: `Channel ${ch + 1}`,
    muted: false,
    solo: false,
    collapsed: false,
    volume: 100,
    pan: 0,
    instrumentId: null,
    color: null,
    rows: Array.from({ length: numRows }, emptyRow)
  }));
  return {
    id: `pattern-${idx}`,
    name: `Pattern ${idx}`,
    length: numRows,
    channels,
    importMetadata: {
      sourceFormat: "MadTracker2",
      sourceFile: filename,
      importedAt: (/* @__PURE__ */ new Date()).toISOString(),
      originalChannelCount: numChannels,
      originalPatternCount: totalPats,
      originalInstrumentCount: numInstruments
    }
  };
}
export {
  isMadTracker2Format,
  parseMadTracker2File
};
