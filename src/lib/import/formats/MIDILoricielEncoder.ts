/**
 * MIDILoricielEncoder.ts - grid edits back into the MIDI file the MIDI
 * Loriciel player plays.
 *
 * The grid (MIDILoricielParser) is the player's schedule: one row per
 * interrupt, one channel per Paula voice. An edit changes the MIDI events
 * behind the edited cell:
 *
 *   note-on cell, new note/instrument  the note-on's key (and its note-off's)
 *                                       becomes the key that plays that
 *                                       sample at that pitch on the channel's
 *                                       program; a sample of another program
 *                                       gets a program change around the note
 *   note-on cell, new volume           the velocity that gives that volume
 *   note-on cell cleared               the note-on and its note-off go
 *   note-off cell cleared              the note-off goes
 *   note-off typed on a sounding voice the sounding note's note-off moves there
 *   note typed on an empty cell        a note-on on the MIDI channel that last
 *                                       played on that voice, ending where the
 *                                       voice's next event is
 *   effect F (row > 0)                 a tempo event (FF 51) on track 0
 *
 * Unedited songs come back byte for byte (midi-file's writer reproduces every
 * corpus file); edited tracks are rewritten from absolute ticks, every other
 * event keeps its tick. Which voice a new note lands on is the player's
 * allocator's choice, not the grid's (research doc, "Editing").
 */

import { writeMidi, type MidiData, type MidiEvent } from 'midi-file';
import type { TrackerCell } from '@/types';
import {
  decodeMIDILoriciel, loricielGridNote, loricielRange, loricielVolume,
  LORICIEL_NOTE_OFF, LORICIEL_TICKS_PER_INTERRUPT,
  LORICIEL_PERIOD_MIN_INDEX, LORICIEL_PERIOD_MAX_INDEX, LORICIEL_TABLE_MIN_INDEX, LORICIEL_TABLE_MAX_INDEX,
  type DecodedMIDILoriciel, type LoricielBank, type LoricielNoteOn,
} from './MIDILoricielParser';

/** One edited grid cell: a row of the pass (all patterns in order) and a grid channel. */
export interface LoricielCellEdit { row: number; channel: number; cell: TrackerCell }

interface Item { tick: number; ev: MidiEvent }

/** Velocity (1..127) whose Paula volume is `volume`, or the nearest. */
export function loricielVelocityFor(volume: number): number {
  let best = 127, bestDiff = Infinity;
  for (let v = 1; v <= 127; v++) {
    const d = Math.abs(loricielVolume(v) - volume);
    if (d < bestDiff) { bestDiff = d; best = v; }
  }
  return best;
}

/**
 * The key that plays `sample` (0-based, or -1 for any) at grid note `note`
 * on `program`, or -1. Keys inside the real period table come first.
 */
export function loricielKeyFor(bank: LoricielBank, program: number, sample: number, note: number): number {
  const ranges = bank.programs[program];
  if (!ranges) return -1;
  let fallback = -1;
  for (let key = 0; key < 128; key++) {
    const r = loricielRange(ranges, key);
    if (!r || (sample >= 0 && r.sample !== sample)) continue;
    const idx = key - r.base;
    if (idx < LORICIEL_PERIOD_MIN_INDEX || idx > LORICIEL_PERIOD_MAX_INDEX) continue;
    if (loricielGridNote(idx) !== note) continue;
    if (idx >= LORICIEL_TABLE_MIN_INDEX && idx <= LORICIEL_TABLE_MAX_INDEX) return key;
    if (fallback < 0) fallback = key;
  }
  return fallback;
}

/** A tempo (microseconds per quarter) whose interrupt rate gives `bpm` at speed 1. */
function tempoForBpm(bpm: number, division: number): number {
  const ppq = division & 0x8000 ? 0xC0 : division;
  const hz = bpm / 2.5;
  return Math.max(1, Math.min(0xFFFFFF, Math.round((ppq * 1e6) / (hz * LORICIEL_TICKS_PER_INTERRUPT))));
}

/** The module's tracks as absolute-tick event lists, edited in place. */
class TrackEdit {
  readonly items: Item[][];
  /** The parsed events' items, [track][event], whatever moves around them. */
  private readonly originals: Item[][];
  readonly touched = new Set<number>();

  private readonly midi: MidiData;

  constructor(midi: MidiData, ticks: number[][]) {
    this.midi = midi;
    this.items = midi.tracks.map((tr, t) => tr.map((ev, i) => ({ tick: ticks[t][i], ev })));
    this.originals = this.items.map((l) => l.slice());
  }

  item(track: number, event: number): Item { return this.originals[track][event]; }

  /** Replace an item's event (a modified copy). */
  update(track: number, it: Item, patch: Partial<Record<string, unknown>>): void {
    it.ev = { ...it.ev, ...patch } as MidiEvent;
    this.touched.add(track);
  }

  remove(track: number, it: Item): void {
    const list = this.items[track];
    const i = list.indexOf(it);
    if (i >= 0) { list.splice(i, 1); this.touched.add(track); }
  }

  /** Insert at `tick`: after the events at it (`late`) or before them; never after the end of track. */
  insert(track: number, tick: number, ev: MidiEvent, late = true): Item {
    const list = this.items[track];
    let i = list.findIndex((x) => (late ? x.tick > tick : x.tick >= tick) || x.ev.type === 'endOfTrack');
    if (i < 0) i = list.length;
    const it = { tick: Math.min(tick, list[i]?.tick ?? tick), ev };
    list.splice(i, 0, it);
    this.touched.add(track);
    return it;
  }

  insertAt(track: number, anchor: Item, ev: MidiEvent, after: boolean): Item {
    const list = this.items[track];
    const it = { tick: anchor.tick, ev };
    list.splice(list.indexOf(anchor) + (after ? 1 : 0), 0, it);
    this.touched.add(track);
    return it;
  }

  toMidi(): MidiData {
    return {
      header: this.midi.header,
      tracks: this.items.map((list, t) => {
        if (!this.touched.has(t)) return this.midi.tracks[t];
        let prev = 0;
        return list.map(({ tick, ev }) => {
          const deltaTime = tick - prev;
          prev = tick;
          return { ...ev, deltaTime } as MidiEvent;
        });
      }),
    };
  }
}

/** The tick at which an event inserted into `track` fires at interrupt `row` (fireRow semantics of the player). */
function tickForRow(dec: DecodedMIDILoriciel, track: number, row: number): { tick: number; late: boolean } {
  const ticks = dec.schedule.ticks[track];
  const fires = dec.schedule.fireRows[track];
  // An event of this track already fires at `row`: share its tick (delta 0 fires in the same interrupt).
  for (let i = fires.length - 1; i >= 0; i--) if (fires[i] === row) return { tick: ticks[i], late: true };
  // Else the latest tick in (4(row-1), 4row] after the previous event of the track.
  let prevTick = -1;
  for (let i = 0; i < fires.length; i++) if (fires[i] >= 0 && fires[i] < row) prevTick = ticks[i];
  const tick = Math.max(prevTick + 1, row * LORICIEL_TICKS_PER_INTERRUPT);
  return { tick, late: false };
}

function isOffFor(ev: MidiEvent, channel: number, key: number): boolean {
  return (ev.type === 'noteOff' || (ev.type === 'noteOn' && ev.velocity === 0)) && ev.channel === channel && ev.noteNumber === key;
}

/** The note-off that ends a note-on (the next off for its channel and key in its track). */
function pairedOff(edit: TrackEdit, track: number, on: Item): Item | null {
  const list = edit.items[track];
  const ev = on.ev as Extract<MidiEvent, { type: 'noteOn' }>;
  for (let i = list.indexOf(on) + 1; i < list.length; i++) if (isOffFor(list[i].ev, ev.channel, ev.noteNumber)) return list[i];
  return null;
}

/** The note-off message the track already uses (9x velocity 0, or 8x). */
function offEvent(edit: TrackEdit, track: number, channel: number, key: number): MidiEvent {
  const usesByte9 = edit.items[track].some((x) => x.ev.type === 'noteOff' && (x.ev as { byte9?: true }).byte9);
  return usesByte9
    ? { deltaTime: 0, type: 'noteOff', channel, noteNumber: key, velocity: 0, byte9: true }
    : { deltaTime: 0, type: 'noteOff', channel, noteNumber: key, velocity: 0x40 };
}

/** The program on `channel` when interrupt `row` plays (the last program change before it). */
function programAt(dec: DecodedMIDILoriciel, channel: number, row: number): number {
  let prog = 0, at = -1;
  dec.midi.tracks.forEach((tr, t) => tr.forEach((ev, i) => {
    const r = dec.schedule.fireRows[t][i];
    if (ev.type === 'programChange' && ev.channel === channel && r >= 0 && r <= row && r >= at) { prog = ev.programNumber; at = r; }
  }));
  return prog;
}

/** Key + program changes needed to play (sample, note) on `channel` at `row`. */
function resolveKey(dec: DecodedMIDILoriciel, channel: number, row: number, sample: number, note: number): { key: number; program: number | null } {
  const current = programAt(dec, channel, row);
  const key = loricielKeyFor(dec.bank, current, sample, note);
  if (key >= 0) return { key, program: null };
  for (let p = 0; p < dec.bank.programs.length; p++) {
    const k = loricielKeyFor(dec.bank, p, sample, note);
    if (k >= 0) return { key: k, program: p };
  }
  throw new Error(`MIDI Loriciel: no key plays sample ${sample + 1} at note ${note}`);
}

/** Program `program` for the note-on `it` only: a change before it and back to `restore` after it. */
function switchProgram(edit: TrackEdit, track: number, it: Item, channel: number, program: number, restore: number): void {
  edit.insertAt(track, it, { deltaTime: 0, type: 'programChange', channel, programNumber: program }, false);
  edit.insertAt(track, it, { deltaTime: 0, type: 'programChange', channel, programNumber: restore }, true);
}

/** Place a note-on (with any program switch around it) and return its item. */
function placeNoteOn(edit: TrackEdit, dec: DecodedMIDILoriciel, track: number, channel: number, row: number,
  sample: number, note: number, velocity: number, anchor: Item | null): Item {
  const { key, program } = resolveKey(dec, channel, row, sample, note);
  const ev: MidiEvent = { deltaTime: 0, type: 'noteOn', channel, noteNumber: key, velocity };
  let it: Item;
  if (anchor) {
    it = edit.insertAt(track, anchor, ev, true);
  } else {
    const { tick, late } = tickForRow(dec, track, row);
    it = edit.insert(track, tick, ev, late);
  }
  if (program !== null) switchProgram(edit, track, it, channel, program, programAt(dec, channel, row));
  return it;
}

/** The note sounding on `voice` at `row` (allocated before it and not yet freed or stolen), if any. */
function soundingNote(dec: DecodedMIDILoriciel, voice: number, row: number): LoricielNoteOn | null {
  let last: LoricielNoteOn | null = null;
  for (const n of dec.schedule.noteOns) if (n.voice === voice && n.row < row) last = n;
  if (!last) return null;
  const freed = dec.schedule.noteOffs.some((o) => o.voice === voice && o.row > last!.row && o.row <= row);
  return freed ? null : last;
}

/** Where a note typed at (voice, row) belongs: the track and channel that play that voice around it. */
function hostFor(dec: DecodedMIDILoriciel, voice: number, row: number): { track: number; channel: number } {
  let pick: LoricielNoteOn | null = null;
  for (const n of dec.schedule.noteOns) {
    if (n.voice !== voice) continue;
    if (n.row <= row || !pick) pick = n;
    if (n.row > row) break;
  }
  pick ??= dec.schedule.noteOns[0] ?? null;
  if (!pick) throw new Error('MIDI Loriciel: the song has no notes to take a channel from');
  return { track: pick.track, channel: pick.channel };
}

/** The row of the next event on `voice` after `row` (where a typed note ends), or the end of the pass. */
function nextEventRow(dec: DecodedMIDILoriciel, voice: number, row: number): number {
  let next = dec.schedule.restartRow;
  for (const n of dec.schedule.noteOns) if (n.voice === voice && n.row > row && n.row < next) next = n.row;
  for (const o of dec.schedule.noteOffs) if (o.voice === voice && o.row > row && o.row < next) next = o.row;
  return next;
}

/** The note delay (EDx) of a cell, in interrupts; 0 without one. */
function noteDelay(cell: TrackerCell): number {
  return cell.effTyp === 0x0E && (cell.eff & 0xF0) === 0xD0 ? cell.eff & 0x0F : 0;
}

/**
 * Apply grid cell edits to a MIDI Loriciel module. `module` is the file the
 * runner plays now, `bank` its SMPL bank. Returns the new file (the same
 * bytes when no edit changes an event).
 */
export function encodeMIDILoricielEdits(module: Uint8Array, bank: Uint8Array, edits: readonly LoricielCellEdit[]): Uint8Array {
  return applyEdits(module, decodeMIDILoriciel(module, bank), edits);
}

/** A grid edit as the tracker store sends it (pattern index, row in it, channel). */
export interface LoricielGridEdit { pattern: number; row: number; channel: number; cell: TrackerCell }

/** Grid edits from the tracker (the parsed song's patterns, in order) into the module. */
export function encodeMIDILoricielGridEdits(module: Uint8Array, bank: Uint8Array, edits: readonly LoricielGridEdit[]): Uint8Array {
  const dec = decodeMIDILoriciel(module, bank);
  const per = dec.layout.rowsPerPattern;
  return applyEdits(module, dec, edits.map((e) => ({ row: e.pattern * per + e.row, channel: e.channel, cell: e.cell })));
}

function applyEdits(module: Uint8Array, dec: DecodedMIDILoriciel, edits: readonly LoricielCellEdit[]): Uint8Array {
  const edit = new TrackEdit(dec.midi, dec.schedule.ticks);
  const { layout } = dec;

  for (const { row, channel, cell } of edits) {
    if (row < 0 || row >= layout.rows || channel < 0 || channel >= layout.channels.length) continue;
    const { voice } = layout.channels[channel];
    const old = dec.grid[channel][row];
    const ev = layout.cells[channel][row];
    // The interrupt the edited cell plays at: its row, plus its note delay.
    const at = Math.min(dec.schedule.restartRow, row * layout.speed + noteDelay(cell));

    // Effect F (second effect column, channel 0): the tempo events after the start.
    if (channel === 0 && (old.effTyp2 !== cell.effTyp2 || old.eff2 !== cell.eff2)) {
      for (const tempo of dec.schedule.tempos.filter((t) => t.row > 0 && Math.floor(t.row / layout.speed) === row)) {
        edit.remove(tempo.track, edit.item(tempo.track, tempo.event));
      }
      if (cell.effTyp2 === 0x0F && cell.eff2 >= 0x20) {
        const { tick, late } = tickForRow(dec, 0, at);
        edit.insert(0, tick, { deltaTime: 0, type: 'setTempo', microsecondsPerBeat: tempoForBpm(cell.eff2, dec.schedule.division) }, late);
      }
    }

    if (old.note === cell.note && old.instrument === cell.instrument && old.volume === cell.volume) continue;

    if (ev?.kind === 'on') {
      const on = ev.on;
      const onItem = edit.item(on.track, on.event);
      const offItem = pairedOff(edit, on.track, onItem);
      if (cell.note === 0 && cell.instrument === 0) {
        edit.remove(on.track, onItem);
        if (offItem) edit.remove(on.track, offItem);
        continue;
      }
      if (cell.note === LORICIEL_NOTE_OFF) {
        // The note-on goes; the note sounding before it stops here.
        edit.remove(on.track, onItem);
        if (offItem) edit.remove(on.track, offItem);
        stopSounding(edit, dec, voice, ev.interrupt);
        continue;
      }
      const sample = cell.instrument > 0 ? cell.instrument - 1 : on.sample;
      const note = cell.note > 0 ? cell.note : loricielGridNote(on.periodIndex);
      const vol = cell.volume >= 0x10 && cell.volume <= 0x50 ? cell.volume - 0x10 : -1;
      const velocity = vol < 0 || loricielVolume(on.velocity) === vol ? on.velocity : loricielVelocityFor(vol);
      const { key, program } = resolveKey(dec, on.channel, on.row, sample, note);
      edit.update(on.track, onItem, { noteNumber: key, velocity });
      if (offItem) edit.update(on.track, offItem, { noteNumber: key });
      if (program !== null) switchProgram(edit, on.track, onItem, on.channel, program, on.program);
      continue;
    }

    if (ev?.kind === 'off') {
      const offIt = edit.item(ev.off.track, ev.off.event);
      if (cell.note === 0) { edit.remove(ev.off.track, offIt); continue; }
      if (cell.note >= 1 && cell.note <= 96) {
        // The voice stops and a new note starts on it in the same interrupt.
        addNote(edit, dec, voice, ev.off.row, ev.off.track, ev.off.channel, cell, offIt);
      }
      continue;
    }

    // Nothing behind the cell (or the restart's cut): a typed note or note-off.
    if (cell.note === LORICIEL_NOTE_OFF) {
      stopSounding(edit, dec, voice, at);
    } else if (cell.note >= 1 && cell.note <= 96) {
      const host = hostFor(dec, voice, at);
      addNote(edit, dec, voice, at, host.track, host.channel, cell, null);
    }
  }

  if (edit.touched.size === 0) return module;
  return new Uint8Array(writeMidi(edit.toMidi()));
}

/** Move the note-off of the note sounding on `voice` to interrupt `at` (or add one). */
function stopSounding(edit: TrackEdit, dec: DecodedMIDILoriciel, voice: number, at: number): void {
  const sounding = soundingNote(dec, voice, at);
  if (!sounding) return;
  const sItem = edit.item(sounding.track, sounding.event);
  const sOff = pairedOff(edit, sounding.track, sItem);
  if (sOff) edit.remove(sounding.track, sOff);
  const { tick, late } = tickForRow(dec, sounding.track, at);
  edit.insert(sounding.track, tick, offEvent(edit, sounding.track, sounding.channel, sounding.key), late);
}

/** A typed note at interrupt `at` on (track, MIDI channel), ending at the voice's next event. */
function addNote(edit: TrackEdit, dec: DecodedMIDILoriciel, voice: number, at: number, track: number, channel: number,
  cell: TrackerCell, anchor: Item | null): void {
  const sample = cell.instrument > 0 ? cell.instrument - 1 : -1;
  const velocity = cell.volume >= 0x10 ? loricielVelocityFor(cell.volume - 0x10) : 127;
  const on = placeNoteOn(edit, dec, track, channel, at, sample, cell.note, velocity, anchor);
  const end = nextEventRow(dec, voice, at);
  const { tick, late } = tickForRow(dec, track, end);
  edit.insert(track, Math.max(tick, on.tick + 1), offEvent(edit, track, channel, (on.ev as { noteNumber: number }).noteNumber), late);
}
