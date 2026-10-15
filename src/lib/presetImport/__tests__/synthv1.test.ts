import { describe, expect, it } from 'vitest';
import * as sv1 from '../parsers/synthv1';
import { SYNTHV1_PARAMS } from '../tables/synthv1Params';
import { SYNTHV1_LAYOUT } from '@/constants/synthLayouts/synthv1';
import { CONFIG_KEYS } from '@/engine/synthv1/SynthV1Synth';
import { bytes, expectParseError, layoutRanges } from './helpers';

const xml = (params: string, extra = '') =>
  bytes(`<!DOCTYPE synthv1>\n<preset name="Synthetic" version="0.9.0">\n  <params>\n${params}\n  </params>\n${extra}</preset>\n`);

describe('synthv1 .synthv1 parser', () => {
  it('sniff accepts a preset and rejects other XML and text', () => {
    expect(sv1.sniff(xml('<param name="DCO1_SHAPE1">2</param>'), 'a.synthv1')).toBe(true);
    expect(sv1.sniff(bytes('<?xml version="1.0"?><presets><preset plugin="monosynth"/></presets>'), 'a.xml')).toBe(false);
    expect(sv1.sniff(bytes('plain'), 'a.synthv1')).toBe(false);
  });

  it('parses by name and by index, applies paramSafeValue rules, reports unknowns and tuning', () => {
    const [p] = sv1.parse(xml([
      '<param index="0" name="DCO1_SHAPE1">2.6</param>',
      '<param index="17" name="DCF1_CUTOFF">3</param>',
      '<param index="2">1</param>', // no name: by index (DCO1_BANDL1, a bool)
      '<param name="DCO1_SYNC1">0.4</param>',
      '<param name="NOT_A_PARAM">1</param>',
      '<param name="DCO1_OCTAVE">oops</param>',
    ].join('\n'), '<tuning enabled="1"/>\n'), 's.synthv1');
    expect(p.name).toBe('Synthetic');
    const cfg = p.config.synthv1 as Record<string, number>;
    expect(cfg.dco1Shape1).toBe(3); // int: clamped then rounded
    expect(cfg.dcf1Cutoff).toBe(1);
    expect(cfg.dco1Sync).toBe(0);
    expect(p.native?.values).toHaveLength(SYNTHV1_PARAMS.length);
    expect(p.native?.values[2]).toBe(1); // bandlimit has no app config key but is in native.values
    const w = p.warnings.join('\n');
    expect(w).toMatch(/NOT_A_PARAM: unknown synthv1 parameter/);
    expect(w).toMatch(/DCO1_OCTAVE: "oops" is not a number/);
    expect(w).toMatch(/<tuning> block/);
    expect(w).toMatch(/no app config key/);
  });

  it('table is consistent with the engine config: every CONFIG_KEYS entry that has an upstream index is mapped once', () => {
    const mapped = SYNTHV1_PARAMS.map((p) => p[5]).filter((k): k is string => k !== null);
    expect(new Set(mapped).size).toBe(mapped.length);
    expect(mapped.every((k) => (CONFIG_KEYS as string[]).includes(k))).toBe(true);
    expect(mapped.length).toBe(96); // 102 config keys, 6 have no WASM counterpart (WASM_PARAM_INDEX comments)
  });

  it('every mapped value is inside the layout range (the layout takes the engine\'s own ranges)', () => {
    const ranges = layoutRanges(SYNTHV1_LAYOUT);
    let checked = 0;
    for (const sign of [1, -1]) {
      const rows = SYNTHV1_PARAMS.map((p, i) => `<param index="${i}" name="${p[0]}">${sign * 1000000}</param>`);
      const [p] = sv1.parse(xml(rows.join('\n')), 'e.synthv1');
      for (const [k, v] of Object.entries(p.config.synthv1 as Record<string, number>)) {
        const r = ranges.get(k);
        if (!r) continue;
        checked++;
        expect(v, k).toBeGreaterThanOrEqual(r.min);
        expect(v, k).toBeLessThanOrEqual(r.max);
      }
    }
    expect(checked).toBeGreaterThan(150);
  });

  it('round trip serialize -> parse keeps the full state', () => {
    const src = { dco1Shape1: 3, dcf1Cutoff: 0.25, lfo2Bpm: 120, dco2Octave: -2 };
    const first = sv1.parse(sv1.serialize({ synthv1: src }, 'RT'), 'rt.synthv1')[0];
    expect(first.name).toBe('RT');
    expect(first.config.synthv1).toMatchObject(src);
    const second = sv1.parse(sv1.serialize(first.config, 'RT', first.native), 'rt2.synthv1')[0];
    expect(second.native?.values).toEqual(first.native?.values);
  });

  it('malformed input throws ParseError', () => {
    expectParseError(() => sv1.parse(bytes('<preset><params>'), 'a.synthv1'));
    expectParseError(() => sv1.parse(bytes('<other/>'), 'a.synthv1'));
    expectParseError(() => sv1.parse(bytes('<preset name="x"></preset>'), 'a.synthv1'));
    expectParseError(() => sv1.parse(bytes('<preset><params><param name="DCO1_SHAPE1">zzz</param></params></preset>'), 'a.synthv1'));
    expectParseError(() => sv1.parse(new Uint8Array(0), 'a.synthv1'));
    expectParseError(() => sv1.parse(bytes('<a><b></a>'), 'a.synthv1'));
  });
});
