import type { SynthPanelLayout } from '@/types/synthPanel';

const WAVEFORM_NAMES = ['Sine', 'Half-S', 'Abs-S', 'Pulse', 'Sine2x', 'Abs2x', 'Square', 'DSaw'];
const fmtWF = (v: number) => WAVEFORM_NAMES[Math.round(v)] || '?';

export const OPL3_LAYOUT: SynthPanelLayout = {
  name: 'OPL3 FM Synth',
  configKey: 'opl3',
  tabs: [
    {
      id: 'op1',
      label: 'OP1 MOD',
      sections: [
        {
          label: 'ENVELOPE',
          columns: 4,
          controls: [
            { type: 'knob', key: 'op1Attack', label: 'ATTACK', color: '#33ccff', min: 0, max: 15, defaultValue: 1, formatValue: (v) => `${Math.round(v)}` },
            { type: 'knob', key: 'op1Decay', label: 'DECAY', color: '#33ccff', min: 0, max: 15, defaultValue: 4, formatValue: (v) => `${Math.round(v)}` },
            { type: 'knob', key: 'op1Sustain', label: 'SUSTAIN', color: '#33ccff', min: 0, max: 15, defaultValue: 2, formatValue: (v) => `${Math.round(v)}` },
            { type: 'knob', key: 'op1Release', label: 'RELEASE', color: '#33ccff', min: 0, max: 15, defaultValue: 5, formatValue: (v) => `${Math.round(v)}` },
          ],
        },
        {
          label: 'OSCILLATOR',
          columns: 3,
          controls: [
            { type: 'knob', key: 'op1Level', label: 'LEVEL', color: '#66ff99', min: 0, max: 63, defaultValue: 32, formatValue: (v) => `${Math.round(v)}` },
            { type: 'knob', key: 'op1Multi', label: 'MULTI', color: '#ffcc33', min: 0, max: 15, defaultValue: 1, formatValue: (v) => `${Math.round(v)}` },
            { type: 'knob', key: 'op1Waveform', label: 'WAVE', color: '#ff66cc', min: 0, max: 7, defaultValue: 0, formatValue: fmtWF },
          ],
        },
        {
          label: 'FLAGS',
          controls: [
            { type: 'toggle', key: 'op1Tremolo', label: 'TREM' },
            { type: 'toggle', key: 'op1Vibrato', label: 'VIB' },
            { type: 'toggle', key: 'op1SustainHold', label: 'HOLD' },
            { type: 'toggle', key: 'op1KSR', label: 'KSR' },
            { type: 'knob', key: 'op1KSL', label: 'KSL', min: 0, max: 3, defaultValue: 0, formatValue: (v) => `${Math.round(v)}` },
          ],
        },
      ],
    },
    {
      id: 'op2',
      label: 'OP2 CAR',
      sections: [
        {
          label: 'ENVELOPE',
          columns: 4,
          controls: [
            { type: 'knob', key: 'op2Attack', label: 'ATTACK', color: '#ff6633', min: 0, max: 15, defaultValue: 1, formatValue: (v) => `${Math.round(v)}` },
            { type: 'knob', key: 'op2Decay', label: 'DECAY', color: '#ff6633', min: 0, max: 15, defaultValue: 4, formatValue: (v) => `${Math.round(v)}` },
            { type: 'knob', key: 'op2Sustain', label: 'SUSTAIN', color: '#ff6633', min: 0, max: 15, defaultValue: 2, formatValue: (v) => `${Math.round(v)}` },
            { type: 'knob', key: 'op2Release', label: 'RELEASE', color: '#ff6633', min: 0, max: 15, defaultValue: 5, formatValue: (v) => `${Math.round(v)}` },
          ],
        },
        {
          label: 'OSCILLATOR',
          columns: 3,
          controls: [
            { type: 'knob', key: 'op2Level', label: 'LEVEL', color: '#66ff99', min: 0, max: 63, defaultValue: 0, formatValue: (v) => `${Math.round(v)}` },
            { type: 'knob', key: 'op2Multi', label: 'MULTI', color: '#ffcc33', min: 0, max: 15, defaultValue: 1, formatValue: (v) => `${Math.round(v)}` },
            { type: 'knob', key: 'op2Waveform', label: 'WAVE', color: '#ff66cc', min: 0, max: 7, defaultValue: 0, formatValue: fmtWF },
          ],
        },
        {
          label: 'FLAGS',
          controls: [
            { type: 'toggle', key: 'op2Tremolo', label: 'TREM' },
            { type: 'toggle', key: 'op2Vibrato', label: 'VIB' },
            { type: 'toggle', key: 'op2SustainHold', label: 'HOLD' },
            { type: 'toggle', key: 'op2KSR', label: 'KSR' },
            { type: 'knob', key: 'op2KSL', label: 'KSL', min: 0, max: 3, defaultValue: 0, formatValue: (v) => `${Math.round(v)}` },
          ],
        },
      ],
    },
    {
      id: 'global',
      label: 'GLOBAL',
      sections: [
        {
          label: 'ALGORITHM',
          controls: [
            { type: 'knob', key: 'feedback', label: 'FEEDBACK', color: '#cc66ff', min: 0, max: 7, defaultValue: 0, formatValue: (v) => `${Math.round(v)}` },
            { type: 'toggle', key: 'connection', label: 'ADDITIVE' },
          ],
        },
      ],
    },
  ],
};
