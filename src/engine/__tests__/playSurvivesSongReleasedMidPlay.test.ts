/**
 * play() reads this.song after its awaits. A song that leaves during one of them (a failed load or a new song:
 * songLifecycle.unloadSong -> releaseSong) must end that play, not crash it on a null song (EdLib 404 crash,
 * TrackerReplayer.play "Cannot read properties of null (reading 'libopenmptFileData')").
 *
 * Drives the REAL replayer with the Tone / ToneEngine fakes of upRoughReplayerPlay.test.ts. The song is released
 * from inside the Phase 5.4 module build (the await the crash came out of), without a stop().
 */
import { describe, expect, it, vi } from 'vitest';

const hook = vi.hoisted(() => ({ duringBuild: null as null | (() => void) }));

vi.mock('tone', async (orig) => {
  const transport = { bpm: { value: 125 }, state: 'stopped', stop() {}, start() {}, cancel() {}, pause() {} };
  const node = () => ({ connect() {}, disconnect() {}, dispose() {}, gain: { value: 1, rampTo() {}, setValueAtTime() {}, cancelScheduledValues() {} } });
  return { ...(await orig<object>()), Gain: function () { return node(); }, Player: function () { return { ...node(), stop() {}, volume: { value: 0 } }; }, Panner: function () { return { ...node(), pan: { value: 0 } }; }, getContext: () => ({}), start: async () => undefined, context: { rawContext: { state: 'running' }, resume: async () => undefined }, now: () => 10, Draw: { schedule: (fn: () => void) => fn(), cancel() {} }, getTransport: () => transport };
});
vi.mock('../StereoSeparationNode', () => ({
  StereoSeparationNode: function () { return { inputTone: {}, outputTone: { connect() {}, disconnect() {} }, setMode() {}, dispose() {} }; },
}));
vi.mock('@/utils/audio-context', async (orig) => ({ ...(await orig<object>()), getNativeAudioNode: () => null }));
vi.mock('../ToneEngine', () => {
  const engine: unknown = new Proxy({}, {
    get: (_t, k: string) => () => (k === 'ensureWASMSynthsReady' || k === 'preloadInstruments' ? Promise.resolve() : undefined),
  });
  return { getToneEngine: () => engine, ToneEngine: { getInstance: () => engine } };
});
vi.mock('@/stores/useMixerStore', async (orig) => ({ ...(await orig<object>()), scheduleWasmEffectRebuild: vi.fn() }));
vi.mock('../dj/DeckScratchBuffer', () => ({
  DeckScratchBuffer: function () { return new Proxy({}, { get: (_t, key) => (key === 'then' ? undefined : () => undefined) }); },
  TRACKER_SCRATCH_BUFFER_ID: 'tracker',
}));
vi.mock('@lib/import/wasm/OpenMPTSoundlib', () => ({ preloadSoundlib: async () => undefined, destroyModule: async () => undefined, createNewModule: async () => false }));
vi.mock('@engine/libopenmpt/OpenMPTEditBridge', () => ({
  ownsSongData: () => true,
  reset: () => undefined,
  createModuleForSong: async () => { hook.duringBuild?.(); return null; },
}));
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => undefined, classifyInstruments: () => undefined }) },
}));

import { TrackerReplayer, type TrackerSong } from '../TrackerReplayer';

function emptySong(): TrackerSong {
  const rows = Array.from({ length: 4 }, () => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 }));
  return {
    name: 'edlib-race', format: 'XM', instruments: [],
    patterns: [{ id: 'p0', name: 'p0', length: 4, channels: [{ id: 'c0', name: 'c0', rows, muted: false, solo: false, collapsed: false, volume: 100, pan: 0, instrumentId: null, color: null }] }],
    songPositions: [0], songLength: 1, restartPosition: 0, numChannels: 1, initialSpeed: 6, initialBPM: 125,
  } as unknown as TrackerSong;
}

describe('a song released while play() awaits ends that play instead of crashing it', () => {
  it('play() resolves without throwing when releaseSong() runs inside the module build await', async () => {
    const replayer = new TrackerReplayer();
    try {
      replayer.loadSong(emptySong());
      hook.duringBuild = () => replayer.releaseSong();
      await expect(replayer.play()).resolves.toBeUndefined();
    } finally {
      hook.duringBuild = null;
      replayer.stop();
      await vi.dynamicImportSettled();
    }
  }, 60000);
});
