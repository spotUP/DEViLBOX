/**
 * Reachability: a .jxs file dropped on the product's top-level import (parseModuleToSong) runs the
 * native JayTrax parser (sentinel: call count 1) and the song exports byte-identical.
 *
 * Skipped until the shared wiring lands (formatRegistryData 'jxs' entry, AmigaFormatParsers dispatch,
 * TrackerFormat 'JXS' and jxsFileData in TrackerReplayer.ts, nativeExportRouter): those files carried
 * uncommitted changes of another agent when the port was written. Unskip once wired.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('@lib/import/formats/JxsParser', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@lib/import/formats/JxsParser')>();
  return { ...mod, parseJxsFile: vi.fn(mod.parseJxsFile) };
});

import { parseModuleToSong } from '@/lib/import/parseModuleToSong';
import { parseJxsFile } from '@lib/import/formats/JxsParser';
import { exportJxs } from '@lib/export/JxsExporter';

const PATH = 'public/data/songs/formats/popcorn.jxs';

describe('JayTrax reachability', () => {
  it('top-level import runs the JXS parser; native export is byte-exact', async () => {
    const raw = readFileSync(PATH);
    const song = await parseModuleToSong(new File([new Uint8Array(raw)], 'popcorn.jxs'));
    expect(vi.mocked(parseJxsFile)).toHaveBeenCalledTimes(1);
    expect(song.patterns.some((p) => p.channels.some((c) => c.rows.some((r) => r.note > 0)))).toBe(true);
    const out = new Uint8Array(await (await exportJxs(song)).data.arrayBuffer());
    expect(Buffer.from(out).equals(raw)).toBe(true);
  });
});
