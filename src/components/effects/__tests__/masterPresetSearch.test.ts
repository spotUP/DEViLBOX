/**
 * The master preset picker's search (owner ask 2026-09-29: "we have so many
 * it's hard to navigate"): every word must match the preset's name,
 * description, category or one of its effects.
 */
import { describe, it, expect } from 'vitest';
import { MASTER_FX_PRESETS } from '@constants/fxPresets';
import { groupMasterPresets, filterUserPresets } from '../masterPresetSearch';

const names = (q: string) => groupMasterPresets(MASTER_FX_PRESETS, q).flatMap(([, ps]) => ps.map((p) => p.name));

describe('master preset search', () => {
  it('an empty query lists every preset, grouped and sorted', () => {
    expect(names('').length).toBe(MASTER_FX_PRESETS.length);
    const cats = groupMasterPresets(MASTER_FX_PRESETS, '').map(([c]) => c);
    expect(cats).toEqual([...cats].sort((a, b) => a.localeCompare(b)));
  });

  it('finds presets by category, by name words in any order, and by the effects they use', () => {
    expect(names('modern')).toEqual(expect.arrayContaining(['Modern Precision', 'Modern Club Pump', 'Modern Glue & Air', 'Modern Amiga Master']));
    expect(names('pump club')).toContain('Modern Club Pump');
    expect(names('sidechaincompressor').length).toBeGreaterThanOrEqual(4);
    expect(names('no such preset anywhere')).toEqual([]);
  });

  it('filters user presets by name', () => {
    expect(filterUserPresets([{ name: 'My Gig Master' }, { name: 'Dub Room' }], 'gig').map((p) => p.name)).toEqual(['My Gig Master']);
  });
});
