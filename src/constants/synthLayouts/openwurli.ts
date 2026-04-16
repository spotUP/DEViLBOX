import type { SynthPanelLayout } from '@/types/synthPanel';

const fmtPct = (v: number) => `${Math.round(v * 100)}%`;

export const OPENWURLI_LAYOUT: SynthPanelLayout = {
  name: 'Wurlitzer 200A',
  configKey: 'openWurli',
  sections: [
    {
      label: 'AMP',
      controls: [
        { type: 'knob', key: 'volume', label: 'VOLUME', color: '#e8a75c', min: 0, max: 1, defaultValue: 0.8, formatValue: fmtPct },
      ],
    },
    {
      label: 'TREMOLO',
      controls: [
        { type: 'knob', key: 'tremoloDepth', label: 'DEPTH', color: '#cc6633', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
      ],
    },
    {
      label: 'SPEAKER',
      controls: [
        { type: 'knob', key: 'speakerCharacter', label: 'CHARACTER', color: '#996644', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
      ],
    },
    {
      label: 'OPTIONS',
      controls: [
        { type: 'toggle', key: 'mlpEnabled', label: 'MLP CORR' },
        { type: 'knob', key: 'velocityCurve', label: 'VEL CURVE', min: 0, max: 4, defaultValue: 2, formatValue: (v) => ['LIN', 'SOFT', 'MED', 'HARD', 'FIX'][Math.round(v)] || '?' },
      ],
    },
  ],
};
