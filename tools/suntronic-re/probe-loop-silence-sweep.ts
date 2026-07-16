/**
 * probe-loop-silence-sweep.ts — find songs that go SILENT on a later loop.
 *
 * Streams every corpus song for N seconds through the exact browser pump path
 * (short renderInto chunks) and flags any song that was audible early but has a
 * SILENT second later (audible -> silent transition = the "2nd-loop-silent" bug).
 *
 * Run: TSX_TSCONFIG_PATH=tsconfig.app.json npx tsx tools/suntronic-re/probe-loop-silence-sweep.ts [seconds]
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicNativeRenderer, NATIVE_SAMPLE_RATE } from '../../src/engine/suntronic/SunTronicNativeRender';
import { CORPUS_DIR, INSTR_DIR, listCorpusModules } from './suntronicLib';

const seconds = Number(process.argv[2] ?? 20);
const sr = NATIVE_SAMPLE_RATE;
const CHUNK = 2048;
const total = seconds * sr;

function secRms(name: string): Float64Array | null {
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  let score;
  try { score = parseSunTronicV13Score(data); } catch { return null; }
  const slotPcm = score.instrumentNames.map((n) => {
    const p = join(INSTR_DIR, n);
    return existsSync(p) ? new Int8Array(readFileSync(p)) : null;
  });
  const renderer = new SunTronicNativeRenderer(score, slotPcm);
  const secSum = new Float64Array(seconds);
  const l = new Float32Array(CHUNK), r = new Float32Array(CHUNK);
  let produced = 0;
  while (produced < total) {
    renderer.renderInto(l, r);
    for (let i = 0; i < CHUNK; i++) {
      const g = produced + i;
      if (g >= total) break;
      secSum[Math.floor(g / sr)] += l[i] * l[i] + r[i] * r[i];
    }
    produced += CHUNK;
  }
  return secSum.map((s) => Math.sqrt(s / (2 * sr)));
}

const songs = listCorpusModules().filter((f) => /\.(src|pc)$/i.test(f));
const flagged: string[] = [];
for (const name of songs) {
  const rms = secRms(name);
  if (!rms) continue;
  // Was it ever clearly audible, then go silent and stay silent?
  let maxEarly = 0;
  for (let s = 0; s < Math.min(4, seconds); s++) if (rms[s] > maxEarly) maxEarly = rms[s];
  if (maxEarly < 1e-3) continue; // never audible (missing instruments) — not this bug
  let firstSilent = -1;
  for (let s = 2; s < seconds; s++) {
    if (rms[s] < 1e-4) { firstSilent = s; break; }
  }
  if (firstSilent >= 0) {
    // confirm it STAYS silent
    let staysSilent = true;
    for (let s = firstSilent; s < seconds; s++) if (rms[s] > 1e-3) { staysSilent = false; break; }
    const tag = staysSilent ? 'PERMANENT' : 'dip';
    flagged.push(`${name}  audibleEarly=${maxEarly.toFixed(3)}  firstSilent@${firstSilent}s  ${tag}  [${Array.from(rms).map((x) => x.toFixed(2)).join(' ')}]`);
  }
}
console.log(`swept ${songs.length} songs @${seconds}s`);
if (flagged.length === 0) console.log('no audible->silent transitions found (render core loops for all).');
else { console.log(`${flagged.length} songs go silent after being audible:`); for (const f of flagged) console.log('  ' + f); }
