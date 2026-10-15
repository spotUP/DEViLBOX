/**
 * Curve builders for Tone.js based synth layouts: the common builders (adsrCurve, filterCurve, lfoCurve,
 * cutoffEnvelopeCurve) with the live voice marker attached, plus the two curves only the Tone core synths need
 * (MonoSynth's swept filter, DuoSynth's vibrato). The marker follows the voice toneVoiceProbe reports for the edited
 * instrument; `instrumentId` arrives through CurveDescriptor.marker.subscribe because layouts are shared constants.
 */
import type { CurveDescriptor, CurveSeries } from '@/types/synthPanel';
import { toneVoiceProbe, type ToneVoiceReport } from '@/engine/tone/toneVoiceProbe';
import {
  adsrCurve, adsrValues, cutoffEnvelopeCurve, filterCurve, lfoCurve, lfoPoints, filterResponsePoints, readSource,
  asFilterType, webAudioLinearQ, fmtHz, msEnvelopeLayout, type LfoShape,
  FILTER_DB_MAX, FILTER_DB_MIN,
  type AdsrCurveOptions, type CutoffEnvelopeCurveOptions, type FilterCurveOptions, type LfoCurveOptions,
} from './commonCurveModels';
import { cutoffEnvelopeMarkerX, filterMarkerHz, lfoMarkerSeconds, pitchEnvelopeMarkerX, toneEnvelopeMarkerX } from './toneCurveMarkers';
import {
  TONE_AM_DEFAULTS, TONE_FM_DEFAULTS, TONE_MONO_FILTER_DEFAULTS, pitchEnvelopeCentsAt, pitchEnvelopeShape,
} from '@/engine/tone/toneSynthKnobs';

type Get = (key: string) => number;
type Marker = NonNullable<CurveDescriptor['marker']>;

/** A marker that maps the edited instrument's voice report to an x position with `place` (null hides it). */
export function toneVoiceMarker(place: (report: ToneVoiceReport | null, get: Get) => number | null): Marker {
  return {
    subscribe: (onPosition, latestValues, instrumentId) => {
      if (instrumentId === undefined) return () => {};
      return toneVoiceProbe.subscribe(instrumentId, (report) => onPosition(place(report, latestValues())));
    },
  };
}

/** adsrCurve with the envelope marker. */
export function toneAdsrCurve(o: AdsrCurveOptions): CurveDescriptor {
  return {
    ...adsrCurve(o),
    marker: toneVoiceMarker((report, get) => {
      const { a, d, sustainPercent, r } = adsrValues(o, get);
      return toneEnvelopeMarkerX(a, d, sustainPercent, r, report, o.shape ?? 'tone');
    }),
  };
}

/** filterCurve with the effective-cutoff marker. */
export function toneFilterCurve(o: FilterCurveOptions): CurveDescriptor {
  return { ...filterCurve(o), marker: toneVoiceMarker((report) => filterMarkerHz(report)) };
}

/** lfoCurve with the LFO phase marker. */
export function toneLfoCurve(o: LfoCurveOptions): CurveDescriptor {
  const windowSec = o.windowSec ?? 1;
  return {
    ...lfoCurve(o),
    marker: toneVoiceMarker((report, get) => lfoMarkerSeconds(readSource(get, o.rate, 1), windowSec, report)),
  };
}

/** cutoffEnvelopeCurve with the time marker. */
export function toneCutoffEnvelopeCurve(o: CutoffEnvelopeCurveOptions): CurveDescriptor {
  return {
    ...cutoffEnvelopeCurve(o),
    marker: toneVoiceMarker((report, get) =>
      cutoffEnvelopeMarkerX(readSource(get, o.attack), readSource(get, o.decay), readSource(get, o.amount), report)),
  };
}

// ---------------------------------------------------------------------------------------------------------
// MonoSynth: the swept filter
// ---------------------------------------------------------------------------------------------------------

/**
 * Tone.MonoSynth wires its FrequencyEnvelope into `filter.frequency` and marks that signal as overridden, so the
 * cutoff IS the envelope's sweep: from `filterEnvelope.baseFrequency` (the layout's Base Cutoff) up to
 * `baseFrequency * 2^octaves` (Sweep Octaves) at the envelope's peak. The engine builds the filter from
 * toneSynthKnobs.toneVoiceOptions, so these two knobs and the filter type and Q are what the curve follows; a key the
 * config does not hold reads as Tone's MonoSynth default (200 Hz, 3 octaves).
 */
export function monoFilterSweep(get: Get, getText?: (key: string) => string): { baseHz: number; octaves: number } {
  const held = (key: string): boolean => (getText ? getText(key) !== '' : true);
  return {
    baseHz: Math.max(20, held('filterEnvelope.baseFrequency') ? get('filterEnvelope.baseFrequency') : TONE_MONO_FILTER_DEFAULTS.baseFrequency),
    octaves: Math.max(0, held('filterEnvelope.octaves') ? get('filterEnvelope.octaves') : TONE_MONO_FILTER_DEFAULTS.octaves),
  };
}

export function monoSynthFilterCurve(): CurveDescriptor {
  const typeOf = (getText?: (key: string) => string) => asFilterType(getText ? getText('filter.type') : 'lowpass');
  const range = (get: Get, getText?: (key: string) => string) => {
    const { baseHz, octaves } = monoFilterSweep(get, getText);
    return { lowHz: baseHz, highHz: Math.min(20000, baseHz * 2 ** octaves) };
  };
  return {
    label: 'Filter response (swept by the filter envelope)',
    xScale: 'log',
    xDomain: [20, 20000],
    yDomain: [FILTER_DB_MIN, FILTER_DB_MAX],
    xUnit: 'Hz',
    yUnit: 'dB',
    series: (get, getText): CurveSeries[] => {
      const type = typeOf(getText);
      const q = webAudioLinearQ(type, get('filter.Q'));
      const { lowHz, highHz } = range(get, getText);
      return [
        { points: filterResponsePoints(type, lowHz, q, 2, 160, 20, 20000, true), color: '#8a8a8a' },
        { points: filterResponsePoints(type, highHz, q, 2, 160, 20, 20000, true), fill: true },
      ];
    },
    readout: (get, getText) => {
      const { lowHz, highHz } = range(get, getText);
      return `${typeOf(getText)}  ${fmtHz(lowHz)} to ${fmtHz(highHz)}`;
    },
    marker: toneVoiceMarker((report) => filterMarkerHz(report)),
  };
}

// ---------------------------------------------------------------------------------------------------------
// DuoSynth: the vibrato
// ---------------------------------------------------------------------------------------------------------

/** Tone.DuoSynth: vibratoRate is fixed at 5 Hz by ToneEngine; vibratoAmount = oscillator.detune / 100, or 0.5 when detune is 0. */
export const DUO_VIBRATO_RATE_HZ = 5;
export const DUO_VIBRATO_CENTS = 50; // the LFO swings +-50 cents (DuoSynth.js: min -50, max 50) times vibratoAmount

export function duoVibratoAmount(detuneCents: number): number {
  return detuneCents ? detuneCents / 100 : 0.5;
}

export function duoVibratoCurve(): CurveDescriptor {
  return {
    label: 'Vibrato (rate fixed at 5 Hz; Detune sets the depth)',
    xDomain: [0, 1],
    yDomain: [-DUO_VIBRATO_CENTS, DUO_VIBRATO_CENTS],
    xUnit: 's',
    yUnit: 'cents',
    series: (get): CurveSeries[] => {
      const amount = duoVibratoAmount(get('oscillator.detune'));
      return [{ points: lfoPoints('sine', DUO_VIBRATO_RATE_HZ, 1, 1).map(([t, v]) => [t, v * amount * DUO_VIBRATO_CENTS] as const) }];
    },
    readout: (get) => `${DUO_VIBRATO_RATE_HZ.toFixed(1)} Hz  +-${Math.round(Math.abs(duoVibratoAmount(get('oscillator.detune'))) * DUO_VIBRATO_CENTS)} cents`,
    marker: toneVoiceMarker((report) => lfoMarkerSeconds(DUO_VIBRATO_RATE_HZ, 1, report)),
  };
}

// ---------------------------------------------------------------------------------------------------------
// Pitch envelope
// ---------------------------------------------------------------------------------------------------------

/**
 * The pitch envelope in semitones against the drawn timeline (attack, decay, a hold, release), exactly what the voice
 * rig schedules (toneSynthKnobs.pitchEnvelopeCentsAt). Flat while the envelope is off or has no amount.
 */
export function tonePitchEnvelopeCurve(): CurveDescriptor {
  const shapeOf = (get: Get) => pitchEnvelopeShape({
    enabled: get('pitchEnvelope.enabled') > 0, amount: get('pitchEnvelope.amount'), attack: get('pitchEnvelope.attack'),
    decay: get('pitchEnvelope.decay'), sustain: get('pitchEnvelope.sustain'), release: get('pitchEnvelope.release'),
  });
  const timeline = (get: Get) => msEnvelopeLayout(get('pitchEnvelope.attack'), get('pitchEnvelope.decay'), 50, get('pitchEnvelope.release'));
  const span = (get: Get): number => {
    const shape = shapeOf(get);
    return shape ? Math.max(1, Math.ceil(Math.max(Math.abs(shape.peakCents), Math.abs(shape.sustainCents)) / 100)) : 12;
  };
  return {
    label: 'Pitch envelope',
    xDomain: [0, 1],
    yDomain: (get) => [-span(get), span(get)],
    xUnit: 'time',
    yUnit: 'st',
    series: (get): CurveSeries[] => {
      const shape = shapeOf(get);
      const e = timeline(get);
      const holdS = (e.atkMs + e.decMs + e.holdMs) / 1000;
      const points: Array<[number, number]> = [];
      const count = 200;
      for (let i = 0; i < count; i++) {
        const x = i / (count - 1);
        points.push([x, shape ? pitchEnvelopeCentsAt(shape, (x * e.totalMs) / 1000, holdS) / 100 : 0]);
      }
      return [{ points }];
    },
    readout: (get) => {
      const shape = shapeOf(get);
      if (!shape) return 'off';
      return `${(shape.peakCents / 100).toFixed(0)} st  A ${Math.round(shape.attackS * 1000)} ms  D ${Math.round(shape.decayS * 1000)} ms  R ${Math.round(shape.releaseS * 1000)} ms`;
    },
    marker: toneVoiceMarker((report, get) =>
      shapeOf(get) ? pitchEnvelopeMarkerX(get('pitchEnvelope.attack'), get('pitchEnvelope.decay'), get('pitchEnvelope.release'), report) : null),
  };
}

// ---------------------------------------------------------------------------------------------------------
// The editor LFO (the `lfo.*` knobs of the five melodic Tone synths)
// ---------------------------------------------------------------------------------------------------------

/**
 * The shape of the voice LFO at its rate. It restarts at every note, which is where the marker starts. The readout names
 * what it drives (vibrato in cents, tremolo, and on a MonoSynth the filter), as the engine reads the same knobs
 * (toneSynthKnobs.lfoSettingsOf).
 */
export function toneModLfoCurve(opts: { filter: boolean }): CurveDescriptor {
  const windowSec = 1;
  const shapeOf = (getText?: (key: string) => string): LfoShape => {
    const t = getText ? getText('lfo.waveform') : 'sine';
    return t === 'triangle' || t === 'square' || t === 'sawtooth' ? t : 'sine';
  };
  const rateOf = (get: Get): number => (get('lfo.rate') > 0 ? get('lfo.rate') : 5);
  return {
    label: 'LFO',
    xDomain: [0, windowSec],
    yDomain: [-1, 1],
    xUnit: 's',
    series: (get, getText): CurveSeries[] =>
      get('lfo.enabled') > 0 ? [{ points: lfoPoints(shapeOf(getText), rateOf(get), 1, windowSec) }] : [{ points: [[0, 0], [windowSec, 0]] }],
    readout: (get) => {
      if (get('lfo.enabled') <= 0) return 'off';
      const parts = [`${rateOf(get).toFixed(1)} Hz`, `pitch ${Math.round(get('lfo.pitchAmount'))} ct`, `tremolo ${Math.round(get('lfo.volumeAmount'))}%`];
      if (opts.filter) parts.push(`filter ${Math.round(get('lfo.filterAmount'))}%`);
      return parts.join('  ');
    },
    marker: toneVoiceMarker((report, get) =>
      get('lfo.enabled') > 0 ? lfoMarkerSeconds(rateOf(get), windowSec, report && { lfoPhase: report.modLfoPhase }) : null),
  };
}

// ---------------------------------------------------------------------------------------------------------
// FM and AM: the spectrum the Tone voice makes
// ---------------------------------------------------------------------------------------------------------

/** Bessel function of the first kind J_n(x), by the integral (1/pi) * int_0^pi cos(n t - x sin t) dt (trapezoid: exact for this periodic integrand once the steps outnumber n + x). */
export function besselJ(n: number, x: number): number {
  const steps = Math.min(8192, Math.max(64, Math.ceil(2 * (Math.abs(x) + Math.abs(n))) + 32));
  let sum = 0;
  for (let i = 0; i <= steps; i++) {
    const t = (Math.PI * i) / steps;
    const w = i === 0 || i === steps ? 0.5 : 1;
    sum += w * Math.cos(n * t - x * Math.sin(t));
  }
  return sum / steps;
}

/** ModulationSynth builds its carrier and its modulator as Tone.Synth voices at -10 dB, so the modulator reaches the carrier's frequency input at this fraction of unity. */
export const TONE_MODULATOR_GAIN = 10 ** (-10 / 20);

export interface SpectrumLine { ratio: number; amplitude: number }

/**
 * Lines whose frequencies coincide once the ones below 0 Hz are mirrored up add their Bessel terms directly; measured
 * on a rendered Tone.FMSynth (toneSynthKnobs.test.ts: a modulation index of 5 at harmonicity 2 folds k = -1 onto the
 * carrier and k = -2 onto the first sideband, and the sums are |J0 + J-1| and |J1 + J-2|).
 */
const merge = (lines: Map<number, number>, ratio: number, amplitude: number): void => {
  const key = Math.round(Math.abs(ratio) * 1e6) / 1e6;
  lines.set(key, (lines.get(key) ?? 0) + amplitude);
};

/**
 * A Tone.FMSynth voice with a sine carrier and a sine modulator: the modulator runs at harmonicity x the carrier and
 * is scaled by modulationIndex x the carrier frequency (FMOscillator), so the index in the classic sense is
 * modulationIndex / harmonicity and the lines sit at carrier + k x modulator with amplitude J_k(index). Frequencies are
 * in units of the carrier. Other waveforms have no closed form, so no spectrum is claimed for them.
 */
export function fmSpectrum(modulationIndex: number, harmonicity: number, modulatorSustain = 1, sidebands = 12): SpectrumLine[] {
  const h = Math.max(0.01, harmonicity);
  const beta = (TONE_MODULATOR_GAIN * modulatorSustain * modulationIndex) / h;
  const lines = new Map<number, number>();
  for (let k = -sidebands; k <= sidebands; k++) merge(lines, 1 + k * h, besselJ(k, beta));
  return [...lines].map(([ratio, a]) => ({ ratio, amplitude: Math.abs(a) })).filter((l) => l.ratio > 0 && l.amplitude > 0.005).sort((a, b) => a.ratio - b.ratio);
}

/**
 * A Tone.AMSynth voice with a sine carrier and a sine modulator: the carrier is multiplied by (modulator + 1) / 2
 * (AudioToGain) with the modulator at TONE_MODULATOR_GAIN, so against the unmodulated carrier (1) the carrier line
 * stays at 1 and each of the two sidebands, at carrier +- harmonicity x carrier, carries half the modulator's gain.
 * The modulator's envelope sustain scales the sidebands.
 */
export function amSpectrum(harmonicity: number, modulatorSustain = 1): SpectrumLine[] {
  const h = Math.max(0.01, harmonicity);
  const side = 0.5 * TONE_MODULATOR_GAIN * modulatorSustain;
  const lines = new Map<number, number>();
  merge(lines, 1, 1);
  merge(lines, 1 + h, side);
  merge(lines, 1 - h, side);
  return [...lines].map(([ratio, a]) => ({ ratio, amplitude: Math.abs(a) })).filter((l) => l.ratio > 0 && l.amplitude > 0.005).sort((a, b) => a.ratio - b.ratio);
}

/** Stems as one polyline: up to each amplitude and back down, left to right. */
const stems = (lines: SpectrumLine[]): Array<[number, number]> => {
  const points: Array<[number, number]> = [[0, 0]];
  for (const l of lines) points.push([l.ratio, 0], [l.ratio, Math.min(1, l.amplitude)], [l.ratio, 0]);
  return points;
};

/** Spectrum lines for the FM or AM voice; drawn for a sine carrier and a sine modulator, the case the formulas hold for. */
export function toneSpectrumCurve(kind: 'fm' | 'am'): CurveDescriptor {
  const held = (getText: ((key: string) => string) | undefined, key: string): boolean => !getText || getText(key) !== '';
  const value = (get: Get, getText: ((key: string) => string) | undefined, key: string, fallback: number): number =>
    held(getText, key) ? get(key) : fallback;
  // An unset oscillator is the engine's sine; an unset modulator is Tone's own default, a square wave.
  const sineOnly = (getText?: (key: string) => string): boolean =>
    (!getText || getText('oscillator.type') === '' || getText('oscillator.type') === 'sine') && !!getText && getText('modulation.type') === 'sine';
  const parts = (get: Get, getText?: (key: string) => string) => ({
    harmonicity: value(get, getText, 'harmonicity', TONE_AM_DEFAULTS.harmonicity),
    index: value(get, getText, 'modulationIndex', TONE_FM_DEFAULTS.modulationIndex),
    sustain: value(get, getText, 'modulationEnvelope.sustain', 100) / 100,
  });
  const linesOf = (get: Get, getText?: (key: string) => string): SpectrumLine[] | null => {
    if (!sineOnly(getText)) return null;
    const p = parts(get, getText);
    return kind === 'am' ? amSpectrum(p.harmonicity, p.sustain) : fmSpectrum(p.index, p.harmonicity, p.sustain);
  };
  const extent = (get: Get, getText?: (key: string) => string): number => {
    const lines = linesOf(get, getText);
    const widest = lines && lines.length > 0 ? Math.max(...lines.map((l) => l.ratio)) : 4;
    return Math.max(2, Math.min(40, Math.ceil(widest * 1.05)));
  };
  return {
    label: kind === 'fm' ? 'FM spectrum (sustained, sine carrier and modulator)' : 'AM spectrum (sustained, sine carrier and modulator)',
    xDomain: (get, getText) => [0, extent(get, getText)],
    yDomain: [0, 1],
    xUnit: 'x carrier',
    series: (get, getText): CurveSeries[] => {
      const lines = linesOf(get, getText);
      return lines ? [{ points: stems(lines) }] : [];
    },
    readout: (get, getText) => {
      if (!linesOf(get, getText)) return 'shown for a sine carrier and a sine modulator';
      const p = parts(get, getText);
      return kind === 'am'
        ? `sidebands at carrier +- ${p.harmonicity.toFixed(2)}x`
        : `index ${((TONE_MODULATOR_GAIN * p.sustain * p.index) / Math.max(0.01, p.harmonicity)).toFixed(2)}  spacing ${p.harmonicity.toFixed(2)}x`;
    },
  };
}
