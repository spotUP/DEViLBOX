// Headless check, Game Boy hUGEDriver route: .fur -> furnaceToHuge -> buildHugeRom -> Mesen2 APU bus-write log ($FF10-$FF3F)
// -> compare with the song's Furnace GB dispatch capture (test-data/gb-captures/<name>.json, a GbCapture recorded in the browser).
// Usage: nice -n 19 npx tsx --tsconfig tsconfig.app.json tools/gb-rom-check.ts [--only <name>] [--failed] [--ticks N]
// Results: test-data/gb-rom-check.json (skips songs whose input hash matches a recorded verdict).
// hUGEDriver is lossy by design (plan B1), so the verdict reports the measured match, not 0 diffs:
//   stateMatch = share of (tick, register NR10-NR51) pairs whose value after the tick equals the capture's.
// pass = the ROM ran the requested ticks and the driver wrote APU registers (channels = NRx4 trigger-register writes per channel;
// a 0 there can be a song that leaves the channel silent in the window, so it is reported, not failed). No capture: match fields stay empty.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseFurnaceSong } from '../src/lib/import/formats/FurnaceSongParser';
import { buildHugeRom, furnaceToHuge, type HugePlayerMeta } from '../src/lib/export/gb/hugeSong';
import type { GbCapture } from '../src/lib/export/gb/gbCapture';
import { MESEN, diffWrites, type BusWrite } from '../src/lib/export/__tests__/nesMesenHarness';

const ROOT = path.resolve(import.meta.dirname, '..');
const SONGS = path.join(ROOT, 'public/data/songs/furnace/gameboy');
const CAPTURES = path.join(ROOT, 'test-data/gb-captures');
const RESULTS = path.join(ROOT, 'test-data/gb-rom-check.json');
const PLAYER = readFileSync(path.join(ROOT, 'public/gb/huge-player.gb'));
const META: HugePlayerMeta = JSON.parse(readFileSync(path.join(ROOT, 'public/gb/huge-player.json'), 'utf8'));

interface Verdict { inputHash: string; pass: boolean; ticks: number; got: number; channels: number[]; romBytes?: number; songBytes?: number; orders?: number; lossy?: string[]; wanted?: number; diffs?: number; first?: string; stateMatch?: number; error?: string }

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : undefined;
const failedOnly = args.includes('--failed');
const TICKS = args.includes('--ticks') ? Number(args[args.indexOf('--ticks') + 1]) : 600;

/** Mesen2 headless run; returns writes bucketed per player tick (index 0 = before the first tick: boot + hUGE_init). */
function runGb(rom: Uint8Array, ticks: number): BusWrite[][] {
  const dir = mkdtempSync(path.join(tmpdir(), 'gbrom-'));
  try {
    writeFileSync(path.join(dir, 'p.gb'), rom);
    writeFileSync(path.join(dir, 'log.lua'), `local n=0
emu.addMemoryCallback(function(a,v) print(string.format("W %04X %02X",a,v&0xFF)) end, emu.callbackType.write, 0xFF10, 0xFF3F)
emu.addMemoryCallback(function() n=n+1 print("T") if n>${ticks} then print("DONE") emu.stop(0) end end, emu.callbackType.exec, ${META.tickAddress}, ${META.tickAddress})
`);
    const out = execFileSync(MESEN, ['--testRunner', `--timeout=${Math.ceil(ticks / 50) + 20}`, '--doNotSaveSettings', '--enableStdout', path.join(dir, 'log.lua'), path.join(dir, 'p.gb')], { encoding: 'utf8', maxBuffer: 1 << 28, timeout: (ticks / 50 + 60) * 1000 });
    if (!out.includes('DONE')) throw new Error('Mesen2 stopped before the requested ticks');
    const buckets: BusWrite[][] = [[]];
    for (const line of out.split('\n')) {
      if (line === 'T') buckets.push([]);
      else if (line.startsWith('W ')) buckets[buckets.length - 1].push([parseInt(line.slice(2, 6), 16), parseInt(line.slice(7, 9), 16)]);
    }
    return buckets.slice(0, ticks + 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

/** Capture events -> writes per tick (same bucket shape as runGb: index 0 = before tick 0, empty). */
function captureTicks(c: GbCapture, ticks: number): BusWrite[][] {
  const out: BusWrite[][] = Array.from({ length: ticks + 1 }, () => []);
  const t0 = c.events.find((e) => e.kind === 'write')?.sample ?? 0;
  for (const e of c.events) {
    if (e.kind !== 'write') continue;
    const t = Math.round(((e.sample - t0) * c.tickRateHz) / c.sampleRate);
    if (t < ticks) out[t + 1].push([e.addr, e.value]);
  }
  return out;
}

/** Share of (tick, NR10-NR51) register values equal after each tick (both sides start from the same zeroed file). */
function stateMatch(want: BusWrite[][], got: BusWrite[][]): number {
  const a = new Uint8Array(0x30), b = new Uint8Array(0x30);
  let same = 0, total = 0;
  for (let t = 1; t < Math.min(want.length, got.length); t++) {
    for (const [r, v] of want[t]) a[r - 0xff10] = v;
    for (const [r, v] of got[t]) b[r - 0xff10] = v;
    for (let r = 0; r <= 0x15; r++) { if (r === 0x14) continue; total++; if (a[r] === b[r]) same++; } // NR10..NR51, NR50 skipped (player constant)
  }
  return total ? Math.round((same / total) * 10000) / 100 : 0;
}

const results: Record<string, Verdict> = existsSync(RESULTS) ? JSON.parse(readFileSync(RESULTS, 'utf8')) : {};
const names = readdirSync(SONGS).filter((f) => f.endsWith('.fur')).map((f) => f.slice(0, -4)).filter((n) => !only || n === only).filter((n) => !failedOnly || results[n]?.pass === false);
const playerHash = createHash('sha1').update(PLAYER).update(readFileSync(path.join(ROOT, 'src/lib/export/gb/hugeSong.ts'))).digest('hex');
for (const name of names) {
  const fur = readFileSync(path.join(SONGS, `${name}.fur`));
  const capPath = path.join(CAPTURES, `${name}.json`);
  const capture = existsSync(capPath) ? readFileSync(capPath) : undefined;
  const inputHash = createHash('sha1').update(fur).update(capture ?? '').update(playerHash).update(String(TICKS)).digest('hex');
  if (!only && !failedOnly && results[name]?.inputHash === inputHash) { console.log(`[SKIP] ${name}`); continue; }
  let v: Verdict;
  try {
    const m = await parseFurnaceSong(fur.buffer.slice(fur.byteOffset, fur.byteOffset + fur.length));
    const song = furnaceToHuge(m);
    const rom = buildHugeRom(PLAYER, META, song.blob);
    const got = runGb(rom, TICKS);
    const channels = [0, 1, 2, 3].map((ch) => got.slice(1).flat().filter(([a]) => a === [0xff14, 0xff19, 0xff1e, 0xff23][ch]).length);
    v = { inputHash, pass: got.length === TICKS + 1 && channels.some((n) => n > 0), ticks: TICKS, got: got.slice(1).flat().length, channels, romBytes: rom.length, songBytes: song.blob.length, orders: song.orders, lossy: song.lossy };
    if (capture) {
      const want = captureTicks(JSON.parse(capture.toString('utf8')) as GbCapture, TICKS);
      const d = diffWrites(want.slice(1), got.slice(1));
      Object.assign(v, { wanted: want.flat().length, diffs: d.diffs, first: d.first, stateMatch: stateMatch(want, got) });
    }
  } catch (e) {
    v = { inputHash, pass: false, ticks: TICKS, got: 0, channels: [], error: e instanceof Error ? e.message : String(e) };
  }
  results[name] = v;
  writeFileSync(RESULTS, `${JSON.stringify(results, null, 1)}\n`);
  console.log(`${v.pass ? '[OK]' : '[FAIL]'} ${name} ticks=${v.ticks} writes=${v.got} ch=${v.channels.join('/')} song=${v.songBytes ?? '-'}B lossy=${v.lossy?.length ?? '-'}${v.stateMatch !== undefined ? ` stateMatch=${v.stateMatch}% diffs=${v.diffs}/${v.wanted}` : ' (no capture)'}${v.error ? ` error=${v.error}` : ''}`);
}
