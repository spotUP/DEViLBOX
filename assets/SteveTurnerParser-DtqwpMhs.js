import { c5 as registerVariableEncoder } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function encodeSteveTurnerPattern(rows, _channel) {
  const bytes = [];
  let currentDuration = 1;
  let currentInstrument = -1;
  let lastEventRow = 0;
  for (let r = 0; r < rows.length; r++) {
    const cell = rows[r];
    const note = cell.note ?? 0;
    const instr = cell.instrument ?? 0;
    const effTyp = cell.effTyp ?? 0;
    const eff = cell.eff ?? 0;
    if (note === 0 && instr === 0 && effTyp === 0 && eff === 0) continue;
    const gap = r - lastEventRow;
    if (r > 0 && gap !== currentDuration) {
      const dur = Math.max(1, Math.min(48, gap));
      bytes.push(127 + dur);
      currentDuration = dur;
    } else if (r === 0 && currentDuration !== 1) {
      bytes.push(128);
      currentDuration = 1;
    }
    if (effTyp === 14) {
      const subCmd = eff >> 4 & 15;
      const subParam = eff & 15;
      if (subCmd === 5 && subParam > 0 && subParam <= 8) {
        bytes.push(240 + subParam);
      }
    }
    if (instr > 0) {
      const instrIdx = instr - 1;
      if (note > 0) {
        if (instrIdx !== currentInstrument) {
          if (instrIdx >= 0 && instrIdx <= 31) {
            bytes.push(208 + instrIdx);
          }
          currentInstrument = instrIdx;
        }
        const pitchIdx = note - 13;
        if (pitchIdx >= 0 && pitchIdx <= 127) {
          bytes.push(pitchIdx);
        }
      } else {
        if (instrIdx >= 0 && instrIdx <= 31) {
          bytes.push(176 + instrIdx);
          currentInstrument = instrIdx;
        }
      }
    } else if (note > 0) {
      const pitchIdx = note - 13;
      if (pitchIdx >= 0 && pitchIdx <= 127) {
        bytes.push(pitchIdx);
      }
    }
    lastEventRow = r;
  }
  bytes.push(255);
  return new Uint8Array(bytes);
}
const steveTurnerEncoder = {
  formatId: "steveTurner",
  encodePattern: encodeSteveTurnerPattern
};
registerVariableEncoder(steveTurnerEncoder);
const MIN_FILE_SIZE = 46;
const INSTR_SIZE = 48;
const MAX_PATTERN_BLOCKS = 256;
const MAX_ROWS = 1024;
function u16BE(buf, off) {
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function s16BE(buf, off) {
  const v = u16BE(buf, off);
  return v >= 32768 ? v - 65536 : v;
}
const FREQ_TABLE = [
  61156,
  57723,
  54484,
  51425,
  48540,
  45814,
  43244,
  40817,
  38525,
  36363,
  34322,
  32396,
  30578,
  28862,
  27242,
  25713,
  24270,
  22907,
  21622,
  20409,
  19263,
  18182,
  17161,
  16198,
  15289,
  14431,
  13621,
  12857,
  12135,
  11454,
  10811,
  10205,
  9632,
  9091,
  8581,
  8099,
  7645,
  7216,
  6811,
  6429,
  6068,
  5727,
  5406,
  5103,
  4816,
  4546,
  4291,
  4050,
  3823,
  3608,
  3406,
  3215,
  3034,
  2864,
  2703,
  2552,
  2408,
  2273,
  2146,
  2025,
  1912,
  1804,
  1703,
  1608,
  1517,
  1432,
  1352,
  1276,
  1204,
  1137,
  1073,
  1013,
  956,
  902,
  852,
  804,
  759,
  716,
  676,
  638,
  602,
  569,
  537,
  507
];
function deriveNoteFromInstrument(buf, instrOffset, instIdx) {
  const off = instrOffset + instIdx * INSTR_SIZE;
  if (off + INSTR_SIZE > buf.length) return -1;
  const vibInitial = u16BE(buf, off);
  const shift = buf[off + 37];
  if (vibInitial === 0 || shift > 15) return -1;
  const period = vibInitial >>> shift;
  if (period === 0) return -1;
  let bestIdx = -1;
  let bestDiff = Infinity;
  for (let i = 0; i < FREQ_TABLE.length; i++) {
    const diff = Math.abs(FREQ_TABLE[i] - period);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  }
  if (bestIdx >= 0 && bestDiff > FREQ_TABLE[bestIdx] * 0.5) return -1;
  return bestIdx;
}
function isSteveTurnerFormat(buffer) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;
  if (u16BE(buf, 0) !== 11132) return false;
  if (u16BE(buf, 8) !== 11132) return false;
  if (u16BE(buf, 16) !== 11132) return false;
  if (u16BE(buf, 24) !== 11132) return false;
  if (u32BE(buf, 32) !== 809238783) return false;
  if (u32BE(buf, 36) !== 838880953) return false;
  if (u16BE(buf, 44) !== 20085) return false;
  return true;
}
function parseHeader(buf) {
  const base = u32BE(buf, 2);
  const seqOffset = u32BE(buf, 10) - base + 46 >>> 0;
  const offtblOffset = u32BE(buf, 18) - base + 46 >>> 0;
  const sampOffset = u32BE(buf, 26) - base + 46 >>> 0;
  return {
    seqOffset,
    offtblOffset,
    instrOffset: 46,
    sampOffset
  };
}
function parseSubsongs(buf, seqOffset) {
  const subsongs = [];
  let off = seqOffset;
  while (off + 12 <= buf.length) {
    if ((u16BE(buf, off) & 65520) !== 0) break;
    const priority = buf[off + 0];
    const speed = buf[off + 1] || 6;
    const ch0 = u16BE(buf, off + 4);
    const ch1 = u16BE(buf, off + 6);
    const ch2 = u16BE(buf, off + 8);
    const ch3 = u16BE(buf, off + 10);
    subsongs.push({
      priority,
      speed,
      chanPosOffsets: [ch0, ch1, ch2, ch3]
    });
    off += 12;
  }
  return subsongs;
}
function decodeChannel(buf, posListStart, offtblOffset, instrOffset) {
  const blocks = [];
  let pos = posListStart;
  let duration = 1;
  let currentInstrument = 0;
  let blockCount = 0;
  while (pos < buf.length && blockCount < MAX_PATTERN_BLOCKS) {
    const posByte = buf[pos++];
    if (posByte >= 254) break;
    const offtblByteOff = offtblOffset + posByte * 2;
    if (offtblByteOff + 1 >= buf.length) break;
    const signedOffset = s16BE(buf, offtblByteOff);
    const patBlockStart = offtblOffset + signedOffset;
    if (patBlockStart < 0 || patBlockStart >= buf.length) break;
    blockCount++;
    const events = [];
    let row = 0;
    let p = patBlockStart;
    let blockDone = false;
    while (!blockDone && p < buf.length) {
      const b = buf[p++];
      if (b <= 127) {
        const xmNote = b + 13;
        events.push({
          row: Math.min(row, MAX_ROWS - 1),
          note: Math.min(xmNote, 96),
          instrument: currentInstrument + 1,
          effTyp: 0,
          eff: 0
        });
        row += duration;
      } else if (b <= 175) {
        duration = b - 127;
      } else if (b <= 207) {
        currentInstrument = b - 176;
        const derivedIdx = deriveNoteFromInstrument(buf, instrOffset, currentInstrument);
        const derivedNote = derivedIdx >= 0 ? derivedIdx + 13 : 37;
        events.push({
          row: Math.min(row, MAX_ROWS - 1),
          note: Math.min(derivedNote, 96),
          instrument: currentInstrument + 1,
          effTyp: 0,
          eff: 0
        });
        row += duration;
      } else if (b <= 239) {
        currentInstrument = b - 208;
      } else if (b <= 248) {
        const effectNum = b - 240;
        if (effectNum > 0 && events.length > 0) {
          const last = events[events.length - 1];
          last.effTyp = 14;
          last.eff = 5 << 4 | effectNum & 15;
        }
      } else if (b === 254) ;
      else {
        blockDone = true;
      }
    }
    blocks.push({ events, rowCount: row });
  }
  return blocks;
}
function buildInstruments(count, buf, instrOffset) {
  return Array.from({ length: count }, (_, i) => {
    const inst = {
      id: i + 1,
      name: `Instr ${(i + 1).toString().padStart(2, "0")}`,
      type: "synth",
      synthType: "SteveTurnerSynth",
      effects: [],
      volume: 0,
      pan: 0
    };
    if (buf && instrOffset !== void 0) {
      const off = instrOffset + i * INSTR_SIZE;
      if (off + INSTR_SIZE <= buf.length) {
        const s8 = (v) => v > 127 ? v - 256 : v;
        inst.steveTurner = {
          priority: buf[off + 30],
          sampleIdx: buf[off + 31],
          initDelay: buf[off + 32],
          env1Duration: buf[off + 33],
          env1Delta: s8(buf[off + 34]),
          env2Duration: buf[off + 35],
          env2Delta: s8(buf[off + 36]),
          pitchShift: buf[off + 37],
          oscCount: buf[off + 38] << 8 | buf[off + 39],
          oscDelta: s8(buf[off + 40]),
          oscLoop: buf[off + 41],
          decayDelta: s8(buf[off + 42]),
          numVibrato: buf[off + 43],
          vibratoDelay: buf[off + 44],
          vibratoSpeed: buf[off + 45],
          vibratoMaxDepth: buf[off + 46],
          chain: buf[off + 47]
        };
      }
    }
    return inst;
  });
}
const CHANNEL_PANS = [-50, 50, 50, -50];
function buildPattern(patternIndex, _subsong, channelEvents, numRows, filename) {
  var _a;
  const channelRows = channelEvents.map(
    () => Array.from({ length: numRows }, () => ({
      note: 0,
      instrument: 0,
      volume: 0,
      effTyp: 0,
      eff: 0,
      effTyp2: 0,
      eff2: 0
    }))
  );
  channelEvents.forEach((events, ch) => {
    for (const ev of events) {
      if (ev.row >= numRows) continue;
      const row = channelRows[ch][ev.row];
      if (ev.note > 0) {
        row.note = ev.note;
        row.instrument = ev.instrument;
      } else if (ev.instrument > 0 && row.note === 0) {
        row.instrument = ev.instrument;
      }
      if (ev.effTyp > 0) {
        row.effTyp = ev.effTyp;
        row.eff = ev.eff;
      }
    }
  });
  return {
    id: `pattern-${patternIndex}`,
    name: `Pattern ${patternIndex}`,
    length: numRows,
    channels: channelRows.map((rows, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: CHANNEL_PANS[ch],
      instrumentId: null,
      color: null,
      rows
    })),
    importMetadata: {
      sourceFormat: "MOD",
      sourceFile: filename,
      importedAt: (/* @__PURE__ */ new Date()).toISOString(),
      originalChannelCount: 4,
      originalPatternCount: ((_a = channelEvents[0]) == null ? void 0 : _a.length) ?? 0,
      originalInstrumentCount: 16,
      modData: {
        initialSpeed: _subsong.speed,
        initialBPM: 250
      }
    }
  };
}
function parseSteveTurnerFile(buffer, filename) {
  var _a, _b, _c, _d, _e, _f;
  const buf = new Uint8Array(buffer);
  if (!isSteveTurnerFormat(buf)) {
    throw new Error("Not a Steve Turner module");
  }
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^jpo\./i, "").replace(/\.jpold?$/i, "").replace(/\.jpo$/i, "") || baseName;
  const hdr = parseHeader(buf);
  if (hdr.seqOffset >= buf.length || hdr.offtblOffset >= buf.length || hdr.instrOffset >= buf.length) {
    throw new Error("Steve Turner: corrupt header offsets");
  }
  const subsongs = parseSubsongs(buf, hdr.seqOffset);
  if (subsongs.length === 0) {
    subsongs.push({ priority: 0, speed: 6, chanPosOffsets: [0, 0, 0, 0] });
  }
  const instruments = buildInstruments(16, buf, hdr.instrOffset);
  const patterns = [];
  const songPositions = [];
  {
    const sub = subsongs[0] || { speed: 6, chanPosOffsets: [0, 0, 0, 0] };
    const channelBlocks = [];
    for (let ch = 0; ch < 4; ch++) {
      const wordOffset = sub.chanPosOffsets[ch];
      if (wordOffset === 0) {
        channelBlocks.push([]);
        continue;
      }
      const posListStart = hdr.seqOffset + wordOffset;
      if (posListStart >= buf.length) {
        channelBlocks.push([]);
        continue;
      }
      channelBlocks.push(
        decodeChannel(buf, posListStart, hdr.offtblOffset, hdr.instrOffset)
      );
    }
    const numSteps = Math.max(...channelBlocks.map((b) => b.length), 1);
    for (let step = 0; step < numSteps; step++) {
      const channelEvents = [];
      let maxRow = 15;
      for (let ch = 0; ch < 4; ch++) {
        const block = (_a = channelBlocks[ch]) == null ? void 0 : _a[step];
        if (block) {
          channelEvents.push(block.events);
          if (block.rowCount > maxRow) maxRow = block.rowCount;
        } else {
          channelEvents.push([]);
        }
      }
      const numRows = Math.min(Math.max(Math.ceil(maxRow / 4) * 4, 4), MAX_ROWS);
      patterns.push(buildPattern(patterns.length, sub, channelEvents, numRows, filename));
      songPositions.push(patterns.length - 1);
    }
  }
  const filePatternAddrs = [];
  const filePatternSizes = [];
  for (let ch = 0; ch < 4; ch++) {
    const wordOffset = ((_b = subsongs[0]) == null ? void 0 : _b.chanPosOffsets[ch]) ?? 0;
    const posListStart = wordOffset > 0 ? hdr.seqOffset + wordOffset : 0;
    filePatternAddrs.push(posListStart);
    const numEvents = ((_d = (_c = patterns[0]) == null ? void 0 : _c.channels[ch]) == null ? void 0 : _d.rows.filter(
      (r) => r.note > 0 || r.instrument > 0
    ).length) ?? 0;
    filePatternSizes.push(Math.max(numEvents * 4, 64));
  }
  const trackMap = [];
  for (let si = 0; si < patterns.length; si++) {
    trackMap.push([0, 1, 2, 3]);
  }
  const uadeVariableLayout = {
    formatId: "steveTurner",
    numChannels: 4,
    numFilePatterns: 4,
    rowsPerPattern: ((_e = patterns[0]) == null ? void 0 : _e.length) ?? 64,
    moduleSize: buf.length,
    encoder: {
      formatId: "steveTurner",
      encodePattern: encodeSteveTurnerPattern
    },
    filePatternAddrs,
    filePatternSizes,
    trackMap
  };
  const result = {
    name: `${moduleName} [Steve Turner]`,
    format: "SteveTurner",
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: ((_f = subsongs[0]) == null ? void 0 : _f.speed) ?? 6,
    // Steve Turner timer $1BC0 = 100Hz (2× standard 50Hz VBlank).
    // BPM 250 gives 250*2/5 = 100 ticks/sec, matching the engine.
    initialBPM: 250,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename,
    // WASM engine playback (replaces UADE)
    steveTurnerFileData: buffer.slice(0),
    uadeVariableLayout
  };
  let instrCount = 0;
  for (let i = 0; i < 16; i++) {
    const off = hdr.instrOffset + i * INSTR_SIZE;
    if (off + INSTR_SIZE > buf.length) break;
    instrCount++;
  }
  result.instruments = buildInstruments(instrCount, buf, hdr.instrOffset);
  return result;
}
export {
  isSteveTurnerFormat,
  parseSteveTurnerFile
};
