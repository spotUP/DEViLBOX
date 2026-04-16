import type { SynthPanelLayout } from '@/types/synthPanel';

const fmtPct = (v: number) => `${Math.round(v * 100)}%`;

export const MDA_DX10_LAYOUT: SynthPanelLayout = {
  name: 'MDA DX10',
  configKey: 'mdaDX10',
  sections: [
    {
      label: 'CARRIER ENVELOPE',
      controls: [
        { type: 'knob', key: 'attack', label: 'ATK', color: '#22c55e', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
        { type: 'knob', key: 'decay', label: 'DEC', color: '#22c55e', min: 0, max: 1, defaultValue: 0.65, formatValue: fmtPct },
        { type: 'knob', key: 'release', label: 'REL', color: '#22c55e', min: 0, max: 1, defaultValue: 0.441, formatValue: fmtPct },
      ],
    },
    {
      label: 'PITCH & TONE',
      controls: [
        { type: 'knob', key: 'octave', label: 'OCTAVE', color: '#66ccff', min: 0, max: 1, defaultValue: 0.5, bipolar: true, formatValue: (v) => `${Math.round((v - 0.5) * 4)}` },
        { type: 'knob', key: 'fineTune', label: 'FINE', color: '#66ccff', min: 0, max: 1, defaultValue: 0.5, bipolar: true, formatValue: (v) => `${Math.round((v - 0.5) * 200)} ct` },
        { type: 'knob', key: 'waveform', label: 'WAVE', color: '#ff9900', min: 0, max: 1, defaultValue: 0.447, formatValue: fmtPct },
      ],
    },
    {
      label: 'MODULATOR',
      controls: [
        { type: 'knob', key: 'coarse', label: 'COARSE', color: '#ff6600', min: 0, max: 1, defaultValue: 0.842, formatValue: (v) => `${Math.round(v * 32)}` },
        { type: 'knob', key: 'fine', label: 'FINE', color: '#ff9900', min: 0, max: 1, defaultValue: 0.329, formatValue: fmtPct },
        { type: 'knob', key: 'modInit', label: 'INIT', color: '#ff3366', min: 0, max: 1, defaultValue: 0.23, formatValue: fmtPct },
        { type: 'knob', key: 'modThru', label: 'THRU', color: '#ff3366', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
      ],
    },
    {
      label: 'MOD ENVELOPE',
      controls: [
        { type: 'knob', key: 'modDec', label: 'DEC', color: '#cc66ff', min: 0, max: 1, defaultValue: 0.8, formatValue: fmtPct },
        { type: 'knob', key: 'modSus', label: 'SUS', color: '#cc66ff', min: 0, max: 1, defaultValue: 0.05, formatValue: fmtPct },
        { type: 'knob', key: 'modRel', label: 'REL', color: '#cc66ff', min: 0, max: 1, defaultValue: 0.8, formatValue: fmtPct },
        { type: 'knob', key: 'modVel', label: 'VEL', color: '#66ccff', min: 0, max: 1, defaultValue: 0.9, formatValue: fmtPct },
      ],
    },
    {
      label: 'LFO',
      controls: [
        { type: 'knob', key: 'vibrato', label: 'VIBRATO', color: '#9966ff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
        { type: 'knob', key: 'lfoRate', label: 'LFO RATE', color: '#9966ff', min: 0, max: 1, defaultValue: 0.414, formatValue: fmtPct },
      ],
    },
  ],
};
