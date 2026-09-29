/**
 * MasterEffectsPanel fingerprint matching contract test.
 *
 * Guards: the activePresetName is derived from the current masterEffects
 * chain via fingerprinting (useMemo), NOT ephemeral useState. This ensures
 * the displayed preset name survives page reloads, manual parameter edits,
 * and cloud sync. The prior bug caused activePresetName to always show null
 * after a reload because useState initialized to null.
 *
 * 2026-09-29: the fingerprint algorithm itself moved to the shared
 * masterPresetSearch.ts helper (matchMasterPresetName / fingerprintMasterEffects)
 * so MasterEffectsModal can show the same "Presets: <name>" label off the same
 * fingerprint — single source of truth instead of a second inline copy. The
 * literal-source checks for the algorithm moved with it to that file; the
 * useMemo/useState guard on MasterEffectsPanel.tsx stays as-is, since the bug
 * that guard prevents was about *where* the value lives, not the algorithm.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';

describe('MasterEffectsPanel preset display', () => {
  const source = fs.readFileSync('src/components/effects/MasterEffectsPanel.tsx', 'utf-8');
  const helperSource = fs.readFileSync('src/components/effects/masterPresetSearch.ts', 'utf-8');

  it('derives activePresetName via useMemo, not useState', () => {
    // Must use useMemo for derived state
    expect(source).toContain('const activePresetName = useMemo(');
    // Must NOT have a useState for activePresetName
    expect(source).not.toContain('useState<string | null>(null)');
    // Must NOT have setActivePresetName calls
    expect(source).not.toContain('setActivePresetName');
  });

  it('wires the shared fingerprint matcher to both factory and user presets', () => {
    expect(source).toContain('matchMasterPresetName(');
    expect(source).toContain('MASTER_FX_PRESETS');
    expect(source).toContain('userPresets');
  });

  it('fingerprints effects by type + enabled + sorted params (shared helper)', () => {
    // The shared fingerprint function must sort parameter keys for stable comparison
    expect(helperSource).toContain('Object.keys(params).sort()');
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
