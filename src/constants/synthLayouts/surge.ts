import type { SynthPanelLayout } from '@/types/synthPanel';

const fmtPct = (v: number) => `${Math.round(v * 100)}%`;
const fmtDb = (v: number) => `${Math.round(v)}dB`;

export const SURGE_LAYOUT: SynthPanelLayout = {
  name: 'Surge XT',
  configKey: 'wam',
  sections: [
    {
      label: 'AMP',
      controls: [
        { type: 'knob', key: '~volume', label: 'VOLUME', color: '#00ff99', min: -60, max: 0, defaultValue: -12, formatValue: fmtDb },
        { type: 'knob', key: '~pan', label: 'PAN', color: '#66ccff', min: -100, max: 100, defaultValue: 0, bipolar: true, formatValue: (v) => v === 0 ? 'C' : v > 0 ? `R${Math.round(v)}` : `L${Math.round(-v)}` },
      ],
    },
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
