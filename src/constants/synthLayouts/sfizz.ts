import type { SynthPanelLayout } from '@/types/synthPanel';

const fmtPct = (v: number) => `${Math.round(v * 100)}%`;

export const SFIZZ_LAYOUT: SynthPanelLayout = {
  name: 'Sfizz',
  configKey: 'sfizz',
  sections: [
    {
      label: 'MASTER',
      controls: [
        { type: 'knob', key: 'volume', label: 'VOLUME', color: '#00ff99', min: 0, max: 1, defaultValue: 0.8, formatValue: fmtPct },
        { type: 'knob', key: 'pan', label: 'PAN', color: '#66ccff', min: -1, max: 1, defaultValue: 0, bipolar: true, formatValue: (v) => v === 0 ? 'C' : v > 0 ? `R${Math.round(v * 100)}` : `L${Math.round(-v * 100)}` },
        { type: 'knob', key: 'polyphony', label: 'POLY', color: '#66ccff', min: 1, max: 256, defaultValue: 64, formatValue: (v) => `${Math.round(v)}` },
        { type: 'knob', key: 'transpose', label: 'XPOSE', color: '#ffcc00', min: -24, max: 24, defaultValue: 0, bipolar: true, formatValue: (v) => `${Math.round(v)} st` },
      ],
    },
    {
      label: 'PERFORMANCE',
      controls: [
        { type: 'knob', key: 'expression', label: 'EXPR', color: '#ff9900', min: 0, max: 1, defaultValue: 1, formatValue: fmtPct },
        { type: 'knob', key: 'modWheel', label: 'MOD', color: '#9966ff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
        { type: 'knob', key: 'pitchBend', label: 'BEND', color: '#cc66ff', min: -1, max: 1, defaultValue: 0, bipolar: true, formatValue: (v) => `${Math.round(v * 100)}%` },
        { type: 'toggle', key: 'sustainPedal', label: 'SUSTAIN', labels: ['OFF', 'ON'] },
      ],
    },
    {
      label: 'SENDS',
      controls: [
        { type: 'knob', key: 'reverbSend', label: 'REVERB', color: '#cc66ff', min: 0, max: 1, defaultValue: 0.2, formatValue: fmtPct },
        { type: 'knob', key: 'chorusSend', label: 'CHORUS', color: '#33ccff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
      ],
    },
    {
      label: 'SAMPLE',
      controls: [
        { type: 'select', key: 'oversampling', label: 'OVERSAMP', options: [
          { value: '0', label: '1x' }, { value: '1', label: '2x' },
          { value: '2', label: '4x' }, { value: '3', label: '8x' },
        ]},
        { type: 'knob', key: 'preloadSize', label: 'PRELOAD', color: '#ff9900', min: 1024, max: 65536, defaultValue: 8192, formatValue: (v) => `${Math.round(v / 1024)}K` },
      ],
    },
  ],
};
