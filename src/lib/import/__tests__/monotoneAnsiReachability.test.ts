/**
 * Reachability: MONOTONE (.mon) and ANSI music (.ans) files reach their new
 * parsers through the product's import entry (parseModuleToSong, the call the
 * file loader makes), not just through the parsers' own unit tests. The
 * spies are the sentinels: they prove the dispatch ran the new code.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('../formats/MonotoneParser', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../formats/MonotoneParser')>();
  return { ...mod, parseMonotoneFile: vi.fn(mod.parseMonotoneFile) };
});
vi.mock('../formats/AnsiMusicParser', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../formats/AnsiMusicParser')>();
  return { ...mod, parseAnsiMusicFile: vi.fn(mod.parseAnsiMusicFile) };
});

import { parseModuleToSong } from '../parseModuleToSong';
import { parseMonotoneFile } from '../formats/MonotoneParser';
import { parseAnsiMusicFile } from '../formats/AnsiMusicParser';
import { WASM_ENGINES, shouldActivate } from '@/engine/replayer/wasmEngineRegistry';

const fixture = (dir: string, name: string): Uint8Array => readFileSync(join(__dirname, 'fixtures', dir, name));
const fileOf = (bytes: Uint8Array, name: string) => new File([bytes.slice().buffer as ArrayBuffer], name);

beforeEach(() => { vi.mocked(parseMonotoneFile).mockClear(); vi.mocked(parseAnsiMusicFile).mockClear(); });

describe('MONOTONE and ANSI music are reachable through parseModuleToSong', () => {
  it('PRELUDE.MON runs parseMonotoneFile and activates MonotoneReplayer, not UADE', async () => {
    const bytes = fixture('monotone', 'PRELUDE.MON');
    const song = await parseModuleToSong(fileOf(bytes, 'PRELUDE.MON'));
    expect(parseMonotoneFile).toHaveBeenCalledTimes(1);
    expect(Array.from(new Uint8Array(song.monotoneFileData as ArrayBuffer))).toEqual(Array.from(bytes));
    expect(song.patterns.length).toBe(23);
    expect(song.numChannels).toBe(4);
    const desc = WASM_ENGINES.find((d) => d.key === 'MonotoneReplayer')!;
    expect(shouldActivate(desc, song)).toBe(true);
    expect(song.uadeEditableFileData).toBeUndefined();
  }, 60000);

  it('MUSIC_pavt199.ANS runs parseAnsiMusicFile: note 37 on channel 0 row 0, PC speaker instrument', async () => {
    const song = await parseModuleToSong(fileOf(fixture('ansi-music', 'MUSIC_pavt199.ANS'), 'MUSIC_pavt199.ANS'));
    expect(parseAnsiMusicFile).toHaveBeenCalledTimes(1);
    expect(song.format).toBe('AnsiMusic');
    expect(song.patterns[0].channels[0].rows[0].note).toBe(37);
    expect(song.instruments[0].synthType).toBe('FurnacePCSPKR');
  }, 60000);

  it('a plain ANSI art file without music does not become an AnsiMusic song', async () => {
    const art = new TextEncoder().encode('\x1b[31;1mHELLO\x1b[0m\r\n\x1b[2;5Hplain art, no music\r\n');
    const song = await parseModuleToSong(fileOf(art, 'ART.ANS')).catch(() => null);
    expect(parseAnsiMusicFile).not.toHaveBeenCalled();
    expect(song?.format).not.toBe('AnsiMusic');
  }, 60000);
});
