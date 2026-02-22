import type { SynthPanelLayout } from '../synthPanelTypes';

const fmtHz = (v: number) => `${Math.round(v)} Hz`;
const fmtMs = (v: number) => `${Math.round(v)} ms`;
const fmtPct = (v: number) => `${Math.round(v)}%`;
const fmtSec = (v: number) => `${v.toFixed(2)}s`;

export const SPACE_LASER_LAYOUT: SynthPanelLayout = {
  name: 'Space Laser',
  configKey: 'spaceLaser',
  tabs: [
    {
      id: 'laser',
      label: 'LASER',
      sections: [
        {
          label: 'SWEEP',
          controls: [
            { type: 'knob', key: 'laser.startFreq', label: 'START', min: 100, max: 10000, defaultValue: 5000, color: '#ff3366', formatValue: fmtHz },
            { type: 'knob', key: 'laser.endFreq', label: 'END', min: 20, max: 5000, defaultValue: 100, color: '#33ccff', formatValue: fmtHz },
            { type: 'knob', key: 'laser.sweepTime', label: 'TIME', min: 10, max: 5000, defaultValue: 500, formatValue: fmtMs },
          ],
        },
        {
          label: 'FM',
          controls: [
            { type: 'knob', key: 'fm.amount', label: 'AMOUNT', min: 0, max: 100, defaultValue: 20, color: '#9966ff', formatValue: fmtPct },
            { type: 'knob', key: 'fm.ratio', label: 'RATIO', min: 0.5, max: 16, defaultValue: 2, formatValue: (v) => `${v.toFixed(1)}x` },
          ],
        },
      ],
    },
    {
      id: 'fx',
      label: 'FX',
      sections: [
        {
          label: 'NOISE',
          controls: [
            { type: 'knob', key: 'noise.amount', label: 'NOISE', min: 0, max: 100, defaultValue: 10, formatValue: fmtPct },
          ],
        },
        {
          label: 'FILTER',
          controls: [
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
      ],
    },
  ],
};
