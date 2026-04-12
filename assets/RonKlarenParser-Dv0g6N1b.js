import { b$ as registerPatternEncoder, c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const XM_REFERENCE_NOTE$1 = 13;
const RK_REFERENCE_IDX$1 = 36;
const RK_PERIODS_LEN = 70;
function encodeRonKlarenCell(cell) {
  const out = new Uint8Array(2);
  const xmNote = cell.note ?? 0;
  if (xmNote > 0 && xmNote <= 96) {
    let noteIdx = xmNote - XM_REFERENCE_NOTE$1 + RK_REFERENCE_IDX$1;
    noteIdx = Math.max(0, Math.min(RK_PERIODS_LEN - 1, noteIdx));
    out[0] = noteIdx;
    out[1] = 1;
  } else {
    out[0] = 0;
    out[1] = 0;
  }
  return out;
}
registerPatternEncoder("ronKlaren", () => encodeRonKlarenCell);
const AMIGA_HUNK_MAGIC = 1011;
const AMIGA_HUNK_SIZE = 32;
const HEADER_SIZE = 32;
const MIN_FILE_SIZE = 2624;
const SIGNATURE = "RON_KLAREN_SOUNDMODULE!";
const SIGNATURE_OFFSET = 40;
const PAL_CLOCK = 3546895;
const RK_PERIODS = [
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
const RK_REFERENCE_IDX = 36;
const XM_REFERENCE_NOTE = 13;
function u16BE(b, off) {
  return b[off] << 8 | b[off + 1];
}
function u32BE(b, off) {
  return (b[off] << 24 | b[off + 1] << 16 | b[off + 2] << 8 | b[off + 3]) >>> 0;
}
function s32BE(b, off) {
  const v = u32BE(b, off);
  return v >= 2147483648 ? v - 4294967296 : v;
}
function s16BE(b, off) {
  const v = u16BE(b, off);
  return v >= 32768 ? v - 65536 : v;
}
function s8(v) {
  return v < 128 ? v : v - 256;
}
function periodToRate(period) {
  return Math.round(PAL_CLOCK / (2 * period));
}
function rkNoteToXM(noteIdx) {
  if (noteIdx < 0 || noteIdx >= RK_PERIODS.length) return 0;
  const xm = XM_REFERENCE_NOTE + (noteIdx - RK_REFERENCE_IDX);
  return Math.max(1, Math.min(96, xm));
}
function isRonKlarenFormat(bytes) {
  if (bytes.length < MIN_FILE_SIZE) return false;
  const magic = u32BE(bytes, 0);
  if (magic !== AMIGA_HUNK_MAGIC) return false;
  let sig = "";
  for (let i = 0; i < SIGNATURE.length; i++) {
    sig += String.fromCharCode(bytes[SIGNATURE_OFFSET + i]);
  }
  return sig === SIGNATURE;
}
function scanModuleCode(bytes) {
  const fileLen = bytes.length;
  const searchLen = Math.min(MIN_FILE_SIZE, fileLen - AMIGA_HUNK_SIZE);
  if (searchLen < 64) return null;
  const buf = bytes.subarray(AMIGA_HUNK_SIZE, AMIGA_HUNK_SIZE + searchLen);
  const bufLen = buf.length;
  let index = HEADER_SIZE - AMIGA_HUNK_SIZE;
  index = 0;
  while (index + 6 <= bufLen && buf[index] === 78 && buf[index + 1] === 249) {
    index += 6;
  }
  if (index >= bufLen - 6) return null;
  let numberOfSubSongs = 0;
  while (index + 8 <= bufLen && buf[index] === 48 && buf[index + 1] === 60) {
    numberOfSubSongs++;
    index += 8;
  }
  if (numberOfSubSongs === 0) return null;
  index = 0;
  let ciaLoValue = 0, ciaHiValue = 0;
  let irqOffset = 0;
  let initOffset = 0;
  let foundInit = false;
  for (let i = 0; i < 2 && !foundInit; i++) {
    if (index + 6 > bufLen || buf[index] !== 78 || buf[index + 1] !== 249) break;
    const dest = buf[index + 2] << 24 | buf[index + 3] << 16 | buf[index + 4] << 8 | buf[index + 5];
    if (dest < 0 || dest >= bufLen) {
      index += 6;
      continue;
    }
    if (buf[dest] === 97 && buf[dest + 1] === 0 || buf[dest] === 51 && buf[dest + 1] === 252) {
      initOffset = dest;
      foundInit = true;
    }
    index += 6;
  }
  if (!foundInit) {
    index = 6;
    if (index + 6 <= bufLen && buf[index] === 78 && buf[index + 1] === 249) {
      const playOffset = buf[index + 2] << 24 | buf[index + 3] << 16 | buf[index + 4] << 8 | buf[index + 5];
      if (playOffset >= 0 && playOffset < bufLen && buf[playOffset] === 65 && buf[playOffset + 1] === 250) {
        irqOffset = playOffset;
        ciaLoValue = 14187 & 255;
        ciaHiValue = 14187 >> 8 & 255;
      }
    }
  } else {
    let idx2 = initOffset;
    while (idx2 + 10 <= bufLen && !(buf[idx2] === 78 && buf[idx2 + 1] === 117)) {
      if (buf[idx2] === 19 && buf[idx2 + 1] === 252) {
        const value = buf[idx2 + 3];
        const adr = buf[idx2 + 4] << 24 | buf[idx2 + 5] << 16 | buf[idx2 + 6] << 8 | buf[idx2 + 7];
        idx2 += 6;
        if (adr >>> 0 === 12571648) ciaLoValue = value;
        else if (adr >>> 0 === 12571904) ciaHiValue = value;
      } else if (buf[idx2] === 35 && buf[idx2 + 1] === 252) {
        const srcAdr = buf[idx2 + 2] << 24 | buf[idx2 + 3] << 16 | buf[idx2 + 4] << 8 | buf[idx2 + 5];
        const destAdr = buf[idx2 + 6] << 24 | buf[idx2 + 7] << 16 | buf[idx2 + 8] << 8 | buf[idx2 + 9];
        idx2 += 8;
        if (destAdr >>> 0 === 120) irqOffset = srcAdr;
      }
      idx2 += 2;
    }
  }
  const ciaValue = ciaHiValue << 8 | ciaLoValue;
  index = irqOffset >= 0 && irqOffset < bufLen ? irqOffset : 0;
  while (index + 2 <= bufLen && !(buf[index] === 65 && buf[index + 1] === 250)) {
    index += 2;
  }
  if (index + 4 > bufLen) return null;
  let globalOffset = (buf[index + 2] << 8 | buf[index + 3]) + index + 2;
  const globalOffsetAbs = globalOffset + AMIGA_HUNK_SIZE;
  index += 4;
  if (globalOffsetAbs >= fileLen) return null;
  let subSongInfoOffset = 0;
  while (index + 12 <= bufLen) {
    if (buf[index] === 78 && (buf[index + 1] === 115 || buf[index + 1] === 117)) break;
    if (buf[index] === 2 && buf[index + 1] === 64 && buf[index + 2] === 0 && buf[index + 3] === 15 && buf[index + 4] === 83 && buf[index + 5] === 64 && buf[index + 6] === 233 && buf[index + 7] === 72 && buf[index + 8] === 71 && buf[index + 9] === 240) {
      subSongInfoOffset = globalOffset + (buf[index + 10] << 8 | buf[index + 11]) + AMIGA_HUNK_SIZE;
      break;
    }
    index += 2;
  }
  if (subSongInfoOffset === 0 || subSongInfoOffset >= fileLen) {
    subSongInfoOffset = 64 + AMIGA_HUNK_SIZE;
  }
  let instrumentOffset = 0, arpeggioOffset = 0;
  for (let i = 0; i + 4 <= bufLen; i += 2) {
    if (buf[i] === 12 && buf[i + 1] === 18 && buf[i + 2] === 0) {
      if (buf[i + 3] === 130) {
        for (let j = i; j + 4 <= bufLen; j += 2) {
          if (buf[j] === 73 && buf[j + 1] === 250) {
            instrumentOffset = (buf[j + 2] << 8 | buf[j + 3]) + j + 2 + AMIGA_HUNK_SIZE;
            break;
          }
        }
      }
      if (buf[i + 3] === 128) {
        for (let j = i; j + 4 <= bufLen; j += 2) {
          if (buf[j] === 73 && buf[j + 1] === 250) {
            arpeggioOffset = (buf[j + 2] << 8 | buf[j + 3]) + j + 2 + AMIGA_HUNK_SIZE;
            break;
          }
        }
      }
    }
    if (instrumentOffset !== 0 && arpeggioOffset !== 0) break;
  }
  if (instrumentOffset === 0 || arpeggioOffset === 0) return null;
  if (instrumentOffset >= fileLen || arpeggioOffset >= fileLen) return null;
  let clearAdsrStateOnPortamento = false;
  for (let i = 0; i + 10 <= bufLen; i += 2) {
    if (buf[i] === 12 && buf[i + 1] === 18 && buf[i + 2] === 0 && buf[i + 3] === 129) {
      if (i + 10 <= bufLen && buf[i + 8] === 66 && buf[i + 9] === 104) {
        clearAdsrStateOnPortamento = true;
        break;
      }
    }
  }
  return {
    numberOfSubSongs,
    ciaValue,
    subSongInfoOffset,
    instrumentOffset,
    arpeggioOffset,
    clearAdsrStateOnPortamento
  };
}
function parseRonKlarenFile(bytes, filename) {
  if (!isRonKlarenFormat(bytes)) return null;
  try {
    return parseInternal(bytes, filename);
  } catch (e) {
    console.warn("[RonKlarenParser] Parse failed:", e);
    return null;
  }
}
function parseInternal(bytes, filename) {
  const fileLen = bytes.length;
  const scan = scanModuleCode(bytes);
  if (!scan) return null;
  const {
    numberOfSubSongs,
    ciaValue,
    subSongInfoOffset,
    instrumentOffset,
    arpeggioOffset
  } = scan;
  const subSongTrackOffsets = [];
  for (let i = 0; i < numberOfSubSongs; i++) {
    const base = subSongInfoOffset + i * 16;
    if (base + 16 > fileLen) {
      break;
    }
    const offsets = [];
    for (let j = 0; j < 4; j++) {
      const trackListOffset = u32BE(bytes, base + j * 4) + AMIGA_HUNK_SIZE;
      if (trackListOffset >= fileLen) {
        break;
      }
      offsets.push(trackListOffset);
    }
    if (offsets.length < 4) break;
    subSongTrackOffsets.push(offsets);
  }
  if (subSongTrackOffsets.length === 0) return null;
  const subSongs = [];
  function loadTrackListClean(offset) {
    const tracks = [];
    let off = offset;
    for (; ; ) {
      if (off + 4 > fileLen) return null;
      const rawTrackOffset = s32BE(bytes, off);
      if (rawTrackOffset < 0) break;
      if (off + 12 > fileLen) return null;
      const transpose = s16BE(bytes, off + 6);
      const repeatTimes = u16BE(bytes, off + 10);
      const trackAbsOffset = rawTrackOffset + AMIGA_HUNK_SIZE;
      if (trackAbsOffset >= 0 && trackAbsOffset < fileLen) {
        tracks.push({ trackNumber: trackAbsOffset, transpose, repeatTimes });
      }
      off += 12;
    }
    return tracks.length > 0 ? tracks : null;
  }
  for (let i = 0; i < subSongTrackOffsets.length; i++) {
    const positions = [];
    let valid = true;
    for (let ch = 0; ch < 4; ch++) {
      const trackList = loadTrackListClean(subSongTrackOffsets[i][ch]);
      if (!trackList) {
        valid = false;
        break;
      }
      positions.push(trackList);
    }
    if (valid) subSongs.push({ positions });
  }
  if (subSongs.length === 0) return null;
  const trackOffsetToIndex = /* @__PURE__ */ new Map();
  const trackDataArrays = [];
  const trackFileStarts = [];
  function getOrLoadTrack(absOffset) {
    if (trackOffsetToIndex.has(absOffset)) return trackOffsetToIndex.get(absOffset);
    const idx = trackDataArrays.length;
    trackOffsetToIndex.set(absOffset, idx);
    trackFileStarts.push(absOffset);
    const data = [];
    let off = absOffset;
    while (off < fileLen) {
      const cmd = bytes[off];
      data.push(cmd);
      off++;
      if (cmd === 255) break;
      if (cmd < 128) {
        if (off < fileLen) data.push(bytes[off++]);
      } else if (cmd === 128) {
        if (off < fileLen) data.push(bytes[off++]);
      } else if (cmd === 129) {
        for (let i = 0; i < 3 && off < fileLen; i++) data.push(bytes[off++]);
      } else if (cmd === 130) {
        if (off < fileLen) data.push(bytes[off++]);
      } else if (cmd === 131 || cmd === 133) ;
      else if (cmd === 132) {
        if (off < fileLen) data.push(bytes[off++]);
      }
      if (cmd === 131 || cmd === 133) break;
    }
    trackDataArrays.push(new Uint8Array(data));
    return idx;
  }
  for (const songInfo of subSongs) {
    for (const posList of songInfo.positions) {
      for (const track of posList) {
        const idx = getOrLoadTrack(track.trackNumber);
        track.trackNumber = idx;
      }
    }
  }
  let maxInstrument = 0, maxArpeggio = 0;
  for (const td of trackDataArrays) {
    for (let i = 0; i < td.length; i++) {
      const cmd = td[i];
      if (cmd === 130 && i + 1 < td.length) {
        maxInstrument = Math.max(maxInstrument, td[i + 1] + 1);
        i++;
      } else if (cmd === 128 && i + 1 < td.length) {
        maxArpeggio = Math.max(maxArpeggio, td[i + 1] + 1);
        i++;
      } else if (cmd < 128) {
        i++;
      } else if (cmd === 129) {
        i += 3;
      } else if (cmd === 132) {
        i++;
      }
    }
  }
  for (let i = 0; i < maxArpeggio; i++) {
    const base = arpeggioOffset + i * 12;
    if (base + 12 > fileLen) break;
    const arr = new Int8Array(12);
    for (let j = 0; j < 12; j++) arr[j] = s8(bytes[base + j]);
  }
  const instruments = [];
  for (let i = 0; i < maxInstrument; i++) {
    const base = instrumentOffset + i * 32;
    if (base + 32 > fileLen) break;
    const rawSampleOffset = s32BE(bytes, base);
    const rawVibratoOffset = s32BE(bytes, base + 4);
    const typeVal = bytes[base + 8];
    const phaseSpeed = bytes[base + 9];
    const phaseLengthInWords = bytes[base + 10];
    const vibratoSpeed = bytes[base + 11];
    const vibratoDepth = bytes[base + 12];
    const vibratoDelay = bytes[base + 13];
    const adsr = [];
    for (let j = 0; j < 4; j++) {
      adsr.push({ point: bytes[base + 14 + j], increment: bytes[base + 18 + j] });
    }
    const phaseValue = s8(bytes[base + 22]);
    const phaseDirectionRaw = s8(bytes[base + 23]);
    const phaseDirection = phaseDirectionRaw < 0;
    const phasePosition = bytes[base + 24];
    const sampleAbsOffset = rawSampleOffset + AMIGA_HUNK_SIZE;
    const vibratoAbsOffset = rawVibratoOffset + AMIGA_HUNK_SIZE;
    instruments.push({
      sampleOffset: sampleAbsOffset,
      vibratoOffset: vibratoSpeed > 0 ? vibratoAbsOffset : -1,
      isSample: typeVal !== 0,
      phaseSpeed,
      phaseLengthInWords,
      vibratoSpeed,
      vibratoDepth,
      vibratoDelay,
      adsr,
      phaseValue,
      phaseDirection,
      phasePosition,
      sampleNumber: -1,
      vibratoNumber: -1
    });
  }
  const sampleOffsetToIndex = /* @__PURE__ */ new Map();
  const loadedSamples = [];
  const sampleDataMap = /* @__PURE__ */ new Map();
  for (const instr of instruments) {
    const soff = instr.sampleOffset;
    if (soff < 0 || soff + 8 > fileLen) continue;
    if (!sampleOffsetToIndex.has(soff)) {
      const sampleDataRaw = s32BE(bytes, soff);
      const lengthInWords = u16BE(bytes, soff + 4);
      const phaseIndex = u16BE(bytes, soff + 6);
      const sampleDataAbs = sampleDataRaw + AMIGA_HUNK_SIZE;
      const idx = loadedSamples.length;
      sampleOffsetToIndex.set(soff, idx);
      loadedSamples.push({ sampleDataOffset: sampleDataAbs, lengthInWords, phaseIndex });
      if (!sampleDataMap.has(sampleDataAbs) && sampleDataAbs >= 0 && sampleDataAbs + lengthInWords * 2 <= fileLen) {
        const byteLen = lengthInWords * 2;
        const pcm = new Int8Array(byteLen);
        for (let j = 0; j < byteLen; j++) pcm[j] = s8(bytes[sampleDataAbs + j]);
        sampleDataMap.set(sampleDataAbs, pcm);
      }
    }
    instr.sampleNumber = sampleOffsetToIndex.get(soff) ?? -1;
  }
  function buildRonKlarenConfig(instr, pcm) {
    const cfg = {
      isSample: instr.isSample,
      phaseSpeed: instr.phaseSpeed,
      phaseLengthInWords: instr.phaseLengthInWords,
      vibratoSpeed: instr.vibratoSpeed,
      vibratoDepth: instr.vibratoDepth,
      vibratoDelay: instr.vibratoDelay,
      adsr: instr.adsr.map((e) => ({ point: e.point, increment: e.increment })),
      phaseValue: instr.phaseValue,
      phaseDirection: instr.phaseDirection,
      phasePosition: instr.phasePosition
    };
    if (pcm && pcm.length > 0) {
      cfg.waveformData = Array.from(pcm);
    }
    return cfg;
  }
  const instrumentConfigs = [];
  for (let i = 0; i < instruments.length; i++) {
    const instr = instruments[i];
    const id = i + 1;
    if (instr.sampleNumber < 0 || instr.sampleNumber >= loadedSamples.length) {
      const rkConfig = buildRonKlarenConfig(instr, void 0);
      instrumentConfigs.push({
        id,
        name: `Instrument ${i + 1}`,
        type: "synth",
        synthType: "RonKlarenSynth",
        ronKlaren: rkConfig,
        effects: [],
        volume: 0,
        pan: 0
      });
      continue;
    }
    const sample = loadedSamples[instr.sampleNumber];
    const pcm = sampleDataMap.get(sample.sampleDataOffset);
    if (pcm && sample.lengthInWords > 0) {
      const pcmBytes = new Uint8Array(pcm.buffer);
      const period = RK_PERIODS[RK_REFERENCE_IDX];
      const sampleRate = periodToRate(period);
      const loopStart = instr.isSample ? 0 : 0;
      const loopEnd = !instr.isSample && pcmBytes.length > 0 ? pcmBytes.length : 0;
      const samplerInstr = createSamplerInstrument(id, instr.isSample ? `Sample ${i + 1}` : `Synth ${i + 1}`, pcmBytes, 64, sampleRate, loopStart, loopEnd);
      const rkConfig = buildRonKlarenConfig(instr, pcm);
      samplerInstr.ronKlaren = rkConfig;
      samplerInstr.synthType = "RonKlarenSynth";
      instrumentConfigs.push(samplerInstr);
    } else {
      const rkConfig = buildRonKlarenConfig(instr, void 0);
      instrumentConfigs.push({
        id,
        name: `Instrument ${i + 1}`,
        type: "synth",
        synthType: "RonKlarenSynth",
        ronKlaren: rkConfig,
        effects: [],
        volume: 0,
        pan: 0
      });
    }
  }
  if (instrumentConfigs.length === 0 || instrumentConfigs[0].id !== 1) {
    instrumentConfigs.unshift({
      id: 0,
      name: "Empty",
      type: "synth",
      synthType: "RonKlarenSynth",
      effects: [],
      volume: 0,
      pan: 0
    });
  }
  function decodeTrackToRows(data, numRows, transpose) {
    const rows = [];
    const notePositions = [];
    let pos = 0;
    let currentInstr = 0;
    let pendingRows = 0;
    function emitRow(noteIdx, instrId, dataPos) {
      rows.push({ noteIdx, instrNum: instrId });
      notePositions.push(dataPos);
    }
    while (pos < data.length && rows.length < numRows) {
      if (pendingRows > 0) {
        emitRow(0, 0, -1);
        pendingRows--;
        continue;
      }
      const cmdPos = pos;
      const cmd = data[pos++];
      if (cmd === 255) {
        break;
      }
      if (cmd === 128) {
        if (pos < data.length) pos++;
        continue;
      }
      if (cmd === 129) {
        if (pos + 2 < data.length) {
          const endNote = data[pos];
          data[pos + 1];
          const waitCount = data[pos + 2];
          pos += 3;
          const transposedEnd = Math.min(endNote + transpose, RK_PERIODS.length - 1);
          if (waitCount > 0) {
            emitRow(transposedEnd, currentInstr, cmdPos);
            pendingRows = waitCount * 4 - 2;
            if (pendingRows < 0) pendingRows = 0;
          }
        }
        continue;
      }
      if (cmd === 130) {
        if (pos < data.length) {
          currentInstr = data[pos++];
        }
        continue;
      }
      if (cmd === 131 || cmd === 133) {
        break;
      }
      if (cmd === 132) {
        if (pos < data.length) pos++;
        continue;
      }
      if (cmd < 128) {
        const noteIdx = cmd;
        const waitCount = pos < data.length ? data[pos++] : 0;
        const transposedNote = Math.min(noteIdx + transpose, RK_PERIODS.length - 1);
        const clampedNote = Math.max(0, transposedNote);
        if (waitCount === 0) {
          emitRow(clampedNote, currentInstr, cmdPos);
        } else {
          emitRow(clampedNote, currentInstr, cmdPos);
          pendingRows = waitCount * 4 - 2;
          if (pendingRows < 0) pendingRows = 0;
        }
        continue;
      }
    }
    while (rows.length < numRows) {
      rows.push({ noteIdx: 0, instrNum: 0 });
      notePositions.push(-1);
    }
    return { rows: rows.slice(0, numRows), notePositions: notePositions.slice(0, numRows) };
  }
  const primarySong = subSongs[0];
  const ROWS_PER_TRACK = 64;
  const maxTrackEntries = Math.max(...primarySong.positions.map((p) => p.length));
  const trackerPatterns = [];
  const cellOffsetMap = [];
  for (let posIdx = 0; posIdx < maxTrackEntries; posIdx++) {
    const channelRows = Array.from({ length: 4 }, () => []);
    const patOffsets = Array.from({ length: 4 }, () => []);
    for (let ch = 0; ch < 4; ch++) {
      const posList = primarySong.positions[ch];
      const entry = posIdx < posList.length ? posList[posIdx] : null;
      if (!entry || entry.trackNumber >= trackDataArrays.length) {
        for (let r = 0; r < ROWS_PER_TRACK; r++) {
          channelRows[ch].push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
          patOffsets[ch].push(-1);
        }
        continue;
      }
      const trackData = trackDataArrays[entry.trackNumber];
      const trackStart = trackFileStarts[entry.trackNumber];
      const { rows: decodedRows, notePositions } = decodeTrackToRows(trackData, ROWS_PER_TRACK, entry.transpose);
      for (let ri = 0; ri < decodedRows.length; ri++) {
        const row = decodedRows[ri];
        const xmNoteFixed = row.noteIdx === 0 ? 0 : rkNoteToXM(row.noteIdx);
        const instrId = row.instrNum;
        channelRows[ch].push({
          note: xmNoteFixed,
          instrument: instrId,
          volume: 0,
          effTyp: 0,
          eff: 0,
          effTyp2: 0,
          eff2: 0
        });
        const relPos = notePositions[ri];
        patOffsets[ch].push(relPos >= 0 && trackStart >= 0 ? trackStart + relPos : -1);
      }
    }
    cellOffsetMap.push(patOffsets);
    trackerPatterns.push({
      id: `pattern-${posIdx}`,
      name: `Position ${posIdx}`,
      length: ROWS_PER_TRACK,
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
        sourceFormat: "RK",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: 4,
        originalPatternCount: trackDataArrays.length,
        originalInstrumentCount: instruments.length
      }
    });
  }
  if (trackerPatterns.length === 0) {
    trackerPatterns.push({
      id: "pattern-0",
      name: "Pattern 0",
      length: ROWS_PER_TRACK,
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
        rows: Array.from({ length: ROWS_PER_TRACK }, () => ({
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
        sourceFormat: "RK",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: 4,
        originalPatternCount: 0,
        originalInstrumentCount: 0
      }
    });
  }
  const moduleName = filename.replace(/\.[^/.]+$/, "");
  const bpm = ciaValue > 0 ? Math.round(709379 / ciaValue) : 125;
  const uadePatternLayout = {
    formatId: "ronKlaren",
    patternDataFileOffset: 0,
    // not used directly (getCellFileOffset overrides)
    bytesPerCell: 2,
    // note(1) + waitCount(1)
    rowsPerPattern: ROWS_PER_TRACK,
    numChannels: 4,
    numPatterns: trackerPatterns.length,
    moduleSize: bytes.byteLength,
    encodeCell: encodeRonKlarenCell,
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
    format: "RK",
    patterns: trackerPatterns,
    instruments: instrumentConfigs,
    songPositions: trackerPatterns.map((_, i) => i),
    songLength: trackerPatterns.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: Math.max(32, Math.min(255, bpm)),
    linearPeriods: false,
    uadeEditableFileData: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    uadeEditableFileName: filename,
    uadePatternLayout
  };
}
export {
  isRonKlarenFormat,
  parseRonKlarenFile
};
