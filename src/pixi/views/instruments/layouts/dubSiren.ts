import type { SynthPanelLayout } from '../synthPanelTypes';

const fmtHz = (v: number) => `${Math.round(v * 2000)} Hz`;
const fmtPct = (v: number) => `${Math.round(v * 100)}%`;
const fmtMs = (v: number) => `${Math.round(v * 1000)} ms`;

export const DUB_SIREN_LAYOUT: SynthPanelLayout = {
  name: 'Dub Siren',
  configKey: 'dubSiren',
  sections: [
    {
      label: 'OSCILLATOR',
      controls: [
        { type: 'knob', key: 'frequency', label: 'FREQ', color: '#ff6600', formatValue: fmtHz },
        { type: 'knob', key: 'waveform', label: 'WAVE', color: '#ff3366', formatValue: (v) => ['SIN', 'SQR', 'SAW', 'TRI'][Math.round(v * 3)] ?? 'SIN' },
        { type: 'knob', key: 'volume', label: 'VOLUME', color: '#00ff99', formatValue: fmtPct },
      ],
    },
    {
      label: 'LFO / SIREN',
      controls: [
        { type: 'knob', key: 'lfoRate', label: 'RATE', color: '#9966ff', formatValue: (v) => `${(v * 20).toFixed(1)} Hz` },
        { type: 'knob', key: 'lfoDepth', label: 'DEPTH', color: '#cc66ff', formatValue: fmtPct },
        { type: 'knob', key: 'lfoWaveform', label: 'LFO WAV', formatValue: (v) => ['SIN', 'SQR', 'SAW', 'TRI'][Math.round(v * 3)] ?? 'SIN' },
      ],
    },
    {
      label: 'DELAY',
      controls: [
        { type: 'knob', key: 'delayTime', label: 'TIME', color: '#33ccff', formatValue: fmtMs },
        { type: 'knob', key: 'delayFeedback', label: 'FDBK', color: '#3399ff', formatValue: fmtPct },
        { type: 'knob', key: 'delayMix', label: 'MIX', color: '#66ccff', formatValue: fmtPct },
      ],
    },
    {
      label: 'FILTER',
      controls: [
        { type: 'knob', key: 'filterCutoff', label: 'CUTOFF', color: '#ffcc00', formatValue: fmtHz },
        { type: 'knob', key: 'filterResonance', label: 'RESO', color: '#ff9900', formatValue: fmtPct },
      ],
    },
  ],
};
