import { b$ as registerPatternEncoder, dw as DEFAULT_ROB_HUBBARD } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const MOD_PERIODS = [
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
function xmNoteToPeriod(xmNote) {
  if (xmNote === 0) return 0;
  const periodIdx = xmNote - 37;
  if (periodIdx < 0 || periodIdx >= MOD_PERIODS.length) return 0;
  return MOD_PERIODS[periodIdx];
}
function encodeRobHubbardCell(cell) {
  const out = new Uint8Array(4);
  const period = xmNoteToPeriod(cell.note ?? 0);
  const instr = cell.instrument ?? 0;
  const effTyp = cell.effTyp ?? 0;
  const eff = cell.eff ?? 0;
  out[0] = instr & 240 | period >> 8 & 15;
  out[1] = period & 255;
  out[2] = (instr & 15) << 4 | effTyp & 15;
  out[3] = eff & 255;
  return out;
}
registerPatternEncoder("robHubbard", () => encodeRobHubbardCell);
const MIN_FILE_SIZE = 32;
const MAX_INSTRUMENTS = 13;
const MAX_SAMPLE_LEN = 65536;
function u8(buf, off) {
  if (off < 0 || off >= buf.length) return 0;
  return buf[off] & 255;
}
function s8(buf, off) {
  const v = u8(buf, off);
  return v < 128 ? v : v - 256;
}
function u16BE(buf, off) {
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function i16BE(buf, off) {
  const v = u16BE(buf, off);
  return v >= 32768 ? v - 65536 : v;
}
function isRobHubbardFormat(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (filename !== void 0) {
    const base = (filename.split("/").pop() ?? filename).toLowerCase();
    if (!base.startsWith("rh.") && !base.endsWith(".rh")) return false;
  }
  if (buf.length < MIN_FILE_SIZE) return false;
  if (u16BE(buf, 0) !== 24576) return false;
  if (u16BE(buf, 4) !== 24576) return false;
  if (u16BE(buf, 8) !== 24576) return false;
  if (u16BE(buf, 12) !== 24576) return false;
  if (u16BE(buf, 16) !== 24576) return false;
  if (u16BE(buf, 20) !== 16890) return false;
  if (u32BE(buf, 28) !== 1316307450) return false;
  return true;
}
function findSampleTable(buf) {
  let sampleCount = -1;
  const step1Limit = Math.min(256, buf.length - 2);
  for (let off = 64; off < step1Limit; off += 2) {
    if (u16BE(buf, off) === 9240) {
      if (off - 1 >= 0) {
        sampleCount = buf[off - 1];
      }
      break;
    }
  }
  if (sampleCount < 0) return null;
  let d16Pos = -1;
  const step2Limit = Math.min(128, buf.length - 2);
  for (let off = 40; off < step2Limit; off += 2) {
    if (u16BE(buf, off) === 16890) {
      d16Pos = off + 2;
      break;
    }
  }
  if (d16Pos < 0 || d16Pos + 2 > buf.length) return null;
  const displacement = i16BE(buf, d16Pos);
  let a1 = d16Pos;
  if (d16Pos + 4 <= buf.length && u16BE(buf, d16Pos + 2) === 53756) {
    a1 += 64;
  }
  const tableOffset = a1 + displacement;
  if (tableOffset < 0 || tableOffset >= buf.length) return null;
  return { tableOffset, count: sampleCount + 1 };
}
function parseSampleBlobs(buf, tableOffset, count) {
  const results = [];
  let pos = tableOffset;
  for (let i = 0; i < count; i++) {
    if (pos + 6 > buf.length) break;
    const pcmLen = u32BE(buf, pos);
    if (pcmLen === 0 || pcmLen > MAX_SAMPLE_LEN) break;
    const headerByte4 = buf[pos + 4];
    const sampleVolume = headerByte4 <= 64 ? headerByte4 : 64;
    if (pos + 6 + pcmLen > buf.length) break;
    const pcmSlice = buf.slice(pos + 6, pos + 6 + pcmLen);
    const sampleData = new Array(pcmLen);
    for (let j = 0; j < pcmLen; j++) {
      const byte = pcmSlice[j];
      sampleData[j] = byte >= 128 ? byte - 256 : byte;
    }
    const config = {
      sampleLen: pcmLen,
      loopOffset: -1,
      // no loop — loop info is encoded in 68k code
      sampleVolume: sampleVolume || 64,
      relative: 1024,
      // identity: period = PERIODS[note] * 1024 >> 10 = PERIODS[note]
      divider: 0,
      // no vibrato — divider stored in 68k code, not extractable
      vibratoIdx: 0,
      hiPos: 0,
      // no wobble
      loPos: 0,
      vibTable: [],
      sampleData
    };
    results.push({ config, blobOffset: pos, blobSize: pcmLen + 6 });
    pos += pcmLen + 6;
  }
  return results;
}
function rhNoteToTrackerNote(idx) {
  const n = idx + 25;
  return n >= 1 && n <= 96 ? n : 0;
}
function findRHSongs(buf) {
  let songsHeaders = 0;
  let samplesData = 0;
  let pos = 44;
  while (pos < Math.min(1024, buf.length - 6)) {
    const value = u16BE(buf, pos);
    pos += 2;
    if (value === 32272 || value === 32288) {
      const next = u16BE(buf, pos);
      if (next === 16890) {
        pos += 2;
        const sampleDataBase = pos + u16BE(buf, pos);
        pos += 2;
        const addi = u16BE(buf, pos);
        if (addi === 53756) {
          pos += 2;
          samplesData = sampleDataBase + u32BE(buf, pos);
          pos += 4;
        } else {
          samplesData = sampleDataBase;
        }
        if (pos + 2 < buf.length) {
          pos += 2;
          if (pos < buf.length && u8(buf, pos) === 114) {
            pos += 2;
          }
        }
      } else {
        pos += 2;
      }
    } else if (value === 49404) {
      pos += 2;
      const lea = u16BE(buf, pos);
      if (lea === 16875) {
        pos += 2;
        songsHeaders = u16BE(buf, pos);
        pos += 2;
      } else {
        pos += 2;
      }
    } else if (value === 16960) {
      break;
    }
  }
  if (!songsHeaders || songsHeaders >= buf.length) return null;
  const songs = [];
  pos = songsHeaders;
  let lowestTrack = 2147483647;
  let songLimit = 0;
  while (pos + 18 <= buf.length && songLimit++ < 32) {
    pos++;
    const speed = u8(buf, pos);
    pos++;
    if (speed === 0 || speed > 255) break;
    const song = { speed, tracks: [] };
    for (let ch = 0; ch < 4; ch++) {
      const trackPtr = u32BE(buf, pos);
      pos += 4;
      if (trackPtr > 0 && trackPtr < lowestTrack) lowestTrack = trackPtr;
      song.tracks.push(trackPtr);
    }
    songs.push(song);
    if (lowestTrack - pos < 18) break;
  }
  return { songs, samplesDataOffset: samplesData };
}
const MAX_RH_EVENTS = 16384;
function parseRHChannelStream(buf, song, channelIdx) {
  const events = [];
  const trackPtr = song.tracks[channelIdx];
  if (!trackPtr || trackPtr >= buf.length) return events;
  const speed = song.speed;
  let currentSample = 1;
  let tick = 0;
  let trackPos = 4;
  let patternPos = u32BE(buf, trackPtr);
  if (patternPos === 0 || patternPos >= buf.length) return events;
  let safety = 0;
  while (safety++ < MAX_RH_EVENTS) {
    if (patternPos < 0 || patternPos >= buf.length) break;
    const value = s8(buf, patternPos);
    patternPos++;
    if (value >= 0) {
      const duration = speed * value;
      if (patternPos >= buf.length) break;
      const noteIdx = s8(buf, patternPos);
      patternPos++;
      const trackerNote = rhNoteToTrackerNote(noteIdx);
      if (trackerNote > 0) {
        events.push({
          tick,
          note: trackerNote,
          instrument: currentSample,
          effTyp: 0,
          eff: 0
        });
      }
      tick += duration || speed;
    } else {
      switch (value) {
        case -128: {
          if (patternPos >= buf.length) {
            safety = MAX_RH_EVENTS;
            break;
          }
          let smpIdx = s8(buf, patternPos);
          patternPos++;
          if (smpIdx < 0) smpIdx = 0;
          currentSample = smpIdx + 1;
          break;
        }
        case -127:
          patternPos++;
          break;
        case -126: {
          if (patternPos >= buf.length) {
            safety = MAX_RH_EVENTS;
            break;
          }
          const durByte = s8(buf, patternPos);
          patternPos++;
          const duration = speed * (durByte > 0 ? durByte : 1);
          events.push({
            tick,
            note: 97,
            // note-off
            instrument: 0,
            effTyp: 0,
            eff: 0
          });
          tick += duration;
          break;
        }
        case -125:
          break;
        case -124: {
          if (trackPtr + trackPos >= buf.length) {
            safety = MAX_RH_EVENTS;
            break;
          }
          const nextAddr = u32BE(buf, trackPtr + trackPos);
          trackPos += 4;
          if (!nextAddr) {
            safety = MAX_RH_EVENTS;
            break;
          }
          patternPos = nextAddr;
          break;
        }
        case -123:
          safety = MAX_RH_EVENTS;
          break;
        case -122:
        case -121:
          patternPos++;
          break;
        default:
          safety = MAX_RH_EVENTS;
          break;
      }
    }
  }
  return events;
}
function buildRHPatterns(channelEvents) {
  const ROWS_PER_PATTERN = 64;
  const NUM_CHANNELS = 4;
  let maxTick = 0;
  for (const events of channelEvents) {
    for (const ev of events) {
      if (ev.tick > maxTick) maxTick = ev.tick;
    }
  }
  const totalRows = maxTick + 1;
  const numPatterns = Math.max(1, Math.ceil(totalRows / ROWS_PER_PATTERN));
  const patternLimit = Math.min(numPatterns, 256);
  const patterns = [];
  for (let p = 0; p < patternLimit; p++) {
    const startTick = p * ROWS_PER_PATTERN;
    const channels = [];
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const rows = [];
      const events = channelEvents[ch] || [];
      for (let r = 0; r < ROWS_PER_PATTERN; r++) {
        const targetTick = startTick + r;
        const ev = events.find((e) => e.tick === targetTick);
        rows.push({
          note: (ev == null ? void 0 : ev.note) ?? 0,
          instrument: (ev == null ? void 0 : ev.instrument) ?? 0,
          volume: 0,
          effTyp: (ev == null ? void 0 : ev.effTyp) ?? 0,
          eff: (ev == null ? void 0 : ev.eff) ?? 0,
          effTyp2: 0,
          eff2: 0
        });
      }
      channels.push({
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
      });
    }
    patterns.push({
      id: `pattern-${p}`,
      name: `Pattern ${p}`,
      length: ROWS_PER_PATTERN,
      channels
    });
  }
  return { patterns, songPositions: patterns.map((_, i) => i) };
}
async function parseRobHubbardFile(buffer, filename, moduleBase = 0) {
  if (!isRobHubbardFormat(buffer, filename)) {
    throw new Error("Not a Rob Hubbard module");
  }
  const buf = new Uint8Array(buffer);
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^rh\./i, "") || baseName;
  let blobResults = [];
  const tableResult = findSampleTable(buf);
  if (tableResult !== null) {
    blobResults = parseSampleBlobs(buf, tableResult.tableOffset, tableResult.count);
  }
  const extractedCount = blobResults.length;
  const instruments = [];
  for (let i = 0; i < MAX_INSTRUMENTS; i++) {
    if (i < extractedCount) {
      const { config: cfg, blobOffset, blobSize } = blobResults[i];
      const chipRam = {
        moduleBase,
        moduleSize: buffer.byteLength,
        instrBase: moduleBase + blobOffset,
        instrSize: blobSize,
        sections: {
          sampleTable: moduleBase + ((tableResult == null ? void 0 : tableResult.tableOffset) ?? 0)
        }
      };
      instruments.push({
        id: i + 1,
        name: `Sample ${i + 1}`,
        type: "synth",
        synthType: "RobHubbardSynth",
        effects: [],
        volume: 0,
        pan: 0,
        robHubbard: cfg,
        uadeChipRam: chipRam
      });
    } else {
      instruments.push({
        id: i + 1,
        name: `Sample ${i + 1}`,
        type: "synth",
        synthType: "RobHubbardSynth",
        effects: [],
        volume: 0,
        pan: 0,
        robHubbard: { ...DEFAULT_ROB_HUBBARD }
      });
    }
  }
  const NUM_CHANNELS = 4;
  const ROWS = 64;
  let patterns = [];
  let songPositions = [0];
  let initialSpeed = 6;
  const songResult = findRHSongs(buf);
  if (songResult && songResult.songs.length > 0) {
    const song = songResult.songs[0];
    initialSpeed = song.speed || 6;
    const channelEvents = [];
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      channelEvents.push(parseRHChannelStream(buf, song, ch));
    }
    let totalNotes = 0;
    for (const events of channelEvents) {
      totalNotes += events.filter((e) => e.note > 0 && e.note < 97).length;
    }
    if (totalNotes > 0) {
      const built = buildRHPatterns(channelEvents);
      patterns = built.patterns;
      songPositions = built.songPositions;
    }
  }
  if (patterns.length === 0) {
    const emptyRows = Array.from({ length: 64 }, () => ({
      note: 0,
      instrument: 0,
      volume: 0,
      effTyp: 0,
      eff: 0,
      effTyp2: 0,
      eff2: 0
    }));
    patterns = [{
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
        pan: ch === 0 || ch === 3 ? -50 : 50,
        instrumentId: null,
        color: null,
        rows: emptyRows.map((r) => ({ ...r }))
      }))
    }];
    songPositions = [0];
  }
  const extractNote = extractedCount > 0 ? ` (${extractedCount} smp, ${patterns.length} pat)` : ` (${MAX_INSTRUMENTS} smp)`;
  const uadePatternLayout = {
    formatId: "robHubbard",
    patternDataFileOffset: 0,
    bytesPerCell: 4,
    rowsPerPattern: ROWS,
    numChannels: NUM_CHANNELS,
    numPatterns: patterns.length,
    moduleSize: buffer.byteLength,
    encodeCell: encodeRobHubbardCell,
    getCellFileOffset: (pat, row, channel) => {
      const patternByteSize = ROWS * NUM_CHANNELS * 4;
      return pat * patternByteSize + row * NUM_CHANNELS * 4 + channel * 4;
    }
  };
  return {
    name: `${moduleName} [Rob Hubbard]${extractNote}`,
    format: "MOD",
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename,
    uadePatternLayout
  };
}
export {
  isRobHubbardFormat,
  parseRobHubbardFile
};
