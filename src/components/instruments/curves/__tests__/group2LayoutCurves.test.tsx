/**
 * Reachability for the community-subtractive layouts (rollout group 2): DOMSynthPanel renders a real layout, the
 * real CurveCanvas draws it on a (recording) 2D context, and a knob value change changes what is drawn.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { DOMSynthPanel } from '../../controls/DOMSynthPanel';
import type { SynthPanelLayout } from '@/types/synthPanel';
import { PWM_SYNTH_LAYOUT } from '@/constants/synthLayouts/pwmSynth';
import { SUPER_SAW_LAYOUT } from '@/constants/synthLayouts/superSaw';
import { WAVETABLE_LAYOUT } from '@/constants/synthLayouts/wavetable';
import { POLY_SYNTH_LAYOUT } from '@/constants/synthLayouts/polySynth';
import { CHIP_SYNTH_LAYOUT } from '@/constants/synthLayouts/chipSynth';
import { FORMANT_SYNTH_LAYOUT } from '@/constants/synthLayouts/formantSynth';
import { STRING_MACHINE_LAYOUT } from '@/constants/synthLayouts/stringMachine';

/** One recorded stroke: the polyline's x, y pairs as drawn. */
let strokes: number[][] = [];
let path: number[] = [];
const noopCtx = new Proxy({} as Record<string, unknown>, { get: () => () => {}, set: () => true });
const ctxStub = new Proxy({} as Record<string, unknown>, {
  get: (_t, prop: string) => {
    if (prop === 'beginPath') return () => { path = []; };
    if (prop === 'moveTo' || prop === 'lineTo') return (x: number, y: number) => { path.push(Math.round(x * 100) / 100, Math.round(y * 100) / 100); };
    if (prop === 'stroke') return () => { if (path.length > 4) strokes.push([...path]); };
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
  // Only the CurveCanvas canvas (full-width style) is recorded; knob canvases get a silent context.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    return (this.style.width === '100%' ? ctxStub : noopCtx) as never;
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const curveLabels = (layout: SynthPanelLayout): string[] =>
  [...(layout.sections ?? []), ...(layout.tabs ?? []).flatMap((t) => t.sections)].flatMap((s) => (s.curves ?? []).map((c) => c.label));

describe('group 2 layouts declare their curves', () => {
  it.each([
    ['PWM', PWM_SYNTH_LAYOUT, 3],
    ['SuperSaw', SUPER_SAW_LAYOUT, 2],
    ['Wavetable', WAVETABLE_LAYOUT, 3],
    ['PolySynth', POLY_SYNTH_LAYOUT, 1],
    ['Chip', CHIP_SYNTH_LAYOUT, 1],
    ['Formant', FORMANT_SYNTH_LAYOUT, 1],
    ['StringMachine', STRING_MACHINE_LAYOUT, 3],
  ] as const)('%s', (_n, layout, count) => {
    expect(curveLabels(layout)).toHaveLength(count);
  });
});

describe('DOMSynthPanel draws a group 2 layout curve that follows its knob', () => {
  const pwm = (cutoff: number, resonance = 20) => ({
    pwmSynth: {
      filter: { type: 'lowpass', cutoff, resonance, envelopeAmount: 0, keyTracking: 0 },
      envelope: { attack: 50, decay: 500, sustain: 0, release: 100 },
      pwmRate: 2, pwmDepth: 30,
    },
  });

  it('PWM Synth filter curve: changing Cutoff redraws a different response (sentinel: strokes recorded on the real canvas)', () => {
    const { getByText, rerender } = render(<DOMSynthPanel layout={PWM_SYNTH_LAYOUT} config={pwm(400)} onChange={() => {}} />);
    fireEvent.click(getByText('FILT'));
    const before = strokes.slice(-1)[0];
    expect(before, 'the filter curve was drawn at all').toBeDefined();
    strokes = [];
    act(() => { rerender(<DOMSynthPanel layout={PWM_SYNTH_LAYOUT} config={pwm(9000)} onChange={() => {}} />); });
    const after = strokes.slice(-1)[0];
    expect(after, 'a Cutoff change redrew the curve').toBeDefined();
    expect(after).not.toEqual(before);
  });

  it('PWM Synth amp envelope curve: changing Release changes the drawn envelope', () => {
    const cfg = (release: number) => ({ pwmSynth: { ...pwm(4000).pwmSynth, envelope: { attack: 50, decay: 500, sustain: 20, release } } });
    const { getAllByText, rerender } = render(<DOMSynthPanel layout={PWM_SYNTH_LAYOUT} config={cfg(100)} onChange={() => {}} />);
    fireEvent.click(getAllByText('ENV').find((el) => el.tagName === 'BUTTON')!);
    const before = strokes.slice(-1)[0];
    expect(before).toBeDefined();
    strokes = [];
    act(() => { rerender(<DOMSynthPanel layout={PWM_SYNTH_LAYOUT} config={cfg(4000)} onChange={() => {}} />); });
    expect(strokes.slice(-1)[0]).not.toEqual(before);
  });

  it('a single-section layout (PolySynth) shows its envelope curve without a tab click', () => {
    const cfg = (attack: number) => ({ polySynth: { envelope: { attack, decay: 200, sustain: 50, release: 300 } } });
    const { rerender } = render(<DOMSynthPanel layout={POLY_SYNTH_LAYOUT} config={cfg(10)} onChange={() => {}} />);
    const before = strokes.slice(-1)[0];
    expect(before).toBeDefined();
    strokes = [];
    act(() => { rerender(<DOMSynthPanel layout={POLY_SYNTH_LAYOUT} config={cfg(1500)} onChange={() => {}} />); });
    expect(strokes.slice(-1)[0]).not.toEqual(before);
  });
});
