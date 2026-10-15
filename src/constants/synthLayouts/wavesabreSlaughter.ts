import type { SynthPanelLayout } from '@/types/synthPanel';
import { slaughterCurves, WS_FILTER_TYPES, wsFilterType, wsParamToHz } from '@/components/instruments/curves/wavesabreCurves';
import { fmtHz } from '@/components/instruments/curves/commonCurveModels';

const curves = slaughterCurves();
const fmtPct = (v: number) => `${Math.round(v * 100)}%`;
const fmtEnv = (v: number) => (v * v * 5000 + 1 >= 1000 ? `${((v * v * 5000 + 1) / 1000).toFixed(1)} s` : `${Math.round(v * v * 5000 + 1)} ms`);

export const SLAUGHTER_LAYOUT: SynthPanelLayout = {
  name: 'WaveSabre Slaughter',
  configKey: 'wavesabre.slaughter',
  tabs: [
    {
      id: 'osc',
      label: 'OSCILLATOR',
      sections: [
        {
          label: 'WAVEFORM',
          columns: 4,
          curves: [curves.oscillator],
          controls: [
            // the engine morphs a saw into a pulse: 0 is a saw, 1 a pulse (noise is a separate level the layout does not expose)
            { type: 'knob', key: 'waveform', label: 'WAVE', color: '#33ccff', min: 0, max: 1, defaultValue: 0, formatValue: (v) => (v < 0.02 ? 'Saw' : v > 0.98 ? 'Pulse' : `${Math.round(v * 100)}% Pulse`) },
            { type: 'knob', key: 'pulseWidth', label: 'PW', color: '#33ccff', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'coarse', label: 'COARSE', color: '#ffcc33', min: 0, max: 1, defaultValue: 0, formatValue: (v) => `+${Math.floor(v * 24.99)}st` },
            { type: 'knob', key: 'fine', label: 'FINE', color: '#ffcc33', min: 0, max: 1, defaultValue: 0, formatValue: (v) => `+${Math.round(v * 100)}c` },
          ],
        },
        {
          label: 'FILTER',
          columns: 4,
          curves: [curves.filter],
          controls: [
            { type: 'knob', key: 'filterType', label: 'TYPE', color: '#ff6633', min: 0, max: 1, defaultValue: 0, formatValue: (v) => WS_FILTER_TYPES[wsFilterType(v)] },
            { type: 'knob', key: 'cutoff', label: 'CUTOFF', color: '#ff6633', min: 0, max: 1, defaultValue: 0.5, formatValue: (v) => fmtHz(wsParamToHz(v)) },
            { type: 'knob', key: 'resonance', label: 'RESO', color: '#ff6633', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
            { type: 'knob', key: 'filterEnvAmount', label: 'ENV AMT', color: '#ff6633', min: 0, max: 1, defaultValue: 0.5, bipolar: true, formatValue: (v) => fmtPct((v - 0.5) * 2) },
          ],
        },
      ],
    },
    {
      id: 'env',
      label: 'ENVELOPES',
      sections: [
        {
          label: 'AMP ENVELOPE',
          columns: 4,
          curves: [curves.amp],
          controls: [
            { type: 'knob', key: 'ampAttack', label: 'ATTACK', color: '#66ff99', min: 0, max: 1, defaultValue: 0.01, formatValue: fmtEnv },
            { type: 'knob', key: 'ampDecay', label: 'DECAY', color: '#66ff99', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtEnv },
            { type: 'knob', key: 'ampSustain', label: 'SUSTAIN', color: '#66ff99', min: 0, max: 1, defaultValue: 0.7, formatValue: fmtPct },
            { type: 'knob', key: 'ampRelease', label: 'RELEASE', color: '#66ff99', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtEnv },
          ],
        },
        {
          label: 'FILTER ENVELOPE',
          columns: 4,
          curves: [curves.filterEnv],
          controls: [
            { type: 'knob', key: 'filterAttack', label: 'ATTACK', color: '#cc66ff', min: 0, max: 1, defaultValue: 0.01, formatValue: fmtEnv },
            { type: 'knob', key: 'filterDecay', label: 'DECAY', color: '#cc66ff', min: 0, max: 1, defaultValue: 0.2, formatValue: fmtEnv },
            { type: 'knob', key: 'filterSustain', label: 'SUSTAIN', color: '#cc66ff', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
            { type: 'knob', key: 'filterRelease', label: 'RELEASE', color: '#cc66ff', min: 0, max: 1, defaultValue: 0.2, formatValue: fmtEnv },
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
