/**
 * The scratch context is read from the Auto DJ's analysis (owner scratch plan
 * sections 5, 6; ledger SCR-P4.1): grid, phrases, sections and activity
 * timelines come from `DJTrackAnalysis`, nothing is measured again.
 */
import { describe, it, expect } from 'vitest';
import { buildScratchContext, scratchSectionFor, SECTION_OF_KIND } from '../scratchContext';
import { SECTION_KINDS } from '../../autodj/types';
import { fixtureAnalysis, fixturePerf } from './fixtures/analysisFixture';

describe('buildScratchContext (SCR-P4.1)', () => {
  const track = fixtureAnalysis();

  it('bar 17, beat 68 at phrase position 1/8, in the second section', () => {
    // beat 68 = bar 17 beat 0: 0.18 + 68 x 0.5 s
    const t = 0.18 + 68 * 0.5 + 0.01;
    const ctx = buildScratchContext({ perf: fixturePerf(track, t), style: 'boomBap' })!;
    expect(ctx.masterBar).toBe(17);
    expect(Math.floor(ctx.masterBeat)).toBe(68);
    expect(ctx.barInPhrase).toBe(1);
    expect(ctx.phrasePosition).toBeCloseTo(1 / 8, 9);
    expect(ctx.section!.kind).toBe('chorus');
    expect(ctx.sectionName).toBe('hook');
    expect(ctx.nextSection!.kind).toBe('breakdown');
    expect(ctx.bpm).toBe(120);
    expect(ctx.meter).toBe(4);
    expect(ctx.beatConfidence).toBe(0.92);
    expect(ctx.phraseConfidence).toBe(0.85);
  });

  it('vocal activity equals the timeline value at the position; the other activities and the energy are read, not measured', () => {
    const t = 40.2;
    const ctx = buildScratchContext({ perf: fixturePerf(track, t), style: 'battle' })!;
    expect(ctx.vocalActivity).toBe(track.vocalActivity.values[Math.floor(t / 0.5)]);
    expect(ctx.drumActivity).toBe(0.7);
    expect(ctx.bassActivity).toBe(0.6);
    expect(ctx.melodicActivity).toBe(0.2);
    expect(ctx.energy).toBe(0.55);
    expect(ctx.targetEnergy).toBe(0.7);
  });

  it('a transition makes the active deck BOTH and names the decks and the style', () => {
    const perf = fixturePerf(track, 30, { transition: { style: 'blend', outgoingDeck: 'A', incomingDeck: 'B' } as never });
    const ctx = buildScratchContext({ perf, style: 'electro', juggleIntensity: 0.4, scratchPermission: 0.5, memory: { recentGestures: ['chirp'] } })!;
    expect(ctx.activeDeck).toBe('BOTH');
    expect(ctx.outgoingDeck).toBe('A');
    expect(ctx.incomingDeck).toBe('B');
    expect(ctx.transitionType).toBe('blend');
    expect(ctx.juggleIntensity).toBe(0.4);
    expect(ctx.scratchPermission).toBe(0.5);
    expect(ctx.recentGestures).toEqual(['chirp']);
  });

  it('no track, no context; every section kind maps to a reference section', () => {
    expect(buildScratchContext({ perf: fixturePerf(track, 1, { currentTrack: null }), style: 'boomBap' })).toBeNull();
    for (const k of SECTION_KINDS) expect(scratchSectionFor(k), k).toBe(SECTION_OF_KIND[k]);
    expect(scratchSectionFor(undefined)).toBe('A');
  });
});
