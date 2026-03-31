import type { SynthPanelLayout } from '../synthPanelTypes';

const fmtPct = (v: number) => `${Math.round(v * 100)}%`;

export const DX7_LAYOUT: SynthPanelLayout = {
  name: 'Yamaha DX7',
  configKey: 'dx7',
  sections: [
    {
      label: 'VOICE',
      controls: [
        { type: 'knob', key: 'bank', label: 'BANK', color: '#33ccff', min: 0, max: 7, defaultValue: 0, formatValue: (v) => `${Math.round(v) + 1}` },
        { type: 'knob', key: 'program', label: 'PROGRAM', color: '#33ccff', min: 0, max: 31, defaultValue: 0, formatValue: (v) => `${Math.round(v) + 1}` },
      ],
    },
    {
      label: 'PERFORMANCE',
      controls: [
        { type: 'knob', key: 'volume', label: 'VOLUME', color: '#66ff99', min: 0, max: 2, defaultValue: 1, formatValue: fmtPct },
      ],
    },
  ],
};
