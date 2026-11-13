/**
 * NATIVE-LOAD-WAITS-FOR-ANSWER, batch D (see nativeLoadWaitsForAnswer.test.ts for batch A and the full rationale):
 * HippelSt and TFMX swallowed the worklet's error (resolved the load), DavidWhittaker resolved right after postMessage.
 * Each now settles on the worklet's answer (WASMSingletonBase.beginModuleLoad / settleModuleLoad / failModuleLoad).
 *
 * Seam: the REAL engine class and its REAL message handler run on the headless worklet rig, with the real WASM assets.
 * Only the worklet's answer to the load message is scripted per row (success message or type 'error').
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { installWorkletRig, until, type Rig } from '../../nuade/__tests__/nuadeEngineRig';
import { HippelStEngine } from '../../hippelst/HippelStEngine';
import { TFMXEngine } from '../../tfmx/TFMXEngine';
import { DavidWhittakerEngine } from '../../davidwhittaker/DavidWhittakerEngine';

// HippelSt parses the image in-process before posting; the parse is not under test, only the worklet answer is.
vi.mock('@/lib/import/formats/JochenHippelSTNative', () => ({
  hstNativeSong: (b: Uint8Array) => ({ song: b, shortPointers: false, laterPlayer: false, newSid: false, subsongs: 1 }),
}));

interface Loadable { ready(): Promise<void>; dispose(): void }
type Row = {
  dir: string; stem: string; engine: { getInstance(): Loadable };
  success: Record<string, unknown>;
  load: (e: Loadable) => Promise<unknown>;
  loadType: string;
};
const buf = () => new Uint8Array(64).fill(0x7f).buffer;
const loose = (e: Loadable) => e as unknown as { loadTune(...a: unknown[]): Promise<unknown> };

const ROWS: Record<string, Row> = {
  HippelSt: { dir: 'hippelst', stem: 'HippelST', engine: HippelStEngine, success: { type: 'tuneLoaded', subsongs: 1 }, load: (e) => loose(e).loadTune(buf(), 0), loadType: 'loadTune' },
  TFMX: { dir: 'tfmx', stem: 'TFMX', engine: TFMXEngine, success: { type: 'moduleLoaded', voices: 4, songs: 1, duration: 1 }, load: (e) => loose(e).loadTune(buf()), loadType: 'loadModule' },
  DavidWhittaker: { dir: 'davidwhittaker', stem: 'DavidWhittaker', engine: DavidWhittakerEngine, success: { type: 'moduleLoaded', subsongCount: 1, channels: 4 }, load: (e) => loose(e).loadTune(buf(), 0), loadType: 'loadModule' },
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
      if (d.type === row.loadType) { setTimeout(() => proc.port.postMessage(reply), 10); return; }
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
