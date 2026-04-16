import type { SynthPanelLayout } from '@/types/synthPanel';

const fmtPct = (v: number) => `${Math.round(v * 100)}%`;
const WAVE_NAMES = ['Saw', 'Pulse', 'Noise'];
const FILT_NAMES = ['LP', 'BP', 'HP', 'Notch'];

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
          controls: [
            { type: 'knob', key: 'waveform', label: 'WAVE', color: '#33ccff', min: 0, max: 1, defaultValue: 0, formatValue: (v) => WAVE_NAMES[Math.round(v * 2)] || '?' },
            { type: 'knob', key: 'pulseWidth', label: 'PW', color: '#33ccff', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'coarse', label: 'COARSE', color: '#ffcc33', min: 0, max: 1, defaultValue: 0.5, formatValue: (v) => `${Math.round((v - 0.5) * 48)}st` },
            { type: 'knob', key: 'fine', label: 'FINE', color: '#ffcc33', min: 0, max: 1, defaultValue: 0.5, formatValue: (v) => `${Math.round((v - 0.5) * 200)}c` },
          ],
        },
        {
          label: 'FILTER',
          columns: 4,
          controls: [
            { type: 'knob', key: 'filterType', label: 'TYPE', color: '#ff6633', min: 0, max: 1, defaultValue: 0, formatValue: (v) => FILT_NAMES[Math.round(v * 3)] || '?' },
            { type: 'knob', key: 'cutoff', label: 'CUTOFF', color: '#ff6633', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'resonance', label: 'RESO', color: '#ff6633', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
            { type: 'knob', key: 'filterEnvAmount', label: 'ENV AMT', color: '#ff6633', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
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
          controls: [
            { type: 'knob', key: 'ampAttack', label: 'ATTACK', color: '#66ff99', min: 0, max: 1, defaultValue: 0.01, formatValue: fmtPct },
            { type: 'knob', key: 'ampDecay', label: 'DECAY', color: '#66ff99', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
            { type: 'knob', key: 'ampSustain', label: 'SUSTAIN', color: '#66ff99', min: 0, max: 1, defaultValue: 0.7, formatValue: fmtPct },
            { type: 'knob', key: 'ampRelease', label: 'RELEASE', color: '#66ff99', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
          ],
        },
        {
          label: 'FILTER ENVELOPE',
          columns: 4,
          controls: [
            { type: 'knob', key: 'filterAttack', label: 'ATTACK', color: '#cc66ff', min: 0, max: 1, defaultValue: 0.01, formatValue: fmtPct },
            { type: 'knob', key: 'filterDecay', label: 'DECAY', color: '#cc66ff', min: 0, max: 1, defaultValue: 0.2, formatValue: fmtPct },
            { type: 'knob', key: 'filterSustain', label: 'SUSTAIN', color: '#cc66ff', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
            { type: 'knob', key: 'filterRelease', label: 'RELEASE', color: '#cc66ff', min: 0, max: 1, defaultValue: 0.2, formatValue: fmtPct },
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
