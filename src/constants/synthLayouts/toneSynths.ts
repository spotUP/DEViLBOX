import type { SynthPanelLayout, SectionDescriptor } from '@/types/synthPanel';

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

const ENVELOPE_SECTION: SectionDescriptor = {
  label: 'AMP ENVELOPE',
  controls: [
    { type: 'knob', key: 'envelope.attack', label: 'ATK', color: '#22c55e', min: 1, max: 2000, defaultValue: 10, formatValue: fmtMs },
    { type: 'knob', key: 'envelope.decay', label: 'DEC', color: '#22c55e', min: 1, max: 2000, defaultValue: 200, formatValue: fmtMs },
    { type: 'knob', key: 'envelope.sustain', label: 'SUS', color: '#22c55e', min: 0, max: 100, defaultValue: 50, formatValue: fmtPct },
    { type: 'knob', key: 'envelope.release', label: 'REL', color: '#22c55e', min: 1, max: 5000, defaultValue: 1000, formatValue: fmtMs },
  ],
};

const PITCH_ENVELOPE_SECTION: SectionDescriptor = {
  label: 'PITCH ENVELOPE',
  controls: [
    { type: 'toggle', key: 'pitchEnvelope.enabled', label: 'ENABLE', labels: ['OFF', 'ON'] },
    { type: 'knob', key: 'pitchEnvelope.amount', label: 'AMOUNT', color: '#f97316', min: -48, max: 48, defaultValue: 12, bipolar: true, formatValue: fmtSt },
    { type: 'knob', key: 'pitchEnvelope.attack', label: 'ATK', color: '#f97316', min: 0, max: 2000, defaultValue: 0, formatValue: fmtMs },
    { type: 'knob', key: 'pitchEnvelope.decay', label: 'DEC', color: '#f97316', min: 1, max: 2000, defaultValue: 50, formatValue: fmtMs },
    { type: 'knob', key: 'pitchEnvelope.sustain', label: 'SUS', color: '#f97316', min: -100, max: 100, defaultValue: 0, bipolar: true, formatValue: fmtPct },
    { type: 'knob', key: 'pitchEnvelope.release', label: 'REL', color: '#f97316', min: 1, max: 5000, defaultValue: 100, formatValue: fmtMs },
  ],
};

const FILTER_SECTION: SectionDescriptor = {
  label: 'FILTER',
  controls: [
    { type: 'select', key: 'filter.type', label: 'TYPE', options: FILTER_TYPE_OPTIONS },
    { type: 'knob', key: 'filter.frequency', label: 'CUTOFF', color: '#ff6b6b', min: 20, max: 20000, defaultValue: 2000, formatValue: fmtHz },
    { type: 'knob', key: 'filter.Q', label: 'RESO', color: '#ff6b6b', min: 0, max: 100, defaultValue: 1, formatValue: fmtPct },
  ],
};

const LFO_SECTION: SectionDescriptor = {
  label: 'LFO',
  controls: [
    { type: 'toggle', key: 'lfo.enabled', label: 'ENABLE', labels: ['OFF', 'ON'] },
    { type: 'knob', key: 'lfo.frequency', label: 'RATE', color: '#06b6d4', min: 0.1, max: 20, defaultValue: 5, formatValue: (v) => `${v.toFixed(1)}Hz` },
    { type: 'knob', key: 'lfo.depth', label: 'DEPTH', color: '#06b6d4', min: 0, max: 100, defaultValue: 50, formatValue: fmtPct },
  ],
};

const DECAY_ENVELOPE_SECTION: SectionDescriptor = {
  label: 'ENVELOPE',
  controls: [
    { type: 'knob', key: 'envelope.attack', label: 'ATK', color: '#22c55e', min: 0, max: 500, defaultValue: 1, formatValue: fmtMs },
    { type: 'knob', key: 'envelope.decay', label: 'DEC', color: '#22c55e', min: 0, max: 2000, defaultValue: 300, formatValue: fmtMs },
    { type: 'knob', key: 'envelope.release', label: 'REL', color: '#22c55e', min: 0, max: 2000, defaultValue: 200, formatValue: fmtMs },
  ],
};

// ── Full synths (oscillator + filter + envelope + pitch env + LFO) ─────────

const FULL_SYNTH_SECTIONS: SectionDescriptor[] = [
  OSCILLATOR_SECTION, AMP_SECTION, ENVELOPE_SECTION, PITCH_ENVELOPE_SECTION, FILTER_SECTION, LFO_SECTION,
];

export const SYNTH_LAYOUT: SynthPanelLayout = {
  name: 'Synth',
  configKey: '',
  sections: FULL_SYNTH_SECTIONS,
};

export const MONO_SYNTH_LAYOUT: SynthPanelLayout = {
  name: 'Mono Synth',
  configKey: '',
  sections: FULL_SYNTH_SECTIONS,
};

export const DUO_SYNTH_LAYOUT: SynthPanelLayout = {
  name: 'Duo Synth',
  configKey: '',
  sections: FULL_SYNTH_SECTIONS,
};

export const FM_SYNTH_LAYOUT: SynthPanelLayout = {
  name: 'FM Synth',
  configKey: '',
  sections: [
    OSCILLATOR_SECTION,
    {
      label: 'FM',
      controls: [
        { type: 'knob', key: 'modulationIndex', label: 'MOD IDX', color: '#e879f9', min: 0, max: 100, defaultValue: 10, formatValue: (v) => `${v.toFixed(1)}` },
        { type: 'knob', key: 'harmonicity', label: 'HARM', color: '#e879f9', min: 0.1, max: 16, defaultValue: 3, formatValue: (v) => `${v.toFixed(2)}` },
      ],
    },
    AMP_SECTION, ENVELOPE_SECTION, PITCH_ENVELOPE_SECTION, FILTER_SECTION, LFO_SECTION,
  ],
};

export const AM_SYNTH_LAYOUT: SynthPanelLayout = {
  name: 'AM Synth',
  configKey: '',
  sections: [
    OSCILLATOR_SECTION,
    {
      label: 'AM',
      controls: [
        { type: 'knob', key: 'harmonicity', label: 'HARM', color: '#e879f9', min: 0.1, max: 16, defaultValue: 3, formatValue: (v) => `${v.toFixed(2)}` },
      ],
    },
    AMP_SECTION, ENVELOPE_SECTION, PITCH_ENVELOPE_SECTION, FILTER_SECTION, LFO_SECTION,
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
        { type: 'knob', key: 'attackNoise', label: 'NOISE', color: '#facc15', min: 0, max: 10, defaultValue: 1, formatValue: (v) => v.toFixed(1) },
        { type: 'knob', key: 'dampening', label: 'DAMP', color: '#facc15', min: 200, max: 20000, defaultValue: 4000, formatValue: fmtHz },
        { type: 'knob', key: 'resonance', label: 'RESO', color: '#facc15', min: 0, max: 1, defaultValue: 0.7, formatValue: (v) => `${Math.round(v * 100)}%` },
        { type: 'knob', key: 'release', label: 'REL', color: '#facc15', min: 0.01, max: 5, defaultValue: 1, formatValue: (v) => `${(v * 1000).toFixed(0)}ms` },
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
        { type: 'knob', key: 'harmonicity', label: 'HARM', color: '#94a3b8', min: 0.1, max: 16, defaultValue: 5.1, formatValue: (v) => v.toFixed(2) },
        { type: 'knob', key: 'modulationIndex', label: 'MOD IDX', color: '#94a3b8', min: 0, max: 100, defaultValue: 32, formatValue: (v) => v.toFixed(1) },
        { type: 'knob', key: 'octaves', label: 'OCTAVES', color: '#94a3b8', min: 0, max: 8, defaultValue: 1.5, formatValue: (v) => v.toFixed(1) },
        { type: 'knob', key: 'resonance', label: 'RESO', color: '#94a3b8', min: 10, max: 20000, defaultValue: 4000, formatValue: fmtHz },
      ],
    },
    DECAY_ENVELOPE_SECTION,
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
        { type: 'knob', key: 'pitchDecay', label: 'PITCH DEC', color: '#fb923c', min: 0, max: 1, defaultValue: 0.05, formatValue: (v) => `${(v * 1000).toFixed(0)}ms` },
        { type: 'knob', key: 'octaves', label: 'OCTAVES', color: '#fb923c', min: 0, max: 10, defaultValue: 8, formatValue: (v) => v.toFixed(1) },
      ],
    },
    DECAY_ENVELOPE_SECTION,
  ],
};

export const NOISE_SYNTH_LAYOUT: SynthPanelLayout = {
  name: 'Noise Synth',
  configKey: '',
  sections: [AMP_SECTION, ENVELOPE_SECTION, FILTER_SECTION],
};
