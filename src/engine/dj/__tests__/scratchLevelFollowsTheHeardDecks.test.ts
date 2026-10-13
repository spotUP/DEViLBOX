/**
 * Owner report 2026-10-13: "the scratch volume is not adjusted to blend in with the music, it's much louder". The
 * planned routine's level (X6: Deck C = 0.60 x the RMS of decks A + B, three_deck.render) read each deck's raw track
 * audio weighted only by the crossfader; the decks are heard through their channel fader and trim (the Auto DJ's
 * loudness match, +-12 dB), so a track trimmed down to match the set put the scratch that much over the rule.
 *
 * Path: the Auto DJ's `shapeRoutine` -> `scratchShapeDecks` (live engine + store) -> the beat the level is measured on.
 * Pass: scratch RMS / heard beat RMS = 0.60 +- 0.05 with the trim at -6 dB, +4 dB and the fader at 0.8.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { installRealWebAudio } from '@/test/audio/realWebAudio';
import { NumpyRandomState } from '@/engine/turntable/turntableSim';

const RATE = 22050;
const holder = vi.hoisted(() => ({ engine: null as unknown }));
vi.mock('@/engine/dj/DJEngine', () => ({ getDJEngine: () => holder.engine, getDJEngineIfActive: () => holder.engine }));

const rms = (x: ArrayLike<number>) => { let s = 0; for (let i = 0; i < x.length; i++) s += x[i]! * x[i]!; return Math.sqrt(s / x.length); };
function noise(n: number, r: number, seed: number): Float32Array {
  const rng = new NumpyRandomState(seed), k = r * Math.sqrt(3);
  return Float32Array.from({ length: n }, () => k * rng.uniform(-1, 1));
}

describe('the scratch level follows the decks as they are heard', () => {
  beforeAll(() => { installRealWebAudio(); });

  it.each([[-6, 1], [4, 1], [0, 0.8], [-6, 0.8]])('trim %s dB, channel fader %s: scratch / heard beat = 0.60', async (trimDb, volume) => {
    const { useDJStore } = await import('@/stores/useDJStore');
    const { scratchShapeDecks } = await import('@/engine/dj/scratch/autoScratchRuntime');
    const { programmeSpan, deckCLevel } = await import('@/engine/dj/scratch/scratchDeckC');
    const Tone = await import('tone');
    const ctx = Tone.getContext().rawContext as BaseAudioContext;
    const track = ctx.createBuffer(1, RATE * 30, RATE);
    track.getChannelData(0).set(noise(RATE * 30, 0.2, 5));
    holder.engine = { getDeck: () => ({ audioPlayer: { getAudioBuffer: () => track, getPosition: () => 5, getPlaybackRate: () => 1 }, getHeardTrackerState: () => null }) };
    const s = useDJStore.getState();
    s.setDeckState('A', { isPlaying: true, playbackMode: 'audio', fileName: 'a.wav', trimGain: trimDb, volume });
    s.setDeckState('B', { isPlaying: false });
    s.setCrossfaderCurve('linear');
    s.setCrossfader(0);
    const decks = (await scratchShapeDecks({ deck: 'A', startSec: ctx.currentTime + 1, trackFromSec: 6 }))!;
    const n = RATE * 8;
    const beat = new Float64Array(n);
    for (const d of decks) { const x = programmeSpan(d.audio, d.trackFromSec, n); for (let i = 0; i < n; i++) beat[i] = beat[i]! + d.gain * x[i]!; }
    const layer = noise(n, 0.1, 6);
    const level = deckCLevel(layer, beat);
    // the beat as the master hears it: the track through the trim and the fader
    const heard = rms(programmeSpan(track, 6, n)) * volume * Math.pow(10, trimDb / 20);
    const ratio = rms(layer) * level / heard;
    console.log(`[heard level] trim ${trimDb} dB fader ${volume}: scratch / heard beat ${ratio.toFixed(3)} (${(20 * Math.log10(ratio / 0.6)).toFixed(1)} dB from the rule)`);
    expect(ratio).toBeGreaterThan(0.55);
    expect(ratio).toBeLessThan(0.65);
  }, 60_000);

  it('a new DJ engine (the DJ view left and entered again) gets a new pool: its buses play on the new mixer and hear its decks', async () => {
    const { getScratchVoicePool } = await import('@/engine/dj/scratch/scratchVoicePool');
    const Tone = await import('tone');
    const ctx = Tone.getContext().rawContext as BaseAudioContext;
    const mixer = () => ({ samplerInput: ctx.createGain(), inputA: null, inputB: null });
    holder.engine = { mixer: mixer() };
    const first = getScratchVoicePool();
    expect(getScratchVoicePool()).toBe(first);
    holder.engine = { mixer: mixer() };
    expect(getScratchVoicePool()).not.toBe(first);
  });
});
