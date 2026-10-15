/**
 * fmCurveModels.ts - the CurveDescriptors of the FM family (DX7, OPL3): the builders the layouts call, binding layout
 * keys to the engine models (dx7CurveModels, opl3CurveModels) and the live voice markers to the engines' voice
 * reports (fmCurveMarkers). No React, no DOM.
 *
 * A curve and its marker share one computation: the series function stores the model it drew, and the marker maps the
 * live voice report onto that same model, so the white line sits on the curve the owner is looking at.
 */
import type { CurveDescriptor, CurveSeries } from '@/types/synthPanel';
import { stemPoints } from './spectrumMath';
import {
  dx7Algorithm, dx7EnvelopeRun, engineLevelScaling, dx7VoiceSpectrum, egAmplitude, egParams, lfoDelaySeconds,
  lfoPeakRegister, lfoPitchCents, lfoRateHz, lfoWaveform, engineNoteHz, operatorFrequencyHz, peakEnvelopeLevel, pitchEgRun, readOp,
  type Dx7EnvelopeRun, type Dx7OpParams, type Dx7Voice, type PitchEgPoint,
} from './dx7CurveModels';
import {
  oplAmplitude, oplChannelHz, oplEnvelopeCurve, oplFnumBlock, oplOperatorHz, oplSpectrum, oplTremoloDb, oplTremoloHz, oplVibratoCents,
  oplVibratoHz, oplWaveSample, type OplEnvelopeCurve, type OplSlotParams,
} from './opl3CurveModels';
import {
  dx7EnvelopeMarkerX, dx7LfoMarkerX, dx7PitchEgMarkerX, dx7ScalingMarkerX, loudestCarrier, oplEnvelopeMarkerX, oplTremoloMarkerX, oplVibratoMarkerX,
} from './fmCurveMarkers';
import { markedVoice, reportOp, type Dx7VoiceStatus } from '@/engine/dx7/dx7VoiceStatus';
import { newestOplVoice, type OplVoiceStatus } from '@/engine/opl3/oplVoiceStatus';

type Get = (key: string) => number;
type GetText = ((key: string) => string) | undefined;
type Unsubscribe = () => void;

/** The note every FM curve is drawn for (middle C; the DX7 break point default 39 is also middle C). */
export const FM_REFERENCE_NOTE = 60;

// ---------------------------------------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------------------------------------

/**
 * A layout value, or `fallback` when the config does not hold the key. DOMSynthPanel's numeric reader turns an unset
 * key into 0, which would draw a DX7 whose rates are all 0; the text reader returns '' for an unset key.
 */
export function layoutValue(_get: Get, getText: GetText, key: string, fallback: number): number {
  const text = getText?.(key);
  if (text === undefined || text === '') return fallback;
  // toggles write booleans into the config
  if (text === 'true') return 1;
  if (text === 'false') return 0;
  const n = Number(text);
  return Number.isFinite(n) ? n : fallback;
}

/** Keeps the result of the last computation for the key it was computed from (the series and the x domain share it). */
function lastResult<T>(): (key: string, compute: () => T) => T {
  let cachedKey: string | null = null;
  let cached: T | undefined;
  return (key, compute) => {
    if (cachedKey !== key || cached === undefined) { cached = compute(); cachedKey = key; }
    return cached;
  };
}

export const fmtSeconds = (s: number): string => (s >= 10 ? `${s.toFixed(0)} s` : s >= 1 ? `${s.toFixed(1)} s` : `${Math.max(1, Math.round(s * 1000))} ms`);
const fmtHz = (hz: number): string => (hz >= 1000 ? `${(hz / 1000).toFixed(1)} kHz` : `${Math.round(hz)} Hz`);
const noteName = (note: number): string => `${['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][((note % 12) + 12) % 12]}-${Math.floor(note / 12) - 2}`;

// Decorative operator palette, like FMAlgorithmDiagram's: carriers amber, modulators blue.
const CARRIER_COLORS = ['#f59e0b', '#fbbf24', '#fcd34d', '#fb923c', '#f97316', '#fdba74'] as const;
const MODULATOR_COLORS = ['#60a5fa', '#38bdf8', '#818cf8', '#22d3ee', '#a5b4fc', '#7dd3fc'] as const;

// ---------------------------------------------------------------------------------------------------------
// Voice sources (the engines' live reports); lazy so a layout module does not pull an AudioWorklet engine in
// ---------------------------------------------------------------------------------------------------------

export interface FmVoiceSource<S> { subscribe(cb: (status: S) => void): Unsubscribe }

function lazySource<S>(load: () => Promise<{ subscribe(cb: (status: S) => void): Unsubscribe }>): FmVoiceSource<S> {
  let engine: Promise<{ subscribe(cb: (status: S) => void): Unsubscribe }> | null = null; // one import, shared by every curve
  return {
    subscribe(cb) {
      let off: Unsubscribe | null = null;
      let dead = false;
      engine ??= load();
      void engine.then((engine) => { if (!dead) off = engine.subscribe(cb); }).catch(() => { /* no engine in this environment: no marker */ });
      return () => { dead = true; off?.(); };
    },
  };
}

/** The DX7 and OPL3 engines' report streams. Imported on first use. */
export const dx7VoiceSource: FmVoiceSource<Dx7VoiceStatus> = lazySource(() =>
  import('@/engine/dx7/DX7Synth').then((m) => ({ subscribe: (cb: (s: Dx7VoiceStatus) => void) => m.DX7Synth.subscribeVoiceStatus(cb) })));
export const opl3VoiceSource: FmVoiceSource<OplVoiceStatus> = lazySource(() =>
  import('@/engine/opl3/OPL3Synth').then((m) => ({ subscribe: (cb: (s: OplVoiceStatus) => void) => m.OPL3Synth.subscribeVoiceStatus(cb) })));

type Marker = NonNullable<CurveDescriptor['marker']>;

/** A marker driven by a source: `position` maps a report to an x (null = hide). */
function markerFrom<S>(source: FmVoiceSource<S>, position: (status: S, latest: Get) => number | null): Marker {
  return {
    subscribe: (onPosition, latestValues) => source.subscribe((status) => onPosition(position(status, latestValues()))),
  };
}

// ---------------------------------------------------------------------------------------------------------
// DX7
// ---------------------------------------------------------------------------------------------------------

export interface Dx7LayoutContext {
  /** The layout default of `vced.N` (what the knob shows when the config holds no value). */
  defaultOf: (n: number) => number;
}

const dx7Reader = (ctx: Dx7LayoutContext, get: Get, getText: GetText) => (n: number): number => layoutValue(get, getText, `vced.${n}`, ctx.defaultOf(n));

function readVoice(vced: (n: number) => number): Dx7Voice {
  return { ops: [1, 2, 3, 4, 5, 6].map((n) => readOp(vced, n)), algorithm: vced(134), feedback: vced(135) };
}

const opKey = (op: Dx7OpParams): string => JSON.stringify([op.rates, op.levels, op.outputLevel, op.rateScaling, op.breakPoint, op.leftDepth, op.rightDepth, op.leftCurve, op.rightCurve]);

/** Seconds of the segment boundaries of a run, for the readout. */
function segmentTimes(run: Dx7EnvelopeRun): { s1: number | null; s2: number | null; sustain: number; release: number } {
  const first = (stage: number) => run.points.find((p) => p.stage === stage)?.x ?? null;
  return { s1: first(1), s2: first(2), sustain: run.sustainReachedSeconds, release: Math.max(0, run.totalSeconds - run.releaseAtSeconds) };
}

/** OPn Envelope: one operator's four-segment EG (amplitude against time), with the live operator marker. */
export function dx7OperatorEnvelopeCurve(opNum: number, ctx: Dx7LayoutContext): CurveDescriptor {
  const memo = lastResult<{ run: Dx7EnvelopeRun; op: Dx7OpParams }>();
  let drawn: Dx7EnvelopeRun | null = null;
  const compute = (get: Get, getText: GetText) => {
    const op = readOp(dx7Reader(ctx, get, getText), opNum);
    const result = memo(opKey(op), () => ({ run: dx7EnvelopeRun(egParams(op, FM_REFERENCE_NOTE)), op }));
    drawn = result.run;
    return result;
  };
  return {
    label: `OP${opNum} Envelope`,
    xDomain: (get, getText) => [0, Math.max(0.05, compute(get, getText).run.totalSeconds * 1.03)],
    yDomain: [0, 1],
    xUnit: 's',
    series: (get, getText) => [{ points: compute(get, getText).run.points.map((p) => [p.x, egAmplitude(p.level)] as const), fill: true }],
    readout: (get, getText) => {
      const t = segmentTimes(compute(get, getText).run);
      return `to L1 ${t.s1 === null ? '-' : fmtSeconds(t.s1)}  L3 ${fmtSeconds(t.sustain)}  release ${fmtSeconds(t.release)}`;
    },
    marker: markerFrom(dx7VoiceSource, (status) => {
      const voice = markedVoice(status.voices);
      const op = voice && reportOp(voice, opNum);
      return drawn && op ? dx7EnvelopeMarkerX(drawn, op) : null;
    }),
  };
}

/** All six operator envelopes on one time axis: carriers amber, modulators blue, from the algorithm's own topology. */
export function dx7AllOperatorsCurve(ctx: Dx7LayoutContext): CurveDescriptor {
  interface All { runs: Dx7EnvelopeRun[]; carriers: number[]; total: number }
  const memo = lastResult<All>();
  let drawn: All | null = null;
  const compute = (get: Get, getText: GetText): All => {
    const vced = dx7Reader(ctx, get, getText);
    const voice = readVoice(vced);
    const key = JSON.stringify([voice.algorithm, voice.ops.map(opKey)]);
    const result = memo(key, () => {
      const params = voice.ops.map((o) => egParams(o, FM_REFERENCE_NOTE));
      const carriers = dx7Algorithm(voice.algorithm).carriers;
      // one key-up time for every operator: after the slowest of them has reached segment 3
      const sustain = Math.max(...params.map((p) => dx7EnvelopeRun(p).sustainReachedSeconds));
      const releaseAt = sustain + Math.min(12, Math.max(0.15, 0.35 * sustain));
      const runs = params.map((p) => dx7EnvelopeRun(p, releaseAt));
      return { runs, carriers, total: Math.max(...runs.map((r) => r.totalSeconds)) };
    });
    drawn = result;
    return result;
  };
  return {
    label: 'Operator Envelopes (carriers amber, modulators blue)',
    height: 90,
    xDomain: (get, getText) => [0, Math.max(0.05, compute(get, getText).total * 1.03)],
    yDomain: [0, 1],
    xUnit: 's',
    series: (get, getText): CurveSeries[] => {
      const all = compute(get, getText);
      return all.runs.map((run, i) => {
        const opNum = i + 1;
        const carrier = all.carriers.includes(opNum);
        return {
          points: run.points.map((p) => [p.x, egAmplitude(p.level)] as const),
          color: carrier ? CARRIER_COLORS[i] : MODULATOR_COLORS[i],
        };
      });
    },
    readout: (get, getText) => `carriers: ${compute(get, getText).carriers.map((n) => `OP${n}`).join(' ')}`,
    marker: markerFrom(dx7VoiceSource, (status) => {
      const voice = markedVoice(status.voices);
      if (!voice || !drawn) return null;
      const lead = loudestCarrier(voice, drawn.carriers);
      return lead ? dx7EnvelopeMarkerX(drawn.runs[lead.opNum - 1], lead.status) : null;
    }),
  };
}

/** Operator peak output levels as stems against operator number: the algorithm's carriers amber, its modulators blue. */
export function dx7AlgorithmCurve(ctx: Dx7LayoutContext): CurveDescriptor {
  const floor = -60;
  const compute = (get: Get, getText: GetText) => {
    const vced = dx7Reader(ctx, get, getText);
    const voice = readVoice(vced);
    const algorithm = dx7Algorithm(voice.algorithm);
    const db = voice.ops.map((o) => 20 * Math.log10(Math.max(1e-6, egAmplitude(peakEnvelopeLevel(egParams(o, FM_REFERENCE_NOTE))))));
    return { algorithm, db, index: voice.algorithm };
  };
  return {
    label: 'Algorithm: operator output (carriers amber, modulators blue)',
    height: 64,
    xDomain: [0.5, 6.5],
    yDomain: [floor, 0],
    yUnit: 'dB',
    series: (get, getText): CurveSeries[] => {
      const { algorithm, db } = compute(get, getText);
      const stem = (opNum: number): Array<readonly [number, number]> => [[opNum, floor], [opNum, Math.max(floor, db[opNum - 1])], [opNum, floor]];
      const carriers = algorithm.carriers.flatMap(stem);
      const modulators = [1, 2, 3, 4, 5, 6].filter((n) => !algorithm.carriers.includes(n)).flatMap(stem);
      const out: CurveSeries[] = [];
      if (modulators.length > 0) out.push({ points: modulators, color: MODULATOR_COLORS[0] });
      if (carriers.length > 0) out.push({ points: carriers, color: CARRIER_COLORS[0] });
      return out;
    },
    readout: (get, getText) => {
      const { algorithm, index } = compute(get, getText);
      return `algorithm ${Math.round(index) + 1}: carriers ${algorithm.carriers.map((n) => `OP${n}`).join(' ')}  stems = OP1..OP6`;
    },
  };
}

/** The spectral lines of the whole voice: the OPS pipeline run for the voice, so the sidebands are the engine's. */
export function dx7SpectrumCurve(ctx: Dx7LayoutContext): CurveDescriptor {
  const memo = lastResult<ReturnType<typeof dx7VoiceSpectrum>>();
  const floor = -80;
  const compute = (get: Get, getText: GetText) => {
    const voice = readVoice(dx7Reader(ctx, get, getText));
    const key = JSON.stringify([voice.algorithm, voice.feedback, voice.ops.map((o) => [opKey(o), o.fixed, o.coarse, o.fine])]);
    return { lines: memo(key, () => dx7VoiceSpectrum(voice, FM_REFERENCE_NOTE, 6000)), voice };
  };
  return {
    label: 'Voice Spectrum',
    height: 80,
    xDomain: [0, 6000],
    yDomain: [floor, 0],
    xUnit: 'Hz',
    yUnit: 'dB',
    series: (get, getText) => [{ points: stemPoints(compute(get, getText).lines, floor) }],
    readout: (get, getText) => {
      const { lines, voice } = compute(get, getText);
      const f0 = engineNoteHz(FM_REFERENCE_NOTE);
      const ratios = voice.ops.map((o) => operatorFrequencyHz(o, f0));
      return `${noteName(FM_REFERENCE_NOTE)} sounds ${fmtHz(f0)}  ${lines.length} partials  OP1 ${fmtHz(ratios[0])}`;
    },
  };
}

/** The pitch EG: semitones against time, with the live voice pitch marker. */
export function dx7PitchEgCurve(ctx: Dx7LayoutContext): CurveDescriptor {
  const HOLD = 0.4;
  const memo = lastResult<PitchEgPoint[]>();
  let drawn: PitchEgPoint[] | null = null;
  const compute = (get: Get, getText: GetText): PitchEgPoint[] => {
    const vced = dx7Reader(ctx, get, getText);
    const rates = [126, 127, 128, 129].map(vced);
    const levels = [130, 131, 132, 133].map(vced);
    drawn = memo(JSON.stringify([rates, levels]), () => pitchEgRun(rates, levels, HOLD));
    return drawn;
  };
  return {
    label: 'Pitch Envelope',
    xDomain: (get, getText) => [0, Math.max(0.05, compute(get, getText)[5].x * 1.03)],
    yDomain: (get, getText) => { const m = Math.max(1, ...compute(get, getText).map((p) => Math.abs(p.semitones))); return [-m * 1.1, m * 1.1]; },
    xUnit: 's',
    yUnit: 'st',
    series: (get, getText) => [{ points: compute(get, getText).map((p) => [p.x, p.semitones] as const) }],
    readout: (get, getText) => {
      const pts = compute(get, getText);
      return `${pts[0].semitones.toFixed(1)} st -> ${pts[3].semitones.toFixed(1)} st  total ${fmtSeconds(pts[5].x - HOLD)}`;
    },
    marker: markerFrom(dx7VoiceSource, (status) => {
      const voice = markedVoice(status.voices);
      return voice && drawn ? dx7PitchEgMarkerX(drawn, voice) : null;
    }),
  };
}

/** The LFO: the pitch deviation in cents over two cycles, with the marker read from the firmware's modulation register. */
export function dx7LfoCurve(ctx: Dx7LayoutContext): CurveDescriptor {
  let previous: number | null = null;
  const read = (get: Get, getText: GetText) => {
    const vced = dx7Reader(ctx, get, getText);
    return { speed: vced(137), delay: vced(138), pmd: vced(139), amd: vced(140), wave: vced(142), pms: vced(143) };
  };
  // the parameters of the last drawn series, which the marker maps with (set when the series is first drawn)
  let latest: ReturnType<typeof read> | null = null;
  return {
    label: 'LFO Pitch Modulation',
    xDomain: [0, 2],
    yDomain: (get, getText) => { const p = read(get, getText); const m = Math.max(5, lfoPitchCents(p.pmd, p.pms)); return [-m * 1.15, m * 1.15]; },
    xUnit: 'cycles',
    yUnit: 'ct',
    series: (get, getText) => {
      const p = read(get, getText);
      latest = p;
      const cents = lfoPitchCents(p.pmd, p.pms);
      const pts: Array<readonly [number, number]> = [];
      for (let i = 0; i <= 256; i++) { const ph = i / 128; pts.push([ph, cents * (2 * lfoWaveform(p.wave, ph) - 1)]); }
      return [{ points: pts }];
    },
    readout: (get, getText) => {
      const p = read(get, getText);
      const delay = lfoDelaySeconds(p.delay);
      return `${lfoRateHz(p.speed).toFixed(2)} Hz  +-${Math.round(lfoPitchCents(p.pmd, p.pms))} ct  delay ${delay ? fmtSeconds(delay.hold + delay.fade) : 'never'}`;
    },
    marker: markerFrom(dx7VoiceSource, (status) => {
      const prev = previous;
      previous = status.lfo.pitchMod;
      if (status.voices.length === 0) return null;
      if (latest === null) return null;
      const peak = lfoPeakRegister(latest.pmd, latest.pms);
      const phase = dx7LfoMarkerX(latest.wave, status.lfo.pitchMod, prev, peak);
      return phase === null ? null : phase;
    }),
  };
}

/** OPn Level Scaling: loudness offset (dB) against MIDI note from the breakpoint, depths and curves; marker = playing note. */
export function dx7LevelScalingCurve(opNum: number, ctx: Dx7LayoutContext): CurveDescriptor {
  const compute = (get: Get, getText: GetText) => readOp(dx7Reader(ctx, get, getText), opNum);
  return {
    label: `OP${opNum} Level Scaling`,
    height: 64,
    xDomain: [21, 108],
    yDomain: (get, getText) => {
      const op = compute(get, getText);
      let m = 3;
      for (let n = 21; n <= 108; n += 3) m = Math.max(m, Math.abs(engineLevelScaling(n, op) * 0.75));
      return [-m * 1.1, m * 1.1];
    },
    xUnit: 'note',
    yUnit: 'dB',
    series: (get, getText) => {
      const op = compute(get, getText);
      const pts: Array<readonly [number, number]> = [];
      for (let n = 21; n <= 108; n++) pts.push([n, engineLevelScaling(n, op) * 0.75]);
      return [{ points: pts }];
    },
    readout: (get, getText) => {
      const op = compute(get, getText);
      return `break point ${noteName(op.breakPoint + 21)}  at C-1 ${(engineLevelScaling(24, op) * 0.75).toFixed(1)} dB  at C6 ${(engineLevelScaling(96, op) * 0.75).toFixed(1)} dB`;
    },
    marker: markerFrom(dx7VoiceSource, (status) => {
      const voice = markedVoice(status.voices);
      return voice ? dx7ScalingMarkerX(voice) : null;
    }),
  };
}

// ---------------------------------------------------------------------------------------------------------
// OPL3
// ---------------------------------------------------------------------------------------------------------

export interface OplLayoutContext {
  /** The layout default of a key (what the knob shows when the config holds no value). */
  defaultOf: (key: string) => number;
}

const oplValue = (ctx: OplLayoutContext, get: Get, getText: GetText) => (key: string): number => layoutValue(get, getText, key, ctx.defaultOf(key));

/** Register values of operator `n` (1 = modulator, 2 = carrier) from the layout keys. */
export function oplSlotParams(read: (key: string) => number, n: 1 | 2): OplSlotParams {
  const k = (name: string) => read(`op${n}${name}`);
  return {
    attack: Math.round(k('Attack')), decay: Math.round(k('Decay')), sustainLevel: Math.round(k('Sustain')), release: Math.round(k('Release')),
    ksr: k('KSR') > 0 ? 1 : 0, sustainHold: k('SustainHold') > 0 ? 1 : 0,
    // the layout's Level knob is the inverse of the chip's total level register (OPL3Synth.packRegisters)
    totalLevel: 63 - Math.round(k('Level')), ksl: Math.round(k('KSL')),
  };
}

const oplSlotKey = (p: OplSlotParams): string => JSON.stringify(p);

/** OPn Envelope: the Nuked OPL3 envelope generator for one operator (amplitude against time), with the live slot marker. */
export function oplOperatorEnvelopeCurve(n: 1 | 2, ctx: OplLayoutContext): CurveDescriptor {
  const memo = lastResult<OplEnvelopeCurve>();
  let drawn: OplEnvelopeCurve | null = null;
  const compute = (get: Get, getText: GetText): OplEnvelopeCurve => {
    const p = oplSlotParams(oplValue(ctx, get, getText), n);
    drawn = memo(oplSlotKey(p), () => oplEnvelopeCurve(p, oplFnumBlock(FM_REFERENCE_NOTE)));
    return drawn;
  };
  return {
    label: `OP${n} Envelope`,
    xDomain: (get, getText) => [0, Math.max(0.05, compute(get, getText).totalSeconds * 1.03)],
    yDomain: [0, 1],
    xUnit: 's',
    series: (get, getText) => [{ points: compute(get, getText).points.map((p) => [p.x, oplAmplitude(p.attenuation)] as const), fill: true }],
    readout: (get, getText) => {
      const c = compute(get, getText);
      return `to sustain ${fmtSeconds(c.sustainReachedSeconds)}  release ${fmtSeconds(Math.max(0, c.totalSeconds - c.releaseAtSeconds))}`;
    },
    marker: markerFrom(opl3VoiceSource, (status) => {
      const voice = newestOplVoice(status.channels);
      if (!voice || !drawn) return null;
      return n === 1
        ? oplEnvelopeMarkerX(drawn, voice.modulatorStage, voice.modulatorAttenuation)
        : oplEnvelopeMarkerX(drawn, voice.carrierStage, voice.carrierAttenuation);
    }),
  };
}

/** OPn Waveform: one cycle of the operator's waveform from the chip's log-sine and exp tables. */
export function oplWaveformCurve(n: 1 | 2, ctx: OplLayoutContext): CurveDescriptor {
  const compute = (get: Get, getText: GetText) => {
    const read = oplValue(ctx, get, getText);
    return { wave: Math.round(read(`op${n}Waveform`)), multi: Math.round(read(`op${n}Multi`)) };
  };
  return {
    label: `OP${n} Waveform`,
    height: 64,
    xDomain: [0, 1],
    yDomain: [-1, 1],
    series: (get, getText) => {
      const { wave } = compute(get, getText);
      const pts: Array<readonly [number, number]> = [];
      for (let i = 0; i <= 256; i++) pts.push([i / 256, oplWaveSample(wave, Math.min(1023, Math.round((i / 256) * 1024)), 0) / 4084]);
      return [{ points: pts }];
    },
    readout: (get, getText) => {
      const { multi } = compute(get, getText);
      return `x${multi === 0 ? '0.5' : multi} = ${fmtHz(oplOperatorHz(oplFnumBlock(FM_REFERENCE_NOTE), multi))} at ${noteName(FM_REFERENCE_NOTE)}`;
    },
  };
}

/** OPn Tremolo: the chip's amplitude LFO (the attenuation in dB over one cycle), live position from the chip counter. */
export function oplTremoloCurve(n: 1 | 2, ctx: OplLayoutContext): CurveDescriptor {
  const on = (get: Get, getText: GetText) => oplValue(ctx, get, getText)(`op${n}Tremolo`) > 0;
  return {
    label: `OP${n} Tremolo`,
    height: 48,
    xDomain: [0, 1],
    yDomain: [0, 1.25],
    yUnit: 'dB',
    series: (get, getText) => {
      const pts: Array<readonly [number, number]> = [];
      const enabled = on(get, getText);
      for (let i = 0; i <= 210; i++) pts.push([i / 210, enabled ? oplTremoloDb(i % 210, false) : 0]);
      return [{ points: pts }];
    },
    readout: (get, getText) => (on(get, getText) ? `${oplTremoloHz().toFixed(2)} Hz  up to 1.1 dB` : 'off'),
    marker: markerFrom(opl3VoiceSource, (status, latest) => (latest(`op${n}Tremolo`) > 0 && newestOplVoice(status.channels) ? oplTremoloMarkerX(status.lfo.tremoloPosition) : null)),
  };
}

/** OPn Vibrato: the chip's pitch LFO in cents over one cycle for the reference note, live position from the chip counter. */
export function oplVibratoCurve(n: 1 | 2, ctx: OplLayoutContext): CurveDescriptor {
  const on = (get: Get, getText: GetText) => oplValue(ctx, get, getText)(`op${n}Vibrato`) > 0;
  const fnum = oplFnumBlock(FM_REFERENCE_NOTE).fnum;
  return {
    label: `OP${n} Vibrato`,
    height: 48,
    xDomain: [0, 1],
    yDomain: [-10, 10],
    yUnit: 'ct',
    series: (get, getText) => {
      const pts: Array<readonly [number, number]> = [];
      const enabled = on(get, getText);
      for (let i = 0; i < 8 * 16; i++) pts.push([i / 128, enabled ? oplVibratoCents(Math.floor(i / 16), fnum, false) : 0]);
      pts.push([1, 0]);
      return [{ points: pts }];
    },
    readout: (get, getText) => (on(get, getText) ? `${oplVibratoHz().toFixed(2)} Hz  +-7 ct class` : 'off'),
    marker: markerFrom(opl3VoiceSource, (status, latest) => (latest(`op${n}Vibrato`) > 0 && newestOplVoice(status.channels) ? oplVibratoMarkerX(status.lfo.vibratoPosition, status.lfo.timer) : null)),
  };
}

/** The two-operator spectrum: the chip's phase generator, waveforms, feedback and FM / additive link, run and Fourier transformed. */
export function oplSpectrumCurve(ctx: OplLayoutContext): CurveDescriptor {
  const memo = lastResult<ReturnType<typeof oplSpectrum>>();
  const floor = -80;
  const compute = (get: Get, getText: GetText) => {
    const read = oplValue(ctx, get, getText);
    const slot = (n: 1 | 2) => ({
      wave: Math.round(read(`op${n}Waveform`)), multiplier: Math.round(read(`op${n}Multi`)),
      attenuation: (63 - Math.round(read(`op${n}Level`))) * 4 + 0,
    });
    const mod = slot(1); const car = slot(2);
    const feedback = Math.round(read('feedback')); const additive = read('connection') > 0;
    return { mod, car, feedback, additive, lines: memo(JSON.stringify([mod, car, feedback, additive]), () => oplSpectrum(mod, car, feedback, additive, oplFnumBlock(FM_REFERENCE_NOTE), 6000)) };
  };
  return {
    label: 'Voice Spectrum',
    height: 80,
    xDomain: [0, 6000],
    yDomain: [floor, 0],
    xUnit: 'Hz',
    yUnit: 'dB',
    series: (get, getText) => [{ points: stemPoints(compute(get, getText).lines, floor) }],
    readout: (get, getText) => {
      const { lines, additive } = compute(get, getText);
      return `${noteName(FM_REFERENCE_NOTE)}  ${additive ? 'additive' : 'FM'}  ${lines.length} partials  ${fmtHz(oplChannelHz(oplFnumBlock(FM_REFERENCE_NOTE)))}`;
    },
  };
}

