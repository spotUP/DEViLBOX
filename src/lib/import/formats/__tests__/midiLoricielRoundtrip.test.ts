/**
 * MIDI Loriciel: the grid is the player's schedule of the MIDI file, laid out
 * in MIDI time, and grid edits write MIDI events back.
 *
 * Before 2026-10-06 the "grid" was one channel of carrier bytes over the
 * MTrk stream (0 notes; the app fell back to UADE's scan). The first decode
 * had one row per player interrupt (192-row bars at ~120 rows/s) with chords
 * in note columns; owner: "the pattern speed/length/note distribution is
 * wrong". Now, per corpus song (every MIDI.* with its SMPL.* bank):
 *  - rows are a 16th (or finer: the largest whole-interrupt division of a
 *    16th that holds 98% of the note-ons); speed = interrupts per row;
 *  - every event the player plays is on its voice's channel (or that voice's
 *    chord channel) at row = interrupt / speed with note delay EDx =
 *    interrupt % speed: zero rounding error, and every note-on on the row
 *    grid sits on the row of its MIDI tick;
 *  - the module comes back byte for byte (no edit, an edit and its undo,
 *    midi-file's reader + writer);
 *  - a changed note, a changed volume, a cleared note, a typed note-off and
 *    a typed note each become the MIDI events that make the player do it.
 * The runner side (Paula registers per interrupt, the playhead row at each
 * Paula note-on, an edit heard on the runner) is
 * src/engine/__tests__/midiLoricielRunner.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { parseMidi, writeMidi } from 'midi-file';
import {
  decodeMIDILoriciel, parseMIDILoricielFile, loricielGridNote, LORICIEL_NOTE_OFF,
  type DecodedMIDILoriciel,
} from '../MIDILoricielParser';
import { encodeMIDILoricielEdits, encodeMIDILoricielGridEdits } from '../MIDILoricielEncoder';
import type { TrackerCell } from '@/types';

const DIR = join(process.cwd(), 'public/data/songs/formats/Michel Winogradoff');
const SONGS = readdirSync(DIR).filter((f) => f.startsWith('MIDI.')).map((f) => f.slice(5));
const load = (tune: string) => ({
  module: new Uint8Array(readFileSync(join(DIR, `MIDI.${tune}`))),
  bank: new Uint8Array(readFileSync(join(DIR, `SMPL.${tune}`))),
});
const ab = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
const delayOf = (c: TrackerCell) => (c.effTyp === 0x0E && (c.eff & 0xF0) === 0xD0 ? c.eff & 0x0F : 0);
const empty = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

/** Grid channels of a voice (its own and its chord channels). */
const channelsOf = (d: DecodedMIDILoriciel, voice: number) => d.layout.channels.flatMap((c, i) => (c.voice === voice ? [i] : []));

describe('MIDI Loriciel corpus', () => {
  it('has the ten songs with their banks', () => {
    expect(SONGS.length).toBe(10);
  });

  it('refuses a module without its SMPL bank (the import then takes UADE\'s scan)', () => {
    const { module } = load('Cartoons 2');
    expect(() => parseMIDILoricielFile(ab(module), 'MIDI.Cartoons 2')).toThrow(/SMPL/);
  });

  it.each(SONGS)('%s: the module round-trips byte for byte', (tune) => {
    const { module, bank } = load(tune);
    expect([...new Uint8Array(writeMidi(parseMidi(module)))]).toEqual([...module]);
    expect(encodeMIDILoricielEdits(module, bank, [])).toEqual(module);
    // An edit and its undo come back to the same file.
    const dec = decodeMIDILoriciel(module, bank);
    const row = dec.grid[0].findIndex((c) => c.note > 1 && c.note < 90);
    const cell = { ...dec.grid[0][row] };
    const edited = encodeMIDILoricielEdits(module, bank, [{ row, channel: 0, cell: { ...cell, note: cell.note + 1 } }]);
    expect(edited).not.toEqual(module);
    expect(decodeMIDILoriciel(edited, bank).grid[0][row].note).toBe(cell.note + 1);
    expect([...encodeMIDILoricielEdits(edited, bank, [{ row, channel: 0, cell }])]).toEqual([...module]);
  });

  it.each(SONGS)('%s: every event is on its row with zero rounding error, in MIDI time', (tune) => {
    const { module, bank } = load(tune);
    const song = parseMIDILoricielFile(ab(module), `MIDI.${tune}`, new Map([[`SMPL.${tune}`, ab(bank)]]));
    const d = decodeMIDILoriciel(module, bank);
    const { speed, ticksPerRow, rowsPerPattern } = d.layout;
    expect(ticksPerRow % 4).toBe(0);
    expect((d.schedule.division / 4) % ticksPerRow, 'a row divides a 16th').toBe(0);
    expect(song.initialSpeed).toBe(speed);
    expect(rowsPerPattern).toBeLessThanOrEqual(64);
    expect(song.patterns.flatMap((p) => p.channels[0].rows).length).toBe(d.layout.rows);
    const cellAt = (ch: number, row: number): TrackerCell => {
      const p = Math.floor(row / rowsPerPattern);
      return song.patterns[p].channels[ch].rows[row - p * rowsPerPattern];
    };
    const at = (voice: number, interrupt: number, test: (c: TrackerCell) => boolean) =>
      channelsOf(d, voice).some((ch) => {
        const c = cellAt(ch, Math.floor(interrupt / speed));
        return test(c) && delayOf(c) === interrupt % speed;
      });
    for (const n of d.schedule.noteOns) {
      const note = loricielGridNote(n.periodIndex);
      expect(at(n.voice, n.row, (c) => c.note === note && c.instrument === n.sample + 1), `${tune} note-on at interrupt ${n.row}, voice ${n.voice}`).toBe(true);
      // Musical position: a note-on on the row grid is on the row of its MIDI tick.
      const tick = d.schedule.ticks[n.track][n.event];
      if (tick % ticksPerRow === 0) expect(Math.floor(n.row / speed)).toBe(tick / ticksPerRow);
    }
    for (const o of d.schedule.noteOffs) {
      const retrigger = d.schedule.noteOns.some((n) => n.voice === o.voice && Math.floor(n.row / speed) === Math.floor(o.row / speed)
        && (n.row > o.row || (n.row === o.row && (n.track > o.track || (n.track === o.track && n.event > o.event)))));
      if (!retrigger) expect(at(o.voice, o.row, (c) => c.note === LORICIEL_NOTE_OFF), `${tune} note-off at ${o.row}`).toBe(true);
    }
    expect(song.instruments.length).toBe(d.bank.samples.length);
  });

  it('lays a 16th to a row where the song is on 16ths, and the song\'s rate in speed/BPM', () => {
    const { module, bank } = load('Cartoons 1');
    const song = parseMIDILoricielFile(ab(module), 'MIDI.Cartoons 1', new Map([['SMPL.Cartoons 1', ab(bank)]]));
    // 192 ticks per quarter: a 16th is 48 ticks = 12 interrupts; tempo 400000 -> CIA 5965 -> 118.9 Hz.
    expect(song.initialSpeed).toBe(12);
    expect(song.initialBPM).toBe(297);
    expect(song.patterns[0].length).toBe(64);
    expect(song.eaglePlayerTickGrid).toEqual({ firstTick: 1, passTicks: 15362 });
  });
});

describe('MIDI Loriciel grid edits become MIDI events', () => {
  const tune = 'Cartoons 2';
  const { module, bank } = load(tune);
  const dec = decodeMIDILoriciel(module, bank);
  const first = dec.schedule.noteOns[0];
  const row = Math.floor(first.row / dec.layout.speed);
  const ch = first.voice;

  it('a changed note plays at the new pitch on the same voice and interrupt', () => {
    const cell = { ...dec.grid[ch][row] };
    const out = encodeMIDILoricielEdits(module, bank, [{ row, channel: ch, cell: { ...cell, note: cell.note + 2 } }]);
    const after = decodeMIDILoriciel(out, bank);
    expect(after.grid[ch][row]).toEqual({ ...cell, note: cell.note + 2 });
    expect(after.schedule.noteOns.length).toBe(dec.schedule.noteOns.length);
    expect(after.schedule.noteOffs.length).toBe(dec.schedule.noteOffs.length);
  });

  it('a changed volume becomes the velocity that gives it', () => {
    const cell = { ...dec.grid[ch][row] };
    const out = encodeMIDILoricielEdits(module, bank, [{ row, channel: ch, cell: { ...cell, volume: 0x10 + 20 } }]);
    expect(decodeMIDILoriciel(out, bank).grid[ch][row].volume).toBe(0x10 + 20);
  });

  it('a cleared note takes its note-on and note-off out of the file', () => {
    const out = encodeMIDILoricielEdits(module, bank, [{ row, channel: ch, cell: empty() }]);
    const after = decodeMIDILoriciel(out, bank);
    expect(after.schedule.noteOns.length).toBe(dec.schedule.noteOns.length - 1);
    expect(after.schedule.noteOns.some((n) => n.row === first.row && n.channel === first.channel && n.key === first.key)).toBe(false);
  });

  it('a note-off typed under a sounding note stops the voice on that row', () => {
    const off = dec.schedule.noteOffs.find((o) => o.voice === first.voice && o.row > first.row)!;
    const offRow = Math.floor(off.row / dec.layout.speed);
    expect(offRow).toBeGreaterThan(row + 1);
    const out = encodeMIDILoricielEdits(module, bank, [{ row: row + 1, channel: ch, cell: { ...empty(), note: LORICIEL_NOTE_OFF } }]);
    const after = decodeMIDILoriciel(out, bank);
    expect(after.grid[ch][row + 1].note).toBe(LORICIEL_NOTE_OFF);
    expect(after.grid[ch][offRow].note).not.toBe(LORICIEL_NOTE_OFF);
  });

  it('a note typed on an empty row is a new note-on there, on the voice the player allocates', () => {
    const per = dec.layout.rowsPerPattern;
    let target = -1;
    for (let r = per; r < dec.layout.rows - per && target < 0; r++) {
      if (dec.grid.every((col) => col[r].note === 0)) target = r;
    }
    expect(target).toBeGreaterThan(0);
    const cell: TrackerCell = { ...empty(), note: 30, instrument: 1, volume: 0x10 + 40 };
    const out = encodeMIDILoricielGridEdits(module, bank, [{ pattern: Math.floor(target / per), row: target % per, channel: 3, cell }]);
    const after = decodeMIDILoriciel(out, bank);
    expect(after.schedule.noteOns.length).toBe(dec.schedule.noteOns.length + 1);
    const typed = after.schedule.noteOns.filter((n) => Math.floor(n.row / after.layout.speed) === target);
    expect(typed.length).toBe(1);
    const c = after.grid[typed[0].voice][target];
    expect([c.note, c.instrument, c.volume]).toEqual([30, 1, 0x10 + 40]);
  });
});
