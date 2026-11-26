/**
 * Player variants beyond future basketball. chuckie egg 2 (header 6000 008c, same player family) goes through the
 * product's top-level import (parseModuleToSong) into the native TW parser, gives notes on all 4 voices, and
 * exports unedited byte-identical to the input.
 *
 * warinthegulf (header b27a 003c) is the "Sound Images Generation 2 sound drivers (c) 1993" player: one song, three
 * voices, other opcodes (thoughts/spot/2026-11-24-tw-gen2.md). The walker detects it as dialect 2; the grid has notes
 * on all 3 voices, the unedited export is byte-identical, and a one-cell note edit changes exactly that note byte.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('@lib/import/formats/TonyWilliamsParser', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@lib/import/formats/TonyWilliamsParser')>();
  return { ...mod, parseTonyWilliamsFile: vi.fn(mod.parseTonyWilliamsFile) };
});

import { parseModuleToSong } from '@/lib/import/parseModuleToSong';
import { parseTonyWilliamsFile, isTonyWilliamsFormat } from '@lib/import/formats/TonyWilliamsParser';
import { walkTonyWilliams } from '@lib/import/formats/tonyWilliamsWalk';
import { exportNativeSong } from '@lib/export/nativeExportRouter';

const SONGS = ['public/data/songs/sound-images/Tony Williams/chuckie egg 2.tw'];
const GEN2 = 'public/data/songs/sound-images/- unknown/warinthegulf.tw';

describe('Tony Williams player variants', () => {
  it.each(SONGS)('%s: TW parser grid has notes on all 4 voices; native export is byte-exact', async (path) => {
    vi.mocked(parseTonyWilliamsFile).mockClear();
    const raw = readFileSync(path);
    const song = await parseModuleToSong(new File([new Uint8Array(raw)], path.split('/').pop()!));
    expect(vi.mocked(parseTonyWilliamsFile)).toHaveBeenCalledTimes(1);
    const pats = song.patterns;
    expect(pats.length).toBeGreaterThan(0);
    for (const p of pats) expect(p.channels.length).toBe(4);
    const counts = [0, 1, 2, 3].map((c) => pats.reduce((n, p) => n + p.channels[c]!.rows.filter((r) => r.note > 0).length, 0));
    expect(counts.every((n) => n > 0)).toBe(true);
    const out = new Uint8Array((await exportNativeSong(song))!.data as Uint8Array);
    expect(Buffer.from(out).equals(raw)).toBe(true);
  });

  it('warinthegulf (Generation 2 driver): 3-voice grid, byte-exact export, a note edit changes one byte', async () => {
    const raw = readFileSync(GEN2);
    expect(new TextDecoder().decode(raw.subarray(0x54, 0x8a))).toContain('Generation 2 sound drivers');
    expect(isTonyWilliamsFormat(raw)).toBe(true);
    expect(walkTonyWilliams(raw, 0)?.info.dialect).toBe(2);
    vi.mocked(parseTonyWilliamsFile).mockClear();
    const song = await parseModuleToSong(new File([new Uint8Array(raw)], 'warinthegulf.tw'));
    expect(vi.mocked(parseTonyWilliamsFile)).toHaveBeenCalledTimes(1);
    for (const p of song.patterns) expect(p.channels.length).toBe(3);
    const counts = [0, 1, 2].map((c) => song.patterns.reduce((n, p) => n + p.channels[c]!.rows.filter((r) => r.note > 0).length, 0));
    expect(counts.every((n) => n > 0)).toBe(true);
    const out = new Uint8Array((await exportNativeSong(song))!.data as Uint8Array);
    expect(Buffer.from(out).equals(raw)).toBe(true);

    const cell = song.patterns.flatMap((p) => p.channels[1]!.rows).find((r) => r.note > 13 && r.note < 40)!;
    cell.note += 1;
    const edited = new Uint8Array((await exportNativeSong(song))!.data as Uint8Array);
    expect(edited.length).toBe(raw.length);
    const diff = [...edited].flatMap((v, i) => (v === raw[i] ? [] : [i]));
    expect(diff.length).toBe(1);
    expect(edited[diff[0]!]).toBe(raw[diff[0]!]! + 1);
  });
});
