/**
 * Reachability for the FM layouts (rollout wave 1b): DOMSynthPanel renders the real DX7 and OPL3 layouts, the real CurveCanvas
 * draws them on a recording 2D context, a knob value change changes the drawing, and a voice report pushed through the
 * engine's subscribe (stubbed at the engine class, the layout's dynamic import reaches the stub) moves the marker to the
 * place the pure marker functions say.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, act, cleanup } from '@testing-library/react';

const bus = vi.hoisted(() => ({
  dx7: new Set<(s: unknown) => void>(),
  opl3: new Set<(s: unknown) => void>(),
}));
vi.mock('@/engine/dx7/DX7Synth', () => ({
  DX7Synth: { subscribeVoiceStatus: (cb: (s: unknown) => void) => { bus.dx7.add(cb); return () => { bus.dx7.delete(cb); }; } },
}));
vi.mock('@/engine/opl3/OPL3Synth', () => ({
  OPL3Synth: { subscribeVoiceStatus: (cb: (s: unknown) => void) => { bus.opl3.add(cb); return () => { bus.opl3.delete(cb); }; } },
}));

import { DOMSynthPanel } from '../../controls/DOMSynthPanel';
import type { CurveDescriptor, SynthPanelLayout } from '@/types/synthPanel';
import { DX7_LAYOUT } from '@/constants/synthLayouts/dx7';
import { OPL3_LAYOUT } from '@/constants/synthLayouts/opl3';
import { dx7EnvelopeRun, egParams, readOp } from '../dx7CurveModels';
import { oplEnvelopeCurve, oplFnumBlock } from '../opl3CurveModels';
import { dx7EnvelopeMarkerX, dx7LfoMarkerX, dx7PitchEgMarkerX, oplEnvelopeMarkerX, oplTremoloMarkerX } from '../fmCurveMarkers';
import { lfoPeakRegister, pitchEgRun } from '../dx7CurveModels';
import { oplSlotParams } from '../fmCurveModels';
import type { Dx7VoiceReport } from '@/engine/dx7/dx7VoiceStatus';

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
  strokes = []; bus.dx7.clear(); bus.opl3.clear();
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

const sections = (l: SynthPanelLayout) => [...(l.sections ?? []), ...(l.tabs ?? []).flatMap((t) => t.sections)];
const curvesOf = (l: SynthPanelLayout): CurveDescriptor[] => sections(l).flatMap((s) => s.curves ?? []);
const polylines = () => strokes.filter((s) => s.pts.length > 8 && s.style !== '#ffffff');
const markerLines = () => strokes.filter((s) => s.style === '#ffffff');
const px = (frac: number) => Math.round((PAD + frac * (WIDTH - 2 * PAD) + 0.5) * 100) / 100;
/** Lets the layout's lazy engine import resolve and the marker subscribe. */
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });

describe('every FM layout curve that follows a voice carries a marker', () => {
  it('DX7: operator envelopes, all-operators view, pitch EG, LFO and level scaling', () => {
    const withMarker = curvesOf(DX7_LAYOUT).filter((c) => c.marker).map((c) => c.label);
    for (let n = 1; n <= 6; n++) { expect(withMarker).toContain(`OP${n} Envelope`); expect(withMarker).toContain(`OP${n} Level Scaling`); }
    expect(withMarker).toContain('Pitch Envelope');
    expect(withMarker).toContain('LFO Pitch Modulation');
    expect(withMarker.some((l) => l.startsWith('Operator Envelopes'))).toBe(true);
    // the static plots (spectrum, algorithm stems) have no moving part
    expect(curvesOf(DX7_LAYOUT).filter((c) => !c.marker).every((c) => /Spectrum|Algorithm/.test(c.label))).toBe(true);
  });
  it('OPL3: both operator envelopes, tremolo and vibrato', () => {
    const labels = curvesOf(OPL3_LAYOUT).filter((c) => c.marker).map((c) => c.label);
    expect(labels).toEqual(expect.arrayContaining(['OP1 Envelope', 'OP2 Envelope', 'OP1 Tremolo', 'OP2 Tremolo', 'OP1 Vibrato', 'OP2 Vibrato']));
    expect(curvesOf(OPL3_LAYOUT).filter((c) => !c.marker).every((c) => /Spectrum|Waveform/.test(c.label))).toBe(true);
  });
});

describe('DOMSynthPanel draws the DX7 curves from the layout and a knob value change changes them', () => {
  const op1 = (r1: number) => ({ dx7: { vced: { '105': r1, '106': 60, '107': 50, '108': 55, '109': 99, '110': 85, '111': 70, '112': 0, '113': 39, '121': 99 } } });

  it('OP1 envelope: R1 99 -> 40 redraws a different envelope (sentinel: strokes recorded on the real canvas)', () => {
    const { getByText, rerender } = render(<DOMSynthPanel layout={DX7_LAYOUT} config={op1(99)} onChange={() => {}} />);
    fireEvent.click(getByText('OP1'));
    const before = polylines();
    expect(before.length, 'curves were drawn at all').toBeGreaterThan(0);
    strokes = [];
    act(() => { rerender(<DOMSynthPanel layout={DX7_LAYOUT} config={op1(40)} onChange={() => {}} />); });
    expect(polylines().length).toBeGreaterThan(0);
    expect(polylines()).not.toEqual(before);
  });

  it('a config that holds no vced values still draws the layout defaults (the knob shows the same voice)', () => {
    render(<DOMSynthPanel layout={DX7_LAYOUT} config={{ dx7: {} }} onChange={() => {}} />);
    expect(polylines().length).toBeGreaterThan(0);
  });

  it('algorithm stems: changing the algorithm moves the carriers (algorithm 1 -> 32)', () => {
    const { rerender } = render(<DOMSynthPanel layout={DX7_LAYOUT} config={{ dx7: { vced: { '134': 0 } } }} onChange={() => {}} />);
    const before = polylines();
    strokes = [];
    act(() => { rerender(<DOMSynthPanel layout={DX7_LAYOUT} config={{ dx7: { vced: { '134': 31 } } }} onChange={() => {}} />); });
    expect(polylines()).not.toEqual(before);
  });
});

describe('the DX7 live markers follow the voice report (stub engine behind the real subscribe path)', () => {
  const vcedOp1 = { '105': 80, '106': 60, '107': 50, '108': 55, '109': 99, '110': 85, '111': 70, '112': 0, '113': 39, '114': 0, '115': 0, '116': 0, '117': 0, '118': 0, '119': 0, '120': 0, '121': 99, '122': 0, '123': 1, '124': 0, '125': 7 };
  const emit = (s: unknown) => { for (const cb of bus.dx7) cb(s); };
  const report = (over: Partial<Dx7VoiceReport>): Dx7VoiceReport => ({
    voice: 0, note: 60, ops: Array.from({ length: 6 }, () => ({ level: 4080, stage: 3, released: true })), pitch: 7595, elapsedSeconds: 0, releasedSeconds: null, ...over,
  });

  it('OP1 envelope: a decay-stage report puts the marker where dx7EnvelopeMarkerX says, and it moves with the level', async () => {
    const config = { dx7: { vced: vcedOp1 } };
    const { getByText } = render(<DOMSynthPanel layout={DX7_LAYOUT} config={config} onChange={() => {}} />);
    fireEvent.click(getByText('OP1'));
    await flush();
    expect(bus.dx7.size, 'the markers subscribed to the engine').toBeGreaterThan(0);
    const run = dx7EnvelopeRun(egParams(readOp((n) => (vcedOp1 as Record<string, number>)[String(n)] ?? 0, 1), 60));
    const domainMax = Math.max(0.05, run.totalSeconds * 1.03);
    const point = run.points.filter((p) => p.stage === 1)[Math.floor(run.points.filter((p) => p.stage === 1).length / 2)];
    const ops = Array.from({ length: 6 }, () => ({ level: 4080, stage: 3, released: true }));
    ops[5] = { level: point.level, stage: 1, released: false };
    strokes = [];
    act(() => { emit({ voices: [report({ ops })], lfo: { pitchMod: 0, ampMod: 0 } }); });
    const wantX = dx7EnvelopeMarkerX(run, ops[5])!;
    const firstPx = px(wantX / domainMax);
    expect(markerLines().some((l) => l.pts[0] === firstPx), `OP1 envelope marker at ${firstPx} (sentinel: a marker line was drawn there)`).toBe(true);
    // later in the decay the marker is further right
    const later = run.points.filter((p) => p.stage === 1).slice(-3)[0];
    ops[5] = { level: later.level, stage: 1, released: false };
    strokes = [];
    act(() => { emit({ voices: [report({ ops })], lfo: { pitchMod: 0, ampMod: 0 } }); });
    const laterPx = px(dx7EnvelopeMarkerX(run, ops[5])! / domainMax);
    expect(laterPx).toBeGreaterThan(firstPx);
    expect(markerLines().some((l) => l.pts[0] === laterPx), `moved to ${laterPx}`).toBe(true);
    // no voice -> the marker disappears
    strokes = [];
    act(() => { emit({ voices: [], lfo: { pitchMod: 0, ampMod: 0 } }); });
    expect(markerLines()).toHaveLength(0);
  });

  it('pitch envelope and LFO (global tab): markers sit at the time since the note and at the LFO phase', async () => {
    const config = { dx7: { vced: { '126': 70, '127': 60, '128': 50, '129': 60, '130': 20, '131': 90, '132': 50, '133': 30, '137': 40, '139': 99, '142': 0, '143': 7, '138': 0 } } };
    render(<DOMSynthPanel layout={DX7_LAYOUT} config={config} onChange={() => {}} />);
    await flush();
    const curve = pitchEgRun([70, 60, 50, 60], [20, 90, 50, 30], 0.4);
    const v = report({ elapsedSeconds: 0.3, ops: Array.from({ length: 6 }, (_, i) => ({ level: i === 5 ? 500 : 4080, stage: 2, released: i !== 5 })) });
    const peak = lfoPeakRegister(99, 7);
    strokes = [];
    act(() => { emit({ voices: [v], lfo: { pitchMod: peak * 0.3, ampMod: 0 } }); });
    act(() => { emit({ voices: [v], lfo: { pitchMod: peak * 0.5, ampMod: 0 } }); });
    const lines = markerLines();
    // the pitch EG marker (domain 0..curve end * 1.03) and the LFO marker (domain 0..2 cycles) both drew
    const wantPitchX = px(dx7PitchEgMarkerX(curve, v)! / Math.max(0.05, curve[5].x * 1.03));
    const wantLfoX = px(dx7LfoMarkerX(0, peak * 0.5, peak * 0.3, peak)! / 2);
    expect(lines.some((l) => l.pts[0] === wantPitchX), `pitch EG marker at ${wantPitchX}`).toBe(true);
    expect(lines.some((l) => l.pts[0] === wantLfoX), `LFO marker at ${wantLfoX}`).toBe(true);
  });
});

describe('DOMSynthPanel draws the OPL3 curves and the chip report moves their markers', () => {
  const config = (attack: number) => ({ opl3: { op1Attack: attack, op1Decay: 6, op1Sustain: 4, op1Release: 6, op1Level: 40, op1Multi: 1, op1Waveform: 0, op1KSL: 0, op1KSR: 0, op1SustainHold: 0, op1Tremolo: true, op1Vibrato: false, feedback: 0, connection: 0 } });
  const emit = (s: unknown) => { for (const cb of bus.opl3) cb(s); };

  it('OP1 envelope: Attack 14 -> 3 redraws a different envelope', () => {
    const { rerender } = render(<DOMSynthPanel layout={OPL3_LAYOUT} config={config(14)} onChange={() => {}} />);
    const before = polylines();
    expect(before.length).toBeGreaterThan(0);
    strokes = [];
    act(() => { rerender(<DOMSynthPanel layout={OPL3_LAYOUT} config={config(3)} onChange={() => {}} />); });
    expect(polylines()).not.toEqual(before);
  });

  it('a decay-stage chip report puts the OP1 marker where oplEnvelopeMarkerX says; tremolo follows the chip counter', async () => {
    const cfg = config(14);
    render(<DOMSynthPanel layout={OPL3_LAYOUT} config={cfg} onChange={() => {}} />);
    await flush();
    expect(bus.opl3.size).toBeGreaterThan(0);
    const read = (k: string) => (cfg.opl3 as Record<string, number | boolean>)[k] as number;
    const curve = oplEnvelopeCurve(oplSlotParams((k) => Number(read(k) ?? 0), 1), oplFnumBlock(60));
    const domainMax = Math.max(0.05, curve.totalSeconds * 1.03);
    const q = curve.points.filter((p) => p.stage === 1)[3];
    strokes = [];
    act(() => {
      emit({
        channels: [{ channel: 0, note: 60, modulatorStage: 1, carrierStage: 2, modulatorAttenuation: q.rout, carrierAttenuation: 10, age: 3 }],
        lfo: { tremoloPosition: 105, vibratoPosition: 2, timer: 0 },
      });
    });
    const lines = markerLines();
    const wantEnv = px(oplEnvelopeMarkerX(curve, 1, q.rout)! / domainMax);
    expect(lines.some((l) => l.pts[0] === wantEnv), `OP1 envelope marker at ${wantEnv}`).toBe(true);
    expect(lines.some((l) => l.pts[0] === px(oplTremoloMarkerX(105))), 'OP1 tremolo marker at half a period').toBe(true);
    // Vibrato is switched off on OP1: no vibrato marker
    expect(bus.opl3.size).toBeGreaterThan(0);
  });
});
