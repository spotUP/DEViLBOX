/**
 * paulShieldsGrid.ts - the Paul Shields tracker grid, read from the module's own order lists and pattern streams.
 *
 * Byte layout (third-party/nuade/players/paulshields/ps_module.c k_layouts, ps_voice.c, ps_sequencer.c, ps_old.c):
 *   Short ('new'):      10-byte sample records from file offset 0 (tune at +8); table words at 0xA0 (pitch envelopes,
 *                       volume envelopes); voice pairs at 0xA4.
 *   Long ('old'):       32-byte sample records from offset 0 (tune at +0x1E); table words at 0x200; voice pairs at 0x204.
 *   Old ('veryold'):    32-byte sample records (tune at +0x1E); one table word at 0x200 (instrument table, int16);
 *                       voice pairs at 0x202.
 *   A voice pair is (start volume u16, order list u16); file pair i drives Paula channel 3 - i.
 * Order list (ps_voice.c read_order_list): a word below 0xFFE8 is a pattern offset (bit 15 set: a u16 repeat count
 * follows); 0xFFE8 + 4 * i are codes. Short/Long codes: VolumeSlide (4 arg bytes), PitchOffset (2), Loop, Stop,
 * AllVolumeSlide (4), PitchTune (2). Old codes: Stop, Loop, VolumeSlide (4), AllVolumeSlide (4), PitchOffset (2), PitchTune (2).
 * Short/Long pattern bytes (ps_sequencer.c): 0x00 Note (note, duration), 0x04 Sample (1), 0x08 VolumeOverride (1),
 *   0x0C/0x3C NextPattern, 0x10 Rest (duration), 0x14/0x18/0x1C envelopes (1), 0x20 Slide (start, target, duration),
 *   0x2C RestartOrderList, 0x30 Stop; any other byte stops the voice.
 * Old pattern bytes (ps_old.c): below 0x80 a note (duration follows), 0x80 Rest (duration), 0x84 Slide (start, target,
 *   duration), 0x88/0xB0/0xB4 level (1), 0x8C Instrument (1: byte offset into the instrument table), 0x90 NextPattern,
 *   0x94/0x98/0x9C/0xA4 no arguments; any other byte stops the voice.
 * Duration (psh_read_duration): one byte; 0 means a big-endian u16 follows.
 * Timing: every 50 Hz tick the duration counts down; at 0 the voice reads bytes until a note, rest or slide. The voice
 * starts with duration 1 on a NextPattern byte, so tick 0 reads the first order list entry. One grid row = one tick.
 * Pitch (psh_note_period): units = note * 8 + pitch tune + sample tune; 96 units per octave; byte 60 with no tune is
 * period 27364 >> 5 = 855 (ProTracker C-1 = 856 = DEViLBOX note 13), byte 72 is 428 (note 25, C-2). So the grid note
 * is round(units / 8) - 47. The order list's PitchOffset adds to the period (a detune) and is not shown.
 *
 * Layers (docs/FORMAT_COMMAND_STREAM_GRID.md): `blockRows` carry every pattern stream a voice reaches byte-exact, one
 * carrier cell per byte (cutoff = 1, period = byte). The display grid is one row per tick. A stored note byte is played
 * from every repeat and order list entry that reaches it, so `placements` lists each of them with the tune in force.
 */
import type { Pattern, TrackerCell } from '@/types';
import { cellFieldsEqual } from '@/engine/uade/UADEPatternEncoder';

export const PAUL_SHIELDS_ROWS_PER_PATTERN = 64;
// A runaway guard only (about 2 hours at 50 Hz).
const MAX_TICKS = 360000;
const COMMAND_LIMIT = 4096;
const ORDER_CODE_MIN = 0xffe8;
const SAMPLE_COUNT = 16;
const WAVE_COUNT = 7;
const SAMPLE_ENTRY_SIZE = 16;
const MIN_FILE_SIZE = 530;
/** Grid note = round(note units / 8) - GRID_NOTE_BIAS (byte 60 = C-1 = note 13). */
const GRID_NOTE_BIAS = 47;

export type PaulShieldsVariant = 'new' | 'old' | 'veryold';

type OrderAction = 'volumeSlide' | 'pitchOffset' | 'loop' | 'stop' | 'allVolumeSlide' | 'pitchTune';

interface Layout {
  recordSize: number;
  tuneAt: number;
  tablesOffset: number;
  voicesOffset: number;
  actions: OrderAction[];
}

const NEW_ACTIONS: OrderAction[] = ['volumeSlide', 'pitchOffset', 'loop', 'stop', 'allVolumeSlide', 'pitchTune'];
const LAYOUTS: Record<PaulShieldsVariant, Layout> = {
  new: { recordSize: 10, tuneAt: 8, tablesOffset: 0xa0, voicesOffset: 0xa4, actions: NEW_ACTIONS },
  old: { recordSize: 32, tuneAt: 0x1e, tablesOffset: 0x200, voicesOffset: 0x204, actions: NEW_ACTIONS },
  veryold: { recordSize: 32, tuneAt: 0x1e, tablesOffset: 0x200, voicesOffset: 0x202, actions: ['stop', 'loop', 'volumeSlide', 'allVolumeSlide', 'pitchOffset', 'pitchTune'] },
};

const u16 = (b: Uint8Array, o: number): number => (o >= 0 && o + 1 < b.length ? (b[o] << 8) | b[o + 1] : 0);
const u32 = (b: Uint8Array, o: number): number => ((u16(b, o) << 16) | u16(b, o + 2)) >>> 0;
const s16 = (v: number): number => (v << 16) >> 16;

/** The eagleplayer's Check2: which of the three module layouts the file has, or null. */
export function detectPaulShieldsVariant(buf: Uint8Array): PaulShieldsVariant | null {
  if (buf.length < MIN_FILE_SIZE) return null;
  if (u32(buf, 0) !== 0 || u32(buf, 4) !== 0 || u16(buf, 8) !== 0) return null;
  const sameWords = (o: number): boolean => u16(buf, o) === u16(buf, o + 4) && u16(buf, o) === u16(buf, o + 8) && u16(buf, o) === u16(buf, o + 12);
  const goodPtr = (p: number): boolean => p !== 0 && (p & 0x8000) === 0 && (p & 1) === 0;
  if (sameWords(164)) {
    const p = u16(buf, 160);
    if (goodPtr(p) && u32(buf, p) === 0x00b400b6) return 'new';
  }
  if (sameWords(516)) {
    const p = u16(buf, 512);
    if (goodPtr(p) && u32(buf, p) === 0x02140216) return 'old';
  }
  if (sameWords(514)) {
    const p = u16(buf, 516);
    if (goodPtr(p)) {
      const before = u16(buf, p - 2);
      if (before === 0xffec || before === 0xffe8) return 'veryold';
    }
  }
  return null;
}

/** One past the last byte of a pattern stream: the scan follows the pattern grammar to its first ending command. */
export function paulShieldsPatternEnd(buf: Uint8Array, variant: PaulShieldsVariant, start: number): number {
  let pos = start;
  const duration = (): void => { pos += buf[pos] === 0 ? 3 : 1; };
  for (let guard = 0; guard < COMMAND_LIMIT * 4 && pos < buf.length; guard++) {
    const op = buf[pos++];
    if (variant === 'veryold') {
      if (op < 0x80) { duration(); continue; }
      if (op === 0x80) { duration(); continue; }
      if (op === 0x84) { pos += 2; duration(); continue; }
      if (op === 0x88 || op === 0xb0 || op === 0xb4 || op === 0x8c) { pos++; continue; }
      if (op === 0x94 || op === 0x98 || op === 0x9c || op === 0xa4) continue;
      break; // 0x90 NextPattern or a stopping byte
    }
    if (op === 0x00) { pos++; duration(); continue; }
    if (op === 0x10) { duration(); continue; }
    if (op === 0x20) { pos += 2; duration(); continue; }
    if (op === 0x04 || op === 0x08 || op === 0x14 || op === 0x18 || op === 0x1c) { pos++; continue; }
    break; // NextPattern, RestartOrderList, Stop or a stopping byte
  }
  return Math.min(pos, buf.length);
}

export function encodePaulShieldsStream(rows: TrackerCell[]): Uint8Array {
  return Uint8Array.from(rows, c => (c.period ?? 0) & 0xff);
}

export interface PaulShieldsPlacement {
  voice: number; tick: number;
  /** File offset of the stored note byte (a Note's note, or a Slide's start note). */
  offset: number;
  note: number;
  /** Grid note minus the stored byte, for the tunes in force. */
  delta: number;
  instrument: number;
}

export interface PaulShieldsGrid {
  variant: PaulShieldsVariant;
  patterns: Pattern[];
  voices: number;
  filePatternAddrs: number[];
  filePatternSizes: number[];
  trackMap: number[][];
  blockRows: TrackerCell[][];
  placements: PaulShieldsPlacement[];
  ticks: number;
}

const emptyCell = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

interface VoiceWalk {
  orderRestart: number; orderNext: number; pattern: number; stream: number; repeats: number;
  pitchTune: number; sampleTune: number; instrument: number; active: boolean; tick: number;
  /** The order list came to its Loop (or the voice stopped): the end of the first pass. */
  ended: boolean;
}

/** Build the grid of a Paul Shields module; null when it is not one. */
export function buildPaulShieldsGrid(buf: Uint8Array, sourceFile: string): PaulShieldsGrid | null {
  const variant = detectPaulShieldsVariant(buf);
  if (!variant) return null;
  const L = LAYOUTS[variant];
  const instrumentTable = variant === 'veryold' ? s16(u16(buf, L.tablesOffset)) : 0;
  const sampleTune = (n: number): number => (n < SAMPLE_COUNT ? s16(u16(buf, n * L.recordSize + L.tuneAt)) : 0);

  const blockIndex = new Map<number, number>();
  const blockRows: TrackerCell[][] = [];
  const addrs: number[] = [];
  const sizes: number[] = [];
  const blockOf = (start: number): number => {
    let b = blockIndex.get(start);
    if (b === undefined) {
      b = blockRows.length;
      blockIndex.set(start, b);
      const end = paulShieldsPatternEnd(buf, variant, start);
      blockRows.push(Array.from(buf.subarray(start, end), byte => ({ ...emptyCell(), cutoff: 1, period: byte })));
      addrs.push(start);
      sizes.push(end - start);
    }
    return b;
  };

  const readOrderList = (w: VoiceWalk): boolean => {
    for (let guard = 0; guard < COMMAND_LIMIT; guard++) {
      const word = u16(buf, w.orderNext);
      w.orderNext += 2;
      if (word < ORDER_CODE_MIN) {
        w.repeats = 1;
        if (word & 0x8000) { w.repeats = u16(buf, w.orderNext); w.orderNext += 2; }
        w.pattern = word & 0x7fff;
        w.stream = w.pattern;
        blockOf(w.pattern);
        return true;
      }
      const index = (word - ORDER_CODE_MIN) >> 2;
      if ((word & 3) !== 0 || index >= L.actions.length) break;
      switch (L.actions[index]) {
        case 'volumeSlide': case 'allVolumeSlide': w.orderNext += 4; break;
        case 'pitchOffset': w.orderNext += 2; break;
        case 'pitchTune': w.pitchTune = s16(u16(buf, w.orderNext)); w.orderNext += 2; break;
        case 'loop': w.orderNext = w.orderRestart; w.ended = true; break;
        case 'stop': w.active = false; w.ended = true; return false;
      }
    }
    w.active = false; w.ended = true;
    return false;
  };
  const nextPattern = (w: VoiceWalk): boolean => {
    w.repeats = (w.repeats - 1) & 0xffff;
    if (w.repeats !== 0) { w.stream = w.pattern; return true; }
    return readOrderList(w);
  };
  const readDuration = (w: VoiceWalk): number => {
    const b = buf[w.stream++] ?? 0;
    if (b !== 0) return b;
    const d = u16(buf, w.stream);
    w.stream += 2;
    return d === 0 ? 0x10000 : d; // the u16 counter wraps: 0 runs 65536 ticks
  };

  const placements: PaulShieldsPlacement[] = [];
  const timelines: TrackerCell[][] = [[], [], [], []];
  const place = (voice: number, w: VoiceWalk, offset: number): void => {
    const n = buf[offset];
    const note = Math.round((n * 8 + w.pitchTune + w.sampleTune) / 8) - GRID_NOTE_BIAS;
    if (note < 1 || note > 96) return;
    timelines[voice][w.tick] = { ...emptyCell(), note, instrument: w.instrument };
    placements.push({ voice, tick: w.tick, offset, note, delta: note - n, instrument: w.instrument });
  };

  /** Read the bytes of one step (until a note, rest or slide); returns its duration, or 0 when the voice stopped. */
  const step = (voice: number, w: VoiceWalk): number => {
    for (let guard = 0; guard < COMMAND_LIMIT; guard++) {
      const at = w.stream;
      const op = buf[w.stream++] ?? 0xff;
      if (variant === 'veryold') {
        if (op < 0x80) { place(voice, w, at); return readDuration(w); }
        if (op === 0x80) return readDuration(w);
        if (op === 0x84) { place(voice, w, at + 1); w.stream += 2; return readDuration(w); }
        if (op === 0x88 || op === 0xb0 || op === 0xb4) { w.stream++; continue; }
        if (op === 0x8c) {
          const record = instrumentTable + buf[w.stream++];
          const entry = s16(u16(buf, record));
          if (entry < 0 || entry % SAMPLE_ENTRY_SIZE !== 0 || entry / SAMPLE_ENTRY_SIZE >= SAMPLE_COUNT) break;
          w.sampleTune = sampleTune(entry / SAMPLE_ENTRY_SIZE);
          w.instrument = entry / SAMPLE_ENTRY_SIZE + 1;
          continue;
        }
        if (op === 0x90) { if (!nextPattern(w)) return 0; continue; }
        if (op === 0x94 || op === 0x98 || op === 0x9c || op === 0xa4) continue;
        break;
      }
      switch (op) {
        case 0x00: place(voice, w, at + 1); w.stream++; return readDuration(w);
        case 0x04: {
          const n = buf[w.stream++];
          if (n < SAMPLE_COUNT + WAVE_COUNT) { w.sampleTune = sampleTune(n); w.instrument = n + 1; }
          continue;
        }
        case 0x08: case 0x14: case 0x18: case 0x1c: w.stream++; continue;
        case 0x0c: case 0x3c: if (!nextPattern(w)) return 0; continue;
        case 0x10: return readDuration(w);
        case 0x20: place(voice, w, at + 1); w.stream += 2; return readDuration(w);
        case 0x2c: w.orderNext = w.orderRestart; w.ended = true; if (!readOrderList(w)) return 0; continue;
        case 0x30: w.active = false; w.ended = true; return 0;
      }
      break;
    }
    w.active = false; w.ended = true;
    return 0;
  };

  const walks: Array<VoiceWalk | null> = [];
  for (let ch = 0; ch < 4; ch++) {
    const pair = L.voicesOffset + (3 - ch) * 4;
    const raw = u16(buf, pair + 2);
    const order = variant === 'veryold' ? s16(raw) : raw;
    if (order <= 0 || order >= buf.length) { walks.push(null); continue; }
    walks.push({
      orderRestart: order, orderNext: order, pattern: 0, stream: 0, repeats: 1,
      pitchTune: 0, sampleTune: 0, instrument: 0, active: true, tick: 0, ended: false,
    });
  }
  // The first pass of each voice: to its order list's Loop or Stop.
  const runUntil = (voice: number, w: VoiceWalk, limit: number, firstPass: boolean): void => {
    if (w.tick === 0 && !readOrderList(w)) return;
    while (w.active && w.tick < limit && !(firstPass && w.ended)) {
      const d = step(voice, w);
      if (d === 0) break;
      w.tick += d;
    }
  };
  walks.forEach((w, v) => { if (w) runUntil(v, w, MAX_TICKS, true); });
  const ticks = Math.max(1, ...walks.map(w => (w ? Math.min(w.tick, MAX_TICKS) : 0)));
  // Shorter voices keep looping (their state carries on) until the longest pass is full.
  walks.forEach((w, v) => { if (w && w.active) runUntil(v, w, ticks, false); });

  const numPatterns = Math.ceil(ticks / PAUL_SHIELDS_ROWS_PER_PATTERN);
  const R = PAUL_SHIELDS_ROWS_PER_PATTERN;
  const patterns: Pattern[] = Array.from({ length: numPatterns }, (_, p) => ({
    id: `pattern-${p}`, name: `Pattern ${p}`, length: R,
    channels: timelines.map((line, ch) => ({
      id: `channel-${ch}`, name: `Voice ${ch + 1}`, muted: false, solo: false, collapsed: false,
      volume: 100, pan: 0, instrumentId: null, color: null,
      rows: Array.from({ length: R }, (_, r) => ({ ...(line[p * R + r] ?? emptyCell()) })),
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const, sourceFile, importedAt: new Date().toISOString(),
      originalChannelCount: 4, originalPatternCount: blockRows.length, originalInstrumentCount: SAMPLE_COUNT,
    },
  }));
  // Each voice's block at a pattern's first row: the stream a cell there was most likely read from.
  const blockAt: number[][] = [[], [], [], []];
  for (const pl of placements) {
    const block = addrs.findIndex((a, i) => pl.offset >= a && pl.offset < a + sizes[i]);
    const p = Math.floor(pl.tick / R);
    if (blockAt[pl.voice][p] === undefined && block >= 0) blockAt[pl.voice][p] = block;
  }
  const trackMap = patterns.map((_, p) => [0, 1, 2, 3].map(v => blockAt[v][p] ?? -1));
  return { variant, patterns, voices: 4, filePatternAddrs: addrs, filePatternSizes: sizes, trackMap, blockRows, placements, ticks };
}

export interface PaulShieldsEditResult { data: Uint8Array; patched: number; warnings: string[] }

/**
 * Write the grid's note edits into the module. Each changed note cell becomes its stored note byte (grid note minus the
 * tune in force) in place; cells that play the same byte must agree, else the byte is left and a warning returned.
 * Instruments come from Sample/Instrument commands shared by many notes and are not written.
 */
export function applyPaulShieldsGridEdits(source: Uint8Array, edited: Pattern[]): PaulShieldsEditResult {
  const base = buildPaulShieldsGrid(source, '');
  const out = new Uint8Array(source);
  const warnings: string[] = [];
  if (!base) return { data: out, patched: 0, warnings: ['the module is not a Paul Shields module'] };
  const R = PAUL_SHIELDS_ROWS_PER_PATTERN;
  const maxByte = base.variant === 'veryold' ? 0x7f : 0xff;
  const cellAt = (voice: number, tick: number): TrackerCell | undefined => edited[Math.floor(tick / R)]?.channels[voice]?.rows[tick % R];
  const placed = new Set<string>();
  const wanted = new Map<number, Set<number>>();
  for (const pl of base.placements) {
    placed.add(`${pl.voice}:${pl.tick}`);
    const cell = cellAt(pl.voice, pl.tick);
    if (!cell) continue;
    if ((cell.note ?? 0) !== pl.note) {
      const b = (cell.note ?? 0) - pl.delta;
      if ((cell.note ?? 0) > 0 && b >= 0 && b <= maxByte) {
        if (!wanted.has(pl.offset)) wanted.set(pl.offset, new Set());
        wanted.get(pl.offset)!.add(b);
      } else warnings.push(`voice ${pl.voice + 1} tick ${pl.tick}: note ${cell.note} is outside the stored range or removes the note; not written`);
    }
    if ((cell.instrument ?? 0) !== pl.instrument) {
      warnings.push(`voice ${pl.voice + 1} tick ${pl.tick}: the instrument comes from a Sample command shared by other notes; not written`);
    }
  }
  let patched = 0;
  for (const [offset, set] of wanted) {
    if (set.size === 1) { out[offset] = [...set][0]; patched++; }
    else warnings.push(`stream byte ${offset}: cells that play it were edited to different notes; not written`);
  }
  let stray = 0;
  edited.forEach((pat, p) => pat.channels.forEach((chn, v) => chn.rows.forEach((cell, r) => {
    if (placed.has(`${v}:${p * R + r}`)) return;
    if (!cellFieldsEqual(cell, base.patterns[p]?.channels[v]?.rows[r] ?? emptyCell())) stray++;
  })));
  if (stray > 0) warnings.push(`${stray} edited cell(s) are not on a note; not written (the stream would change length)`);
  return { data: out, patched, warnings };
}
