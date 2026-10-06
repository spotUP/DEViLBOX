/**
 * MIDI Loriciel: the grid is the player's schedule of the MIDI file, and grid
 * edits write MIDI events back.
 *
 * Before 2026-10-06 the "grid" was one channel of carrier bytes over the
 * MTrk stream (0 notes; the app fell back to UADE's scan) and its codec only
 * proved that a byte copies to itself. Now, per corpus song (every MIDI.* with
 * its SMPL.* bank):
 *  - the module comes back byte for byte from the encoder: no edit, an edit
 *    and its undo, and midi-file's reader + writer (the one MIDI codec);
 *  - the grid holds every note-on the player plays, on the Paula voice and
 *    interrupt the player plays it (four channels, one row per interrupt);
 *  - a changed note, a changed volume, a cleared note, a typed note-off and
 *    a typed note each become the MIDI events that make the player do it
 *    (re-decoding the new file shows the edit).
 * The runner side (the schedule against the eagleplayer's Paula registers,
 * and an edit heard on the runner) is src/engine/__tests__/midiLoricielRunner.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { parseMidi, writeMidi } from 'midi-file';
import {
  decodeMIDILoriciel, parseMIDILoricielFile, loricielGridNote, LORICIEL_NOTE_OFF,
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
    const on = dec.schedule.noteOns.find((n) => n.periodIndex > -20 && n.periodIndex < 20)!;
    const cell = { ...dec.grid[on.voice][on.row] };
    const edited = encodeMIDILoricielEdits(module, bank, [{ row: on.row, voice: on.voice, cell: { ...cell, note: cell.note + 1 } }]);
    expect(edited).not.toEqual(module);
    expect(decodeMIDILoriciel(edited, bank).grid[on.voice][on.row].note).toBe(cell.note + 1);
    const undone = encodeMIDILoricielEdits(edited, bank, [{ row: on.row, voice: on.voice, cell }]);
    expect([...undone]).toEqual([...module]);
  });

  it.each(SONGS)('%s: every note-on the player plays is in the grid, on its voice and interrupt', (tune) => {
    const { module, bank } = load(tune);
    const song = parseMIDILoricielFile(ab(module), `MIDI.${tune}`, new Map([[`SMPL.${tune}`, ab(bank)]]));
    const dec = decodeMIDILoriciel(module, bank);
    expect(song.numChannels).toBe(4);
    expect(song.initialSpeed).toBe(1);
    // The grid as patterns, flattened back to one pass.
    const rows = song.patterns.flatMap((p) => p.channels[0].rows).length;
    expect(rows).toBe(dec.schedule.rows);
    const cellAt = (voice: number, row: number): TrackerCell => {
      const p = Math.floor(row / dec.rowsPerPattern);
      return song.patterns[p].channels[voice].rows[row - p * dec.rowsPerPattern];
    };
    const cols = (c: TrackerCell) => [c.note, c.note2 ?? 0, c.note3 ?? 0, c.note4 ?? 0];
    for (const n of dec.schedule.noteOns) {
      const want = loricielGridNote(n.periodIndex);
      const c = cellAt(n.voice, n.row);
      // Every note-on has a column on its cell; one whose period has no grid note keeps its instrument.
      if (want) expect(cols(c), `${tune} note-on row ${n.row} voice ${n.voice}`).toContain(want);
      else expect(c.instrument).toBe(n.sample + 1);
    }
    for (const o of dec.schedule.noteOffs) {
      const c = cellAt(o.voice, o.row);
      // A note-off shows unless a note-on on the same voice follows it in that interrupt.
      const retrigger = dec.schedule.noteOns.some((n) => n.voice === o.voice && n.row === o.row
        && (n.track > o.track || (n.track === o.track && n.event > o.event)));
      if (!retrigger) expect(cols(c)).toContain(LORICIEL_NOTE_OFF);
    }
    expect(song.instruments.length).toBe(dec.bank.samples.length);
  });
});

describe('MIDI Loriciel grid edits become MIDI events', () => {
  const tune = 'Cartoons 2';
  const { module, bank } = load(tune);
  const dec = decodeMIDILoriciel(module, bank);
  const first = dec.schedule.noteOns[0];

  it('a changed note plays at the new pitch on the same voice and interrupt', () => {
    const cell = { ...dec.grid[first.voice][first.row] };
    const out = encodeMIDILoricielEdits(module, bank, [{ row: first.row, voice: first.voice, cell: { ...cell, note: cell.note + 2 } }]);
    const after = decodeMIDILoriciel(out, bank);
    expect(after.grid[first.voice][first.row].note).toBe(cell.note + 2);
    expect(after.schedule.noteOns.length).toBe(dec.schedule.noteOns.length);
    // Its note-off moved with it: the voice is still freed where it was.
    expect(after.schedule.noteOffs.length).toBe(dec.schedule.noteOffs.length);
  });

  it('a changed volume becomes the velocity that gives it', () => {
    const cell = { ...dec.grid[first.voice][first.row] };
    const out = encodeMIDILoricielEdits(module, bank, [{ row: first.row, voice: first.voice, cell: { ...cell, volume: 0x10 + 20 } }]);
    expect(decodeMIDILoriciel(out, bank).grid[first.voice][first.row].volume).toBe(0x10 + 20);
  });

  it('a cleared note takes its note-on and note-off out of the file', () => {
    const out = encodeMIDILoricielEdits(module, bank, [{ row: first.row, voice: first.voice, cell: { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 } }]);
    const after = decodeMIDILoriciel(out, bank);
    expect(after.schedule.noteOns.length).toBe(dec.schedule.noteOns.length - 1);
    expect(after.schedule.noteOns.some((n) => n.row === first.row && n.channel === first.channel && n.key === first.key)).toBe(false);
  });

  it('a note-off typed under a sounding note stops the voice there', () => {
    const off = dec.schedule.noteOffs.find((o) => o.row - first.row > 2 && o.voice === first.voice)!;
    const row = first.row + 1;
    expect(off.row).toBeGreaterThan(row);
    const cell = { ...dec.grid[first.voice][row], note: LORICIEL_NOTE_OFF };
    const out = encodeMIDILoricielEdits(module, bank, [{ row, voice: first.voice, cell }]);
    const after = decodeMIDILoriciel(out, bank);
    expect(after.grid[first.voice][row].note).toBe(LORICIEL_NOTE_OFF);
    expect(after.schedule.noteOffs.some((o) => o.voice === first.voice && o.row === off.row)).toBe(false);
  });

  it('a note typed on an empty cell is a new note-on in that interrupt, on the voice the player allocates', () => {
    // A row where no voice has an event, between notes.
    let row = -1;
    for (let r = dec.rowsPerPattern; r < dec.schedule.rows - dec.rowsPerPattern && row < 0; r++) {
      if ([0, 1, 2, 3].every((v) => dec.grid[v][r].note === 0)) row = r;
    }
    expect(row).toBeGreaterThan(0);
    const cell: TrackerCell = { note: 30, instrument: 1, volume: 0x10 + 40, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
    const out = encodeMIDILoricielGridEdits(module, bank, [{ pattern: Math.floor(row / dec.rowsPerPattern), row: row % dec.rowsPerPattern, channel: 3, cell }]);
    const after = decodeMIDILoriciel(out, bank);
    expect(after.schedule.noteOns.length).toBe(dec.schedule.noteOns.length + 1);
    const typed = after.schedule.noteOns.filter((n) => n.row === row);
    expect(typed.length).toBe(1);
    const c = after.grid[typed[0].voice][row];
    expect([c.note, c.instrument, c.volume]).toEqual([30, 1, 0x10 + 40]);
  });
});
