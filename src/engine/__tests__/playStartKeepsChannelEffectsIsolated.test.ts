/**
 * PLAY-START-ISOLATION: every Play distorted for its first 1-3 rows (owner, 2026-10-22).
 *
 * The song has a master Distortion aimed at channels 0-3. Stop cleared the playing isolation engine, so the
 * master chain rebuilt with no engine and put the Distortion on the whole mix; the next play re-registered
 * the engine and rebuilt asynchronously, after the worklet had already started rendering.
 *
 * ONE wiring test through the product's entry point: the REAL TrackerReplayer.play / stop / loadSong driving
 * the REAL LibopenmptEngine.play / handleMessage / stop (only startWithCoordinator's file load and the worklet
 * port are stubbed). Sentinel: the master chain rebuilt at least once and the paused 'load' reached the port.
 * Numbers: every master-chain rebuild from the first play through stop and the second play resolves the
 * libopenmpt engine (an effect aimed at channels is never put on the whole mix); the worklet gets 'unpause'
 * only after the slot build resolved, on both plays; a reload of the same tune keeps the engine, a different
 * tune clears it.
 */
import { describe, it, expect, vi } from 'vitest';
import { TrackerReplayer } from '../TrackerReplayer';
import { getActiveIsolationEngine, getPlayingIsolationEngine, setPlayingIsolationEngine } from '../tone/ChannelRoutedEffects';
import { useAudioStore } from '@/stores/useAudioStore';
import type { TrackerSong } from '../TrackerReplayer';

const h = vi.hoisted(() => ({
  posted: [] as string[],
  chainEngines: [] as unknown[],
  builds: [] as Array<() => void>,
  inst: null as null | Record<string, unknown>,
}));

vi.mock('@engine/libopenmpt/LibopenmptEngine', async (orig) => {
  const real = await orig<typeof import('../libopenmpt/LibopenmptEngine')>();
  const inst = Object.create(real.LibopenmptEngine.prototype) as Record<string, unknown>;
  Object.assign(inst, {
    _available: true, _pendingData: null, _playing: false, _playToken: 0, _pendingLoad: null,
    _isolationSlotMasks: [null, null, null, null], _isolationBackstop: null, gainNode: null, context: null,
    workletNode: { port: { postMessage: (m: { cmd: string }) => { h.posted.push(m.cmd); } } },
    // The replayer must not wire a real worklet node into the inert Tone stand-ins.
    getWorkletNode: () => null, getAudioContext: () => null,
    startWithCoordinator: vi.fn(async function (this: { _pendingData: ArrayBuffer; play: () => void }) {
      this._pendingData = new ArrayBuffer(16);
      this.play();
      return { started: true };
    }),
  });
  h.inst = inst;
  return { ...real, LibopenmptEngine: { getInstance: () => inst }, getLibopenmptSync: () => inst };
});
vi.mock('tone', async (orig) => {
  const transport = { bpm: { value: 125 }, state: 'stopped', stop() {}, start() {}, cancel() {}, pause() {} };
  const node = () => ({ connect() {}, disconnect() {}, dispose() {}, gain: { value: 1, rampTo() {} } });
  return { ...(await orig<object>()), Gain: function () { return node(); }, Player: function () { return { ...node(), stop() {}, volume: { value: 0 } }; }, Panner: function () { return { ...node(), pan: { value: 0 } }; }, getContext: () => ({}), start: async () => undefined, context: { rawContext: { state: 'running' }, resume: async () => undefined }, now: () => 0, getTransport: () => transport };
});
vi.mock('../StereoSeparationNode', () => ({
  StereoSeparationNode: function () { return { inputTone: {}, outputTone: { connect() {}, disconnect() {} }, setMode() {}, dispose() {} }; },
}));
vi.mock('@/utils/audio-context', async (orig) => ({ ...(await orig<object>()), getNativeAudioNode: () => null }));
// The master chain: record which isolation engine each rebuild resolves. With none, MasterEffectsChain puts
// every effect aimed at channels on the whole mix (masterFxChannelRouting.test.ts covers that decision).
vi.mock('../ToneEngine', () => {
  const rebuildMasterEffects = async (): Promise<void> => { h.chainEngines.push(await getActiveIsolationEngine()); };
  const engine = new Proxy({}, { get: (_t, k) => (k === 'rebuildMasterEffects' ? rebuildMasterEffects : () => undefined) });
  return { getToneEngine: () => engine };
});
// The slot build: resolves only when the test says so.
vi.mock('@/stores/useMixerStore', async (orig) => ({
  ...(await orig<object>()),
  scheduleWasmEffectRebuild: vi.fn(),
  rebuildWasmEffectsNow: vi.fn(() => new Promise<void>((resolve) => { h.builds.push(() => { h.posted.push('built'); resolve(); }); })),
}));
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
  await vi.dynamicImportSettled();
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

const tune = new ArrayBuffer(16);
const makeSong = (fileData: ArrayBuffer): TrackerSong => ({
  name: 'x', format: 'MOD', patterns: [{ id: 'p0', name: 'p0', length: 4, channels: [] }], instruments: [],
  songPositions: [0], songLength: 1, restartPosition: 0, numChannels: 4, initialSpeed: 6, initialBPM: 125,
  libopenmptFileData: fileData,
} as unknown as TrackerSong);

/** One play: the worklet loads paused, announces the module, the build resolves, then it renders. */
async function playOnce(replayer: TrackerReplayer): Promise<void> {
  h.posted.length = 0;
  await replayer.play();
  await flush();
  expect(h.posted, 'the module is loaded paused, never played at once').toContain('load');
  expect(h.posted).not.toContain('play');
  (h.inst!.handleMessage as (m: { data: { cmd: string } }) => void).call(h.inst, { data: { cmd: 'playReady' } });
  await flush();
  expect(h.posted, 'rendering waits for the slot build').not.toContain('unpause');
  expect(h.builds.length, 'playReady started the slot build').toBeGreaterThan(0);
  h.builds.splice(0).forEach((done) => done());
  await flush();
  expect(h.posted.indexOf('unpause'), 'unpause follows the finished build').toBeGreaterThan(h.posted.indexOf('built'));
  expect(h.posted.indexOf('built')).toBeGreaterThan(-1);
}

describe('an effect aimed at channels never reaches the whole mix across stop and play', () => {
  it('first play, stop, second play: the chain always resolves the engine, and rendering starts after the build', async () => {
    setPlayingIsolationEngine(null);
    await flush();
    h.chainEngines.length = 0;
    useAudioStore.setState({ masterEffects: [
      { id: 'dist', category: 'tonejs', type: 'Distortion', enabled: true, wet: 100, parameters: { distortion: 0.8 }, selectedChannels: [0, 1, 2, 3] },
    ] } as never);

    const replayer = new TrackerReplayer();
    const song = makeSong(tune);
    replayer.loadSong(song);
    await playOnce(replayer);
    expect(h.inst!.startWithCoordinator, 'the libopenmpt branch ran').toHaveBeenCalledTimes(1);

    replayer.stop();
    await flush();
    expect(getPlayingIsolationEngine(), 'stop keeps the loaded song engine').toBe(h.inst);

    await playOnce(replayer);
    replayer.stop();
    replayer.loadSong(song);
    await flush();
    expect(getPlayingIsolationEngine(), 'a reload of the same tune keeps the engine').toBe(h.inst);

    expect(h.chainEngines.length, 'the master chain rebuilt').toBeGreaterThan(0);
    expect(h.chainEngines.filter((e) => e !== h.inst), 'a chain rebuild ran without the engine: the effect went on the whole mix').toEqual([]);

    replayer.loadSong(makeSong(new ArrayBuffer(32)));
    await flush();
    expect(getPlayingIsolationEngine(), 'a different tune clears the engine').toBeNull();
    replayer.dispose?.();
  });
});
