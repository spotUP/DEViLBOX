/**
 * Riff Raff and Howie Davies effect-column write-back, reachability: real corpus songs go through the import entry point
 * (parseModuleToSong), an effect parameter is edited in the grid, and the native export router writes the module back. The
 * edited command's argument byte is the only byte that changes; the song re-imports showing the edited value wherever that
 * byte plays. Sentinels: both edit appliers must have run. Adding, removing or retyping a command is refused (no slot in
 * the stream), and so is a Speed change that would move the timing of the grid.
 *
 * Values read from the decoders: riffraff_smallest.riff voice 0 row 1 shows Set Volume 0x3C from file byte 2742 (also played
 * on row 257); blazing_thunder.hd voice 0 row 2496 shows Maximum Volume 0x3f from file byte 87740.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { RR_FX, HD_FX } from '@lib/import/formats/commandStreamEffectGlyphs';

const sentinel = vi.hoisted(() => ({ rr: 0, hd: 0 }));
vi.mock('@lib/import/formats/riffRaffEdits', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@lib/import/formats/riffRaffEdits')>();
  return { ...orig, applyRiffRaffGridEdits: (...a: Parameters<typeof orig.applyRiffRaffGridEdits>) => { sentinel.rr++; return orig.applyRiffRaffGridEdits(...a); } };
});
vi.mock('@lib/import/formats/howieDaviesEdits', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@lib/import/formats/howieDaviesEdits')>();
  return { ...orig, applyHowieDaviesGridEdits: (...a: Parameters<typeof orig.applyHowieDaviesGridEdits>) => { sentinel.hd++; return orig.applyHowieDaviesGridEdits(...a); } };
});

const DIR = join(process.cwd(), 'public/data/songs/formats');

async function load(name: string, bytes?: Uint8Array): Promise<{ raw: Uint8Array; song: TrackerSong }> {
  const { parseModuleToSong } = await import('@lib/import/parseModuleToSong');
  const raw = new Uint8Array(readFileSync(join(DIR, name)));
  return { raw, song: await parseModuleToSong(new File([new Uint8Array(bytes ?? raw)], name)) };
}

async function exportOf(song: TrackerSong) {
  const { exportNativeSong } = await import('@lib/export/nativeExportRouter');
  const res = await exportNativeSong(song);
  if (!res) throw new Error('no native export');
  return res;
}

const diffAt = (a: Uint8Array, b: Uint8Array): number[] => { const d: number[] = []; a.forEach((x, i) => { if (x !== b[i]) d.push(i); }); return d; };
const cellAt = (song: TrackerSong, ch: number, row: number) => song.patterns[Math.floor(row / 64)].channels[ch].rows[row % 64];

describe('Riff Raff effect column write-back', () => {
  it('writes an edited Set Volume into its argument byte and re-imports it on every row that plays the byte', async () => {
    const before = sentinel.rr;
    const { raw, song } = await load('riffraff_smallest.riff');
    expect(raw[2742]).toBe(0x3c);
    const same = await exportOf(song);
    expect(same.warnings).toEqual([]);
    expect(diffAt(raw, same.data)).toEqual([]);

    const cell = cellAt(song, 0, 1);
    expect([cell.effTyp, cell.eff]).toEqual([RR_FX.setVolume, 0x3c]);
    cell.eff = 0x21;
    const edited = await exportOf(song);
    expect(sentinel.rr).toBeGreaterThan(before);
    expect(edited.warnings).toEqual([]);
    expect(diffAt(raw, edited.data)).toEqual([2742]);
    expect(edited.data[2742]).toBe(0x21);
    const again = await load('riffraff_smallest.riff', edited.data);
    for (const row of [1, 257]) expect([cellAt(again.song, 0, row).effTyp, cellAt(again.song, 0, row).eff]).toEqual([RR_FX.setVolume, 0x21]);
    expect(cellAt(again.song, 1, 1).eff).toBe(0x40);
  }, 240000);

  it('refuses a command added to a row that has none', async () => {
    const { raw, song } = await load('riffraff_smallest.riff');
    const cell = cellAt(song, 0, 2);
    expect(cell.effTyp ?? 0).toBe(0);
    cell.effTyp = RR_FX.setVolume;
    cell.eff = 0x10;
    const res = await exportOf(song);
    expect(diffAt(raw, res.data)).toEqual([]);
    expect(res.warnings.join(' ')).toMatch(/cannot be added or removed/);
  }, 240000);
});

describe('Howie Davies effect column write-back', () => {
  it('writes an edited Maximum Volume into its operand byte and re-imports it', async () => {
    const before = sentinel.hd;
    const { raw, song } = await load('blazing_thunder.hd');
    expect(raw[87740]).toBe(0x3f);
    const cell = cellAt(song, 0, 2496);
    expect([cell.effTyp, cell.eff]).toEqual([HD_FX.maxVolume, 0x3f]);
    cell.eff = 0x30;
    const edited = await exportOf(song);
    expect(sentinel.hd).toBeGreaterThan(before);
    expect(edited.warnings).toEqual([]);
    expect(diffAt(raw, edited.data)).toEqual([87740]);
    expect(edited.data[87740]).toBe(0x30);
    const again = await load('blazing_thunder.hd', edited.data);
    expect([cellAt(again.song, 0, 2496).effTyp, cellAt(again.song, 0, 2496).eff]).toEqual([HD_FX.maxVolume, 0x30]);
    expect(cellAt(again.song, 0, 2499).eff).toBe(0x3e);
  }, 240000);

  it('writes an edited Speed into its operand byte, shown again on every row that plays the byte', async () => {
    const { raw, song } = await load('blazing_thunder.hd');
    expect(raw[87292]).toBe(6);
    const cell = cellAt(song, 0, 0);
    expect([cell.effTyp, cell.eff]).toEqual([HD_FX.speed, 6]);
    cell.eff = 5;
    const res = await exportOf(song);
    expect(res.warnings).toEqual([]);
    expect(diffAt(raw, res.data)).toEqual([87292]);
    expect(res.data[87292]).toBe(5);
    const again = await load('blazing_thunder.hd', res.data);
    for (const row of [0, 64]) expect([cellAt(again.song, 0, row).effTyp, cellAt(again.song, 0, row).eff]).toEqual([HD_FX.speed, 5]);
  }, 240000);
});
