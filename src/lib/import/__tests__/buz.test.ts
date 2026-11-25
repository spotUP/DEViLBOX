/**
 * Buzzic 1 / Buzzic 2: a .buz2 file reaches BuzParser through parseModuleToSong, carries its
 * bytes as buzFileData, and activates the BuzReplayer WASM engine.
 * Fixture: the owner's attacktrack.buz2 (not in the repo; the test skips when it is absent).
 */
import { describe, it, expect, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

vi.mock('../formats/BuzParser', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../formats/BuzParser')>();
  return { ...mod, parseBuzFile: vi.fn(mod.parseBuzFile) };
});

import { parseModuleToSong } from '../parseModuleToSong';
import { isBuzFormat, parseBuzFile } from '../formats/BuzParser';
import { WASM_ENGINES, shouldActivate } from '@/engine/replayer/wasmEngineRegistry';

const SONG = '/Users/spot/Desktop/Selecta-new-formats/attacktrack.buz2';

describe('Buzzic routing', () => {
  it('rejects bytes that are not a Buzzic song', () => {
    expect(isBuzFormat(new Uint8Array(200))).toBe(false);
    expect(isBuzFormat(new Uint8Array(44712))).toBe(false);
  });

  it.skipIf(!existsSync(SONG))('routes attacktrack.buz2 to BuzParser and the WASM engine', async () => {
    const bytes = new Uint8Array(readFileSync(SONG));
    expect(isBuzFormat(bytes)).toBe(true);
    const song = await parseModuleToSong(new File([bytes.slice().buffer as ArrayBuffer], 'attacktrack.buz2'));
    expect(parseBuzFile).toHaveBeenCalledTimes(1);
    expect(song.format).toBe('BUZ');
    expect(Array.from(new Uint8Array(song.buzFileData as ArrayBuffer))).toEqual(Array.from(bytes));
    expect(song.songPositions.length).toBeGreaterThan(0);
    const desc = WASM_ENGINES.find((d) => d.key === 'BuzReplayer')!;
    expect(shouldActivate(desc, song)).toBe(true);
  }, 60000);
});
