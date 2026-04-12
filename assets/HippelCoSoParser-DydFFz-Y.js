import { c5 as registerVariableEncoder } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const PT_PERIODS$1 = [
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
  113,
  107,
  101,
  95,
  90,
  85,
  80,
  76,
  72,
  68,
  64,
  60,
  57
];
const COSO_PERIODS = [
  1712,
  1616,
  1524,
  1440,
  1356,
  1280,
  1208,
  1140,
  1076,
  1016,
  960,
  906,
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
  113,
  107,
  101,
  95,
  90,
  85,
  80,
  76,
  72,
  68,
  64,
  60,
  57,
  54,
  51,
  48,
  45,
  43,
  40,
  38,
  36,
  34,
  32,
  30,
  28,
  27,
  25,
  24,
  23,
  21,
  20,
  19,
  18,
  17,
  16,
  15,
  14
];
function xmNoteToCoSo(xmNote) {
  if (xmNote <= 0 || xmNote > 96) return 0;
  const ptIdx = xmNote - 13;
  if (ptIdx < 0 || ptIdx >= PT_PERIODS$1.length) {
    return Math.max(0, Math.min(83, xmNote - 1));
  }
  const period = PT_PERIODS$1[ptIdx];
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < COSO_PERIODS.length; i++) {
    const d = Math.abs(COSO_PERIODS[i] - period);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}
function s8$1(v) {
  return v < 0 ? v + 256 : v & 255;
}
const hippelCoSoEncoder = {
  formatId: "hippelCoSo",
  encodePattern(rows) {
    const buf = [];
    for (const cell of rows) {
      if (cell.note <= 0) {
        buf.push(0);
        buf.push(0);
      } else {
        const cosoNote = xmNoteToCoSo(cell.note);
        buf.push(s8$1(cosoNote));
        const volseqIdx = Math.max(0, (cell.instrument || 1) - 1) & 31;
        buf.push(volseqIdx);
      }
    }
    buf.push(s8$1(-1));
    return new Uint8Array(buf);
  }
};
registerVariableEncoder(hippelCoSoEncoder);
function u8(buf, off) {
  return buf[off] & 255;
}
function s8(buf, off) {
  const v = buf[off] & 255;
  return v < 128 ? v : v - 256;
}
function u16BE(buf, off) {
  return (buf[off] & 255) << 8 | buf[off + 1] & 255;
}
function u32BE(buf, off) {
  return (buf[off] & 255) * 16777216 + ((buf[off + 1] & 255) << 16) + ((buf[off + 2] & 255) << 8) + (buf[off + 3] & 255);
}
function readString(buf, off, len) {
  let s = "";
  for (let i = 0; i < len; i++) {
    const c = buf[off + i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}
const PERIODS = [
  1712,
  1616,
  1524,
  1440,
  1356,
  1280,
  1208,
  1140,
  1076,
  1016,
  960,
  906,
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
  113,
  113,
  113,
  113,
  113,
  113,
  113,
  113,
  113,
  113,
  113,
  113,
  113,
  3424,
  3232,
  3048,
  2880,
  2712,
  2560,
  2416,
  2280,
  2152,
  2032,
  1920,
  1812,
  6848,
  6464,
  6096,
  5760,
  5424,
  5120,
  4832,
  4560,
  4304,
  4064,
  3840,
  3624
];
const PT_PERIODS = [
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
  113,
  107,
  101,
  95,
  90,
  85,
  80,
  76,
  72,
  68,
  64,
  60,
  57
];
function cosoNoteToXM(cosoNote, trackTranspose) {
  const idx = cosoNote + trackTranspose;
  const clampedIdx = Math.max(0, Math.min(83, idx));
  const period = PERIODS[clampedIdx];
  if (!period || period <= 0) return 0;
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < PT_PERIODS.length; i++) {
    const d = Math.abs(PT_PERIODS[i] - period);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  const xmNote = bestIdx + 13;
  return Math.max(1, Math.min(96, xmNote));
}
function isHippelCoSoFormat(buffer) {
  if (buffer.byteLength < 32) return false;
  const buf = new Uint8Array(buffer);
  return buf[0] === 67 && buf[1] === 79 && buf[2] === 83 && buf[3] === 79;
}
function extractFseq(buf, offset, maxLen = 256) {
  const result = [];
  for (let i = 0; i < maxLen; i++) {
    const pos = offset + i;
    if (pos >= buf.length) break;
    const v = s8(buf, pos);
    result.push(v);
    if (v === -31) break;
  }
  if (result.length === 0) result.push(0, -31);
  return result;
}
function extractVseq(buf, offset, maxLen = 128) {
  const result = [];
  for (let i = 0; i < maxLen; i++) {
    const pos = offset + i;
    if (pos >= buf.length) break;
    const v = s8(buf, pos);
    result.push(v);
    if (v >= -31 && v <= -25) break;
  }
  if (result.length === 0) result.push(32, -31);
  return result;
}
async function parseHippelCoSoFile(buffer, filename, moduleBase = 0) {
  const buf = new Uint8Array(buffer);
  if (buf.length < 32) {
    throw new Error("File too small to be a Jochen Hippel CoSo module");
  }
  const magic = readString(buf, 0, 4);
  if (magic !== "COSO") {
    throw new Error(`Not a CoSo file: magic="${magic}"`);
  }
  const frqseqsOff = u32BE(buf, 4);
  const volseqsOff = u32BE(buf, 8);
  const patternsOff = u32BE(buf, 12);
  const tracksOff = u32BE(buf, 16);
  const songsOff = u32BE(buf, 20);
  const headersOff = u32BE(buf, 24);
  const samplesDataOff = buf.length >= 32 ? u32BE(buf, 28) : buf.length;
  const numSongs = Math.max(1, Math.floor((headersOff - songsOff) / 6));
  const sampleBank = [];
  if (samplesDataOff > headersOff && headersOff > 0 && headersOff + 10 <= buf.length) {
    const rawCount = Math.floor((samplesDataOff - headersOff) / 10) - 1;
    const numSamples = Math.max(0, Math.min(128, rawCount));
    for (let i = 0; i < numSamples; i++) {
      const base = headersOff + i * 10;
      if (base + 10 > buf.length) break;
      const pointer = u32BE(buf, base);
      const length = u16BE(buf, base + 4) << 1;
      const loopStart = u16BE(buf, base + 6);
      const repeatLength = u16BE(buf, base + 8) << 1;
      sampleBank.push({
        index: i,
        pointer,
        length,
        loopStart,
        repeatLength
      });
    }
  }
  const songs = [];
  for (let i = 0; i < numSongs; i++) {
    const base = songsOff + i * 6;
    if (base + 6 > buf.length) break;
    let pointer = u16BE(buf, base);
    const endPtr = u16BE(buf, base + 2);
    const speed = u16BE(buf, base + 4);
    const length = (endPtr - pointer + 1) * 12;
    pointer = pointer * 12 + tracksOff;
    if (length > 12) {
      songs.push({ pointer, length, speed });
    }
  }
  if (songs.length === 0) {
    songs.push({ pointer: tracksOff, length: 12, speed: 6 });
  }
  const song = songs[0];
  const maxVolseqs = Math.min(32, Math.floor((patternsOff - volseqsOff) / 2));
  const instruments = [];
  const seqBodyOffsets = /* @__PURE__ */ new Set();
  for (let i = 0; i < maxVolseqs; i++) {
    const ptrOff = volseqsOff + i * 2;
    if (ptrOff + 2 > buf.length) break;
    const vsqOff = u16BE(buf, ptrOff);
    if (vsqOff === 0 || vsqOff >= buf.length) break;
    if (vsqOff + 5 >= buf.length) break;
    seqBodyOffsets.add(vsqOff + 5);
    const fseqIdx = s8(buf, vsqOff + 1);
    if (fseqIdx !== -128 && fseqIdx >= 0) {
      const fseqPtrOff = frqseqsOff + fseqIdx * 2;
      if (fseqPtrOff + 2 <= buf.length) {
        const fseqDataOff = u16BE(buf, fseqPtrOff);
        if (fseqDataOff > 0 && fseqDataOff < buf.length) {
          seqBodyOffsets.add(fseqDataOff);
        }
      }
    }
  }
  const sortedBodyOffsets = Array.from(seqBodyOffsets).sort((a, b) => a - b);
  function bodyBudget(off) {
    const idx = sortedBodyOffsets.indexOf(off);
    if (idx < 0) return 0;
    const next = idx < sortedBodyOffsets.length - 1 ? sortedBodyOffsets[idx + 1] : buf.length;
    return Math.max(0, next - off);
  }
  for (let i = 0; i < maxVolseqs; i++) {
    const ptrOff = volseqsOff + i * 2;
    if (ptrOff + 2 > buf.length) break;
    const vsqOff = u16BE(buf, ptrOff);
    if (vsqOff === 0 || vsqOff >= buf.length) break;
    if (vsqOff + 5 >= buf.length) break;
    const volSpeed = u8(buf, vsqOff);
    const fseqIdx = s8(buf, vsqOff + 1);
    const vibSpeed = s8(buf, vsqOff + 2);
    const vibDepth = Math.abs(s8(buf, vsqOff + 3));
    const vibDelay = u8(buf, vsqOff + 4);
    const vseq = extractVseq(buf, vsqOff + 5);
    let fseq = [0, -31];
    let resolvedFseqDataOff = -1;
    if (fseqIdx !== -128 && fseqIdx >= 0) {
      const fseqPtrOff = frqseqsOff + fseqIdx * 2;
      if (fseqPtrOff + 2 <= buf.length) {
        const fseqDataOff = u16BE(buf, fseqPtrOff);
        if (fseqDataOff > 0 && fseqDataOff < buf.length) {
          fseq = extractFseq(buf, fseqDataOff);
          resolvedFseqDataOff = fseqDataOff;
        }
      }
    }
    const hcConfig = {
      fseq,
      vseq,
      volSpeed: Math.max(1, volSpeed),
      vibSpeed,
      vibDepth,
      vibDelay,
      sampleBank
    };
    const vseqBodyFileOff = vsqOff + 5;
    const vseqBodyMaxLen = bodyBudget(vseqBodyFileOff);
    const fseqBodyMaxLen = resolvedFseqDataOff >= 0 ? bodyBudget(resolvedFseqDataOff) : 0;
    const chipRam = {
      moduleBase,
      moduleSize: buffer.byteLength,
      instrBase: moduleBase + vsqOff,
      instrSize: 5,
      sections: {
        volseqTable: moduleBase + volseqsOff,
        frqseqTable: moduleBase + frqseqsOff,
        patternsTable: moduleBase + patternsOff,
        tracksData: moduleBase + tracksOff,
        songsData: moduleBase + songsOff,
        headersData: moduleBase + headersOff,
        /* Variable-length sequence body addresses + per-body byte budgets.
         * Used by HippelCoSoControls to write fseq/vseq edits back to chip RAM.
         * fseqBodyAddr is -1 (encoded as 0xFFFFFFFF below) when this instrument
         * has no resolvable fseq (fseqIdx === -128 or out of range). */
        vseqBodyAddr: moduleBase + vseqBodyFileOff,
        vseqBodyMaxLen,
        fseqBodyAddr: resolvedFseqDataOff >= 0 ? moduleBase + resolvedFseqDataOff : 4294967295,
        fseqBodyMaxLen
      }
    };
    instruments.push({
      id: i + 1,
      name: `CoSo ${i + 1}`,
      type: "synth",
      synthType: "HippelCoSoSynth",
      hippelCoso: hcConfig,
      uadeChipRam: chipRam,
      effects: [],
      volume: -6,
      pan: 0
    });
  }
  if (instruments.length === 0) {
    instruments.push({
      id: 1,
      name: "CoSo 1",
      type: "synth",
      synthType: "HippelCoSoSynth",
      hippelCoso: {
        fseq: [0, -31],
        vseq: [32, -31],
        volSpeed: 1,
        vibSpeed: 0,
        vibDepth: 0,
        vibDelay: 0,
        sampleBank
      },
      effects: [],
      volume: -6,
      pan: 0
    });
  }
  const trackerPatterns = [];
  const songStepCount = Math.floor(song.length / 12);
  const ROWS_PER_PATTERN = 16;
  for (let stepIdx = 0; stepIdx < songStepCount; stepIdx++) {
    const stepBase = song.pointer + stepIdx * 12;
    const channelRows = [[], [], [], []];
    for (let ch = 0; ch < 4; ch++) {
      const chBase = stepBase + ch * 3;
      if (chBase + 3 > buf.length) {
        for (let r = 0; r < ROWS_PER_PATTERN; r++) channelRows[ch].push(emptyCell());
        continue;
      }
      const patIdx = u8(buf, chBase);
      const trackTransp = s8(buf, chBase + 1);
      const patPtrOff = patternsOff + patIdx * 2;
      let patDataOff = 0;
      if (patPtrOff + 2 <= buf.length) {
        patDataOff = u16BE(buf, patPtrOff);
      }
      const rows = [];
      let pos = patDataOff;
      while (rows.length < ROWS_PER_PATTERN && pos < buf.length) {
        const v = s8(buf, pos);
        if (v === -1) {
          break;
        } else if (v === -2 || v === -3) {
          pos += 2;
          rows.push(emptyCell());
        } else if (v >= 0) {
          const noteVal = v;
          pos++;
          let infoVal = 0;
          if (pos < buf.length) {
            infoVal = s8(buf, pos);
            pos++;
          }
          if ((infoVal & 224) !== 0 && pos < buf.length) {
            pos++;
          }
          const volseqIdx = infoVal & 31;
          const instrNum = volseqIdx + 1;
          const xmNote = cosoNoteToXM(noteVal, trackTransp);
          rows.push({
            note: xmNote,
            instrument: instrNum <= instruments.length ? instrNum : 0,
            volume: 0,
            effTyp: 0,
            eff: 0,
            effTyp2: 0,
            eff2: 0
          });
        } else {
          pos++;
          rows.push(emptyCell());
        }
      }
      while (rows.length < ROWS_PER_PATTERN) {
        rows.push(emptyCell());
      }
      channelRows[ch] = rows;
    }
    trackerPatterns.push({
      id: `pattern-${stepIdx}`,
      name: `Pattern ${stepIdx}`,
      length: ROWS_PER_PATTERN,
      channels: channelRows.map((rows, ch) => ({
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
      })),
      importMetadata: {
        sourceFormat: "MOD",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: 4,
        originalPatternCount: songStepCount,
        originalInstrumentCount: instruments.length
      }
    });
  }
  if (trackerPatterns.length === 0) {
    trackerPatterns.push(createEmptyPattern(filename, instruments.length));
  }
  let maxPatIdx = 0;
  const trackMap = [];
  for (let stepIdx = 0; stepIdx < songStepCount; stepIdx++) {
    const stepBase = song.pointer + stepIdx * 12;
    const chPats = [];
    for (let ch = 0; ch < 4; ch++) {
      const chBase = stepBase + ch * 3;
      const patIdx = chBase + 3 <= buf.length ? u8(buf, chBase) : 0;
      if (patIdx > maxPatIdx) maxPatIdx = patIdx;
      chPats.push(patIdx);
    }
    trackMap.push(chPats);
  }
  const numFilePatterns = maxPatIdx + 1;
  const filePatternAddrs = [];
  const filePatternSizes = [];
  const patOffs = [];
  for (let i = 0; i < numFilePatterns; i++) {
    const ptrOff = patternsOff + i * 2;
    const dataOff = ptrOff + 2 <= buf.length ? u16BE(buf, ptrOff) : 0;
    patOffs.push({ idx: i, off: dataOff });
  }
  const sorted = [...patOffs].sort((a, b) => a.off - b.off);
  const patDataEnd = tracksOff > 0 ? tracksOff : buf.length;
  for (let i = 0; i < numFilePatterns; i++) {
    const off = patOffs[i].off;
    filePatternAddrs.push(off);
    const sortedIdx = sorted.findIndex((s) => s.idx === i);
    const nextOff = sortedIdx < sorted.length - 1 ? sorted[sortedIdx + 1].off : patDataEnd;
    filePatternSizes.push(Math.max(0, nextOff - off));
  }
  const variableLayout = {
    formatId: "hippelCoSo",
    numChannels: 4,
    numFilePatterns,
    rowsPerPattern: ROWS_PER_PATTERN,
    moduleSize: buf.length,
    encoder: hippelCoSoEncoder,
    filePatternAddrs,
    filePatternSizes,
    trackMap
  };
  const moduleName = filename.replace(/\.[^/.]+$/, "");
  const speedBPM = Math.round(song.speed > 0 ? 750 / song.speed : 125);
  return {
    name: `${moduleName} [Hippel CoSo]`,
    format: "MOD",
    patterns: trackerPatterns,
    instruments,
    songPositions: trackerPatterns.map((_, i) => i),
    songLength: trackerPatterns.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: Math.max(32, Math.min(255, speedBPM)),
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename,
    uadeVariableLayout: variableLayout
  };
}
function emptyCell() {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}
function createEmptyPattern(filename, instrumentCount) {
  return {
    id: "pattern-0",
    name: "Pattern 0",
    length: 16,
    channels: Array.from({ length: 4 }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null,
      color: null,
      rows: Array.from({ length: 16 }, () => emptyCell())
    })),
    importMetadata: {
      sourceFormat: "MOD",
      sourceFile: filename,
      importedAt: (/* @__PURE__ */ new Date()).toISOString(),
      originalChannelCount: 4,
      originalPatternCount: 0,
      originalInstrumentCount: instrumentCount
    }
  };
}
export {
  isHippelCoSoFormat,
  parseHippelCoSoFile
};
