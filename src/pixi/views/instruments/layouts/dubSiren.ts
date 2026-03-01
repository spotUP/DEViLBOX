import type { SynthPanelLayout } from '../synthPanelTypes';

// DubSirenConfig lives at config.dubSiren — keys are relative to that sub-object.
// Volume/pan are root-level InstrumentConfig fields; use ~ prefix to bypass configKey.

const fmtHz = (v: number) => `${Math.round(v)} Hz`;
const fmtPct = (v: number) => `${Math.round(v)}%`;
const fmtSec = (v: number) => `${v.toFixed(2)}s`;

export const DUB_SIREN_LAYOUT: SynthPanelLayout = {
  name: 'Dub Siren',
  configKey: 'dubSiren',
  tabs: [
    {
      id: 'main',
      label: 'MAIN',
      sections: [
        {
          label: 'AMP',
          controls: [
            { type: 'knob', key: '~volume', label: 'VOLUME', color: '#00ff99', min: -60, max: 0, defaultValue: -12, formatValue: (v) => `${Math.round(v)}dB` },
            { type: 'knob', key: '~pan', label: 'PAN', color: '#66ccff', min: -100, max: 100, defaultValue: 0, bipolar: true, formatValue: (v) => v === 0 ? 'C' : v > 0 ? `R${Math.round(v)}` : `L${Math.round(-v)}` },
          ],
        },
        {
          label: 'OSCILLATOR',
          controls: [
            { type: 'knob', key: 'oscillator.frequency', label: 'FREQ', color: '#ff6600', min: 60, max: 1000, defaultValue: 440, formatValue: fmtHz },
          ],
        },
        {
          label: 'LFO / SIREN',
          controls: [
            { type: 'knob', key: 'lfo.rate', label: 'RATE', color: '#9966ff', min: 0, max: 20, defaultValue: 2, formatValue: (v) => `${v.toFixed(1)} Hz` },
            { type: 'knob', key: 'lfo.depth', label: 'DEPTH', color: '#cc66ff', min: 0, max: 1000, defaultValue: 100, formatValue: (v) => `${Math.round(v)}` },
          ],
        },
      ],
    },
    {
      id: 'fx',
      label: 'FX',
      sections: [
        {
          label: 'DELAY',
          controls: [
            { type: 'toggle', key: 'delay.enabled', label: 'DELAY' },
            { type: 'knob', key: 'delay.time', label: 'TIME', color: '#33ccff', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtSec },
            { type: 'knob', key: 'delay.feedback', label: 'FDBK', color: '#3399ff', min: 0, max: 1, defaultValue: 0.4, formatValue: fmtPct },
            { type: 'knob', key: 'delay.wet', label: 'WET', color: '#66ccff', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
          ],
        },
        {
          label: 'FILTER',
          controls: [
            { type: 'toggle', key: 'filter.enabled', label: 'FILTER' },
            { type: 'knob', key: 'filter.frequency', label: 'CUTOFF', color: '#ffcc00', min: 20, max: 20000, defaultValue: 2000, formatValue: fmtHz },
          ],
        },
        {
          label: 'REVERB',
          controls: [
            { type: 'toggle', key: 'reverb.enabled', label: 'REVERB' },
            { type: 'knob', key: 'reverb.decay', label: 'DECAY', color: '#cc66ff', min: 0.1, max: 10, defaultValue: 2, formatValue: (v) => `${v.toFixed(1)}s` },
            { type: 'knob', key: 'reverb.wet', label: 'WET', color: '#9966ff', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
          ],
        },
      ],
    },
  ],
};
