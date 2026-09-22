import { describe, it, expect } from 'vitest';
import { buildDubTargetProfile, rankChannelsForTarget } from '../dubTargetProfile';
import type { MusicalChannelProfile } from '../musicalChannelProfile';

/**
 * What each channel is GOOD FOR, as opposed to what it IS.
 *
 * AutoDub decided by switching on `channelRole === 'percussion'`, which is why
 * it treats a kick and a hi-hat identically and why a tune whose channels all
 * classify as `bass` produces a `riddimSection` that mutes nothing. These
 * assert the judgements a dub engineer would actually make, and — more
 * importantly — what happens when the classifier is NOT sure.
 */

function profile(over: Partial<MusicalChannelProfile> = {}, conf = 0.9): MusicalChannelProfile {
  const axis = <T,>(value: T) => ({ value, confidence: conf, source: 'notes' as const });
  return {
    channel: 0,
    instrumentFamily: axis('keys'),
    musicalFunction: axis('harmony'),
    rhythmicRole: axis('offbeat'),
    register: axis('mid'),
    importance: 0.5,
    density: 0.3,
    audibility: 0.8,
    repetition: 0.7,
    ...over,
  } as MusicalChannelProfile;
}

const bass = () => profile({
  instrumentFamily: { value: 'bass', confidence: 0.9, source: 'notes' },
  musicalFunction: { value: 'foundation', confidence: 0.9, source: 'notes' },
  register: { value: 'low', confidence: 0.9, source: 'notes' },
  rhythmicRole: { value: 'downbeat', confidence: 0.9, source: 'rhythm' },
  importance: 0.9,
});

const skank = () => profile({
  instrumentFamily: { value: 'piano', confidence: 0.9, source: 'instrument' },
  musicalFunction: { value: 'harmony', confidence: 0.9, source: 'notes' },
  register: { value: 'mid', confidence: 0.9, source: 'notes' },
  rhythmicRole: { value: 'offbeat', confidence: 0.9, source: 'rhythm' },
  density: 0.25,
});

const pad = () => profile({
  instrumentFamily: { value: 'synth', confidence: 0.9, source: 'instrument' },
  musicalFunction: { value: 'texture', confidence: 0.9, source: 'notes' },
  register: { value: 'mid', confidence: 0.9, source: 'notes' },
  rhythmicRole: { value: 'sustained', confidence: 0.9, source: 'rhythm' },
  density: 0.8,
});

describe('what to echo', () => {
  it('prefers the offbeat skank over the bassline', () => {
    // Echoing the foundation fills every gap the groove needs. This is the
    // single most basic judgement in dub and AutoDub could not make it.
    const s = buildDubTargetProfile(skank()).targets.echoThrow;
    const b = buildDubTargetProfile(bass()).targets.echoThrow;
    expect(s).toBeGreaterThan(b);
  });

  it('prefers a sparse part over a dense one', () => {
    const sparse = buildDubTargetProfile(profile({ density: 0.1 })).targets.echoThrow;
    const dense = buildDubTargetProfile(profile({ density: 0.9 })).targets.echoThrow;
    expect(sparse).toBeGreaterThan(dense);
  });
});

describe('what to drop the filter over', () => {
  it('prefers the foundation, where the move actually bites', () => {
    const b = buildDubTargetProfile(bass()).targets.filterDrop;
    const s = buildDubTargetProfile(skank()).targets.filterDrop;
    expect(b).toBeGreaterThan(s);
  });
});

describe('what to drown in reverb', () => {
  it('prefers texture and refuses the foundation', () => {
    const p = buildDubTargetProfile(pad()).targets.ghostReverb;
    const b = buildDubTargetProfile(bass()).targets.ghostReverb;
    expect(p).toBeGreaterThan(b);
  });
});

describe('what a version drop keeps', () => {
  it('keeps the foundation and lets the decoration go', () => {
    const b = buildDubTargetProfile(bass()).targets.versionDropKeep;
    const p = buildDubTargetProfile(pad()).targets.versionDropKeep;
    expect(b).toBeGreaterThan(p);
  });
});

describe('when the classifier is not sure', () => {
  const unsure = () => profile({}, 0.2);

  it('reports low certainty rather than a confident-looking profile', () => {
    expect(buildDubTargetProfile(unsure()).certainty).toBeLessThan(0.3);
    expect(buildDubTargetProfile(profile()).certainty).toBeGreaterThan(0.8);
  });

  it('keeps reversible moves usable instead of silencing the performer', () => {
    // Scoring everything zero on an unidentified channel would make AutoDub
    // do nothing on exactly the tunes the classifier finds hardest.
    const t = buildDubTargetProfile(unsure()).targets;
    expect(t.echoThrow).toBeGreaterThan(0.2);
    expect(t.hpfRise).toBeGreaterThan(0.2);
  });

  it('treats uncertainty as a REASON not to do something destructive', () => {
    const unsureRisk = buildDubTargetProfile(unsure()).risks.destructiveRisk;
    const sureRisk = buildDubTargetProfile(skank()).risks.destructiveRisk;
    expect(unsureRisk).toBeGreaterThan(sureRisk);
  });
});

describe('risks', () => {
  it('flags the low end where the low end is', () => {
    expect(buildDubTargetProfile(bass()).risks.lowEndRisk)
      .toBeGreaterThan(buildDubTargetProfile(skank()).risks.lowEndRisk);
  });

  it('flags a dense sustained part as likely to mask others', () => {
    expect(buildDubTargetProfile(pad()).risks.maskingRisk)
      .toBeGreaterThan(buildDubTargetProfile(skank()).risks.maskingRisk);
  });
});

describe('choosing between channels', () => {
  const profiles = [
    buildDubTargetProfile({ ...bass(), channel: 0 }),
    buildDubTargetProfile({ ...skank(), channel: 1 }),
    buildDubTargetProfile({ ...pad(), channel: 2 }),
  ];

  it('ranks best first for the named move', () => {
    expect(rankChannelsForTarget(profiles, 'echoThrow')[0].channelId).toBe(1);
    expect(rankChannelsForTarget(profiles, 'filterDrop')[0].channelId).toBe(0);
  });

  it('never aims a move at a channel that is silent right now', () => {
    // A move aimed at silence is the no-op that made AutoDub look broken.
    const withSilent = [
      buildDubTargetProfile({ ...skank(), channel: 1 }, { playingNow: false }),
      buildDubTargetProfile({ ...pad(), channel: 2 }, { playingNow: true }),
    ];
    const ranked = rankChannelsForTarget(withSilent, 'echoThrow');
    expect(ranked.map(p => p.channelId)).toEqual([2]);
  });

  it('can refuse everything below a certainty the caller sets', () => {
    const vague = [buildDubTargetProfile(profile({ channel: 4 }, 0.2))];
    expect(rankChannelsForTarget(vague, 'echoThrow', { minCertainty: 0.6 })).toEqual([]);
  });

  it('can refuse channels too risky to touch destructively', () => {
    const ranked = rankChannelsForTarget(profiles, 'versionDropKeep', { maxDestructiveRisk: 0.3 });
    expect(ranked.every(p => p.risks.destructiveRisk <= 0.3)).toBe(true);
  });
});

describe('availability without a timeline', () => {
  it('assumes the channel is playing rather than refusing to act', () => {
    expect(buildDubTargetProfile(profile()).availability.playingNow).toBe(true);
  });
});
