/**
 * Reachability for the WASM subtractive and demoscene layouts (rollout groups 4 and 5): DOMSynthPanel renders each real
 * layout, the real CurveCanvas draws it on a recording 2D context, a knob change changes what is drawn, and a stubbed voice
 * report moves the live marker. Behaviour of each model is tested where it lives (the *Curves.test.ts files, against the
 * real engines); this file proves the wiring once per synth.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, act, cleanup } from '@testing-library/react';
import { DOMSynthPanel } from '../../controls/DOMSynthPanel';
import type { CurveDescriptor, SynthPanelLayout, SectionDescriptor, ControlDescriptor } from '@/types/synthPanel';
import { MDA_JX10_LAYOUT } from '@/constants/synthLayouts/mdaJX10';
import { RAFFO_LAYOUT } from '@/constants/synthLayouts/raffo';
import { CALF_MONO_LAYOUT } from '@/constants/synthLayouts/calfMono';
import { AMSYNTH_LAYOUT } from '@/constants/synthLayouts/amsynth';
import { TUNEFISH_LAYOUT } from '@/constants/synthLayouts/tunefish';
import { FALCON_LAYOUT } from '@/constants/synthLayouts/wavesabreFalcon';
import { SLAUGHTER_LAYOUT } from '@/constants/synthLayouts/wavesabreSlaughter';
import { OIDOS_LAYOUT } from '@/constants/synthLayouts/oidos';
import { SYNTH_LAYOUTS } from '@/constants/synthLayouts';
import { WasmVoiceHub, registerVoiceHub, VOICE_RECORD_FLOATS } from '@/engine/voiceStatus/wasmVoiceStatus';

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

/** [layout, synth type the markers listen to, curve labels that must exist] */
const FAMILIES = [
  ['MdaJX10', MDA_JX10_LAYOUT, 'MdaJX10', ['Amplitude Envelope', 'Filter Envelope', 'Filter Response (middle C)', 'LFO', 'Filter LFO', 'Oscillator (4 cycles)']],
  ['RaffoSynth', RAFFO_LAYOUT, 'RaffoSynth', ['Amplitude Envelope', 'Filter Envelope', 'Filter Response', 'Oscillators (4 cycles)']],
  ['CalfMono', CALF_MONO_LAYOUT, 'CalfMono', ['Filter Response (middle C)', 'EG1 Filter Envelope', 'EG2 Modulation Envelope', 'LFO 1']],
  ['Amsynth', AMSYNTH_LAYOUT, 'AMSynth', ['Amplitude Envelope', 'Filter Envelope', 'Filter Response (middle C)', 'Oscillators (4 cycles)']],
  ['TunefishSynth', TUNEFISH_LAYOUT, 'TunefishSynth', ['Low-pass Filter Response', 'High-pass Filter Response', 'Band-pass Filter Response', 'Notch Filter Response']],
  ['WaveSabreFalcon', FALCON_LAYOUT, 'WaveSabreFalcon', ['Carrier Envelope', 'Modulator Envelope', 'FM Waveform (middle C, 3 cycles)']],
  ['WaveSabreSlaughter', SLAUGHTER_LAYOUT, 'WaveSabreSlaughter', ['Amplitude Envelope', 'Filter Envelope', 'Filter Response', 'Oscillator (3 cycles)']],
  ['OidosSynth', OIDOS_LAYOUT, 'OidosSynth', ['Envelope', 'Mode Decay (level over time)', 'Filter Window (semitones from the note)', 'Spectrum at the start (middle C)']],
] as const;

describe('the layouts declare their curves and are registered under their synth types', () => {
  it.each(FAMILIES)('%s', (type, layout, _synth, labels) => {
    expect(SYNTH_LAYOUTS[type]).toBe(layout);
    expect(allCurves(layout).map((c) => c.curve.label)).toEqual(expect.arrayContaining([...labels]));
  });

  it('every curve of every one of these layouts draws finite points, at the defaults and when every value reads 0', () => {
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
});

/** A report record: note, stage, level, elapsed, cutoff, filter level, lfo phase, filter stage. */
const record = (note: number, stage: number, level: number, elapsed: number, cutoff: number, filterLevel: number, lfo: number, filterStage = stage): Float32Array =>
  new Float32Array([note, stage, level, elapsed, cutoff, filterLevel, lfo, filterStage]);

describe('the live marker follows a voice report', () => {
  it.each([
    ['MdaJX10', MDA_JX10_LAYOUT, record(60, 1, 0.5, 0.3, 0.05, 0.4, 0.3)],
    ['RaffoSynth', RAFFO_LAYOUT, record(60, 1, 0.6, 0.1, 1500, 0.5, 0, 1)],
    ['CalfMono', CALF_MONO_LAYOUT, record(60, 1, 0.5, 0.2, 1200, 0.4, 0.3)],
    ['AMSynth', AMSYNTH_LAYOUT, record(60, 1, 0.5, 0.2, 1500, 0.4, 0.3)],
    ['TunefishSynth', TUNEFISH_LAYOUT, new Float32Array([60, 2, 1, 0.2, 0.5, 0.5, 0, 2, 0.3, 0.4, 0.6, 0.8])],
    ['WaveSabreFalcon', FALCON_LAYOUT, record(60, 1, 0.5, 0.2, 0, 0.4, 0.3)],
    ['WaveSabreSlaughter', SLAUGHTER_LAYOUT, record(60, 1, 0.5, 0.2, 2000, 0.4, 0.3)],
    ['OidosSynth', OIDOS_LAYOUT, record(60, 2, 1, 0.3, 0, 0, 0)],
  ] as const)('%s: its marked curves place the marker inside their plot when a voice sounds and clear it when none does', (type, layout, voice) => {
    const hub = new WasmVoiceHub(() => {});
    const unregister = registerVoiceHub(type, hub);
    // Tunefish draws a filter's marker only while that filter is on
    const on = type === 'TunefishSynth' ? { lpFilterOn: 1, hpFilterOn: 1, bpFilterOn: 1, ntFilterOn: 1 } : {};
    const get = (k: string): number => (on as Record<string, number>)[k] ?? defaults(layout)[k] ?? 0;
    const marked = allCurves(layout).filter((c) => c.curve.marker);
    expect(marked.length, 'marked curves').toBeGreaterThan(0);
    const placed: Array<{ label: string; x: number | null }> = [];
    const stops = marked.map(({ curve }) => {
      const slot = { label: curve.label, x: null as number | null };
      placed.push(slot);
      return curve.marker!.subscribe((x) => { slot.x = x; }, () => get);
    });
    hub.handleMessage({ type: 'voiceStatus', voices: voice, stride: voice.length });
    const placedNow = placed.filter((p) => p.x !== null);
    expect(placedNow.length, `${type}: curves that placed a marker`).toBeGreaterThan(0);
    for (const p of placedNow) {
      const curve = marked.find((m) => m.curve.label === p.label)!.curve;
      const [lo, hi] = typeof curve.xDomain === 'function' ? curve.xDomain(get) : curve.xDomain;
      expect(Number.isFinite(p.x!), `${p.label}: finite`).toBe(true);
      expect(p.x!, `${p.label}: within the plot`).toBeGreaterThanOrEqual(lo - 1e-9);
      expect(p.x!, `${p.label}: within the plot`).toBeLessThanOrEqual(hi + 1e-9);
    }
    hub.handleMessage({ type: 'voiceStatus', voices: new Float32Array(Math.max(VOICE_RECORD_FLOATS, voice.length)).fill(0).map((_, i) => (i % voice.length === 1 ? 4 : 0)), stride: voice.length });
    expect(placed.every((p) => p.x === null), `${type}: markers cleared after the voice ends`).toBe(true);
    stops.forEach((stop) => stop());
    unregister();
  });
});

describe('DOMSynthPanel draws the curves and the marker on the canvas', () => {
  const jx10 = (over: Record<string, number> = {}) => ({ mdaJX10: { ...defaults(MDA_JX10_LAYOUT), ...over } });

  it('MDA JX10: a Frequency knob change redraws the filter curve (sentinel: strokes on the real canvas)', () => {
    const { rerender } = render(<DOMSynthPanel layout={MDA_JX10_LAYOUT} config={jx10({ vcfFreq: 0.4 })} onChange={() => {}} />);
    const before = strokes.map((s) => s.join(','));
    expect(strokes.length, 'curves were drawn at all').toBeGreaterThan(0);
    strokes = [];
    act(() => { rerender(<DOMSynthPanel layout={MDA_JX10_LAYOUT} config={jx10({ vcfFreq: 0.8 })} onChange={() => {}} />); });
    const after = strokes.map((s) => s.join(','));
    expect(after.length).toBeGreaterThan(0);
    expect(after.join('|')).not.toEqual(before.join('|'));
  });

  it('MDA JX10: a voice report draws a vertical marker line on the envelope plot, and a later report moves it', () => {
    const hub = new WasmVoiceHub(() => {});
    const unregister = registerVoiceHub('MdaJX10', hub);
    render(<DOMSynthPanel layout={MDA_JX10_LAYOUT} config={jx10()} onChange={() => {}} />);
    const verticals = () => strokes.filter((s) => s.length === 4 && s[0] === s[2] && s[1] !== s[3]);
    const countBefore = verticals().length;
    act(() => { hub.handleMessage({ type: 'voiceStatus', voices: record(60, 0, 0.2, 0.001, 0.05, 0.2, 0.1) }); });
    const early = verticals().slice(countBefore);
    expect(early.length, 'marker lines drawn').toBeGreaterThan(0);
    strokes = [];
    act(() => { hub.handleMessage({ type: 'voiceStatus', voices: record(60, 3, 0.05, 1.5, 0.05, 0.05, 0.6, 3) }); });
    const late = verticals();
    expect(late.length).toBeGreaterThan(0);
    expect(late.map((s) => s[0]).join(',')).not.toEqual(early.map((s) => s[0]).join(','));
    unregister();
  });

  it('Calf Monosynth: the Filter tab shows the response and its Cutoff knob moves it', () => {
    const calf = (cutoff: number) => ({ calfMono: { ...defaults(CALF_MONO_LAYOUT), cutoff } });
    const { getAllByText, rerender } = render(<DOMSynthPanel layout={CALF_MONO_LAYOUT} config={calf(500)} onChange={() => {}} />);
    fireEvent.click(getAllByText('FILTER').find((el) => el.tagName === 'BUTTON')!);
    const before = strokes.map((x) => x.join(',')).join('|');
    expect(strokes.length, 'the filter tab curves were drawn').toBeGreaterThan(0);
    strokes = [];
    act(() => { rerender(<DOMSynthPanel layout={CALF_MONO_LAYOUT} config={calf(6000)} onChange={() => {}} />); });
    expect(strokes.map((x) => x.join(',')).join('|')).not.toEqual(before);
  });

  it('Tunefish: the low-pass curve follows its Cutoff knob', () => {
    const tf = (c: number) => ({ tunefish: { ...defaults(TUNEFISH_LAYOUT), lpFilterOn: 1, lpFilterCutoff: c } });
    const { getAllByText, rerender } = render(<DOMSynthPanel layout={TUNEFISH_LAYOUT} config={tf(0.3)} onChange={() => {}} />);
    fireEvent.click(getAllByText('FILTER').find((el) => el.tagName === 'BUTTON')!);
    const before = strokes.map((x) => x.join(',')).join('|');
    expect(strokes.length, 'the filter tab curves were drawn').toBeGreaterThan(0);
    strokes = [];
    act(() => { rerender(<DOMSynthPanel layout={TUNEFISH_LAYOUT} config={tf(0.8)} onChange={() => {}} />); });
    expect(strokes.map((x) => x.join(',')).join('|')).not.toEqual(before);
  });

  it('WaveSabre Slaughter and Falcon: the envelope curves follow their attack knobs (config under a dotted key)', () => {
    const slaughter = (a: number) => ({ wavesabre: { slaughter: { ...defaults(SLAUGHTER_LAYOUT), ampAttack: a, ampSustain: 0.5 } } });
    const s = render(<DOMSynthPanel layout={SLAUGHTER_LAYOUT} config={slaughter(0.1)} onChange={() => {}} />);
    fireEvent.click(s.getByText('ENVELOPES'));
    const before = strokes.slice(0, 40).map((x) => x.join(',')).join('|');
    strokes = [];
    act(() => { s.rerender(<DOMSynthPanel layout={SLAUGHTER_LAYOUT} config={slaughter(0.9)} onChange={() => {}} />); });
    expect(strokes.slice(0, 40).map((x) => x.join(',')).join('|')).not.toEqual(before);
    s.unmount();
    strokes = [];
    const falcon = (a: number) => ({ wavesabre: { falcon: { ...defaults(FALCON_LAYOUT), attack1: a } } });
    const f = render(<DOMSynthPanel layout={FALCON_LAYOUT} config={falcon(0.1)} onChange={() => {}} />);
    fireEvent.click(f.getByText('ENVELOPES'));
    const fb = strokes.slice(0, 40).map((x) => x.join(',')).join('|');
    strokes = [];
    act(() => { f.rerender(<DOMSynthPanel layout={FALCON_LAYOUT} config={falcon(0.9)} onChange={() => {}} />); });
    expect(strokes.slice(0, 40).map((x) => x.join(',')).join('|')).not.toEqual(fb);
  });
});
