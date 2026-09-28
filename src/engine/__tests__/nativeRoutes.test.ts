/**
 * A song that has a native WASM replayer is played by it, not by UADE.
 *
 * Each case parses a real file the way the importer does and asks the native
 * router which engine starts first (formats: null descriptors start only if
 * nothing earlier in WASM_ENGINES did, so order decides). UADE is the last
 * resort: Actionamics had a working replayer that no parser ever fed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const ROOT = resolve(__dirname, '../../..');
const bytes = (rel: string) => { const b = readFileSync(resolve(ROOT, rel)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };

const CASES: Array<[string, () => Promise<TrackerSong | null>, string]> = [
  ['actionamics/dynablaster.ast', async () => (await import('@lib/import/formats/ActionamicsParser')).parseActionamicsFile(new Uint8Array(bytes('public/data/songs/actionamics/dynablaster.ast')), 'dynablaster.ast'), 'ActionamicsReplayer'],
  ['formats/prehistoric_tale.hipc', async () => (await import('@lib/import/formats/HippelCoSoParser')).parseHippelCoSoFile(bytes('public/data/songs/formats/prehistoric_tale.hipc'), 'prehistoric_tale.hipc'), 'Hippel'],
  ['formats/ghostbattle_gameover.hip7', async () => (await import('@lib/import/formats/JochenHippel7VParser')).parseJochenHippel7VFile(bytes('public/data/songs/formats/ghostbattle_gameover.hip7'), 'ghostbattle_gameover.hip7'), 'Hippel'],
];

describe('native replayer routing', { timeout: 60000 }, () => {
  it.each(CASES)('%s starts its native replayer', async (_file, parse, key) => {
    const song = (await parse())!;
    const { WASM_ENGINES, shouldActivate } = await import('../replayer/NativeEngineRouting');
    const first = WASM_ENGINES.find((d) => shouldActivate(d, song));
    expect(first?.key).toBe(key);
  });
});
