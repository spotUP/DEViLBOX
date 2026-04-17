/**
 * resolveParamKey — maps (synthType, generic config field) → registered MIDI
 * param key for generic knob panels like `InstrumentKnobPanel`.
 *
 * Used by the shared Knob's `paramKey` prop so a single generic knob panel
 * can opt every synth into the imperative MIDI fast path without each
 * caller needing to hardcode the synth-specific route namespace.
 *
 * Returns undefined when no registered MIDI route exists for that synth +
 * field combination — in which case the knob falls back to the normal
 * React-re-render path.
 */

type SynthType = string;
type GenericField =
  | 'filter.frequency'
  | 'filter.Q'
  | 'envelope.attack'
  | 'envelope.decay'
  | 'envelope.sustain'
  | 'envelope.release'
  | 'oscillator.detune'
  | 'filterEnvelope.octaves'
  | 'filterEnvelope.attack'
  | 'filterEnvelope.decay';

/** Per-synth map of generic-field → PARAMETER_ROUTES key.
 *  Only includes entries that ARE registered in parameterRouter's
 *  PARAMETER_ROUTES table. Missing entries fall back to no-imperative-path. */
const SYNTH_FIELD_ROUTES: Record<SynthType, Partial<Record<GenericField, string>>> = {
  TB303: {
    'filter.frequency': 'cutoff',
    'filter.Q': 'resonance',
    'envelope.attack': 'softAttack',
    'envelope.decay': 'decay',
    'filterEnvelope.octaves': 'envMod',
    'filterEnvelope.decay': 'decay',
    'oscillator.detune': 'tuning',
  },
  Wavetable: {
    'filter.frequency': 'wavetable.cutoff',
    'filter.Q': 'wavetable.resonance',
    'envelope.attack': 'wavetable.attack',
    'envelope.decay': 'wavetable.decay',
    'envelope.sustain': 'wavetable.sustain',
    'envelope.release': 'wavetable.release',
  },
  Klystrack: {
    'filter.frequency': 'klystrack.cutoff',
    'filter.Q': 'klystrack.resonance',
    'envelope.attack': 'klystrack.attack',
    'envelope.decay': 'klystrack.decay',
    'envelope.sustain': 'klystrack.sustain',
    'envelope.release': 'klystrack.release',
  },
  Harmonic: {
    'filter.frequency': 'harmonic.filterCutoff',
    'filter.Q': 'harmonic.filterResonance',
    'envelope.attack': 'harmonic.attack',
    'envelope.decay': 'harmonic.decay',
    'envelope.sustain': 'harmonic.sustain',
    'envelope.release': 'harmonic.release',
  },
  GTUltra: {
    'envelope.attack': 'gtultra.attack',
    'envelope.decay': 'gtultra.decay',
    'envelope.sustain': 'gtultra.sustain',
    'envelope.release': 'gtultra.release',
  },
};

/** Resolve the MIDI param key for a generic Knob in a tracker inspector. */
export function resolveParamKey(
  synthType: string | undefined,
  field: GenericField,
): string | undefined {
  if (!synthType) return undefined;
  return SYNTH_FIELD_ROUTES[synthType]?.[field];
}
