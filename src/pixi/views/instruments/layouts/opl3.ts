import type { SynthPanelLayout } from '../synthPanelTypes';

export const OPL3_LAYOUT: SynthPanelLayout = {
  name: 'OPL3 FM Synth',
  configKey: 'opl3',
  sections: [
    {
      label: 'OPERATOR 1 (MODULATOR)',
      columns: 3,
      controls: [
        { type: 'knob', key: 'op1Attack', label: 'ATTACK', color: '#33ccff', min: 0, max: 15, defaultValue: 1, formatValue: (v) => `${Math.round(v)}` },
        { type: 'knob', key: 'op1Decay', label: 'DECAY', color: '#33ccff', min: 0, max: 15, defaultValue: 4, formatValue: (v) => `${Math.round(v)}` },
        { type: 'knob', key: 'op1Sustain', label: 'SUSTAIN', color: '#33ccff', min: 0, max: 15, defaultValue: 2, formatValue: (v) => `${Math.round(v)}` },
        { type: 'knob', key: 'op1Release', label: 'RELEASE', color: '#33ccff', min: 0, max: 15, defaultValue: 5, formatValue: (v) => `${Math.round(v)}` },
        { type: 'knob', key: 'op1Level', label: 'LEVEL', color: '#66ff99', min: 0, max: 63, defaultValue: 32, formatValue: (v) => `${Math.round(v)}` },
        { type: 'knob', key: 'op1Multi', label: 'MULTI', color: '#ffcc33', min: 0, max: 15, defaultValue: 1, formatValue: (v) => `${Math.round(v)}` },
      ],
    },
    {
      label: 'OPERATOR 2 (CARRIER)',
      columns: 3,
      controls: [
        { type: 'knob', key: 'op2Attack', label: 'ATTACK', color: '#ff6633', min: 0, max: 15, defaultValue: 1, formatValue: (v) => `${Math.round(v)}` },
        { type: 'knob', key: 'op2Decay', label: 'DECAY', color: '#ff6633', min: 0, max: 15, defaultValue: 4, formatValue: (v) => `${Math.round(v)}` },
        { type: 'knob', key: 'op2Sustain', label: 'SUSTAIN', color: '#ff6633', min: 0, max: 15, defaultValue: 2, formatValue: (v) => `${Math.round(v)}` },
        { type: 'knob', key: 'op2Release', label: 'RELEASE', color: '#ff6633', min: 0, max: 15, defaultValue: 5, formatValue: (v) => `${Math.round(v)}` },
        { type: 'knob', key: 'op2Level', label: 'LEVEL', color: '#66ff99', min: 0, max: 63, defaultValue: 0, formatValue: (v) => `${Math.round(v)}` },
        { type: 'knob', key: 'op2Multi', label: 'MULTI', color: '#ffcc33', min: 0, max: 15, defaultValue: 1, formatValue: (v) => `${Math.round(v)}` },
      ],
    },
    {
      label: 'GLOBAL',
      controls: [
        { type: 'knob', key: 'feedback', label: 'FEEDBACK', color: '#cc66ff', min: 0, max: 7, defaultValue: 0, formatValue: (v) => `${Math.round(v)}` },
        { type: 'toggle', key: 'connection', label: 'ADDITIVE' },
      ],
    },
  ],
};
