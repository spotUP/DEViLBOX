/**
 * Contract tests for AutoDubPanel's persona handling.
 *
 * 2026-04-25 design: when the user picks a persona, the bus character preset is
 * auto-applied IF the current preset is 'custom' (safe — no hand-tuning) OR
 * already matches the persona's preset (no-op). Any other preset is left
 * untouched so users who deliberately chose a different sound aren't clobbered.
 *
 * Text-level assertions — no React Testing Library, no DOM, runs in <50 ms.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

describe('AutoDubPanel — persona/voice separation contract', () => {
  const src = read('components/dub/AutoDubPanel.tsx');

  it('handlePersonaChange applies preset conditionally (custom or same preset only)', () => {
    // handlePersonaChange must check the CURRENT characterPreset before applying,
    // so it never silently clobbers a hand-tuned voicing.
    const handlerMatch = src.match(/const\s+handlePersonaChange\s*=\s*useCallback\([\s\S]*?\},\s*\[[^\]]*\]\);/);
    expect(handlerMatch, 'handlePersonaChange should exist').not.toBeNull();
    const handlerBody = handlerMatch![0];
    // Must check currentPreset before applying
    expect(handlerBody).toMatch(/currentPreset/);
    // Must guard with 'custom' check so hand-tuned voicings survive
    expect(handlerBody).toMatch(/'custom'/);
  });

  it('does NOT render an unconditional ♫ apply button (auto-apply handles it)', () => {
    // The ♫ button was removed when auto-apply landed in handlePersonaChange.
    // A ♫ button that fires WITHOUT checking the current preset is the bug
    // from 2026-04-21. The button is no longer needed.
    expect(src).not.toMatch(/onClick=\{applyPersonaVoice\}/);
  });
});

describe('DubBus.ts — tubbyScream stability contract', () => {
  const src = read('engine/dub/DubBus.ts');

  it('bandpass Q is capped at ≤2.5 to avoid Chromium "state is bad" on every fire', () => {
    // The startTubbyScream bp.Q.value must stay ≤2.5. Above Q~3 with a
    // loop-gain>1 feedback path, Chromium resets filter state every fire
    // and logs "BiquadFilterNode: state is bad". Verified empirically on
    // 2026-04-21: Q=3.5 → 100% warn rate, Q=2.2 → 0% warn rate.
    const scream = src.match(/startTubbyScream[\s\S]*?bp\.Q\.value\s*=\s*([0-9.]+)/);
    expect(scream, 'startTubbyScream must set bp.Q.value').not.toBeNull();
    const qValue = parseFloat(scream![1]);
    expect(qValue).toBeLessThanOrEqual(2.5);
  });

  it('holds feedback gain at 0 for ≥20 ms after connect before ramping above unity', () => {
    // Give the filter a few render quanta of clean signal before the loop
    // closes at gain > 1, otherwise state blows up in the first ~3 ms.
    const holdMatch = src.match(/tap\.gain\.setValueAtTime\(0,\s*now\s*\+\s*(0\.\d+)\)/);
    expect(holdMatch, 'tap.gain must have a setValueAtTime(0, now + delay) hold').not.toBeNull();
    const holdSec = parseFloat(holdMatch![1]);
    expect(holdSec).toBeGreaterThanOrEqual(0.02);
  });
});
