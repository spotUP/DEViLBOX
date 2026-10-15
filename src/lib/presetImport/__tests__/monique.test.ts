import { describe, expect, it } from 'vitest';
import * as mon from '../parsers/monique';
import { MONIQUE_ATTRIBUTES } from '../parsers/monique';
import { MONIQUE_LAYOUT } from '@/constants/synthLayouts/monique';
import { DEFAULT_MONIQUE } from '@/engine/monique/MoniqueSynth';
import { bytes, expectParseError, filesIn, layoutRanges, read } from './helpers';
import type { Range } from './helpers';

const ranges: Map<string, Range> = layoutRanges(MONIQUE_LAYOUT);
function expectInsideLayout(values: Record<string, number>): number {
  let checked = 0;
  const outside: string[] = [];
  for (const [k, v] of Object.entries(values)) {
    const r = ranges.get(k);
    if (!r) continue;
    checked++;
    if (v < r.min || v > r.max) outside.push(`${k}=${v} layout[${r.min},${r.max}]`);
  }
  expect(outside).toEqual([]);
  return checked;
}

const prog = (attrs: string, children = '') => bytes(`<?xml version="1.0" encoding="UTF-8"?>\n\n<PROJECT-1.0 ${attrs}>${children}</PROJECT-1.0>\n`);

describe('Monique .mlprog parser', () => {
  it('sniff accepts a program and rejects other XML', () => {
    expect(mon.sniff(prog('SD_2_volume="0.5"'), 'A BASS.mlprog')).toBe(true);
    expect(mon.sniff(bytes('<presets/>'), 'x.xml')).toBe(false);
    expect(mon.sniff(bytes('binary\u0000'), 'x.mlprog')).toBe(false);
  });

  it('parses a synthetic program: present values clamped, absent ones take the upstream init value, unknown attributes reported', () => {
    const [p] = mon.parse(prog('SD_2_volume="3" OSC_1_octave="-12" FLT_0_cutoff="0.7" FLT_1_filter_type="9" SD_2_morph_state_0="0.4" BOGUS="1" SD_2_osci_show_flt_1="1" ENV_100_attack="0.2"',
      '<LeftMorphData_0 OSC_1_octave="1"/>'), 'A MY SOUND.mlprog');
    expect(p.name).toBe('A MY SOUND');
    const cfg = p.config.monique as Record<string, number>;
    expect(cfg.volume).toBe(1);
    expect(cfg.osc2Octave).toBe(-12);
    expect(cfg.filter1Cutoff).toBe(0.7);
    expect(cfg.filter2Type).toBe(7);
    expect(cfg.morph1).toBe(0.4);
    expect(cfg.glide).toBe(0.05); // absent -> init value of SD glide
    expect(cfg.filter3Resonance).toBe(0.3);
    const w = p.warnings.join('\n');
    expect(w).toMatch(/SD_2_volume: 3 clamped to 1/);
    expect(w).toMatch(/FLT_1_filter_type: 9 clamped to 7/);
    expect(w).toMatch(/BOGUS: unknown Monique attribute/);
    expect(w).toMatch(/modulation amounts, morph\/arp\/UI data/);
    expect(w).toMatch(/morph source snapshots/);
  });

  it('the table covers exactly the 120 MoniqueConfig keys, once each, and values stay inside the layout range', () => {
    const keys = MONIQUE_ATTRIBUTES.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual(Object.keys(DEFAULT_MONIQUE).sort());
    expect(keys).toHaveLength(120);
    let checked = 0;
    for (const v of ['-100000', '100000']) {
      const [p] = mon.parse(prog(MONIQUE_ATTRIBUTES.map((a) => `${a.attr}="${v}"`).join(' ')), 'x.mlprog');
      checked += expectInsideLayout(p.config.monique as Record<string, number>);
    }
    expect(checked).toBeGreaterThan(150);
  });

  it('shipped programs parse with no unknown attribute and in-range values (skipped when third-party/monique-monosynth is absent)', () => {
    const files = filesIn('third-party/monique-monosynth/resources/files', '.mlprog');
    if (files.length === 0) return;
    let present = 0;
    for (const f of files) {
      const [p] = mon.parse(read(f), f);
      expect(p.warnings.filter((w) => /unknown|not a number|clamped/.test(w)), f).toEqual([]);
      expectInsideLayout(p.config.monique as Record<string, number>);
      present++;
    }
    expect(present).toBe(files.length);
    expect(files.length).toBeGreaterThan(100);
  });

  it('round trip serialize -> parse keeps every value', () => {
    const [a] = mon.parse(prog('SD_2_volume="0.4" OSC_2_octave="7" FLT_2_cutoff="0.9" EQ_2_velocity_3="0.1" ARP_2_speed_multi="-4"'), 'rt.mlprog');
    const [b] = mon.parse(mon.serialize(a.config), 'rt2.mlprog');
    expect(b.config).toEqual(a.config);
  });

  it('malformed input throws ParseError', () => {
    expectParseError(() => mon.parse(bytes('<PROJECT-1.0 a="1"'), 'a.mlprog'));
    expectParseError(() => mon.parse(bytes('<OTHER a="1"/>'), 'a.mlprog'));
    expectParseError(() => mon.parse(prog('BOGUS="1"'), 'a.mlprog'));
    expectParseError(() => mon.parse(bytes('<PROJECT-1.0 a=1/>'), 'a.mlprog'));
    expectParseError(() => mon.parse(new Uint8Array(0), 'a.mlprog'));
  });
});
