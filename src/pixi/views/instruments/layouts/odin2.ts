import type { SynthPanelLayout } from '../synthPanelTypes';

const fmtPct = (v: number) => `${Math.round(v * 100)}%`;

export const ODIN2_LAYOUT: SynthPanelLayout = {
  name: 'Odin2 Hybrid',
  configKey: 'wam',
  sections: [
    {
      label: 'OSCILLATORS',
      controls: [
        { type: 'knob', key: 'parameterValues.osc1_vol', label: 'OSC 1', formatValue: fmtPct },
        { type: 'knob', key: 'parameterValues.osc2_vol', label: 'OSC 2', formatValue: fmtPct },
        { type: 'knob', key: 'parameterValues.osc3_vol', label: 'OSC 3', formatValue: fmtPct },
      ],
    },
    {
      label: 'FILTER',
      controls: [
        { type: 'knob', key: 'parameterValues.fil1_freq', label: 'CUTOFF', color: '#ffcc00', formatValue: fmtPct },
        { type: 'knob', key: 'parameterValues.fil1_res', label: 'RESO', color: '#ff6600', formatValue: fmtPct },
        { type: 'knob', key: 'parameterValues.fil1_env', label: 'ENV AMT', formatValue: fmtPct },
      ],
    },
    {
      label: 'ENVELOPE',
      controls: [
        { type: 'knob', key: 'parameterValues.amp_attack', label: 'A', formatValue: fmtPct },
        { type: 'knob', key: 'parameterValues.amp_decay', label: 'D', formatValue: fmtPct },
        { type: 'knob', key: 'parameterValues.amp_sustain', label: 'S', formatValue: fmtPct },
        { type: 'knob', key: 'parameterValues.amp_release', label: 'R', formatValue: fmtPct },
      ],
    },
  ],
};
