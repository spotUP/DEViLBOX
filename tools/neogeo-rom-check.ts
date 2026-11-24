// Headless check, Neo Geo route as ~/Code/ArcadeGame builds it: .fur -> furtool.py/nsstool (ngdevkit) -> nullsound Z80 driver (M1) + V ROM
// -> MAME neogeo (write tap on the YM2610 io ports, tools/neogeo-rom-check.lua) vs the Furnace CLI -vgmout stream of the same .fur.
// Usage: nice -n 19 npx tsx --tsconfig tsconfig.app.json tools/neogeo-rom-check.ts [--only <name>] [--failed] [--seconds N] [--detail]
// Songs: the YM2610 .fur under public/data/songs/furnace plus the Neo Geo songs of tools/neogeo-compose (built through its run.ts).
// Pipeline = the game's own: a copy of ~/Code/ArcadeGame (ARCADEGAME overrides) with its music-map.yaml pointing at the song, built with its
// Makefile rules (patched SSG noise lib + nullsound.lib), the game's 68k ROM unchanged. The game sends its title-music command (id 4 = the song)
// at boot; commands the Z80 acked are recorded in the verdict. Scoring: key-on (FM key-on, SSG volume 0 -> on, ADPCM-A/B start) within 30 ms of
// Furnace's, same channel; pitch = Hz at key-on within 50 cents (FM, SSG, ADPCM-B rate). Both streams start at their own first key-on.
// Results: test-data/neogeo-rom-check.json (resumable; skips songs whose input hash matches). Needs mame, ngdevkit, the Furnace CLI.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const RESULTS = path.join(ROOT, 'test-data/neogeo-rom-check.json');
const TAP = path.join(ROOT, 'tools/neogeo-rom-check.lua');
const AG = process.env.ARCADEGAME ?? path.join(homedir(), 'Code/ArcadeGame');
const FURNACE = process.env.FURNACE_CLI ?? '/Applications/Furnace.app/Contents/MacOS/furnace';
const HARNESS = path.join(tmpdir(), 'neogeo-rom-check-harness');
const MVS_CLK = 8_000_000;
const SONGS: { name: string; fur?: string; compose?: string }[] = [
  { name: 'Inner Machinations YM2610B', fur: path.join(ROOT, 'public/data/songs/furnace/misc/Inner Machinations YM2610B.fur') },
  ...['gumbirds-title', 'gumbirds-arena', 'gumbirds-game-over', 'gumbirds-round-clear'].map((n) => ({ name: n, compose: n })),
];

interface Verdict { inputHash: string; pass: boolean; seconds: number; stage?: string; error?: string; commands?: string[]; mameStarts?: number; furnaceStarts?: number; keyOnMatch?: number; pitchMatch?: number; byChannel?: Record<string, string>; lint?: string[] }
type Start = { t: number; ch: string; hz: number };
type W = { t: number; port: number; reg: number; val: number };

const args = process.argv.slice(2);
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const only = opt('--only');
const failedOnly = args.includes('--failed');
const detail = args.includes('--detail');
const SECONDS = Number(opt('--seconds') ?? 20);

/** Decode YM2610 register writes (port 0 = A, 1 = B) to key-on starts with the channel's Hz at key-on (freq written within 8 ms after counts). */
function starts(w: W[], clk: number): Start[] {
  const fnum: Record<string, number> = {}, hi: Record<string, number> = {}, vol: Record<string, number> = {}, per: Record<string, number> = {};
  const out: (Start & { fix?: () => void })[] = [];
  const hzOf: Record<string, () => number> = {};
  let dn = 0;
  const fm = (ch: string) => () => { const v = fnum[ch] ?? 0; return ((v & 0x7ff) * (clk / 144)) / 2 ** (21 - ((v >> 11) & 7)); };
  const ssg = (n: number) => () => (per[`S${n}`] ? clk / 4 / 16 / per[`S${n}`] : 0);
  for (const c of ['F1', 'F2', 'F3', 'F4']) hzOf[c] = fm(c);
  for (let n = 0; n < 3; n++) hzOf[`S${n + 1}`] = ssg(n + 1);
  hzOf.B = () => (clk / 144) * (dn / 65536);
  const pend: { s: Start; ch: string }[] = [];
  const settle = (t: number) => { for (let i = pend.length - 1; i >= 0; i--) if (t - pend[i].s.t > 0.008) { pend[i].s.hz = hzOf[pend[i].ch](); pend.splice(i, 1); } };
  const on = (t: number, ch: string) => { const s = { t, ch, hz: hzOf[ch]?.() ?? 0 }; out.push(s); if (hzOf[ch]) pend.push({ s, ch }); };
  const latchA: Record<number, number> = {};
  const fmCh = (port: number, reg: number) => (reg & 3) === 0 || (reg & 3) === 3 ? undefined : `F${port * 2 + (reg & 3)}`;
  for (const x of w) {
    settle(x.t);
    const { port, reg, val, t } = x;
    if (port === 0 && reg === 0x28) {
      const c = val & 7; const idx = c === 1 ? 'F1' : c === 2 ? 'F2' : c === 5 ? 'F3' : c === 6 ? 'F4' : undefined;
      if (idx && val >> 4) on(t, idx);
    } else if (reg >= 0xa4 && reg <= 0xa6) { const c = fmCh(port, reg); if (c) hi[c] = val & 0x3f; }
    else if (reg >= 0xa0 && reg <= 0xa2) { const c = fmCh(port, reg); if (c) fnum[c] = ((hi[c] ?? 0) << 8) | val; }
    else if (port === 0 && reg < 6) { const n = (reg >> 1) + 1; const k = `S${n}`; const p = per[k] ?? 0; per[k] = reg & 1 ? (p & 0xff) | ((val & 0xf) << 8) : (p & 0xf00) | val; }
    else if (port === 0 && reg >= 8 && reg <= 10) { const k = `S${reg - 7}`; const v = val & 0x1f ? (val & 0x10 ? 15 : val & 0xf) : 0; if (v && !vol[k]) on(t, k); vol[k] = v; }
    else if (port === 0 && reg === 0x19) dn = (dn & 0xff00) | val;
    else if (port === 0 && reg === 0x1a) dn = (dn & 0xff) | (val << 8);
    else if (port === 0 && reg === 0x10 && val & 0x80) on(t, 'B');
    else if (port === 1 && reg === 0x00 && !(val & 0x80)) for (let b = 0; b < 6; b++) if (val & (1 << b)) out.push({ t, ch: `A${b + 1}`, hz: 0 });
  }
  settle(1e9);
  out.sort((p, q) => p.t - q.t);
  const t0 = out[0]?.t ?? 0;
  return out.map(({ t, ch, hz }) => ({ t: t - t0, ch, hz }));
}

function readTap(file: string): { w: W[]; cmds: string[] } {
  const w: W[] = [], cmds: string[] = [], addr = [0, 0];
  for (const l of readFileSync(file, 'utf8').split('\n')) {
    const p = l.split(' '); if (p.length !== 3) continue; // MAME stops mid-line
    const t = Number(p[0]);
    if (p[1] === 'C') { cmds.push(p[2]); continue; }
    const port = Number(p[1]), v = parseInt(p[2], 16);
    if (port === 0 || port === 2) addr[port >> 1] = v; else w.push({ t, port: port >> 1, reg: addr[port >> 1], val: v });
  }
  return { w, cmds };
}

function readVgm(file: string): { w: W[]; clk: number } {
  const b = readFileSync(file); let p = 0x34 + b.readUInt32LE(0x34), s = 0; const w: W[] = [];
  const clk = b.readUInt32LE(0x4c) & 0x3fffffff;
  while (p < b.length) {
    const c = b[p++];
    if (c === 0x58 || c === 0x59) { w.push({ t: s / 44100, port: c - 0x58, reg: b[p], val: b[p + 1] }); p += 2; }
    else if (c === 0x61) { s += b.readUInt16LE(p); p += 2; }
    else if (c === 0x62) s += 735; else if (c === 0x63) s += 882; else if (c === 0x66) break;
    else if (c === 0x67) p += 6 + b.readUInt32LE(p + 2);
    else if (c >= 0x70 && c <= 0x7f) s += (c & 15) + 1; else if (c >= 0x80 && c <= 0x8f) s += c & 15;
    else if (c === 0x4f || c === 0x50) p += 1; else if (c >= 0x51 && c <= 0x5f) p += 2; else if (c >= 0xa0 && c <= 0xbf) p += 2; else if (c >= 0xc0 && c <= 0xdf) p += 3;
    else if (c === 0x90 || c === 0x91 || c === 0xe0) p += 4; else throw new Error(`vgm command ${c.toString(16)}`);
  }
  return { w, clk };
}

const run = (cmd: string, a: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv; timeout?: number } = {}) =>
  execFileSync(cmd, a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26, timeout: 600000, ...opts });

/** Copy the game once; the 68k ROM files stay symlinks into the game's build. */
function prepareHarness() {
  if (existsSync(path.join(HARNESS, 'Makefile'))) return;
  mkdirSync(HARNESS, { recursive: true });
  run('rsync', ['-a', '--exclude', 'build', '--exclude', '.git', '--exclude', 'thoughts', '--exclude', 'design', '--exclude', 'snap', `${AG}/`, `${HARNESS}/`]);
  mkdirSync(path.join(HARNESS, 'build/sound/sfx'), { recursive: true });
  mkdirSync(path.join(HARNESS, 'build/rom'), { recursive: true });
  copyFileSync(path.join(AG, 'build/sound/sfx/pop_a.wav'), path.join(HARNESS, 'build/sound/sfx/pop_a.wav'));
  for (const x of ['p1', 's1', 'c1', 'c2']) symlinkSync(path.join(AG, `build/rom/gumbirds-${x}.${x}`), path.join(HARNESS, `build/rom/gumbirds-${x}.${x}`));
  copyFileSync(path.join(AG, 'build/rom/neogeo.zip'), path.join(HARNESS, 'build/rom/neogeo.zip'));
  writeFileSync(path.join(HARNESS, 'assets/sound/sample-map.yaml'), '---\n- adpcm_a:\n    channel: 1\n    name: pop_a\n    uri: file://build/sound/sfx/pop_a.wav\n');
  writeFileSync(path.join(HARNESS, 'assets/sound/music-map.yaml'), '---\n- furnace:\n    name: inner\n    uri: file://assets/sound/music/inner.fur\n');
  rmSync(path.join(HARNESS, 'assets/sound/music'), { recursive: true, force: true }); mkdirSync(path.join(HARNESS, 'assets/sound/music'), { recursive: true });
}

/** .fur -> M1 + V1 -> cartridge zip and MAME hash file, with the game's own Makefile rules. */
function buildRom(fur: string): string {
  prepareHarness();
  copyFileSync(fur, path.join(HARNESS, 'assets/sound/music/inner.fur'));
  rmSync(path.join(HARNESS, 'build/nss'), { recursive: true, force: true });
  rmSync(path.join(HARNESS, 'build/sound/driver.ihx'), { force: true });
  const R = path.join(HARNESS, 'build/rom'), q = path.join(homedir(), '.claude/bin/buildq');
  const mk = ['nice', '-n', '19', 'gmake', '-j3', 'build/rom/gumbirds-v1.v1', 'build/rom/gumbirds-m1.m1'];
  rmSync(path.join(R, 'gumbirds-m1.m1'), { force: true }); rmSync(path.join(R, 'gumbirds-v1.v1'), { force: true });
  // V ROM first: it writes build/samples.inc, which the M1 instruments file includes (parallel -j races on it)
  try { for (const t of [mk.slice(0, -1), mk.slice(0, -2).concat(mk.at(-1)!)]) run(existsSync(q) ? q : t[0], existsSync(q) ? ['--purpose', 'neogeo agent: rom check', '--', ...t] : t.slice(1), { cwd: HARNESS }); }
  catch (e) { const m = String((e as { stderr?: string }).stderr ?? e); throw new Error(`build: ${(m.match(/(AssertionError|Error)[^\n]*/g) ?? [m.slice(-300)]).slice(-2).join(' | ')}`); }
  const rom = ['-p', `${R}/gumbirds-p1.p1`, '-c', `${R}/gumbirds-c1.c1`, `${R}/gumbirds-c2.c2`, '-v', `${R}/gumbirds-v1.v1`, '-s', `${R}/gumbirds-s1.s1`, '-m', `${R}/gumbirds-m1.m1`, '-n', 'gumbirds'];
  run('romtool.py', ['-b', 'cartridge', '-f', 'zip', ...rom, '-o', `${R}/gumbirds.zip`]);
  run('romtool.py', ['-b', 'hash', '-f', 'mame', ...rom, '-l', 'Gumbirds', '-o', `${R}/neogeo.xml`]);
  return R;
}

const results: Record<string, Verdict> = existsSync(RESULTS) ? JSON.parse(readFileSync(RESULTS, 'utf8')) : {};
const toolHash = createHash('sha1').update(readFileSync(TAP)).update(readFileSync(import.meta.filename)).digest('hex');
for (const song of SONGS) {
  if (only && song.name !== only) continue;
  if (failedOnly && results[song.name]?.pass !== false) continue;
  const dir = mkdtempSync(path.join(tmpdir(), 'ngrom-'));
  let v: Verdict = { inputHash: '', pass: false, seconds: SECONDS };
  try {
    let fur = song.fur, lint: string[] = [];
    if (song.compose) { fur = path.join(dir, `${song.compose}.fur`); 
      // run.ts exits 1 when the linter reports lossy items but still writes the .fur; keep the lint lines in the verdict
      try { run('npx', ['tsx', '--tsconfig', 'tsconfig.app.json', 'tools/neogeo-compose/run.ts', song.compose, fur], { cwd: ROOT }); }
      catch (e) { lint = String((e as { stdout?: string }).stdout ?? '').split('\n').filter((l) => l.includes('[LINT]')); if (!existsSync(fur)) throw e; } }
    const inputHash = createHash('sha1').update(readFileSync(fur!)).update(toolHash).update(String(SECONDS)).digest('hex');
    v.inputHash = inputHash;
    if (!only && !failedOnly && results[song.name]?.inputHash === inputHash) { console.log(`[SKIP] ${song.name}`); continue; }
    v.stage = 'build'; if (lint.length) v.lint = lint;
    const R = buildRom(fur!);
    v.stage = 'mame';
    run('mame', ['-window', '-nomaximize', '-video', 'none', '-sound', 'none', '-nothrottle', '-seconds_to_run', String(SECONDS), '-noautosave', '-skip_gameinfo', '-hash', R, '-rp', R,
      '-nvram_directory', path.join(dir, 'nv'), '-cfg_directory', path.join(dir, 'cfg'), '-autoboot_script', TAP, 'neogeo', '-cart1', 'gumbirds'],
      { env: { ...process.env, SDL_VIDEODRIVER: 'dummy', TAP_OUT: path.join(dir, 'tap') }, timeout: (SECONDS + 120) * 1000 });
    const tap = readTap(path.join(dir, 'tap'));
    const got = starts(tap.w, MVS_CLK).filter((g) => g.t < SECONDS - 1);
    v = { ...v, commands: tap.cmds.slice(0, 8), mameStarts: got.length, pass: got.length > 0 };
    v.stage = 'furnace';
    run(FURNACE, ['-console', '-nostatus', '-nocontrols', '-noreport', '-loglevel', 'error', '-loops', '0', '-vgmout', path.join(dir, 'f.vgm'), fur!], { timeout: 120000 });
    const vgm = readVgm(path.join(dir, 'f.vgm'));
    const want = starts(vgm.w, vgm.clk).filter((e) => e.t < SECONDS - 2);
    const pairs = want.map((w) => [w, got.find((g) => g.ch === w.ch && Math.abs(g.t - w.t) < 0.03)] as const);
    const hit = pairs.filter(([, g]) => g);
    const tone = hit.filter(([w]) => w.hz > 0);
    const cents = (a: Start, b: Start) => Math.round(1200 * Math.log2(b.hz / a.hz));
    const ok = (w: Start, g: Start) => g.hz > 0 && Math.abs(cents(w, g)) < 50;
    if (detail) for (const [w, g] of tone) if (!ok(w, g!)) console.log(`  ${w.t.toFixed(3)} ${w.ch} want ${w.hz.toFixed(1)} got ${g!.hz.toFixed(1)} Hz`);
    const pct = (a: number, b: number) => (b ? Math.round((a / b) * 10000) / 100 : 0);
    const chs = [...new Set(want.map((w) => w.ch))].sort();
    v.byChannel = Object.fromEntries(chs.map((c) => { const p = pairs.filter(([w]) => w.ch === c); const h = p.filter(([, g]) => g); return [c, `${h.length}/${p.length} key-on, ${h.filter(([w, g]) => w.hz > 0 && ok(w, g!)).length}/${h.filter(([w]) => w.hz > 0).length} pitch`]; }));
    Object.assign(v, { furnaceStarts: want.length, keyOnMatch: pct(hit.length, want.length), pitchMatch: pct(tone.filter(([w, g]) => ok(w, g!)).length, tone.length) });
    v.stage = undefined;
  } catch (e) {
    v.error = e instanceof Error ? e.message : String(e); v.pass = false;
  } finally { rmSync(dir, { recursive: true, force: true }); }
  if (!v.inputHash && !v.error) continue;
  v.inputHash ||= 'none';
  results[song.name] = v;
  mkdirSync(path.dirname(RESULTS), { recursive: true });
  writeFileSync(RESULTS, `${JSON.stringify(results, null, 1)}\n`);
  console.log(`[${v.pass ? 'PASS' : 'FAIL'}] ${song.name} ${JSON.stringify({ ...v, inputHash: undefined })}`);
}
