/**
 * JUGGLE-SILENT, live 2026-10-12: Auto DJ's first juggle on a module set was a
 * callResponse whose call jumped the master (the clock deck) 16 beats ahead to
 * its call material. The executor's clock is the master's position on its
 * grid, so the jump moved the pattern's timeline: the response cut on beat 72
 * was "stale action skipped", and the crowd heard a skip in the track and
 * one 2-bar answer instead of the call and response. The pattern's clock is
 * the time played: its own seeks of the master do not move it.
 *
 * Fake decks on a virtual clock; the real pattern builder and executor.
 */
import { describe, it, expect } from 'vitest';
import { VirtualTimers } from '../../testing/setSimulator';
import { executeJuggle, type JuggleActionSink } from '../juggleExecutor';
import { PATTERN_BUILDERS } from '../jugglePatterns';
import type { MaterialWindow } from '../juggleTypes';

const BEAT = 0.48;
const window = (deck: 'A' | 'B', startSec: number): MaterialWindow => ({
  deck, startSec, endSec: startSec + 8 * BEAT, startBar: Math.round(startSec / (4 * BEAT)), bars: 2, drums: 1, bass: 1, percussionDensity: 1, melodic: 0.5, vocal: 0,
  harmonic: 0.5, spectralDensity: 0.5, energy: 0.7, rhythmicDensity: 1, confidence: 0.9, classes: ['FULL_GROOVE'], primary: 'FULL_GROOVE',
} as unknown as MaterialWindow);

describe('a call jump of the master keeps the response on time', () => {
  it('every cut of a callResponse fires on its beat when the call jumps the master 16 beats ahead', async () => {
    const timers = new VirtualTimers();
    // Deck A (the master and the clock) plays from 64 beats in; a seek moves it (as seekDeckAudio does, at once).
    const start = { A: 64 * BEAT - 4, B: 10 };
    const seekAt = { A: 0, B: 0 };
    const posOf = (d: 'A' | 'B') => start[d] + (timers.now() - seekAt[d]) / 1000;
    const seek = (d: 'A' | 'B', sec: number) => { start[d] = sec; seekAt[d] = timers.now(); };
    const sink: JuggleActionSink = {
      apply: (action) => { if (action.type === 'JumpToBar' && action.deck !== 'BOTH' && action.targetPosition !== undefined) seek(action.deck, action.targetPosition); },
      state: () => ({ playing: { A: true, B: true }, audible: { A: true, B: true }, crossfader: 0, loops: { A: false, B: false } }),
    };
    const clock = { beatNow: () => posOf('A') / BEAT, beatSec: () => BEAT };
    // The call material sits 16 beats past the pattern start (live: start beat 64, call at 38.4 s = beat 80).
    const pattern = PATTERN_BUILDERS.callResponse({
      primary: 'A', beatsPerBar: 4, intensity: 0.5, phraseBars: 8, confidence: 0.9, minRung: 2,
      material: { call: window('A', 80 * BEAT), response: window('B', 20) },
    });
    const exec = executeJuggle(pattern, 64, { clock, sink, timers, tickMs: 15 });
    await timers.run(60_000);
    const result = await exec.done;

    const cuts = result.trace.filter((t) => t.action.type === 'CutIn');
    expect(cuts.length).toBe(4);
    expect(cuts.map((t) => t.status), JSON.stringify(cuts.map((t) => [t.action.deck, t.scheduledBeat, t.status, t.reason]))).toEqual(['executed', 'executed', 'executed', 'executed']);
    for (const c of cuts) expect(Math.abs(c.firedBeat! - c.scheduledBeat)).toBeLessThan(0.1);
    expect(cuts.map((t) => t.action.deck)).toEqual(['A', 'B', 'A', 'B']);
    expect(result.completed).toBe(true);
  });
});
