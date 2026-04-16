import type { SynthPanelLayout } from '@/types/synthPanel';

const fmtPct = (v: number) => `${Math.round(v * 100)}%`;

/**
 * D-50 layout for Pixi synth panel.
 * Roland D-50 Linear Arithmetic Synthesizer (1987).
 * Parameters match D50Hardware.tsx DOM component.
 */
export const D50_LAYOUT: SynthPanelLayout = {
  name: 'D-50',
  configKey: 'parameters',
  tabs: [
    {
      id: 'tone',
      label: 'TONE',
      sections: [
        {
          label: 'UPPER',
          controls: [
            { type: 'knob', key: 'upper_level', label: 'LEVEL', color: '#60a5fa', min: 0, max: 1, defaultValue: 0.8, formatValue: fmtPct },
            { type: 'knob', key: 'upper_detune', label: 'DETUNE', color: '#93c5fd', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
          ],
        },
        {
          label: 'LOWER',
          controls: [
            { type: 'knob', key: 'lower_level', label: 'LEVEL', color: '#f97316', min: 0, max: 1, defaultValue: 0.8, formatValue: fmtPct },
            { type: 'knob', key: 'lower_detune', label: 'DETUNE', color: '#fb923c', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
          ],
        },
        {
          label: 'FILTER',
          controls: [
            { type: 'knob', key: 'cutoff', label: 'CUTOFF', color: '#22c55e', min: 0, max: 1, defaultValue: 0.7, formatValue: fmtPct },
            { type: 'knob', key: 'resonance', label: 'RESO', color: '#4ade80', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
          ],
        },
      ],
    },
    {
      id: 'fx',
      label: 'FX',
      sections: [
        {
          label: 'EFFECTS',
          controls: [
            { type: 'knob', key: 'chorus', label: 'CHORUS', color: '#a78bfa', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
            { type: 'knob', key: 'reverb', label: 'REVERB', color: '#c084fc', min: 0, max: 1, defaultValue: 0.4, formatValue: fmtPct },
          ],
        },
        {
          label: 'MASTER',
          controls: [
            { type: 'knob', key: 'volume', label: 'VOLUME', color: '#f97316', min: 0, max: 1, defaultValue: 0.8, formatValue: fmtPct },
          ],
        },
      ],
    },
  ],
};
