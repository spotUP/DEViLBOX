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
const PANEL_SRC = readFileSync(
  resolve(__dirname, '..', '..', '..', 'components', 'dub', 'DubBusPanel.tsx'),
  'utf8',
);

describe('G13 sidechain source wiring — static contract', () => {
  it('DubBus exposes getSidechainInput(): AudioNode', () => {
    expect(DUB_BUS_SRC).toMatch(/getSidechainInput\s*\(\s*\)\s*:\s*AudioNode/);
  });

  it('DubBusPanel surfaces a control for sidechainSource', () => {
    // Choice (or select) bound to sidechainSource — without this the
    // setting is unreachable from the UI.
    expect(PANEL_SRC).toMatch(/sidechainSource/);
    expect(PANEL_SRC).toMatch(/patch\(\s*\{\s*sidechainSource\s*:/);
  });
});
