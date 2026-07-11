/**
 * maxtraxReloadPatch.test.ts — Tier-2 full-patch-rebuild regression guard.
 *
 * MaxTrax structural sample edits (Number/Octaves/Attack+Sustain lengths/env
 * points) are applied live by tearing down and re-allocating one patch's
 * in-memory buffers from a tailRaw sample byte slice. This proves
 * maxtrax_reload_patch rebuilds the env array + per-octave sample chain from a
 * self-contained synthetic slice and that the rebuilt patch renders. Reverting
 * reload_patch to an early `return -1` leaves r != 0 and this fails.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync }          from 'node:child_process';
import { join, dirname }         from 'node:path';
import { fileURLToPath }         from 'node:url';

const HERE   = dirname(fileURLToPath(import.meta.url));
const RUNNER = join(HERE, 'maxtraxReloadPatchRunner.cjs');
const ROOT   = process.cwd();

describe('MaxTrax Tier-2 reload_patch rebuilds a patch from a tailRaw slice', () => {
  it('reload_patch re-allocates env + sample chain and the patch renders', () => {
    const out = execFileSync(
      process.execPath,
      [
        RUNNER,
        join(ROOT, 'public/maxtrax/Maxtrax.js'),
        join(ROOT, 'public/maxtrax/Maxtrax.wasm'),
        join(ROOT, 'public/data/songs/maxtrax/antmusic.mxtx'),
      ],
      { encoding: 'utf8', timeout: 60_000 },
    );

    const { pn, r, vol, a0d, a0v, r0v, nz } = JSON.parse(out) as {
      pn: number; r: number; vol: number;
      a0d: number; a0v: number; r0v: number; nz: number;
    };

    // A real patch slot with a sample was found.
    expect(pn).toBeGreaterThanOrEqual(0);

    // Rebuild reported success.
    expect(r).toBe(0);

    // Scalars from the synthetic slice took.
    expect(vol).toBe(48);

    // Env array rebuilt: attack pt0 {dur:100, vol:64}, release pt0 {vol:0}.
    expect(a0d).toBe(100);
    expect(a0v).toBe(64);
    expect(r0v).toBe(0);

    // Rebuilt sample chain is valid → the song still renders audio.
    expect(nz).toBeGreaterThan(0);
  });
});
