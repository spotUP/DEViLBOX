import type { SynthPanelLayout } from '@/types/synthPanel';

const fmtPct = (v: number) => `${Math.round(v * 100)}%`;
const fmtInt = (v: number) => `${Math.round(v)}`;

/**
 * CZ-101 layout for Pixi synth panel.
 * Casio CZ-101 Phase Distortion Synthesizer (1984).
 * Parameters from chipParameters.ts CZ101 entry.
 */
export const CZ101_LAYOUT: SynthPanelLayout = {
  name: 'CZ-101',
  configKey: 'parameters',
  tabs: [
    {
      id: 'osc',
      label: 'OSC',
      sections: [
        {
          label: 'OSCILLATOR',
          controls: [
            { type: 'select', key: 'waveform1', label: 'WAVE 1', options: [
              { value: '0', label: 'Sawtooth' }, { value: '1', label: 'Square' },
              { value: '2', label: 'Pulse' }, { value: '3', label: 'Silent' },
              { value: '4', label: 'Dbl Sine' }, { value: '5', label: 'Saw Pulse' },
              { value: '6', label: 'Resonance' }, { value: '7', label: 'Dbl Pulse' },
            ]},
            { type: 'select', key: 'waveform2', label: 'WAVE 2', options: [
              { value: '0', label: 'Sawtooth' }, { value: '1', label: 'Square' },
              { value: '2', label: 'Pulse' }, { value: '3', label: 'Silent' },
              { value: '4', label: 'Dbl Sine' }, { value: '5', label: 'Saw Pulse' },
              { value: '6', label: 'Resonance' }, { value: '7', label: 'Dbl Pulse' },
            ]},
            { type: 'select', key: 'window', label: 'WINDOW', options: [
              { value: '0', label: 'None' }, { value: '1', label: 'Saw' },
              { value: '2', label: 'Triangle' }, { value: '3', label: 'Trapezoid' },
              { value: '4', label: 'Pulse' }, { value: '5', label: 'Dbl Saw' },
            ]},
            { type: 'toggle', key: 'ring_mod', label: 'RING MOD' },
          ],
        },
      ],
    },
    {
      id: 'env',
      label: 'ENV',
      sections: [
        {
          label: 'WAVEFORM',
          controls: [
            { type: 'knob', key: 'dcw_depth', label: 'DCW DEPTH', color: '#8b5cf6', min: 0, max: 127, defaultValue: 64, formatValue: fmtInt },
            { type: 'knob', key: 'dcw_rate', label: 'DCW RATE', color: '#a78bfa', min: 0, max: 127, defaultValue: 60, formatValue: fmtInt },
          ],
        },
        {
          label: 'AMPLITUDE',
          controls: [
            { type: 'knob', key: 'dca_rate', label: 'DCA RATE', color: '#f97316', min: 0, max: 127, defaultValue: 80, formatValue: fmtInt },
          ],
        },
        {
          label: 'PITCH ENVELOPE',
          controls: [
            { type: 'knob', key: 'dco_rate', label: 'DCO RATE', color: '#22c55e', min: 0, max: 127, defaultValue: 0, formatValue: fmtInt },
            { type: 'knob', key: 'dco_depth', label: 'DCO DEPTH', color: '#4ade80', min: 0, max: 63, defaultValue: 0, formatValue: fmtInt },
          ],
        },
      ],
    },
    {
      id: 'output',
      label: 'OUTPUT',
      sections: [
        {
          label: 'OUTPUT',
          controls: [
            { type: 'knob', key: 'volume', label: 'VOLUME', color: '#f97316', min: 0, max: 1, defaultValue: 0.8, formatValue: fmtPct },
            { type: 'knob', key: 'stereo_width', label: 'STEREO', color: '#66ccff', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
          ],
        },
      ],
    },
  ],
};
