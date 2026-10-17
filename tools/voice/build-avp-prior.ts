/**
 * Builds the drum classifier's fallback prior from the Amateur Vocal
 * Percussion dataset (Delgado et al., zenodo 3250230, CC BY 4.0).
 *
 * Offline, run once by hand; nothing at build time depends on the dataset.
 *
 *   curl -L -o <dir>/AVP_Dataset.zip https://zenodo.org/api/records/3250230/files/AVP_Dataset.zip/content
 *   unzip -q <dir>/AVP_Dataset.zip -d <dir>
 *   npx tsx --tsconfig tsconfig.app.json tools/voice/build-avp-prior.ts <dir>/AVP_Dataset
 *
 * Every Kick / Snare / HHclosed / HHopened recording (Fixed and Personal
 * sessions; Improvisation is skipped) is downmixed, resampled to the voice
 * engine's 22050 Hz, and run through the same detectOnsets + hitFeatures the
 * app runs on a take. A detected onset counts only when it lies within
 * MATCH_SECONDS of an annotated onset, so breaths and clicks the detector
 * picks up never enter the prior. Closed and open hats both map to hat; AVP
 * has no clap, so the prior has none either.
 *
 * PER_CLASS hits per class are kept, taken round-robin across performers so
 * no single voice dominates. Writes src/lib/voice/data/avpPrior.json and
 * prints the class balance plus a leave-one-performer-out 3-NN accuracy over
 * every matched hit, as a check on the features.
 */
import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { decodeWavBytes } from '../../src/bridge/analysis/SampleSpectrum';
import { resamplePoly } from '../../src/engine/dj/scratch/refDsp';
import { detectOnsets, featureVector, hitFeatures, FEATURE_COUNT, type DrumClass } from '../../src/lib/voice/drumHits';
import { PITCH_SAMPLE_RATE } from '../../src/lib/voice/pitchNotes';

const PER_CLASS = 60;
const MATCH_SECONDS = 0.05;
const OUT = 'src/lib/voice/data/avpPrior.json';

const FILE_CLASS: Record<string, DrumClass> = { Kick: 'kick', Snare: 'snare', HHclosed: 'hat', HHopened: 'hat' };

interface Hit {
  drum: DrumClass;
  performer: string;
  vector: number[];
}

function* recordings(root: string): Generator<{ wav: string; csv: string; drum: DrumClass; performer: string }> {
  for (const session of ['Fixed', 'Personal']) {
    const dir = join(root, session);
    for (const p of readdirSync(dir).filter((d) => d.startsWith('Participant_')).sort()) {
      for (const f of readdirSync(join(dir, p)).filter((n) => n.endsWith('.wav')).sort()) {
        const kind = basename(f, '.wav').split('_')[1];
        const drum = FILE_CLASS[kind];
        if (!drum) continue;
        const wav = join(dir, p, f);
        yield { wav, csv: wav.replace(/\.wav$/, '.csv'), drum, performer: p };
      }
    }
  }
}

function annotations(csv: string): number[] {
  return readFileSync(csv, 'utf8')
    .split('\n')
    .map((l) => Number.parseFloat(l.split(',')[0]))
    .filter((t) => Number.isFinite(t));
}

function hitsOf(rec: { wav: string; csv: string; drum: DrumClass; performer: string }): { hits: Hit[]; annotated: number } {
  const pcm = decodeWavBytes(new Uint8Array(readFileSync(rec.wav)));
  if (!pcm) throw new Error(`cannot decode ${rec.wav}`);
  const samples = pcm.sampleRate === PITCH_SAMPLE_RATE ? pcm.pcm : Float32Array.from(resamplePoly(pcm.pcm, PITCH_SAMPLE_RATE, pcm.sampleRate));
  const truth = annotations(rec.csv);
  const hits: Hit[] = [];
  for (const t of detectOnsets(samples, PITCH_SAMPLE_RATE)) {
    if (!truth.some((a) => Math.abs(a - t) <= MATCH_SECONDS)) continue;
    const f = hitFeatures(samples, Math.round(t * PITCH_SAMPLE_RATE), PITCH_SAMPLE_RATE);
    hits.push({ drum: rec.drum, performer: rec.performer, vector: featureVector(f) });
  }
  return { hits, annotated: truth.length };
}

/** Round-robin over performers (and within a performer, over their hits in order). */
function spread(hits: Hit[], n: number): Hit[] {
  const by = new Map<string, Hit[]>();
  for (const h of hits) by.set(h.performer, [...(by.get(h.performer) ?? []), h]);
  const queues = [...by.values()].map((q) => {
    // interleave so one performer's picks are spread across their takes, not the first few hits
    const step = Math.max(1, Math.floor(q.length / Math.ceil(n / by.size)));
    return q.filter((_, i) => i % step === 0).concat(q.filter((_, i) => i % step !== 0));
  });
  const out: Hit[] = [];
  for (let round = 0; out.length < n && queues.some((q) => q.length > round); round++) {
    for (const q of queues) if (q[round] && out.length < n) out.push(q[round]);
  }
  return out;
}

function zscore(rows: number[][]): { mean: number[]; sd: number[] } {
  const mean = new Array(FEATURE_COUNT).fill(0);
  const sd = new Array(FEATURE_COUNT).fill(0);
  for (const r of rows) r.forEach((v, i) => (mean[i] += v / rows.length));
  for (const r of rows) r.forEach((v, i) => (sd[i] += (v - mean[i]) ** 2 / rows.length));
  return { mean, sd: sd.map((v) => Math.sqrt(v) || 1) };
}

function leaveOnePerformerOut(hits: Hit[]): number {
  const { mean, sd } = zscore(hits.map((h) => h.vector));
  const z = hits.map((h) => h.vector.map((v, i) => (v - mean[i]) / sd[i]));
  let right = 0;
  hits.forEach((h, i) => {
    const near = hits
      .map((o, j) => ({ o, d: o.performer === h.performer ? Infinity : z[i].reduce((s, v, k) => s + (v - z[j][k]) ** 2, 0) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 3);
    const votes = new Map<DrumClass, number>();
    for (const { o } of near) votes.set(o.drum, (votes.get(o.drum) ?? 0) + 1);
    const best = [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0];
    if (best === h.drum) right++;
  });
  return right / hits.length;
}

function main(): void {
  const root = process.argv[2];
  if (!root || !statSync(root).isDirectory()) throw new Error('usage: npx tsx --tsconfig tsconfig.app.json tools/voice/build-avp-prior.ts <AVP_Dataset dir>');
  const all: Hit[] = [];
  const annotated: Record<string, number> = {};
  for (const rec of recordings(root)) {
    const { hits, annotated: n } = hitsOf(rec);
    annotated[rec.drum] = (annotated[rec.drum] ?? 0) + n;
    all.push(...hits);
  }
  const classes: DrumClass[] = ['kick', 'snare', 'hat'];
  const kept = classes.flatMap((c) => spread(all.filter((h) => h.drum === c), PER_CLASS));
  for (const c of classes) {
    const matched = all.filter((h) => h.drum === c).length;
    const performers = new Set(kept.filter((h) => h.drum === c).map((h) => h.performer)).size;
    console.log(`${c}: annotated ${annotated[c]}, detected+matched ${matched}, kept ${kept.filter((h) => h.drum === c).length} from ${performers} performers`);
  }
  console.log(`leave-one-performer-out 3-NN accuracy over ${all.length} matched hits: ${(leaveOnePerformerOut(all) * 100).toFixed(1)} %`);
  const prior = {
    source: 'Amateur Vocal Percussion Dataset, A. Delgado, doi:10.5281/zenodo.3250230, CC BY 4.0 (see AVP_NOTICE.md)',
    sampleRate: PITCH_SAMPLE_RATE,
    featureCount: FEATURE_COUNT,
    samples: kept.map((h) => ({ drum: h.drum, vector: h.vector.map((v) => Number(v.toPrecision(5))) })),
  };
  writeFileSync(OUT, `${JSON.stringify(prior)}\n`);
  console.log(`wrote ${OUT} (${prior.samples.length} samples)`);
}

main();
