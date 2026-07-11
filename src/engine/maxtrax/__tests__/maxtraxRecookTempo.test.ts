/**
 * maxtraxRecookTempo.test.ts — recook robustness regression guard.
 *
 * A mid-song TEMPO event (CMD 0x80) mutates glob_TickUnit — the per-tick advance
 * the MusicServer applies each VBlank. When maxtrax_recook rewinds the read
 * cursor to the top of the (edited) event buffer, it must ALSO re-derive
 * glob_TickUnit from the score base tempo. Without that, a recook past a tempo
 * event keeps replaying at the stale tempo until the event is reached again —
 * the edited song plays at the wrong speed after an edit.
 *
 * Proof: inject a TEMPO event, recook + render so it fires (tick unit changes,
 * T1 != T0), then recook again and confirm the tick unit is restored to the
 * base-tempo value (T2 == T0). Reverting the SetTempo lines in maxtrax_recook
 * leaves the tick unit stale — T2 stays == T1 — and this test fails.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync }          from 'node:child_process';
import { join, dirname }         from 'node:path';
import { fileURLToPath }         from 'node:url';

const HERE   = dirname(fileURLToPath(import.meta.url));
const RUNNER = join(HERE, 'maxtraxRecookTempoRunner.cjs');
const ROOT   = process.cwd();

describe('MaxTrax recook re-derives base-tempo tick unit', () => {
  it('recook restores glob_TickUnit to the base tempo after a tempo-event edit', () => {
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

    const { T0, T1, T2, setResult } = JSON.parse(out) as {
      T0: number; T1: number; T2: number; setResult: number;
    };

    // The tempo event must have been written to the live cev buffer.
    expect(setResult).toBe(0);

    // Base-tempo tick unit must be a real (non-zero) value.
    expect(T0).toBeGreaterThan(0);

    // Processing the injected tempo event must actually change the tick unit,
    // otherwise the test proves nothing about resetting it.
    expect(T1).not.toBe(T0);

    // The second recook must restore the base-tempo tick unit. If the SetTempo
    // reset is removed from recook, T2 stays at the stale T1 and this fails.
    expect(T2).toBe(T0);
  });
});
