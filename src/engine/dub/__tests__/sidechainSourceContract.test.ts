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

  it('DubDeckStrip calls addSidechainTap when sidechainSource is "channel"', () => {
    // The effect must check the source value and call addSidechainTap.
    // Accept either `sidechainSource !== 'channel'` (early-return guard)
    // or `=== 'channel'` (positive branch) — both signal the check.
    expect(DECK_STRIP_SRC).toMatch(/(sidechainSource\s*(!==|===)\s*['"]channel['"])|(source\s*(!==|===)\s*['"]channel['"])/);
    expect(DECK_STRIP_SRC).toMatch(/addSidechainTap\(/);
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
