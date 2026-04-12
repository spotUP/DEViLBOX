/**
 * MDXParser.ts — Sharp X68000 MDX music format parser
 *
 * MDX files contain MML-like command sequences for the YM2151 (OPM) FM synth
 * chip + optional OKI ADPCM. Unlike register-dump formats (VGM, S98), MDX has
 * NATIVE pattern/note data with proper timing, making it the richest source
 * of musical information for tracker conversion.
 *
 * Header: Shift-JIS title + PDX filename + channel offset table
 * Data: Per-channel command streams with notes (0x80-0xDF), rests, tempo,
 *       voice changes, volume, pan, LFO, repeats, and OPM register writes.
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
      id: `ch${i}`, name: i < 8 ? `FM ${String.fromCharCode(65 + i)}` : 'ADPCM',
      muted: false, solo: false, collapsed: false, volume: 100, pan: 0,
      instrumentId: null, color: null,
      rows: Array.from({ length: rows }, emptyCell),
      channelMeta: {
        importedFromMOD: false,
        originalIndex: i,
        channelType: 'synth',
        furnaceType: i < 8 ? 33 : undefined, // OPM chip type
        hardwareName: i < 8 ? 'YM2151' : 'OKI ADPCM',
        shortName: i < 8 ? String.fromCharCode(65 + i) : 'P',
      },
    })),
  };
}

/** Approximate Shift-JIS to ASCII (strips high bytes, keeps printable ASCII). */
function readShiftJISString(buf: Uint8Array, offset: number): { text: string; nextOff: number } {
  let text = '';
  let i = offset;
  while (i < buf.length) {
    const b = buf[i];
    if (b === 0x00) { i++; break; }
    // Single-byte ASCII printable range
    if (b >= 0x20 && b <= 0x7E) {
      text += String.fromCharCode(b);
      i++;
    } else if (b >= 0x81 && b <= 0x9F || b >= 0xE0 && b <= 0xEF) {
      // Double-byte Shift-JIS: skip both bytes, emit placeholder
      text += '?';
      i += 2;
    } else {
      i++;
    }
  }
  return { text: text.trim(), nextOff: i };
}

// ── YM2151 OPM Voice Data ─────────────────────────────────────────────────────

// OPM operator order: M1(0), C1(1), M2(2), C2(3) — register stride is 8

interface OPMVoice {
  algorithm: number;  // CON 0-7
  feedback: number;   // FL 0-7
  pms: number;        // PMS 0-7
  ams: number;        // AMS 0-3
  operators: Array<{
    dt1: number;   // DT1 0-7
    mul: number;   // MUL 0-15
    tl: number;    // TL 0-127
    ks: number;    // KS 0-3
    ar: number;    // AR 0-31
    amsEn: number; // AMS-EN 0-1
    d1r: number;   // D1R 0-31
    dt2: number;   // DT2 0-3
    d2r: number;   // D2R 0-31
    d1l: number;   // D1L 0-15
    rr: number;    // RR 0-15
  }>;
}

function emptyOPMVoice(): OPMVoice {
  return {
    algorithm: 0, feedback: 0, pms: 0, ams: 0,
    operators: Array.from({ length: 4 }, () => ({
      dt1: 0, mul: 1, tl: 127, ks: 0, ar: 31, amsEn: 0,
      d1r: 0, dt2: 0, d2r: 0, d1l: 0, rr: 15,
    })),
  };
}

/** Extract OPM voice from a sequence of 0xFE register writes. */
function applyRegisterWrite(voice: OPMVoice, reg: number, data: number, ch: number): void {
  const chSlot = reg & 0x07;
  if (chSlot !== (ch & 0x07)) return; // Not for this channel

  const baseReg = reg & 0xF8;
  // Operator index from register range: 0x40/0x60/0x80/0xA0/0xC0/0xE0
  // Each operator is offset by 8: op0=+0, op1=+8, op2=+16, op3=+24
  // But within a base register, channel selects which of 8 channels
  const opFromReg = (reg: number): number => {
    // Registers 0x40-0x5F: stride 8 per operator for given channel
    // op = (reg - base - ch) / 8 is not right; MDX sends ch-specific regs
    // reg = base + op*8 + ch  =>  op = floor((reg & 0x18) >> 3)
    return (reg >> 3) & 3;
  };

  if (baseReg === 0x20 || (reg >= 0x20 && reg < 0x28)) {
    // RL/FB/CON
    voice.feedback = (data >> 3) & 0x07;
    voice.algorithm = data & 0x07;
  } else if (reg >= 0x38 && reg < 0x40) {
    // PMS/AMS
    voice.pms = (data >> 4) & 0x07;
    voice.ams = data & 0x03;
  } else if (reg >= 0x40 && reg < 0x60) {
    const op = opFromReg(reg);
    voice.operators[op].dt1 = (data >> 4) & 0x07;
    voice.operators[op].mul = data & 0x0F;
  } else if (reg >= 0x60 && reg < 0x80) {
    const op = opFromReg(reg);
    voice.operators[op].tl = data & 0x7F;
  } else if (reg >= 0x80 && reg < 0xA0) {
    const op = opFromReg(reg);
    voice.operators[op].ks = (data >> 6) & 0x03;
    voice.operators[op].ar = data & 0x1F;
  } else if (reg >= 0xA0 && reg < 0xC0) {
    const op = opFromReg(reg);
    voice.operators[op].amsEn = (data >> 7) & 0x01;
    voice.operators[op].d1r = data & 0x1F;
  } else if (reg >= 0xC0 && reg < 0xE0) {
    const op = opFromReg(reg);
    voice.operators[op].dt2 = (data >> 6) & 0x03;
    voice.operators[op].d2r = data & 0x1F;
  } else if (reg >= 0xE0) {
    const op = opFromReg(reg);
    voice.operators[op].d1l = (data >> 4) & 0x0F;
    voice.operators[op].rr = data & 0x0F;
  }
}

// ── MDX Channel Event Types ───────────────────────────────────────────────────

interface MDXNoteEvent {
  type: 'note';
  tick: number;
  note: number;     // MIDI note 1-96 (0 = rest)
  duration: number; // in ticks
  voice: number;    // current voice/tone number
  volume: number;   // current volume 0-15
}

interface MDXTempoEvent {
  type: 'tempo';
  tick: number;
  tempo: number;    // raw MDX tempo value
}

type MDXEvent = MDXNoteEvent | MDXTempoEvent;

// ── Channel Command Parser ────────────────────────────────────────────────────

interface RepeatEntry {
  startPos: number;   // byte offset of loop start
  count: number;      // remaining iterations
  escapeOffset: number; // offset for escape command
}

interface ChannelParseResult {
  events: MDXEvent[];
  totalTicks: number;
  voiceRegisters: Map<number, OPMVoice>; // voice number → extracted OPM voice
  loopTick: number; // tick where loop-back occurs (-1 if none)
}

function parseChannel(
  buf: Uint8Array, startOffset: number, endOffset: number,
  _dataBaseOffset: number, channelIdx: number,
): ChannelParseResult {
  const events: MDXEvent[] = [];
  const voiceRegisters = new Map<number, OPMVoice>();
  let pos = startOffset;
  let tick = 0;
  let currentVoice = 0;
  let currentVolume = 8;
  let loopTick = -1;

  // For OPM register write tracking
  let currentRegVoice = emptyOPMVoice();
  let lastVoiceFromRegs = -1; // track when register writes define a voice

  const repeatStack: RepeatEntry[] = [];

  const safeRead = (): number => {
    if (pos >= endOffset || pos >= buf.length) return 0xF1; // return benign nop-like
    return buf[pos++];
  };

  const safeReadSigned16LE = (): number => {
    if (pos + 1 >= buf.length) { pos += 2; return 0; }
    const lo = buf[pos++];
    const hi = buf[pos++];
    const val = lo | (hi << 8);
    return val >= 0x8000 ? val - 0x10000 : val;
  };

  let safety = 0;
  const MAX_COMMANDS = 500000;

  while (pos < endOffset && pos < buf.length && safety++ < MAX_COMMANDS) {
    const cmd = safeRead();

    // Duration value (0x00-0x7F): extend previous note/rest
    if (cmd <= 0x7F) {
      tick += cmd + 1;
      continue;
    }

    // Note/rest commands (0x80-0xDF)
    if (cmd >= 0x80 && cmd <= 0xDF) {
      if (cmd === 0x80) {
        // Rest
        const dur = safeRead();
        tick += dur + 1;
      } else {
        // Note on: cmd 0x81-0xDF
        const noteVal = cmd - 0x80;
        const dur = safeRead();
        // Map MDX note value to MIDI: octave = floor(noteVal/12), semi = noteVal%12
        // MDX note 1 = O0 C#, note 12 = O1 C, etc.
        // MIDI note: noteVal + 36 gives roughly the right range (O3 = middle)
        const midiNote = Math.max(1, Math.min(96, noteVal + 36));
        events.push({
          type: 'note',
          tick,
          note: midiNote,
          duration: dur + 1,
          voice: currentVoice,
          volume: currentVolume,
        });
        tick += dur + 1;
      }
      continue;
    }

    // Control commands (0xE0-0xFF)
    switch (cmd) {
      case 0xFF: { // Set tempo
        const tempoVal = safeRead();
        events.push({ type: 'tempo', tick, tempo: tempoVal });
        break;
      }
      case 0xFE: { // Set OPM register
        const reg = safeRead();
        const data = safeRead();
        // Track register writes for voice extraction
        applyRegisterWrite(currentRegVoice, reg, data, channelIdx & 0x07);
        // If this looks like the last register in a voice definition (0xE0+ range),
        // save the voice
        if (reg >= 0xE0) {
          const voiceClone: OPMVoice = {
            algorithm: currentRegVoice.algorithm,
            feedback: currentRegVoice.feedback,
            pms: currentRegVoice.pms,
            ams: currentRegVoice.ams,
            operators: currentRegVoice.operators.map(op => ({ ...op })),
          };
          lastVoiceFromRegs++;
          voiceRegisters.set(lastVoiceFromRegs, voiceClone);
        }
        break;
      }
      case 0xFD: { // Set voice/tone number
        currentVoice = safeRead();
        if (!voiceRegisters.has(currentVoice)) {
          voiceRegisters.set(currentVoice, emptyOPMVoice());
        }
        currentRegVoice = emptyOPMVoice(); // reset for next register group
        break;
      }
      case 0xFC: { // Set pan
        safeRead(); // pan value (ignored for pattern data)
        break;
      }
      case 0xFB: { // Set volume
        currentVolume = safeRead() & 0x0F;
        break;
      }
      case 0xFA: { // Decrease volume
        if (currentVolume > 0) currentVolume--;
        break;
      }
      case 0xF9: { // Increase volume
        if (currentVolume < 15) currentVolume++;
        break;
      }
      case 0xF8: { // Staccato gate time
        safeRead();
        break;
      }
      case 0xF7: { // Portamento
        safeRead(); // duration
        safeReadSigned16LE(); // target offset (signed 16-bit)
        break;
      }
      case 0xF6: { // Repeat start
        const count = safeRead();
        const escOff = safeReadSigned16LE();
        repeatStack.push({
          startPos: pos,
          count: count - 1,
          escapeOffset: pos - 2 + escOff, // relative to current position
        });
        break;
      }
      case 0xF5: { // Repeat end
        if (repeatStack.length > 0) {
          const top = repeatStack[repeatStack.length - 1];
          if (top.count > 0) {
            top.count--;
            pos = top.startPos;
          } else {
            repeatStack.pop();
          }
        }
        break;
      }
      case 0xF4: { // Repeat escape
        if (repeatStack.length > 0) {
          const top = repeatStack[repeatStack.length - 1];
          if (top.count === 0) {
            pos = top.escapeOffset;
            repeatStack.pop();
          }
        }
        break;
      }
      case 0xF3: { // Detune
        safeReadSigned16LE();
        break;
      }
      case 0xF2: { // Key-on delay
        safeRead();
        break;
      }
      case 0xF1: { // LFO
        safeRead(); // delay
        safeRead(); // speed
        safeRead(); // type
        safeRead(); // depth (2 bytes? spec varies — use 1 byte here)
        safeRead(); // extra byte
        break;
      }
      case 0xF0: { // Disable LFO
        break;
      }
      case 0xEF: { // LFO (key-on synchronized)
        safeRead(); safeRead(); safeRead(); safeRead(); safeRead();
        break;
      }
      case 0xEE: { // Extended detune
        safeRead();
        break;
      }
      case 0xED: { // Sync wait
        safeRead();
        break;
      }
      case 0xEC: { // Sync send
        safeRead();
        break;
      }
      case 0xEB: { // OPM noise frequency
        safeRead();
        break;
      }
      case 0xEA: { // PCM8 mode (ADPCM)
        break;
      }
      case 0xE9: { // Loop back to start
        loopTick = tick;
        // Stop parsing to avoid infinite loop
        pos = endOffset;
        break;
      }
      default: {
        // 0xE0-0xE8: extended commands — most take 0-2 bytes
        // Consume conservatively: skip up to 2 bytes for unknown extended commands
        if (cmd >= 0xE0 && cmd <= 0xE8) {
          safeRead();
        }
        break;
      }
    }
  }

  return { events, totalTicks: tick, voiceRegisters, loopTick };
}

// ── Voice → Instrument Conversion ─────────────────────────────────────────────

function opmVoiceToInstrument(voice: OPMVoice, id: number, name: string): InstrumentConfig {
  const ops = voice.operators.map((op, i) => ({
    ...DEFAULT_FURNACE.operators[i],
    enabled: true,
    mult: op.mul,
    tl: op.tl,
    ar: op.ar,
    dr: op.d1r,
    d2r: op.d2r,
    sl: op.d1l,
    rr: op.rr,
    dt: op.dt1 > 3 ? -(op.dt1 & 3) : op.dt1, // DT1: 0-3 positive, 4-7 negative
    dt2: op.dt2,
    rs: op.ks,
    am: op.amsEn === 1,
  }));

  const furnace: FurnaceConfig = {
    ...DEFAULT_FURNACE,
    chipType: 33, // OPM
    algorithm: voice.algorithm,
    feedback: voice.feedback,
    fms: voice.pms,
    ams: voice.ams,
    ops: 4,
    operators: ops,
  };

  return {
    id, name, type: 'synth', synthType: 'FurnaceOPM',
    furnace, effects: [], volume: 0, pan: 0,
  };
}

// ── MDX Tempo → BPM ──────────────────────────────────────────────────────────

/** MDX tempo value to BPM. MDX uses OPM Timer-B: BPM = 256 / (256 - tempoVal) * 78.125 / 48 * 60 */
function mdxTempoToBPM(tempoVal: number): number {
  // Timer-B period = (256 - tempoVal) * 1024 / 4MHz = (256 - tempoVal) * 256µs
  // Tick rate = 4000000 / (1024 * (256 - tempoVal))
  // At 48 ticks/beat: BPM = tickRate / 48 * 60
  const divisor = 256 - (tempoVal & 0xFF);
  if (divisor <= 0) return 120;
  const tickRate = 4000000 / (1024 * divisor);
  return Math.round(tickRate / 48 * 60);
}

// ── Timeline → Rows ───────────────────────────────────────────────────────────

const TICKS_PER_BEAT = 48; // Standard MDX timing
const ROWS_PER_BEAT = 4;   // 4 tracker rows per beat for reasonable resolution
const TICKS_PER_ROW = TICKS_PER_BEAT / ROWS_PER_BEAT; // 12 ticks per row
const MAX_PATTERN_ROWS = 64;
const MAX_PATTERNS = 256;

function eventsToPatterns(
  channelResults: ChannelParseResult[],
  numChannels: number,
): { patterns: Pattern[]; bpm: number } {
  // Find first tempo event for initial BPM
  let bpm = 120;
  for (const ch of channelResults) {
    for (const ev of ch.events) {
      if (ev.type === 'tempo') {
        bpm = mdxTempoToBPM(ev.tempo);
        break;
      }
    }
    if (bpm !== 120) break;
  }

  // Find total ticks across all channels
  const maxTicks = Math.max(1, ...channelResults.map(c => c.totalTicks));
  const totalRows = Math.min(
    MAX_PATTERN_ROWS * MAX_PATTERNS,
    Math.ceil(maxTicks / TICKS_PER_ROW),
  );

  // Build instrument assignment: each unique voice number maps to an instrument index
  const voiceToInst = new Map<number, number>();
  let nextInst = 1;
  for (const ch of channelResults) {
    for (const ev of ch.events) {
      if (ev.type === 'note' && !voiceToInst.has(ev.voice)) {
        voiceToInst.set(ev.voice, nextInst++);
      }
    }
  }

  // Split into 64-row patterns
  const numPatterns = Math.max(1, Math.ceil(totalRows / MAX_PATTERN_ROWS));
  const patterns: Pattern[] = [];

  for (let p = 0; p < numPatterns && p < MAX_PATTERNS; p++) {
    const patRows = Math.min(MAX_PATTERN_ROWS, totalRows - p * MAX_PATTERN_ROWS);
    const pat = emptyPattern(`p${p}`, `Pattern ${p}`, numChannels, patRows);

    for (let chIdx = 0; chIdx < numChannels && chIdx < channelResults.length; chIdx++) {
      const chResult = channelResults[chIdx];
      for (const ev of chResult.events) {
        if (ev.type !== 'note') continue;
        const row = Math.floor(ev.tick / TICKS_PER_ROW);
        const patIdx = Math.floor(row / MAX_PATTERN_ROWS);
        if (patIdx !== p) continue;
        const localRow = row - p * MAX_PATTERN_ROWS;
        if (localRow < 0 || localRow >= patRows) continue;

        const cell = pat.channels[chIdx].rows[localRow];
        if (cell.note === 0 && ev.note > 0) {
          cell.note = ev.note;
          cell.instrument = voiceToInst.get(ev.voice) ?? 1;
          // Volume: MDX 0-15 → tracker 0x10-0x50 (volume column)
          if (ev.volume < 15) {
            cell.volume = 0x10 + Math.round(ev.volume * (0x40 / 15));
          }
        }

        // Place note-off if duration is shorter than gap to next row
        const offRow = Math.floor((ev.tick + ev.duration) / TICKS_PER_ROW);
        const offPatIdx = Math.floor(offRow / MAX_PATTERN_ROWS);
        if (offPatIdx === p) {
          const offLocalRow = offRow - p * MAX_PATTERN_ROWS;
          if (offLocalRow > localRow && offLocalRow < patRows) {
            const offCell = pat.channels[chIdx].rows[offLocalRow];
            if (offCell.note === 0) {
              offCell.note = 97; // note off
            }
          }
        }
      }

      // Place tempo changes as Fxx effects
      for (const ev of chResult.events) {
        if (ev.type !== 'tempo') continue;
        const row = Math.floor(ev.tick / TICKS_PER_ROW);
        const patIdx = Math.floor(row / MAX_PATTERN_ROWS);
        if (patIdx !== p) continue;
        const localRow = row - p * MAX_PATTERN_ROWS;
        if (localRow < 0 || localRow >= patRows) continue;
        // Only place tempo on channel 0
        if (chIdx === 0) {
          const cell = pat.channels[0].rows[localRow];
          const newBpm = Math.min(255, mdxTempoToBPM(ev.tempo));
          if (cell.effTyp === 0) {
            cell.effTyp = 0x0F; // Fxx = set speed/BPM
            cell.eff = newBpm;
          }
        }
      }
    }

    patterns.push(pat);
  }

  if (patterns.length === 0) {
    patterns.push(emptyPattern('p0', 'Pattern 0', numChannels, 64));
  }

  return { patterns, bpm };
}

// ── Header Parsing ────────────────────────────────────────────────────────────

interface MDXHeader {
  title: string;
  pdxFilename: string;
  toneDataOffset: number; // byte offset where tone/channel data begins
  channelOffsets: number[]; // per-channel data offsets relative to toneDataOffset
  numChannels: number;
}

function parseHeader(buf: Uint8Array): MDXHeader {
  // Read title (null-terminated Shift-JIS)
  const { text: title, nextOff: afterTitle } = readShiftJISString(buf, 0);

  // Read PDX filename (null-terminated, followed by 0x0D 0x0A)
  let pdxFilename = '';
  let pos = afterTitle;
  while (pos < buf.length && buf[pos] !== 0x00) {
    if (buf[pos] >= 0x20 && buf[pos] <= 0x7E) {
      pdxFilename += String.fromCharCode(buf[pos]);
    }
    pos++;
  }
  if (pos < buf.length && buf[pos] === 0x00) pos++;
  // Skip optional 0x0D 0x0A
  if (pos < buf.length && buf[pos] === 0x0D) pos++;
  if (pos < buf.length && buf[pos] === 0x0A) pos++;

  const toneDataOffset = pos;

  // Read channel offset table: uint16 LE offsets
  // Detect number of channels: read offsets until we find one that points
  // to or before current reading position (indicating data start, not an offset)
  const offsets: number[] = [];
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  // Maximum possible channels: 9 (8 FM + 1 ADPCM), minimum: 1
  // Read up to 9 offsets, then validate
  const maxChannels = Math.min(9, Math.floor((buf.length - pos) / 2));
  for (let i = 0; i < maxChannels; i++) {
    if (pos + 1 >= buf.length) break;
    const off = dv.getUint16(pos, true);
    offsets.push(off);
    pos += 2;
  }

  // Determine actual channel count: valid offsets should all be >= (numChannels * 2)
  // because they're relative to toneDataOffset and must point past the offset table itself
  let numChannels = offsets.length;
  for (let n = offsets.length; n >= 1; n--) {
    const minValidOffset = n * 2;
    const allValid = offsets.slice(0, n).every(o => o >= minValidOffset);
    if (allValid) { numChannels = n; break; }
  }

  return {
    title,
    pdxFilename: pdxFilename.trim(),
    toneDataOffset,
    channelOffsets: offsets.slice(0, numChannels),
    numChannels,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Check if a buffer looks like an MDX file. */
export function isMDXFormat(buffer: ArrayBuffer): boolean {
  const buf = new Uint8Array(buffer);
  if (buf.length < 16) return false;

  // MDX has no magic number. Heuristic: find a null byte (end of title) in
  // the first 256 bytes, then look for plausible channel offsets after the header.
  let titleEnd = -1;
  for (let i = 0; i < Math.min(256, buf.length); i++) {
    if (buf[i] === 0x00) { titleEnd = i; break; }
  }
  if (titleEnd < 0) return false;

  // After title null, find PDX name terminator
  let pdxEnd = -1;
  for (let i = titleEnd + 1; i < Math.min(titleEnd + 128, buf.length); i++) {
    if (buf[i] === 0x00) { pdxEnd = i; break; }
  }
  if (pdxEnd < 0) return false;

  // After PDX null (and optional 0x0D 0x0A), we should see channel offsets
  let pos = pdxEnd + 1;
  if (pos < buf.length && buf[pos] === 0x0D) pos++;
  if (pos < buf.length && buf[pos] === 0x0A) pos++;

  // Need at least 16 bytes for 8 channel offsets
  if (pos + 16 > buf.length) return false;

  // Read first offset — should be a reasonable value (>= 16, pointing past offset table)
  const dv = new DataView(buffer, pos);
  const firstOff = dv.getUint16(0, true);
  return firstOff >= 16 && firstOff < buf.length;
}

/** Parse an MDX file into a TrackerSong with native note data. */
export function parseMDXFile(buffer: ArrayBuffer): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (buf.length < 16) throw new Error('Buffer too small for MDX format');

  const header = parseHeader(buf);
  const { title, toneDataOffset, channelOffsets, numChannels } = header;

  // Parse each channel's command stream
  const channelResults: ChannelParseResult[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    const startOff = toneDataOffset + channelOffsets[ch];
    // End offset: next channel's start, or end of file
    const endOff = ch + 1 < numChannels
      ? toneDataOffset + channelOffsets[ch + 1]
      : buf.length;
    channelResults.push(parseChannel(buf, startOff, endOff, toneDataOffset, ch));
  }

  // Collect all unique voices across channels
  const allVoices = new Map<number, OPMVoice>();
  for (const ch of channelResults) {
    for (const [voiceNum, voice] of ch.voiceRegisters) {
      if (!allVoices.has(voiceNum)) {
        allVoices.set(voiceNum, voice);
      }
    }
  }

  // Convert timeline events to tracker patterns
  const { patterns, bpm } = eventsToPatterns(channelResults, numChannels);

  // Build instruments from extracted voices
  const instruments: InstrumentConfig[] = [];
  const voiceNums = [...allVoices.keys()].sort((a, b) => a - b);
  const voiceToInstId = new Map<number, number>();

  for (let i = 0; i < voiceNums.length; i++) {
    const voiceNum = voiceNums[i];
    const voice = allVoices.get(voiceNum)!;
    const instId = i + 1;
    voiceToInstId.set(voiceNum, instId);
    instruments.push(opmVoiceToInstrument(voice, instId, `OPM Voice ${voiceNum}`));
  }

  // If no voices were extracted, create a default OPM instrument
  if (instruments.length === 0) {
    instruments.push({
      id: 1, name: 'OPM FM', type: 'synth', synthType: 'FurnaceOPM',
      furnace: { ...DEFAULT_FURNACE, chipType: 33, ops: 4 } as FurnaceConfig,
      effects: [], volume: 0, pan: 0,
    });
  }

  // ADPCM channel instrument (if present)
  if (numChannels > 8) {
    instruments.push({
      id: instruments.length + 1,
      name: 'ADPCM',
      type: 'synth',
      synthType: 'FurnaceOPM', // closest available
      furnace: { ...DEFAULT_FURNACE, chipType: 33, ops: 4 } as FurnaceConfig,
      effects: [], volume: 0, pan: 0,
    });
  }

  // Detect loop point
  const loopTick = Math.max(...channelResults.map(c => c.loopTick));
  let restartPosition = 0;
  if (loopTick > 0) {
    const loopRow = Math.floor(loopTick / TICKS_PER_ROW);
    restartPosition = Math.min(
      patterns.length - 1,
      Math.floor(loopRow / MAX_PATTERN_ROWS),
    );
  }

  const songPositions = patterns.map((_, i) => i);

  return {
    name: title || 'Untitled MDX',
    format: 'MDX' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength: patterns.length,
    restartPosition,
    numChannels,
    initialSpeed: 6,
    initialBPM: bpm,
    mdxminiFileData: buffer.slice(0),
  };
}
