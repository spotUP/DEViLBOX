import type { SynthPanelLayout } from '@/types/synthPanel';

export const SAM_LAYOUT: SynthPanelLayout = {
  name: 'SAM',
  configKey: 'sam',
  sections: [
    {
      label: 'VOICE',
      controls: [
        { type: 'knob', key: 'pitch', label: 'PITCH', color: '#66ccff', min: 0, max: 255, defaultValue: 64, formatValue: (v) => `${Math.round(v)}` },
        { type: 'knob', key: 'speed', label: 'SPEED', color: '#22c55e', min: 0, max: 255, defaultValue: 72, formatValue: (v) => `${Math.round(v)}` },
        { type: 'knob', key: 'mouth', label: 'MOUTH', color: '#ff9900', min: 0, max: 255, defaultValue: 128, formatValue: (v) => `${Math.round(v)}` },
        { type: 'knob', key: 'throat', label: 'THROAT', color: '#ff6600', min: 0, max: 255, defaultValue: 128, formatValue: (v) => `${Math.round(v)}` },
      ],
    },
    {
      label: 'MODE',
      controls: [
        { type: 'toggle', key: 'singmode', label: 'SING', labels: ['SPEAK', 'SING'] },
        { type: 'toggle', key: 'phonetic', label: 'INPUT', labels: ['TEXT', 'PHON'] },
      ],
    },
  ],
};
