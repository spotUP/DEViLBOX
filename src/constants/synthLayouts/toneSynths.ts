import type { SynthPanelLayout, SectionDescriptor } from '@/types/synthPanel';
import {
  toneAdsrCurve, monoSynthFilterCurve, duoVibratoCurve, tonePitchEnvelopeCurve, toneModLfoCurve, toneSpectrumCurve,
} from '@/components/instruments/curves/toneCurves';
import {
  TONE_PLUCK_DEFAULTS, TONE_METAL_DEFAULTS, TONE_MEMBRANE_DEFAULTS, TONE_FM_DEFAULTS, TONE_AM_DEFAULTS,
  TONE_MONO_FILTER_DEFAULTS, TONE_LFO_DEFAULTS,
} from '@/engine/tone/toneSynthKnobs';


const fmtMs = (v: number) => `${Math.round(v)}ms`;
const fmtPct = (v: number) => `${Math.round(v)}%`;
const fmtDb = (v: number) => `${Math.round(v)}dB`;
const fmtSt = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}st`;
const fmtPan = (v: number) => v === 0 ? 'C' : v > 0 ? `R${Math.round(v)}` : `L${Math.round(-v)}`;
const fmtHz = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}Hz`;
const fmtOct = (v: number) => v > 0 ? `+${Math.round(v)}` : `${Math.round(v)}`;
const fmtCents = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}ct`;

// ── Shared sections ──────────────────────────────────────────────────────────

const WAVEFORM_OPTIONS = [
  { value: 'sine', label: 'Sine' },
  { value: 'square', label: 'Square' },
  { value: 'sawtooth', label: 'Sawtooth' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'pulse', label: 'Pulse' },
  { value: 'pwm', label: 'PWM' },
];

const FILTER_TYPE_OPTIONS = [
  { value: 'lowpass', label: 'Lowpass' },
  { value: 'highpass', label: 'Highpass' },
  { value: 'bandpass', label: 'Bandpass' },
  { value: 'notch', label: 'Notch' },
];

const OSCILLATOR_SECTION: SectionDescriptor = {
  label: 'OSCILLATOR',
  controls: [
    { type: 'select', key: 'oscillator.type', label: 'WAVEFORM', options: WAVEFORM_OPTIONS },
    { type: 'knob', key: 'oscillator.detune', label: 'DETUNE', color: '#4a9eff', min: -100, max: 100, defaultValue: 0, bipolar: true, formatValue: fmtCents },
    { type: 'knob', key: 'oscillator.octave', label: 'OCTAVE', color: '#4a9eff', min: -2, max: 2, defaultValue: 0, bipolar: true, formatValue: fmtOct },
  ],
};

const AMP_SECTION: SectionDescriptor = {
  label: 'OUTPUT',
  controls: [
    { type: 'knob', key: 'volume', label: 'VOLUME', color: '#a855f7', min: -60, max: 0, defaultValue: -12, formatValue: fmtDb },
    { type: 'knob', key: 'pan', label: 'PAN', color: '#a855f7', min: -100, max: 100, defaultValue: 0, bipolar: true, formatValue: fmtPan },
  ],
};

// Every knob below is read by the engine: src/engine/tone/toneSynthKnobs.ts builds the Tone options for creation and for
// live edits from the same config keys, and a test per knob proves it moves a Tone property or the rendered sound.
// Resting values come from that module's defaults, so the knob shows what the engine plays when the key is unset.
// Not offered, because the engine cannot honour them: a FILTER on Synth, Duo, FM, AM and Noise (those voices have no
// filter stage; only MonoSynth has one), the MetalSynth base frequency (every note sets it) and the LFO's filter depth
// outside MonoSynth.
const AMP_ENVELOPE_CURVE = toneAdsrCurve({
  label: 'Amp envelope', attack: 'envelope.attack', decay: 'envelope.decay', sustain: 'envelope.sustain', release: 'envelope.release',
});

const ENVELOPE_SECTION: SectionDescriptor = {
  label: 'AMP ENVELOPE',
  curves: [AMP_ENVELOPE_CURVE],
  controls: [
    { type: 'knob', key: 'envelope.attack', label: 'ATK', color: '#22c55e', min: 1, max: 2000, defaultValue: 10, formatValue: fmtMs },
    { type: 'knob', key: 'envelope.decay', label: 'DEC', color: '#22c55e', min: 1, max: 2000, defaultValue: 200, formatValue: fmtMs },
    { type: 'knob', key: 'envelope.sustain', label: 'SUS', color: '#22c55e', min: 0, max: 100, defaultValue: 50, formatValue: fmtPct },
    { type: 'knob', key: 'envelope.release', label: 'REL', color: '#22c55e', min: 1, max: 5000, defaultValue: 1000, formatValue: fmtMs },
  ],
};

const PITCH_ENVELOPE_SECTION: SectionDescriptor = {
  label: 'PITCH ENVELOPE',
  curves: [tonePitchEnvelopeCurve()],
  controls: [
    { type: 'toggle', key: 'pitchEnvelope.enabled', label: 'ENABLE', labels: ['OFF', 'ON'] },
    { type: 'knob', key: 'pitchEnvelope.amount', label: 'AMOUNT', color: '#f97316', min: -48, max: 48, defaultValue: 12, bipolar: true, formatValue: fmtSt },
    { type: 'knob', key: 'pitchEnvelope.attack', label: 'ATK', color: '#f97316', min: 0, max: 2000, defaultValue: 0, formatValue: fmtMs },
    { type: 'knob', key: 'pitchEnvelope.decay', label: 'DEC', color: '#f97316', min: 1, max: 2000, defaultValue: 50, formatValue: fmtMs },
    { type: 'knob', key: 'pitchEnvelope.sustain', label: 'SUS', color: '#f97316', min: -100, max: 100, defaultValue: 0, bipolar: true, formatValue: fmtPct },
    { type: 'knob', key: 'pitchEnvelope.release', label: 'REL', color: '#f97316', min: 1, max: 5000, defaultValue: 100, formatValue: fmtMs },
  ],
};

/**
 * MonoSynth only. Tone drives the filter's frequency from its FrequencyEnvelope, so the cutoff is a sweep: Base Cutoff
 * (the envelope's floor) and Sweep Octaves (how far above it the peak sits, base * 2^octaves).
 */
const MONO_FILTER_SECTION: SectionDescriptor = {
  label: 'FILTER',
  curves: [monoSynthFilterCurve()],
  controls: [
    { type: 'select', key: 'filter.type', label: 'TYPE', options: FILTER_TYPE_OPTIONS },
    { type: 'knob', key: 'filterEnvelope.baseFrequency', label: 'BASE CUTOFF', color: '#ff6b6b', min: 20, max: 20000, defaultValue: TONE_MONO_FILTER_DEFAULTS.baseFrequency, formatValue: fmtHz },
    { type: 'knob', key: 'filterEnvelope.octaves', label: 'SWEEP OCTAVES', color: '#ff6b6b', min: 0, max: 8, defaultValue: TONE_MONO_FILTER_DEFAULTS.octaves, formatValue: (v) => `${v.toFixed(1)}` },
    { type: 'knob', key: 'filter.Q', label: 'RESONANCE', color: '#ff6b6b', min: 0, max: 100, defaultValue: 1, formatValue: fmtPct },
  ],
};

const LFO_WAVE_OPTIONS = [
  { value: 'sine', label: 'Sine' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'sawtooth', label: 'Sawtooth' },
  { value: 'square', label: 'Square' },
];

/** The voice LFO: restarts at every note; vibrato and tremolo on every melodic voice, the cutoff too on a MonoSynth. */
const lfoSection = (withFilter: boolean): SectionDescriptor => ({
  label: 'LFO',
  curves: [toneModLfoCurve({ filter: withFilter })],
  controls: [
    { type: 'toggle', key: 'lfo.enabled', label: 'ENABLE', labels: ['OFF', 'ON'] },
    { type: 'select', key: 'lfo.waveform', label: 'WAVEFORM', options: LFO_WAVE_OPTIONS },
    { type: 'knob', key: 'lfo.rate', label: 'RATE', color: '#06b6d4', min: 0.1, max: 20, defaultValue: TONE_LFO_DEFAULTS.rate, formatValue: (v) => `${v.toFixed(1)}Hz` },
    { type: 'knob', key: 'lfo.pitchAmount', label: 'VIBRATO DEPTH', color: '#06b6d4', min: 0, max: 100, defaultValue: 0, formatValue: fmtCents },
    { type: 'knob', key: 'lfo.volumeAmount', label: 'TREMOLO DEPTH', color: '#06b6d4', min: 0, max: 100, defaultValue: 0, formatValue: fmtPct },
    ...(withFilter
      ? [{ type: 'knob', key: 'lfo.filterAmount', label: 'FILTER DEPTH', color: '#06b6d4', min: 0, max: 100, defaultValue: 0, formatValue: fmtPct } as const]
      : []),
  ],
});

/** Metal and Membrane voices have no sustain stage knob: Tone.MetalSynth runs with sustain 0, ToneEngine/registry pins MembraneSynth at 0.01. */
const decayEnvelopeSection = (sustainPercent: number, d: { attackMs: number; decayMs: number; releaseMs: number }): SectionDescriptor => ({
  label: 'ENVELOPE',
  curves: [toneAdsrCurve({
    label: 'Amp envelope', attack: 'envelope.attack', decay: 'envelope.decay', sustain: sustainPercent, release: 'envelope.release',
  })],
  controls: [
    { type: 'knob', key: 'envelope.attack', label: 'ATK', color: '#22c55e', min: 0, max: 500, defaultValue: d.attackMs, formatValue: fmtMs },
    { type: 'knob', key: 'envelope.decay', label: 'DEC', color: '#22c55e', min: 0, max: 2000, defaultValue: d.decayMs, formatValue: fmtMs },
    { type: 'knob', key: 'envelope.release', label: 'REL', color: '#22c55e', min: 0, max: 2000, defaultValue: d.releaseMs, formatValue: fmtMs },
  ],
});

// ── Full synths (oscillator + envelope + pitch env + LFO; MonoSynth also has a filter) ─────────

const FULL_SYNTH_SECTIONS: SectionDescriptor[] = [
  OSCILLATOR_SECTION, AMP_SECTION, ENVELOPE_SECTION, PITCH_ENVELOPE_SECTION, lfoSection(false),
];

export const SYNTH_LAYOUT: SynthPanelLayout = {
  name: 'Synth',
  configKey: '',
  sections: FULL_SYNTH_SECTIONS,
};

export const MONO_SYNTH_LAYOUT: SynthPanelLayout = {
  name: 'Mono Synth',
  configKey: '',
  sections: [
    OSCILLATOR_SECTION, AMP_SECTION, ENVELOPE_SECTION, PITCH_ENVELOPE_SECTION, MONO_FILTER_SECTION, lfoSection(true),
  ],
};

export const DUO_SYNTH_LAYOUT: SynthPanelLayout = {
  name: 'Duo Synth',
  configKey: '',
  sections: [
    { ...OSCILLATOR_SECTION, curves: [duoVibratoCurve()] },
    AMP_SECTION, ENVELOPE_SECTION, PITCH_ENVELOPE_SECTION, lfoSection(false),
  ],
};

/** The modulator half of an FM or AM voice (Tone's own defaults when a key is unset: a square wave, 500 ms attack, full sustain, 500 ms release). */
const MODULATOR_SECTION: SectionDescriptor = {
  label: 'MODULATOR',
  controls: [
    { type: 'select', key: 'modulation.type', label: 'WAVEFORM', options: WAVEFORM_OPTIONS.filter((o) => o.value !== 'pulse' && o.value !== 'pwm') },
    { type: 'knob', key: 'modulationEnvelope.attack', label: 'ATK', color: '#e879f9', min: 0, max: 2000, defaultValue: 500, formatValue: fmtMs },
    { type: 'knob', key: 'modulationEnvelope.decay', label: 'DEC', color: '#e879f9', min: 0, max: 2000, defaultValue: 0, formatValue: fmtMs },
    { type: 'knob', key: 'modulationEnvelope.sustain', label: 'SUS', color: '#e879f9', min: 0, max: 100, defaultValue: 100, formatValue: fmtPct },
    { type: 'knob', key: 'modulationEnvelope.release', label: 'REL', color: '#e879f9', min: 0, max: 5000, defaultValue: 500, formatValue: fmtMs },
  ],
};

export const FM_SYNTH_LAYOUT: SynthPanelLayout = {
  name: 'FM Synth',
  configKey: '',
  sections: [
    OSCILLATOR_SECTION,
    {
      label: 'FM',
      curves: [toneSpectrumCurve('fm')],
      controls: [
        { type: 'knob', key: 'modulationIndex', label: 'MODULATION INDEX', color: '#e879f9', min: 0, max: 100, defaultValue: TONE_FM_DEFAULTS.modulationIndex, formatValue: (v) => `${v.toFixed(1)}` },
        { type: 'knob', key: 'harmonicity', label: 'HARMONICITY', color: '#e879f9', min: 0.1, max: 16, defaultValue: TONE_FM_DEFAULTS.harmonicity, formatValue: (v) => `${v.toFixed(2)}` },
      ],
    },
    MODULATOR_SECTION,
    AMP_SECTION, ENVELOPE_SECTION, PITCH_ENVELOPE_SECTION, lfoSection(false),
  ],
};

export const AM_SYNTH_LAYOUT: SynthPanelLayout = {
  name: 'AM Synth',
  configKey: '',
  sections: [
    OSCILLATOR_SECTION,
    {
      label: 'AM',
      curves: [toneSpectrumCurve('am')],
      controls: [
        { type: 'knob', key: 'harmonicity', label: 'HARMONICITY', color: '#e879f9', min: 0.1, max: 16, defaultValue: TONE_AM_DEFAULTS.harmonicity, formatValue: (v) => `${v.toFixed(2)}` },
      ],
    },
    MODULATOR_SECTION,
    AMP_SECTION, ENVELOPE_SECTION, PITCH_ENVELOPE_SECTION, lfoSection(false),
  ],
};

export const PLUCK_SYNTH_LAYOUT: SynthPanelLayout = {
  name: 'Pluck Synth',
  configKey: '',
  sections: [
    AMP_SECTION,
    {
      label: 'PLUCK',
      controls: [
        { type: 'knob', key: 'parameters.attackNoise', label: 'NOISE', color: '#facc15', min: 0, max: 10, defaultValue: TONE_PLUCK_DEFAULTS.attackNoise, formatValue: (v) => v.toFixed(1) },
        { type: 'knob', key: 'parameters.dampening', label: 'DAMPENING', color: '#facc15', min: 200, max: 20000, defaultValue: TONE_PLUCK_DEFAULTS.dampening, formatValue: fmtHz },
        { type: 'knob', key: 'parameters.resonance', label: 'RESONANCE', color: '#facc15', min: 0, max: 1, defaultValue: TONE_PLUCK_DEFAULTS.resonance, formatValue: (v) => `${Math.round(v * 100)}%` },
        { type: 'knob', key: 'parameters.release', label: 'RELEASE', color: '#facc15', min: 0.01, max: 5, defaultValue: TONE_PLUCK_DEFAULTS.release, formatValue: (v) => `${(v * 1000).toFixed(0)}ms` },
      ],
    },
  ],
};

export const METAL_SYNTH_LAYOUT: SynthPanelLayout = {
  name: 'Metal Synth',
  configKey: '',
  sections: [
    AMP_SECTION,
    {
      label: 'METAL',
      controls: [
        { type: 'knob', key: 'parameters.harmonicity', label: 'HARMONICITY', color: '#94a3b8', min: 0.1, max: 16, defaultValue: TONE_METAL_DEFAULTS.harmonicity, formatValue: (v) => v.toFixed(2) },
        { type: 'knob', key: 'parameters.modulationIndex', label: 'MODULATION INDEX', color: '#94a3b8', min: 0, max: 100, defaultValue: TONE_METAL_DEFAULTS.modulationIndex, formatValue: (v) => v.toFixed(1) },
        { type: 'knob', key: 'parameters.octaves', label: 'OCTAVES', color: '#94a3b8', min: 0, max: 8, defaultValue: TONE_METAL_DEFAULTS.octaves, formatValue: (v) => v.toFixed(1) },
        { type: 'knob', key: 'parameters.resonance', label: 'RESONANCE', color: '#94a3b8', min: 10, max: 20000, defaultValue: TONE_METAL_DEFAULTS.resonance, formatValue: fmtHz },
      ],
    },
    decayEnvelopeSection(0, TONE_METAL_DEFAULTS),
  ],
};

export const MEMBRANE_SYNTH_LAYOUT: SynthPanelLayout = {
  name: 'Membrane Synth',
  configKey: '',
  sections: [
    AMP_SECTION,
    {
      label: 'MEMBRANE',
      controls: [
        { type: 'knob', key: 'parameters.pitchDecay', label: 'PITCH DECAY', color: '#fb923c', min: 0, max: 1, defaultValue: TONE_MEMBRANE_DEFAULTS.pitchDecay, formatValue: (v) => `${(v * 1000).toFixed(0)}ms` },
        // Tone.MembraneSynth starts the pitch at the note times this value (its source: frequency * octaves) and falls to the note
    // over Pitch Decay; 0 turns the sweep off. The name "octaves" is Tone's, the behaviour is a multiplier.
    { type: 'knob', key: 'parameters.octaves', label: 'START MULTIPLIER', color: '#fb923c', min: 0, max: 10, defaultValue: TONE_MEMBRANE_DEFAULTS.octaves, formatValue: (v) => `${v.toFixed(1)}x` },
      ],
    },
    decayEnvelopeSection(1, TONE_MEMBRANE_DEFAULTS),
  ],
};

export const NOISE_SYNTH_LAYOUT: SynthPanelLayout = {
  name: 'Noise Synth',
  configKey: '',
  sections: [AMP_SECTION, ENVELOPE_SECTION],
};
