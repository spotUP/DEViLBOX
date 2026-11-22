// Headless check, Game Boy hUGEDriver route: .fur -> furnaceToHuge -> buildHugeRom -> Mesen2 APU bus-write log ($FF10-$FF3F)
// -> compare with the song's Furnace GB dispatch capture (test-data/gb-captures/<name>.json, a GbCapture recorded in the browser).
// Usage: nice -n 19 npx tsx --tsconfig tsconfig.app.json tools/gb-rom-check.ts [--only <name>] [--failed] [--ticks N]
// Results: test-data/gb-rom-check.json (skips songs whose input hash matches a recorded verdict).
// hUGEDriver is lossy by design (plan B1), so the verdict reports the measured match, not 0 diffs:
//   stateMatch = share of (tick, register NR10-NR51) pairs whose value after the tick equals the capture's.
// Reference without a browser capture: the Furnace CLI's .vgm export (FURNACE_CLI, default /Applications/Furnace.app), every GB
// register write per tick. fields = per channel, ticks where the audible state differs (freq, duty, envelope latched at trigger,
// trigger, pan, wave RAM, noise mode, sweep, channel 3 volume); --trace <ch>:<from>:<to> prints both sides per tick.
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

interface Verdict { shift?: number; fields?: Record<string, number>[]; fieldFirst?: Record<string, string>[]; inputHash: string; pass: boolean; ticks: number; got: number; channels: number[]; romBytes?: number; songBytes?: number; orders?: number; lossy?: string[]; wanted?: number; diffs?: number; first?: string; stateMatch?: number; error?: string }

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : undefined;
const failedOnly = args.includes('--failed');
const saveRom = args.includes('--save-rom') ? args[args.indexOf('--save-rom') + 1] : undefined; // write each built ROM to this dir (for playing in the Mesen2 window)
const trace = args.includes('--trace') ? args[args.indexOf('--trace') + 1].split(':').map(Number) : undefined;
const FURNACE = process.env.FURNACE_CLI ?? '/Applications/Furnace.app/Contents/MacOS/furnace';
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

/** Furnace CLI .vgm export -> GB writes per tick at the song's tick rate (index 0 = before tick 0, empty). */
function vgmTicks(furPath: string, hz: number, ticks: number): BusWrite[][] {
  const dir = mkdtempSync(path.join(tmpdir(), 'gbvgm-'));
  try {
    execFileSync(FURNACE, ['-loops', '0', '-vgmout', path.join(dir, 's.vgm'), furPath], { stdio: 'ignore' });
    const d = readFileSync(path.join(dir, 's.vgm'));
    const out: BusWrite[][] = Array.from({ length: ticks + 1 }, () => []);
    let p = d.readUInt32LE(8) >= 0x150 ? 0x34 + d.readUInt32LE(0x34) : 0x40, t = 0, t0 = -1;
    while (p < d.length) {
      const c = d[p];
      if (c === 0x66) break;
      if (c === 0xb3) { // first write = tick 0; later writes land on the tick their sample time falls in
        if (t0 < 0) t0 = t;
        const k = Math.floor(((t - t0) * hz) / 44100 + 0.5);
        if (k >= ticks) break;
        out[k + 1].push([0xff10 + d[p + 1], d[p + 2]]); p += 3;
      } else if (c === 0x61) { t += d.readUInt16LE(p + 1); p += 3; }
      else if (c === 0x62) { t += 735; p++; } else if (c === 0x63) { t += 882; p++; }
      else if (c >= 0x70 && c <= 0x7f) { t += c - 0x6f; p++; }
      else if (c === 0x67) p += 7 + d.readUInt32LE(p + 3);
      else if (c >= 0x30 && c <= 0x3f) p += 2;
      else if ((c >= 0x40 && c <= 0x5f) || (c >= 0xa0 && c <= 0xbf)) p += 3;
      else if (c >= 0xc0 && c <= 0xdf) p += 4;
      else if (c >= 0xe0) p += 5;
      else throw new Error(`VGM command 0x${c.toString(16)} at ${p}`);
    }
    return out;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const CH_REGS = [[0xff10, 0xff11, 0xff12, 0xff13, 0xff14], [-1, 0xff16, 0xff17, 0xff18, 0xff19], [0xff1a, 0xff1b, 0xff1c, 0xff1d, 0xff1e], [-1, 0xff20, 0xff21, 0xff22, 0xff23]];
const FIELDS = ['trig', 'freq', 'duty', 'env', 'pan', 'wave', 'mode'] as const;
/** Audible state per channel per tick: what the APU plays, not the raw register file (NRx2 only counts when latched by a trigger). */
function audible(ticks: BusWrite[][]): Array<Array<Record<(typeof FIELDS)[number], number | string>>> {
  const reg = new Uint8Array(0x40);
  const latched = [0, 0, 0, 0];
  const out: Array<Array<Record<(typeof FIELDS)[number], number | string>>> = [[], [], [], []];
  const vol = [0, 0, 0, 0];
  for (const [a, v] of ticks[0]) reg[a - 0xff00] = v; // boot + hUGE_init (NR51 set once)
  for (let t = 1; t < ticks.length; t++) {
    const trig = [0, 0, 0, 0];
    for (const [a, v] of ticks[t]) {
      const ch2 = CH_REGS.findIndex((r) => r[2] === a);
      if (ch2 >= 0 && ch2 !== 2) { // NRx2 without trigger: "zombie mode" volume step (Furnace's soft envelope relies on it)
        const old = reg[a - 0xff00];
        if ((old & 7) === 0) vol[ch2]++; else if (!(old & 8)) vol[ch2] += 2;
        if ((old ^ v) & 8) vol[ch2] = 16 - vol[ch2];
        vol[ch2] &= 15;
      }
      reg[a - 0xff00] = v;
      const ch = CH_REGS.findIndex((r) => r[4] === a);
      if (ch >= 0 && v & 0x80) { trig[ch] = 1; latched[ch] = reg[CH_REGS[ch][2] - 0xff00]; vol[ch] = latched[ch] >> 4; }
    }
    for (let ch = 0; ch < 4; ch++) {
      const [r0, r1, , r3, r4] = CH_REGS[ch].map((a) => (a < 0 ? 0 : reg[a - 0xff00]));
      out[ch].push({
        trig: trig[ch],
        freq: ch === 3 ? reg[0x22] : r3 | ((r4 & 7) << 8),
        duty: ch < 2 ? r1 >> 6 : 0,
        env: ch === 2 ? (reg[0x1c] >> 5) & 3 : `${vol[ch]}:${latched[ch] & 15}`, // volume now : envelope dir+period
        pan: (reg[0x25] >> ch) & 0x11,
        wave: ch === 2 ? Buffer.from(reg.subarray(0x30, 0x40)).toString('hex') : 0,
        mode: ch === 0 ? r0 : ch === 2 ? reg[0x1a] >> 7 : 0,
      });
    }
  }
  return out;
}

/** Per channel per field: ticks that differ, best of a -2..+2 tick alignment (Furnace's first tick vs the ROM's first VBlank). */
function fieldDiffs(want: BusWrite[][], got: BusWrite[][]): { shift: number; fields: Record<string, number>[]; first: Record<string, string>[] } {
  const a = audible(want), b = audible(got);
  let best: { shift: number; fields: Record<string, number>[]; first: Record<string, string>[]; total: number } | undefined;
  for (let shift = -2; shift <= 2; shift++) {
    const fields: Record<string, number>[] = [], first: Record<string, string>[] = [];
    let total = 0;
    for (let ch = 0; ch < 4; ch++) {
      const f: Record<string, number> = {}, fi: Record<string, string> = {};
      const on = a[ch].findIndex((x) => x.trig); // before the reference first plays the channel nothing is audible
      for (let t = Math.max(2, on < 0 ? a[ch].length : on); t < a[ch].length - 2; t++) {
        const x = a[ch][t], y = b[ch][t + shift];
        if (!y) continue;
        for (const k of FIELDS) if (x[k] !== y[k]) { f[k] = (f[k] ?? 0) + 1; total++; fi[k] ??= `t${t} want ${x[k]} got ${y[k]}`; }
      }
      fields.push(f); first.push(fi);
    }
    if (!best || total < best.total) best = { shift, fields, first, total };
  }
  if (trace && best) {
    const [ch, from, to] = trace;
    for (let t = from; t <= to; t++) console.log(`t${t} want ${JSON.stringify(a[ch][t])}\n     got  ${JSON.stringify(b[ch][t + best.shift])}`);
  }
  return best!;
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
    const rom = buildHugeRom(PLAYER, META, song.blob, song.screen);
    if (saveRom) writeFileSync(path.join(saveRom, `${name}.gb`), rom);
    const got = runGb(rom, TICKS);
    const channels = [0, 1, 2, 3].map((ch) => got.slice(1).flat().filter(([a]) => a === [0xff14, 0xff19, 0xff1e, 0xff23][ch]).length);
    v = { inputHash, pass: got.length === TICKS + 1 && channels.some((n) => n > 0), ticks: TICKS, got: got.slice(1).flat().length, channels, romBytes: rom.length, songBytes: song.blob.length, orders: song.orders, lossy: song.lossy };
    if (capture) {
      const want = captureTicks(JSON.parse(capture.toString('utf8')) as GbCapture, TICKS);
      const d = diffWrites(want.slice(1), got.slice(1));
      Object.assign(v, { wanted: want.flat().length, diffs: d.diffs, first: d.first, stateMatch: stateMatch(want, got) });
    } else {
      const want = vgmTicks(path.join(SONGS, `${name}.fur`), m.subsongs[0].hz * (m.subsongs[0].virtualTempo / m.subsongs[0].virtualTempoD), TICKS);
      const f = fieldDiffs(want, got);
      Object.assign(v, { wanted: want.flat().length, stateMatch: stateMatch(want, got), shift: f.shift, fields: f.fields, fieldFirst: f.first });
      f.fields.forEach((x, ch) => console.log(`  ch${ch + 1} ${JSON.stringify(x)} ${JSON.stringify(f.first[ch])}`));
    }
  } catch (e) {
    v = { inputHash, pass: false, ticks: TICKS, got: 0, channels: [], error: e instanceof Error ? e.message : String(e) };
  }
  results[name] = v;
  writeFileSync(RESULTS, `${JSON.stringify(results, null, 1)}\n`);
  console.log(`${v.pass ? '[OK]' : '[FAIL]'} ${name} ticks=${v.ticks} writes=${v.got} ch=${v.channels.join('/')} song=${v.songBytes ?? '-'}B lossy=${v.lossy?.length ?? '-'}${v.stateMatch !== undefined ? ` stateMatch=${v.stateMatch}% diffs=${v.diffs}/${v.wanted}` : ' (no capture)'}${v.error ? ` error=${v.error}` : ''}`);
}
