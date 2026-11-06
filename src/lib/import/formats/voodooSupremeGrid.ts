/**
 * Voodoo Supreme Synthesizer (.vss) - the time-aligned, read-only grid (phase A).
 *
 * Decoder truth: third-party nuade replayer voodoo.c (vs_check_module, load_all_offsets, load_single_track, the
 * parse_track_data / process_voice tick loop) and the NostalgicPlayer "Voodoo Supreme Synthesizer.txt" description.
 *
 * File: a footer 'VSS0' mark in the last 64 bytes (count of subsongs, then one offset per subsong relative to the mark).
 * A subsong is a table of big-endian signed 32-bit offsets (relative to the subsong start) that runs up to the lowest
 * non-negative offset it names; the first four entries are the four voices' track streams, every other entry is a track,
 * envelope, period table, waveform table or sample, addressed by index. A track byte below 0x80 is a note followed by its
 * wait in ticks; from 0x80 it is a command (gosub, return, start loop, loop, set sample, envelope, period table, waveform,
 * portamento, transpose, goto, reset flags, waveform mask) or 0xFF note cut (followed by a wait).
 *
 * Time: every voice owns a tick counter that starts at 1 and is decremented once per replayer tick (50 Hz); at 0 the voice
 * reads commands until a note, portamento or note cut loads the next wait (a wait of 0 is 256 ticks). Commands that only
 * change state cost no time. The grid runs to the first tick at which every voice has executed a goto (or ended); a voice
 * that wrapped earlier keeps looping until then. One grid row is the greatest common divisor of all note ticks.
 *
 * Pitch: see voodooNoteForIndex (periodToNote of the period the replayer writes to Paula; measured against UADE's AUDxPER log). Not shown in phase A: portamento slides (the start note is shown), period table octave commands,
 * envelopes, waveform tables, subsongs after the first. Note write-back is phase B.
 */
import { periodToGridNote } from '@/lib/amiga/periodNotes';
import { makeRowClock, mainStepFromOnsets, makeOnsetPlacer, setNoteColumn } from './stepRowClock';
import { BD_FX } from './benDaglishEffectGlyphs';
import type { Pattern, TrackerCell, ChannelData } from '@/types';

const VOICES = 4;
const ROWS_PER_PATTERN = 64;
const MAX_TICKS = 400000;
const COMMAND_GUARD = 65536;
const NOTE_OFF = 97;

/** The replayer's period table (voodoo.c vs_periods[99]): 12 entries per octave, the last three are zero (silent). */
export const VOODOO_PERIODS: readonly number[] = [
  32256, 30464, 28672, 27136, 25600, 24192, 22784, 21504, 20352, 19200, 18048, 17689, 16128, 15232, 14336, 13568,
  12800, 12096, 11392, 10752, 10176, 9600, 9024, 8512, 8064, 7616, 7168, 6784, 6400, 6048, 5696, 5376,
  5088, 4800, 4512, 4256, 4032, 3808, 3584, 3392, 3200, 3024, 2848, 2688, 2544, 2400, 2256, 2128,
  2016, 1904, 1792, 1696, 1600, 1512, 1424, 1344, 1272, 1200, 1128, 1064, 1008, 952, 896, 848,
  800, 756, 712, 672, 636, 600, 564, 532, 504, 476, 448, 424, 400, 378, 356, 336,
  318, 300, 282, 266, 252, 238, 224, 212, 200, 189, 178, 168, 159, 150, 141, 133, 0, 0, 0,
];

const emptyCell = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

/**
 * The grid note of a table index (note byte + transpose, clamped like period_index): periodToNote of the table period,
 * which is the value the replayer writes to AUDxPER for a note-on (measured: voo8 voice 0 first note writes 224 = note 36).
 * 0 for the silent zero entries. Periods above 1712 show as the octave below C-0 (periodToGridNote).
 */
export function voodooNoteForIndex(index: number): number {
  const period = VOODOO_PERIODS[Math.max(0, Math.min(98, index))];
  return period > 0 ? periodToGridNote(period) : 0;
}

export interface VoodooGrid {
  patterns: Pattern[];
  songPositions: number[];
  rows: number;
  /** replayer ticks per grid row */
  ticksPerRow: number;
  notesPerVoice: number[];
  /** number of distinct (sample, waveform table) sounds the grid refers to */
  instrumentCount: number;
}

interface Event { tick: number; note: number; instrument: number }

export function buildVoodooGrid(file: Uint8Array): VoodooGrid | string {
  const size = file.length;
  if (size < 64) return 'the file is shorter than the footer';
  const i32 = (at: number): number => ((file[at] << 24) | (file[at + 1] << 16) | (file[at + 2] << 8) | file[at + 3]) | 0;
  let footer = -1;
  for (let at = (size - 64 + 1) & ~1; at + 8 <= size; at += 2) {
    if (file[at] === 0x56 && file[at + 1] === 0x53 && file[at + 2] === 0x53 && file[at + 3] === 0x30) { footer = at; break; }
  }
  if (footer < 0) return 'the VSS0 footer mark is missing';
  const subsongs = i32(footer + 4);
  if (subsongs < 1 || subsongs >= 0x100 || footer + 8 + subsongs * 4 > size) return 'the subsong count is not valid';
  const songAt = footer + i32(footer + 8);
  if (songAt < 0 || songAt + 16 > size) return 'the first subsong offset is outside the file';

  // Offset table: runs up to the lowest non-negative offset it names (load_all_offsets).
  const offsets: number[] = [];
  let minOffset = footer;
  for (let at = songAt; at + 4 <= size; at += 4) {
    const rel = i32(at);
    if (rel >= 0 && songAt + rel < minOffset) minOffset = songAt + rel;
    offsets.push(songAt + rel);
    if (at + 4 === minOffset) break;
  }
  if (offsets.length < 4) return 'the offset table has fewer than four entries';

  interface Voice {
    track: number; pos: number; counter: number; transpose: number; stack: number[];
    sample1: number; waveTable: number; on: boolean; wrapped: boolean;
  }
  const instrumentIds = new Map<string, number>();
  const voices: Voice[] = [];
  for (let v = 0; v < VOICES; v++) {
    voices.push({ track: v, pos: offsets[v], counter: 1, transpose: 0, stack: [], sample1: -1, waveTable: -1, on: true, wrapped: false });
  }
  const events: Event[][] = Array.from({ length: VOICES }, () => []);
  let reason: string | null = null;

  const instrumentOf = (v: Voice): number => {
    if (v.sample1 < 0 && v.waveTable < 0) return 0;
    const key = `${v.sample1}:${v.waveTable}`;
    let id = instrumentIds.get(key);
    if (id === undefined) { id = instrumentIds.size + 1; instrumentIds.set(key, id); }
    return id;
  };

  const parse = (index: number, tick: number): void => {
    const v = voices[index];
    const byte = (): number => (v.pos < size ? file[v.pos++] : (reason ??= 'a track runs past the end of the file', 0));
    // Track start by index: the goto target is only honoured inside the running track (load_single_track).
    let trackStart = offsets[v.track] ?? -1;
    const retire = (): void => { v.on = false; v.wrapped = true; };
    for (let guard = 0; guard < COMMAND_GUARD && !reason; guard++) {
      if (v.pos < 0 || v.pos >= size) { retire(); return; }
      const cmd = byte();
      if (cmd < 0x80) {
        const note = voodooNoteForIndex(cmd + v.transpose);
        events[index].push({ tick, note, instrument: instrumentOf(v) });
        v.counter = byte();
        return;
      }
      switch (cmd) {
        case 0xff: events[index].push({ tick, note: NOTE_OFF, instrument: 0 }); v.counter = byte(); return;
        case 0x81: { // gosub
          const arg = byte();
          if (arg >= offsets.length) { reason = 'a gosub names a track outside the offset table'; return; }
          v.stack.push(v.pos, v.track);
          v.track = arg; v.pos = offsets[arg]; trackStart = offsets[arg];
          break;
        }
        case 0x82: { // return
          if (v.stack.length < 2) { retire(); return; }
          v.track = v.stack.pop() as number; v.pos = v.stack.pop() as number; trackStart = offsets[v.track] ?? -1;
          break;
        }
        case 0x83: { const count = byte(); byte(); v.stack.push(v.pos, count); break; }
        case 0x84: {
          if (v.stack.length < 2) { reason = 'a loop end has no loop start'; return; }
          const count = ((v.stack.pop() as number) - 1) & 0xff;
          const at = v.stack.pop() as number;
          if (count !== 0) { v.stack.push(at, count); v.pos = at; }
          break;
        }
        case 0x85: v.sample1 = byte(); byte(); break;
        case 0x86: case 0x87: case 0x8c: case 0x8d: byte(); break;
        case 0x88: v.waveTable = byte(); byte(); break;
        case 0x89: { // portamento: start note sounds, stop note and the slide ticks follow; the third byte is the wait
          const start = byte();
          byte();
          events[index].push({ tick, note: voodooNoteForIndex(start + v.transpose), instrument: instrumentOf(v) });
          v.counter = byte();
          return;
        }
        case 0x8a: v.transpose = (byte() << 24) >> 24; break;
        case 0x8b: { // goto: back into the running track, else to its start
          const arg = byte();
          const target = arg < offsets.length ? offsets[arg] : trackStart;
          v.pos = target >= trackStart && target < v.pos ? target : trackStart;
          v.wrapped = true;
          break;
        }
        default: reason = `an unknown track command 0x${cmd.toString(16)}`; return;
      }
    }
    reason ??= 'a voice never reaches a note';
  };

  let songEnd = -1;
  for (let tick = 0; tick < MAX_TICKS && !reason && songEnd < 0; tick++) {
    for (let v = 0; v < VOICES; v++) {
      const voice = voices[v];
      if (!voice.on) continue;
      voice.counter = (voice.counter - 1) & 0xff;
      if (voice.counter === 0) parse(v, tick);
    }
    if (voices.every((x) => x.wrapped)) songEnd = tick + 1;
  }
  if (reason) return reason;
  if (songEnd <= 0) return 'the voices never all loop within the tick limit';

  const kept = events.map((list) => list.filter((e) => e.tick < songEnd));
  // one row is one step of the shared clock: the main step of the voices' onsets (a note off the step sits on its row with a row offset)
  const rowTicks = mainStepFromOnsets(kept.map((list) => list.map((e) => e.tick)));
  const clock = makeRowClock([{ tick: 0, speed: rowTicks }]);
  const rows = Math.max(1, clock.rowsForTicks(songEnd));
  const patternCount = Math.ceil(rows / ROWS_PER_PATTERN);
  const notesPerVoice = new Array<number>(VOICES).fill(0);
  const columns: TrackerCell[][] = Array.from({ length: VOICES }, () => Array.from({ length: patternCount * ROWS_PER_PATTERN }, emptyCell));
  const place = makeOnsetPlacer(clock);
  for (let v = 0; v < VOICES; v++) {
    for (const e of kept[v]) {
      const pl = place(v, e.tick);
      const cell = columns[v][pl.row];
      if (pl.col === 0) {
        cell.note = e.note;
        cell.instrument = e.instrument;
        if (pl.offset > 0) { cell.effTyp = BD_FX.rowOffset; cell.eff = pl.offset; }
      } else {
        setNoteColumn(cell, pl.col, e.note, e.instrument, pl.offset);
      }
      if (e.note !== NOTE_OFF) notesPerVoice[v]++;
    }
  }
  const noteCols = Array.from({ length: VOICES }, (_, v) => place.columnsOf(v));
  const patterns: Pattern[] = Array.from({ length: patternCount }, (_, p) => {
    const length = Math.min(ROWS_PER_PATTERN, rows - p * ROWS_PER_PATTERN);
    const channels: ChannelData[] = columns.map((col, ch) => ({
      id: `channel-${ch}`, name: `Channel ${ch + 1}`, muted: false, solo: false, collapsed: false,
      volume: 100, pan: ch === 0 || ch === 3 ? -50 : 50, instrumentId: null, color: null,
      rows: col.slice(p * ROWS_PER_PATTERN, p * ROWS_PER_PATTERN + length),
      channelMeta: { importedFromMOD: false, effectCols: 2, noteCols: noteCols[ch], noteColDelay: true },
    }));
    return { id: `pattern-${p}`, name: `Pattern ${p}`, length, channels };
  });
  return { patterns, songPositions: patterns.map((_, i) => i), rows, ticksPerRow: rowTicks, notesPerVoice, instrumentCount: instrumentIds.size };
}
