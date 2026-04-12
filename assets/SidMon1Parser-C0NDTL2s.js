import { b$ as registerPatternEncoder } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const SM1_PERIODS$1 = [
  0,
  5760,
  5424,
  5120,
  4832,
  4560,
  4304,
  4064,
  3840,
  3616,
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
  1808,
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
  904,
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
  452,
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
  127
];
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
  113
];
function xmNoteToSM1(xmNote) {
  if (xmNote <= 0 || xmNote > 96) return 0;
  const ptIdx = xmNote - 37;
  if (ptIdx < 0 || ptIdx >= PT_PERIODS$1.length) return 0;
  const period = PT_PERIODS$1[ptIdx];
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 1; i < SM1_PERIODS$1.length; i++) {
    const d = Math.abs(SM1_PERIODS$1[i] - period);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}
function encodeSidMon1Cell(cell) {
  const out = new Uint8Array(5);
  const xmNote = cell.note ?? 0;
  if (xmNote > 0 && xmNote <= 96) {
    out[0] = xmNoteToSM1(xmNote);
  } else {
    out[0] = 0;
  }
  out[1] = (cell.instrument ?? 0) & 255;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  return out;
}
registerPatternEncoder("sidMon1", () => encodeSidMon1Cell);
function u8(buf, off) {
  if (off >= buf.length) return 0;
  return buf[off] & 255;
}
function s8(buf, off) {
  const v = u8(buf, off);
  return v < 128 ? v : v - 256;
}
function u16BE(buf, off) {
  if (off + 1 >= buf.length) return 0;
  return (buf[off] & 255) << 8 | buf[off + 1] & 255;
}
function u32BE(buf, off) {
  if (off + 3 >= buf.length) return 0;
  return (buf[off] & 255) * 16777216 + ((buf[off + 1] & 255) << 16) + ((buf[off + 2] & 255) << 8) + (buf[off + 3] & 255);
}
function readString(buf, off, len) {
  let s = "";
  for (let i = 0; i < len; i++) {
    if (off + i >= buf.length) break;
    s += String.fromCharCode(buf[off + i]);
  }
  return s;
}
const SM1_PERIODS = [
  0,
  5760,
  5424,
  5120,
  4832,
  4560,
  4304,
  4064,
  3840,
  3616,
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
  1808,
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
  904,
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
  452,
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
  127
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
  113
];
function sm1NoteToXM(sm1Note) {
  if (sm1Note <= 0 || sm1Note >= SM1_PERIODS.length) return 0;
  const period = SM1_PERIODS[sm1Note];
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
function isSidMon1Format(buffer) {
  if (buffer.byteLength < 64) return false;
  const buf = new Uint8Array(buffer);
  for (let i = 0; i < buf.length - 40; i++) {
    if (buf[i] === 65 && buf[i + 1] === 250) {
      const j = u16BE(buf, i + 2);
      if (i + 6 < buf.length && u16BE(buf, i + 4) === 53736) {
        const start = u16BE(buf, i + 6);
        if (start === 65492) {
          const position = j + i + 2;
          if (position >= 0 && position + 32 <= buf.length) {
            const id = readString(buf, position, 32);
            if (id === " SID-MON BY R.v.VLIET  (c) 1988 ") {
              return true;
            }
          }
        }
      }
    }
  }
  return false;
}
function parseSidMon1File(buffer, filename, moduleBase = 0) {
  const buf = new Uint8Array(buffer);
  let position = -1;
  let j = 0;
  for (let i = 0; i < buf.length - 10; i++) {
    if (buf[i] === 65 && buf[i + 1] === 250) {
      j = u16BE(buf, i + 2);
      if (i + 6 >= buf.length) continue;
      const d1e8 = u16BE(buf, i + 4);
      if (d1e8 !== 53736) continue;
      const startCode = u16BE(buf, i + 6);
      if (startCode === 65492) {
        position = j + i + 2;
        break;
      }
    }
  }
  if (position < 0 || position + 32 > buf.length) {
    throw new Error("SidMon 1 format marker not found");
  }
  const idStr = readString(buf, position, 32);
  if (idStr !== " SID-MON BY R.v.VLIET  (c) 1988 ") {
    throw new Error(`SidMon 1 ID string mismatch: "${idStr}"`);
  }
  if (position - 28 < 0 || position - 24 < 0) {
    throw new Error("SidMon 1 file too small to read instrument offsets");
  }
  const instrBase = u32BE(buf, position - 28);
  const instrEnd = u32BE(buf, position - 24);
  let totInstruments = instrEnd - instrBase >> 5;
  if (totInstruments > 63) totInstruments = 63;
  const len = totInstruments + 1;
  const waveStart = position - 24 >= 4 ? u32BE(buf, position - 24) : 0;
  const waveEnd = position - 20 >= 4 ? u32BE(buf, position - 20) : waveStart;
  const waveByteCount = waveEnd - waveStart;
  const totWaveforms = waveByteCount >> 5;
  const waveformDataOffset = position + waveStart;
  const waveformData = [];
  for (let w = 0; w < totWaveforms; w++) {
    const woff = waveformDataOffset + w * 32;
    const wave = new Int8Array(32);
    if (woff + 32 <= buf.length) {
      for (let b = 0; b < 32; b++) {
        wave[b] = (buf[woff + b] & 255) < 128 ? buf[woff + b] & 255 : (buf[woff + b] & 255) - 256;
      }
    }
    waveformData.push(wave);
  }
  const _patStart = position - 12 >= 0 ? u32BE(buf, position - 12) : 0;
  const _patDataOffset = position + _patStart;
  const _trackBase = position - 44 >= 0 ? u32BE(buf, position - 44) : 0;
  const _trackDataOffset = position + _trackBase;
  const instruments = [];
  const instrDataOffset = position + instrBase;
  for (let i = 1; i < len; i++) {
    const base = instrDataOffset + (i - 1) * 32;
    if (base + 32 > buf.length) break;
    const waveform = u32BE(buf, base);
    const arpeggio = new Array(16);
    for (let k = 0; k < 16; k++) {
      arpeggio[k] = u8(buf, base + 4 + k);
    }
    const attackSpeed = u8(buf, base + 20);
    const attackMax = u8(buf, base + 21);
    const decaySpeed = u8(buf, base + 22);
    const decayMin = u8(buf, base + 23);
    const sustain = u8(buf, base + 24);
    const releaseSpeed = u8(buf, base + 26);
    const releaseMin = u8(buf, base + 27);
    const phaseShift = u8(buf, base + 28);
    const phaseSpeed = u8(buf, base + 29);
    let finetune = u8(buf, base + 30);
    const pitchFall = s8(buf, base + 31);
    if (finetune > 15) finetune = 0;
    const finetuneVal = finetune * 67;
    let actualPhaseShift = phaseShift;
    if (phaseShift > totWaveforms) {
      actualPhaseShift = 0;
    }
    let mainWave = new Array(32).fill(0);
    if (waveform <= 15 && waveform < waveformData.length) {
      mainWave = Array.from(waveformData[waveform]);
    } else if (waveform < waveformData.length) {
      mainWave = Array.from(waveformData[waveform]);
    }
    if (mainWave.every((v) => v === 0) && waveformData.length > 0) {
      mainWave = Array.from(waveformData[0]);
    }
    let phaseWave = new Array(32).fill(0);
    if (actualPhaseShift > 0 && actualPhaseShift < waveformData.length) {
      phaseWave = Array.from(waveformData[actualPhaseShift]);
    }
    const sm1Config = {
      arpeggio,
      attackSpeed,
      attackMax,
      decaySpeed,
      decayMin,
      sustain,
      releaseSpeed,
      releaseMin,
      phaseShift: actualPhaseShift,
      phaseSpeed,
      finetune: finetuneVal,
      pitchFall,
      mainWave,
      phaseWave
    };
    const chipRam = {
      moduleBase,
      moduleSize: buffer.byteLength,
      instrBase: moduleBase + base,
      instrSize: 32,
      sections: {
        position: moduleBase + position,
        waveData: moduleBase + waveformDataOffset,
        patternData: moduleBase + _patDataOffset,
        trackData: moduleBase + _trackDataOffset
      }
    };
    instruments.push({
      id: i,
      name: `SM1 ${i}`,
      type: "synth",
      synthType: "SidMon1Synth",
      sidmon1: sm1Config,
      uadeChipRam: chipRam,
      effects: [],
      volume: -6,
      pan: 0
    });
  }
  if (instruments.length === 0) {
    instruments.push(makeDefaultInstrument(1));
  }
  const patStart = position - 12 >= 0 ? u32BE(buf, position - 12) : 0;
  const patEnd = position - 8 >= 0 ? u32BE(buf, position - 8) : patStart;
  const numPatRows = Math.max(0, Math.floor((patEnd - patStart) / 5));
  const patRows = [];
  const patDataOffset = position + patStart;
  for (let i = 0; i < numPatRows && i < 2048; i++) {
    const base = patDataOffset + i * 5;
    if (base + 5 > buf.length) break;
    patRows.push({
      note: u8(buf, base),
      sample: u8(buf, base + 1),
      effect: u8(buf, base + 2),
      param: u8(buf, base + 3),
      speed: u8(buf, base + 4)
    });
  }
  const trackBase = position - 44 >= 0 ? u32BE(buf, position - 44) : 0;
  const trackEnd2 = position - 28 >= 0 ? u32BE(buf, position - 28) : trackBase;
  const numTracks = Math.floor((trackEnd2 - trackBase) / 6);
  const tracks = [];
  const trackDataOffset = position + trackBase;
  for (let i = 0; i < numTracks && i < 512; i++) {
    const base = trackDataOffset + i * 6;
    if (base + 6 > buf.length) break;
    const pattern = u32BE(buf, base);
    const transpose = s8(buf, base + 5);
    tracks.push({ pattern, transpose: transpose >= -99 && transpose <= 99 ? transpose : 0 });
  }
  const ppBase = position - 8 >= 0 ? u32BE(buf, position - 8) : 0;
  const ppEnd = position - 4 >= 0 ? u32BE(buf, position - 4) : ppBase;
  const patternsBase = position + (ppBase > 0 ? ppBase : 0);
  const patternsCount = Math.max(1, Math.min(256, ppEnd > ppBase ? ppEnd - ppBase >> 2 : 1));
  const patternPtrs = [];
  for (let i = 0; i < patternsCount; i++) {
    const poff = patternsBase + 4 + i * 4;
    if (poff + 4 > buf.length) break;
    const ptr = Math.floor(u32BE(buf, poff) / 5);
    if (ptr === 0 && i > 0) break;
    patternPtrs.push(ptr);
  }
  const ROWS_PER_PATTERN = 16;
  const trackerPatterns = [];
  const CHANNELS = 4;
  for (let v = 1; v < 4 && position - 44 + 4 + v * 4 < buf.length; v++) {
    const tpOff = position - 44 + v * 4;
    if (tpOff + 4 <= buf.length) {
      u32BE(buf, tpOff);
    }
  }
  const songSteps = Math.min(32, Math.max(1, Math.floor(numTracks / CHANNELS)));
  for (let stepIdx = 0; stepIdx < songSteps; stepIdx++) {
    const channelRows = [[], [], [], []];
    for (let ch = 0; ch < CHANNELS; ch++) {
      const trackIdx = stepIdx * CHANNELS + ch;
      const track = tracks[trackIdx] ?? { pattern: 0, transpose: 0 };
      const patPtr = patternPtrs[track.pattern] ?? 0;
      const rows = [];
      for (let r = 0; r < ROWS_PER_PATTERN; r++) {
        const row = patRows[patPtr + r];
        if (!row) {
          rows.push(emptyCell());
          continue;
        }
        if (row.note === 0 || row.note === 255 || row.sample === 0) {
          rows.push(emptyCell());
          continue;
        }
        const sm1Note = row.note + track.transpose;
        const xmNote = sm1NoteToXM(Math.max(0, sm1Note - 1));
        const instrNum = Math.min(row.sample, instruments.length);
        rows.push({
          note: xmNote,
          instrument: instrNum,
          volume: 0,
          effTyp: 0,
          eff: 0,
          effTyp2: 0,
          eff2: 0
        });
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
        originalChannelCount: CHANNELS,
        originalPatternCount: songSteps,
        originalInstrumentCount: instruments.length
      }
    });
  }
  if (trackerPatterns.length === 0) {
    trackerPatterns.push(createEmptyPattern(filename, instruments.length));
  }
  const moduleName = filename.replace(/\.[^/.]+$/, "");
  const uadePatternLayout = {
    formatId: "sidmon1",
    patternDataFileOffset: patDataOffset,
    bytesPerCell: 5,
    rowsPerPattern: ROWS_PER_PATTERN,
    numChannels: CHANNELS,
    numPatterns: songSteps,
    moduleSize: buffer.byteLength,
    encodeCell: encodeSidMon1Cell,
    getCellFileOffset: (pattern, row, channel) => {
      const trackIdx = pattern * CHANNELS + channel;
      const track = tracks[trackIdx];
      if (!track) return 0;
      const patPtr = patternPtrs[track.pattern];
      if (patPtr === void 0) return 0;
      return patDataOffset + (patPtr + row) * 5;
    }
  };
  return {
    name: `${moduleName} [SidMon 1.0]`,
    format: "MOD",
    patterns: trackerPatterns,
    instruments,
    songPositions: trackerPatterns.map((_, i) => i),
    songLength: trackerPatterns.length,
    restartPosition: 0,
    numChannels: CHANNELS,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename,
    uadePatternLayout,
    sidmon1WasmFileData: buffer.slice(0)
  };
}
function emptyCell() {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}
function makeDefaultInstrument(id) {
  return {
    id,
    name: `SM1 ${id}`,
    type: "synth",
    synthType: "SidMon1Synth",
    sidmon1: {
      arpeggio: new Array(16).fill(0),
      attackSpeed: 8,
      attackMax: 64,
      decaySpeed: 4,
      decayMin: 32,
      sustain: 0,
      releaseSpeed: 4,
      releaseMin: 0,
      phaseShift: 0,
      phaseSpeed: 0,
      finetune: 0,
      pitchFall: 0,
      mainWave: [
        127,
        100,
        71,
        41,
        9,
        -22,
        -53,
        -82,
        -108,
        -127,
        -127,
        -127,
        -108,
        -82,
        -53,
        -22,
        9,
        41,
        71,
        100,
        127,
        100,
        71,
        41,
        9,
        -22,
        -53,
        -82,
        -108,
        -127,
        -127,
        -127
      ],
      phaseWave: new Array(32).fill(0)
    },
    effects: [],
    volume: -6,
    pan: 0
  };
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
  isSidMon1Format,
  parseSidMon1File
};
