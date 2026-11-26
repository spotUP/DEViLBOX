// Headless check, Mega Drive MDSDRV route: .fur -> furnaceToMds -> buildMdRom -> MAME genesis (write taps on YM2612 + SN76489)
// -> compare with the Furnace CLI -vgmout register stream of the same song (both decoded by tools/md-phase0/events.py).
// Usage: nice -n 19 npx tsx --tsconfig tsconfig.app.json tools/md-rom-check.ts [--only <name>] [--failed] [--seconds N]
// Results: test-data/md-rom-check.json (skips songs whose input hash matches a recorded verdict).
// pass = the ROM wrote YM2612 key-ons in MAME. keyOnMatch = matched FM/PSG key-on/att-from-silence starts and DAC sample starts (PCM1+PCM2 as one DAC channel) (same channel,
// within 30 ms, counted both ways) / max(Furnace starts, MAME starts), so missing and extra starts both lower it (both streams start at their first FM key-on). Needs mame and the Furnace CLI (FURNACE_CLI overrides the path).
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
const PLAYER = readFileSync(process.env.MD_PLAYER ?? path.join(ROOT, 'public/md/player.bin')); // MD_PLAYER: bisect a driver build
const TAP = path.join(ROOT, 'tools/md-phase0/tap_pcm.lua');
const EVENTS = path.join(ROOT, 'tools/md-phase0/events.py');
const FURNACE = process.env.FURNACE_CLI ?? '/Applications/Furnace.app/Contents/MacOS/furnace';

interface Verdict { inputHash: string; pass: boolean; seconds: number; romBytes?: number; lossy?: string[]; mameKeyOns?: number; mameStarts?: number; furnaceKeyOns?: number; keyOnMatch?: number; error?: string }
type Ev = { t: number; ch: string; ev: string; v: string };

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : undefined;
const failedOnly = args.includes('--failed');
const SECONDS = args.includes('--seconds') ? Number(args[args.indexOf('--seconds') + 1]) : 10;

const decode = (file: string): Ev[] =>
  execFileSync('python3', ['-I', EVENTS, file, '--pcm'], { encoding: 'utf8', maxBuffer: 1 << 28 }).split('\n').filter(Boolean).map((l) => { const [t, ch, ev, v] = l.split(' '); return { t: Number(t), ch, ev, v }; });
/** Note starts: FM key-on, PSG attenuation leaving 15 (silence). */
const starts = (e: Ev[]): Ev[] => { const last: Record<string, number> = {}; return e.filter((x) => { if (x.ev === 'KEYON') return true; if (x.ev !== 'ATT') return false; const was = last[x.ch] ?? 15; last[x.ch] = Number(x.v); return was === 15 && Number(x.v) < 15; }); };

function runMame(rom: Uint8Array, dir: string, seconds: number): Ev[] {
  writeFileSync(path.join(dir, 'p.rom'), rom);
  execFileSync('mame', ['genesis', '-cart', path.join(dir, 'p.rom'), '-video', 'none', '-sound', 'none', '-nothrottle', '-seconds_to_run', String(seconds), '-autoboot_script', TAP, '-cfg_directory', path.join(dir, 'cfg'), '-nvram_directory', path.join(dir, 'nv'), '-skip_gameinfo'],
    { env: { ...process.env, TAPOUT: path.join(dir, 'raw') }, stdio: 'ignore', timeout: (seconds + 60) * 1000 });
  const lines = readFileSync(path.join(dir, 'raw'), 'utf8').split('\n');
  writeFileSync(path.join(dir, 'tap'), lines.filter((l) => !/ P /.test(l)).join('\n')); // Q = 68k PCM mailbox writes: DAC starts
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
    // events.py shifts MAME time to the first FM key-on (~1.06 s of boot), so MAME runs 2 s past the window: a start near the
    // window end was cut on the ROM side only (MegadriveOverdrive 8.933 s miss moved to 10.933 s with --seconds 12).
    const raw = runMame(rom, dir, SECONDS + 2), all = starts(raw);
    const got = all.filter((e) => e.ev === 'KEYON' && e.ch !== 'DAC');
    v = { inputHash, pass: got.length > 0, seconds: SECONDS, romBytes: rom.length, lossy: song.lossy, mameKeyOns: got.length };
    if (existsSync(FURNACE)) try {
      execFileSync(FURNACE, ['-console', '-nostatus', '-nocontrols', '-noreport', '-loglevel', 'error', '-loops', '0', '-vgmout', path.join(dir, 'f.vgm'), path.join(SONGS, `${name}.fur`)], { stdio: 'ignore', timeout: 120000 });
      const ref = starts(decode(path.join(dir, 'f.vgm'))), want = ref.filter((e) => e.t < SECONDS - 1);
      const have = all.filter((e) => e.t < SECONDS - 1); // same window as want; edge partners are found in the other side's unclipped list
      const near = (a: Ev, b: Ev[]) => b.some((x) => x.ch === a.ch && Math.abs(x.t - a.t) < 0.03);
      // Symmetric: missing (Furnace start with no MAME start) and extra (MAME start with no Furnace start) both lower the score.
      // A pair split by the window edge (one start just inside, its partner just past it) is dropped from both sides, so it is neither a
      // miss nor an extra (Ruby 8.97-9.0 s, newer_song_lol); min() still stops two starts sharing one partner from both counting.
      const w2 = want.filter((w) => near(w, have) || !near(w, all)), h2 = have.filter((g) => near(g, want) || !near(g, ref));
      const hit = Math.min(w2.filter((w) => near(w, have)).length, h2.filter((g) => near(g, want)).length);
      if (process.env.MD_DIAG_CH) { const f = (e: Ev[]) => e.filter((x) => x.ch === process.env.MD_DIAG_CH && x.ev !== 'FREQ' && x.t >= Number(process.env.MD_DIAG_T0 ?? 0) && x.t < Number(process.env.MD_DIAG_T1 ?? 1.5)).map((x) => `${x.t.toFixed(3)}:${x.ev}:${x.v}`).join(' '); console.log(`[EV-F] ${f(decode(path.join(dir, 'f.vgm')))}`); console.log(`[EV-M] ${f(raw)}`); }
      if (process.env.MD_DIAG) for (const w of want) if (!all.some((g) => g.ch === w.ch && Math.abs(g.t - w.t) < 0.03)) console.log(`[MISS] ${name} ${w.ch} ${w.t.toFixed(3)} ${w.ev} ${w.v} nearest ${all.filter((g) => g.ch === w.ch).map((g) => g.t - w.t).sort((x, y) => Math.abs(x) - Math.abs(y))[0]?.toFixed(3) ?? 'none'}`);
      if (process.env.MD_DIAG) for (const g of have) if (!near(g, ref)) console.log(`[EXTRA] ${name} ${g.ch} ${g.t.toFixed(3)} ${g.ev} ${g.v}`);
      const denom = Math.max(w2.length, h2.length);
      Object.assign(v, { furnaceKeyOns: w2.length, mameStarts: h2.length, keyOnMatch: denom ? Math.round((hit / denom) * 10000) / 100 : 0 });
    } catch (e) {
      // The ROM ran; only the reference is missing (e.g. the Furnace CLI is older than the .fur format version): keep the ROM verdict.
      v.error = `no reference: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`;
    }
  } catch (e) {
    v = { inputHash, pass: false, seconds: SECONDS, error: e instanceof Error ? e.message : String(e) };
  } finally { rmSync(dir, { recursive: true, force: true }); }
  results[name] = v;
  writeFileSync(RESULTS, `${JSON.stringify(results, null, 1)}\n`);
  console.log(`[${v.pass ? 'PASS' : 'FAIL'}] ${name} ${JSON.stringify({ ...v, inputHash: undefined, lossy: v.lossy?.length })}`);
}
