import { describe, it, expect } from 'vitest';
import { getGroupedPresets, SYSTEM_PRESETS } from '../systemPresets';

describe('getGroupedPresets', () => {
  it('puts every system preset except none in exactly one group', () => {
    const ids = getGroupedPresets().flatMap((g) => g.presets.map((p) => p.id));
    expect(ids.length).toBe(new Set(ids).size);
    expect(new Set(ids)).toEqual(new Set(SYSTEM_PRESETS.map((p) => p.id).filter((id) => id !== 'none')));
  });

  it('lists the CoSo preset once, under Amiga / UADE', () => {
    const hits = getGroupedPresets().flatMap((g) =>
      g.presets.filter((p) => p.id === 'uade_hippelcoso').map(() => g.label));
    expect(hits).toEqual(['Amiga / UADE']);
  });

  it('keeps the SID chips in the Commodore group', () => {
    const commodore = getGroupedPresets().find((g) => g.label === 'Commodore');
    expect(commodore?.presets.map((p) => p.id)).toContain('c64_6581');
  });
});
