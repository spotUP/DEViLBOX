/**
 * DJ-F "turntables sometimes jump in Auto DJ mode" (owner 2026-10-11): a
 * callResponse juggle's first call jumped the master - the deck the crowd
 * hears - to its call material at beat 0 (JumpToBar, a seek), so the track
 * skipped and the platter jumped. A cue jump is only ever made on a deck that
 * cannot be heard; on a heard deck it is blocked and what plays holds.
 *
 * Fake decks whose audibility follows the crossfader; the real pattern
 * builder and executor.
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

describe('a juggle never seeks a deck the crowd hears', () => {
  it('callResponse makes its cue jumps only on the silent deck', async () => {
    const timers = new VirtualTimers();
    let cf = 0; // deck A, the master, is heard when the juggle starts
    const audible = () => ({ A: cf < 0.999, B: cf > 0.001 });
    const heardSeeks: string[] = [];
    let seeks = 0;
    const sink: JuggleActionSink = {
      apply: (action) => {
        const d = action.deck;
        if (action.type === 'CutIn' || action.type === 'ReleaseDeck') cf = d === 'A' ? 0 : d === 'B' ? 1 : 0.5;
        if (action.type === 'CutOut') cf = d === 'A' ? 1 : d === 'B' ? 0 : 0.5;
        if (action.type === 'HoldDeck') cf = 0.5;
        if (action.type === 'JumpToBar' && d !== 'BOTH') { seeks++; if (audible()[d]) heardSeeks.push(`${d} at cf ${cf}`); }
      },
      state: () => ({ playing: { A: true, B: true }, audible: audible(), crossfader: cf, loops: { A: false, B: false } }),
    };
    const clock = { beatNow: () => 64 + timers.now() / 1000 / BEAT, beatSec: () => BEAT };
    const pattern = PATTERN_BUILDERS.callResponse({
      primary: 'A', beatsPerBar: 4, intensity: 0.5, phraseBars: 8, confidence: 0.9, minRung: 2,
      material: { call: window('A', 80 * BEAT), response: window('B', 20) },
    });
    const exec = executeJuggle(pattern, 64, { clock, sink, timers, tickMs: 15 });
    await timers.run(60_000);
    const result = await exec.done;

    expect(heardSeeks).toEqual([]);
    expect(seeks).toBeGreaterThan(0); // the silent deck's jumps still land
    expect(result.trace.find((t) => t.action.type === 'JumpToBar' && t.status === 'blocked')?.reason).toMatch(/heard/);
    expect(result.completed).toBe(true);
  });
});
