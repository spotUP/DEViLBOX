const MIN_FILE_SIZE = 60;
const NUM_CHANNELS = 4;
const ROWS_PER_PATTERN = 64;
const MAX_EVENTS = 16384;
const AMIGA_PERIODS = [
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
  // C-1 to B-1
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
  // C-2 to B-2
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
  // C-3 to B-3
];
function u8(buf, off) {
  if (off < 0 || off >= buf.length) return 0;
  return buf[off] & 255;
}
function s8(buf, off) {
  const v = u8(buf, off);
  return v < 128 ? v : v - 256;
}
function u16BE(buf, off) {
  if (off + 1 >= buf.length) return 0;
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function i16BE(buf, off) {
  const v = u16BE(buf, off);
  return v >= 32768 ? v - 65536 : v;
}
function u32BE(buf, off) {
  if (off + 3 >= buf.length) return 0;
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function periodToNote(period) {
  if (period === 0) return 0;
  let bestIdx = -1;
  let bestDist = Infinity;
  for (let i = 0; i < AMIGA_PERIODS.length; i++) {
    const dist = Math.abs(AMIGA_PERIODS[i] - period);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  if (bestIdx < 0) return 0;
  const note = bestIdx + 13;
  return note >= 1 && note <= 96 ? note : 0;
}
function rhstNoteToTrackerNote(idx) {
  const n = idx + 13;
  return n >= 1 && n <= 96 ? n : 0;
}
function isRobHubbardSTFormat(buffer) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;
  if (u32BE(buf, 0) !== 4226880) return false;
  if (u32BE(buf, 4) !== 12616128) return false;
  if (u32BE(buf, 56) !== 1106968558) return false;
  return true;
}
function findSongPtr(buf) {
  if (u16BE(buf, 56) !== 16890) return null;
  const displacement = i16BE(buf, 58);
  const songPtr = 58 + displacement;
  if (songPtr < 0 || songPtr >= buf.length) return null;
  return songPtr;
}
function extractRHSTPatterns(buf, songPtr) {
  const speed = u8(buf, songPtr);
  if (speed === 0 || speed > 32) {
    return extractDirectPatternData(buf, songPtr);
  }
  if (songPtr + 1 + 8 > buf.length) return null;
  const voiceOffsets = [];
  let validPointers = true;
  for (let ch = 0; ch < NUM_CHANNELS; ch++) {
    const off = u16BE(buf, songPtr + 1 + ch * 2);
    const absOff = songPtr + off;
    if (absOff <= songPtr || absOff >= buf.length) {
      validPointers = false;
      break;
    }
    voiceOffsets.push(absOff);
  }
  if (validPointers && voiceOffsets.length === NUM_CHANNELS) {
    const channelEvents = [];
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      channelEvents.push(parseRHSTVoiceStream(buf, voiceOffsets[ch]));
    }
    const totalNotes = channelEvents.reduce(
      (sum, evts) => sum + evts.filter((e) => e.note > 0 && e.note < 97).length,
      0
    );
    if (totalNotes > 0) {
      return { channelEvents, speed };
    }
  }
  if (songPtr + 1 + 16 <= buf.length) {
    const voiceOffsets32 = [];
    let valid32 = true;
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const ptr = u32BE(buf, songPtr + 1 + ch * 4);
      if (ptr === 0 || ptr >= buf.length) {
        valid32 = false;
        break;
      }
      voiceOffsets32.push(ptr);
    }
    if (valid32 && voiceOffsets32.length === NUM_CHANNELS) {
      const channelEvents = [];
      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        channelEvents.push(parseRHSTVoiceStream(buf, voiceOffsets32[ch]));
      }
      const totalNotes = channelEvents.reduce(
        (sum, evts) => sum + evts.filter((e) => e.note > 0 && e.note < 97).length,
        0
      );
      if (totalNotes > 0) {
        return { channelEvents, speed };
      }
    }
  }
  return extractDirectPatternData(buf, songPtr);
}
function extractDirectPatternData(buf, startOff) {
  const channelEvents = [[], [], [], []];
  let pos = startOff;
  let tick = 0;
  const bytesPerRow = NUM_CHANNELS * 4;
  let emptyRows = 0;
  let safety = 0;
  while (pos + bytesPerRow <= buf.length && safety++ < MAX_EVENTS) {
    if (u8(buf, pos) === 135) break;
    let rowHasData = false;
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const cellOff = pos + ch * 4;
      const b0 = u8(buf, cellOff);
      const b1 = u8(buf, cellOff + 1);
      const b2 = u8(buf, cellOff + 2);
      const b3 = u8(buf, cellOff + 3);
      if (b0 === 135) {
        return finishExtraction(channelEvents);
      }
      const instrument = b0 & 240 | b2 >> 4 & 15;
      const period = (b0 & 15) << 8 | b1;
      const effTyp = b2 & 15;
      const eff = b3;
      const note = periodToNote(period);
      if (note > 0 || instrument > 0 || effTyp > 0 || eff > 0) {
        rowHasData = true;
        channelEvents[ch].push({
          tick,
          note,
          instrument,
          effTyp,
          eff
        });
      }
    }
    if (!rowHasData) {
      emptyRows++;
      if (emptyRows > 128) break;
    } else {
      emptyRows = 0;
    }
    tick++;
    pos += bytesPerRow;
  }
  return finishExtraction(channelEvents);
}
function finishExtraction(channelEvents) {
  const totalNotes = channelEvents.reduce(
    (sum, evts) => sum + evts.filter((e) => e.note > 0 && e.note < 97).length,
    0
  );
  if (totalNotes === 0) return null;
  return { channelEvents, speed: 6 };
}
function parseRHSTVoiceStream(buf, startPos) {
  const events = [];
  let pos = startPos;
  let tick = 0;
  let currentSample = 1;
  let safety = 0;
  while (pos < buf.length && safety++ < MAX_EVENTS) {
    const value = s8(buf, pos);
    pos++;
    if (value === -121 || (value & 255) === 135) {
      break;
    }
    if (value >= 0) {
      if (pos >= buf.length) break;
      const duration = u8(buf, pos);
      pos++;
      if (duration === 135) break;
      const trackerNote = rhstNoteToTrackerNote(value);
      if (trackerNote > 0) {
        events.push({
          tick,
          note: trackerNote,
          instrument: currentSample,
          effTyp: 0,
          eff: 0
        });
      }
      tick += duration || 1;
    } else {
      switch (value) {
        case -128: {
          if (pos >= buf.length) {
            safety = MAX_EVENTS;
            break;
          }
          const smpIdx = u8(buf, pos);
          pos++;
          if (smpIdx === 135) {
            safety = MAX_EVENTS;
            break;
          }
          currentSample = (smpIdx & 127) + 1;
          break;
        }
        case -127:
          pos++;
          break;
        case -126: {
          if (pos >= buf.length) {
            safety = MAX_EVENTS;
            break;
          }
          const dur = u8(buf, pos);
          pos++;
          if (dur === 135) {
            safety = MAX_EVENTS;
            break;
          }
          events.push({ tick, note: 97, instrument: 0, effTyp: 0, eff: 0 });
          tick += dur || 1;
          break;
        }
        case -125:
        case -124:
          safety = MAX_EVENTS;
          break;
        case -123:
        case -122:
          pos++;
          break;
      }
    }
  }
  return events;
}
function buildRHSTPatterns(channelEvents) {
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
function parseRobHubbardSTFile(buffer, filename, _moduleBase = 0) {
  const buf = new Uint8Array(buffer);
  if (!isRobHubbardSTFormat(buf)) throw new Error("Not a Rob Hubbard ST module");
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^rho\./i, "").replace(/\.rho$/i, "") || baseName;
  const instruments = [{
    id: 1,
    name: "Sample 1",
    type: "synth",
    synthType: "Synth",
    effects: [],
    volume: 0,
    pan: 0
  }];
  let patterns = [];
  let songPositions = [0];
  let initialSpeed = 6;
  const songPtr = findSongPtr(buf);
  if (songPtr !== null) {
    const result = extractRHSTPatterns(buf, songPtr);
    if (result) {
      initialSpeed = result.speed || 6;
      const built = buildRHSTPatterns(result.channelEvents);
      patterns = built.patterns;
      songPositions = built.songPositions;
      let maxInstr = 0;
      for (const evts of result.channelEvents) {
        for (const e of evts) {
          if (e.instrument > maxInstr) maxInstr = e.instrument;
        }
      }
      while (instruments.length < maxInstr) {
        instruments.push({
          id: instruments.length + 1,
          name: `Sample ${instruments.length + 1}`,
          type: "synth",
          synthType: "Synth",
          effects: [],
          volume: 0,
          pan: 0
        });
      }
    }
  }
  if (patterns.length === 0) {
    const emptyRows = Array.from({ length: ROWS_PER_PATTERN }, () => ({
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
      length: ROWS_PER_PATTERN,
      channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
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
  const extractInfo = patterns.length > 1 ? ` (${patterns.length} pat)` : "";
  return {
    name: `${moduleName} [Rob Hubbard ST]${extractInfo}`,
    format: "MOD",
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: NUM_CHANNELS,
    initialSpeed,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename
  };
}
export {
  isRobHubbardSTFormat,
  parseRobHubbardSTFile
};
