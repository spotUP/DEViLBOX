import { describe, expect, it } from 'vitest';
import * as tf from '../parsers/tunefish';
import { TUNEFISH_PARAMS } from '../tables/tunefishParams';
import { TUNEFISH_LAYOUT } from '@/constants/synthLayouts/tunefish';
import { DEFAULT_TUNEFISH, TunefishParam } from '@/types/tunefishInstrument';
import { bytes, expectInsideLayout, expectParseError, filesIn, read } from './helpers';

const all = (value: (i: number) => string) => TUNEFISH_PARAMS.map((p, i) => `${p[0]};${value(i)}`).join('\n');

describe('Tunefish program text parser', () => {
  it('sniff accepts a program and rejects other text', () => {
    expect(tf.sniff(bytes(`Name\n${all(() => '0.5')}\n`), 'program0.txt')).toBe(true);
    expect(tf.sniff(bytes('just some notes\nsecond line\nthird'), 'notes.txt')).toBe(false);
    expect(tf.sniff(new Uint8Array(4), 'x.txt')).toBe(false);
  });

  it('parses a synthetic program: name, config keys, native values in engine order, clamping, unknown keys', () => {
    const [p] = tf.parse(bytes(`My Lead\nGain;0.25\nGenOct;7\nEnv1Att;0.8\nBogus;1\nNoSeparator\nFltLPCut;abc\n`), 'p.txt');
    expect(p.name).toBe('My Lead');
    const cfg = p.config.tunefish as Record<string, number>;
    expect(cfg.globalGain).toBe(0.25);
    expect(cfg.genOctave).toBe(1);
    expect(cfg.env1Att).toBeUndefined(); // envelopes are not in the app config...
    const idx = TUNEFISH_PARAMS.findIndex((x) => x[0] === 'Env1Att');
    expect(p.native?.values[idx]).toBe(0.8); // ...but are in native.values
    expect(p.native?.values).toHaveLength(112);
    const w = p.warnings.join('\n');
    expect(w).toMatch(/GenOct: 7 clamped to 1/);
    expect(w).toMatch(/Bogus: unknown Tunefish parameter/);
    expect(w).toMatch(/no ";" separator/);
    expect(w).toMatch(/FltLPCut: "abc" is not a number/);
  });

  it('table agrees with the app types: indices match TunefishParam and config keys are DEFAULT_TUNEFISH keys', () => {
    expect(TUNEFISH_PARAMS).toHaveLength(TunefishParam.PARAM_COUNT);
    expect(TUNEFISH_PARAMS[TunefishParam.LP_FILTER_CUTOFF][1]).toBe('lpFilterCutoff');
    expect(TUNEFISH_PARAMS[TunefishParam.EQ_HIGH][1]).toBe('eqHigh');
    const keys = TUNEFISH_PARAMS.map((p) => p[1]).filter((k): k is string => k !== null);
    expect(keys.sort()).toEqual(Object.keys(DEFAULT_TUNEFISH).sort());
  });

  it('mapped values are inside the layout range', () => {
    for (const v of ['-50', '50']) {
      const [p] = tf.parse(bytes(`X\n${all(() => v)}\n`), 'x.txt');
      expect(expectInsideLayout(p.config.tunefish as Record<string, number>, TUNEFISH_LAYOUT)).toBeGreaterThan(40);
    }
  });

  it('all shipped tf4programs parse with every key known (skipped when third-party/tunefish is absent)', () => {
    const files = filesIn('third-party/tunefish/patches/tf4programs', '.txt');
    if (files.length === 0) return;
    for (const f of files) {
      const [p] = tf.parse(read(f), f);
      expect(p.warnings).toEqual([]);
      expect(p.native?.values).toHaveLength(112);
      expectInsideLayout(p.config.tunefish as Record<string, number>, TUNEFISH_LAYOUT);
    }
    expect(files.length).toBe(92);
  });

  it('round trip serialize -> parse keeps all 112 values', () => {
    const [a] = tf.parse(bytes(`RT\n${all((i) => String((i % 10) / 10))}\n`), 'a.txt');
    const [b] = tf.parse(tf.serialize(a.config, 'RT', a.native), 'b.txt');
    expect(b.name).toBe('RT');
    expect(b.native?.values).toEqual(a.native?.values);
    expect(b.config).toEqual(a.config);
  });

  it('malformed input throws ParseError', () => {
    expectParseError(() => tf.parse(bytes('Gain;0.5\n'), 'a.txt'));
    expectParseError(() => tf.parse(bytes('Name only'), 'a.txt'));
    expectParseError(() => tf.parse(bytes('Name\nnot a table\n'), 'a.txt'));
    expectParseError(() => tf.parse(bytes('Name\nBogus;1\n'), 'a.txt'));
    expectParseError(() => tf.parse(new Uint8Array(0), 'a.txt'));
  });
});
