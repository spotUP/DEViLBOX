import { describe, it, expect } from 'vitest';
import * as defaults from '../instrument/defaults';

// A key held for a live note must keep sounding: no default amplitude envelope
// may decay to silence (sustain 0) while the key is down.
// Percussion voices decay by design.
const PERCUSSIVE = new Set(['DEFAULT_SYNARE']);

describe('default amplitude envelopes sustain a held key', () => {
  it('DEFAULT_ENVELOPE sustains', () => {
    expect(defaults.DEFAULT_ENVELOPE.sustain).toBeGreaterThan(0);
  });

  it('every DEFAULT_* config with an amplitude envelope sustains', () => {
    const offenders: string[] = [];
    for (const [name, value] of Object.entries(defaults)) {
      const env = (value as { envelope?: { sustain?: number } } | null)?.envelope;
      if (name.startsWith('DEFAULT_') && !PERCUSSIVE.has(name) && env && typeof env.sustain === 'number' && env.sustain <= 0) {
        offenders.push(name);
      }
    }
    expect(offenders).toEqual([]);
  });
});
