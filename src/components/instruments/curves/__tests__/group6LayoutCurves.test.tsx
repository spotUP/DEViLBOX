/**
 * Reachability for rollout group 6 (SynthV1, TAL-NoiseMaker, ZynAddSubFX): DOMSynthPanel renders each real layout, the real
 * CurveCanvas draws it on a recording 2D context, a knob change changes what is drawn, and a stubbed voice report moves the live
 * marker. Behaviour of each model is tested where it lives (synthv1Curves / talNoizeMakerCurves / zynCurves tests, against the
 * real engines); this file proves the wiring once per synth.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, act, cleanup } from '@testing-library/react';
import { DOMSynthPanel } from '../../controls/DOMSynthPanel';
import type { CurveDescriptor, SynthPanelLayout, SectionDescriptor, ControlDescriptor } from '@/types/synthPanel';
import { SYNTHV1_LAYOUT } from '@/constants/synthLayouts/synthv1';
import { TAL_NOIZEMAKER_LAYOUT } from '@/constants/synthLayouts/talNoizeMaker';
import { ZYNADDSUBFX_LAYOUT } from '@/constants/synthLayouts/zynaddsubfx';
import { SYNTH_LAYOUTS } from '@/constants/synthLayouts';
import { WasmVoiceHub, registerVoiceHub } from '@/engine/voiceStatus/wasmVoiceStatus';

/** Every stroked polyline the canvas drew, in order; a vertical two-point line is the live marker. */
let strokes: number[][] = [];
let path: number[] = [];
const noopCtx = new Proxy({} as Record<string, unknown>, { get: () => () => {}, set: () => true });
const ctxStub = new Proxy({} as Record<string, unknown>, {
  get: (_t, prop: string) => {
    if (prop === 'beginPath') return () => { path = []; };
    if (prop === 'moveTo' || prop === 'lineTo') return (x: number, y: number) => { path.push(Math.round(x * 100) / 100, Math.round(y * 100) / 100); };
    if (prop === 'stroke') return () => { if (path.length >= 4) strokes.push([...path]); };
    return () => {};
  },
  set: () => true,
});
beforeEach(() => {
  strokes = [];
  vi.stubGlobal('ResizeObserver', class {
    cb: (e: Array<{ contentRect: { width: number } }>) => void;
    constructor(cb: (e: Array<{ contentRect: { width: number } }>) => void) { this.cb = cb; }
    observe() { this.cb([{ contentRect: { width: 300 } }]); }
    disconnect() {}
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    return (this.style.width === '100%' ? ctxStub : noopCtx) as never;
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const allSections = (layout: SynthPanelLayout): SectionDescriptor[] => [...(layout.sections ?? []), ...(layout.tabs ?? []).flatMap((t) => t.sections)];
const allCurves = (layout: SynthPanelLayout): Array<{ section: string; curve: CurveDescriptor }> =>
  allSections(layout).flatMap((s) => (s.curves ?? []).map((curve) => ({ section: s.label, curve })));
const controls = (layout: SynthPanelLayout): ControlDescriptor[] => allSections(layout).flatMap((s) => s.controls);
const defaults = (layout: SynthPanelLayout): Record<string, number> =>
  Object.fromEntries(controls(layout).flatMap((c) => ('defaultValue' in c && typeof c.defaultValue === 'number' ? [[c.key, c.defaultValue]] : [])));
const verticals = (): number[][] => strokes.filter((s) => s.length === 4 && s[0] === s[2] && s[1] !== s[3]);
const tab = (utils: ReturnType<typeof render>, label: string): void => { fireEvent.click(utils.getAllByText(label).find((el) => el.tagName === 'BUTTON')!); };

/** [layout key, layout, synth type the markers listen to, curve labels that must exist] */
const FAMILIES = [
  ['SynthV1', SYNTHV1_LAYOUT, 'SynthV1', ['Oscillator A (one cycle)', 'Filter Response', 'Filter Envelope', 'Amplitude Envelope', 'LFO (one cycle)']],
  ['TalNoizeMaker', TAL_NOIZEMAKER_LAYOUT, 'TalNoizeMaker', ['Oscillator 1 (one cycle)', 'Oscillator 2 (one cycle)', 'Filter Response (middle C, full velocity)', 'Filter Envelope', 'Amplitude Envelope', 'LFO 1 (one cycle)', 'LFO 2 (one cycle)', 'Free AD Envelope']],
  ['ZynAddSubFX', ZYNADDSUBFX_LAYOUT, 'ZynAddSubFX', ['Voice 1 Waveform', 'Voice 4 Waveform', 'Filter Response (middle C)', 'Filter Envelope', 'Amplitude Envelope (middle C)']],
] as const;

describe('the layouts declare their curves and are registered under their synth types', () => {
  it.each(FAMILIES)('%s', (type, layout, _synth, labels) => {
    expect(SYNTH_LAYOUTS[type]).toBe(layout);
    expect(allCurves(layout).map((c) => c.curve.label)).toEqual(expect.arrayContaining([...labels]));
  });

  it('every curve of these layouts draws finite points, at the defaults and when every value reads 0', () => {
    for (const [type, layout] of FAMILIES.map((f) => [f[0], f[1]] as const)) {
      for (const get of [(k: string): number => defaults(layout)[k] ?? 0, (): number => 0]) {
        for (const { section, curve } of allCurves(layout)) {
          const label = `${type}/${section}/${curve.label}`;
          const getText = (): string => '';
          const xs = typeof curve.xDomain === 'function' ? curve.xDomain(get) : curve.xDomain;
          const ys = typeof curve.yDomain === 'function' ? curve.yDomain(get) : curve.yDomain;
          expect(xs.every(Number.isFinite) && xs[1] > xs[0], `${label}: x domain`).toBe(true);
          expect(ys.every(Number.isFinite) && ys[1] > ys[0], `${label}: y domain`).toBe(true);
          for (const s of curve.series(get, getText)) {
            expect(s.points.length, `${label}: points`).toBeGreaterThan(1);
            expect(s.points.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)), `${label}: finite`).toBe(true);
          }
          if (curve.readout) expect(typeof curve.readout(get, getText), `${label}: readout`).toBe('string');
        }
      }
    }
  });

  it('SynthV1 selects offer the engine\'s five shapes and TAL selects carry normalised values', () => {
    const v1 = controls(SYNTHV1_LAYOUT).filter((c) => c.type === 'select' && /Shape|Wave/.test(c.key + c.label));
    for (const c of v1) if (c.type === 'select') expect(c.options.map((o) => o.label)).toEqual(expect.arrayContaining(['Pulse', 'Saw', 'Sine', 'Random', 'Noise']));
    const tal = (key: string) => { const c = controls(TAL_NOIZEMAKER_LAYOUT).find((x) => x.key === key); return c && c.type === 'select' ? c.options.map((o) => Number(o.value)) : []; };
    expect(tal('filterType')).toHaveLength(12);
    expect(tal('filterType')[11]).toBe(1);
    expect(tal('osc1Waveform')).toEqual([0, 0.5, 1]);
    expect(tal('lfo1Waveform')).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    // ZynAddSubFX: the wave select lists the engine's base functions by index, the filter select the analog types that do something
    const zyn = (key: string) => { const c = controls(ZYNADDSUBFX_LAYOUT).find((x) => x.key === key); return c && c.type === 'select' ? c.options : []; };
    expect(zyn('addVoice1Wave').map((o) => o.label).slice(0, 4)).toEqual(['Sine', 'Triangle', 'Pulse', 'Saw']);
    expect(zyn('addVoice1Wave')).toHaveLength(16);
    expect(zyn('filterType').map((o) => o.value)).toEqual(['0', '1', '2', '3', '4', '5']);
  });
});

describe('the live marker follows a voice report', () => {
  /** A 16-float SynthV1 record: page 1 then page 2 (note, stage, level, elapsed, cutoff, filter level, lfo phase, filter stage). */
  const v1Record = (a: number[], b: number[]): Float32Array => new Float32Array([...a, ...b]);
  /** A 12-float TAL record. */
  const talRecord = (a: number[]): Float32Array => new Float32Array([...a, 0, 0, 0, 0]);

  it.each([
    ['SynthV1', SYNTHV1_LAYOUT, v1Record([60, 1, 0.5, 0.2, 0.5, 0.4, 0.3, 1], [60, 0, 0.3, 0.1, 0.6, 0.3, 0.2, 0]), 16],
    ['TalNoizeMaker', TAL_NOIZEMAKER_LAYOUT, talRecord([60, 1, 0.5, 0.2, 0.4, 0.4, 0.3, 1, 0.2, 0.3, 1, 0]), 12],
    ['ZynAddSubFX', ZYNADDSUBFX_LAYOUT, new Float32Array([60, 1, 0.5, 0.2, 1200, 0.6, 0, 1]), 8],
  ] as const)('%s: its marked curves place the marker inside their plot when a voice sounds and clear it when none does', (type, layout, voice, stride) => {
    const hub = new WasmVoiceHub(() => {});
    const unregister = registerVoiceHub(type, hub);
    const get = (k: string): number => defaults(layout)[k] ?? 0;
    const marked = allCurves(layout).filter((c) => c.curve.marker);
    expect(marked.length, 'marked curves').toBeGreaterThan(0);
    const placed: Array<{ label: string; section: string; x: number | null }> = [];
    const stops = marked.map(({ curve, section }) => {
      const slot = { label: curve.label, section, x: null as number | null };
      placed.push(slot);
      return curve.marker!.subscribe((x) => { slot.x = x; }, () => get);
    });
    hub.handleMessage({ type: 'voiceStatus', voices: voice, stride });
    expect(placed.filter((p) => p.x !== null).length, `${type}: curves that placed a marker`).toBeGreaterThan(0);
    for (const p of placed.filter((q) => q.x !== null)) {
      const curve = marked.find((m) => m.curve.label === p.label && m.section === p.section)!.curve;
      const [lo, hi] = typeof curve.xDomain === 'function' ? curve.xDomain(get) : curve.xDomain;
      expect(Number.isFinite(p.x!), `${p.label}: finite`).toBe(true);
      expect(p.x!, `${p.label}: within the plot`).toBeGreaterThanOrEqual(lo - 1e-9);
      expect(p.x!, `${p.label}: within the plot`).toBeLessThanOrEqual(hi + 1e-9);
    }
    hub.handleMessage({ type: 'voiceStatus', voices: new Float32Array(0), stride });
    expect(placed.every((p) => p.x === null), `${type}: markers cleared after the voice ends`).toBe(true);
    stops.forEach((stop) => stop());
    unregister();
  });

  it('SynthV1: the page 1 and page 2 amplitude markers read their own half of the record', () => {
    const hub = new WasmVoiceHub(() => {});
    const unregister = registerVoiceHub('SynthV1', hub);
    const get = (k: string): number => defaults(SYNTHV1_LAYOUT)[k] ?? 0;
    const amp = (section: string) => allSections(SYNTHV1_LAYOUT).filter((s) => s.label === 'AMP ENVELOPE')[section === 'page1' ? 0 : 1].curves![0];
    let x1: number | null = null, x2: number | null = null;
    const s1 = amp('page1').marker!.subscribe((x) => { x1 = x; }, () => get);
    const s2 = amp('page2').marker!.subscribe((x) => { x2 = x; }, () => get);
    // page 1 in its attack at level 0.2, page 2 in its release at level 0.2
    hub.handleMessage({ type: 'voiceStatus', stride: 16, voices: new Float32Array([60, 0, 0.2, 0.01, 0.5, 0.4, 0, 0, 60, 3, 0.2, 0.01, 0.5, 0.4, 0, 3]) });
    expect(x1).not.toBeNull();
    expect(x2).not.toBeNull();
    expect(x2!, 'the release is drawn after the attack').toBeGreaterThan(x1!);
    s1(); s2(); unregister();
  });
});

describe('DOMSynthPanel draws the curves and the marker on the canvas', () => {
  it('SynthV1: the DCF 1 tab shows the response and its Cutoff knob moves it', () => {
    const cfg = (cutoff: number) => ({ synthv1: { ...defaults(SYNTHV1_LAYOUT), dcf1Cutoff: cutoff } });
    const utils = render(<DOMSynthPanel layout={SYNTHV1_LAYOUT} config={cfg(0.3)} onChange={() => {}} />);
    tab(utils, 'DCF 1');
    const before = strokes.map((s) => s.join(',')).join('|');
    expect(strokes.length, 'the filter tab curves were drawn').toBeGreaterThan(0);
    strokes = [];
    act(() => { utils.rerender(<DOMSynthPanel layout={SYNTHV1_LAYOUT} config={cfg(0.9)} onChange={() => {}} />); });
    expect(strokes.map((s) => s.join(',')).join('|')).not.toEqual(before);
  });

  it('SynthV1: a voice report draws a vertical marker line on the DCA 1 envelope, and a later report moves it', () => {
    const hub = new WasmVoiceHub(() => {});
    const unregister = registerVoiceHub('SynthV1', hub);
    const utils = render(<DOMSynthPanel layout={SYNTHV1_LAYOUT} config={{ synthv1: defaults(SYNTHV1_LAYOUT) }} onChange={() => {}} />);
    tab(utils, 'DCA 1');
    const countBefore = verticals().length;
    const rec = (stage: number, level: number): Float32Array => new Float32Array([60, stage, level, 0.1, 0.5, 0.4, 0.1, stage, 60, stage, level, 0.1, 0.5, 0.4, 0.1, stage]);
    act(() => { hub.handleMessage({ type: 'voiceStatus', stride: 16, voices: rec(0, 0.2) }); });
    const early = verticals().slice(countBefore);
    expect(early.length, 'marker lines drawn').toBeGreaterThan(0);
    strokes = [];
    act(() => { hub.handleMessage({ type: 'voiceStatus', stride: 16, voices: rec(3, 0.05) }); });
    const late = verticals();
    expect(late.length).toBeGreaterThan(0);
    expect(late.map((s) => s[0]).join(',')).not.toEqual(early.map((s) => s[0]).join(','));
    unregister();
  });

  it('ZynAddSubFX: the FILTER tab shows the response and its Cutoff knob moves it, a voice report moves the envelope marker', () => {
    const hub = new WasmVoiceHub(() => {});
    const unregister = registerVoiceHub('ZynAddSubFX', hub);
    const cfg = (cutoff: number) => ({ zynaddsubfx: { ...defaults(ZYNADDSUBFX_LAYOUT), filterCutoff: cutoff, ampAttack: 0.4 } });
    const utils = render(<DOMSynthPanel layout={ZYNADDSUBFX_LAYOUT} config={cfg(0.3)} onChange={() => {}} />);
    tab(utils, 'FILTER');
    const before = strokes.map((s) => s.join(',')).join('|');
    expect(strokes.length, 'the filter tab curves were drawn').toBeGreaterThan(0);
    const countBefore = verticals().length;
    act(() => { hub.handleMessage({ type: 'voiceStatus', voices: new Float32Array([60, 0, 0.2, 0.05, 900, 0.5, 0, 0]) }); });
    const early = verticals().slice(countBefore);
    expect(early.length, 'marker lines drawn').toBeGreaterThan(0);
    strokes = [];
    act(() => { hub.handleMessage({ type: 'voiceStatus', voices: new Float32Array([60, 2, 0.5, 0.9, 900, 0.5, 0, 2]) }); });
    expect(verticals().map((s) => s[0]).join(',')).not.toEqual(early.map((s) => s[0]).join(','));
    strokes = [];
    act(() => { utils.rerender(<DOMSynthPanel layout={ZYNADDSUBFX_LAYOUT} config={cfg(0.9)} onChange={() => {}} />); });
    expect(strokes.map((s) => s.join(',')).join('|')).not.toEqual(before);
    unregister();
  });

  it('TAL-NoiseMaker: the FILTER tab shows the response and its Cutoff knob moves it', () => {
    const cfg = (cutoff: number) => ({ talNoizeMaker: { ...defaults(TAL_NOIZEMAKER_LAYOUT), cutoff } });
    const utils = render(<DOMSynthPanel layout={TAL_NOIZEMAKER_LAYOUT} config={cfg(0.3)} onChange={() => {}} />);
    tab(utils, 'FILTER');
    const before = strokes.map((s) => s.join(',')).join('|');
    expect(strokes.length, 'the filter tab curves were drawn').toBeGreaterThan(0);
    strokes = [];
    act(() => { utils.rerender(<DOMSynthPanel layout={TAL_NOIZEMAKER_LAYOUT} config={cfg(0.9)} onChange={() => {}} />); });
    expect(strokes.map((s) => s.join(',')).join('|')).not.toEqual(before);
  });

  it('TAL-NoiseMaker: a voice report draws a vertical marker line on the amplitude envelope, and a later report moves it', () => {
    const hub = new WasmVoiceHub(() => {});
    const unregister = registerVoiceHub('TalNoizeMaker', hub);
    const utils = render(<DOMSynthPanel layout={TAL_NOIZEMAKER_LAYOUT} config={{ talNoizeMaker: { ...defaults(TAL_NOIZEMAKER_LAYOUT), ampAttack: 0.4, ampDecay: 0.4, ampSustain: 0.5 } }} onChange={() => {}} />);
    tab(utils, 'FILTER');
    const countBefore = verticals().length;
    const rec = (stage: number, level: number): Float32Array => new Float32Array([60, stage, level, 0.3, 0.4, 0.4, 0.2, stage, 0.1, 0, 4, 0]);
    act(() => { hub.handleMessage({ type: 'voiceStatus', stride: 12, voices: rec(0, 0.3) }); });
    const early = verticals().slice(countBefore);
    expect(early.length, 'marker lines drawn').toBeGreaterThan(0);
    strokes = [];
    act(() => { hub.handleMessage({ type: 'voiceStatus', stride: 12, voices: rec(2, 0.5) }); });
    const late = verticals();
    expect(late.length).toBeGreaterThan(0);
    expect(late.map((s) => s[0]).join(',')).not.toEqual(early.map((s) => s[0]).join(','));
    unregister();
  });
});
