import { c5 as registerVariableEncoder } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function encodeSawteethPattern(rows, _channel) {
  const bytes = new Uint8Array(rows.length * 3);
  for (let i = 0; i < rows.length; i++) {
    const cell = rows[i];
    const off = i * 3;
    bytes[off] = (cell.instrument ?? 0) & 255;
    bytes[off + 1] = 0;
    const note = cell.note ?? 0;
    bytes[off + 2] = note >= 1 && note <= 96 ? note : 0;
  }
  return bytes;
}
const sawteethEncoder = {
  formatId: "sawteeth",
  encodePattern: encodeSawteethPattern
};
registerVariableEncoder(sawteethEncoder);
const MAX_CHAN = 12;
const CHN_STEPS = 8192;
function u8(buf, off) {
  return buf[off];
}
function s8(v) {
  return v < 128 ? v : v - 256;
}
function u16BE(buf, off) {
  return buf[off] << 8 | buf[off + 1];
}
function readString(buf, off) {
  let str = "";
  while (off < buf.length) {
    const c = buf[off++];
    if (c === 0 || c === 10) break;
    if (c === 13) continue;
    str += String.fromCharCode(c);
  }
  return { str, nextOff: off };
}
function isSawteethFormat(bytes) {
  if (bytes.length < 10) return false;
  return bytes[0] === 83 && // 'S'
  bytes[1] === 87 && // 'W'
  bytes[2] === 84 && // 'T'
  bytes[3] === 68;
}
function parseSawteethFile(bytes, filename) {
  if (!isSawteethFormat(bytes)) return null;
  let off = 4;
  if (off + 2 > bytes.length) return null;
  const stVersion = u16BE(bytes, off);
  off += 2;
  if (stVersion > 1200) return null;
  let spsPal;
  if (stVersion < 900) {
    spsPal = 882;
  } else {
    if (off + 2 > bytes.length) return null;
    spsPal = u16BE(bytes, off);
    off += 2;
  }
  if (stVersion >= 900 && spsPal < 1) return null;
  if (off >= bytes.length) return null;
  const channelCount = u8(bytes, off++);
  if (channelCount < 1 || channelCount > MAX_CHAN) return null;
  const channels = [];
  for (let i = 0; i < channelCount; i++) {
    if (off + 4 > bytes.length) return null;
    const left = u8(bytes, off++);
    const right = u8(bytes, off++);
    const len = u16BE(bytes, off);
    off += 2;
    let lLoop;
    if (stVersion < 910) {
      lLoop = 0;
    } else {
      if (off + 2 > bytes.length) return null;
      lLoop = u16BE(bytes, off);
      off += 2;
    }
    let rLoop;
    if (stVersion < 1200) {
      rLoop = len - 1;
    } else {
      if (off + 2 > bytes.length) return null;
      rLoop = u16BE(bytes, off);
      off += 2;
    }
    if (len < 1 || len > CHN_STEPS) return null;
    const rLoopClamped = rLoop >= len ? len - 1 : rLoop;
    const steps = [];
    for (let j = 0; j < len; j++) {
      if (off + 3 > bytes.length) return null;
      const part = u8(bytes, off++);
      const transp = s8(bytes[off++]);
      const dAmp = u8(bytes, off++);
      steps.push({ part, transp, dAmp });
    }
    channels.push({ left, right, len, lLoop, rLoop: rLoopClamped, steps });
  }
  if (off >= bytes.length) return null;
  const partCount = u8(bytes, off++);
  if (partCount < 1) return null;
  const parts = [];
  for (let i = 0; i < partCount; i++) {
    if (off + 2 > bytes.length) return null;
    const sps = u8(bytes, off++);
    if (sps < 1) return null;
    const len = u8(bytes, off++);
    if (len < 1) return null;
    const steps = [];
    for (let j = 0; j < len; j++) {
      if (off + 3 > bytes.length) return null;
      const ins = u8(bytes, off++);
      const eff = u8(bytes, off++);
      const note = u8(bytes, off++);
      steps.push({ ins, eff, note });
    }
    parts.push({ sps, len, steps, name: "" });
  }
  for (let i = 0; i < channelCount; i++) {
    for (let j = 0; j < channels[i].len; j++) {
      if (channels[i].steps[j].part >= partCount) {
        channels[i].steps[j].part = partCount - 1;
      }
    }
  }
  if (off >= bytes.length) return null;
  const instrumentCountRaw = u8(bytes, off++);
  const instrumentCount = instrumentCountRaw + 1;
  if (instrumentCount < 2) return null;
  const dummyIns = {
    filterPoints: 1,
    filter: [{ time: 0, lev: 0 }],
    ampPoints: 1,
    amp: [{ time: 0, lev: 0 }],
    filterMode: 0,
    clipMode: 0,
    boost: 1,
    vibS: 1,
    vibD: 1,
    pwmS: 1,
    pwmD: 1,
    res: 0,
    sps: 30,
    len: 1,
    loop: 0,
    steps: [{ relative: false, wForm: 0, note: 0 }],
    name: ""
  };
  const instruments = [dummyIns];
  for (let i = 1; i < instrumentCount; i++) {
    if (off >= bytes.length) return null;
    const filterPoints = u8(bytes, off++);
    if (filterPoints < 1) return null;
    const filter = [];
    for (let j = 0; j < filterPoints; j++) {
      if (off + 2 > bytes.length) return null;
      filter.push({ time: u8(bytes, off++), lev: u8(bytes, off++) });
    }
    if (off >= bytes.length) return null;
    const ampPoints = u8(bytes, off++);
    if (ampPoints < 1) return null;
    const amp = [];
    for (let j = 0; j < ampPoints; j++) {
      if (off + 2 > bytes.length) return null;
      amp.push({ time: u8(bytes, off++), lev: u8(bytes, off++) });
    }
    if (off + 8 > bytes.length) return null;
    const filterMode = u8(bytes, off++);
    const clipModeBoost = u8(bytes, off++);
    const boost = clipModeBoost & 15;
    const clipMode = clipModeBoost >> 4 & 15;
    const vibS = u8(bytes, off++);
    const vibD = u8(bytes, off++);
    const pwmS = u8(bytes, off++);
    const pwmD = u8(bytes, off++);
    const res = u8(bytes, off++);
    const sps = u8(bytes, off++);
    if (sps < 1) return null;
    let len;
    let loop;
    if (stVersion < 900) {
      if (off >= bytes.length) return null;
      const tmp = u8(bytes, off++);
      len = tmp & 127;
      loop = (tmp & 1) !== 0 ? 0 : len > 0 ? len - 1 : 0;
    } else {
      if (off + 2 > bytes.length) return null;
      len = u8(bytes, off++);
      loop = u8(bytes, off++);
      if (len < 1 || loop >= len) return null;
    }
    if (len < 1) return null;
    const insSteps = [];
    for (let j = 0; j < len; j++) {
      if (off + 2 > bytes.length) return null;
      const combined = u8(bytes, off++);
      const note = u8(bytes, off++);
      insSteps.push({
        relative: (combined & 128) !== 0,
        wForm: combined & 15,
        note
      });
    }
    instruments.push({
      filterPoints,
      filter,
      ampPoints,
      amp,
      filterMode,
      clipMode,
      boost,
      vibS,
      vibD,
      pwmS,
      pwmD,
      res,
      sps,
      len,
      loop,
      steps: insSteps,
      name: ""
    });
  }
  if (off >= bytes.length) return null;
  const breakPCount = u8(bytes, off++);
  for (let i = 0; i < breakPCount; i++) {
    if (off + 8 > bytes.length) break;
    off += 8;
  }
  let moduleName = filename.replace(/\.[^/.]+$/, "");
  if (off < bytes.length) {
    const r1 = readString(bytes, off);
    if (r1.str) moduleName = r1.str;
    off = r1.nextOff;
  }
  if (off < bytes.length) {
    const r2 = readString(bytes, off);
    off = r2.nextOff;
  }
  for (let i = 0; i < partCount && off < bytes.length; i++) {
    const r = readString(bytes, off);
    parts[i].name = r.str;
    off = r.nextOff;
  }
  for (let i = 1; i < instrumentCount && off < bytes.length; i++) {
    const r = readString(bytes, off);
    instruments[i].name = r.str;
    off = r.nextOff;
  }
  const instrConfigs = [];
  for (let i = 1; i < instrumentCount; i++) {
    const inst = instruments[i];
    instrConfigs.push({
      id: i,
      name: inst.name || `Instrument ${i}`,
      type: "synth",
      synthType: "Synth",
      effects: [],
      volume: 0,
      pan: 0
    });
  }
  const expandedChannels = [];
  for (let ch = 0; ch < channelCount; ch++) {
    const chInfo = channels[ch];
    const flat = [];
    for (let si = 0; si <= chInfo.rLoop; si++) {
      const step = chInfo.steps[si];
      const partIdx = step.part < partCount ? step.part : partCount - 1;
      const part = parts[partIdx];
      for (let row = 0; row < part.len; row++) {
        const s = part.steps[row];
        let note = s.note;
        if (note > 0) {
          note = Math.max(1, Math.min(96, note + step.transp));
        }
        flat.push({ ins: s.ins, eff: s.eff, note, partIdx });
      }
    }
    expandedChannels.push(flat);
  }
  const maxRows = Math.max(...expandedChannels.map((c) => c.length), 1);
  const ROWS_PER_PATTERN = 64;
  const numPatterns = Math.ceil(maxRows / ROWS_PER_PATTERN);
  const trackerPatterns = [];
  for (let p = 0; p < numPatterns; p++) {
    const startRow = p * ROWS_PER_PATTERN;
    const endRow = Math.min(startRow + ROWS_PER_PATTERN, maxRows);
    const patLen = endRow - startRow;
    const channelRows = [];
    for (let ch = 0; ch < channelCount; ch++) {
      const rows = [];
      const chExpanded = expandedChannels[ch];
      for (let r = 0; r < patLen; r++) {
        const globalRow = startRow + r;
        if (globalRow >= chExpanded.length) {
          rows.push(emptyCell());
          continue;
        }
        const s = chExpanded[globalRow];
        const xmNote = s.note;
        const instrId = s.ins > 0 && s.ins < instrumentCount ? s.ins : 0;
        rows.push({
          note: xmNote,
          instrument: instrId,
          volume: 0,
          effTyp: 0,
          eff: 0,
          effTyp2: 0,
          eff2: 0
        });
      }
      channelRows.push(rows);
    }
    trackerPatterns.push({
      id: `pattern-${p}`,
      name: `Pattern ${p}`,
      length: patLen,
      channels: channelRows.map((rows, ch) => {
        const chInfo = channels[ch];
        const panValue = Math.round((chInfo.right - chInfo.left) / 255 * 50);
        return {
          id: `channel-${ch}`,
          name: `Channel ${ch + 1}`,
          muted: false,
          solo: false,
          collapsed: false,
          volume: 100,
          pan: panValue,
          instrumentId: null,
          color: null,
          rows
        };
      }),
      importMetadata: {
        sourceFormat: "SAW",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: channelCount,
        originalPatternCount: partCount,
        originalInstrumentCount: instrumentCount - 1
      }
    });
  }
  if (trackerPatterns.length === 0) {
    trackerPatterns.push(makeEmptyPattern(filename, channelCount, ROWS_PER_PATTERN));
  }
  const filePatternAddrs = [];
  const filePatternSizes = [];
  for (let ch = 0; ch < channelCount; ch++) {
    filePatternAddrs.push(0);
    filePatternSizes.push(expandedChannels[ch].length * 3);
  }
  const trackMap = [];
  for (let pidx = 0; pidx < trackerPatterns.length; pidx++) {
    trackMap.push(Array.from({ length: channelCount }, (_, ch) => ch));
  }
  const uadeVariableLayout = {
    formatId: "sawteeth",
    numChannels: channelCount,
    numFilePatterns: channelCount,
    rowsPerPattern: ROWS_PER_PATTERN,
    moduleSize: bytes.length,
    encoder: {
      formatId: "sawteeth",
      encodePattern: encodeSawteethPattern
    },
    filePatternAddrs,
    filePatternSizes,
    trackMap
  };
  return {
    name: moduleName,
    format: "SAW",
    patterns: trackerPatterns,
    instruments: instrConfigs,
    songPositions: trackerPatterns.map((_, i) => i),
    songLength: trackerPatterns.length,
    restartPosition: 0,
    numChannels: channelCount,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    uadeEditableFileName: filename,
    uadeVariableLayout
  };
}
function emptyCell() {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}
function makeEmptyPattern(filename, numChannels, rowsPerPattern) {
  return {
    id: "pattern-0",
    name: "Pattern 0",
    length: rowsPerPattern,
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
      rows: Array.from({ length: rowsPerPattern }, () => emptyCell())
    })),
    importMetadata: {
      sourceFormat: "SAW",
      sourceFile: filename,
      importedAt: (/* @__PURE__ */ new Date()).toISOString(),
      originalChannelCount: numChannels,
      originalPatternCount: 0,
      originalInstrumentCount: 0
    }
  };
}
export {
  isSawteethFormat,
  parseSawteethFile
};
