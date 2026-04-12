import { b$ as registerPatternEncoder, c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function encodeMTMCell(cell) {
  const out = new Uint8Array(3);
  const note = cell.note ?? 0;
  const instr = cell.instrument ?? 0;
  const rawNote = note > 0 ? Math.min(96, note) : 0;
  out[0] = rawNote << 2 & 252 | instr >> 4 & 3;
  out[1] = (instr & 15) << 4 | (cell.effTyp ?? 0) & 15;
  out[2] = (cell.eff ?? 0) & 255;
  return out;
}
registerPatternEncoder("mtm", () => encodeMTMCell);
function u8(v, off) {
  return v.getUint8(off);
}
function i8(v, off) {
  return v.getInt8(off);
}
function u16le(v, off) {
  return v.getUint16(off, true);
}
function u32le(v, off) {
  return v.getUint32(off, true);
}
function readString(raw, off, maxLen) {
  let end = off;
  while (end < off + maxLen && raw[end] !== 0) end++;
  return String.fromCharCode(...Array.from(raw.subarray(off, end))).trim();
}
const FILE_HEADER_SIZE = 66;
const SAMPLE_HEADER_SIZE = 37;
const ORDER_TABLE_SIZE = 128;
const ROWS_PER_TRACK_STORED = 64;
const BYTES_PER_TRACK_ROW = 3;
const TRACK_BLOCK_SIZE = ROWS_PER_TRACK_STORED * BYTES_PER_TRACK_ROW;
const MAX_CHANNELS_IN_PAT = 32;
const SAMPLE_RATE = 8363;
function isMTMFormat(buffer) {
  if (buffer.byteLength < FILE_HEADER_SIZE) return false;
  const raw = new Uint8Array(buffer);
  if (raw[0] !== 77 || raw[1] !== 84 || raw[2] !== 77) return false;
  if (raw[3] >= 32) return false;
  if (raw[27] > 127) return false;
  if (raw[32] > 64) return false;
  if (raw[33] === 0 || raw[33] > 32) return false;
  return true;
}
function mapMTMEffect(cmd, param) {
  if (cmd === 0 && param === 0) return { effTyp: 0, eff: 0 };
  let p = param;
  if (cmd === 10) {
    if (p & 240) p = p & 240;
    else p = p & 15;
  } else if (cmd === 8) {
    return { effTyp: 0, eff: 0 };
  } else if (cmd === 14) {
    const sub = p & 240;
    if (sub === 0 || sub === 48 || sub === 64 || sub === 96 || sub === 112 || sub === 240) {
      return { effTyp: 0, eff: 0 };
    }
  }
  return { effTyp: cmd, eff: p };
}
function mtmNoteToXM(rawNote) {
  if (rawNote === 0) return 0;
  return Math.min(rawNote + 25, 96);
}
async function parseMTMFile(buffer, filename) {
  const v = new DataView(buffer);
  const raw = new Uint8Array(buffer);
  const songName = readString(raw, 4, 20);
  const numTracks = u16le(v, 24);
  const lastPattern = u8(v, 26);
  const lastOrder = u8(v, 27);
  const commentSize = u16le(v, 28);
  const numSamples = u8(v, 30);
  const beatsPerTrack = u8(v, 32);
  const numChannels = u8(v, 33);
  const panPos = Array.from(raw.subarray(34, 66));
  const rowsPerPattern = beatsPerTrack > 0 ? beatsPerTrack : 64;
  const numPatterns = lastPattern + 1;
  const songLength = lastOrder + 1;
  const sampleHdrsOffset = FILE_HEADER_SIZE;
  const orderTableOffset = sampleHdrsOffset + numSamples * SAMPLE_HEADER_SIZE;
  const trackDataOffset = orderTableOffset + ORDER_TABLE_SIZE;
  const patTableOffset = trackDataOffset + numTracks * TRACK_BLOCK_SIZE;
  const patTableSize = numPatterns * MAX_CHANNELS_IN_PAT * 2;
  const commentOffset = patTableOffset + patTableSize;
  const sampleDataOffset = commentOffset + commentSize;
  const sampleInfos = [];
  for (let s = 0; s < numSamples; s++) {
    const base = sampleHdrsOffset + s * SAMPLE_HEADER_SIZE;
    const sName = readString(raw, base, 22);
    const sLen = u32le(v, base + 22);
    const sLoopSt = u32le(v, base + 26);
    const sLoopEnd = u32le(v, base + 30);
    const sFine = i8(v, base + 34);
    const sVol = u8(v, base + 35);
    const sAttr = u8(v, base + 36);
    const is16bit = (sAttr & 1) !== 0;
    let adjLen = sLen;
    let adjLoopSt = sLoopSt;
    let adjLoopEnd = Math.min(Math.max(sLoopEnd, 1) - 1, sLen);
    if (is16bit) {
      adjLen = Math.floor(adjLen / 2);
      adjLoopSt = Math.floor(adjLoopSt / 2);
      adjLoopEnd = Math.floor(adjLoopEnd / 2);
    }
    let hasLoop = false;
    if (adjLen > 2) {
      if (adjLoopSt + 4 >= adjLoopEnd) {
        adjLoopSt = 0;
        adjLoopEnd = 0;
      }
      hasLoop = adjLoopEnd > 2;
    } else {
      adjLen = 0;
    }
    sampleInfos.push({
      name: sName,
      rawLength: sLen,
      length: adjLen,
      loopStart: adjLoopSt,
      loopEnd: adjLoopEnd,
      finetune: sFine,
      volume: Math.min(sVol, 64),
      is16bit,
      hasLoop
    });
  }
  const orders = [];
  for (let i = 0; i < songLength; i++) {
    orders.push(u8(v, orderTableOffset + i));
  }
  const parsedTracks = [];
  for (let t = 0; t < numTracks; t++) {
    const tBase = trackDataOffset + t * TRACK_BLOCK_SIZE;
    const rows = [];
    for (let row = 0; row < rowsPerPattern; row++) {
      const off = tBase + row * BYTES_PER_TRACK_ROW;
      const noteInstr = u8(v, off);
      const instrCmd = u8(v, off + 1);
      const par = u8(v, off + 2);
      const rawNote = noteInstr >> 2;
      const note = (noteInstr & 252) !== 0 ? mtmNoteToXM(rawNote) : 0;
      const instr = (noteInstr & 3) << 4 | instrCmd >> 4;
      const cmd = instrCmd & 15;
      const { effTyp, eff } = mapMTMEffect(cmd, par);
      rows.push({ note, instr, effTyp, eff });
    }
    parsedTracks.push(rows);
  }
  const patterns = [];
  for (let pat = 0; pat < numPatterns; pat++) {
    const patBase = patTableOffset + pat * MAX_CHANNELS_IN_PAT * 2;
    const trackIndices = [];
    for (let ch = 0; ch < MAX_CHANNELS_IN_PAT; ch++) {
      trackIndices.push(u16le(v, patBase + ch * 2));
    }
    const channels = [];
    for (let ch = 0; ch < numChannels; ch++) {
      const trackRef = trackIndices[ch];
      const rows = [];
      for (let row = 0; row < rowsPerPattern; row++) {
        if (trackRef === 0 || trackRef > numTracks || trackRef > parsedTracks.length) {
          rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
        } else {
          const tRow = parsedTracks[trackRef - 1][row];
          rows.push({
            note: tRow.note,
            instrument: tRow.instr,
            volume: 0,
            effTyp: tRow.effTyp,
            eff: tRow.eff,
            effTyp2: 0,
            eff2: 0
          });
        }
      }
      const panNibble = panPos[ch] & 15;
      const pan = Math.round((panNibble / 15 * 2 - 1) * 50);
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
      id: `pattern-${pat}`,
      name: `Pattern ${pat}`,
      length: rowsPerPattern,
      channels,
      importMetadata: {
        sourceFormat: "MTM",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: numChannels,
        originalPatternCount: numPatterns,
        originalInstrumentCount: numSamples
      }
    });
  }
  const songPositions = orders.map((ord) => Math.min(ord, numPatterns - 1));
  let sampleReadOffset = sampleDataOffset;
  const instruments = sampleInfos.map((info, i) => {
    const id = i + 1;
    const name = info.name || `Sample ${id}`;
    const fileBytesForSample = info.rawLength;
    const startOff = sampleReadOffset;
    sampleReadOffset += fileBytesForSample;
    if (info.length === 0 || fileBytesForSample === 0 || startOff + fileBytesForSample > buffer.byteLength) {
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
    const loopStart = info.hasLoop ? info.loopStart : 0;
    const loopEnd = info.hasLoop ? info.loopEnd : 0;
    if (info.is16bit) {
      const numSmp16 = info.length;
      const pcm = new Uint8Array(numSmp16);
      for (let s = 0; s < numSmp16 && startOff + s * 2 + 1 < buffer.byteLength; s++) {
        const u16val = u16le(v, startOff + s * 2);
        pcm[s] = (u16val >> 8 ^ 128) & 255;
      }
      return createSamplerInstrument(id, name, pcm, info.volume, SAMPLE_RATE, loopStart, loopEnd);
    } else {
      const pcm = new Uint8Array(fileBytesForSample);
      for (let s = 0; s < fileBytesForSample; s++) {
        pcm[s] = raw[startOff + s] ^ 128;
      }
      return createSamplerInstrument(id, name, pcm, info.volume, SAMPLE_RATE, loopStart, loopEnd);
    }
  });
  const patTrackTable = [];
  for (let pat = 0; pat < numPatterns; pat++) {
    const patBase = patTableOffset + pat * MAX_CHANNELS_IN_PAT * 2;
    const refs = [];
    for (let ch = 0; ch < MAX_CHANNELS_IN_PAT; ch++) {
      refs.push(u16le(v, patBase + ch * 2));
    }
    patTrackTable.push(refs);
  }
  const uadePatternLayout = {
    formatId: "mtm",
    patternDataFileOffset: trackDataOffset,
    bytesPerCell: 3,
    rowsPerPattern,
    numChannels,
    numPatterns,
    moduleSize: buffer.byteLength,
    encodeCell: encodeMTMCell,
    getCellFileOffset: (pattern, row, channel) => {
      const refs = patTrackTable[pattern];
      if (!refs) return 0;
      const trackRef = refs[channel] ?? 0;
      if (trackRef === 0 || trackRef > numTracks) return 0;
      return trackDataOffset + (trackRef - 1) * TRACK_BLOCK_SIZE + row * BYTES_PER_TRACK_ROW;
    }
  };
  return {
    name: songName || filename.replace(/\.[^/.]+$/, ""),
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
  isMTMFormat,
  parseMTMFile
};
