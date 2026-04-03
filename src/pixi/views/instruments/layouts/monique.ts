import type { SynthPanelLayout } from '../synthPanelTypes';

const fmtPct = (v: number) => `${Math.round(v * 100)}%`;

const WAVE_OPTIONS = [
  { value: '0', label: 'Sine' }, { value: '1', label: 'Saw' },
  { value: '2', label: 'Square' }, { value: '3', label: 'Noise' },
];
const FILTER_TYPE = [
  { value: '1', label: 'LP' }, { value: '2', label: 'HP' }, { value: '3', label: 'BP' },
  { value: '4', label: 'LP+HP' }, { value: '5', label: 'LP+BP' }, { value: '6', label: 'HP+BP' }, { value: '7', label: 'All' },
];

export const MONIQUE_LAYOUT: SynthPanelLayout = {
  name: 'Monique',
  configKey: 'monique',
  tabs: [
    {
      id: 'osc',
      label: 'OSC',
      sections: [
        {
          label: 'OSCILLATOR 1',
          controls: [
            { type: 'select', key: 'osc1Wave', label: 'WAVE', options: WAVE_OPTIONS },
            { type: 'knob', key: 'osc1FmPower', label: 'FM', color: '#ff6600', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'osc1Octave', label: 'OCTAVE', color: '#ffcc00', min: -36, max: 36, defaultValue: 0, bipolar: true, formatValue: (v) => `${Math.round(v)} st` },
            { type: 'toggle', key: 'osc1Sync', label: 'SYNC', labels: ['OFF', 'ON'] },
          ],
        },
        {
          label: 'OSCILLATOR 2',
          controls: [
            { type: 'select', key: 'osc2Wave', label: 'WAVE', options: WAVE_OPTIONS },
            { type: 'knob', key: 'osc2FmPower', label: 'FM', color: '#ff6600', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'osc2Octave', label: 'OCTAVE', color: '#ffcc00', min: -36, max: 36, defaultValue: 0, bipolar: true, formatValue: (v) => `${Math.round(v)} st` },
            { type: 'toggle', key: 'osc2Sync', label: 'SYNC', labels: ['OFF', 'ON'] },
          ],
        },
        {
          label: 'OSCILLATOR 3',
          controls: [
            { type: 'select', key: 'osc3Wave', label: 'WAVE', options: WAVE_OPTIONS },
            { type: 'knob', key: 'osc3FmPower', label: 'FM', color: '#ff6600', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'osc3Octave', label: 'OCTAVE', color: '#ffcc00', min: -36, max: 36, defaultValue: 0, bipolar: true, formatValue: (v) => `${Math.round(v)} st` },
            { type: 'toggle', key: 'osc3Sync', label: 'SYNC', labels: ['OFF', 'ON'] },
          ],
        },
        {
          label: 'FM GLOBAL',
          controls: [
            { type: 'knob', key: 'fmMulti', label: 'MULTI', color: '#ff9900', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'fmSwing', label: 'SWING', color: '#ff9900', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'fmPhase', label: 'PHASE', color: '#ff9900', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'masterShift', label: 'SHIFT', color: '#66ccff', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
          ],
        },
      ],
    },
    {
      id: 'flt',
      label: 'FILTER',
      sections: [
        {
          label: 'FILTER 1',
          controls: [
            { type: 'select', key: 'filter1Type', label: 'TYPE', options: FILTER_TYPE },
            { type: 'knob', key: 'filter1Cutoff', label: 'CUTOFF', color: '#ffcc00', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'filter1Resonance', label: 'RESO', color: '#ff6600', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
            { type: 'knob', key: 'filter1Distortion', label: 'DIST', color: '#ff3366', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'filter1Output', label: 'OUT', color: '#00ff99', min: 0, max: 1, defaultValue: 0.8, formatValue: fmtPct },
            { type: 'knob', key: 'filter1Pan', label: 'PAN', color: '#66ccff', min: -1, max: 1, defaultValue: 0, bipolar: true, formatValue: (v) => `${Math.round(v * 100)}%` },
          ],
        },
        {
          label: 'FILTER 2',
          controls: [
            { type: 'select', key: 'filter2Type', label: 'TYPE', options: FILTER_TYPE },
            { type: 'knob', key: 'filter2Cutoff', label: 'CUTOFF', color: '#ffcc00', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'filter2Resonance', label: 'RESO', color: '#ff6600', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
            { type: 'knob', key: 'filter2Distortion', label: 'DIST', color: '#ff3366', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'filter2Output', label: 'OUT', color: '#00ff99', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
          ],
        },
        {
          label: 'FILTER 3',
          controls: [
            { type: 'select', key: 'filter3Type', label: 'TYPE', options: FILTER_TYPE },
            { type: 'knob', key: 'filter3Cutoff', label: 'CUTOFF', color: '#ffcc00', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'filter3Resonance', label: 'RESO', color: '#ff6600', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
            { type: 'knob', key: 'filter3Output', label: 'OUT', color: '#00ff99', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
          ],
        },
      ],
    },
    {
      id: 'env',
      label: 'ENV',
      sections: [
        {
          label: 'ENV 1 (FILTER 1)',
          controls: [
            { type: 'knob', key: 'env1Attack', label: 'ATK', color: '#22c55e', min: 0, max: 1, defaultValue: 0.01, formatValue: fmtPct },
            { type: 'knob', key: 'env1Decay', label: 'DEC', color: '#22c55e', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
            { type: 'knob', key: 'env1Sustain', label: 'SUS', color: '#22c55e', min: 0, max: 1, defaultValue: 0.7, formatValue: fmtPct },
            { type: 'knob', key: 'env1Release', label: 'REL', color: '#22c55e', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
            { type: 'knob', key: 'env1Shape', label: 'SHAPE', color: '#22c55e', min: -1, max: 1, defaultValue: 0, bipolar: true, formatValue: (v) => `${Math.round(v * 100)}%` },
          ],
        },
        {
          label: 'ENV 4 (MAIN AMP)',
          controls: [
            { type: 'knob', key: 'env4Attack', label: 'ATK', color: '#ff3366', min: 0, max: 1, defaultValue: 0.01, formatValue: fmtPct },
            { type: 'knob', key: 'env4Decay', label: 'DEC', color: '#ff3366', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
            { type: 'knob', key: 'env4Sustain', label: 'SUS', color: '#ff3366', min: 0, max: 1, defaultValue: 0.8, formatValue: fmtPct },
            { type: 'knob', key: 'env4Release', label: 'REL', color: '#ff3366', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
            { type: 'knob', key: 'env4Shape', label: 'SHAPE', color: '#ff3366', min: -1, max: 1, defaultValue: 0, bipolar: true, formatValue: (v) => `${Math.round(v * 100)}%` },
          ],
        },
      ],
    },
    {
      id: 'fx',
      label: 'FX',
      sections: [
        {
          label: 'LFO',
          controls: [
            { type: 'knob', key: 'lfo1Speed', label: 'LFO1 SPD', color: '#9966ff', min: 0, max: 16, defaultValue: 4, formatValue: (v) => `${Math.round(v)}` },
            { type: 'knob', key: 'lfo1Wave', label: 'WAVE', color: '#9966ff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'lfo2Speed', label: 'LFO2 SPD', color: '#06b6d4', min: 0, max: 16, defaultValue: 4, formatValue: (v) => `${Math.round(v)}` },
            { type: 'knob', key: 'lfo2Wave', label: 'WAVE', color: '#06b6d4', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
          ],
        },
        {
          label: 'EFFECTS',
          controls: [
            { type: 'knob', key: 'reverbRoom', label: 'REVERB', color: '#cc66ff', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
            { type: 'knob', key: 'reverbMix', label: 'REV MIX', color: '#cc66ff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'chorusMod', label: 'CHORUS', color: '#33ccff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'delay', label: 'DELAY', color: '#66ccff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
          ],
        },
        {
          label: 'MASTER',
          controls: [
            { type: 'knob', key: 'volume', label: 'VOLUME', color: '#00ff99', min: 0, max: 1, defaultValue: 0.7, formatValue: fmtPct },
            { type: 'knob', key: 'distortion', label: 'DIST', color: '#ff3366', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'glide', label: 'GLIDE', color: '#33ccff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
          ],
        },
      ],
    },
  ],
};
