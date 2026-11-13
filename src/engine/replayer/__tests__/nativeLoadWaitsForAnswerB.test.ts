/**
 * NATIVE-LOAD-WAITS-FOR-ANSWER, batch B (thoughts/spot/2026-11-13_native-load-audit.md): these engines resolved
 * loadTune right after postMessage, so a module the worklet refused still counted as loaded. Each engine's load now
 * settles on the worklet's answer (WASMSingletonBase.beginModuleLoad). Same seam as nativeLoadWaitsForAnswer.test.ts:
 * the REAL engine class on the headless worklet rig, only the worklet's answer to the load message is scripted.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { installWorkletRig, until, type Rig } from '../../nuade/__tests__/nuadeEngineRig';
import { FmplayerEngine } from '../../fmplayer/FmplayerEngine';
import { FredReplayerEngine } from '../../fred-replayer/FredReplayerEngine';
import { FutureComposerEngine } from '../../futurecomposer/FutureComposerEngine';
import { GmcEngine } from '../../gmc/GmcEngine';
import { GmeEngine } from '../../gme/GmeEngine';
import { InStereo1Engine } from '../../instereo1/InStereo1Engine';
import { InStereo2Engine } from '../../instereo2/InStereo2Engine';
import { IxalanceEngine } from '../../ixalance/IxalanceEngine';
import { JxsEngine } from '../../jxs/JxsEngine';
import { KdmEngine } from '../../kdm/KdmEngine';
import { MaEngine } from '../../ma/MaEngine';
import { MaxTraxEngine } from '../../maxtrax/MaxTraxEngine';
import { MdxminiEngine } from '../../mdxmini/MdxminiEngine';
import { MonotoneEngine } from '../../monotone/MonotoneEngine';
import { MusicMakerEngine } from '../../musicmaker/MusicMakerEngine';
import { OktalyzerEngine } from '../../oktalyzer/OktalyzerEngine';
import { OrganyaEngine } from '../../organya/OrganyaEngine';
import { PiyoPiyoEngine } from '../../piyopiyo/PiyoPiyoEngine';
import { PreTrackerEngine } from '../../pretracker/PreTrackerEngine';
import { PsgplayEngine } from '../../psgplay/PsgplayEngine';
import { PumaTrackerEngine } from '../../pumatracker/PumaTrackerEngine';

// MusicMaker's engine compiles the file in-thread before posting; the buffer here is not a real MMV8 song.
vi.mock('../../../lib/import/formats/MusicMakerParser', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  musicMakerWorkletModule: () => ({ kind: 'x', voices: 4 }),
}));

interface Loadable { ready(): Promise<void>; dispose(): void; loadTune(...a: never[]): Promise<void> }
type Row = {
  dir: string; stem: string; engine: { getInstance(): Loadable };
  success: Record<string, unknown>;
  /** The message type the engine posts to start a load (default loadModule). */
  loadType?: string;
};
const buf = () => new Uint8Array(64).fill(0x7f).buffer;
const load = (e: Loadable) => (e as unknown as { loadTune(...a: unknown[]): Promise<void> }).loadTune(buf());
const ok = { type: 'moduleLoaded' };
const paula = { type: 'moduleLoaded', subsongCount: 1, channels: 4 };

const ROWS: Record<string, Row> = {
  Fmplayer: { dir: 'fmplayer', stem: 'Fmplayer', engine: FmplayerEngine, success: ok },
  FredReplayer: { dir: 'fred-replayer', stem: 'FredReplayer', engine: FredReplayerEngine, success: paula },
  FutureComposer: { dir: 'futurecomposer', stem: 'FutureComposer', engine: FutureComposerEngine, success: paula },
  Gmc: { dir: 'gmc', stem: 'Gmc', engine: GmcEngine, success: paula },
  Gme: { dir: 'gme', stem: 'Gme', engine: GmeEngine, success: { type: 'moduleLoaded', track: 0, tracks: 1, voices: [], scopes: 0, names: [] } },
  InStereo1: { dir: 'instereo1', stem: 'InStereo1', engine: InStereo1Engine, success: paula },
  InStereo2: { dir: 'instereo2', stem: 'InStereo2', engine: InStereo2Engine, success: paula },
  Ixalance: { dir: 'ixalance', stem: 'Ixalance', engine: IxalanceEngine, success: ok },
  Jxs: { dir: 'jxs', stem: 'Jxs', engine: JxsEngine, success: { type: 'moduleLoaded', channels: 4, durationMs: 1000, tracks: 1 } },
  Kdm: { dir: 'kdm', stem: 'Kdm', engine: KdmEngine, success: { type: 'moduleLoaded', channels: 1, totalTicks: 100 } },
  Ma: { dir: 'ma', stem: 'Ma', engine: MaEngine, success: ok },
  // MaxTrax answers moduleLoaded with the maxtrax_load result: 0 is success, anything else a refusal.
  MaxTrax: { dir: 'maxtrax', stem: 'Maxtrax', engine: MaxTraxEngine, success: { type: 'moduleLoaded', result: 0 }, loadType: 'load' },
  Mdxmini: { dir: 'mdxmini', stem: 'Mdxmini', engine: MdxminiEngine, success: ok },
  Monotone: { dir: 'monotone', stem: 'Monotone', engine: MonotoneEngine, success: { type: 'moduleLoaded', subsongCount: 1, channels: 1 } },
  MusicMaker: { dir: 'musicmaker', stem: 'MusicMaker', engine: MusicMakerEngine, success: { type: 'moduleLoaded', kind: 'x', voices: 4 } },
  Oktalyzer: { dir: 'oktalyzer', stem: 'Oktalyzer', engine: OktalyzerEngine, success: { type: 'moduleLoaded', subsongCount: 1, channels: 8 } },
  Organya: { dir: 'organya', stem: 'Organya', engine: OrganyaEngine, success: { type: 'moduleLoaded', meta: {} } },
  PiyoPiyo: { dir: 'piyopiyo', stem: 'PiyoPiyo', engine: PiyoPiyoEngine, success: { type: 'moduleLoaded', records: 1, waitMs: 100 } },
  // Pmdmini is skipped: its shipped WASM aborts on the headless rig ('wasmMemory' was not exported), so ready() never resolves.
  // Pmdmini: { dir: 'pmdmini', stem: 'Pmdmini', engine: PmdminiEngine, success: { type: 'moduleLoaded', meta: {} } },
  PreTracker: { dir: 'pretracker', stem: 'PreTracker', engine: PreTrackerEngine, success: ok },
  Psgplay: { dir: 'psgplay', stem: 'Psgplay', engine: PsgplayEngine, success: { type: 'moduleLoaded', track: 1, subtunes: 1 } },
  PumaTracker: { dir: 'pumatracker', stem: 'PumaTracker', engine: PumaTrackerEngine, success: ok },
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
      if (d.type === (row.loadType ?? 'loadModule')) { setTimeout(() => proc.port.postMessage(reply), 10); return; }
      return real(d);
    };
  }

  it('rejects with the worklet message when the worklet answers type error', async () => {
    await boot({ type: 'error', message: 'refused by the player' });
    await expect(load(engine!)).rejects.toThrow('refused by the player');
  });

  it('stays pending until the worklet answers, then resolves on the success message', async () => {
    await boot(row.success);
    let settled = false;
    const p = load(engine!).then(() => { settled = true; });
    await new Promise((r) => setTimeout(r, 0));
    expect(settled).toBe(false);
    await p;
    await until(() => settled);
  });
});
