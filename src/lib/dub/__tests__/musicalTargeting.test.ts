import { describe, it, expect } from 'vitest';
import { pickTarget } from '../musicalTargeting';
import { buildMusicalChannelProfile } from '../musicalChannelProfile';
import type { MusicalChannelProfile } from '../musicalChannelProfile';

/**
 * Profiles are built through the real Gate C builder with user overrides,
 * which carry confidence 1 — the same path a user-set dubRole takes. The
 * derived fields (importance, density, audibility, repetition) are then set
 * explicitly, because this test is about the CHOICE, not about the estimator.
 */
function profile(
  channel: number,
  overrides: Parameters<typeof buildMusicalChannelProfile>[1],
  derived: Partial<Pick<MusicalChannelProfile, 'importance' | 'density' | 'audibility' | 'repetition'>> = {},
): MusicalChannelProfile {
  const base = buildMusicalChannelProfile({ channel }, overrides);
  return {
    ...base,
    importance: derived.importance ?? 0.5,
    density: derived.density ?? 0.5,
    audibility: derived.audibility ?? 0.8,
    repetition: derived.repetition ?? 0.5,
  };
}

function map(...profiles: MusicalChannelProfile[]): Map<number, MusicalChannelProfile> {
  return new Map(profiles.map(p => [p.channel, p]));
}

describe('pickTarget — ACCENT', () => {
  it('takes the backbeat over an equally audible sustained pad', () => {
    const profiles = map(
      profile(0, { rhythmicRole: 'sustained', instrumentFamily: 'synth' }),
      profile(1, { rhythmicRole: 'backbeat', instrumentFamily: 'drums' }),
    );
    expect(pickTarget('ACCENT', profiles)?.channelId).toBe(1);
  });

  it('prefers the more audible of two backbeats', () => {
    const profiles = map(
      profile(0, { rhythmicRole: 'backbeat', instrumentFamily: 'drums' }, { audibility: 0.2 }),
      profile(2, { rhythmicRole: 'backbeat', instrumentFamily: 'drums' }, { audibility: 0.9 }),
    );
    expect(pickTarget('ACCENT', profiles)?.channelId).toBe(2);
  });

  it('explains itself', () => {
    const profiles = map(profile(1, { rhythmicRole: 'backbeat', instrumentFamily: 'drums' }));
    expect(pickTarget('ACCENT', profiles)?.reason).toMatch(/backbeat drums/);
  });
});

describe('pickTarget — ANSWER', () => {
  it('answers a voice, not the foundation', () => {
    const profiles = map(
      profile(0, { musicalFunction: 'foundation', instrumentFamily: 'bass' }),
      profile(3, { musicalFunction: 'melody', instrumentFamily: 'horn' }),
    );
    expect(pickTarget('ANSWER', profiles)?.channelId).toBe(3);
  });
});

describe('pickTarget — SPACE', () => {
  it('takes the busy inessential part, not the important one', () => {
    const profiles = map(
      profile(0, { musicalFunction: 'foundation' }, { importance: 0.95, density: 0.9 }),
      profile(1, { musicalFunction: 'texture' }, { importance: 0.15, density: 0.8 }),
    );
    expect(pickTarget('SPACE', profiles)?.channelId).toBe(1);
  });
});

describe('pickTarget — DROP', () => {
  it('never drops the foundation: a version without its bass is not a version', () => {
    const profiles = map(
      profile(0, { musicalFunction: 'foundation', instrumentFamily: 'bass' }, { importance: 0.9 }),
    );
    expect(pickTarget('DROP', profiles)).toBeNull();
  });

  it('never drops a sub-register channel either, however it is labelled', () => {
    const profiles = map(profile(0, { musicalFunction: 'melody', register: 'sub' }));
    expect(pickTarget('DROP', profiles)).toBeNull();
  });

  it('takes the melody and leaves the riddim', () => {
    const profiles = map(
      profile(0, { musicalFunction: 'foundation', instrumentFamily: 'bass' }),
      profile(1, { musicalFunction: 'melody' }, { importance: 0.8 }),
      profile(2, { musicalFunction: 'texture' }, { importance: 0.3 }),
    );
    expect(pickTarget('DROP', profiles)?.channelId).toBe(1);
  });
});

describe('pickTarget — BUILD and TEXTURE and TRANSITION', () => {
  it('builds on something sustained rather than on a one-shot hit', () => {
    const profiles = map(
      profile(0, { rhythmicRole: 'downbeat', instrumentFamily: 'drums' }),
      profile(1, { rhythmicRole: 'sustained', musicalFunction: 'harmony' }),
    );
    expect(pickTarget('BUILD', profiles)?.channelId).toBe(1);
  });

  it('colours something audible and repetitive', () => {
    const profiles = map(
      profile(0, {}, { audibility: 0.2, repetition: 0.1 }),
      profile(1, {}, { audibility: 0.9, repetition: 0.9 }),
    );
    expect(pickTarget('TEXTURE', profiles)?.channelId).toBe(1);
  });

  it('marks a seam on the most important part', () => {
    const profiles = map(
      profile(0, {}, { importance: 0.2 }),
      profile(1, {}, { importance: 0.95 }),
    );
    expect(pickTarget('TRANSITION', profiles)?.channelId).toBe(1);
  });
});

describe('pickTarget — refusing to aim', () => {
  it('returns null for REST and RESET, which target nothing', () => {
    const profiles = map(profile(0, { rhythmicRole: 'backbeat' }));
    expect(pickTarget('REST', profiles)).toBeNull();
    expect(pickTarget('RESET', profiles)).toBeNull();
  });

  it('ignores a channel nobody can hear', () => {
    const profiles = map(
      profile(0, { rhythmicRole: 'backbeat', instrumentFamily: 'drums' }, { audibility: 0 }),
    );
    expect(pickTarget('ACCENT', profiles)).toBeNull();
  });

  it('honours the exclusion set', () => {
    const profiles = map(
      profile(0, { rhythmicRole: 'backbeat', instrumentFamily: 'drums' }),
      profile(1, { rhythmicRole: 'offbeat', instrumentFamily: 'guitar' }),
    );
    expect(pickTarget('ACCENT', profiles, { exclude: new Set([0]) })?.channelId).toBe(1);
  });

  it('returns null when everything is excluded', () => {
    const profiles = map(profile(0, { rhythmicRole: 'backbeat' }));
    expect(pickTarget('ACCENT', profiles, { exclude: new Set([0]) })).toBeNull();
  });

  it('returns null on an empty arrangement', () => {
    expect(pickTarget('ACCENT', new Map())).toBeNull();
  });
});

describe('pickTarget — confidence', () => {
  it('does not let an unconfident axis steer the choice', () => {
    // Channel 0 is labelled backbeat by the user (confidence 1); channel 1 has
    // no evidence at all, so its axes fall back and it scores low.
    const confident = profile(0, { rhythmicRole: 'backbeat', instrumentFamily: 'drums' });
    const vague = buildMusicalChannelProfile({ channel: 1 });
    const profiles = map(confident, { ...vague, audibility: 0.9, importance: 0.5, density: 0.5, repetition: 0.5 });
    expect(pickTarget('ACCENT', profiles)?.channelId).toBe(0);
  });

  it('can be told to demand more confidence before acting on an axis', () => {
    const p = profile(0, { rhythmicRole: 'backbeat', instrumentFamily: 'drums' });
    // A user override carries confidence 1, so even a strict threshold keeps it.
    expect(pickTarget('ACCENT', map(p), { minConfidence: 0.99 })?.channelId).toBe(0);
  });
});
