import { b$ as registerPatternEncoder, c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function encodeInStereo1Cell(cell) {
  const out = new Uint8Array(4);
  const note = cell.note ?? 0;
  if (note === 97) {
    out[0] = 127;
  } else if (note > 36) {
    out[0] = Math.min(108, note - 36);
  } else {
    out[0] = 0;
  }
  out[1] = (cell.instrument ?? 0) & 255;
  const arpeggio = 0;
  let effect = 0;
  let effectArg = (cell.eff ?? 0) & 255;
  const effTyp = cell.effTyp ?? 0;
  const eff = cell.eff ?? 0;
  switch (effTyp) {
    case 12:
      effect = 7;
      effectArg = Math.min(63, eff) & 63;
      break;
    case 15:
      if (eff > 0 && eff <= 31) {
        effect = 15;
        effectArg = eff;
      }
      break;
    default:
      effect = 0;
      effectArg = 0;
      break;
  }
  out[2] = (arpeggio & 15) << 4 | effect & 15;
  out[3] = effectArg & 255;
  return out;
}
registerPatternEncoder("inStereo1", () => encodeInStereo1Cell);
const PAL_CLOCK = 3546895;
const IS10_PERIODS = [
  0,
  13696,
  12928,
  12192,
  11520,
  10848,
  10240,
  9664,
  9120,
  8608,
  8128,
  7680,
  7248,
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
  3624,
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
  75,
  71,
  67,
  63,
  60,
  56,
  53,
  50,
  47,
  45,
  42,
  40,
  37,
  35,
  33,
  31,
  30,
  28
];
const EGC_TABLE_LEN = 128;
const ADSR_TABLE_LEN = 256;
const ARPEGGIO_TABLE_LEN = 16;
function u8(buf, off) {
  return buf[off];
}
function u16BE(buf, off) {
  return buf[off] << 8 | buf[off + 1];
}
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function s8(v) {
  return v < 128 ? v : v - 256;
}
function readString(buf, off, len) {
  let str = "";
  for (let i = 0; i < len; i++) {
    const c = buf[off + i];
    if (c === 0) break;
    str += String.fromCharCode(c);
  }
  return str.trim();
}
function is10NoteToXm(noteIndex) {
  if (noteIndex <= 0 || noteIndex >= IS10_PERIODS.length) return 0;
  const xm = noteIndex - 36;
  return xm >= 1 && xm <= 96 ? xm : 0;
}
function isInStereo1Format(bytes) {
  if (bytes.length < 204) return false;
  return bytes[0] === 73 && // 'I'
  bytes[1] === 83 && // 'S'
  bytes[2] === 77 && // 'M'
  bytes[3] === 33 && // '!'
  bytes[4] === 86 && // 'V'
  bytes[5] === 49 && // '1'
  bytes[6] === 46 && // '.'
  bytes[7] === 50;
}
function parseInStereo1File(bytes, filename) {
  var _a;
  if (!isInStereo1Format(bytes)) return null;
  let off = 8;
  const totalNumberOfPositions = u16BE(bytes, off);
  off += 2;
  const totalNumberOfTrackRows = u16BE(bytes, off);
  off += 2;
  off += 4;
  const numberOfSamples = u8(bytes, off++);
  const numberOfWaveforms = u8(bytes, off++);
  const numberOfInstruments = u8(bytes, off++);
  const numberOfSubSongs = u8(bytes, off++);
  const numberOfEnvelopeGeneratorTables = u8(bytes, off++);
  const numberOfAdsrTables = u8(bytes, off++);
  off += 14;
  const moduleName = readString(bytes, off, 28);
  off += 28;
  off += 140;
  const samplesInfo = [];
  for (let i = 0; i < numberOfSamples; i++) {
    if (off + 28 > bytes.length) return null;
    off += 1;
    const name2 = readString(bytes, off, 23);
    off += 23;
    off += 4;
    samplesInfo.push({ name: name2, length: 0 });
  }
  for (let i = 0; i < numberOfSamples; i++) {
    if (off + 4 > bytes.length) return null;
    samplesInfo[i].length = u32BE(bytes, off);
    off += 4;
  }
  const egcTables = [];
  for (let i = 0; i < numberOfEnvelopeGeneratorTables; i++) {
    const tbl = [];
    for (let j = 0; j < EGC_TABLE_LEN; j++) tbl.push(off < bytes.length ? u8(bytes, off++) : 0);
    egcTables.push(tbl);
  }
  const adsrTables = [];
  for (let i = 0; i < numberOfAdsrTables; i++) {
    const tbl = [];
    for (let j = 0; j < ADSR_TABLE_LEN; j++) tbl.push(off < bytes.length ? u8(bytes, off++) : 0);
    adsrTables.push(tbl);
  }
  const instTableStart = off;
  const instruments = [];
  for (let i = 0; i < numberOfInstruments; i++) {
    if (off + 28 > bytes.length) return null;
    const waveformNumber = u8(bytes, off++);
    const synthesisEnabled = u8(bytes, off++) !== 0;
    const waveformLength = u16BE(bytes, off);
    off += 2;
    const repeatLength = u16BE(bytes, off);
    off += 2;
    const volume = u8(bytes, off++);
    const portamentoSpeed = s8(bytes[off++]);
    const adsrEnabled = u8(bytes, off++) !== 0;
    const adsrTableNumber = u8(bytes, off++);
    const adsrTableLength = u16BE(bytes, off);
    off += 2;
    off += 2;
    const portamentoEnabled = u8(bytes, off++) !== 0;
    off += 5;
    const vibratoDelay = u8(bytes, off++);
    const vibratoSpeed = u8(bytes, off++);
    const vibratoLevel = u8(bytes, off++);
    const egcOffset = u8(bytes, off++);
    const egcMode = u8(bytes, off++);
    const egcTableNumber = u8(bytes, off++);
    const egcTableLength = u16BE(bytes, off);
    off += 2;
    instruments.push({
      waveformNumber,
      synthesisEnabled,
      waveformLength,
      repeatLength,
      volume,
      portamentoSpeed,
      adsrEnabled,
      adsrTableNumber,
      adsrTableLength,
      portamentoEnabled,
      vibratoDelay,
      vibratoSpeed,
      vibratoLevel,
      egcOffset,
      egcMode,
      egcTableNumber,
      egcTableLength
    });
  }
  for (let i = 0; i < 16; i++) {
    const tbl = [];
    for (let j = 0; j < ARPEGGIO_TABLE_LEN; j++) tbl.push(off < bytes.length ? s8(bytes[off++]) : 0);
  }
  const subSongs = [];
  for (let i = 0; i < numberOfSubSongs; i++) {
    if (off + 14 > bytes.length) return null;
    off += 4;
    const startSpeed = u8(bytes, off++);
    const rowsPerTrack2 = u8(bytes, off++);
    const firstPosition = u16BE(bytes, off);
    off += 2;
    const lastPosition = u16BE(bytes, off);
    off += 2;
    const restartPosition = u16BE(bytes, off);
    off += 2;
    off += 2;
    subSongs.push({ startSpeed, rowsPerTrack: rowsPerTrack2, firstPosition, lastPosition, restartPosition });
  }
  off += 14;
  const waveforms = [];
  for (let i = 0; i < numberOfWaveforms; i++) {
    if (off + 256 > bytes.length) break;
    const wave = new Int8Array(256);
    for (let j = 0; j < 256; j++) {
      wave[j] = s8(bytes[off + j]);
    }
    waveforms.push(wave);
    off += 256;
  }
  const positions = [];
  for (let i = 0; i < totalNumberOfPositions; i++) {
    if (off + 16 > bytes.length) break;
    const row = [];
    for (let ch = 0; ch < 4; ch++) {
      const startTrackRow = u16BE(bytes, off);
      off += 2;
      const soundTranspose = s8(bytes[off++]);
      const noteTranspose = s8(bytes[off++]);
      row.push({ startTrackRow, soundTranspose, noteTranspose });
    }
    positions.push(row);
  }
  const trackRowDataOffset = off;
  const totalRows = totalNumberOfTrackRows + 64;
  const trackLines = [];
  for (let i = 0; i < totalRows; i++) {
    if (off + 4 > bytes.length) {
      trackLines.push({ note: 0, instrument: 0, arpeggio: 0, effect: 0, effectArg: 0 });
      continue;
    }
    const byt1 = bytes[off++];
    const byt2 = bytes[off++];
    const byt3 = bytes[off++];
    const byt4 = bytes[off++];
    trackLines.push({
      note: byt1,
      instrument: byt2,
      arpeggio: (byt3 & 240) >> 4,
      effect: byt3 & 15,
      effectArg: byt4
    });
  }
  const sampleData = [];
  for (let i = 0; i < numberOfSamples; i++) {
    const slen = samplesInfo[i].length;
    if (slen > 0 && off + slen <= bytes.length) {
      const pcm = new Uint8Array(slen);
      for (let j = 0; j < slen; j++) {
        pcm[j] = bytes[off + j];
      }
      sampleData.push(pcm);
      off += slen;
    } else {
      sampleData.push(null);
    }
  }
  const PAL_C3_RATE = Math.round(PAL_CLOCK / (2 * 214));
  const SYNTH_RATE = Math.round(PAL_CLOCK / (2 * 856));
  const instrConfigs = [];
  for (let i = 0; i < instruments.length; i++) {
    const instr = instruments[i];
    const id = i + 1;
    const instrBase = instTableStart + i * 28;
    const chipRam = {
      moduleBase: 0,
      moduleSize: bytes.length,
      instrBase,
      instrSize: 28,
      sections: { instTable: instTableStart }
    };
    if (!instr.synthesisEnabled) {
      const sampleIdx = instr.waveformNumber & 63;
      const pcmData = sampleIdx < sampleData.length ? sampleData[sampleIdx] : null;
      if (pcmData && pcmData.length > 0) {
        const hasLoop = instr.repeatLength !== 2;
        let loopStart = 0;
        let loopEnd = 0;
        if (hasLoop) {
          if (instr.repeatLength === 0) {
            loopStart = 0;
            loopEnd = pcmData.length;
          } else {
            loopStart = instr.waveformLength;
            loopEnd = instr.waveformLength + instr.repeatLength;
          }
        }
        instrConfigs.push({
          ...createSamplerInstrument(id, ((_a = samplesInfo[sampleIdx]) == null ? void 0 : _a.name) || `Sample ${i}`, pcmData, instr.volume, PAL_C3_RATE, loopStart, loopEnd),
          uadeChipRam: chipRam
        });
      } else {
        instrConfigs.push({ ...makeSynthPlaceholder(id, `Sample ${i}`), uadeChipRam: chipRam });
      }
    } else {
      const waveIdx = instr.waveformNumber < waveforms.length ? instr.waveformNumber : 0;
      if (waveforms.length > 0 && waveIdx < waveforms.length) {
        const wave = waveforms[waveIdx];
        const playLen = Math.min(Math.max(2, instr.waveformLength), 256);
        const pcmUint8 = new Uint8Array(playLen);
        for (let j = 0; j < playLen; j++) {
          pcmUint8[j] = wave[j % 256] & 255;
        }
        const adsrTbl = instr.adsrEnabled && instr.adsrTableNumber < adsrTables.length ? adsrTables[instr.adsrTableNumber].slice(0, 128) : new Array(128).fill(255);
        const egcTbl = instr.egcTableNumber < egcTables.length ? egcTables[instr.egcTableNumber] : new Array(128).fill(0);
        const is10Config = {
          volume: instr.volume,
          waveformLength: instr.waveformLength,
          portamentoSpeed: instr.portamentoEnabled ? Math.abs(instr.portamentoSpeed) : 0,
          vibratoDelay: instr.vibratoDelay,
          vibratoSpeed: instr.vibratoSpeed,
          vibratoLevel: instr.vibratoLevel,
          adsrLength: instr.adsrEnabled ? Math.min(instr.adsrTableLength, 127) : 0,
          adsrRepeat: 0,
          sustainPoint: 0,
          sustainSpeed: 0,
          amfLength: 0,
          amfRepeat: 0,
          egMode: instr.egcMode,
          egStartLen: instr.egcOffset,
          egStopRep: 0,
          egSpeedUp: 0,
          egSpeedDown: 0,
          arpeggios: [
            { length: 0, repeat: 0, values: new Array(14).fill(0) },
            { length: 0, repeat: 0, values: new Array(14).fill(0) },
            { length: 0, repeat: 0, values: new Array(14).fill(0) }
          ],
          adsrTable: adsrTbl,
          lfoTable: new Array(128).fill(0),
          egTable: egcTbl,
          waveform1: Array.from(wave),
          waveform2: new Array(256).fill(0),
          name: `Synth ${i}`
        };
        instrConfigs.push({
          ...createSamplerInstrument(id, `Synth ${i}`, pcmUint8, instr.volume, SYNTH_RATE, 0, playLen),
          type: "synth",
          synthType: "InStereo1Synth",
          inStereo1: is10Config,
          uadeChipRam: chipRam
        });
      } else {
        instrConfigs.push({ ...makeSynthPlaceholder(id, `Synth ${i}`), uadeChipRam: chipRam });
      }
    }
  }
  if (subSongs.length === 0) return null;
  const song = subSongs[0];
  const rowsPerTrack = Math.max(1, song.rowsPerTrack);
  const firstPos = song.firstPosition;
  const lastPos = song.lastPosition;
  const trackerPatterns = [];
  for (let posIdx = firstPos; posIdx <= lastPos; posIdx++) {
    if (posIdx >= positions.length) break;
    const posRow = positions[posIdx];
    const channelRows = [[], [], [], []];
    for (let row = 0; row < rowsPerTrack; row++) {
      for (let ch = 0; ch < 4; ch++) {
        const pos = posRow[ch];
        const lineIdx = pos.startTrackRow + row;
        const line = lineIdx < trackLines.length ? trackLines[lineIdx] : null;
        if (!line || line.note === 0) {
          channelRows[ch].push(emptyCell());
          continue;
        }
        if (line.note === 127) {
          channelRows[ch].push({ note: 97, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
          continue;
        }
        const noteIdx = Math.max(1, Math.min(108, line.note + pos.noteTranspose));
        const instrNum = line.instrument > 0 ? Math.max(1, Math.min(255, line.instrument + pos.soundTranspose)) : 0;
        const xmNote = is10NoteToXm(noteIdx);
        const instrId = instrNum > 0 && instrNum <= instruments.length ? instrNum : 0;
        const { effTyp, eff } = is10EffectToXm(line.effect, line.effectArg);
        channelRows[ch].push({
          note: xmNote,
          instrument: instrId,
          volume: 0,
          effTyp,
          eff,
          effTyp2: 0,
          eff2: 0
        });
      }
    }
    const patIdx = posIdx - firstPos;
    trackerPatterns.push({
      id: `pattern-${patIdx}`,
      name: `Position ${patIdx}`,
      length: rowsPerTrack,
      channels: channelRows.map((rows, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: ch === 0 || ch === 3 ? -50 : 50,
        instrumentId: null,
        color: null,
        rows
      })),
      importMetadata: {
        sourceFormat: "IS10",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: 4,
        originalPatternCount: positions.length,
        originalInstrumentCount: instruments.length
      }
    });
  }
  if (trackerPatterns.length === 0) {
    trackerPatterns.push(makeEmptyPattern(filename, 4, rowsPerTrack));
  }
  const name = moduleName || filename.replace(/\.[^/.]+$/, "");
  const uadePatternLayout = {
    formatId: "inStereo1",
    patternDataFileOffset: trackRowDataOffset,
    bytesPerCell: 4,
    rowsPerPattern: rowsPerTrack,
    numChannels: 4,
    numPatterns: trackerPatterns.length,
    moduleSize: bytes.length,
    encodeCell: encodeInStereo1Cell,
    getCellFileOffset: (pattern, row, channel) => {
      const posIdx = firstPos + pattern;
      if (posIdx >= positions.length) return 0;
      const pos = positions[posIdx][channel];
      if (!pos) return 0;
      const lineIdx = pos.startTrackRow + row;
      return trackRowDataOffset + lineIdx * 4;
    }
  };
  return {
    name,
    format: "IS10",
    patterns: trackerPatterns,
    instruments: instrConfigs,
    songPositions: trackerPatterns.map((_, i) => i),
    songLength: trackerPatterns.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: Math.max(1, song.startSpeed),
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
function makeSynthPlaceholder(id, name) {
  return {
    id,
    name,
    type: "synth",
    synthType: "Synth",
    effects: [],
    volume: 0,
    pan: 0
  };
}
function makeEmptyPattern(filename, numChannels, rowsPerTrack) {
  return {
    id: "pattern-0",
    name: "Pattern 0",
    length: rowsPerTrack,
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
      rows: Array.from({ length: rowsPerTrack }, () => emptyCell())
    })),
    importMetadata: {
      sourceFormat: "IS10",
      sourceFile: filename,
      importedAt: (/* @__PURE__ */ new Date()).toISOString(),
      originalChannelCount: numChannels,
      originalPatternCount: 0,
      originalInstrumentCount: 0
    }
  };
}
function is10EffectToXm(effect, arg) {
  switch (effect) {
    case 7:
      return { effTyp: 12, eff: Math.min(64, arg & 63) };
    case 15:
      if (arg > 0 && arg <= 31) return { effTyp: 15, eff: arg };
      return { effTyp: 0, eff: 0 };
    default:
      return { effTyp: 0, eff: 0 };
  }
}
export {
  isInStereo1Format,
  parseInStereo1File
};
