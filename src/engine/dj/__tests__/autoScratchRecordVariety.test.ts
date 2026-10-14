/**
 * Auto Scratch plays the whole crate, not the same few records (owner 2026-10-14, AUTO-SCRATCH-RECORD-VARIETY: "always
 * picks the same few samples - mostly BOY, some THREE - though the crate has many"). The three-deck routine (the
 * default Render) takes each cue role's record from its pool and throws the NEXT one on every clean drop
 * (three_deck.render's role_i, three_deck.py:423-445) - but role_i started at 0 in every routine, and the throws per
 * role are fixed by the arc, not the seed, so back-to-back routines replayed the same first records of every pool:
 * 8 distinct records over a long set whatever the Records setting. The rotation now carries over from routine to
 * routine, so each pool cycles whole before a record repeats.
 *
 * Through the controller's entry (`DJScratchDJ.tick`, one controller for the whole set as DJAutoDJ holds it, Render
 * three_deck): the records of every stroke handed to the executor over twelve tracks, per Records setting, against
 * the eligible crate counted from the builder (the union of the role pools the routine draws from).
 */
import { describe, it, expect } from 'vitest';
import { DJScratchDJ } from '../scratch/DJScratchDJ';
import { corpusAnalysis } from '../autodj/testing/corpus';
import { timeAtBeat, barStartBeat } from '../autodj/beatGrid';
import { scratchStyleFor } from '../scratch/scratchStyles';
import { CUE_ROLE_POOLS, cuePoolsFor, getScratchRecord, scratchRecordsFor } from '../scratch/scratchCatalogue';
import { demoRoutineStats } from '../scratch/scratchDemoRoutines';
import type { DJPerformanceContext } from '../autodj/types';
import type { ScratchEvent } from '../scratch/scratchTypes';

const TRACKS = 12;

function setRecords(records: string): { picks: string[]; routines: number } {
  const fired: ScratchEvent[] = [];
  const ctrl = new DJScratchDJ({ seed: 1, executorFor: () => ({ schedule: (e) => { fired.push(e); }, cancel: () => {}, active: 0 }) });
  const choice = scratchStyleFor('auto', 'hipHop');
  const before = demoRoutineStats.threeDeck;
  for (let n = 0; n < TRACKS; n++) {
    const track = corpusAnalysis(n % 2 ? 'steady' : 'drops');
    for (let b = 0; b < track.downbeats.bars.length - 1; b++) {
      const t = timeAtBeat(track.beatGrid, barStartBeat(track.downbeats, b)) + 0.1;
      ctrl.tick({
        perf: { currentDeck: 'A', currentTrack: track, incomingTrack: null, currentPosition: t, setPhase: 'CRUISING', setEnergy: 0.6, targetEnergy: 0.7 } as unknown as DJPerformanceContext,
        deck: 'A', mode: 'PERFORMER', style: choice.style, genre: choice.modifiers, genreHint: choice.genre, profile: choice.profile, scratchPermission: 4, render: 'three_deck', records: scratchRecordsFor(records),
      });
    }
  }
  const picks = fired.filter((e) => e.source.type === 'CRATE' && !e.gesture.startsWith('needle')).map((e) => (e.source as { recordId: string }).recordId);
  return { picks, routines: demoRoutineStats.threeDeck - before };
}

/** The records the routine can draw: the union of its four role pools ('style' = the whole bank, R8). */
function eligible(records: string): Set<string> {
  const checked = scratchRecordsFor(records);
  const picked = checked ? checked.filter((id) => !!getScratchRecord(id)) : [];
  const pools = picked.length ? cuePoolsFor(picked) : CUE_ROLE_POOLS;
  return new Set(Object.values(pools).flat());
}

describe('Auto Scratch plays the whole crate over a set, not the same few records (AUTO-SCRATCH-RECORD-VARIETY)', () => {
  // measured before (rotation restarting per routine): 8 distinct records in every setting
  for (const records of ['style', 'clean', 'all'] as const) {
    it(`Records ${records}: the three-deck routines of a long set play at least 70 % of the eligible crate, none over 8 % of the strokes`, () => {
      const pool = eligible(records);
      const { picks, routines } = setRecords(records);
      expect(pool.size).toBeGreaterThan(40);
      expect(routines).toBeGreaterThanOrEqual(TRACKS);
      expect(picks.length).toBeGreaterThan(400);
      expect(picks.every((r) => pool.has(r))).toBe(true);
      const counts = new Map<string, number>();
      for (const r of picks) counts.set(r, (counts.get(r) ?? 0) + 1);
      expect(counts.size, `${counts.size} of ${pool.size} eligible records`).toBeGreaterThanOrEqual(Math.ceil(0.7 * pool.size));
      const top = [...counts].sort((a, b) => b[1] - a[1])[0]!;
      expect(top[1] / picks.length, `${top[0]} ${top[1]} of ${picks.length}`).toBeLessThanOrEqual(0.08);
    }, 300_000);
  }
});
