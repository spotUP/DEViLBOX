/**
 * Owner 2026-10-12 LOCAL (ledger SPINBACK-REWIND-LIVE-FAIL): the deck Spinback "does nothing except
 * pausing the pattern scroll" on an audio-mode deck. Measured cause: TurntablePhysics' spinback
 * impulse reversed the record for 48 ms (then held it at 0.93 x for 6 s) - too short to hear; the
 * old test proved only that the rate went negative. The spinback is now the DJ's flick in the ported
 * two-body turntable model (platterGestures.spinbackTrack).
 *
 * This measures what is HEARD: a real DeckEngine in audio mode (audio player -> deck chain -> the
 * scratch ring worklet) renders a "level tape" offline; the spinback's rate track is played to the deck exactly as the platter driver
 * does (startScratch, setScratchVelocity every 8 ms). The tape's level marks its position, so the
 * heard level is where the needle is: rising while the deck plays forward, falling through the
 * spinback (heard backward, not silent) for at least 0.4 s, rising again afterwards.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/engine/ToneEngine', () => ({
  getToneEngine: () => ({ setInstrumentOutputOverride: () => {}, preloadInstruments: async () => {}, ensureWASMSynthsReady: async () => {}, rerouteNativeEngine: () => {} }),
}));

import { installRealWebAudio, resolveWorkletsFromPublic, servePublicToFetch, audioLoadsSettled } from '@/test/audio/realWebAudio';
import { spinbackTrack } from '@/engine/turntable/platterGestures';

const SR = 48000;
const T0 = 1.2;           // the spinback starts here (render time)
const TOTAL = T0 + 2.2;

/** The record: a 600 Hz tone whose level marks the position (0.03 + 0.06 x seconds of record): the
 *  heard level is where the needle is, whatever the speed. */
function levelTape(sec: number): Float32Array<ArrayBuffer> {
  const n = Math.round(sec * SR), x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = (0.03 + 0.06 * i / SR) * Math.sin(2 * Math.PI * 600 * i / SR);
  return x;
}

/** Heard RMS over [a, b) s. */
function rms(x: Float32Array, a: number, b: number): number {
  let q = 0; const from = Math.round(a * SR), to = Math.round(b * SR);
  for (let i = from; i < to; i++) q += x[i]! * x[i]!;
  return Math.sqrt(q / Math.max(1, to - from));
}

describe('the deck Spinback is heard backward (audio mode, real deck chain and scratch ring)', () => {
  it('the record under the needle runs backward for >= 0.4 s of the spinback, forward before and after', async () => {
    installRealWebAudio(); resolveWorkletsFromPublic(); servePublicToFetch();
    const Tone = await import('tone');
    const ctx = new OfflineAudioContext(2, Math.round(TOTAL * SR), SR);
    Tone.setContext(ctx as never);
    // Tone's wrapper does not see an offline render advance (it reads 0 while suspended): its clock is the render's
    Object.defineProperty(Tone.getContext(), 'currentTime', { get: () => ctx.currentTime, configurable: true });
    vi.spyOn(performance, 'now').mockImplementation(() => ctx.currentTime * 1000);
    const { DeckEngine } = await import('../DeckEngine');
    const out = new Tone.Gain(1);
    out.connect(Tone.getDestination().input as never);
    const deck = new DeckEngine({ id: 'A', outputNode: out });
    deck.setFilterPosition(0);
    await audioLoadsSettled(400, 20000);
    const tape = levelTape(5);
    const buf = ctx.createBuffer(2, tape.length, SR);
    buf.copyToChannel(tape, 0); buf.copyToChannel(tape, 1);
    await deck.audioPlayer.loadDecodedBuffer(buf, null, new Float32Array(8));
    deck.audioPlayer.resume();
    expect(deck.playbackMode).toBe('audio');

    // the deck's own timers (the 10 ms forward-source pause under a reverse) run on the render clock
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] });
    const motion = spinbackTrack();
    const rates: Array<{ t: number; rate: number }> = [];
    const errors: string[] = [];
    for (let t = T0; t < T0 + 1.5; t += 0.008) {
      const at = Math.round(t * SR / 128) * 128 / SR; // suspend times are render-quantum aligned
      void ctx.suspend(at).then(() => {
        try {
          if (at === Math.round(T0 * SR / 128) * 128 / SR) deck.startScratch();
          const rate = motion.rateAt(at - T0);
          rates.push({ t: at, rate });
          deck.setScratchVelocity(rate);
          vi.advanceTimersByTime(8);
        } catch (err) { errors.push(`${at.toFixed(3)}: ${err instanceof Error ? err.message : String(err)}`); }
        void ctx.resume();
      });
    }
    const end = Math.round((T0 + 1.5) * SR / 128) * 128 / SR;
    void ctx.suspend(end).then(() => { try { deck.stopScratch(50); } catch (err) { errors.push(String(err)); } void ctx.resume(); });
    const heard = (await ctx.startRendering()).getChannelData(0);
    vi.useRealTimers();
    vi.restoreAllMocks();
    expect(errors).toEqual([]);

    const level = (t: number) => rms(heard, t - 0.02, t + 0.02);
    // before: forward at 1 x, the level rising with the needle
    expect(level(T0 - 0.15)).toBeGreaterThan(level(T0 - 0.55) * 1.1);
    // during: the record runs backward - the level falls with the needle - across the reverse
    const back = rates.filter((r) => r.rate < -0.3 && r.t > T0 + 0.06);
    expect(back.length * 0.008, 'seconds heard backward').toBeGreaterThanOrEqual(0.3);
    const first = back[0]!.t + 0.02, last = back[back.length - 1]!.t - 0.02;
    expect(level(first), 'heard, not silent').toBeGreaterThan(0.02);
    expect(level(last), `level ${level(first).toFixed(3)} -> ${level(last).toFixed(3)}: heard backward`).toBeLessThan(level(first) * 0.8);
    // the reverse lasts >= 0.4 s on the deck clock
    expect(rates.filter((r) => r.rate < -0.05).length * 0.008).toBeGreaterThanOrEqual(0.4);
    // after: forward again, rising
    expect(level(T0 + 2.05)).toBeGreaterThan(level(T0 + 1.75) * 1.05);
  }, 120_000);
});
