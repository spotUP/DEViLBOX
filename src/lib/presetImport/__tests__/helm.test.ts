import { describe, expect, it } from 'vitest';
import * as helm from '../parsers/helm';
import { HELM_PARAMETER_ORDER } from '../../helmPresetLoader';
import { HELM_PARAM_RANGES } from '../tables/helmParams';
import { bytes, expectParseError, filesIn, read } from './helpers';

const synthetic = (settings: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  bytes(JSON.stringify({ synth_version: '0.9.0', patch_name: 'Test Pad', folder_name: 'Pad', author: 'me', settings, ...extra }));

describe('Helm .helm parser', () => {
  it('sniff accepts a helm patch and rejects a Vital preset and random bytes', () => {
    expect(helm.sniff(synthetic({ cutoff: 60 }), 'x.helm')).toBe(true);
    expect(helm.sniff(bytes('{"preset_name":"v","settings":{"volume":1}}'), 'x.vital')).toBe(false);
    expect(helm.sniff(new Uint8Array([1, 2, 3, 4]), 'x.helm')).toBe(false);
  });

  it('parses a synthetic patch: name, values, clamping, unknown keys and modulations reported', () => {
    const [p] = helm.parse(synthetic({ cutoff: 999, amp_attack: 0.5, bogus_key: 1, modulations: [{ source: 'lfo_1', destination: 'cutoff', amount: 1 }] }), 'a.helm');
    expect(p.name).toBe('Test Pad');
    expect(p.synthType).toBe('Helm');
    const params = p.config.parameters as Record<string, number>;
    expect(params.amp_attack).toBe(0.5);
    expect(params.cutoff).toBe(HELM_PARAM_RANGES.cutoff[1]);
    expect(p.warnings.join('\n')).toMatch(/cutoff: 999 clamped/);
    expect(p.warnings.join('\n')).toMatch(/bogus_key: unknown Helm parameter/);
    expect(p.warnings.join('\n')).toMatch(/1 modulation connection/);
  });

  it('upgrades the legacy osc_mix setting the way load_save.cpp does', () => {
    const [p] = helm.parse(synthetic({ osc_mix: 0.25 }, { synth_version: '0.5.0' }), 'a.helm');
    const params = p.config.parameters as Record<string, number>;
    expect(params.osc_1_volume).toBeCloseTo(Math.sqrt(0.75), 6);
    expect(params.osc_2_volume).toBeCloseTo(Math.sqrt(0.25), 6);
  });

  it('every mapped value lies inside the Helm parameter table range', () => {
    const [p] = helm.parse(synthetic(Object.fromEntries(HELM_PARAMETER_ORDER.filter((n) => n in HELM_PARAM_RANGES).map((n) => [n, 1e9]))), 'a.helm');
    for (const [k, v] of Object.entries(p.config.parameters as Record<string, number>)) {
      expect(v).toBeLessThanOrEqual(HELM_PARAM_RANGES[k][1]);
      expect(v).toBeGreaterThanOrEqual(HELM_PARAM_RANGES[k][0]);
    }
  });

  it('the loader parameter list and the upstream table agree (coverage)', () => {
    const missing = HELM_PARAMETER_ORDER.filter((n) => !(n in HELM_PARAM_RANGES));
    expect(missing).toEqual([]);
    // table entries the app loader has no id for cannot be applied; they are reported as unknown, never silently dropped
    const noId = Object.keys(HELM_PARAM_RANGES).filter((n) => !(HELM_PARAMETER_ORDER as readonly string[]).includes(n));
    expect(noId.length + HELM_PARAMETER_ORDER.length).toBe(Object.keys(HELM_PARAM_RANGES).length);
  });

  it('round trip serialize -> parse keeps every parameter', () => {
    const src = { cutoff: 64.5, amp_sustain: 0.3, osc_1_waveform: 4, step_seq_07: 0.75 };
    const out = helm.parse(helm.serialize({ parameters: src }, 'RT'), 'rt.helm')[0];
    expect(out.name).toBe('RT');
    expect(out.config.parameters).toEqual(src);
  });

  it('shipped factory presets parse and map every key (skipped when third-party/helm-master is absent)', () => {
    const files = filesIn('third-party/helm-master/patches', '.helm');
    if (files.length === 0) return;
    let unknown = 0;
    for (const f of files) {
      const [p] = helm.parse(read(f), f);
      unknown += p.warnings.filter((w) => /unknown Helm parameter/.test(w)).length;
      expect(Object.keys(p.config.parameters as object).length).toBeGreaterThan(50);
    }
    expect(unknown).toBe(0);
  });

  it('malformed input throws ParseError', () => {
    expectParseError(() => helm.parse(bytes('not json'), 'a.helm'));
    expectParseError(() => helm.parse(bytes('[1,2]'), 'a.helm'));
    expectParseError(() => helm.parse(new Uint8Array(0), 'a.helm'));
    expectParseError(() => helm.parse(bytes('{"patch_name":"x","settings":{"nothing":1}}'), 'a.helm'));
    expectParseError(() => helm.parse(bytes('{"patch_name":"x"}'), 'a.helm'));
  });
});
