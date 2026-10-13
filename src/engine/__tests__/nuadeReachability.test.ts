/**
 * NV-6: the ONE reachability test for nuade. The product's song-load entry point (parseModuleToSong) hands an MMDC file
 * to the stores, startNativeEngines picks the Nuade descriptor and loads the REAL NuadeEngine, which drives the real
 * Nuade.worklet.js + Nuade.wasm. Sentinel: NuadeEngine.loadTune is called once with the player id only nuade's own
 * probe can produce, and the worklet answers moduleLoaded with it. The 30 s render is audible and follows UADE's render
 * of the same file (spec: >= 0.95). Every other behaviour is tested where it lives (table, resolver, selector, worker).
 * The engine choice is pinned here: this test never reads rollout verdicts.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { installNuadeRig, until, type Rig } from '../nuade/__tests__/nuadeEngineRig';
import { ROOT, stereoOutputs } from './workletHarness';
import { NuadeHeadless } from '../nuade/nuadeHeadless';
import { setNuadeProbe } from '../nuade/nuadeProbe';
import { WASMChannelOutputsEngine } from '@engine/wasm/WASMSingletonBase';
import { registerChannelMeterSink } from '@engine/tone/channelMeterFeed';
import { envelope20, bestLagCorrelation } from '../../../tools/nuade/nuadeCompare';
import { renderFileToSamples } from '../../../tools/uade-audit/uadeRenderCore';

// UADE's scan needs a browser; a format whose parser draws no grid hands the grid to it. Stand in for it with a song
// shaped as UADEParser's classic path builds it, so the route's retargeting is what is tested.
vi.mock('@lib/import/formats/UADEParser', () => ({
  parseUADEFile: vi.fn(async (buf: ArrayBuffer, name: string) => ({
    name, format: 'UADE',
    patterns: [{ id: 'p0', name: 'p0', length: 1, importMetadata: { sourceFormat: 'UADE', sourceFile: name, importedAt: '', originalChannelCount: 4, originalPatternCount: 1, originalInstrumentCount: 1 },
      channels: [{ id: 'c0', name: 'c0', rows: [{ note: 49, instrument: 1, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 }] }] }],
    instruments: [{ id: 1, name: 'UADE', type: 'synth', synthType: 'UADESynth', effects: [], volume: 0, pan: 0, uade: { type: 'uade', filename: name, fileData: buf, subsongCount: 1 } }],
    songPositions: [0], songLength: 1, restartPosition: 0, numChannels: 4, initialSpeed: 6, initialBPM: 125, linearPeriods: false,
    uadeEditableFileData: buf.slice(0), uadeEditableFileName: name,
  })),
}));

vi.mock('../ToneEngine', () => ({
  getToneEngine: () => ({ getInstrument() {}, connectMeters() {} }),
}));

const MMDC = 'public/data/songs/formats/captain planet and the planeteers - title.mmdc';
const SECONDS = 30;
const SR = 48000;

describe('nuade reachability: parseModuleToSong -> startNativeEngines -> NuadeEngine -> worklet + WASM', () => {
  let rig: Rig;
  beforeAll(async () => {
    rig = installNuadeRig();
    vi.spyOn(WASMChannelOutputsEngine.prototype as unknown as { afterPlay(): void }, 'afterPlay').mockImplementation(() => undefined);
    // nuade's own probe, from the Node loader (the app loads Nuade.wasm on the main thread).
    const nu = await NuadeHeadless.create();
    setNuadeProbe(async (id, bytes, name) => nu.probeWith(id, bytes, name));
  }, 60_000);
  afterAll(async () => {
    const { NuadeEngine } = await import('../nuade/NuadeEngine');
    if (NuadeEngine.hasInstance?.()) NuadeEngine.getInstance().dispose();
    registerChannelMeterSink(null);
    rig.uninstall();
  });

  it('an MMDC file loaded the way the app loads it plays on nuade, audibly, like UADE, with the position moving', async () => {
    const { useSettingsStore } = await import('@/stores/useSettingsStore');
    useSettingsStore.getState().setFormatEngine('mmdc', 'nuade'); // pinned: the table's default is rollout data
    const { NuadeEngine } = await import('../nuade/NuadeEngine');
    const loadTune = vi.spyOn(NuadeEngine.prototype, 'loadTune');

    // 1. The real song-load entry point.
    const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
    const bytes = new Uint8Array(readFileSync(resolve(ROOT, MMDC)));
    const song = await parseModuleToSong(new File([bytes], basename(MMDC)));
    expect(song.nuadePlayerId).toBe('mmdc');
    expect(song.nuadeFileData?.byteLength).toBe(bytes.length);
    expect(song.uadeEditableFileData).toBeUndefined();

    // 2. Applied to the stores as the app does; playback routing picks the engine from the song.
    const { useFormatStore } = await import('@/stores/useFormatStore');
    const { useInstrumentStore } = await import('@/stores/useInstrumentStore');
    const { liveTrackerSong } = await import('@/lib/song/liveSong');
    const { playingEngineFor, startNativeEngines, clearRunningEngineKeys } = await import('../replayer/NativeEngineRouting');
    useFormatStore.getState().applyEditorMode(song);
    useInstrumentStore.setState({ instruments: song.instruments });
    const live = liveTrackerSong();
    expect(playingEngineFor(live)).toBe('Nuade');

    // 3. startNativeEngines loads the engine: the sentinel proves the new code RAN, with the route's arguments.
    clearRunningEngineKeys();
    const failures = vi.spyOn(console, 'error');
    const started = await startNativeEngines(live, {} as never, false, false, new Set());
    expect(started).toBeTruthy();
    expect(failures.mock.calls.filter((c) => String(c[0]).includes('Failed to start')), 'startNativeEngines swallowed an error').toEqual([]);
    expect(loadTune).toHaveBeenCalledTimes(1);
    const args = loadTune.mock.calls[0]!;
    expect((args[0] as ArrayBuffer).byteLength).toBe(bytes.length);
    expect(args.slice(1, 3)).toEqual(['mmdc', basename(MMDC)]);
    await until(() => rig.posted.some((m) => m.type === 'moduleLoaded'));
    const loaded = rig.posted.find((m) => m.type === 'moduleLoaded')!;
    expect(loaded.playerId).toBe('mmdc');
    expect(rig.posted.filter((m) => m.type === 'error')).toEqual([]);

    // 4. 30 s from the worklet's main output: audible, and the same music as UADE's render of the file.
    const total = Math.floor((SECONDS * SR) / 128);
    const pcm = new Float32Array(total * 128 * 2);
    for (let q = 0; q < total; q++) {
      const out = stereoOutputs(9);
      rig.proc().process([], out);
      for (let i = 0; i < 128; i++) { pcm[q * 256 + 2 * i] = out[0]![0]![i]!; pcm[q * 256 + 2 * i + 1] = out[0]![1]![i]!; }
    }
    let peak = 0, sum = 0;
    for (const v of pcm) { peak = Math.max(peak, Math.abs(v)); sum += v * v; }
    expect(peak).toBeGreaterThan(0.05);
    expect(Math.sqrt(sum / pcm.length)).toBeGreaterThan(0.02);
    const uade = await renderFileToSamples(bytes, basename(MMDC), { sampleRate: SR, seconds: SECONDS });
    const a = envelope20(pcm, SR), b = envelope20(uade.samples, SR);
    expect(bestLagCorrelation(a, b, Math.min(a.length, b.length, 1400)).correlation).toBeGreaterThanOrEqual(0.95);

    // 5. The position the grid follows advances.
    const rows = rig.posted.filter((m) => m.type === 'position').map((m) => m.row as number);
    expect(rows.length).toBeGreaterThan(5);
    expect(new Set(rows).size).toBeGreaterThan(3);
  }, 180_000);
});
