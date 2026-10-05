/**
 * S98 register logs load through the app's one parse path onto the S98
 * engine (ymfm) and open in the scope view.
 *
 * S98Parser rebuilt approximate notes from the logged writes onto Furnace
 * instruments and gave v0/v1 files a YM2149 where the format's default
 * device is a YM2608 (2026-10-05). It now reads the header only.
 * src/engine/__tests__/s98PlaysOnYmfm.test.ts proves the wasm makes sound.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { playingEngineFor } from '@/engine/replayer/NativeEngineRouting';
import { useFormatStore } from '@/stores/useFormatStore';
import { scopeFormatLabel } from '@/lib/tracker/scopeFormatLabel';

const ROOT = resolve(__dirname, '../../..');

async function parse(rel: string) {
  const { parseModuleToSong } = await import('@lib/import/parseModuleToSong');
  const file = new File([new Uint8Array(readFileSync(resolve(ROOT, rel)))], basename(rel));
  return parseModuleToSong(file, 0);
}

beforeAll(async () => { await import('@lib/import/parseModuleToSong'); }, 240_000);

describe('S98 loads onto the S98 engine', () => {
  for (const [name, channels, chip] of [
    ['carat-01.s98', ['YM2608 OPNA'], 'YM2608'],
    ['hiouden 10.s98', ['YM2203 OPN'], 'YM2203'],
    ['ys2x105.s98', ['YM2149 PSG', 'YM2151 OPM'], 'YM2149 + YM2151'],
  ] as const) {
    it(`${name} routes to S98 with a channel per device and opens in the scope view`, async () => {
      const song = await parse(`public/data/songs/s98/${name}`);
      expect(playingEngineFor(song)).toBe('S98');
      expect(song.s98FileData?.byteLength).toBeGreaterThan(0);
      expect(song.instruments.every((i) => i.synthType === 'S98Synth')).toBe(true);
      expect(song.patterns).toHaveLength(1);
      expect(song.patterns[0].channels.map((c) => c.name)).toEqual(channels);
      expect(song.patterns[0].channels.every((c) => c.rows.every((r) => !r.note))).toBe(true);
      useFormatStore.getState().applyEditorMode(song);
      expect(useFormatStore.getState().editorMode).toBe('sc68');
      expect(scopeFormatLabel(useFormatStore.getState())).toMatchObject({ format: 'S98', chip });
    }, 120_000);
  }
});
