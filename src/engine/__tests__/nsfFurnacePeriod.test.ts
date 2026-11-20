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
import { join } from 'node:path';
import { it, expect, beforeAll } from 'vitest';
import { loadWebBundle } from '@/test/wasm/webBundle';
import { startWorklet, stereoOutputs, loadSharedWorkletScripts } from './workletHarness';
import { installFurnaceFileOpsWasm } from '../../lib/import/__tests__/furnaceFileOpsWasmHarness';
import { FurnaceDispatchEngine } from '../furnace-dispatch/FurnaceDispatchEngine';

// outside the repo, run only when present
const BIONIC = '/Users/spot/Downloads/NSFE/bioniccommando.nsfe';

/* eslint-disable @typescript-eslint/no-explicit-any */
let worklet: any;
let gme: any;
beforeAll(async () => {
  installFurnaceFileOpsWasm(); loadSharedWorkletScripts();
  worklet = await startWorklet('furnace-dispatch', 'FurnaceDispatch');
  const eng: any = FurnaceDispatchEngine.getInstance();
  worklet.proc.port.postMessage = (m: unknown) => eng.handleWorkletMessage(m);
  eng.workletNode = { port: { postMessage: (m: unknown) => { void worklet.send(m); }, onmessage: null }, connect() {} };
  eng.initialized = true;
  gme = await loadWebBundle<any>(join(process.cwd(), 'public/gme/Gme.js'), join(process.cwd(), 'public/gme/Gme.wasm'), 'createGme');
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

/**
 * Frame-by-frame check (nsf part 4, 2026-11-20): the .fur renders through Furnace dispatch; each NSF frame
 * (GME trace, record k = state after PLAY call k) is compared with the 2A03 registers Furnace holds at the
 * end of the matching tick. The tick clock is not the block clock (the NSF plays at 60.0988 Hz, the sample
 * grid has 128-sample blocks), so the block rate and the start lag are fitted by exhaustive search; they are
 * a clock model, the registers are compared exactly. A voice counts when it is audible in the NSF (pulse
 * volume > 0 and period >= 8, triangle length, linear counter and period >= 2); silent frames are not compared.
 */
const SQ1 = 2, SQ2 = 10, TRI = 18;
const CHECKS: [string, string, number][] = [
  ['Bionic Commando t7 (delayed vibrato from frame 1167 on pulse 1)', BIONIC, 7],
  ['Dr. Mario t2', join(process.cwd(), 'public/data/songs/nsf/dr mario.nsf'), 2],
];
for (const [label, path, track] of CHECKS) {
  it.skipIf(!fs.existsSync(path))(`${label}: pulse period/volume/duty and triangle period match frame by frame`, async () => {
    const FRAMES = 1500; // 25 s
    const data = new Uint8Array(fs.readFileSync(path));
    const m = gme.module; const gp = m._malloc(data.length); gme.heap().set(data, gp);
    m._gme_wasm_trace_open(gp, data.length, track); m._free(gp);
    const n = Math.min(m._gme_wasm_trace_run(FRAMES), FRAMES), words = m._gme_wasm_trace_words();
    const nsf: number[][] = [];
    for (let i = 0; i < n; i++) nsf.push(Array.from(new Uint16Array(gme.heap().buffer, m._gme_wasm_trace_frame(i), words)));
    m._gme_wasm_trace_close();
    const { nsfToFurWasm, NSF_DEFAULT_FRAMES } = await import('../../lib/import/wasm/FurnaceFileOps');
    const { parseFurnaceFile } = await import('@/lib/import/parsers/FurnaceToSong');
    const song = await parseFurnaceFile(await nsfToFurWasm(data, track, NSF_DEFAULT_FRAMES), 'frame.fur');
    const proc = worklet.proc; const eng: any = FurnaceDispatchEngine.getInstance();
    const r = await eng.startWithCoordinator({ dispatchEnginePosition() {} }, { song, synthBus: null, isStillCurrent: () => true, initialSongPos: 0, initialPattPos: 0 });
    expect(r.started).toBe(true);
    const handle = [...proc.chips.values()].map((c: any) => c.handle)[0];
    const out = proc.module._malloc(8192 * 8);
    proc.module._furnace_dispatch_reg_dump(handle, 1);
    const outs = stereoOutputs(37);
    const reg = new Map<number, number>(); const snaps: number[][] = [];
    for (let blk = 0; blk < Math.ceil((FRAMES + 40) * 6.25); blk++) {
      proc.process([], outs);
      const k = proc.module._furnace_dispatch_reg_writes(handle, out, 8192);
      if (k > 0) { const a = new Int32Array(proc.getHeapBuffer(), out, k * 2); for (let j = 0; j < k; j++) reg.set(a[2 * j], a[2 * j + 1]); }
      snaps.push([0x4000, 0x4002, 0x4003, 0x4004, 0x4006, 0x4007, 0x4008, 0x400a, 0x400b].map((a) => reg.get(a) ?? -1));
    }
    eng.seqStop(); proc.module._free(out);
    const per = (lo: number, hi: number): number => ((hi & 7) << 8) | lo;
    const sq = (v: number, nn: number[]): boolean => nn[v + 5] > 0 && nn[v + 7] >= 8;
    const cmp: Record<string, (nn: number[], s: number[]) => [number, number] | null> = {
      pulse1Period: (nn, s) => sq(SQ1, nn) ? [nn[SQ1 + 7], per(s[1], s[2])] : null,
      pulse1Volume: (nn, s) => [sq(SQ1, nn) ? nn[SQ1 + 5] : 0, s[0] < 0 ? 0 : s[0] & 15],
      pulse1Duty: (nn, s) => sq(SQ1, nn) ? [nn[SQ1] >> 6, s[0] >> 6] : null,
      pulse2Period: (nn, s) => sq(SQ2, nn) ? [nn[SQ2 + 7], per(s[4], s[5])] : null,
      pulse2Volume: (nn, s) => [sq(SQ2, nn) ? nn[SQ2 + 5] : 0, s[3] < 0 ? 0 : s[3] & 15],
      pulse2Duty: (nn, s) => sq(SQ2, nn) ? [nn[SQ2] >> 6, s[3] >> 6] : null,
      trianglePeriod: (nn, s) => (nn[TRI + 4] > 0 && nn[TRI + 5] > 0 && nn[TRI + 6] && nn[TRI + 7] >= 2) ? [nn[TRI + 7], per(s[7], s[8])] : null,
    };
    const at = (f: number, rate: number, lag: number): number[] => snaps[Math.min(snaps.length - 1, Math.max(0, Math.floor((f + 1) * rate - 1) + lag))];
    let best = { t: -1, rate: 0, lag: 0 };
    for (let rate = 6.22; rate <= 6.2501; rate += 0.0005) for (let lag = 10; lag <= 80; lag++) {
      let t = 0;
      for (const k of ['pulse1Period', 'pulse2Period', 'trianglePeriod', 'pulse1Volume']) for (let f = 2; f < n; f++) { const x = cmp[k](nsf[f], at(f, rate, lag)); if (x && x[0] === x[1]) t++; }
      if (t > best.t) best = { t, rate, lag };
    }
    const report: string[] = [];
    for (const [k, fn] of Object.entries(cmp)) {
      let cnt = 0, bad = -1, nb = 0;
      for (let f = 2; f < n; f++) { const x = fn(nsf[f], at(f, best.rate, best.lag)); if (!x) continue; cnt++; if (x[0] !== x[1]) { nb++; if (bad < 0) bad = f; } }
      report.push(`${k} ${nb}/${cnt}${nb ? ` first frame ${bad}` : ''}`);
    }
    console.log(`${label}: rate ${best.rate.toFixed(4)} blocks/frame, lag ${best.lag}; ${report.join(', ')}`);
    expect(report.filter((x) => !/ 0\/\d+$/.test(x)), 'channels with mismatching frames').toEqual([]);
  }, 300000);
}
