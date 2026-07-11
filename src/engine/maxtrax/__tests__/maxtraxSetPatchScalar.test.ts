/**
 * maxtraxSetPatchScalar.test.ts — Tier-1 live scalar-edit regression guard.
 *
 * MaxTrax sample-patch Tune and Volume must be editable live: written directly
 * into the in-memory _patch struct the running MusicServer reads (Tune every
 * tick in CalcNote, Volume on the next sustain segment). This proves
 * maxtrax_set_patch_scalar mutates the patch and maxtrax_get_patch_scalar reads
 * it back. Reverting the setter to a no-op leaves V1==V0 / T1==T0 and this fails.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync }          from 'node:child_process';
import { join, dirname }         from 'node:path';
import { fileURLToPath }         from 'node:url';

const HERE   = dirname(fileURLToPath(import.meta.url));
const RUNNER = join(HERE, 'maxtraxSetPatchScalarRunner.cjs');
const ROOT   = process.cwd();

describe('MaxTrax Tier-1 scalar setter writes Tune/Volume into _patch', () => {
  it('set_patch_scalar mutates the live patch and get_patch_scalar reads it back', () => {
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

    const { pn, V0, V1, T0, T1, newVol, newTune, setVol, setTune } = JSON.parse(out) as {
      pn: number; V0: number; V1: number; T0: number; T1: number;
      newVol: number; newTune: number; setVol: number; setTune: number;
    };

    // A real patch slot with a sample was found.
    expect(pn).toBeGreaterThanOrEqual(0);

    // Both writes reported success.
    expect(setVol).toBe(0);
    expect(setTune).toBe(0);

    // Volume changed to the new value.
    expect(V1).not.toBe(V0);
    expect(V1).toBe(newVol);

    // Tune changed to the new value (i16 semantics — sign-extended read).
    expect(T1).toBe((newTune << 16) >> 16);
  });
});
