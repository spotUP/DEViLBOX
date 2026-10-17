import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { DRUM_CLASSES, classifyByRules, detectHits, detectOnsets, hitFeatures, type DrumClass } from '../drumHits';
import { synthHit, synthTake } from '../drumSynth';
import { PITCH_SAMPLE_RATE } from '../pitchNotes';

describe('hit features and rules (synthetic signals)', () => {
  for (const drum of DRUM_CLASSES) {
    it(`classifies a synthetic ${drum} (3 noise seeds)`, () => {
      for (const seed of [1, 2, 3]) {
        const take = new Float32Array(PITCH_SAMPLE_RATE / 2);
        take.set(synthHit(drum, seed), 2000);
        const f = hitFeatures(take, 2000);
        expect(classifyByRules(f), JSON.stringify(f)).toBe(drum);
      }
    });
  }

  it('features carry the defining traits', () => {
    const feat = (d: DrumClass) => hitFeatures(synthTake([{ drum: d, at: 0 }], 0.3), 0);
    expect(feat('kick').low).toBeGreaterThan(0.55);
    expect(feat('hat').high).toBeGreaterThan(0.5);
    expect(feat('hat').zcr).toBeGreaterThan(feat('snare').zcr);
    expect(feat('clap').bursts).toBeGreaterThanOrEqual(2);
    expect(feat('snare').bursts).toBe(1);
    expect(feat('hat').decay).toBeLessThan(feat('kick').decay);
  });
});

describe('onset detection and the whole pipeline', () => {
  const pattern: { drum: DrumClass; at: number }[] = [
    { drum: 'kick', at: 0.2 },
    { drum: 'hat', at: 0.5 },
    { drum: 'snare', at: 0.8 },
    { drum: 'hat', at: 1.1 },
    { drum: 'clap', at: 1.4 },
    { drum: 'kick', at: 1.7 },
  ];
  const take = synthTake(pattern, 2.1);

  it('finds each hit within 15 ms and nothing else', () => {
    const onsets = detectOnsets(take);
    expect(onsets).toHaveLength(pattern.length);
    onsets.forEach((t, i) => expect(Math.abs(t - pattern[i].at)).toBeLessThan(0.015));
  });

  it('classifies the sequence', () => {
    expect(detectHits(take).map((h) => h.drum)).toEqual(pattern.map((p) => p.drum));
  });

  it('finds no hits in silence', () => {
    expect(detectHits(new Float32Array(PITCH_SAMPLE_RATE))).toEqual([]);
  });

  it('finds no hits in mic noise alone (quiet room, no sounds)', () => {
    let seed = 7;
    const take = new Float32Array(PITCH_SAMPLE_RATE * 2).map(() => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return (seed / 4294967296 - 0.5) * 0.004;
    });
    expect(detectHits(take)).toEqual([]);
  });

  // Regression (VNR-16): a laptop mic at the browser's default gain records mouth
  // drums at -30 to -40 dBFS with 20-40 ms attacks; the old absolute silence gate
  // kept one hit of eight, so the take wrote a single snare.
  it('finds every hit in a quiet take with slow mouth attacks (one-note symptom)', () => {
    const pattern: { drum: DrumClass; at: number }[] = [
      { drum: 'kick', at: 0.3 }, { drum: 'snare', at: 0.8 }, { drum: 'kick', at: 1.3 },
      { drum: 'snare', at: 1.8 }, { drum: 'kick', at: 2.3 }, { drum: 'kick', at: 2.55 }, { drum: 'snare', at: 2.8 },
    ];
    const take = new Float32Array(Math.round(PITCH_SAMPLE_RATE * 3.3));
    let seed = 3;
    for (let i = 0; i < take.length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      take[i] = (seed / 4294967296 - 0.5) * 0.002; // mic hiss at -60 dBFS peak
    }
    const attackSamples = Math.round(0.03 * PITCH_SAMPLE_RATE);
    pattern.forEach((h, i) => {
      const hit = synthHit(h.drum, i + 1);
      const at = Math.round(h.at * PITCH_SAMPLE_RATE);
      for (let j = 0; j < hit.length && at + j < take.length; j++) {
        take[at + j] += 0.02 * Math.min(1, j / attackSamples) * hit[j]; // peak about -34 dBFS
      }
    });
    const onsets = detectOnsets(take);
    expect(onsets.length).toBe(pattern.length);
    onsets.forEach((t, i) => expect(Math.abs(t - pattern[i].at)).toBeLessThan(0.02));
  });
});

// Real beatbox clips are owner-provided. Drop them in
// test-data/voice-beatbox/ named <kick|snare|hat|clap>-<anything>.wav (mono or stereo, any rate
// is NOT resampled here: 22050 Hz mono 16-bit WAV). The test skips while the folder is absent.
const REAL_DIR = 'test-data/voice-beatbox';
describe.skipIf(!existsSync(REAL_DIR))('real beatbox clips (owner fixtures)', () => {
  it('rules classify each clip file by its name prefix at least 60 percent of the time', async () => {
    const { readFileSync } = await import('node:fs');
    const files = readdirSync(REAL_DIR).filter((f) => f.endsWith('.wav'));
    expect(files.length).toBeGreaterThan(0);
    let ok = 0;
    for (const file of files) {
      const buf = readFileSync(`${REAL_DIR}/${file}`);
      const pcm = new Int16Array(buf.buffer.slice(buf.byteOffset + 44, buf.byteOffset + buf.length - ((buf.length - 44) % 2)));
      const samples = Float32Array.from(pcm, (v) => v / 32768);
      const hits = detectHits(samples);
      if (hits[0]?.drum === file.split('-')[0]) ok++;
    }
    expect(ok / files.length).toBeGreaterThanOrEqual(0.6);
  });
});
