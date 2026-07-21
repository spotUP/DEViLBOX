import { describe, it, expect, vi } from 'vitest';
import { analyzeKey, type EssentiaKeyApi } from '../analyzeKey';

/**
 * Regression: essentia.js KeyExtractor is a fixed-arity embind binding taking
 * all 15 parameters. The old call passed only 11 → the WASM call threw → every
 * key silently became 'Unknown' (while BPM, a separate call, kept working).
 */

function fakeEssentia(over: Partial<EssentiaKeyApi> = {}): { api: EssentiaKeyApi; calls: unknown[][] } {
  const calls: unknown[][] = [];
  const api: EssentiaKeyApi = {
    arrayToVector: (a) => ({ __vec: a, delete: () => {} }),
    KeyExtractor: (...args: unknown[]) => {
      calls.push(args);
      return { key: 'C', scale: 'major', strength: 0.8 };
    },
    ...over,
  } as EssentiaKeyApi;
  return { api, calls };
}

describe('analyzeKey — essentia KeyExtractor contract', () => {
  it('calls KeyExtractor with the FULL 15-argument list (not the broken 11)', () => {
    const { api, calls } = fakeEssentia();
    analyzeKey(new Float32Array(1024), 44100, api);
    expect(calls).toHaveLength(1);
    // 15 params: audio + 14 config args. The old bug passed 11.
    expect(calls[0]).toHaveLength(15);
  });

  it('passes essentia-default values for the four trailing args', () => {
    const { api, calls } = fakeEssentia();
    analyzeKey(new Float32Array(8), 48000, api);
    const args = calls[0];
    expect(args[10]).toBe(48000);     // sampleRate
    expect(args[11]).toBe(0.0001);    // spectralPeaksThreshold
    expect(args[12]).toBe(440);       // tuningFrequency
    expect(args[13]).toBe('cosine');  // weightType
    expect(args[14]).toBe('hann');    // windowType
  });

  it('maps key + scale into a standard key name and reads confidence', () => {
    const { api } = fakeEssentia({
      KeyExtractor: () => ({ key: 'A', scale: 'minor', strength: 0.42 }),
    } as Partial<EssentiaKeyApi>);
    const r = analyzeKey(new Float32Array(8), 44100, api as EssentiaKeyApi);
    expect(r.key).toBe('A minor');
    expect(r.confidence).toBeCloseTo(0.42);
  });

  it('falls back to Unknown (not a throw) when the binding errors', () => {
    const { api } = fakeEssentia({
      KeyExtractor: () => { throw new Error('BindingError: called with 11 args, expected 15'); },
    } as Partial<EssentiaKeyApi>);
    const r = analyzeKey(new Float32Array(8), 44100, api as EssentiaKeyApi);
    expect(r.key).toBe('Unknown');
    expect(r.confidence).toBe(0);
  });

  it('frees the essentia vector after use', () => {
    const del = vi.fn();
    const api: EssentiaKeyApi = {
      arrayToVector: () => ({ delete: del }),
      KeyExtractor: () => ({ key: 'G', scale: 'major', strength: 0.5 }),
    } as EssentiaKeyApi;
    analyzeKey(new Float32Array(8), 44100, api);
    expect(del).toHaveBeenCalledTimes(1);
  });
});
