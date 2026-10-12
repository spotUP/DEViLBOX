/**
 * Reachability (ledger SCR-P5.R5, reworked by SCR-PHRASING-PARITY D1 / D4): through the Auto Scratch
 * controller's entry `DJScratchDJ.tick()` over two whole corpus tracks (a breakdown track in
 * PERFORMER, a steady house groove under a long blend), every scheduled event scratches a crate record
 * - never the music, as the demo never does - and the record is the demo's pick for the event's
 * section (`pick_source`: one record per section, the seed + the bars before the section).
 */
import { describe, it, expect } from 'vitest';
import { DJScratchDJ, overlaySectionAt } from '../scratch/DJScratchDJ';
import { demoRoutineStats, overlayRecord } from '../scratch/scratchDemoRoutines';
import { corpusAnalysis } from '../autodj/testing/corpus';
import { timeAtBeat, barStartBeat } from '../autodj/beatGrid';
import type { DJPerformanceContext, DJTrackAnalysis } from '../autodj/types';
import type { ScratchEvent } from '../scratch/scratchTypes';

const perfAt = (track: DJTrackAnalysis, t: number, over: Partial<DJPerformanceContext> = {}): DJPerformanceContext => ({
  currentDeck: 'A', currentTrack: track, incomingTrack: null, currentPosition: t, currentBeat: 0, currentBar: 0,
  timeRemainingSec: 100, setEnergy: 0.6, targetEnergy: 0.7, setPhase: 'CRUISING', candidateTracks: [], creativeRisk: 0.3, confidence: 0.8,
  ...over,
} as unknown as DJPerformanceContext);

const SEED = 3;

function walk(track: DJTrackAnalysis, input: { mode: 'PERFORMER' | 'MUSICAL'; style: 'boomBap' | 'electro'; genreHint: 'hipHop' | 'house'; over?: Partial<DJPerformanceContext> }): Array<{ e: ScratchEvent; bar: number }> {
  const out: Array<{ e: ScratchEvent; bar: number }> = [];
  let bar = 0;
  const ctrl = new DJScratchDJ({ seed: SEED, executorFor: () => ({ schedule: (e) => { out.push({ e, bar }); }, cancel: () => undefined, active: 0 }) });
  for (bar = 0; bar < track.downbeats.bars.length - 1; bar++) {
    const t = timeAtBeat(track.beatGrid, barStartBeat(track.downbeats, bar)) + 0.05;
    ctrl.tick({ perf: perfAt(track, t, input.over), deck: 'A', mode: input.mode, style: input.style, scratchPermission: 1, genreHint: input.genreHint });
  }
  return out;
}

describe('Auto Scratch picks the record as the demo does (SCR-P5.R5, SCR-PHRASING-PARITY)', () => {
  it('a breakdown track and a house transition: crate records only, each the demo pick for its section', () => {
    const before = demoRoutineStats.overlayRecord;
    const breakdowns = corpusAnalysis('breakdowns');
    const steady = corpusAnalysis('steady');
    const runs = [
      { track: breakdowns, events: walk(breakdowns, { mode: 'PERFORMER', style: 'boomBap', genreHint: 'hipHop' }) },
      { track: steady, events: walk(steady, { mode: 'PERFORMER', style: 'electro', genreHint: 'house', over: { transition: { style: 'longBlend', outgoingDeck: 'A', incomingDeck: 'B' } } as never }) },
    ];
    expect(demoRoutineStats.overlayRecord - before).toBeGreaterThan(0);
    for (const { track, events } of runs) {
      expect(events.length).toBeGreaterThan(0);
      const records = new Set<string>();
      for (const { e } of events) {
        expect(e.source.type).toBe('CRATE');
        if (e.source.type !== 'CRATE' || e.gesture === 'needleDrop' || e.gesture === 'needleLift') continue;
        records.add(e.source.recordId);
        // the bar the event plays in -> its section -> the demo's record for that section
        const bar = track.downbeats.bars.findIndex((b, i) => {
          const next = track.downbeats.bars[i + 1];
          const t = timeAtBeat(track.beatGrid, e.executeAtBeat);
          return t >= b.start - 1e-6 && (!next || t < next.start - 1e-6);
        });
        const sec = overlaySectionAt(track, bar);
        expect([bar, e.source.recordId]).toEqual([bar, overlayRecord(sec.name, SEED + sec.startBar)]);
      }
      expect(records.size).toBeGreaterThanOrEqual(1);
    }
  }, 60_000);
});
