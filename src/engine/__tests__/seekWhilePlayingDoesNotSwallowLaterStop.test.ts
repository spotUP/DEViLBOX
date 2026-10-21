/**
 * SEEK-THEN-STOP: a seek while playing must not leave skipNextReload armed.
 *
 * usePatternPlayback swallows the next Stop (and skips the next needed reload) while replayer.skipNextReload
 * is true. forcePosition set it unconditionally; a seek while already playing causes no effect run to
 * consume it, so it leaked and the user's later Stop was ignored by the effect. Drives the REAL replayer
 * through play() and forcePosition. Sentinel: processTick ran after the seek. Numbers: flag true right after
 * the seek, false once the render cycle is over.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { TrackerReplayer } from '../TrackerReplayer';
import type { TrackerSong } from '../TrackerReplayer';

const clock = vi.hoisted(() => ({ t: 10 }));

vi.mock('tone', async (orig) => {
  const transport = { bpm: { value: 125 }, state: 'stopped', stop() {}, start() {}, cancel() {}, pause() {} };
  const node = () => ({ connect() {}, disconnect() {}, dispose() {}, gain: { value: 1, rampTo() {}, setValueAtTime() {}, cancelScheduledValues() {} } });
  return { ...(await orig<object>()), Gain: function () { return node(); }, Player: function () { return { ...node(), stop() {}, volume: { value: 0 } }; }, Panner: function () { return { ...node(), pan: { value: 0 } }; }, getContext: () => ({}), start: async () => undefined, context: { rawContext: { state: 'running' }, resume: async () => undefined }, now: () => clock.t, getTransport: () => transport };
});
vi.mock('../StereoSeparationNode', () => ({
  StereoSeparationNode: function () { return { inputTone: {}, outputTone: { connect() {}, disconnect() {} }, setMode() {}, dispose() {} }; },
}));
vi.mock('@/utils/audio-context', async (orig) => ({ ...(await orig<object>()), getNativeAudioNode: () => null }));
vi.mock('../ToneEngine', () => {
  const engine = new Proxy({}, { get: () => () => undefined });
  return { getToneEngine: () => engine };
});
vi.mock('@/stores/useMixerStore', async (orig) => ({ ...(await orig<object>()), scheduleWasmEffectRebuild: vi.fn() }));
vi.mock('../dj/DeckScratchBuffer', () => ({
  // No AudioWorklet in node: every scratch-buffer method is a no-op.
  DeckScratchBuffer: function () { return new Proxy({}, { get: (_t, key) => (key === 'then' ? undefined : () => undefined) }); },
  TRACKER_SCRATCH_BUFFER_ID: 'tracker',
}));
vi.mock('@lib/import/wasm/OpenMPTSoundlib', () => ({ destroyModule: async () => undefined, createNewModule: async () => false }));
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

const makeSong = (): TrackerSong => ({
  name: 'x', format: 'XM', patterns: [{ id: 'p0', name: 'p0', length: 64, channels: [] }], instruments: [],
  songPositions: [0], songLength: 1, restartPosition: 0, numChannels: 4, initialSpeed: 6, initialBPM: 125,
} as unknown as TrackerSong);


describe('a seek while playing does not swallow a later Stop', () => {
  afterEach(() => { clock.t = 10; });

  it('skipNextReload is armed for the seek, then expires without an effect run', async () => {
    vi.useFakeTimers();
    let ticks = 0;
    const spy = vi.spyOn(TrackerReplayer.prototype as unknown as { processTick: (t: number) => void }, 'processTick')
      .mockImplementation(function () { ticks++; });
    const replayer = new TrackerReplayer();
    replayer.loadSong(makeSong());
    await replayer.play();
    vi.advanceTimersByTime(20);
    ticks = 0;
    clock.t += 0.01;
    replayer.forcePosition(0, 0);
    expect(replayer.skipNextReload, 'armed for the effect run the seek causes').toBe(true);
    vi.advanceTimersByTime(20);
    expect(ticks, 'the scheduler ran after the seek').toBeGreaterThan(0);
    vi.advanceTimersByTime(2000);
    expect(replayer.skipNextReload, 'no effect run consumed it; a later Stop must not be swallowed').toBe(false);
    replayer.stop();
    await vi.dynamicImportSettled();
    spy.mockRestore();
    vi.useRealTimers();
  });
});
