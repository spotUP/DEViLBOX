import type { SynthPanelLayout } from '@/types/synthPanel';

const fmtPct = (v: number) => `${Math.round(v * 100)}%`;
const fmtMs = (v: number) => `${Math.round(v * 2500)}ms`;
const fmtHz = (v: number) => `${v.toFixed(1)} Hz`;

export const AMSYNTH_LAYOUT: SynthPanelLayout = {
  name: 'AMSynth',
  configKey: 'amsynth',
  tabs: [
    {
      id: 'osc',
      label: 'OSC',
      sections: [
        {
          label: 'OSCILLATOR 1',
          controls: [
            { type: 'select', key: 'osc1Waveform', label: 'WAVE', options: [
              { value: '0', label: 'Sine' }, { value: '1', label: 'Pulse' },
              { value: '2', label: 'Saw' }, { value: '3', label: 'Noise' }, { value: '4', label: 'Random' },
            ]},
            { type: 'knob', key: 'osc1Pulsewidth', label: 'PW', color: '#ff9900', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
          ],
        },
        {
          label: 'OSCILLATOR 2',
          controls: [
            { type: 'select', key: 'osc2Waveform', label: 'WAVE', options: [
              { value: '0', label: 'Sine' }, { value: '1', label: 'Pulse' },
              { value: '2', label: 'Saw' }, { value: '3', label: 'Noise' }, { value: '4', label: 'Random' },
            ]},
            { type: 'knob', key: 'osc2Pulsewidth', label: 'PW', color: '#ff9900', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'osc2Detune', label: 'DETUNE', color: '#ffcc00', min: -1, max: 1, defaultValue: 0, bipolar: true, formatValue: (v) => `${Math.round(v * 100)} ct` },
            { type: 'select', key: 'osc2Pitch', label: 'PITCH', options: [
              { value: '-12', label: '-12' }, { value: '-11', label: '-11' }, { value: '-10', label: '-10' },
              { value: '-9', label: '-9' }, { value: '-8', label: '-8' }, { value: '-7', label: '-7' },
              { value: '-6', label: '-6' }, { value: '-5', label: '-5' }, { value: '-4', label: '-4' },
              { value: '-3', label: '-3' }, { value: '-2', label: '-2' }, { value: '-1', label: '-1' },
              { value: '0', label: '0' },
              { value: '1', label: '+1' }, { value: '2', label: '+2' }, { value: '3', label: '+3' },
              { value: '4', label: '+4' }, { value: '5', label: '+5' }, { value: '6', label: '+6' },
              { value: '7', label: '+7' }, { value: '8', label: '+8' }, { value: '9', label: '+9' },
              { value: '10', label: '+10' }, { value: '11', label: '+11' }, { value: '12', label: '+12' },
            ]},
            { type: 'select', key: 'osc2Range', label: 'RANGE', options: [
              { value: '-3', label: '-3 oct' }, { value: '-2', label: '-2 oct' }, { value: '-1', label: '-1 oct' },
              { value: '0', label: '0' }, { value: '1', label: '+1 oct' }, { value: '2', label: '+2 oct' },
              { value: '3', label: '+3 oct' }, { value: '4', label: '+4 oct' },
            ]},
            { type: 'toggle', key: 'osc2Sync', label: 'SYNC', labels: ['OFF', 'ON'] },
          ],
        },
        {
          label: 'MIXER',
          controls: [
            { type: 'knob', key: 'oscMix', label: 'MIX', color: '#66ccff', min: -1, max: 1, defaultValue: 0, bipolar: true, formatValue: (v) => v < 0 ? `O1 ${Math.round(-v * 100)}%` : `O2 ${Math.round(v * 100)}%` },
            { type: 'toggle', key: 'oscMixMode', label: 'MODE', labels: ['MIX', 'RING'] },
            { type: 'knob', key: 'masterVol', label: 'VOLUME', color: '#00ff99', min: 0, max: 1, defaultValue: 0.7, formatValue: fmtPct },
          ],
        },
      ],
    },
    {
      id: 'filter',
      label: 'FILTER',
      sections: [
        {
          label: 'FILTER',
          controls: [
            { type: 'select', key: 'filterType', label: 'TYPE', options: [
              { value: '0', label: 'LP' }, { value: '1', label: 'HP' }, { value: '2', label: 'BP' },
              { value: '3', label: 'BS' }, { value: '4', label: 'Bypass' },
            ]},
            { type: 'toggle', key: 'filterSlope', label: 'SLOPE', labels: ['12dB', '24dB'] },
            { type: 'knob', key: 'filterCutoff', label: 'CUTOFF', color: '#ffcc00', min: -0.5, max: 1.5, defaultValue: 0.8, formatValue: fmtPct },
            { type: 'knob', key: 'filterResonance', label: 'RESO', color: '#ff6600', min: 0, max: 0.97, defaultValue: 0.3, formatValue: (v) => `${Math.round(v * 100)}%` },
            { type: 'knob', key: 'filterEnvAmount', label: 'ENV AMT', color: '#22c55e', min: -16, max: 16, defaultValue: 4, bipolar: true, formatValue: (v) => `${v.toFixed(1)} oct` },
            { type: 'knob', key: 'filterKbdTrack', label: 'KBD TRK', color: '#66ccff', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'filterVelSens', label: 'VEL', color: '#66ccff', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
          ],
        },
        {
          label: 'FILTER ENVELOPE',
          controls: [
            { type: 'knob', key: 'filterAttack', label: 'ATK', color: '#22c55e', min: 0, max: 2.5, defaultValue: 0.01, formatValue: fmtMs },
            { type: 'knob', key: 'filterDecay', label: 'DEC', color: '#22c55e', min: 0, max: 2.5, defaultValue: 0.5, formatValue: fmtMs },
            { type: 'knob', key: 'filterSustain', label: 'SUS', color: '#22c55e', min: 0, max: 1, defaultValue: 0.8, formatValue: fmtPct },
            { type: 'knob', key: 'filterRelease', label: 'REL', color: '#22c55e', min: 0, max: 2.5, defaultValue: 0.3, formatValue: fmtMs },
          ],
        },
      ],
    },
    {
      id: 'amp',
      label: 'AMP',
      sections: [
        {
          label: 'AMP ENVELOPE',
          controls: [
            { type: 'knob', key: 'ampAttack', label: 'ATK', color: '#ff3366', min: 0, max: 2.5, defaultValue: 0.01, formatValue: fmtMs },
            { type: 'knob', key: 'ampDecay', label: 'DEC', color: '#ff3366', min: 0, max: 2.5, defaultValue: 0.5, formatValue: fmtMs },
            { type: 'knob', key: 'ampSustain', label: 'SUS', color: '#ff3366', min: 0, max: 1, defaultValue: 0.8, formatValue: fmtPct },
            { type: 'knob', key: 'ampRelease', label: 'REL', color: '#ff3366', min: 0, max: 2.5, defaultValue: 0.3, formatValue: fmtMs },
            { type: 'knob', key: 'ampVelSens', label: 'VEL', color: '#66ccff', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
          ],
        },
        {
          label: 'LFO',
          controls: [
            { type: 'select', key: 'lfoWaveform', label: 'WAVE', options: [
              { value: '0', label: 'Sine' }, { value: '1', label: 'Square' }, { value: '2', label: 'Saw Up' },
              { value: '3', label: 'Saw Dn' }, { value: '4', label: 'Noise' }, { value: '5', label: 'Random' }, { value: '6', label: 'S&H' },
            ]},
            { type: 'knob', key: 'lfoFreq', label: 'RATE', color: '#9966ff', min: 0, max: 7.5, defaultValue: 3, formatValue: fmtHz },
            { type: 'knob', key: 'freqModAmount', label: 'PITCH', color: '#cc66ff', min: 0, max: 1.26, defaultValue: 0, formatValue: fmtPct },
            { type: 'select', key: 'freqModOsc', label: 'FM OSC', options: [
              { value: '0', label: 'Both' }, { value: '1', label: 'Osc1' }, { value: '2', label: 'Osc2' },
            ]},
            { type: 'knob', key: 'filterModAmount', label: 'FILTER', color: '#cc66ff', min: -1, max: 1, defaultValue: 0, bipolar: true, formatValue: (v) => `${Math.round(v * 100)}%` },
            { type: 'knob', key: 'ampModAmount', label: 'AMP', color: '#cc66ff', min: -1, max: 1, defaultValue: 0, bipolar: true, formatValue: (v) => `${Math.round(v * 100)}%` },
          ],
        },
      ],
    },
    {
      id: 'fx',
      label: 'FX',
      sections: [
        {
          label: 'DISTORTION',
          controls: [
            { type: 'knob', key: 'distortionCrunch', label: 'CRUNCH', color: '#ff3366', min: 0, max: 0.9, defaultValue: 0, formatValue: fmtPct },
          ],
        },
        {
          label: 'REVERB',
          controls: [
            { type: 'knob', key: 'reverbWet', label: 'WET', color: '#33ccff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'reverbRoomsize', label: 'SIZE', color: '#33ccff', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'reverbDamp', label: 'DAMP', color: '#33ccff', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'reverbWidth', label: 'WIDTH', color: '#33ccff', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
          ],
        },
        {
          label: 'PERFORMANCE',
          controls: [
            { type: 'select', key: 'keyboardMode', label: 'MODE', options: [
              { value: '0', label: 'Poly' }, { value: '1', label: 'Mono' }, { value: '2', label: 'Legato' },
            ]},
            { type: 'knob', key: 'portamentoTime', label: 'PORTA', color: '#66ccff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'toggle', key: 'portamentoMode', label: 'PORT MODE', labels: ['ALWAYS', 'LEGATO'] },
          ],
        },
      ],
    },
  ],
};
