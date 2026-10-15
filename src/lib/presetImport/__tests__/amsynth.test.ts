import { describe, expect, it } from 'vitest';
import * as amsynth from '../parsers/amsynth';
import { AMSYNTH_PARAMS } from '../tables/amsynthParams';
import { AMSYNTH_LAYOUT } from '@/constants/synthLayouts/amsynth';
import { DEFAULT_AMSYNTH } from '@/engine/amsynth/AMSynthSynth';
import { bytes, expectInsideLayout, expectParseError, filesIn, read } from './helpers';

const bank = [
  'amSynth',
  '<preset> <name> Warm Saw',
  '<parameter> amp_attack 0.25',
  '<parameter> filter_cutoff 9',
  '<parameter> osc1_waveform 2.4',
  '<parameter> made_up 1',
  '<preset> <name> unused',
  '<parameter> amp_attack 1',
  '<preset> <name> Second',
  '<parameter> osc2_pitch -3',
  'EOF',
].join('\n');

describe('amsynth parser', () => {
  it('sniff accepts a bank and a single preset, rejects other text', () => {
    expect(amsynth.sniff(bytes(bank), 'a.bank')).toBe(true);
    expect(amsynth.sniff(bytes('amSynth1.0preset\n<preset> <name> x\n<parameter> amp_attack 0.1\n'), 'a.amSynthPreset')).toBe(true);
    expect(amsynth.sniff(bytes('hello world'), 'a.bank')).toBe(false);
  });

  it('parses a synthetic bank: names, clamping, rounding of unknown/unused entries', () => {
    const presets = amsynth.parse(bytes(bank), 'a.bank');
    expect(presets.map((p) => p.name)).toEqual(['Warm Saw', 'Second']); // "unused" slot skipped
    const cfg = presets[0].config.amsynth as Record<string, number>;
    expect(cfg.ampAttack).toBe(0.25);
    expect(cfg.filterCutoff).toBe(1.5); // 9 clamped to the upstream max
    expect(cfg.osc1Waveform).toBe(2.4); // stepped params are clamped by Parameter::setValue, rounding is the engine's job
    expect(presets[0].warnings.join('\n')).toMatch(/filter_cutoff: 9 clamped to 1.5/);
    expect(presets[0].warnings.join('\n')).toMatch(/made_up: unknown amsynth parameter/);
    expect((presets[1].config.amsynth as Record<string, number>).osc2Pitch).toBe(-3);
  });

  it('parses the single-preset form with a multi-word name', () => {
    const [p] = amsynth.parse(bytes('amSynth1.0preset\n<preset> <name> Big Bad Bass\n<parameter> amp_decay 1.5\n<parameter> unused 0\n'), 'x.amSynthPreset');
    expect(p.name).toBe('Big Bad Bass');
    expect((p.config.amsynth as Record<string, number>).ampDecay).toBe(1.5);
  });

  it('table keys are exactly the AMSynthConfig keys (41) and every mapped value is inside the layout range', () => {
    expect(AMSYNTH_PARAMS.map((p) => p[1]).sort()).toEqual(Object.keys(DEFAULT_AMSYNTH).sort());
    const lines = ['amSynth', '<preset> <name> Extremes', ...AMSYNTH_PARAMS.flatMap((p) => [`<parameter> ${p[0]} ${p[2] - 100}`])];
    const lines2 = ['<preset> <name> Max', ...AMSYNTH_PARAMS.map((p) => `<parameter> ${p[0]} ${p[3] + 100}`)];
    const presets = amsynth.parse(bytes([...lines, ...lines2].join('\n')), 'x.bank');
    let checked = 0;
    for (const p of presets) checked += expectInsideLayout(p.config.amsynth as Record<string, number>, AMSYNTH_LAYOUT);
    expect(checked).toBeGreaterThan(60);
  });

  it('shipped banks parse with every parameter mapped (skipped when third-party/amsynth-master is absent)', () => {
    const files = filesIn('third-party/amsynth-master/data/banks', '.bank');
    if (files.length === 0) return;
    let n = 0;
    for (const f of files) {
      for (const p of amsynth.parse(read(f), f)) {
        n++;
        expect(p.warnings.filter((w) => /unknown/.test(w))).toEqual([]);
        expectInsideLayout(p.config.amsynth as Record<string, number>, AMSYNTH_LAYOUT);
      }
    }
    expect(n).toBeGreaterThan(100);
  });

  it('round trip serialize -> parse keeps every value', () => {
    const src = { ampAttack: 0.5, filterCutoff: -0.25, osc2Range: 2, lfoWaveform: 6, portamentoMode: 1 };
    const [p] = amsynth.parse(amsynth.serialize({ amsynth: src }, 'RT'), 'rt.bank');
    expect(p.name).toBe('RT');
    expect(p.config.amsynth).toEqual(src);
  });

  it('malformed input throws ParseError', () => {
    expectParseError(() => amsynth.parse(bytes('garbage'), 'a.bank'));
    expectParseError(() => amsynth.parse(bytes('amSynth\nEOF\n'), 'a.bank'));
    expectParseError(() => amsynth.parse(bytes('amSynth\n<parameter> amp_attack 1\n'), 'a.bank'));
    expectParseError(() => amsynth.parse(bytes('amSynth1.0preset\n<preset> <name> x\n<parameter> amp_attack\n'), 'a.bank'));
    expectParseError(() => amsynth.parse(new Uint8Array(0), 'a.bank'));
  });
});
