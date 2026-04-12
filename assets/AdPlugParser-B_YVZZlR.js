import { bY as DEFAULT_OPL3 } from "./main-BbV5VyEH.js";
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
function le16(buf, off) {
  return buf[off] | buf[off + 1] << 8;
}
function le32(buf, off) {
  return buf[off] | buf[off + 1] << 8 | buf[off + 2] << 16 | buf[off + 3] << 24 >>> 0;
}
function oplFnumToNote(fnum, block) {
  const freq = fnum * 49716 / (1 << 20 - block);
  if (freq <= 0) return 0;
  const note = Math.round(12 * Math.log2(freq / 440) + 69);
  return Math.max(1, Math.min(96, note));
}
function makeOPLInstrument(id, name) {
  return {
    id,
    name,
    type: "synth",
    synthType: "OPL3",
    opl3: { ...DEFAULT_OPL3 },
    effects: [],
    volume: 0,
    pan: 0
  };
}
function applyOPLRegisters(inst, regs, offset) {
  const o = inst.opl3;
  if (!o) return;
  const b = regs;
  const p = offset;
  o.op1Tremolo = b[p] >> 7 & 1;
  o.op1Vibrato = b[p] >> 6 & 1;
  o.op1SustainHold = b[p] >> 5 & 1;
  o.op1KSR = b[p] >> 4 & 1;
  o.op1Multi = b[p] & 15;
  o.op2Tremolo = b[p + 1] >> 7 & 1;
  o.op2Vibrato = b[p + 1] >> 6 & 1;
  o.op2SustainHold = b[p + 1] >> 5 & 1;
  o.op2KSR = b[p + 1] >> 4 & 1;
  o.op2Multi = b[p + 1] & 15;
  o.op1KSL = b[p + 2] >> 6 & 3;
  o.op1Level = b[p + 2] & 63;
  o.op2KSL = b[p + 3] >> 6 & 3;
  o.op2Level = b[p + 3] & 63;
  o.op1Attack = b[p + 4] >> 4 & 15;
  o.op1Decay = b[p + 4] & 15;
  o.op2Attack = b[p + 5] >> 4 & 15;
  o.op2Decay = b[p + 5] & 15;
  o.op1Sustain = b[p + 6] >> 4 & 15;
  o.op1Release = b[p + 6] & 15;
  o.op2Sustain = b[p + 7] >> 4 & 15;
  o.op2Release = b[p + 7] & 15;
  o.op1Waveform = b[p + 8] & 7;
  o.op2Waveform = b[p + 9] & 7;
  o.feedback = b[p + 10] >> 1 & 7;
  o.connection = b[p + 10] & 1;
}
function buildSong(name, patterns, instruments, songPositions, numChannels, speed, bpm) {
  return {
    name,
    format: "AdPlug",
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels,
    initialSpeed: speed,
    initialBPM: bpm
  };
}
function detectSubFormat(buf, filename) {
  if (buf.length >= 17) {
    const radSig = "RAD by REALiTY!!";
    let isRAD = true;
    for (let i = 0; i < 16; i++) {
      if (buf[i] !== radSig.charCodeAt(i)) {
        isRAD = false;
        break;
      }
    }
    if (isRAD) return "RAD";
  }
  if (buf.length >= 8) {
    const droSig = "DBRAWOPL";
    let isDRO = true;
    for (let i = 0; i < 8; i++) {
      if (buf[i] !== droSig.charCodeAt(i)) {
        isDRO = false;
        break;
      }
    }
    if (isDRO) return "DRO";
  }
  if (buf.length >= 4 && buf[0] === 67 && buf[1] === 84 && buf[2] === 77 && buf[3] === 70) {
    return "CMF";
  }
  const ext = filename.toLowerCase().split(".").pop() || "";
  if (ext === "hsc" && buf.length >= 1280) return "HSC";
  if (ext === "imf" || ext === "wlf") return "IMF";
  if (buf.length >= 6) {
    const possibleLen = le16(buf, 0);
    if (possibleLen > 0 && possibleLen <= buf.length - 2 && possibleLen % 4 === 0) {
      const reg = buf[2];
      if (reg >= 32 && reg <= 245) return "IMF";
    }
  }
  return "UNKNOWN";
}
function parseRAD(buf, filename) {
  const version = buf[16];
  if (version >= 33) return parseRADv2(buf, filename);
  return parseRADv1(buf, filename);
}
function parseRADv1(buf, filename) {
  const flags = buf[17];
  const speed = buf[18] || 6;
  const hasDescription = (flags & 128) !== 0;
  let pos = 19;
  if (hasDescription) {
    while (pos < buf.length && buf[pos] !== 0) pos++;
    pos++;
  }
  const instruments = [];
  while (pos < buf.length) {
    const instNum = buf[pos];
    if (instNum === 0) {
      pos++;
      break;
    }
    pos++;
    if (pos + 11 > buf.length) break;
    const inst = makeOPLInstrument(instruments.length + 1, `Inst ${instNum}`);
    applyOPLRegisters(inst, buf, pos);
    pos += 11;
    instruments.push(inst);
  }
  if (instruments.length === 0) instruments.push(makeOPLInstrument(1, "Default"));
  const songPositions = [];
  while (pos < buf.length) {
    const orderVal = buf[pos];
    if (orderVal === 255) {
      pos++;
      break;
    }
    songPositions.push(orderVal);
    pos++;
  }
  if (songPositions.length === 0) songPositions.push(0);
  const patternOffsetBase = pos;
  const maxPat = Math.max(...songPositions) + 1;
  const patternOffsets = [];
  for (let i = 0; i < maxPat && pos + 1 < buf.length; i++) {
    patternOffsets.push(le16(buf, pos));
    pos += 2;
  }
  const NUM_CH = 9;
  const ROWS = 64;
  const patterns = [];
  for (let p = 0; p < patternOffsets.length; p++) {
    const pat = emptyPattern(`p${p}`, `Pattern ${p}`, NUM_CH, ROWS);
    let ppos = patternOffsetBase + patternOffsets[p];
    if (ppos >= buf.length) {
      patterns.push(pat);
      continue;
    }
    let row = 0;
    while (row < ROWS && ppos < buf.length) {
      const rowByte = buf[ppos++];
      if (rowByte === 0) {
        row++;
        continue;
      }
      const ch = rowByte & 15;
      if (ch >= NUM_CH) {
        if (rowByte & 64) ppos += 2;
        if (rowByte & 32) ppos++;
        if (rowByte & 16) ppos += 2;
        continue;
      }
      const cell = pat.channels[ch].rows[row];
      if (rowByte & 64) {
        if (ppos >= buf.length) break;
        const noteOct = buf[ppos++];
        const octave = noteOct >> 4 & 7;
        const noteVal = noteOct & 15;
        if (noteVal === 15) {
          cell.note = 97;
        } else if (noteVal > 0) {
          cell.note = Math.max(1, Math.min(96, octave * 12 + noteVal));
        }
        if (ppos < buf.length) {
          cell.instrument = buf[ppos++];
        }
      }
      if (rowByte & 32) {
        if (ppos < buf.length) {
          cell.volume = Math.min(64, buf[ppos++]);
        }
      }
      if (rowByte & 16) {
        if (ppos + 1 < buf.length) {
          cell.effTyp = buf[ppos++];
          cell.eff = buf[ppos++];
        }
      }
      if (!(rowByte & 128)) row++;
    }
    patterns.push(pat);
  }
  while (patterns.length <= Math.max(...songPositions)) {
    patterns.push(emptyPattern(`p${patterns.length}`, `Pattern ${patterns.length}`, NUM_CH, ROWS));
  }
  const title = filename.replace(/\.rad$/i, "");
  return buildSong(`${title} (RAD v1)`, patterns, instruments, songPositions, NUM_CH, speed, 125);
}
function parseRADv2(buf, filename) {
  const NUM_CH = 9;
  const ROWS = 64;
  let pos = 17;
  const flags = buf[pos++];
  const speed = buf[pos++] || 6;
  const hasBPM = (flags & 32) !== 0;
  let bpm = 125;
  if (hasBPM && pos < buf.length) {
    bpm = buf[pos++];
  }
  if (flags & 128) {
    while (pos < buf.length && buf[pos] !== 0) pos++;
    pos++;
  }
  if (flags & 64) {
    while (pos < buf.length && buf[pos] !== 0) pos++;
    pos++;
  }
  const instruments = [];
  while (pos < buf.length) {
    const instNum = buf[pos];
    if (instNum === 0) {
      pos++;
      break;
    }
    pos++;
    if (pos + 11 > buf.length) break;
    const inst = makeOPLInstrument(instruments.length + 1, `Inst ${instNum}`);
    applyOPLRegisters(inst, buf, pos);
    pos += 11;
    instruments.push(inst);
  }
  if (instruments.length === 0) instruments.push(makeOPLInstrument(1, "Default"));
  const songPositions = [];
  if (pos < buf.length) {
    const orderLen = buf[pos++];
    for (let i = 0; i < orderLen && pos < buf.length; i++) {
      songPositions.push(le16(buf, pos));
      pos += 2;
    }
  }
  if (songPositions.length === 0) songPositions.push(0);
  const maxPat = Math.max(...songPositions) + 1;
  const patterns = [];
  for (let p = 0; p < maxPat; p++) {
    patterns.push(emptyPattern(`p${p}`, `Pattern ${p}`, NUM_CH, ROWS));
  }
  const title = filename.replace(/\.rad$/i, "");
  return buildSong(`${title} (RAD v2)`, patterns, instruments, songPositions, NUM_CH, speed, bpm);
}
function parseHSC(buf, filename) {
  const NUM_CH = 9;
  const ROWS = 64;
  const songPositions = [];
  let maxPat = 0;
  for (let i = 0; i < 128; i++) {
    const val = buf[i];
    if (val === 255) break;
    songPositions.push(val);
    if (val > maxPat) maxPat = val;
  }
  if (songPositions.length === 0) songPositions.push(0);
  const instruments = [];
  for (let i = 0; i < 48; i++) {
    const off = 128 + i * 12;
    if (off + 12 > buf.length) break;
    const inst = makeOPLInstrument(i + 1, `HSC ${i + 1}`);
    applyOPLRegisters(inst, buf, off);
    instruments.push(inst);
  }
  if (instruments.length === 0) instruments.push(makeOPLInstrument(1, "Default"));
  const PATTERN_SIZE = ROWS * NUM_CH * 2;
  const patDataStart = 1280;
  const patterns = [];
  for (let p = 0; p <= maxPat; p++) {
    const pat = emptyPattern(`p${p}`, `Pattern ${p}`, NUM_CH, ROWS);
    const pBase = patDataStart + p * PATTERN_SIZE;
    if (pBase + PATTERN_SIZE > buf.length) {
      patterns.push(pat);
      continue;
    }
    for (let row = 0; row < ROWS; row++) {
      for (let ch = 0; ch < NUM_CH; ch++) {
        const off = pBase + (row * NUM_CH + ch) * 2;
        const b0 = buf[off];
        const b1 = buf[off + 1];
        const cell = pat.channels[ch].rows[row];
        const noteVal = b0 & 15;
        const octave = b0 >> 4 & 15;
        if (noteVal > 0 && noteVal <= 12 && octave > 0) {
          cell.note = Math.max(1, Math.min(96, (octave - 1) * 12 + noteVal));
        } else if (b0 === 128) {
          cell.note = 97;
        }
        const instVal = b1 >> 4 & 15;
        if (instVal > 0) cell.instrument = instVal;
        const fx = b1 & 15;
        if (fx > 0) cell.effTyp = fx;
      }
    }
    patterns.push(pat);
  }
  const title = filename.replace(/\.hsc$/i, "");
  return buildSong(`${title} (HSC)`, patterns, instruments, songPositions, NUM_CH, 6, 125);
}
function walkOPLRegisters(pairs) {
  const NUM_CH = 9;
  const fnumLo = new Uint8Array(NUM_CH);
  const fnumHi = new Uint8Array(NUM_CH);
  const keyOn = new Uint8Array(NUM_CH);
  const events = [];
  let tick = 0;
  for (const { reg, val, delay } of pairs) {
    tick += delay;
    if (reg >= 160 && reg <= 168) {
      fnumLo[reg - 160] = val;
    } else if (reg >= 176 && reg <= 184) {
      const ch = reg - 176;
      fnumHi[ch] = val;
      const on = (val & 32) !== 0;
      if (on !== (keyOn[ch] !== 0)) {
        const fnum = fnumLo[ch] | (val & 3) << 8;
        const block = val >> 2 & 7;
        const note = on ? oplFnumToNote(fnum, block) : 97;
        events.push({ tick, ch, note, on, instIdx: 0 });
        keyOn[ch] = on ? 1 : 0;
      }
    }
  }
  return events;
}
function oplEventsToPatterns(events, numCh, ticksPerRow) {
  if (events.length === 0) {
    return [emptyPattern("p0", "Pattern 1", numCh, 64)];
  }
  const maxTick = Math.max(...events.map((e) => e.tick));
  const totalRows = Math.max(64, Math.ceil(maxTick / ticksPerRow) + 1);
  const ROWS_PER_PAT = 64;
  const numPats = Math.ceil(totalRows / ROWS_PER_PAT);
  const patterns = [];
  for (let p = 0; p < numPats; p++) {
    patterns.push(emptyPattern(`p${p}`, `Pattern ${p + 1}`, numCh, ROWS_PER_PAT));
  }
  for (const ev of events) {
    const globalRow = Math.floor(ev.tick / ticksPerRow);
    const patIdx = Math.min(Math.floor(globalRow / ROWS_PER_PAT), numPats - 1);
    const row = Math.min(globalRow % ROWS_PER_PAT, ROWS_PER_PAT - 1);
    const ch = Math.min(ev.ch, numCh - 1);
    const cell = patterns[patIdx].channels[ch].rows[row];
    if (ev.on && cell.note === 0) {
      cell.note = ev.note;
      cell.instrument = ev.instIdx + 1;
    } else if (!ev.on && cell.note === 0) {
      cell.note = 97;
    }
  }
  return patterns;
}
function parseDRO(buf, filename) {
  const versionMajor = le16(buf, 10);
  if (versionMajor >= 2) return parseDROv2(buf, filename);
  return parseDROv1(buf, filename);
}
function parseDROv1(buf, filename) {
  const NUM_CH = 9;
  const dataLength = le32(buf, 16);
  const hwType = buf[20];
  const numCh = hwType === 1 ? 18 : NUM_CH;
  const pairs = [];
  let pos = 21;
  const end = Math.min(pos + dataLength, buf.length);
  let bank = 0;
  while (pos < end) {
    const code = buf[pos++];
    if (pos >= end) break;
    if (code === 0) {
      pairs.push({ reg: 0, val: 0, delay: buf[pos++] + 1 });
    } else if (code === 1) {
      if (pos + 1 >= end) break;
      pairs.push({ reg: 0, val: 0, delay: le16(buf, pos) + 1 });
      pos += 2;
    } else if (code === 2) {
      bank = 0;
      pos++;
    } else if (code === 3) {
      bank = 1;
      pos++;
    } else {
      const reg = code + (bank ? 256 : 0);
      const val = buf[pos++];
      pairs.push({ reg: reg & 255, val, delay: 0 });
    }
  }
  const events = walkOPLRegisters(pairs);
  const ticksPerRow = 20;
  const patterns = oplEventsToPatterns(events, numCh, ticksPerRow);
  const songPositions = patterns.map((_, i) => i);
  const instruments = [makeOPLInstrument(1, hwType === 1 ? "OPL3 FM" : "OPL2 FM")];
  const title = filename.replace(/\.dro$/i, "");
  return buildSong(`${title} (DRO)`, patterns, instruments, songPositions, numCh, 6, 125);
}
function parseDROv2(buf, filename) {
  const totalPairs = le32(buf, 12);
  const oplFormat = buf[21];
  const shortDelay = buf[23];
  const longDelay = buf[24];
  const codemapSize = buf[25];
  const numCh = oplFormat === 2 ? 18 : 9;
  const codemap = new Uint8Array(codemapSize);
  let pos = 26;
  for (let i = 0; i < codemapSize && pos < buf.length; i++) {
    codemap[i] = buf[pos++];
  }
  const pairs = [];
  let pairsRead = 0;
  while (pairsRead < totalPairs && pos + 1 < buf.length) {
    const codeIdx = buf[pos++];
    const val = buf[pos++];
    pairsRead++;
    if (codeIdx === shortDelay) {
      pairs.push({ reg: 0, val: 0, delay: val + 1 });
    } else if (codeIdx === longDelay) {
      pairs.push({ reg: 0, val: 0, delay: (val + 1) * 256 });
    } else if (codeIdx < codemapSize) {
      const reg = codemap[codeIdx];
      pairs.push({ reg, val, delay: 0 });
    }
  }
  const events = walkOPLRegisters(pairs);
  const ticksPerRow = 20;
  const patterns = oplEventsToPatterns(events, numCh, ticksPerRow);
  const songPositions = patterns.map((_, i) => i);
  const instruments = [makeOPLInstrument(1, oplFormat === 2 ? "OPL3 FM" : "OPL2 FM")];
  const title = filename.replace(/\.dro$/i, "");
  return buildSong(`${title} (DRO v2)`, patterns, instruments, songPositions, numCh, 6, 125);
}
function parseIMF(buf, filename) {
  const NUM_CH = 9;
  let dataStart = 0;
  let dataEnd = buf.length;
  const possibleLen = le16(buf, 0);
  if (possibleLen > 0 && possibleLen + 2 <= buf.length && possibleLen % 4 === 0) {
    dataStart = 2;
    dataEnd = 2 + possibleLen;
  }
  const pairs = [];
  let pos = dataStart;
  while (pos + 3 < dataEnd) {
    const reg = buf[pos];
    const val = buf[pos + 1];
    const delay = le16(buf, pos + 2);
    pos += 4;
    if (reg > 0) {
      pairs.push({ reg, val, delay: 0 });
    }
    if (delay > 0) {
      pairs.push({ reg: 0, val: 0, delay });
    }
  }
  const events = walkOPLRegisters(pairs);
  const ticksPerRow = 10;
  const patterns = oplEventsToPatterns(events, NUM_CH, ticksPerRow);
  const songPositions = patterns.map((_, i) => i);
  const instruments = [makeOPLInstrument(1, "OPL2 FM")];
  const title = filename.replace(/\.(imf|wlf)$/i, "");
  return buildSong(`${title} (IMF)`, patterns, instruments, songPositions, NUM_CH, 6, 125);
}
function parseCMF(buf, filename) {
  const NUM_CH = 9;
  const ROWS = 64;
  const instOffset = le16(buf, 6);
  const musicOffset = le16(buf, 8);
  const ticksPerSecond = le16(buf, 12);
  const titleOffset = le16(buf, 14);
  const authorOffset = le16(buf, 16);
  const numInstruments = le16(buf, 36);
  let title = "";
  if (titleOffset > 0 && titleOffset < buf.length) {
    let i = titleOffset;
    while (i < buf.length && buf[i] !== 0) title += String.fromCharCode(buf[i++]);
  }
  let author = "";
  if (authorOffset > 0 && authorOffset < buf.length) {
    let i = authorOffset;
    while (i < buf.length && buf[i] !== 0) author += String.fromCharCode(buf[i++]);
  }
  const instruments = [];
  for (let i = 0; i < numInstruments; i++) {
    const off = instOffset + i * 16;
    if (off + 16 > buf.length) break;
    const inst = makeOPLInstrument(i + 1, `CMF ${i + 1}`);
    applyOPLRegisters(inst, buf, off);
    instruments.push(inst);
  }
  if (instruments.length === 0) instruments.push(makeOPLInstrument(1, "Default"));
  const tickRate = ticksPerSecond > 0 ? ticksPerSecond : 120;
  const channelMap = /* @__PURE__ */ new Map();
  let nextOPLCh = 0;
  const noteEvents = [];
  let pos = musicOffset;
  let tick = 0;
  while (pos < buf.length) {
    let delta = 0;
    let b;
    do {
      if (pos >= buf.length) break;
      b = buf[pos++];
      delta = delta << 7 | b & 127;
    } while (b & 128);
    tick += delta;
    if (pos >= buf.length) break;
    const status = buf[pos];
    let cmd;
    if (status & 128) {
      cmd = status;
      pos++;
    } else {
      break;
    }
    const msgType = cmd & 240;
    const midiCh = cmd & 15;
    if (!channelMap.has(midiCh) && nextOPLCh < NUM_CH) {
      channelMap.set(midiCh, nextOPLCh++);
    }
    const oplCh = channelMap.get(midiCh) ?? 0;
    if (msgType === 144) {
      if (pos + 1 >= buf.length) break;
      const note = buf[pos++];
      const vel = buf[pos++];
      if (vel > 0 && note > 0) {
        const midiNote = Math.max(1, Math.min(96, note));
        noteEvents.push({ tick, ch: oplCh, note: midiNote, inst: midiCh + 1, on: true });
      } else {
        noteEvents.push({ tick, ch: oplCh, note: 97, inst: 0, on: false });
      }
    } else if (msgType === 128) {
      if (pos + 1 >= buf.length) break;
      pos += 2;
      noteEvents.push({ tick, ch: oplCh, note: 97, inst: 0, on: false });
    } else if (msgType === 192) {
      if (pos >= buf.length) break;
      pos++;
    } else if (msgType === 176 || msgType === 224) {
      if (pos + 1 >= buf.length) break;
      pos += 2;
    } else if (msgType === 208) {
      if (pos >= buf.length) break;
      pos++;
    } else if (msgType === 240) {
      if (cmd === 255) {
        if (pos >= buf.length) break;
        const metaType = buf[pos++];
        let metaLen = 0;
        do {
          if (pos >= buf.length) break;
          b = buf[pos++];
          metaLen = metaLen << 7 | b & 127;
        } while (b & 128);
        if (metaType === 47) break;
        pos += metaLen;
      } else if (cmd === 240) {
        while (pos < buf.length && buf[pos] !== 247) pos++;
        if (pos < buf.length) pos++;
      }
    }
  }
  const ticksPerRow = Math.max(1, Math.round(tickRate / 8));
  const totalRows = noteEvents.length > 0 ? Math.ceil(Math.max(...noteEvents.map((e) => e.tick)) / ticksPerRow) + 1 : ROWS;
  const ROWS_PER_PAT = ROWS;
  const numPats = Math.max(1, Math.ceil(totalRows / ROWS_PER_PAT));
  const patterns = [];
  for (let p = 0; p < numPats; p++) {
    patterns.push(emptyPattern(`p${p}`, `Pattern ${p + 1}`, NUM_CH, ROWS_PER_PAT));
  }
  for (const ev of noteEvents) {
    const globalRow = Math.floor(ev.tick / ticksPerRow);
    const patIdx = Math.min(Math.floor(globalRow / ROWS_PER_PAT), numPats - 1);
    const row = Math.min(globalRow % ROWS_PER_PAT, ROWS_PER_PAT - 1);
    const ch = Math.min(ev.ch, NUM_CH - 1);
    const cell = patterns[patIdx].channels[ch].rows[row];
    if (ev.on && cell.note === 0) {
      cell.note = ev.note;
      if (ev.inst > 0 && ev.inst <= instruments.length) {
        cell.instrument = ev.inst;
      }
    } else if (!ev.on && cell.note === 0) {
      cell.note = 97;
    }
  }
  const songPositions = patterns.map((_, i) => i);
  const displayName = title || filename.replace(/\.cmf$/i, "");
  const suffix = author ? ` — ${author}` : "";
  return buildSong(`${displayName}${suffix} (CMF)`, patterns, instruments, songPositions, NUM_CH, 6, 125);
}
function isAdPlugFormat(buffer, filename) {
  const buf = new Uint8Array(buffer);
  return detectSubFormat(buf, filename ?? "") !== "UNKNOWN";
}
function parseAdPlugFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  const name = filename ?? "unknown.bin";
  const subFormat = detectSubFormat(buf, name);
  switch (subFormat) {
    case "RAD":
      return parseRAD(buf, name);
    case "HSC":
      return parseHSC(buf, name);
    case "DRO":
      return parseDRO(buf, name);
    case "IMF":
      return parseIMF(buf, name);
    case "CMF":
      return parseCMF(buf, name);
    default: {
      const instruments = [makeOPLInstrument(1, "OPL2 FM")];
      const patterns = [emptyPattern("p0", "Pattern 1", 9, 64)];
      const title = name.replace(/\.[^.]+$/, "");
      return buildSong(`${title} (AdPlug)`, patterns, instruments, [0], 9, 6, 125);
    }
  }
}
export {
  isAdPlugFormat,
  parseAdPlugFile
};
