/**
 * Future Player: a grid edit is a byte patch of the command the cell was drawn from (U7, byte-exact carriers).
 *
 * Through the product's own export (exportAsFuturePlayer over a song from parseFuturePlayerFile):
 *  - an unedited song exports the module byte for byte;
 *  - a changed note patches its command's note byte (one byte), and re-importing the export shows the
 *    typed note on that cell, with every other cell unchanged except the cells that replay the same
 *    command (a shared subroutine);
 *  - a changed instrument patches the set-instrument command in force (its pointer) and re-importing
 *    shows the new instrument on the note;
 *  - an edit that needs a longer block (a note on a blank row, a removed note, a note-off) is a warning
 *    and writes nothing.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFuturePlayerFile, buildFuturePlayerGrid } from '@/lib/import/formats/FuturePlayerParser';
import { exportAsFuturePlayer } from '@/lib/export/FuturePlayerExporter';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const ROOT = process.cwd();
const FILES = ['public/data/songs/formats/hybris.fp', 'public/data/songs/future-player/imploder drums.fp'];
const ab = (b: Uint8Array): ArrayBuffer => b.slice().buffer as ArrayBuffer;
const clone = (s: TrackerSong): TrackerSong => ({ ...s, patterns: s.patterns.map((p) => ({ ...p, channels: p.channels.map((c) => ({ ...c, rows: c.rows.map((r) => ({ ...r })) })) })) });
async function bytesOf(s: TrackerSong): Promise<Uint8Array> {
  return new Uint8Array(await (await exportAsFuturePlayer(s)).data.arrayBuffer());
}

describe.each(FILES)('Future Player grid edits: %s', (file) => {
  const bytes = new Uint8Array(readFileSync(join(ROOT, file)));
  const name = file.split('/').pop()!;
  const song = parseFuturePlayerFile(ab(bytes), name) as TrackerSong;
  const grid = buildFuturePlayerGrid(bytes).grid!;

  /**
   * The first retriggered note cell with a source (and, for the instrument edit, a set-instrument command before
   * it); `shifted` asks for one whose note byte differs from its table index (sample base note, transposes, arpeggio).
   */
  function find(needInstrCmd: boolean, shifted = false): { p: number; v: number; r: number } | null {
    for (let p = 0; p < grid.cellSources.length; p++) for (let v = 0; v < 4; v++) for (let r = 0; r < grid.cellSources[p][v].length; r++) {
      const s = grid.cellSources[p][v][r];
      if (s && s.retrigger && (!needInstrCmd || s.instrCmd >= 0) && (!shifted || s.delta !== 0) && song.patterns[p].channels[v].rows[r].note > 1 && song.patterns[p].channels[v].rows[r].note < 90) return { p, v, r };
    }
    return null;
  }

  it('an unedited song exports the module byte for byte', async () => {
    const out = await bytesOf(song);
    expect(out.length).toBe(bytes.length);
    expect(out.every((b, i) => b === bytes[i])).toBe(true);
    expect((await exportAsFuturePlayer(song)).warnings).toEqual([]);
  });

  it('a changed note patches its command\'s note byte, and re-importing shows the typed note on every cell of that command only', async () => {
    // a cell whose note byte is not its table index (hybris.fp's samples have a base note) proves the byte is index minus that shift
    const at = find(false, true) ?? find(false)!;
    if (name === 'hybris.fp') expect(grid.cellSources[at.p][at.v][at.r]!.delta, 'a shifted cell is tested').not.toBe(0);
    const src = grid.cellSources[at.p][at.v][at.r]!;
    const edited = clone(song);
    const cell = edited.patterns[at.p].channels[at.v].rows[at.r];
    const was = cell.note;
    cell.note = was + 1;
    const r = await exportAsFuturePlayer(edited);
    expect(r.warnings).toEqual([]);
    const out = new Uint8Array(await r.data.arrayBuffer());
    const changed = out.reduce((n, b, i) => n + (b !== bytes[i] ? 1 : 0), 0);
    expect(changed, 'one byte, the command\'s note byte').toBe(1);
    const re = parseFuturePlayerFile(ab(out), name) as TrackerSong;
    expect(re.gridUnmatchedReason).toBeUndefined();
    expect(re.patterns[at.p].channels[at.v].rows[at.r].note, 'the typed note').toBe(was + 1);
    // every other cell: the same, except the cells replaying this command
    const g2 = buildFuturePlayerGrid(out).grid!;
    let sharing = 0;
    for (let p = 0; p < song.patterns.length; p++) for (let v = 0; v < 4; v++) for (let row = 0; row < song.patterns[p].length; row++) {
      const a = song.patterns[p].channels[v].rows[row], b = re.patterns[p].channels[v].rows[row];
      const same = grid.cellSources[p][v][row]?.off === src.off;
      if (same) { sharing++; expect(b.note, `cell of the same command at ${p}/${v}/${row}`).toBe(a.note + 1); } else expect(b.note, `cell at ${p}/${v}/${row}`).toBe(a.note);
      expect(b.instrument).toBe(a.instrument);
    }
    expect(sharing).toBeGreaterThanOrEqual(1);
    expect(g2.cellSources.length).toBe(grid.cellSources.length);
  });

  it('a changed instrument patches the set-instrument command in force and re-importing shows the new instrument', async () => {
    if (song.instruments.length < 2) return;
    const at = find(true)!;
    const edited = clone(song);
    const cell = edited.patterns[at.p].channels[at.v].rows[at.r];
    const was = cell.instrument;
    const to = song.instruments.find((i) => i.id !== was)!.id;
    cell.instrument = to;
    const r = await exportAsFuturePlayer(edited);
    expect(r.warnings).toEqual([]);
    const out = new Uint8Array(await r.data.arrayBuffer());
    const changed = out.reduce((n, b, i) => n + (b !== bytes[i] ? 1 : 0), 0);
    expect(changed, 'the pointer\'s bytes that differ').toBeGreaterThan(0);
    expect(changed).toBeLessThanOrEqual(4);
    const re = parseFuturePlayerFile(ab(out), name) as TrackerSong;
    // slot ids follow the order the walk first sets pointers, which the edit may change: compare by pointer
    const ptr = (s: TrackerSong, id: number): number => (s.instruments.find((i) => i.id === id) as unknown as { metadata: { fpInstrPtr: number } }).metadata.fpInstrPtr;
    expect(ptr(re, re.patterns[at.p].channels[at.v].rows[at.r].instrument)).toBe(ptr(song, to));
  });

  it('an edit that needs a longer block is a warning and writes nothing', async () => {
    const at = find(false)!;
    // a removed note
    const removed = clone(song);
    removed.patterns[at.p].channels[at.v].rows[at.r].note = 0;
    // a note on a blank row (no command ran there)
    let blank: { p: number; v: number; r: number } | null = null;
    for (let p = 0; p < grid.cellSources.length && !blank; p++) for (let v = 0; v < 4 && !blank; v++) for (let r = 0; r < grid.cellSources[p][v].length && !blank; r++) {
      if (!grid.cellSources[p][v][r] && song.patterns[p].channels[v].rows[r].note === 0) blank = { p, v, r };
    }
    removed.patterns[blank!.p].channels[blank!.v].rows[blank!.r].note = 30;
    // a note-off
    const edited = clone(removed);
    edited.patterns[at.p].channels[at.v].rows[at.r].note = 97;
    for (const s of [removed, edited]) {
      const r = await exportAsFuturePlayer(s);
      expect(r.warnings.length).toBeGreaterThanOrEqual(1);
      const out = new Uint8Array(await r.data.arrayBuffer());
      expect(out.every((b, i) => b === bytes[i])).toBe(true);
    }
  });
});
