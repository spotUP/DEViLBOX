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
 * compares every band to the dry input: unity, also through the mixer
 * (owner decision 2026-10-11: the limiters are safety only, no make-up gain).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/engine/ToneEngine', () => ({
  getToneEngine: () => ({ setInstrumentOutputOverride: () => {}, preloadInstruments: async () => {}, ensureWASMSynthsReady: async () => {}, rerouteNativeEngine: () => {} }),
}));

import { installRealWebAudio, resolveWorkletsFromPublic, servePublicToFetch, audioLoadsSettled } from '@/test/audio/realWebAudio';
import { rmsDb, SR } from '@/test/audio/masterChainRig';

async function throughDeck(input: Float32Array, viaMixer = false): Promise<Float32Array> {
  installRealWebAudio(); resolveWorkletsFromPublic(); servePublicToFetch();
  const Tone = await import('tone');
  const ctx = new OfflineAudioContext(2, input.length, SR);
  Tone.setContext(ctx as never);
  const { DeckEngine } = await import('../DeckEngine');
  let out: InstanceType<typeof Tone.Gain>;
  if (viaMixer) {
    // Deck A -> crossfader on A -> master -> the mixer's safety limiter -> destination.
    const { DJMixerEngine } = await import('../DJMixerEngine');
    const mixer = new DJMixerEngine();
    mixer.setCrossfader(0);
    out = mixer.inputA;
  } else {
    out = new Tone.Gain(1);
    out.connect(Tone.getDestination().input as never);
  }
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

function bandGains(dry: Float32Array, wet: Float32Array): Record<number, number> {
  const gains: Record<number, number> = {};
  // Skip each segment's first 0.2 s: the filters' settling after the step.
  BANDS.forEach((hz, b) => {
    const from = b * SEGMENT + Math.round(SR * 0.2), to = (b + 1) * SEGMENT;
    gains[hz] = rmsDb(wet, from, to) - rmsDb(dry, from, to);
  });
  return gains;
}

describe('a DJ deck at neutral settings', () => {
  it('passes every band at unity gain: no notch at the EQ crossovers, no lift from the idle filters, no limiter make-up', async () => {
    const dry = steppedSines();
    const gains = bandGains(dry, await throughDeck(dry));
    for (const g of Object.values(gains)) expect(Math.abs(g), JSON.stringify(gains)).toBeLessThan(0.15);
  }, 600_000);

  it('through the mixer (crossfader on the deck, master 1) the song still reaches the output at unity', async () => {
    const dry = steppedSines();
    const gains = bandGains(dry, await throughDeck(dry, true));
    for (const g of Object.values(gains)) expect(Math.abs(g), JSON.stringify(gains)).toBeLessThan(0.15);
  }, 600_000);

  it('the safety limiters catch overs only: threshold -1 dBFS, release long enough not to ripple a kick', async () => {
    installRealWebAudio();
    const { createSafetyLimiter, compressorMakeupDb } = await import('../djLimiter');
    const limiter = createSafetyLimiter(new OfflineAudioContext(2, 128, SR));
    expect(limiter.input.threshold.value).toBe(-1);
    expect(limiter.input.release.value).toBeGreaterThanOrEqual(0.05);
    expect(20 * Math.log10(limiter.output.gain.value)).toBeCloseTo(-compressorMakeupDb(-1, 20), 4);
  });
});
