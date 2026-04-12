import { c6 as encodeMODCell, c2 as createSamplerInstrument, c3 as periodToNoteIndex, c7 as amigaNoteToXM } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const CHUNK_VERS = 1447383635;
const CHUNK_INFO = 1229866575;
const CHUNK_CMNT = 1129139796;
const CHUNK_PTDT = 1347699796;
const NUM_MOD_INSTRUMENTS = 31;
const MOD_ROWS_PER_PATTERN = 64;
const MOD_CHANNELS = 4;
const MOD_TITLE_LEN = 20;
const MOD_SAMPLE_HDR_OFFSET = 20;
const MOD_SAMPLE_HDR_SIZE = 30;
const MOD_ORDER_COUNT_OFF = 950;
const MOD_RESTART_OFF = 951;
const MOD_ORDER_TABLE_OFF = 952;
const MOD_TAG_OFF = 1080;
const MOD_PATTERN_DATA_OFF = 1084;
const CHANNEL_PANNING = [-50, 50, 50, -50];
const TEXT_DECODER = new TextDecoder("iso-8859-1");
function readStr(buf, offset, len) {
  let end = offset;
  while (end < offset + len && buf[end] !== 0) end++;
  return TEXT_DECODER.decode(buf.subarray(offset, end)).trim();
}
function readU16BE(buf, offset) {
  return buf[offset] << 8 | buf[offset + 1];
}
function readU32BE(buf, offset) {
  return (buf[offset] << 24 | buf[offset + 1] << 16 | buf[offset + 2] << 8 | buf[offset + 3]) >>> 0;
}
function readFourCC(buf, offset) {
  return String.fromCharCode(buf[offset], buf[offset + 1], buf[offset + 2], buf[offset + 3]);
}
function isPT36Format(buffer) {
  if (buffer.byteLength < 12) return false;
  const buf = new Uint8Array(buffer);
  if (readFourCC(buf, 0) === "FORM" && readFourCC(buf, 8) === "MODL") return true;
  if (buf[0] === 80 && buf[1] === 82 && buf[2] === 84 && buf[3] !== 0) return true;
  return false;
}
async function parsePT36File(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (!isPT36Format(buffer)) {
    throw new Error("PT36Parser: not a valid ProTracker 3.6 / PreTracker file");
  }
  if (buf[0] === 80 && buf[1] === 82 && buf[2] === 84 && buf[3] !== 0) {
    return parsePreTrackerBuffer(buf, filename);
  }
  let ptdtBuf = null;
  let ptdtFileOffset = 0;
  let infoChunk = null;
  let commentBuf = null;
  let versionStr = "3.6";
  let pos = 12;
  let firstChunk = true;
  while (pos + 8 <= buf.byteLength) {
    const id = readU32BE(buf, pos);
    let rawSize = readU32BE(buf, pos + 4);
    if (firstChunk) {
      rawSize = rawSize > 4 ? rawSize - 4 : 0;
      firstChunk = false;
    }
    const dataSize = rawSize > 8 ? rawSize - 8 : 0;
    const dataStart = pos + 8;
    const dataEnd = Math.min(dataStart + dataSize, buf.byteLength);
    switch (id) {
      case CHUNK_VERS: {
        if (dataSize > 6) {
          const vOff = dataStart + 4;
          if (buf[vOff] === 80 && buf[vOff + 1] === 84) {
            const vStr = readStr(buf, vOff + 2, dataEnd - (vOff + 2));
            if (vStr.length > 0) versionStr = vStr;
          }
        }
        break;
      }
      case CHUNK_INFO: {
        if (dataEnd - dataStart >= 64) {
          infoChunk = buf.subarray(dataStart, dataEnd);
        }
        break;
      }
      case CHUNK_CMNT: {
        commentBuf = buf.subarray(dataStart, dataEnd);
        break;
      }
      case CHUNK_PTDT: {
        ptdtBuf = buf.subarray(dataStart, buf.byteLength);
        ptdtFileOffset = dataStart;
        break;
      }
    }
    const advance = rawSize > 0 ? rawSize : 8;
    pos += advance;
  }
  if (!ptdtBuf) {
    throw new Error("PT36Parser: PTDT chunk not found");
  }
  let infoSongName = "";
  let infoVolume = 0;
  let infoTempo = 0;
  let infoFlags = 0;
  if (infoChunk && infoChunk.byteLength >= 64) {
    infoSongName = readStr(infoChunk, 0, 32);
    infoVolume = readU16BE(infoChunk, 38);
    infoTempo = readU16BE(infoChunk, 40);
    infoFlags = readU16BE(infoChunk, 42);
  }
  const useCIA = (infoFlags & 256) !== 0;
  if (commentBuf && commentBuf.byteLength > 0) {
    const author = readStr(commentBuf, 0, Math.min(32, commentBuf.byteLength));
    if (author.length > 0 && author !== "UNNAMED AUTHOR") {
      console.log(`[PT36Parser] Author: ${author}`);
    }
  }
  const song = parseMODBuffer(ptdtBuf, filename, infoSongName, infoVolume, infoTempo, useCIA);
  song.uadePatternLayout = {
    formatId: "pt36",
    patternDataFileOffset: ptdtFileOffset + MOD_PATTERN_DATA_OFF,
    bytesPerCell: 4,
    rowsPerPattern: MOD_ROWS_PER_PATTERN,
    numChannels: MOD_CHANNELS,
    numPatterns: song.patterns.length,
    moduleSize: buffer.byteLength,
    encodeCell: encodeMODCell
  };
  console.log(
    `[PT36Parser] Loaded "${song.name}" — ProTracker ${versionStr} | ${song.patterns.length} patterns | ${song.instruments.length} instruments | speed=${song.initialSpeed} BPM=${song.initialBPM}`
  );
  return song;
}
function parsePreTrackerBuffer(buf, filename) {
  const songTitle = readStr(buf, 20, 16) || filename.replace(/\.[^/.]+$/, "");
  const instruments = [{
    id: 1,
    name: "Sample 1",
    type: "sample",
    synthType: "Sampler",
    effects: [],
    volume: -60,
    pan: 0
  }];
  const emptyRows = Array.from({ length: 64 }, () => ({
    note: 0,
    instrument: 0,
    volume: 0,
    effTyp: 0,
    eff: 0,
    effTyp2: 0,
    eff2: 0
  }));
  const pattern = {
    id: "pattern-0",
    name: "Pattern 0",
    length: 64,
    channels: Array.from({ length: 4 }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: CHANNEL_PANNING[ch],
      instrumentId: null,
      color: null,
      rows: emptyRows
    })),
    importMetadata: {
      sourceFormat: "MOD",
      sourceFile: filename,
      importedAt: (/* @__PURE__ */ new Date()).toISOString(),
      originalChannelCount: 4,
      originalPatternCount: 1,
      originalInstrumentCount: 0
    }
  };
  return {
    name: `${songTitle} [PreTracker]`,
    format: "MOD",
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false
  };
}
function parseMODBuffer(buf, filename, infoName, infoVolume, infoTempo, useCIA) {
  if (buf.byteLength < MOD_PATTERN_DATA_OFF) {
    throw new Error("PT36Parser: PTDT chunk too small to be a valid MOD");
  }
  const modTitle = readStr(buf, 0, MOD_TITLE_LEN);
  const songName = infoName || modTitle || filename.replace(/\.[^/.]+$/, "");
  const sampleHeaders = [];
  for (let i = 0; i < NUM_MOD_INSTRUMENTS; i++) {
    const base = MOD_SAMPLE_HDR_OFFSET + i * MOD_SAMPLE_HDR_SIZE;
    const name = readStr(buf, base, 22);
    const lengthWords = readU16BE(buf, base + 22);
    const rawFT = buf[base + 24] & 15;
    const finetune = rawFT > 7 ? rawFT - 16 : rawFT;
    const volume = Math.min(buf[base + 25], 64);
    const loopStartWords = readU16BE(buf, base + 26);
    const loopLenWords = readU16BE(buf, base + 28);
    sampleHeaders.push({ name, lengthWords, finetune, volume, loopStartWords, loopLenWords });
  }
  const songLength = buf[MOD_ORDER_COUNT_OFF];
  const restartPosition = buf[MOD_RESTART_OFF];
  const orderTable = [];
  let maxPatternIndex = 0;
  for (let i = 0; i < 128; i++) {
    const p = buf[MOD_ORDER_TABLE_OFF + i];
    orderTable.push(p);
    if (i < songLength && p > maxPatternIndex) maxPatternIndex = p;
  }
  const numPatterns = maxPatternIndex + 1;
  void readStr(buf, MOD_TAG_OFF, 4);
  const patternCells = [];
  for (let patIdx = 0; patIdx < numPatterns; patIdx++) {
    const patOffset = MOD_PATTERN_DATA_OFF + patIdx * MOD_ROWS_PER_PATTERN * MOD_CHANNELS * 4;
    const rows = [];
    for (let row = 0; row < MOD_ROWS_PER_PATTERN; row++) {
      const rowCells = [];
      for (let ch = 0; ch < MOD_CHANNELS; ch++) {
        const off = patOffset + (row * MOD_CHANNELS + ch) * 4;
        if (off + 3 >= buf.byteLength) {
          rowCells.push({ note: 0, instrument: 0, effTyp: 0, eff: 0 });
          continue;
        }
        const b0 = buf[off];
        const b1 = buf[off + 1];
        const b2 = buf[off + 2];
        const b3 = buf[off + 3];
        const period = (b0 & 15) << 8 | b1;
        const instrument = b0 & 240 | b2 >> 4;
        const effectType = b2 & 15;
        const effectParam = b3;
        const noteIdx = period > 0 ? periodToNoteIndex(period) : 0;
        const xmNote = amigaNoteToXM(noteIdx);
        rowCells.push({ note: xmNote, instrument, effTyp: effectType, eff: effectParam });
      }
      rows.push(rowCells);
    }
    patternCells.push(rows);
  }
  let initialSpeed = 6;
  let initialBPM = 125;
  if (infoTempo > 0 && useCIA) {
    initialBPM = infoTempo;
  } else {
    const found = scanForTempo(patternCells, orderTable);
    initialSpeed = found.speed;
    initialBPM = found.bpm;
  }
  const trackerPatterns = patternCells.map((rows, patIdx) => {
    const channels = Array.from({ length: MOD_CHANNELS }, (_, ch) => {
      const trackerRows = rows.map((rowCells) => {
        const cell = rowCells[ch];
        return {
          note: cell.note,
          instrument: cell.instrument,
          volume: 0,
          effTyp: cell.effTyp,
          eff: cell.eff,
          effTyp2: 0,
          eff2: 0
        };
      });
      return {
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: CHANNEL_PANNING[ch],
        instrumentId: null,
        color: null,
        rows: trackerRows
      };
    });
    return {
      id: `pattern-${patIdx}`,
      name: `Pattern ${patIdx}`,
      length: MOD_ROWS_PER_PATTERN,
      channels,
      importMetadata: {
        sourceFormat: "PT36",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: MOD_CHANNELS,
        originalPatternCount: numPatterns,
        originalInstrumentCount: NUM_MOD_INSTRUMENTS
      }
    };
  });
  let sampleDataOffset = MOD_PATTERN_DATA_OFF + numPatterns * MOD_ROWS_PER_PATTERN * MOD_CHANNELS * 4;
  const instruments = [];
  for (let i = 0; i < NUM_MOD_INSTRUMENTS; i++) {
    const hdr = sampleHeaders[i];
    const id = i + 1;
    const byteLength = hdr.lengthWords * 2;
    if (byteLength === 0) {
      instruments.push({
        id,
        name: hdr.name || `Sample ${id}`,
        type: "sample",
        synthType: "Sampler",
        effects: [],
        volume: -60,
        pan: 0
      });
      continue;
    }
    const end = Math.min(sampleDataOffset + byteLength, buf.byteLength);
    const rawPcm = buf.subarray(sampleDataOffset, end);
    sampleDataOffset += byteLength;
    const loopStartBytes = hdr.loopStartWords * 2;
    const loopLenBytes = hdr.loopLenWords * 2;
    const hasLoop = hdr.loopLenWords > 1;
    const loopStart = hasLoop ? loopStartBytes : 0;
    const loopEnd = hasLoop ? loopStartBytes + loopLenBytes : 0;
    instruments.push(
      createSamplerInstrument(
        id,
        hdr.name || `Sample ${id}`,
        rawPcm,
        hdr.volume,
        8287,
        // Amiga standard C-3 sample rate (matches ICEParser / OktalyzerParser)
        loopStart,
        loopEnd
      )
    );
  }
  const songPositions = orderTable.slice(0, songLength);
  return {
    name: songName,
    format: "MOD",
    patterns: trackerPatterns,
    instruments,
    songPositions,
    songLength,
    restartPosition,
    numChannels: MOD_CHANNELS,
    initialSpeed,
    initialBPM,
    linearPeriods: false
  };
}
function scanForTempo(patternCells, orderTable) {
  let speed = 6;
  let bpm = 125;
  let foundSpeed = false;
  let foundBPM = false;
  const firstPatIdx = orderTable[0] ?? 0;
  const firstPat = patternCells[firstPatIdx];
  if (!firstPat) return { speed, bpm };
  const rowsToScan = Math.min(16, firstPat.length);
  for (let row = 0; row < rowsToScan && !(foundSpeed && foundBPM); row++) {
    for (const cell of firstPat[row]) {
      if (cell.effTyp === 15 && cell.eff !== 0) {
        if (cell.eff < 32) {
          if (!foundSpeed) {
            speed = cell.eff;
            foundSpeed = true;
          }
        } else {
          if (!foundBPM) {
            bpm = cell.eff;
            foundBPM = true;
          }
        }
      }
    }
  }
  return { speed, bpm };
}
export {
  isPT36Format,
  parsePT36File
};
