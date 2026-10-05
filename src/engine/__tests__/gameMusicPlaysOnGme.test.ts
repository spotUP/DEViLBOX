/**
 * Console game music loads through the app's one parse path onto the
 * game-music-emu engine and opens in the scope view.
 *
 * NSF and VGM rebuilt approximate notes from register writes onto Furnace
 * instruments; GBS, HES, KSS and SPC opened as empty stubs with no playback;
 * GYM did not open (2026-10-05). Each now routes by content to GameMusicParser
 * (header only) and GmeEngine. A VGM for chips game-music-emu does not
 * emulate (OPL3) stays on VGMParser; YM register dumps play on ZXTune.
 * src/engine/__tests__/gmePlaysGameMusic.test.ts proves the wasm makes sound.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { playingEngineFor } from '@/engine/replayer/NativeEngineRouting';
import { useFormatStore } from '@/stores/useFormatStore';
import { scopeFormatLabel } from '@/lib/tracker/scopeFormatLabel';

const ROOT = resolve(__dirname, '../../..');

async function parse(rel: string, subsong = 0) {
  const { parseModuleToSong } = await import('@lib/import/parseModuleToSong');
  const file = new File([new Uint8Array(readFileSync(resolve(ROOT, rel)))], basename(rel));
  return parseModuleToSong(file, subsong);
}

beforeAll(async () => { await import('@lib/import/parseModuleToSong'); }, 240_000);

const SONGS: Array<[string, string, number]> = [
  ['nsf/dr mario.nsf', 'NSF', 5],
  ['gbs/airforce delta.gbs', 'GBS', 4],
  ['hes/impossamole.hes', 'HES', 6],
  ['kss/gradius 2.kss', 'KSS', 8],
  ['spc/01 - main theme.spc', 'SPC', 8],
  ['vgm/03 title screen.vgz', 'VGM', 4],
  ['vgm/sparkster - continue.vgz', 'VGM', 8],
  ['gym/level1.gym', 'GYM', 8],
];

describe('game music loads onto the game-music-emu engine', () => {
  for (const [rel, format, voices] of SONGS) {
    it(`${rel} routes to Gme and opens in the scope view labelled ${format}`, async () => {
      const song = await parse(`public/data/songs/${rel}`);
      expect(playingEngineFor(song)).toBe('Gme');
      expect(song.gmeFileData?.byteLength).toBeGreaterThan(0);
      expect(song.gmeTrack).toBe(0);
      expect(song.instruments.every((i) => i.synthType === 'GmeSynth')).toBe(true);
      // No reconstructed notes: one empty pattern, a channel per emulated voice.
      expect(song.patterns).toHaveLength(1);
      expect(song.numChannels).toBe(voices);
      expect(song.patterns[0].channels.every((c) => c.rows.every((r) => !r.note))).toBe(true);
      useFormatStore.getState().applyEditorMode(song);
      expect(useFormatStore.getState().editorMode).toBe('sc68');
      expect(scopeFormatLabel(useFormatStore.getState())?.format).toBe(format);
    }, 120_000);
  }

  it('the import subsong picks the track', async () => {
    const song = await parse('public/data/songs/kss/gradius 2.kss', 40);
    expect(song.gmeTrack).toBe(40);
    const nsf = await parse('public/data/songs/nsf/dr mario.nsf', 3);
    expect(nsf.gmeTrack).toBe(3);
    expect(nsf.name).toMatch(/\[4\/\d+\]/);
  }, 120_000);

  it('a VGM for a chip game-music-emu does not emulate (OPL3) stays on VGMParser', async () => {
    const song = await parse('public/data/songs/vgm/BeyondSN.vgm');
    expect(song.gmeFileData).toBeUndefined();
    expect(playingEngineFor(song)).not.toBe('Gme');
  }, 120_000);

  it('a YM register dump plays on ZXTune', async () => {
    const song = await parse('public/data/songs/ym/17th.ym');
    expect(playingEngineFor(song)).toBe('Zxtune');
    expect(song.zxtuneFileData?.byteLength).toBeGreaterThan(0);
  }, 120_000);
});
