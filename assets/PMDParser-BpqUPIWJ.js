import { D as DEFAULT_FURNACE } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function emptyCell() {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}
function emptyPattern(id, name, numCh, rows) {
  return {
    id,
    name,
    length: rows,
    channels: Array.from({ length: numCh }, (_, i) => ({
      id: `ch${i}`,
      name: `CH ${i + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: 0,
      instrumentId: null,
      color: null,
      rows: Array.from({ length: rows }, emptyCell)
    }))
  };
}
function readU16LE(buf, off) {
  return buf[off] | buf[off + 1] << 8;
}
const NUM_FM = 6;
const NUM_SSG = 3;
const NUM_RHYTHM = 1;
const NUM_ADPCM = 1;
const TOTAL_CH = NUM_FM + NUM_SSG + NUM_RHYTHM + NUM_ADPCM;
const MAX_OFFSETS = TOTAL_CH;
const ROWS_PER_PAT = 64;
const CHANNEL_NAMES = [
  "FM A",
  "FM B",
  "FM C",
  "FM D",
  "FM E",
  "FM F",
  "SSG A",
  "SSG B",
  "SSG C",
  "Rhythm",
  "ADPCM"
];
const CMD_TEMPO = 255;
const CMD_VOICE = 254;
const CMD_VOLUME = 253;
const CMD_NOTE_LEN = 252;
const CMD_TIE = 251;
const CMD_DETUNE = 250;
const CMD_LOOP_START = 249;
const CMD_LOOP_END = 248;
const CMD_LOOP_BREAK = 247;
const CMD_LFO = 246;
const CMD_SSG_ENV = 245;
const CMD_PAN = 244;
const CMD_PORTAMENTO = 243;
const CMD_REST = 128;
function parseHeader(buf) {
  if (buf.length < MAX_OFFSETS * 2) return null;
  const offsets = [];
  let hasValidOffset = false;
  for (let i = 0; i < MAX_OFFSETS; i++) {
    const off = readU16LE(buf, i * 2);
    offsets.push(off);
    if (off !== 0 && off < buf.length) hasValidOffset = true;
  }
  if (!hasValidOffset) return null;
  return { offsets, headerSize: MAX_OFFSETS * 2 };
}
function findTitle(buf, headerSize) {
  let start = headerSize;
  while (start < buf.length && buf[start] === 0) start++;
  if (start >= buf.length) return "";
  let end = start;
  while (end < buf.length && end - start < 128) {
    const b = buf[end];
    if (b >= 32 && b !== 127) {
      end++;
    } else {
      break;
    }
  }
  if (end - start < 4) return "";
  let title = "";
  for (let i = start; i < end; i++) {
    title += String.fromCharCode(buf[i]);
  }
  return title.trim();
}
function pmdNoteToMidi(noteVal) {
  const midi = noteVal + 24;
  return Math.max(1, Math.min(96, midi));
}
function parseChannelStream(buf, offset, chIdx, instIdx) {
  const events = [];
  let pos = offset;
  let tick = 0;
  let defaultLen = 12;
  const limit = Math.min(buf.length, offset + 65536);
  while (pos < limit) {
    const cmd = buf[pos++];
    if (cmd < CMD_REST) {
      const note = pmdNoteToMidi(cmd);
      let dur = defaultLen;
      if (pos < limit && buf[pos] > 0 && buf[pos] < 128) {
        dur = buf[pos++];
      }
      events.push({ tick, ch: chIdx, note, instIdx });
      tick += dur;
      events.push({ tick, ch: chIdx, note: 97, instIdx });
      continue;
    }
    if (cmd === CMD_REST) {
      let dur = defaultLen;
      if (pos < limit && buf[pos] > 0 && buf[pos] < 128) {
        dur = buf[pos++];
      }
      tick += dur;
      continue;
    }
    switch (cmd) {
      case CMD_TEMPO:
        if (pos < limit) pos++;
        break;
      case CMD_VOICE:
        if (pos < limit) pos++;
        break;
      case CMD_VOLUME:
        if (pos < limit) {
          pos++;
        }
        break;
      case CMD_NOTE_LEN:
        if (pos < limit) {
          defaultLen = Math.max(1, buf[pos++]);
        }
        break;
      case CMD_TIE: {
        if (events.length > 0 && events[events.length - 1].note === 97) {
          events.pop();
        }
        let dur = defaultLen;
        if (pos < limit && buf[pos] > 0 && buf[pos] < 128) {
          dur = buf[pos++];
        }
        tick += dur;
        events.push({ tick, ch: chIdx, note: 97, instIdx });
        break;
      }
      case CMD_DETUNE:
        if (pos + 1 < limit) pos += 2;
        break;
      case CMD_LOOP_START:
        if (pos < limit) pos++;
        break;
      case CMD_LOOP_END:
        break;
      // no data bytes
      case CMD_LOOP_BREAK:
        break;
      // no data bytes
      case CMD_LFO:
        if (pos + 3 < limit) pos += 4;
        break;
      case CMD_SSG_ENV:
        if (pos < limit) pos++;
        break;
      case CMD_PAN:
        if (pos < limit) pos++;
        break;
      case CMD_PORTAMENTO:
        if (pos + 1 < limit) pos += 2;
        break;
      default:
        if (cmd > CMD_REST && cmd < CMD_PORTAMENTO) {
          if (pos < limit) pos++;
        }
        break;
    }
    if (pos + 1 < limit && buf[pos] === 0 && buf[pos + 1] === 0) break;
  }
  return events;
}
function buildInstruments() {
  const insts = [];
  let id = 1;
  const add = (name, synthType, chipType, ops = 4) => {
    insts.push({
      id: id++,
      name,
      type: "synth",
      synthType,
      furnace: { ...DEFAULT_FURNACE, chipType, ops },
      effects: [],
      volume: 0,
      pan: 0
    });
  };
  for (let i = 1; i <= NUM_FM; i++) add(`FM ${i}`, "FurnaceOPNA", 1);
  for (let i = 1; i <= NUM_SSG; i++) add(`SSG ${i}`, "FurnaceAY", 6, 2);
  add("Rhythm", "FurnaceOPNA", 1);
  add("ADPCM", "FurnaceOPNA", 1);
  return insts;
}
function eventsToPatterns(events, numCh) {
  if (events.length === 0) {
    return [emptyPattern("p0", "Pattern 0", numCh, ROWS_PER_PAT)];
  }
  const maxTick = Math.max(...events.map((e) => e.tick));
  const totalRows = Math.max(ROWS_PER_PAT, maxTick + 1);
  const numPatterns = Math.ceil(totalRows / ROWS_PER_PAT);
  const patterns = [];
  for (let p = 0; p < numPatterns; p++) {
    patterns.push(emptyPattern(`p${p}`, `Pattern ${p}`, numCh, ROWS_PER_PAT));
  }
  for (const ev of events) {
    const absRow = Math.min(ev.tick, totalRows - 1);
    const patIdx = Math.min(Math.floor(absRow / ROWS_PER_PAT), numPatterns - 1);
    const row = absRow % ROWS_PER_PAT;
    const ch = Math.min(ev.ch, numCh - 1);
    const cell = patterns[patIdx].channels[ch].rows[row];
    if (ev.note === 97) {
      if (cell.note === 0) cell.note = 97;
    } else if (cell.note === 0) {
      cell.note = ev.note;
      cell.instrument = ev.instIdx + 1;
    }
  }
  return patterns;
}
function parsePMDFile(buffer) {
  const buf = new Uint8Array(buffer);
  const header = parseHeader(buf);
  const instruments = buildInstruments();
  const numCh = TOTAL_CH;
  let allEvents = [];
  let title = "";
  if (header) {
    title = findTitle(buf, header.headerSize);
    for (let ch = 0; ch < header.offsets.length; ch++) {
      const off = header.offsets[ch];
      if (off === 0 || off >= buf.length) continue;
      const instIdx = ch;
      try {
        const chEvents = parseChannelStream(buf, off, ch, instIdx);
        allEvents = allEvents.concat(chEvents);
      } catch {
      }
    }
  }
  const patterns = eventsToPatterns(allEvents, numCh);
  for (const pat of patterns) {
    for (let ch = 0; ch < numCh; ch++) {
      pat.channels[ch].name = CHANNEL_NAMES[ch] ?? `CH ${ch + 1}`;
    }
  }
  const songName = title || "PMD Song";
  return {
    name: songName,
    format: "PMD",
    patterns,
    instruments,
    songPositions: patterns.map((_, i) => i),
    songLength: patterns.length,
    restartPosition: 0,
    numChannels: numCh,
    initialSpeed: 6,
    initialBPM: 125
  };
}
export {
  parsePMDFile
};
