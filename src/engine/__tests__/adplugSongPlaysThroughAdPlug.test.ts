/**
 * AdLib songs played silent (ADLIB-SILENT, 2026-11-25).
 *
 * An imported AdPlug song carries its file in adplugFileData and no
 * libopenmptFileData. Phase 5.4 of TrackerReplayer.play() built an XM for any
 * song without libopenmptFileData, so libopenmpt took the AdPlug song with notes
 * suppressed and the AdPlug streaming path, which runs only when libopenmpt did
 * not, never started: no OPL audio at all.
 *
 * Drives the REAL replayer with the fakes of playSurvivesSongReleasedMidPlay.test.ts
 * and the real waterfall.rad bytes. Fails on revert: the guard without
 * !adplugFileData builds the XM and the AdPlug player never loads the file.
 */
import { describe, expect, it, vi } from 'vitest';

const hook = vi.hoisted(() => ({ builds: 0, adplugLoads: [] as string[] }));

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
  createModuleForSong: async () => { hook.builds++; return null; },
}));
vi.mock('@/lib/import/AdPlugPlayer', () => {
  const player = {
    onChannelLevels: null, onChannelNotes: null, onEnded: null, onPosition: null,
    load: async (_data: ArrayBuffer, name: string) => { hook.adplugLoads.push(name); return true; },
    play() {}, stop() {}, pause() {}, resume() {}, setMuteMask() {}, seekTo() {}, setChannelMute() {}, dispose() {},
  };
  return { getAdPlugPlayer: () => new Proxy(player, { get: (t, k: string) => (k in t ? (t as Record<string, unknown>)[k] : () => undefined), set: (t, k: string, v) => { (t as Record<string, unknown>)[k] = v; return true; } }) };
});
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => undefined, classifyInstruments: () => undefined }) },
}));

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TrackerReplayer, type TrackerSong } from '../TrackerReplayer';

const RAD = resolve(__dirname, '../../../public/data/songs/Ad Lib/Reality AdLib Tracker/Void (AU)/waterfall.rad');

function adplugSong(): TrackerSong {
  const rows = Array.from({ length: 4 }, () => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 }));
  const bytes = readFileSync(RAD);
  return {
    name: 'waterfall', format: 'AdPlug', instruments: [],
    patterns: [{ id: 'p0', name: 'p0', length: 4, channels: [{ id: 'c0', name: 'c0', rows, muted: false, solo: false, collapsed: false, volume: 100, pan: 0, instrumentId: null, color: null }] }],
    songPositions: [0], songLength: 1, restartPosition: 0, numChannels: 1, initialSpeed: 6, initialBPM: 125,
    adplugFileData: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    adplugFileName: 'waterfall.rad',
  } as unknown as TrackerSong;
}

describe('an AdPlug song plays through the AdPlug player, not a built XM', () => {
  it('play() of waterfall.rad builds no libopenmpt module and loads the file into AdPlug', async () => {
    const replayer = new TrackerReplayer();
    try {
      replayer.loadSong(adplugSong());
      await replayer.play();
      expect(hook.builds).toBe(0);
      expect(hook.adplugLoads).toEqual(['waterfall.rad']);
    } finally {
      replayer.stop();
      await vi.dynamicImportSettled();
    }
  }, 60000);
});
