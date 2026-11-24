/**
 * Howie Davies phase B reachability: the real .hd corpus file go through the import entry point (parseModuleToSong), the
 * grid is edited, and the native export router (exportNativeSong) writes the module back with the edit patched in
 * place. Sentinel: applyHowieDaviesGridEdits must have run for every export.
 *
 * Expected bytes come from the format: a pattern note byte (below 0x80) is a period table index, so a note edit changes
 * that one byte; the file length never changes (92244 B for blazing_thunder.hd).
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { buildHowieDaviesGrid, type HowieDaviesGrid } from '@lib/import/formats/howieDaviesGrid';

const sentinel = vi.hoisted(() => ({ calls: 0 }));
vi.mock('@lib/import/formats/howieDaviesEdits', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@lib/import/formats/howieDaviesEdits')>();
  return { ...orig, applyHowieDaviesGridEdits: (...a: Parameters<typeof orig.applyHowieDaviesGridEdits>) => { sentinel.calls++; return orig.applyHowieDaviesGridEdits(...a); } };
});

const FILES = [
  { path: 'public/data/songs/formats/blazing_thunder.hd', name: 'blazing_thunder.hd' },
];

async function load(file: { path: string; name: string }, bytes?: Uint8Array): Promise<{ raw: Uint8Array; song: TrackerSong }> {
  const { parseModuleToSong } = await import('@lib/import/parseModuleToSong');
  const raw = new Uint8Array(readFileSync(join(process.cwd(), file.path)));
  const song = await parseModuleToSong(new File([new Uint8Array(bytes ?? raw)], file.name));
  return { raw, song };
}

async function exportOf(song: TrackerSong) {
  const { exportNativeSong } = await import('@lib/export/nativeExportRouter');
  const res = await exportNativeSong(song);
  if (!res) throw new Error('no native export');
  return res;
}

const diffCount = (a: Uint8Array, b: Uint8Array): number => a.reduce((n, x, i) => n + (x !== b[i] ? 1 : 0), 0);

/** The first voice and row that has a source of the given kind. */
function first(g: HowieDaviesGrid, key: 'noteAt' | 'instrumentAt'): { voice: number; row: number } | null {
  for (let voice = 0; voice < 4; voice++) {
    const row = g.sources[voice].findIndex((s) => !!s && s[key] >= 0);
    if (row >= 0) return { voice, row };
  }
  return null;
}

describe.each(FILES)('Howie Davies native export: $name', (file) => {
  it('exports byte-exact unedited, writes a note edit in place, re-imports it with nothing else moved', async () => {
    const before = sentinel.calls;
    const { raw, song } = await load(file);
    expect(song.uadeVariableLayout?.formatId).toBe('howieDavies');
    const same = await exportOf(song);
    expect(sentinel.calls).toBeGreaterThan(before);
    expect(same.warnings).toEqual([]);
    expect(same.data.length).toBe(92244);
    expect(Array.from(same.data)).toEqual(Array.from(raw));

    const grid = buildHowieDaviesGrid(raw) as HowieDaviesGrid;
    const at = first(grid, 'noteAt')!;
    const { voice, row } = at;
    const src = grid.sources[voice][row]!;
    const cell = song.patterns[Math.floor(row / 64)].channels[voice].rows[row % 64];
    const newNote = grid.noteForByte(raw[src.noteAt] + 1);
    expect(newNote).not.toBe(cell.note);
    cell.note = newNote;
    const edited = await exportOf(song);
    expect(edited.warnings).toEqual([]);
    expect(edited.data.length).toBe(raw.length);
    expect(diffCount(raw, edited.data)).toBe(1);
    const newByte = edited.data[src.noteAt];
    expect(grid.noteForByte(newByte)).toBe(newNote);

    // the one byte plays wherever its pattern plays; every other row is unchanged
    const again = await load(file, edited.data);
    grid.patterns.forEach((p, pi) => p.channels.forEach((ch, c) => ch.rows.forEach((was, r) => {
      const now = again.song.patterns[pi].channels[c].rows[r];
      const s = grid.sources[c][pi * 64 + r];
      const expected = s && s.noteAt === src.noteAt ? grid.noteForByte(newByte) : was.note;
      expect([now.note, now.instrument]).toEqual([expected, was.instrument]);
    })));
  }, 240000);

  it('writes an instrument edit into the Instrument operand byte that chose it', async () => {
    const { raw, song } = await load(file);
    const grid = buildHowieDaviesGrid(raw) as HowieDaviesGrid;
    const at = first(grid, 'instrumentAt');
    if (!at) return; // no Instrument operand byte in this song
    const { voice, row } = at;
    const src = grid.sources[voice][row]!;
    const cell = song.patterns[Math.floor(row / 64)].channels[voice].rows[row % 64];
    const target = cell.instrument === 1 ? 2 : 1;
    cell.instrument = target;
    const res = await exportOf(song);
    expect(res.warnings).toEqual([]);
    expect(diffCount(raw, res.data)).toBe(1);
    expect(res.data[src.instrumentAt]).toBe(target - 1);
    const again = await load(file, res.data);
    grid.patterns.forEach((p, pi) => p.channels.forEach((ch, c) => ch.rows.forEach((was, r) => {
      const now = again.song.patterns[pi].channels[c].rows[r];
      const s = grid.sources[c][pi * 64 + r];
      expect([now.note, now.instrument]).toEqual([was.note, s && s.instrumentAt === src.instrumentAt ? target : was.instrument]);
    })));
  }, 240000);

  it('writes a removed note as the Delay command over the note byte (same two bytes), refuses a volume edit', async () => {
    const { raw, song } = await load(file);
    const grid = buildHowieDaviesGrid(raw) as HowieDaviesGrid;
    const rows = song.patterns[0].channels[0].rows;
    // a row with no effect shown: a Speed or Maximum Volume command shows on the next note's row, so removing its note would move it
    const played = rows.findIndex((c) => c.note > 0 && c.note < 97 && !c.effTyp && !c.effTyp2);
    expect(played).toBeGreaterThanOrEqual(0);
    const src = grid.sources[0][played]!;
    rows[played].note = 0;
    song.patterns[0].channels[1].rows[0].volume = 30;
    const res = await exportOf(song);
    expect(res.warnings.join('\n')).toMatch(/volume column/);
    expect(res.warnings.join('\n')).not.toMatch(/removed/);
    expect(res.data.length).toBe(raw.length);
    expect(diffCount(raw, res.data)).toBe(1);
    expect(res.data[src.noteAt]).toBe(grid.delayByte);
    const again = await load(file, res.data);
    expect(again.song.patterns[0].channels[0].rows[played].note).toBe(0);
  }, 240000);

  it('writes a note on a blank row, growing the pattern, and reloads it there with the length of the song kept', async () => {
    const { raw, song } = await load(file);
    const g0 = buildHowieDaviesGrid(raw);
    if (typeof g0 === 'string') throw new Error(g0);
    const rows = song.patterns[0].channels[0].rows;
    const note = rows.find((c) => c.note > 0 && c.note < 97)?.note ?? 40;
    let written: Uint8Array | null = null;
    let at = -1;
    for (let c = 0; c < 4 && !written; c++) {
      for (let r = 1; r < song.patterns[0].channels[c].rows.length && !written; r++) {
        if (song.patterns[0].channels[c].rows[r].note !== 0) continue;
        const { song: s } = await load(file);
        s.patterns[0].channels[c].rows[r].note = note;
        const res = await exportOf(s);
        if (res.warnings.length === 0 && res.data.length > raw.length) { written = res.data; at = c * 1000 + r; }
      }
    }
    expect(written, 'some blank row takes a note').not.toBeNull();
    const [c, r] = [Math.floor(at / 1000), at % 1000];
    const g1 = buildHowieDaviesGrid(written as Uint8Array);
    if (typeof g1 === 'string') throw new Error(g1);
    expect(g1.rows).toBe(g0.rows);
    expect(g1.patterns[0].channels[c].rows[r].note).toBe(note);
  }, 240000);

  it('writes a note with another instrument on a blank row through Instrument commands, every older note keeping its own', async () => {
    const { raw } = await load(file);
    const g0 = buildHowieDaviesGrid(raw);
    if (typeof g0 === 'string') throw new Error(g0);
    let tried = 0;
    const seen: string[] = [];
    let done: { data: Uint8Array; c: number; r: number; inst: number } | null = null;
    for (let c = 0; c < 4 && !done; c++) {
      for (let r = 1; r < 64 && !done && tried < 12; r++) {
        const cov = g0.covers[c][r];
        if (!cov || cov.stream < 0 || g0.patterns[0].channels[c].rows[r].note !== 0 || cov.instrument < 0) continue;
        tried++;
        const { song: s } = await load(file);
        const cell = s.patterns[0].channels[c].rows[r];
        cell.note = 40;
        cell.instrument = cov.instrument + 2;
        const res = await exportOf(s);
        seen.push(`${c}/${r} inst ${cov.instrument}: ${res.warnings.join('|')} ${res.data.length}`);
        if (res.warnings.length === 0 && res.data.length > raw.length) done = { data: res.data, c, r, inst: cell.instrument };
      }
    }
    expect(done, seen.join('\n')).not.toBeNull();
    const g1 = buildHowieDaviesGrid((done as { data: Uint8Array }).data);
    if (typeof g1 === 'string') throw new Error(g1);
    const { c, r, inst } = done as { c: number; r: number; inst: number };
    expect(g1.rows).toBe(g0.rows);
    expect(g1.patterns[0].channels[c].rows[r].note).toBe(40);
    expect(g1.patterns[0].channels[c].rows[r].instrument).toBe(inst);
    g0.patterns.forEach((p, pi) => p.channels.forEach((ch, ci) => ch.rows.forEach((x, ri) => {
      const y = g1.patterns[pi].channels[ci].rows[ri];
      if (x.note === 0 && y.note > 0) return; // the new note, and its copies where the pattern is shared
      if (x.note !== y.note || x.instrument !== y.instrument) throw new Error(`cell ${pi}/${ci}/${ri} moved`);
    })));
  }, 240000);
});
