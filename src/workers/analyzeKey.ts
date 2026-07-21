/**
 * analyzeKey — musical-key detection via essentia.js KeyExtractor.
 *
 * Extracted from dj-analysis.worker.ts so the essentia binding contract is unit
 * testable. The bug this guards against: essentia.js KeyExtractor is a
 * fixed-arity embind function taking ALL 15 parameters. Calling it with fewer
 * leaves the trailing args `undefined`, the WASM call throws, and we fall back
 * to 'Unknown' — so BPM (a separately-called algorithm) works while every key
 * silently resolves to 'Unknown'. Always pass the full 15-arg list.
 */

/** Minimal structural view of the essentia.js API this module needs. */
export interface EssentiaKeyApi {
  arrayToVector(arr: Float32Array): unknown;
  KeyExtractor(
    audio: unknown,
    averageDetuningCorrection: boolean,
    frameSize: number,
    hopSize: number,
    hpcpSize: number,
    maxFrequency: number,
    maximumSpectralPeaks: number,
    minFrequency: number,
    pcpThreshold: number,
    profileType: string,
    sampleRate: number,
    spectralPeaksThreshold: number,
    tuningFrequency: number,
    weightType: string,
    windowType: string,
  ): { key?: string; scale?: string; strength?: number };
}

export interface KeyResult {
  key: string;       // e.g. "C major", "A minor", or "Unknown"
  confidence: number;
}

export function analyzeKey(
  mono: Float32Array,
  sampleRate: number,
  essentia: EssentiaKeyApi,
): KeyResult {
  let signal: unknown;
  try {
    signal = essentia.arrayToVector(mono);
    const result = essentia.KeyExtractor(
      signal,
      true,     // averageDetuningCorrection
      4096,     // frameSize
      4096,     // hopSize
      36,       // hpcpSize
      5000,     // maxFrequency
      60,       // maximumSpectralPeaks
      25,       // minFrequency
      0.2,      // pcpThreshold
      'bgate',  // profileType (Bgate — good for electronic/dance music)
      sampleRate,
      0.0001,   // spectralPeaksThreshold (essentia default)
      440,      // tuningFrequency (essentia default)
      'cosine', // weightType (essentia default)
      'hann',   // windowType (essentia default)
    );

    const key = `${result.key ?? 'Unknown'} ${result.scale ?? ''}`.trim();
    const confidence: number = result.strength ?? 0;
    return { key, confidence };
  } catch (err) {
    console.warn('[analyzeKey] essentia KeyExtractor failed:', err);
    return { key: 'Unknown', confidence: 0 };
  } finally {
    try {
      (signal as { delete?: () => void } | undefined)?.delete?.();
    } catch {
      /* ignore */
    }
  }
}
