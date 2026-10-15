/**
 * "if i spam a button sometimes a lower and sometimes a higher note triggers" (2026-10-15).
 *
 * The keyboard plays a Furnace chip instrument through ToneEngine.triggerPolyNoteAttack, which takes a live voice
 * slot (100-115) from the VoiceAllocator. A slot is freed 100 ms after its key-up, so quick repeats of one key get
 * different slots, and the engine mapped the slot onto the chip (slot % channels): on the NES the same key went to
 * pulse 1, DPCM, noise and the triangle (an octave down), on the Game Boy to noise and the wave channel.
 *
 * Driven through the real triggerPolyNoteAttack / triggerPolyNoteRelease / triggerNoteAttack on a minimal engine whose
 * only instrument is a FurnaceDispatchSynth stand-in that records the chip channel of every note.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { chipChannelFor, LIVE_VOICE_BASE_CHANNEL } from '../furnace-dispatch/chipChannel';
import type { ToneEngine as ToneEngineT } from '../ToneEngine';

vi.mock('tone', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  let t = 0;
  return { ...real, getContext: () => ({ rawContext: { currentTime: 0 } }), immediate: () => (t += 0.001), now: () => t };
});

afterEach(() => { vi.useRealTimers(); });

interface Played { note: string; chan: number }

async function spam(chipChannels: number, presses: number, gapMs: number, previewChannel?: number): Promise<Played[]> {
  const { ToneEngine } = await import('../ToneEngine');
  const { FurnaceDispatchSynth } = await import('../furnace-dispatch/FurnaceDispatchSynth');
  const { VoiceAllocator } = await import('../audio/VoiceAllocator');

  const played: Played[] = [];
  const synth = Object.create(FurnaceDispatchSynth.prototype) as InstanceType<typeof FurnaceDispatchSynth> & { chan: number };
  synth.chan = 0;
  Object.assign(synth, {
    getNumChannels: () => chipChannels,
    setChannel: (c: number) => { synth.chan = c; },
    triggerAttack: (note: string) => { played.push({ note, chan: synth.chan }); },
    triggerRelease: () => {},
  });

  let last = 0;
  // Any other per-engine map a trigger touches (last note per channel, ...) starts empty
  const fields = Object.assign(Object.create(ToneEngine.prototype) as Record<string | symbol, unknown>, {
    liveVoiceAllocation: new Map<string, number>(),
    voiceAllocator: new VoiceAllocator(LIVE_VOICE_BASE_CHANNEL, 16),
    instrumentSynthTypes: new Map(),
    amigaPeriodSong: false,
    lastTriggerTime: 0,
    _nativeContext: null,
    getInstrument: () => synth,
    getImmediateTime: () => (last += 0.001),
    getSafeTime: () => (last += 0.001),
  });
  const engine = new Proxy(fields, {
    get: (t, k) => (k in t ? t[k] : (t[k] = new Map())),
  }) as unknown as ToneEngineT;

  const config = {
    id: 1, name: 'Pulse', type: 'synth', synthType: 'FurnaceNES', volume: -12, pan: 0, effects: [],
    furnace: previewChannel === undefined ? {} : { previewChannel },
  } as unknown as Parameters<ToneEngineT['triggerPolyNoteAttack']>[3];

  vi.useFakeTimers();
  for (let i = 0; i < presses; i++) {
    engine.triggerPolyNoteAttack(1, 'C4', 1, config);   // as useNoteInput's keydown with polyphony on
    vi.advanceTimersByTime(gapMs / 2);
    engine.triggerPolyNoteRelease(1, 'C4', config);     // keyup
    vi.advanceTimersByTime(gapMs / 2);
  }
  return played;
}

describe('spamming one key on a Furnace chip instrument', () => {
  it.each([20, 40, 80, 120])('every press of one key plays on the same chip channel (presses %i ms apart)', async (gap) => {
    const played = await spam(5, 24, gap);
    expect(played).toHaveLength(24);
    expect(new Set(played.map((p) => p.chan)), `NES channels used: ${played.map((p) => p.chan).join(' ')}`).toEqual(new Set([0]));
  }, 60_000);

  it('a live note plays on the instrument\'s preview channel (a DefleMask DAC instrument on the YM2612\'s sixth channel)', async () => {
    const played = await spam(6, 10, 30, 5);
    expect(new Set(played.map((p) => p.chan))).toEqual(new Set([5]));
  }, 60_000);

  it('tracker channels still map onto the chip channels; live slots and a bad preview channel fall back to channel 0', () => {
    expect([0, 1, 2, 3, 4, 5, 7].map((c) => chipChannelFor(c, 4))).toEqual([0, 1, 2, 3, 0, 1, 3]);
    expect([100, 113, 114, 115].map((c) => chipChannelFor(c, 4))).toEqual([0, 0, 0, 0]);
    expect(chipChannelFor(115, 4, 2)).toBe(2);
    expect(chipChannelFor(115, 4, 9)).toBe(0);
  });
});
