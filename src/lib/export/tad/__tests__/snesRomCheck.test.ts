/**
 * Headless check, SNES Terrific Audio Driver route: .fur -> tadSongWriter -> tad-compiler wasm -> DEViLBOX player .sfc
 * -> Mesen2 (--testRunner, no window) with a write tap on the SPC700's $F2/$F3 (S-DSP address/data) -> KON ($4C) events
 * per voice, stamped in SPC cycles. Reference: the Furnace CLI's `-view commands` NOTE_ON per channel and tick (tick / hz s).
 * keyOnMatch = share of Furnace NOTE_ONs (first SECONDS - 1 s) whose channel has a KON within 30 ms; both sides start at
 * their first note. pass = the ROM keyed voices on. Not a CI test: it runs only when tools/snes-rom-check.ts sets SNES_ROM_CHECK
 * (vitest, because tadAudioRam.ts imports a Vite `?raw` asset). Results: test-data/snes-rom-check.json, skips recorded hashes.
 */
import { describe, it } from 'vitest';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { parseFurnaceSong, toSequencerSamples, buildFurnaceNativeData } from '@/lib/import/formats/FurnaceSongParser';
import { buildTadProject, tadInstrumentFromFurnace } from '../tadProjectBuilder';
import type { CreateTadCompiler } from '../tadCompilerWasm';

const ROOT = path.resolve(__dirname, '../../../../..');
const SONGS = path.join(ROOT, 'public/data/songs/furnace/snes');
const RESULTS = path.join(ROOT, 'test-data/snes-rom-check.json');
const TAD = path.join(ROOT, 'public/tad');
const MESEN = path.join(homedir(), 'Applications/Mesen.app/Contents/MacOS/Mesen');
const FURNACE = process.env.FURNACE_CLI ?? '/Applications/Furnace.app/Contents/MacOS/furnace';
const SECONDS = Number(process.env.SNES_SECONDS ?? 20);
const ONLY = process.env.SNES_ONLY;
const FAILED = process.env.SNES_FAILED === '1';
const SPC_HZ = 2048000; // Mesen2 spc.cycle rate (measured: 409126 cycles over 12 NTSC frames)

interface Verdict { inputHash: string; pass: boolean; seconds: number; warnings?: string[]; konEvents?: number; furnaceNoteOns?: number; keyOnMatch?: number; perChannel?: string; error?: string }
type Ev = { t: number; ch: number };

function mesenKeyOns(rom: Uint8Array, dir: string): Ev[] {
  writeFileSync(path.join(dir, 'p.sfc'), rom);
  const frames = Math.ceil(SECONDS * 60.1);
  writeFileSync(path.join(dir, 'tap.lua'), `local f=0 local a=0
emu.addEventCallback(function() f=f+1 if f>=${frames} then print("DONE") emu.stop(0) end end, emu.eventType.endFrame)
emu.addMemoryCallback(function(ad,v) if ad==0xF2 then a=v elseif a==0x4C and v~=0 then print(string.format("K %d %d",emu.getState()["spc.cycle"],v)) end end, emu.callbackType.write, 0xF2, 0xF3, emu.cpuType.spc, emu.memType.spcMemory)
`);
  const out = execFileSync(MESEN, ['--testRunner', `--timeout=${SECONDS * 3 + 30}`, '--doNotSaveSettings', '--enableStdout', path.join(dir, 'tap.lua'), path.join(dir, 'p.sfc')],
    { encoding: 'utf8', timeout: (SECONDS * 3 + 60) * 1000, maxBuffer: 1 << 26 });
  if (!out.includes('DONE')) throw new Error('Mesen2 stopped before the requested frames');
  const ev: Ev[] = [];
  for (const l of out.split('\n')) {
    const m = /^K (\d+) (\d+)/.exec(l);
    if (m) for (let c = 0; c < 8; c++) if (Number(m[2]) & (1 << c)) ev.push({ t: Number(m[1]) / SPC_HZ, ch: c });
  }
  return ev;
}

function furnaceNoteOns(fur: string, hz: number): Ev[] {
  const view = execFileSync(FURNACE, ['-output', '/dev/null', '-loops', '0', '-view', 'commands', fur], { maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'], timeout: 180000 }).toString();
  const ev: Ev[] = [];
  for (const l of view.split('\n')) {
    const m = /^\s*(\d+) \| (\d+): NOTE_ON\(/.exec(l);
    if (m) ev.push({ t: Number(m[1]) / hz, ch: Number(m[2]) });
  }
  return ev;
}

describe.runIf(process.env.SNES_ROM_CHECK === '1')('snes-rom-check', () => {
  it('measures every SNES .fur through TAD in Mesen2', async () => {
    // @ts-expect-error generated JS module
    const { default: create } = await import('../../../../../public/tad/tad-compiler.js');
    const results: Record<string, Verdict> = existsSync(RESULTS) ? JSON.parse(readFileSync(RESULTS, 'utf8')) : {};
    const toolHash = createHash('sha1');
    for (const f of ['src/lib/export/tad/tadSongWriter.ts', 'src/lib/export/tad/tadProjectBuilder.ts', 'public/tad/player-devilbox-lorom.sfc', 'public/tad/tad_compiler.wasm']) toolHash.update(readFileSync(path.join(ROOT, f)));
    const tool = toolHash.digest('hex');
    const names = readdirSync(SONGS).filter((f) => f.endsWith('.fur')).map((f) => f.slice(0, -4))
      .filter((n) => !ONLY || n === ONLY).filter((n) => !FAILED || results[n]?.pass === false);
    for (const name of names) {
      const furPath = path.join(SONGS, `${name}.fur`);
      const buf = readFileSync(furPath);
      const inputHash = createHash('sha1').update(buf).update(tool).update(String(SECONDS)).digest('hex');
      if (!ONLY && !FAILED && results[name]?.inputHash === inputHash) { console.log(`[SKIP] ${name}`); continue; }
      const dir = mkdtempSync(path.join(tmpdir(), 'snesrom-'));
      let v: Verdict;
      try {
        const module = await parseFurnaceSong(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
        const file = { title: module.name || name, native: buildFurnaceNativeData(module), instruments: module.instruments.map((i) => tadInstrumentFromFurnace(i.name, i)), samples: toSequencerSamples(module), wavetables: module.wavetables };
        const r = await buildTadProject([file], create as CreateTadCompiler, (f) => path.join(TAD, f), async (f) => new Uint8Array(readFileSync(path.join(TAD, f))));
        if (!r.playerRom) throw new Error(`no player ROM: ${r.warnings.slice(0, 3).join(' | ')}`);
        const got = mesenKeyOns(r.playerRom, dir);
        v = { inputHash, pass: got.length > 0, seconds: SECONDS, warnings: r.warnings, konEvents: got.length };
        if (existsSync(FURNACE)) {
          const want0 = furnaceNoteOns(furPath, module.subsongs[0].hz);
          const g0 = got[0]?.t ?? 0, w0 = want0[0]?.t ?? 0;
          const g = got.map((e) => ({ t: e.t - g0, ch: e.ch }));
          const want = want0.map((e) => ({ t: e.t - w0, ch: e.ch })).filter((e) => e.t < SECONDS - 1);
          const hitOf = (w: Ev) => g.some((x) => x.ch === w.ch && Math.abs(x.t - w.t) < 0.03);
          const hit = want.filter(hitOf).length;
          const per = Array.from({ length: 8 }, (_, c) => { const w = want.filter((e) => e.ch === c); return w.length ? `${c}:${w.filter(hitOf).length}/${w.length}` : ''; }).filter(Boolean).join(' ');
          Object.assign(v, { furnaceNoteOns: want.length, keyOnMatch: want.length ? Math.round((hit / want.length) * 10000) / 100 : 0, perChannel: per });
          if (process.env.SNES_DIAG) for (const w of want) if (!hitOf(w)) console.log(`[MISS] ${name} ch${w.ch} ${w.t.toFixed(3)} nearest ${g.filter((x) => x.ch === w.ch).map((x) => x.t - w.t).sort((a, b) => Math.abs(a) - Math.abs(b))[0]?.toFixed(3) ?? 'none'}`);
        }
      } catch (e) {
        v = { inputHash, pass: false, seconds: SECONDS, error: e instanceof Error ? e.message : String(e) };
      } finally { rmSync(dir, { recursive: true, force: true }); }
      results[name] = v;
      writeFileSync(RESULTS, `${JSON.stringify(results, null, 1)}\n`);
      console.log(`[${v.pass ? 'PASS' : 'FAIL'}] ${name} ${JSON.stringify({ ...v, inputHash: undefined, warnings: v.warnings?.length })}`);
    }
  }, 6 * 60 * 60 * 1000);
});
