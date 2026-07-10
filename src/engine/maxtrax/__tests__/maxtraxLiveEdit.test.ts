/**
 * maxtraxLiveEdit.test.ts — Task 6 regression guard.
 *
 * Verifies that maxtrax_set_event writes to the LIVE cev buffer the MaxTrax
 * player reads on every tick, not a dead shadow copy.
 *
 * Proof: after muting all note events via maxtrax_set_event and calling
 * maxtrax_recook to rewind the read cursor, the re-render must produce fewer
 * CMD_WRITE (note-on) commands than the unedited baseline.  If editedWrites ==
 * baselineWrites, the setter is writing to a copy the player ignores — that is
 * the explicit failure mode this test catches.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync }          from 'node:child_process';
import { join, dirname }         from 'node:path';
import { fileURLToPath }         from 'node:url';

const HERE   = dirname(fileURLToPath(import.meta.url));
const RUNNER  = join(HERE, 'maxtraxLiveEditRunner.cjs');
const ROOT    = process.cwd();

describe('MaxTrax WASM live-edit setters', () => {
  it('a live set_event that mutes notes reduces the CMD_WRITE count on re-render', () => {
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

    const { baselineWrites, editedWrites, setResult } = JSON.parse(out) as {
      baselineWrites: number;
      editedWrites:   number;
      setResult:      number;
      mutedCount:     number;
    };

    // set_event must have accepted at least one call (returned 0).
    expect(setResult).toBe(0);

    // Muting all note events must reduce the CMD_WRITE (NoteOn) stream.
    // If this assertion fails, the setter wrote to a copy the player ignores.
    expect(editedWrites).toBeLessThan(baselineWrites);
  });
});
