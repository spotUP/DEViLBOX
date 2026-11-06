/**
 * DaveLoweParser.ts — Dave Lowe Amiga music format (.dl / DL.*) native parser
 *
 * Dave Lowe (Uncle Tom) composed music for many famous Amiga games including
 * Lure of the Temptress, Worlds of Legend, and Flight of the Amazon Queen.
 *
 * The module is a compiled 68k HUNK executable containing:
 *   - Player code (Init, Play, End routines)
 *   - Pointer table to code/data sections
 *   - Sample descriptor table (14 bytes per sample)
 *   - Volume envelope data
 *   - Per-channel position lists (arrays of pointers to command sections)
 *   - Command stream sections (word-based: notes, commands, durations)
 *
 * Binary layout (CODE_BASE = 0x20, after HUNK header):
 *   +0x00: 70FF 4E75 (moveq #-1,d0; rts)
 *   +0x04: "UNCL" "EART" signature
 *   +0x0C: 9 longword pointers (Init, Play, End, SubsongCtr, SampleInfo,
 *           EndSampleInfo, Init2, InitPlayer, FirstSubsong)
 *   +0x30: 7 longword metadata (SongName, AuthorName, SpecialInfo,
 *           LoadSize, CalcSize, SamplesSize, SongSize)
 *
 * Command stream format (word-based):
 *   word > 100: NOTE — next word is duration in ticks
 *   word ==  4: SET_INSTRUMENT — next longword is pointer to sample descriptor
 *   word ==  8: SEQ_ADVANCE — end of this section
 *   word == 12: SET_VOL_ENV — next longword is pointer to volume envelope
 *   word == 32: REST — next word is duration in ticks
 *
 * Reference: third-party/uade-3.05/amigasrc/players/wanted_team/DaveLowe/src/Dave Lowe_v3.asm
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell } from '@/types';
import type { InstrumentConfig } from '@/types/instrument';
import type { UADEVariablePatternLayout, VariableLengthEncoder } from '@/engine/uade/UADEPatternEncoder';
import { makeRowClock, gcd, type RowClock } from './stepRowClock';
import { DL_FX_VOL_ENV } from './daveLoweEffectGlyphs';
import { createSamplerInstrument, periodToNoteIndex, amigaNoteToXM } from './AmigaUtils';

// ── Constants ─────────────────────────────────────────────────────────────────

const HUNK_HEADER = 0x000003F3;
const CODE_BASE = 0x20;          // start of code section after HUNK header
const PTR_TABLE_OFF = 0x0C;     // offset from CODE_BASE to pointer table
const SAMPLE_DESC_SIZE = 14;     // bytes per sample descriptor

// Command codes in the DL command stream
const CMD_SET_INSTRUMENT = 4;
const CMD_SEQ_ADVANCE = 8;
const CMD_SET_VOL_ENV = 12;
const CMD_REST = 32;
const NOTE_OFF = 97;             // XM note off: a rest that follows a note
const CMD_NOTE_THRESHOLD = 100;  // words > 100 are note periods
/** Other words that end a section like SEQ_ADVANCE does (the parser stops on them; the encoder writes the section's own word back). */
export const DL_END_WORDS: readonly number[] = [0x14, 0x1c, 0x30];

// Standard ProTracker period table for encoding
const MOD_PERIODS = [
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,
];

// ── Binary helpers ────────────────────────────────────────────────────────────

function u16BE(buf: Uint8Array, off: number): number {
  return (buf[off] << 8) | buf[off + 1];
}

function u32BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0;
}

function readNullStr(buf: Uint8Array, off: number, maxLen: number): string {
  let s = '';
  for (let i = 0; i < maxLen && off + i < buf.length; i++) {
    const c = buf[off + i];
    if (c === 0) break;
    if (c < 0x20 || c > 0x7e) return '';
    s += String.fromCharCode(c);
  }
  return s;
}

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Return true if the buffer is a Dave Lowe format module.
 *
 * Detection from UADE Dave Lowe_v3.asm DTP_Check2:
 *   cmp.l  #$000003F3,(A0)      ; HUNK magic
 *   cmp.l  #$70FF4E75,32(A0)   ; moveq #-1,d0 + rts
 *   cmp.l  #'UNCL',36(A0)
 *   cmp.l  #'EART',40(A0)
 */
export function isDaveLoweFormat(buf: Uint8Array): boolean {
  if (buf.length < 44) return false;
  if (u32BE(buf, 0) !== HUNK_HEADER) return false;
  if (u32BE(buf, 32) !== 0x70FF4E75) return false;
  if (buf[36] !== 0x55 || buf[37] !== 0x4E || buf[38] !== 0x43 || buf[39] !== 0x4C) return false;
  if (buf[40] !== 0x45 || buf[41] !== 0x41 || buf[42] !== 0x52 || buf[43] !== 0x54) return false;
  return true;
}

// ── Command stream event types ────────────────────────────────────────────────

interface DLNote {
  type: 'note';
  period: number;
  duration: number;
}
interface DLRest {
  type: 'rest';
  duration: number;
}
interface DLSetInstrument {
  type: 'setInstrument';
  sampleInfoPtr: number;  // offset from module base
}
interface DLSetVolEnv {
  type: 'setVolEnv';
  envPtr: number;
}
interface DLSeqAdvance {
  type: 'seqAdvance';
  /** The terminator word when it is not SEQ_ADVANCE itself (see DL_END_WORDS). */
  word?: number;
}

type DLEvent = DLNote | DLRest | DLSetInstrument | DLSetVolEnv | DLSeqAdvance;

// ── Parse a single command stream section ─────────────────────────────────────

function parseCommandStream(buf: Uint8Array, fileOff: number): { events: DLEvent[]; byteSize: number } {
  const events: DLEvent[] = [];
  let pos = fileOff;
  const end = buf.length - 1;

  while (pos < end) {
    const word = u16BE(buf, pos);
    pos += 2;

    if (word > CMD_NOTE_THRESHOLD) {
      // NOTE: period in this word, duration in next word
      if (pos + 2 > buf.length) break;
      const duration = u16BE(buf, pos);
      pos += 2;
      events.push({ type: 'note', period: word, duration });
    } else if (word === CMD_SET_INSTRUMENT) {
      if (pos + 4 > buf.length) break;
      const ptr = u32BE(buf, pos);
      pos += 4;
      events.push({ type: 'setInstrument', sampleInfoPtr: ptr });
    } else if (word === CMD_SET_VOL_ENV) {
      if (pos + 4 > buf.length) break;
      const ptr = u32BE(buf, pos);
      pos += 4;
      events.push({ type: 'setVolEnv', envPtr: ptr });
    } else if (word === CMD_REST) {
      if (pos + 2 > buf.length) break;
      const duration = u16BE(buf, pos);
      pos += 2;
      events.push({ type: 'rest', duration });
    } else if (word === CMD_SEQ_ADVANCE) {
      events.push({ type: 'seqAdvance' });
      break;
    } else if (DL_END_WORDS.includes(word)) {
      events.push({ type: 'seqAdvance', word });
      break;
    } else if (word === 0) {
      // end marker
      break;
    } else {
      // Unknown command — skip and hope for the best
      // Some modules may have additional commands
      break;
    }
  }

  return { events, byteSize: pos - fileOff };
}

// ── Step row clock ────────────────────────────────────────────────────────────

/**
 * One grid row is one song step (thoughts/shared/plans/2026-11-05-step-grid.md). Dave Lowe commands carry authored
 * durations and no speed command, so the step is the exact GCD of every note and rest duration of the song: every
 * event then starts on the first tick of its row (offset 0) and no row-offset effect is needed.
 */
export function daveLoweStep(durations: Iterable<number>): number {
  let g = 0;
  for (const d of durations) if (d > 0) g = g ? gcd(g, d) : d;
  return Math.max(1, g);
}

/** The durations of every note and rest of a parsed command stream. */
export function eventDurations(events: ReadonlyArray<{ type: string; duration?: number }>): number[] {
  const out: number[] = [];
  for (const e of events) if ((e.type === 'note' || e.type === 'rest') && e.duration) out.push(e.duration);
  return out;
}

export const daveLoweRowClock = (step: number): RowClock => makeRowClock([{ tick: 0, speed: step }]);

// ── Convert events to tracker rows ────────────────────────────────────────────

interface RowData {
  note: number;      // XM note (0 = no note)
  instrument: number; // 1-based instrument (0 = no change)
  volume: number;
  effTyp: number;
  eff: number;
  /** The authored Amiga period of a note (finetuned songs hold periods between the table's); the encoder writes it back while the note is unchanged. */
  period?: number;
  /** The stream sets the instrument the channel already runs; the encoder writes the repeated command. */
  dlInstrRepeat?: boolean;
  /** The section ended on this terminator word instead of SEQ_ADVANCE (set on its last row). */
  dlEnd?: number;
  /** The row is past the stream's end (only the row that carries the terminator of an empty section). */
  dlPadding?: boolean;
}

/** A command-stream event with its pointers already resolved to ids (instrument id 0 = pointer not a known instrument). */
export type DLGridEvent =
  | { type: 'note'; period: number; duration: number }
  | { type: 'rest'; duration: number }
  | { type: 'setInstrument'; id: number }
  | { type: 'setVolEnv'; envId: number }
  | { type: 'seqAdvance'; word?: number };

/**
 * Events to grid rows (shared by Dave Lowe and Dave Lowe New). A note takes the running instrument; SET_INSTRUMENT
 * and SET_VOL_ENV commands attach to the next note or rest: the instrument column and the DL_FX_VOL_ENV effect of
 * the row that event starts, so the encoder writes them back before it in the same order.
 */
export function eventsToGridRows(events: DLGridEvent[], clock: RowClock): { rows: RowData[]; totalTicks: number } {
  const rows: RowData[] = [];
  let currentInstr = 0;
  let instrPending = false;
  let instrRepeat = false;
  let envPending = 0;
  let totalTicks = 0;
  const cells: Array<{ tick: number; cell: RowData }> = [];
  let afterNote = false;
  let endWord: number | undefined;

  const cellAt = (note: number, period = 0): RowData => {
    const cell: RowData = {
      note, instrument: (note > 0 && note !== NOTE_OFF) || instrPending ? currentInstr : 0, volume: 0,
      effTyp: envPending > 0 ? DL_FX_VOL_ENV : 0, eff: envPending,
    };
    if (period > 0) cell.period = period;
    if (instrRepeat) cell.dlInstrRepeat = true;
    instrPending = false;
    instrRepeat = false;
    envPending = 0;
    return cell;
  };

  for (const ev of events) {
    switch (ev.type) {
      case 'setInstrument':
        if (ev.id > 0) { instrRepeat = instrPending ? instrRepeat : ev.id === currentInstr; currentInstr = ev.id; instrPending = true; }
        break;
      case 'setVolEnv':
        if (ev.envId > 0) envPending = ev.envId;
        break;
      case 'note':
        afterNote = true;
        cells.push({ tick: totalTicks, cell: cellAt(amigaNoteToXM(periodToNoteIndex(ev.period)), ev.period) });
        totalTicks += ev.duration;
        break;
      case 'rest':
        // a rest after a note is a note off, so the encoder does not fold it into the note's duration
        if (instrPending || envPending > 0 || afterNote) cells.push({ tick: totalTicks, cell: cellAt(afterNote ? NOTE_OFF : 0) });
        afterNote = false;
        totalTicks += ev.duration;
        break;
      case 'seqAdvance':
        endWord = ev.word;
        break;
    }
  }

  for (let r = 0; r < clock.rowsForTicks(totalTicks); r++) rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0 });
  for (const n of cells) rows[clock.tickToRow(n.tick).row] = n.cell;
  if (instrPending || envPending > 0) {
    // commands after the last note or rest (a section of commands only has no row at all): one padding row carries
    // them and the section's end word, and the encoder writes them without a duration
    const tail = cellAt(0);
    tail.dlPadding = true;
    tail.dlEnd = endWord ?? CMD_SEQ_ADVANCE;
    rows.push(tail);
  } else if (endWord !== undefined) {
    if (rows.length === 0) rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, dlPadding: true });
    rows[rows.length - 1].dlEnd = endWord;
  }
  return { rows, totalTicks };
}

/** Whether the first adjacent SET_VOL_ENV / SET_INSTRUMENT pair of the song has the envelope first (default true). */
export const envComesFirst = (types: string[]): boolean => {
  for (let i = 0; i + 1 < types.length; i++) {
    if (types[i] === 'setVolEnv' && types[i + 1] === 'setInstrument') return true;
    if (types[i] === 'setInstrument' && types[i + 1] === 'setVolEnv') return false;
  }
  return true;
};

/** The distinct pointers in first-use order: envelope id n (1-based) is entry n-1. */
export const distinctPointers = (ptrs: Iterable<number>): number[] => [...new Set(ptrs)];

/** Old Dave Lowe: instrument ids are the sample descriptor index (1-based) of the pointer; envelope ids index `envPtrs`. */
function eventsToRows(events: DLEvent[], sampleInfoBase: number, envPtrs: number[], clock: RowClock): { rows: RowData[]; totalTicks: number } {
  const grid: DLGridEvent[] = events.map((ev): DLGridEvent => {
    if (ev.type === 'setInstrument') {
      const idx = sampleInfoBase > 0 ? Math.floor((ev.sampleInfoPtr - sampleInfoBase) / SAMPLE_DESC_SIZE) : -1;
      return { type: 'setInstrument', id: idx >= 0 ? idx + 1 : 0 };
    }
    if (ev.type === 'setVolEnv') return { type: 'setVolEnv', envId: envPtrs.indexOf(ev.envPtr) + 1 };
    return ev;
  });
  return eventsToGridRows(grid, clock);
}

// ── Encoder ───────────────────────────────────────────────────────────────────

/** The pointers a re-encode writes back: instrument id -> SET_INSTRUMENT pointer, envelope id (1-based) -> `envPtrs`. */
export interface DLCommandTables {
  /** The song writes SET_VOL_ENV before SET_INSTRUMENT (Dave Lowe New) or after it (Dave Lowe). */
  envFirst: boolean;
  instrumentPtr: (id: number) => number | undefined;
  envPtrs: readonly number[];
}

const pushCmd = (out: number[], word: number, ptr: number): void => {
  out.push(0x00, word, (ptr >>> 24) & 0xFF, (ptr >>> 16) & 0xFF, (ptr >>> 8) & 0xFF, ptr & 0xFF);
};

/**
 * Encode tracker rows back to DL command stream binary.
 * Groups consecutive note rows, rest rows, etc. into commands. The instrument column and the DL_FX_VOL_ENV effect
 * of a row come back as SET_INSTRUMENT (word 4) and SET_VOL_ENV (word 12) before its note or rest; an instrument
 * equal to the running one is written again only when the cell is flagged `dlInstrRepeat` (the stream repeated it).
 * Trailing `dlPadding` cells (a channel shorter than its pattern) are not part of the stream and add no duration.
 */
function encodeRowsToStream(rows: TrackerCell[], _channel: number, step = 1, tables?: DLCommandTables): Uint8Array {
  // Carrier path (byte-exact): rows produced by the parser's blockRows are
  // per-byte carriers of the real command-stream section (cutoff=1, period=byte).
  // Dave Lowe commands are variable-length word pairs; concatenating the carrier
  // bytes reproduces the section verbatim. The editable display grid stays
  // carrier-less and re-derives period/duration via the grid path below.
  if (rows.some(c => c.cutoff !== undefined)) {
    const carried: number[] = [];
    for (const cell of rows) {
      if (cell.cutoff === undefined) continue; // padding — emits nothing
      carried.push((cell.period ?? 0) & 0xFF);
    }
    return new Uint8Array(carried);
  }

  const out: number[] = [];
  let running = 0;
  const envOf = (c: TrackerCell): number => (c.effTyp === DL_FX_VOL_ENV ? (c.eff ?? 0) : 0);
  const hasCommand = (c: TrackerCell): boolean => (c.note ?? 0) > 0 || (c.instrument ?? 0) > 0 || envOf(c) > 0;
  const emitCommands = (c: TrackerCell): void => {
    if (!tables) return;
    const env = envOf(c);
    const emitEnv = (): void => { if (env > 0 && tables.envPtrs[env - 1] !== undefined) pushCmd(out, CMD_SET_VOL_ENV, tables.envPtrs[env - 1]); };
    if (tables.envFirst) emitEnv();
    const instr = c.instrument ?? 0;
    const ptr = instr > 0 && (instr !== running || c.dlInstrRepeat) ? tables.instrumentPtr(instr) : undefined;
    if (ptr !== undefined) { pushCmd(out, CMD_SET_INSTRUMENT, ptr); running = instr; }
    if (!tables.envFirst) emitEnv();
  };
  let i = 0;
  let end = rows.length;
  // a padding row that carries commands and the end word (dlEnd) holds the commands after the last note or rest
  const isTail = (c: TrackerCell): boolean => !!c.dlPadding && c.dlEnd !== undefined && (c.note ?? 0) === 0;
  while (end > 0 && rows[end - 1].dlPadding && (!hasCommand(rows[end - 1]) || isTail(rows[end - 1]))) end--;

  while (i < end) {
    const cell = rows[i];
    const note = cell.note ?? 0;

    if (note > 0 && note !== NOTE_OFF) {
      // Find duration: count how many subsequent rows carry no command
      let duration = 1;
      while (i + duration < end && !hasCommand(rows[i + duration])) {
        duration++;
      }
      // Convert XM note to period
      const periodIdx = note - 13; // XM note 13 = C-1 = period index 0
      const tablePeriod = (periodIdx >= 0 && periodIdx < MOD_PERIODS.length) ? MOD_PERIODS[periodIdx] : 0;
      // the authored period survives while the note is the one it was named from
      const authored = cell.period ?? 0;
      const period = authored > CMD_NOTE_THRESHOLD && amigaNoteToXM(periodToNoteIndex(authored)) === note ? authored : tablePeriod;
      if (period > 0) {
        emitCommands(cell);
        // Write period word + duration word
        out.push((period >> 8) & 0xFF, period & 0xFF);
        const ticks = duration * step;
        out.push((ticks >> 8) & 0xFF, ticks & 0xFF);
      }
      i += duration;
    } else {
      // REST: this row (which may carry commands) and the empty rows after it
      let duration = 1;
      while (i + duration < end && !hasCommand(rows[i + duration])) {
        duration++;
      }
      emitCommands(cell);
      out.push(0x00, CMD_REST);  // word = 32
      const ticks = duration * step;
      out.push((ticks >> 8) & 0xFF, ticks & 0xFF);
      i += duration;
    }
  }

  for (let k = end; k < rows.length; k++) if (isTail(rows[k]) && hasCommand(rows[k])) emitCommands(rows[k]);
  // the section's own terminator word (flagged on its last row, or on the one padding row of a section with no row), SEQ_ADVANCE otherwise
  let endWord = CMD_SEQ_ADVANCE;
  for (let k = rows.length - 1; k >= 0; k--) if (rows[k].dlEnd !== undefined) { endWord = rows[k].dlEnd!; break; }
  out.push(0x00, endWord);

  return new Uint8Array(out);
}

/** The encoder of a song whose grid row is `step` ticks: row gaps are multiplied back to the authored durations. */
export const daveLoweEncoderForStep = (step: number, tables?: DLCommandTables): VariableLengthEncoder => ({
  formatId: 'daveLowe',
  encodePattern: (rows, channel) => encodeRowsToStream(rows, channel, step, tables),
});

export const daveLoweEncoder: VariableLengthEncoder = daveLoweEncoderForStep(1);

// ── Main parser ───────────────────────────────────────────────────────────────

export async function parseDaveLoweFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  const buf = new Uint8Array(buffer);

  if (!isDaveLoweFormat(buf)) {
    throw new Error('Not a Dave Lowe module');
  }

  // ── Read pointer table ──────────────────────────────────────────────────
  const ptrBase = CODE_BASE + PTR_TABLE_OFF;
  // 9 longword pointers: Init, Play, End, SubsongCtr, SampleInfo, EndSampleInfo, Init2, InitPlayer, FirstSubsong
  const sampleInfoPtr  = u32BE(buf, ptrBase + 16);
  const endSampleInfo  = u32BE(buf, ptrBase + 20);
  const firstSubsongPtr = u32BE(buf, ptrBase + 32);

  // Metadata pointers (after the 9 code pointers)
  const metaBase = ptrBase + 36;
  const songNamePtr  = u32BE(buf, metaBase + 0);
  const authorNamePtr = u32BE(buf, metaBase + 4);

  // ── Module name ─────────────────────────────────────────────────────────
  const embeddedTitle = songNamePtr > 0 ? readNullStr(buf, CODE_BASE + songNamePtr, 64) : '';
  const embeddedAuthor = authorNamePtr > 0 ? readNullStr(buf, CODE_BASE + authorNamePtr, 64) : '';

  const baseName = filename.split('/').pop() ?? filename;
  const filenameDerived = baseName.replace(/^dl\./i, '').replace(/\.(dl|dl_deli)$/i, '') || baseName;
  const moduleName = embeddedTitle.trim() || filenameDerived;

  // ── Sample extraction ───────────────────────────────────────────────────
  const instruments: InstrumentConfig[] = [];
  let numSamples = 0;

  if (sampleInfoPtr > 0 && endSampleInfo > sampleInfoPtr) {
    numSamples = Math.floor((endSampleInfo - sampleInfoPtr) / SAMPLE_DESC_SIZE);
    const sampleBase = CODE_BASE + sampleInfoPtr;

    for (let i = 0; i < numSamples; i++) {
      const descOff = sampleBase + i * SAMPLE_DESC_SIZE;
      if (descOff + SAMPLE_DESC_SIZE > buf.length) break;

      const loopType   = u16BE(buf, descOff + 0);
      const sampleAddr = u32BE(buf, descOff + 2);
      const sampleLen  = u16BE(buf, descOff + 6);  // in words
      const loopOff    = u32BE(buf, descOff + 8);   // loop start offset (in bytes from sample start, or words?)
      const loopLen    = u16BE(buf, descOff + 12);  // loop length in words

      const lenBytes = sampleLen * 2;
      const pcmFileOff = CODE_BASE + sampleAddr;

      if (sampleAddr === 0 || lenBytes === 0 || pcmFileOff + lenBytes > buf.length) {
        // Empty/invalid sample — create a silent placeholder
        instruments.push({
          id: i + 1,
          name: '',
          type: 'synth' as const,
          synthType: 'Synth' as const,
          effects: [],
          volume: 0,
          pan: 0,
        } as InstrumentConfig);
        continue;
      }

      const pcm = new Uint8Array(lenBytes);
      for (let k = 0; k < lenBytes; k++) pcm[k] = buf[pcmFileOff + k];

      // Loop points: loopOff is a chip RAM address (same space as sampleAddr)
      // Convert to byte offset relative to sample start
      const loopStartRel = (loopType > 0 && loopOff >= sampleAddr) ? (loopOff - sampleAddr) : 0;
      const loopStart = loopType > 0 ? loopStartRel : 0;
      const loopEnd = loopType > 0 ? loopStartRel + loopLen * 2 : 0;

      instruments.push(createSamplerInstrument(
        i + 1,
        embeddedAuthor ? `${embeddedAuthor} ${i + 1}` : '',
        pcm, 64, 8287,
        loopStart, loopEnd,
      ));
    }
  }

  // Ensure at least 1 instrument
  if (instruments.length === 0) {
    instruments.push({
      id: 1,
      name: '',
      type: 'synth' as const,
      synthType: 'Synth' as const,
      effects: [],
      volume: 0,
      pan: 0,
    } as InstrumentConfig);
  }

  // ── Parse subsong/position lists ────────────────────────────────────────
  //
  // FirstSubsong points to a table: 4 longwords per subsong (one per channel).
  // Each longword is a pointer to a position list for that channel.
  // The position list is an array of longwords, each pointing to a command stream section.
  // Position list entries of 0x00000000 terminate.
  //
  // We parse subsong 1 (the default). Each channel's position list has independent
  // pointers — multiple positions can share the same command data (pattern reuse).

  const channelPositionLists: number[][] = [[], [], [], []]; // per-channel arrays of cmd section pointers
  const patterns: Pattern[] = [];
  const songPositions: number[] = [];

  if (firstSubsongPtr > 0) {
    const subsongTableOff = CODE_BASE + firstSubsongPtr;

    // Read 4 channel pointers for subsong 1
    const channelListPtrs: number[] = [];
    for (let ch = 0; ch < 4; ch++) {
      const off = subsongTableOff + ch * 4;
      if (off + 4 > buf.length) {
        channelListPtrs.push(0);
      } else {
        channelListPtrs.push(u32BE(buf, off));
      }
    }

    // Read each channel's position list
    for (let ch = 0; ch < 4; ch++) {
      if (channelListPtrs[ch] === 0) continue;
      const listOff = CODE_BASE + channelListPtrs[ch];
      let pos = listOff;
      while (pos + 4 <= buf.length) {
        const ptr = u32BE(buf, pos);
        if (ptr === 0) break;
        channelPositionLists[ch].push(ptr);
        pos += 4;
      }
    }

    // Determine the number of song positions (max length across channels)
    const numPositions = Math.max(...channelPositionLists.map(l => l.length), 1);

    // Collect unique command section pointers → unique patterns
    const uniqueSections = new Map<number, number>(); // sectionPtr → patternIndex
    const allSectionPtrs: number[] = [];

    // Build trackMap: [position][channel] → filePatternIndex
    const trackMap: number[][] = [];

    for (let posIdx = 0; posIdx < numPositions; posIdx++) {
      const chPats: number[] = [];
      for (let ch = 0; ch < 4; ch++) {
        const sectionPtr = posIdx < channelPositionLists[ch].length
          ? channelPositionLists[ch][posIdx]
          : 0;
        if (sectionPtr === 0) {
          chPats.push(-1);
        } else {
          if (!uniqueSections.has(sectionPtr)) {
            uniqueSections.set(sectionPtr, allSectionPtrs.length);
            allSectionPtrs.push(sectionPtr);
          }
          chPats.push(uniqueSections.get(sectionPtr)!);
        }
      }
      trackMap.push(chPats);
    }

    // Parse each unique command section into rows
    const sectionEvents = new Map<number, DLEvent[]>();
    const sectionRows = new Map<number, RowData[]>();   // sectionPtr → rows
    const sectionBytes = new Map<number, number>();      // sectionPtr → byte size

    for (const sectionPtr of allSectionPtrs) {
      const fileOff = CODE_BASE + sectionPtr;
      if (fileOff >= buf.length) {
        sectionRows.set(sectionPtr, []);
        sectionBytes.set(sectionPtr, 0);
        continue;
      }
      const { events, byteSize } = parseCommandStream(buf, fileOff);
      sectionEvents.set(sectionPtr, events);
      sectionBytes.set(sectionPtr, byteSize);
    }
    const songStep = daveLoweStep([...sectionEvents.values()].flatMap(eventDurations));
    const clock = daveLoweRowClock(songStep);
    const envPtrs = distinctPointers([...sectionEvents.values()].flatMap((evs) => evs.flatMap((e) => (e.type === 'setVolEnv' ? [e.envPtr] : []))));
    for (const [sectionPtr, events] of sectionEvents) {
      sectionRows.set(sectionPtr, eventsToRows(events, sampleInfoPtr, envPtrs, clock).rows);
    }

    // Build tracker patterns from positions
    // For each position, find the max row count across channels, then create a pattern
    for (let posIdx = 0; posIdx < numPositions; posIdx++) {
      let maxRows = 1;
      for (let ch = 0; ch < 4; ch++) {
        const sectionPtr = posIdx < channelPositionLists[ch].length
          ? channelPositionLists[ch][posIdx] : 0;
        if (sectionPtr > 0) {
          const rows = sectionRows.get(sectionPtr) ?? [];
          maxRows = Math.max(maxRows, rows.length);
        }
      }
      if (maxRows === 0) maxRows = 1;

      const channels: ChannelData[] = [];
      for (let ch = 0; ch < 4; ch++) {
        const sectionPtr = posIdx < channelPositionLists[ch].length
          ? channelPositionLists[ch][posIdx] : 0;
        const sRows = sectionPtr > 0 ? (sectionRows.get(sectionPtr) ?? []) : [];

        const trackerRows: TrackerCell[] = [];
        for (let r = 0; r < maxRows; r++) {
          if (r < sRows.length) {
            trackerRows.push({
              note: sRows[r].note,
              instrument: sRows[r].instrument,
              volume: sRows[r].volume,
              effTyp: sRows[r].effTyp,
              eff: sRows[r].eff,
              ...(sRows[r].period ? { period: sRows[r].period } : {}),
            ...(sRows[r].dlInstrRepeat ? { dlInstrRepeat: true } : {}),
              ...(sRows[r].dlEnd !== undefined ? { dlEnd: sRows[r].dlEnd } : {}),
              ...(sRows[r].dlPadding ? { dlPadding: true } : {}),
              effTyp2: 0,
              eff2: 0,
            });
          } else {
            trackerRows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0, dlPadding: true });
          }
        }

        channels.push({
          id: `channel-${ch}`,
          name: `Channel ${ch + 1}`,
          muted: false,
          solo: false,
          collapsed: false,
          volume: 100,
          pan: (ch === 0 || ch === 3) ? -50 : 50,
          instrumentId: null,
          color: null,
          rows: trackerRows,
        });
      }

      patterns.push({
        id: `pattern-${posIdx}`,
        name: `Pattern ${posIdx}`,
        length: maxRows,
        channels,
        importMetadata: {
          sourceFormat: 'MOD' as const,
          sourceFile: filename,
          importedAt: new Date().toISOString(),
          originalChannelCount: 4,
          originalPatternCount: numPositions,
          originalInstrumentCount: numSamples,
        },
      });

      songPositions.push(posIdx);
    }

    // ── Build UADEVariablePatternLayout ─────────────────────────────────────
    const filePatternAddrs: number[] = [];
    const filePatternSizes: number[] = [];

    for (const sectionPtr of allSectionPtrs) {
      filePatternAddrs.push(CODE_BASE + sectionPtr);
      filePatternSizes.push(sectionBytes.get(sectionPtr) ?? 0);
    }

    // Per-byte carrier rows: a Dave Lowe section is a variable-length command
    // stream, not a fixed grid. Per-byte carriers (cutoff=1, period=byte) let the
    // encoder reproduce each section verbatim; the editable display grid stays
    // carrier-less (edits export via the grid re-encode path).
    const blockRows: TrackerCell[][] = [];
    for (let i = 0; i < filePatternAddrs.length; i++) {
      const addr = filePatternAddrs[i];
      const size = filePatternSizes[i];
      const cells: TrackerCell[] = [];
      for (let b = 0; b < size && addr + b < buf.length; b++) {
        cells.push({
          note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
          cutoff: 1, period: buf[addr + b] & 0xFF,
        });
      }
      blockRows.push(cells);
    }

    const variableLayout: UADEVariablePatternLayout = {
      formatId: 'daveLowe',
      numChannels: 4,
      numFilePatterns: allSectionPtrs.length,
      rowsPerPattern: patterns.map(p => p.length),
      moduleSize: buf.length,
      encoder: daveLoweEncoderForStep(songStep, {
        instrumentPtr: (id) => (sampleInfoPtr > 0 ? sampleInfoPtr + (id - 1) * SAMPLE_DESC_SIZE : undefined),
        envPtrs,
        envFirst: envComesFirst([...sectionEvents.values()].flatMap((evs) => evs.map((e) => e.type))),
      }),
      filePatternAddrs,
      filePatternSizes,
      trackMap,
      blockRows,
    };

    // Assign to result (done below)
    const result: TrackerSong = {
      name: `${moduleName} [Dave Lowe]`,
      format: 'MOD' as TrackerFormat,
      patterns,
      instruments,
      songPositions,
      songLength: songPositions.length,
      restartPosition: 0,
      numChannels: 4,
      initialSpeed: songStep,  // one row per song step: the GCD of every duration
      initialBPM: 125,
      linearPeriods: false,
      uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
      uadeEditableFileName: filename,
      uadeVariableLayout: variableLayout,
    };
    return result;
  }

  // ── Fallback: no subsong data found ─────────────────────────────────────
  const emptyRows: TrackerCell[] = Array.from({ length: 64 }, () => ({
    note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
  }));

  patterns.push({
    id: 'pattern-0',
    name: 'Pattern 0',
    length: 64,
    channels: Array.from({ length: 4 }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false, solo: false, collapsed: false,
      volume: 100,
      pan: (ch === 0 || ch === 3) ? -50 : 50,
      instrumentId: null, color: null,
      rows: emptyRows,
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const,
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: 4,
      originalPatternCount: 1,
      originalInstrumentCount: instruments.length,
    },
  });
  songPositions.push(0);

  return {
    name: `${moduleName} [Dave Lowe]`,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength: 1,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
  };
}
