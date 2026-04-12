const MIN_FILE_SIZE = 24;
const DEFAULT_INSTRUMENTS = 8;
const NUM_CHANNELS = 4;
const ROWS_PER_PATTERN = 64;
const MAX_EVENTS = 4096;
function u16BE(buf, off) {
  if (off + 1 >= buf.length) return 0;
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function i16BE(buf, off) {
  const v = u16BE(buf, off);
  return v < 32768 ? v : v - 65536;
}
function u32BE(buf, off) {
  if (off + 3 >= buf.length) return 0;
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function isAnders0landFormat(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (filename !== void 0) {
    const base = (filename.split("/").pop() ?? filename).toLowerCase();
    if (!base.startsWith("hot.")) return false;
  }
  if (buf.length < MIN_FILE_SIZE) return false;
  let off = 0;
  let d2 = buf.length;
  if (off + 8 > buf.length) return false;
  const d1a = u32BE(buf, off + 4);
  d2 -= d1a;
  if (d2 < 0) return false;
  if (buf[off + 0] !== 109 || buf[off + 1] !== 112) return false;
  if (buf[off + 2] !== 108) return false;
  if (d1a & 1) return false;
  off += d1a;
  if (off + 8 > buf.length) return false;
  const d1b = u32BE(buf, off + 4);
  d2 -= d1b;
  if (d2 < 0) return false;
  if (buf[off + 0] !== 109 || buf[off + 1] !== 100) return false;
  if (buf[off + 2] !== 116) return false;
  if (d1b & 1) return false;
  off += d1b;
  if (off + 8 > buf.length) return false;
  const d1c = u32BE(buf, off + 4);
  d2 -= d1c;
  if (d2 < 0) return false;
  if (buf[off + 0] !== 109 || buf[off + 1] !== 115) return false;
  if (buf[off + 2] !== 109) return false;
  return true;
}
function amigaIndexToTrackerNote(idx) {
  const n = idx + 25;
  return n >= 1 && n <= 96 ? n : 0;
}
function parseA0PatternBlock(buf, off, transpose) {
  const events = [];
  let pos = 0;
  let tick = 0;
  let currentInstr = 1;
  let safety = 0;
  while (safety++ < MAX_EVENTS) {
    const absPos = off + pos;
    if (absPos >= buf.length) break;
    const d1 = buf[absPos];
    if (d1 === 255) break;
    const duration = d1 & 31;
    const hasBit7 = (d1 & 128) !== 0;
    const hasBit6 = (d1 & 64) !== 0;
    const hasBit5 = (d1 & 32) !== 0;
    let advance;
    let noteOff = -1;
    if (hasBit7 || hasBit6) {
      if (absPos + 1 >= buf.length) break;
      const d2 = buf[absPos + 1];
      if (hasBit7) {
        currentInstr = (d2 & 127) + 1;
      }
      if ((d2 & 128) === 0) {
        advance = 3;
        noteOff = absPos + 2;
      } else {
        advance = 2;
      }
    } else if (hasBit5) {
      advance = 1;
    } else {
      advance = 2;
      noteOff = absPos + 1;
    }
    if (noteOff >= 0 && noteOff < buf.length) {
      const noteByte = buf[noteOff];
      const noteIndex = (noteByte & 127) + transpose;
      const trackerNote = amigaIndexToTrackerNote(noteIndex);
      if (trackerNote > 0) {
        events.push({ tick, note: trackerNote, instrument: currentInstr });
      }
    }
    tick += Math.max(1, duration);
    pos += advance;
  }
  return events;
}
function readA0PositionList(buf, off) {
  const indices = [];
  const transposes = [];
  let pos = 0;
  let currentTranspose = 0;
  for (let safety = 0; safety < 512; safety++) {
    const absPos = off + pos;
    if (absPos >= buf.length) break;
    const b = buf[absPos];
    if (b === 255 || b === 254) break;
    if (b & 128) {
      currentTranspose = b & 127;
      pos++;
      if (off + pos >= buf.length) break;
      const patIdx = buf[off + pos];
      if (patIdx === 255 || patIdx === 254) break;
      indices.push(patIdx);
      transposes.push(currentTranspose);
      pos++;
    } else {
      indices.push(b);
      transposes.push(currentTranspose);
      pos++;
    }
  }
  return { indices, transposes };
}
function extractA0Patterns(buf, mdtDataOff, _numPatterns) {
  try {
    if (mdtDataOff + 14 > buf.length) return null;
    const posTableOff = mdtDataOff + i16BE(buf, mdtDataOff + 0);
    const patternTableOff = mdtDataOff + i16BE(buf, mdtDataOff + 10);
    if (posTableOff < 0 || posTableOff + 16 > buf.length) return null;
    if (patternTableOff < 0 || patternTableOff + 4 > buf.length) return null;
    const voiceEvents = [[], [], [], []];
    let maxPositions = 0;
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const posListRelOff = u32BE(buf, posTableOff + ch * 4);
      const posListOff = posTableOff + posListRelOff;
      if (posListOff < 0 || posListOff >= buf.length) continue;
      const { indices, transposes } = readA0PositionList(buf, posListOff);
      if (indices.length > maxPositions) maxPositions = indices.length;
      let globalTick = 0;
      for (let p = 0; p < indices.length; p++) {
        const patIdx = indices[p];
        const transpose = transposes[p];
        const patPtrOff = patternTableOff + patIdx * 4;
        if (patPtrOff + 4 > buf.length) continue;
        const patRelOff = u32BE(buf, patPtrOff);
        const patDataOff = patternTableOff + patRelOff;
        if (patDataOff < 0 || patDataOff >= buf.length) continue;
        const blockEvents = parseA0PatternBlock(buf, patDataOff, transpose);
        for (const ev of blockEvents) {
          voiceEvents[ch].push({
            tick: globalTick + ev.tick,
            note: ev.note,
            instrument: ev.instrument
          });
        }
        let maxTick = 0;
        for (const ev of blockEvents) {
          if (ev.tick > maxTick) maxTick = ev.tick;
        }
        globalTick += maxTick + 1;
      }
    }
    let totalNotes = 0;
    for (const events of voiceEvents) {
      totalNotes += events.filter((e) => e.note > 0).length;
    }
    if (totalNotes === 0) return null;
    return { events: voiceEvents, maxPositions };
  } catch {
    return null;
  }
}
function buildA0Patterns(channelEvents, filename, numPatterns, numInstruments) {
  const patterns = [];
  let maxTick = 0;
  for (const events of channelEvents) {
    for (const ev of events) {
      if (ev.tick > maxTick) maxTick = ev.tick;
    }
  }
  const totalRows = maxTick + 1;
  const patCount = Math.max(1, Math.min(256, Math.ceil(totalRows / ROWS_PER_PATTERN)));
  for (let p = 0; p < patCount; p++) {
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
          effTyp: (ev == null ? void 0 : ev.note) ? 0 : 0,
          eff: 0,
          effTyp2: 0,
          eff2: 0
        });
      }
      channels.push({
        id: `p${p}-ch${ch}`,
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
      channels,
      importMetadata: {
        sourceFormat: "MOD",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: NUM_CHANNELS,
        originalPatternCount: numPatterns,
        originalInstrumentCount: numInstruments
      }
    });
  }
  return patterns;
}
async function parseAnders0landFile(buffer, filename) {
  if (!isAnders0landFormat(buffer, filename)) {
    throw new Error("Not an Anders 0land module");
  }
  const buf = new Uint8Array(buffer);
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^hot\./i, "") || baseName;
  const mplSize = u32BE(buf, 4);
  const mdtOff = mplSize;
  const mdtDataOff = mdtOff + 8;
  let numPatterns = 1;
  let numInstruments = DEFAULT_INSTRUMENTS;
  if (mdtDataOff + 22 <= buf.length) {
    const w18 = buf[mdtDataOff + 18] << 8 | buf[mdtDataOff + 19];
    const w20 = buf[mdtDataOff + 20] << 8 | buf[mdtDataOff + 21];
    if (w20 > w18) {
      numInstruments = Math.max(1, Math.min(64, w20 - w18 >> 2));
    }
    if (mdtDataOff + 8 <= buf.length) {
      const w4 = buf[mdtDataOff + 4] << 8 | buf[mdtDataOff + 5];
      const w6 = buf[mdtDataOff + 6] << 8 | buf[mdtDataOff + 7];
      if (w6 > w4) {
        numPatterns = Math.max(1, Math.min(256, w6 - w4 >> 2));
      }
    }
  }
  const instruments = [];
  for (let i = 0; i < numInstruments; i++) {
    instruments.push({
      id: i + 1,
      name: `Sample ${i + 1}`,
      type: "synth",
      synthType: "Synth",
      effects: [],
      volume: 0,
      pan: 0
    });
  }
  let patterns;
  let songPositions;
  const extracted = extractA0Patterns(buf, mdtDataOff);
  if (extracted && extracted.events.some((ch) => ch.length > 0)) {
    patterns = buildA0Patterns(extracted.events, filename, numPatterns, numInstruments);
    songPositions = patterns.map((_, i) => i);
  } else {
    patterns = [];
    for (let p = 0; p < numPatterns; p++) {
      const emptyRows = Array.from({ length: ROWS_PER_PATTERN }, () => ({
        note: 0,
        instrument: 0,
        volume: 0,
        effTyp: 0,
        eff: 0,
        effTyp2: 0,
        eff2: 0
      }));
      patterns.push({
        id: `pattern-${p}`,
        name: `Pattern ${p}`,
        length: ROWS_PER_PATTERN,
        channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
          id: `p${p}-ch${ch}`,
          name: `Channel ${ch + 1}`,
          muted: false,
          solo: false,
          collapsed: false,
          volume: 100,
          pan: ch === 0 || ch === 3 ? -50 : 50,
          instrumentId: null,
          color: null,
          rows: emptyRows
        })),
        importMetadata: {
          sourceFormat: "MOD",
          sourceFile: filename,
          importedAt: (/* @__PURE__ */ new Date()).toISOString(),
          originalChannelCount: NUM_CHANNELS,
          originalPatternCount: numPatterns,
          originalInstrumentCount: numInstruments
        }
      });
    }
    songPositions = Array.from({ length: numPatterns }, (_, i) => i);
  }
  return {
    name: `${moduleName} [Anders 0land]`,
    format: "MOD",
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: NUM_CHANNELS,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename
  };
}
export {
  isAnders0landFormat,
  parseAnders0landFile
};
