/**
 * Dynamic Synthesizer phase B reachability: dns.ptc goes through the import entry point (parseModuleToSong), the grid
 * is edited, and the native export router (exportNativeSong) writes the module back with the edit patched in place.
 * Sentinel: applyDnsGridEdits must have run for every export.
 *
 * Expected bytes come from the format: a pattern word is note << 8 | sample, so a note edit changes one word's high
 * byte and an instrument edit its low nibble; the file length never changes (a longer pattern would move the tables).
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const sentinel = vi.hoisted(() => ({ calls: 0 }));
vi.mock('@lib/import/formats/dynamicSynthesizerEdits', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@lib/import/formats/dynamicSynthesizerEdits')>();
  return { ...orig, applyDnsGridEdits: (...a: Parameters<typeof orig.applyDnsGridEdits>) => { sentinel.calls++; return orig.applyDnsGridEdits(...a); } };
});

const NAME = 'dns.ptc';

async function load(bytes?: Uint8Array): Promise<{ raw: Uint8Array; song: TrackerSong }> {
  const { parseModuleToSong } = await import('@lib/import/parseModuleToSong');
  const raw = new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs/formats', NAME)));
  const song = await parseModuleToSong(new File([new Uint8Array(bytes ?? raw)], NAME));
  return { raw, song };
}

async function exportOf(song: TrackerSong) {
  const { exportNativeSong } = await import('@lib/export/nativeExportRouter');
  const res = await exportNativeSong(song);
  if (!res) throw new Error('no native export');
  return res;
}

describe('Dynamic Synthesizer native export', () => {
  it('exports byte-exact unedited, writes a note and an instrument edit in place, re-imports them', async () => {
    const before = sentinel.calls;
    const { raw, song } = await load();
    expect(song.uadeVariableLayout?.formatId).toBe('dynamicSynthesizer');

    const same = await exportOf(song);
    expect(sentinel.calls).toBeGreaterThan(before);
    expect(same.warnings).toEqual([]);
    expect(Array.from(same.data)).toEqual(Array.from(raw));

    // voice 1 row 0 of position 0 plays note 28, instrument 0 (import route test); row 6 replays the same pattern word
    const cell = song.patterns[0].channels[0].rows[0];
    expect([cell.note, cell.instrument]).toEqual([28, 0]);
    cell.note = 30;
    const edited = await exportOf(song);
    expect(edited.warnings).toEqual([]);
    expect(edited.data.length).toBe(raw.length);
    const changed = raw.reduce((n, b, i) => n + (b !== edited.data[i] ? 1 : 0), 0);
    expect(changed).toBe(1); // the high byte of one pattern word
    const again = await load(edited.data);
    expect(again.song.patterns[0].channels[0].rows[0].note).toBe(30);
    expect(again.song.patterns[0].channels[0].rows[0].instrument).toBe(0);

    // instrument: the low nibble of the same word
    const s2 = (await load()).song;
    s2.patterns[0].channels[0].rows[0].instrument = 5;
    const inst = await exportOf(s2);
    expect(inst.warnings).toEqual([]);
    expect(inst.data.length).toBe(raw.length);
    const again2 = await load(inst.data);
    expect(again2.song.patterns[0].channels[0].rows[0].instrument).toBe(5);
    expect(again2.song.patterns[0].channels[0].rows[0].note).toBe(28);
  }, 240000); // the first parseModuleToSong import loads the whole import graph

  it('writes a note removed and a note off as one word, same length, and reloads them', async () => {
    const { raw, song } = await load();
    const rows = song.patterns[0].channels[0].rows;
    const notes = rows.map((c, i) => (c.note >= 1 && c.note < 97 ? i : -1)).filter((i) => i >= 0);
    expect(notes.length).toBeGreaterThan(1);
    rows[notes[0]].note = 0;
    rows[notes[1]].note = 97;
    const res = await exportOf(song);
    expect(res.warnings).toEqual([]);
    expect(res.data.length).toBe(raw.length);
    const again = (await load(res.data)).song.patterns[0].channels[0].rows;
    expect(again[notes[0]].note).toBe(0);
    expect(again[notes[1]].note).toBe(97);
  }, 240000);

  it('writes a note on an empty row in place and reloads it', async () => {
    const { raw, song } = await load();
    const rows = song.patterns[0].channels[0].rows;
    const empty = rows.findIndex((c, i) => i > 0 && c.note === 0);
    expect(empty).toBeGreaterThan(0);
    rows[empty].note = 40;
    const res = await exportOf(song);
    expect(res.warnings).toEqual([]);
    expect(res.data.length).toBe(raw.length);
    const again = await load(res.data);
    expect(again.song.patterns[0].channels[0].rows[empty].note).toBe(40);
  });
});
