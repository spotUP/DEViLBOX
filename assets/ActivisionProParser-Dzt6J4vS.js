import { b$ as registerPatternEncoder, c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const AVP_REF_XM$1 = 37;
const AVP_REF_IDX$1 = 60;
const AVP_PERIODS_LEN = 85;
function encodeActivisionProCell(cell) {
  const out = new Uint8Array(1);
  const xmNote = cell.note ?? 0;
  const instr = cell.instrument ?? 0;
  let noteIdx = 0;
  if (xmNote > 0 && xmNote <= 96) {
    noteIdx = xmNote - AVP_REF_XM$1 + AVP_REF_IDX$1;
    noteIdx = Math.max(0, Math.min(AVP_PERIODS_LEN - 1, noteIdx));
  }
  const instrField = (instr & 3) << 6;
  out[0] = instrField | noteIdx & 63;
  return out;
}
registerPatternEncoder("activisionPro", () => encodeActivisionProCell);
const PAL_CLOCK = 3546895;
const MAX_SAMPLES = 27;
const AVP_PERIODS = [
  1695,
  1600,
  1505,
  1426,
  1347,
  1268,
  1189,
  1125,
  1062,
  1006,
  951,
  895,
  1695,
  1600,
  1505,
  1426,
  1347,
  1268,
  1189,
  1125,
  1062,
  1006,
  951,
  895,
  1695,
  1600,
  1505,
  1426,
  1347,
  1268,
  1189,
  1125,
  1062,
  1006,
  951,
  1790,
  1695,
  1600,
  1505,
  1426,
  1347,
  1268,
  1189,
  1125,
  1062,
  1006,
  951,
  895,
  848,
  800,
  753,
  713,
  674,
  634,
  595,
  563,
  531,
  503,
  476,
  448,
  424,
  400,
  377,
  357,
  337,
  317,
  298,
  282,
  266,
  252,
  238,
  224,
  212,
  200,
  189,
  179,
  169,
  159,
  149,
  141,
  133,
  126,
  119,
  112,
  106
];
const AVP_REF_PERIOD = 424;
const AVP_REF_IDX = 60;
const AVP_REF_XM = 37;
function u16BE(b, off) {
  return b[off] << 8 | b[off + 1];
}
function u32BE(b, off) {
  return (b[off] << 24 | b[off + 1] << 16 | b[off + 2] << 8 | b[off + 3]) >>> 0;
}
function s8(v) {
  return v < 128 ? v : v - 256;
}
function s16BE(b, off) {
  const v = u16BE(b, off);
  return v < 32768 ? v : v - 65536;
}
function periodToRate(period) {
  return Math.round(PAL_CLOCK / (2 * period));
}
function avpNoteToXM(idx) {
  if (idx < 0 || idx >= AVP_PERIODS.length) return 0;
  const xm = AVP_REF_XM + (idx - AVP_REF_IDX);
  return Math.max(1, Math.min(96, xm));
}
function isActivisionProFormat(bytes) {
  if (bytes.length < 1024) return false;
  const info = extractPlayerInfo(bytes);
  return info !== null;
}
function extractPlayerInfo(bytes) {
  const searchLength = Math.min(bytes.length, 4096);
  let startOffset = -1;
  for (let i = 0; i < searchLength - 3; i++) {
    if (bytes[i] === 72 && bytes[i + 1] === 231 && bytes[i + 2] === 252 && bytes[i + 3] === 254) {
      startOffset = i;
      break;
    }
  }
  if (startOffset < 0) return null;
  let subSongListOffset = -1;
  let positionListsOffset = -1;
  let index;
  for (index = startOffset; index < searchLength - 6; index += 2) {
    if (bytes[index] === 233 && bytes[index + 1] === 65 && bytes[index + 2] === 112 && bytes[index + 3] === 0 && bytes[index + 4] === 65 && bytes[index + 5] === 250) {
      break;
    }
  }
  if (index >= searchLength - 6) return null;
  subSongListOffset = s16BE(bytes, index + 6) + index + 6;
  for (; index < searchLength - 4; index += 2) {
    if (bytes[index] === 78 && bytes[index + 1] === 117) return null;
    if (bytes[index] === 97 && bytes[index + 1] === 0) break;
  }
  if (index >= searchLength - 4) return null;
  index = s16BE(bytes, index + 2) + index + 2;
  if (index < 0 || index >= searchLength) return null;
  if (bytes[index] !== 122 || bytes[index + 1] !== 0) return null;
  if (bytes[index + 6] !== 73 || bytes[index + 7] !== 250) return null;
  positionListsOffset = s16BE(bytes, index + 8) + index + 8;
  let trackOffsetsOffset = -1;
  let tracksOffset = -1;
  let envelopesOffset = -1;
  let instrumentsOffset = -1;
  let sampleStartOffsetsOffset = -1;
  let sampleDataOffset = -1;
  let sampleInfoOffset = -1;
  let speedVariationVersion = 0;
  let speedVariationSpeedIncrementOffset = -1;
  let parseTrackVersion = 0;
  let instrumentFormatVersion = 0;
  let haveSeparateSampleInfo = false;
  let haveEnvelope = false;
  let vibratoVersion = 0;
  for (index = startOffset; index < searchLength - 8; index += 2) {
    if (bytes[index] === 44 && bytes[index + 1] === 124 && bytes[index + 6] === 74 && bytes[index + 7] === 41) {
      break;
    }
  }
  if (index >= searchLength - 8) return null;
  const startOfPlay = index;
  let globalOffset = 0;
  index -= 4;
  for (; index >= 0; index -= 2) {
    if (bytes[index] === 75 && bytes[index + 1] === 250) {
      instrumentsOffset = s16BE(bytes, index + 2) + index + 2;
    } else if (bytes[index] === 67 && bytes[index + 1] === 250) {
      globalOffset = s16BE(bytes, index + 2) + index + 2;
    }
    if (instrumentsOffset !== -1 && globalOffset !== 0) break;
  }
  if (instrumentsOffset === -1 || globalOffset === 0) return null;
  index = startOfPlay;
  for (; index < searchLength - 16; index += 2) {
    if (bytes[index] === 83 && bytes[index + 1] === 105 && bytes[index + 4] === 103) break;
  }
  if (index >= searchLength - 16) return null;
  if (bytes[index + 6] === 112 && bytes[index + 7] === 3) {
    speedVariationVersion = 1;
  } else if (bytes[index + 6] === 122 && bytes[index + 7] === 0) {
    speedVariationVersion = 2;
    if (bytes[index + 12] !== 218 || bytes[index + 13] !== 41) return null;
    speedVariationSpeedIncrementOffset = globalOffset + s16BE(bytes, index + 14);
  } else {
    return null;
  }
  index += 8;
  for (; index < searchLength - 12; index += 2) {
    if (bytes[index] === 122 && bytes[index + 1] === 0 && bytes[index + 2] === 26 && bytes[index + 3] === 49 && bytes[index + 6] === 218 && bytes[index + 7] === 69 && bytes[index + 8] === 73 && bytes[index + 9] === 250) {
      break;
    }
  }
  if (index >= searchLength - 12) return null;
  trackOffsetsOffset = s16BE(bytes, index + 10) + index + 10;
  index += 12;
  if (index >= searchLength - 8) return null;
  if (bytes[index] !== 58 || bytes[index + 1] !== 52 || bytes[index + 4] !== 73 || bytes[index + 5] !== 250) return null;
  tracksOffset = s16BE(bytes, index + 6) + index + 6;
  index += 8;
  for (; index < searchLength - 6; index += 2) {
    if (bytes[index] === 24 && bytes[index + 1] === 49) break;
  }
  if (index >= searchLength - 6) return null;
  index += 6;
  for (; index < searchLength - 10; index += 2) {
    if (bytes[index] === 66 && bytes[index + 1] === 49) break;
  }
  if (index >= searchLength - 10) return null;
  index += 8;
  if (bytes[index] === 8 && bytes[index + 1] === 49) {
    parseTrackVersion = 1;
  } else if (bytes[index] === 74 && bytes[index + 1] === 52) {
    parseTrackVersion = 2;
  } else if (bytes[index] === 26 && bytes[index + 1] === 52) {
    parseTrackVersion = 3;
  } else if (bytes[index] === 66 && bytes[index + 1] === 48) {
    parseTrackVersion = 4;
    index += 2;
    for (; index < searchLength - 4; index += 2) {
      if (bytes[index] === 49 && bytes[index + 1] === 133) break;
      if (bytes[index] === 12 && bytes[index + 1] === 5 && bytes[index + 2] === 0 && bytes[index + 3] === 132) {
        parseTrackVersion = 5;
        break;
      }
    }
    if (index >= searchLength - 4) return null;
    index -= 2;
  } else {
    return null;
  }
  index += 2;
  for (; index < searchLength - 2; index += 2) {
    if (bytes[index] === 49 && bytes[index + 1] === 133) break;
  }
  if (index >= searchLength - 2) return null;
  index += 4;
  if (index >= searchLength - 16) return null;
  if (bytes[index] === 19 && bytes[index + 1] === 181 && bytes[index + 2] === 80 && bytes[index + 3] === 2 && bytes[index + 6] === 19 && bytes[index + 7] === 181 && bytes[index + 8] === 80 && bytes[index + 9] === 7 && bytes[index + 12] === 19 && bytes[index + 13] === 181 && bytes[index + 14] === 80 && bytes[index + 15] === 15) {
    instrumentFormatVersion = 1;
  } else if (bytes[index] === 17 && bytes[index + 1] === 181 && bytes[index + 2] === 80 && bytes[index + 3] === 1 && bytes[index + 6] === 19 && bytes[index + 7] === 181 && bytes[index + 8] === 80 && bytes[index + 9] === 2 && bytes[index + 12] === 19 && bytes[index + 13] === 181 && bytes[index + 14] === 80 && bytes[index + 15] === 7 && bytes[index + 18] === 19 && bytes[index + 19] === 181 && bytes[index + 20] === 80 && bytes[index + 21] === 15) {
    instrumentFormatVersion = 2;
  } else if (bytes[index] === 17 && bytes[index + 1] === 181 && bytes[index + 2] === 80 && bytes[index + 3] === 1 && bytes[index + 6] === 19 && bytes[index + 7] === 181 && bytes[index + 8] === 80 && bytes[index + 9] === 2 && bytes[index + 12] === 19 && bytes[index + 13] === 181 && bytes[index + 14] === 80 && bytes[index + 15] === 3 && bytes[index + 18] === 49 && bytes[index + 19] === 181 && bytes[index + 20] === 80 && bytes[index + 21] === 4 && bytes[index + 24] === 51 && bytes[index + 25] === 117 && bytes[index + 26] === 80 && bytes[index + 27] === 6 && bytes[index + 30] === 19 && bytes[index + 31] === 181 && bytes[index + 32] === 80 && bytes[index + 33] === 8 && bytes[index + 36] === 19 && bytes[index + 37] === 181 && bytes[index + 38] === 80 && bytes[index + 39] === 15) {
    instrumentFormatVersion = 3;
  } else {
    return null;
  }
  for (; index < searchLength - 14; index += 2) {
    if (bytes[index] === 229 && bytes[index + 1] === 69 && bytes[index + 2] === 69 && bytes[index + 3] === 250) break;
  }
  if (index >= searchLength - 14) return null;
  sampleStartOffsetsOffset = s16BE(bytes, index + 4) + index + 4;
  if (bytes[index + 10] !== 69 || bytes[index + 11] !== 250) return null;
  sampleDataOffset = s16BE(bytes, index + 12) + index + 12;
  index += 14;
  if (index < searchLength - 20 && bytes[index + 12] === 202 && bytes[index + 13] === 252 && bytes[index + 16] === 69 && bytes[index + 17] === 250) {
    haveSeparateSampleInfo = true;
    sampleInfoOffset = s16BE(bytes, index + 18) + index + 18;
    index += 18;
  }
  for (; index < searchLength - 12; index += 2) {
    if (bytes[index] === 107 && bytes[index + 1] === 0 && bytes[index + 4] === 74 && bytes[index + 5] === 49) break;
  }
  if (index >= searchLength - 12) return null;
  index += 10;
  for (; index < searchLength - 10; index += 2) {
    if (bytes[index] === 218 && bytes[index + 1] === 69) {
      index += 2;
      break;
    }
  }
  for (; index < searchLength - 10; index += 2) {
    if (bytes[index] === 155 && bytes[index + 1] === 112) break;
  }
  if (index >= searchLength - 10) return null;
  if (bytes[index + 4] === 83 && bytes[index + 5] === 49) {
    vibratoVersion = 1;
  } else if (bytes[index + 8] === 138 && bytes[index + 9] === 241) {
    vibratoVersion = 2;
  } else {
    return null;
  }
  index += 10;
  haveEnvelope = false;
  if (index < searchLength - 8 && bytes[index + 4] === 107 && bytes[index + 6] === 74 && bytes[index + 7] === 49) {
    haveEnvelope = true;
    index += 8;
    for (; index < searchLength - 10; index += 2) {
      if (bytes[index] === 233 && bytes[index + 1] === 68 && ((bytes[index + 2] === 49 || bytes[index + 2] === 17) && bytes[index + 3] === 132) && bytes[index + 6] === 69 && bytes[index + 7] === 250) {
        envelopesOffset = s16BE(bytes, index + 8) + index + 8;
        break;
      }
    }
  }
  if (subSongListOffset < 0 || positionListsOffset < 0 || trackOffsetsOffset < 0 || tracksOffset < 0 || instrumentsOffset < 0 || sampleStartOffsetsOffset < 0 || sampleDataOffset < 0) {
    return null;
  }
  return {
    subSongListOffset,
    positionListsOffset,
    trackOffsetsOffset,
    tracksOffset,
    envelopesOffset: haveEnvelope ? envelopesOffset : -1,
    instrumentsOffset,
    sampleStartOffsetsOffset,
    sampleDataOffset,
    sampleInfoOffset: haveSeparateSampleInfo ? sampleInfoOffset : -1,
    instrumentFormatVersion,
    parseTrackVersion,
    speedVariationVersion,
    speedVariationSpeedIncrementOffset,
    haveSeparateSampleInfo,
    haveEnvelope,
    vibratoVersion
  };
}
function parseActivisionProFile(bytes, filename) {
  if (bytes.length < 1024) return null;
  try {
    return parseInternal(bytes, filename);
  } catch (e) {
    console.warn("[ActivisionProParser] Parse failed:", e);
    return null;
  }
}
function parseInternal(bytes, filename) {
  const info = extractPlayerInfo(bytes);
  if (!info) return null;
  const len = bytes.length;
  const subSongListOffset = info.subSongListOffset;
  const positionListsOffset = info.positionListsOffset;
  if (subSongListOffset < 0 || positionListsOffset <= subSongListOffset) return null;
  const numberOfSubSongs = Math.floor((positionListsOffset - subSongListOffset) / 16);
  if (numberOfSubSongs <= 0) return null;
  const songInfoList = [];
  for (let i = 0; i < numberOfSubSongs; i++) {
    const base = subSongListOffset + i * 16;
    if (base + 16 > len) break;
    const posListOffsets = [
      u16BE(bytes, base),
      u16BE(bytes, base + 2),
      u16BE(bytes, base + 4),
      u16BE(bytes, base + 6)
    ];
    const speedVariation = new Int8Array(8);
    for (let j = 0; j < 8; j++) {
      speedVariation[j] = s8(bytes[base + 8 + j]);
    }
    const positionLists = [];
    for (let ch = 0; ch < 4; ch++) {
      const listOff = positionListsOffset + posListOffsets[ch];
      if (listOff >= len) {
        positionLists.push(new Uint8Array([255]));
        continue;
      }
      const list = loadPositionList(bytes, listOff);
      positionLists.push(list);
    }
    songInfoList.push({ positionLists, speedVariation });
  }
  if (songInfoList.length === 0) return null;
  const trackOffsetsOffset = info.trackOffsetsOffset;
  const tracksOffset = info.tracksOffset;
  if (trackOffsetsOffset < 0 || tracksOffset < 0 || tracksOffset <= trackOffsetsOffset) return null;
  const numberOfTracks = Math.floor((tracksOffset - trackOffsetsOffset) / 2);
  const trackOffsets = [];
  for (let i = 0; i < numberOfTracks; i++) {
    const off = trackOffsetsOffset + i * 2;
    if (off + 2 > len) break;
    trackOffsets.push(s16BE(bytes, off));
  }
  const tracks = new Array(numberOfTracks).fill(null);
  const trackFileStarts = new Array(numberOfTracks).fill(-1);
  for (let i = 0; i < trackOffsets.length; i++) {
    if (trackOffsets[i] < 0) continue;
    const trackOff = tracksOffset + trackOffsets[i];
    if (trackOff >= len) continue;
    tracks[i] = loadSingleTrack(bytes, trackOff, info.parseTrackVersion);
    trackFileStarts[i] = trackOff;
  }
  const instrumentsOffset = info.instrumentsOffset;
  const trackOffsetsOffset2 = info.trackOffsetsOffset;
  if (instrumentsOffset < 0 || trackOffsetsOffset2 <= instrumentsOffset) return null;
  const numberOfInstruments = Math.floor((trackOffsetsOffset2 - instrumentsOffset) / 16);
  const instruments = [];
  for (let i = 0; i < numberOfInstruments; i++) {
    const base = instrumentsOffset + i * 16;
    if (base + 16 > len) break;
    const instr = loadInstrument(bytes, base, info.instrumentFormatVersion);
    if (instr) instruments.push(instr);
  }
  const samples = Array.from({ length: MAX_SAMPLES }, () => ({
    length: 0,
    loopStart: 0,
    loopLength: 1,
    pcm: null
  }));
  if (info.haveSeparateSampleInfo && info.sampleInfoOffset >= 0) {
    let siOff = info.sampleInfoOffset;
    for (let i = 0; i < MAX_SAMPLES; i++) {
      if (siOff + 6 > len) break;
      samples[i].length = u16BE(bytes, siOff);
      samples[i].loopStart = u16BE(bytes, siOff + 2);
      samples[i].loopLength = u16BE(bytes, siOff + 4);
      siOff += 6;
    }
  }
  const sampleStartOffsetsOffset = info.sampleStartOffsetsOffset;
  const sampleDataOffset = info.sampleDataOffset;
  if (sampleStartOffsetsOffset >= 0 && sampleDataOffset >= 0 && sampleStartOffsetsOffset + (MAX_SAMPLES + 1) * 4 <= len) {
    const startOffsets = [];
    for (let i = 0; i <= MAX_SAMPLES; i++) {
      startOffsets.push(u32BE(bytes, sampleStartOffsetsOffset + i * 4));
    }
    for (let i = 0; i < MAX_SAMPLES; i++) {
      const chunkLen = startOffsets[i + 1] - startOffsets[i];
      if (chunkLen === 0) {
        samples[i].length = 0;
        samples[i].loopStart = 0;
        samples[i].loopLength = 1;
        continue;
      }
      const dataOff = sampleDataOffset + startOffsets[i];
      if (dataOff >= len) continue;
      let pcmOff = dataOff;
      let pcmLen = chunkLen;
      if (!info.haveSeparateSampleInfo) {
        if (dataOff + 6 > len) continue;
        samples[i].length = u16BE(bytes, dataOff);
        samples[i].loopStart = u16BE(bytes, dataOff + 2);
        samples[i].loopLength = u16BE(bytes, dataOff + 4);
        pcmOff += 6;
        pcmLen = chunkLen - 6;
      }
      if (pcmLen <= 0 || pcmOff + pcmLen > len) continue;
      const pcm = new Int8Array(pcmLen);
      for (let j = 0; j < pcmLen; j++) {
        pcm[j] = s8(bytes[pcmOff + j]);
      }
      samples[i].pcm = pcm;
    }
  }
  const instrumentConfigs = [];
  for (let i = 0; i < instruments.length; i++) {
    const instr = instruments[i];
    const id = i + 1;
    const sampleIdx = instr.sampleNumber;
    if (sampleIdx >= 0 && sampleIdx < MAX_SAMPLES) {
      const s = samples[sampleIdx];
      if (s.pcm && s.pcm.length > 0) {
        const pcm = new Uint8Array(s.pcm.buffer);
        const sampleRate = periodToRate(AVP_REF_PERIOD);
        const hasLoop = s.loopLength > 1;
        const loopStart = hasLoop ? s.loopStart : 0;
        const loopEnd = hasLoop ? s.loopStart + s.loopLength : 0;
        instrumentConfigs.push(
          createSamplerInstrument(id, `Sample ${sampleIdx}`, pcm, instr.volume || 64, sampleRate, loopStart, loopEnd)
        );
        continue;
      }
    }
    instrumentConfigs.push({
      id,
      name: `Instrument ${id}`,
      type: "synth",
      synthType: "Synth",
      effects: [],
      volume: 0,
      pan: 0
    });
  }
  const primarySong = songInfoList[0];
  const trackerPatterns = [];
  const cellOffsetMap = [];
  const maxPositions = Math.max(...primarySong.positionLists.map((pl) => countPositions(pl)));
  for (let posIdx = 0; posIdx < maxPositions; posIdx++) {
    const channelRows = [[], [], [], []];
    const patOffsets = [[], [], [], []];
    for (let ch = 0; ch < 4; ch++) {
      const positionList = primarySong.positionLists[ch];
      const trackNum = getPositionTrackNumber(positionList, posIdx);
      const trackData = trackNum >= 0 && trackNum < tracks.length ? tracks[trackNum] : null;
      const trackFileStart = trackNum >= 0 && trackNum < trackFileStarts.length ? trackFileStarts[trackNum] : -1;
      const { rows, noteBytePositions } = decodeAvpTrack(trackData, instruments, info.parseTrackVersion);
      for (const relPos of noteBytePositions) {
        patOffsets[ch].push(relPos >= 0 && trackFileStart >= 0 ? trackFileStart + relPos : -1);
      }
      while (rows.length < 64) {
        rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
        patOffsets[ch].push(-1);
      }
      channelRows[ch] = rows.slice(0, 64);
      patOffsets[ch] = patOffsets[ch].slice(0, 64);
    }
    cellOffsetMap.push(patOffsets);
    trackerPatterns.push({
      id: `pattern-${posIdx}`,
      name: `Position ${posIdx}`,
      length: 64,
      channels: channelRows.map((rows, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: [-50, 50, 50, -50][ch] ?? 0,
        instrumentId: null,
        color: null,
        rows
      })),
      importMetadata: {
        sourceFormat: "AVP",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: 4,
        originalPatternCount: tracks.length,
        originalInstrumentCount: instruments.length
      }
    });
  }
  if (trackerPatterns.length === 0) {
    trackerPatterns.push(makeEmptyPattern(filename, instruments.length));
  }
  const moduleName = filename.replace(/\.[^/.]+$/, "");
  const uadePatternLayout = {
    formatId: "activisionPro",
    patternDataFileOffset: tracksOffset,
    bytesPerCell: 1,
    // just the note+instrument byte
    rowsPerPattern: 64,
    numChannels: 4,
    numPatterns: trackerPatterns.length,
    moduleSize: bytes.byteLength,
    encodeCell: encodeActivisionProCell,
    getCellFileOffset: (pattern, row, channel) => {
      if (pattern < 0 || pattern >= cellOffsetMap.length) return -1;
      const patOffsets = cellOffsetMap[pattern];
      if (channel < 0 || channel >= patOffsets.length) return -1;
      const chOffsets = patOffsets[channel];
      if (row < 0 || row >= chOffsets.length) return -1;
      return chOffsets[row];
    }
  };
  return {
    name: moduleName,
    format: "AVP",
    patterns: trackerPatterns,
    instruments: instrumentConfigs,
    songPositions: trackerPatterns.map((_, i) => i),
    songLength: trackerPatterns.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadePatternLayout
  };
}
function loadPositionList(bytes, off) {
  const result = [];
  const len = bytes.length;
  let pos = off;
  while (pos < len) {
    const dat = bytes[pos++];
    result.push(dat);
    if (dat >= 253 || (dat & 64) === 0) {
      if (pos < len) result.push(bytes[pos++]);
    }
    if (dat === 254 || dat === 255) break;
  }
  return new Uint8Array(result);
}
function countPositions(list) {
  let count = 0;
  let i = 0;
  while (i < list.length) {
    const dat = list[i++];
    if (dat === 254 || dat === 255) break;
    if (dat >= 253 || (dat & 64) === 0) {
      i++;
    } else {
      count++;
    }
  }
  return count;
}
function getPositionTrackNumber(list, posIdx) {
  let count = 0;
  let i = 0;
  while (i < list.length) {
    const dat = list[i++];
    if (dat === 254 || dat === 255) return -1;
    if (dat >= 253 || (dat & 64) === 0) {
      i++;
    } else {
      if (count === posIdx) return dat;
      count++;
    }
  }
  return -1;
}
function loadSingleTrack(bytes, off, parseTrackVersion) {
  const result = [];
  const len = bytes.length;
  let pos = off;
  while (pos < len) {
    let dat = bytes[pos++];
    result.push(dat);
    if (dat === 255) break;
    if (parseTrackVersion === 3) {
      while ((dat & 128) !== 0 && pos < len) {
        result.push(bytes[pos++]);
        if (pos >= len) break;
        dat = bytes[pos++];
        result.push(dat);
      }
    } else if (parseTrackVersion === 4 || parseTrackVersion === 5) {
      if (dat !== 129) {
        while ((dat & 128) !== 0 && pos < len) {
          result.push(bytes[pos++]);
          if (pos >= len) break;
          dat = bytes[pos++];
          result.push(dat);
        }
      }
    } else {
      if ((dat & 128) !== 0 && pos < len) {
        result.push(bytes[pos++]);
        if (parseTrackVersion === 2 && pos < len) {
          result.push(bytes[pos++]);
        }
      }
    }
    if (pos < len) result.push(bytes[pos++]);
  }
  return new Uint8Array(result);
}
function loadInstrument(bytes, base, version) {
  if (base + 16 > bytes.length) return null;
  const instr = {
    sampleNumber: 0,
    envelopeNumber: 0,
    volume: 64,
    enabledEffectFlags: 0,
    portamentoAdd: 0,
    fineTune: 0,
    stopResetEffectDelay: 0,
    sampleNumber2: 0,
    sampleStartOffset: 0,
    arpeggioTable: [0, 0, 0, 0],
    fixedOrTransposedNote: 0,
    transpose: 0,
    vibratoNumber: 0,
    vibratoDelay: 0
  };
  if (version === 1) {
    instr.sampleNumber = bytes[base];
    instr.envelopeNumber = bytes[base + 1];
    instr.enabledEffectFlags = bytes[base + 2];
    instr.portamentoAdd = bytes[base + 4];
    instr.stopResetEffectDelay = bytes[base + 7];
    instr.sampleNumber2 = bytes[base + 8];
    for (let j = 0; j < 4; j++) instr.arpeggioTable[j] = s8(bytes[base + 9 + j]);
    instr.fixedOrTransposedNote = bytes[base + 13];
    instr.vibratoNumber = bytes[base + 14];
    instr.vibratoDelay = bytes[base + 15];
  } else if (version === 2) {
    instr.sampleNumber = bytes[base];
    instr.volume = bytes[base + 1];
    instr.enabledEffectFlags = bytes[base + 2];
    instr.portamentoAdd = bytes[base + 4];
    instr.stopResetEffectDelay = bytes[base + 7];
    instr.sampleNumber2 = bytes[base + 8];
    for (let j = 0; j < 4; j++) instr.arpeggioTable[j] = s8(bytes[base + 9 + j]);
    instr.fixedOrTransposedNote = bytes[base + 13];
    instr.vibratoNumber = bytes[base + 14];
    instr.vibratoDelay = bytes[base + 15];
  } else if (version === 3) {
    instr.sampleNumber = bytes[base];
    instr.volume = bytes[base + 1];
    instr.enabledEffectFlags = bytes[base + 2];
    instr.transpose = s8(bytes[base + 3]);
    instr.fineTune = s16BE(bytes, base + 4);
    instr.sampleStartOffset = u16BE(bytes, base + 6);
    instr.stopResetEffectDelay = bytes[base + 8];
    for (let j = 0; j < 4; j++) instr.arpeggioTable[j] = s8(bytes[base + 9 + j]);
    instr.fixedOrTransposedNote = bytes[base + 13];
    instr.vibratoNumber = bytes[base + 14];
    instr.vibratoDelay = bytes[base + 15];
  }
  return instr;
}
function decodeAvpTrack(data, instruments, parseTrackVersion) {
  const rows = [];
  const noteBytePositions = [];
  if (!data) return { rows, noteBytePositions };
  const len = data.length;
  let pos = 0;
  while (pos < len && rows.length < 64) {
    if (pos >= len) break;
    let dat = data[pos++];
    if (dat === 255) break;
    let noteByte = 0;
    let noteBytePos = -1;
    if (parseTrackVersion === 3) {
      while ((dat & 128) !== 0 && pos < len) {
        pos++;
        if (pos >= len) break;
        dat = data[pos++];
      }
      noteByte = dat;
      noteBytePos = pos - 1;
    } else if (parseTrackVersion === 4 || parseTrackVersion === 5) {
      if (dat === 129) {
        noteByte = 0;
        noteBytePos = pos - 1;
      } else {
        while ((dat & 128) !== 0 && pos < len) {
          pos++;
          if (pos >= len) break;
          dat = data[pos++];
        }
        noteByte = dat;
        noteBytePos = pos - 1;
      }
    } else {
      if ((dat & 128) !== 0) {
        pos++;
        if (parseTrackVersion === 2 && pos < len) pos++;
      }
      noteBytePos = pos;
      noteByte = pos < len ? data[pos++] : 0;
    }
    const noteIdx = noteByte & 63;
    const instrField = noteByte >> 6 & 3;
    let xmNote = 0;
    let instrId = 0;
    if (noteIdx > 0 && noteIdx < AVP_PERIODS.length) {
      xmNote = avpNoteToXM(noteIdx);
    }
    if (instrField > 0 && instruments.length > 0) {
      instrId = Math.min(instrField, instruments.length);
    }
    rows.push({ note: xmNote, instrument: instrId, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
    noteBytePositions.push(noteBytePos);
  }
  return { rows, noteBytePositions };
}
function makeEmptyPattern(filename, numInstr) {
  return {
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
      pan: [-50, 50, 50, -50][ch] ?? 0,
      instrumentId: null,
      color: null,
      rows: Array.from({ length: 64 }, () => ({
        note: 0,
        instrument: 0,
        volume: 0,
        effTyp: 0,
        eff: 0,
        effTyp2: 0,
        eff2: 0
      }))
    })),
    importMetadata: {
      sourceFormat: "AVP",
      sourceFile: filename,
      importedAt: (/* @__PURE__ */ new Date()).toISOString(),
      originalChannelCount: 4,
      originalPatternCount: 0,
      originalInstrumentCount: numInstr
    }
  };
}
export {
  isActivisionProFormat,
  parseActivisionProFile
};
