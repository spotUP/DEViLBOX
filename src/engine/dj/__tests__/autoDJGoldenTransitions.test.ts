/**
 * Golden transition corpus (plan sections 41, 42, 43; Gate T, Gate N):
 * known-good transition situations that must plan as the named style, score
 * above the quality bar in the offline evaluator and pass the automated
 * invariants. Objective regression tests, run on every change.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { corpusAnalysis, type CorpusId } from '../autodj/testing/corpus';
import { planTransition, type TransitionPlanInput } from '../autodj/transitionPlanner';
import { evaluateTransition, checkInvariants } from '../autodj/transitionQuality';
import { getStyle } from '../autodj/styleProfiles';
import { DJSessionMemory } from '../autodj/sessionMemory';
import type { DJTrackAnalysis, DJStyleName, SessionMemorySnapshot, TransitionStyle } from '../autodj/types';

interface Golden {
  name: string;
  outgoing: CorpusId;
  incoming: CorpusId;
  style: DJStyleName;
  creativeRisk: number;
  position: number;
  expect: TransitionStyle[];
  minQuality: number;
  setPhase?: string;
  smartCuts?: boolean;
  userBars?: number;
  memory?: (m: DJSessionMemory) => void;
  mutate?: (out: DJTrackAnalysis, inc: DJTrackAnalysis) => void;
  bridge?: boolean;
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const GOLDEN: Golden[] = [
  { name: 'long blend: compatible drums and keys with room on both sides', outgoing: 'steady', incoming: 'compatibleKey', style: 'Progressive', creativeRisk: 0.2, position: 10, expect: ['longBlend'], minQuality: 0.6 },
  { name: 'bass swap: two bass-heavy grooves hand the low end over at a phrase', outgoing: 'steady', incoming: 'compatibleKey', style: 'Club', creativeRisk: 0.4, position: 10, expect: ['bassSwap', 'longBlend'], minQuality: 0.55,
    mutate: (o, i) => { o.bass.heaviness = 0.9; i.bass.heaviness = 0.9; o.bass.melodic = false; i.bass.melodic = false; } },
  { name: 'breakdown mix: the outgoing breakdown is the window', outgoing: 'breakdowns', incoming: 'steady', style: 'Club', creativeRisk: 0.4, position: 28, expect: ['breakdownMix', 'longBlend', 'reverbOut', 'filterRelease'], minQuality: 0.5 },
  { name: 'drop mix: the incoming drop lands as the outgoing leaves', outgoing: 'steady', incoming: 'drops', style: 'Festival', creativeRisk: 0.8, position: 10, expect: ['dropMix', 'filterBuild'], minQuality: 0.5, setPhase: 'PEAKING' },
  { name: 'drum intro mix: incoming drums under the outgoing groove', outgoing: 'steady', incoming: 'longIntro', style: 'Classic', creativeRisk: 0.4, position: 10, expect: ['drumIntroMix', 'longBlend', 'filterBuild'], minQuality: 0.55,
    mutate: (_o, i) => { i.cuePoints.firstBass = i.durationSec - 10; i.sections[0].kind = 'drum-only'; } },
  { name: 'vocal swap: vocals on both sides go through an instrumental stretch', outgoing: 'vocals', incoming: 'vocals', style: 'Radio', creativeRisk: 0.3, position: 20, expect: ['vocalSwap', 'shortBlend', 'echoOut', 'longBlend'], minQuality: 0.4,
    mutate: (o, i) => { o.id = 'vocals-a'; i.id = 'vocals-b'; } },
  { name: 'echo out: a phrase-ending vocal is the echo source', outgoing: 'vocals', incoming: 'steady', style: 'Dub', creativeRisk: 0.6, position: 20, expect: ['echoOut', 'reverbOut', 'longBlend', 'shortBlend', 'bassSwap'], minQuality: 0.45 },
  { name: 'filter build: energy rises into the incoming section', outgoing: 'longOutro', incoming: 'drops', style: 'Festival', creativeRisk: 0.5, position: 40, expect: ['filterBuild', 'dropMix', 'longBlend', 'shortBlend'], minQuality: 0.45 },
  { name: 'filter release: energy settles into the outro', outgoing: 'steady', incoming: 'longOutro', style: 'Smooth', creativeRisk: 0.2, position: 10, expect: ['filterRelease', 'longBlend'], minQuality: 0.5,
    mutate: (o, i) => { i.energy.perceivedIntensity = Math.max(0, o.energy.perceivedIntensity - 0.25); } },
  { name: 'tempo bridge: a far tempo gap is carried by the next track', outgoing: 'steady', incoming: 'fastBpm', style: 'Experimental', creativeRisk: 0.9, position: 10, expect: ['tempoBridge', 'halfTimeJump', 'doubleTimeJump', 'shortBlend'], minQuality: 0.3, bridge: true },
  { name: 'deliberate cut: a drop with high confidence, a cut-friendly style and the risk budget', outgoing: 'steady', incoming: 'drops', style: 'Aggressive', creativeRisk: 0.9, position: 10, expect: ['hardCut', 'dropMix', 'shortBlend'], minQuality: 0.3, setPhase: 'PEAK', smartCuts: true },
];

function plan(g: Golden) {
  const out = clone(corpusAnalysis(g.outgoing));
  const inc = clone(corpusAnalysis(g.incoming));
  g.mutate?.(out, inc);
  const memory = new DJSessionMemory();
  g.memory?.(memory);
  const input: TransitionPlanInput = {
    outgoing: out, incoming: inc, outgoingDeck: 'A', incomingDeck: 'B', outgoingPosition: g.position, style: getStyle(g.style), creativeRisk: g.creativeRisk,
    memory: memory.snapshot(), userBars: g.userBars ?? 8, withFilter: true, smartCuts: g.smartCuts ?? false, setPhase: g.setPhase ?? 'CRUISING', targetEnergy: 0.7, leadSec: 1, seed: 11, bridgeAvailable: g.bridge,
  };
  return { out, inc, p: planTransition(input) };
}

describe('golden transition corpus (Gate T / section 42)', () => {
  beforeAll(() => { for (const g of GOLDEN) { corpusAnalysis(g.outgoing); corpusAnalysis(g.incoming); } }, 180_000);

  for (const g of GOLDEN) {
    it(g.name, () => {
      const { out, inc, p } = plan(g);
      expect(g.expect, `style ${p.style}: ${p.reasons[0]}`).toContain(p.style);
      const q = evaluateTransition(p, out, inc);
      expect(q.overall, JSON.stringify(q)).toBeGreaterThanOrEqual(g.minQuality);
      const inv = checkInvariants(p, out, inc);
      const broken = inv.filter((i) => !i.ok);
      expect(broken, broken.map((b) => `${b.name}: ${b.detail}`).join('; ')).toEqual([]);
      // Every plan carries its fallback chain and explanations.
      expect(p.fallbackStyle).toBeDefined();
      expect(p.reasons.length).toBeGreaterThan(6);
      expect(p.incomingPosition).toBeGreaterThanOrEqual(0);
      expect(p.startTimeSec).toBeGreaterThan(g.position);
    });
  }

  it('repetition avoidance: after three bass swaps the planner picks another style for the same pair', () => {
    const g = GOLDEN[1];
    const first = plan(g).p;
    const rep: Golden = { ...g, memory: (m) => { for (let i = 0; i < 3; i++) m.recordTransition({ time: i, fromTrackId: 'x', toTrackId: 'y', style: first.style, lengthBars: first.durationBars, effects: [], energyBefore: 0.6, energyAfter: 0.6, key: null, bpm: 126, wasCut: false, wasBassSwap: first.style === 'bassSwap', hadVocalOverlap: false, fellBack: false }); } };
    const second = plan(rep).p;
    expect(second.style === first.style && second.durationBars === first.durationBars).toBe(false);
  });

  it('low confidence never gets a creative style (confidence invariant)', () => {
    const out = clone(corpusAnalysis('steady'));
    const inc = clone(corpusAnalysis('drops'));
    inc.analysisConfidence.overall = 0.2; inc.analysisConfidence.beatGrid = 0.2; inc.beatGrid.confidence = 0.2;
    const p = planTransition({ outgoing: out, incoming: inc, outgoingDeck: 'A', incomingDeck: 'B', outgoingPosition: 10, style: getStyle('Aggressive'), creativeRisk: 0.9, memory: new DJSessionMemory().snapshot(), userBars: 8, withFilter: true, smartCuts: true, setPhase: 'PEAK', targetEnergy: 0.9, seed: 2 });
    expect(['longBlend', 'shortBlend']).toContain(p.style);
    expect(p.loop).toBeUndefined();
    expect(p.cueJump).toBeUndefined();
    expect(checkInvariants(p, out, inc).find((i) => i.name === 'confidence')!.ok).toBe(true);
  });

  it('the memory snapshot type carries everything section 28 lists', () => {
    const m = new DJSessionMemory();
    const snap: SessionMemorySnapshot = m.snapshot();
    for (const k of ['recentTracks', 'recentArtists', 'recentKeys', 'recentBPMs', 'recentTransitionTypes', 'recentFX', 'recentEnergy', 'recentCuts', 'recentBassSwaps', 'recentVocals', 'recentTransitionLengths', 'recentPeaks', 'repeatedTracks', 'repeatedTransitionPatterns']) {
      expect(k in snap, k).toBe(true);
    }
  });
});
