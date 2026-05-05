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
import { getAutoDubSeedChannelCount, getAutoDubSeedSendLevel } from '../AutoDubPanel';
import { resolveCurrentDubStyle } from '../DubDeckStrip';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

describe('AutoDubPanel — persona/voice separation contract', () => {
  const dubDeckSrc = read('components/dub/DubDeckStrip.tsx');

  it('applyStyle in DubDeckStrip applies both character preset and persona', () => {
    // The unified applyStyle function (replaced the old VOICE dropdown + persona selector)
    // must apply both: character preset to the bus AND the persona to AutoDub.
    const handlerMatch = dubDeckSrc.match(/const\s+applyStyle\s*=\s*useCallback\([\s\S]*?\},\s*\[[^\]]*\]\);/);
    expect(handlerMatch, 'applyStyle should exist in DubDeckStrip').not.toBeNull();
    const handlerBody = handlerMatch![0];
    // Must set character preset
    expect(handlerBody).toMatch(/setDubBus/);
    // Must set persona
    expect(handlerBody).toMatch(/setAutoDubPersona/);
  });

  it('does NOT render an unconditional ♫ apply button (applyStyle handles it)', () => {
    // The separate ♫ button was removed. applyStyle now applies BOTH the character
    // preset AND persona together. No free-standing ♫ button should exist.
    expect(dubDeckSrc).not.toMatch(/onClick=\{applyPersonaVoice\}/);
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

describe('AutoDubPanel — channel seeding regression', () => {
  it('seeds only the loaded pattern channels when the mixer has more slots', () => {
    expect(getAutoDubSeedChannelCount(4, 16)).toBe(4);
  });

  it('falls back to mixer channels when no pattern channel count is available', () => {
    expect(getAutoDubSeedChannelCount(undefined, 16)).toBe(16);
  });

  it('caps hot preset sends so AutoDub startup does not flood the wet return', () => {
    expect(getAutoDubSeedSendLevel(1.0)).toBe(0.45);
    expect(getAutoDubSeedSendLevel(0.85)).toBe(0.425);
  });

  it('keeps low preset sends audible instead of collapsing to near-zero', () => {
    expect(getAutoDubSeedSendLevel(0.2)).toBe(0.15);
  });
});

describe('AutoDubPanel — enable behavior regression', () => {
  const panelSrc = read('components/dub/AutoDubPanel.tsx');

  it('starts the AutoDub loop directly instead of launching a playback scrub when enabled', () => {
    expect(panelSrc).toContain('startAutoDub();');
    expect(panelSrc).not.toContain('runChannelAudioScrub(');
    expect(panelSrc).not.toContain('cancelChannelScrub(');
    expect(panelSrc).not.toContain('Analyzing...');
  });
});

describe('DubDeckStrip — style resolution regression', () => {
  it('uses the persona style when the bus is custom but AutoDub persona is still non-custom', () => {
    expect(resolveCurrentDubStyle('custom', 'perry').id).toBe('perry');
  });

  it('uses the bus preset style when preset and persona have drifted', () => {
    expect(resolveCurrentDubStyle('scientist', 'perry').id).toBe('scientist');
  });

  it('falls back to Custom instead of Tubby when neither preset nor persona map cleanly', () => {
    expect(resolveCurrentDubStyle(undefined, 'custom').id).toBe('custom');
  });
});
