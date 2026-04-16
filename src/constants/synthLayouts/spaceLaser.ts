import type { SynthPanelLayout } from '@/types/synthPanel';

const fmtHz = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)} Hz`;
const fmtMs = (v: number) => `${Math.round(v)} ms`;
const fmtPct = (v: number) => `${Math.round(v)}%`;
const fmtSec = (v: number) => `${v.toFixed(2)}s`;
const fmtDb = (v: number) => `${Math.round(v)}dB`;

export const SPACE_LASER_LAYOUT: SynthPanelLayout = {
  name: 'Space Laser',
  configKey: 'spaceLaser',
  tabs: [
    {
      id: 'laser',
      label: 'LASER',
      sections: [
        {
          label: 'AMP',
          controls: [
            { type: 'knob', key: '~volume', label: 'VOLUME', color: '#00ff99', min: -60, max: 0, defaultValue: -12, formatValue: fmtDb },
            { type: 'knob', key: '~pan', label: 'PAN', color: '#66ccff', min: -100, max: 100, defaultValue: 0, bipolar: true, formatValue: (v) => v === 0 ? 'C' : v > 0 ? `R${Math.round(v)}` : `L${Math.round(-v)}` },
          ],
        },
        {
          label: 'SWEEP',
          controls: [
            { type: 'knob', key: 'laser.startFreq', label: 'START', min: 100, max: 10000, defaultValue: 5000, color: '#ff3366', formatValue: fmtHz },
            { type: 'knob', key: 'laser.endFreq', label: 'END', min: 20, max: 5000, defaultValue: 100, color: '#33ccff', formatValue: fmtHz },
            { type: 'knob', key: 'laser.sweepTime', label: 'TIME', min: 10, max: 5000, defaultValue: 500, formatValue: fmtMs },
            { type: 'select', key: 'laser.curve', label: 'CURVE', options: [
              { value: 'exponential', label: 'Exponential' },
              { value: 'linear', label: 'Linear' },
            ]},
          ],
        },
      ],
    },
    {
      id: 'fm',
      label: 'FM',
      sections: [
        {
          label: 'FM MODULATION',
          controls: [
            { type: 'knob', key: 'fm.amount', label: 'AMOUNT', min: 0, max: 100, defaultValue: 20, color: '#9966ff', formatValue: fmtPct },
            { type: 'knob', key: 'fm.ratio', label: 'RATIO', min: 0.5, max: 16, defaultValue: 2, formatValue: (v) => `${v.toFixed(1)}x` },
          ],
        },
        {
          label: 'NOISE',
          controls: [
            { type: 'select', key: 'noise.type', label: 'TYPE', options: [
              { value: 'white', label: 'White' },
              { value: 'pink', label: 'Pink' },
              { value: 'brown', label: 'Brown' },
            ]},
            { type: 'knob', key: 'noise.amount', label: 'AMOUNT', min: 0, max: 100, defaultValue: 10, formatValue: fmtPct },
          ],
        },
      ],
    },
    {
      id: 'fx',
      label: 'FX',
      sections: [
        {
          label: 'FILTER',
          controls: [
            { type: 'select', key: 'filter.type', label: 'TYPE', options: [
              { value: 'lowpass', label: 'Lowpass' },
              { value: 'highpass', label: 'Highpass' },
              { value: 'bandpass', label: 'Bandpass' },
              { value: 'notch', label: 'Notch' },
            ]},
            { type: 'knob', key: 'filter.cutoff', label: 'CUTOFF', min: 20, max: 20000, defaultValue: 8000, color: '#ffcc00', formatValue: fmtHz },
            { type: 'knob', key: 'filter.resonance', label: 'RESO', min: 0, max: 100, defaultValue: 20, color: '#ff6600', formatValue: fmtPct },
          ],
        },
        {
          label: 'DELAY',
          controls: [
            { type: 'toggle', key: 'delay.enabled', label: 'DELAY' },
            { type: 'knob', key: 'delay.time', label: 'TIME', formatValue: fmtSec },
            { type: 'knob', key: 'delay.feedback', label: 'FDBK', formatValue: fmtPct },
            { type: 'knob', key: 'delay.wet', label: 'WET', formatValue: fmtPct },
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
