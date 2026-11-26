/**
 * A Dave Lowe grid edit reaches the chip RAM UADE plays from (owner, 2026-11-23).
 *
 * Dave Lowe (.dl, .dln) plays on UADE; its grid is the byte-exact blockRows carrier of the command stream.
 * The live route (applyEditedModuleToChipRam -> the format's exporter -> writeEditedModuleLive) must put the
 * edited bytes into the module UADE has in chip RAM, at the module's load address, and nowhere else.
 * The exporter is the real exportDaveLowe; only the store lookup in nativeExportRouter is replaced by the song.
 */
import { describe, it, expect, vi, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TrackerSong } from '../../TrackerReplayer';

const ram = new Uint8Array(0x200000);
const current = vi.hoisted(() => ({ song: null as unknown }));
vi.mock('../UADEEngine', () => ({
  UADEEngine: {
    hasInstance: () => true,
    getInstance: () => ({
      readMemory: async (a: number, n: number) => ram.slice(a, a + n),
      writeMemory: async (a: number, d: Uint8Array) => { ram.set(d, a); },
    }),
  },
}));
vi.mock('@/lib/export/nativeExportRouter', () => ({
  exportNativeSong: async () => {
    const { exportDaveLowe } = await import('@/lib/export/DaveLoweExporter');
    return { data: (await exportDaveLowe(current.song as TrackerSong)).data };
  },
}));

import { applyEditedModuleToChipRam } from '../liveModuleEdits';
import { parseDaveLoweFile } from '@/lib/import/formats/DaveLoweParser';
import { parseDaveLoweNewFile } from '@/lib/import/formats/DaveLoweNewParser';
import { setGridBaseline, baselineOf } from '@/lib/song/gridBaseline';

afterAll(() => setGridBaseline(null));

const BASE = 0x30000;
const fixtures: Array<[string, (b: ArrayBuffer, n: string) => TrackerSong | Promise<TrackerSong>]> = [
  ['public/data/songs/dave-lowe-new/m-bison.dln', parseDaveLoweNewFile],
  ['public/data/songs/dave-lowe/incredibleshrinkingsphere.dl', parseDaveLoweFile],
];

describe('a Dave Lowe grid edit reaches UADE chip RAM', () => {
  it.each(fixtures)('%s', async (path, parse) => {
    const raw = new Uint8Array(readFileSync(join(process.cwd(), path)));
    const song = await parse(raw.slice().buffer as ArrayBuffer, path.split('/').pop()!);
    const layout = song.uadeVariableLayout!;
    expect(layout, 'byte-exact variable layout').toBeTruthy();

    // UADE's view: the module at BASE, its load address recorded at 0x100.
    ram.fill(0);
    ram.set([0, BASE >> 16, 0, 0], 0x100);
    ram.set(raw, BASE);

    let hit: { p: number; c: number; r: number } | null = null;
    for (let p = 0; p < song.patterns.length && !hit; p++) {
      for (let c = 0; c < song.patterns[p].channels.length && !hit; c++) {
        if ((layout.trackMap[p]?.[c] ?? -1) < 0) continue;
        const r = song.patterns[p].channels[c].rows.findIndex((x) => x.note > 12 && x.note < 80);
        if (r >= 0) hit = { p, c, r };
      }
    }
    expect(hit, 'a note cell on a mapped track').not.toBeNull();
    const { p, c, r } = hit!;
    setGridBaseline(baselineOf(song.patterns));
    const cell = song.patterns[p].channels[c].rows[r];
    song.patterns[p].channels[c].rows[r] = { ...cell, note: cell.note + 1 };
    current.song = song;

    const result = await applyEditedModuleToChipRam(song);
    expect(result?.status).toBe('live');

    // Only bytes inside the edited block's slot changed, and chip RAM now holds a module that parses to the edit.
    const fp = layout.trackMap[p][c];
    const lo = layout.filePatternAddrs[fp], hi = lo + layout.filePatternSizes[fp];
    const now = ram.slice(BASE, BASE + raw.length);
    const diff = now.reduce<number[]>((l, v, k) => (v !== raw[k] ? [...l, k] : l), []);
    expect(diff.length).toBeGreaterThan(0);
    expect(diff.every((k) => k >= lo && k < hi)).toBe(true);
    const reparsed = await parse(now.slice().buffer as ArrayBuffer, path.split('/').pop()!);
    expect(reparsed.patterns[p].channels[c].rows[r].note).toBe(cell.note + 1);
  });
});
