/**
 * MIDILoricielParser.ts - MIDI Loriciel: a Standard MIDI File played on Paula
 * by Loriciel's own player (Entity, 1993), with a BNKS sample bank beside it
 * (SMPL.<tune> / <tune>.BSP).
 *
 * The grid is the player's schedule, not a quantised MIDI import: one row per
 * player interrupt, one channel per Paula voice, and every cell is what the
 * player writes to that voice on that interrupt. Reverse-engineered from
 * third-party/uade-3.05/amigasrc/players/wanted_team/MIDI-Loriciel/
 * "MIDI - Loriciel_v1.asm" and checked against the runner and UADE's Paula log;
 * the full map is thoughts/shared/research/2026-10-06_midi-loriciel-format.md.
 *
 *   timing   each interrupt advances every track by 4 MIDI ticks (SUBQ.L #4):
 *            an event fires when its track's counter reaches <= 0; a delta of
 *            0 fires in the same interrupt, a delta > 0 never does (the
 *            counter is tested only after the next decrement). The CIA timer
 *            is 715909 / ((division * 10000 / (tempo / 100)) / 4).
 *   events   9x note on (velocity 0 = note off), 8x note off, Cx program;
 *            Ax/Bx/Ex skipped (2 bytes), FF 51 tempo, FF 2F end of track,
 *            other metas and F0 sysex skipped by length. No running status,
 *            no controllers, no pitch bend.
 *   voices   a note on takes the first free voice, else the last voice
 *            playing its MIDI channel, else voice 0. A note off frees the
 *            voice only when it is the channel's most recent note on that
 *            voice (one voice pointer per channel).
 *   pitch    program -> BNKS instrument (key ranges); the first range whose
 *            top key >= note picks the sample; period = table[note - base].
 *   volume   Paula volume = 2 * VOLUME_TABLE[velocity >> 1].
 *   loop     the interrupt after the last end-of-track resets Paula and the
 *            tracks; the song starts again on the one after.
 *
 * The MIDI file is read with midi-file (the reader @tonejs/midi uses);
 * MIDILoricielEncoder writes it back with the same library.
 */

import { parseMidi, type MidiData, type MidiEvent } from 'midi-file';
import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, TrackerCell, Pattern } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';
import { periodToPitch } from '@/lib/amiga/periodNotes';

const MIN_FILE_SIZE = 22;

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}
function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}
function s32BE(buf: Uint8Array, off: number): number {
  return u32BE(buf, off) | 0;
}
const s8 = (b: number): number => (b << 24) >> 24;

const MAGIC_MTHD = 0x4D546864;
const MAGIC_MTRK = 0x4D54726B;
const MAGIC_BNKS = 0x424E4B53;

// ── The player's tables (MIDI - Loriciel_v1.asm) ─────────────────────────────

/**
 * lbW0008C6 and the memory around it, as the player reads it: period =
 * word[note - base] from the label, unchecked. Indices -29..30 are the real
 * table (a semitone ladder, 1991..66); outside it the player reads its own
 * code and the velocity table (Cartoons 1 plays key 100 on a range based at
 * 36: index 64 = $1919, the velocity table). Words taken verbatim from the
 * player binary (public/eagleplayer/players/MIDI-Loriciel, no relocations in
 * this span); index LORICIEL_PERIOD_MIN_INDEX is element 0.
 */
export const LORICIEL_PERIODS: readonly number[] = [
  0x0000, 0x321B, 0x5341, 0xB02B, 0x0006, 0x6F06, 0x504B, 0x51C9, 0xFFF6, 0x7200, 0x122B, 0x0004,
  0x4881, 0xE949, 0x2653, 0x9441, 0x2493, 0x302B, 0x0006, 0xE248, 0x3540, 0x0004, 0x6100, 0xF930,
  0x47FA, 0x004E, 0x0242, 0xFFF0, 0xE642, 0x3573, 0x2000, 0x0006, 0x6100, 0xF950, 0x4E75,
  // lbW0008C6 - 29 .. lbW0008C6 + 30: the period table
  0x07C7, 0x075A, 0x06EC, 0x068E, 0x0630, 0x05D3, 0x0580, 0x0531, 0x04E6, 0x04A0, 0x045D, 0x041F,
  0x03E3, 0x03AC, 0x0377, 0x0345, 0x0316, 0x02EA, 0x02C0, 0x0298, 0x0273, 0x0250, 0x022F, 0x020F,
  0x01F2, 0x01D6, 0x01BB, 0x01A3, 0x018B, 0x0175, 0x0160, 0x014C, 0x013A, 0x0128, 0x0117, 0x0108,
  0x00F9, 0x00EB, 0x00DE, 0x00D1, 0x00C6, 0x00BA, 0x00B0, 0x00A6, 0x009D, 0x0094, 0x008C, 0x0084,
  0x007C, 0x0075, 0x006F, 0x0069, 0x0063, 0x005D, 0x0058, 0x0053, 0x004E, 0x004A, 0x0046, 0x0042,
  // lbC000904 code, then lbW000930 (the velocity table), then lbC000970 / lbC000986 code
  0x47FA, 0x0018, 0x121D, 0x4881, 0xE249, 0x1233, 0x1000, 0xD241, 0x6100, 0xF7E4, 0x6100, 0xF85A,
  0x4E75, 0x0001, 0x0203, 0x0405, 0x0607, 0x0809, 0x0A0B, 0x0C0D, 0x0E0F, 0x1010, 0x1111, 0x1212,
  0x1313, 0x1414, 0x1515, 0x1616, 0x1717, 0x1818, 0x1818, 0x1919, 0x1919, 0x1A1A, 0x1A1A, 0x1B1B,
  0x1B1B, 0x1C1C, 0x1C1C, 0x1D1D, 0x1D1D, 0x1E1E, 0x1E1E, 0x1F1F, 0x1F1F, 0x48E7, 0xFFFE, 0x43FA,
  0x004C, 0x301D, 0xE548, 0x4EB1, 0x0000, 0x4CDF, 0x7FFF, 0x4E75, 0x45F9, 0x00DF, 0xF0A0, 0x49FA,
  0x0190, 0x7003, 0x4A6C, 0x0000, 0x6B0A, 0x24BA, 0xFEB0, 0x357C,
];
/** Index of LORICIEL_PERIODS[0] relative to lbW0008C6. */
export const LORICIEL_PERIOD_MIN_INDEX = -64;
export const LORICIEL_PERIOD_MAX_INDEX = LORICIEL_PERIOD_MIN_INDEX + LORICIEL_PERIODS.length - 1;
/** The real table's span; outside it the period is whatever word the player lands on. */
export const LORICIEL_TABLE_MIN_INDEX = -29;
export const LORICIEL_TABLE_MAX_INDEX = 30;

/**
 * The grid note of period index i (note - base). The table is a semitone
 * ladder; index 0 (period 373) reads as D-2 in the ProTracker naming every
 * Amiga grid uses (src/lib/amiga/periodNotes.ts: 428 = C-2 = 25), so the note
 * is i + 27. Indices -29..-27 sit below C-0 and have no grid note.
 */
export const LORICIEL_NOTE_OFFSET = 27;

/** lbW000930 - velocity >> 1 -> half the Paula volume. */
export const LORICIEL_VOLUMES: readonly number[] = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  16, 16, 17, 17, 18, 18, 19, 19, 20, 20, 21, 21, 22, 22, 23, 23,
  24, 24, 24, 24, 25, 25, 25, 25, 26, 26, 26, 26, 27, 27, 27, 27,
  28, 28, 28, 28, 29, 29, 29, 29, 30, 30, 30, 30, 31, 31, 31, 31,
];

/** The Paula volume a note-on velocity sets (lbC000904; balance 64/64). */
export function loricielVolume(velocity: number): number {
  return LORICIEL_VOLUMES[(velocity & 0x7F) >> 1] * 2;
}

/** Ticks per interrupt: the counter drops by 4 each call (SUBQ.L #4,14(A6)). */
export const LORICIEL_TICKS_PER_INTERRUPT = 4;
/** Init_2: the tempo the player starts (and restarts) with, before any FF 51. */
export const LORICIEL_DEFAULT_TEMPO = 500000;
/** Paula's PAL CIA clock: the player computes with 715909 but runs on a PAL timer. */
const CIA_PAL_HZ = 709379;

/**
 * lbC00024C + lbC000356: the CIA timer value for a tempo (microseconds per
 * quarter), in the player's 16-bit integer arithmetic. `division` is the MThd
 * word (Init_1: SMPTE divisions fall back to 192 ticks).
 */
export function loricielTimer(tempo: number, division: number): number {
  const ppq = division & 0x8000 ? 0xC0 : division;
  const q = Math.floor(tempo / 100) & 0xFFFF;
  if (q === 0) return 0;
  const ticksPerSec = Math.floor((ppq * 10000) / q);
  if (ticksPerSec > 0xFFFF) return 0;           // DIVU.W overflow: the player keeps its old rate
  const rate = ticksPerSec >> 2;
  if (rate === 0) return 0;
  return Math.floor(715909 / rate) & 0xFFFF;
}

/** Interrupts per second on a PAL Amiga for a timer value. */
export function loricielInterruptHz(timer: number): number {
  return timer > 0 ? CIA_PAL_HZ / timer : 50;
}

// ── Detection ────────────────────────────────────────────────────────────────

/**
 * DTP_Check2: 'MThd', header length 6, format <= 1, tracks > 0, division > 0,
 * then 'MTrk'.
 */
export function isMIDILoricielFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;
  if (u32BE(buf, 0) !== MAGIC_MTHD) return false;
  if (u32BE(buf, 4) !== 6) return false;
  if (u16BE(buf, 8) > 1) return false;
  if (u16BE(buf, 10) === 0) return false;
  if (u16BE(buf, 12) === 0) return false;
  return u32BE(buf, 14) === MAGIC_MTRK;
}

// ── The BNKS sample bank (InitSamples, lbC0007F8) ────────────────────────────

export interface LoricielSample {
  /** Offset of the 8-byte sample header in the bank. */
  header: number;
  /** Offset of the 8-bit PCM. */
  data: number;
  /** Length in bytes (header word +6; Paula gets length >> 1 words). */
  length: number;
}

export interface LoricielKeyRange {
  /** Index into LoricielBank.samples. */
  sample: number;
  /** Byte +4: the key that plays period index 0. */
  base: number;
  /** Byte +6: the highest key this range takes. */
  top: number;
}

export interface LoricielBank {
  /** Key ranges per program (the long table at bank+8). */
  programs: LoricielKeyRange[][];
  /** Every sample the bank references, in header order. */
  samples: LoricielSample[];
}

/**
 * BNKS: 'BNKS', u32 instrument count, count x u32 offset to an instrument.
 * Instrument: u16 n, n x { s32 -offset of a sample header, base, ?, top, ? }.
 * Sample header: s32 -offset of the PCM, u16 ?, u16 length in bytes.
 * The player relocates the negative offsets once (a header shared by two
 * ranges is already positive the second time).
 */
export function parseLoricielBank(bank: Uint8Array): LoricielBank {
  if (bank.length < 12 || u32BE(bank, 0) !== MAGIC_BNKS) throw new Error('MIDI Loriciel: the sample bank is not BNKS');
  const count = u32BE(bank, 4);
  if (count === 0 || 8 + count * 4 > bank.length) throw new Error('MIDI Loriciel: BNKS instrument table out of range');
  const samples: LoricielSample[] = [];
  const byHeader = new Map<number, number>();
  const instCache = new Map<number, LoricielKeyRange[]>();
  const programs: LoricielKeyRange[][] = [];
  for (let p = 0; p < count; p++) {
    const inst = u32BE(bank, 8 + p * 4);
    const cached = instCache.get(inst);
    if (cached) { programs.push(cached); continue; }
    if (inst + 2 > bank.length) throw new Error(`MIDI Loriciel: instrument ${p} out of range`);
    const n = u16BE(bank, inst);
    const ranges: LoricielKeyRange[] = [];
    for (let e = 0; e < n; e++) {
      const at = inst + 2 + e * 8;
      if (at + 8 > bank.length) throw new Error(`MIDI Loriciel: instrument ${p} range ${e} out of range`);
      const header = -s32BE(bank, at);
      let idx = byHeader.get(header);
      if (idx === undefined) {
        if (header <= 0 || header + 8 > bank.length) throw new Error(`MIDI Loriciel: sample header ${header} out of range`);
        const data = -s32BE(bank, header);
        const length = u16BE(bank, header + 6);
        if (data <= 0 || data + length > bank.length) throw new Error(`MIDI Loriciel: sample data ${data}+${length} out of range`);
        idx = samples.length;
        samples.push({ header, data, length });
        byHeader.set(header, idx);
      }
      ranges.push({ sample: idx, base: s8(bank[at + 4]), top: s8(bank[at + 6]) });
    }
    instCache.set(inst, ranges);
    programs.push(ranges);
  }
  return { programs, samples };
}

/** lbC000844: the range a key selects (first range with key <= top), or null past the last. */
export function loricielRange(ranges: readonly LoricielKeyRange[], key: number): LoricielKeyRange | null {
  for (const r of ranges) if (key <= r.top) return r;
  return null;
}

// ── The player's schedule ────────────────────────────────────────────────────

/** A note-on as the player plays it. */
export interface LoricielNoteOn {
  row: number; voice: number;
  track: number; event: number;
  channel: number; key: number; velocity: number; program: number;
  sample: number; period: number; periodIndex: number; volume: number;
}
/** A note-off that stopped a voice (DMA off). */
export interface LoricielNoteOff { row: number; voice: number; track: number; event: number; channel: number; key: number }
/** A FF 51 tempo event and the timer it sets. */
export interface LoricielTempo { row: number; track: number; event: number; tempo: number; timer: number }
/** A note-off that matched no voice: the player does nothing with it. */
export interface LoricielIgnoredOff { row: number; track: number; event: number; channel: number; key: number }

/** Per-voice Paula state after an interrupt (what the runner's registers hold). */
export interface LoricielVoiceState { period: number; volume: number; dma: boolean; sample: number }

export interface LoricielSchedule {
  /** MThd division word. */
  division: number;
  /** Rows (interrupts) in one pass: last end-of-track row + the restart row + 1. */
  rows: number;
  /** The interrupt that restarts the song (SongEnd + Init). */
  restartRow: number;
  noteOns: LoricielNoteOn[];
  noteOffs: LoricielNoteOff[];
  ignoredOffs: LoricielIgnoredOff[];
  tempos: LoricielTempo[];
  /** Voices still sounding when the restart silences them. */
  restartCuts: number[];
  /** Absolute MIDI tick of every event, [track][event]. */
  ticks: number[][];
  /** The interrupt each event fired in, [track][event]. */
  fireRows: number[][];
  /** Per-interrupt Paula state, only when asked for (traces/tests). */
  states?: LoricielVoiceState[][];
}

/**
 * The events the player reads exactly as midi-file does. Anything it would
 * read differently (running status, Dx, F7, odd meta lengths, a track
 * without FF 2F) makes the schedule throw: the player desyncs there and no
 * grid can say what it plays.
 */
function checkPlayerReadable(midi: MidiData, raw: Uint8Array): void {
  if (midi.tracks.length > 16) throw new Error('MIDI Loriciel: more than 16 tracks (the player has 16 track slots)');
  midi.tracks.forEach((track, t) => {
    if (track.length === 0 || track[track.length - 1].type !== 'endOfTrack') {
      throw new Error(`MIDI Loriciel: track ${t} does not end with FF 2F (the player reads past it)`);
    }
    for (const e of track) {
      if ('running' in e && e.running) throw new Error('MIDI Loriciel: running status (the player has none)');
      switch (e.type) {
        case 'channelAftertouch': throw new Error('MIDI Loriciel: Dx channel pressure (the player skips 2 bytes)');
        case 'endSysEx': throw new Error('MIDI Loriciel: F7 sysex (the player skips 2 bytes)');
        default: break;
      }
    }
  });
  // FF 20 / FF 51 / FF 2F: the player assumes lengths 1 / 3 / 0. midi-file
  // reads the real length; the byte walk checks they are the assumed ones.
  let off = 14;
  for (let t = 0; t < midi.tracks.length; t++) {
    const len = u32BE(raw, off + 4);
    const end = off + 8 + len;
    let p = off + 8;
    const vlq = (): number => { let v = 0; for (;;) { const b = raw[p++]; v = (v << 7) | (b & 0x7F); if (!(b & 0x80)) return v; } };
    while (p < end) {
      vlq();
      const s = raw[p++];
      if (s === 0xFF) {
        const type = raw[p++];
        const l = vlq();
        const want = type === 0x20 ? 1 : type === 0x51 ? 3 : type === 0x2F ? 0 : -1;
        if (want >= 0 && l !== want) throw new Error(`MIDI Loriciel: FF ${type.toString(16)} with length ${l} (the player assumes ${want})`);
        p += l;
      } else if (s === 0xF0 || s === 0xF7) {
        p += vlq();
      } else {
        const hi = s & 0xF0;
        p += hi === 0xC0 || hi === 0xD0 ? 1 : 2;
      }
    }
    off = end;
  }
}

interface VoiceSlot { channel: number; key: number; sample: number }

/**
 * Run the player over one pass of the song: Init_1/Init_2, then the
 * interrupt (Play) until the restart. `withStates` records every voice's
 * period/volume/DMA after each interrupt.
 */
export function scheduleMIDILoriciel(midi: MidiData, raw: Uint8Array, bank: LoricielBank, withStates = false): LoricielSchedule {
  checkPlayerReadable(midi, raw);
  const division = u16BE(raw, 12);
  const SENTINEL = -32768;                     // $FFFF8000: read the first delta
  const tracks = midi.tracks.map(() => ({ pos: 0, counter: SENTINEL, active: true }));
  let activeCount = midi.tracks.length;

  const voices: VoiceSlot[] = [0, 1, 2, 3].map(() => ({ channel: -1, key: 0, sample: -1 }));
  const paula: LoricielVoiceState[] = [0, 1, 2, 3].map(() => ({ period: 0, volume: 0, dma: false, sample: -1 }));
  const chanProgram = new Array<number>(16).fill(0);
  const chanVoice = new Array<number>(16).fill(-1);

  const ticks: number[][] = midi.tracks.map((tr) => { let t = 0; return tr.map((e) => (t += e.deltaTime)); });
  const fireRows: number[][] = midi.tracks.map((tr) => tr.map(() => -1));
  const out: LoricielSchedule = {
    division, rows: 0, restartRow: 0, noteOns: [], noteOffs: [], ignoredOffs: [], tempos: [], restartCuts: [],
    ticks, fireRows, states: withStates ? [] : undefined,
  };

  const noteOff = (row: number, t: number, ev: number, ch: number, key: number): void => {
    const v = chanVoice[ch];
    if (v >= 0 && voices[v].channel === ch && voices[v].key === key) {
      voices[v].channel = -1;
      chanVoice[ch] = -1;
      paula[v].dma = false;
      out.noteOffs.push({ row, voice: v, track: t, event: ev, channel: ch, key });
    } else {
      out.ignoredOffs.push({ row, track: t, event: ev, channel: ch, key });
    }
  };

  const noteOn = (row: number, t: number, ev: number, ch: number, key: number, velocity: number): void => {
    // lbC000B30: first free slot, else the last slot holding this channel, else slot 0.
    let v = voices.findIndex((s) => s.channel < 0);
    if (v < 0) {
      v = 0;
      for (let i = 0; i < 4; i++) if (voices[i].channel === ch) v = i;
    }
    const program = chanProgram[ch];
    const ranges = bank.programs[program];
    if (!ranges) throw new Error(`MIDI Loriciel: program ${program} is past the bank's ${bank.programs.length} instruments`);
    const range = loricielRange(ranges, key);
    if (!range) throw new Error(`MIDI Loriciel: key ${key} is above every range of program ${program}`);
    const periodIndex = key - range.base;
    if (periodIndex < LORICIEL_PERIOD_MIN_INDEX || periodIndex > LORICIEL_PERIOD_MAX_INDEX) {
      throw new Error(`MIDI Loriciel: key ${key} on program ${program} reads past the period table (index ${periodIndex})`);
    }
    const period = LORICIEL_PERIODS[periodIndex - LORICIEL_PERIOD_MIN_INDEX];
    const volume = loricielVolume(velocity);
    voices[v] = { channel: ch, key, sample: range.sample };
    chanVoice[ch] = v;
    paula[v] = { period, volume, dma: true, sample: range.sample };
    out.noteOns.push({ row, voice: v, track: t, event: ev, channel: ch, key, velocity, program, sample: range.sample, period, periodIndex, volume });
  };

  const process = (row: number, t: number): void => {
    const tr = tracks[t];
    const ev = tr.pos++;
    fireRows[t][ev] = row;
    const e: MidiEvent = midi.tracks[t][ev];
    switch (e.type) {
      case 'noteOn':
        if (e.velocity === 0) noteOff(row, t, ev, e.channel, e.noteNumber);
        else noteOn(row, t, ev, e.channel, e.noteNumber, e.velocity);
        break;
      case 'noteOff': noteOff(row, t, ev, e.channel, e.noteNumber); break;
      case 'programChange': chanProgram[e.channel] = e.programNumber; break;
      case 'setTempo': out.tempos.push({ row, track: t, event: ev, tempo: e.microsecondsPerBeat, timer: loricielTimer(e.microsecondsPerBeat, division) }); break;
      case 'endOfTrack': tr.active = false; activeCount--; break;
      default: break;                            // skipped by length; no Paula effect
    }
  };

  const MAX_ROWS = 1 << 20;
  for (let row = 0; row < MAX_ROWS; row++) {
    if (activeCount === 0) {
      // lbC000406: SongEnd, Init_1, Init_2 - Paula off, voices freed.
      out.restartRow = row;
      out.rows = row + 1;
      for (let v = 0; v < 4; v++) if (voices[v].channel >= 0) out.restartCuts.push(v);
      if (out.states) out.states.push(paula.map(() => ({ period: 0, volume: 0, dma: false, sample: -1 })));
      return out;
    }
    for (let t = 0; t < tracks.length; t++) {
      const tr = tracks[t];
      if (!tr.active) continue;
      if (tr.counter === SENTINEL) {
        tr.counter = 0;
      } else {
        tr.counter -= LORICIEL_TICKS_PER_INTERRUPT;
        if (tr.counter > 0) continue;
        process(row, t);
        if (!tr.active) continue;
      }
      for (;;) {
        const d = midi.tracks[t][tr.pos].deltaTime;
        if (d !== 0) { tr.counter += d; break; }
        process(row, t);
        if (!tr.active) break;
      }
    }
    if (out.states) out.states.push(paula.map((s) => ({ ...s })));
  }
  throw new Error('MIDI Loriciel: the song never ends');
}

// ── Grid ─────────────────────────────────────────────────────────────────────

/** The companion bank among the song's companion files (SMPL.<tune> or <tune>.BSP). */
export function findLoricielBank(filename: string, companions?: Map<string, ArrayBuffer>): Uint8Array | null {
  if (!companions || companions.size === 0) return null;
  const base = (filename.split('/').pop() ?? filename).toLowerCase();
  const tune = base.startsWith('midi.') ? base.slice(5) : base.replace(/\.mid$/, '');
  const named = (n: string) => n.split('/').pop()!.toLowerCase();
  let pick: ArrayBuffer | undefined;
  for (const [n, data] of companions) {
    const b = named(n);
    if (b === `smpl.${tune}` || b === `${tune}.bsp`) { pick = data; break; }
  }
  if (!pick) {
    for (const [n, data] of companions) {
      const b = named(n);
      if (b.startsWith('smpl.') || b.endsWith('.bsp')) { pick = data; break; }
    }
  }
  return pick ? new Uint8Array(pick) : null;
}

/** Rows per grid pattern: one bar at the file's first time signature (4/4 by default). */
function rowsPerBar(midi: MidiData, division: number): number {
  const ppq = division & 0x8000 ? 0xC0 : division;
  let num = 4, den = 4;
  for (const e of midi.tracks[0] ?? []) {
    if (e.type === 'timeSignature') { num = e.numerator; den = e.denominator; break; }
    if (e.deltaTime > 0) break;
  }
  const rows = Math.round((ppq * num * 4) / den / LORICIEL_TICKS_PER_INTERRUPT);
  if (rows >= 16 && rows <= 256) return rows;
  const beat = Math.round(ppq / LORICIEL_TICKS_PER_INTERRUPT);
  return beat >= 16 && beat <= 256 ? beat : 64;
}

export const LORICIEL_NOTE_OFF = 97;
/** Effect F: the BPM a tempo event sets (2.5 x the interrupt rate at speed 1). */
const EFFECT_SET_SPEED = 0x0F;

/** The song's BPM at speed 1 (one row per interrupt): 2.5 x the interrupt rate. */
export function loricielBpm(timer: number): number {
  return Math.max(32, Math.min(999, Math.round(loricielInterruptHz(timer) * 2.5)));
}

/**
 * The grid note a period index plays: index + 27 inside the real table, the
 * nearest ProTracker-named pitch of the word read outside it; 0 when that
 * pitch has no grid note (below C-0 or above B-7).
 */
export function loricielGridNote(periodIndex: number): number {
  if (periodIndex >= LORICIEL_TABLE_MIN_INDEX && periodIndex <= LORICIEL_TABLE_MAX_INDEX) {
    const n = periodIndex + LORICIEL_NOTE_OFFSET;
    return n >= 1 ? n : 0;
  }
  const period = LORICIEL_PERIODS[periodIndex - LORICIEL_PERIOD_MIN_INDEX];
  if (!(period > 0)) return 0;
  const pitch = periodToPitch(period);
  return pitch >= 1 && pitch <= 96 ? pitch : 0;
}

/**
 * A grid cell for a note-on. A period with no grid note (Cartoons 1: one
 * key read 6682 from the velocity table, two octaves below C-0) keeps its
 * instrument and volume with an empty note.
 */
export function loricielNoteCell(n: Pick<LoricielNoteOn, 'periodIndex' | 'sample' | 'volume'>): TrackerCell {
  return {
    note: loricielGridNote(n.periodIndex), instrument: n.sample + 1, volume: 0x10 + n.volume,
    effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
  };
}

const emptyCell = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

/** A grid column's event: a note-on, or the note-off that stopped the voice. */
export type LoricielCellEvent =
  | { kind: 'on'; on: LoricielNoteOn }
  | { kind: 'off'; off: LoricielNoteOff };

/** Note columns per cell (TrackerCell note, note2, note3, note4). */
export const LORICIEL_MAX_COLUMNS = 4;

/**
 * What each (voice, row) cell shows, in the player's order (interrupt, then
 * track, then event): every note-on the voice took in that interrupt, one
 * note column each, and the note-off that stopped it when nothing started
 * after it. A note-off followed by a note-on in the same interrupt is the
 * retrigger the note column already says. Two note-ons in one interrupt are
 * a MIDI chord the allocator put on one voice: the first one's sample is the
 * one DMA latches, the last one's period is the one that stays (the
 * research doc, "Collisions").
 */
export function loricielCellEvents(s: LoricielSchedule): Map<number, LoricielCellEvent[]> {
  type Ev = { row: number; track: number; event: number; voice: number; ev: LoricielCellEvent };
  const evs: Ev[] = [
    ...s.noteOns.map((on) => ({ row: on.row, track: on.track, event: on.event, voice: on.voice, ev: { kind: 'on', on } as LoricielCellEvent })),
    ...s.noteOffs.map((off) => ({ row: off.row, track: off.track, event: off.event, voice: off.voice, ev: { kind: 'off', off } as LoricielCellEvent })),
  ];
  evs.sort((a, b) => a.row - b.row || a.track - b.track || a.event - b.event);
  const cells = new Map<number, LoricielCellEvent[]>();
  for (const e of evs) {
    const key = e.voice * s.rows + e.row;
    let list = cells.get(key);
    if (!list) cells.set(key, list = []);
    // A note-on after a note-off in the same cell: the off is the retrigger.
    if (e.ev.kind === 'on' && list.length > 0 && list[list.length - 1].kind === 'off') list.pop();
    list.push(e.ev);
  }
  for (const list of cells.values()) {
    if (list.length > LORICIEL_MAX_COLUMNS) throw new Error(`MIDI Loriciel: ${list.length} events on one voice in one interrupt (the grid has ${LORICIEL_MAX_COLUMNS} note columns)`);
  }
  return cells;
}

const NOTE_KEYS = [['note', 'instrument', 'volume'], ['note2', 'instrument2', 'volume2'], ['note3', 'instrument3', 'volume3'], ['note4', 'instrument4', 'volume4']] as const;

/** Write note column `col` (0-based) of a cell. */
export function setNoteColumn(cell: TrackerCell, col: number, note: number, instrument: number, volume: number): void {
  const [n, i, v] = NOTE_KEYS[col];
  (cell as unknown as Record<string, number>)[n] = note;
  (cell as unknown as Record<string, number>)[i] = instrument;
  (cell as unknown as Record<string, number>)[v] = volume;
}

/** Read note column `col` (0-based) of a cell; absent columns read empty. */
export function getNoteColumn(cell: TrackerCell, col: number): { note: number; instrument: number; volume: number } {
  const [n, i, v] = NOTE_KEYS[col];
  const r = cell as unknown as Record<string, number | undefined>;
  return { note: r[n] ?? 0, instrument: r[i] ?? 0, volume: r[v] ?? 0 };
}

/** The grid of one pass: rows[voice][row]. */
export function loricielGridRows(s: LoricielSchedule): TrackerCell[][] {
  const grid = [0, 1, 2, 3].map(() => Array.from({ length: s.rows }, emptyCell));
  for (const [key, list] of loricielCellEvents(s)) {
    const cell = grid[Math.floor(key / s.rows)][key % s.rows];
    list.forEach((e, col) => {
      if (e.kind === 'on') {
        const c = loricielNoteCell(e.on);
        setNoteColumn(cell, col, c.note, c.instrument, c.volume);
      } else {
        setNoteColumn(cell, col, LORICIEL_NOTE_OFF, 0, 0);
      }
    });
  }
  for (const t of s.tempos) {
    if (t.row === 0) continue;                 // the song's initial BPM
    const bpm = Math.round(loricielInterruptHz(t.timer) * 2.5);
    if (bpm < 0x20 || bpm > 0xFF) throw new Error(`MIDI Loriciel: tempo ${t.tempo} at row ${t.row} is ${bpm} BPM (effect F holds 32..255)`);
    const c = grid[0][t.row];
    c.effTyp = EFFECT_SET_SPEED; c.eff = bpm;
  }
  for (const v of s.restartCuts) {
    const c = grid[v][s.restartRow];
    c.note = LORICIEL_NOTE_OFF;
  }
  return grid;
}

/** Note columns each voice uses (1..4), for channelMeta.noteCols. */
function noteColumnsUsed(grid: TrackerCell[][]): number[] {
  return grid.map((rows) => {
    let cols = 1;
    for (const c of rows) for (let k = cols; k < LORICIEL_MAX_COLUMNS; k++) if (getNoteColumn(c, k).note) cols = k + 1;
    return cols;
  });
}

/** Cut a [voice][row] grid into patterns of `rowsPer` rows, in order. */
function toPatterns(grid: TrackerCell[][], rowsPer: number, filename: string): Pattern[] {
  const total = grid[0].length;
  const cols = noteColumnsUsed(grid);
  const patterns: Pattern[] = [];
  for (let start = 0, p = 0; start < total; start += rowsPer, p++) {
    const len = Math.min(rowsPer, total - start);
    patterns.push({
      id: `pattern-${p}`, name: `Pattern ${p}`, length: len,
      channels: grid.map((rows, v) => ({
        id: `channel-${v}`, name: `Paula ${v + 1}`, muted: false, solo: false, collapsed: false,
        volume: 100, pan: v === 0 || v === 3 ? -50 : 50, instrumentId: null, color: null,
        rows: rows.slice(start, start + len),
        ...(cols[v] > 1 ? { channelMeta: { importedFromMOD: false, noteCols: cols[v] } } : {}),
      })),
      importMetadata: {
        sourceFormat: 'MOD' as const, sourceFile: filename, importedAt: new Date().toISOString(),
        originalChannelCount: 4, originalPatternCount: 0, originalInstrumentCount: 0,
      },
    });
  }
  return patterns;
}

export interface DecodedMIDILoriciel {
  midi: MidiData;
  bank: LoricielBank;
  schedule: LoricielSchedule;
  /** [voice][row] for one pass. */
  grid: TrackerCell[][];
  rowsPerPattern: number;
}

/** Module + bank -> the player's schedule and its grid. */
export function decodeMIDILoriciel(module: Uint8Array, bankBytes: Uint8Array, withStates = false): DecodedMIDILoriciel {
  if (!isMIDILoricielFormat(module)) throw new Error('Not a MIDI Loriciel module');
  const midi = parseMidi(module);
  const bank = parseLoricielBank(bankBytes);
  const schedule = scheduleMIDILoriciel(midi, module, bank, withStates);
  const grid = loricielGridRows(schedule);
  return { midi, bank, schedule, grid, rowsPerPattern: rowsPerBar(midi, schedule.division) };
}

/**
 * Parse a MIDI Loriciel module with its BNKS bank (a companion file). Throws
 * without the bank or when the player could not read the file as midi-file
 * does: the caller then falls back to UADE's scan.
 */
export function parseMIDILoricielFile(buffer: ArrayBuffer, filename: string, companions?: Map<string, ArrayBuffer>): TrackerSong {
  const module = new Uint8Array(buffer);
  if (!isMIDILoricielFormat(module)) throw new Error('Not a MIDI Loriciel module');
  const bankBytes = findLoricielBank(filename, companions);
  if (!bankBytes) throw new Error('MIDI Loriciel: no SMPL.<tune> sample bank beside the module');
  const dec = decodeMIDILoriciel(module, bankBytes);

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^midi\./i, '').replace(/\.mid$/i, '') || baseName;
  const instruments: InstrumentConfig[] = dec.bank.samples.map((s, i) =>
    createSamplerInstrument(i + 1, `Sample ${i + 1}`, bankBytes.subarray(s.data, s.data + s.length), 64, 8287, 0, 0));
  const patterns = toPatterns(dec.grid, dec.rowsPerPattern, filename);
  const firstTimer = dec.schedule.tempos.filter((t) => t.row === 0).pop()?.timer ?? loricielTimer(LORICIEL_DEFAULT_TEMPO, dec.schedule.division);

  return {
    name: `${moduleName} [MIDI Loriciel]`, format: 'MOD' as TrackerFormat,
    patterns, instruments,
    songPositions: patterns.map((_, i) => i),
    songLength: patterns.length, restartPosition: 0, numChannels: 4,
    // One row per player interrupt: speed 1, the grid follow maps the
    // runner's interrupt count straight onto rows.
    initialSpeed: 1, initialBPM: loricielBpm(firstTimer), linearPeriods: false,
  };
}
