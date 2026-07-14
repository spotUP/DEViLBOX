/** probe-vib-compare.ts — the golden $20 stream is proven cycle-true (render-independent,
 * emit-ch1-diag). So native's residual is a real vibrato bug, not an oracle artifact. Dump
 * native per-fire vibIndex($26)/vibPhase($24)/period vs the true golden period to locate where
 * the vibrato depth/phase diverges, and test whether vibrato advancing exactly ONCE per fire
 * (uniform ciaTick=1024, vibrato on the vblank not the CIA clock) reproduces golden better than
 * the 881.5 two-clock model. NOT committed. */
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

function dump(name: string, ciaTick: number): void {
  const score = parseSunTronicV13Score(new Uint8Array(readFileSync(resolve(CORPUS, name))));
  const player = new SunTronicPlayer(score, { subsong: 0, ciaTickSamples: ciaTick });
  const g = golden.modules[name];
  console.log(`\n== ${name}  ciaTick=${ciaTick}  (native[i] vs golden[i-1], v0) ==`);
  let bad = 0;
  const rows: string[] = [];
  for (let i = 0; i < 24; i++) {
    const dbg = player.debugVoice(0);
    const nv = player.tick().voices[0];
    if (i - 1 < 0) continue;
    const gp = g[i - 1].voices[0].period;
    const mark = gp !== nv.period ? ' <<' : '';
    if (gp !== nv.period) bad++;
    rows.push(`  t${i}: idx${dbg.vibIndex} ph${dbg.vibPhase} nat_p${nv.period} gold_p${gp}${mark}`);
  }
  console.log(rows.join('\n'));
  // full mismatch count
  let tot = 0;
  const p2 = new SunTronicPlayer(score, { subsong: 0, ciaTickSamples: ciaTick });
  for (let i = 0; i - 1 < g.length; i++) {
    const nv = p2.tick().voices; if (i - 1 < 0) continue; const gg = g[i - 1].voices;
    for (let v = 0; v < 4; v++) if (gg[v].period !== nv[v].period || gg[v].acc !== (nv[v].acc & 0xffff) || gg[v].flags !== nv[v].flags) tot++;
  }
  console.log(`  first-24 v0 mismatches=${bad}   full 4-voice mismatches=${tot}`);
}

for (const n of ['gliders.src', 'ballblaser.src']) {
  dump(n, 881.5);
  dump(n, 1024);
}
