import { describe, it, expect } from 'vitest';
import { CINTER_PRESETS } from '../cinterPresets';

// Invariants over the generated Cinter preset data (stable across regeneration).
describe('CINTER_PRESETS — ripped Cinter song instruments', () => {
  it('is non-empty', () => {
    expect(CINTER_PRESETS.length).toBeGreaterThan(0);
  });

  it('every preset is a Cinter4Synth voice with the 12 params and no baked WAV', () => {
    for (const p of CINTER_PRESETS) {
      expect(p.synthType).toBe('Cinter4Synth');
      expect(p.type).toBe('synth');
      expect('sample' in p).toBe(false); // regenerated from params, not embedded
      const params = p.parameters as Record<string, unknown> | undefined;
      expect(params?.cinter).toBe(1);
      for (let i = 0; i < 12; i++) {
        expect(typeof params?.[`p${i}`]).toBe('number');
      }
      expect([3, 4]).toContain(params?.version);
      expect(typeof p.name).toBe('string');
    }
  });

  it('has no duplicate voices (deduped by params + geometry)', () => {
    const fps = CINTER_PRESETS.map((p) => {
      const q = p.parameters as Record<string, unknown>;
      return `${q.version}:${q.lengthWords}:${q.replenWords}:${Array.from({ length: 12 }, (_, i) => q[`p${i}`]).join(',')}`;
    });
    expect(new Set(fps).size).toBe(fps.length);
  });
});
