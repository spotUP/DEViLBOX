/** probe-per-fire.ts — HYPOTHESIS TEST. The committed golden latches once per vblank
 * FIRE (~882.759 samples), but SunTronicPlayer.renderTimeline emits once per 1024-sample
 * bucket while running 1-2 stepAll per bucket (double-position clock). That inflates the
 * apparent tick rate — masked by gliders' long stable notes, exposed by ballblaser's
 * note-change residuals. Here we emit ONE snapshot per single stepAll (per fire) and
 * compare 1:1 to golden at both alignments, for both songs. If per-fire emit gives 0
 * mismatches on BOTH, the emit granularity was the bug. */
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

interface Row { period: number; acc: number; flags: number }

function perFire(name: string, n: number): Row[] {
  const data = new Uint8Array(readFileSync(join(CORPUS, name)));
  const score = parseSunTronicV13Score(data);
  const pl = new SunTronicPlayer(score, { subsong: 0 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyPl = pl as any;
  const out: Row[] = [];
  const snap = (): void => {
    out.push({
      voices: anyPl.voices.map((v: { period: number; pitch: number; flags: number }) => ({
        period: v.period, acc: v.pitch & 0xffff, flags: v.flags & 0xff,
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  };
  // ctor already ran the priming stepAll(s). Snapshot the initial state, then one
  // stepAll per fire.
  for (let i = 0; i < n; i++) {
    anyPl.stepAll();
    snap();
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return out.map((o: any) => o.voices);
}

for (const name of Object.keys(golden.modules)) {
  const samples = golden.modules[name];
  const fires = perFire(name, samples.length + 2) as unknown as { period: number; acc: number; flags: number }[][];
  for (const shift of [0, 1, -1]) {
    let mm = 0; const det: string[] = [];
    for (let i = 0; i < samples.length; i++) {
      const g = samples[i].voices;
      const f = fires[i + shift];
      if (!f) { mm += 4; continue; }
      for (let v = 0; v < 4; v++) {
        if (g[v].period !== f[v].period || g[v].acc !== (f[v].acc & 0xffff)) {
          mm++; if (det.length < 6) det.push(`t${i}v${v}dP${f[v].period - g[v].period}`);
        }
      }
    }
    // eslint-disable-next-line no-console
    console.log(`${name} shift=${shift}: ${mm}/${samples.length * 4}  ${det.join(' ')}`);
  }
}
