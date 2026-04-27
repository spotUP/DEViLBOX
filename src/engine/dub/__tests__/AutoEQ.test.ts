import { describe, it, expect } from 'vitest';
import {
  computeGenreBaseline,
  computeInstrumentModulation,
  computeSpectralCompensation,
  computeAutoEQ,
  detectLoFiSources,
} from '../AutoEQ';
import type { FullAnalysisResult } from '@/stores/useTrackerAnalysisStore';
import type { InstrumentHints } from '@/workers/dj-analysis.worker';

const makeAnalysis = (primary: string, energy = 0.7, danceability = 0.6): FullAnalysisResult => ({
  bpm: 90, bpmConfidence: 0.9, musicalKey: 'C', keyConfidence: 0.8,
  rmsDb: -18, peakDb: -6, analyzedAt: Date.now(),
  genre: {
    primary, subgenre: '', confidence: 0.8, mood: 'Chill', energy, danceability,
    bpm: 90, bpmConfidence: 0.9, musicalKey: 'C', keyConfidence: 0.8,
  },
  frequencyPeaks: [],
});

const NO_HINTS: InstrumentHints = {
  hasGuitar: false, hasBass: false, hasPercussion: false, hasPiano: false,
  hasStrings: false, hasBrass: false, hasWind: false, hasVoice: false,
  hasSynth: false, hasOrgan: false,
};

describe('computeGenreBaseline', () => {
  it('reggae produces positive sub shelf gain', () => {
    const curve = computeGenreBaseline('Reggae', 0.7, 0.6);
    expect(curve.ls.gain).toBeGreaterThan(0);
    expect(curve.ls.enabled).toBe(true);
  });

  it('reggae sub shelf is around 70 Hz', () => {
    const curve = computeGenreBaseline('Reggae', 0.7, 0.6);
    expect(curve.ls.freq).toBeGreaterThanOrEqual(60);
    expect(curve.ls.freq).toBeLessThanOrEqual(90);
  });

  it('reggae has low-mid cut', () => {
    const curve = computeGenreBaseline('Reggae', 0.7, 0.6);
    expect(curve.p0.gain).toBeLessThan(0);
    expect(curve.p0.enabled).toBe(true);
  });

  it('jazz has no low-mid cut', () => {
    const curve = computeGenreBaseline('Jazz', 0.5, 0.4);
    expect(curve.p0.enabled).toBe(false);
  });

  it('high energy track gets more gain than low energy', () => {
    const hi = computeGenreBaseline('Rock', 1.0, 0.5);
    const lo = computeGenreBaseline('Rock', 0.0, 0.5);
    expect(hi.ls.gain).toBeGreaterThan(lo.ls.gain ?? 0);
  });

  it('all 8 genres produce valid curves', () => {
    const genres = ['Reggae', 'Electronic', 'Hip-Hop', 'Rock', 'Jazz', 'Classical', 'Blues', 'Unknown'];
    for (const g of genres) {
      const curve = computeGenreBaseline(g, 0.7, 0.6);
      expect(curve.ls.freq).toBeGreaterThan(0);
      expect(curve.hp.freq).toBeGreaterThan(0);
    }
  });
});

describe('computeInstrumentModulation', () => {
  it('hasBass increases sub gain in full pipeline', () => {
    const withBass = computeAutoEQ(makeAnalysis('Unknown'), { ...NO_HINTS, hasBass: true }, 1.0);
    const without  = computeAutoEQ(makeAnalysis('Unknown'), NO_HINTS, 1.0);
    expect(withBass.params.ls?.gain ?? 0).toBeGreaterThan(without.params.ls?.gain ?? 0);
  });

  it('hasPercussion increases presence gain', () => {
    const withPerc = computeAutoEQ(makeAnalysis('Unknown'), { ...NO_HINTS, hasPercussion: true }, 1.0);
    const without  = computeAutoEQ(makeAnalysis('Unknown'), NO_HINTS, 1.0);
    expect(withPerc.params.p?.[1]?.gain ?? 0).toBeGreaterThan(without.params.p?.[1]?.gain ?? 0);
  });

  it('hasSynth increases air gain', () => {
    const withSynth = computeAutoEQ(makeAnalysis('Unknown'), { ...NO_HINTS, hasSynth: true }, 1.0);
    const without   = computeAutoEQ(makeAnalysis('Unknown'), NO_HINTS, 1.0);
    expect(withSynth.params.hs?.gain ?? 0).toBeGreaterThan(without.params.hs?.gain ?? 0);
  });
});

describe('computeSpectralCompensation', () => {
  it('empty peaks return curve unchanged', () => {
    const baseline = computeGenreBaseline('Unknown', 0.7, 0.5);
    const result   = computeSpectralCompensation([], baseline);
    expect(result.p2.gain).toBe(baseline.p2.gain);
  });

  it('pile-up at 300 Hz creates a cut on p0', () => {
    const peaks: number[][] = Array.from({ length: 5 }, (_, i) => [250 + i * 20, 8]);
    const baseline = computeGenreBaseline('Unknown', 0.7, 0.5);
    const result   = computeSpectralCompensation(peaks, baseline);
    expect(result.p0.gain).toBeLessThan(baseline.p0.gain ?? 0);
  });

  it('spectral corrections stay within ±6 dB', () => {
    const peaks: number[][] = Array.from({ length: 5 }, (_, i) => [250 + i * 20, 30]);
    const baseline = computeGenreBaseline('Unknown', 0.7, 0.5);
    const result   = computeSpectralCompensation(peaks, baseline);
    for (const band of ['p0', 'p1', 'p2', 'p3'] as const) {
      expect(result[band].gain ?? 0).toBeGreaterThanOrEqual(-6);
      expect(result[band].gain ?? 0).toBeLessThanOrEqual(6);
    }
  });
});

describe('computeAutoEQ', () => {
  it('returns the genre label', () => {
    const r = computeAutoEQ(makeAnalysis('Reggae'), NO_HINTS, 0.85);
    expect(r.genre).toBe('Reggae');
  });

  it('strength=0 produces zero gains', () => {
    const r = computeAutoEQ(makeAnalysis('Rock'), NO_HINTS, 0.0);
    expect(r.params.ls?.gain).toBe(0);
    expect(r.params.hs?.gain).toBe(0);
    expect(r.params.p?.every(b => b.gain === 0)).toBe(true);
  });

  it('returns 4 parametric bands', () => {
    const r = computeAutoEQ(makeAnalysis('Reggae'), { ...NO_HINTS, hasBass: true }, 0.85);
    expect(r.params.p).toHaveLength(4);
  });

  it('Unknown genre falls back cleanly', () => {
    const r = computeAutoEQ(makeAnalysis('SomethingNew'), NO_HINTS, 0.85);
    expect(r.genre).toBe('SomethingNew');
    expect(r.params.ls?.gain).toBeGreaterThan(0); // falls back to 'Unknown' curve
  });
});

describe('detectLoFiSources', () => {
  it('c64sid editorMode is lo-fi', () => {
    expect(detectLoFiSources('c64sid', [])).toBe(true);
  });

  it('XM editorMode is not lo-fi', () => {
    expect(detectLoFiSources('XM', [])).toBe(false);
  });

  it('C64SID instrument synthType is lo-fi', () => {
    expect(detectLoFiSources('XM', [{ synthType: 'C64SID' }])).toBe(true);
  });

  it('FMSynth instrument is not lo-fi', () => {
    expect(detectLoFiSources('XM', [{ synthType: 'FMSynth' }])).toBe(false);
  });
});
