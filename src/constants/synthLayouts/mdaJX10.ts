import type { SynthPanelLayout } from '@/types/synthPanel';

const fmtPct = (v: number) => `${Math.round(v * 100)}%`;

export const MDA_JX10_LAYOUT: SynthPanelLayout = {
  name: 'MDA JX10',
  configKey: 'mdaJX10',
  sections: [
    {
      label: 'OSCILLATOR',
      controls: [
        { type: 'knob', key: 'oscMix', label: 'OSC MIX', color: '#ff9900', min: 0, max: 1, defaultValue: 1, formatValue: fmtPct },
        { type: 'knob', key: 'oscTune', label: 'TUNE', color: '#ffcc00', min: 0, max: 1, defaultValue: 0.37, bipolar: true, formatValue: (v) => `${Math.round((v - 0.5) * 48)} st` },
        { type: 'knob', key: 'oscFine', label: 'FINE', color: '#ffcc00', min: 0, max: 1, defaultValue: 0.25, bipolar: true, formatValue: (v) => `${Math.round((v - 0.5) * 200)} ct` },
        { type: 'knob', key: 'noise', label: 'NOISE', color: '#cc66ff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
        { type: 'knob', key: 'octave', label: 'OCTAVE', color: '#66ccff', min: 0, max: 1, defaultValue: 0.5, bipolar: true, formatValue: (v) => `${Math.round((v - 0.5) * 4)}` },
        { type: 'knob', key: 'tuning', label: 'TUNING', color: '#66ccff', min: 0, max: 1, defaultValue: 0.5, bipolar: true, formatValue: (v) => `${Math.round((v - 0.5) * 200)} ct` },
      ],
    },
    {
      label: 'GLIDE',
      controls: [
        { type: 'select', key: 'glide', label: 'MODE', options: [
          { value: '0', label: 'Poly' }, { value: '0.2', label: 'P-Legato' },
          { value: '0.4', label: 'P-Glide' }, { value: '0.6', label: 'Mono' },
          { value: '0.8', label: 'M-Legato' }, { value: '1', label: 'M-Glide' },
        ]},
        { type: 'knob', key: 'glideRate', label: 'RATE', color: '#33ccff', min: 0, max: 1, defaultValue: 0.32, formatValue: fmtPct },
        { type: 'knob', key: 'glideBend', label: 'BEND', color: '#33ccff', min: 0, max: 1, defaultValue: 0.5, bipolar: true, formatValue: (v) => `${Math.round((v - 0.5) * 100)}%` },
      ],
    },
    {
      label: 'FILTER',
      controls: [
        { type: 'knob', key: 'vcfFreq', label: 'FREQ', color: '#ffcc00', min: 0, max: 1, defaultValue: 0.9, formatValue: fmtPct },
        { type: 'knob', key: 'vcfReso', label: 'RESO', color: '#ff6600', min: 0, max: 1, defaultValue: 0.6, formatValue: fmtPct },
        { type: 'knob', key: 'vcfEnv', label: 'ENV', color: '#22c55e', min: 0, max: 1, defaultValue: 0.12, formatValue: fmtPct },
        { type: 'knob', key: 'vcfLfo', label: 'LFO', color: '#9966ff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
        { type: 'knob', key: 'vcfVel', label: 'VEL', color: '#66ccff', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
      ],
    },
    {
      label: 'VCF ENVELOPE',
      controls: [
        { type: 'knob', key: 'vcfAtt', label: 'ATK', color: '#22c55e', min: 0, max: 1, defaultValue: 0.9, formatValue: fmtPct },
        { type: 'knob', key: 'vcfDec', label: 'DEC', color: '#22c55e', min: 0, max: 1, defaultValue: 0.89, formatValue: fmtPct },
        { type: 'knob', key: 'vcfSus', label: 'SUS', color: '#22c55e', min: 0, max: 1, defaultValue: 0.9, formatValue: fmtPct },
        { type: 'knob', key: 'vcfRel', label: 'REL', color: '#22c55e', min: 0, max: 1, defaultValue: 0.73, formatValue: fmtPct },
      ],
    },
    {
      label: 'AMP ENVELOPE',
      controls: [
        { type: 'knob', key: 'envAtt', label: 'ATK', color: '#ff3366', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
        { type: 'knob', key: 'envDec', label: 'DEC', color: '#ff3366', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
        { type: 'knob', key: 'envSus', label: 'SUS', color: '#ff3366', min: 0, max: 1, defaultValue: 1, formatValue: fmtPct },
        { type: 'knob', key: 'envRel', label: 'REL', color: '#ff3366', min: 0, max: 1, defaultValue: 0.71, formatValue: fmtPct },
      ],
    },
    {
      label: 'LFO',
      controls: [
        { type: 'knob', key: 'lfoRate', label: 'RATE', color: '#9966ff', min: 0, max: 1, defaultValue: 0.81, formatValue: fmtPct },
        { type: 'knob', key: 'vibrato', label: 'VIBRATO', color: '#cc66ff', min: 0, max: 1, defaultValue: 0.65, formatValue: fmtPct },
      ],
    },
  ],
};
