import type { SynthPanelLayout } from '../synthPanelTypes';

const fmtMs = (v: number) => `${Math.round(v)}ms`;
const fmtPct = (v: number) => `${Math.round(v)}%`;
const fmtDb = (v: number) => `${Math.round(v)}dB`;
const fmtPan = (v: number) => v === 0 ? 'C' : v > 0 ? `R${Math.round(v)}` : `L${Math.round(-v)}`;

export const STRING_MACHINE_LAYOUT: SynthPanelLayout = {
  name: 'String Machine',
  configKey: 'stringMachine',
  sections: [
    {
      label: 'AMP',
      controls: [
        { type: 'knob', key: '~volume', label: 'VOLUME', color: '#00ff99', min: -60, max: 0, defaultValue: -12, formatValue: fmtDb },
        { type: 'knob', key: '~pan', label: 'PAN', color: '#66ccff', min: -100, max: 100, defaultValue: 0, bipolar: true, formatValue: fmtPan },
      ],
    },
    {
      label: 'SECTIONS',
      controls: [
        { type: 'knob', key: 'sections.violin', label: 'VIOLIN', color: '#ff6666', min: 0, max: 100, defaultValue: 100, formatValue: fmtPct },
        { type: 'knob', key: 'sections.viola', label: 'VIOLA', color: '#ffaa66', min: 0, max: 100, defaultValue: 70, formatValue: fmtPct },
        { type: 'knob', key: 'sections.cello', label: 'CELLO', color: '#ff9900', min: 0, max: 100, defaultValue: 50, formatValue: fmtPct },
        { type: 'knob', key: 'sections.bass', label: 'BASS', color: '#cc6600', min: 0, max: 100, defaultValue: 30, formatValue: fmtPct },
      ],
    },
    {
      label: 'ENSEMBLE',
      controls: [
        { type: 'knob', key: 'ensemble.depth', label: 'DEPTH', color: '#cc66ff', min: 0, max: 100, defaultValue: 60, formatValue: fmtPct },
        { type: 'knob', key: 'ensemble.rate', label: 'RATE', color: '#9966ff', min: 0.5, max: 6, defaultValue: 3, formatValue: (v) => `${v.toFixed(1)} Hz` },
      ],
    },
    {
      label: 'ENVELOPE',
      controls: [
        { type: 'knob', key: 'attack', label: 'ATTACK', color: '#ff9900', min: 10, max: 2000, defaultValue: 200, formatValue: fmtMs },
        { type: 'knob', key: 'release', label: 'RELEASE', color: '#ff9900', min: 100, max: 5000, defaultValue: 1000, formatValue: fmtMs },
        { type: 'knob', key: 'brightness', label: 'BRIGHT', color: '#ffcc00', min: 0, max: 100, defaultValue: 60, formatValue: fmtPct },
      ],
    },
  ],
};
