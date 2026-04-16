import type { SynthPanelLayout } from '@/types/synthPanel';

const fmtPct = (v: number) => `${Math.round(v)}`;

const CURVE_OPTIONS = [
  { value: '0', label: '-LIN' }, { value: '1', label: '-EXP' },
  { value: '2', label: '+EXP' }, { value: '3', label: '+LIN' },
];

const LFO_WAVE_OPTIONS = [
  { value: '0', label: 'Tri' }, { value: '1', label: 'Saw Dn' },
  { value: '2', label: 'Saw Up' }, { value: '3', label: 'Square' },
  { value: '4', label: 'Sine' }, { value: '5', label: 'S&H' },
];

/** Generate operator tab sections. VCED offsets: OP6=0, OP5=21, OP4=42, OP3=63, OP2=84, OP1=105 */
function makeOperatorSections(opNum: number) {
  const base = (6 - opNum) * 21;
  return [
    {
      label: `OP${opNum} ENVELOPE`,
      controls: [
        { type: 'knob' as const, key: `vced.${base + 0}`, label: 'R1', color: '#22c55e', min: 0, max: 99, defaultValue: 99, formatValue: fmtPct },
        { type: 'knob' as const, key: `vced.${base + 1}`, label: 'R2', color: '#22c55e', min: 0, max: 99, defaultValue: 99, formatValue: fmtPct },
        { type: 'knob' as const, key: `vced.${base + 2}`, label: 'R3', color: '#22c55e', min: 0, max: 99, defaultValue: 99, formatValue: fmtPct },
        { type: 'knob' as const, key: `vced.${base + 3}`, label: 'R4', color: '#22c55e', min: 0, max: 99, defaultValue: 99, formatValue: fmtPct },
        { type: 'knob' as const, key: `vced.${base + 4}`, label: 'L1', color: '#33ccff', min: 0, max: 99, defaultValue: 99, formatValue: fmtPct },
        { type: 'knob' as const, key: `vced.${base + 5}`, label: 'L2', color: '#33ccff', min: 0, max: 99, defaultValue: 99, formatValue: fmtPct },
        { type: 'knob' as const, key: `vced.${base + 6}`, label: 'L3', color: '#33ccff', min: 0, max: 99, defaultValue: 99, formatValue: fmtPct },
        { type: 'knob' as const, key: `vced.${base + 7}`, label: 'L4', color: '#33ccff', min: 0, max: 99, defaultValue: 0, formatValue: fmtPct },
      ],
    },
    {
      label: `OP${opNum} OSCILLATOR`,
      controls: [
        { type: 'knob' as const, key: `vced.${base + 16}`, label: 'LEVEL', color: '#ff9900', min: 0, max: 99, defaultValue: opNum === 1 ? 99 : 0, formatValue: fmtPct },
        { type: 'toggle' as const, key: `vced.${base + 17}`, label: 'MODE', labels: ['RATIO', 'FIXED'] as [string, string] },
        { type: 'knob' as const, key: `vced.${base + 18}`, label: 'COARSE', color: '#ffcc00', min: 0, max: 31, defaultValue: 1, formatValue: fmtPct },
        { type: 'knob' as const, key: `vced.${base + 19}`, label: 'FINE', color: '#ffcc00', min: 0, max: 99, defaultValue: 0, formatValue: fmtPct },
        { type: 'knob' as const, key: `vced.${base + 20}`, label: 'DETUNE', color: '#cc66ff', min: 0, max: 14, defaultValue: 7, formatValue: (v: number) => `${Math.round(v) - 7}` },
      ],
    },
    {
      label: `OP${opNum} SCALING`,
      controls: [
        { type: 'knob' as const, key: `vced.${base + 8}`, label: 'BRK PT', color: '#66ccff', min: 0, max: 99, defaultValue: 39, formatValue: fmtPct },
        { type: 'knob' as const, key: `vced.${base + 9}`, label: 'L DEPTH', color: '#66ccff', min: 0, max: 99, defaultValue: 0, formatValue: fmtPct },
        { type: 'knob' as const, key: `vced.${base + 10}`, label: 'R DEPTH', color: '#66ccff', min: 0, max: 99, defaultValue: 0, formatValue: fmtPct },
        { type: 'select' as const, key: `vced.${base + 11}`, label: 'L CURVE', options: CURVE_OPTIONS },
        { type: 'select' as const, key: `vced.${base + 12}`, label: 'R CURVE', options: CURVE_OPTIONS },
        { type: 'knob' as const, key: `vced.${base + 13}`, label: 'RATE SC', color: '#9966ff', min: 0, max: 7, defaultValue: 0, formatValue: fmtPct },
        { type: 'knob' as const, key: `vced.${base + 14}`, label: 'AMP MOD', color: '#9966ff', min: 0, max: 3, defaultValue: 0, formatValue: fmtPct },
        { type: 'knob' as const, key: `vced.${base + 15}`, label: 'VEL SNS', color: '#ff3366', min: 0, max: 7, defaultValue: 0, formatValue: fmtPct },
      ],
    },
  ];
}

export const DX7_LAYOUT: SynthPanelLayout = {
  name: 'Yamaha DX7',
  configKey: 'dx7',
  tabs: [
    {
      id: 'global',
      label: 'GLOBAL',
      sections: [
        {
          label: 'ALGORITHM',
          controls: [
            { type: 'knob', key: 'vced.134', label: 'ALGO', color: '#ff9900', min: 0, max: 31, defaultValue: 0, formatValue: (v) => `${Math.round(v) + 1}` },
            { type: 'knob', key: 'vced.135', label: 'FEEDBK', color: '#ff6600', min: 0, max: 7, defaultValue: 0, formatValue: fmtPct },
            { type: 'toggle', key: 'vced.136', label: 'OSC SYNC', labels: ['OFF', 'ON'] },
            { type: 'knob', key: 'vced.144', label: 'XPOSE', color: '#66ccff', min: 0, max: 48, defaultValue: 24, formatValue: (v) => `${Math.round(v) - 24}` },
          ],
        },
        {
          label: 'LFO',
          controls: [
            { type: 'knob', key: 'vced.137', label: 'SPEED', color: '#9966ff', min: 0, max: 99, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'vced.138', label: 'DELAY', color: '#9966ff', min: 0, max: 99, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'vced.139', label: 'PMD', color: '#cc66ff', min: 0, max: 99, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'vced.140', label: 'AMD', color: '#cc66ff', min: 0, max: 99, defaultValue: 0, formatValue: fmtPct },
            { type: 'toggle', key: 'vced.141', label: 'SYNC', labels: ['OFF', 'ON'] },
            { type: 'select', key: 'vced.142', label: 'WAVE', options: LFO_WAVE_OPTIONS },
            { type: 'knob', key: 'vced.143', label: 'PMS', color: '#cc66ff', min: 0, max: 7, defaultValue: 0, formatValue: fmtPct },
          ],
        },
        {
          label: 'PITCH ENVELOPE',
          controls: [
            { type: 'knob', key: 'vced.126', label: 'R1', color: '#22c55e', min: 0, max: 99, defaultValue: 99, formatValue: fmtPct },
            { type: 'knob', key: 'vced.127', label: 'R2', color: '#22c55e', min: 0, max: 99, defaultValue: 99, formatValue: fmtPct },
            { type: 'knob', key: 'vced.128', label: 'R3', color: '#22c55e', min: 0, max: 99, defaultValue: 99, formatValue: fmtPct },
            { type: 'knob', key: 'vced.129', label: 'R4', color: '#22c55e', min: 0, max: 99, defaultValue: 99, formatValue: fmtPct },
            { type: 'knob', key: 'vced.130', label: 'L1', color: '#33ccff', min: 0, max: 99, defaultValue: 50, formatValue: fmtPct },
            { type: 'knob', key: 'vced.131', label: 'L2', color: '#33ccff', min: 0, max: 99, defaultValue: 50, formatValue: fmtPct },
            { type: 'knob', key: 'vced.132', label: 'L3', color: '#33ccff', min: 0, max: 99, defaultValue: 50, formatValue: fmtPct },
            { type: 'knob', key: 'vced.133', label: 'L4', color: '#33ccff', min: 0, max: 99, defaultValue: 50, formatValue: fmtPct },
          ],
        },
        {
          label: 'OUTPUT',
          controls: [
            { type: 'knob', key: '~volume', label: 'VOLUME', color: '#00ff99', min: -60, max: 0, defaultValue: -12, formatValue: (v) => `${Math.round(v)}dB` },
          ],
        },
      ],
    },
    { id: 'op1', label: 'OP1', sections: makeOperatorSections(1) },
    { id: 'op2', label: 'OP2', sections: makeOperatorSections(2) },
    { id: 'op3', label: 'OP3', sections: makeOperatorSections(3) },
    { id: 'op4', label: 'OP4', sections: makeOperatorSections(4) },
    { id: 'op5', label: 'OP5', sections: makeOperatorSections(5) },
    { id: 'op6', label: 'OP6', sections: makeOperatorSections(6) },
  ],
};
