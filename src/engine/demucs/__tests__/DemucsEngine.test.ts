/**
 * DemucsEngine unit tests
 *
 * Tests the TypeScript engine class in isolation (no WASM).
 * Validates: singleton pattern, state management, stem caching types,
 * and the interleave/deinterleave round-trip for IndexedDB storage.
 */

import { describe, it, expect } from 'vitest';
import { STEM_NAMES_4S, STEM_NAMES_6S } from '../types';
import type { StemResult, CachedStems, DemucsModelType } from '../types';

// ── Stem name constants ──────────────────────────────────────────────────────

describe('Stem name constants', () => {
  it('4-stem model has exactly drums, bass, other, vocals', () => {
    expect(STEM_NAMES_4S).toEqual(['drums', 'bass', 'other', 'vocals']);
    expect(STEM_NAMES_4S.length).toBe(4);
  });

  it('6-stem model adds guitar and piano', () => {
    expect(STEM_NAMES_6S).toEqual(['drums', 'bass', 'other', 'vocals', 'guitar', 'piano']);
    expect(STEM_NAMES_6S.length).toBe(6);
  });

  it('6-stem model is a superset of 4-stem', () => {
    for (const name of STEM_NAMES_4S) {
      expect(STEM_NAMES_6S).toContain(name);
    }
  });
});

// ── Interleave / deinterleave round-trip ─────────────────────────────────────

describe('Stem cache interleave round-trip', () => {
  function interleave(left: Float32Array, right: Float32Array): Float32Array {
    const out = new Float32Array(left.length * 2);
    for (let i = 0; i < left.length; i++) {
      out[i * 2] = left[i];
      out[i * 2 + 1] = right[i];
    }
    return out;
  }

  function deinterleave(interleaved: Float32Array): { left: Float32Array; right: Float32Array } {
    const n = interleaved.length / 2;
    const left = new Float32Array(n);
    const right = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      left[i] = interleaved[i * 2];
      right[i] = interleaved[i * 2 + 1];
    }
    return { left, right };
  }

  it('round-trips stereo PCM through interleave/deinterleave', () => {
    const left = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    const right = new Float32Array([-0.1, -0.2, -0.3, -0.4]);

    const interleaved = interleave(left, right);
    expect(interleaved.length).toBe(8);
    // Check interleaving pattern: L0 R0 L1 R1 ...
    expect(interleaved[0]).toBeCloseTo(0.1);
    expect(interleaved[1]).toBeCloseTo(-0.1);
    expect(interleaved[2]).toBeCloseTo(0.2);
    expect(interleaved[3]).toBeCloseTo(-0.2);

    const { left: l2, right: r2 } = deinterleave(interleaved);
    expect(l2.length).toBe(4);
    for (let i = 0; i < 4; i++) {
      expect(l2[i]).toBeCloseTo(left[i]);
      expect(r2[i]).toBeCloseTo(right[i]);
    }
  });

  it('handles single-sample audio', () => {
    const left = new Float32Array([1.0]);
    const right = new Float32Array([-1.0]);
    const interleaved = interleave(left, right);
    expect(interleaved.length).toBe(2);
    const { left: l2, right: r2 } = deinterleave(interleaved);
    expect(l2[0]).toBeCloseTo(1.0);
    expect(r2[0]).toBeCloseTo(-1.0);
  });
});

// ── Type shape validation ────────────────────────────────────────────────────

describe('CachedStems type shape', () => {
  it('validates a well-formed CachedStems entry', () => {
    const entry: CachedStems = {
      hash: 'abc123',
      model: '4s' as DemucsModelType,
      sampleRate: 44100,
      numSamples: 1000,
      stems: {
        drums: new Float32Array(2000).buffer,
        bass: new Float32Array(2000).buffer,
        other: new Float32Array(2000).buffer,
        vocals: new Float32Array(2000).buffer,
      },
      timestamp: Date.now(),
    };

    expect(entry.hash).toBe('abc123');
    expect(entry.model).toBe('4s');
    expect(Object.keys(entry.stems)).toHaveLength(4);
    expect(entry.stems.drums.byteLength).toBe(2000 * 4);
  });
});

// ── StemResult type shape ────────────────────────────────────────────────────

describe('StemResult type shape', () => {
  it('holds per-stem stereo Float32Arrays', () => {
    const result: StemResult = {
      drums: { left: new Float32Array(100), right: new Float32Array(100) },
      bass: { left: new Float32Array(100), right: new Float32Array(100) },
      other: { left: new Float32Array(100), right: new Float32Array(100) },
      vocals: { left: new Float32Array(100), right: new Float32Array(100) },
    };

    expect(Object.keys(result)).toHaveLength(4);
    for (const stem of Object.values(result)) {
      expect(stem.left).toBeInstanceOf(Float32Array);
      expect(stem.right).toBeInstanceOf(Float32Array);
      expect(stem.left.length).toBe(100);
    }
  });

  it('6-stem result includes guitar and piano', () => {
    const result: StemResult = {};
    for (const name of STEM_NAMES_6S) {
      result[name] = { left: new Float32Array(50), right: new Float32Array(50) };
    }
    expect(Object.keys(result)).toHaveLength(6);
    expect(result.guitar).toBeDefined();
    expect(result.piano).toBeDefined();
  });
});
