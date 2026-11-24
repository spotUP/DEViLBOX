/**
 * Player variants beyond future basketball. chuckie egg 2 (header 6000 008c, same player family) goes through the
 * product's top-level import (parseModuleToSong) into the native TW parser, gives notes on all 4 voices, and
 * exports unedited byte-identical to the input.
 *
 * warinthegulf (header b27a 003c) is refused by the editable path on purpose: it is the "Sound Images Generation 2
 * sound drivers (c) 1993" player, a different program. Entry is a game API dispatch (`cmpw pc@(0x3e),d1` ->
 * `jsr pc@(0x40,d1.w)` jump table), it steps three voice records (0x95e/0x9b0/0xa00) on a 137/250 tempo
 * accumulator, and it has no `muluw #10` song table, so the generation-1 walker cannot locate songs or voice
 * lists. The detector does not claim it, so it stays on the UADE play-only path. Supporting it needs its own
 * disassembly pass (song start command, voice list layout, opcode table).
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

const SONGS = ['public/data/songs/Sound Images/Tony Williams/chuckie egg 2.tw'];
const GEN2 = 'public/data/songs/Sound Images/- unknown/warinthegulf.tw';

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

  it('warinthegulf (Generation 2 driver, b27a 003c) is not claimed by the editable TW path', () => {
    const raw = new Uint8Array(readFileSync(GEN2));
    expect(new TextDecoder().decode(raw.subarray(0x54, 0x8a))).toContain('Generation 2 sound drivers');
    expect(isTonyWilliamsFormat(raw)).toBe(false);
    expect(walkTonyWilliams(raw, 0)).toBeNull();
  });
});
