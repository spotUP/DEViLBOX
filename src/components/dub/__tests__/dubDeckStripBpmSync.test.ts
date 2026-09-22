/**
 * G12 contract: the echo rate must follow BPM.
 *
 * The pure `bpmSyncedEchoRate(bpm, division, fallback)` is unit-tested in
 * `DubActions.helpers.test.ts`. What this guards is the WIRING — without it
 * the helper existed but nothing called it, so `echoSyncDivision: '1/4'` froze
 * the echo rate at the moment of division selection instead of following
 * tempo changes mid-song.
 *
 * The four guarantees are unchanged. What changed on 2026-09-22 is WHO holds
 * them: this wiring lived in a `useEffect` in DubDeckStrip, which made engine
 * state depend on a component's render — in a layout that does not mount the
 * strip, the bus never learned `enabled` and never got the user's settings.
 * It now belongs to `DrumPadEngine.startDubSettingsMirror`, so the assertions
 * point there. `dubSettingsMirrorOwnership.test.ts` is what stops it moving
 * back into a view.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ENGINE = readFileSync(
  resolve(__dirname, '..', '..', '..', 'engine', 'drumpad', 'DrumPadEngine.ts'),
  'utf8',
);

/** The mirror method's body — every assertion is scoped to it. */
const MIRROR = (() => {
  const at = ENGINE.indexOf('private startDubSettingsMirror');
  expect(at, 'startDubSettingsMirror not found').toBeGreaterThan(-1);
  return ENGINE.slice(at, ENGINE.indexOf('\n  dispose()', at));
})();

describe('BPM-follow echo sync (G12)', () => {
  it('imports bpmSyncedEchoRate + getActiveBpm from DubActions', () => {
    expect(ENGINE).toMatch(
      /import\s+\{\s*[^}]*\bbpmSyncedEchoRate\b[^}]*\bgetActiveBpm\b[^}]*\}\s+from\s+['"][^'"]*DubActions['"]/,
    );
  });

  it('reacts to a transport BPM change', () => {
    // Must watch the transport store, or a tempo change never re-syncs the
    // rate. A subscription rather than a selector now, because the owner is
    // no longer a component.
    expect(MIRROR).toMatch(/useTransportStore\.subscribe\(/);
    expect(MIRROR).toMatch(/\bbpm\b/);
  });

  it('reacts to a dub settings change', () => {
    expect(MIRROR).toMatch(/useDrumPadStore\.subscribe\(/);
  });

  it('debounces the engine sync with setTimeout', () => {
    // Rapid BPM updates — pitch-fader scrubbing, tempo commands — must not
    // flood the DSP. The exact number matters less than the debounce existing.
    expect(MIRROR).toMatch(/setTimeout\(/);
    expect(MIRROR).toMatch(/clearTimeout\(/);
  });

  it('invokes bpmSyncedEchoRate where it pushes to the bus', () => {
    // Catches the class of regression where the helper is hoisted out and the
    // push stops using it.
    expect(MIRROR).toMatch(/bpmSyncedEchoRate\(/);
    expect(MIRROR).toMatch(/setDubBusSettings\(/);
  });

  it('stands off while a move owns the rate', () => {
    // A held delay preset or an in-flight throw pins the echo rate; the next
    // BPM tick must not overwrite it. The bus answers this, not a view.
    expect(MIRROR).toMatch(/isRateOverridden\(\)/);
  });
});
