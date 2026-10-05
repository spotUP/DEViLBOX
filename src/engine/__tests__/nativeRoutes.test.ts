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
  // PumaTracker labels its songs 'MOD' (Amiga grid); the old format gate kept
  // its own WASM engine off (2026-10-05). The file data decides now.
  ['pumatracker/liquid kids - lv1a.puma', async () => (await import('@lib/import/formats/PumaTrackerParser')).parsePumaTrackerFile(bytes('public/data/songs/pumatracker/liquid kids - lv1a.puma'), 'liquid kids - lv1a.puma'), 'PumaTracker'],
  ['actionamics/dynablaster.ast', async () => (await import('@lib/import/formats/ActionamicsParser')).parseActionamicsFile(new Uint8Array(bytes('public/data/songs/actionamics/dynablaster.ast')), 'dynablaster.ast'), 'ActionamicsReplayer'],
  ['formats/prehistoric_tale.hipc', async () => (await import('@lib/import/formats/HippelCoSoParser')).parseHippelCoSoFile(bytes('public/data/songs/formats/prehistoric_tale.hipc'), 'prehistoric_tale.hipc'), 'Hippel'],
  ['formats/ghostbattle_gameover.hip7', async () => (await import('@lib/import/formats/JochenHippel7VParser')).parseJochenHippel7VFile(bytes('public/data/songs/formats/ghostbattle_gameover.hip7'), 'ghostbattle_gameover.hip7'), 'Hippel'],
];

/**
 * The same question through the importer's own entry point: the file goes in
 * through parseModuleToSong, and playingEngineFor (the router's rule) names
 * the engine. Digital Sound Studio had a working replayer that no parser fed.
 */
const IMPORTED: Array<[string, string]> = [
  ['public/data/songs/digital-sound-studio/zrimay.dss', 'DssReplayer'],
  ['public/data/songs/formats/doxtro3.dss', 'DssReplayer'],
];

describe('imported songs play on their own engine', { timeout: 60000 }, () => {
  it.each(IMPORTED)('%s plays on %s', async (rel, key) => {
    const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
    const { playingEngineFor } = await import('../replayer/NativeEngineRouting');
    const song = await parseModuleToSong(new File([bytes(rel)], rel.split('/').pop()!));
    expect(playingEngineFor(song)).toBe(key);
  });
});

describe('native replayer routing', { timeout: 60000 }, () => {
  it.each(CASES)('%s starts its native replayer', async (_file, parse, key) => {
    const song = (await parse())!;
    const { WASM_ENGINES, shouldActivate } = await import('../replayer/NativeEngineRouting');
    const first = WASM_ENGINES.find((d) => shouldActivate(d, song));
    expect(first?.key).toBe(key);
  });
});
