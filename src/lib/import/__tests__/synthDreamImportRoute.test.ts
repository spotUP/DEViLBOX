/**
 * SynthDream phase A2: loading an sdr.* file through the app's import entry point (parseModuleToSong)
 * yields the SynthDream decoder's grid, while playback stays on UADE / nuade (uadeEditableFileData).
 * Expected first note (voice 0, tick 0 = tracker note 49, instrument column 1) is derived by hand in
 * src/lib/import/formats/__tests__/synthDreamGrid.test.ts.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sentinel = vi.hoisted(() => ({ calls: 0 }));
vi.mock('@lib/import/formats/SynthDreamParser', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../formats/SynthDreamParser')>();
  return { ...orig, parseSynthDreamFile: (...a: Parameters<typeof orig.parseSynthDreamFile>) => { sentinel.calls++; return orig.parseSynthDreamFile(...a); } };
});

describe('sdr.* import route', () => {
  it('parseModuleToSong gives the SynthDream grid and keeps UADE playback', async () => {
    const { parseModuleToSong } = await import('../parseModuleToSong');
    const raw = readFileSync(join(process.cwd(), 'public/data/songs/formats/sdr.monsterbusiness_5'));
    const file = new File([new Uint8Array(raw)], 'sdr.monsterbusiness_5');
    const song = await parseModuleToSong(file);
    expect(sentinel.calls).toBeGreaterThan(0);
    const cell = song.patterns[0].channels[0].rows[0];
    expect([cell.note, cell.instrument]).toEqual([49, 1]);
    expect((song as unknown as { uadeVariableLayout?: { formatId: string } }).uadeVariableLayout?.formatId).toBe('synthDream');
    expect((song as unknown as { uadeEditableFileData?: ArrayBuffer }).uadeEditableFileData?.byteLength).toBe(raw.byteLength);
  });
});
