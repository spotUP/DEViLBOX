/**
 * Music Assembler: a grid edit is a byte patch of the track event the cell was drawn from (U8, byte-exact carriers).
 *
 * Through the product's own export (exportAsMusicAssembler over a song from parseMusicAssemblerFile):
 *  - an unedited song exports the module byte for byte;
 *  - a changed note patches its event's note byte (one byte), and re-importing the export shows the typed note on
 *    that cell, with every other cell unchanged except the cells that replay the same event (a shared track);
 *  - a changed instrument patches the instrument byte of an instrument+note event, the note keeps its pitch under
 *    the new instrument's wave rate, and re-importing shows the new instrument;
 *  - an edit that needs a longer event (a note on a blank row, a removed note, a note-off, an instrument on a note
 *    event that carries none) is a warning and writes nothing.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { MA_FILES } from './maOracle';
import { parseMusicAssemblerFile } from '@/lib/import/formats/MusicAssemblerParser';
import { loadMaModule } from '@/lib/import/formats/maModule';
import { walkMusicAssembler } from '@/lib/import/formats/maWalk';
import { buildMaGridFromWalk } from '@/lib/import/formats/maGrid';
import { exportAsMusicAssembler } from '@/lib/export/MusicAssemblerExporter';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const clone = (s: TrackerSong): TrackerSong => ({ ...s, patterns: s.patterns.map((p) => ({ ...p, channels: p.channels.map((c) => ({ ...c, rows: c.rows.map((r) => ({ ...r })) })) })) });
async function bytesOf(s: TrackerSong): Promise<{ data: Uint8Array; warnings: string[] }> {
  const r = await exportAsMusicAssembler(s);
  return { data: new Uint8Array(await r.data.arrayBuffer()), warnings: r.warnings };
}

describe.each(MA_FILES.map((f) => [f.split('/').pop()!, f] as const))('Music Assembler grid edits: %s', (name, file) => {
  const bytes = new Uint8Array(readFileSync(file));
  const song = parseMusicAssemblerFile(bytes, name) as TrackerSong;
  const m = loadMaModule(bytes)!;
  const grid = buildMaGridFromWalk(walkMusicAssembler(m, 0)!, m);

  /** The first note cell with a source whose event is of the asked kind (instrument+note, or a plain note), and a note a semitone up exists; `shifted` asks for a position transpose. */
  function find(withInstrumentByte: boolean, shifted = false): { p: number; v: number; r: number } | null {
    for (let p = 0; p < grid.cellSources.length; p++) for (let v = 0; v < 4; v++) for (let r = 0; r < grid.cellSources[p][v].length; r++) {
      const s = grid.cellSources[p][v][r];
      if (!s) continue;
      const b0 = m.tracks[s.track]![s.trackOffset];
      const has = (b0 & 0xc0) === 0xc0;
      const cell = song.patterns[p].channels[v].rows[r];
      if (has === withInstrumentByte && cell.note > 1 && cell.note < 40 && cell.instrument > 0 && (!shifted || s.transpose !== 0)) return { p, v, r };
    }
    return null;
  }

  it('an unedited song exports the module byte for byte', async () => {
    const { data, warnings } = await bytesOf(song);
    expect(data.length).toBe(bytes.length);
    expect(data.every((b, i) => b === bytes[i])).toBe(true);
    expect(warnings).toEqual([]);
  });

  it('a changed note patches its event\'s note byte, and re-importing shows the typed note on every cell of that event only', async () => {
    // a cell under a position transpose proves the byte is the table index minus the transpose (and the instrument's wave rate)
    const at = find(true, true) ?? find(false, true) ?? find(true) ?? find(false)!;
    if (name === 'thanatos.ma') expect(grid.cellSources[at.p][at.v][at.r]!.transpose, 'a transposed cell is tested').not.toBe(0);
    const src = grid.cellSources[at.p][at.v][at.r]!;
    const edited = clone(song);
    const cell = edited.patterns[at.p].channels[at.v].rows[at.r];
    const was = cell.note;
    cell.note = was + 1;
    const { data, warnings } = await bytesOf(edited);
    expect(warnings).toEqual([]);
    expect(data.reduce((n, b, i) => n + (b !== bytes[i] ? 1 : 0), 0), 'one byte, the event\'s note byte').toBe(1);
    const re = parseMusicAssemblerFile(data, name) as TrackerSong;
    expect(re.gridUnmatchedReason).toBeUndefined();
    expect(re.patterns[at.p].channels[at.v].rows[at.r].note, 'the typed note').toBe(was + 1);
    let sharing = 0;
    for (let p = 0; p < song.patterns.length; p++) for (let v = 0; v < 4; v++) for (let row = 0; row < song.patterns[p].length; row++) {
      const a = song.patterns[p].channels[v].rows[row], b = re.patterns[p].channels[v].rows[row];
      const s2 = grid.cellSources[p][v][row];
      const same = s2 !== null && s2.track === src.track && s2.trackOffset === src.trackOffset;
      if (same) { sharing++; expect(b.note, `cell of the same event at ${p}/${v}/${row}`).toBe(a.note + 1); } else expect(b.note, `cell at ${p}/${v}/${row}`).toBe(a.note);
      expect(b.instrument).toBe(a.instrument);
    }
    expect(sharing).toBeGreaterThanOrEqual(1);
  });

  it('a changed instrument patches the instrument byte and the note keeps its pitch under the new instrument', async () => {
    const at = find(true);
    expect(at, 'an instrument+note event with a note a semitone up').not.toBeNull();
    if (!at) return;
    const src = grid.cellSources[at.p][at.v][at.r]!;
    const edited = clone(song);
    const cell = edited.patterns[at.p].channels[at.v].rows[at.r];
    const was = cell.instrument;
    const to = song.instruments.find((i) => i.id !== was && i.id <= 64)!.id;
    cell.instrument = to;
    const { data, warnings } = await bytesOf(edited);
    expect(warnings).toEqual([]);
    const changed = data.reduce((n, b, i) => n + (b !== bytes[i] ? 1 : 0), 0);
    expect(changed).toBeGreaterThanOrEqual(1);
    expect(changed).toBeLessThanOrEqual(2);
    const re = parseMusicAssemblerFile(data, name) as TrackerSong;
    const after = re.patterns[at.p].channels[at.v].rows[at.r];
    expect(after.instrument, 'the new instrument').toBe(to);
    expect(after.note, 'the same pitch').toBe(song.patterns[at.p].channels[at.v].rows[at.r].note);
    void src;
  });

  it('an edit that needs a longer event is a warning and writes nothing', async () => {
    const at = find(false) ?? find(true)!;
    const removed = clone(song);
    removed.patterns[at.p].channels[at.v].rows[at.r].note = 0;
    let blank: { p: number; v: number; r: number } | null = null;
    for (let p = 0; p < grid.cellSources.length && !blank; p++) for (let v = 0; v < 4 && !blank; v++) for (let r = 0; r < grid.cellSources[p][v].length && !blank; r++) {
      if (!grid.cellSources[p][v][r] && song.patterns[p].channels[v].rows[r].note === 0) blank = { p, v, r };
    }
    removed.patterns[blank!.p].channels[blank!.v].rows[blank!.r].note = 30;
    const noteOff = clone(removed);
    noteOff.patterns[at.p].channels[at.v].rows[at.r].note = 97;
    for (const s of [removed, noteOff]) {
      const { data, warnings } = await bytesOf(s);
      expect(warnings.length).toBeGreaterThanOrEqual(1);
      expect(data.every((b, i) => b === bytes[i])).toBe(true);
    }
    // an instrument on a plain note event (no instrument byte)
    const plain = find(false);
    if (plain) {
      const e = clone(song);
      e.patterns[plain.p].channels[plain.v].rows[plain.r].instrument = e.patterns[plain.p].channels[plain.v].rows[plain.r].instrument === 1 ? 2 : 1;
      const { data, warnings } = await bytesOf(e);
      expect(warnings.some((w) => /carries no instrument/.test(w))).toBe(true);
      expect(data.every((b, i) => b === bytes[i])).toBe(true);
    }
  });
});
