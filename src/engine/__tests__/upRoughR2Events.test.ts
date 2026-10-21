/**
 * R2d: the render events of an Up Rough song reach the R2 store from the render service entry, ensureUpRoughSong
 * (the tracker plays live and no longer renders on play()). ONE reachability test (the event grammar is tested in uprough/__tests__/songRenderEvents.test.ts).
 * Sentinel: the count of events the backend's onR2 callback received, which must equal the store's log; the log must
 * run start ... done with the 13 bank voices.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fixture from '../../lib/uprough/__tests__/fixtures/e6.uprough-song.json';

const clock = vi.hoisted(() => ({ t: 10 }));
const synthCalls = vi.hoisted(() => ({ names: [] as string[] }));

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
      if (/^trigger/.test(k)) synthCalls.names.push(k);
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

import { openUpRoughSong } from '@/lib/uprough/openUpRoughSong';
import type { SectionMixCache } from '@engine/uprough/songRenderCache';
import { useUpRoughR2Store } from '@stores/useUpRoughR2Store';
import { runRenderJob } from '@/lib/uprough/songRenderJob';
import { ensureUpRoughSong, setRenderBackendForTests, type RenderBackend } from '@/lib/uprough/upRoughSongService';

const cache: SectionMixCache = new Map();
let onR2Calls = 0;
const backend: RenderBackend = {
  async render(events, options, onSection, onR2) {
    onR2Calls = 0; // the store restarts its log with every render, so the sentinel counts the latest one
    return runRenderJob(events, options, cache, onSection, onR2 ? (e) => { onR2Calls++; onR2(e); } : undefined);
  },
};
beforeAll(async () => {
  setRenderBackendForTests(backend, 5);
  await openUpRoughSong(JSON.stringify(fixture));
}, 60000);
afterAll(() => { setRenderBackendForTests(null); });

describe('ensureUpRoughSong fills the R2 event log', () => {
  it('rendering the song and the store holds start, 13 bank voices, ..., done, equal to what the backend emitted', async () => {
    {
      // The tracker no longer renders on play (it plays live); the render service is entered by ensureUpRoughSong.
      await ensureUpRoughSong();
      const log = useUpRoughR2Store.getState().events;
      expect(onR2Calls).toBeGreaterThan(0);
      expect(log).toHaveLength(onR2Calls);
      expect(log[0]!.type).toBe('start');
      expect(log[log.length - 1]!.type).toBe('done');
      expect(log.filter((e) => e.type === 'bank')).toHaveLength(13);
      expect(log.map((e) => e.seq)).toEqual(log.map((_, i) => i));
    }
  }, 120000);
});
