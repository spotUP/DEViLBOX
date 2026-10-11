/**
 * DJ meters and scopes led the audio by the output latency (2026-10-10
 * audit): the deck's waveform / FFT analysers and VU meter, and the mixer's
 * master meter, tapped the graph directly, so they showed what had just been
 * rendered - outputLatency before the listener hears it.
 *
 * Renders a real DeckEngine offline with an output latency of 100 ms: silence,
 * then a tone from 0.30 s. At 0.35 s the tone has been rendered but is not
 * heard yet - the scope must still be silent; at 0.45 s it is heard.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/engine/ToneEngine', () => ({
  getToneEngine: () => ({ setInstrumentOutputOverride: () => {}, preloadInstruments: async () => {}, ensureWASMSynthsReady: async () => {}, rerouteNativeEngine: () => {} }),
}));

import { installRealWebAudio, resolveWorkletsFromPublic, servePublicToFetch, audioLoadsSettled } from '@/test/audio/realWebAudio';
import { SR } from '@/test/audio/masterChainRig';

const LATENCY = 0.1;
const ONSET = 0.3;

describe('DJ scopes and meters show the heard signal', () => {
  it('the deck scope stays silent until a tone is heard, not when it is rendered', async () => {
    installRealWebAudio(); resolveWorkletsFromPublic(); servePublicToFetch();
    const Tone = await import('tone');
    const length = Math.round(SR * 0.6);
    const ctx = new OfflineAudioContext(2, length, SR);
    Object.defineProperty(ctx, 'outputLatency', { configurable: true, value: LATENCY });
    Tone.setContext(ctx as never);
    const { DeckEngine } = await import('../DeckEngine');
    const out = new Tone.Gain(1);
    out.connect(Tone.getDestination().input as never);
    const deck = new DeckEngine({ id: 'A', outputNode: out });
    await audioLoadsSettled(400, 20000);

    const buf = ctx.createBuffer(2, length, SR);
    const x = new Float32Array(length);
    for (let i = Math.round(SR * ONSET); i < length; i++) x[i] = 0.5 * Math.sin(2 * Math.PI * 440 * i / SR);
    buf.copyToChannel(x, 0); buf.copyToChannel(x, 1);
    const player = (deck.audioPlayer as unknown as { player: InstanceType<typeof Tone.Player> }).player;
    player.buffer = new Tone.ToneAudioBuffer(buf as never);
    player.start(0);

    const peak = (w: Float32Array) => w.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    const readings: Record<string, number> = {};
    const at = (t: number, name: string) => ctx.suspend(t).then(() => { readings[name] = peak(deck.getWaveform()); return ctx.resume(); });
    // Quantum-aligned suspend times (128 frames at 48 kHz).
    const q = (t: number) => Math.round(t * SR / 128) * 128 / SR;
    void at(q(ONSET + LATENCY / 2), 'renderedNotHeard');
    void at(q(ONSET + LATENCY * 1.5), 'heard');
    await ctx.startRendering();

    expect(readings.renderedNotHeard, JSON.stringify(readings)).toBeLessThan(0.01);
    expect(readings.heard, JSON.stringify(readings)).toBeGreaterThan(0.3);
  }, 600_000);
});
