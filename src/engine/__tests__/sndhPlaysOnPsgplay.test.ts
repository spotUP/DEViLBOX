/**
 * An Atari ST SNDH file loads through the app's one parse path onto the
 * psgplay engine and opens in the Atari ST scope view: SNDH is the tune's own
 * player code, nothing to edit, so it gets the view every uneditable logged
 * format uses (owner, 2026-10-05) and the parser reads only the tag header.
 *
 * SNDH files went to the old sc68 core, which rendered silence for them
 * (`mad_max/jochen.snd`, 2026-10-05). The route now decides by content:
 * SNDH -> SNDHParser -> PsgplayEngine; an SC68 container stays on sc68.
 * src/engine/__tests__/psgplayPlaysSndh.test.ts proves the wasm makes sound.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { playingEngineFor } from '@/engine/replayer/NativeEngineRouting';
import { useFormatStore } from '@/stores/useFormatStore';

const ROOT = resolve(__dirname, '../../..');

async function parse(rel: string, subsong = 0) {
  const { parseModuleToSong } = await import('@lib/import/parseModuleToSong');
  const file = new File([new Uint8Array(readFileSync(resolve(ROOT, rel)))], basename(rel));
  return parseModuleToSong(file, subsong);
}

beforeAll(async () => { await import('@lib/import/parseModuleToSong'); }, 240_000);

describe('SNDH loads onto the psgplay engine', () => {
  it('jochen.snd routes to Psgplay and opens in the scope view, read from its header alone', async () => {
    const song = await parse('public/data/songs/sndh/mad_max/jochen.snd');
    expect(playingEngineFor(song)).toBe('Psgplay');
    expect(song.sc68FileData).toBeUndefined();
    expect(song.sndhFileData?.byteLength).toBeGreaterThan(0);
    expect(song.sndhSubtune).toBe(1);
    expect(song.instruments.every((i) => i.synthType === 'PsgplaySynth')).toBe(true);
    // No register grid: one empty pattern for the three YM channels.
    expect(song.patterns).toHaveLength(1);
    expect(song.patterns[0].channels.map((c) => c.name)).toEqual(['YM A', 'YM B', 'YM C']);
    expect(song.name).toMatch(/Jochen/i);
    useFormatStore.getState().applyEditorMode(song);
    expect(useFormatStore.getState().editorMode).toBe('sc68');
  }, 120_000);

  it('an SC68 container stays on the sc68 engine', async () => {
    const song = await parse('public/data/songs/sc68/aprentice title.sc68');
    expect(playingEngineFor(song)).toBe('Sc68');
    expect(song.sndhFileData).toBeUndefined();
  }, 120_000);
});
