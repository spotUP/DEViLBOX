/**
 * "the master fx button in the main ui needs an active state" (2026-10-08):
 * four master effects were on and the main UI showed nothing.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { masterFxButtonState } from '../masterFxButtonState';

describe('Master FX button', () => {
  it('shows the active state and count when the chain has enabled effects', () => {
    const s = masterFxButtonState([{ type: 'EQ3', enabled: true }, { type: 'Chorus', enabled: true }, { type: 'Compressor', enabled: false }], false);
    expect(s.activeCount).toBe(2);
    expect(s.label).toBe('Master FX (2)');
    expect(s.toneClass).toMatch(/text-accent-warning/);
    // The button keeps its normal background; only the text and border mark it active.
    expect(s.toneClass).toMatch(/bg-dark-bgSecondary/);
    expect(s.title).toMatch(/EQ3, Chorus/);
  });

  it('looks idle with no enabled effects, and as open while its panel is open', () => {
    expect(masterFxButtonState([], false).toneClass).toMatch(/bg-dark-bgSecondary/);
    expect(masterFxButtonState([{ type: 'X', enabled: false }], false).label).toBe('Master FX');
    expect(masterFxButtonState([{ type: 'EQ3', enabled: true }], true).toneClass).toMatch(/accent-primary/);
  });

  it('is wired to the live master chain in the main controls bar', () => {
    const src = readFileSync(resolve(__dirname, '../../../components/tracker/EditorControlsBar.tsx'), 'utf8');
    expect(src).toMatch(/masterFxButtonState\(useAudioStore\(s => s\.masterEffects\)/);
    expect(src).toMatch(/\{masterFx\.label\}/);
  });
});
