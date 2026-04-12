import { c5 as registerVariableEncoder, c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const XM_REFERENCE_NOTE$1 = 13;
const MA_REFERENCE_IDX$1 = 12;
function xmNoteToMA(xmNote) {
  if (xmNote <= 0 || xmNote === 97) return 0;
  const ma = xmNote - XM_REFERENCE_NOTE$1 + MA_REFERENCE_IDX$1;
  return ma >= 1 && ma <= 47 ? ma : 0;
}
const musicAssemblerEncoder = {
  formatId: "musicAssembler",
  encodePattern(rows) {
    const buf = [];
    let lastInstrument = -1;
    for (let i = 0; i < rows.length; i++) {
      const cell = rows[i];
      const xmNote = cell.note ?? 0;
      const instrument = cell.instrument ?? 0;
      const isRelease = xmNote === 97;
      const maNote = xmNoteToMA(xmNote);
      let delay = 0;
      for (let j = i + 1; j < rows.length; j++) {
        const next = rows[j];
        if ((next.note ?? 0) !== 0 || (next.instrument ?? 0) !== 0) break;
        delay++;
      }
      if (isRelease) {
        buf.push(128 | delay & 63);
        i += delay;
      } else if (maNote > 0) {
        const instrIdx = instrument > 0 ? instrument - 1 : -1;
        if (instrIdx >= 0 && instrIdx !== lastInstrument) {
          buf.push(192 | instrIdx & 63);
          buf.push(maNote & 63);
          buf.push(delay & 127);
          lastInstrument = instrIdx;
        } else {
          buf.push(maNote & 63);
          buf.push(delay & 127);
        }
        i += delay;
      } else if (instrument > 0) {
        const instrIdx = instrument - 1;
        buf.push(192 | instrIdx & 63);
        buf.push(0);
        buf.push(delay & 127);
        lastInstrument = instrIdx;
        i += delay;
      }
    }
    buf.push(255);
    return new Uint8Array(buf);
  }
};
registerVariableEncoder(musicAssemblerEncoder);
const PAL_CLOCK = 3546895;
const MA_PERIODS = [
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
  113
];
const MA_REFERENCE_IDX = 12;
const XM_REFERENCE_NOTE = 13;
const CHANNEL_MAP = [0, 3, 1, 2];
const PCM_BASE_RATE = Math.round(PAL_CLOCK / (2 * 214));
function u16BE(buf, off) {
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function s16(buf, off) {
  const v = buf[off] << 8 | buf[off + 1];
  return v < 32768 ? v : v - 65536;
}
function s32BE(buf, off) {
  const v = buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3];
  return v;
}
function s8v(v) {
  return v < 128 ? v : v - 256;
}
function maNoteToXM(n) {
  if (n === 0) return 0;
  return XM_REFERENCE_NOTE + (n - MA_REFERENCE_IDX);
}
function readString(buf, off, len) {
  let s = "";
  for (let i = 0; i < len; i++) {
    const c = buf[off + i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.trim();
}
function extractOffsets(buf) {
  const searchLength = buf.length;
  const startOfInit = s16(buf, 2) + 2;
  if (startOfInit < 0 || startOfInit >= searchLength) return null;
  let index = startOfInit;
  while (index < searchLength - 4) {
    if (buf[index] === 176 && buf[index + 1] === 124) break;
    index += 2;
  }
  if (index >= searchLength - 4) return null;
  const subSongCount = buf[index + 2] << 8 | buf[index + 3];
  index += 4;
  while (index < searchLength - 4) {
    if (buf[index] === 73 && buf[index + 1] === 250) break;
    index += 2;
  }
  if (index >= searchLength - 4) return null;
  const subSongSpeedOffset = s16(buf, index + 2) + index + 2;
  index += 4;
  while (index < searchLength - 4) {
    if (buf[index] === 73 && buf[index + 1] === 251) break;
    index += 2;
  }
  if (index >= searchLength - 4) return null;
  const subSongPositionListOffset = s8v(buf[index + 3]) + index + 2;
  const startOfPlay = 12;
  index = startOfPlay;
  while (index < searchLength - 4) {
    if (buf[index] === 67 && buf[index + 1] === 250) break;
    index += 2;
  }
  if (index >= searchLength - 4) return null;
  const moduleStartOffset = s16(buf, index + 2) + index + 2;
  index += 4;
  while (index < searchLength - 8) {
    if (buf[index] === 211 && buf[index + 1] === 250) break;
    index += 2;
  }
  if (index >= searchLength - 8) return null;
  const instrumentInfoOffsetOffset = s16(buf, index + 2) + index + 2;
  if (buf[index + 4] !== 213 || buf[index + 5] !== 250) return null;
  const sampleInfoOffsetOffset = s16(buf, index + 6) + index + 6;
  index += 8;
  while (index < searchLength - 2) {
    if (buf[index] === 97) break;
    index += 2;
  }
  if (index >= searchLength - 2) return null;
  index = s8v(buf[index + 1]) + index + 2;
  if (index < 0 || index >= searchLength) return null;
  while (index < searchLength - 4) {
    if (buf[index] === 219 && buf[index + 1] === 250) break;
    index += 2;
  }
  if (index >= searchLength - 4) return null;
  const tracksOffsetOffset = s16(buf, index + 2) + index + 2;
  return {
    subSongCount,
    subSongSpeedOffset,
    subSongPositionListOffset,
    moduleStartOffset,
    instrumentInfoOffsetOffset,
    sampleInfoOffsetOffset,
    tracksOffsetOffset
  };
}
function isMusicAssemblerFormat(bytes) {
  if (bytes.length < 1570) return false;
  if (bytes[0] !== 96 || bytes[1] !== 0 || bytes[4] !== 96 || bytes[5] !== 0 || bytes[8] !== 96 || bytes[9] !== 0 || bytes[12] !== 72 || bytes[13] !== 231) return false;
  const searchBuf = bytes.length >= 1792 ? bytes.subarray(0, 1792) : bytes;
  return extractOffsets(searchBuf) !== null;
}
function parseMusicAssemblerFile(bytes, filename) {
  try {
    return parseMusicAssembler(bytes, filename);
  } catch {
    return null;
  }
}
function loadPositionList(bytes, off) {
  const list = [];
  for (; ; ) {
    if (off + 2 > bytes.length) return null;
    const trackNumber = bytes[off++];
    const rawByte = bytes[off++];
    const val = rawByte << 4 & 65535;
    const transpose = val >> 8 & 255;
    const repeatRaw = (val & 255) >> 1;
    const repeatCounter = s8v(repeatRaw);
    list.push({ trackNumber, transpose, repeatCounter });
    if (trackNumber === 255 || trackNumber === 254) break;
  }
  return list;
}
function loadSingleTrack(bytes, off) {
  const trackBytes = [];
  for (; ; ) {
    if (off >= bytes.length) return null;
    let byt = bytes[off++];
    trackBytes.push(byt);
    if ((byt & 128) !== 0) {
      if ((byt & 64) !== 0) {
        if (off >= bytes.length) return null;
        byt = bytes[off++];
        trackBytes.push(byt);
        if (off >= bytes.length) return null;
        byt = bytes[off++];
        trackBytes.push(byt);
        if ((byt & 128) !== 0) {
          if (off >= bytes.length) return null;
          byt = bytes[off++];
          trackBytes.push(byt);
        }
      }
    } else {
      if (off >= bytes.length) return null;
      byt = bytes[off++];
      trackBytes.push(byt);
      if ((byt & 128) !== 0) {
        if (off >= bytes.length) return null;
        byt = bytes[off++];
        trackBytes.push(byt);
      }
    }
    if (off >= bytes.length) return null;
    const nextByte = bytes[off];
    if (nextByte === 255) {
      trackBytes.push(nextByte);
      off++;
      break;
    }
  }
  return new Uint8Array(trackBytes);
}
function decodeTrack(track) {
  const rows = [];
  let off = 0;
  while (off < track.length) {
    const b0 = track[off++];
    if (b0 === 255) break;
    let note = 0;
    let instrument = -1;
    let release = false;
    let lastByte = b0;
    if ((b0 & 128) === 0) {
      note = b0 & 63;
      if (off >= track.length) break;
      const b1 = track[off++];
      lastByte = b1;
      if ((b1 & 128) !== 0) {
        lastByte = b1 & 127;
        if (off >= track.length) break;
        off++;
      }
    } else if ((b0 & 64) === 0) {
      release = true;
      lastByte = b0 & 63;
    } else {
      instrument = b0 & 63;
      if (off >= track.length) break;
      const b1 = track[off++];
      note = b1 & 63;
      if (off >= track.length) break;
      const b2 = track[off++];
      lastByte = b2;
      if ((b2 & 128) !== 0) {
        lastByte = b2 & 127;
        if (off >= track.length) break;
        off++;
      }
    }
    rows.push({ note, instrument, release, delay: lastByte << 24 >> 24 });
  }
  return rows;
}
function parseMusicAssembler(bytes, filename) {
  if (!isMusicAssemblerFormat(bytes)) return null;
  const searchBuf = bytes.length >= 1792 ? bytes.subarray(0, 1792) : bytes;
  const offsets = extractOffsets(searchBuf);
  if (!offsets) return null;
  const {
    subSongCount,
    subSongSpeedOffset,
    subSongPositionListOffset,
    moduleStartOffset,
    instrumentInfoOffsetOffset,
    sampleInfoOffsetOffset,
    tracksOffsetOffset
  } = offsets;
  if (subSongCount <= 0 || subSongCount > 256) return null;
  if (subSongSpeedOffset + subSongCount > bytes.length) return null;
  const speedList = bytes.subarray(subSongSpeedOffset, subSongSpeedOffset + subSongCount);
  const posListTableOff = subSongPositionListOffset;
  if (posListTableOff + subSongCount * 4 * 2 > bytes.length) return null;
  const subSongs = [];
  for (let i = 0; i < subSongCount; i++) {
    const base = posListTableOff + i * 8;
    const pl0 = u16BE(bytes, base + 0);
    const pl1 = u16BE(bytes, base + 2);
    const pl2 = u16BE(bytes, base + 4);
    const pl3 = u16BE(bytes, base + 6);
    if (pl0 + 2 === pl1 && pl1 + 2 === pl2 && pl2 + 2 === pl3) continue;
    subSongs.push({
      startSpeed: speedList[i] || 6,
      positionListOffsets: [pl0, pl1, pl2, pl3]
    });
  }
  if (subSongs.length === 0) return null;
  const positionListCache = /* @__PURE__ */ new Map();
  for (const song of subSongs) {
    for (const plOff of song.positionListOffsets) {
      if (positionListCache.has(plOff)) continue;
      const absOff = moduleStartOffset + plOff;
      if (absOff >= bytes.length) continue;
      const pl = loadPositionList(bytes, absOff);
      if (pl) positionListCache.set(plOff, pl);
    }
  }
  let maxTrackNumber = 0;
  for (const pl of positionListCache.values()) {
    for (const entry of pl) {
      if (entry.trackNumber !== 255 && entry.trackNumber !== 254) {
        if (entry.trackNumber > maxTrackNumber) maxTrackNumber = entry.trackNumber;
      }
    }
  }
  const numberOfTracks = maxTrackNumber + 1;
  if (tracksOffsetOffset + 4 > bytes.length) return null;
  const tracksRelOffset = s32BE(bytes, tracksOffsetOffset);
  const tracksStartOffset = tracksRelOffset + moduleStartOffset;
  if (moduleStartOffset + numberOfTracks * 2 > bytes.length) return null;
  const trackOffsetTable = [];
  for (let i = 0; i < numberOfTracks; i++) {
    trackOffsetTable.push(u16BE(bytes, moduleStartOffset + i * 2));
  }
  const tracks = new Array(numberOfTracks).fill(null);
  for (let i = 0; i < numberOfTracks; i++) {
    const trackOff = tracksStartOffset + trackOffsetTable[i];
    if (trackOff < 0 || trackOff >= bytes.length) continue;
    tracks[i] = loadSingleTrack(bytes, trackOff);
  }
  const decodedTracks = tracks.map((t) => t ? decodeTrack(t) : []);
  if (instrumentInfoOffsetOffset + 4 > bytes.length) return null;
  const instrStartRel = s32BE(bytes, instrumentInfoOffsetOffset);
  if (sampleInfoOffsetOffset + 4 > bytes.length) return null;
  const sampleStartRel = s32BE(bytes, sampleInfoOffsetOffset);
  const numberOfInstruments = (sampleStartRel - instrStartRel) / 16;
  if (numberOfInstruments < 0 || numberOfInstruments > 256) return null;
  const instrAbsOff = moduleStartOffset + instrStartRel;
  if (instrAbsOff + numberOfInstruments * 16 > bytes.length) return null;
  const instruments = [];
  for (let i = 0; i < numberOfInstruments; i++) {
    const base = instrAbsOff + i * 16;
    instruments.push({
      sampleNumber: bytes[base + 0],
      attack: bytes[base + 1],
      decaySustain: bytes[base + 2],
      vibratoDelay: bytes[base + 3],
      release: bytes[base + 4],
      vibratoSpeed: bytes[base + 5],
      vibratoLevel: bytes[base + 6],
      arpeggio: bytes[base + 7],
      fxArpSpdLp: bytes[base + 8],
      hold: bytes[base + 9],
      keyWaveRate: bytes[base + 10],
      waveLevelSpeed: bytes[base + 11]
      // bytes[base+12..15] = padding (4 bytes)
    });
  }
  const sampleAbsOff = moduleStartOffset + sampleStartRel;
  let minPosListOffset = Infinity;
  for (const k of positionListCache.keys()) {
    if (k < minPosListOffset) minPosListOffset = k;
  }
  if (!isFinite(minPosListOffset)) return null;
  const numberOfSamples = Math.floor((minPosListOffset + moduleStartOffset - sampleAbsOff) / 24);
  if (numberOfSamples < 0 || numberOfSamples > 256) return null;
  if (sampleAbsOff + numberOfSamples * 24 > bytes.length) return null;
  const sampleInfos = [];
  for (let i = 0; i < numberOfSamples; i++) {
    const base = sampleAbsOff + i * 24;
    const relOff = s32BE(bytes, base + 0);
    const lengthW = u16BE(bytes, base + 4);
    const loopW = u16BE(bytes, base + 6);
    const name = readString(bytes, base + 8, 16);
    const dataOff = relOff < 0 ? -1 : sampleAbsOff + relOff;
    sampleInfos.push({
      name,
      dataOffset: dataOff,
      lengthWords: lengthW,
      loopLengthWords: loopW
    });
  }
  const instrumentConfigs = [];
  for (let i = 0; i < numberOfInstruments; i++) {
    const instr = instruments[i];
    const instrId = i + 1;
    const sIdx = instr.sampleNumber;
    if (sIdx >= numberOfSamples || sampleInfos[sIdx].dataOffset < 0) {
      instrumentConfigs.push({
        id: instrId,
        name: `Instrument ${instrId}`,
        type: "synth",
        synthType: "Synth",
        effects: [],
        volume: 0,
        pan: 0,
        oscillator: { type: "sawtooth", detune: 0, octave: 0 }
      });
      continue;
    }
    const si = sampleInfos[sIdx];
    if (si.lengthWords > 1 && si.lengthWords <= 128) {
      instrumentConfigs.push({
        id: instrId,
        name: si.name || `Instrument ${instrId}`,
        type: "synth",
        synthType: "Synth",
        effects: [],
        volume: 0,
        pan: 0,
        oscillator: { type: "sawtooth", detune: 0, octave: 0 }
      });
    } else if (si.lengthWords > 128) {
      const lengthBytes = si.lengthWords * 2;
      const dataOff = si.dataOffset;
      if (dataOff + lengthBytes > bytes.length) {
        instrumentConfigs.push({
          id: instrId,
          name: si.name || `Instrument ${instrId}`,
          type: "synth",
          synthType: "Synth",
          effects: [],
          volume: 0,
          pan: 0,
          oscillator: { type: "sawtooth", detune: 0, octave: 0 }
        });
        continue;
      }
      const pcm = bytes.slice(dataOff, dataOff + lengthBytes);
      let loopStart = 0;
      let loopEnd = 0;
      if (si.loopLengthWords !== 0) {
        loopStart = (si.lengthWords - si.loopLengthWords) * 2;
        loopEnd = loopStart + si.loopLengthWords * 2;
      }
      instrumentConfigs.push(
        createSamplerInstrument(instrId, si.name || `Sample ${sIdx}`, pcm, 64, PCM_BASE_RATE, loopStart, loopEnd)
      );
    } else {
      instrumentConfigs.push({
        id: instrId,
        name: si.name || `Instrument ${instrId}`,
        type: "synth",
        synthType: "Synth",
        effects: [],
        volume: 0,
        pan: 0,
        oscillator: { type: "sawtooth", detune: 0, octave: 0 }
      });
    }
  }
  const primarySong = subSongs[0];
  if (!primarySong) return null;
  const CHANNEL_PAN = [-50, 50, 50, -50];
  const voicePosLists = [];
  for (let v = 0; v < 4; v++) {
    const plOff = primarySong.positionListOffsets[CHANNEL_MAP[v]];
    const pl = positionListCache.get(plOff);
    voicePosLists.push(pl ?? []);
  }
  const voicePositionCounts = voicePosLists.map(
    (pl) => pl.filter((e) => e.trackNumber !== 255 && e.trackNumber !== 254).length
  );
  const maxPositions = Math.max(...voicePositionCounts, 0);
  function trackRowCount(trackIdx) {
    if (trackIdx >= decodedTracks.length) return 16;
    return Math.max(decodedTracks[trackIdx].length, 1);
  }
  const patterns = [];
  const songPositions = [];
  for (let posIdx = 0; posIdx < maxPositions; posIdx++) {
    let patternLen = 16;
    for (let v = 0; v < 4; v++) {
      const pl = voicePosLists[v];
      if (posIdx < pl.length) {
        const entry = pl[posIdx];
        const trackIdx = entry.trackNumber;
        if (trackIdx !== 255 && trackIdx !== 254) {
          const rowCount = trackRowCount(trackIdx);
          if (rowCount > patternLen) patternLen = rowCount;
        }
      }
    }
    const cells = Array.from(
      { length: patternLen },
      () => Array.from({ length: 4 }, () => ({
        note: 0,
        instrument: 0,
        volume: 0,
        effTyp: 0,
        eff: 0,
        effTyp2: 0,
        eff2: 0
      }))
    );
    for (let v = 0; v < 4; v++) {
      const pl = voicePosLists[v];
      if (posIdx >= pl.length) continue;
      const entry = pl[posIdx];
      if (entry.trackNumber === 255 || entry.trackNumber === 254) continue;
      const trackIdx = entry.trackNumber;
      if (trackIdx >= decodedTracks.length) continue;
      const trackRows = decodedTracks[trackIdx];
      const transpose = entry.transpose;
      let lastInstrument = 0;
      for (let row = 0; row < Math.min(trackRows.length, patternLen); row++) {
        const tr = trackRows[row];
        if (tr.instrument >= 0) {
          lastInstrument = tr.instrument + 1;
        }
        let xmNote = 0;
        if (tr.release) {
          xmNote = 97;
        } else if (tr.note !== 0) {
          const rawNote = tr.note + transpose;
          const clamped = Math.max(1, Math.min(MA_PERIODS.length - 1, rawNote));
          xmNote = maNoteToXM(clamped);
        }
        cells[row][v] = {
          note: xmNote,
          instrument: xmNote !== 0 || tr.release ? lastInstrument : 0,
          volume: 0,
          effTyp: 0,
          eff: 0,
          effTyp2: 0,
          eff2: 0
        };
      }
    }
    const patIdx = patterns.length;
    patterns.push({
      id: `pattern-${patIdx}`,
      name: `Pattern ${patIdx}`,
      length: patternLen,
      channels: Array.from({ length: 4 }, (_, chIdx) => ({
        id: `channel-${chIdx}`,
        name: `Channel ${chIdx + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: CHANNEL_PAN[chIdx],
        instrumentId: null,
        color: null,
        rows: cells.map((row) => row[chIdx])
      })),
      importMetadata: {
        sourceFormat: "MusicAssembler",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: 4,
        originalPatternCount: maxPositions,
        originalInstrumentCount: numberOfInstruments
      }
    });
    songPositions.push(patIdx);
  }
  if (patterns.length === 0) return null;
  const baseName = filename.replace(/\.[^/.]+$/, "");
  const filePatternAddrs = [];
  const filePatternSizes = [];
  for (let i = 0; i < numberOfTracks; i++) {
    const trackOff = tracksStartOffset + trackOffsetTable[i];
    filePatternAddrs.push(trackOff >= 0 ? trackOff : 0);
    filePatternSizes.push(tracks[i] ? tracks[i].length : 0);
  }
  const trackMap = [];
  for (let posIdx = 0; posIdx < maxPositions; posIdx++) {
    const chMap = [];
    for (let v = 0; v < 4; v++) {
      const pl = voicePosLists[v];
      if (posIdx < pl.length) {
        const entry = pl[posIdx];
        if (entry.trackNumber !== 255 && entry.trackNumber !== 254 && entry.trackNumber < numberOfTracks) {
          chMap.push(entry.trackNumber);
        } else {
          chMap.push(-1);
        }
      } else {
        chMap.push(-1);
      }
    }
    trackMap.push(chMap);
  }
  const uadeVariableLayout = {
    formatId: "musicAssembler",
    numChannels: 4,
    numFilePatterns: numberOfTracks,
    rowsPerPattern: decodedTracks.map((t) => Math.max(t.length, 1)),
    moduleSize: bytes.length,
    encoder: musicAssemblerEncoder,
    filePatternAddrs,
    filePatternSizes,
    trackMap
  };
  return {
    name: baseName,
    format: "XM",
    patterns,
    instruments: instrumentConfigs,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: primarySong.startSpeed || 6,
    initialBPM: 125,
    maFileData: new Uint8Array(bytes).buffer.slice(0),
    uadeVariableLayout
  };
}
export {
  isMusicAssemblerFormat,
  parseMusicAssemblerFile
};
