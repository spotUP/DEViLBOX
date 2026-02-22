import type { SynthPanelLayout } from '../synthPanelTypes';

const fmtPct = (v: number) => `${Math.round(v * 100)}%`;
const fmtHz = (v: number) => `${Math.round(v)} Hz`;
const fmtMs = (v: number) => `${Math.round(v)} ms`;

export const HARMONIC_SYNTH_LAYOUT: SynthPanelLayout = {
  name: 'Harmonic Synth',
  configKey: 'harmonicSynth',
  tabs: [
    {
      id: 'harmonics',
      label: 'HARM',
      sections: [
        {
          label: 'SPECTRAL',
          controls: [
            { type: 'knob', key: 'spectralTilt', label: 'TILT', min: -100, max: 100, defaultValue: 0, bipolar: true, formatValue: (v) => `${Math.round(v)}` },
            { type: 'knob', key: 'evenOddBalance', label: 'E/O BAL', min: -100, max: 100, defaultValue: 0, bipolar: true, formatValue: (v) => `${Math.round(v)}` },
          ],
        },
        {
          label: 'FILTER',
          controls: [
            { type: 'knob', key: 'filter.cutoff', label: 'CUTOFF', min: 20, max: 20000, defaultValue: 8000, color: '#ffcc00', formatValue: fmtHz },
            { type: 'knob', key: 'filter.resonance', label: 'RESO', min: 0, max: 30, defaultValue: 1, color: '#ff6600', formatValue: (v) => `${v.toFixed(1)}` },
          ],
        },
      ],
    },
    {
      id: 'env',
      label: 'ENV',
      sections: [
        {
          label: 'AMP ENVELOPE',
          controls: [
            { type: 'knob', key: 'envelope.attack', label: 'A', formatValue: fmtMs },
            { type: 'knob', key: 'envelope.decay', label: 'D', formatValue: fmtMs },
            { type: 'knob', key: 'envelope.sustain', label: 'S', formatValue: fmtPct },
            { type: 'knob', key: 'envelope.release', label: 'R', formatValue: fmtMs },
          ],
        },
        {
          label: 'LFO',
          controls: [
            { type: 'knob', key: 'lfo.rate', label: 'RATE', min: 0.1, max: 20, defaultValue: 2, formatValue: (v) => `${v.toFixed(1)} Hz` },
            { type: 'knob', key: 'lfo.depth', label: 'DEPTH', min: 0, max: 100, defaultValue: 0, formatValue: (v) => `${Math.round(v)}%` },
          ],
        },
      ],
    },
  ],
};
