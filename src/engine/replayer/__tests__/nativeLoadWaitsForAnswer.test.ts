/**
 * NATIVE-LOAD-WAITS-FOR-ANSWER (batch A of thoughts/spot/2026-11-13_native-load-audit.md): these engines resolved
 * loadTune right after postMessage, so a module the worklet refused still counted as loaded and the routing called
 * play() on nothing. Each engine's load now settles on the worklet's answer (WASMSingletonBase.beginModuleLoad).
 *
 * Seam: the REAL engine class and its REAL message handler run on the headless worklet rig (nuadeEngineRig), with the
 * real WASM assets. Only the worklet's answer to 'loadModule' is scripted per row (success message or type 'error'),
 * because a valid fixture song for each of 15 formats is not the point; the answer shapes are the ones the real
 * worklets post (public/<dir>/*.worklet.js, checked by grep).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { installWorkletRig, until, type Rig } from '../../nuade/__tests__/nuadeEngineRig';
import { ActionamicsEngine } from '../../actionamics/ActionamicsEngine';
import { ActivisionProEngine } from '../../activisionpro/ActivisionProEngine';
import { ArtOfNoiseEngine } from '../../artofnoise/ArtOfNoiseEngine';
import { AsapEngine } from '../../asap/AsapEngine';
import { AyletEngine } from '../../aylet/AyletEngine';
import { BdEngine } from '../../bd/BdEngine';
import { Cinter4Engine } from '../../cinter4/Cinter4Engine';
import { CpsycleEngine } from '../../cpsycle/CpsycleEngine';
import { DeltaMusic1Engine } from '../../deltamusic1/DeltaMusic1Engine';
import { DeltaMusic2Engine } from '../../deltamusic2/DeltaMusic2Engine';
import { DigMugEngine } from '../../digmug/DigMugEngine';
import { DssEngine } from '../../dss/DssEngine';
import { EaglePlayerEngine } from '../../eagleplayer/EaglePlayerEngine';
import { EupminiEngine } from '../../eupmini/EupminiEngine';
import { FaceTheMusicEngine } from '../../facethemusic/FaceTheMusicEngine';

interface Loadable { ready(): Promise<void>; dispose(): void; loadTune(...a: never[]): Promise<void> }
type Row = {
  dir: string; stem: string; engine: { getInstance(): Loadable };
  success: Record<string, unknown>;
  load: (e: Loadable) => Promise<void>;
};
const buf = () => new Uint8Array(64).fill(0x7f).buffer;
const loose = (e: Loadable) => e as unknown as { loadTune(...a: unknown[]): Promise<void> };
const paula = { type: 'moduleLoaded', subsongCount: 1, channels: 4 };
const simple = (e: Loadable) => loose(e).loadTune(buf());

const ROWS: Record<string, Row> = {
  Actionamics: { dir: 'actionamics', stem: 'Actionamics', engine: ActionamicsEngine, success: paula, load: simple },
  ActivisionPro: { dir: 'activisionpro', stem: 'ActivisionPro', engine: ActivisionProEngine, success: paula, load: simple },
  ArtOfNoise: { dir: 'artofnoise', stem: 'ArtOfNoise', engine: ArtOfNoiseEngine, success: { type: 'moduleLoaded' }, load: simple },
  Asap: { dir: 'asap', stem: 'Asap', engine: AsapEngine, success: { type: 'moduleLoaded', meta: {} }, load: simple },
  Aylet: { dir: 'aylet', stem: 'Aylet', engine: AyletEngine, success: { type: 'moduleLoaded', numTracks: 1, track: 0 }, load: simple },
  Bd: { dir: 'bd', stem: 'Bd', engine: BdEngine, success: { type: 'moduleLoaded' }, load: simple },
  Cinter4: { dir: 'cinter4', stem: 'Cinter4', engine: Cinter4Engine, success: { type: 'moduleLoaded' }, load: simple },
  Cpsycle: { dir: 'cpsycle', stem: 'Cpsycle', engine: CpsycleEngine, success: { type: 'moduleLoaded' }, load: simple },
  DeltaMusic1: { dir: 'deltamusic1', stem: 'DeltaMusic1', engine: DeltaMusic1Engine, success: paula, load: simple },
  DeltaMusic2: { dir: 'deltamusic2', stem: 'DeltaMusic2', engine: DeltaMusic2Engine, success: paula, load: simple },
  DigMug: { dir: 'digmug', stem: 'DigMug', engine: DigMugEngine, success: paula, load: simple },
  Dss: { dir: 'dss', stem: 'Dss', engine: DssEngine, success: paula, load: simple },
  EaglePlayer: {
    dir: 'eagleplayer', stem: 'EaglePlayer', engine: EaglePlayerEngine,
    success: { type: 'moduleLoaded', moduleName: 'x', moduleBytes: 64, player: 'p', subsongMin: 1, subsongMax: 1, subsongCurrent: 1 },
    load: (e) => loose(e).loadTune(buf(), 'Anders0land', 'x.hot'),
  },
  Eupmini: { dir: 'eupmini', stem: 'Eupmini', engine: EupminiEngine, success: { type: 'moduleLoaded' }, load: simple },
  FaceTheMusic: { dir: 'facethemusic', stem: 'FaceTheMusic', engine: FaceTheMusicEngine, success: paula, load: simple },
};

describe.each(Object.entries(ROWS))('%s load settles on the worklet answer', (_name, row) => {
  let rig: Rig | null = null;
  let engine: Loadable | null = null;
  afterEach(() => { engine?.dispose(); rig?.uninstall(); engine = null; rig = null; });

  /** Boot the engine on the rig and script the worklet's reply to the load message. */
  async function boot(reply: Record<string, unknown>): Promise<void> {
    rig = installWorkletRig(row.dir, row.stem);
    engine = row.engine.getInstance();
    await engine.ready();
    const proc = rig.proc() as unknown as { handleMessage: (d: { type?: string }) => Promise<void>; port: { postMessage(m: unknown): void } };
    const real = proc.handleMessage.bind(proc);
    proc.handleMessage = async (d) => {
      if (d.type === 'loadModule') { setTimeout(() => proc.port.postMessage(reply), 10); return; }
      return real(d);
    };
  }

  it('rejects with the worklet message when the worklet answers type error', async () => {
    await boot({ type: 'error', message: 'refused by the player' });
    await expect(row.load(engine!)).rejects.toThrow('refused by the player');
  });

  it('stays pending until the worklet answers, then resolves on the success message', async () => {
    await boot(row.success);
    let settled = false;
    const p = row.load(engine!).then(() => { settled = true; });
    await new Promise((r) => setTimeout(r, 0));
    expect(settled).toBe(false);
    await p;
    await until(() => settled);
  });
});
