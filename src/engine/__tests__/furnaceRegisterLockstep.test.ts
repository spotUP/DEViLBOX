/**
 * A Furnace song and a DefleMask song write the same chip registers, tick for
 * tick, as Furnace itself - slides, vibrato, volume and wave steps included -
 * and play at Furnace's level (owner, 2026-10-08: "regression in furnace YET
 * again, they sound distorted" and "regression in deflemask YET again, they
 * sound weird with the slides etc, are our furnace and defle fixes defeating
 * each other?").
 *
 * They were. One engine plays both formats, and fixes for one kept breaking the
 * other because nothing compared the chips' output with Furnace for both:
 *  - af4f89e31 (DefleMask vibrato) made the song's linear-pitch flag reach the
 *    chips; the WASM engine stub's calcFreq never did the F-num/block step in
 *    linear pitch, so every FM chip (YM2612: RaveOfDoom.fur, doom2_ampie.dmf)
 *    wrote raw frequencies into its F-num/block registers.
 *  - the limited slide-down floor (every DefleMask module) was 60 notes low;
 *    a VOLUME ahead of each NOTE_ON overrode the Game Boy envelope; module
 *    wavetables went up with max+1 (every wave sample a step off), or not at
 *    all unless an instrument synth happened to upload them; forceIns wrote
 *    every channel's instrument before the first tick.
 *
 * The command lock-step (tools/furnace-audit/compare-cmds.ts) cannot see a
 * slide: Furnace's `-view commands` suppresses PITCH and NOTE_PORTA. The
 * registers carry them. Reference: the upstream Furnace CLI's .vgm export of
 * each song, read back by tools/furnace-audit/vgm-register-fixture.ts into
 * fixtures/furnace-registers/*.json (first 10 s, plus the reference render's
 * level). Driven through the real entry, FurnaceDispatchEngine.startWithCoordinator,
 * on the real worklet and WASM; the register dump is the wrapper's
 * furnace_dispatch_reg_writes (DivDispatch::getRegisterWrites, what the VGM
 * export reads).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, startWorklet, stereoOutputs, loadSharedWorkletScripts, songBuffer } from './workletHarness';
import { parseFurnaceFile } from '@/lib/import/parsers/FurnaceToSong';
import { installFurnaceFileOpsWasm } from '@/lib/import/__tests__/furnaceFileOpsWasmHarness';
import { FurnaceDispatchEngine } from '../furnace-dispatch/FurnaceDispatchEngine';
import { KIND_OF_PLATFORM, LOCKSTEP_COMMANDS, normalizeWrite, sortCommands, type ChipKind, type RegisterFixture } from './helpers/furnaceRegisterStream';

type Eng = {
  workletNode: unknown; initialized: boolean;
  chips: Map<number, unknown>; destroyChip(platformType: number): void;
  handleWorkletMessage(m: unknown): void;
  onCmdLog(cb: (e: Array<{ tick: number; cmd: number; channel: number; value1: number; value2: number }>) => void): () => void;
  startWithCoordinator(c: object, o: object): Promise<{ started: boolean }>;
  seqStop(): void;
};
type Wasm = {
  _malloc(n: number): number; _free(p: number): void;
  _furnace_dispatch_reg_dump(h: number, enable: number): void;
  _furnace_dispatch_reg_writes(h: number, out: number, max: number): number;
};
type Proc = {
  module: Wasm; chips: Map<number, { handle: number }>;
  getHeapBuffer(): ArrayBuffer;
  port: { postMessage(m: unknown): void };
  process(i: unknown[], o: Float32Array[][]): boolean;
};

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

/** Plays the song from the top through the real entry; returns each chip's writes per render block and the output. */
async function play(path: string, seconds: number, commandTicks: number) {
  const song = await parseFurnaceFile(songBuffer(path), path.split('/').pop()!);
  const proc = worklet.proc as unknown as Proc;
  const eng = FurnaceDispatchEngine.getInstance() as unknown as Eng;
  // Each song on fresh chips, as Furnace's export loads it. A chip reused from the song
  // before writes one extra key-off (0x28) on an idle channel in its first tick (doom2_ampie
  // then RaveOfDoom) - silent, and outside what this test measures.
  for (const pt of [...eng.chips.keys()]) eng.destroyChip(pt);
  const codes = new Set(Object.values(LOCKSTEP_COMMANDS));
  const commands: number[][] = [];
  const unsub = eng.onCmdLog((es) => {
    for (const e of es) if (e.tick >= 0 && e.tick < commandTicks && codes.has(e.cmd)) commands.push([e.tick, e.channel, e.cmd, e.value1, e.value2]);
  });
  const r = await eng.startWithCoordinator({ dispatchEnginePosition() {} }, {
    song, synthBus: null, isStillCurrent: () => true, initialSongPos: 0, initialPattPos: 0,
  });
  expect(r.started).toBe(true);
  const chips = [...proc.chips.entries()].map(([pt, c]) => ({ kind: KIND_OF_PLATFORM[pt], handle: c.handle, blocks: [] as number[][] }));
  const MAX = 8192;
  const out = proc.module._malloc(MAX * 8);
  for (const c of chips) proc.module._furnace_dispatch_reg_dump(c.handle, 1);
  const outs = stereoOutputs(37);
  const frames = Math.floor((48000 * seconds) / 128);
  const L = new Float32Array(frames * 128), R = new Float32Array(frames * 128);
  for (let b = 0; b < frames; b++) {
    proc.process([], outs);
    L.set(outs[0][0], b * 128); R.set(outs[0][1], b * 128);
    for (const c of chips) {
      const n = proc.module._furnace_dispatch_reg_writes(c.handle, out, MAX);
      if (n <= 0 || !c.kind) continue;
      const a = new Int32Array(proc.getHeapBuffer(), out, n * 2);
      const block: number[] = [];
      for (let j = 0; j < n; j++) { const w = normalizeWrite(c.kind, a[2 * j], a[2 * j + 1]); if (w) block.push(w[0], w[1]); }
      if (block.length) c.blocks.push(block);
    }
  }
  for (const c of chips) proc.module._furnace_dispatch_reg_dump(c.handle, 0);
  proc.module._free(out);
  (proc as unknown as { drainCmdLog(): void }).drainCmdLog();
  unsub();
  eng.seqStop();
  return { chips, L, R, commands: sortCommands(commands) };
}

const hex = (w: number[], i: number) => `${w[i]?.toString(16)}=${w[i + 1]?.toString(16)}`;

function level(L: Float32Array, R: Float32Array) {
  let ss = 0, clipped = 0;
  for (let i = 0; i < L.length; i++) {
    ss += L[i] * L[i] + R[i] * R[i];
    if (Math.abs(L[i]) >= 0.999) clipped++;
    if (Math.abs(R[i]) >= 0.999) clipped++;
  }
  return { rmsDb: 10 * Math.log10(ss / (2 * L.length) + 1e-12), clipped };
}

const SONGS: Array<{ path: string; fixture: string; what: string }> = [
  { path: 'public/data/songs/deflemask/Pegmode/No Geodudes on Mt Amber.dmf', fixture: 'No_Geodudes_on_Mt_Amber.dmf.json',
    what: 'DefleMask, Game Boy: limited slides down to the C-2 floor, a slide reset after a note-off, vibrato, envelope volume, wave RAM' },
  { path: 'public/data/songs/deflemask/Yung Gotenks/doom2_ampie.dmf', fixture: 'doom2_ampie.dmf.json',
    what: 'DefleMask, Genesis: YM2612 slides in F-num/block, SN76489' },
  { path: 'public/data/songs/furnace/genesis/RaveOfDoom.fur', fixture: 'RaveOfDoom.fur.json',
    what: 'Furnace, YM2612: 516 portamento hints in 20 s, F-num/block' },
  { path: 'public/data/songs/furnace/genesis/mm5_boss.fur', fixture: 'mm5_boss.fur.json',
    what: 'Furnace, YM2612 + SN76489: arpeggios held across new notes (keyOffAffectsArp per platform)' },
];

describe('Furnace and DefleMask songs write the registers Furnace writes', () => {
  for (const s of SONGS) {
    it(`${s.path.split('/').pop()} (${s.what})`, async () => {
      const fx = JSON.parse(readFileSync(resolve(ROOT, 'src/engine/__tests__/fixtures/furnace-registers', s.fixture), 'utf8')) as RegisterFixture;
      const { chips, L, R, commands } = await play(s.path, fx.seconds + 1, fx.commandTicks);

      // The sequencer's notes and effect hints, tick for tick, as Furnace's `-view commands` prints them.
      const lastTick = commands.length ? commands[commands.length - 1][0] : -1;
      const ref = fx.commands.filter((c) => c[0] <= lastTick);
      const cmdAt = ref.findIndex((c, i) => commands[i]?.join() !== c.join());
      const name = (c?: number[]) => c ? `${c[0]} | ${c[1]}: ${Object.keys(LOCKSTEP_COMMANDS).find((k) => LOCKSTEP_COMMANDS[k] === c[2])}(${c[3]}, ${c[4]})` : 'none';
      expect(ref.length, 'reference commands in the rendered ticks').toBeGreaterThan(50);
      expect(cmdAt, cmdAt < 0 ? '' : `command ${cmdAt}: Furnace ${name(ref[cmdAt])}, ours ${name(commands[cmdAt])}`).toBe(-1);

      for (const [kind, ref] of Object.entries(fx.chips) as Array<[ChipKind, NonNullable<RegisterFixture['chips'][ChipKind]>]>) {
        const chip = chips.find((c) => c.kind === kind);
        expect(chip, `${kind} chip created`).toBeDefined();
        // Sentinel: the chip ran and wrote registers through the dump.
        expect(chip!.blocks.length, `${kind} wrote registers`).toBeGreaterThan(10);

        // Frame 0: Furnace's export also holds the chip reset; the first tick's writes end it.
        const first = chip!.blocks[0];
        const tail = ref.frame0.slice(ref.frame0.length - first.length);
        const f0 = tail.findIndex((v, i) => v !== first[i]);
        expect(f0, f0 < 0 ? '' : `${kind} first tick, write ${f0 >> 1} of ${first.length / 2}: Furnace ${hex(tail, f0 & ~1)}, ours ${hex(first, f0 & ~1)}`).toBe(-1);

        // Every write after the first tick, in order (render-block grouping aside).
        const ours = chip!.blocks.slice(1).flat();
        expect(ours.length, `${kind} rendered past the fixture`).toBeGreaterThanOrEqual(ref.writes.length);
        let at = -1;
        for (let i = 0; i < ref.writes.length; i += 2) {
          if (ours[i] !== ref.writes[i] || ours[i + 1] !== ref.writes[i + 1]) { at = i; break; }
        }
        expect(at, at < 0 ? '' : `${kind} write ${at / 2}: Furnace ${hex(ref.writes, at)}, ours ${hex(ours, at)}`
          + ` (Furnace next: ${[2, 4, 6].map((k) => hex(ref.writes, at + k)).join(' ')})`).toBe(-1);
      }

      // Level: the engine output within 1.5 dB of Furnace's render, and clipping no more than Furnace's
      // own (a hot SN76489 song clips in Furnace as well); an over-unity regression fails here.
      const n = fx.seconds * 48000;
      const lv = level(L.subarray(0, n), R.subarray(0, n));
      expect(Math.abs(lv.rmsDb - fx.reference.rmsDb), `RMS ${lv.rmsDb.toFixed(1)} dB vs Furnace ${fx.reference.rmsDb} dB`).toBeLessThan(1.5);
      expect(lv.clipped, `clipped samples vs Furnace ${fx.reference.clipped}`).toBeLessThanOrEqual(Math.max(20, fx.reference.clipped * 3));
    }, 120000);
  }
});
