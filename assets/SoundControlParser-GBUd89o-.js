import { b$ as registerPatternEncoder, c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function xmToSc40Note(xmNote) {
  if (xmNote === 0) return 0;
  const idx = xmNote - 37;
  if (idx < 0 || idx >= 36) return 0;
  return idx + 1;
}
function xmToSc3xNote(xmNote) {
  if (xmNote === 0) return 0;
  const raw = xmNote - 37;
  if (raw < 0) return 0;
  const octave = Math.floor(raw / 12) + 1;
  const semitone = raw % 12;
  const noteInOct = Math.round(semitone * 10 / 12);
  if (octave < 1 || octave > 8 || noteInOct > 9) return 0;
  return octave << 4 | noteInOct;
}
function encodeSoundControl40Cell(cell) {
  const out = new Uint8Array(4);
  out[0] = xmToSc40Note(cell.note ?? 0);
  out[1] = (cell.instrument ?? 0) & 255;
  out[2] = 0;
  out[3] = (cell.volume ?? 0) & 127;
  return out;
}
function encodeSoundControl3xCell(cell) {
  const out = new Uint8Array(4);
  out[0] = xmToSc3xNote(cell.note ?? 0);
  out[1] = (cell.instrument ?? 0) & 255;
  out[2] = 0;
  out[3] = (cell.volume ?? 0) & 127;
  return out;
}
registerPatternEncoder("soundControl", () => encodeSoundControl40Cell);
const PAL_CLOCK = 3546895;
function u8(buf, off) {
  return buf[off];
}
function u16BE(buf, off) {
  return buf[off] << 8 | buf[off + 1];
}
function s16BE(buf, off) {
  const v = u16BE(buf, off);
  return v < 32768 ? v : v - 65536;
}
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function readString(buf, off, len) {
  let str = "";
  for (let i = 0; i < len; i++) {
    const c = buf[off + i];
    if (c === 0) break;
    str += String.fromCharCode(c);
  }
  return str.trimEnd();
}
function periodToFreq(period) {
  return Math.round(PAL_CLOCK / (2 * period));
}
const SC_PERIOD_TABLE = [
  // Octave 1
  856,
  808,
  762,
  720,
  678,
  640,
  604,
  570,
  538,
  508,
  480,
  453,
  // Octave 2
  428,
  404,
  381,
  360,
  339,
  320,
  302,
  285,
  269,
  254,
  240,
  226,
  // Octave 3
  214,
  202,
  190,
  180,
  170,
  160,
  151,
  143,
  135,
  127,
  120,
  113
];
function sc3xNoteToXm(noteByte) {
  if (noteByte === 0) return 0;
  const octave = noteByte >> 4 & 15;
  const noteInOct = noteByte & 15;
  if (octave === 0 || octave > 8 || noteInOct > 9) return 0;
  const semitone = Math.round(noteInOct / 10 * 12);
  const xmNote = (octave - 1) * 12 + semitone + 13;
  return Math.max(1, Math.min(96, xmNote));
}
function sc40NoteToXm(noteIndex) {
  if (noteIndex === 0) return 0;
  const idx = noteIndex - 1;
  if (idx < SC_PERIOD_TABLE.length) {
    return Math.max(1, Math.min(96, idx + 13));
  }
  return Math.max(1, Math.min(96, noteIndex));
}
function isSoundControlFormat(bytes) {
  if (bytes.length < 576) return false;
  const tracksLen = u32BE(bytes, 16);
  if (tracksLen === 0 || tracksLen >= 32768) return false;
  if ((tracksLen & 1) !== 0) return false;
  const checkPos = tracksLen + 64 - 2;
  if (checkPos + 6 > bytes.length) return false;
  if (u16BE(bytes, checkPos) !== 65535) return false;
  if (u32BE(bytes, checkPos + 2) !== 1024) return false;
  return true;
}
function parseSoundControlFile(bytes, filename) {
  if (!isSoundControlFormat(bytes)) return null;
  const songName = readString(bytes, 0, 16).trim() || filename.replace(/\.[^/.]+$/, "");
  const tracksLen = u32BE(bytes, 16);
  const samplesLen = u32BE(bytes, 20);
  const posListLen = u32BE(bytes, 24);
  u32BE(bytes, 28);
  const versionWord = u16BE(bytes, 34);
  let speed = 6;
  if (versionWord >= 3) {
    speed = u16BE(bytes, 36) || 6;
    if (speed < 1 || speed > 31) speed = 6;
  }
  const is40orHigher = versionWord >= 3;
  const tracksBase = 64;
  const samplesBase = tracksBase + tracksLen;
  const posListBase = samplesBase + samplesLen;
  const trackOffsets = [];
  for (let i = 0; i < 256; i++) {
    const relOff = tracksBase + i * 2;
    if (relOff + 2 > bytes.length) {
      trackOffsets.push(0);
      continue;
    }
    trackOffsets.push(u16BE(bytes, relOff));
  }
  const tracks = new Array(256).fill(null);
  for (let t = 0; t < 256; t++) {
    const relOff = trackOffsets[t];
    if (relOff === 0) continue;
    const absOff = tracksBase + relOff;
    if (absOff + 10 > bytes.length) continue;
    let off = absOff + 16;
    const rows = [];
    for (; ; ) {
      if (off + 2 > bytes.length) break;
      const eventOff = off;
      const dat1 = u8(bytes, off++);
      const dat2 = u8(bytes, off++);
      if (dat1 === 255) {
        rows.push({ wait: 0, note: 0, sampleOrInstr: 0, volume: 0, isNote: false, isEnd: true, isWait: false, fileOffset: eventOff });
        break;
      }
      if (dat1 === 0) {
        rows.push({ wait: dat2, note: 0, sampleOrInstr: 0, volume: 0, isNote: false, isEnd: false, isWait: true, fileOffset: eventOff });
      } else {
        if (off + 2 > bytes.length) break;
        u8(bytes, off++);
        const zz = u8(bytes, off++);
        const volume = zz === 128 ? 64 : Math.min(64, zz & 127);
        const sampleOrInstr = dat2;
        rows.push({
          wait: 0,
          note: dat1,
          sampleOrInstr,
          volume,
          isNote: true,
          isEnd: false,
          isWait: false,
          fileOffset: eventOff
        });
      }
    }
    tracks[t] = rows;
  }
  const sampleOffsets = [];
  for (let i = 0; i < 256; i++) {
    const relOff = samplesBase + i * 4;
    if (relOff + 4 > bytes.length) {
      sampleOffsets.push(0);
      continue;
    }
    sampleOffsets.push(u32BE(bytes, relOff));
  }
  const samples = new Array(256).fill(null);
  let lastSample = 0;
  for (let s = 0; s < 256; s++) {
    const relOff = sampleOffsets[s];
    if (relOff === 0) continue;
    const absOff = samplesBase + relOff;
    if (absOff + 64 > bytes.length) continue;
    const name = readString(bytes, absOff + 0, 16);
    const length = u16BE(bytes, absOff + 16);
    const loopStart = u16BE(bytes, absOff + 18);
    const loopEnd = u16BE(bytes, absOff + 20);
    const noteTranspose = s16BE(bytes, absOff + 42);
    const realSampleLengthWithHeader = u32BE(bytes, absOff + 60);
    const realSampleLen = realSampleLengthWithHeader > 64 ? realSampleLengthWithHeader - 64 : 0;
    let sampleData = null;
    const dataStart = absOff + 64;
    if (realSampleLen > 0 && dataStart + realSampleLen <= bytes.length) {
      sampleData = bytes.slice(dataStart, dataStart + realSampleLen);
    }
    samples[s] = { name, length, loopStart, loopEnd, noteTranspose, sampleData };
    lastSample = s;
  }
  const sampleList = samples.slice(0, lastSample + 1);
  const numPositions = Math.floor(posListLen / 12);
  const positions = [];
  for (let p = 0; p < numPositions; p++) {
    const base = posListBase + p * 12;
    const row = [];
    for (let ch = 0; ch < 6; ch++) {
      if (base + ch * 2 + 1 > bytes.length) {
        row.push(0);
        continue;
      }
      row.push(u8(bytes, base + ch * 2));
    }
    positions.push(row);
  }
  const instrConfigs = [];
  let instrId = 1;
  const sampleIdMap = /* @__PURE__ */ new Map();
  for (let s = 0; s <= lastSample; s++) {
    const samp = sampleList[s];
    if (!samp) {
      instrConfigs.push({
        id: instrId,
        name: `Sample ${s}`,
        type: "synth",
        synthType: "Synth",
        effects: [],
        volume: 0,
        pan: 0
      });
    } else {
      const c3Rate = periodToFreq(214);
      if (samp.sampleData && samp.sampleData.length > 0) {
        const hasLoop = samp.loopEnd > samp.loopStart;
        const loopStart = hasLoop ? samp.loopStart * 2 : 0;
        const loopEnd = hasLoop ? samp.loopEnd * 2 : 0;
        instrConfigs.push(
          createSamplerInstrument(instrId, samp.name || `Sample ${s}`, samp.sampleData, 64, c3Rate, loopStart, loopEnd)
        );
      } else {
        instrConfigs.push({
          id: instrId,
          name: samp.name || `Sample ${s}`,
          type: "synth",
          synthType: "Synth",
          effects: [],
          volume: 0,
          pan: 0
        });
      }
    }
    sampleIdMap.set(s, instrId);
    instrId++;
  }
  const trackRowFileOffsets = /* @__PURE__ */ new Map();
  function trackToRows(trackNum) {
    const track = tracks[trackNum];
    if (!track) return [emptyCell()];
    const cells = [];
    const rowOffsets = [];
    for (const row of track) {
      if (row.isEnd) break;
      if (row.isWait) {
        for (let w = 0; w < Math.max(1, row.wait); w++) {
          cells.push(emptyCell());
          rowOffsets.push(-1);
        }
        continue;
      }
      if (row.isNote) {
        const xmNote = is40orHigher ? sc40NoteToXm(row.note) : sc3xNoteToXm(row.note);
        const sampIdx = row.sampleOrInstr;
        const id = sampleIdMap.get(sampIdx) ?? 0;
        cells.push({
          note: xmNote,
          instrument: id,
          volume: row.volume > 0 ? row.volume : 0,
          effTyp: 0,
          eff: 0,
          effTyp2: 0,
          eff2: 0
        });
        rowOffsets.push(row.fileOffset);
      }
    }
    if (cells.length === 0) {
      cells.push(emptyCell());
      rowOffsets.push(-1);
    }
    trackRowFileOffsets.set(trackNum, rowOffsets);
    return cells;
  }
  const numChannels = 6;
  const trackerPatterns = [];
  const CHAN_PAN = [-50, 50, 50, -50, -50, 50];
  for (let posIdx = 0; posIdx < numPositions; posIdx++) {
    const pos = positions[posIdx];
    const channelCells = [];
    let maxRows = 1;
    for (let ch = 0; ch < numChannels; ch++) {
      const trackNum = pos[ch] ?? 0;
      const rows = trackToRows(trackNum);
      channelCells.push(rows);
      if (rows.length > maxRows) maxRows = rows.length;
    }
    for (let ch = 0; ch < numChannels; ch++) {
      while (channelCells[ch].length < maxRows) channelCells[ch].push(emptyCell());
    }
    trackerPatterns.push({
      id: `pattern-${posIdx}`,
      name: `Position ${posIdx}`,
      length: maxRows,
      channels: channelCells.map((rows, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: CHAN_PAN[ch] ?? 0,
        instrumentId: null,
        color: null,
        rows
      })),
      importMetadata: {
        sourceFormat: "SC",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: numChannels,
        originalPatternCount: numPositions,
        originalInstrumentCount: instrConfigs.length
      }
    });
  }
  if (trackerPatterns.length === 0) {
    trackerPatterns.push(makeEmptyPattern(filename, numChannels, 64));
  }
  const encodeCell = is40orHigher ? encodeSoundControl40Cell : encodeSoundControl3xCell;
  const uadePatternLayout = {
    formatId: "soundControl",
    patternDataFileOffset: tracksBase,
    // tracks section starts at offset 64
    bytesPerCell: 4,
    rowsPerPattern: 64,
    // nominal (actual varies per track)
    numChannels,
    numPatterns: trackerPatterns.length,
    moduleSize: bytes.byteLength,
    encodeCell,
    getCellFileOffset: (pattern, row, channel) => {
      const pos = positions[pattern];
      if (!pos) return -1;
      const trackNum = pos[channel] ?? 0;
      const offsets = trackRowFileOffsets.get(trackNum);
      if (!offsets || row >= offsets.length) return -1;
      return offsets[row];
    }
  };
  return {
    name: songName,
    format: "SC",
    patterns: trackerPatterns,
    instruments: instrConfigs,
    songPositions: trackerPatterns.map((_, i) => i),
    songLength: trackerPatterns.length,
    restartPosition: 0,
    numChannels,
    initialSpeed: speed,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    uadeEditableFileName: filename,
    uadePatternLayout
  };
}
function emptyCell() {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}
function makeEmptyPattern(filename, numChannels, rowCount) {
  return {
    id: "pattern-0",
    name: "Pattern 0",
    length: rowCount,
    channels: Array.from({ length: numChannels }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: 0,
      instrumentId: null,
      color: null,
      rows: Array.from({ length: rowCount }, () => emptyCell())
    })),
    importMetadata: {
      sourceFormat: "SC",
      sourceFile: filename,
      importedAt: (/* @__PURE__ */ new Date()).toISOString(),
      originalChannelCount: numChannels,
      originalPatternCount: 0,
      originalInstrumentCount: 0
    }
  };
}
export {
  isSoundControlFormat,
  parseSoundControlFile
};
