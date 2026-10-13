/**
 * C16 through the controller's entry `DJScratchDJ.tick()`: with the Records narrowed to ONE spoken phrase (R8) the
 * 32-bar three-deck routine at the PEAK in PERFORMER plays statement and chop - the phrase thrown whole (HOME,
 * drop_phrase, from its first sample), its last word chopped (ACCENT) - every stroke scheduled is the demo's event
 * (`build_scratch_events(phrase_emphasis=True)`) on that record with its slice; any other selection keeps the rotation.
 */
import { describe, it, expect } from 'vitest';
import { DJScratchDJ } from '../scratch/DJScratchDJ';
import { buildThreeDeckRoutine, demoRoutineStats } from '../scratch/scratchDemoRoutines';
import { corpusAnalysis } from '../autodj/testing/corpus';
import { timeAtBeat, barStartBeat } from '../autodj/beatGrid';
import type { DJPerformanceContext, DJTrackAnalysis } from '../autodj/types';
import type { ScratchEvent } from '../scratch/scratchTypes';

const PHRASE = 'IF_YOU_REALLY_LIKE_TO_ROCK_THE_FUNKY_BEAT';
const perfAt = (track: DJTrackAnalysis, t: number): DJPerformanceContext => ({
  currentDeck: 'A', currentTrack: track, incomingTrack: null, currentPosition: t, currentBeat: 0, currentBar: 0,
  timeRemainingSec: 100, setEnergy: 0.9, targetEnergy: 0.95, setPhase: 'PEAK', candidateTracks: [], creativeRisk: 0.6, confidence: 0.8,
} as unknown as DJPerformanceContext);

function run(records: readonly string[] | null) {
  const track = corpusAnalysis('drops');
  const drop = track.sections.find((s) => s.kind === 'drop')!;
  const barT = (b: number) => timeAtBeat(track.beatGrid, barStartBeat(track.downbeats, b));
  const events: ScratchEvent[] = [];
  const ctrl = new DJScratchDJ({ seed: 5, executorFor: () => ({ schedule: (e) => { events.push(e); }, cancel: () => {}, active: 0 }) });
  let plan: DJScratchDJ['lastPlan'] = null;
  for (let b = drop.startBar - 1; b < drop.startBar + 2; b++) for (const f of [0.05, 0.5]) {
    ctrl.tick({ perf: perfAt(track, barT(b) + f), deck: 'A', mode: 'PERFORMER', style: 'electro', scratchPermission: 2, records });
    if (ctrl.lastPlan?.routine === 'threeDeck') plan = ctrl.lastPlan;
  }
  return { events, plan, fromBar: drop.startBar, track };
}

describe('statement and chop through the controller (C16)', () => {
  it('Records = one spoken phrase: the 32-bar three-deck routine throws the phrase and chops its last word, event for event', () => {
    const before = demoRoutineStats.threeDeck;
    const { events, plan, fromBar, track } = run([PHRASE]);
    expect(plan).not.toBeNull();
    expect(demoRoutineStats.threeDeck - before).toBe(1);
    const demo = buildThreeDeckRoutine(5 + fromBar, { pools: { HOME: [PHRASE], SECONDARY: [PHRASE], ACCENT: [PHRASE], FX: [PHRASE] }, phraseEmphasis: true });
    const strokes = events.filter((e) => e.gesture !== 'needleDrop' && e.gesture !== 'needleLift');
    const want = demo.filter((e) => e.gesture !== 'needleDrop' && e.gesture !== 'needleLift');
    expect(strokes.map((e) => [e.executeAtBeat, e.gesture])).toEqual(want.map((e) => [barStartBeat(track.downbeats, fromBar + e.bar) + e.step / 4, e.gesture]));
    for (const e of strokes) {
      expect(e.source.type === 'CRATE' && e.source.recordId).toBe(PHRASE);
      expect(e.render?.slice).toBe(e.gesture === 'dropPhrase' ? 'phrase' : 'word');
    }
    expect(strokes.filter((e) => e.gesture === 'dropPhrase').length).toBeGreaterThan(4);
  });

  it('the whole bank (style) keeps the word rotation: clean throws, no slices', () => {
    const { events, plan } = run(null);
    expect(plan).not.toBeNull();
    expect(events.some((e) => e.gesture === 'drop')).toBe(true);
    expect(events.every((e) => e.gesture !== 'dropPhrase' && !e.render?.slice)).toBe(true);
  });
});
