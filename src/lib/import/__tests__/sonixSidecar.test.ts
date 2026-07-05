/**
 * Sonix external-instrument sidecar mapping (pure, no disk — CI-wired).
 *
 * The Sonix WASM engine synthesizes sample-based instruments from external files
 * (.instr defs + .ss PCM) served via memfs. sonix_song_load_instruments() walks
 * "<songPath parent>/Instruments/", and the engine is invoked with songPath
 * 'sonix/song' (SONIX_MEMFS_SONG_PATH). So the sidecar memfs paths MUST be
 * "sonix/Instruments/<basename>" or the walk misses every file and the song plays
 * silent — the exact failure this maps around.
 */
import { describe, it, expect } from 'vitest';
import { buildSonixSidecarFiles } from '../formats/SonixMusicDriverParser';

const ab = (n: number) => new Uint8Array(n).buffer;

describe('buildSonixSidecarFiles', () => {
  it('maps companion .instr/.ss files to the memfs Instruments dir, stripping key prefix', () => {
    const companions = new Map<string, ArrayBuffer>([
      ['Instruments/hihat.instr', ab(128)],
      ['Instruments/hihat.ss', ab(1378)],
    ]);
    const out = buildSonixSidecarFiles(companions);
    expect(out).toBeDefined();
    const paths = out!.map((f) => f.path).sort();
    expect(paths).toEqual(['sonix/Instruments/hihat.instr', 'sonix/Instruments/hihat.ss']);
  });

  it('ignores non-instrument companions and returns undefined when none remain', () => {
    expect(buildSonixSidecarFiles(new Map([['readme.txt', ab(10)]]))).toBeUndefined();
    expect(buildSonixSidecarFiles(new Map())).toBeUndefined();
    expect(buildSonixSidecarFiles(undefined)).toBeUndefined();
  });

  it('handles bare basenames (no Instruments/ prefix) too', () => {
    const out = buildSonixSidecarFiles(new Map([['lodrum.ss', ab(13954)]]));
    expect(out).toEqual([{ path: 'sonix/Instruments/lodrum.ss', data: expect.anything() }]);
  });
});
