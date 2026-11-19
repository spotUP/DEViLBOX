/**
 * NSF import pitch is register-exact in Furnace playback: the converter
 * (furnace-fileops-wasm/src/nsfToFur.cpp, periodToNote) picks the note and fine
 * whose Furnace 2A03 period (DivPitchTable linear interpolation, then freq--)
 * equals the NSF's own period. The .fur is rendered through our Furnace
 * dispatch wasm and the $4002/$4003 and $400A/$400B writes are read back.
 *
 * Regression (NSF-PERIOD-DRIFT 2026-11-19): Bionic Commando track 7 pulse 1
 * opens on period 179; the continuous log2 fine gave D#-3/128, which Furnace
 * plays as 178. The triangle also played one octave low (period 509 for 254).
 */
import fs from 'node:fs';
import { it, expect, beforeAll } from 'vitest';
import { startWorklet, stereoOutputs, loadSharedWorkletScripts } from './workletHarness';
import { installFurnaceFileOpsWasm } from '../../lib/import/__tests__/furnaceFileOpsWasmHarness';
import { FurnaceDispatchEngine } from '../furnace-dispatch/FurnaceDispatchEngine';

// outside the repo, run only when present
const BIONIC = '/Users/spot/Downloads/NSFE/bioniccommando.nsfe';

/* eslint-disable @typescript-eslint/no-explicit-any */
let worklet: any;
beforeAll(async () => {
  installFurnaceFileOpsWasm(); loadSharedWorkletScripts();
  worklet = await startWorklet('furnace-dispatch', 'FurnaceDispatch');
  const eng: any = FurnaceDispatchEngine.getInstance();
  worklet.proc.port.postMessage = (m: unknown) => eng.handleWorkletMessage(m);
  eng.workletNode = { port: { postMessage: (m: unknown) => { void worklet.send(m); }, onmessage: null }, connect() {} };
  eng.initialized = true;
}, 60000);

it.skipIf(!fs.existsSync(BIONIC))('Bionic Commando t7 first pulse 1 and triangle periods match the NSF', async () => {
  const { nsfToFurWasm } = await import('../../lib/import/wasm/FurnaceFileOps');
  const { parseFurnaceFile } = await import('@/lib/import/parsers/FurnaceToSong');
  const fur = await nsfToFurWasm(new Uint8Array(fs.readFileSync(BIONIC)), 7, 1200);
  const song = await parseFurnaceFile(fur, 'bionic7.fur');
  const proc = worklet.proc; const eng: any = FurnaceDispatchEngine.getInstance();
  const r = await eng.startWithCoordinator({ dispatchEnginePosition() {} }, { song, synthBus: null, isStillCurrent: () => true, initialSongPos: 0, initialPattPos: 0 });
  expect(r.started).toBe(true);
  const handle = [...proc.chips.values()].map((c: any) => c.handle)[0];
  const out = proc.module._malloc(8192 * 8);
  proc.module._furnace_dispatch_reg_dump(handle, 1);
  const outs = stereoOutputs(37);
  const reg = new Map<number, number>();
  const periods: Record<string, number[]> = { pulse1: [], triangle: [] };
  for (let blk = 0; blk < 48000 / 2 / 128; blk++) { // first half second: periods 179 then 169 on pulse 1
    proc.process([], outs);
    const n = proc.module._furnace_dispatch_reg_writes(handle, out, 8192);
    if (n <= 0) continue;
    const a = new Int32Array(proc.getHeapBuffer(), out, n * 2);
    for (let j = 0; j < n; j++) reg.set(a[2 * j], a[2 * j + 1]);
    for (const [name, lo] of [['pulse1', 0x4002], ['triangle', 0x400a]] as const) {
      if (!reg.has(lo)) continue;
      const p = ((reg.get(lo + 1) ?? 0) & 7) << 8 | reg.get(lo)!;
      if (periods[name].at(-1) !== p) periods[name].push(p);
    }
  }
  eng.seqStop();
  expect(periods.pulse1.slice(0, 2)).toEqual([179, 169]);
  expect(periods.triangle[0]).toBe(254);
}, 120000);
