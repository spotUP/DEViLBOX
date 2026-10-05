/**
 * A whole-song engine's subsong that ends starts the next one.
 *
 * The silence detector on every direct-routed native engine ended the whole
 * song when its output went quiet, so a short subsong (a jingle in an NSF, a
 * KSS track) stopped playback (owner, 2026-10-05: "just skip to next subsong
 * when it ends"). Driven through `startNativeEngines` with the game-music-emu
 * engine stood in: the engine reports its subsongs the way GmeEngine does
 * (reportSubsongs), the real SilenceDetector watches a fake analyser, and
 * `playSubsong` is the sentinel. The setting turns it off, the last subsong
 * still ends the song.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const level = { v: 0.1 };
const played: number[] = [];

const fakeEngine = (() => {
  const analyser = {
    fftSize: 2048, context: { state: 'running' },
    getFloatTimeDomainData(buf: Float32Array) { buf.fill(level.v); },
    connect() {}, disconnect() {},
  };
  const context = { sampleRate: 48000, createAnalyser: () => analyser, state: 'running', currentTime: 0 };
  const gain = { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} };
  const output = { context, gain, connect() {}, disconnect() {} };
  return {
    output,
    ready: async () => {},
    async loadTune(_buf: ArrayBuffer, track: number) {
      const { reportSubsongs } = await import('@engine/wasm/subsongRequests');
      reportSubsongs('Gme', 3, track);
    },
    play: vi.fn(), stop: vi.fn(), pause: vi.fn(),
    async playSubsong(index: number): Promise<number> {
      played.push(index);
      const { reportSubsongs } = await import('@engine/wasm/subsongRequests');
      reportSubsongs('Gme', 3, index);
      return index;
    },
  };
})();

vi.mock('@/engine/gme/GmeEngine', () => ({
  GmeEngine: { getInstance: () => fakeEngine, hasInstance: () => true },
}));
vi.mock('../ToneEngine', () => ({
  getToneEngine: () => ({ getInstrument() {}, connectMeters() {} }),
}));

const song = {
  name: 'dr mario', format: 'NSF', patterns: [], instruments: [], songPositions: [0], songLength: 1,
  restartPosition: 0, numChannels: 5, initialSpeed: 6, initialBPM: 125, linearPeriods: false,
  gmeFileData: new ArrayBuffer(16), gmeTrack: 1,
} as unknown as TrackerSong;

async function start(): Promise<{ transportStop: ReturnType<typeof vi.fn> }> {
  const { useTransportStore } = await import('@stores/useTransportStore');
  const transportStop = vi.fn();
  useTransportStore.setState({ isPlaying: true, stop: transportStop } as never);
  const routing = await import('../replayer/NativeEngineRouting');
  routing.clearRunningEngineKeys();
  await routing.startNativeEngines(song, {} as never, true, false, new Set());
  return { transportStop };
}

/** Sound for a second, then the subsong's silence runs out (5 s) and fades (2 s). */
async function subsongEnds(): Promise<void> {
  level.v = 0.1;
  await vi.advanceTimersByTimeAsync(1000);
  level.v = 0;
  await vi.advanceTimersByTimeAsync(5_500 + 2_000);
}

describe('a whole-song engine subsong that ends', () => {
  // Module graph loaded with real timers: its init must not wait on fake ones.
  beforeAll(async () => {
    await import('../replayer/NativeEngineRouting');
    await import('@/engine/gme/GmeEngine');
    await import('@engine/wasm/subsongRequests');
    await import('@stores/useTransportStore');
    await import('@stores/useSettingsStore');
  }, 60_000);
  beforeEach(async () => {
    vi.useFakeTimers();
    played.length = 0;
    const { useSettingsStore } = await import('@stores/useSettingsStore');
    useSettingsStore.setState({ autoAdvanceSubsongs: true });
  });
  afterEach(() => { vi.useRealTimers(); });

  it('starts the next subsong and keeps watching; the last one ends the song', async () => {
    const { transportStop } = await start();
    const { useFormatStore } = await import('@stores/useFormatStore');
    expect(useFormatStore.getState().nativeSubsongs).toMatchObject({ engine: 'Gme', count: 3, current: 1 });

    await subsongEnds();
    expect(played).toEqual([2]); // sentinel: the silence advanced the subsong
    expect(transportStop).not.toHaveBeenCalled();
    expect(useFormatStore.getState().nativeSubsongs?.current).toBe(2);
    expect(useFormatStore.getState().gmeTrack).toBe(2); // play after stop resumes it

    await subsongEnds(); // the detector watches again: the last subsong ends the song
    expect(played).toEqual([2]);
    expect(transportStop).toHaveBeenCalledTimes(1);
  });

  it('stops at the end when the setting is off', async () => {
    const { useSettingsStore } = await import('@stores/useSettingsStore');
    useSettingsStore.setState({ autoAdvanceSubsongs: false });
    const { transportStop } = await start();
    await subsongEnds();
    expect(played).toEqual([]);
    expect(transportStop).toHaveBeenCalledTimes(1);
  });
});
