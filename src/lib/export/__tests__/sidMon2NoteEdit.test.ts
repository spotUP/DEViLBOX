/**
 * G24: a SidMon II note edit reaches the exported module (the variable encoder returned 212 bytes for a 62-byte slot, so
 * the edit was dropped and the next play was the original; the router branch tested a format name the parser never sets).
 * An edited note is the note command's byte moved by the change; the module reloads with that note in that cell and
 * every other cell as before.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { parseSidMon2File } from '@/lib/import/formats/SidMon2Parser';
import { setGridBaseline, baselineOf } from '@/lib/song/gridBaseline';
import { writeSidMon2NoteEdits } from '../SidMon2Exporter';

const DIR = 'public/data/songs/sidmon-2/';
const file = readdirSync(DIR).find((f) => !f.startsWith('.'))!;

describe('SidMon II note edit export', () => {
  it('reloads an edited note in its cell and no other cell moves', async () => {
    const bytes = readFileSync(DIR + file);
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const song = await parseSidMon2File(buf, file);
    setGridBaseline(baselineOf(song.patterns));
    const before = structuredClone(song.patterns);
    const n = song.uadeVariableLayout!.noteBytes!.find((x) => x.note > 20 && x.note < 80)!;
    song.patterns[n.pattern].channels[n.channel].rows[n.row].note = n.note + 2;
    const { data, warnings } = writeSidMon2NoteEdits(song, buf);
    expect(warnings).toEqual([]);
    const back = await parseSidMon2File(data, file);
    expect(back.patterns[n.pattern].channels[n.channel].rows[n.row].note).toBe(n.note + 2);
    // A track several positions share is one command: the edit shows on every cell that plays that byte (G17).
    for (const m of song.uadeVariableLayout!.noteBytes!) if (m.offset === n.offset) back.patterns[m.pattern].channels[m.channel].rows[m.row].note = m.note;
    const notes = (ps: typeof before) => ps.map((p) => p.channels.map((c) => c.rows.map((r) => r.note)));
    expect(notes(back.patterns)).toEqual(notes(before));
  });

  it('refuses a note on a row no command played, and keeps the module', async () => {
    const bytes = readFileSync(DIR + file);
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const song = await parseSidMon2File(buf, file);
    setGridBaseline(baselineOf(song.patterns));
    const played = new Set(song.uadeVariableLayout!.noteBytes!.map((x) => `${x.pattern}:${x.channel}:${x.row}`));
    const rows = song.patterns[0].channels[0].rows;
    const r = rows.findIndex((_, i) => !played.has(`0:0:${i}`));
    rows[r].note = 40;
    const { data, warnings } = writeSidMon2NoteEdits(song, buf);
    expect(warnings.length).toBe(1);
    expect(new Uint8Array(data)).toEqual(new Uint8Array(buf));
  });
});
