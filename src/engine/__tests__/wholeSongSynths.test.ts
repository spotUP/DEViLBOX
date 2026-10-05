import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isWholeSongSynth, WHOLE_SONG_SYNTH_TYPES } from '../wholeSongSynths';

/**
 * The second half of the jennipha.ahx silence.
 *
 * Even with the volume column decoded correctly, a value taken from ONE
 * channel's cell must not reach a replayer that plays the whole song through a
 * single shared instance — its `output` gain is the entire mix. `HivelySynth`
 * is the measured case; the rest of the list is the same shape.
 */

describe('recognising a whole-song replayer', () => {
  it('knows the synth that silenced jennipha.ahx', () => {
    expect(isWholeSongSynth('HivelySynth')).toBe(true);
  });

  it('knows the other native replayers', () => {
    expect(isWholeSongSynth('UADESynth')).toBe(true);
    expect(isWholeSongSynth('SonixSynth')).toBe(true);
    expect(isWholeSongSynth('TFMXModuleSynth')).toBe(true);
  });

  it('leaves ordinary per-note synths alone, which still take automation', () => {
    expect(isWholeSongSynth('TB303')).toBe(false);
    expect(isWholeSongSynth('Sampler')).toBe(false);
    expect(isWholeSongSynth('FurnaceSynth')).toBe(false);
    expect(isWholeSongSynth(null)).toBe(false);
    expect(isWholeSongSynth(undefined)).toBe(false);
  });
});

describe('the list cannot drift from the engine registry', () => {
  it('covers every synthType NativeEngineRouting registers', () => {
    // Read as text: this assertion only needs the declarations, which live in
    // the registry module (NativeEngineRouting re-exports WASM_ENGINES).
    const source = readFileSync(
      resolve(__dirname, '../replayer/wasmEngineRegistry.ts'),
      'utf-8',
    );
    const declared = [...source.matchAll(/synthType: '([A-Za-z0-9]+)'/g)].map(m => m[1]);
    expect(declared.length).toBeGreaterThan(40);

    const missing = declared.filter(t => !WHOLE_SONG_SYNTH_TYPES.has(t));
    expect(missing).toEqual([]);
  });
});
