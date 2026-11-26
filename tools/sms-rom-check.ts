// Headless check, Master System / Game Gear Banjo route: .fur -> furnaceToBanjo -> buildSmsRom -> MAME (write tap on the SN76489)
// -> compare with the Furnace CLI -vgmout register stream of the same song (both decoded by tools/md-phase0/events.py).
// Usage: nice -n 19 npx tsx --tsconfig tsconfig.app.json tools/sms-rom-check.ts [--only <name>] [--failed] [--seconds N] [--detail]
// Songs: every .fur under public/data/songs/furnace whose only chip is one SN76489 (file id 0x03).
// Results: test-data/sms-rom-check.json (skips songs whose input hash matches a recorded verdict).
// MAME system: sg1000m3 (Mark III, plays SMS carts, needs no BIOS; `sms` needs a BIOS dump) or gamegear for songs whose system
// name Game Gear (the song system name). pass = the ROM made PSG notes start in MAME. keyOnMatch = share of Furnace note starts (attenuation leaving
// 15, same channel) with a MAME start within 30 ms; both streams start at their own first note start. Needs mame and the Furnace CLI
// (FURNACE_CLI overrides the path).
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseFurnaceSong } from '../src/lib/import/formats/FurnaceSongParser';
import { banjoSystemsSupported, furnaceToBanjo, type BanjoLayout } from '../src/lib/export/sms/banjoSong';
import { buildSmsRom } from '../src/lib/export/sms/smsRom';

const ROOT = path.resolve(import.meta.dirname, '..');
const SONGS = path.join(ROOT, 'public/data/songs/furnace');
const RESULTS = path.join(ROOT, 'test-data/sms-rom-check.json');
const PLAYER = readFileSync(path.join(ROOT, 'public/sms/player.sms'));
const LAYOUT = JSON.parse(readFileSync(path.join(ROOT, 'public/sms/player.json'), 'utf8')) as BanjoLayout;
const TAP = path.join(ROOT, 'tools/sms-player/tap.lua');
const EVENTS = path.join(ROOT, 'tools/md-phase0/events.py');
const FURNACE = process.env.FURNACE_CLI ?? '/Applications/Furnace.app/Contents/MacOS/furnace';

interface Verdict { inputHash: string; file: string; pass: boolean; seconds: number; system?: string; hz?: number; romBytes?: number; lossy?: string[]; mameStarts?: number; furnaceStarts?: number; keyOnMatch?: number; pitchMatch?: number; error?: string }
type Ev = { t: number; ch: string; ev: string; v: string };

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : undefined;
const failedOnly = args.includes('--failed');
const detail = args.includes('--detail'); // print the out-of-tune note starts
const SECONDS = args.includes('--seconds') ? Number(args[args.indexOf('--seconds') + 1]) : 10;

const decode = (file: string): Ev[] =>
  execFileSync('python3', ['-I', EVENTS, file], { encoding: 'utf8', maxBuffer: 1 << 28 }).split('\n').filter(Boolean).map((l) => { const [t, ch, ev, v] = l.split(' '); return { t: Number(t), ch, ev, v }; });
/** Note starts: PSG / noise attenuation leaving 15 (silence), re-timed from the stream's first start. Writes to one channel less than 4 ms
 *  apart are one burst and only its last value counts (Furnace writes 15 then the new level in one tick to retrigger; Banjo does not).
 *  hz = the channel's tone frequency at the end of the burst. */
type Start = Ev & { hz: number };
type Burst = { t: number; lastT: number; v: number; was: number; hz: number };
function starts(e: Ev[]): Start[] {
  const att: Record<string, number> = {}, freq: Record<string, number> = {}, open: Record<string, Burst> = {};
  const out: Start[] = [];
  const close = (ch: string) => {
    const b = open[ch];
    if (!b) return;
    if (b.was === 15 && b.v < 15) out.push({ t: b.t, ch, ev: 'ATT', v: String(b.v), hz: b.hz });
    att[ch] = b.v;
    delete open[ch];
  };
  for (const x of e) {
    const b = open[x.ch];
    if (b && x.t - b.lastT >= 0.004) close(x.ch);
    if (x.ev === 'FREQ') { freq[x.ch] = Number(x.v); if (open[x.ch]) open[x.ch].hz = freq[x.ch]; continue; }
    if (x.ev !== 'ATT') continue;
    const o = open[x.ch];
    if (o) Object.assign(o, { v: Number(x.v), lastT: x.t, hz: freq[x.ch] ?? 0 });
    else open[x.ch] = { t: x.t, lastT: x.t, v: Number(x.v), was: att[x.ch] ?? 15, hz: freq[x.ch] ?? 0 };
  }
  for (const ch of Object.keys(open)) close(ch);
  out.sort((p, q) => p.t - q.t);
  const t0 = out[0]?.t ?? 0;
  return out.map((x) => ({ ...x, t: x.t - t0 }));
}

function runMame(system: string, rom: Uint8Array, dir: string, seconds: number): Ev[] {
  writeFileSync(path.join(dir, 'p.rom'), rom);
  execFileSync('mame', [system, '-cart', path.join(dir, 'p.rom'), '-video', 'none', '-sound', 'none', '-nothrottle', '-seconds_to_run', String(seconds), '-autoboot_script', TAP, '-cfg_directory', path.join(dir, 'cfg'), '-nvram_directory', path.join(dir, 'nv'), '-skip_gameinfo'],
    { env: { ...process.env, TAPOUT: path.join(dir, 'tap') }, stdio: 'ignore', timeout: (seconds + 60) * 1000 });
  return decode(path.join(dir, 'tap'));
}

const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.fur') ? [p] : []; });
const toBuf = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) as ArrayBuffer;

const results: Record<string, Verdict> = existsSync(RESULTS) ? JSON.parse(readFileSync(RESULTS, 'utf8')) : {};
const toolHash = createHash('sha1').update(PLAYER).update(readFileSync(TAP))
  .update(readFileSync(path.join(ROOT, 'src/lib/export/sms/banjoSong.ts'))).update(readFileSync(path.join(ROOT, 'src/lib/export/sms/smsRom.ts'))).digest('hex');
for (const file of walk(SONGS)) {
  const name = path.basename(file, '.fur');
  if (only && name !== only) continue;
  if (failedOnly && results[name]?.pass !== false) continue;
  const fur = readFileSync(file);
  const inputHash = createHash('sha1').update(fur).update(toolHash).update(String(SECONDS)).digest('hex');
  if (!only && !failedOnly && results[name]?.inputHash === inputHash) { console.log(`[SKIP] ${name}`); continue; }
  let m;
  try { m = await parseFurnaceSong(toBuf(fur)); } catch { continue; }
  if (!banjoSystemsSupported(m.systems)) continue;
  const dir = mkdtempSync(path.join(tmpdir(), 'smsrom-'));
  const rel = path.relative(SONGS, file);
  let v: Verdict;
  try {
    const song = furnaceToBanjo(m, 0, LAYOUT);
    const gameGear = /game ?gear/i.test(m.systemName ?? '');
    const system = gameGear ? 'gamegear' : 'sg1000m3';
    const rom = buildSmsRom(PLAYER, LAYOUT, song, gameGear, m.name, { author: m.author, comments: m.comment });
    // The player spreads the song's ticks over the console's frames, so a 50 Hz song plays at 50 Hz on MAME's 60 Hz consoles.
    const got = starts(runMame(system, rom, dir, SECONDS)).filter((g) => g.t < SECONDS);
    v = { inputHash, file: rel, pass: got.length > 0, seconds: SECONDS, system, hz: m.subsongs[0].hz, romBytes: rom.length, lossy: song.lossy, mameStarts: got.length };
    if (existsSync(FURNACE)) {
      execFileSync(FURNACE, ['-console', '-nostatus', '-nocontrols', '-noreport', '-loglevel', 'error', '-loops', '0', '-vgmout', path.join(dir, 'f.vgm'), file], { stdio: 'ignore', timeout: 120000 });
      const want = starts(decode(path.join(dir, 'f.vgm'))).filter((e) => e.t < SECONDS - 1);
      const pairs = want.map((w) => [w, got.find((g) => g.ch === w.ch && Math.abs(g.t - w.t) < 0.03)] as const).filter(([, g]) => g);
      // Pitch: tone-channel starts whose frequency is within a quarter tone (noise rates are not compared).
      const tone = pairs.filter(([w]) => w.ch !== 'NOISE' && w.hz > 0);
      const cents = (w: Start, g: Start) => Math.round(1200 * Math.log2(g.hz / w.hz));
      const inTune = tone.filter(([w, g]) => Math.abs(cents(w, g!)) < 50).length;
      if (detail) for (const w of want) if (!pairs.some(([p]) => p === w)) console.log(`  missed ${w.t.toFixed(3)} ${w.ch} att ${w.v} ${w.hz.toFixed(1)} Hz; nearest MAME ${got.filter((g) => g.ch === w.ch).map((g) => g.t - w.t).sort((a, b) => Math.abs(a) - Math.abs(b))[0]?.toFixed(3)} s`);
      if (detail) for (const [w, g] of tone) if (Math.abs(cents(w, g!)) >= 50) console.log(`  ${w.t.toFixed(3)} ${w.ch} want ${w.hz.toFixed(1)} got ${g!.hz.toFixed(1)} Hz (${cents(w, g!)} cents)`);
      const pct = (a: number, b: number) => (b ? Math.round((a / b) * 10000) / 100 : 0);
      Object.assign(v, { furnaceStarts: want.length, keyOnMatch: pct(pairs.length, want.length), pitchMatch: pct(inTune, tone.length) });
    }
  } catch (e) {
    v = { inputHash, file: rel, pass: false, seconds: SECONDS, error: e instanceof Error ? e.message : String(e) };
  } finally { rmSync(dir, { recursive: true, force: true }); }
  results[name] = v;
  writeFileSync(RESULTS, `${JSON.stringify(results, null, 1)}\n`);
  console.log(`[${v.pass ? 'PASS' : 'FAIL'}] ${name} ${JSON.stringify({ ...v, inputHash: undefined, lossy: v.lossy?.length })}`);
}
