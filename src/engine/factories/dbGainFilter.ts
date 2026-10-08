import * as Tone from 'tone';

/**
 * A Tone.Filter whose `gain` is applied in decibels.
 *
 * Tone.Filter keeps `gain` as a decibel Signal that converts its value to a
 * linear factor, then connects it to each biquad's gain, which the Web Audio
 * API reads as decibels. A +6 dB shelf landed as +2 dB and every cut became a
 * small boost (FX3, the same bug as the EQ3 bands - see eq3Bands.ts). Turning
 * the conversion off makes the signal carry the dB value the biquads expect,
 * and keeps Tone.Filter's rolloff cascade, which BiquadFilter lacks.
 */
export function createDbGainFilter(options: Partial<Tone.FilterOptions>): Tone.Filter {
  const filter = new Tone.Filter(options);
  filter.gain.convert = false;
  filter.gain.value = options.gain ?? 0;
  return filter;
}

/** The generic 'Filter' effect, shared by EffectFactory and the effect registry. */
export function createFilterEffect(p: {
  type?: BiquadFilterType; frequency?: number; rolloff?: number; Q?: number; gain?: number;
}): Tone.Filter {
  return createDbGainFilter({
    type: p.type || 'lowpass',
    frequency: p.frequency || 5000,
    rolloff: (p.rolloff || -12) as Tone.FilterRollOff,
    Q: p.Q || 1,
    gain: p.gain || 0,
  });
}
