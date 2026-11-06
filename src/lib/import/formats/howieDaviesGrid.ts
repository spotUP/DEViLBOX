/**
 * Howie Davies (.hd) - the time-aligned, read-only grid (phase A) and its byte-exact stream carriers.
 *
 * Decoder truth: third-party/nuade/players/howiedavies/hd_module.c (hunk loader, the three replayer builds, hd_voice_list,
 * hd_pattern, hd_handler) and howiedavies.c (sequencer_voice, list_entry, run_command). The module is an Amiga executable
 * (one code hunk, HUNK_RELOC32) that carries its own replayer; every pointer in it is a relocated long holding a code
 * hunk image offset (file offset = image offset + 0x20).
 *
 * Song (subsong 0): each voice owns a position list. A list byte below 0x80 is a pattern number followed by a repeat
 * count (the pattern plays count + 1 times); a byte from 0x80 is a command from the list command table. A pattern byte
 * below 0x80 is a note (index into the period table) followed by a signed rest byte; from 0x80 it is a command from the
 * pattern command table. A command byte c selects the relocated pointer at table + (255 - c) * 4, and the replayer build
 * decides which handler lives at that address (Repeat ends the pattern, Instrument and Speed and Delay and MaxVolume take
 * one operand byte, the list commands restart the list or jump back by an operand).
 *
 * Time: the sequencer steps all voices every `speed` replayer ticks (the Speed command sets it for all voices, default 6)
 * starting at tick 0; a note with rest r sounds until the step r + 1 steps later. One tick is 20 ms (50 Hz assumed, the
 * module's timer is not read). One grid row is the greatest common divisor of all note ticks, so initialSpeed is that many
 * ticks at BPM 125. The grid runs to the first step at which every voice has restarted its list (the player's song end);
 * a voice that restarted earlier keeps looping until then.
 *
 * Three layers (docs/FORMAT_COMMAND_STREAM_GRID.md): the executed pattern and position list bytes are the truth;
 * `blockRows` holds one carrier cell per byte (cutoff 2, period = the byte) for every executed stream so the encoder
 * rebuilds them; the grid shows the decoded notes.
 *
 * Effect columns: Speed (S) and Maximum Volume (V) show on the next note's row. Not shown: the delay command (time,
 * not a state), envelopes and sample loops (they stay in the carriers), subsongs after the first. A voice that the list switches off (restart-off command) goes silent for the rest of the grid.
 */
import type { Pattern, TrackerCell, ChannelData } from '@/types';
import { periodToNote } from '@/lib/amiga/periodNotes';
import { HD_FX } from './commandStreamEffectGlyphs';
import type { StreamEffectSource } from './riffRaffGrid';
import { addCellEffect, effectColumnsMeta } from './cellEffectSlots';

const VOICES = 4;
const HUNK_BYTES = 0x20;
const COMMAND_BASE = 0x80;
const ROWS_PER_PATTERN = 64;
const MAX_TICKS = 400000;
const STEP_GUARD = 4096;
const PERIOD_COUNT = 86;
const DEFAULT_SPEED = 6;

type Handler = 'repeat' | 'instrument' | 'speed' | 'delay' | 'maxVolume' | 'listRestart' | 'listLoopBack' | 'listRestartOff' | 'return';

interface Driver {
  play: number; dmaOn: number; sampleTable: number; periodTable: number; commandTable: number; listCommandTable: number;
  patternTableOperand: number; defaultStreamOperand: number; subsongTableOperand: number; listLoopExtra: number; subsongStride: number;
  handlers: Array<[number, Handler]>;
}

/** The three replayer builds, found by the header's play / dma-on / sample-table offsets from the init routine. */
const DRIVERS: Driver[] = [
  { // Blazing Thunder
    play: 0xce, dmaOn: 0x182, sampleTable: 0x54a, periodTable: 0x478, commandTable: 0x528, listCommandTable: 0x53c,
    patternTableOperand: 0x2c6, defaultStreamOperand: 0x9c, subsongTableOperand: 0x30, listLoopExtra: 0, subsongStride: 4,
    handlers: [[0x2a4, 'repeat'], [0x2ea, 'instrument'], [0x334, 'speed'], [0x342, 'delay'], [0x34c, 'maxVolume'], [0x36e, 'listRestart'], [0x378, 'listLoopBack']],
  },
  { // Future Bike Simulator
    play: 0xc0, dmaOn: 0x16c, sampleTable: 0x548, periodTable: 0x472, commandTable: 0x526, listCommandTable: 0x536,
    patternTableOperand: 0x29a, defaultStreamOperand: 0x9c, subsongTableOperand: 0x48, listLoopExtra: 1, subsongStride: 16,
    handlers: [[0x278, 'repeat'], [0x2be, 'instrument'], [0x32e, 'speed'], [0x33c, 'delay'], [0x35a, 'listRestart'], [0x364, 'listLoopBack'], [0x37a, 'listRestartOff']],
  },
  { // Yogi's Great Escape
    play: 0xa4, dmaOn: 0x174, sampleTable: 0x5ae, periodTable: 0x4d8, commandTable: 0x588, listCommandTable: 0x59c,
    patternTableOperand: 0x2dc, defaultStreamOperand: 0x80, subsongTableOperand: 0x20, listLoopExtra: 1, subsongStride: 16,
    handlers: [[0x2ba, 'repeat'], [0x300, 'instrument'], [0x388, 'speed'], [0x396, 'delay'], [0x3a0, 'maxVolume'], [0x3c2, 'listRestart'], [0x3cc, 'listLoopBack'], [0x2a2, 'return']],
  },
];

const emptyCell = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

interface Image { b: Uint8Array; reloc: Uint8Array }

const u8 = (m: Image, o: number): number => (o >= 0 && o < m.b.length ? m.b[o] : 0);
const u16 = (m: Image, o: number): number => (u8(m, o) << 8) | u8(m, o + 1);
const u32 = (m: Image, o: number): number => ((u16(m, o) * 65536) + u16(m, o + 2)) >>> 0;

function loadImage(file: Uint8Array): Image | string {
  const be = (o: number): number => (((file[o] << 24) | (file[o + 1] << 16) | (file[o + 2] << 8) | file[o + 3]) >>> 0);
  if (file.length < HUNK_BYTES + 8 || be(0) !== 0x3f3 || be(8) !== 1 || be(24) !== 0x3e9) return 'not a one-hunk executable';
  const size = be(28) * 4;
  if (size < 0x40 || HUNK_BYTES + size + 8 > file.length) return 'the code hunk is outside the file';
  const b = file.subarray(HUNK_BYTES, HUNK_BYTES + size);
  const reloc = new Uint8Array(size);
  let pos = HUNK_BYTES + size;
  if (be(pos) !== 0x3ec) return 'the relocation table is missing';
  pos += 4;
  for (;;) {
    if (pos + 4 > file.length) return 'the relocation table is cut off';
    const count = be(pos);
    pos += 4;
    if (count === 0) break;
    pos += 4;
    for (let i = 0; i < count; i++, pos += 4) {
      const at = be(pos);
      if (pos + 4 > file.length || at > size - 4) return 'a relocation is outside the hunk';
      for (let k = 0; k < 4; k++) reloc[at + k] = 1 + k;
    }
  }
  return { b, reloc };
}

/** A relocated pointer inside the hunk, or -1. */
function pointer(m: Image, at: number): number {
  if (at < 0 || at + 4 > m.b.length || m.reloc[at] !== 1) return -1;
  const target = u32(m, at);
  return target < m.b.length ? target : -1;
}

export interface HowieDaviesStream {
  /** file offset */
  offset: number;
  size: number;
  kind: 'pattern' | 'positionList';
  /** pattern number (-1 for the default stream), or the voice for a position list */
  id: number;
}

export interface HowieDaviesGrid {
  driver: string;
  patterns: Pattern[];
  songPositions: number[];
  rows: number;
  /** replayer ticks per grid row */
  ticksPerRow: number;
  streams: HowieDaviesStream[];
  blockRows: TrackerCell[][];
  /** streamAtStart[pattern][channel] = the pattern stream playing in the pattern's first row, -1 for none */
  streamAtStart: number[][];
  notesPerVoice: number[];
  /** sources[voice][row over the whole grid], null where no note starts (phase B: where an edit is written) */
  sources: Array<Array<HowieDaviesRowSource | null>>;
  /** effectSources[voice][row]: the byte behind each effect-column command of the row, in effect slot order (phase B) */
  effectSources: Array<Array<StreamEffectSource[]>>;
  /** The tracker note a pattern note byte (a period table index) plays, or 0 when the index is outside the table. */
  noteForByte: (byte: number) => number;
}

/** Where a note's bytes live in the file. */
export interface HowieDaviesRowSource {
  /** file offset of the note byte (its rest byte follows) */
  noteAt: number;
  /** file offset of the operand byte of the Instrument command that chose the instrument, -1 when it is the voice's start state */
  instrumentAt: number;
}

interface VoiceState {
  listStart: number; listPos: number; patternStart: number; patternPos: number; repeatsLeft: number;
  rest: number; instrument: number; instrumentAt: number; stream: number; on: boolean;
  /** Speed / Maximum Volume commands read since the last note: they show on the next note's row. */
  pending: Array<[number, number, number]>;
}

interface Event { tick: number; note: number; instrument: number; stream: number; noteAt: number; instrumentAt: number; fx: Array<[number, number, number]> }

export function buildHowieDaviesGrid(file: Uint8Array): HowieDaviesGrid | string {
  const m = loadImage(file);
  if (typeof m === 'string') return m;
  if (u32(m, 0) !== 0x70ff4e75 || String.fromCharCode(...Array.from(m.b.subarray(4, 12))) !== 'H.DAVIES') return 'the H.DAVIES mark is missing';
  const play = pointer(m, 0x0c);
  const dmaOn = pointer(m, 0x10);
  const init = pointer(m, 0x14);
  const sampleTable = pointer(m, 0x18);
  const subsongTable = pointer(m, 0x3c);
  if (play < 0 || dmaOn < 0 || init < 0 || sampleTable < 0 || subsongTable < 0) return 'a header pointer is not relocated';
  const driverIndex = DRIVERS.findIndex((d) => play === init + d.play && dmaOn === init + d.dmaOn && sampleTable === init + d.sampleTable);
  if (driverIndex < 0) return 'the replayer build is not one of the three known builds';
  const driver = DRIVERS[driverIndex];
  if (pointer(m, init + driver.subsongTableOperand) !== subsongTable) return 'the init routine does not load the header subsong table';
  const patternTable = pointer(m, init + driver.patternTableOperand);
  const defaultStream = pointer(m, init + driver.defaultStreamOperand);
  if (patternTable < 0 || defaultStream < 0) return 'the pattern table or the default stream is not relocated';

  const handlerOf = (table: number, command: number): Handler | null => {
    const target = pointer(m, init + table + (255 - command) * 4);
    if (target < init) return null;
    const hit = driver.handlers.find(([address]) => init + address === target);
    return hit ? hit[1] : null;
  };

  // streams: executed byte regions keyed by start offset (image), grown as the simulation reads them
  const regions = new Map<number, { end: number; kind: 'pattern' | 'positionList'; id: number }>();
  const touch = (start: number, end: number, kind: 'pattern' | 'positionList', id: number): void => {
    const r = regions.get(start);
    if (r) r.end = Math.max(r.end, end);
    else regions.set(start, { end, kind, id });
  };

  const voices: VoiceState[] = [];
  for (let v = 0; v < VOICES; v++) {
    const listStart = pointer(m, subsongTable + v * 4);
    if (listStart < 0) return 'a position list pointer is not relocated';
    voices.push({ listStart, listPos: listStart, patternStart: defaultStream, patternPos: defaultStream, repeatsLeft: 0, rest: 0, instrument: -1, instrumentAt: -1, stream: -1, on: true, pending: [] });
  }
  const flags = [true, true, true, true];
  let speed = DEFAULT_SPEED;
  let reason: string | null = null;
  const events: Event[][] = Array.from({ length: VOICES }, () => []);
  const periodAt = init + driver.periodTable;

  const clearFlag = (v: number): void => { flags[v] = false; };

  // One voice step (sequencer_voice): returns after a note or a command that ends the step.
  const step = (v: number, tick: number): void => {
    const s = voices[v];
    s.rest = ((s.rest - 1) << 24) >> 24;
    if (s.rest >= 0) return;
    type Flow = 'pattern' | 'list' | 'return';
    let flow: Flow = 'pattern';
    const run = (handler: Handler, cursor: number, kind: 'pattern' | 'positionList', regionStart: number, regionId: number): Flow => {
      const operand = (): number => { const b = u8(m, cursor); cursor++; return b; };
      let result: Flow;
      switch (handler) {
        case 'repeat':
          s.repeatsLeft--;
          if (s.repeatsLeft >= 0) { s.patternPos = s.patternStart; result = 'pattern'; } else result = 'list';
          break;
        case 'instrument': s.instrumentAt = cursor + HUNK_BYTES; s.instrument = operand(); s.patternPos = cursor; result = 'pattern'; break;
        case 'speed': { const at = cursor + HUNK_BYTES; speed = operand(); s.pending.push([HD_FX.speed, speed, at]); s.patternPos = cursor; result = 'pattern'; break; }
        case 'delay': s.rest = (operand() << 24) >> 24; s.patternPos = cursor; result = 'return'; break;
        case 'maxVolume': { const at = cursor + HUNK_BYTES; s.pending.push([HD_FX.maxVolume, operand(), at]); s.patternPos = cursor; result = 'pattern'; break; }
        case 'listRestart': s.listPos = s.listStart; clearFlag(v); result = 'list'; break;
        case 'listRestartOff': s.listPos = s.listStart; clearFlag(v); s.on = false; result = 'list'; break;
        case 'listLoopBack': {
          clearFlag(v);
          const at = cursor;
          const back = operand();
          const distance = back + driver.listLoopExtra;
          if (distance > at) { reason ??= 'a list loop-back goes before the module'; result = 'return'; break; }
          s.listPos = at - distance;
          result = 'list';
          break;
        }
        default: result = 'return';
      }
      touch(regionStart, cursor, kind, regionId);
      return result;
    };
    for (let guard = 0; guard < STEP_GUARD && !reason; guard++) {
      if (flow === 'return' || !s.on && flow === 'list') return;
      if (flow === 'list') {
        let cursor = s.listPos;
        const entry = u8(m, cursor++);
        if (entry < COMMAND_BASE) {
          const pattern = pointer(m, patternTable + entry * 4);
          if (pattern < 0) { reason = 'a position list names a pattern that is not in the table'; return; }
          s.patternStart = pattern;
          s.patternPos = pattern;
          s.repeatsLeft = u8(m, cursor++);
          s.listPos = cursor;
          s.stream = pattern;
          touch(s.listStart, cursor, 'positionList', v);
          touch(pattern, pattern, 'pattern', entry);
          flow = 'pattern';
        } else {
          const handler = handlerOf(driver.listCommandTable, entry);
          if (!handler) { reason = `an unknown position list command 0x${entry.toString(16)}`; return; }
          flow = run(handler, cursor, 'positionList', s.listStart, v);
        }
        continue;
      }
      let cursor = s.patternPos;
      const value = u8(m, cursor++);
      const regionStart = s.patternStart === defaultStream && s.stream < 0 ? defaultStream : s.patternStart;
      const regionId = regionStart === defaultStream ? -1 : 0;
      if (value < COMMAND_BASE) {
        if (value >= PERIOD_COUNT) { reason = 'a note is outside the period table'; return; }
        const noteAt = cursor - 1 + HUNK_BYTES;
        const rest = u8(m, cursor++);
        s.rest = (rest << 24) >> 24;
        s.patternPos = cursor;
        touch(regionStart, cursor, 'pattern', regionId);
        events[v].push({ tick, note: periodToNote(u16(m, periodAt + 2 * value)), instrument: s.instrument, stream: s.stream, noteAt, instrumentAt: s.instrumentAt, fx: s.pending });
        s.pending = [];
        return;
      }
      const handler = handlerOf(driver.commandTable, value);
      if (!handler) { reason = `an unknown pattern command 0x${value.toString(16)}`; return; }
      flow = run(handler, cursor, 'pattern', regionStart, regionId);
    }
    reason ??= 'a voice step does not end';
  };

  let songEnd = -1;
  let tick = 0;
  let speedTicks = DEFAULT_SPEED;
  while (tick < MAX_TICKS && !reason) {
    let ticks = speedTicks + 1;
    if (ticks >= speed) {
      for (let v = 0; v < VOICES; v++) {
        if (voices[v].on) step(v, tick);
        if (flags.every((f) => !f) && songEnd < 0) { songEnd = tick; break; }
      }
      ticks = 0;
    }
    if (songEnd >= 0 || reason) break;
    speedTicks = ticks;
    tick++;
  }
  if (reason) return reason;
  if (songEnd <= 0) return 'the voices never all restart their position lists within the tick limit';

  const kept = events.map((list) => list.filter((e) => e.tick < songEnd));
  let rowTicks = songEnd;
  for (const list of kept) for (const e of list) rowTicks = gcd(rowTicks, e.tick === 0 ? songEnd : e.tick);
  const rows = Math.ceil(songEnd / rowTicks);
  const patternCount = Math.ceil(rows / ROWS_PER_PATTERN);

  const starts = [...regions.keys()].sort((a, b) => a - b);
  const streams: HowieDaviesStream[] = [];
  const streamIndexOfStart = new Map<number, number>();
  for (const start of starts) {
    const r = regions.get(start) as { end: number; kind: 'pattern' | 'positionList'; id: number };
    if (r.end <= start) continue;
    streamIndexOfStart.set(start, streams.length);
    streams.push({ offset: start + HUNK_BYTES, size: r.end - start, kind: r.kind, id: r.id });
  }
  const blockRows = streams.map((s) => {
    const out: TrackerCell[] = [];
    for (let o = s.offset; o < s.offset + s.size; o++) out.push({ ...emptyCell(), cutoff: 2, period: file[o] ?? 0 });
    return out;
  });

  const notesPerVoice = new Array<number>(VOICES).fill(0);
  const columns: TrackerCell[][] = Array.from({ length: VOICES }, () => Array.from({ length: patternCount * ROWS_PER_PATTERN }, emptyCell));
  const effectSources: StreamEffectSource[][][] = Array.from({ length: VOICES }, () => Array.from({ length: patternCount * ROWS_PER_PATTERN }, () => []));
  const sources: Array<Array<HowieDaviesRowSource | null>> = Array.from({ length: VOICES }, () => new Array<HowieDaviesRowSource | null>(patternCount * ROWS_PER_PATTERN).fill(null));
  const firstStream: number[][] = Array.from({ length: patternCount }, () => new Array<number>(VOICES).fill(-1));
  for (let v = 0; v < VOICES; v++) {
    for (const e of kept[v]) {
      const row = e.tick / rowTicks;
      const cell = columns[v][row];
      cell.note = e.note;
      cell.instrument = e.instrument + 1;
      for (const [typ, val, at] of e.fx) if (addCellEffect(cell, typ, val)) effectSources[v][row].push({ typ, at });
      notesPerVoice[v]++;
      sources[v][row] = { noteAt: e.noteAt, instrumentAt: e.instrumentAt };
      if (row % ROWS_PER_PATTERN === 0) firstStream[Math.floor(row / ROWS_PER_PATTERN)][v] = streamIndexOfStart.get(e.stream) ?? -1;
    }
  }
  const patterns: Pattern[] = Array.from({ length: patternCount }, (_, p) => {
    const length = Math.min(ROWS_PER_PATTERN, rows - p * ROWS_PER_PATTERN);
    const channels: ChannelData[] = columns.map((col, ch) => ({
      id: `channel-${ch}`, name: `Channel ${ch + 1}`, muted: false, solo: false, collapsed: false,
      volume: 100, pan: ch === 0 || ch === 3 ? -50 : 50, instrumentId: null, color: null,
      rows: col.slice(p * ROWS_PER_PATTERN, p * ROWS_PER_PATTERN + length),
      ...effectColumnsMeta(col.slice(p * ROWS_PER_PATTERN, p * ROWS_PER_PATTERN + length)),
    }));
    return { id: `pattern-${p}`, name: `Pattern ${p}`, length, channels };
  });
  return {
    driver: ['Blazing Thunder', 'Future Bike Simulator', "Yogi's Great Escape"][driverIndex], patterns,
    songPositions: patterns.map((_, i) => i), rows, ticksPerRow: rowTicks, streams, blockRows, streamAtStart: firstStream, notesPerVoice, sources, effectSources,
    noteForByte: (byte) => (byte >= 0 && byte < PERIOD_COUNT ? periodToNote(u16(m, periodAt + 2 * byte)) : 0),
  };
}
