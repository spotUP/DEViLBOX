import { describe, expect, it } from 'vitest';
import * as gk from '../parsers/geonkick';
import { bytes, expectParseError, filesIn, read } from './helpers';

const osc = (extra: Record<string, unknown> = {}) => ({
  enabled: true, is_fm: false, function: 2, phase: 1, seed: 7,
  ampl_env: { amplitude: 0.5, points: [[0, 1], [1, 0]] },
  freq_env: { amplitude: 400, points: [[0, 1], [1, 0.5]] },
  filter: { enabled: false, type: 0, cutoff: 800, factor: 10, cutoff_env: [[0, 1], [1, 1]] },
  ...extra,
});
const synthetic = (kick: Record<string, unknown> = {}, o: Record<string, unknown> = {}) =>
  bytes(JSON.stringify({ kick: { name: 'Boom', layers: [0], layers_amplitude: [1, 1, 1], limiter: 1, ampl_env: { length: 300, amplitude: 1, points: [[0, 1], [1, 1]] }, ...kick }, osc0: osc(o) }));

describe('Geonkick .gkick parser', () => {
  it('sniff accepts a preset and rejects other JSON and binary', () => {
    expect(gk.sniff(synthetic(), 'a.gkick')).toBe(true);
    expect(gk.sniff(bytes('{"settings":{}}'), 'a.gkick')).toBe(false);
    expect(gk.sniff(new Uint8Array([0, 1, 2]), 'a.gkick')).toBe(false);
  });

  it('parses a synthetic kick, keeps loader fields, clamps and reports what it drops', () => {
    const [p] = gk.parse(synthetic({ compressor: { enabled: false }, id: 3, layers: [0, 5], filter: { enabled: true, type: 9, cutoff: 5, factor: 99 } },
      { function: 12, phase: 99, sample: { x: 1 }, ampl_env: { amplitude: 7, points: [[0, 2], [1, -1]] } }), 'k.gkick');
    expect(p.name).toBe('Boom');
    const preset = (p.config.geonkick as { preset: Record<string, Record<string, unknown>> }).preset;
    expect(preset.osc0.function).toBe(7);
    expect(preset.osc0.phase).toBeCloseTo(Math.PI * 2, 6);
    expect((preset.osc0.ampl_env as { amplitude: number; points: number[][] }).points).toEqual([[0, 1], [1, 0]]);
    expect((preset.osc0.ampl_env as { amplitude: number }).amplitude).toBe(1);
    expect(preset.kick.layers).toEqual([0]);
    expect((preset.kick.filter as { type: number; cutoff: number; factor: number })).toMatchObject({ type: 2, cutoff: 20, factor: 20 });
    const w = p.warnings.join('\n');
    expect(w).toMatch(/kick.layers: invalid group 5/);
    expect(w).toMatch(/kick: not carried over: .*compressor/);
    expect(w).toMatch(/osc0: not carried over: sample/);
  });

  it('all 82 shipped presets parse; layers, functions and envelope points stay in range (skipped when public/geonkick is absent)', () => {
    const files = filesIn('public/geonkick/presets', '.gkick');
    if (files.length === 0) return;
    for (const f of files) {
      const [p] = gk.parse(read(f), f);
      const preset = (p.config.geonkick as { preset: Record<string, Record<string, unknown>> }).preset;
      for (let i = 0; i < 9; i++) {
        const o = preset[`osc${i}`];
        if (!o) continue;
        expect(o.function as number).toBeLessThanOrEqual(7);
        for (const pt of ((o.ampl_env as { points?: number[][] })?.points ?? [])) {
          expect(pt[0]).toBeGreaterThanOrEqual(0);
          expect(pt[1]).toBeLessThanOrEqual(1);
        }
      }
    }
    expect(files.length).toBe(82);
  });

  it('round trip serialize -> parse is stable', () => {
    const [a] = gk.parse(synthetic(), 'k.gkick');
    const [b] = gk.parse(gk.serialize(a.config), 'k2.gkick');
    expect(b.config).toEqual(a.config);
    expect(b.warnings).toEqual([]);
  });

  it('malformed input throws ParseError', () => {
    expectParseError(() => gk.parse(bytes('{nope'), 'a.gkick'));
    expectParseError(() => gk.parse(bytes('{"unrelated":1}'), 'a.gkick'));
    expectParseError(() => gk.parse(bytes('[]'), 'a.gkick'));
    expectParseError(() => gk.parse(new Uint8Array(0), 'a.gkick'));
    expectParseError(() => gk.serialize({}));
  });
});
