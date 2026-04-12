import { c6 as encodeMODCell, c7 as amigaNoteToXM, c3 as periodToNoteIndex } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const MIN_FILE_SIZE = 26;
const SONG_ORDER_OFF = 660;
const SONG_ORDER_LEN = 128;
const PATTERN_DATA_OFF = SONG_ORDER_OFF + SONG_ORDER_LEN;
const ROWS_PER_PATTERN = 64;
const NUM_CHANNELS = 4;
const BYTES_PER_ROW = NUM_CHANNELS * 4;
const PATTERN_SIZE = ROWS_PER_PATTERN * BYTES_PER_ROW;
function u16BE(buf, off) {
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function decodeMODCell(buf, off) {
  const b0 = buf[off];
  const b1 = buf[off + 1];
  const b2 = buf[off + 2];
  const b3 = buf[off + 3];
  const instrHi = b0 & 240;
  const period = (b0 & 15) << 8 | b1;
  const instrLo = b2 >> 4 & 15;
  const effTyp = b2 & 15;
  const eff = b3;
  const instrument = instrHi | instrLo;
  const amigaIdx = periodToNoteIndex(period);
  const note = amigaNoteToXM(amigaIdx);
  return {
    note,
    instrument,
    volume: 0,
    effTyp: effTyp !== 0 || eff !== 0 ? effTyp : 0,
    eff: effTyp !== 0 || eff !== 0 ? eff : 0,
    effTyp2: 0,
    eff2: 0
  };
}
function isFashionTrackerFormat(buffer) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;
  if (u32BE(buf, 0) !== 335282240) return false;
  if (u32BE(buf, 8) !== 1316029497) return false;
  if (u16BE(buf, 12) !== 1) return false;
  if (u32BE(buf, 18) !== 1727286901) return false;
  if (u32BE(buf, 22) !== 1223163902) return false;
  return true;
}
function parseFashionTrackerFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (!isFashionTrackerFormat(buf)) {
    throw new Error("Not a Fashion Tracker module");
  }
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^ex\./i, "").replace(/\.ex$/i, "") || baseName;
  const songOrders = [];
  let maxPatIdx = 0;
  for (let i = 0; i < SONG_ORDER_LEN; i++) {
    const patIdx = buf[SONG_ORDER_OFF + i];
    songOrders.push(patIdx);
    if (patIdx > maxPatIdx) maxPatIdx = patIdx;
  }
  let songLength = SONG_ORDER_LEN;
  while (songLength > 1 && songOrders[songLength - 1] === 0) {
    songLength--;
  }
  const usedOrders = songOrders.slice(0, songLength);
  const numPatterns = maxPatIdx + 1;
  const availablePatterns = Math.min(
    numPatterns,
    Math.floor((buf.length - PATTERN_DATA_OFF) / PATTERN_SIZE)
  );
  let maxSampleIdx = 0;
  const patterns = [];
  for (let patIdx = 0; patIdx < availablePatterns; patIdx++) {
    const patOff = PATTERN_DATA_OFF + patIdx * PATTERN_SIZE;
    const channels = [];
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const rows = [];
      for (let row = 0; row < ROWS_PER_PATTERN; row++) {
        const cellOff = patOff + row * BYTES_PER_ROW + ch * 4;
        const cell = decodeMODCell(buf, cellOff);
        rows.push(cell);
        if (cell.instrument > maxSampleIdx) {
          maxSampleIdx = cell.instrument;
        }
      }
      channels.push({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: ch === 0 || ch === 3 ? -50 : 50,
        // Amiga LRRL panning
        instrumentId: null,
        color: null,
        rows
      });
    }
    patterns.push({
      id: `pattern-${patIdx}`,
      name: `Pattern ${patIdx}`,
      length: ROWS_PER_PATTERN,
      channels,
      importMetadata: {
        sourceFormat: "MOD",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: NUM_CHANNELS,
        originalPatternCount: availablePatterns,
        originalInstrumentCount: maxSampleIdx
      }
    });
  }
  const songPositions = [];
  for (const patIdx of usedOrders) {
    if (patIdx < availablePatterns) {
      songPositions.push(patIdx);
    }
  }
  if (songPositions.length === 0) songPositions.push(0);
  const numInstruments = Math.max(1, maxSampleIdx);
  const instruments = [];
  for (let i = 1; i <= numInstruments; i++) {
    instruments.push({
      id: i,
      name: `Sample ${i}`,
      type: "synth",
      synthType: "Synth",
      effects: [],
      volume: 0,
      pan: 0
    });
  }
  const uadePatternLayout = {
    formatId: "fashionTracker",
    patternDataFileOffset: PATTERN_DATA_OFF,
    bytesPerCell: 4,
    rowsPerPattern: ROWS_PER_PATTERN,
    numChannels: NUM_CHANNELS,
    numPatterns: availablePatterns,
    moduleSize: buf.length,
    encodeCell: encodeMODCell,
    getCellFileOffset: (pattern, row, channel) => {
      return PATTERN_DATA_OFF + pattern * PATTERN_SIZE + row * BYTES_PER_ROW + channel * 4;
    }
  };
  return {
    name: `${moduleName} [Fashion Tracker]`,
    format: "MOD",
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: NUM_CHANNELS,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadePatternLayout,
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename
  };
}
export {
  isFashionTrackerFormat,
  parseFashionTrackerFile
};
