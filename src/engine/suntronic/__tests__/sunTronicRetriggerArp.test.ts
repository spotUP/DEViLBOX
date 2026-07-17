/**
 * Regression: a note-on (GNN retrigger) FULLY restarts the synth voice.
 *
 * Two audible bugs bracket this behaviour, both measured against the UADE oracle
 * on `ready`:
 *   - NO reset on a same-instrument note-on → the voice plays on from the
 *     previous note's decayed tail. Voice 1 (bass) rendered at 0.57x the oracle
 *     RMS ("no bass"); voices 2/3 ran ~2x hot.
 *   - PARTIAL reset that PRESERVES arpIndex ($12) → the arp-table timbre sweep
 *     never restarts. Voice 0 over-moved (envelope variance 0.182 vs oracle
 *     0.128), voice 1 went flat, voice 3 ran ~11% hot.
 * The oracle-correct behaviour is a FULL reset (equivalent to createVoiceState):
 * clear the feedback latch/play buffer, the type-6 sweep, AND arpIndex.
 *
 * This test fails if retriggerVoiceState stops clearing ANY field — including a
 * revert to preserving arpIndex.
 */
import { describe, it, expect } from 'vitest';
import {
  createVoiceState,
  retriggerVoiceState,
  type SunSynthVoiceState,
} from '../SunTronicSynthVoice';

describe('SunTronic note-on retrigger — full synth voice reset', () => {
  it('clears every synth voice field (matches the UADE oracle)', () => {
    const s: SunSynthVoiceState = createVoiceState();
    // Simulate a live voice mid-note: arp advanced, feedback latched, type-6
    // sweep in progress.
    s.arpIndex = 7;
    s.feedbackLatched = true;
    s.playBuffer = new Int8Array([1, 2, 3, 4]);
    s.resonPhase = 0x1234;
    s.resonCnt = 42;

    retriggerVoiceState(s);

    // A note-on restarts the arp/interp sweep — arpIndex must snap back to 0
    // (preserving it flattens the bass + over-moves other voices vs the oracle).
    expect(s.arpIndex).toBe(0);
    expect(s.feedbackLatched).toBe(false);
    expect(s.playBuffer).toBeNull();
    expect(s.resonPhase).toBe(0);
    expect(s.resonCnt).toBe(0);
  });

  it('is equivalent to a fresh createVoiceState()', () => {
    const s: SunSynthVoiceState = createVoiceState();
    s.arpIndex = 3;
    s.feedbackLatched = true;
    s.playBuffer = new Int8Array([9, 9]);
    s.resonPhase = 0x0f00;
    s.resonCnt = 5;

    retriggerVoiceState(s);

    expect(s).toEqual(createVoiceState());
  });
});
