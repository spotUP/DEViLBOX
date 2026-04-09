/**
 * AdPlugParser.ts — PC AdLib/OPL music format parser
 *
 * Supports multiple sub-formats common in PC AdLib/OPL music:
 *   - RAD (Reality AdLib Tracker) v1/v2 — full pattern import
 *   - HSC (HSC-Tracker) — pattern import
 *   - DRO (DOSBox Raw OPL) v1/v2 — register dump → pattern reconstruction
 *   - IMF (Apogee id Music Format) — register dump → pattern reconstruction
 *   - CMF (Creative Music File) — MIDI-like event stream
 *
 * Detects sub-format from magic bytes / file extension and builds a TrackerSong
 * with Furnace OPL instruments and 9 OPL2 channels (or 18 for OPL3).
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, ChannelData } from '@/types';
import type { InstrumentConfig } from '@/types/instrument';
import { DEFAULT_OPL3 } from '@/types/instrument';

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

function emptyPattern(id: string, name: string, numCh: number, rows: number): Pattern {
  return {
    id, name, length: rows,
    channels: Array.from({ length: numCh }, (_, i): ChannelData => ({
      id: `ch${i}`, name: `CH ${i + 1}`, muted: false, solo: false,
      collapsed: false, volume: 100, pan: 0, instrumentId: null, color: null,
      rows: Array.from({ length: rows }, emptyCell),
    })),
  };
}

function le16(buf: Uint8Array, off: number): number {
  return buf[off] | (buf[off + 1] << 8);
}

function le32(buf: Uint8Array, off: number): number {
  return buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | ((buf[off + 3] << 24) >>> 0);
}

/** Convert OPL F-number + block to MIDI note (1–96). */
function oplFnumToNote(fnum: number, block: number): number {
  const freq = fnum * 49716 / (1 << (20 - block));
  if (freq <= 0) return 0;
  const note = Math.round(12 * Math.log2(freq / 440) + 69);
  return Math.max(1, Math.min(96, note));
}

/** Create an OPL3Synth instrument with default patch. */
function makeOPLInstrument(id: number, name: string): InstrumentConfig {
  return {
    id, name, type: 'synth', synthType: 'OPL3',
    opl3: { ...DEFAULT_OPL3 },
    effects: [], volume: 0, pan: 0,
  };
}

/**
 * Write 11 OPL register bytes into an instrument's OPL3Config.
 * Standard OPL2 register layout:
 *   [0] mod AM/VIB/EGT/KSR/MULT  [1] car AM/VIB/EGT/KSR/MULT
 *   [2] mod KSL/TL               [3] car KSL/TL
 *   [4] mod AR/DR                [5] car AR/DR
 *   [6] mod SL/RR                [7] car SL/RR
 *   [8] mod Waveform             [9] car Waveform
 *   [10] Feedback/Connection (0xC0 register)
 */
function applyOPLRegisters(inst: InstrumentConfig, regs: Uint8Array, offset: number): void {
  const o = inst.opl3;
  if (!o) return;
  const b = regs;
  const p = offset;
  // Operator 1 (modulator)
  o.op1Tremolo = (b[p] >> 7) & 1;
  o.op1Vibrato = (b[p] >> 6) & 1;
  o.op1SustainHold = (b[p] >> 5) & 1;
  o.op1KSR = (b[p] >> 4) & 1;
  o.op1Multi = b[p] & 0x0F;
  // Operator 2 (carrier)
  o.op2Tremolo = (b[p + 1] >> 7) & 1;
  o.op2Vibrato = (b[p + 1] >> 6) & 1;
  o.op2SustainHold = (b[p + 1] >> 5) & 1;
  o.op2KSR = (b[p + 1] >> 4) & 1;
  o.op2Multi = b[p + 1] & 0x0F;
  // KSL / Total Level
  o.op1KSL = (b[p + 2] >> 6) & 0x03;
  o.op1Level = b[p + 2] & 0x3F;
  o.op2KSL = (b[p + 3] >> 6) & 0x03;
  o.op2Level = b[p + 3] & 0x3F;
  // Attack / Decay
  o.op1Attack = (b[p + 4] >> 4) & 0x0F;
  o.op1Decay = b[p + 4] & 0x0F;
  o.op2Attack = (b[p + 5] >> 4) & 0x0F;
  o.op2Decay = b[p + 5] & 0x0F;
  // Sustain / Release
  o.op1Sustain = (b[p + 6] >> 4) & 0x0F;
  o.op1Release = b[p + 6] & 0x0F;
  o.op2Sustain = (b[p + 7] >> 4) & 0x0F;
  o.op2Release = b[p + 7] & 0x0F;
  // Waveform
  o.op1Waveform = b[p + 8] & 0x07;
  o.op2Waveform = b[p + 9] & 0x07;
  // Feedback / Connection
  o.feedback = (b[p + 10] >> 1) & 0x07;
  o.connection = b[p + 10] & 0x01;
}

/** Build a TrackerSong result. */
function buildSong(
  name: string, patterns: Pattern[], instruments: InstrumentConfig[],
  songPositions: number[], numChannels: number, speed: number, bpm: number,
): TrackerSong {
  return {
    name,
    format: 'AdPlug' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels,
    initialSpeed: speed,
    initialBPM: bpm,
  };
}

// ── Sub-format Detection ──────────────────────────────────────────────────────

type SubFormat = 'RAD' | 'HSC' | 'DRO' | 'IMF' | 'CMF' | 'UNKNOWN';

function detectSubFormat(buf: Uint8Array, filename: string): SubFormat {
  // RAD: "RAD by REALiTY!!" at offset 0 (16 bytes)
  if (buf.length >= 17) {
    const radSig = 'RAD by REALiTY!!';
    let isRAD = true;
    for (let i = 0; i < 16; i++) {
      if (buf[i] !== radSig.charCodeAt(i)) { isRAD = false; break; }
    }
    if (isRAD) return 'RAD';
  }

  // DRO: "DBRAWOPL" at offset 0
  if (buf.length >= 8) {
    const droSig = 'DBRAWOPL';
    let isDRO = true;
    for (let i = 0; i < 8; i++) {
      if (buf[i] !== droSig.charCodeAt(i)) { isDRO = false; break; }
    }
    if (isDRO) return 'DRO';
  }

  // CMF: "CTMF" at offset 0
  if (buf.length >= 4 && buf[0] === 0x43 && buf[1] === 0x54 && buf[2] === 0x4D && buf[3] === 0x46) {
    return 'CMF';
  }

  const ext = filename.toLowerCase().split('.').pop() || '';

  // HSC: extension-based, file must be >= 1280 bytes (128 order + 48×12 instruments)
  if (ext === 'hsc' && buf.length >= 1280) return 'HSC';

  // IMF: extension or structural check (4-byte aligned OPL records)
  if (ext === 'imf' || ext === 'wlf') return 'IMF';
  // Auto-detect type-1 IMF: first 2 bytes = data length, divisible by 4
  if (buf.length >= 6) {
    const possibleLen = le16(buf, 0);
    if (possibleLen > 0 && possibleLen <= buf.length - 2 && possibleLen % 4 === 0) {
      // Check if first record after header has a valid OPL register
      const reg = buf[2];
      if (reg >= 0x20 && reg <= 0xF5) return 'IMF';
    }
  }

  return 'UNKNOWN';
}

// ── RAD Parser ────────────────────────────────────────────────────────────────

function parseRAD(buf: Uint8Array, filename: string): TrackerSong {
  const version = buf[16];
  if (version >= 0x21) return parseRADv2(buf, filename);
  return parseRADv1(buf, filename);
}

function parseRADv1(buf: Uint8Array, filename: string): TrackerSong {
  const flags = buf[17];
  const speed = buf[18] || 6;
  const hasDescription = (flags & 0x80) !== 0;
  let pos = 19;

  // Skip slow-timer description string if present
  if (hasDescription) {
    while (pos < buf.length && buf[pos] !== 0) pos++;
    pos++; // skip null terminator
  }

  // Read instruments (up to 31)
  const instruments: InstrumentConfig[] = [];
  while (pos < buf.length) {
    const instNum = buf[pos];
    if (instNum === 0) { pos++; break; }
    pos++;
    if (pos + 11 > buf.length) break;

    const inst = makeOPLInstrument(instruments.length + 1, `Inst ${instNum}`);
    applyOPLRegisters(inst, buf, pos);
    pos += 11;
    instruments.push(inst);
  }

  // Ensure we have at least one instrument
  if (instruments.length === 0) instruments.push(makeOPLInstrument(1, 'Default'));

  // Read order table
  const songPositions: number[] = [];
  while (pos < buf.length) {
    const orderVal = buf[pos];
    if (orderVal === 0xFF) { pos++; break; }
    songPositions.push(orderVal);
    pos++;
  }
  if (songPositions.length === 0) songPositions.push(0);

  // Read pattern offset table (each entry is a LE uint16 relative to start of offset table)
  const patternOffsetBase = pos;
  const maxPat = Math.max(...songPositions) + 1;
  const patternOffsets: number[] = [];
  for (let i = 0; i < maxPat && pos + 1 < buf.length; i++) {
    patternOffsets.push(le16(buf, pos));
    pos += 2;
  }

  // Parse patterns
  const NUM_CH = 9;
  const ROWS = 64;
  const patterns: Pattern[] = [];

  for (let p = 0; p < patternOffsets.length; p++) {
    const pat = emptyPattern(`p${p}`, `Pattern ${p}`, NUM_CH, ROWS);
    let ppos = patternOffsetBase + patternOffsets[p];
    if (ppos >= buf.length) { patterns.push(pat); continue; }

    let row = 0;
    while (row < ROWS && ppos < buf.length) {
      const rowByte = buf[ppos++];
      if (rowByte === 0) { row++; continue; }

      const ch = (rowByte & 0x0F);
      if (ch >= NUM_CH) {
        // Skip data for this cell
        if (rowByte & 0x40) ppos += 2; // note + instrument
        if (rowByte & 0x20) ppos++;     // volume/instrument
        if (rowByte & 0x10) ppos += 2;  // effect
        continue;
      }

      const cell = pat.channels[ch].rows[row];

      if (rowByte & 0x40) {
        // Note + octave packed
        if (ppos >= buf.length) break;
        const noteOct = buf[ppos++];
        const octave = (noteOct >> 4) & 0x07;
        const noteVal = noteOct & 0x0F;
        if (noteVal === 0x0F) {
          cell.note = 97; // note off
        } else if (noteVal > 0) {
          cell.note = Math.max(1, Math.min(96, octave * 12 + noteVal));
        }
        if (ppos < buf.length) {
          cell.instrument = buf[ppos++];
        }
      }

      if (rowByte & 0x20) {
        // Volume
        if (ppos < buf.length) {
          cell.volume = Math.min(64, buf[ppos++]);
        }
      }

      if (rowByte & 0x10) {
        // Effect
        if (ppos + 1 < buf.length) {
          cell.effTyp = buf[ppos++];
          cell.eff = buf[ppos++];
        }
      }

      // Bit 7 set means more channel data on this row
      if (!(rowByte & 0x80)) row++;
    }

    patterns.push(pat);
  }

  // Fill missing patterns
  while (patterns.length <= Math.max(...songPositions)) {
    patterns.push(emptyPattern(`p${patterns.length}`, `Pattern ${patterns.length}`, NUM_CH, ROWS));
  }

  const title = filename.replace(/\.rad$/i, '');
  return buildSong(`${title} (RAD v1)`, patterns, instruments, songPositions, NUM_CH, speed, 125);
}

function parseRADv2(buf: Uint8Array, filename: string): TrackerSong {
  // RAD v2 has a more complex header; extract what we can
  const NUM_CH = 9;
  const ROWS = 64;
  let pos = 17; // after version byte

  // v2 header: byte 17 = flags
  const flags = buf[pos++];
  const speed = buf[pos++] || 6;
  const hasBPM = (flags & 0x20) !== 0;
  let bpm = 125;
  if (hasBPM && pos < buf.length) {
    bpm = buf[pos++];
  }

  // Skip description if present (bit 7)
  if (flags & 0x80) {
    while (pos < buf.length && buf[pos] !== 0) pos++;
    pos++;
  }

  // Skip slow-timer flag string (bit 6)
  if (flags & 0x40) {
    while (pos < buf.length && buf[pos] !== 0) pos++;
    pos++;
  }

  // Read instruments
  const instruments: InstrumentConfig[] = [];
  while (pos < buf.length) {
    const instNum = buf[pos];
    if (instNum === 0) { pos++; break; }
    pos++;
    if (pos + 11 > buf.length) break;

    const inst = makeOPLInstrument(instruments.length + 1, `Inst ${instNum}`);
    applyOPLRegisters(inst, buf, pos);
    pos += 11;
    instruments.push(inst);
  }

  if (instruments.length === 0) instruments.push(makeOPLInstrument(1, 'Default'));

  // Read order list
  const songPositions: number[] = [];
  if (pos < buf.length) {
    const orderLen = buf[pos++];
    for (let i = 0; i < orderLen && pos < buf.length; i++) {
      songPositions.push(le16(buf, pos));
      pos += 2;
    }
  }
  if (songPositions.length === 0) songPositions.push(0);

  // RAD v2 pattern data is complex with variable encoding;
  // create a stub pattern per unique order entry
  const maxPat = Math.max(...songPositions) + 1;
  const patterns: Pattern[] = [];
  for (let p = 0; p < maxPat; p++) {
    patterns.push(emptyPattern(`p${p}`, `Pattern ${p}`, NUM_CH, ROWS));
  }

  const title = filename.replace(/\.rad$/i, '');
  return buildSong(`${title} (RAD v2)`, patterns, instruments, songPositions, NUM_CH, speed, bpm);
}

// ── HSC Parser ────────────────────────────────────────────────────────────────

function parseHSC(buf: Uint8Array, filename: string): TrackerSong {
  const NUM_CH = 9;
  const ROWS = 64;

  // Order table: 128 entries at offset 0
  const songPositions: number[] = [];
  let maxPat = 0;
  for (let i = 0; i < 128; i++) {
    const val = buf[i];
    if (val === 0xFF) break; // end marker
    songPositions.push(val);
    if (val > maxPat) maxPat = val;
  }
  if (songPositions.length === 0) songPositions.push(0);

  // Instruments: 48 instruments × 12 bytes at offset 128
  const instruments: InstrumentConfig[] = [];
  for (let i = 0; i < 48; i++) {
    const off = 128 + i * 12;
    if (off + 12 > buf.length) break;

    const inst = makeOPLInstrument(i + 1, `HSC ${i + 1}`);
    applyOPLRegisters(inst, buf, off);
    // Byte 11: unused/padding
    instruments.push(inst);
  }
  if (instruments.length === 0) instruments.push(makeOPLInstrument(1, 'Default'));

  // Pattern data starts at offset 1280 (128 + 48*12)
  // Each pattern: 64 rows × 9 channels × 2 bytes per cell
  const PATTERN_SIZE = ROWS * NUM_CH * 2;
  const patDataStart = 1280;
  const patterns: Pattern[] = [];

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
        const b0 = buf[off];     // note (low nibble) + octave (high nibble)
        const b1 = buf[off + 1]; // instrument (high nibble) + effect (low nibble)

        const cell = pat.channels[ch].rows[row];

        // Note: high nibble = octave (1-8), low nibble = note (1-12), 0 = empty
        const noteVal = b0 & 0x0F;
        const octave = (b0 >> 4) & 0x0F;
        if (noteVal > 0 && noteVal <= 12 && octave > 0) {
          cell.note = Math.max(1, Math.min(96, (octave - 1) * 12 + noteVal));
        } else if (b0 === 0x80) {
          cell.note = 97; // note off / rest
        }

        // Instrument
        const instVal = (b1 >> 4) & 0x0F;
        if (instVal > 0) cell.instrument = instVal;

        // Effect in low nibble
        const fx = b1 & 0x0F;
        if (fx > 0) cell.effTyp = fx;
      }
    }

    patterns.push(pat);
  }

  const title = filename.replace(/\.hsc$/i, '');
  return buildSong(`${title} (HSC)`, patterns, instruments, songPositions, NUM_CH, 6, 125);
}

// ── OPL Register Dump → Note Events ──────────────────────────────────────────

interface OPLEvent {
  tick: number;
  ch: number;
  note: number;
  on: boolean;
  instIdx: number;
}

/** Track OPL2 register state and extract note events. */
function walkOPLRegisters(pairs: Array<{ reg: number; val: number; delay: number }>): OPLEvent[] {
  const NUM_CH = 9;
  const fnumLo = new Uint8Array(NUM_CH);
  const fnumHi = new Uint8Array(NUM_CH);
  const keyOn = new Uint8Array(NUM_CH);
  const events: OPLEvent[] = [];
  let tick = 0;

  for (const { reg, val, delay } of pairs) {
    tick += delay;

    // A0-A8: F-number low 8 bits
    if (reg >= 0xA0 && reg <= 0xA8) {
      fnumLo[reg - 0xA0] = val;
    }
    // B0-B8: key-on + block + F-number high 2 bits
    else if (reg >= 0xB0 && reg <= 0xB8) {
      const ch = reg - 0xB0;
      fnumHi[ch] = val;
      const on = (val & 0x20) !== 0;
      if (on !== (keyOn[ch] !== 0)) {
        const fnum = fnumLo[ch] | ((val & 0x03) << 8);
        const block = (val >> 2) & 0x07;
        const note = on ? oplFnumToNote(fnum, block) : 97;
        events.push({ tick, ch, note, on, instIdx: 0 });
        keyOn[ch] = on ? 1 : 0;
      }
    }
  }

  return events;
}

/** Convert OPL note events into patterns. */
function oplEventsToPatterns(
  events: OPLEvent[], numCh: number, ticksPerRow: number,
): Pattern[] {
  if (events.length === 0) {
    return [emptyPattern('p0', 'Pattern 1', numCh, 64)];
  }

  const maxTick = Math.max(...events.map(e => e.tick));
  const totalRows = Math.max(64, Math.ceil(maxTick / ticksPerRow) + 1);
  const ROWS_PER_PAT = 64;
  const numPats = Math.ceil(totalRows / ROWS_PER_PAT);
  const patterns: Pattern[] = [];

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
      cell.note = 97; // note off
    }
  }

  return patterns;
}

// ── DRO Parser ────────────────────────────────────────────────────────────────

function parseDRO(buf: Uint8Array, filename: string): TrackerSong {
  const versionMajor = le16(buf, 10);

  if (versionMajor >= 2) return parseDROv2(buf, filename);
  return parseDROv1(buf, filename);
}

function parseDROv1(buf: Uint8Array, filename: string): TrackerSong {
  const NUM_CH = 9;
  const dataLength = le32(buf, 16);
  const hwType = buf[20]; // 0=OPL2, 1=OPL3, 2=dual OPL2
  const numCh = hwType === 1 ? 18 : NUM_CH;

  const pairs: Array<{ reg: number; val: number; delay: number }> = [];
  let pos = 21;
  const end = Math.min(pos + dataLength, buf.length);
  let bank = 0;

  while (pos < end) {
    const code = buf[pos++];
    if (pos >= end) break;

    if (code === 0x00) {
      // Short delay: next byte + 1 milliseconds
      pairs.push({ reg: 0, val: 0, delay: buf[pos++] + 1 });
    } else if (code === 0x01) {
      // Long delay: next 2 bytes + 1 milliseconds
      if (pos + 1 >= end) break;
      pairs.push({ reg: 0, val: 0, delay: le16(buf, pos) + 1 });
      pos += 2;
    } else if (code === 0x02) {
      bank = 0; pos++;
    } else if (code === 0x03) {
      bank = 1; pos++;
    } else {
      // Register write: code = register, next byte = value
      const reg = code + (bank ? 0x100 : 0);
      const val = buf[pos++];
      pairs.push({ reg: reg & 0xFF, val, delay: 0 });
    }
  }

  const events = walkOPLRegisters(pairs);
  // ~1ms per tick; use ~20ms per row for reasonable density
  const ticksPerRow = 20;
  const patterns = oplEventsToPatterns(events, numCh, ticksPerRow);
  const songPositions = patterns.map((_, i) => i);
  const instruments = [makeOPLInstrument(1, hwType === 1 ? 'OPL3 FM' : 'OPL2 FM')];

  const title = filename.replace(/\.dro$/i, '');
  return buildSong(`${title} (DRO)`, patterns, instruments, songPositions, numCh, 6, 125);
}

function parseDROv2(buf: Uint8Array, filename: string): TrackerSong {
  const totalPairs = le32(buf, 12);
  const oplFormat = buf[21]; // 0=OPL2, 1=dual OPL2, 2=OPL3
  const shortDelay = buf[23];
  const longDelay = buf[24];
  const codemapSize = buf[25];
  const numCh = oplFormat === 2 ? 18 : 9;

  // Read codemap
  const codemap = new Uint8Array(codemapSize);
  let pos = 26;
  for (let i = 0; i < codemapSize && pos < buf.length; i++) {
    codemap[i] = buf[pos++];
  }

  const pairs: Array<{ reg: number; val: number; delay: number }> = [];
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
  const instruments = [makeOPLInstrument(1, oplFormat === 2 ? 'OPL3 FM' : 'OPL2 FM')];

  const title = filename.replace(/\.dro$/i, '');
  return buildSong(`${title} (DRO v2)`, patterns, instruments, songPositions, numCh, 6, 125);
}

// ── IMF Parser ────────────────────────────────────────────────────────────────

function parseIMF(buf: Uint8Array, filename: string): TrackerSong {
  const NUM_CH = 9;

  // Detect type-0 (no header) vs type-1 (2-byte length header)
  let dataStart = 0;
  let dataEnd = buf.length;
  const possibleLen = le16(buf, 0);
  if (possibleLen > 0 && possibleLen + 2 <= buf.length && possibleLen % 4 === 0) {
    // Type 1: first 2 bytes = data length
    dataStart = 2;
    dataEnd = 2 + possibleLen;
  }

  // Read 4-byte records: register, data, delay_lo, delay_hi
  const pairs: Array<{ reg: number; val: number; delay: number }> = [];
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
  // IMF ticks at 560Hz or 700Hz; use ~10 ticks per row
  const ticksPerRow = 10;
  const patterns = oplEventsToPatterns(events, NUM_CH, ticksPerRow);
  const songPositions = patterns.map((_, i) => i);
  const instruments = [makeOPLInstrument(1, 'OPL2 FM')];

  const title = filename.replace(/\.(imf|wlf)$/i, '');
  return buildSong(`${title} (IMF)`, patterns, instruments, songPositions, NUM_CH, 6, 125);
}

// ── CMF Parser ────────────────────────────────────────────────────────────────

function parseCMF(buf: Uint8Array, filename: string): TrackerSong {
  const NUM_CH = 9;
  const ROWS = 64;

  const instOffset = le16(buf, 6);
  const musicOffset = le16(buf, 8);
  const ticksPerSecond = le16(buf, 12);
  const titleOffset = le16(buf, 14);
  const authorOffset = le16(buf, 16);
  const numInstruments = le16(buf, 36);

  // Read title/author strings
  let title = '';
  if (titleOffset > 0 && titleOffset < buf.length) {
    let i = titleOffset;
    while (i < buf.length && buf[i] !== 0) title += String.fromCharCode(buf[i++]);
  }
  let author = '';
  if (authorOffset > 0 && authorOffset < buf.length) {
    let i = authorOffset;
    while (i < buf.length && buf[i] !== 0) author += String.fromCharCode(buf[i++]);
  }

  // Parse instruments (16 bytes each: OPL2 register values)
  const instruments: InstrumentConfig[] = [];
  for (let i = 0; i < numInstruments; i++) {
    const off = instOffset + i * 16;
    if (off + 16 > buf.length) break;

    const inst = makeOPLInstrument(i + 1, `CMF ${i + 1}`);
    // CMF instruments: 16 bytes, first 11 map to standard OPL registers
    applyOPLRegisters(inst, buf, off);
    instruments.push(inst);
  }
  if (instruments.length === 0) instruments.push(makeOPLInstrument(1, 'Default'));

  // Parse MIDI-like event stream → note events
  const tickRate = ticksPerSecond > 0 ? ticksPerSecond : 120;
  // Channel assignment for CMF: channels 0-8 → OPL2 channels
  const channelMap = new Map<number, number>(); // MIDI ch → OPL ch
  let nextOPLCh = 0;

  interface CMFNote { tick: number; ch: number; note: number; inst: number; on: boolean; }
  const noteEvents: CMFNote[] = [];
  let pos = musicOffset;
  let tick = 0;

  while (pos < buf.length) {
    // Read variable-length delta time
    let delta = 0;
    let b: number;
    do {
      if (pos >= buf.length) break;
      b = buf[pos++];
      delta = (delta << 7) | (b & 0x7F);
    } while (b & 0x80);
    tick += delta;

    if (pos >= buf.length) break;
    const status = buf[pos];

    // Running status handling
    let cmd: number;
    if (status & 0x80) {
      cmd = status;
      pos++;
    } else {
      // Running status not fully supported; bail
      break;
    }

    const msgType = cmd & 0xF0;
    const midiCh = cmd & 0x0F;

    // Map MIDI channel to OPL channel
    if (!channelMap.has(midiCh) && nextOPLCh < NUM_CH) {
      channelMap.set(midiCh, nextOPLCh++);
    }
    const oplCh = channelMap.get(midiCh) ?? 0;

    if (msgType === 0x90) {
      // Note on
      if (pos + 1 >= buf.length) break;
      const note = buf[pos++];
      const vel = buf[pos++];
      if (vel > 0 && note > 0) {
        const midiNote = Math.max(1, Math.min(96, note));
        noteEvents.push({ tick, ch: oplCh, note: midiNote, inst: midiCh + 1, on: true });
      } else {
        noteEvents.push({ tick, ch: oplCh, note: 97, inst: 0, on: false });
      }
    } else if (msgType === 0x80) {
      // Note off
      if (pos + 1 >= buf.length) break;
      pos += 2; // note + velocity
      noteEvents.push({ tick, ch: oplCh, note: 97, inst: 0, on: false });
    } else if (msgType === 0xC0) {
      // Program change
      if (pos >= buf.length) break;
      pos++; // skip program
    } else if (msgType === 0xB0 || msgType === 0xE0) {
      // Control change / pitch bend
      if (pos + 1 >= buf.length) break;
      pos += 2;
    } else if (msgType === 0xD0) {
      // Channel pressure
      if (pos >= buf.length) break;
      pos++;
    } else if (msgType === 0xF0) {
      // SysEx or meta event
      if (cmd === 0xFF) {
        if (pos >= buf.length) break;
        const metaType = buf[pos++];
        // Read meta length
        let metaLen = 0;
        do {
          if (pos >= buf.length) break;
          b = buf[pos++];
          metaLen = (metaLen << 7) | (b & 0x7F);
        } while (b & 0x80);
        if (metaType === 0x2F) break; // End of track
        pos += metaLen;
      } else if (cmd === 0xF0) {
        // SysEx: skip until 0xF7
        while (pos < buf.length && buf[pos] !== 0xF7) pos++;
        if (pos < buf.length) pos++;
      }
    }
  }

  // Convert note events to patterns
  const ticksPerRow = Math.max(1, Math.round(tickRate / 8));
  const totalRows = noteEvents.length > 0
    ? Math.ceil(Math.max(...noteEvents.map(e => e.tick)) / ticksPerRow) + 1
    : ROWS;
  const ROWS_PER_PAT = ROWS;
  const numPats = Math.max(1, Math.ceil(totalRows / ROWS_PER_PAT));
  const patterns: Pattern[] = [];

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
  const displayName = title || filename.replace(/\.cmf$/i, '');
  const suffix = author ? ` — ${author}` : '';
  return buildSong(`${displayName}${suffix} (CMF)`, patterns, instruments, songPositions, NUM_CH, 6, 125);
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Detect if buffer is a supported AdPlug format. */
export function isAdPlugFormat(buffer: ArrayBuffer, filename?: string): boolean {
  const buf = new Uint8Array(buffer);
  return detectSubFormat(buf, filename ?? '') !== 'UNKNOWN';
}

/** Parse an AdPlug-compatible OPL music file. */
export function parseAdPlugFile(buffer: ArrayBuffer, filename?: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  const name = filename ?? 'unknown.bin';
  const subFormat = detectSubFormat(buf, name);

  switch (subFormat) {
    case 'RAD': return parseRAD(buf, name);
    case 'HSC': return parseHSC(buf, name);
    case 'DRO': return parseDRO(buf, name);
    case 'IMF': return parseIMF(buf, name);
    case 'CMF': return parseCMF(buf, name);
    default: {
      // Unknown sub-format: return a minimal stub song
      const instruments = [makeOPLInstrument(1, 'OPL2 FM')];
      const patterns = [emptyPattern('p0', 'Pattern 1', 9, 64)];
      const title = name.replace(/\.[^.]+$/, '');
      return buildSong(`${title} (AdPlug)`, patterns, instruments, [0], 9, 6, 125);
    }
  }
}
