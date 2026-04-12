import { c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import { c as cdfm67Encoder } from "./CDFM67Encoder-Dw1zKW5X.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function u8(bytes, off) {
  return bytes[off] ?? 0;
}
function u32le(bytes, off) {
  return ((bytes[off] ?? 0) | (bytes[off + 1] ?? 0) << 8 | (bytes[off + 2] ?? 0) << 16 | (bytes[off + 3] ?? 0) << 24) >>> 0;
}
function readString(bytes, off, len) {
  let s = "";
  for (let i = 0; i < len; i++) {
    const c = bytes[off + i] ?? 0;
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.trim();
}
const HDR_SIZE = 1954;
const PAT_OFFSETS_SIZE = 128 * 4;
const PAT_DATA_BASE = 2978;
const NUM_PCM_CHANNELS = 4;
const NUM_FM_CHANNELS = 9;
const NUM_CHANNELS = NUM_PCM_CHANNELS + NUM_FM_CHANNELS;
const NUM_PCM_INSTRS = 32;
const NUM_FM_INSTRS = 32;
const ROWS_PER_PATTERN = 64;
const NUM_PATTERNS = 128;
const DEFAULT_BPM = 143;
const C5_SPEED_PCM = 8287;
const FM_VOLUME_TABLE = [
  8,
  16,
  24,
  32,
  40,
  44,
  48,
  52,
  54,
  56,
  58,
  60,
  61,
  62,
  63,
  64
];
const PCM_CHANNEL_PAN = [64, 192, 64, 192];
function isCDFM67Format(bytes) {
  if (bytes.length < PAT_DATA_BASE) return false;
  const speed = u8(bytes, 0);
  if (speed < 1 || speed > 15) return false;
  for (let i = 0; i < 256; i++) {
    const ord = u8(bytes, 1698 + i);
    if (ord >= 128 && ord !== 255) return false;
  }
  let anyNonSilent = false;
  for (let smp = 0; smp < 32; smp++) {
    if (u8(bytes, 2 + smp * 13 + 12) !== 0) return false;
    const smpBase = 418 + smp * 16;
    if (u32le(bytes, smpBase) !== 0) return false;
    const length = u32le(bytes, smpBase + 4);
    const loopStart = u32le(bytes, smpBase + 8);
    const loopEnd = u32le(bytes, smpBase + 12);
    if (length > 1048575) return false;
    if (u8(bytes, 930 + smp * 13 + 12) !== 0) return false;
    const fmBase = 1346 + smp * 11;
    if (u8(bytes, fmBase) & 240) return false;
    if (u8(bytes, fmBase + 5) & 252) return false;
    if (u8(bytes, fmBase + 10) & 252) return false;
    if (length !== 0 && loopEnd < 1048575) {
      if (loopEnd > length) return false;
      if (loopStart > loopEnd) return false;
    }
    if (!anyNonSilent) {
      if (length !== 0) {
        anyNonSilent = true;
        continue;
      }
      let fmNonZero = false;
      for (let b = 0; b < 11; b++) {
        if (u8(bytes, fmBase + b) !== 0) {
          fmNonZero = true;
          break;
        }
      }
      if (fmNonZero) anyNonSilent = true;
    }
  }
  return anyNonSilent;
}
function translateVolume(rawVol, isFM) {
  const v = rawVol & 15;
  if (isFM) {
    return FM_VOLUME_TABLE[v] ?? 64;
  }
  return 4 + v * 4;
}
function parseCDFM67File(bytes, filename) {
  try {
    return parseInternal(bytes, filename);
  } catch {
    return null;
  }
}
function parseInternal(bytes, filename) {
  var _a, _b, _c;
  if (!isCDFM67Format(bytes)) return null;
  const speed = u8(bytes, 0);
  const restartPos = u8(bytes, 1);
  const orderList = [];
  for (let i = 0; i < 256; i++) {
    const ord = u8(bytes, 1698 + i);
    if (ord === 255) break;
    orderList.push(ord);
  }
  if (orderList.length === 0) orderList.push(0);
  const patOffsets = [];
  const patLengths = [];
  for (let i = 0; i < NUM_PATTERNS; i++) {
    patOffsets.push(u32le(bytes, HDR_SIZE + i * 4));
    patLengths.push(u32le(bytes, HDR_SIZE + PAT_OFFSETS_SIZE + i * 4));
  }
  const patterns = [];
  for (let pat = 0; pat < NUM_PATTERNS; pat++) {
    const patStart = PAT_DATA_BASE + patOffsets[pat];
    const patLen = patLengths[pat];
    if (patLen < 3 || patLen > 4096 || patStart + patLen > bytes.length) {
      patterns.push(makeEmptyPattern(pat, filename));
      continue;
    }
    const channelRows = Array.from(
      { length: NUM_CHANNELS },
      () => Array.from({ length: ROWS_PER_PATTERN }, () => emptyCell())
    );
    let row = 0;
    let pos = patStart;
    const patEnd = patStart + patLen;
    while (row < ROWS_PER_PATTERN && pos < patEnd) {
      const cmd = u8(bytes, pos++);
      if (cmd <= 12) {
        if (pos + 2 > patEnd) break;
        const note = u8(bytes, pos++);
        const instrVol = u8(bytes, pos++);
        const isFM = cmd >= NUM_PCM_CHANNELS;
        const cell = (_a = channelRows[cmd]) == null ? void 0 : _a[row];
        if (!cell) continue;
        const semitone = note & 15;
        const octave = note >> 4 & 7;
        const instrBit = (note & 128) >> 3;
        const instrLo = instrVol >> 4 & 15;
        const instrHi = instrBit;
        const instr = instrLo | instrHi;
        const noteBase = isFM ? 12 : 36;
        const xmNote = 1 + noteBase + semitone + octave * 12;
        const instrBase = isFM ? NUM_PCM_INSTRS : 0;
        cell.note = xmNote >= 1 && xmNote <= 120 ? xmNote : 0;
        cell.instrument = instrBase + instr + 1;
        cell.volume = translateVolume(instrVol & 15, isFM);
      } else if (cmd >= 32 && cmd <= 44) {
        if (pos + 1 > patEnd) break;
        const instrVol = u8(bytes, pos++);
        const ch = cmd - 32;
        const isFM = ch >= NUM_PCM_CHANNELS;
        const cell = (_b = channelRows[ch]) == null ? void 0 : _b[row];
        if (cell) {
          cell.volume = translateVolume(instrVol & 15, isFM);
        }
      } else if (cmd === 64) {
        if (pos + 1 > patEnd) break;
        row += u8(bytes, pos++);
      } else if (cmd === 96) {
        if (row > 0) {
          const cell = (_c = channelRows[0]) == null ? void 0 : _c[row - 1];
          if (cell) {
            cell.effTyp = 13;
            cell.eff = 0;
          }
        }
        break;
      } else {
        break;
      }
    }
    const channels = channelRows.map((rows, ch) => ({
      id: `channel-${ch}`,
      name: ch < NUM_PCM_CHANNELS ? `PCM ${ch + 1}` : `FM ${ch - NUM_PCM_CHANNELS + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: ch < NUM_PCM_CHANNELS ? (PCM_CHANNEL_PAN[ch] ?? 128) - 128 : 0,
      instrumentId: null,
      color: null,
      rows
    }));
    patterns.push({
      id: `pattern-${pat}`,
      name: `Pattern ${pat}`,
      length: ROWS_PER_PATTERN,
      channels,
      importMetadata: {
        sourceFormat: "C67",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: NUM_CHANNELS,
        originalPatternCount: NUM_PATTERNS,
        originalInstrumentCount: NUM_PCM_INSTRS + NUM_FM_INSTRS
      }
    });
  }
  const instruments = [];
  let sampleDataStart = PAT_DATA_BASE;
  for (let i = 0; i < NUM_PATTERNS; i++) {
    const end = PAT_DATA_BASE + patOffsets[i] + patLengths[i];
    if (end > sampleDataStart) sampleDataStart = end;
  }
  let sampleCursor = sampleDataStart;
  for (let smp = 0; smp < NUM_PCM_INSTRS; smp++) {
    const smpNameBase = 2 + smp * 13;
    const smpHdrBase = 418 + smp * 16;
    const smpName = readString(bytes, smpNameBase, 13) || `PCM ${smp + 1}`;
    const length = u32le(bytes, smpHdrBase + 4);
    const loopStart = u32le(bytes, smpHdrBase + 8);
    const loopEnd = u32le(bytes, smpHdrBase + 12);
    if (length === 0 || sampleCursor + length > bytes.length) {
      instruments.push(silentInstrument(smp + 1, smpName));
      sampleCursor += length;
      continue;
    }
    const hasLoop = loopEnd <= length;
    const loopS = hasLoop ? loopStart : 0;
    const loopE = hasLoop ? loopEnd : 0;
    const rawPcm = bytes.subarray(sampleCursor, sampleCursor + length);
    sampleCursor += length;
    instruments.push(
      createSamplerInstrument(smp + 1, smpName, rawPcm, 64, C5_SPEED_PCM, loopS, loopE)
    );
  }
  for (let smp = 0; smp < NUM_FM_INSTRS; smp++) {
    const fmNameBase = 930 + smp * 13;
    const fmName = readString(bytes, fmNameBase, 13) || `FM ${smp + 1}`;
    instruments.push(silentInstrument(NUM_PCM_INSTRS + smp + 1, fmName));
  }
  const songName = filename.replace(/\.[^/.]+$/, "");
  return {
    name: songName,
    format: "S3M",
    patterns,
    instruments,
    songPositions: orderList,
    songLength: orderList.length,
    restartPosition: restartPos < orderList.length ? restartPos : 0,
    numChannels: NUM_CHANNELS,
    initialSpeed: speed,
    initialBPM: DEFAULT_BPM,
    linearPeriods: false,
    libopenmptFileData: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    uadeVariableLayout: {
      formatId: "c67",
      numChannels: NUM_CHANNELS,
      numFilePatterns: NUM_PATTERNS,
      rowsPerPattern: ROWS_PER_PATTERN,
      moduleSize: bytes.length,
      encoder: cdfm67Encoder,
      filePatternAddrs: patOffsets.map((off) => PAT_DATA_BASE + off),
      filePatternSizes: patLengths,
      trackMap: Array.from(
        { length: NUM_PATTERNS },
        (_, p) => Array.from({ length: NUM_CHANNELS }, (__, _ch) => p)
      )
    }
  };
}
function emptyCell() {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}
function makeEmptyPattern(idx, filename) {
  const channels = Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
    id: `channel-${ch}`,
    name: ch < NUM_PCM_CHANNELS ? `PCM ${ch + 1}` : `FM ${ch - NUM_PCM_CHANNELS + 1}`,
    muted: false,
    solo: false,
    collapsed: false,
    volume: 100,
    pan: ch < NUM_PCM_CHANNELS ? (PCM_CHANNEL_PAN[ch] ?? 128) - 128 : 0,
    instrumentId: null,
    color: null,
    rows: Array.from({ length: ROWS_PER_PATTERN }, () => emptyCell())
  }));
  return {
    id: `pattern-${idx}`,
    name: `Pattern ${idx}`,
    length: ROWS_PER_PATTERN,
    channels,
    importMetadata: {
      sourceFormat: "C67",
      sourceFile: filename,
      importedAt: (/* @__PURE__ */ new Date()).toISOString(),
      originalChannelCount: NUM_CHANNELS,
      originalPatternCount: NUM_PATTERNS,
      originalInstrumentCount: NUM_PCM_INSTRS + NUM_FM_INSTRS
    }
  };
}
function silentInstrument(id, name) {
  return {
    id,
    name,
    type: "sample",
    synthType: "Sampler",
    effects: [],
    volume: 0,
    pan: 0
  };
}
export {
  isCDFM67Format,
  parseCDFM67File
};
