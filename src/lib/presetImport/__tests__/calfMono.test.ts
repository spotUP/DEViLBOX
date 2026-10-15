import { describe, expect, it } from 'vitest';
import * as calf from '../parsers/calfMono';
import { CALF_MONO_PARAMS } from '../tables/calfMonoParams';
import { CALF_MONO_LAYOUT } from '@/constants/synthLayouts/calfMono';
import { DEFAULT_CALF_MONO } from '@/engine/calf-mono/CalfMonoSynth';
import { bytes, expectInsideLayout, expectParseError, filesIn, read } from './helpers';

const doc = `<presets>
<preset plugin="monosynth" name="Synthetic Bass">
  <param name="o1_wave" value="3" />
  <param name="Filter" value="2" />
  <param name="cutoff" value="99999" />
  <param name="mystery" value="1" />
</preset>
<preset plugin="reverb" name="Not Ours"><param name="decay_time" value="2" /></preset>
<preset plugin="monosynth" name="Second"><param name="res" value="2.5" /></preset>
</presets>`;

describe('Calf Monosynth presets.xml parser', () => {
  it('sniff accepts a Calf presets file and rejects other XML', () => {
    expect(calf.sniff(bytes(doc), 'presets.xml')).toBe(true);
    expect(calf.sniff(bytes('<preset name="x"><params/></preset>'), 'a.synthv1')).toBe(false);
    expect(calf.sniff(bytes('nothing'), 'presets.xml')).toBe(false);
  });

  it('parses monosynth entries only, matches names case-insensitively, clamps, reports the rest', () => {
    const presets = calf.parse(bytes(doc), 'presets.xml');
    expect(presets.map((p) => p.name)).toEqual(['Synthetic Bass', 'Second']);
    const cfg = presets[0].config.calfMono as Record<string, number>;
    expect(cfg.o1Wave).toBe(3);
    expect(cfg.filter).toBe(2); // "Filter" matches the port name "filter"
    expect(cfg.cutoff).toBe(16000);
    const w = presets[0].warnings.join('\n');
    expect(w).toMatch(/cutoff: 99999 clamped to 16000/);
    expect(w).toMatch(/mystery: unknown Calf Monosynth parameter/);
    expect(w).toMatch(/1 preset\(s\) for other Calf plugins skipped/);
    expect(presets[0].native?.values).toHaveLength(52);
    expect(presets[0].native?.values[9]).toBe(16000); // cutoff slot in engine order
    expect(presets[0].native?.values[8]).toBe(2);
    expect(presets[0].native?.values[10]).toBe(CALF_MONO_PARAMS[10][4]); // res: upstream default when absent
  });

  it('table keys are CalfMonoConfig keys, 52 of them, and mapped values stay inside the layout', () => {
    expect(CALF_MONO_PARAMS).toHaveLength(52);
    const keys = CALF_MONO_PARAMS.map((p) => p[5]);
    expect(new Set(keys).size).toBe(52);
    const known = new Set(Object.keys(DEFAULT_CALF_MONO));
    expect(keys.filter((k) => !known.has(k))).toEqual([]);
    const high = `<presets><preset plugin="monosynth" name="hi">${CALF_MONO_PARAMS.map((p) => `<param name="${p[0]}" value="${p[3] + 1e6}"/>`).join('')}</preset>` +
      `<preset plugin="monosynth" name="lo">${CALF_MONO_PARAMS.map((p) => `<param name="${p[0]}" value="${p[2] - 1e6}"/>`).join('')}</preset></presets>`;
    let checked = 0;
    for (const p of calf.parse(bytes(high), 'x.xml')) checked += expectInsideLayout(p.config.calfMono as Record<string, number>, CALF_MONO_LAYOUT);
    expect(checked).toBeGreaterThan(80);
  });

  it('the 21+ shipped monosynth presets parse with no unknown parameter (skipped when third-party/calf-studio-gear is absent)', () => {
    const files = filesIn('third-party/calf-studio-gear', 'presets.xml');
    if (files.length === 0) return;
    const presets = calf.parse(read(files[0]), files[0]);
    expect(presets.length).toBeGreaterThanOrEqual(21);
    for (const p of presets) expect(p.warnings.filter((w) => /unknown|not a number/.test(w))).toEqual([]);
  });

  it('round trip serialize -> parse keeps every value', () => {
    const src = { o1Wave: 5, cutoff: 1234.5, adsr2Cutoff: -500, midi: 3 };
    const [p] = calf.parse(calf.serialize({ calfMono: src }, 'RT'), 'rt.xml');
    expect(p.name).toBe('RT');
    expect(p.config.calfMono).toEqual(src);
  });

  it('malformed input throws ParseError', () => {
    expectParseError(() => calf.parse(bytes('<presets><preset>'), 'a.xml'));
    expectParseError(() => calf.parse(bytes('<presets></presets>'), 'a.xml'));
    expectParseError(() => calf.parse(bytes('<wrong/>'), 'a.xml'));
    expectParseError(() => calf.parse(bytes('<presets><preset plugin="reverb" name="x"/></presets>'), 'a.xml'));
    expectParseError(() => calf.parse(new Uint8Array(0), 'a.xml'));
  });
});
