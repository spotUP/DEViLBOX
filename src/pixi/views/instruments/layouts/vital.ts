import type { SynthPanelLayout } from '../synthPanelTypes';

const fmtPct = (v: number) => `${Math.round(v * 100)}%`;

export const VITAL_LAYOUT: SynthPanelLayout = {
  name: 'Vital Wavetable',
  configKey: 'wam',
  sections: [
    {
      label: 'OSCILLATORS',
      controls: [
        { type: 'knob', key: 'parameterValues.osc_1_level', label: 'OSC 1', formatValue: fmtPct },
        { type: 'knob', key: 'parameterValues.osc_2_level', label: 'OSC 2', formatValue: fmtPct },
        { type: 'knob', key: 'parameterValues.osc_3_level', label: 'OSC 3', formatValue: fmtPct },
      ],
    },
    {
      label: 'FILTER',
      controls: [
        { type: 'knob', key: 'parameterValues.filter_1_cutoff', label: 'CUTOFF', color: '#ffcc00', formatValue: fmtPct },
        { type: 'knob', key: 'parameterValues.filter_1_resonance', label: 'RESO', color: '#ff6600', formatValue: fmtPct },
        { type: 'knob', key: 'parameterValues.filter_1_env_depth', label: 'ENV', formatValue: fmtPct },
      ],
    },
    {
      label: 'ENVELOPE',
      controls: [
        { type: 'knob', key: 'parameterValues.env_1_attack', label: 'A', formatValue: fmtPct },
        { type: 'knob', key: 'parameterValues.env_1_decay', label: 'D', formatValue: fmtPct },
        { type: 'knob', key: 'parameterValues.env_1_sustain', label: 'S', formatValue: fmtPct },
        { type: 'knob', key: 'parameterValues.env_1_release', label: 'R', formatValue: fmtPct },
      ],
    },
    {
      label: 'MODULATION',
      controls: [
        { type: 'knob', key: 'parameterValues.lfo_1_frequency', label: 'LFO RATE', formatValue: fmtPct },
        { type: 'knob', key: 'parameterValues.macro_control_1', label: 'MACRO 1', formatValue: fmtPct },
        { type: 'knob', key: 'parameterValues.macro_control_2', label: 'MACRO 2', formatValue: fmtPct },
      ],
    },
  ],
};
