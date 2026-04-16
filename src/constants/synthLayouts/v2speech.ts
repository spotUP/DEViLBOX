import type { SynthPanelLayout } from '@/types/synthPanel';

export const V2SPEECH_LAYOUT: SynthPanelLayout = {
  name: 'V2 Speech',
  configKey: 'v2Speech',
  sections: [
    {
      label: 'VOICE',
      controls: [
        { type: 'knob', key: 'speed', label: 'SPEED', color: '#22c55e', min: 0, max: 127, defaultValue: 64, formatValue: (v) => `${Math.round(v)}` },
        { type: 'knob', key: 'pitch', label: 'PITCH', color: '#66ccff', min: 0, max: 127, defaultValue: 64, formatValue: (v) => `${Math.round(v)}` },
        { type: 'knob', key: 'formantShift', label: 'FORMANT', color: '#ff9900', min: 0, max: 127, defaultValue: 64, formatValue: (v) => v < 50 ? 'Male' : v > 78 ? 'Female' : 'Neutral' },
      ],
    },
    {
      label: 'MODE',
      controls: [
        { type: 'toggle', key: 'singMode', label: 'SING', labels: ['SPEAK', 'SING'] },
        { type: 'toggle', key: 'vowelLoopSingle', label: 'LOOP', labels: ['SEQ', 'HOLD'] },
      ],
    },
  ],
};
