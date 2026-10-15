import { describe, expect, it } from 'vitest';
import * as vital from '../parsers/vital';
import { VITAL_PARAM_RANGES } from '../tables/vitalParams';
import { bytes, expectParseError } from './helpers';

const preset = (settings: Record<string, unknown>) =>
  bytes(JSON.stringify({ synth_version: '1.5.5', preset_name: 'Synthetic Lead', author: 'me', comments: '', preset_style: 'Lead', settings }));

describe('Vital .vital parser', () => {
  it('sniff accepts a Vital preset and rejects a Helm patch and other JSON', () => {
    expect(vital.sniff(preset({ volume: 1 }), 'x.vital')).toBe(true);
    expect(vital.sniff(bytes('{"patch_name":"h","settings":{"cutoff":1}}'), 'x.helm')).toBe(false);
    expect(vital.sniff(bytes('{"hello":1}'), 'x.json')).toBe(false);
  });

  it('parses controls, clamps to the upstream range and reports unknown controls and unloadable structures', () => {
    const [p] = vital.parse(preset({
      volume: 1e9, filter_1_cutoff: 60, osc_1_level: 0.5, nonsense: 3,
      wavetables: [{}], lfos: [{}], sample: {}, modulations: [{ source: 'lfo_1', destination: 'filter_1_cutoff' }, { source: '', destination: '' }],
    }), 'x.vital');
    const params = p.config.parameters as Record<string, number>;
    expect(p.name).toBe('Synthetic Lead');
    expect(p.synthType).toBe('Vital');
    expect(params.filter_1_cutoff).toBe(60);
    expect(params.volume).toBe(VITAL_PARAM_RANGES.volume[1]);
    const w = p.warnings.join('\n');
    expect(w).toMatch(/volume: 1000000000 clamped/);
    expect(w).toMatch(/nonsense: unknown Vital control/);
    expect(w).toMatch(/1 modulation routing/);
    expect(w).toMatch(/wavetables: not imported/);
  });

  it('every mapped value lies inside the generated upstream range', () => {
    const wild = Object.fromEntries(Object.keys(VITAL_PARAM_RANGES).map((k) => [k, 1e7]));
    const [p] = vital.parse(preset(wild), 'x.vital');
    const params = p.config.parameters as Record<string, number>;
    expect(Object.keys(params).length).toBe(Object.keys(VITAL_PARAM_RANGES).length);
    for (const [k, v] of Object.entries(params)) {
      const [min, max] = VITAL_PARAM_RANGES[k];
      if (min !== null) expect(v).toBeGreaterThanOrEqual(min);
      if (max !== null) expect(v).toBeLessThanOrEqual(max);
    }
  });

  it('round trip serialize -> parse keeps every control', () => {
    const src = { filter_1_cutoff: 70.25, env_1_attack: 0.4, osc_2_transpose: -12, modulation_3_amount: -0.5 };
    const out = vital.parse(vital.serialize({ parameters: src }, 'RT'), 'rt.vital')[0];
    expect(out.name).toBe('RT');
    expect(out.config.parameters).toEqual(src);
  });

  it('malformed input throws ParseError', () => {
    expectParseError(() => vital.parse(bytes('{'), 'x.vital'));
    expectParseError(() => vital.parse(bytes('"text"'), 'x.vital'));
    expectParseError(() => vital.parse(new Uint8Array(0), 'x.vital'));
    expectParseError(() => vital.parse(bytes('{"preset_name":"a"}'), 'x.vital'));
    expectParseError(() => vital.parse(bytes('{"settings":{"nothing_known":1}}'), 'x.vital'));
  });
});
