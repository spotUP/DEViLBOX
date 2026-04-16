import type { SynthPanelLayout } from '@/types/synthPanel';

const fmtHz = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)} Hz`;
const fmtMs = (v: number) => `${Math.round(v)}ms`;
const fmtPct = (v: number) => `${Math.round(v * 100)}%`;

const WAVE_OPTIONS = [
  { value: '0', label: 'Saw' }, { value: '1', label: 'Tri' },
  { value: '2', label: 'Square' }, { value: '3', label: 'Pulse' }, { value: '4', label: 'Off' },
];
const RANGE_OPTIONS = [
  { value: '1', label: "32'" }, { value: '2', label: "16'" }, { value: '3', label: "8'" },
  { value: '4', label: "4'" }, { value: '5', label: "2'" }, { value: '6', label: "1'" },
];

export const RAFFO_LAYOUT: SynthPanelLayout = {
  name: 'Raffo Minimoog',
  configKey: 'raffo',
  sections: [
    {
      label: 'OSCILLATOR 1',
      controls: [
        { type: 'toggle', key: 'oscButton0', label: 'ON', labels: ['OFF', 'ON'] },
        { type: 'select', key: 'wave0', label: 'WAVE', options: WAVE_OPTIONS },
        { type: 'select', key: 'range0', label: 'RANGE', options: RANGE_OPTIONS },
        { type: 'knob', key: 'vol0', label: 'VOL', color: '#ff9900', min: 0, max: 10, defaultValue: 7, formatValue: (v) => `${Math.round(v)}` },
        { type: 'knob', key: 'tuning0', label: 'TUNE', color: '#ffcc00', min: -12, max: 12, defaultValue: 0, bipolar: true, formatValue: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} st` },
      ],
    },
    {
      label: 'OSCILLATOR 2',
      controls: [
        { type: 'toggle', key: 'oscButton1', label: 'ON', labels: ['OFF', 'ON'] },
        { type: 'select', key: 'wave1', label: 'WAVE', options: WAVE_OPTIONS },
        { type: 'select', key: 'range1', label: 'RANGE', options: RANGE_OPTIONS },
        { type: 'knob', key: 'vol1', label: 'VOL', color: '#ff9900', min: 0, max: 10, defaultValue: 5, formatValue: (v) => `${Math.round(v)}` },
        { type: 'knob', key: 'tuning1', label: 'TUNE', color: '#ffcc00', min: -12, max: 12, defaultValue: -0.02, bipolar: true, formatValue: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} st` },
      ],
    },
    {
      label: 'OSCILLATOR 3',
      controls: [
        { type: 'toggle', key: 'oscButton2', label: 'ON', labels: ['OFF', 'ON'] },
        { type: 'select', key: 'wave2', label: 'WAVE', options: WAVE_OPTIONS },
        { type: 'select', key: 'range2', label: 'RANGE', options: RANGE_OPTIONS },
        { type: 'knob', key: 'vol2', label: 'VOL', color: '#ff9900', min: 0, max: 10, defaultValue: 4, formatValue: (v) => `${Math.round(v)}` },
        { type: 'knob', key: 'tuning2', label: 'TUNE', color: '#ffcc00', min: -12, max: 12, defaultValue: 0.02, bipolar: true, formatValue: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} st` },
      ],
    },
    {
      label: 'OSCILLATOR 4',
      controls: [
        { type: 'toggle', key: 'oscButton3', label: 'ON', labels: ['OFF', 'ON'] },
        { type: 'select', key: 'wave3', label: 'WAVE', options: WAVE_OPTIONS },
        { type: 'select', key: 'range3', label: 'RANGE', options: RANGE_OPTIONS },
        { type: 'knob', key: 'vol3', label: 'VOL', color: '#ff9900', min: 0, max: 10, defaultValue: 7, formatValue: (v) => `${Math.round(v)}` },
        { type: 'knob', key: 'tuning3', label: 'TUNE', color: '#ffcc00', min: -12, max: 12, defaultValue: 0, bipolar: true, formatValue: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} st` },
      ],
    },
    {
      label: 'FILTER',
      controls: [
        { type: 'knob', key: 'filterCutoff', label: 'CUTOFF', color: '#ffcc00', min: 500, max: 10000, defaultValue: 3000, formatValue: fmtHz },
        { type: 'knob', key: 'filterResonance', label: 'RESO', color: '#ff6600', min: 0, max: 10, defaultValue: 3, formatValue: (v) => `${Math.round(v)}` },
      ],
    },
    {
      label: 'FILTER ENVELOPE',
      controls: [
        { type: 'knob', key: 'filterAttack', label: 'ATK', color: '#22c55e', min: 0, max: 1000, defaultValue: 200, formatValue: fmtMs },
        { type: 'knob', key: 'filterDecay', label: 'DEC', color: '#22c55e', min: 0, max: 1000, defaultValue: 400, formatValue: fmtMs },
        { type: 'knob', key: 'filterSustain', label: 'SUS', color: '#22c55e', min: 0, max: 1, defaultValue: 0.7, formatValue: fmtPct },
        { type: 'knob', key: 'filterRelease', label: 'REL', color: '#22c55e', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
      ],
    },
    {
      label: 'AMP ENVELOPE',
      controls: [
        { type: 'knob', key: 'attack', label: 'ATK', color: '#ff3366', min: 10, max: 1000, defaultValue: 10, formatValue: fmtMs },
        { type: 'knob', key: 'decay', label: 'DEC', color: '#ff3366', min: 0, max: 1000, defaultValue: 200, formatValue: fmtMs },
        { type: 'knob', key: 'sustain', label: 'SUS', color: '#ff3366', min: 0, max: 1, defaultValue: 0.8, formatValue: fmtPct },
        { type: 'knob', key: 'release', label: 'REL', color: '#ff3366', min: 0, max: 1, defaultValue: 0.4, formatValue: fmtPct },
      ],
    },
    {
      label: 'MASTER',
      controls: [
        { type: 'knob', key: 'volume', label: 'VOLUME', color: '#00ff99', min: 0, max: 10, defaultValue: 7, formatValue: (v) => `${Math.round(v)}` },
        { type: 'knob', key: 'glide', label: 'GLIDE', color: '#33ccff', min: 0, max: 10, defaultValue: 1, formatValue: (v) => `${Math.round(v)}` },
      ],
    },
  ],
};
