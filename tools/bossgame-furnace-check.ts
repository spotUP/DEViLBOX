// Headless check: every BossGame .fur loads and renders in the installed Furnace 0.6.8.3.
// Usage: nice -n 19 npx tsx tools/bossgame-furnace-check.ts [--only <name>] [--failed]
// Results: test-data/bossgame-furnace-check.json (skips files whose mtime matches a recorded verdict).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import path from 'node:path';

const FURNACE = '/Applications/Furnace.app/Contents/MacOS/furnace';
const MUSIC = '/Users/spot/Code/Jobb/BossGame/music';
const SCRATCH = '/private/tmp/claude-501/-Users-spot-Code-DEViLBOX/29b57a6d-4b0d-431f-adf9-3ee4bba7a795/scratchpad/furnace-check';
const RESULTS = path.resolve(import.meta.dirname, '../test-data/bossgame-furnace-check.json');
const SECONDS = 10;

interface Verdict {
  mtimeMs: number; loads: boolean; error?: string; moduleVersion?: number; systems?: number;
  channels?: number; peak10s?: number; peakPerSystem?: number[]; silentSystems?: number[];
}

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const failedOnly = args.includes('--failed');
const results: Record<string, Verdict> = existsSync(RESULTS) ? JSON.parse(readFileSync(RESULTS, 'utf8')) : {};

// Peak (0..32767) of the first SECONDS of a 16-bit PCM WAV.
function wavPeak(file: string): number {
  const b = readFileSync(file);
  const dataAt = b.indexOf('data');
  const rate = b.readUInt32LE(24), ch = b.readUInt16LE(22), bits = b.readUInt16LE(34);
  if (bits !== 16) throw new Error(`unsupported ${bits}-bit WAV`);
  const end = Math.min(b.length, dataAt + 8 + SECONDS * rate * ch * 2);
  let peak = 0;
  for (let i = dataAt + 8; i + 1 < end; i += 2) peak = Math.max(peak, Math.abs(b.readInt16LE(i)));
  return peak;
}

function run(extra: string[], file: string): void {
  execFileSync('nice', ['-n', '19', FURNACE, '-console', '-nostatus', '-nocontrols', '-noreport',
    '-loglevel', 'error', '-loops', '0', ...extra, file], { timeout: 180000, stdio: 'ignore' });
}

function check(file: string): Verdict {
  const v: Verdict = { mtimeMs: statSync(file).mtimeMs, loads: false };
  try {
    const raw = readFileSync(file);
    const mod = raw[0] === 0x78 ? inflateSync(raw) : raw;
    if (mod.subarray(0, 16).toString() !== '-Furnace module-') throw new Error('bad magic');
    v.moduleVersion = mod.readUInt16LE(16);
    rmSync(SCRATCH, { recursive: true, force: true }); mkdirSync(SCRATCH, { recursive: true });
    run(['-txtout', `${SCRATCH}/o.txt`], file);
    const txt = readFileSync(`${SCRATCH}/o.txt`, 'utf8');
    const order = /orders:\n```\n([^\n]+)/.exec(txt);
    v.channels = order ? order[1].split('|')[1].trim().split(/\s+/).length : undefined;
    run(['-outmode', 'one', '-output', `${SCRATCH}/all.wav`], file);
    v.peak10s = wavPeak(`${SCRATCH}/all.wav`);
    run(['-outmode', 'persys', '-output', `${SCRATCH}/s.wav`], file);
    const parts = readdirSync(SCRATCH).filter(f => /^s_s\d+\.wav$/.test(f)).sort();
    v.systems = parts.length;
    v.peakPerSystem = parts.map(f => wavPeak(`${SCRATCH}/${f}`));
    v.silentSystems = v.peakPerSystem.flatMap((p, i) => (p === 0 ? [i + 1] : []));
    v.loads = v.peak10s > 0;
    if (!v.loads) v.error = 'renders silent';
  } catch (e) { v.error = String((e as Error).message).split('\n')[0]; }
  rmSync(SCRATCH, { recursive: true, force: true });
  return v;
}

for (const f of readdirSync(MUSIC).filter(f => f.endsWith('.fur')).sort()) {
  const name = f.replace(/\.fur$/, '');
  if (only && name !== only) continue;
  const prev = results[name];
  const file = path.join(MUSIC, f);
  if (failedOnly ? !prev || (prev.loads && !prev.silentSystems?.length) : prev && prev.mtimeMs === statSync(file).mtimeMs) continue;
  results[name] = check(file);
  writeFileSync(RESULTS, JSON.stringify(results, null, 2) + '\n');
  const r = results[name];
  console.log(name.padEnd(12), r.loads ? 'OK  ' : 'FAIL', `v${r.moduleVersion} sys=${r.systems} ch=${r.channels} peak=${r.peak10s} perSys=${r.peakPerSystem} ${r.error ?? ''}`);
}
