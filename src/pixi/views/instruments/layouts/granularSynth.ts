import type { SynthPanelLayout } from '../synthPanelTypes';

const fmtMs = (v: number) => `${Math.round(v)}ms`;
const fmtPct = (v: number) => `${Math.round(v)}%`;
const fmtDb = (v: number) => `${Math.round(v)}dB`;
const fmtPan = (v: number) => v === 0 ? 'C' : v > 0 ? `R${Math.round(v)}` : `L${Math.round(-v)}`;
const fmtRate = (v: number) => `${v.toFixed(2)}x`;
const fmtCents = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}ct`;

export const GRANULAR_SYNTH_LAYOUT: SynthPanelLayout = {
  name: 'Granular',
  configKey: 'granular',
  sections: [
    {
      label: 'AMP',
      controls: [
        { type: 'knob', key: 'volume', label: 'VOLUME', color: '#00ff99', min: -60, max: 0, defaultValue: -12, formatValue: fmtDb },
        { type: 'knob', key: 'pan', label: 'PAN', color: '#66ccff', min: -100, max: 100, defaultValue: 0, bipolar: true, formatValue: fmtPan },
      ],
    },
    {
      label: 'GRAIN',
      controls: [
        { type: 'knob', key: 'granular.grainSize', label: 'SIZE', color: '#ff9900', min: 10, max: 500, defaultValue: 100, formatValue: fmtMs },
        { type: 'knob', key: 'granular.grainOverlap', label: 'OVERLAP', color: '#ff9900', min: 0, max: 100, defaultValue: 50, formatValue: fmtPct },
        { type: 'knob', key: 'granular.density', label: 'DENSITY', color: '#cc66ff', min: 1, max: 16, defaultValue: 4, formatValue: (v) => `${Math.round(v)}` },
      ],
    },
    {
      label: 'PITCH',
      controls: [
        { type: 'knob', key: 'granular.playbackRate', label: 'SPEED', color: '#66ccff', min: 0.25, max: 4, defaultValue: 1, formatValue: fmtRate },
        { type: 'knob', key: 'granular.detune', label: 'DETUNE', color: '#ff9900', min: -1200, max: 1200, defaultValue: 0, bipolar: true, formatValue: fmtCents },
        { type: 'knob', key: 'granular.randomPitch', label: 'RAND', color: '#ff6666', min: 0, max: 100, defaultValue: 0, formatValue: fmtPct },
      ],
    },
    {
      label: 'SCAN',
      controls: [
        { type: 'knob', key: 'granular.scanPosition', label: 'POSIT', color: '#ff9900', min: 0, max: 100, defaultValue: 0, formatValue: fmtPct },
        { type: 'knob', key: 'granular.scanSpeed', label: 'SCAN', color: '#ff9900', min: -100, max: 100, defaultValue: 0, bipolar: true, formatValue: fmtPct },
        { type: 'toggle', key: 'granular.reverse', label: 'REVERSE', labels: ['FWD', 'REV'] },
      ],
    },
  ],
};
