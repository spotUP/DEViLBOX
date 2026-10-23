/**
 * A Game Music Creator song plays on the GMC WASM replayer, not on UADE.
 *
 * Reachability, once, through the load path: parseModuleToSong (the importer) -> playingEngineFor (the registry the
 * player asks) -> the song's own bytes in the real worklet and WASM. The sentinel is the rendered audio: the engine,
 * worklet and instrument editor existed, but the parser never handed over the file bytes and the registry had no
 * entry, so every .gmc song fell through to UADE.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadSharedWorkletScripts, startWorklet } from './workletHarness';

const REL = 'formats/knights_of_sky.gmc';

describe('Game Music Creator plays on its own engine', { timeout: 120000 }, () => {
  it('knights_of_sky.gmc routes to GmcReplayer and the replayer renders it', async () => {
    const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
    const { playingEngineFor } = await import('@/engine/replayer/NativeEngineRouting');
    const bytes = readFileSync(join(__dirname, '../../../public/data/songs', REL));
    const song = await parseModuleToSong(new File([bytes], 'knights_of_sky.gmc'));
    expect(playingEngineFor(song)).toBe('GmcReplayer');
    expect(song.gmcFileData).toBeDefined();

    loadSharedWorkletScripts();
    const { proc, send, posted } = await startWorklet('gmc', 'Gmc');
    await send({ type: 'loadModule', moduleData: song.gmcFileData });
    await send({ type: 'play' });
    let sq = 0, n = 0;
    const L = new Float32Array(128), R = new Float32Array(128);
    for (let f = 0; f < 48000 * 5; f += 128) {
      proc.process([], [[L, R]]);
      for (let i = 0; i < 128; i++) { sq += L[i]! * L[i]! + R[i]! * R[i]!; n += 2; }
    }
    expect(posted.find((p) => p.type === 'error')).toBeUndefined();
    expect(Math.sqrt(sq / n)).toBeGreaterThan(0.05);
  });
});
