/**
 * Contract tests for AutoDubPanel's persona handling.
 *
 * Persona pick used to auto-apply the matching bus VOICE character preset
 * (via setDubBus({ characterPreset })), silently clobbering hand-tuned
 * voicings. Verified 2026-04-21 with Playwright on world-class-dub.mod:
 * changing persona while voice=scientist wiped voice to the persona's
 * suggested preset.
 *
 * The fix separates the two: `handlePersonaChange` only sets persona +
 * intensity. The new `applyPersonaVoice` handler is bound to a dedicated
 * "♫" button that the user must click explicitly.
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

  it('defines a separate applyPersonaVoice handler', () => {
    expect(src).toMatch(/const\s+applyPersonaVoice\s*=\s*useCallback/);
  });

  it('applyPersonaVoice is the ONLY handler that calls setDubBus with characterPreset', () => {
    // Find the body of handlePersonaChange — it must NOT include setDubBus(...)
    const handlerMatch = src.match(/const\s+handlePersonaChange\s*=\s*useCallback\([\s\S]*?\},\s*\[[^\]]*\]\);/);
    expect(handlerMatch, 'handlePersonaChange should exist').not.toBeNull();
    const handlerBody = handlerMatch![0];
    expect(
      handlerBody,
      'handlePersonaChange must NOT call setDubBus — that silently clobbered hand-tuned voicings'
    ).not.toMatch(/setDubBus\s*\(/);
    expect(handlerBody).not.toMatch(/characterPreset/);
  });

  it('applyPersonaVoice is gated on suggestedCharacterPreset', () => {
    const handlerMatch = src.match(/const\s+applyPersonaVoice\s*=\s*useCallback\([\s\S]*?\},\s*\[[^\]]*\]\);/);
    expect(handlerMatch, 'applyPersonaVoice should exist').not.toBeNull();
    const body = handlerMatch![0];
    expect(body).toMatch(/suggestedCharacterPreset/);
    expect(body).toMatch(/setDubBus\s*\(\s*\{\s*characterPreset\s*:/);
  });

  it('renders the ♫ button only when the current persona has a suggestedCharacterPreset', () => {
    // Button render guarded so Custom persona (suggestedCharacterPreset: null) has no button.
    expect(src).toMatch(/getPersona\(persona\)\.suggestedCharacterPreset\s*&&[\s\S]*?♫/);
  });

  it('♫ button onClick wires to applyPersonaVoice (not handlePersonaChange)', () => {
    const buttonMatch = src.match(/<button[^>]*onClick=\{applyPersonaVoice\}[\s\S]*?♫[\s\S]*?<\/button>/);
    expect(buttonMatch, '♫ button must call applyPersonaVoice').not.toBeNull();
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
