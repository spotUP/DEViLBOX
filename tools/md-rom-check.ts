// Headless check, Mega Drive MDSDRV route: .fur -> furnaceToMds -> buildMdRom -> MAME genesis (write taps on YM2612 + SN76489)
// -> compare with the Furnace CLI -vgmout register stream of the same song (both decoded by tools/md-phase0/events.py).
// Usage: nice -n 19 npx tsx --tsconfig tsconfig.app.json tools/md-rom-check.ts [--only <name>] [--failed] [--seconds N]
// Results: test-data/md-rom-check.json (skips songs whose input hash matches a recorded verdict).
// pass = the ROM wrote YM2612 key-ons in MAME. keyOnMatch = share of Furnace FM/PSG key-on/att-from-silence events (same channel) that have
// a MAME event within 30 ms (both streams start at their first FM key-on). Needs mame and the Furnace CLI (FURNACE_CLI overrides the path).
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseFurnaceSong } from '../src/lib/import/formats/FurnaceSongParser';
import { furnaceToMds } from '../src/lib/export/md/mdsSong';
import { buildMdRom } from '../src/lib/export/md/mdRom';

const ROOT = path.resolve(import.meta.dirname, '..');
const SONGS = path.join(ROOT, 'public/data/songs/furnace/genesis');
const RESULTS = path.join(ROOT, 'test-data/md-rom-check.json');
const PLAYER = readFileSync(path.join(ROOT, 'public/md/player.bin'));
const TAP = path.join(ROOT, 'tools/md-phase0/tap_pcm.lua');
const EVENTS = path.join(ROOT, 'tools/md-phase0/events.py');
const FURNACE = process.env.FURNACE_CLI ?? '/Applications/Furnace.app/Contents/MacOS/furnace';

interface Verdict { inputHash: string; pass: boolean; seconds: number; romBytes?: number; lossy?: string[]; mameKeyOns?: number; furnaceKeyOns?: number; keyOnMatch?: number; error?: string }
type Ev = { t: number; ch: string; ev: string; v: string };

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : undefined;
const failedOnly = args.includes('--failed');
const SECONDS = args.includes('--seconds') ? Number(args[args.indexOf('--seconds') + 1]) : 10;

const decode = (file: string): Ev[] =>
  execFileSync('python3', ['-I', EVENTS, file], { encoding: 'utf8', maxBuffer: 1 << 28 }).split('\n').filter(Boolean).map((l) => { const [t, ch, ev, v] = l.split(' '); return { t: Number(t), ch, ev, v }; });
/** Note starts: FM key-on, PSG attenuation leaving 15 (silence). */
const starts = (e: Ev[]): Ev[] => { const last: Record<string, number> = {}; return e.filter((x) => { if (x.ev === 'KEYON') return true; if (x.ev !== 'ATT') return false; const was = last[x.ch] ?? 15; last[x.ch] = Number(x.v); return was === 15 && Number(x.v) < 15; }); };

function runMame(rom: Uint8Array, dir: string, seconds: number): Ev[] {
  writeFileSync(path.join(dir, 'p.rom'), rom);
  execFileSync('mame', ['genesis', '-cart', path.join(dir, 'p.rom'), '-video', 'none', '-sound', 'none', '-nothrottle', '-seconds_to_run', String(seconds), '-autoboot_script', TAP, '-cfg_directory', path.join(dir, 'cfg'), '-nvram_directory', path.join(dir, 'nv'), '-skip_gameinfo'],
    { env: { ...process.env, TAPOUT: path.join(dir, 'raw') }, stdio: 'ignore', timeout: (seconds + 60) * 1000 });
  const lines = readFileSync(path.join(dir, 'raw'), 'utf8').split('\n');
  writeFileSync(path.join(dir, 'tap'), lines.filter((l) => !/ [PQ] /.test(l)).join('\n'));
  return decode(path.join(dir, 'tap'));
}

const results: Record<string, Verdict> = existsSync(RESULTS) ? JSON.parse(readFileSync(RESULTS, 'utf8')) : {};
const names = readdirSync(SONGS).filter((f) => f.endsWith('.fur')).map((f) => f.slice(0, -4)).filter((n) => !only || n === only).filter((n) => !failedOnly || results[n]?.pass === false);
const toolHash = createHash('sha1').update(PLAYER).update(readFileSync(path.join(ROOT, 'src/lib/export/md/mdsSong.ts'))).update(readFileSync(path.join(ROOT, 'src/lib/export/md/mdRom.ts'))).digest('hex');
for (const name of names) {
  const fur = readFileSync(path.join(SONGS, `${name}.fur`));
  const inputHash = createHash('sha1').update(fur).update(toolHash).update(String(SECONDS)).digest('hex');
  if (!only && !failedOnly && results[name]?.inputHash === inputHash) { console.log(`[SKIP] ${name}`); continue; }
  const dir = mkdtempSync(path.join(tmpdir(), 'mdrom-'));
  let v: Verdict;
  try {
    const m = await parseFurnaceSong(fur.buffer.slice(fur.byteOffset, fur.byteOffset + fur.length));
    const song = furnaceToMds(m);
    const rom = buildMdRom(PLAYER, song.seq, song.pcm);
    const all = starts(runMame(rom, dir, SECONDS));
    const got = all.filter((e) => e.ev === 'KEYON');
    v = { inputHash, pass: got.length > 0, seconds: SECONDS, romBytes: rom.length, lossy: song.lossy, mameKeyOns: got.length };
    if (existsSync(FURNACE)) {
      execFileSync(FURNACE, ['-console', '-nostatus', '-nocontrols', '-noreport', '-loglevel', 'error', '-loops', '0', '-vgmout', path.join(dir, 'f.vgm'), path.join(SONGS, `${name}.fur`)], { stdio: 'ignore', timeout: 120000 });
      const want = starts(decode(path.join(dir, 'f.vgm'))).filter((e) => e.t < SECONDS - 1);
      const hit = want.filter((w) => all.some((g) => g.ch === w.ch && Math.abs(g.t - w.t) < 0.03)).length;
      if (process.env.MD_DIAG_CH) { const f = (e: Ev[], w: string) => e.filter((x) => x.ch === process.env.MD_DIAG_CH && x.ev !== 'FREQ' && x.t < 1.5).map((x) => `${x.t.toFixed(3)}:${x.ev}:${x.v}`).join(' '); console.log(`[EV-F] ${f(decode(path.join(dir, 'f.vgm')), 'f')}`); console.log(`[EV-M] ${f(all, 'm')}`); }
      if (process.env.MD_DIAG) for (const w of want) if (!all.some((g) => g.ch === w.ch && Math.abs(g.t - w.t) < 0.03)) console.log(`[MISS] ${name} ${w.ch} ${w.t.toFixed(3)} ${w.ev} ${w.v} nearest ${all.filter((g) => g.ch === w.ch).map((g) => g.t - w.t).sort((x, y) => Math.abs(x) - Math.abs(y))[0]?.toFixed(3) ?? 'none'}`);
      Object.assign(v, { furnaceKeyOns: want.length, keyOnMatch: want.length ? Math.round((hit / want.length) * 10000) / 100 : 0 });
    }
  } catch (e) {
    v = { inputHash, pass: false, seconds: SECONDS, error: e instanceof Error ? e.message : String(e) };
  } finally { rmSync(dir, { recursive: true, force: true }); }
  results[name] = v;
  writeFileSync(RESULTS, `${JSON.stringify(results, null, 1)}\n`);
  console.log(`[${v.pass ? 'PASS' : 'FAIL'}] ${name} ${JSON.stringify({ ...v, inputHash: undefined, lossy: v.lossy?.length })}`);
}
