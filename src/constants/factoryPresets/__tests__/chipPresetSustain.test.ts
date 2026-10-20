import { describe, it, expect } from 'vitest';
import { CHIP_PRESETS } from '../chip';

// A held key on a ChipSynth lead, pad, bass or arp preset must keep sounding
// (and keep the arpeggio audible) until release. Only stab and percussion
// presets decay to silence by design.
const PLUCKS = new Set(['Fast Maj9 Stab', 'Noise Snare']);

describe('ChipSynth factory presets sustain a held key', () => {
  it('every non-pluck preset has amplitude sustain above 0', () => {
    const offenders = CHIP_PRESETS
      .filter((p) => !PLUCKS.has(p.name ?? ''))
      .filter((p) => !((p.chipSynth?.envelope?.sustain ?? 0) > 0))
      .map((p) => p.name);
    expect(offenders).toEqual([]);
  });

  it('stab and percussion presets stay plucks', () => {
    for (const p of CHIP_PRESETS.filter((p) => PLUCKS.has(p.name ?? ''))) {
      expect(p.chipSynth?.envelope?.sustain).toBe(0);
    }
  });
});
