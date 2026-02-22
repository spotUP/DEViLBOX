import type { SynthPanelLayout } from '../synthPanelTypes';

const fmtPct = (v: number) => `${Math.round(v * 100)}%`;

export const SURGE_LAYOUT: SynthPanelLayout = {
  name: 'Surge XT',
  configKey: 'wam',
  sections: [
    {
      label: 'OSCILLATOR',
      controls: [
        { type: 'knob', key: 'parameterValues.osc1_level', label: 'OSC 1', formatValue: fmtPct },
        { type: 'knob', key: 'parameterValues.osc2_level', label: 'OSC 2', formatValue: fmtPct },
        { type: 'knob', key: 'parameterValues.osc3_level', label: 'OSC 3', formatValue: fmtPct },
      ],
    },
    {
      label: 'FILTER',
      controls: [
        { type: 'knob', key: 'parameterValues.filter1_cutoff', label: 'CUTOFF', color: '#ffcc00', formatValue: fmtPct },
        { type: 'knob', key: 'parameterValues.filter1_resonance', label: 'RESO', color: '#ff6600', formatValue: fmtPct },
        { type: 'knob', key: 'parameterValues.filter1_envmod', label: 'ENV MOD', formatValue: fmtPct },
      ],
    },
    {
      label: 'ENVELOPE',
      controls: [
        { type: 'knob', key: 'parameterValues.env1_attack', label: 'A', formatValue: fmtPct },
        { type: 'knob', key: 'parameterValues.env1_decay', label: 'D', formatValue: fmtPct },
        { type: 'knob', key: 'parameterValues.env1_sustain', label: 'S', formatValue: fmtPct },
        { type: 'knob', key: 'parameterValues.env1_release', label: 'R', formatValue: fmtPct },
      ],
    },
  ],
};
