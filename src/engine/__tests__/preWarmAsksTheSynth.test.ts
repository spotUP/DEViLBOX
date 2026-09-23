import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The song-load pre-warm never plays a note.
 *
 * Two loops did, both "silently". The Tone.js loop set `volume = -Infinity`
 * and restored it in the same synchronous run, so the mute never applied.
 * The DevilboxSynth loop muted `output` for 50 ms, which is silent only for a
 * synth whose sound all passes through `output` and dies within 50 ms of
 * release — a release envelope outlives that, and a native engine's
 * per-channel dub-send outputs bypass `output` entirely.
 *
 * Measured 2026-09-23 on a crash-recovery restore of amanda.ahx: the warm-up
 * note reached the dub bus return at 0.41 with the dry path at 0 and rang for
 * two seconds — "i clicked restore and audio fires", "i dont think its
 * isolated to hively".
 *
 * A synth that needs priming implements `warmUp()` and does it silently.
 */
const SRC = readFileSync(join(process.cwd(), 'src/engine/ToneEngine.ts'), 'utf-8');

function preloadBody(): string {
  const start = SRC.indexOf('// Prime synths that ask to be primed');
  expect(start, 'the priming block moved').toBeGreaterThan(-1);
  return SRC.slice(start, SRC.indexOf('// Check ROM status for MAME chip synths', start));
}

describe('song-load pre-warm never plays a note', () => {
  it('asks each DevilboxSynth to warm itself up', () => {
    expect(preloadBody()).toContain('warmUp?.()');
  });

  it('no longer triggers a muted note on any synth', () => {
    const body = preloadBody();
    expect(body).not.toContain('triggerAttack');
    expect(body).not.toContain('triggerAttackRelease');
    expect(body).not.toContain('volume.value = -Infinity');
    // And the old loops are gone from the file, not just moved.
    expect(SRC).not.toContain("ds.triggerAttack?.('C4', undefined, 0.01)");
    expect(SRC).not.toContain('inst.volume.value = -Infinity;');
  });
});
