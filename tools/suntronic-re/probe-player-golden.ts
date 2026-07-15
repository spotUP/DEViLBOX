/** probe-player-golden.ts — drive the REAL SunTronicPlayer.renderTimeline() (production
 * clock, no injected schedule) against the committed golden. This validates the shipped
 * double-position tick() model end-to-end, not just an ad-hoc probe schedule. */
import { readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const CORPUS = resolve(REPO, 'public/data/songs/formats/SUNTronicTunes');
const GOLDEN = resolve(REPO, 'src/engine/suntronic/__tests__/sunTronicNoteTimeline.golden.json');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const golden: any = JSON.parse(readFileSync(GOLDEN, 'utf8'));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
for (const [name, samples] of Object.entries<any>(golden.modules)) {
  const data = new Uint8Array(readFileSync(join(CORPUS, name)));
  const score = parseSunTronicV13Score(data);
  const pl = new SunTronicPlayer(score, { subsong: 0 });
  const tl = pl.renderTimeline(samples.length);
  let mm = 0; const det: string[] = [];
  for (let i = 1; i < samples.length; i++) {
    const g = samples[i - 1].voices, mv = tl[i].voices;
    for (let v = 0; v < 4; v++) {
      if (g[v].period !== mv[v].period || g[v].acc !== mv[v].acc || (g[v].flags & 0xff) !== (mv[v].flags & 0xff)) {
        mm++; if (det.length < 8) det.push(`t${i} v${v} dP=${mv[v].period - g[v].period}`);
      }
    }
  }
  console.log(`${name}: ${mm}/316  ${det.join(' ')}`);
}

// --- detail dump for ballblaser residual buckets ---
if (process.argv.includes('--dump')) {
  const name = 'ballblaser.src';
  const samples = golden.modules[name];
  const data = new Uint8Array(readFileSync(join(CORPUS, name)));
  const score = parseSunTronicV13Score(data);
  const pl = new SunTronicPlayer(score, { subsong: 0 });
  const tl = pl.renderTimeline(samples.length);
  for (const [lo, hi] of [[9, 15], [74, 82]]) {
    console.log(`\n== ballblaser t${lo}..${hi} (g=golden[t-1], n=native[t]) ==`);
    for (let t = lo; t <= hi; t++) {
      const g = samples[t - 1].voices, n = tl[t].voices;
      const fmt = (v: number) => `v${v} g${g[v].period}/${g[v].acc.toString(16)} n${n[v].period}/${(n[v].acc & 0xffff).toString(16)}`;
      console.log(`t${t}: ${fmt(0)} | ${fmt(3)}`);
    }
  }
}
