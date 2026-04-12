/**
 * PMDParser.ts — PC-98 Professional Music Driver format parser
 *
 * Parses PMD files by KAJA (M.Kajihara), the most popular sound driver for
 * PC-98 computers. Drives the YM2608 (OPNA) chip: 6 FM, 3 SSG, 1 Rhythm,
 * 1 ADPCM channel. Extracts channel offset table, note data from MML command
 * streams, and builds a TrackerSong with Furnace instruments.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, ChannelData } from '@/types';
import type { InstrumentConfig, FurnaceConfig } from '@/types/instrument';
import { DEFAULT_FURNACE } from '@/types/instrument';

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

function readU16LE(buf: Uint8Array, off: number): number {
  return buf[off] | (buf[off + 1] << 8);
}

// ── Constants ─────────────────────────────────────────────────────────────────

const NUM_FM       = 6;
const NUM_SSG      = 3;
const NUM_RHYTHM   = 1;
const NUM_ADPCM    = 1;
const TOTAL_CH     = NUM_FM + NUM_SSG + NUM_RHYTHM + NUM_ADPCM; // 11
const MAX_OFFSETS  = TOTAL_CH;
const ROWS_PER_PAT = 64;

const CHANNEL_NAMES = [
  'FM A', 'FM B', 'FM C', 'FM D', 'FM E', 'FM F',
  'SSG A', 'SSG B', 'SSG C',
  'Rhythm',
  'ADPCM',
];

// PMD MML command bytes
const CMD_TEMPO       = 0xFF;
const CMD_VOICE       = 0xFE;
const CMD_VOLUME      = 0xFD;
const CMD_NOTE_LEN    = 0xFC;
const CMD_TIE         = 0xFB;
const CMD_DETUNE      = 0xFA;
const CMD_LOOP_START  = 0xF9;
const CMD_LOOP_END    = 0xF8;
const CMD_LOOP_BREAK  = 0xF7;
const CMD_LFO         = 0xF6;
const CMD_SSG_ENV     = 0xF5;
const CMD_PAN         = 0xF4;
const CMD_PORTAMENTO  = 0xF3;
const CMD_REST        = 0x80;

// ── Format detection ─────────────────────────────────────────────────────────

/**
 * Detect if a buffer is a PMD file.
 * PMD files have byte[1] == 0x18 or 0x1A (data offset marker),
 * and the channel offset table should contain plausible pointers.
 */
export function isPMDFormat(data: ArrayBuffer): boolean {
  if (data.byteLength < MAX_OFFSETS * 2) return false;
  const buf = new Uint8Array(data);
  // RetrovertApp uses byte[1] == 0x18 or 0x1A as a header marker
  if (buf[1] !== 0x18 && buf[1] !== 0x1A) return false;
  // Validate that at least one channel offset is a plausible pointer
  return parseHeader(buf) !== null;
}

// ── Channel Offset Validation ─────────────────────────────────────────────────

interface PMDHeader {
  offsets: number[];   // up to 11 channel offsets
  headerSize: number;  // bytes consumed by the header
}

function parseHeader(buf: Uint8Array): PMDHeader | null {
  // PMD header: up to 11 uint16 LE channel data offsets
  // Minimum size: 2 bytes per channel = 22 bytes
  if (buf.length < MAX_OFFSETS * 2) return null;

  const offsets: number[] = [];
  let hasValidOffset = false;

  for (let i = 0; i < MAX_OFFSETS; i++) {
    const off = readU16LE(buf, i * 2);
    offsets.push(off);
    if (off !== 0 && off < buf.length) hasValidOffset = true;
  }

  if (!hasValidOffset) return null;

  return { offsets, headerSize: MAX_OFFSETS * 2 };
}

// ── Title Search ──────────────────────────────────────────────────────────────

function findTitle(buf: Uint8Array, headerSize: number): string {
  // PMD sometimes stores a title string after the offset table.
  // Scan for a printable ASCII/Shift-JIS run after the header.
  let start = headerSize;
  // Skip zero padding
  while (start < buf.length && buf[start] === 0) start++;

  if (start >= buf.length) return '';

  // Look for a printable run (at least 4 chars)
  let end = start;
  while (end < buf.length && end - start < 128) {
    const b = buf[end];
    // Accept printable ASCII range and high bytes (Shift-JIS upper half)
    if (b >= 0x20 && b !== 0x7F) {
      end++;
    } else {
      break;
    }
  }

  if (end - start < 4) return '';

  // Decode as ASCII (Shift-JIS would need a dedicated decoder)
  let title = '';
  for (let i = start; i < end; i++) {
    title += String.fromCharCode(buf[i]);
  }
  return title.trim();
}

// ── MML Command Stream Parser ─────────────────────────────────────────────────

interface NoteEvent {
  tick: number;
  ch: number;
  note: number;     // 1–96 MIDI-style, 97 = note-off
  instIdx: number;
}

/** Convert PMD octave+semitone to MIDI note (1–96). Octave 0 = C1 (MIDI 24). */
function pmdNoteToMidi(noteVal: number): number {
  // PMD notes: 0x00-0x0B per octave (C through B)
  // The octave is implicitly tracked by the current octave command.
  // For simplicity, we map raw note byte: octave = noteVal / 12, semi = noteVal % 12
  const midi = noteVal + 24; // offset so octave 0 starts at C1
  return Math.max(1, Math.min(96, midi));
}

/**
 * Parse the MML command stream for a single channel.
 * Returns note events with absolute tick positions.
 */
function parseChannelStream(
  buf: Uint8Array,
  offset: number,
  chIdx: number,
  instIdx: number,
): NoteEvent[] {
  const events: NoteEvent[] = [];
  let pos = offset;
  let tick = 0;
  let defaultLen = 12; // default note length in ticks (quarter note at 48 PPQN)

  // Safety limit: don't parse more than 64KB per channel
  const limit = Math.min(buf.length, offset + 65536);

  while (pos < limit) {
    const cmd = buf[pos++];

    // Note-on: 0x00–0x7F (note value)
    if (cmd < CMD_REST) {
      const note = pmdNoteToMidi(cmd);
      // Duration byte follows if available
      let dur = defaultLen;
      if (pos < limit && buf[pos] > 0 && buf[pos] < 0x80) {
        dur = buf[pos++];
      }
      events.push({ tick, ch: chIdx, note, instIdx });
      tick += dur;
      // Implicit note-off at end of duration
      events.push({ tick, ch: chIdx, note: 97, instIdx });
      continue;
    }

    // Rest: 0x80
    if (cmd === CMD_REST) {
      let dur = defaultLen;
      if (pos < limit && buf[pos] > 0 && buf[pos] < 0x80) {
        dur = buf[pos++];
      }
      tick += dur;
      continue;
    }

    // Control commands: 0x81–0xFF
    switch (cmd) {
      case CMD_TEMPO:
        if (pos < limit) pos++; // skip tempo byte
        break;
      case CMD_VOICE:
        if (pos < limit) pos++; // skip voice number
        break;
      case CMD_VOLUME:
        if (pos < limit) {
          pos++; // skip volume byte (tracked internally by replayer)
        }
        break;
      case CMD_NOTE_LEN:
        if (pos < limit) {
          defaultLen = Math.max(1, buf[pos++]);
        }
        break;
      case CMD_TIE: {
        // Extend previous note — remove last note-off if present
        if (events.length > 0 && events[events.length - 1].note === 97) {
          events.pop();
        }
        let dur = defaultLen;
        if (pos < limit && buf[pos] > 0 && buf[pos] < 0x80) {
          dur = buf[pos++];
        }
        tick += dur;
        events.push({ tick, ch: chIdx, note: 97, instIdx });
        break;
      }
      case CMD_DETUNE:
        if (pos + 1 < limit) pos += 2; // skip 2-byte signed detune
        break;
      case CMD_LOOP_START:
        if (pos < limit) pos++; // skip loop count
        break;
      case CMD_LOOP_END:
        break; // no data bytes
      case CMD_LOOP_BREAK:
        break; // no data bytes
      case CMD_LFO:
        // LFO has variable length; skip 4 bytes (delay, speed, depth, waveform)
        if (pos + 3 < limit) pos += 4;
        break;
      case CMD_SSG_ENV:
        if (pos < limit) pos++; // skip envelope shape
        break;
      case CMD_PAN:
        if (pos < limit) pos++; // skip pan value
        break;
      case CMD_PORTAMENTO:
        // Portamento: target note + duration
        if (pos + 1 < limit) pos += 2;
        break;
      default:
        // Unknown commands 0x81–0xF2: skip 1 data byte as safest guess
        if (cmd > CMD_REST && cmd < CMD_PORTAMENTO) {
          if (pos < limit) pos++;
        }
        break;
    }

    // End-of-stream sentinel: two consecutive zero bytes
    if (pos + 1 < limit && buf[pos] === 0 && buf[pos + 1] === 0) break;
  }

  return events;
}

// ── Instruments ───────────────────────────────────────────────────────────────

function buildInstruments(): InstrumentConfig[] {
  const insts: InstrumentConfig[] = [];
  let id = 1;

  const add = (name: string, synthType: InstrumentConfig['synthType'], chipType: number, ops: number = 4) => {
    insts.push({
      id: id++, name, type: 'synth', synthType,
      furnace: { ...DEFAULT_FURNACE, chipType, ops } as FurnaceConfig,
      effects: [], volume: 0, pan: 0,
    });
  };

  // FM 1-6: YM2608 OPNA FM
  for (let i = 1; i <= NUM_FM; i++) add(`FM ${i}`, 'FurnaceOPNA', 1);
  // SSG 1-3: AY-compatible PSG
  for (let i = 1; i <= NUM_SSG; i++) add(`SSG ${i}`, 'FurnaceAY', 6, 2);
  // Rhythm: OPNA
  add('Rhythm', 'FurnaceOPNA', 1);
  // ADPCM: OPNA
  add('ADPCM', 'FurnaceOPNA', 1);

  return insts;
}

// ── Events → Patterns ─────────────────────────────────────────────────────────

function eventsToPatterns(events: NoteEvent[], numCh: number): Pattern[] {
  if (events.length === 0) {
    return [emptyPattern('p0', 'Pattern 0', numCh, ROWS_PER_PAT)];
  }

  const maxTick = Math.max(...events.map(e => e.tick));
  const totalRows = Math.max(ROWS_PER_PAT, maxTick + 1);
  const numPatterns = Math.ceil(totalRows / ROWS_PER_PAT);

  const patterns: Pattern[] = [];
  for (let p = 0; p < numPatterns; p++) {
    patterns.push(emptyPattern(`p${p}`, `Pattern ${p}`, numCh, ROWS_PER_PAT));
  }

  for (const ev of events) {
    const absRow = Math.min(ev.tick, totalRows - 1);
    const patIdx = Math.min(Math.floor(absRow / ROWS_PER_PAT), numPatterns - 1);
    const row    = absRow % ROWS_PER_PAT;
    const ch     = Math.min(ev.ch, numCh - 1);
    const cell   = patterns[patIdx].channels[ch].rows[row];

    if (ev.note === 97) {
      // Note-off: only write if cell is empty
      if (cell.note === 0) cell.note = 97;
    } else if (cell.note === 0) {
      cell.note = ev.note;
      cell.instrument = ev.instIdx + 1;
    }
  }

  return patterns;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function parsePMDFile(buffer: ArrayBuffer): TrackerSong {
  const buf = new Uint8Array(buffer);
  const header = parseHeader(buf);

  const instruments = buildInstruments();
  const numCh = TOTAL_CH;
  let allEvents: NoteEvent[] = [];
  let title = '';

  if (header) {
    title = findTitle(buf, header.headerSize);

    // Parse each channel's MML stream
    for (let ch = 0; ch < header.offsets.length; ch++) {
      const off = header.offsets[ch];
      if (off === 0 || off >= buf.length) continue;

      // Determine instrument index for this channel
      const instIdx = ch; // 1:1 mapping: ch 0–5 → FM, 6–8 → SSG, 9 → Rhythm, 10 → ADPCM

      try {
        const chEvents = parseChannelStream(buf, off, ch, instIdx);
        allEvents = allEvents.concat(chEvents);
      } catch {
        // Parsing failed for this channel — leave it empty
      }
    }
  }

  // Name channel data columns
  const patterns = eventsToPatterns(allEvents, numCh);
  for (const pat of patterns) {
    for (let ch = 0; ch < numCh; ch++) {
      pat.channels[ch].name = CHANNEL_NAMES[ch] ?? `CH ${ch + 1}`;
    }
  }

  const songName = title || 'PMD Song';

  return {
    name: songName,
    format: 'PMD' as TrackerFormat,
    patterns,
    instruments,
    songPositions: patterns.map((_, i) => i),
    songLength: patterns.length,
    restartPosition: 0,
    numChannels: numCh,
    initialSpeed: 6,
    initialBPM: 125,
    pmdFileData: buffer.slice(0),
  };
}
