/**
 * MasterEffectsPanel fingerprint matching contract test.
 *
 * Guards: the activePresetName is derived from the current masterEffects
 * chain via fingerprinting (useMemo), NOT ephemeral useState. This ensures
 * the displayed preset name survives page reloads, manual parameter edits,
 * and cloud sync. The prior bug caused activePresetName to always show null
 * after a reload because useState initialized to null.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';

describe('MasterEffectsPanel preset display', () => {
  const source = fs.readFileSync('src/components/effects/MasterEffectsPanel.tsx', 'utf-8');

  it('derives activePresetName via useMemo, not useState', () => {
    // Must use useMemo for derived state
    expect(source).toContain('const activePresetName = useMemo(');
    // Must NOT have a useState for activePresetName
    expect(source).not.toContain('useState<string | null>(null)');
    // Must NOT have setActivePresetName calls
    expect(source).not.toContain('setActivePresetName');
  });

  it('fingerprints effects by type + enabled + sorted params', () => {
    // The fingerprint function must sort parameter keys for stable comparison
    expect(source).toContain('Object.keys(params).sort()');
    // Must compare against both factory and user presets
    expect(source).toContain('MASTER_FX_PRESETS');
    expect(source).toContain('userPresets');
  });

  it('imports useMemo from React', () => {
    expect(source).toMatch(/import.*useMemo.*from 'react'/);
  });

  it('uses design token classes, not hardcoded green colors', () => {
    // Must use accent-success token, not raw green-*
    expect(source).not.toContain('text-green-400');
    expect(source).not.toContain('bg-green-950');
    expect(source).not.toContain('border-green-600');
    expect(source).toContain('accent-success');
  });
});
