import type { SynthPanelLayout } from '../synthPanelTypes';

const fmtHz = (v: number) => `${Math.round(v)} Hz`;
const fmtMs = (v: number) => `${Math.round(v)}ms`;
const fmtPct = (v: number) => `${Math.round(v)}%`;
const fmtDb = (v: number) => `${Math.round(v)}dB`;
const fmtPan = (v: number) => v === 0 ? 'C' : v > 0 ? `R${Math.round(v)}` : `L${Math.round(-v)}`;

export const SYNARE_LAYOUT: SynthPanelLayout = {
  name: 'Synare Drum',
  configKey: 'synare',
  sections: [
    {
      label: 'AMP',
      controls: [
        { type: 'knob', key: '~volume', label: 'VOLUME', color: '#00ff99', min: -60, max: 0, defaultValue: -12, formatValue: fmtDb },
        { type: 'knob', key: '~pan', label: 'PAN', color: '#66ccff', min: -100, max: 100, defaultValue: 0, bipolar: true, formatValue: fmtPan },
      ],
    },
    {
      label: 'OSCILLATOR',
      controls: [
        { type: 'knob', key: 'oscillator.tune', label: 'TUNE', color: '#ff9900', min: 20, max: 2000, defaultValue: 200, formatValue: fmtHz },
        { type: 'knob', key: 'oscillator.fine', label: 'FINE', color: '#ffcc00', min: -100, max: 100, defaultValue: 0, bipolar: true, formatValue: (v) => `${v > 0 ? '+' : ''}${Math.round(v)}ct` },
        { type: 'knob', key: 'noise.mix', label: 'NOISE', color: '#cc66ff', min: 0, max: 1, defaultValue: 0.1, formatValue: fmtPct },
      ],
    },
    {
      label: 'FILTER',
      controls: [
        { type: 'knob', key: 'filter.cutoff', label: 'CUTOFF', color: '#ffcc00', min: 20, max: 20000, defaultValue: 2000, formatValue: fmtHz },
        { type: 'knob', key: 'filter.resonance', label: 'RESO', color: '#ff6600', min: 0, max: 100, defaultValue: 50, formatValue: fmtPct },
        { type: 'knob', key: 'filter.envMod', label: 'ENV MOD', color: '#ff3366', min: 0, max: 100, defaultValue: 80, formatValue: fmtPct },
        { type: 'knob', key: 'filter.decay', label: 'F DEC', color: '#ff9900', min: 10, max: 2000, defaultValue: 200, formatValue: fmtMs },
      ],
    },
    {
      label: 'ENVELOPE',
      controls: [
        { type: 'knob', key: 'envelope.decay', label: 'DECAY', color: '#ff9900', min: 10, max: 2000, defaultValue: 300, formatValue: fmtMs },
        { type: 'knob', key: 'envelope.sustain', label: 'SUSTAIN', color: '#ff9900', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
      ],
    },
    {
      label: 'SWEEP',
      controls: [
        { type: 'toggle', key: 'sweep.enabled', label: 'SWEEP' },
        { type: 'knob', key: 'sweep.amount', label: 'AMOUNT', color: '#ff9900', min: 0, max: 48, defaultValue: 12, formatValue: (v) => `${Math.round(v)} st` },
        { type: 'knob', key: 'sweep.time', label: 'TIME', color: '#ff9900', min: 1, max: 2000, defaultValue: 100, formatValue: fmtMs },
      ],
    },
  ],
};
