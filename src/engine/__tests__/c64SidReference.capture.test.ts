/**
 * Reference side of tools/c64-rom-check.ts: plays a SID .fur through the Furnace dispatch worklet (the same
 * furnace_dispatch_reg_writes dump the lock-step tests use) and stores the SID registers ($D400-$D418) as they
 * stand at the end of each 50 Hz frame. The Furnace CLI cannot give this: its -vgmout has no SID command.
 * Runs only when C64_REF_SONG (path under public/data/songs/furnace) and C64_REF_OUT are set; the check tool sets them.
 */
import fs from 'node:fs';
import { join } from 'node:path';
import { it, expect, beforeAll } from 'vitest';
import { startWorklet, stereoOutputs, loadSharedWorkletScripts } from './workletHarness';
import { installFurnaceFileOpsWasm } from '../../lib/import/__tests__/furnaceFileOpsWasmHarness';
import { FurnaceDispatchEngine } from '../furnace-dispatch/FurnaceDispatchEngine';

const SONG = process.env.C64_REF_SONG, OUT = process.env.C64_REF_OUT, FRAMES = Number(process.env.C64_REF_FRAMES ?? 500);
const RATE = 48000, BLOCK = 128;

/* eslint-disable @typescript-eslint/no-explicit-any */
let worklet: any;
beforeAll(async () => {
  if (!SONG) return;
  installFurnaceFileOpsWasm(); loadSharedWorkletScripts();
  worklet = await startWorklet('furnace-dispatch', 'FurnaceDispatch');
  const eng: any = FurnaceDispatchEngine.getInstance();
  worklet.proc.port.postMessage = (m: unknown) => eng.handleWorkletMessage(m);
  eng.workletNode = { port: { postMessage: (m: unknown) => { void worklet.send(m); }, onmessage: null }, connect() {} };
  eng.initialized = true;
}, 60000);

it.skipIf(!SONG || !OUT)('captures per-frame SID registers from Furnace dispatch', async () => {
  const { parseFurnaceFile } = await import('@/lib/import/parsers/FurnaceToSong');
  const data = fs.readFileSync(join(process.cwd(), 'public/data/songs/furnace', SONG!));
  const song = await parseFurnaceFile(data.buffer.slice(data.byteOffset, data.byteOffset + data.length), 'ref.fur');
  const proc = worklet.proc; const eng: any = FurnaceDispatchEngine.getInstance();
  const r = await eng.startWithCoordinator({ dispatchEnginePosition() {} }, { song, synthBus: null, isStillCurrent: () => true, initialSongPos: 0, initialPattPos: 0 });
  expect(r.started).toBe(true);
  const handle = [...proc.chips.values()].map((c: any) => c.handle)[0];
  const out = proc.module._malloc(8192 * 8);
  proc.module._furnace_dispatch_reg_dump(handle, 1);
  const outs = stereoOutputs(37);
  const reg = new Array<number>(25).fill(0); const frames: number[][] = [];
  for (let blk = 0; frames.length < FRAMES; blk++) {
    proc.process([], outs);
    const k = proc.module._furnace_dispatch_reg_writes(handle, out, 8192);
    if (k > 0) { const a = new Int32Array(proc.getHeapBuffer(), out, k * 2); // Only SID addresses 0-24: c64.cpp also logs 0xffff0x01/0xffff0x02 (PCM rate, sample reset), which `& 0x1f` folded onto voice 0's freq hi / duty lo.
    for (let j = 0; j < k; j++) if (a[2 * j] >= 0 && a[2 * j] < 25) reg[a[2 * j]] = a[2 * j + 1] & 0xff; }
    // Frame f ends at sample (f + 1) * RATE / 50; store the registers of the last block inside it.
    while (frames.length < FRAMES && (blk + 1) * BLOCK >= (frames.length + 1) * RATE / 50) frames.push([...reg]);
  }
  eng.seqStop(); proc.module._free(out);
  fs.writeFileSync(OUT!, JSON.stringify({ song: SONG, hz: 50, frames }));
}, 300000);
