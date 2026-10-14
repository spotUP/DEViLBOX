/**
 * NUADE-SUBSONG-SWEEP: every nuade table row that has a multi-subsong corpus song (thoughts/spot/nuade-subsong-sweep.json,
 * written by tools/nuade/subsongSweep.ts) is imported with the row pinned to nuade, and
 *   (a) subsongStatus answers with nuade's own count, (b) switchSubsong(N) makes nuade play tune N (its output follows
 *   nuade opened directly on N and leaves tune 0), (c) the save carries N (getNativeEngineMetaForExport).
 * A survey, resumable: verdicts go to the same json (`sweep` key per row); run with SWEEP=1 (SWEEP_ONLY=id re-runs one row).
 */
import { describe, it, vi, beforeAll, afterAll } from 'vitest';
import '@/stores/useTrackerStore';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { installNuadeRig, until, type Rig } from '../nuade/__tests__/nuadeEngineRig';
import { ROOT, stereoOutputs } from './workletHarness';
import { NuadeHeadless } from '../nuade/nuadeHeadless';
import { setNuadeProbe } from '../nuade/nuadeProbe';
import { WASMChannelOutputsEngine } from '@engine/wasm/WASMSingletonBase';
import { registerChannelMeterSink } from '@engine/tone/channelMeterFeed';
import { NUADE_FORMATS } from '../nuade/nuadeFormats';

vi.mock('../ToneEngine', () => {
  const engine = new Proxy({}, { get: () => () => undefined });
  return { getToneEngine: () => engine };
});
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/modland/ModlandDetector', () => ({ checkModlandFile: vi.fn(async () => ({ found: true })) }));
vi.mock('@engine/TrackerReplayer', async (orig) => {
  const replayer: object = new Proxy({}, { get: (_t, k) => (k === 'getSong' ? () => (globalThis as { __liveSong?: () => unknown }).__liveSong?.() : () => undefined) });
  return { ...(await orig<object>()), getTrackerReplayer: () => replayer, peekTrackerReplayer: () => replayer };
});

const OUT = resolve(ROOT, 'thoughts/spot/nuade-subsong-sweep.json');
type Rec = Record<string, { songs: unknown[]; multi: string | null; sweep?: Record<string, unknown> }>;
const SR = 48000;
const rec: Rec = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
const rows = Object.entries(rec).filter(([id, r]) => r.multi && (process.env.SWEEP_ONLY ? id === process.env.SWEEP_ONLY : !r.sweep));

/** RMS per 20 ms of the left channel. */
const envelope = (pcm: Float32Array): number[] => {
  const win = SR / 50, out: number[] = [];
  for (let i = 0; i + win <= pcm.length / 2; i += win) { let s = 0; for (let j = 0; j < win; j++) s += pcm[2 * (i + j)]! ** 2; out.push(Math.sqrt(s / win)); }
  return out;
};
const corr = (a: number[], b: number[]): number => {
  const n = Math.min(a.length, b.length);
  const ma = a.slice(0, n).reduce((x, y) => x + y, 0) / n, mb = b.slice(0, n).reduce((x, y) => x + y, 0) / n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { sab += (a[i]! - ma) * (b[i]! - mb); saa += (a[i]! - ma) ** 2; sbb += (b[i]! - mb) ** 2; }
  return saa === 0 || sbb === 0 ? (saa === sbb ? 1 : 0) : sab / Math.sqrt(saa * sbb);
};

describe.skipIf(!process.env.SWEEP)('nuade subsong sweep', () => {
  let rig: Rig;
  let headless: NuadeHeadless;
  beforeAll(async () => {
    rig = installNuadeRig();
    vi.spyOn(WASMChannelOutputsEngine.prototype as unknown as { afterPlay(): void }, 'afterPlay').mockImplementation(() => undefined);
    headless = await NuadeHeadless.create();
    setNuadeProbe(async (id, bytes, name) => headless.probeWith(id, bytes, name));
  }, 60_000);
  afterAll(async () => {
    const { NuadeEngine } = await import('../nuade/NuadeEngine');
    if (NuadeEngine.hasInstance()) NuadeEngine.getInstance().dispose();
    registerChannelMeterSink(null);
    rig.uninstall();
  });

  for (const [id, r] of rows) {
    it(id, async () => {
      const v: Record<string, unknown> = { song: r.multi };
      const save = (): void => { rec[id]!.sweep = v; writeFileSync(OUT, JSON.stringify(rec, null, 1)); };
      try {
        const row = NUADE_FORMATS[id]!;
        const { useSettingsStore } = await import('@/stores/useSettingsStore');
        useSettingsStore.getState().setFormatEngine(row.prefKey as never, 'nuade');
        const path = resolve(ROOT, r.multi!);
        const bytes = new Uint8Array(readFileSync(path));
        const direct = (n: number, secs: number): Float32Array => {
          headless.clearFiles(); headless.open(bytes, basename(path), id); headless.start(n);
          const out = headless.render(secs * SR).stereo; headless.close(); return out;
        };
        headless.clearFiles(); headless.open(bytes, basename(path), id);
        const count = headless.subsongCount, dflt = headless.defaultSubsong; headless.close();
        v.nuadeCount = count; v.nuadeDefault = dflt;
        const N = dflt === count - 1 ? 0 : count - 1;
        v.target = N;

        const file = new File([bytes.slice().buffer as ArrayBuffer], basename(path));
        const { importTrackerModule } = await import('@/lib/song/songBranches');
        // A grid that needs UADE's scan cannot be built headless (no UADE wasm in the rig): the import hangs there, and the
        // song is then built the way the route ends - playOnNuade on a bare song, applied to the format store.
        let stubbed = false;
        const imported = importTrackerModule({
          metadata: { title: file.name, type: 'MOD', channels: -1, patterns: -1, orders: -1, instruments: -1, samples: -1, duration: 0 },
          arrayBuffer: await file.arrayBuffer(), file,
        } as never, { useLibopenmpt: true } as never).then(() => true);
        const done = await Promise.race([imported, new Promise<boolean>((res) => setTimeout(() => res(false), 40_000))]);
        if (!done) {
          stubbed = true;
          const { applyNuadeChoice } = await import('@/lib/import/parsers/withNuade');
          const stub = await applyNuadeChoice({ instruments: [], patterns: [], format: 'MOD' } as never, {
            buffer: bytes.slice().buffer as ArrayBuffer, fileName: basename(path), prefs: useSettingsStore.getState().formatEngine,
          });
          (await import('@stores/useFormatStore')).useFormatStore.getState().applyEditorMode(stub as never);
        }
        v.stubbedSong = stubbed;
        const { liveTrackerSong } = await import('@/lib/song/liveSong');
        (globalThis as { __liveSong?: () => unknown }).__liveSong = () => liveTrackerSong();
        const { useFormatStore } = await import('@stores/useFormatStore');
        const { subsongStatus, switchSubsong } = await import('@/lib/tracker/subsongSwitch');
        v.songOnNuade = !!liveTrackerSong().nuadePlayerId;
        const imp = subsongStatus(useFormatStore.getState());
        v.statusAtImport = imp ? `${imp.source}:${imp.count}` : null;

        const { NuadeEngine } = await import('../nuade/NuadeEngine');
        const { startNativeEngines, clearRunningEngineKeys } = await import('../replayer/NativeEngineRouting');
        const start = async (): Promise<void> => {
          if (NuadeEngine.hasInstance()) NuadeEngine.getInstance().dispose();
          rig.posted.length = 0; clearRunningEngineKeys();
          await startNativeEngines(liveTrackerSong(), {} as never, false, false, new Set());
          await until(() => rig.posted.some((m) => m.type === 'moduleLoaded'), 30_000);
        };
        v.step = 'engineStart'; save();
        await start();
        v.step = 'engineStarted'; save();
        const outputs = rig.nodeOptions.at(-1)?.numberOfOutputs ?? 9;
        const render = (secs: number): Float32Array => {
          const quanta = Math.round((secs * SR) / 128), pcm = new Float32Array(quanta * 256);
          for (let q = 0; q < quanta; q++) {
            const out = stereoOutputs(outputs); rig.proc().process([], out);
            for (let i = 0; i < 128; i++) { pcm[q * 256 + 2 * i] = out[0]![0]![i]!; pcm[q * 256 + 2 * i + 1] = out[0]![1]![i]!; }
          }
          return pcm;
        };
        const sl = subsongStatus(useFormatStore.getState());
        v.statusAfterLoad = sl ? `${sl.source}:${sl.count}@${sl.current}` : null;
        NuadeEngine.getInstance().play();
        const tune0 = envelope(render(3));
        const { useTransportStore } = await import('@stores/useTransportStore');
        useTransportStore.setState({ isPlaying: true } as never);
        v.step = 'switching'; save();
        await switchSubsong(N);
        v.step = 'switched'; save();
        await new Promise((res) => setTimeout(res, 300));
        const st = subsongStatus(useFormatStore.getState());
        v.statusAfterSwitch = st ? `${st.source}:${st.count}@${st.current}` : null;
        v.liveNuadeSubsong = liveTrackerSong().nuadeSubsong ?? null;
        let heard: number[];
        if (st?.source === 'file') {
          // the reopen replaced the song: nuade starts on the song's tune the way playback starts it
          useTransportStore.setState({ isPlaying: false } as never);
          await start(); NuadeEngine.getInstance().play(); heard = envelope(render(3));
        } else {
          rig.posted.length = 0; heard = envelope(render(3));
        }
        const dN = envelope(direct(N, 3)), d0 = envelope(direct(dflt, 3));
        v.corrToN = +corr(heard, dN).toFixed(3); v.corrToDefault = +corr(heard, d0).toFixed(3);
        v.tune0CorrToDefault = +corr(tune0, d0).toFixed(3);
        const meta = (await import('@/lib/export/exporters')).getNativeEngineMetaForExport();
        v.savedNuadeSubsong = (meta?.nuadeSubsong as number | undefined) ?? null;
        const nIsDistinct = corr(dN, d0) < 0.97;
        v.tuneDistinct = nIsDistinct;
        v.countOk = !!imp ? imp.count === count : false;
        v.countOkAfterLoad = !!sl && sl.count === count;
        v.switchPlaysN = v.corrToN as number > 0.97 && (!nIsDistinct || (v.corrToN as number) > (v.corrToDefault as number));
        v.saveKeepsN = v.savedNuadeSubsong === N;
      } catch (e) {
        v.error = String((e as Error).message ?? e).slice(0, 300);
      }
      save();
    }, 240_000);
  }
});
