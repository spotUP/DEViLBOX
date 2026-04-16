import type { SynthPanelLayout } from '@/types/synthPanel';

const fmtPct = (v: number) => `${Math.round(v * 100)}%`;
const WAVE_NAMES = ['Sine', 'Saw', 'Square', 'Noise', 'Silent'];

export const FALCON_LAYOUT: SynthPanelLayout = {
  name: 'WaveSabre Falcon',
  configKey: 'wavesabre.falcon',
  tabs: [
    {
      id: 'osc',
      label: 'OSCILLATORS',
      sections: [
        {
          label: 'OSCILLATOR 1',
          columns: 3,
          controls: [
            { type: 'knob', key: 'osc1Waveform', label: 'WAVE', color: '#33ccff', min: 0, max: 1, defaultValue: 0, formatValue: (v) => WAVE_NAMES[Math.round(v * 4)] || '?' },
            { type: 'knob', key: 'osc1Coarse', label: 'COARSE', color: '#ffcc33', min: 0, max: 1, defaultValue: 0.5, formatValue: (v) => `${Math.round((v - 0.5) * 48)}st` },
            { type: 'knob', key: 'osc1Fine', label: 'FINE', color: '#ffcc33', min: 0, max: 1, defaultValue: 0.5, formatValue: (v) => `${Math.round((v - 0.5) * 200)}c` },
          ],
        },
        {
          label: 'OSCILLATOR 2',
          columns: 3,
          controls: [
            { type: 'knob', key: 'osc2Waveform', label: 'WAVE', color: '#ff6633', min: 0, max: 1, defaultValue: 0, formatValue: (v) => WAVE_NAMES[Math.round(v * 4)] || '?' },
            { type: 'knob', key: 'osc2Coarse', label: 'COARSE', color: '#ffcc33', min: 0, max: 1, defaultValue: 0.5, formatValue: (v) => `${Math.round((v - 0.5) * 48)}st` },
            { type: 'knob', key: 'osc2Fine', label: 'FINE', color: '#ffcc33', min: 0, max: 1, defaultValue: 0.5, formatValue: (v) => `${Math.round((v - 0.5) * 200)}c` },
          ],
        },
        {
          label: 'FM',
          columns: 4,
          controls: [
            { type: 'knob', key: 'fmAmount', label: 'AMOUNT', color: '#cc66ff', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
            { type: 'knob', key: 'fmCoarse', label: 'RATIO', color: '#cc66ff', min: 0, max: 1, defaultValue: 0.125, formatValue: (v) => `${Math.max(1, Math.round(v * 16))}:1` },
            { type: 'knob', key: 'fmFine', label: 'FINE', color: '#cc66ff', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'feedback', label: 'FDBK', color: '#cc66ff', min: 0, max: 1, defaultValue: 0.1, formatValue: fmtPct },
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
          controls: [
            { type: 'knob', key: 'attack1', label: 'ATTACK', color: '#66ff99', min: 0, max: 1, defaultValue: 0.01, formatValue: fmtPct },
            { type: 'knob', key: 'decay1', label: 'DECAY', color: '#66ff99', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
            { type: 'knob', key: 'sustain1', label: 'SUSTAIN', color: '#66ff99', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'release1', label: 'RELEASE', color: '#66ff99', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
          ],
        },
        {
          label: 'MODULATOR ENVELOPE',
          columns: 4,
          controls: [
            { type: 'knob', key: 'attack2', label: 'ATTACK', color: '#ff9933', min: 0, max: 1, defaultValue: 0.01, formatValue: fmtPct },
            { type: 'knob', key: 'decay2', label: 'DECAY', color: '#ff9933', min: 0, max: 1, defaultValue: 0.2, formatValue: fmtPct },
            { type: 'knob', key: 'sustain2', label: 'SUSTAIN', color: '#ff9933', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
            { type: 'knob', key: 'release2', label: 'RELEASE', color: '#ff9933', min: 0, max: 1, defaultValue: 0.2, formatValue: fmtPct },
          ],
        },
        {
          label: 'MASTER',
          columns: 4,
          controls: [
            { type: 'knob', key: 'gain', label: 'GAIN', color: '#66ff99', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'voices', label: 'VOICES', color: '#ffcc33', min: 0, max: 1, defaultValue: 0.125, formatValue: (v) => `${Math.max(1, Math.round(v * 8))}` },
            { type: 'knob', key: 'detune', label: 'DETUNE', color: '#ffcc33', min: 0, max: 1, defaultValue: 0.1, formatValue: fmtPct },
            { type: 'knob', key: 'spread', label: 'SPREAD', color: '#ffcc33', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
          ],
        },
      ],
    },
  ],
};
