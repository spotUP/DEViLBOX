/**
 * A SoundFX song plays on the SoundFX WASM replayer, not on UADE.
 *
 * Reachability, once, through the load path: parseModuleToSong (the importer) -> playingEngineFor (the registry the
 * player asks) -> the song's own bytes in the real worklet and WASM. The sentinel is the rendered audio: the replayer
 * only loaded "SO31" (v2.0) files and refused every v1.x "SONG" file (batdance.sfx), so a wiring that reached it
 * without the v1 loader plays silence and fails the level check.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadSharedWorkletScripts, startWorklet } from './workletHarness';
import { soundfxTransform } from '@/engine/soundfx/soundfxTransform';

const REL = 'soundfx/batdance.sfx';

describe('SoundFX plays on its own engine', { timeout: 120000 }, () => {
  it('batdance.sfx routes to SoundFxReplayer and the replayer renders it', async () => {
    const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
    const { playingEngineFor } = await import('@/engine/replayer/NativeEngineRouting');
    const bytes = readFileSync(join(__dirname, '../../../public/data/songs', REL));
    const song = await parseModuleToSong(new File([bytes], 'batdance.sfx'));
    expect(playingEngineFor(song)).toBe('SoundFxReplayer');
    expect(song.soundFxFileData).toBeDefined();

    loadSharedWorkletScripts();
    const { proc, send, posted } = await startWorklet('soundfx', 'SoundFx', soundfxTransform);
    await send({ type: 'loadModule', moduleData: song.soundFxFileData });
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
