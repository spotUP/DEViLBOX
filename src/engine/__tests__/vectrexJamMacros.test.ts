/**
 * The AY-3-8910 Jam, played through the real dispatch worklet + WASM, writes noise (reg 6, reg 7
 * noise-enable bits) and more than the pattern volumes (reg 8-10): the instrument macros reach
 * the chip. Guards the Vectrex cartridge capture (the demo cart played flat and beepy).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { buildVectrexCartridge, decodeVectrexStream } from '@/lib/export/vectrex/vectrexCartridge';
import { cutToFrames, orderPassLength } from '@/lib/export/vectrex/vectrexCapture';
import { buildTortureSong } from '@/lib/export/vectrex/vectrexTortureSong';
import { FurnaceChipType } from '../chips/FurnaceChipEngine';
import { describe, it, expect, beforeAll } from 'vitest';
import { startWorklet, stereoOutputs, loadSharedWorkletScripts, songBuffer } from './workletHarness';
import { parseFurnaceFile } from '@/lib/import/parsers/FurnaceToSong';
import { installFurnaceFileOpsWasm } from '@/lib/import/__tests__/furnaceFileOpsWasmHarness';
import { exportFurnaceAyScramble } from '@/lib/export/FurnaceExporter';
import { FurnaceDispatchEngine } from '../furnace-dispatch/FurnaceDispatchEngine';

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

const SONG = 'public/data/songs/furnace/ay8910/AY-3-8910_Jam.fur';
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

async function jamWrites(scrambled: boolean): Promise<number[][]> {
    let song = await parseFurnaceFile(songBuffer(SONG), 'AY-3-8910_Jam.fur');
    if (scrambled) {
      const r = exportFurnaceAyScramble(song as never, 'vectrex');
      song = await parseFurnaceFile(r.bytes.slice().buffer, 'jam-scramble.fur');
    }
    return playWrites(song, 20);
}

/** Play a parsed song through the dispatch worklet for `seconds`; returns [register, value, 128-sample block index]. */
async function playWrites(song: Awaited<ReturnType<typeof parseFurnaceFile>>, seconds: number): Promise<number[][]> {
    const proc = worklet.proc as unknown as Proc;
    const eng = FurnaceDispatchEngine.getInstance() as unknown as Eng;
    for (const pt of [...eng.chips.keys()]) eng.destroyChip(pt);
    const r = await eng.startWithCoordinator({ dispatchEnginePosition() {} }, {
      song, synthBus: null, isStillCurrent: () => true, initialSongPos: 0, initialPattPos: 0,
    });
    expect(r.started).toBe(true);
    const handle = [...proc.chips.values()][0]?.handle;
    expect(handle).toBeGreaterThan(0);
    const MAX = 8192;
    const out = proc.module._malloc(MAX * 8);
    proc.module._furnace_dispatch_reg_dump(handle, 1);
    const outs = stereoOutputs(37);
    const w: number[][] = [];
    for (let b = 0; b < (48000 * seconds) / 128; b++) {
      proc.process([], outs);
      const n = proc.module._furnace_dispatch_reg_writes(handle, out, MAX);
      if (n <= 0) continue;
      const a = new Int32Array(proc.getHeapBuffer(), out, n * 2);
      for (let j = 0; j < n; j++) w.push([a[2 * j], a[2 * j + 1], b]);
    }
    proc.module._furnace_dispatch_reg_dump(handle, 0);
    proc.module._free(out);
    proc.drainCmdLog();
    eng.seqStop();
    return w;
}

function stats(w: number[][]) {
    const reg6 = w.filter(([a]) => a === 6).length;
    const noiseOn = w.filter(([a, v]) => a === 7 && (v & 0x38) !== 0x38).length;
    const vols = new Set(w.filter(([a]) => a >= 8 && a <= 10).map(([, v]) => v));
    return { total: w.length, reg6, noiseOn, vols: [...vols].sort((x, y) => x - y), reg11to13: w.filter(([a]) => a >= 11 && a <= 13).length };
}

describe('AY-3-8910 Jam register stream', () => {
  for (const scrambled of [false, true]) {
    it(`writes noise and varied volumes (${scrambled ? 'Vectrex scramble' : 'original'})`, async () => {
      const s = stats(await jamWrites(scrambled));
      expect(s.reg6).toBeGreaterThan(0);
      expect(s.noiseOn).toBeGreaterThan(0);
      expect(s.vols.length).toBeGreaterThan(5);
      expect(s.reg11to13).toBeGreaterThan(0);
    }, 120000);
  }
});

describe('shipped Vectrex Jam cartridge', () => {
  it('carries the instrument macros and covers the whole order list', () => {
    const bin = readFileSync('public/vectrex/demo-ay8910-jam.bin');
    const frames = decodeVectrexStream(new Uint8Array(bin.subarray(174)));
    const w = frames.flatMap((f) => [...f]);
    expect(w.filter(([r]) => r === 6).length).toBeGreaterThan(0);
    expect(w.filter(([r, v]) => r === 7 && (v & 0x38) !== 0x38).length).toBeGreaterThan(0);
    expect(new Set(w.filter(([r]) => r >= 8 && r <= 10).map(([, v]) => v)).size).toBeGreaterThan(5);
    expect(frames.length).toBeGreaterThan(5300);
  });
});

const TORTURE_CART = 'public/vectrex/demo-ay8910-torture.bin';

/** Register write counts (0-13), envelope shapes, mixer values and noise periods in a list of [register, value] writes. */
function coverage(w: ReadonlyArray<readonly number[]>) {
  const writes = Array.from({ length: 14 }, (_, r) => w.filter(([a]) => a === r).length);
  const set = (reg: number) => [...new Set(w.filter(([a]) => a === reg).map(([, v]) => v))].sort((x, y) => x - y);
  return { writes, shapes: set(13).map((v) => v & 15), mixer: set(7).map((v) => v & 0x3F), noise: set(6) };
}

describe('Vectrex orderPassLength', () => {
  const cell = (effTyp = 0, eff = 0) => ({ effTyp, eff });
  const pat = (rows: Array<ReturnType<typeof cell>>) => ({ length: rows.length, channels: [{ rows }] }) as never;
  it('follows speed, tempo and pattern break', () => {
    const plain = pat([cell(), cell(), cell(), cell()]);
    expect(orderPassLength([plain], [0, 0], 6)).toEqual({ rows: 8, frames: 48 });
    const fast = pat([cell(0x0F, 3), cell(), cell(), cell()]);
    expect(orderPassLength([fast, plain], [0, 1], 6)).toEqual({ rows: 8, frames: 12 + 12 });
    const slow = pat([cell(0xF0, 100), cell(), cell(), cell()]);   // 100 BPM = 40 Hz: 6 ticks last 7.5 frames
    expect(orderPassLength([slow], [0], 6)).toEqual({ rows: 4, frames: 30 });
    const brk = pat([cell(), cell(0x0D, 0), cell(), cell()]);
    expect(orderPassLength([brk], [0], 6)).toEqual({ rows: 2, frames: 12 });
  });
});

describe.runIf(process.env.VECTREX_TORTURE_BUILD)('build Vectrex torture cartridge', () => {
  it('exports, plays through Furnace WASM, writes the .fur and the cartridge', async () => {
    const tune = buildTortureSong();
    const pass = orderPassLength(tune.patterns, tune.songPositions, tune.initialSpeed);
    const r = exportFurnaceAyScramble(tune, 'vectrex');
    writeFileSync('public/data/songs/furnace/ay8910/Vectrex_Torture.fur', r.bytes);
    const song = await parseFurnaceFile(r.bytes.slice().buffer, 'Vectrex_Torture.fur');
    const w = await playWrites(song, pass.frames / 50 + 1);
    const log = w.map(([port, data, b]) => ({ timestamp: b * 128, chipType: FurnaceChipType.AY, port, data }));
    const cut = cutToFrames(log, pass.frames, 48000);
    const meta = JSON.parse(readFileSync('public/vectrex/player.json', 'utf8'));
    const cart = buildVectrexCartridge(cut, 48000, { ...meta, bytes: new Uint8Array(readFileSync('public/vectrex/player.bin')) }, 'AY TORTURE TEST');
    writeFileSync(TORTURE_CART, cart.bin);
    const out = process.env.VECTREX_TORTURE_BUILD as string;
    writeFileSync(out, JSON.stringify({ warnings: r.warnings, pass, cart: { size: cart.bin.length, frames: cart.frames, dataBytes: cart.dataBytes, seconds: cart.seconds }, captured: coverage(cut.map((x) => [x.port, x.data])), capturedWrites: cut.length }, null, 1));
    expect(cart.frames).toBeGreaterThan(1000);
  }, 300000);
});

describe('shipped Vectrex torture cartridge', () => {
  it('writes every AY register 0-13, all 16 envelope shapes and every mixer state', () => {
    const bin = readFileSync(TORTURE_CART);
    const frames = decodeVectrexStream(new Uint8Array(bin.subarray(174)));
    const c = coverage(frames.flatMap((f) => [...f]));
    c.writes.forEach((n, reg) => { expect(n, `register ${reg} written`).toBeGreaterThan(0); });
    expect(c.shapes).toEqual(Array.from({ length: 16 }, (_, i) => i));
    const mixes = new Set(c.mixer.map((m) => `${m & 7}/${(m >> 3) & 7}`));
    expect(mixes.size).toBeGreaterThanOrEqual(4);   // tone only, noise only, both, off
    expect(c.noise.length).toBeGreaterThan(8);
    expect(frames.length).toBeGreaterThan(1500);
  });
});
