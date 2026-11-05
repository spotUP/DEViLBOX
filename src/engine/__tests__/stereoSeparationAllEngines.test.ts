/**
 * The stereo separation setting reaches every direct-routed Amiga worklet. These engines hard-pan Paula voices
 * LRRL inside their own worklet and route straight to the output, so the replayer's separation node never sees
 * them (Sound Factory first, 2026-11-05; the other 21 ignored the slider). Each case drives the real path:
 * settings store -> engine (markNodeReady applies the stored value; forwardStereoSeparation is the slider)
 * -> the engine's port message -> the real worklet + WASM with a real song, measuring the side energy it renders.
 * The call counts per engine are the sentinel that the new code ran.
 */
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { startWorklet, loadSharedWorkletScripts, songBuffer, stereoOutputs, type JsTransform } from './workletHarness';
import { soundfxTransform } from '@/engine/soundfx/soundfxTransform';
import { WASMChannelOutputsEngine } from '@engine/wasm/WASMSingletonBase';
import { useSettingsStore } from '@stores/useSettingsStore';

beforeAll(loadSharedWorkletScripts);

const S = 'public/data/songs';
/** [asset dir, worklet stem, engine module, engine class, song, optional worklet transform]. */
const ENGINES: Array<[string, string, string, string, string, JsTransform?]> = [
  ['davidwhittaker', 'DavidWhittaker', '@engine/davidwhittaker/DavidWhittakerEngine', 'DavidWhittakerEngine', `${S}/formats/apb.dw`],
  ['soundmon', 'SoundMon', '@engine/soundmon/SoundMonEngine', 'SoundMonEngine', `${S}/bp-soundmon-2/nicktune1.bp`],
  ['sonic-arranger', 'SonicArranger', '@engine/sonic-arranger/SonicArrangerEngine', 'SonicArrangerEngine', `${S}/sonic-arranger/mega end.sa`],
  ['deltamusic1', 'DeltaMusic1', '@engine/deltamusic1/DeltaMusic1Engine', 'DeltaMusic1Engine', `${S}/formats/crusaders1.dm`],
  ['deltamusic2', 'DeltaMusic2', '@engine/deltamusic2/DeltaMusic2Engine', 'DeltaMusic2Engine', `${S}/formats/anthrox_intro.dm2`],
  ['gmc', 'Gmc', '@engine/gmc/GmcEngine', 'GmcEngine', `${S}/formats/knights_of_sky.gmc`],
  ['facethemusic', 'FaceTheMusic', '@engine/facethemusic/FaceTheMusicEngine', 'FaceTheMusicEngine', `${S}/formats/staticoscillations.ftm`],
  ['dss', 'Dss', '@engine/dss/DssEngine', 'DssEngine', `${S}/formats/doxtro3.dss`],
  ['futurecomposer', 'FutureComposer', '@engine/futurecomposer/FutureComposerEngine', 'FutureComposerEngine', `${S}/formats/anthrox.fc`],
  ['ronklaren', 'RonKlaren', '@engine/ronklaren/RonKlarenEngine', 'RonKlarenEngine', `${S}/formats/astra_2.rk`],
  ['synthesis', 'Synthesis', '@engine/synthesis/SynthesisEngine', 'SynthesisEngine', `${S}/formats/space_sound.syn`],
  ['instereo1', 'InStereo1', '@engine/instereo1/InStereo1Engine', 'InStereo1Engine', `${S}/formats/fantasi8.is`],
  ['instereo2', 'InStereo2', '@engine/instereo2/InStereo2Engine', 'InStereo2Engine', `${S}/formats/stereo_feeling.is20`],
  ['activisionpro', 'ActivisionPro', '@engine/activisionpro/ActivisionProEngine', 'ActivisionProEngine', `${S}/formats/gettysburg.avp`],
  ['voodoo', 'Voodoo', '@engine/voodoo/VoodooEngine', 'VoodooEngine', `${S}/voodoo/voo8.vss`],
  ['actionamics', 'Actionamics', '@engine/actionamics/ActionamicsEngine', 'ActionamicsEngine', `${S}/actionamics/dynablaster.ast`],
  ['fred-replayer', 'FredReplayer', '@engine/fred-replayer/FredReplayerEngine', 'FredReplayerEngine', `${S}/formats/rebels.fred`],
  ['digmug', 'DigMug', '@engine/digmug/DigMugEngine', 'DigMugEngine', `${S}/formats/flight.dmu`],
  ['soundfactory', 'SoundFactory2', '@engine/soundfactory/SoundFactory2Engine', 'SoundFactory2Engine', `${S}/formats/goldrunner.psf`],
  ['soundcontrol', 'SoundControl', '@engine/soundcontrol/SoundControlEngine', 'SoundControlEngine', `${S}/formats/north_sea_inferno.sc`],
  ['quadracomposer', 'QuadraComposer', '@engine/quadracomposer/QuadraComposerEngine', 'QuadraComposerEngine', `${S}/formats/synth_corn.emod`],
  ['soundfx', 'SoundFx', '@engine/soundfx/SoundFxEngine', 'SoundFxEngine', `${S}/soundfx/batdance.sfx`, soundfxTransform],
];

type FakeEngine = WASMChannelOutputsEngine & { workletNode: AudioWorkletNode | null; markNodeReady(): void; _disposed: boolean };
const created: FakeEngine[] = [];
afterEach(() => { for (const e of created.splice(0)) e._disposed = true; WASMChannelOutputsEngine.forwardStereoSeparation(useSettingsStore.getState().stereoSeparation); });

function sideEnergy(proc: { process(i: Float32Array[][], o: Float32Array[][]): boolean }, blocks: number): number {
  let side = 0;
  for (let b = 0; b < blocks; b++) {
    const out = stereoOutputs(37);
    proc.process([], out);
    for (let i = 0; i < 128; i++) side += (out[0][0][i] - out[0][1][i]) ** 2;
  }
  return side;
}

describe('stereo separation reaches every direct-routed Amiga worklet', { timeout: 120000 }, () => {
  it('narrowStereo: 0% leaves no side energy, 100% keeps the hard pan, 50% halves the side', () => {
    const Outs = (globalThis as unknown as { DevilboxChannelOutputs: new () => { handleMessage(d: unknown): boolean; narrowStereo(l: Float32Array, r: Float32Array, n: number): void } }).DevilboxChannelOutputs;
    const run = (value: number | null) => {
      const o = new Outs();
      if (value !== null) expect(o.handleMessage({ type: 'setStereoSeparation', value })).toBe(true);
      const l = Float32Array.from([1, 0.5, 0, -0.25]), r = Float32Array.from([0, 0.5, 1, 0.25]);
      o.narrowStereo(l, r, 4);
      return { l, r };
    };
    const mono = run(0);
    for (let i = 0; i < 4; i++) expect(mono.l[i]).toBeCloseTo(mono.r[i], 7);
    expect(mono.l[0]).toBeCloseTo(0.5, 7);               // mid of (1, 0)
    for (const full of [run(100), run(null)]) {          // 100% and the untouched default keep the Amiga split
      expect(Array.from(full.l)).toEqual([1, 0.5, 0, -0.25]);
      expect(Array.from(full.r)).toEqual([0, 0.5, 1, 0.25]);
    }
    const half = run(50);
    expect(half.l[0]).toBeCloseTo(0.75, 7);
    expect(half.r[0]).toBeCloseTo(0.25, 7);
  });

  it.each(ENGINES)('%s: stored setting on node ready, live slider through the registry', async (dir, stem, modPath, cls, song, transform) => {
    const Engine = (await import(/* @vite-ignore */ modPath) as Record<string, { prototype: object }>)[cls];
    const { proc, send } = await startWorklet(dir, stem, transform);
    await send({ type: 'loadModule', moduleData: songBuffer(song) });
    await send({ type: 'play' });

    // The engine as the app builds it, minus the AudioContext: its port forwards to the real worklet's message handler.
    const engine = Object.create(Engine.prototype) as FakeEngine;
    const posts: unknown[] = [];
    engine.workletNode = { port: { postMessage: (m: unknown) => { posts.push(m); void send(m); } } } as unknown as AudioWorkletNode;
    created.push(engine);
    const setSep = vi.spyOn(engine, 'setStereoSeparation');

    // 1. Node ready with the store at 0%: the stored setting is applied (the song-load path).
    useSettingsStore.setState({ stereoSeparation: 0 });
    engine.markNodeReady();
    await vi.waitFor(() => expect(setSep).toHaveBeenCalledWith(0));
    const mono = sideEnergy(proc, 300);

    // 2. The settings dialog slider to 100%: forwarded to this engine through the registry.
    useSettingsStore.setState({ stereoSeparation: 100 });
    WASMChannelOutputsEngine.forwardStereoSeparation(100);
    expect(setSep).toHaveBeenLastCalledWith(100);
    const full = sideEnergy(proc, 300);

    expect(posts.map((m) => (m as { type: string; value: number }).value)).toEqual([0, 100]);
    expect(full, `${stem}: hard pan returns at 100%`).toBeGreaterThan(0);
    expect(mono, `${stem}: no side energy at 0%`).toBeLessThan(full * 1e-6);
  });
});
