/**
 * Audit JA-M2 (thoughts/shared/research/2026-10-11_juggling-sonnet-work-audit.md, M2): "beat
 * confidence" had two definitions. The transition planner read both grids AND both downbeat grids
 * (an assumed meter lowers the downbeat confidence); the juggle controller - in-mix and stand-alone
 * juggles and their abort checks - read the master's beat grid only. A module with drum-confirmed
 * beats (1) and an assumed meter (0.5) got beat-level stand-alone juggles (single-bar cuts on bars
 * that may be wrong) while a juggle transition on the same track was refused as low confidence.
 *
 * One definition now (trackBeatConfidence, owner juggling plan section 31): both paths read the same
 * number, and the assumed meter keeps both off beat level.
 */
import { describe, it, expect } from 'vitest';
import { corpusAnalysis } from '../../testing/corpus';
import { DJJuggleController, type TickInput } from '../juggleController';
import { confidencePolicy } from '../jugglePlanner';
import { pairConfidence } from '../../transitionPlanner';
import type { DJTrackAnalysis } from '../../types';

function analysis(beatGrid: number, downbeat: number): DJTrackAnalysis {
  const a = structuredClone(corpusAnalysis('steady'));
  a.analysisConfidence.beatGrid = beatGrid;
  a.beatGrid.confidence = beatGrid;
  a.analysisConfidence.downbeat = downbeat;
  for (const p of a.phrases) p.confidence = 0.9;
  return a;
}

function controllerContext(a: DJTrackAnalysis, b: DJTrackAnalysis) {
  const controller = new DJJuggleController({
    sink: { apply: () => {}, state: () => ({ crossfader: 0, playing: { A: true, B: true }, audible: { A: true, B: false }, loops: { A: false, B: false } }), restore: () => {} },
    clockFor: () => ({ beatNow: () => 0, beatSec: () => 0.5 }),
    positionOf: () => 40,
    now: () => 1_000_000,
  });
  const input: TickInput = {
    masterDeck: 'A',
    decks: {
      A: { trackId: 'a.mod', analysis: a, positionSec: 40, playing: true, bpm: a.bpm },
      B: { trackId: 'b.mod', analysis: b, positionSec: 40, playing: true, bpm: a.bpm },
    },
    setPhase: 'PEAK', energy: 0.7, targetEnergy: 0.8, performanceMode: 'JUGGLE', transitionApproachingSec: null,
  };
  return controller.buildContext(input);
}

describe('JA-M2: one beat confidence for juggle transitions and in-mix juggles', () => {
  it('a module with drum-confirmed beats and an assumed meter is not beat level for a stand-alone juggle either', () => {
    const mod = analysis(1, 0.5);
    const ctx = controllerContext(mod, mod);
    expect(ctx.beatConfidence).toBe(pairConfidence(mod, mod).beatConfidence);
    expect(ctx.beatConfidence).toBe(0.5);
    expect(confidencePolicy(ctx)).not.toBe('beat');
  });

  it('the controller reads both decks: the incoming\'s weak bars lower the pair, as in the transition planner', () => {
    const master = analysis(0.95, 0.9);
    const incoming = analysis(0.9, 0.55);
    const ctx = controllerContext(master, incoming);
    expect(ctx.beatConfidence).toBe(pairConfidence(master, incoming).beatConfidence);
    expect(ctx.beatConfidence).toBe(0.55);
  });

  it('a track sure of its beats and its bars stays beat level on both paths', () => {
    const t = analysis(0.95, 0.9);
    const ctx = controllerContext(t, t);
    expect(ctx.beatConfidence).toBe(0.9);
    expect(pairConfidence(t, t).beatConfidence).toBe(0.9);
  });
});
