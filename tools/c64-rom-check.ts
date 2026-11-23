// Headless check, C64 route: .fur -> furnaceToGoatTracker -> GTUltra relocator -> buildC64Prg (.prg) -> VICE x64sc (-sounddev dump logs every
// SID write with its cycle delta) -> per 50 Hz frame SID state, compared with the Furnace dispatch reference (furnace_dispatch_reg_writes,
// captured by src/engine/__tests__/c64SidReference.capture.test.ts; the Furnace CLI -vgmout has no SID command).
// Usage: nice -n 19 npx tsx --tsconfig tsconfig.app.json tools/c64-rom-check.ts [--only <name>] [--failed] [--seconds N] [--keep <dir>] [--dump <states.json>]
// Songs: every .fur under public/data/songs/furnace whose only chip is one SID. Results: test-data/c64-rom-check.json (skips recorded input hashes).
// Per frame and voice: sounding = gate bit set with a waveform selected. Both sides start at their own first sounding frame.
// Per voice: keyOn = share of Furnace gate-on edges with a .prg gate-on edge on that voice within 2 frames. pitch = share of frames where both
// sides sound with the frequency registers within 50 cents. volume = same frames, sustain nibble, master volume and $D417 filter routing bit equal.
// A voice passes when keyOn and pitch are both at least 90 %, or when neither side sounds on it; pass = every voice passes.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseFurnaceSong } from '../src/lib/import/formats/FurnaceSongParser';
import { furnaceSidNtsc } from '../src/lib/export/c64/goatSong';
import { c64CpuClock } from '../src/lib/export/c64/c64Prg';

const ROOT = path.resolve(import.meta.dirname, '..');
const SONGS = path.join(ROOT, 'public/data/songs/furnace');
const RESULTS = path.join(ROOT, 'test-data/c64-rom-check.json');
const VICE = process.env.X64SC ?? '/opt/homebrew/bin/x64sc';
const SID_SYSTEMS = new Set([0x47, 0x07]); // C64 8580, C64 6581

interface Voice { pass: boolean; prgStarts: number; furnaceStarts: number; keyOn: number; pitch: number; volume: number }
interface Verdict { inputHash: string; file: string; pass: boolean; seconds: number; prgBytes?: number; voices?: Voice[]; error?: string }
type St = { on: boolean; freq: number; sus: number; vol: number; filt: number };

const args = process.argv.slice(2);
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const only = opt('--only'), keep = opt('--keep'), failedOnly = args.includes('--failed');
const SECONDS = Number(opt('--seconds') ?? 10), FRAMES = SECONDS * 50;

/** VICE dump lines: "<cycles since previous write> <register> <value>" -> registers at the end of each 1/50 s, on a PAL or NTSC machine. */
function viceFrames(prg: string, dir: string, ntsc: boolean): number[][] {
  const cpu = c64CpuClock(ntsc), frame = cpu / 50;
  const dump = path.join(dir, 'sid.dump');
  // Boot (autostart types RUN) takes about 3 s of emulated time; run long enough to cover it and FRAMES after the first note.
  const cycles = Math.round((SECONDS + 8) * cpu);
  try {
    execFileSync(VICE, ['-default', ntsc ? '-ntsc' : '-pal', '-console', '-silent', '-warp', '-sounddev', 'dump', '-soundarg', dump, '-autostartprgmode', '1', '-limitcycles', String(cycles), '-autostart', prg],
      { stdio: 'ignore', timeout: 120000, cwd: dir });
  } catch { /* -limitcycles ends VICE with exit 1 */ }
  if (!existsSync(dump)) throw new Error('VICE wrote no SID dump');
  const reg = new Array<number>(25).fill(0), frames: number[][] = [];
  let cyc = 0;
  for (const line of readFileSync(dump, 'utf8').split('\n')) {
    const [d, r, v] = line.trim().split(/\s+/).map(Number);
    if (!Number.isFinite(v)) continue;
    cyc += d;
    while ((frames.length + 1) * frame <= cyc) frames.push([...reg]);
    if (r < 25) reg[r] = v;
  }
  frames.push([...reg]);
  return frames;
}

/** Furnace reference: one vitest run of the capture test, 2 workers max at nice 19. */
function furnaceFrames(rel: string, dir: string): number[][] {
  const out = path.join(dir, 'ref.json');
  execFileSync('nice', ['-n', '19', 'npx', 'vitest', 'run', 'src/engine/__tests__/c64SidReference.capture.test.ts', '--maxWorkers=1'],
    { cwd: ROOT, stdio: 'ignore', timeout: 600000, env: { ...process.env, C64_REF_SONG: rel, C64_REF_OUT: out, C64_REF_FRAMES: String(FRAMES + 500) } });
  return (JSON.parse(readFileSync(out, 'utf8')) as { frames: number[][] }).frames;
}

function states(frames: number[][]): St[][] {
  const all = frames.map((r) => [0, 1, 2].map((v) => {
    const b = v * 7, ctl = r[b + 4];
    return { on: (ctl & 1) === 1 && (ctl & 0xf0) !== 0, freq: r[b] | (r[b + 1] << 8), sus: r[b + 6] >> 4, vol: r[24] & 15, filt: (r[23] >> v) & 1 };
  }));
  const first = all.findIndex((s) => s.some((c) => c.on));
  return first < 0 ? [] : all.slice(first, first + FRAMES);
}

const starts = (s: St[][]) => s.flatMap((row, t) => row.flatMap((c, ch) => (c.on && !s[t - 1]?.[ch].on ? [{ t, ch }] : [])));
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.fur') ? [p] : []; });
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 10000) / 100 : 0);

mkdirSync(path.dirname(RESULTS), { recursive: true });
const results: Record<string, Verdict> = existsSync(RESULTS) ? JSON.parse(readFileSync(RESULTS, 'utf8')) : {};
const toolHash = createHash('sha1').update(readFileSync(import.meta.filename)).update(readFileSync(path.join(ROOT, 'public/gtultra/GTUltra.wasm')))
  .update(readFileSync(path.join(ROOT, 'src/lib/export/c64/goatSong.ts'))).update(readFileSync(path.join(ROOT, 'src/lib/export/c64/c64Prg.ts'))).digest('hex');
if (!existsSync(VICE)) throw new Error(`VICE x64sc not found at ${VICE}`);
for (const file of walk(SONGS)) {
  const name = path.basename(file, '.fur');
  if (only && name !== only) continue;
  if (failedOnly && results[name]?.pass !== false) continue;
  const fur = readFileSync(file);
  const inputHash = createHash('sha1').update(fur).update(toolHash).update(String(SECONDS)).digest('hex');
  if (!only && !failedOnly && results[name]?.inputHash === inputHash) { console.log(`[SKIP] ${name}`); continue; }
  let m;
  try { m = await parseFurnaceSong(fur.buffer.slice(fur.byteOffset, fur.byteOffset + fur.length) as ArrayBuffer); } catch { continue; }
  if (m.systems.length !== 1 || !SID_SYSTEMS.has(m.systems[0])) continue;
  const rel = path.relative(SONGS, file);
  const dir = mkdtempSync(path.join(tmpdir(), 'c64rom-'));
  let v: Verdict;
  try {
    const prg = path.join(dir, 'song.prg');
    execFileSync('npx', ['tsx', '--tsconfig', 'tsconfig.app.json', 'tools/c64-rom-save.ts', rel, prg], { cwd: ROOT, stdio: 'ignore', timeout: 120000 });
    if (keep) copyFileSync(prg, path.join(keep, `${name}.prg`));
    const got = states(viceFrames(prg, dir, furnaceSidNtsc(m))), want = states(furnaceFrames(rel, dir));
    if (opt('--dump')) writeFileSync(opt('--dump')!, JSON.stringify({ got, want }));
    const romStarts = starts(got), wantStarts = starts(want).filter((w) => w.t < FRAMES - 50);
    const voices = [0, 1, 2].map((ch): Voice => {
      const ws = wantStarts.filter((w) => w.ch === ch), rs = romStarts.filter((g) => g.ch === ch);
      const hit = ws.filter((w) => rs.some((g) => Math.abs(g.t - w.t) <= 2)).length;
      let tone = 0, inTune = 0, volOk = 0;
      for (let t = 0; t < Math.min(want.length, got.length); t++) {
        const a = want[t][ch], b = got[t][ch];
        if (!a.on || !b.on || !a.freq || !b.freq) continue;
        tone++;
        if (Math.abs(1200 * Math.log2(a.freq / b.freq)) < 50) inTune++;
        if (a.sus === b.sus && a.vol === b.vol && a.filt === b.filt) volOk++;
      }
      const keyOn = pct(hit, ws.length), pitch = pct(inTune, tone);
      return { pass: ws.length ? keyOn >= 90 && pitch >= 90 : rs.length === 0, prgStarts: rs.length, furnaceStarts: ws.length, keyOn, pitch, volume: pct(volOk, tone) };
    });
    v = { inputHash, file: rel, pass: romStarts.length > 0 && voices.every((x) => x.pass), seconds: SECONDS, prgBytes: statSync(prg).size, voices };
  } catch (e) {
    v = { inputHash, file: rel, pass: false, seconds: SECONDS, error: e instanceof Error ? e.message.split('\n')[0] : String(e) };
  } finally { rmSync(dir, { recursive: true, force: true }); }
  results[name] = v;
  writeFileSync(RESULTS, `${JSON.stringify(results, null, 1)}\n`);
  console.log(`[${v.pass ? 'PASS' : 'FAIL'}] ${name} ${JSON.stringify({ ...v, inputHash: undefined, file: undefined })}`);
}
