/**
 * Furnace effect E5xx (fine pitch, 80 = centre) on a .fur song reaches the chip's period
 * registers through the WASM sequencer (FurnaceSequencer.cpp case 0xe5, as playback.cpp
 * 0.6.8.3), and E580 is a no-op. Guard for the BossGame boss.fur report (2026-11-13): the
 * detuned AY bass made no beat because the .fur had no E5 cells at all (FurnaceExporter's
 * Scramble filter drops E5), not because playback ignored it.
 *
 * Driven through the real entry (FurnaceDispatchEngine.startWithCoordinator) on the real
 * worklet + WASM; the measure is the SN76489 chip's register writes (its tone periods).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { startWorklet, stereoOutputs, loadSharedWorkletScripts, songBuffer } from './workletHarness';
import { parseFurnaceFile } from '@/lib/import/parsers/FurnaceToSong';
import { installFurnaceFileOpsWasm } from '@/lib/import/__tests__/furnaceFileOpsWasmHarness';
import { FurnaceDispatchEngine } from '../furnace-dispatch/FurnaceDispatchEngine';
import type { FurnaceNativeData } from '@/types/tracker';

type Eng = {
  workletNode: unknown; initialized: boolean;
  chips: Map<number, unknown>; destroyChip(platformType: number): void;
  handleWorkletMessage(m: unknown): void;
  startWithCoordinator(c: object, o: object): Promise<{ started: boolean }>;
  seqStop(): void;
};
type Proc = {
  module: {
    _malloc(n: number): number; _free(p: number): void;
    _furnace_dispatch_reg_dump(h: number, enable: number): void;
    _furnace_dispatch_reg_writes(h: number, out: number, max: number): number;
  };
  chips: Map<number, { handle: number }>;
  getHeapBuffer(): ArrayBuffer;
  port: { postMessage(m: unknown): void };
  process(i: unknown[], o: Float32Array[][]): boolean;
  drainCmdLog(): void;
};

const SONG = 'public/data/songs/furnace/genesis/mm5_boss.fur'; // YM2612 (ch 0-5) + SN76489 (ch 6-9)
const SN76489 = 4;

let worklet: Awaited<ReturnType<typeof startWorklet>>;

beforeAll(async () => {
  installFurnaceFileOpsWasm();
  loadSharedWorkletScripts();
  worklet = await startWorklet('furnace-dispatch', 'FurnaceDispatch');
  const proc = worklet.proc as unknown as Proc;
  const eng = FurnaceDispatchEngine.getInstance() as unknown as Eng;
  proc.port.postMessage = (m) => eng.handleWorkletMessage(m);
  eng.workletNode = { port: { postMessage: (m: unknown) => { void worklet.send(m); }, onmessage: null }, connect() {} };
  eng.initialized = true;
}, 60000);

/** Puts E5<val> on every SN76489 note row of the song (null = song as is); returns the SN chip's writes for 3 s. */
async function snWrites(e5: number | null): Promise<number[]> {
  const song = await parseFurnaceFile(songBuffer(SONG), 'mm5_boss.fur');
  const native = song.furnaceNative as FurnaceNativeData;
  let placed = 0;
  if (e5 !== null) {
    for (const chan of native.subsongs[0].channels.slice(6, 10)) {
      for (const pat of chan.patterns.values()) {
        for (const row of pat.rows) {
          if (!row || row.note < 0 || row.note >= 253) continue;
          const slot = row.effects.findIndex((f) => !f || f.cmd < 0);
          if (slot < 0 || slot >= chan.effectCols) continue;
          row.effects[slot] = { cmd: 0xe5, val: e5 };
          placed++;
        }
      }
    }
    expect(placed, 'E5 cells placed on SN76489 notes').toBeGreaterThan(5);
  }
  const proc = worklet.proc as unknown as Proc;
  const eng = FurnaceDispatchEngine.getInstance() as unknown as Eng;
  for (const pt of [...eng.chips.keys()]) eng.destroyChip(pt);
  const r = await eng.startWithCoordinator({ dispatchEnginePosition() {} }, {
    song, synthBus: null, isStillCurrent: () => true, initialSongPos: 0, initialPattPos: 0,
  });
  expect(r.started).toBe(true);
  const handle = proc.chips.get(SN76489)?.handle;
  expect(handle, 'SN76489 chip created').toBeGreaterThan(0);
  const MAX = 8192;
  const out = proc.module._malloc(MAX * 8);
  proc.module._furnace_dispatch_reg_dump(handle!, 1);
  const outs = stereoOutputs(37);
  const writes: number[] = [];
  for (let b = 0; b < (48000 * 3) / 128; b++) {
    proc.process([], outs);
    const n = proc.module._furnace_dispatch_reg_writes(handle!, out, MAX);
    if (n <= 0) continue;
    const a = new Int32Array(proc.getHeapBuffer(), out, n * 2);
    for (let j = 0; j < n; j++) writes.push(a[2 * j], a[2 * j + 1]);
  }
  proc.module._furnace_dispatch_reg_dump(handle!, 0);
  proc.module._free(out);
  proc.drainCmdLog();
  eng.seqStop();
  return writes;
}

describe('Furnace E5xx fine pitch reaches the chip', () => {
  it('E594 changes the tone periods written; E580 writes what the song writes without it', async () => {
    const plain = await snWrites(null);
    const centre = await snWrites(0x80);
    const sharp = await snWrites(0x94);
    expect(plain.length, 'SN76489 wrote registers').toBeGreaterThan(20);
    expect(centre).toEqual(plain);
    expect(sharp).not.toEqual(plain);
  }, 120000);
});
