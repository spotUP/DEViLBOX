/**
 * G16 — character-preset / user-edit coherence.
 *
 * Locks the rule: the VOICE dropdown must never lie. If the current
 * `characterPreset` says "Tubby" but one of the preset-owned fields
 * (echoWet, bassShelfGainDb, returnGain, …) has been edited, the state
 * is incoherent and the reported preset name misleads the user into
 * thinking the settings still match the preset.
 *
 * Fix: `setDubBus` auto-flips `characterPreset` to 'custom' whenever a
 * patch without an explicit `characterPreset` touches any field that
 * appears in at least one preset's `overrides`.
 *
 * Non-character fields (e.g. `enabled`, `armed`) can be patched without
 * flipping — they're global/behavioral, independent of voicing.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useDrumPadStore } from '../useDrumPadStore';
import { DEFAULT_DUB_BUS, DUB_CHARACTER_PRESETS } from '../../types/dub';

function resetToTubby() {
  // Load Tubby cleanly through setDubBus so the preset overrides apply
  // consistently. This is the starting state every test in this file
  // assumes — user has just picked "Tubby" from the VOICE dropdown.
  useDrumPadStore.setState({ dubBus: { ...DEFAULT_DUB_BUS } });
  useDrumPadStore.getState().setDubBus({ characterPreset: 'tubby' });
}

describe('useDrumPadStore — character/edit coherence (G16)', () => {
  beforeEach(resetToTubby);

  it('loading a preset still works (no regression)', () => {
    const s = useDrumPadStore.getState().dubBus;
    expect(s.characterPreset).toBe('tubby');
    // Verify at least one Tubby-specific override made it through.
    expect(s.echoWet).toBe(DUB_CHARACTER_PRESETS.tubby.overrides.echoWet);
  });

  it('editing a character field without characterPreset auto-flips to custom', () => {
    // returnGain is in every preset's overrides, so it's a character field.
    useDrumPadStore.getState().setDubBus({ returnGain: 0.5 });
    expect(useDrumPadStore.getState().dubBus.characterPreset).toBe('custom');
    expect(useDrumPadStore.getState().dubBus.returnGain).toBe(0.5);
  });

  it('editing echoWet without characterPreset auto-flips to custom', () => {
    useDrumPadStore.getState().setDubBus({ echoWet: 0.12 });
    const s = useDrumPadStore.getState().dubBus;
    expect(s.characterPreset).toBe('custom');
    expect(s.echoWet).toBe(0.12);
  });

  it('editing bassShelfGainDb without characterPreset auto-flips to custom', () => {
    useDrumPadStore.getState().setDubBus({ bassShelfGainDb: 0 });
    expect(useDrumPadStore.getState().dubBus.characterPreset).toBe('custom');
  });

  it('non-character field (enabled) does NOT flip the preset', () => {
    const before = useDrumPadStore.getState().dubBus.characterPreset;
    useDrumPadStore.getState().setDubBus({ enabled: false });
    expect(useDrumPadStore.getState().dubBus.characterPreset).toBe(before);
    expect(useDrumPadStore.getState().dubBus.enabled).toBe(false);
  });

  it('already-custom preset stays custom when a character field is edited', () => {
    useDrumPadStore.getState().setDubBus({ characterPreset: 'custom' });
    expect(useDrumPadStore.getState().dubBus.characterPreset).toBe('custom');
    useDrumPadStore.getState().setDubBus({ returnGain: 0.4 });
    expect(useDrumPadStore.getState().dubBus.characterPreset).toBe('custom');
  });

  it('explicit characterPreset in the patch wins (loading a different preset)', () => {
    // User was on Tubby, picks Scientist directly — no auto-flip
    // intermediate step, Scientist overrides land cleanly.
    useDrumPadStore.getState().setDubBus({ characterPreset: 'scientist' });
    const s = useDrumPadStore.getState().dubBus;
    expect(s.characterPreset).toBe('scientist');
    expect(s.echoWet).toBe(DUB_CHARACTER_PRESETS.scientist.overrides.echoWet);
  });

  it('explicit characterPreset: custom in the patch preserves user edits', () => {
    // Legacy UI paths pass `{ someField, characterPreset: 'custom' }`.
    // The auto-flip must be compatible with this pattern — not override
    // the explicit 'custom' back to the previous preset.
    useDrumPadStore.getState().setDubBus({ returnGain: 0.33, characterPreset: 'custom' });
    expect(useDrumPadStore.getState().dubBus.characterPreset).toBe('custom');
    expect(useDrumPadStore.getState().dubBus.returnGain).toBe(0.33);
  });

  it('mixed patch (character field + non-character field, no characterPreset) flips', () => {
    // Realistic case: one UI component updates both enabled and returnGain
    // in the same patch. As long as any character field is touched, we flip.
    useDrumPadStore.getState().setDubBus({ enabled: true, returnGain: 0.6 });
    expect(useDrumPadStore.getState().dubBus.characterPreset).toBe('custom');
    expect(useDrumPadStore.getState().dubBus.enabled).toBe(true);
    expect(useDrumPadStore.getState().dubBus.returnGain).toBe(0.6);
  });

  it('patch of purely non-character fields on a preset keeps the preset name', () => {
    // enabled + armed-adjacent behavioral fields. Must not flip.
    useDrumPadStore.getState().setDubBus({ enabled: true });
    expect(useDrumPadStore.getState().dubBus.characterPreset).toBe('tubby');
  });
});
