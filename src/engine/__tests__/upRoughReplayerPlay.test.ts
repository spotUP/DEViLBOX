/**
 * A generated Up Rough song plays LIVE from the product's real transport entry, TrackerReplayer.play(): the replayer feeds
 * the pattern notes to the synth path (the UpRoughSoftsynth instruments) so channel mute, solo, VU and scopes act per channel.
 * The pre-rendered whole-song buffer (plan O6k2) no longer owns tracker playback.
 *
 * ONE reachability test. Drives the REAL replayer: loadSong -> play() -> seekTo -> pause/stop, with the Tone / ToneEngine fakes
 * of shiftRestartStartsAfterQueuedAudio.test.ts. Sentinels: ToneEngine.triggerNote calls (with their channel index), and
 * call counts on startUpRoughSong (vi.spyOn on the real export; must stay at zero).
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import fixture from '../../lib/uprough/__tests__/fixtures/e6.uprough-song.json';

const clock = vi.hoisted(() => ({ t: 10 }));
const synthCalls = vi.hoisted(() => ({ names: [] as string[], channels: [] as number[], muted: new Set<number>() }));

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
      if (k === 'triggerNote' && typeof a[8] === 'number') synthCalls.channels.push(a[8]);
      if (k === 'isChannelMuted') return synthCalls.muted.has(a[0] as number);
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
import { openUpRoughSong } from '@/lib/uprough/openUpRoughSong';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import * as player from '@/lib/uprough/upRoughSongPlayer';

/** The tracker's song for what the opener loaded into the stores (the notes are on the grid; only play() decides who sounds). */
function loadedTrackerSong(): TrackerSong {
  const { patterns, patternOrder } = useTrackerStore.getState();
  return {
    name: 'e6', format: 'XM', patterns, instruments: useInstrumentStore.getState().instruments,
    songPositions: patternOrder, songLength: patternOrder.length, restartPosition: 0,
    numChannels: patterns[0]!.channels.length, initialSpeed: 6, initialBPM: 140,
  } as unknown as TrackerSong;
}

beforeAll(async () => {
  await openUpRoughSong(JSON.stringify(fixture));
}, 60000);

describe('a loaded Up Rough song plays its notes live through the softsynth instruments, so channel mute and solo act on it', () => {
  it('play() feeds notes on several channels to the synths, nothing is suppressed, the whole-song player never starts, and a muted channel stays silent', async () => {
    const startSpy = vi.spyOn(player, 'startUpRoughSong');
    const replayer = new TrackerReplayer();
    try {
      expect(useTrackerStore.getState().upRoughMeta).not.toBeNull();
      replayer.loadSong(loadedTrackerSong());
      synthCalls.names.length = 0; synthCalls.channels.length = 0; synthCalls.muted.clear();
      await replayer.play();
      await vi.waitFor(() => expect(new Set(synthCalls.channels).size).toBeGreaterThan(1), { timeout: 20000 });
      expect(synthCalls.names.length).toBeGreaterThan(0);
      expect(replayer.isSuppressNotes).toBe(false);

      // seek while playing keeps the live path
      replayer.seekTo(2, 8);
      replayer.pause();
      await replayer.play();
      replayer.stop();
      expect(startSpy).toHaveBeenCalledTimes(0);

      // Mute: the silenced channel's notes do not reach the synth.
      const silenced = synthCalls.channels[0]!;
      synthCalls.muted.add(silenced);
      synthCalls.channels.length = 0;
      replayer.loadSong(loadedTrackerSong());
      await replayer.play();
      await vi.waitFor(() => expect(synthCalls.channels.length).toBeGreaterThan(0), { timeout: 20000 });
      await new Promise((r) => setTimeout(r, 200));
      expect(synthCalls.channels).not.toContain(silenced);
      expect(startSpy).toHaveBeenCalledTimes(0);
    } finally {
      replayer.stop();
      startSpy.mockRestore();
      synthCalls.muted.clear();
      await vi.dynamicImportSettled();
    }
  }, 120000);
});
