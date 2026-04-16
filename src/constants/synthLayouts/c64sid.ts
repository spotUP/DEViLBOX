import type { SynthPanelLayout } from '@/types/synthPanel';

export const C64SID_LAYOUT: SynthPanelLayout = {
  name: 'C64 SID',
  configKey: '',
  sections: [
    {
      label: 'PLAYBACK',
      controls: [
        { type: 'knob', key: '~volume', label: 'VOLUME', color: '#00ff99', min: -60, max: 0, defaultValue: -12, formatValue: (v) => `${Math.round(v)}dB` },
        { type: 'knob', key: 'playbackRate', label: 'SPEED', color: '#66ccff', min: 0.25, max: 4, defaultValue: 1, formatValue: (v) => `${v.toFixed(2)}x` },
      ],
    },
  ],
};
