/**
 * Reachability for the Tone.js based layouts (rollout wave 1a): DOMSynthPanel renders the real layout, the real
 * CurveCanvas draws it on a recording 2D context, a knob change changes the drawing, and a note on a stub Tone
 * instrument registered with the real voice probe moves the marker to the place the pure marker functions say.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, act, cleanup } from '@testing-library/react';

const clockState = vi.hoisted(() => ({ now: 100 }));
vi.mock('tone', async (importOriginal) => {
  const actual = await importOriginal<typeof import('tone')>();
  return { ...actual, now: () => clockState.now };
});

import { DOMSynthPanel } from '../../controls/DOMSynthPanel';
import type { SynthPanelLayout, CurveDescriptor } from '@/types/synthPanel';
import {
  SYNTH_LAYOUT, MONO_SYNTH_LAYOUT, DUO_SYNTH_LAYOUT, FM_SYNTH_LAYOUT, AM_SYNTH_LAYOUT, PLUCK_SYNTH_LAYOUT,
  METAL_SYNTH_LAYOUT, MEMBRANE_SYNTH_LAYOUT, NOISE_SYNTH_LAYOUT,
} from '@/constants/synthLayouts/toneSynths';
import { PWM_SYNTH_LAYOUT } from '@/constants/synthLayouts/pwmSynth';
import { SUPER_SAW_LAYOUT } from '@/constants/synthLayouts/superSaw';
import { WAVETABLE_LAYOUT } from '@/constants/synthLayouts/wavetable';
import { POLY_SYNTH_LAYOUT } from '@/constants/synthLayouts/polySynth';
import { CHIP_SYNTH_LAYOUT } from '@/constants/synthLayouts/chipSynth';
import { FORMANT_SYNTH_LAYOUT } from '@/constants/synthLayouts/formantSynth';
import { STRING_MACHINE_LAYOUT } from '@/constants/synthLayouts/stringMachine';
import { toneVoiceProbe, registerVoiceSource } from '@/engine/tone/toneVoiceProbe';
import { toneEnvelopeMarkerX, filterMarkerHz, lfoMarkerSeconds } from '../toneCurveMarkers';
import { xFraction } from '../curveGeometry';

interface Stroke { style: string; pts: number[] }
let strokes: Stroke[] = [];
let current: number[] = [];
let strokeStyle = '';
const noopCtx = new Proxy({} as Record<string, unknown>, { get: () => () => {}, set: () => true });
const ctxStub = new Proxy({} as Record<string, unknown>, {
  get: (_t, prop: string) => {
    if (prop === 'beginPath') return () => { current = []; };
    if (prop === 'moveTo' || prop === 'lineTo') return (x: number, y: number) => { current.push(Math.round(x * 100) / 100, Math.round(y * 100) / 100); };
    if (prop === 'stroke') return () => { strokes.push({ style: strokeStyle, pts: [...current] }); };
    return () => {};
  },
  set: (_t, prop: string, value: unknown) => { if (prop === 'strokeStyle') strokeStyle = String(value); return true; },
});

const WIDTH = 300;
const PAD = 4;
beforeEach(() => {
  strokes = [];
  clockState.now = 100;
  vi.stubGlobal('ResizeObserver', class {
    cb: (e: Array<{ contentRect: { width: number } }>) => void;
    constructor(cb: (e: Array<{ contentRect: { width: number } }>) => void) { this.cb = cb; }
    observe() { this.cb([{ contentRect: { width: WIDTH } }]); }
    disconnect() {}
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    return (this.style.width === '100%' ? ctxStub : noopCtx) as never;
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const allSections = (l: SynthPanelLayout) => [...(l.sections ?? []), ...(l.tabs ?? []).flatMap((t) => t.sections)];
const curvesOf = (l: SynthPanelLayout): CurveDescriptor[] => allSections(l).flatMap((s) => s.curves ?? []);
/** The drawn series polylines (more than one segment), i.e. everything but the 2-point marker and grid lines. */
const polylines = () => strokes.filter((s) => s.pts.length > 8 && s.style !== '#ffffff');
const markerLines = () => strokes.filter((s) => s.style === '#ffffff');

const toneConfig = (over: Record<string, unknown> = {}) => ({
  oscillator: { type: 'sawtooth', detune: 0, octave: 0 },
  envelope: { attack: 10, decay: 200, sustain: 50, release: 1000 },
  filter: { type: 'lowpass', frequency: 2000, Q: 1 },
  volume: -12, pan: 0,
  ...over,
});

describe('markers are required: every curve of every wave 1a layout carries a live marker', () => {
  it.each([
    ['Synth', SYNTH_LAYOUT, 3], ['MonoSynth', MONO_SYNTH_LAYOUT, 4], ['DuoSynth', DUO_SYNTH_LAYOUT, 4], ['FMSynth', FM_SYNTH_LAYOUT, 4],
    ['ToneAM', AM_SYNTH_LAYOUT, 4], ['MetalSynth', METAL_SYNTH_LAYOUT, 1], ['MembraneSynth', MEMBRANE_SYNTH_LAYOUT, 1],
    ['NoiseSynth', NOISE_SYNTH_LAYOUT, 1], ['PWMSynth', PWM_SYNTH_LAYOUT, 3], ['SuperSaw', SUPER_SAW_LAYOUT, 2],
    ['Wavetable', WAVETABLE_LAYOUT, 3], ['PolySynth', POLY_SYNTH_LAYOUT, 1], ['ChipSynth', CHIP_SYNTH_LAYOUT, 1],
    ['FormantSynth', FORMANT_SYNTH_LAYOUT, 1], ['StringMachine', STRING_MACHINE_LAYOUT, 3],
  ] as const)('%s', (_name, layout, count) => {
    const curves = curvesOf(layout);
    expect(curves).toHaveLength(count);
    // The FM / AM spectrum is the steady-state line spectrum of the settings: no voice position to show on it.
    for (const c of curves.filter((x) => !/spectrum/.test(x.label))) expect(c.marker, `${c.label} has a marker`).toBeDefined();
  });

  it('PluckSynth draws nothing: its knobs set a Karplus-Strong string and no curve model follows them', () => {
    expect(curvesOf(PLUCK_SYNTH_LAYOUT)).toHaveLength(0);
  });
});

describe('DOMSynthPanel draws a Tone layout curve that follows its knob', () => {
  const redraw = (layout: SynthPanelLayout, before: Record<string, unknown>, after: Record<string, unknown>) => {
    const { rerender } = render(<DOMSynthPanel layout={layout} config={before} onChange={() => {}} />);
    const first = polylines();
    expect(first.length, 'the curve was drawn at all').toBeGreaterThan(0);
    strokes = [];
    act(() => { rerender(<DOMSynthPanel layout={layout} config={after} onChange={() => {}} />); });
    return { first, second: polylines() };
  };

  it.each([
    ['Synth', SYNTH_LAYOUT], ['FMSynth', FM_SYNTH_LAYOUT], ['ToneAM', AM_SYNTH_LAYOUT], ['NoiseSynth', NOISE_SYNTH_LAYOUT], ['MonoSynth', MONO_SYNTH_LAYOUT],
  ] as const)('%s: changing Release redraws the amp envelope', (_n, layout) => {
    const { first, second } = redraw(layout, toneConfig(), toneConfig({ envelope: { attack: 10, decay: 200, sustain: 50, release: 4000 } }));
    expect(second.length).toBeGreaterThan(0);
    expect(second).not.toEqual(first);
  });

  it('MetalSynth and MembraneSynth: changing Decay redraws the envelope', () => {
    for (const layout of [METAL_SYNTH_LAYOUT, MEMBRANE_SYNTH_LAYOUT]) {
      strokes = [];
      const { first, second } = redraw(layout, toneConfig({ envelope: { attack: 1, decay: 100, release: 100 } }), toneConfig({ envelope: { attack: 1, decay: 1500, release: 100 } }));
      expect(second).not.toEqual(first);
    }
  });

  it('MonoSynth: the filter curve follows Q, Base Cutoff and Sweep Octaves, and the layout has no Cutoff knob the engine would ignore', () => {
    const filterStrokes = (cfg: Record<string, unknown>) => {
      strokes = [];
      render(<DOMSynthPanel layout={MONO_SYNTH_LAYOUT} config={cfg} onChange={() => {}} />);
      return polylines().filter((s) => s.pts.length > 300); // the 160-point response lines (2 coordinates per point)
    };
    const base = filterStrokes(toneConfig());
    expect(base.length).toBeGreaterThan(0);
    expect(filterStrokes(toneConfig({ filter: { type: 'lowpass', frequency: 15000, Q: 1 } }))).toEqual(base); // filter.frequency is not a knob
    expect(filterStrokes(toneConfig({ filter: { type: 'lowpass', Q: 12 } }))).not.toEqual(base);
    expect(filterStrokes(toneConfig({ filterEnvelope: { baseFrequency: 1200, octaves: 3 } }))).not.toEqual(base);
    expect(filterStrokes(toneConfig({ filterEnvelope: { baseFrequency: 200, octaves: 6 } }))).not.toEqual(base);
    const keys = allSections(MONO_SYNTH_LAYOUT).flatMap((sec) => sec.controls.map((c) => c.key));
    expect(keys).not.toContain('filter.frequency');
  });

  it('Pitch Envelope and LFO curves follow their knobs; Synth/Duo/FM/AM/Noise offer no Filter section (those voices have no filter)', () => {
    const drawn = (layout: SynthPanelLayout, cfg: Record<string, unknown>) => { strokes = []; render(<DOMSynthPanel layout={layout} config={cfg} onChange={() => {}} />); return polylines(); };
    const on = { enabled: true, amount: 12, attack: 0, decay: 300, sustain: 0, release: 200 };
    const first = drawn(SYNTH_LAYOUT, toneConfig({ pitchEnvelope: on }));
    expect(drawn(SYNTH_LAYOUT, toneConfig({ pitchEnvelope: { ...on, amount: -24 } }))).not.toEqual(first);
    expect(drawn(SYNTH_LAYOUT, toneConfig({ pitchEnvelope: { ...on, decay: 900 } }))).not.toEqual(first);
    const lfo = { enabled: true, waveform: 'sine', rate: 3, pitchAmount: 20, volumeAmount: 0, filterAmount: 0 };
    const sine = drawn(SYNTH_LAYOUT, toneConfig({ lfo }));
    expect(drawn(SYNTH_LAYOUT, toneConfig({ lfo: { ...lfo, waveform: 'square' } }))).not.toEqual(sine);
    expect(drawn(SYNTH_LAYOUT, toneConfig({ lfo: { ...lfo, rate: 9 } }))).not.toEqual(sine);
    for (const layout of [SYNTH_LAYOUT, DUO_SYNTH_LAYOUT, FM_SYNTH_LAYOUT, AM_SYNTH_LAYOUT, NOISE_SYNTH_LAYOUT]) {
      expect(allSections(layout).flatMap((sec) => sec.controls.map((c) => c.key)).filter((k) => k.startsWith('filter.'))).toEqual([]);
    }
  });

  it('FM and AM spectrum: drawn for a sine modulator, follows Modulation Index and Harmonicity, absent for the default square modulator', () => {
    const fm = (extra: Record<string, unknown>) => toneConfig({ oscillator: { type: 'sine', detune: 0, octave: 0 }, modulation: { type: 'sine' }, ...extra });
    const lines = (layout: SynthPanelLayout, cfg: Record<string, unknown>) => { strokes = []; render(<DOMSynthPanel layout={layout} config={cfg} onChange={() => {}} />); return polylines().filter((s) => s.pts.length > 12 && s.pts.length < 200); };
    const base = lines(FM_SYNTH_LAYOUT, fm({ modulationIndex: 10, harmonicity: 3 }));
    expect(base.length).toBeGreaterThan(0);
    expect(lines(FM_SYNTH_LAYOUT, fm({ modulationIndex: 30, harmonicity: 3 }))).not.toEqual(base);
    expect(lines(FM_SYNTH_LAYOUT, fm({ modulationIndex: 10, harmonicity: 2.5 }))).not.toEqual(base);
    const amBase = lines(AM_SYNTH_LAYOUT, fm({ harmonicity: 2 }));
    expect(amBase.length).toBeGreaterThan(0);
    expect(lines(AM_SYNTH_LAYOUT, fm({ harmonicity: 3 }))).not.toEqual(amBase);
    // an unset modulator is Tone's square wave: there is no closed-form spectrum to draw, and the curve says so
    expect(lines(FM_SYNTH_LAYOUT, toneConfig({ oscillator: { type: 'sine', detune: 0, octave: 0 }, modulationIndex: 10, harmonicity: 3 }))).toEqual([]);
  });

  it('DuoSynth: the vibrato curve follows the Detune knob', () => {
    const vib = (detune: number) => {
      strokes = [];
      render(<DOMSynthPanel layout={DUO_SYNTH_LAYOUT} config={toneConfig({ oscillator: { type: 'sawtooth', detune, octave: 0 } })} onChange={() => {}} />);
      return polylines().filter((s) => s.pts.length > 300);
    };
    expect(vib(100)).not.toEqual(vib(10));
  });
});

describe('the live marker follows a voice reported by the voice probe (real layout, real canvas, stub Tone instrument)', () => {
  const env = () => ({ value: 0.4, attack: 0.01, decay: 0.2, sustain: 0.5, release: 1, getValueAtTime: () => 0 });
  const polyStub = () => {
    const voices: Array<{ midi: number; voice: { envelope: ReturnType<typeof env>; filterEnvelope?: unknown }; released: boolean }> = [];
    return {
      _activeVoices: voices,
      triggerAttack(note: string, _time?: number) { void note; voices.push({ midi: 60, voice: { envelope: env() }, released: false }); },
      triggerRelease(_note: string, _time?: number) {},
    };
  };

  it('Synth amp envelope: a note at t=100 puts the marker where toneEnvelopeMarkerX says, and it moves as time passes', () => {
    const poly = polyStub();
    toneVoiceProbe.track(42, poly);
    try {
      render(<DOMSynthPanel layout={SYNTH_LAYOUT} config={toneConfig()} onChange={() => {}} instrumentId={42} />);
      expect(markerLines()).toHaveLength(0);
      poly.triggerAttack('C4', 100);
      clockState.now = 100.005;
      act(() => { toneVoiceProbe.tick(); });
      const px = (frac: number) => Math.round((PAD + frac * (WIDTH - 2 * PAD) + 0.5) * 100) / 100;
      const first = markerLines().slice(-1)[0];
      expect(first, 'a marker was drawn (sentinel)').toBeDefined();
      expect(first.pts[0]).toBe(px(toneEnvelopeMarkerX(10, 200, 50, 1000, { stage: 'attack', stageElapsedMs: 5 })!));

      strokes = [];
      clockState.now = 100.3; // 300 ms: sustain
      act(() => { toneVoiceProbe.tick(); });
      const second = markerLines().slice(-1)[0];
      expect(second.pts[0]).toBe(px(toneEnvelopeMarkerX(10, 200, 50, 1000, { stage: 'sustain', stageElapsedMs: 90 })!));
      expect(second.pts[0]).toBeGreaterThan(first.pts[0]);
    } finally {
      toneVoiceProbe.untrack(poly);
    }
  });

  it('PWM Synth: filter marker sits at the voice cutoff on the log axis, LFO marker at the phase of the registered chorus clock', () => {
    const poly = polyStub();
    const wrapper = registerVoiceSource({ triggerAttack: () => {} }, poly, {
      filter: { frequency: { value: 4000 } }, lfo: { rateHz: () => 2, startTime: 100 },
    });
    toneVoiceProbe.track(43, wrapper);
    try {
      const cfg = { pwmSynth: { filter: { type: 'lowpass', cutoff: 4000, resonance: 20 }, envelope: { attack: 10, decay: 200, sustain: 50, release: 300 }, pwmRate: 2, pwmDepth: 30 } };
      const { getByText } = render(<DOMSynthPanel layout={PWM_SYNTH_LAYOUT} config={cfg} onChange={() => {}} instrumentId={43} />);
      poly.triggerAttack('C4', 100);
      clockState.now = 100.125; // 0.25 of a 2 Hz cycle
      act(() => { toneVoiceProbe.tick(); });
      const lfoX = lfoMarkerSeconds(2, 1, { lfoPhase: 0.25 })!;
      expect(markerLines().slice(-1)[0].pts[0]).toBe(Math.round((PAD + lfoX * (WIDTH - 2 * PAD) + 0.5) * 100) / 100);

      strokes = [];
      fireEvent.click(getByText('FILT'));
      act(() => { toneVoiceProbe.tick(); });
      const hz = filterMarkerHz({ cutoffHz: 4000 })!;
      const frac = xFraction({ xScale: 'log', xDomain: [20, 20000], yDomain: [0, 1] }, hz);
      expect(markerLines().slice(-1)[0].pts[0]).toBe(Math.round((PAD + frac * (WIDTH - 2 * PAD) + 0.5) * 100) / 100);
    } finally {
      toneVoiceProbe.untrack(wrapper);
    }
  });

  it('without an instrument id (no editor binding) a marker subscribes to nothing and the panel still renders', () => {
    const { container } = render(<DOMSynthPanel layout={SYNTH_LAYOUT} config={toneConfig()} onChange={() => {}} />);
    expect(container.querySelector('canvas')).not.toBeNull();
    expect(toneVoiceProbe.running).toBe(false);
  });
});
