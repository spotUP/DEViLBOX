import type { SynthPanelLayout } from '@/types/synthPanel';

const fmtPct = (v: number) => `${Math.round(v * 100)}%`;

const SOUND_OPTIONS = [
  { value: '0', label: 'Piano' }, { value: '0.1', label: 'Fantasy' },
  { value: '0.2', label: 'Violin' }, { value: '0.3', label: 'Flute' },
  { value: '0.4', label: 'Guitar 1' }, { value: '0.5', label: 'Guitar 2' },
  { value: '0.6', label: 'English Horn' }, { value: '0.7', label: 'Cello' },
  { value: '0.8', label: 'Trumpet' }, { value: '0.9', label: 'Clarinet' },
];
const RHYTHM_OPTIONS = [
  { value: '0', label: 'Off' }, { value: '0.1', label: 'March' },
  { value: '0.2', label: 'Waltz' }, { value: '0.3', label: '4 Beat' },
  { value: '0.4', label: 'Swing' }, { value: '0.5', label: 'Rock 1' },
  { value: '0.6', label: 'Rock 2' }, { value: '0.7', label: 'Bossanova' },
  { value: '0.8', label: 'Samba' }, { value: '0.9', label: 'Rhumba' },
];
const OCTAVE_OPTIONS = [
  { value: '0', label: 'Low' }, { value: '0.5', label: 'Mid' }, { value: '1', label: 'High' },
];

export const VL1_LAYOUT: SynthPanelLayout = {
  name: 'VL-1',
  configKey: 'vl1',
  sections: [
    {
      label: 'SOUND',
      controls: [
        { type: 'select', key: 'sound', label: 'SOUND', options: SOUND_OPTIONS },
        { type: 'select', key: 'octave', label: 'OCTAVE', options: OCTAVE_OPTIONS },
        { type: 'knob', key: 'volume', label: 'VOLUME', color: '#00ff99', min: 0, max: 1, defaultValue: 0.7, formatValue: fmtPct },
        { type: 'knob', key: 'balance', label: 'BALANCE', color: '#66ccff', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
        { type: 'knob', key: 'tune', label: 'TUNE', color: '#ffcc00', min: 0.5, max: 1.5, defaultValue: 1, formatValue: (v) => `${v.toFixed(2)}x` },
      ],
    },
    {
      label: 'ENVELOPE',
      controls: [
        { type: 'knob', key: 'attack', label: 'ATK', color: '#22c55e', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
        { type: 'knob', key: 'decay', label: 'DEC', color: '#22c55e', min: 0, max: 1, defaultValue: 0.4, formatValue: fmtPct },
        { type: 'knob', key: 'sustainLevel', label: 'SUS LVL', color: '#22c55e', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
        { type: 'knob', key: 'sustainTime', label: 'SUS TIME', color: '#22c55e', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
        { type: 'knob', key: 'release', label: 'REL', color: '#22c55e', min: 0, max: 1, defaultValue: 0.2, formatValue: fmtPct },
      ],
    },
    {
      label: 'MODULATION',
      controls: [
        { type: 'knob', key: 'vibrato', label: 'VIBRATO', color: '#9966ff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
        { type: 'knob', key: 'tremolo', label: 'TREMOLO', color: '#cc66ff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
      ],
    },
    {
      label: 'RHYTHM',
      controls: [
        { type: 'toggle', key: 'rhythmOn', label: 'RHYTHM', labels: ['OFF', 'ON'] },
        { type: 'select', key: 'rhythm', label: 'PATTERN', options: RHYTHM_OPTIONS },
        { type: 'knob', key: 'tempo', label: 'TEMPO', color: '#ff9900', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
      ],
    },
  ],
};
