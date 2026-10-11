/**
 * Audit JA-M4 (2026-10-11 juggling audit; owner plan sections 16, 17): the
 * double's payoff re-cued the copy on the very beat the fader started its
 * sweep away from it (the seek could be heard in the sweep's tail), and one
 * bar later layered both copies with nothing checking their phase - two
 * copies a few ms apart comb-filter (a flanged payoff). The copy is re-cued
 * while fully silent, a bar before the layer, and the layer plays only when
 * the copy's measured bar phase is within 5 ms of the original's; otherwise it
 * is skipped and the primary holds. The executor with a recording sink on a
 * virtual clock.
 */
import { describe, it, expect } from 'vitest';
import { VirtualTimers } from '../../testing/setSimulator';
import { executeJuggle, type JuggleActionSink, type SinkState } from '../juggleExecutor';
import { double, RECUE_AFTER_CUT_BEATS, type PatternParams } from '../jugglePatterns';
import type { DJJuggleAction } from '../juggleTypes';

const BEAT_SEC = 60 / 126;
const params = (minRung: 1 | 2): PatternParams => ({ primary: 'A', beatsPerBar: 4, intensity: 0.7, phraseBars: 8, confidence: 0.9, minRung, double: { offsetBeats: 4, primaryPosition: 20 } });

function recordingSink(copyPhaseErrorSec: number) {
  let crossfader = 0;
  const applied: Array<{ action: DJJuggleAction; crossfader: number }> = [];
  const sink: JuggleActionSink & { applied: typeof applied } = {
    applied,
    state(): SinkState { return { crossfader, playing: { A: true, B: true }, audible: { A: crossfader < 0.999, B: crossfader > 0.001 }, loops: { A: false, B: false } }; },
    apply(action) {
      if (action.type === 'CutIn' || action.type === 'ReleaseDeck') crossfader = action.deck === 'A' ? 0 : 1;
      if (action.type === 'HoldDeck') crossfader = 0.5;
      applied.push({ action, crossfader });
    },
    phaseError: (deck) => (deck === 'B' ? copyPhaseErrorSec : 0),
  };
  return sink;
}

async function perform(copyPhaseErrorSec: number) {
  const timers = new VirtualTimers();
  const sink = recordingSink(copyPhaseErrorSec);
  const pattern = double(params(2));
  const exec = executeJuggle(pattern, 8, { clock: { beatNow: () => timers.now() / 1000 / BEAT_SEC, beatSec: () => BEAT_SEC }, sink, timers, tickMs: 15 });
  await timers.run((8 + pattern.durationBars * 4 + 8) * BEAT_SEC * 1000);
  return { sink, result: await exec.done };
}

describe('the double payoff layers only a phase-verified copy, re-cued while silent', () => {
  for (const minRung of [2, 1] as const) {
    it(`the payoff re-cue is never on the copy's cut-out beat (${minRung === 2 ? 'MUSICAL' : 'PERFORMER'})`, () => {
      const p = double(params(minRung));
      const hold = p.actions.find((a) => a.type === 'HoldDeck')!;
      const recue = p.actions.filter((a) => a.type === 'ResyncDeck').at(-1)!;
      const cutOut = p.actions.filter((a) => a.type === 'CutIn' && a.executeAtBeat <= recue.executeAtBeat).at(-1)!;
      expect(cutOut.deck).toBe('A');
      expect(recue.executeAtBeat - cutOut.executeAtBeat).toBeGreaterThanOrEqual(RECUE_AFTER_CUT_BEATS);
      expect(recue.executeAtBeat).toBeLessThan(hold.executeAtBeat);
      if (minRung === 2) expect(hold.executeAtBeat - recue.executeAtBeat).toBe(4);
      expect(hold.verifyPhaseOf).toBe('B');
    });
  }

  it('the copy 12 ms off the original at the payoff: no layer, the primary holds, the pattern still releases', async () => {
    const { sink, result } = await perform(0.012);
    expect(result.completed).toBe(true);
    expect(sink.applied.some((a) => a.action.type === 'HoldDeck')).toBe(false);
    expect(sink.applied.every((a) => a.crossfader !== 0.5)).toBe(true);
    const skipped = result.trace.find((t) => t.action.type === 'HoldDeck')!;
    expect(skipped.status).toBe('blocked');
    expect(skipped.reason).toMatch(/phase not verified \(deck B 12\.0 ms off/);
    expect(sink.applied.at(-2)!.action.type).toBe('ReleaseDeck');
  });

  it('the copy 2 ms off: the layer plays', async () => {
    const { sink, result } = await perform(0.002);
    expect(result.completed).toBe(true);
    expect(sink.applied.find((a) => a.action.type === 'HoldDeck')?.crossfader).toBe(0.5);
  });
});
