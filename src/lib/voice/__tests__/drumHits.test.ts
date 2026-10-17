import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { BAND_COUNT, DRUM_CLASSES, FEATURE_COUNT, classifyByRules, detectHits, detectOnsets, featureVector, hitFeatures, type DrumClass } from '../drumHits';
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

describe('features v2: bands, centroid, flatness, attack (WD-1)', () => {
  const SR = PITCH_SAMPLE_RATE;
  const sine = (hz: number) => Float32Array.from({ length: SR / 4 }, (_, i) => 0.5 * Math.sin((2 * Math.PI * hz * i) / SR));
  /** Deterministic white noise (LCG), so the test never flakes. */
  const noise = () => {
    let x = 12345;
    return Float32Array.from({ length: SR / 4 }, () => {
      x = (x * 1103515245 + 12345) % 2147483648;
      return x / 1073741824 - 1;
    });
  };

  it('the vector has FEATURE_COUNT finite values and the bands sum to 1', () => {
    for (const f of [hitFeatures(sine(100), 0), hitFeatures(noise(), 0), hitFeatures(synthHit('snare', 1), 0)]) {
      expect(f.bands).toHaveLength(BAND_COUNT);
      expect(f.bands.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
      const v = featureVector(f);
      expect(v).toHaveLength(FEATURE_COUNT);
      expect(v.every(Number.isFinite)).toBe(true);
    }
  });

  it('a 100 Hz sine puts its energy in the lowest band, a 5 kHz sine in the second highest', () => {
    const low = hitFeatures(sine(100), 0).bands;
    expect(low.indexOf(Math.max(...low))).toBe(0);
    const high = hitFeatures(sine(5000), 0).bands;
    expect(high.indexOf(Math.max(...high))).toBe(BAND_COUNT - 2);
  });

  it('the centroid follows the pitch; white noise is flat and centred, a sine is not flat', () => {
    expect(hitFeatures(sine(1000), 0).centroid).toBeCloseTo(1000 / (SR / 2), 1);
    const n = hitFeatures(noise(), 0);
    expect(n.centroid).toBeGreaterThan(0.4);
    expect(n.centroid).toBeLessThan(0.6);
    expect(n.flatness).toBeGreaterThan(0.4);
    expect(hitFeatures(sine(1000), 0).flatness).toBeLessThan(0.05);
  });

  it('attack is near 0 for a sharp click and grows when the peak comes late', () => {
    expect(hitFeatures(synthHit('kick', 1), 0).attack).toBeLessThan(0.1);
    const late = new Float32Array(SR / 4);
    const peakAt = Math.round(0.03 * SR); // 30 ms of a 60 ms window
    for (let i = 0; i < late.length; i++) late[i] = Math.sin(i * 0.3) * Math.max(0, 1 - Math.abs(i - peakAt) / peakAt);
    const a = hitFeatures(late, 0).attack;
    expect(a).toBeGreaterThan(0.4);
    expect(a).toBeLessThan(0.6);
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

  // Regression (owner report 2026-10-17, "the drum recorder fails to identify my
  // kicks"): one crisp hit raised the flux threshold through its floor*peakMax
  // term, so every slow-attack mouth kick a few dB quieter fell under it. Measured
  // on a real take: threshold 1.01, the kicks' flux 0.6 to 0.95, all other gates
  // passed. A soft bump 35 dB under the loudest hit still stays out.
  it('finds slow-attack kicks that are quieter than one sharp hit in the take', () => {
    const SR = PITCH_SAMPLE_RATE;
    const take = new Float32Array(Math.round(SR * 2.8));
    let seed = 5;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296 - 0.5;
    };
    for (let i = 0; i < take.length; i++) take[i] = rnd() * 0.006; // room at -50 dBFS peak
    // A mouth kick: a 60 Hz tone whose level grows exponentially over `attack`
    // seconds (so the log-magnitude flux stays low on every hop), then decays.
    const mouthKick = (at: number, gain: number, attack: number) => {
      const start = Math.round(at * SR);
      const ramp = Math.round(attack * SR);
      let phase = 0;
      for (let j = 0; j < Math.round(0.25 * SR) && start + j < take.length; j++) {
        phase += (2 * Math.PI * 60) / SR;
        const env = Math.min(1, Math.exp((j - ramp) / (ramp / 4.6))) * Math.exp(-Math.max(0, j - ramp) / (0.12 * SR));
        take[start + j] += gain * env * Math.sin(phase);
      }
    };
    // A crisp hit: broadband noise from one sample, 15 ms decay
    const crispHit = (at: number, gain: number) => {
      const start = Math.round(at * SR);
      for (let j = 0; j < Math.round(0.05 * SR); j++) take[start + j] += gain * rnd() * 2 * Math.exp(-j / (0.015 * SR));
    };
    const kicks = [0.3, 0.7, 1.5, 1.9, 2.3];
    kicks.forEach((t) => mouthKick(t, 0.2, 0.07));
    crispHit(1.1, 0.25);
    mouthKick(2.6, 0.005, 0.07); // 32 dB under the kicks: background, not a hit
    const expected = [...kicks, 1.1].sort((a, b) => a - b);
    const onsets = detectOnsets(take);
    expect(onsets.length, onsets.join(' ')).toBe(expected.length);
    onsets.forEach((t, i) => expect(Math.abs(t - expected[i])).toBeLessThan(0.02));
    expect(detectHits(take).filter((h) => h.drum === 'kick').length).toBe(kicks.length);
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
