import { describe, it, expect } from 'vitest';
import { buildKlystrackLayout, klysFlagKey } from '@/constants/synthLayouts/klystrack';
import { KLYS_FIELDS, type KlysFieldKey } from '@/engine/klystrack/klysInstrumentFields';

const layout = buildKlystrackLayout([], { sampleRate: 48000 });
const curveOf = (section: string) => layout.sections!.find((s) => s.label === section)!.curves![0];
const values = (over: Record<string, number>) => (key: string): number => over[key] ?? (key in KLYS_FIELDS ? KLYS_FIELDS[key as KlysFieldKey].min : 0);
const ys = (c: ReturnType<typeof curveOf>, over: Record<string, number>) => c.series(values(over))[0].points.map((p) => p[1]);

describe('klystrack layout curves', () => {
  it('the Volume, Filter, Vibrato, Pulse Width Modulation and Oscillator sections each carry a curve', () => {
    for (const label of ['Volume', 'Filter', 'Vibrato', 'Pulse Width Modulation', 'Oscillator']) {
      expect(layout.sections!.find((s) => s.label === label)!.curves?.length, label).toBeGreaterThan(0);
    }
  });

  it('a Cutoff knob move changes the filter response (no note held)', () => {
    const filter = curveOf('Filter');
    const on = { [klysFlagKey('cydflags', 512)]: 1, resonance: 1, filterType: 0 };
    const low = ys(filter, { ...on, cutoff: 200 });
    const high = ys(filter, { ...on, cutoff: 1800 });
    expect(low).not.toEqual(high);
    const at = (arr: number[]) => arr[Math.floor(arr.length * 0.7)];
    expect(at(low), 'a low cutoff attenuates the upper band more').toBeLessThan(at(high));
  });

  it('with the Filter switch off the response is flat, whatever the cutoff', () => {
    const flat = ys(curveOf('Filter'), { cutoff: 100 });
    expect(flat.every((y) => y === 0)).toBe(true);
  });

  it('the envelope axis grows with the attack and release it must show', () => {
    const vol = curveOf('Volume');
    const get = (a: number, r: number) => values({ attack: a, decay: 20, sustain: 16, release: r });
    const domain = (g: (k: string) => number) => (vol.xDomain as (g: (k: string) => number) => readonly [number, number])(g)[1];
    expect(domain(get(40, 40))).toBeGreaterThan(domain(get(2, 2)));
  });

  it('the Oscillator curve follows the waveform switches', () => {
    const osc = curveOf('Oscillator');
    const saw = ys(osc, { [klysFlagKey('cydflags', 8)]: 1 });
    const tri = ys(osc, { [klysFlagKey('cydflags', 4)]: 1 });
    expect(saw).not.toEqual(tri);
  });
});

describe('klystrack layout curves on a config without klystrack values', () => {
  it('draw nothing instead of throwing when every value reads 0 (the tracker side panel)', () => {
    for (const section of layout.sections ?? []) {
      for (const curve of section.curves ?? []) {
        const zero = () => 0;
        expect(() => curve.series(zero), `${section.label}: series`).not.toThrow();
        if (typeof curve.xDomain === 'function') expect(() => curve.xDomain, section.label).not.toThrow();
        for (const s of curve.series(zero)) expect(s.points.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])), section.label).toBe(true);
      }
    }
  });
});

describe('klystrack LFO curves are drawn as shapes, not polygons', () => {
  it('a fast vibrato and a fast pulse width modulation get enough points per cycle to look smooth', () => {
    const fast = values({ vibratoSpeed: 40, vibratoDepth: 30, pwmSpeed: 30, pwmDepth: 60 });
    for (const section of ['Vibrato', 'Pulse Width Modulation']) {
      const points = curveOf(section).series(fast)[0].points.length;
      expect(points, `${section}: points over two cycles`).toBeGreaterThan(80);
    }
  });
});
