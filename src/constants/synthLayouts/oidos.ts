import type { SynthPanelLayout } from '@/types/synthPanel';
import { oidosCurves } from '@/components/instruments/curves/oidosCurves';

const curves = oidosCurves();

const fmtPct = (v: number) => `${Math.round(v * 100)}%`;
// The knobs are 0..1; set_parameter turns them into these engine values (oidos-wasm/src/lib.rs), and the labels say so.
const fmtInt = (v: number) => `${Math.floor(v * 100 + 0.5)}`;
const fmtWidth = (v: number) => `${(v ** 5 * 100).toFixed(2)} st`;
const fmtSharp = (v: number) => (v * 5 - 4).toFixed(2);
const fmtHarmonic = (v: number) => (v * 2 - 1).toFixed(2);
const fmtEdge = (v: number) => `${Math.round((v * 2 - 1) * 120)} st`;
const fmtSlope = (v: number) => `${((1 - v) ** 3).toFixed(3)}/st`;
const fmtSweep = (v: number) => `${Math.round((v - 0.5) ** 3 * 12000)} st/s`;
const fmtGain = (v: number) => `${((v - 0.25) * 20 * Math.log10(4096)).toFixed(1)} dB`;
const fmtSeconds = (v: number) => (v < 0.001 ? 'instant' : v < 1 ? `${Math.round(v * 1000)} ms` : `${v.toFixed(2)} s`);

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
            { type: 'knob', key: 'seed', label: 'SEED', color: '#ff9933', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtInt },
            { type: 'knob', key: 'modes', label: 'MODES', color: '#ff9933', min: 0, max: 1, defaultValue: 0.40, formatValue: (v) => `${Math.round(v * 100)}` },
            { type: 'knob', key: 'fat', label: 'FAT', color: '#ff9933', min: 0, max: 1, defaultValue: 0.10, formatValue: (v) => `${Math.round(v * 100)}` },
            { type: 'knob', key: 'width', label: 'WIDTH', color: '#ff9933', min: 0, max: 1, defaultValue: 0.34, formatValue: fmtWidth },
          ],
        },
        {
          label: 'SPECTRAL',
          curves: [curves.spectrum],
          columns: 3,
          controls: [
            { type: 'knob', key: 'overtones', label: 'OVERTONES', color: '#33ccff', min: 0, max: 1, defaultValue: 0.27, formatValue: (v) => `${Math.round(v * 100)}` },
            { type: 'knob', key: 'sharpness', label: 'SHARP', color: '#33ccff', min: 0, max: 1, defaultValue: 0.9, formatValue: fmtSharp },
            { type: 'knob', key: 'harmonicity', label: 'HARMONIC', color: '#33ccff', min: 0, max: 1, defaultValue: 1.0, formatValue: fmtHarmonic },
          ],
        },
        {
          label: 'DECAY',
          curves: [curves.decay],
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
          curves: [curves.window],
          columns: 3,
          controls: [
            { type: 'knob', key: 'filterLow', label: 'EDGE', color: '#ff6633', min: 0, max: 1, defaultValue: 0.0, formatValue: fmtEdge },
            { type: 'knob', key: 'filterSlopeLow', label: 'SLOPE', color: '#ff6633', min: 0, max: 1, defaultValue: 0.0, formatValue: fmtSlope },
            { type: 'knob', key: 'filterSweepLow', label: 'SWEEP', color: '#ff6633', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtSweep },
          ],
        },
        {
          label: 'HIGH FILTER',
          columns: 3,
          controls: [
            { type: 'knob', key: 'filterHigh', label: 'EDGE', color: '#cc66ff', min: 0, max: 1, defaultValue: 1.0, formatValue: fmtEdge },
            { type: 'knob', key: 'filterSlopeHigh', label: 'SLOPE', color: '#cc66ff', min: 0, max: 1, defaultValue: 0.0, formatValue: fmtSlope },
            { type: 'knob', key: 'filterSweepHigh', label: 'SWEEP', color: '#cc66ff', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtSweep },
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
          curves: [curves.envelope],
          columns: 3,
          controls: [
            { type: 'knob', key: 'gain', label: 'GAIN', color: '#66ff99', min: 0, max: 1, defaultValue: 0.25, formatValue: fmtGain },
            { type: 'knob', key: 'attack', label: 'ATTACK', color: '#ffcc33', min: 0, max: 1, defaultValue: 0.25, formatValue: (v) => fmtSeconds(v * v) },
            { type: 'knob', key: 'release', label: 'RELEASE', color: '#ffcc33', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtSeconds },
          ],
        },
      ],
    },
  ],
};
