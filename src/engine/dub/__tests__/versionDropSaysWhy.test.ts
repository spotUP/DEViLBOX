import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Version Drop "sometimes fails to fire" (2026-09-22).
 *
 * It fires every time. What it sometimes does is find nothing to take —
 * `planDrop` returns no channels on a song where nothing profiles as
 * arrangement over a groove — and return `{ dispose() {} }` in silence.
 * From the deck that is a lit button and no change, which is what "dead"
 * looks like. On the tune under test on 2026-09-23 the roles read
 * bass / percussion / pad / percussion, so it takes the two pads; on a
 * drums-and-bass tune it takes nothing and says nothing.
 *
 * The house pattern already exists: masterDrop toasts "Drop: no active audio
 * sources found" when it has nothing to act on. Version Drop now does the
 * same, and announces what it DID take, so the log answers the question the
 * way it does for every other move since 2546b3d24.
 */
const SRC = readFileSync(join(process.cwd(), 'src/engine/dub/moves/versionDrop.ts'), 'utf-8');

describe('Version Drop says what it did', () => {
  it('announces the channels it takes, with their behaviour', () => {
    expect(SRC).toContain('[DubBus] versionDrop ▶');
  });

  it('tells the performer when it found nothing to take, instead of returning in silence', () => {
    const nothing = SRC.indexOf('if (taking.length === 0)');
    expect(nothing, 'the nothing-to-take branch moved').toBeGreaterThan(-1);
    // Up to the branch's own return — the comment inside it is long.
    const branch = SRC.slice(nothing, SRC.indexOf('return { dispose() {} };', nothing));
    expect(branch, 'a silent no-op is indistinguishable from a dead button').toContain('notify.warning(');
    expect(branch).toContain('Version Drop:');
  });
});
