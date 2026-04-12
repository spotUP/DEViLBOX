import { b$ as registerPatternEncoder, c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function encodeInStereo2Cell(cell) {
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
  const disableSoundTranspose = 0;
  const disableNoteTranspose = 0;
  const arpeggio = 0;
  let effect = 0;
  let effectArg = 0;
  const effTyp = cell.effTyp ?? 0;
  const eff = cell.eff ?? 0;
  switch (effTyp) {
    case 0:
      if (eff !== 0) {
        effect = 0;
        effectArg = eff;
      }
      break;
    case 3:
      effect = 7;
      effectArg = eff;
      break;
    case 10:
      effect = 10;
      if ((eff & 240) !== 0) {
        effectArg = eff >> 4 & 15;
      } else {
        effectArg = 256 - (eff & 15) & 255;
      }
      break;
    case 11:
      effect = 11;
      effectArg = eff;
      break;
    case 12:
      effect = 12;
      effectArg = Math.min(64, eff);
      break;
    case 13:
      effect = 13;
      effectArg = 0;
      break;
    case 15:
      if (eff > 0 && eff <= 31) {
        effect = 15;
        effectArg = eff;
      }
      break;
  }
  out[2] = (disableSoundTranspose & 1) << 7 | (disableNoteTranspose & 1) << 6 | (arpeggio & 3) << 4 | effect & 15;
  out[3] = effectArg & 255;
  return out;
}
registerPatternEncoder("inStereo2", () => encodeInStereo2Cell);
const PAL_CLOCK = 3546895;
const IS20_PERIODS = [
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
function readChunkTag(buf, off) {
  if (off + 4 > buf.length) return "";
  return String.fromCharCode(buf[off], buf[off + 1], buf[off + 2], buf[off + 3]);
}
function is20NoteToXm(noteIndex) {
  if (noteIndex <= 0 || noteIndex >= IS20_PERIODS.length) return 0;
  const xm = noteIndex - 36;
  return xm >= 1 && xm <= 96 ? xm : 0;
}
function isInStereo2Format(bytes) {
  if (bytes.length < 16) return false;
  return bytes[0] === 73 && // 'I'
  bytes[1] === 83 && // 'S'
  bytes[2] === 50 && // '2'
  bytes[3] === 48 && // '0'
  bytes[4] === 68 && // 'D'
  bytes[5] === 70 && // 'F'
  bytes[6] === 49 && // '1'
  bytes[7] === 48;
}
function parseInStereo2File(bytes, filename) {
  if (!isInStereo2Format(bytes)) return null;
  let off = 8;
  if (off + 8 > bytes.length) return null;
  if (readChunkTag(bytes, off) !== "STBL") return null;
  off += 4;
  const numberOfSubSongs = u32BE(bytes, off);
  off += 4;
  if (off + numberOfSubSongs * 10 > bytes.length) return null;
  const subSongs = [];
  for (let i = 0; i < numberOfSubSongs; i++) {
    const startSpeed = u8(bytes, off++);
    const rowsPerTrack2 = u8(bytes, off++);
    const firstPosition = u16BE(bytes, off);
    off += 2;
    const lastPosition = u16BE(bytes, off);
    off += 2;
    const restartPosition = u16BE(bytes, off);
    off += 2;
    const tempo2 = u16BE(bytes, off);
    off += 2;
    subSongs.push({ startSpeed, rowsPerTrack: rowsPerTrack2, firstPosition, lastPosition, restartPosition, tempo: tempo2 });
  }
  if (subSongs.length === 0) return null;
  const song = subSongs[0];
  if (off + 8 > bytes.length) return null;
  if (readChunkTag(bytes, off) !== "OVTB") return null;
  off += 4;
  const numberOfPositions = u32BE(bytes, off);
  off += 4;
  const positions = [];
  for (let i = 0; i < numberOfPositions; i++) {
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
  if (off + 8 > bytes.length) return null;
  if (readChunkTag(bytes, off) !== "NTBL") return null;
  off += 4;
  const numberOfTrackRows = u32BE(bytes, off);
  off += 4;
  const trackRowDataOffset = off;
  const trackLines = [];
  for (let i = 0; i < numberOfTrackRows; i++) {
    if (off + 4 > bytes.length) {
      trackLines.push({ note: 0, instrument: 0, disableSoundTranspose: false, disableNoteTranspose: false, arpeggio: 0, effect: 0, effectArg: 0 });
      continue;
    }
    const byt1 = bytes[off++];
    const byt2 = bytes[off++];
    const byt3 = bytes[off++];
    const byt4 = bytes[off++];
    trackLines.push({
      note: byt1,
      instrument: byt2,
      disableSoundTranspose: (byt3 & 128) !== 0,
      disableNoteTranspose: (byt3 & 64) !== 0,
      arpeggio: (byt3 & 48) >> 4,
      effect: byt3 & 15,
      effectArg: byt4
    });
  }
  if (off + 8 > bytes.length) return null;
  if (readChunkTag(bytes, off) !== "SAMP") return null;
  off += 4;
  const numberOfSamples = u32BE(bytes, off);
  off += 4;
  const sampDescTableStart = off;
  const samplesInfo = [];
  for (let i = 0; i < numberOfSamples; i++) {
    if (off + 16 > bytes.length) break;
    const oneShotLength = u16BE(bytes, off);
    off += 2;
    const repeatLength = u16BE(bytes, off);
    off += 2;
    const sampleNumber = s8(bytes[off++]);
    const volume = u8(bytes, off++);
    off += 1;
    off += 1;
    off += 1;
    off += 1;
    off += 6;
    samplesInfo.push({ name: "", oneShotLength, repeatLength, sampleNumber, volume });
  }
  for (let i = 0; i < numberOfSamples; i++) {
    if (off + 20 > bytes.length) break;
    samplesInfo[i].name = readString(bytes, off, 20);
    off += 20;
  }
  off += numberOfSamples * 4 * 2;
  const sampleLengths = [];
  for (let i = 0; i < numberOfSamples; i++) {
    if (off + 4 > bytes.length) {
      sampleLengths.push(0);
      continue;
    }
    sampleLengths.push(u32BE(bytes, off));
    off += 4;
  }
  const sampleData = new Array(numberOfSamples).fill(null);
  for (let i = numberOfSamples - 1; i >= 0; i--) {
    const slen = sampleLengths[i];
    if (slen > 0 && off + slen <= bytes.length) {
      const pcm = new Uint8Array(slen);
      for (let j = 0; j < slen; j++) {
        pcm[j] = bytes[off + j];
      }
      sampleData[i] = pcm;
      off += slen;
    }
  }
  if (off + 8 > bytes.length) return null;
  if (readChunkTag(bytes, off) !== "SYNT") return null;
  off += 4;
  const numberOfInstruments = u32BE(bytes, off);
  off += 4;
  const syntTableStart = off;
  const synthInstruments = [];
  for (let i = 0; i < numberOfInstruments; i++) {
    if (off + 4 > bytes.length) break;
    if (readChunkTag(bytes, off) !== "IS20") break;
    off += 4;
    if (off + 20 > bytes.length) break;
    const name = readString(bytes, off, 20);
    off += 20;
    if (off + 2 > bytes.length) break;
    const waveformLength = u16BE(bytes, off);
    off += 2;
    const volume = u8(bytes, off++);
    const vibratoDelay = u8(bytes, off++);
    const vibratoSpeed = u8(bytes, off++);
    const vibratoLevel = u8(bytes, off++);
    const portamentoSpeed = u8(bytes, off++);
    const adsrLength = u8(bytes, off++);
    const adsrRepeat = u8(bytes, off++);
    off += 4;
    const sustainPoint = u8(bytes, off++);
    const sustainSpeed = u8(bytes, off++);
    const amfLength = u8(bytes, off++);
    const amfRepeat = u8(bytes, off++);
    const egMode = u8(bytes, off++);
    const egEnabled = u8(bytes, off++);
    const effectiveEgMode = egEnabled === 0 ? 0 : egMode === 0 ? 1 : 2;
    const egStartLen = u8(bytes, off++);
    const egStopRep = u8(bytes, off++);
    const egSpeedUp = u8(bytes, off++);
    const egSpeedDown = u8(bytes, off++);
    off += 19;
    const adsrTable = [];
    for (let j = 0; j < 128; j++) adsrTable.push(off < bytes.length ? u8(bytes, off++) : 0);
    const lfoTable = [];
    for (let j = 0; j < 128; j++) lfoTable.push(off < bytes.length ? s8(bytes[off++]) : 0);
    const arpeggios = [];
    for (let a = 0; a < 3; a++) {
      const arpLen = off < bytes.length ? u8(bytes, off++) : 0;
      const arpRep = off < bytes.length ? u8(bytes, off++) : 0;
      const vals = [];
      for (let v = 0; v < 14; v++) vals.push(off < bytes.length ? s8(bytes[off++]) : 0);
      arpeggios.push({ length: arpLen, repeat: arpRep, values: vals });
    }
    const egTable = [];
    for (let j = 0; j < 128; j++) egTable.push(off < bytes.length ? u8(bytes, off++) : 0);
    const waveform1 = new Int8Array(256);
    if (off + 256 <= bytes.length) {
      for (let j = 0; j < 256; j++) {
        waveform1[j] = s8(bytes[off + j]);
      }
      off += 256;
    }
    const waveform2 = new Int8Array(256);
    if (off + 256 <= bytes.length) {
      for (let j = 0; j < 256; j++) {
        waveform2[j] = s8(bytes[off + j]);
      }
      off += 256;
    }
    synthInstruments.push({
      name,
      waveformLength,
      volume,
      vibratoDelay,
      vibratoSpeed,
      vibratoLevel,
      portamentoSpeed,
      adsrLength,
      adsrRepeat,
      sustainPoint,
      sustainSpeed,
      amfLength,
      amfRepeat,
      egMode: effectiveEgMode,
      egStartLen,
      egStopRep,
      egSpeedUp,
      egSpeedDown,
      adsrTable,
      lfoTable,
      arpeggios,
      egTable,
      waveform1,
      waveform2
    });
  }
  const PAL_C3_RATE = Math.round(PAL_CLOCK / (2 * 214));
  const C3_FREQ = 130.81;
  const instrConfigs = [];
  for (let i = 0; i < numberOfSamples; i++) {
    const samp = samplesInfo[i];
    const id = i + 1;
    const sampChipRam = {
      moduleBase: 0,
      moduleSize: bytes.length,
      instrBase: sampDescTableStart + i * 16,
      instrSize: 16,
      sections: { instTable: sampDescTableStart }
    };
    const rawPcm = samp.sampleNumber >= 0 && samp.sampleNumber < sampleData.length ? sampleData[samp.sampleNumber] : sampleData[i] ?? null;
    if (rawPcm && rawPcm.length > 0) {
      const hasLoop = samp.repeatLength !== 1 && samp.oneShotLength !== 0;
      let loopStart = 0;
      let loopEnd = 0;
      if (hasLoop) {
        if (samp.repeatLength === 0) {
          loopStart = 0;
          loopEnd = rawPcm.length;
        } else {
          loopStart = samp.oneShotLength * 2;
          loopEnd = (samp.oneShotLength + samp.repeatLength) * 2;
        }
      }
      instrConfigs.push({
        ...createSamplerInstrument(id, samp.name || `Sample ${i}`, rawPcm, samp.volume, PAL_C3_RATE, loopStart, loopEnd),
        uadeChipRam: sampChipRam
      });
    } else {
      instrConfigs.push({ ...makeSynthPlaceholder(id, samp.name || `Sample ${i}`), uadeChipRam: sampChipRam });
    }
  }
  for (let i = 0; i < synthInstruments.length; i++) {
    const instr = synthInstruments[i];
    const id = numberOfSamples + i + 1;
    const syntChipRam = {
      moduleBase: 0,
      moduleSize: bytes.length,
      instrBase: syntTableStart + i * 1010,
      instrSize: 1010,
      sections: { instTable: syntTableStart }
    };
    const wave = instr.waveform1;
    const playLen = Math.min(Math.max(2, instr.waveformLength), 256);
    const pcmUint8 = new Uint8Array(playLen);
    for (let j = 0; j < playLen; j++) {
      pcmUint8[j] = wave[j % 256] & 255;
    }
    const synthRate = Math.round(C3_FREQ * playLen);
    const is20Config = {
      volume: instr.volume,
      waveformLength: instr.waveformLength,
      portamentoSpeed: instr.portamentoSpeed,
      vibratoDelay: instr.vibratoDelay,
      vibratoSpeed: instr.vibratoSpeed,
      vibratoLevel: instr.vibratoLevel,
      adsrLength: instr.adsrLength,
      adsrRepeat: instr.adsrRepeat,
      sustainPoint: instr.sustainPoint,
      sustainSpeed: instr.sustainSpeed,
      amfLength: instr.amfLength,
      amfRepeat: instr.amfRepeat,
      egMode: instr.egMode,
      egStartLen: instr.egStartLen,
      egStopRep: instr.egStopRep,
      egSpeedUp: instr.egSpeedUp,
      egSpeedDown: instr.egSpeedDown,
      arpeggios: instr.arpeggios,
      adsrTable: instr.adsrTable,
      lfoTable: instr.lfoTable,
      egTable: instr.egTable,
      waveform1: Array.from(instr.waveform1),
      waveform2: Array.from(instr.waveform2),
      name: instr.name || `Synth ${i}`
    };
    instrConfigs.push({
      ...createSamplerInstrument(id, instr.name || `Synth ${i}`, pcmUint8, instr.volume, synthRate, 0, playLen),
      type: "synth",
      synthType: "InStereo2Synth",
      inStereo2: is20Config,
      uadeChipRam: syntChipRam
    });
  }
  function remapInstrNum(instrNum) {
    if (instrNum === 0 || instrNum === 128) return 0;
    if (instrNum >= 64) {
      const sampIdx = instrNum - 64;
      if (sampIdx < numberOfSamples) return sampIdx + 1;
      return 0;
    } else {
      const synthIdx = instrNum - 1;
      if (synthIdx < synthInstruments.length) return numberOfSamples + synthIdx + 1;
      return 0;
    }
  }
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
        if (line.note === 128) {
          channelRows[ch].push(emptyCell());
          continue;
        }
        let noteIdx = line.note;
        if (!line.disableNoteTranspose) {
          noteIdx = Math.max(1, Math.min(108, noteIdx + pos.noteTranspose));
        }
        let instrNum = line.instrument;
        if (instrNum > 0 && instrNum !== 128 && !line.disableSoundTranspose) {
          if (instrNum < 64) {
            instrNum = Math.max(1, Math.min(63, instrNum + pos.soundTranspose));
          }
        }
        const xmNote = is20NoteToXm(noteIdx);
        const instrId = remapInstrNum(instrNum);
        const { effTyp, eff } = is20EffectToXm(line.effect, line.effectArg);
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
        sourceFormat: "IS20",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: 4,
        originalPatternCount: positions.length,
        originalInstrumentCount: instrConfigs.length
      }
    });
  }
  if (trackerPatterns.length === 0) {
    trackerPatterns.push(makeEmptyPattern(filename, 4, rowsPerTrack));
  }
  const moduleName = filename.replace(/\.[^/.]+$/, "");
  const tempoHz = song.tempo > 0 ? song.tempo : 50;
  const tempo = Math.max(32, Math.min(255, Math.round(tempoHz * 125 / 50)));
  const uadePatternLayout = {
    formatId: "inStereo2",
    patternDataFileOffset: trackRowDataOffset,
    bytesPerCell: 4,
    rowsPerPattern: rowsPerTrack,
    numChannels: 4,
    numPatterns: trackerPatterns.length,
    moduleSize: bytes.length,
    encodeCell: encodeInStereo2Cell,
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
    name: moduleName,
    format: "IS20",
    patterns: trackerPatterns,
    instruments: instrConfigs,
    songPositions: trackerPatterns.map((_, i) => i),
    songLength: trackerPatterns.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: Math.max(1, song.startSpeed),
    initialBPM: tempo,
    linearPeriods: false,
    uadeEditableFileData: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    uadeEditableFileName: filename,
    noteExportOffset: 36,
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
      sourceFormat: "IS20",
      sourceFile: filename,
      importedAt: (/* @__PURE__ */ new Date()).toISOString(),
      originalChannelCount: numChannels,
      originalPatternCount: 0,
      originalInstrumentCount: 0
    }
  };
}
function is20EffectToXm(effect, arg) {
  switch (effect) {
    case 0:
      if (arg !== 0) return { effTyp: 0, eff: arg };
      return { effTyp: 0, eff: 0 };
    case 7:
      return { effTyp: 3, eff: arg };
    case 10:
      if (arg > 127) {
        const down = 256 - arg;
        return { effTyp: 10, eff: down & 15 };
      }
      return { effTyp: 10, eff: (arg & 15) << 4 };
    case 11:
      return { effTyp: 11, eff: arg };
    case 12:
      return { effTyp: 12, eff: Math.min(64, arg) };
    case 13:
      return { effTyp: 13, eff: 0 };
    case 15:
      if (arg > 0 && arg <= 31) return { effTyp: 15, eff: arg };
      return { effTyp: 0, eff: 0 };
    default:
      return { effTyp: 0, eff: 0 };
  }
}
export {
  isInStereo2Format,
  parseInStereo2File
};
