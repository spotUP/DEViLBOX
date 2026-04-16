import type { SynthPanelLayout } from '@/types/synthPanel';

const fmtPct = (v: number) => `${Math.round(v * 100)}%`;
const fmtBipolar = (v: number) => `${Math.round(v * 100)}%`;

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
    // ── Page 1: DCO 1 ──
    {
      id: 'dco1',
      label: 'DCO 1',
      sections: [
        {
          label: 'OSC A',
          controls: [
            { type: 'select', key: 'dco1Shape1', label: 'WAVE', options: SHAPE_OPTIONS },
            { type: 'knob', key: 'dco1Width1', label: 'WIDTH', color: '#ff9900', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
          ],
        },
        {
          label: 'OSC B',
          controls: [
            { type: 'select', key: 'dco1Shape2', label: 'WAVE', options: SHAPE_OPTIONS },
            { type: 'knob', key: 'dco1Width2', label: 'WIDTH', color: '#ff9900', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
          ],
        },
        {
          label: 'PITCH & MIX',
          controls: [
            { type: 'select', key: 'dco1Octave', label: 'OCTAVE', options: OCTAVE_OPTIONS },
            { type: 'knob', key: 'dco1Tuning', label: 'TUNE', color: '#ffcc00', min: -1, max: 1, defaultValue: 0, bipolar: true, formatValue: fmtBipolar },
            { type: 'knob', key: 'dco1Detune', label: 'DETUNE', color: '#ffcc00', min: 0, max: 1, defaultValue: 0.1, formatValue: fmtPct },
            { type: 'knob', key: 'dco1Balance', label: 'BAL', color: '#66ccff', min: -1, max: 1, defaultValue: 0, bipolar: true, formatValue: fmtBipolar },
            { type: 'knob', key: 'dco1Glide', label: 'GLIDE', color: '#33ccff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'toggle', key: 'dco1Sync', label: 'SYNC', labels: ['OFF', 'ON'] },
            { type: 'knob', key: 'dco1RingMod', label: 'RING', color: '#cc66ff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'dco1Phase', label: 'PHASE', color: '#cc66ff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'dco1Panning', label: 'PAN', color: '#66ccff', min: -1, max: 1, defaultValue: 0, bipolar: true, formatValue: fmtBipolar },
            { type: 'knob', key: 'dco1Velocity', label: 'VEL', color: '#ff3366', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
          ],
        },
      ],
    },
    // ── Page 1: DCF 1 ──
    {
      id: 'dcf1',
      label: 'DCF 1',
      sections: [
        {
          label: 'FILTER',
          controls: [
            { type: 'select', key: 'dcf1Type', label: 'TYPE', options: FILTER_TYPE },
            { type: 'select', key: 'dcf1Slope', label: 'SLOPE', options: SLOPE_OPTIONS },
            { type: 'knob', key: 'dcf1Cutoff', label: 'CUTOFF', color: '#ffcc00', min: 0, max: 1, defaultValue: 0.75, formatValue: fmtPct },
            { type: 'knob', key: 'dcf1Reso', label: 'RESO', color: '#ff6600', min: 0, max: 1, defaultValue: 0.2, formatValue: fmtPct },
            { type: 'knob', key: 'dcf1Envelope', label: 'ENV', color: '#22c55e', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'dcf1KeyFollow', label: 'KEY FLW', color: '#66ccff', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'dcf1Velocity', label: 'VEL', color: '#ff3366', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
          ],
        },
        {
          label: 'FILTER ENVELOPE',
          controls: [
            { type: 'knob', key: 'dcf1Attack', label: 'ATK', color: '#22c55e', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'dcf1Decay', label: 'DEC', color: '#22c55e', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
            { type: 'knob', key: 'dcf1Sustain', label: 'SUS', color: '#22c55e', min: 0, max: 1, defaultValue: 0.6, formatValue: fmtPct },
            { type: 'knob', key: 'dcf1Release', label: 'REL', color: '#22c55e', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
          ],
        },
      ],
    },
    // ── Page 1: DCA 1 ──
    {
      id: 'dca1',
      label: 'DCA 1',
      sections: [
        {
          label: 'AMP ENVELOPE',
          controls: [
            { type: 'knob', key: 'dca1Volume', label: 'VOLUME', color: '#00ff99', min: 0, max: 1, defaultValue: 0.8, formatValue: fmtPct },
            { type: 'knob', key: 'dca1Attack', label: 'ATK', color: '#ff3366', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'dca1Decay', label: 'DEC', color: '#ff3366', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
            { type: 'knob', key: 'dca1Sustain', label: 'SUS', color: '#ff3366', min: 0, max: 1, defaultValue: 0.8, formatValue: fmtPct },
            { type: 'knob', key: 'dca1Release', label: 'REL', color: '#ff3366', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
            { type: 'knob', key: 'dca1Velocity', label: 'VEL', color: '#ff3366', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
          ],
        },
        {
          label: 'LFO 1',
          controls: [
            { type: 'select', key: 'lfo1Shape', label: 'WAVE', options: LFO_SHAPE },
            { type: 'knob', key: 'lfo1Bpm', label: 'RATE', color: '#9966ff', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
            { type: 'knob', key: 'lfo1Width', label: 'WIDTH', color: '#9966ff', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'lfo1Pitch', label: 'PITCH', color: '#cc66ff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'lfo1Cutoff', label: 'CUTOFF', color: '#cc66ff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'lfo1Reso', label: 'RESO', color: '#cc66ff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'lfo1Panning', label: 'PAN', color: '#cc66ff', min: -1, max: 1, defaultValue: 0, bipolar: true, formatValue: fmtBipolar },
            { type: 'knob', key: 'lfo1Volume', label: 'VOL', color: '#cc66ff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'toggle', key: 'lfo1Sync', label: 'SYNC', labels: ['OFF', 'ON'] },
          ],
        },
      ],
    },
    // ── Page 2: DCO 2 ──
    {
      id: 'dco2',
      label: 'DCO 2',
      sections: [
        {
          label: 'OSC A',
          controls: [
            { type: 'select', key: 'dco2Shape1', label: 'WAVE', options: SHAPE_OPTIONS },
            { type: 'knob', key: 'dco2Width1', label: 'WIDTH', color: '#ff9900', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
          ],
        },
        {
          label: 'OSC B',
          controls: [
            { type: 'select', key: 'dco2Shape2', label: 'WAVE', options: SHAPE_OPTIONS },
            { type: 'knob', key: 'dco2Width2', label: 'WIDTH', color: '#ff9900', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
          ],
        },
        {
          label: 'PITCH & MIX',
          controls: [
            { type: 'select', key: 'dco2Octave', label: 'OCTAVE', options: OCTAVE_OPTIONS },
            { type: 'knob', key: 'dco2Tuning', label: 'TUNE', color: '#ffcc00', min: -1, max: 1, defaultValue: 0, bipolar: true, formatValue: fmtBipolar },
            { type: 'knob', key: 'dco2Detune', label: 'DETUNE', color: '#ffcc00', min: 0, max: 1, defaultValue: 0.1, formatValue: fmtPct },
            { type: 'knob', key: 'dco2Balance', label: 'BAL', color: '#66ccff', min: -1, max: 1, defaultValue: 0, bipolar: true, formatValue: fmtBipolar },
            { type: 'knob', key: 'dco2Glide', label: 'GLIDE', color: '#33ccff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'toggle', key: 'dco2Sync', label: 'SYNC', labels: ['OFF', 'ON'] },
            { type: 'knob', key: 'dco2RingMod', label: 'RING', color: '#cc66ff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'dco2Phase', label: 'PHASE', color: '#cc66ff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'dco2Panning', label: 'PAN', color: '#66ccff', min: -1, max: 1, defaultValue: 0, bipolar: true, formatValue: fmtBipolar },
            { type: 'knob', key: 'dco2Velocity', label: 'VEL', color: '#ff3366', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
          ],
        },
      ],
    },
    // ── Page 2: DCF 2 ──
    {
      id: 'dcf2',
      label: 'DCF 2',
      sections: [
        {
          label: 'FILTER',
          controls: [
            { type: 'select', key: 'dcf2Type', label: 'TYPE', options: FILTER_TYPE },
            { type: 'select', key: 'dcf2Slope', label: 'SLOPE', options: SLOPE_OPTIONS },
            { type: 'knob', key: 'dcf2Cutoff', label: 'CUTOFF', color: '#ffcc00', min: 0, max: 1, defaultValue: 0.75, formatValue: fmtPct },
            { type: 'knob', key: 'dcf2Reso', label: 'RESO', color: '#ff6600', min: 0, max: 1, defaultValue: 0.2, formatValue: fmtPct },
            { type: 'knob', key: 'dcf2Envelope', label: 'ENV', color: '#22c55e', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'dcf2KeyFollow', label: 'KEY FLW', color: '#66ccff', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'dcf2Velocity', label: 'VEL', color: '#ff3366', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
          ],
        },
        {
          label: 'FILTER ENVELOPE',
          controls: [
            { type: 'knob', key: 'dcf2Attack', label: 'ATK', color: '#22c55e', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'dcf2Decay', label: 'DEC', color: '#22c55e', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
            { type: 'knob', key: 'dcf2Sustain', label: 'SUS', color: '#22c55e', min: 0, max: 1, defaultValue: 0.6, formatValue: fmtPct },
            { type: 'knob', key: 'dcf2Release', label: 'REL', color: '#22c55e', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
          ],
        },
      ],
    },
    // ── Page 2: DCA 2 ──
    {
      id: 'dca2',
      label: 'DCA 2',
      sections: [
        {
          label: 'AMP ENVELOPE',
          controls: [
            { type: 'knob', key: 'dca2Volume', label: 'VOLUME', color: '#00ff99', min: 0, max: 1, defaultValue: 0.8, formatValue: fmtPct },
            { type: 'knob', key: 'dca2Attack', label: 'ATK', color: '#ff3366', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'dca2Decay', label: 'DEC', color: '#ff3366', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
            { type: 'knob', key: 'dca2Sustain', label: 'SUS', color: '#ff3366', min: 0, max: 1, defaultValue: 0.8, formatValue: fmtPct },
            { type: 'knob', key: 'dca2Release', label: 'REL', color: '#ff3366', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
            { type: 'knob', key: 'dca2Velocity', label: 'VEL', color: '#ff3366', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
          ],
        },
        {
          label: 'LFO 2',
          controls: [
            { type: 'select', key: 'lfo2Shape', label: 'WAVE', options: LFO_SHAPE },
            { type: 'knob', key: 'lfo2Bpm', label: 'RATE', color: '#9966ff', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
            { type: 'knob', key: 'lfo2Width', label: 'WIDTH', color: '#9966ff', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'lfo2Pitch', label: 'PITCH', color: '#cc66ff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'lfo2Cutoff', label: 'CUTOFF', color: '#cc66ff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'lfo2Reso', label: 'RESO', color: '#cc66ff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'lfo2Panning', label: 'PAN', color: '#cc66ff', min: -1, max: 1, defaultValue: 0, bipolar: true, formatValue: fmtBipolar },
            { type: 'knob', key: 'lfo2Volume', label: 'VOL', color: '#cc66ff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'toggle', key: 'lfo2Sync', label: 'SYNC', labels: ['OFF', 'ON'] },
          ],
        },
      ],
    },
    // ── Effects ──
    {
      id: 'fx',
      label: 'FX',
      sections: [
        {
          label: 'CHORUS',
          controls: [
            { type: 'knob', key: 'chorusWet', label: 'WET', color: '#33ccff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'chorusMod', label: 'MOD', color: '#33ccff', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'chorusDelay', label: 'DELAY', color: '#33ccff', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
            { type: 'knob', key: 'chorusFeedback', label: 'FDBK', color: '#33ccff', min: -1, max: 1, defaultValue: 0, bipolar: true, formatValue: fmtBipolar },
            { type: 'knob', key: 'chorusRate', label: 'RATE', color: '#33ccff', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
          ],
        },
        {
          label: 'FLANGER',
          controls: [
            { type: 'knob', key: 'flangerWet', label: 'WET', color: '#33ffcc', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'flangerDelay', label: 'DELAY', color: '#33ffcc', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
            { type: 'knob', key: 'flangerFeedback', label: 'FDBK', color: '#33ffcc', min: -1, max: 1, defaultValue: 0, bipolar: true, formatValue: fmtBipolar },
            { type: 'knob', key: 'flangerDaft', label: 'DAFT', color: '#33ffcc', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
          ],
        },
        {
          label: 'PHASER',
          controls: [
            { type: 'knob', key: 'phaserWet', label: 'WET', color: '#ff66cc', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'phaserRate', label: 'RATE', color: '#ff66cc', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
            { type: 'knob', key: 'phaserFeedback', label: 'FDBK', color: '#ff66cc', min: -1, max: 1, defaultValue: 0, bipolar: true, formatValue: fmtBipolar },
            { type: 'knob', key: 'phaserDepth', label: 'DEPTH', color: '#ff66cc', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'phaserDaft', label: 'DAFT', color: '#ff66cc', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
          ],
        },
        {
          label: 'DELAY',
          controls: [
            { type: 'knob', key: 'delayWet', label: 'WET', color: '#66ccff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'delayDelay', label: 'TIME', color: '#66ccff', min: 0, max: 1, defaultValue: 0.4, formatValue: fmtPct },
            { type: 'knob', key: 'delayFeedback', label: 'FDBK', color: '#66ccff', min: -1, max: 1, defaultValue: 0.3, bipolar: true, formatValue: fmtBipolar },
            { type: 'knob', key: 'delayBpm', label: 'BPM', color: '#66ccff', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
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
