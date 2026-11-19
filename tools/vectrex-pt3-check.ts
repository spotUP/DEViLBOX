// Headless 1:1 check, Vectrex PT3 cart: .fur (AY) -> furnaceToPt3 -> the SAME module on two players:
//   reference = Bulba's Z80 player on MAME spec128 (buildZxPt3Tap), candidate = the 6809 port (public/vectrex/pt3core.asm) on MAME vectrex.
// The cart is built with the UNSCALED ZX note table (buildVectrexPt3Cartridge clock 1773400, test only), so every register must match.
// Usage: nice -n 19 npx tsx --tsconfig tsconfig.app.json tools/vectrex-pt3-check.ts [--only <name>] [--failed] [--ticks N] [--dir ay8910]
// Results: test-data/vectrex-pt3-check.json (skips songs whose input hash matches a recorded verdict).
// A tick = one player call: both players write AY regs 0..12 in ascending order (13 only on a new envelope shape), so a write to
// reg 0 closes the previous tick. Compared per tick: regs 0-12 under the AY bit masks (unused bits are don't-care) and the reg 13
// write itself (value & 15, or none). Pass = both sides ran N ticks and no register differs after aligning the start-up bursts.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { parseFurnaceSong } from '../src/lib/import/formats/FurnaceSongParser';
import { buildZxPt3Tap, furnaceToPt3 } from '../src/lib/export/zx/pt3Song';
import { buildVectrexPt3Cartridge } from '../src/lib/export/vectrex/vectrexCartridge';

const ROOT = path.resolve(import.meta.dirname, '..');
const RESULTS = path.join(ROOT, 'test-data/vectrex-pt3-check.json');
const ZX_BIN = readFileSync(path.join(ROOT, 'public/zx/pt3player.bin'));
const ZX_META = JSON.parse(readFileSync(path.join(ROOT, 'public/zx/pt3player.json'), 'utf8'));
const VX_BIN = readFileSync(path.join(ROOT, 'public/vectrex/player.bin'));
const VX_META = JSON.parse(readFileSync(path.join(ROOT, 'public/vectrex/player.json'), 'utf8'));
const ZX_CLOCK = 1773400;
const PURPOSE = 'DEViLBOX vectrex-pt3: 1:1 AY diff';
const MASK = [0xff, 0x0f, 0xff, 0x0f, 0xff, 0x0f, 0x1f, 0x3f, 0x1f, 0x1f, 0x1f, 0xff, 0xff];
const ALIGN = 12;

const args = process.argv.slice(2);
const arg = (k: string): string | undefined => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const only = arg('--only');
const failedOnly = args.includes('--failed');
const TICKS = Number(arg('--ticks') ?? 3000);
const DIR = arg('--dir') ?? 'ay8910';
const SONGS = path.join(ROOT, 'public/data/songs/furnace', DIR);

/** regs 0..12 after the tick, then the reg 13 value written in the tick (-1 = none). */
type Tick = number[];
interface Verdict { inputHash: string; pass: boolean; ticks: [number, number]; align?: [number, number]; diffs?: number; audible?: number; perReg?: number[]; first?: string[]; lossy?: string[]; cartBytes?: number; error?: string }

// Shared Lua tick logger; `hook` installs the bus tap that calls ay(sel, value) on every AY data write.
const LUA = (outFile: string, ticks: number, hook: string, boot = ''): string => `
-- ${PURPOSE}
print("${PURPOSE}")
local out = io.open("${outFile}", "w")
local regs, e13, n, sel, done = {}, -1, 0, 0, false
for i = 0, 15 do regs[i] = 0 end
function ay(s, v)
  if done then return end
  if s == 0 then
    local t = {}
    for i = 0, 12 do t[#t + 1] = string.format("%02x", regs[i]) end
    t[#t + 1] = e13 < 0 and "--" or string.format("%02x", e13)
    out:write(table.concat(t), "\\n")
    e13 = -1
    n = n + 1
    if n >= ${ticks} then done = true; out:close() end
  end
  regs[s] = v
  if s == 13 then e13 = v end
end
${hook}
fr = 0
emu.register_frame_done(function()
  fr = fr + 1
  ${boot}
  if done then manager.machine:exit() end
end)
`;

const ZX_HOOK = `
local sp = manager.machine.devices[":maincpu"].spaces["io"]
tap_keep = sp:install_write_tap(0, 0xffff, "ay", function(off, data, mask)
  if (off & 0xc002) == 0xc000 then sel = data & 15
  elseif (off & 0xc002) == 0x8000 then ay(sel, data) end
end)
enter = manager.machine.ioport.ports[":LINE6"].fields["ENTER"]
cass = manager.machine.cassettes[":cassette"]`;
const ZX_BOOT = `enter:set_value((fr > 200 and fr < 210) and 1 or 0)
  if fr == 215 then cass:play() end`;

// Vectrex: AY behind the 6522 VIA. Port A ($D001 / $D00F) carries the byte; port B ($D000) bit 4 = BDIR, bit 3 = BC1:
// both set latches the register number, BDIR alone writes the data (BIOS Sound_Byte).
const VX_HOOK = `
local sp = manager.machine.devices[":maincpu"].spaces["program"]
local ora = 0
tap_keep = sp:install_write_tap(0xd000, 0xd7ff, "via", function(off, data, mask)
  local r = off & 15
  if r == 1 or r == 15 then ora = data
  elseif r == 0 then
    local m = data & 0x18
    if m == 0x18 then sel = ora & 15 elseif m == 0x10 then ay(sel, ora) end
  end
end)`;

function mame(machine: string, media: string[], lua: string, log: string): Tick[] {
  try {
    execFileSync('nice', ['-n', '19', 'mame', machine, '-rompath', path.join(homedir(), 'mame/roms'), ...media, '-video', 'none', '-sound', 'none', '-nothrottle',
      '-skip_gameinfo', '-seconds_to_run', '1500', '-autoboot_script', lua], { timeout: 900000, stdio: 'ignore' });
  } catch { /* exit code of a script-ended run is not trusted; the log decides */ }
  if (!existsSync(log)) return [];
  return readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => Array.from({ length: 14 }, (_, i) => (l.slice(i * 2, i * 2 + 2) === '--' ? -1 : parseInt(l.slice(i * 2, i * 2 + 2), 16))));
}

const regDiff = (a: Tick, b: Tick, r: number): boolean => (r < 13 ? (a[r] & MASK[r]) !== (b[r] & MASK[r]) : (a[13] < 0 ? -1 : a[13] & 15) !== (b[13] < 0 ? -1 : b[13] & 15));
const tickDiffs = (a: Tick, b: Tick): number => { let d = 0; for (let r = 0; r < 14; r++) if (regDiff(a, b, r)) d++; return d; };

/** Leading ticks to drop on each side (boot mute bursts differ), chosen by the fewest diffs over the next 300 ticks. */
function align(ref: Tick[], got: Tick[]): [number, number] {
  let best: [number, number] = [0, 0], bestD = Infinity;
  for (let a = 0; a <= ALIGN; a++) for (let b = 0; b <= ALIGN; b++) {
    let d = 0;
    for (let t = 0; t < 300 && t + a < ref.length && t + b < got.length && d < bestD; t++) d += tickDiffs(ref[t + a], got[t + b]);
    if (d < bestD) { bestD = d; best = [a, b]; }
  }
  return best;
}

const results: Record<string, Verdict> = existsSync(RESULTS) ? JSON.parse(readFileSync(RESULTS, 'utf8')) : {};
const key = (n: string): string => `${DIR}/${n}`;
const names = readdirSync(SONGS).filter((f) => f.endsWith('.fur')).map((f) => f.slice(0, -4)).filter((n) => !only || n === only).filter((n) => !failedOnly || results[key(n)]?.pass === false);
const toolHash = createHash('sha1').update(ZX_BIN).update(VX_BIN).update(readFileSync(import.meta.filename))
  .update(readFileSync(path.join(ROOT, 'src/lib/export/zx/pt3Song.ts'))).update(readFileSync(path.join(ROOT, 'src/lib/export/vectrex/pt3Tables.ts')))
  .update(readFileSync(path.join(ROOT, 'src/lib/export/vectrex/vectrexCartridge.ts'))).digest('hex');
for (const name of names) {
  const fur = readFileSync(path.join(SONGS, `${name}.fur`));
  const inputHash = createHash('sha1').update(fur).update(toolHash).update(String(TICKS)).digest('hex');
  if (!only && !failedOnly && results[key(name)]?.inputHash === inputHash) { console.log(`[SKIP] ${name}`); continue; }
  const dir = mkdtempSync(path.join(tmpdir(), 'vxpt3-'));
  let v: Verdict;
  try {
    const m = await parseFurnaceSong(fur.buffer.slice(fur.byteOffset, fur.byteOffset + fur.length));
    const song = furnaceToPt3(m, 0, m.name || name, m.author, ZX_CLOCK);
    const tap = path.join(dir, 'song.tap'), cart = path.join(dir, 'song.bin');
    writeFileSync(tap, buildZxPt3Tap(song.module, { bytes: new Uint8Array(ZX_BIN), ...ZX_META }, (m.name || name).slice(0, 10)));
    const { bin } = buildVectrexPt3Cartridge(song.module, { ...VX_META, bytes: new Uint8Array(VX_BIN) }, (m.name || name).slice(0, 16), 'devilbox', '', ZX_CLOCK);
    writeFileSync(cart, bin);
    writeFileSync(path.join(dir, 'zx.lua'), LUA(path.join(dir, 'zx.log'), TICKS + ALIGN, ZX_HOOK, ZX_BOOT));
    writeFileSync(path.join(dir, 'vx.lua'), LUA(path.join(dir, 'vx.log'), TICKS + ALIGN, VX_HOOK));
    const ref = mame('spec128', ['-cassette', tap], path.join(dir, 'zx.lua'), path.join(dir, 'zx.log'));
    const got = mame('vectrex', ['-cart', cart], path.join(dir, 'vx.lua'), path.join(dir, 'vx.log'));
    const [a, b] = align(ref, got);
    const perReg = new Array(14).fill(0), first: string[] = [];
    let diffs = 0;
    for (let t = 0; t < TICKS && t + a < ref.length && t + b < got.length; t++) {
      for (let r = 0; r < 14; r++) if (regDiff(ref[t + a], got[t + b], r)) {
        perReg[r]++; diffs++;
        if (first.length < 8) first.push(`t${t} r${r} zx=${ref[t + a][r]} vx=${got[t + b][r]}`);
      }
    }
    // ticks with any channel volume up on the reference side: guards against two silent captures passing as equal
    const audible = ref.slice(a, a + TICKS).filter((t) => (t[8] | t[9] | t[10]) & 0x1f).length;
    v = { inputHash, pass: ref.length - a >= TICKS && got.length - b >= TICKS && diffs === 0 && audible > 0, audible, ticks: [ref.length, got.length], align: [a, b], diffs, perReg, first, lossy: song.lossy, cartBytes: VX_META.dataOffset + song.module.length };
  } catch (e) {
    v = { inputHash, pass: false, ticks: [0, 0], error: e instanceof Error ? e.message : String(e) };
  } finally { rmSync(dir, { recursive: true, force: true }); }
  results[key(name)] = v;
  writeFileSync(RESULTS, `${JSON.stringify(results, null, 1)}\n`);
  console.log(`${v.pass ? '[OK]' : '[FAIL]'} ${name} ticks=${v.ticks.join('/')} align=${v.align?.join('/') ?? '-'} diffs=${v.diffs ?? '-'} audible=${v.audible ?? '-'} perReg=${v.perReg?.join(',') ?? '-'} lossy=${v.lossy?.length ?? '-'}${v.error ? ` error=${v.error}` : ''}`);
  v.first?.forEach((s) => console.log(`  ${s}`));
}
