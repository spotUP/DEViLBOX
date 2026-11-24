/**
 * Beathoven Synthesizer phase B reachability: the real .bss corpus file goes through the import entry point
 * (parseModuleToSong), the grid is edited, and the native export router (exportNativeSong) writes the module back with
 * the edit patched in place. Sentinel: applyBeathovenGridEdits must have run for every export.
 *
 * Expected bytes come from the format (third-party/nuade/players/beathoven): a note command's first word is the note
 * number, looked up in the period table at (number + note base - origin), so a note edit changes that one 16-bit word
 * (two bytes at most, one in practice); the file length never changes (22264 B for beathoven_smallest.bss).
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { buildBthGrid, bthShownNote, readBthParams, type BthGrid, type BthParams } from '@lib/import/formats/beathovenGrid';

const sentinel = vi.hoisted(() => ({ calls: 0 }));
vi.mock('@lib/import/formats/beathovenEdits', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@lib/import/formats/beathovenEdits')>();
  return { ...orig, applyBeathovenGridEdits: (...a: Parameters<typeof orig.applyBeathovenGridEdits>) => { sentinel.calls++; return orig.applyBeathovenGridEdits(...a); } };
});

const FILE = { path: 'public/data/songs/formats/beathoven_smallest.bss', name: 'beathoven_smallest.bss' };

async function load(bytes?: Uint8Array, file = FILE): Promise<{ raw: Uint8Array; song: TrackerSong }> {
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

const diffAt = (a: Uint8Array, b: Uint8Array): number[] => a.reduce<number[]>((n, x, i) => (x !== b[i] ? [...n, i] : n), []);

describe('Beathoven native export: beathoven_smallest.bss', () => {
  it('exports byte-exact unedited, writes a note edit in place, re-imports it with nothing else moved', async () => {
    const before = sentinel.calls;
    const { raw, song } = await load();
    expect(song.uadeVariableLayout?.formatId).toBe('beathoven');
    const same = await exportOf(song);
    expect(sentinel.calls).toBeGreaterThan(before);
    expect(same.warnings).toEqual([]);
    expect(same.data.length).toBe(22264);
    expect(Array.from(same.data)).toEqual(Array.from(raw));

    const grid = buildBthGrid(raw) as BthGrid;
    const prm = readBthParams(raw) as BthParams;
    // a note word read by exactly one row, so the edit moves one row
    const plays = new Map<number, number>();
    grid.rowSources.forEach((p) => p.forEach((v) => v.forEach((s) => { if (s) plays.set(s.noteOffset, (plays.get(s.noteOffset) ?? 0) + 1); })));
    let pick: { pi: number; voice: number; row: number } | null = null;
    grid.rowSources.forEach((p, pi) => p.forEach((v, voice) => v.forEach((s, row) => {
      if (!pick && s && plays.get(s.noteOffset) === 1) pick = { pi, voice, row };
    })));
    const { pi, voice, row } = pick!;
    const src = grid.rowSources[pi][voice][row]!;
    const cell = song.patterns[pi].channels[voice].rows[row];
    const newNote = bthShownNote(raw, prm, src.noteNum + 1, src.base);
    expect(newNote).toBeGreaterThan(0);
    expect(newNote).not.toBe(cell.note);
    cell.note = newNote;
    const edited = await exportOf(song);
    expect(edited.warnings).toEqual([]);
    expect(edited.data.length).toBe(raw.length);
    const changed = diffAt(raw, edited.data);
    expect(changed.length).toBeGreaterThan(0);
    changed.forEach((i) => expect([src.noteOffset, src.noteOffset + 1]).toContain(i));
    const word = (edited.data[src.noteOffset] << 8) | edited.data[src.noteOffset + 1];
    expect(bthShownNote(raw, prm, word, src.base)).toBe(newNote);

    const again = await load(edited.data);
    grid.patterns.forEach((p, i) => p.channels.forEach((ch, c) => ch.rows.forEach((was, r) => {
      const now = again.song.patterns[i].channels[c].rows[r];
      const expected = i === pi && c === voice && r === row ? newNote : was.note;
      expect([now.note, now.instrument]).toEqual([expected, was.instrument]);
    })));
  }, 240000);

  it('refuses a note on an empty row, a note off, an instrument and a volume edit, writing nothing', async () => {
    const { raw, song } = await load();
    const find = (voice: number, pred: (c: { note: number }) => boolean): { rows: TrackerSong['patterns'][0]['channels'][0]['rows']; at: number } => {
      for (const p of song.patterns) {
        const at = p.channels[voice].rows.findIndex(pred);
        if (at >= 0) return { rows: p.channels[voice].rows, at };
      }
      throw new Error(`no matching row in voice ${voice}`);
    };
    const empty = find(0, (c) => c.note === 0);
    empty.rows[empty.at].note = 40;
    const played = find(1, (c) => c.note > 0 && c.note < 97);
    played.rows[played.at].note = 97;
    const other = find(3, (c) => c.note > 0);
    (other.rows[other.at] as { instrument: number }).instrument += 1;
    song.patterns[0].channels[2].rows[0].volume = 30;
    const res = await exportOf(song);
    expect(res.warnings.length).toBeGreaterThanOrEqual(4);
    expect(res.warnings.join('\n')).toMatch(/not written/);
    expect(Array.from(res.data)).toEqual(Array.from(raw));
  }, 240000);

  it.each([
    FILE,
    { path: 'public/data/songs/formats/tristar_cracktro.bss', name: 'tristar_cracktro.bss' },
  ])('writes an instrument edit as the Instrument command record address another command names ($name)', async (file) => {
    const { applyBeathovenGridEdits } = await import('@lib/import/formats/beathovenEdits');
    const { raw, song } = await load(undefined, file);
    const grid = buildBthGrid(raw) as BthGrid;
    expect(grid.instrumentRecords.length).toBeGreaterThan(1);
    // the first note whose Instrument command can name another instrument without renumbering the instruments
    let pick: { pi: number; voice: number; row: number; at: number; to: number } | null = null;
    grid.rowSources.forEach((p, pi) => p.forEach((v, voice) => v.forEach((s, row) => {
      if (pick || !s || s.instrumentAt < 0) return;
      const cur = grid.patterns[pi].channels[voice].rows[row].instrument;
      for (let to = 1; to <= grid.instrumentRecords.length && !pick; to++) {
        if (to === cur) continue;
        const pats = grid.patterns.map((x) => ({ ...x, channels: x.channels.map((c) => ({ ...c, rows: c.rows.map((r) => ({ ...r })) })) }));
        pats[pi].channels[voice].rows[row].instrument = to;
        const probe = applyBeathovenGridEdits(raw, pats);
        if (probe.warnings.length === 0 && probe.patched > 0) pick = { pi, voice, row, at: s.instrumentAt, to };
      }
    })));
    if (!pick) throw new Error('no Instrument command can be re-pointed in this file');
    const { pi, voice, row, at, to } = pick;
    song.patterns[pi].channels[voice].rows[row].instrument = to;
    const res = await exportOf(song);
    expect(res.warnings.join('\n')).toBe('');
    expect(res.data.length).toBe(raw.length);
    const changed = diffAt(raw, res.data);
    expect(changed.length).toBeGreaterThanOrEqual(1);
    expect(changed.every((i) => i >= at + 2 && i < at + 6)).toBe(true);
    const rec = ((res.data[at + 2] << 24) | (res.data[at + 3] << 16) | (res.data[at + 4] << 8) | res.data[at + 5]) >>> 0;
    expect(rec).toBe(grid.instrumentRecords[to - 1]);
    const again = await load(res.data, file);
    expect(again.song.patterns[pi].channels[voice].rows[row].instrument).toBe(to);
  }, 240000);

  it('extended engine (tristar_cracktro.bss): an effect edit rewrites the command operand byte, same length, reads back', async () => {
    const tri = { path: 'public/data/songs/formats/tristar_cracktro.bss', name: 'tristar_cracktro.bss' };
    const { raw, song } = await load(undefined, tri);
    const grid = buildBthGrid(raw) as BthGrid;
    // the first effect slot whose operand byte can be edited in place
    let pick: { pi: number; voice: number; row: number; slot: number; at: number } | null = null;
    grid.rowSources.forEach((p, pi) => p.forEach((v, voice) => v.forEach((s, row) => {
      const slot = s?.effects.findIndex((e) => e.at >= 0) ?? -1;
      if (!pick && s && slot >= 0) pick = { pi, voice, row, slot, at: s.effects[slot].at };
    })));
    if (!pick) throw new Error('no editable effect command in this file');
    const { pi, voice, row, slot, at } = pick;
    const cell = song.patterns[pi].channels[voice].rows[row] as unknown as Record<string, number>;
    const key = (['eff', 'eff2', 'eff3', 'eff4'] as const)[slot];
    const value = raw[at] ^ 1;
    cell[key] = value;
    const res = await exportOf(song);
    expect(res.warnings.join('\n')).toBe('');
    expect(res.data.length).toBe(raw.length);
    expect(diffAt(raw, res.data)).toEqual([at]);
    expect(res.data[at]).toBe(value);
    const again = await load(res.data, tri);
    expect((again.song.patterns[pi].channels[voice].rows[row] as unknown as Record<string, number>)[key]).toBe(value);
  }, 240000);

  it('writes a removed note as the legacy Rest command: same four bytes, the row reads back empty', async () => {
    const { raw, song } = await load();
    // a plain note command (not the legacy arpeggio, whose note word is not the command word)
    const grid = buildBthGrid(raw);
    if (typeof grid === 'string') throw new Error(grid);
    let hit: { rows: TrackerSong['patterns'][0]['channels'][0]['rows']; at: number } | undefined;
    grid.rowSources.forEach((pat, pi) => pat.forEach((voice, c) => voice.forEach((src, r) => {
      if (!hit && src && src.noteOffset === src.offset) hit = { rows: song.patterns[pi].channels[c].rows, at: r };
    })));
    if (!hit) throw new Error('no plain note in the file');
    hit.rows[hit.at].note = 0;
    const res = await exportOf(song);
    const changed = diffAt(raw, res.data);
    expect(res.data.length).toBe(raw.length);
    expect(res.warnings.join('\n')).toBe('');
    expect(changed.length).toBeGreaterThanOrEqual(1);
    expect(changed.length).toBeLessThanOrEqual(2);
    const word = (at: number): number => (res.data[at] << 8) | res.data[at + 1];
    expect(word(changed[0] & ~1)).toBe(0x82);
    const notes = (x: TrackerSong): number => x.patterns.flatMap((p) => p.channels.flatMap((c) => c.rows)).filter((c) => c.note > 0 && c.note < 97).length;
    const before = notes((await load()).song);
    const again = await load(res.data);
    expect(notes(again.song)).toBeLessThan(before); // a stream is shared by every place that plays it
  }, 240000);

  it('extended engine (tristar_cracktro.bss): a removed note is written as the Hold command, same four bytes', async () => {
    const tri = { path: 'public/data/songs/formats/tristar_cracktro.bss', name: 'tristar_cracktro.bss' };
    const { raw, song } = await load(undefined, tri);
    const grid = buildBthGrid(raw);
    if (typeof grid === 'string') throw new Error(grid);
    let hit: { rows: TrackerSong['patterns'][0]['channels'][0]['rows']; at: number; src: number } | undefined;
    grid.rowSources.forEach((pat, pi) => pat.forEach((voice, c) => voice.forEach((src, r) => {
      if (!hit && src && src.noteOffset === src.offset) hit = { rows: song.patterns[pi].channels[c].rows, at: r, src: src.offset };
    })));
    if (!hit) throw new Error('no plain note in the file');
    const before = song.patterns.flatMap((p) => p.channels.flatMap((c) => c.rows)).filter((c) => c.note > 0 && c.note < 97).length;
    hit.rows[hit.at].note = 0;
    const res = await exportOf(song);
    expect(res.warnings.join('\n')).toBe('');
    expect(res.data.length).toBe(raw.length);
    const changed = diffAt(raw, res.data);
    expect(changed.length).toBeGreaterThanOrEqual(1);
    expect(changed.length).toBeLessThanOrEqual(2);
    expect((res.data[hit.src] << 8) | res.data[hit.src + 1]).toBe(0x83);
    const notes = (x: TrackerSong): number => x.patterns.flatMap((p) => p.channels.flatMap((c) => c.rows)).filter((c) => c.note > 0 && c.note < 97).length;
    const again = await load(res.data, tri);
    expect(notes(again.song)).toBeLessThan(before); // the removed note (and every play of its stream) reads empty
  }, 240000);

  it('writes a lower arpeggio count by dropping note numbers in place: same length, relocations lowered, reads back; a higher count is refused', async () => {
    const { raw, song } = await load();
    const grid = buildBthGrid(raw) as BthGrid;
    const ARP = 1283; // BTH_FX.arpeggio
    let hit: { pi: number; voice: number; row: number; src: number; key: string; count: number } | undefined;
    grid.rowSources.forEach((pat, pi) => pat.forEach((v, voice) => v.forEach((s, row) => {
      const cell = grid.patterns[pi].channels[voice].rows[row] as unknown as Record<string, number>;
      const slot = (['effTyp', 'effTyp2', 'effTyp3', 'effTyp4'] as const).findIndex((k) => cell[k] === ARP);
      const key = (['eff', 'eff2', 'eff3', 'eff4'] as const)[slot];
      if (!hit && s && s.noteOffset !== s.offset && slot >= 0 && cell[key] >= 2) hit = { pi, voice, row, src: s.offset, key, count: cell[key] };
    })));
    if (!hit) throw new Error('no arpeggio with two or more note numbers in the file');
    const { pi, voice, row, src, key, count } = hit;
    const cellOf = (s: TrackerSong): Record<string, number> => s.patterns[pi].channels[voice].rows[row] as unknown as Record<string, number>;

    cellOf(song)[key] = count + 1;
    const up = await exportOf(song);
    expect(up.warnings.join('\n')).toMatch(/only drop note numbers/);
    expect(Array.from(up.data)).toEqual(Array.from(raw));

    cellOf(song)[key] = count - 1;
    const res = await exportOf(song);
    expect(res.warnings.join('\n')).toBe('');
    expect(res.data.length).toBe(raw.length);
    expect((res.data[src + 4] << 8) | res.data[src + 5]).toBe(count - 1);
    // the code hunk's relocations: same count, any in the moved bytes two lower
    const be = (b: Uint8Array, o: number): number => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
    const relocs = (b: Uint8Array): number[] => {
      const out: number[] = [];
      let ro = 0x20 + be(b, 28) * 4;
      if (be(b, ro) !== 0x3ec) return out;
      for (ro += 4; be(b, ro) !== 0; ro += 8 + 4 * be(b, ro)) for (let i = 0; i < be(b, ro); i++) out.push(be(b, ro + 8 + 4 * i));
      return out;
    };
    const stream = grid.streams[grid.rowSources[pi][voice][row]!.stream];
    const moved = relocs(raw).map((r) => (r + 0x20 >= src + 2 * count + 6 && r + 0x20 < stream.offset + stream.size + 2 ? r - 2 : r));
    expect(relocs(res.data)).toEqual(moved);

    const again = await load(res.data);
    expect(cellOf(again.song)[key]).toBe(count - 1);
    grid.patterns.forEach((p, i) => p.channels.forEach((ch, c) => ch.rows.forEach((was, r) => {
      if (grid.rowSources[i][c][r]?.offset === src) return; // plays the edited command
      const now = again.song.patterns[i].channels[c].rows[r];
      expect([now.note, now.instrument, now.effTyp, now.eff]).toEqual([was.note, was.instrument, was.effTyp, was.eff]);
    })));
  }, 240000);
});
