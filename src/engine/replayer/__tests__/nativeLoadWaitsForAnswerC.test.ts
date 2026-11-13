/**
 * NATIVE-LOAD-WAITS-FOR-ANSWER, batch C (see nativeLoadWaitsForAnswer.test.ts for batch A and the full rationale):
 * these engines resolved loadTune right after postMessage, so a module the worklet refused still counted as loaded.
 * Each engine's load now settles on the worklet's answer (WASMSingletonBase.beginModuleLoad).
 *
 * Seam: the REAL engine class and its REAL message handler run on the headless worklet rig (nuadeEngineRig), with the
 * real WASM assets. Only the worklet's answer to the load message is scripted per row (success message or type 'error').
 * V2M posts type 'load' and answers 'loaded' / error in data.error; the others post 'loadModule' and answer moduleLoaded.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { installWorkletRig, until, type Rig } from '../../nuade/__tests__/nuadeEngineRig';
import { PxtoneEngine } from '../../pxtone/PxtoneEngine';
import { QsfEngine } from '../../qsf/QsfEngine';
import { QuadraComposerEngine } from '../../quadracomposer/QuadraComposerEngine';
import { S98Engine } from '../../s98/S98Engine';
import { SawteethEngine } from '../../sawteeth/SawteethEngine';
import { Sc68Engine } from '../../sc68/Sc68Engine';
import { Sd2Engine } from '../../sidmon2/Sd2Engine';
import { SonicArrangerEngine } from '../../sonic-arranger/SonicArrangerEngine';
import { SonixEngine } from '../../sonix/SonixEngine';
import { SoundControlEngine } from '../../soundcontrol/SoundControlEngine';
import { SoundFactory2Engine } from '../../soundfactory/SoundFactory2Engine';
import { SoundFxEngine } from '../../soundfx/SoundFxEngine';
import { SoundMonEngine } from '../../soundmon/SoundMonEngine';
import { SteveTurnerEngine } from '../../steveturner/SteveTurnerEngine';
import { StoneTrackerEngine } from '../../stonetracker/StoneTrackerEngine';
import { SynthesisEngine } from '../../synthesis/SynthesisEngine';
import { TFMEngine } from '../../tfm/TFMEngine';
import { V2MEngine } from '../../v2m/V2MEngine';
import { ZxtuneEngine } from '../../zxtune/ZxtuneEngine';

interface Loadable { ready(): Promise<void>; dispose(): void; loadTune(...a: never[]): Promise<void> }
type Row = {
  dir: string; stem: string; engine: { getInstance(): Loadable };
  success: Record<string, unknown>;
  load: (e: Loadable) => Promise<void>;
  loadType?: string;
};
const buf = () => new Uint8Array(64).fill(0x7f).buffer;
const loose = (e: Loadable) => e as unknown as { loadTune(...a: unknown[]): Promise<void> };
const paula = { type: 'moduleLoaded', subsongCount: 1, channels: 4 };
const simple = (e: Loadable) => loose(e).loadTune(buf());
const stone = (e: Loadable) => loose(e).loadTune(buf(), buf());

const ROWS: Record<string, Row> = {
  Pxtone: { dir: 'pxtone', stem: 'Pxtone', engine: PxtoneEngine, success: paula, load: simple },
  Qsf: { dir: 'qsf', stem: 'Qsf', engine: QsfEngine, success: paula, load: simple },
  QuadraComposer: { dir: 'quadracomposer', stem: 'QuadraComposer', engine: QuadraComposerEngine, success: paula, load: simple },
  S98: { dir: 's98', stem: 'S98', engine: S98Engine, success: { type: 'moduleLoaded', types: [0], plays: [true] }, load: simple },
  Sawteeth: { dir: 'sawteeth', stem: 'Sawteeth', engine: SawteethEngine, success: { type: 'moduleLoaded', meta: { channels: 4 } }, load: simple },
  Sc68: { dir: 'sc68', stem: 'Sc68', engine: Sc68Engine, success: paula, load: simple },
  Sd2: { dir: 'sidmon2', stem: 'Sd2', engine: Sd2Engine, success: paula, load: simple },
  SonicArranger: { dir: 'sonic-arranger', stem: 'SonicArranger', engine: SonicArrangerEngine, success: paula, load: simple },
  Sonix: { dir: 'sonix', stem: 'Sonix', engine: SonixEngine, success: { type: 'moduleLoaded', meta: { numChannels: 4 } }, load: simple },
  SoundControl: { dir: 'soundcontrol', stem: 'SoundControl', engine: SoundControlEngine, success: paula, load: simple },
  SoundFactory2: { dir: 'soundfactory', stem: 'SoundFactory2', engine: SoundFactory2Engine, success: paula, load: simple },
  SoundFx: { dir: 'soundfx', stem: 'SoundFx', engine: SoundFxEngine, success: paula, load: simple },
  SoundMon: { dir: 'soundmon', stem: 'SoundMon', engine: SoundMonEngine, success: paula, load: simple },
  SteveTurner: { dir: 'steveturner', stem: 'SteveTurner', engine: SteveTurnerEngine, success: paula, load: simple },
  StoneTracker: { dir: 'stonetracker', stem: 'StoneTracker', engine: StoneTrackerEngine, success: paula, load: stone },
  Synthesis: { dir: 'synthesis', stem: 'Synthesis', engine: SynthesisEngine, success: paula, load: simple },
  TFM: { dir: 'tfm', stem: 'TFM', engine: TFMEngine, success: paula, load: simple },
  V2M: { dir: '.', stem: 'V2MPlayer', engine: V2MEngine, success: { type: 'loaded', lengthSeconds: 1 }, load: simple, loadType: 'load' },
  Zxtune: { dir: 'zxtune', stem: 'Zxtune', engine: ZxtuneEngine, success: paula, load: simple },
};

describe.each(Object.entries(ROWS))('%s load settles on the worklet answer', (name, row) => {
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
      if (d.type === (row.loadType ?? 'loadModule')) { setTimeout(() => proc.port.postMessage(reply), 10); return; }
      return real(d);
    };
  }

  it('rejects with the worklet message when the worklet answers type error', async () => {
    // V2M reports the failure in data.error, every other worklet in data.message.
    await boot(name === 'V2M' ? { type: 'error', error: 'refused by the player' } : { type: 'error', message: 'refused by the player' });
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
