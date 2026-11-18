// Headless check, ZX Spectrum PT3 route: .fur (AY) -> furnaceToPt3 -> buildZxPt3Tap -> MAME spec128 (AY write log) vs Furnace's own VGM render.
// Usage: nice -n 19 npx tsx --tsconfig tsconfig.app.json tools/zx-pt3-check.ts [--only <name>] [--failed] [--frames N] [--dir ay8910|ay8930] [--out <dir>] [--dump a-b]
// Results: test-data/zx-pt3-check.json (skips songs whose input hash matches a recorded verdict).
// Pass = the tape loaded and the player ran the requested frames (>= N frames of AY writes after the first one),
//   every channel that has notes in the song sounded in some frame, and per channel at most PITCH_FAIL_SHARE of the frames where
//   both Furnace and the tape sound with tone differ in pitch by more than CENTS_TOL cents (AY periods converted to Hz, so the
//   Spectrum clock 1.7734 MHz vs the song's chip clock does not count as error). Volume is reported, not failed (macros are lossy).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { parseFurnaceSong } from '../src/lib/import/formats/FurnaceSongParser';
import { buildZxPt3Tap, furnaceToPt3 } from '../src/lib/export/zx/pt3Song';

const ROOT = path.resolve(import.meta.dirname, '..');
const RESULTS = path.join(ROOT, 'test-data/zx-pt3-check.json');
const BIN = readFileSync(path.join(ROOT, 'public/zx/pt3player.bin'));
const META = JSON.parse(readFileSync(path.join(ROOT, 'public/zx/pt3player.json'), 'utf8'));
const FURNACE = '/Applications/Furnace.app/Contents/MacOS/furnace';
const ZX_CLOCK = 1773400;
const CENTS_TOL = 35;
const PITCH_FAIL_SHARE = 0.05;

const args = process.argv.slice(2);
const arg = (k: string): string | undefined => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const only = arg('--only');
const failedOnly = args.includes('--failed');
const FRAMES = Number(arg('--frames') ?? 1500);
const DIR = arg('--dir') ?? 'ay8910';
const OUT = arg('--out');
const DUMP = arg('--dump')?.split('-').map(Number);
const SONGS = path.join(ROOT, 'public/data/songs/furnace', DIR);

type Regs = number[]; // 14 AY registers
interface ChState { hz: number | null; vol: number; envHz: number | null; shape: number | null; noise: number | null }
interface PitchDiff { both: number; pitchBad: number; volBad: number; onlyRef: number; onlyGot: number; first?: string; envBoth?: number; envBad?: number; envFirst?: string; noiseBad?: number }
interface Verdict { inputHash: string; pass: boolean; frames: number; sounding: number[]; hasNotes: boolean[]; pitch?: PitchDiff[]; lag?: number; lossy?: string[]; tapBytes?: number; error?: string }

const LUA = (outFile: string, frames: number): string => `
local out = io.open("${outFile}", "w")
local sp = manager.machine.devices[":maincpu"].spaces["io"]
local cpu = manager.machine.devices[":maincpu"]
local regs, sel, started, n = {}, 0, false, 0
fr = 0
for i = 0, 15 do regs[i] = 0 end
tap_keep = sp:install_write_tap(0, 0xffff, "ay", function(off, data, mask)
  if (off & 0xc002) == 0xc000 then sel = data & 15
  elseif (off & 0xc002) == 0x8000 then regs[sel] = data; if fr > 300 and sel >= 8 and sel <= 10 then started = true end end
end)
enter = manager.machine.ioport.ports[":LINE6"].fields["ENTER"]
local cass = manager.machine.cassettes[":cassette"]
emu.register_frame_done(function()
  fr = fr + 1
  enter:set_value((fr > 200 and fr < 210) and 1 or 0)
  if fr == 215 then cass:play() end
  if not started then return end
  local t = {}
  for i = 0, 13 do t[#t + 1] = string.format("%02x", regs[i]) end
  out:write(table.concat(t), "\\n")
  n = n + 1
  if n >= ${frames} then out:close(); manager.machine:exit() end
end)
`;

/** Per frame (50 Hz) 14 AY registers as MAME's spec128 wrote them; empty when the tape never reached the player. */
function mameRegs(tap: string, frames: number, dir: string): Regs[] {
  const log = path.join(dir, 'ay.log');
  const lua = path.join(dir, 'ay.lua');
  writeFileSync(lua, LUA(log, frames));
  try {
    execFileSync('nice', ['-n', '19', 'mame', 'spec128', '-rompath', path.join(homedir(), 'mame/roms'), '-cassette', tap, '-video', 'none', '-sound', 'none', '-nothrottle',
      '-skip_gameinfo', '-seconds_to_run', '1500', '-autoboot_script', lua], { timeout: 900000, stdio: 'ignore' });
  } catch { /* exit code of a script-ended run is not trusted; the log decides */ }
  if (!existsSync(log)) return [];
  if (OUT) writeFileSync(path.join(OUT, `${path.basename(tap, '.tap')}.aylog`), readFileSync(log));
  return readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => Array.from({ length: 14 }, (_, i) => parseInt(l.slice(i * 2, i * 2 + 2), 16)));
}

/** Furnace's render as per-50 Hz-frame AY registers: furnace -vgmout, VGM 0xA0 writes, time-binned (song Hz need not be 50). */
function furnaceRegs(furPath: string, frames: number, dir: string): { regs: Regs[]; clock: number } {
  execFileSync('nice', ['-n', '19', FURNACE, '-console', '-nostatus', '-nocontrols', '-noreport', '-loglevel', 'error', '-loops', '0', '-vgmout', path.join(dir, 'r.vgm'), furPath], { timeout: 300000, stdio: 'ignore' });
  const b = readFileSync(path.join(dir, 'r.vgm'));
  const clock = b.readUInt32LE(0x74) & 0x3fffffff;
  const out: Regs[] = [];
  const cur: Regs = new Array(14).fill(0);
  let i = 0x34 + b.readUInt32LE(0x34), sample = 0;
  const flush = (to: number): void => { while (out.length < Math.min(frames, to)) out.push([...cur]); };
  while (i < b.length) {
    const c = b[i];
    if (c === 0x66) break;
    // Frame f = Furnace state at the middle of its 20 ms window (sample 882f + 441), the instant the PT3 frame stands for;
    // the window end skipped each frame's first tick on 60 Hz songs. Writes on a frame boundary (50 Hz songs) land as before.
    if (c === 0xa0) { flush(Math.ceil((sample - 441) / 882)); if (b[i + 1] < 14) cur[b[i + 1]] = b[i + 2]; i += 3; }
    else if (c === 0x61) { sample += b.readUInt16LE(i + 1); i += 3; }
    else if (c === 0x62) { sample += 735; i++; }
    else if (c === 0x63) { sample += 882; i++; }
    else if (c >= 0x70 && c <= 0x7f) { sample += (c & 15) + 1; i++; }
    else if (c === 0x67) i += 7 + b.readUInt32LE(i + 3);
    else if (c >= 0x30 && c <= 0x3f) i += 2;
    else if ((c >= 0x40 && c <= 0x5f) || (c >= 0xa0 && c <= 0xbf)) i += 3;
    else if (c >= 0xc0 && c <= 0xdf) i += 4;
    else if (c >= 0xe0) i += 5;
    else throw new Error(`VGM command ${c.toString(16)} at ${i}`);
  }
  flush(Math.floor(sample / 882) + 1);
  return { regs: out, clock: clock || ZX_CLOCK };
}

/** Audible state per frame and channel; hz is set when the tone generator is on. */
function states(regs: Regs[], clock: number): ChState[][] {
  return regs.map((r) => [0, 1, 2].map((ch) => {
    const v = r[8 + ch];
    const vol = v & 16 ? 15 : v & 15;
    const toneOn = (r[7] & (1 << ch)) === 0, noiseOn = (r[7] & (8 << ch)) === 0;
    const p = r[ch * 2] | ((r[ch * 2 + 1] & 15) << 8);
    // Envelope mode sounds even with tone and noise masked (the envelope drives the DAC); its period is measured too.
    const env = (v & 16) !== 0, ep = r[11] | (r[12] << 8), shape = r[13] & 15;
    return { hz: vol > 0 && toneOn && p > 0 ? clock / (16 * p) : null, vol: vol > 0 && (toneOn || noiseOn || env) ? vol : 0,
      envHz: env ? clock / (256 * Math.max(1, ep)) : null, shape: env ? (shape < 4 ? 9 : shape < 8 ? 15 : shape) : null, noise: noiseOn ? r[6] & 31 : null };
  }));
}

function pitchDiff(ref: ChState[][], got: ChState[][], lag: number): PitchDiff[] {
  return [0, 1, 2].map((ch) => {
    const d: PitchDiff = { both: 0, pitchBad: 0, volBad: 0, onlyRef: 0, onlyGot: 0 };
    for (let t = 0; t < ref.length && t + lag < got.length; t++) {
      const a = ref[t][ch], x = got[t + lag][ch];
      if (a.vol === 0 && x.vol === 0) continue;
      if (a.vol === 0 || x.vol === 0) { if (a.vol) d.onlyRef++; else d.onlyGot++; continue; }
      if (Math.abs(a.vol - x.vol) > 2) d.volBad++;
      if (a.envHz !== null && x.envHz !== null) {
        d.envBoth = (d.envBoth ?? 0) + 1;
        const ec = 1200 * Math.log2(x.envHz / a.envHz);
        if (Math.abs(ec) > CENTS_TOL || a.shape !== x.shape) { d.envBad = (d.envBad ?? 0) + 1; d.envFirst ??= `f${t} env ref=${a.envHz.toFixed(1)}Hz/${a.shape} got=${x.envHz.toFixed(1)}Hz/${x.shape}`; }
      } else if (a.envHz !== null || x.envHz !== null) d.envBad = (d.envBad ?? 0) + 1;
      if (a.noise !== null && x.noise !== null && a.noise !== x.noise) d.noiseBad = (d.noiseBad ?? 0) + 1;
      if (a.hz === null || x.hz === null) continue;
      d.both++;
      const cents = 1200 * Math.log2(x.hz / a.hz);
      if (Math.abs(cents) > CENTS_TOL) { d.pitchBad++; d.first ??= `f${t} ref=${a.hz.toFixed(1)}Hz got=${x.hz.toFixed(1)}Hz (${Math.round(cents)}c)`; }
    }
    return d;
  });
}

const results: Record<string, Verdict> = existsSync(RESULTS) ? JSON.parse(readFileSync(RESULTS, 'utf8')) : {};
const key = (n: string): string => `${DIR}/${n}`;
const names = readdirSync(SONGS).filter((f) => f.endsWith('.fur')).map((f) => f.slice(0, -4)).filter((n) => !only || n === only).filter((n) => !failedOnly || results[key(n)]?.pass === false);
const toolHash = createHash('sha1').update(BIN).update(readFileSync(import.meta.filename)).update(readFileSync(path.join(ROOT, 'src/lib/export/zx/pt3Song.ts'))).update(readFileSync(path.join(ROOT, 'src/lib/export/zx/zxTap.ts'))).digest('hex');
for (const name of names) {
  const furPath = path.join(SONGS, `${name}.fur`);
  const fur = readFileSync(furPath);
  const inputHash = createHash('sha1').update(fur).update(toolHash).update(String(FRAMES)).digest('hex');
  if (!only && !failedOnly && results[key(name)]?.inputHash === inputHash) { console.log(`[SKIP] ${name}`); continue; }
  const dir = mkdtempSync(path.join(tmpdir(), 'zxpt3-'));
  let v: Verdict;
  try {
    const m = await parseFurnaceSong(fur.buffer.slice(fur.byteOffset, fur.byteOffset + fur.length));
    const song = furnaceToPt3(m, 0, m.name || name, m.author);
    const tap = buildZxPt3Tap(song.module, { bytes: new Uint8Array(BIN), ...META }, (m.name || name).slice(0, 10));
    const tapPath = OUT ? path.join(OUT, `${name}.tap`) : path.join(dir, 'song.tap');
    writeFileSync(tapPath, tap);
    const got = states(mameRegs(tapPath, FRAMES, dir), ZX_CLOCK);
    const refRaw = furnaceRegs(furPath, FRAMES, dir);
    const ref = states(refRaw.regs, refRaw.clock);
    const firstOn = (st: ChState[][]): number => st.findIndex((x) => x.some((c) => c.vol > 0));
    const lag = Math.max(0, firstOn(got) - firstOn(ref));
    const pitch = pitchDiff(ref, got, lag);
    const sounding = [0, 1, 2].map((ch) => got.filter((f) => f[ch].vol > 0).length);
    if (DUMP) for (let t = DUMP[0]; t <= DUMP[1] && t < ref.length; t++) console.log(t, ref[t].map((x) => `${x.hz?.toFixed(0) ?? '-'}/${x.vol}`.padStart(9)).join(' '), ' | ', (got[t + lag] ?? []).map((x) => `${x.hz?.toFixed(0) ?? '-'}/${x.vol}`.padStart(9)).join(' '));
    const pitchOk = pitch.every((d, i) => !song.channelsWithNotes[i] || (d.pitchBad <= PITCH_FAIL_SHARE * d.both && (d.envBad ?? 0) <= PITCH_FAIL_SHARE * Math.max(1, d.envBoth ?? 0)));
    v = { inputHash, pass: got.length >= FRAMES && song.channelsWithNotes.every((n, i) => !n || sounding[i] > 0) && pitchOk, frames: got.length, sounding, hasNotes: song.channelsWithNotes, pitch, lag, lossy: song.lossy, tapBytes: tap.length };
  } catch (e) {
    v = { inputHash, pass: false, frames: 0, sounding: [], hasNotes: [], error: e instanceof Error ? e.message : String(e) };
  } finally { rmSync(dir, { recursive: true, force: true }); }
  results[key(name)] = v;
  writeFileSync(RESULTS, `${JSON.stringify(results, null, 1)}\n`);
  v.pitch?.forEach((d, i) => console.log(`  ch${i} both=${d.both} pitchBad=${d.pitchBad} volBad=${d.volBad} onlyRef=${d.onlyRef} onlyGot=${d.onlyGot} env=${d.envBad ?? 0}/${d.envBoth ?? 0} noiseBad=${d.noiseBad ?? 0} ${d.first ?? ''} ${d.envFirst ?? ''}`));
  console.log(`${v.pass ? '[OK]' : '[FAIL]'} ${name} frames=${v.frames} sound=${v.sounding.join('/')} notes=${v.hasNotes.map((n) => (n ? 1 : 0)).join('')} lag=${v.lag ?? '-'} lossy=${v.lossy?.length ?? '-'}${v.error ? ` error=${v.error}` : ''}`);
}
