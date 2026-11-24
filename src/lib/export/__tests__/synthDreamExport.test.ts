/**
 * SynthDream phase B reachability: an sdr. file goes through the app's import entry point (parseModuleToSong), the
 * grid is edited, and the native export router (exportNativeSong) writes the module back with the edit patched in
 * place. Sentinel: applySdrGridEdits must have run for every export. Both corpus files.
 *
 * Expected byte results are derived from the format, not from the code under test: a note edit changes one 16-bit
 * note word (low byte), an instrument edit one instrument word, the file length never changes (synthdream.c reads the
 * words in place; a longer stream would move every later offset).
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const sentinel = vi.hoisted(() => ({ calls: 0 }));
vi.mock('@lib/import/formats/synthDreamEdits', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@lib/import/formats/synthDreamEdits')>();
  return { ...orig, applySdrGridEdits: (...a: Parameters<typeof orig.applySdrGridEdits>) => { sentinel.calls++; return orig.applySdrGridEdits(...a); } };
});

const FILES = ['sdr.monsterbusiness_5', 'sdr.nobuddiesland_jigsaw'];

async function load(name: string, bytes?: Uint8Array): Promise<{ raw: Uint8Array; song: TrackerSong }> {
  const { parseModuleToSong } = await import('@lib/import/parseModuleToSong');
  const raw = new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs/formats', name)));
  const song = await parseModuleToSong(new File([new Uint8Array(bytes ?? raw)], name));
  return { raw, song };
}

/** First note cell of voice 0 that is a plain note (not a rest). */
function firstNote(song: TrackerSong): { p: number; r: number } {
  for (let p = 0; p < song.patterns.length; p++) {
    const rows = song.patterns[p].channels[0].rows;
    for (let r = 0; r < rows.length; r++) if (rows[r].note >= 20 && rows[r].note <= 90) return { p, r };
  }
  throw new Error('no note');
}

async function exportOf(song: TrackerSong) {
  const { exportNativeSong } = await import('@lib/export/nativeExportRouter');
  const res = await exportNativeSong(song);
  if (!res) throw new Error('no native export');
  return res;
}

describe.each(FILES)('SynthDream native export: %s', (name) => {
  it('exports byte-exact unedited, writes a note edit in place, re-imports it', async () => {
    const before = sentinel.calls;
    const { raw, song } = await load(name);
    expect(song.uadeVariableLayout?.formatId).toBe('synthDream');

    const same = await exportOf(song);
    expect(sentinel.calls).toBeGreaterThan(before);
    expect(same.warnings).toEqual([]);
    expect(Array.from(same.data)).toEqual(Array.from(raw));

    const { p, r } = firstNote(song);
    const cell = song.patterns[p].channels[0].rows[r];
    const old = cell.note;
    cell.note = old + 2;
    const edited = await exportOf(song);
    expect(edited.warnings).toEqual([]);
    expect(edited.data.length).toBe(raw.length);
    const changed = raw.reduce((n, b, i) => n + (b !== edited.data[i] ? 1 : 0), 0);
    expect(changed).toBeGreaterThanOrEqual(1);
    expect(changed).toBeLessThanOrEqual(2); // one note word, low byte (plus at most the high byte of the same word)

    const again = await load(name, edited.data);
    expect(again.song.patterns[p].channels[0].rows[r].note).toBe(old + 2);
  });

  it('writes a removed note as a rest command (duration, rest), the stream moving to the file end; reload reads the note off, other cells unmoved', async () => {
    const { raw, song } = await load(name);
    // first plain note of any voice whose removal the module can hold (shared streams and other command forms refuse)
    let hit: { p: number; c: number; r: number; res: Awaited<ReturnType<typeof exportOf>> } | null = null;
    outer: for (let p = 0; p < song.patterns.length; p++) for (let c = 0; c < song.patterns[p].channels.length; c++) {
      const rows = song.patterns[p].channels[c].rows;
      for (let r = 0; r < rows.length; r++) {
        if (rows[r].note < 13 || rows[r].note > 96) continue;
        const s = (await load(name)).song;
        s.patterns[p].channels[c].rows[r].note = 0;
        const res = await exportOf(s);
        if (res.warnings.length === 0) { hit = { p, c, r, res }; break outer; }
      }
    }
    if (!hit) { expect(name).toBe('sdr.monsterbusiness_5'); return; } // its first notes sit in shared streams: refused whole, as any removal that would move other rows
    expect(hit.res.data.length).toBeGreaterThan(raw.length);
    const again = await load(name, hit.res.data);
    expect(again.song.patterns[hit.p].channels[hit.c].rows[hit.r].note).toBe(97);
    again.song.patterns.forEach((pat, pi) => pat.channels.forEach((ch, ci) => ch.rows.forEach((cell, ri) => {
      if (pi === hit!.p && ci === hit!.c && ri === hit!.r) return;
      expect(cell.note).toBe(song.patterns[pi].channels[ci].rows[ri].note);
    })));
  });

  it('puts a note on a row inside a held command by cutting it: the stream moves to the file end and reloads with the note', async () => {
    const { raw, song } = await load(name);
    const { p, r } = firstNote(song);
    const rows = song.patterns[p].channels[0].rows;
    const empty = rows.findIndex((c, i) => i > r && c.note === 0);
    expect(empty).toBeGreaterThan(0);
    rows[empty].note = 40;
    const res = await exportOf(song);
    if (res.warnings.length === 0) {
      expect(res.data.length).toBeGreaterThan(raw.length);
      const again = await load(name, res.data);
      expect(again.song.patterns[p].channels[0].rows[empty].note).toBe(40);
    } else {
      expect(Array.from(res.data)).toEqual(Array.from(raw)); // refused whole when the cut would move other rows
    }
  });
});

describe('SynthDream blank-row note with another instrument', () => {
  it('writes the note with the typed instrument on a held row (duration, note, instrument command) and reloads it; reverting the instrument branch fails this', async () => {
    let written = 0;
    for (const name of FILES) {
      const { song: base } = await load(name);
      const { p, r } = firstNote(base);
      const was = base.patterns[p].channels[0].rows[r].instrument;
      const empty = base.patterns[p].channels[0].rows.findIndex((c, i) => i > r && c.note === 0);
      for (const inst of [1, 2, 3, 4, 5, 6]) {
        if (inst === was) continue;
        const { song } = await load(name);
        const cell = song.patterns[p].channels[0].rows[empty];
        cell.note = 40; cell.instrument = inst;
        const res = await exportOf(song);
        if (res.warnings.length) continue;
        const again = (await load(name, res.data)).song.patterns[p].channels[0].rows[empty];
        expect([again.note, again.instrument]).toEqual([40, inst]);
        written++;
      }
    }
    expect(written).toBeGreaterThan(0);
  });
});

describe('SynthDream instrument edit', () => {
  it('writes an instrument change into the instrument word, or refuses it when the replayer would sound it differently', async () => {
    const { raw, song } = await load('sdr.monsterbusiness_5');
    const { p, r } = firstNote(song);
    const cell = song.patterns[p].channels[0].rows[r];
    let written = 0;
    for (const candidate of [1, 2, 3, 4, 5, 6, 7, 8]) {
      if (candidate === cell.instrument) continue;
      const s = (await load('sdr.monsterbusiness_5')).song;
      s.patterns[p].channels[0].rows[r].instrument = candidate;
      const res = await exportOf(s);
      if (res.warnings.length === 0) {
        written++;
        expect(res.data.length).toBe(raw.length);
        const again = await load('sdr.monsterbusiness_5', res.data);
        expect(again.song.patterns[p].channels[0].rows[r].instrument).toBe(candidate);
        expect(again.song.patterns[p].channels[0].rows[r].note).toBe(cell.note);
      } else {
        expect(Array.from(res.data)).toEqual(Array.from(raw));
      }
    }
    expect(written).toBeGreaterThan(0);
  });
});
