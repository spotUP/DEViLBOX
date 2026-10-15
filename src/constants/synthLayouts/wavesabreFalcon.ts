import type { SynthPanelLayout } from '@/types/synthPanel';
import { falconCurves, falconRatio } from '@/components/instruments/curves/wavesabreCurves';

const curves = falconCurves();
const fmtPct = (v: number) => `${Math.round(v * 100)}%`;
// The engine's oscillators are sin(x) + waveform * (sin 3x / 3 + sin 5x / 5): a sine at 0, a soft square at 1.
const fmtWave = (v: number) => (v < 0.02 ? 'Sine' : v > 0.98 ? 'Soft Square' : `${Math.round(v * 100)}% Square`);
const fmtCoarse = (v: number) => `x${falconRatio(v, 0.5).toFixed(0)}`;
const fmtEnv = (v: number) => (v * v * 5000 + 1 >= 1000 ? `${((v * v * 5000 + 1) / 1000).toFixed(1)} s` : `${Math.round(v * v * 5000 + 1)} ms`);
const fmtFine = (v: number) => `${(((v - 0.5) * 2) ** 3).toFixed(2)}`;

// Config keys osc1* and attack1.. are the carrier (engine oscillator 2); osc2* and attack2.. the modulator
// (engine oscillator 1): see FalconParamIndex. fmCoarse and fmFine have no engine counterpart and are not shown.
export const FALCON_LAYOUT: SynthPanelLayout = {
  name: 'WaveSabre Falcon',
  configKey: 'wavesabre.falcon',
  tabs: [
    {
      id: 'osc',
      label: 'OSCILLATORS',
      sections: [
        {
          label: 'OSCILLATOR 1 (CARRIER)',
          columns: 3,
          controls: [
            { type: 'knob', key: 'osc1Waveform', label: 'WAVE', color: '#33ccff', min: 0, max: 1, defaultValue: 0, formatValue: fmtWave },
            { type: 'knob', key: 'osc1Coarse', label: 'RATIO', color: '#ffcc33', min: 0, max: 1, defaultValue: 0, formatValue: fmtCoarse },
            { type: 'knob', key: 'osc1Fine', label: 'FINE', color: '#ffcc33', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtFine },
          ],
        },
        {
          label: 'OSCILLATOR 2 (MODULATOR)',
          columns: 3,
          controls: [
            { type: 'knob', key: 'osc2Waveform', label: 'WAVE', color: '#ff6633', min: 0, max: 1, defaultValue: 0, formatValue: fmtWave },
            { type: 'knob', key: 'osc2Coarse', label: 'RATIO', color: '#ffcc33', min: 0, max: 1, defaultValue: 0.04, formatValue: fmtCoarse },
            { type: 'knob', key: 'osc2Fine', label: 'FINE', color: '#ffcc33', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtFine },
          ],
        },
        {
          label: 'FM',
          columns: 2,
          curves: [curves.waveform],
          controls: [
            { type: 'knob', key: 'fmAmount', label: 'AMOUNT', color: '#cc66ff', min: 0, max: 1, defaultValue: 0.3, formatValue: (v) => `${(v * v * 13.25).toFixed(1)} rad` },
            { type: 'knob', key: 'feedback', label: 'FEEDBACK', color: '#cc66ff', min: 0, max: 1, defaultValue: 0.1, formatValue: (v) => fmtPct(v * v / 2) },
          ],
        },
      ],
    },
    {
      id: 'env',
      label: 'ENVELOPES',
      sections: [
        {
          label: 'CARRIER ENVELOPE',
          columns: 4,
          curves: [curves.carrier],
          controls: [
            { type: 'knob', key: 'attack1', label: 'ATTACK', color: '#66ff99', min: 0, max: 1, defaultValue: 0.01, formatValue: fmtEnv },
            { type: 'knob', key: 'decay1', label: 'DECAY', color: '#66ff99', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtEnv },
            { type: 'knob', key: 'sustain1', label: 'SUSTAIN', color: '#66ff99', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'release1', label: 'RELEASE', color: '#66ff99', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtEnv },
          ],
        },
        {
          label: 'MODULATOR ENVELOPE',
          columns: 4,
          curves: [curves.modulator],
          controls: [
            { type: 'knob', key: 'attack2', label: 'ATTACK', color: '#ff9933', min: 0, max: 1, defaultValue: 0.01, formatValue: fmtEnv },
            { type: 'knob', key: 'decay2', label: 'DECAY', color: '#ff9933', min: 0, max: 1, defaultValue: 0.2, formatValue: fmtEnv },
            { type: 'knob', key: 'sustain2', label: 'SUSTAIN', color: '#ff9933', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
            { type: 'knob', key: 'release2', label: 'RELEASE', color: '#ff9933', min: 0, max: 1, defaultValue: 0.2, formatValue: fmtEnv },
          ],
        },
        {
          label: 'MASTER',
          columns: 4,
          controls: [
            { type: 'knob', key: 'gain', label: 'GAIN', color: '#66ff99', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'voices', label: 'VOICES', color: '#ffcc33', min: 0, max: 1, defaultValue: 0, formatValue: (v) => `${Math.floor(v * 15) + 1}` },
            { type: 'knob', key: 'detune', label: 'DETUNE', color: '#ffcc33', min: 0, max: 1, defaultValue: 0.1, formatValue: fmtPct },
            { type: 'knob', key: 'spread', label: 'SPREAD', color: '#ffcc33', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
          ],
        },
      ],
    },
  ],
};
