import type { SynthPanelLayout } from '@/types/synthPanel';

const fmtPct = (v: number) => `${Math.round(v * 100)}%`;
const fmtBipolarPct = (v: number) => `${Math.round(v * 100)}%`;
const fmtInt = (v: number) => `${Math.round(v)}`;

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
            { type: 'knob', key: 'fmFreq', label: 'FREQ', color: '#ff9900', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'fmSwing', label: 'SWING', color: '#ff9900', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'fmShape', label: 'SHAPE', color: '#ff9900', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
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
            { type: 'knob', key: 'filter1Pan', label: 'PAN', color: '#66ccff', min: -1, max: 1, defaultValue: 0, bipolar: true, formatValue: fmtBipolarPct },
            { type: 'knob', key: 'filter1ModMix', label: 'MOD MIX', color: '#9966ff', min: -1, max: 1, defaultValue: 0, bipolar: true, formatValue: fmtBipolarPct },
            { type: 'knob', key: 'filter1Input0', label: 'IN OSC1', color: '#ff9900', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'filter1Input1', label: 'IN OSC2', color: '#ff9900', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'filter1Input2', label: 'IN OSC3', color: '#ff9900', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
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
            { type: 'knob', key: 'filter2Pan', label: 'PAN', color: '#66ccff', min: -1, max: 1, defaultValue: 0, bipolar: true, formatValue: fmtBipolarPct },
            { type: 'knob', key: 'filter2ModMix', label: 'MOD MIX', color: '#9966ff', min: -1, max: 1, defaultValue: 0, bipolar: true, formatValue: fmtBipolarPct },
            { type: 'knob', key: 'filter2Input0', label: 'IN OSC1', color: '#ff9900', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'filter2Input1', label: 'IN OSC2', color: '#ff9900', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'filter2Input2', label: 'IN OSC3', color: '#ff9900', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
          ],
        },
        {
          label: 'FILTER 3',
          controls: [
            { type: 'select', key: 'filter3Type', label: 'TYPE', options: FILTER_TYPE },
            { type: 'knob', key: 'filter3Cutoff', label: 'CUTOFF', color: '#ffcc00', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'filter3Resonance', label: 'RESO', color: '#ff6600', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
            { type: 'knob', key: 'filter3Distortion', label: 'DIST', color: '#ff3366', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'filter3Output', label: 'OUT', color: '#00ff99', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'filter3Pan', label: 'PAN', color: '#66ccff', min: -1, max: 1, defaultValue: 0, bipolar: true, formatValue: fmtBipolarPct },
            { type: 'knob', key: 'filter3ModMix', label: 'MOD MIX', color: '#9966ff', min: -1, max: 1, defaultValue: 0, bipolar: true, formatValue: fmtBipolarPct },
            { type: 'knob', key: 'filter3Input0', label: 'IN OSC1', color: '#ff9900', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'filter3Input1', label: 'IN OSC2', color: '#ff9900', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'filter3Input2', label: 'IN OSC3', color: '#ff9900', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
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
            { type: 'knob', key: 'env1Shape', label: 'SHAPE', color: '#22c55e', min: -1, max: 1, defaultValue: 0, bipolar: true, formatValue: fmtBipolarPct },
            { type: 'knob', key: 'env1SusTime', label: 'S.TIME', color: '#22c55e', min: 0.004, max: 1, defaultValue: 0.004, formatValue: fmtPct },
          ],
        },
        {
          label: 'ENV 2 (FILTER 2)',
          controls: [
            { type: 'knob', key: 'env2Attack', label: 'ATK', color: '#06b6d4', min: 0, max: 1, defaultValue: 0.01, formatValue: fmtPct },
            { type: 'knob', key: 'env2Decay', label: 'DEC', color: '#06b6d4', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
            { type: 'knob', key: 'env2Sustain', label: 'SUS', color: '#06b6d4', min: 0, max: 1, defaultValue: 0.7, formatValue: fmtPct },
            { type: 'knob', key: 'env2Release', label: 'REL', color: '#06b6d4', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
            { type: 'knob', key: 'env2Shape', label: 'SHAPE', color: '#06b6d4', min: -1, max: 1, defaultValue: 0, bipolar: true, formatValue: fmtBipolarPct },
            { type: 'knob', key: 'env2SusTime', label: 'S.TIME', color: '#06b6d4', min: 0.004, max: 1, defaultValue: 0.004, formatValue: fmtPct },
          ],
        },
        {
          label: 'ENV 3 (FILTER 3)',
          controls: [
            { type: 'knob', key: 'env3Attack', label: 'ATK', color: '#f59e0b', min: 0, max: 1, defaultValue: 0.01, formatValue: fmtPct },
            { type: 'knob', key: 'env3Decay', label: 'DEC', color: '#f59e0b', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
            { type: 'knob', key: 'env3Sustain', label: 'SUS', color: '#f59e0b', min: 0, max: 1, defaultValue: 0.7, formatValue: fmtPct },
            { type: 'knob', key: 'env3Release', label: 'REL', color: '#f59e0b', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
            { type: 'knob', key: 'env3Shape', label: 'SHAPE', color: '#f59e0b', min: -1, max: 1, defaultValue: 0, bipolar: true, formatValue: fmtBipolarPct },
            { type: 'knob', key: 'env3SusTime', label: 'S.TIME', color: '#f59e0b', min: 0.004, max: 1, defaultValue: 0.004, formatValue: fmtPct },
          ],
        },
        {
          label: 'ENV 4 (MAIN AMP)',
          controls: [
            { type: 'knob', key: 'env4Attack', label: 'ATK', color: '#ff3366', min: 0, max: 1, defaultValue: 0.01, formatValue: fmtPct },
            { type: 'knob', key: 'env4Decay', label: 'DEC', color: '#ff3366', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
            { type: 'knob', key: 'env4Sustain', label: 'SUS', color: '#ff3366', min: 0, max: 1, defaultValue: 0.8, formatValue: fmtPct },
            { type: 'knob', key: 'env4Release', label: 'REL', color: '#ff3366', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
            { type: 'knob', key: 'env4Shape', label: 'SHAPE', color: '#ff3366', min: -1, max: 1, defaultValue: 0, bipolar: true, formatValue: fmtBipolarPct },
            { type: 'knob', key: 'env4SusTime', label: 'S.TIME', color: '#ff3366', min: 0.004, max: 1, defaultValue: 0.004, formatValue: fmtPct },
          ],
        },
      ],
    },
    {
      id: 'lfo',
      label: 'LFO',
      sections: [
        {
          label: 'LFO 1',
          controls: [
            { type: 'knob', key: 'lfo1Speed', label: 'SPEED', color: '#9966ff', min: 0, max: 16, defaultValue: 4, formatValue: fmtInt },
            { type: 'knob', key: 'lfo1Wave', label: 'WAVE', color: '#9966ff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'lfo1Phase', label: 'PHASE', color: '#9966ff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
          ],
        },
        {
          label: 'LFO 2',
          controls: [
            { type: 'knob', key: 'lfo2Speed', label: 'SPEED', color: '#06b6d4', min: 0, max: 16, defaultValue: 4, formatValue: fmtInt },
            { type: 'knob', key: 'lfo2Wave', label: 'WAVE', color: '#06b6d4', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'lfo2Phase', label: 'PHASE', color: '#06b6d4', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
          ],
        },
        {
          label: 'LFO 3',
          controls: [
            { type: 'knob', key: 'lfo3Speed', label: 'SPEED', color: '#f59e0b', min: 0, max: 16, defaultValue: 4, formatValue: fmtInt },
            { type: 'knob', key: 'lfo3Wave', label: 'WAVE', color: '#f59e0b', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'lfo3Phase', label: 'PHASE', color: '#f59e0b', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
          ],
        },
      ],
    },
    {
      id: 'fx',
      label: 'FX',
      sections: [
        {
          label: 'REVERB',
          controls: [
            { type: 'knob', key: 'reverbRoom', label: 'ROOM', color: '#cc66ff', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
            { type: 'knob', key: 'reverbMix', label: 'MIX', color: '#cc66ff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
          ],
        },
        {
          label: 'CHORUS',
          controls: [
            { type: 'knob', key: 'chorusMod', label: 'MOD', color: '#33ccff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
          ],
        },
        {
          label: 'DELAY',
          controls: [
            { type: 'knob', key: 'delay', label: 'DELAY', color: '#66ccff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'delayPan', label: 'PAN', color: '#66ccff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
          ],
        },
        {
          label: 'BYPASS',
          controls: [
            { type: 'knob', key: 'eqBypass', label: 'EQ BYP', color: '#999999', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'effectBypass', label: 'FX BYP', color: '#999999', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
          ],
        },
        {
          label: 'MASTER',
          controls: [
            { type: 'knob', key: 'volume', label: 'VOLUME', color: '#00ff99', min: 0, max: 1, defaultValue: 0.7, formatValue: fmtPct },
            { type: 'knob', key: 'distortion', label: 'DIST', color: '#ff3366', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'shape', label: 'SHAPE', color: '#ff9900', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'glide', label: 'GLIDE', color: '#33ccff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'octaveOffset', label: 'OCTAVE', color: '#ffcc00', min: -4, max: 4, defaultValue: 0, bipolar: true, formatValue: fmtInt },
            { type: 'knob', key: 'noteOffset', label: 'NOTE', color: '#ffcc00', min: -12, max: 12, defaultValue: 0, bipolar: true, formatValue: fmtInt },
            { type: 'knob', key: 'speed', label: 'SPEED', color: '#66ccff', min: 20, max: 1000, defaultValue: 200, formatValue: fmtInt },
          ],
        },
      ],
    },
  ],
};
