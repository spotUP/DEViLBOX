import type { SynthPanelLayout } from '../synthPanelTypes';

const fmtMs = (v: number) => `${Math.round(v)}ms`;
const fmtPct = (v: number) => `${Math.round(v)}%`;
const fmtDb = (v: number) => `${Math.round(v)}dB`;
const fmtPan = (v: number) => v === 0 ? 'C' : v > 0 ? `R${Math.round(v)}` : `L${Math.round(-v)}`;

const AMP_SECTION = {
  label: 'AMP',
  controls: [
    { type: 'knob' as const, key: 'volume', label: 'VOLUME', color: '#00ff99', min: -60, max: 0, defaultValue: -12, formatValue: fmtDb },
    { type: 'knob' as const, key: 'pan', label: 'PAN', color: '#66ccff', min: -100, max: 100, defaultValue: 0, bipolar: true, formatValue: fmtPan },
  ],
};

const ENVELOPE_SECTION = {
  label: 'ENVELOPE',
  controls: [
    { type: 'knob' as const, key: 'envelope.attack', label: 'ATK', color: '#ff9900', min: 0, max: 2000, defaultValue: 10, formatValue: fmtMs },
    { type: 'knob' as const, key: 'envelope.decay', label: 'DEC', color: '#ff9900', min: 0, max: 2000, defaultValue: 200, formatValue: fmtMs },
    { type: 'knob' as const, key: 'envelope.sustain', label: 'SUS', color: '#ff9900', min: 0, max: 100, defaultValue: 50, formatValue: fmtPct },
    { type: 'knob' as const, key: 'envelope.release', label: 'REL', color: '#ff9900', min: 0, max: 5000, defaultValue: 1000, formatValue: fmtMs },
  ],
};

const DECAY_ENVELOPE_SECTION = {
  label: 'ENVELOPE',
  controls: [
    { type: 'knob' as const, key: 'envelope.attack', label: 'ATK', color: '#ff9900', min: 0, max: 500, defaultValue: 1, formatValue: fmtMs },
    { type: 'knob' as const, key: 'envelope.decay', label: 'DEC', color: '#ff9900', min: 0, max: 2000, defaultValue: 300, formatValue: fmtMs },
    { type: 'knob' as const, key: 'envelope.release', label: 'REL', color: '#ff9900', min: 0, max: 2000, defaultValue: 200, formatValue: fmtMs },
  ],
};

export const SYNTH_LAYOUT: SynthPanelLayout = {
  name: 'Synth',
  configKey: 'tone',
  sections: [AMP_SECTION, ENVELOPE_SECTION],
};

export const MONO_SYNTH_LAYOUT: SynthPanelLayout = {
  name: 'Mono Synth',
  configKey: 'tone',
  sections: [AMP_SECTION, ENVELOPE_SECTION],
};

export const DUO_SYNTH_LAYOUT: SynthPanelLayout = {
  name: 'Duo Synth',
  configKey: 'tone',
  sections: [AMP_SECTION, ENVELOPE_SECTION],
};

export const FM_SYNTH_LAYOUT: SynthPanelLayout = {
  name: 'FM Synth',
  configKey: 'tone',
  sections: [AMP_SECTION, ENVELOPE_SECTION],
};

export const AM_SYNTH_LAYOUT: SynthPanelLayout = {
  name: 'AM Synth',
  configKey: 'tone',
  sections: [AMP_SECTION, ENVELOPE_SECTION],
};

export const PLUCK_SYNTH_LAYOUT: SynthPanelLayout = {
  name: 'Pluck Synth',
  configKey: 'tone',
  sections: [AMP_SECTION],
};

export const METAL_SYNTH_LAYOUT: SynthPanelLayout = {
  name: 'Metal Synth',
  configKey: 'tone',
  sections: [AMP_SECTION, DECAY_ENVELOPE_SECTION],
};

export const MEMBRANE_SYNTH_LAYOUT: SynthPanelLayout = {
  name: 'Membrane Synth',
  configKey: 'tone',
  sections: [AMP_SECTION, DECAY_ENVELOPE_SECTION],
};

export const NOISE_SYNTH_LAYOUT: SynthPanelLayout = {
  name: 'Noise Synth',
  configKey: 'tone',
  sections: [AMP_SECTION, ENVELOPE_SECTION],
};
