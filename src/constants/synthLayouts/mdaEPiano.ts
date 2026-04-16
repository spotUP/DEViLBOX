import type { SynthPanelLayout } from '@/types/synthPanel';

const fmtPct = (v: number) => `${Math.round(v * 100)}%`;
const fmtBipolarPct = (v: number) => `${Math.round(v * 100 - 50)}%`;

export const MDA_EPIANO_LAYOUT: SynthPanelLayout = {
  name: 'MDA E-Piano',
  configKey: 'mdaEPiano',
  sections: [
    {
      label: 'ENVELOPE',
      controls: [
        { type: 'knob', key: 'envelopeDecay', label: 'DECAY', color: '#22c55e', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
        { type: 'knob', key: 'envelopeRelease', label: 'RELEASE', color: '#22c55e', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
      ],
    },
    {
      label: 'TONE',
      controls: [
        { type: 'knob', key: 'hardness', label: 'HARDNESS', color: '#ff9900', min: 0, max: 1, defaultValue: 0.5, bipolar: true, formatValue: fmtBipolarPct },
        { type: 'knob', key: 'trebleBoost', label: 'TREBLE', color: '#ffcc00', min: 0, max: 1, defaultValue: 0.5, bipolar: true, formatValue: fmtBipolarPct },
        { type: 'knob', key: 'overdrive', label: 'OVERDRIVE', color: '#ff3366', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
      ],
    },
    {
      label: 'MODULATION',
      controls: [
        { type: 'knob', key: 'modulation', label: 'MOD', color: '#cc66ff', min: 0, max: 1, defaultValue: 0.5, formatValue: (v) => v > 0.5 ? `Trem ${Math.round((v - 0.5) * 200)}%` : `Pan ${Math.round((0.5 - v) * 200)}%` },
        { type: 'knob', key: 'lfoRate', label: 'LFO RATE', color: '#9966ff', min: 0, max: 1, defaultValue: 0.65, formatValue: (v) => `${Math.exp(6.22 * v - 2.61).toFixed(2)} Hz` },
        { type: 'knob', key: 'stereoWidth', label: 'WIDTH', color: '#33ccff', min: 0, max: 1, defaultValue: 0.5, formatValue: (v) => `${Math.round(v * 200)}%` },
      ],
    },
    {
      label: 'VELOCITY & TUNING',
      controls: [
        { type: 'knob', key: 'velocitySense', label: 'VEL SENS', color: '#66ccff', min: 0, max: 1, defaultValue: 0.25, formatValue: fmtPct },
        { type: 'knob', key: 'fineTuning', label: 'FINE TUNE', color: '#9966ff', min: 0, max: 1, defaultValue: 0.5, bipolar: true, formatValue: (v) => `${Math.round(v * 100 - 50)} ct` },
        { type: 'knob', key: 'randomTuning', label: 'RND TUNE', color: '#9966ff', min: 0, max: 1, defaultValue: 0.146, formatValue: (v) => `${(50 * v * v).toFixed(1)} ct` },
        { type: 'knob', key: 'polyphony', label: 'POLY', color: '#66ccff', min: 0, max: 1, defaultValue: 1, formatValue: (v) => `${1 + Math.floor(31 * v)}` },
      ],
    },
  ],
};
