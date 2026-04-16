import type { SynthPanelLayout } from '@/types/synthPanel';

const fmtPct = (v: number) => `${Math.round(v * 100)}%`;
const fmtVal = (v: number) => v.toFixed(2);

export const OIDOS_LAYOUT: SynthPanelLayout = {
  name: 'Oidos Additive',
  configKey: 'oidos.synth',
  tabs: [
    {
      id: 'gen',
      label: 'GENERATE',
      sections: [
        {
          label: 'GENERATION',
          columns: 4,
          controls: [
            { type: 'knob', key: 'seed', label: 'SEED', color: '#ff9933', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'modes', label: 'MODES', color: '#ff9933', min: 0, max: 1, defaultValue: 0.40, formatValue: (v) => `${Math.round(v * 100)}` },
            { type: 'knob', key: 'fat', label: 'FAT', color: '#ff9933', min: 0, max: 1, defaultValue: 0.10, formatValue: (v) => `${Math.round(v * 100)}` },
            { type: 'knob', key: 'width', label: 'WIDTH', color: '#ff9933', min: 0, max: 1, defaultValue: 0.34, formatValue: fmtVal },
          ],
        },
        {
          label: 'SPECTRAL',
          columns: 3,
          controls: [
            { type: 'knob', key: 'overtones', label: 'OVERTONES', color: '#33ccff', min: 0, max: 1, defaultValue: 0.27, formatValue: (v) => `${Math.round(v * 100)}` },
            { type: 'knob', key: 'sharpness', label: 'SHARP', color: '#33ccff', min: 0, max: 1, defaultValue: 0.9, formatValue: fmtPct },
            { type: 'knob', key: 'harmonicity', label: 'HARMONIC', color: '#33ccff', min: 0, max: 1, defaultValue: 1.0, formatValue: fmtVal },
          ],
        },
        {
          label: 'DECAY',
          columns: 2,
          controls: [
            { type: 'knob', key: 'decayLow', label: 'DEC LOW', color: '#66ff99', min: 0, max: 1, defaultValue: 1.0, formatValue: fmtPct },
            { type: 'knob', key: 'decayHigh', label: 'DEC HIGH', color: '#66ff99', min: 0, max: 1, defaultValue: 1.0, formatValue: fmtPct },
          ],
        },
      ],
    },
    {
      id: 'filter',
      label: 'FILTER',
      sections: [
        {
          label: 'LOW FILTER',
          columns: 3,
          controls: [
            { type: 'knob', key: 'filterLow', label: 'CUTOFF', color: '#ff6633', min: 0, max: 1, defaultValue: 0.0, formatValue: fmtPct },
            { type: 'knob', key: 'filterSlopeLow', label: 'SLOPE', color: '#ff6633', min: 0, max: 1, defaultValue: 0.0, formatValue: fmtPct },
            { type: 'knob', key: 'filterSweepLow', label: 'SWEEP', color: '#ff6633', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
          ],
        },
        {
          label: 'HIGH FILTER',
          columns: 3,
          controls: [
            { type: 'knob', key: 'filterHigh', label: 'CUTOFF', color: '#cc66ff', min: 0, max: 1, defaultValue: 1.0, formatValue: fmtPct },
            { type: 'knob', key: 'filterSlopeHigh', label: 'SLOPE', color: '#cc66ff', min: 0, max: 1, defaultValue: 0.0, formatValue: fmtPct },
            { type: 'knob', key: 'filterSweepHigh', label: 'SWEEP', color: '#cc66ff', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
          ],
        },
      ],
    },
    {
      id: 'output',
      label: 'OUTPUT',
      sections: [
        {
          label: 'ENVELOPE',
          columns: 3,
          controls: [
            { type: 'knob', key: 'gain', label: 'GAIN', color: '#66ff99', min: 0, max: 1, defaultValue: 0.25, formatValue: fmtPct },
            { type: 'knob', key: 'attack', label: 'ATTACK', color: '#ffcc33', min: 0, max: 1, defaultValue: 0.25, formatValue: fmtPct },
            { type: 'knob', key: 'release', label: 'RELEASE', color: '#ffcc33', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
          ],
        },
      ],
    },
  ],
};
