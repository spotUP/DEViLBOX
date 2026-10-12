/**
 * The scratch clock reads the one deck tempo (SCR-PHRASING-PARITY D9; owner question 2026-10-12 "is the
 * scratch tightly BPM synced?"). The Auto Scratch executor on a live deck converts the planned beats to
 * context time with its clock's seconds per beat. That clock read the store's `effectiveBPM`, which seven
 * UI loaders still write from the audio detector - 184.57 for a module whose own tempo is 93.75 - so
 * every record stroke was handed to the worklet early by up to half the lookahead. Now it reads the
 * analysis tempo (the one `applyAnalysisToDeck` writes) at the deck's pitch (`deckTempoBpm`).
 *
 * Measured over a 10-minute run (one record stroke per bar, no humanize) through the real
 * `ScratchExecutor` and `analysisClock`: the context time each stroke is handed to the worklet for vs
 * the beat grid's time of its beat - mean and worst error in ms - at pitch 0 and at +1 semitone, with
 * the store's `effectiveBPM` doubled by the detector.
 */
import { describe, it, expect, vi } from 'vitest';
import { useDJStore } from '@/stores/useDJStore';
import { ScratchExecutor } from '../scratch/ScratchExecutor';
import { analysisClock } from '../autodj/juggle/juggleController';
import { timeAtBeat } from '../autodj/beatGrid';
import { fixtureAnalysis } from '../scratch/__tests__/fixtures/analysisFixture';
import type { ExecutorTimers } from '../autodj/executorTimers';
import type { ScratchEvent } from '../scratch/scratchTypes';

vi.mock('../DJEngine', () => ({ getDJEngine: () => { throw new Error('no engine in this test'); }, getDJEngineIfActive: () => null }));
const { deckTempoBpm } = await import('../scratch/autoScratchRuntime');

/** The 120 BPM fixture stretched to 11 minutes (1320 beats). */
function longTrack() {
  const track = fixtureAnalysis();
  const { firstBeat } = track.beatGrid;
  track.beatGrid = { ...track.beatGrid, beats: Array.from({ length: 1320 }, (_, i) => ({ time: firstBeat + i * 0.5, index: i, strength: 1, isDownbeat: i % 4 === 0 })) };
  return track;
}

function measure(pitchSemitones: number, bpmFor: () => number): { meanMs: number; worstMs: number; strokes: number } {
  const track = longTrack();
  const rate = Math.pow(2, pitchSemitones / 12);
  let sec = 0; // context time; the deck's position runs at the pitch's rate
  const intervals: Array<() => void> = [];
  const timers: ExecutorTimers = {
    now: () => sec * 1000,
    setInterval: (fn) => { intervals.push(fn); return fn; },
    clearInterval: (h) => { const i = intervals.indexOf(h as () => void); if (i >= 0) intervals.splice(i, 1); },
    setTimeout: () => null, clearTimeout: () => undefined,
  };
  const handed: Array<{ id: string; at: number }> = [];
  const exec = new ScratchExecutor({
    clock: analysisClock(track, () => sec * rate, bpmFor), contextTime: () => sec,
    fire: (id, o) => { handed.push({ id, at: o.at ?? sec }); return true; },
    release: () => undefined,
    probe: { capture: () => ({ rate: 1, channelGain: 1, captureFrozen: false, suppressNotes: false, crossfader: 0.5, busLevel: 1 }), restore: () => undefined },
    recueDeck: () => ({ recued: true, mode: 'audio', returnsToAnchor: true }),
    timers, tickMs: 5, lookaheadSec: 0.1,
  });
  const anchor = { position: 0.2, safe: [0, 1] as const, safeForward: [0.2, 1] as const, safeReverse: [0, 0.2] as const };
  const lastBeat = track.beatGrid.beats.length - 8;
  const beats: number[] = [];
  for (let b = 4; b < lastBeat && timeAtBeat(track.beatGrid, b) / rate < 600; b += 4) beats.push(b);
  // schedule a bar ahead, as the controller does
  let next = 0;
  const end = timeAtBeat(track.beatGrid, beats[beats.length - 1]! + 2) / rate;
  while (sec < end) {
    while (next < beats.length && timeAtBeat(track.beatGrid, beats[next]!) / rate - sec < 2) {
      const e: ScratchEvent = { executeAtBeat: beats[next]!, durationBeats: 0.5, role: 'ACCENT', source: { type: 'CRATE', recordId: 'AH_STANDARD', anchor }, anchor, gesture: 'chirp', velocity: 0.8, humanizeMs: 0, intensity: 0.4, deck: 'A', returnToAnchor: true };
      exec.schedule(e);
      next++;
    }
    sec += 0.005;
    for (const fn of [...intervals]) fn();
  }
  const errs = handed.map((h, i) => (h.at - timeAtBeat(track.beatGrid, beats[i]!) / rate) * 1000);
  return { meanMs: errs.reduce((a, b) => a + Math.abs(b), 0) / errs.length, worstMs: Math.max(...errs.map(Math.abs)), strokes: handed.length };
}

describe('the scratch clock reads the one deck tempo (SCR-PHRASING-PARITY D9)', () => {
  it('10 minutes of record strokes land on the beat grid within 1 ms, at pitch 0 and +1 semitone, whatever the detector wrote', () => {
    const track = fixtureAnalysis();
    for (const pitch of [0, 1]) {
      // the detector's double tempo in the store, the analysis' own on the track
      useDJStore.getState().setDeckState('A', { pitchOffset: pitch, effectiveBPM: track.bpm * 2, detectedBPM: track.bpm * 2 });
      expect(deckTempoBpm('A', track)).toBeCloseTo(track.bpm * Math.pow(2, pitch / 12), 1);
      const m = measure(pitch, () => deckTempoBpm('A', track));
      console.log(`[scratch clock] pitch ${pitch}: ${m.strokes} strokes, onset vs grid mean ${m.meanMs.toFixed(3)} ms, worst ${m.worstMs.toFixed(3)} ms`);
      expect(m.strokes).toBeGreaterThan(250);
      expect(m.worstMs).toBeLessThan(1);
      // the old clock (the store's effectiveBPM) on the same run: the measurement tells them apart
      const old = measure(pitch, () => useDJStore.getState().decks.A.effectiveBPM);
      console.log(`[scratch clock] old effectiveBPM clock, pitch ${pitch}: mean ${old.meanMs.toFixed(1)} ms, worst ${old.worstMs.toFixed(1)} ms`);
      expect(old.worstMs).toBeGreaterThan(20);
    }
  });
});
