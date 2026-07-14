/** probe-float-sweep.ts — the greedy v0 schedule (probe-greedy-schedule) puts the FIRST vibrato
 * double at fire 5 (881.5+phase0 puts it at fire 7), rate ~1.159/fire ⇒ cia≈883.5 WITH a phase
 * seed. Sweep the plain per-fire float CIA accumulator (ciaTickSamples, rowPhaseSamples) for the
 * minimum ALL-VOICE golden mismatch across both songs. The golden is proven cycle-true
 * (emit-ch1-diag) so this targets the real replayer clock, not an artifact. NOT committed. */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const CORPUS = resolve(REPO, 'public/data/songs/formats/SUNTronicTunes');
const GOLDEN = resolve(REPO, 'src/engine/suntronic/__tests__/sunTronicNoteTimeline.golden.json');
interface Row { period: number; acc: number; vol: number; flags: number }
const golden: { modules: Record<string, { tick: number; voices: Row[] }[]> } = JSON.parse(readFileSync(GOLDEN, 'utf8'));
const NAMES = ['gliders.src', 'ballblaser.src'];
const scores = new Map(NAMES.map((n) => [n, parseSunTronicV13Score(new Uint8Array(readFileSync(resolve(CORPUS, n))))]));

function mism(name: string, cia: number, phase: number): number {
  const g = golden.modules[name];
  const p = new SunTronicPlayer(scores.get(name)!, { subsong: 0, ciaTickSamples: cia, rowPhaseSamples: phase });
  let bad = 0;
  for (let i = 0; i - 1 < g.length; i++) {
    const nv = p.tick().voices; if (i - 1 < 0) continue; const gg = g[i - 1].voices;
    for (let v = 0; v < 4; v++) if (gg[v].period !== nv[v].period || gg[v].acc !== (nv[v].acc & 0xffff) || gg[v].flags !== nv[v].flags) bad++;
  }
  return bad;
}

let best = { tot: Infinity, cia: 0, phase: 0, g: 0, b: 0 };
for (let cia = 878; cia <= 887; cia += 0.02) {
  for (let ph = 0; ph < cia; ph += 4) {
    const g = mism('gliders.src', cia, ph);
    if (g >= best.tot) continue;
    const b = mism('ballblaser.src', cia, ph);
    if (g + b < best.tot) best = { tot: g + b, cia, phase: ph, g, b };
  }
}
console.log(`BEST all-voice total=${best.tot} (gliders ${best.g}, ballblaser ${best.b}) ciaTick=${best.cia.toFixed(3)} rowPhase=${best.phase}`);
// print per-voice breakdown at best
for (const n of NAMES) {
  const g = golden.modules[n];
  const p = new SunTronicPlayer(scores.get(n)!, { subsong: 0, ciaTickSamples: best.cia, rowPhaseSamples: best.phase });
  const bv = [0, 0, 0, 0]; let first = -1;
  for (let i = 0; i - 1 < g.length; i++) { const nv = p.tick().voices; if (i - 1 < 0) continue; const gg = g[i - 1].voices; for (let v = 0; v < 4; v++) if (gg[v].period !== nv[v].period || gg[v].acc !== (nv[v].acc & 0xffff) || gg[v].flags !== nv[v].flags) { bv[v]++; if (first < 0) first = i; } }
  console.log(`  ${n}: byVoice=${bv.join('/')} first=t${first}`);
}
