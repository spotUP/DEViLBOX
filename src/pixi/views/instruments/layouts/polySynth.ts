import type { SynthPanelLayout } from '../synthPanelTypes';

const fmtMs = (v: number) => `${Math.round(v)}ms`;
const fmtPct = (v: number) => `${Math.round(v)}%`;
const fmtDb = (v: number) => `${Math.round(v)}dB`;
const fmtPan = (v: number) => v === 0 ? 'C' : v > 0 ? `R${Math.round(v)}` : `L${Math.round(-v)}`;

export const POLY_SYNTH_LAYOUT: SynthPanelLayout = {
  name: 'Poly Synth',
  configKey: 'polySynth',
  sections: [
    {
      label: 'AMP',
      controls: [
        { type: 'knob', key: '~volume', label: 'VOLUME', color: '#00ff99', min: -60, max: 0, defaultValue: -12, formatValue: fmtDb },
        { type: 'knob', key: '~pan', label: 'PAN', color: '#66ccff', min: -100, max: 100, defaultValue: 0, bipolar: true, formatValue: fmtPan },
      ],
    },
    {
      label: 'POLY',
      controls: [
        { type: 'knob', key: 'voiceCount', label: 'VOICES', color: '#ff9900', min: 1, max: 16, defaultValue: 8, formatValue: (v) => `${Math.round(v)}` },
        { type: 'knob', key: 'portamento', label: 'PORTA', color: '#66ccff', min: 0, max: 1000, defaultValue: 0, formatValue: fmtMs },
      ],
    },
    {
      label: 'ENVELOPE',
      controls: [
        { type: 'knob', key: 'envelope.attack', label: 'ATK', color: '#ff9900', min: 0, max: 2000, defaultValue: 50, formatValue: fmtMs },
        { type: 'knob', key: 'envelope.decay', label: 'DEC', color: '#ff9900', min: 0, max: 2000, defaultValue: 500, formatValue: fmtMs },
        { type: 'knob', key: 'envelope.sustain', label: 'SUS', color: '#ff9900', min: 0, max: 100, defaultValue: 0, formatValue: fmtPct },
        { type: 'knob', key: 'envelope.release', label: 'REL', color: '#ff9900', min: 0, max: 5000, defaultValue: 100, formatValue: fmtMs },
      ],
    },
  ],
};
