// Headless check, PC Engine HuSIC route: .fur -> furnaceToHusic (song data for the prebuilt HuSIC driver) -> Mesen2 (Lua write tap on the
// HuC6280 PSG, $0800-$0809) -> compare per 60 Hz tick with the Furnace CLI -vgmout register stream of the same song (VGM command $B9).
// Usage: nice -n 19 npx tsx --tsconfig tsconfig.app.json tools/pce-rom-check.ts [--only <name>] [--failed] [--seconds N] [--detail] [--convert-only]
// Songs: every .fur under public/data/songs/furnace whose only chip is one HuC6280 (file id 0x05).
// Results: test-data/pce-rom-check.json (skips songs whose input hash matches a recorded verdict; --convert-only records nothing).
// Per tick (state after the tick's writes) and channel: sounding = control bit 7 set and volume > 0. Both sides start at their own first sounding tick.
// keyOnMatch = share of Furnace note starts (silent -> sounding, or a period jump >= 80 cents on a sounding tone channel) with a ROM start on the same channel
// within 2 ticks (~30 ms). pitchMatch = share of ticks where both sound a tone (noise off) within 50 cents. volumeMatch = same ticks, control volume
// within 1 step. pass = the ROM sounded and keyOnMatch and pitchMatch are both at least 90 %. Needs Mesen2 and the Furnace CLI (FURNACE_CLI overrides).
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { parseFurnaceSong } from '../src/lib/import/formats/FurnaceSongParser';
import { furnaceToHusic, husicSystemsSupported, type HusicLayout } from '../src/lib/export/pce/husicSong';

const ROOT = path.resolve(import.meta.dirname, '..');
const SONGS = path.join(ROOT, 'public/data/songs/furnace');
const RESULTS = path.join(ROOT, 'test-data/pce-rom-check.json');
const PLAYER = readFileSync(path.join(ROOT, 'public/pce/player.pce'));
const LAYOUT = JSON.parse(readFileSync(path.join(ROOT, 'public/pce/player.json'), 'utf8')) as HusicLayout;
const MESEN = path.join(homedir(), 'Applications/Mesen.app/Contents/MacOS/Mesen');
const FURNACE = process.env.FURNACE_CLI ?? '/Applications/Furnace.app/Contents/MacOS/furnace';
const PSG_CLOCK = 3579545, VGM_RATE = 44100, CH = 6;

interface Verdict { inputHash: string; file: string; pass: boolean; seconds: number; hz?: number; romBytes?: number; lossy?: string[]; romStarts?: number; furnaceStarts?: number; keyOnMatch?: number; pitchMatch?: number; volumeMatch?: number; error?: string }
/** One register write; tick = 60 Hz tick it belongs to. */
type W = { tick: number; reg: number; val: number };
/** Channel state after a tick: period 0 = silent. */
type St = { on: boolean; per: number; vol: number; noise: boolean };

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : undefined;
const failedOnly = args.includes('--failed');
const detail = args.includes('--detail');
const convertOnly = args.includes('--convert-only');
const SECONDS = args.includes('--seconds') ? Number(args[args.indexOf('--seconds') + 1]) : 10;
const TICKS = SECONDS * 60;

/** Furnace -vgmout: $B9 aa dd = HuC6280 write; tick = sample time on the 60 Hz grid. */
function vgmWrites(file: string): W[] {
  const b = readFileSync(file);
  let p = 0x34 + b.readUInt32LE(0x34), s = 0;
  const out: W[] = [];
  const LEN: Record<number, number> = { 0x4f: 1, 0x50: 1, 0x90: 4, 0x91: 4, 0x92: 5, 0x93: 10, 0x94: 1, 0x95: 4, 0xe0: 4 };
  while (p < b.length) {
    const c = b[p++];
    if (c === 0xb9) { out.push({ tick: Math.floor((s * 60) / VGM_RATE + 1e-6), reg: b[p], val: b[p + 1] }); p += 2; }
    else if (c === 0x61) { s += b.readUInt16LE(p); p += 2; }
    else if (c === 0x62) s += 735;
    else if (c === 0x63) s += 882;
    else if (c === 0x66) break;
    else if (c === 0x67) p += 6 + b.readUInt32LE(p + 2);
    else if (c >= 0x70 && c <= 0x7f) s += c - 0x6f;
    else if (c >= 0x80 && c <= 0x8f) s += c - 0x80;
    else if (LEN[c] !== undefined) p += LEN[c];
    else if (c >= 0x30 && c <= 0x3f) p += 1;
    else if (c >= 0x40 && c <= 0x4e) p += 2;
    else if (c >= 0x51 && c <= 0x5f) p += 2;
    else if (c >= 0xa0 && c <= 0xbf) p += 2;
    else if (c >= 0xc0 && c <= 0xdf) p += 3;
    else if (c >= 0xe1 && c <= 0xff) p += 4;
    else throw new Error(`VGM command ${c.toString(16)} at ${p - 1}`);
  }
  return out;
}

/** Mesen2 headless: PSG writes, tick = vsync frame (HuSIC runs once per VDC vsync interrupt). */
function mesenWrites(rom: Uint8Array, dir: string, ticks: number): W[] {
  writeFileSync(path.join(dir, 'p.pce'), rom);
  writeFileSync(path.join(dir, 'tap.lua'), `local f=0
emu.addEventCallback(function() f=f+1 if f>=${ticks + 120} then print("DONE") emu.stop(0) end end, emu.eventType.endFrame)
emu.addMemoryCallback(function(a,v) print(string.format("W %d %d %d",f,a&15,v&0xFF)) end, emu.callbackType.write, 0x0800, 0x0809)
`);
  const set = path.join(homedir(), 'Library/Application Support/Mesen2');
  mkdirSync(set, { recursive: true });
  if (!existsSync(path.join(set, 'Settings.json'))) writeFileSync(path.join(set, 'Settings.json'), '{"FirstRun":false}');
  const timeout = Math.ceil(ticks / 60) + 60;
  const out = execFileSync(MESEN, ['--testRunner', `--timeout=${timeout}`, '--doNotSaveSettings', '--enableStdout', '--PcEngine.Port1.Type=PceController', path.join(dir, 'tap.lua'), path.join(dir, 'p.pce')],
    { encoding: 'utf8', timeout: timeout * 1000 + 30000, maxBuffer: 1 << 28 });
  if (!out.includes('DONE')) throw new Error(`Mesen2 run did not reach DONE: ${out.slice(-300)}`);
  return out.split('\n').filter((l) => l.startsWith('W ')).map((l) => { const [, t, r, v] = l.trim().split(' ').map(Number); return { tick: t, reg: r, val: v }; });
}

/** Register writes -> per-tick channel state, re-timed from the first sounding tick. */
function states(ws: W[]): St[][] {
  const per = new Array<number>(CH).fill(0), ctl = new Array<number>(CH).fill(0), nz = new Array<number>(CH).fill(0);
  let sel = 0, i = 0;
  const snap = () => Array.from({ length: CH }, (_, c) => ({ on: (ctl[c] & 0x80) !== 0 && (ctl[c] & 31) > 0, per: per[c], vol: ctl[c] & 31, noise: c >= 4 && (nz[c] & 0x80) !== 0 }));
  const all: St[][] = [];
  const last = ws.length ? ws[ws.length - 1].tick : 0;
  for (let t = 0; t <= last; t++) {
    for (; i < ws.length && ws[i].tick <= t; i++) {
      const { reg, val } = ws[i];
      if (reg === 0) sel = val & 7;
      else if (sel < CH) {
        if (reg === 2) per[sel] = (per[sel] & 0xf00) | val;
        else if (reg === 3) per[sel] = (per[sel] & 0xff) | ((val & 15) << 8);
        else if (reg === 4) ctl[sel] = val;
        else if (reg === 7) nz[sel] = val;
      }
    }
    all.push(snap());
  }
  const first = all.findIndex((s) => s.some((c) => c.on));
  return first < 0 ? [] : all.slice(first, first + TICKS);
}

/** Note starts: silent -> sounding, or a period jump of at least 80 cents in one tick on a sounding tone channel (a new note or an
 * arpeggio step; vibrato and slides move the period by a few cents per tick and are not starts). */
function starts(s: St[][]): Array<{ t: number; ch: number }> {
  const out: Array<{ t: number; ch: number }> = [];
  s.forEach((row, t) => row.forEach((c, ch) => {
    const p = s[t - 1]?.[ch];
    const jump = p?.per && c.per ? Math.abs(1200 * Math.log2(p.per / c.per)) : 0;
    if (c.on && (!p?.on || (!c.noise && !p.noise && jump >= 80))) out.push({ t, ch });
  }));
  return out;
}

const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.fur') ? [p] : []; });
const toBuf = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) as ArrayBuffer;
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 10000) / 100 : 0);

mkdirSync(path.dirname(RESULTS), { recursive: true });
const results: Record<string, Verdict> = existsSync(RESULTS) ? JSON.parse(readFileSync(RESULTS, 'utf8')) : {};
const toolHash = createHash('sha1').update(PLAYER).update(JSON.stringify(LAYOUT)).update(readFileSync(import.meta.filename))
  .update(readFileSync(path.join(ROOT, 'src/lib/export/pce/husicSong.ts'))).digest('hex');
if (!convertOnly && !existsSync(MESEN)) throw new Error(`Mesen2 not installed at ${MESEN}`);
for (const file of walk(SONGS)) {
  const name = path.basename(file, '.fur');
  if (only && name !== only) continue;
  if (failedOnly && results[name]?.pass !== false) continue;
  const fur = readFileSync(file);
  const inputHash = createHash('sha1').update(fur).update(toolHash).update(String(SECONDS)).digest('hex');
  if (!only && !failedOnly && !convertOnly && results[name]?.inputHash === inputHash) { console.log(`[SKIP] ${name}`); continue; }
  let m;
  try { m = await parseFurnaceSong(toBuf(fur)); } catch { continue; }
  if (!husicSystemsSupported(m.systems)) continue;
  const rel = path.relative(SONGS, file);
  if (convertOnly) {
    try { const s = furnaceToHusic(m, 0, PLAYER, LAYOUT); console.log(`[OK] ${name} ${s.rom.length} B; ${s.lossy.join('; ')}`); }
    catch (e) { console.log(`[FAIL] ${name} ${e instanceof Error ? e.message : String(e)}`); }
    continue;
  }
  const dir = mkdtempSync(path.join(tmpdir(), 'pcerom-'));
  let v: Verdict;
  try {
    const song = furnaceToHusic(m, 0, PLAYER, LAYOUT);
    const got = states(mesenWrites(song.rom, dir, TICKS));
    const romStarts = starts(got);
    v = { inputHash, file: rel, pass: false, seconds: SECONDS, hz: m.subsongs[0].hz, romBytes: song.rom.length, lossy: song.lossy, romStarts: romStarts.length };
    if (!existsSync(FURNACE)) throw new Error(`Furnace CLI not found at ${FURNACE}`);
    execFileSync(FURNACE, ['-console', '-nostatus', '-nocontrols', '-noreport', '-loglevel', 'error', '-loops', '0', '-vgmout', path.join(dir, 'f.vgm'), file], { stdio: 'ignore', timeout: 120000 });
    const want = states(vgmWrites(path.join(dir, 'f.vgm')));
    const wantStarts = starts(want).filter((w) => w.t < TICKS - 60);
    const hit = wantStarts.filter((w) => romStarts.some((g) => g.ch === w.ch && Math.abs(g.t - w.t) <= 2)).length;
    let tone = 0, inTune = 0, volOk = 0;
    for (let t = 0; t < Math.min(want.length, got.length); t++) for (let ch = 0; ch < CH; ch++) {
      const a = want[t][ch], b = got[t][ch];
      if (!a.on || !b.on || a.noise || b.noise || !a.per || !b.per) continue;
      tone++;
      const cents = Math.round(1200 * Math.log2(a.per / b.per));
      if (Math.abs(cents) < 50) inTune++;
      else if (detail) console.log(`  tick ${t} ch${ch} want ${(PSG_CLOCK / 32 / a.per).toFixed(1)} got ${(PSG_CLOCK / 32 / b.per).toFixed(1)} Hz (${cents} cents)`);
      if (Math.abs(a.vol - b.vol) <= 1) volOk++;
    }
    Object.assign(v, { furnaceStarts: wantStarts.length, keyOnMatch: pct(hit, wantStarts.length), pitchMatch: pct(inTune, tone), volumeMatch: pct(volOk, tone) });
    v.pass = romStarts.length > 0 && (v.keyOnMatch ?? 0) >= 90 && (v.pitchMatch ?? 0) >= 90;
  } catch (e) {
    v = { inputHash, file: rel, pass: false, seconds: SECONDS, error: e instanceof Error ? e.message.split('\n')[0] : String(e) };
  } finally { rmSync(dir, { recursive: true, force: true }); }
  results[name] = v;
  writeFileSync(RESULTS, `${JSON.stringify(results, null, 1)}\n`);
  console.log(`[${v.pass ? 'PASS' : 'FAIL'}] ${name} ${JSON.stringify({ ...v, inputHash: undefined, file: undefined, lossy: v.lossy?.length })}`);
}
