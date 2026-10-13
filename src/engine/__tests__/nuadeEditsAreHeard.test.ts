/**
 * NUADE-EDIT-PATH: a grid edit made while a song plays on nuade is heard, at its pitch, where it was made.
 *
 * Per format, the engine choice is pinned to nuade (never read from rollout data). The song is opened through the app's
 * import (importTrackerModule) and started by startNativeEngines on the REAL NuadeEngine, whose worklet and WASM run
 * in-process (nuadeEngineRig). Run A plays the loaded module; run B plays the same, and at `swapAt` seconds a note is
 * raised two semitones through the pattern editor's own store action (useTrackerStore.setCell). The edit reaches the
 * engine by the live route (sendCellEditsToEngine -> 'engine-swap' -> editedModuleForPlay -> NuadeEngine.swapModule).
 *
 * Measured, per format:
 *   - sentinel: swapModule ran once, the worklet answered swapDone, posted no error, and nuade's own probe accepts the
 *     bytes (the player opens them);
 *   - continuity: B's output equals A's sample for sample from the swap up to the edited row (the swap keeps the
 *     position, and the module it hands over is the loaded one with only the edit in it - a lossy re-serialisation
 *     changes the sound from the swap on);
 *   - the edit is heard: B's output differs from A's after that row, and the voice the edit is on plays two
 *     semitones higher than in A while every other voice plays what it played.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
// First: the store's binding to the replayer is then the mock below (imported after the real module, it bound the real one).
import '@/stores/useTrackerStore';
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { installNuadeRig, until, type Rig } from '../nuade/__tests__/nuadeEngineRig';
import { ROOT, stereoOutputs } from './workletHarness';
import { NuadeHeadless } from '../nuade/nuadeHeadless';
import { setNuadeProbe } from '../nuade/nuadeProbe';
import { WASMChannelOutputsEngine } from '@engine/wasm/WASMSingletonBase';
import { registerChannelMeterSink } from '@engine/tone/channelMeterFeed';

vi.mock('../ToneEngine', () => {
  const engine = new Proxy({}, { get: () => () => undefined });
  return { getToneEngine: () => engine };
});
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/modland/ModlandDetector', () => ({ checkModlandFile: vi.fn(async () => ({ found: true })) }));
// The store hands its edits to the song the replayer holds: here, the live song (what the replayer is given at play).
vi.mock('@engine/TrackerReplayer', async (orig) => {
  const replayer: object = new Proxy({}, { get: (_t, k) => (k === 'getSong' ? () => (globalThis as { __liveSong?: () => unknown }).__liveSong?.() : () => undefined) });
  return { ...(await orig<object>()), getTrackerReplayer: () => replayer, peekTrackerReplayer: () => replayer };
});

interface Case {
  id: string; prefKey: string; file: string;
  /** The edited cell: grid pattern, channel, row (a note the first minute plays). */
  pattern: number; channel: number; row: number;
  swapAt: number; endAt: number;
  /** When the raised note starts to sound, in nuade's own render of the edited module (s). */
  heardAt: number;
}

// Sites measured with nuade's own render (heardAt: the first 20 ms where the raised note changes the voice). The
// SoundMon and InStereo sites are tracks other positions play too: the edit must stay at its own position.
const CASES: Case[] = [
  { id: 'robhubbard', prefKey: 'robHubbard', file: 'public/data/songs/formats/centurion_battle.rh', pattern: 0, channel: 0, row: 48, swapAt: 2, endAt: 4, heardAt: 2.86 },
  { id: 'soundmaster', prefKey: 'soundMaster', file: "public/data/songs/formats/rackney'sisland_4.sm", pattern: 12, channel: 1, row: 0, swapAt: 6.5, endAt: 9, heardAt: 7.66 },
  { id: 'hippel', prefKey: 'hippelCoso', file: 'public/data/songs/formats/prehistoric_tale.hipc', pattern: 3, channel: 3, row: 1, swapAt: 6, endAt: 8.5, heardAt: 6.84 },
  { id: 'instereo1', prefKey: 'inStereo1', file: 'public/data/songs/formats/fantasi8.is', pattern: 8, channel: 1, row: 0, swapAt: 6.5, endAt: 9, heardAt: 7.68 },
  { id: 'sidmon2', prefKey: 'sidmon2', file: 'public/data/songs/formats/bruno_time.sid2', pattern: 2, channel: 1, row: 2, swapAt: 14.5, endAt: 17, heardAt: 15.7 },
  { id: 'soundmon', prefKey: 'soundmon', file: 'public/data/songs/formats/antidust.bp3', pattern: 4, channel: 0, row: 0, swapAt: 6.5, endAt: 9, heardAt: 7.68 },
];

const SR = 48000;
type Pos = { frame: number; voices: { note: number }[] };

describe('an edit on a song playing on nuade is heard where it was made', () => {
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

  for (const c of CASES) {
    it(`${c.id}: a note raised two semitones while it plays is heard two semitones up on its voice, nothing else moves`, async () => {
      const { useSettingsStore } = await import('@/stores/useSettingsStore');
      useSettingsStore.getState().setFormatEngine(c.prefKey as never, 'nuade'); // pinned: the default is rollout data

      // The app's import: parse, stores, grid baseline.
      const bytes = new Uint8Array(readFileSync(resolve(ROOT, c.file)));
      const file = new File([bytes.slice().buffer as ArrayBuffer], basename(c.file));
      const { importTrackerModule } = await import('@/lib/song/songBranches');
      await importTrackerModule({
        metadata: { title: file.name, type: 'MOD', channels: -1, patterns: -1, orders: -1, instruments: -1, samples: -1, duration: 0 },
        arrayBuffer: await file.arrayBuffer(), file,
      } as never, { useLibopenmpt: true } as never);
      const { liveTrackerSong } = await import('@/lib/song/liveSong');
      (globalThis as { __liveSong?: () => unknown }).__liveSong = () => liveTrackerSong();
      const { liveEditRoute } = await import('@/engine/replayer/liveCellEdits');
      expect(liveEditRoute(liveTrackerSong())).toEqual({ route: 'engine-swap', engine: 'Nuade' });

      // Started the way playback starts it.
      const { NuadeEngine } = await import('../nuade/NuadeEngine');
      const { startNativeEngines, clearRunningEngineKeys } = await import('../replayer/NativeEngineRouting');
      if (NuadeEngine.hasInstance()) NuadeEngine.getInstance().dispose();
      rig.posted.length = 0;
      clearRunningEngineKeys();
      await startNativeEngines(liveTrackerSong(), {} as never, false, false, new Set());
      await until(() => rig.posted.some((m) => m.type === 'moduleLoaded'), 20_000);
      const engine = NuadeEngine.getInstance();
      const outputs = rig.nodeOptions.at(-1)?.numberOfOutputs ?? 9;
      const render = (seconds: number): Float32Array => {
        const quanta = Math.round((seconds * SR) / 128);
        const pcm = new Float32Array(quanta * 256);
        for (let q = 0; q < quanta; q++) {
          const out = stereoOutputs(outputs);
          rig.proc().process([], out);
          for (let i = 0; i < 128; i++) { pcm[q * 256 + 2 * i] = out[0]![0]![i]!; pcm[q * 256 + 2 * i + 1] = out[0]![1]![i]!; }
        }
        return pcm;
      };
      const positions = (from: number): Pos[] => rig.posted.slice(from).filter((m) => m.type === 'position') as unknown as Pos[];

      // Run A: the loaded module.
      engine.stop(); engine.play();
      let mark = rig.posted.length;
      const a = render(c.endAt);
      const posA = positions(mark);

      // Run B: the same, edited at swapAt through the pattern editor's store action.
      engine.stop(); engine.play();
      mark = rig.posted.length;
      const b1 = render(c.swapAt);
      const { useTrackerStore } = await import('@/stores/useTrackerStore');
      const before = useTrackerStore.getState().patterns[c.pattern].channels[c.channel].rows[c.row];
      expect(before.note, 'the site holds a note').toBeGreaterThan(0);
      const swap = vi.spyOn(engine, 'swapModule');
      const swapped = rig.posted.length;
      useTrackerStore.getState().setCurrentPattern(c.pattern);
      const editedAt = Date.now();
      useTrackerStore.getState().setCell(c.channel, c.row, { note: before.note + 2 });
      await until(() => rig.posted.slice(swapped).some((m) => m.type === 'swapDone' || m.type === 'error'), 60_000);
      const editToSwapMs = Date.now() - editedAt;
      expect(rig.posted.slice(swapped).filter((m) => m.type === 'error'), 'the worklet refused the edited module').toEqual([]);
      expect(swap, 'the edit reached the engine once').toHaveBeenCalledTimes(1);
      const handed = new Uint8Array(swap.mock.calls[0]![0] as ArrayBuffer);
      expect(handed.length === bytes.length && handed.every((v, i) => v === bytes[i]), 'the module handed over carries the edit').toBe(false);
      expect(headless.probeWith(c.id, handed, basename(c.file)), 'nuade opens the module it is handed').toBe(0);
      const b2 = render(c.endAt - c.swapAt);
      const posB = positions(mark);
      swap.mockRestore();
      engine.stop();

      // Continuity, then the edit: the first sample where B leaves A is after the swap, at the edited row.
      const b = new Float32Array(b1.length + b2.length);
      b.set(b1); b.set(b2, b1.length);
      const n = Math.min(a.length, b.length);
      let first = -1;
      for (let i = 0; i < n; i++) if (a[i] !== b[i]) { first = i >> 1; break; }
      expect(first, 'the edit changed the output').toBeGreaterThanOrEqual(0);
      // Identical from the swap to the edited row: the swap kept the position and changed nothing else.
      expect(Math.abs(first / SR - c.heardAt), `B left A at ${(first / SR).toFixed(2)} s; the edited row plays at ${c.heardAt} s (swap at ${c.swapAt} s)`).toBeLessThan(0.1);

      // The voice the edit is on, two semitones up, at the first row where what the voices play differs.
      const voicesA = new Map(posA.map((p) => [p.frame, p.voices.map((v) => v.note)]));
      const diff = posB.find((p) => { const v = voicesA.get(p.frame); return !!v && v.join() !== p.voices.map((x) => x.note).join(); });
      expect(diff, 'a row where the voices play differently').toBeDefined();
      const deltas = diff!.voices.map((v, i) => v.note - voicesA.get(diff!.frame)![i]!);
      expect(deltas).toEqual(deltas.map((_, i) => (i === c.channel ? 2 : 0)));
      expect(diff!.frame).toBeGreaterThanOrEqual(Math.floor(c.swapAt * SR) - 128);
      console.info(`[nuadeEditsAreHeard] ${c.id}: edit to swapDone ${editToSwapMs} ms (worklet swap ${engine.lastSwapMs} ms) at ${c.swapAt} s, heard from ${(first / SR).toFixed(2)} s, voice ${c.channel + 1} +2`);
    }, 240_000);
  }
});
