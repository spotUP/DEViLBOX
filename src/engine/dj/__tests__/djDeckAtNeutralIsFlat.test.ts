/**
 * "The tracker view and the DJ view audio output is very different when I
 * play the same song; the tracker view sounds pure, the DJ view sounds
 * processed" (owner, 2026-10-10).
 *
 * Measured on the real deck chain at neutral (EQ 0 dB, filter centred), third-
 * octave noise at -30 dBFS (below the deck limiter): -10.5 dB at 400 Hz and
 * -10.4 dB at 2.5 kHz (Tone.EQ3's crossovers cancel when their bands are
 * summed), and +1 to +3 dB near 30 Hz and 10 kHz (the "bypassed" filters were
 * resonant biquads parked at 20 Hz / 20 kHz). The isolator EQ is now
 * Linkwitz-Riley (bands sum to an all-pass) and the idle filters open fully.
 *
 * Renders the same buffer through a real DeckEngine (audio player -> key lock
 * -> deck gain -> EQ -> filters -> channel gain -> limiter) offline and
 * compares every band to the dry input. All bands must move together; what
 * remains common to them is the deck limiter's make-up gain (see below).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/engine/ToneEngine', () => ({
  getToneEngine: () => ({ setInstrumentOutputOverride: () => {}, preloadInstruments: async () => {}, ensureWASMSynthsReady: async () => {}, rerouteNativeEngine: () => {} }),
}));

import { installRealWebAudio, resolveWorkletsFromPublic, servePublicToFetch, audioLoadsSettled } from '@/test/audio/realWebAudio';
import { rmsDb, SR } from '@/test/audio/masterChainRig';

async function throughDeck(input: Float32Array): Promise<Float32Array> {
  installRealWebAudio(); resolveWorkletsFromPublic(); servePublicToFetch();
  const Tone = await import('tone');
  const ctx = new OfflineAudioContext(2, input.length, SR);
  Tone.setContext(ctx as never);
  const { DeckEngine } = await import('../DeckEngine');
  const out = new Tone.Gain(1);
  out.connect(Tone.getDestination().input as never);
  const deck = new DeckEngine({ id: 'A', outputNode: out });
  deck.setFilterPosition(0);
  for (const band of ['low', 'mid', 'high'] as const) deck.setEQ(band, 0, 0);
  await audioLoadsSettled(400, 20000);
  const buf = ctx.createBuffer(2, input.length, SR);
  buf.copyToChannel(new Float32Array(input), 0); buf.copyToChannel(new Float32Array(input), 1);
  const player = (deck.audioPlayer as unknown as { player: InstanceType<typeof Tone.Player> }).player;
  player.buffer = new Tone.ToneAudioBuffer(buf as never);
  player.start(0);
  const rendered = await ctx.startRendering();
  return rendered.getChannelData(0).slice();
}

const BANDS = [31.5, 100, 400, 1000, 2500, 10000];
const SEGMENT = Math.round(SR * 0.6);

/** One sine per band, back to back, -30 dBFS (below the deck limiter): one render measures them all. */
function steppedSines(): Float32Array {
  const x = new Float32Array(SEGMENT * BANDS.length);
  const a = 10 ** (-30 / 20);
  BANDS.forEach((hz, b) => { for (let i = 0; i < SEGMENT; i++) x[b * SEGMENT + i] = a * Math.sin(2 * Math.PI * hz * i / SR); });
  return x;
}

describe('a DJ deck at neutral settings', () => {
  it('passes every band at the same gain: no notch at the EQ crossovers, no lift from the idle filters', async () => {
    const dry = steppedSines();
    const wet = await throughDeck(dry);
    const gains: Record<number, number> = {};
    // Skip each segment's first 0.2 s: the filters' settling after the step.
    BANDS.forEach((hz, b) => {
      const from = b * SEGMENT + Math.round(SR * 0.2), to = (b + 1) * SEGMENT;
      gains[hz] = rmsDb(wet, from, to) - rmsDb(dry, from, to);
    });
    const values = Object.values(gains);
    const spread = Math.max(...values) - Math.min(...values);
    expect(spread, JSON.stringify(gains)).toBeLessThan(0.3);
    // What is common to all bands is the deck limiter's make-up gain, not the
    // EQ or the filters: a DynamicsCompressorNode raises its output by
    // (1 / curve(0 dBFS))^0.6 - threshold -3 dB, ratio 20 -> curve(0 dBFS) =
    // -2.85 dB -> +1.71 dB. Recorded here so a change to it is a decision,
    // not a side effect.
    expect(gains[1000], JSON.stringify(gains)).toBeCloseTo(1.71, 1);
  }, 600_000);
});
