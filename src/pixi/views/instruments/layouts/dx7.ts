import type { SynthPanelLayout } from '../synthPanelTypes';

const fmtPct = (v: number) => `${Math.round(v * 100)}%`;

export const DX7_LAYOUT: SynthPanelLayout = {
  name: 'Yamaha DX7',
  configKey: 'dx7',
  sections: [
    {
      label: 'PATCH',
      controls: [
        { type: 'knob', key: 'bank', label: 'BANK', color: '#33ccff', min: 0, max: 34, defaultValue: 0, formatValue: (v) => `${Math.round(v) + 1}` },
        { type: 'knob', key: 'program', label: 'VOICE', color: '#ff9933', min: 0, max: 31, defaultValue: 0, formatValue: (v) => `${Math.round(v) + 1}` },
      ],
    },
    {
      label: 'OUTPUT',
      controls: [
        { type: 'knob', key: 'volume', label: 'VOLUME', color: '#66ff99', min: 0, max: 2, defaultValue: 1, formatValue: fmtPct },
      ],
    },
  ],
};
