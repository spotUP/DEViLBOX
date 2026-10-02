/**
 * G13 wiring contract — three source-level invariants.
 *
 * 1. `DubBus.getSidechainInput()` exists and returns an AudioNode.
 *    Without it, the channel router has no tap point.
 * 2. `DubDeckStrip` has a useEffect keyed on `sidechainSource` +
 *    `sidechainChannelIndex` that calls `addSidechainTap` and returns
 *    a cleanup that calls `removeSidechainTap`.
 * 3. `DubBusPanel` surfaces a Choice control for `sidechainSource` so
 *    the setting is actually reachable from the UI.
 *
 * Static-source asserts are the happy-dom-friendly way to lock wiring
 * that pulls in WebAudio / AudioWorklet at runtime.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DUB_BUS_SRC = readFileSync(
  resolve(__dirname, '..', 'DubBus.ts'),
  'utf8',
);
const DECK_STRIP_SRC = readFileSync(
  resolve(__dirname, '..', '..', '..', 'components', 'dub', 'DubDeckStrip.tsx'),
  'utf8',
);
const PANEL_SRC = readFileSync(
  resolve(__dirname, '..', '..', '..', 'components', 'dub', 'DubBusPanel.tsx'),
  'utf8',
);

describe('G13 sidechain source wiring — static contract', () => {
  it('DubBus exposes getSidechainInput(): AudioNode', () => {
    expect(DUB_BUS_SRC).toMatch(/getSidechainInput\s*\(\s*\)\s*:\s*AudioNode/);
  });

  it('DubDeckStrip routes by sidechainSource and taps the detector', () => {
    // The effect must branch on the source value and call addSidechainTap.
    // The guard is now inverted — 'bus' returns early instead of 'channel'
    // branching positively — because 'drums' (the classifier key, added
    // 2026-10-02) resolves to a channel first and then taps the same node.
    // Assert on the behaviour, not on which side of the comparison it sits.
    expect(DECK_STRIP_SRC).toMatch(/source\s*(!==|===)\s*['"](bus|channel|drums)['"]/);
    expect(DECK_STRIP_SRC).toMatch(/addSidechainTap\(/);
  });

  it('DubDeckStrip resolves the drum key through the classifier', () => {
    expect(DECK_STRIP_SRC).toMatch(/resolveDrumKeyChannel/);
  });

  it('leaves the drum key silent rather than self-keying when none is found', () => {
    // Self-keying an unresolved drum key turns a kick ducker into a permanent
    // bass compressor (measured -11.4 dB at 100 Hz, 2026-09-29).
    expect(DECK_STRIP_SRC).toMatch(/tapChannel\s*<\s*0/);
    expect(DECK_STRIP_SRC).toMatch(/sidechain key left silent/);
  });

  it('DubDeckStrip cleans up with removeSidechainTap on effect teardown', () => {
    // Without the cleanup, switching channels leaks taps — the previous
    // channel stays wired to the compressor alongside the new one.
    expect(DECK_STRIP_SRC).toMatch(/removeSidechainTap\(/);
  });

  it('DubDeckStrip effect deps include sidechainSource + sidechainChannelIndex', () => {
    // Need both so a channel-number change re-runs the effect and
    // re-wires the tap.
    const m = DECK_STRIP_SRC.match(/useEffect\(\s*\(\s*\)\s*=>\s*\{[\s\S]*?addSidechainTap[\s\S]*?\},\s*\[([^\]]+)\]\)/);
    expect(m, 'addSidechainTap effect not found').not.toBeNull();
    expect(m![1]).toMatch(/sidechainSource/);
    expect(m![1]).toMatch(/sidechainChannelIndex/);
  });

  it('DubBusPanel surfaces a control for sidechainSource', () => {
    // Choice (or select) bound to sidechainSource — without this the
    // setting is unreachable from the UI.
    expect(PANEL_SRC).toMatch(/sidechainSource/);
    expect(PANEL_SRC).toMatch(/patch\(\s*\{\s*sidechainSource\s*:/);
  });
});
