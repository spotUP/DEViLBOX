import type { SynthPanelLayout } from '@/types/synthPanel';

const fmtPct = (v: number) => `${Math.round(v * 100)}%`;

export const DECTALK_LAYOUT: SynthPanelLayout = {
  name: 'DECtalk',
  configKey: 'dectalk',
  sections: [
    {
      label: 'VOICE',
      controls: [
        { type: 'select', key: 'voice', label: 'VOICE', options: [
          { value: '0', label: 'Paul' }, { value: '1', label: 'Betty' },
          { value: '2', label: 'Harry' }, { value: '3', label: 'Frank' },
          { value: '4', label: 'Dennis' }, { value: '5', label: 'Kit' },
          { value: '6', label: 'Ursula' }, { value: '7', label: 'Rita' },
          { value: '8', label: 'Wendy' },
        ]},
        { type: 'knob', key: 'rate', label: 'RATE', color: '#22c55e', min: 75, max: 600, defaultValue: 200, formatValue: (v) => `${Math.round(v)} wpm` },
        { type: 'knob', key: 'pitch', label: 'PITCH', color: '#66ccff', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
        { type: 'knob', key: 'volume', label: 'VOLUME', color: '#00ff99', min: 0, max: 1, defaultValue: 0.8, formatValue: fmtPct },
      ],
    },
  ],
};
