import * as Tone from 'tone';

/**
 * The master EQ3: three serial peaking bands (low, mid, high) in a Gain
 * wrapper. Shared by EffectFactory and the effect registry.
 *
 * The bands are Tone.BiquadFilter, not Tone.Filter. Tone.Filter keeps its
 * `gain` as a Signal in decibels and feeds it into the biquad's gain, which
 * Tone treats as linear: a +9 dB request landed as +2.8 dB (10^(9/20)) and a
 * -3 dB cut as +0.7 dB. Every EQ3 boost was about a third of what the knob
 * said and every cut was a small boost (owner 2026-10-08: the punchy presets
 * "don't change the audio much"). BiquadFilter.gain is the native dB value.
 */
export interface Eq3Params {
  low: number;
  mid: number;
  high: number;
  lowFrequency: number;
  highFrequency: number;
}

export function createEq3Bands(p: Eq3Params): Tone.Gain {
  const eqInput = new Tone.Gain(1);
  const lowFilter = new Tone.BiquadFilter({ type: 'peaking', frequency: p.lowFrequency, gain: p.low, Q: 0.5 });
  const midFilter = new Tone.BiquadFilter({
    type: 'peaking', frequency: Math.sqrt(p.lowFrequency * p.highFrequency), gain: p.mid, Q: 0.7,
  });
  const highFilter = new Tone.BiquadFilter({ type: 'peaking', frequency: p.highFrequency, gain: p.high, Q: 0.5 });
  eqInput.chain(lowFilter, midFilter, highFilter);
  // The parameter engine updates the bands through this list.
  (eqInput as unknown as Record<string, unknown>)._eq3Filters = [lowFilter, midFilter, highFilter];
  // The chain continues from the last band.
  Object.defineProperty(eqInput, 'output', {
    value: (highFilter as unknown as { output: unknown }).output,
    configurable: true,
  });
  return eqInput;
}
