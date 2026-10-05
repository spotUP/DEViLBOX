/**
 * An Atari ST SNDH file loads through the app's one parse path onto the
 * psgplay engine, with a grid drawn from the YM registers psgplay sees.
 *
 * SNDH files went to the old sc68 core, which rendered silence for them
 * (`mad_max/jochen.snd`, 2026-10-05). The route now decides by content:
 * SNDH -> SNDHParser -> PsgplayEngine; an SC68 container stays on sc68.
 * src/engine/__tests__/psgplayPlaysSndh.test.ts proves the wasm makes sound.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { playingEngineFor } from '@/engine/replayer/NativeEngineRouting';
import { installPublicBundleNodeFetch } from '@lib/import/__tests__/helpers/publicBundleNodeFetch';

const ROOT = resolve(__dirname, '../../..');

async function parse(rel: string, subsong = 0) {
  const { parseModuleToSong } = await import('@lib/import/parseModuleToSong');
  const file = new File([new Uint8Array(readFileSync(resolve(ROOT, rel)))], basename(rel));
  return parseModuleToSong(file, subsong);
}

let restore: () => void;
beforeAll(async () => {
  restore = installPublicBundleNodeFetch('psgplay');
  await import('@lib/import/parseModuleToSong');
}, 240_000);
afterAll(() => restore());

describe('SNDH loads onto the psgplay engine', () => {
  it('jochen.snd routes to Psgplay with a grid of YM notes in time with the engine', async () => {
    const song = await parse('public/data/songs/sndh/mad_max/jochen.snd');
    expect(playingEngineFor(song)).toBe('Psgplay');
    expect(song.sc68FileData).toBeUndefined();
    expect(song.sndhFileData?.byteLength).toBeGreaterThan(0);
    expect(song.sndhSubtune).toBe(1);
    expect(song.instruments.every((i) => i.synthType === 'PsgplaySynth')).toBe(true);
    // One row per 1/50 s frame: speed 1 at 125 BPM is 50 rows a second.
    expect(song.initialSpeed).toBe(1);
    expect(song.initialBPM).toBe(125);
    // The TIME tag says 116.46 s: the grid spans it, notes drawn for the first 30 s.
    const rows = song.patterns.reduce((n, p) => n + p.length, 0);
    expect(rows).toBeGreaterThanOrEqual(Math.ceil(116.46 * 50));
    expect(rows).toBeLessThan(Math.ceil(116.46 * 50) + 64);
    expect(song.songPositions.length).toBe(song.patterns.length);
    const noteRows = (from: number, to: number) => song.patterns.flatMap((p, i) => p.channels.flatMap((c) =>
      c.rows.filter((r, row) => { const at = i * 64 + row; return at >= from && at < to && r.note > 0 && r.note < 97; })));
    expect(noteRows(0, 1500).length).toBeGreaterThan(50);
    expect(noteRows(1500, rows)).toHaveLength(0);
    expect(song.name).toMatch(/Jochen/i);
  }, 120_000);

  it('an SC68 container stays on the sc68 engine', async () => {
    const song = await parse('public/data/songs/sc68/aprentice title.sc68');
    expect(playingEngineFor(song)).toBe('Sc68');
    expect(song.sndhFileData).toBeUndefined();
  }, 120_000);
});
