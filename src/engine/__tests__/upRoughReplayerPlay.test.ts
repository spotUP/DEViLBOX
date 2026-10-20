/**
 * O6k2 K2-14: an Up Rough song plays from the product's real transport entry, TrackerReplayer.play().
 *
 * ONE reachability test (wiring proved once; every other behaviour is tested where it lives in
 * src/lib/uprough/__tests__/upRoughSongPlayer.test.ts). Drives the REAL replayer: loadSong -> play() -> seekTo ->
 * pause/stop, with the Tone / ToneEngine / audio fakes of shiftRestartStartsAfterQueuedAudio.test.ts and the render
 * backend + recording audio of the player test. Sentinels are call counts on the real module exports (vi.spyOn):
 *   (a) startUpRoughSong ran from play() with the play position, and the mix it played equals renderSong of the doc
 *   (b) the per-channel scheduler fed the synth path no note while the song owned playback (control: it does with the
 *       Up Rough meta cleared, so the sentinel can move)
 *   (c) stop() and pause() call stopUpRoughSong
 *   (d) seekTo while playing restarts at the new position
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

import { TrackerReplayer, type TrackerSong } from '../TrackerReplayer';
import { openUpRoughSong } from '@/lib/uprough/openUpRoughSong';
import { parseSongFile } from '@/lib/uprough/songFile';
import { songFileToBarEvents } from '@/lib/uprough/barEvents';
import { renderSong, songRenderOptions } from '@engine/uprough/songRender';
import type { SectionMixCache } from '@engine/uprough/songRenderCache';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { startSample } from '@/lib/uprough/currentSongRender';
import { runRenderJob } from '@/lib/uprough/songRenderJob';
import { ensureUpRoughSong, setRenderBackendForTests, type RenderBackend } from '@/lib/uprough/upRoughSongService';
import * as player from '@/lib/uprough/upRoughSongPlayer';

const cache: SectionMixCache = new Map();
let renderCalls = 0;
const backend: RenderBackend = {
  async render(events, options, onSection) {
    renderCalls++;
    return runRenderJob(events, options, cache, onSection);
  },
};

interface Started { when: number; offset: number; data: Float32Array }
const started: Started[] = [];
const fakeAudio: player.PlayerAudio = {
  context: {
    get currentTime() { return clock.t; },
    createBuffer: (_c: number, length: number, sampleRate: number) => {
      const data = new Float32Array(length);
      return { length, sampleRate, getChannelData: () => data } as unknown as AudioBuffer;
    },
    createBufferSource: () => {
      const rec: Started = { when: 0, offset: 0, data: new Float32Array(0) };
      const node = {
        buffer: null as AudioBuffer | null, loop: false,
        connect: () => undefined, disconnect: () => undefined,
        start(when: number, offset: number) { rec.when = when; rec.offset = offset; rec.data = node.buffer!.getChannelData(0); started.push(rec); },
        stop: () => undefined,
      };
      return node as unknown as AudioBufferSourceNode;
    },
  },
  destination: {} as AudioNode,
};

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
  setRenderBackendForTests(backend, 5);
  player.setPlayerAudioForTests(fakeAudio);
  await openUpRoughSong(JSON.stringify(fixture));
}, 60000);
afterAll(() => { player.stopUpRoughSong(); setRenderBackendForTests(null); player.setPlayerAudioForTests(null); });

describe('TrackerReplayer.play() runs the Up Rough song player', () => {
  it('play() starts the rendered song at the play position, silences the per-channel notes; seekTo restarts it; pause and stop end it', async () => {
    const startSpy = vi.spyOn(player, 'startUpRoughSong');
    const stopSpy = vi.spyOn(player, 'stopUpRoughSong');
    const replayer = new TrackerReplayer();
    try {
      // Control: with the Up Rough meta cleared the same grid plays its notes through the synth path (the sentinel can move).
      const meta = useTrackerStore.getState().upRoughMeta;
      useTrackerStore.setState({ upRoughMeta: null });
      replayer.loadSong(loadedTrackerSong());
      synthCalls.names.length = 0;
      await replayer.play();
      await vi.waitFor(() => expect(synthCalls.names.length).toBeGreaterThan(0));
      expect(startSpy).toHaveBeenCalledTimes(0);
      replayer.stop();
      useTrackerStore.setState({ upRoughMeta: meta });

      // (a) play() from the song's order index 1, row 4
      const doc = parseSongFile(useTrackerStore.getState().exportUpRoughSong());
      const reference = renderSong(songFileToBarEvents(doc), songRenderOptions(doc));
      replayer.loadSong(loadedTrackerSong());
      replayer.forcePosition(1, 4);
      synthCalls.names.length = 0; started.length = 0; renderCalls = 0; startSpy.mockClear(); stopSpy.mockClear();
      await replayer.play();
      await vi.waitFor(() => expect(player.isUpRoughSongPlaying()).toBe(true), { timeout: 60000 });
      expect(startSpy).toHaveBeenCalledTimes(1);
      expect(startSpy).toHaveBeenLastCalledWith(1, 4);
      expect(renderCalls).toBeGreaterThanOrEqual(1);
      const song = await ensureUpRoughSong();
      const { patterns, patternOrder } = useTrackerStore.getState();
      const from = startSample(patterns.map((p) => p.length), patternOrder, 1, 4, song.rate, song.bpm);
      // A re-render that lands while playing swaps the source in at the same playhead (the player test's (d)), so every start sits on the play position.
      expect(started.length).toBeGreaterThanOrEqual(1);
      for (const s of started) expect(s.offset).toBeCloseTo(from / song.rate, 9);
      const played = player.upRoughMixPlayed()!;
      expect(played.length).toBe(reference.length);
      let err = 0;
      for (let i = 0; i < reference.length; i++) err = Math.max(err, Math.abs(played[i]! - reference[i]!));
      expect(err).toBeLessThan(1e-9);

      // (b) the scheduler ran (lookahead ticks) and no note reached the synths
      expect(replayer.isSuppressNotes).toBe(true);
      await new Promise((r) => setTimeout(r, 100));
      expect(synthCalls.names).toEqual([]);

      // (d) seek while playing restarts at the new position
      startSpy.mockClear();
      replayer.seekTo(2, 8);
      expect(startSpy).toHaveBeenCalledTimes(1);
      expect(startSpy).toHaveBeenLastCalledWith(2, 8);
      const before = started.length;
      await vi.waitFor(() => expect(started.length).toBeGreaterThan(before));
      expect(started[started.length - 1]!.offset).toBeCloseTo(startSample(patterns.map((p) => p.length), patternOrder, 2, 8, song.rate, song.bpm) / song.rate, 9);

      // (c) pause and stop both end the song player
      stopSpy.mockClear();
      replayer.pause();
      expect(stopSpy).toHaveBeenCalledTimes(1);
      expect(player.isUpRoughSongPlaying()).toBe(false);
      await replayer.play();
      await vi.waitFor(() => expect(player.isUpRoughSongPlaying()).toBe(true), { timeout: 60000 });
      stopSpy.mockClear();
      replayer.stop();
      expect(stopSpy).toHaveBeenCalledTimes(1);
      expect(player.isUpRoughSongPlaying()).toBe(false);
    } finally {
      replayer.stop();
      startSpy.mockRestore(); stopSpy.mockRestore();
      await vi.dynamicImportSettled();
    }
  }, 180000);
});
