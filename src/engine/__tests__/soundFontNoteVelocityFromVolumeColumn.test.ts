/**
 * A SoundFont note plays at its volume-column velocity, not full velocity.
 *
 * Drives the REAL TrackerReplayer through play(): a row with note + volume column 0x30 (level 32/64) reaches
 * ToneEngine.triggerNote with velocity 0.5 for a FluidSynth instrument (the note's velocity carries the volume),
 * while a per-channel native lane synth (TR909) keeps velocity 1 (its volume goes on the lane level).
 * Sentinel: the triggerNote call count moved (the note really reached the engine).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const clock = vi.hoisted(() => ({ t: 10 }));
const calls = vi.hoisted(() => ({ velocities: [] as number[] }));

vi.mock('tone', async (orig) => {
  const transport = { bpm: { value: 140 }, state: 'stopped', stop() {}, start() {}, cancel() {}, pause() {} };
  const node = () => ({ connect() {}, disconnect() {}, dispose() {}, gain: { value: 1, rampTo() {}, setValueAtTime() {}, cancelScheduledValues() {} } });
  return { ...(await orig<object>()), Gain: function () { return node(); }, Player: function () { return { ...node(), stop() {}, volume: { value: 0 } }; }, Panner: function () { return { ...node(), pan: { value: 0 } }; }, getContext: () => ({}), start: async () => undefined, context: { rawContext: { state: 'running' }, resume: async () => undefined }, now: () => clock.t, Draw: { schedule: (fn: () => void) => fn(), cancel() {} }, getTransport: () => transport };
});
vi.mock('../StereoSeparationNode', () => ({
  StereoSeparationNode: function () { return { inputTone: {}, outputTone: { connect() {}, disconnect() {} }, setMode() {}, dispose() {} }; },
}));
vi.mock('@/utils/audio-context', async (orig) => ({ ...(await orig<object>()), getNativeAudioNode: () => null }));
vi.mock('../ToneEngine', () => {
  // Every method is a no-op; the trigger* names are recorded: those are the notes that reach the synths.
  const engine: unknown = new Proxy({}, {
    get: (_t, k: string) => (...a: unknown[]) => {
      if (k === 'triggerNote') calls.velocities.push(a[4] as number);
      return k === 'ensureWASMSynthsReady' || k === 'preloadInstruments' ? Promise.resolve() : (void a, undefined);
    },
  });
  return { getToneEngine: () => engine, ToneEngine: { getInstance: () => engine } };
});
vi.mock('@/stores/useMixerStore', async (orig) => ({ ...(await orig<object>()), scheduleWasmEffectRebuild: vi.fn() }));
vi.mock('../dj/DeckScratchBuffer', () => ({
  DeckScratchBuffer: function () { return new Proxy({}, { get: (_t, key) => (key === 'then' ? undefined : () => undefined) }); },
  TRACKER_SCRATCH_BUFFER_ID: 'tracker',
}));
vi.mock('@lib/import/wasm/OpenMPTSoundlib', () => ({ preloadSoundlib: async () => undefined, destroyModule: async () => undefined, createNewModule: async () => false }));
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => undefined, classifyInstruments: () => undefined }) },
}));

import { TrackerReplayer, type TrackerSong } from '../TrackerReplayer';
import { useTrackerStore } from '@stores/useTrackerStore';

const makeSong = (synthType: string): TrackerSong => ({
  name: 'x', format: 'XM', numChannels: 1, initialSpeed: 6, initialBPM: 125, songPositions: [0], songLength: 1, restartPosition: 0,
  instruments: [{ id: 1, name: 'i', synthType, type: 'synth', effects: [], volume: 0, pan: 0 }],
  patterns: [{ id: 'p0', name: 'p0', length: 16, channels: [{ id: 'c0', name: 'c0', rows: [
    { note: 49, instrument: 1, volume: 0x30, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 },
  ] }] }],
} as unknown as TrackerSong);

async function playedVelocities(synthType: string): Promise<number[]> {
  vi.useFakeTimers();
  calls.velocities.length = 0;
  const replayer = new TrackerReplayer();
  const song = makeSong(synthType);
  // The scheduler reads the live pattern from the tracker store, as in the product.
  useTrackerStore.setState({ patterns: song.patterns } as never);
  replayer.loadSong(song);
  await replayer.play();
  for (let i = 0; i < 10; i++) { clock.t += 0.05; vi.advanceTimersByTime(50); }
  replayer.stop();
  await vi.dynamicImportSettled();
  vi.useRealTimers();
  return calls.velocities.slice();
}

describe('volume-column velocity of a synth note', () => {
  afterEach(() => { clock.t = 10; });

  it('a SoundFont note plays at its volume-column velocity, not full velocity', async () => {
    const v = await playedVelocities('FluidSynth');
    expect(v.length, 'the note reached ToneEngine.triggerNote').toBeGreaterThan(0);
    expect(v[0]).toBeCloseTo(0.5, 5);
  });

  it('a per-channel native lane synth keeps full velocity (its volume rides the lane)', async () => {
    const v = await playedVelocities('TR909');
    expect(v.length, 'the note reached ToneEngine.triggerNote').toBeGreaterThan(0);
    expect(v[0]).toBeCloseTo(1, 5);
  });
});
