import type { SynthPanelLayout } from '../synthPanelTypes';

const fmtPct = (v: number) => `${Math.round(v * 100)}%`;

const SHAPE_OPTIONS = [
  { value: '0', label: 'Pulse' }, { value: '1', label: 'Saw' },
  { value: '2', label: 'Sine' }, { value: '3', label: 'Noise' },
];
const LFO_SHAPE = [
  { value: '0', label: 'Tri' }, { value: '1', label: 'Sine' },
  { value: '2', label: 'Saw' }, { value: '3', label: 'Square' }, { value: '4', label: 'S&H' },
];
const FILTER_TYPE = [
  { value: '0', label: 'LPF' }, { value: '1', label: 'BPF' },
  { value: '2', label: 'HPF' }, { value: '3', label: 'BRF' },
];
const SLOPE_OPTIONS = [{ value: '0', label: '12 dB' }, { value: '1', label: '24 dB' }];
const OCTAVE_OPTIONS = Array.from({ length: 9 }, (_, i) => ({ value: `${i - 4}`, label: `${i - 4}` }));

export const SYNTHV1_LAYOUT: SynthPanelLayout = {
  name: 'SynthV1',
  configKey: 'synthv1',
  tabs: [
    {
      id: 'dco',
      label: 'DCO',
      sections: [
        {
          label: 'OSC A',
          controls: [
            { type: 'select', key: 'dco_Shape1', label: 'WAVE', options: SHAPE_OPTIONS },
            { type: 'knob', key: 'dco_Width1', label: 'WIDTH', color: '#ff9900', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
          ],
        },
        {
          label: 'OSC B',
          controls: [
            { type: 'select', key: 'dco_Shape2', label: 'WAVE', options: SHAPE_OPTIONS },
            { type: 'knob', key: 'dco_Width2', label: 'WIDTH', color: '#ff9900', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
          ],
        },
        {
          label: 'PITCH & MIX',
          controls: [
            { type: 'select', key: 'dco_Octave', label: 'OCTAVE', options: OCTAVE_OPTIONS },
            { type: 'knob', key: 'dco_Tuning', label: 'TUNE', color: '#ffcc00', min: -1, max: 1, defaultValue: 0, bipolar: true, formatValue: (v) => `${Math.round(v * 100)}%` },
            { type: 'knob', key: 'dco_Detune', label: 'DETUNE', color: '#ffcc00', min: 0, max: 1, defaultValue: 0.1, formatValue: fmtPct },
            { type: 'knob', key: 'dco_Balance', label: 'BAL', color: '#66ccff', min: -1, max: 1, defaultValue: 0, bipolar: true, formatValue: (v) => `${Math.round(v * 100)}%` },
            { type: 'knob', key: 'dco_Glide', label: 'GLIDE', color: '#33ccff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'toggle', key: 'dco_Sync', label: 'SYNC', labels: ['OFF', 'ON'] },
            { type: 'knob', key: 'dco_RingMod', label: 'RING', color: '#cc66ff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
          ],
        },
      ],
    },
    {
      id: 'dcf',
      label: 'DCF',
      sections: [
        {
          label: 'FILTER',
          controls: [
            { type: 'select', key: 'dcf_Type', label: 'TYPE', options: FILTER_TYPE },
            { type: 'select', key: 'dcf_Slope', label: 'SLOPE', options: SLOPE_OPTIONS },
            { type: 'knob', key: 'dcf_Cutoff', label: 'CUTOFF', color: '#ffcc00', min: 0, max: 1, defaultValue: 0.75, formatValue: fmtPct },
            { type: 'knob', key: 'dcf_Reso', label: 'RESO', color: '#ff6600', min: 0, max: 1, defaultValue: 0.2, formatValue: fmtPct },
            { type: 'knob', key: 'dcf_Envelope', label: 'ENV', color: '#22c55e', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'dcf_KeyFollow', label: 'KEY FLW', color: '#66ccff', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
          ],
        },
        {
          label: 'FILTER ENVELOPE',
          controls: [
            { type: 'knob', key: 'dcf_Attack', label: 'ATK', color: '#22c55e', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'dcf_Decay', label: 'DEC', color: '#22c55e', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
            { type: 'knob', key: 'dcf_Sustain', label: 'SUS', color: '#22c55e', min: 0, max: 1, defaultValue: 0.6, formatValue: fmtPct },
            { type: 'knob', key: 'dcf_Release', label: 'REL', color: '#22c55e', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
          ],
        },
      ],
    },
    {
      id: 'dca',
      label: 'DCA',
      sections: [
        {
          label: 'AMP ENVELOPE',
          controls: [
            { type: 'knob', key: 'dca_Attack', label: 'ATK', color: '#ff3366', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'dca_Decay', label: 'DEC', color: '#ff3366', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
            { type: 'knob', key: 'dca_Sustain', label: 'SUS', color: '#ff3366', min: 0, max: 1, defaultValue: 0.8, formatValue: fmtPct },
            { type: 'knob', key: 'dca_Release', label: 'REL', color: '#ff3366', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
            { type: 'knob', key: 'dca_Volume', label: 'VOLUME', color: '#00ff99', min: 0, max: 1, defaultValue: 0.8, formatValue: fmtPct },
          ],
        },
        {
          label: 'LFO',
          controls: [
            { type: 'select', key: 'lfo_Shape', label: 'WAVE', options: LFO_SHAPE },
            { type: 'knob', key: 'lfo_Bpm', label: 'RATE', color: '#9966ff', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
            { type: 'knob', key: 'lfo_Width', label: 'WIDTH', color: '#9966ff', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'lfo_Pitch', label: 'PITCH', color: '#cc66ff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'lfo_Cutoff', label: 'CUTOFF', color: '#cc66ff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'lfo_Volume', label: 'VOL', color: '#cc66ff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'toggle', key: 'lfo_Sync', label: 'SYNC', labels: ['OFF', 'ON'] },
          ],
        },
      ],
    },
    {
      id: 'fx',
      label: 'FX',
      sections: [
        {
          label: 'CHORUS',
          controls: [
            { type: 'knob', key: 'chorusWet', label: 'WET', color: '#33ccff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'chorusDelay', label: 'DELAY', color: '#33ccff', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
            { type: 'knob', key: 'chorusFeedback', label: 'FDBK', color: '#33ccff', min: -1, max: 1, defaultValue: 0, bipolar: true, formatValue: (v) => `${Math.round(v * 100)}%` },
            { type: 'knob', key: 'chorusRate', label: 'RATE', color: '#33ccff', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
          ],
        },
        {
          label: 'DELAY',
          controls: [
            { type: 'knob', key: 'delayWet', label: 'WET', color: '#66ccff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'delayDelay', label: 'TIME', color: '#66ccff', min: 0, max: 1, defaultValue: 0.4, formatValue: fmtPct },
            { type: 'knob', key: 'delayFeedback', label: 'FDBK', color: '#66ccff', min: -1, max: 1, defaultValue: 0.3, bipolar: true, formatValue: (v) => `${Math.round(v * 100)}%` },
          ],
        },
        {
          label: 'REVERB',
          controls: [
            { type: 'knob', key: 'reverbWet', label: 'WET', color: '#cc66ff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'reverbRoom', label: 'ROOM', color: '#cc66ff', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
          ],
        },
      ],
    },
  ],
};
