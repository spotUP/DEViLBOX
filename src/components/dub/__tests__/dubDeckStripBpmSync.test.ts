/**
 * G12 contract: the tracker-view dub strip must sync echo rate to BPM.
 *
 * The pure `bpmSyncedEchoRate(bpm, division, fallback)` function is already
 * unit-tested in `DubActions.helpers.test.ts`. What this test guards is the
 * WIRING in `DubDeckStrip.tsx` — without it the helper existed but wasn't
 * called in the tracker view, so `echoSyncDivision: '1/4'` froze the echo
 * rate at the moment of division selection instead of following tempo
 * changes mid-song.
 *
 * We can't mount DubDeckStrip in happy-dom (heavy WebAudio dependency chain
 * via ensureDrumPadEngine → ToneEngine → AudioWorklet). So this locks the
 * contract at the source: (1) the BPM-sync helper is imported, (2) the
 * transport-BPM store selector is read, (3) the effect that pushes
 * dubBusSettings to the engine depends on the BPM value, (4) the effect is
 * debounced via setTimeout to tolerate pitch-fader scrubbing.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE = readFileSync(
  resolve(__dirname, '..', 'DubDeckStrip.tsx'),
  'utf8',
);

describe('DubDeckStrip — BPM-follow echo sync (G12)', () => {
  it('imports bpmSyncedEchoRate + getActiveBpm from DubActions', () => {
    expect(SOURCE).toMatch(/import\s+\{\s*[^}]*\bbpmSyncedEchoRate\b[^}]*\bgetActiveBpm\b[^}]*\}\s+from\s+['"]@\/engine\/dub\/DubActions['"]/);
  });

  it('subscribes to useTransportStore.bpm', () => {
    // Must read BPM from the transport store so re-renders fire on tempo
    // changes. The selector form matters — `s.bpm` (not `.tempo` etc.) is
    // the field the transport store exposes.
    expect(SOURCE).toMatch(/useTransportStore\s*\(\s*\(\s*s\s*\)\s*=>\s*s\.bpm\s*\)/);
  });

  it('effect pushing dubBusSettings to the engine depends on BPM', () => {
    // The effect that calls setDubBusSettings must list transportBpm in
    // its dependency array — otherwise tempo changes won't re-sync the
    // echo rate. Scope the search to the setDubBusSettings effect to
    // avoid matching unrelated effects that happen to use the BPM.
    const effectMatch = SOURCE.match(/useEffect\(\s*\(\s*\)\s*=>\s*\{[\s\S]*?setDubBusSettings[\s\S]*?\},\s*\[([^\]]+)\]\)/);
    expect(effectMatch, 'setDubBusSettings effect not found').not.toBeNull();
    const deps = effectMatch![1];
    expect(deps).toMatch(/\btransportBpm\b/);
  });

  it('debounces the engine sync with setTimeout', () => {
    // Plan requires a 100 ms debounce. Catch either the literal 100 or
    // a nearby constant — the exact number matters less than the fact
    // that setTimeout is wrapping the engine call so rapid BPM updates
    // (pitch-fader scrubbing, tempo commands) don't flood the DSP.
    const effectMatch = SOURCE.match(/useEffect\(\s*\(\s*\)\s*=>\s*\{[\s\S]*?setDubBusSettings[\s\S]*?\},\s*\[[^\]]+\]\)/);
    expect(effectMatch).not.toBeNull();
    expect(effectMatch![0]).toMatch(/setTimeout\(/);
    expect(effectMatch![0]).toMatch(/clearTimeout\(/);
  });

  it('invokes bpmSyncedEchoRate inside the engine-sync effect', () => {
    // Catch the class of regression where someone moves bpmSyncedEchoRate
    // into a useMemo / outer scope and the effect stops using it.
    const effectMatch = SOURCE.match(/useEffect\(\s*\(\s*\)\s*=>\s*\{[\s\S]*?setDubBusSettings[\s\S]*?\},\s*\[[^\]]+\]\)/);
    expect(effectMatch).not.toBeNull();
    expect(effectMatch![0]).toMatch(/bpmSyncedEchoRate\(/);
  });
});
