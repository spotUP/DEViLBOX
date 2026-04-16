import type { SynthPanelLayout } from '@/types/synthPanel';

const fmtPct = (v: number) => `${Math.round(v * 100)}%`;
const fmtHz = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)} Hz`;
const fmtMs = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`;

const WAVE_OPTIONS = [
  { value: '0', label: 'Saw' }, { value: '1', label: 'Square' }, { value: '2', label: 'Pulse' },
  { value: '3', label: 'Sine' }, { value: '4', label: 'Triangle' }, { value: '5', label: 'Varistep' },
  { value: '6', label: 'Skew Saw' }, { value: '7', label: 'Skew Sqr' }, { value: '8', label: 'Var Tri' },
  { value: '9', label: 'S.Saw' }, { value: '10', label: 'S.Sqr' }, { value: '11', label: 'S.Sine' },
  { value: '12', label: 'Brass' }, { value: '13', label: 'Reed' }, { value: '14', label: 'Organ' },
  { value: '15', label: 'Noise' },
];
const FILTER_OPTIONS = [
  { value: '0', label: 'LP 12' }, { value: '1', label: 'LP 24' }, { value: '2', label: '2xLP12' },
  { value: '3', label: 'HP 12' }, { value: '4', label: 'LP+Notch' }, { value: '5', label: 'HP+Notch' },
  { value: '6', label: 'BP 6' }, { value: '7', label: '2xBP6' },
];

export const CALF_MONO_LAYOUT: SynthPanelLayout = {
  name: 'Calf Mono',
  configKey: 'calfMono',
  tabs: [
    {
      id: 'osc',
      label: 'OSC',
      sections: [
        {
          label: 'OSCILLATOR 1',
          controls: [
            { type: 'select', key: 'o1Wave', label: 'WAVE', options: WAVE_OPTIONS },
            { type: 'knob', key: 'o1Pw', label: 'PW', color: '#ff9900', min: -1, max: 1, defaultValue: 0, bipolar: true, formatValue: (v) => `${Math.round(v * 100)}%` },
            { type: 'knob', key: 'o1Xpose', label: 'XPOSE', color: '#ffcc00', min: -24, max: 24, defaultValue: 0, bipolar: true, formatValue: (v) => `${Math.round(v)} st` },
            { type: 'knob', key: 'o1Stretch', label: 'STRETCH', color: '#66ccff', min: 1, max: 16, defaultValue: 1, formatValue: (v) => `${Math.round(v)}x` },
            { type: 'knob', key: 'o1Window', label: 'WINDOW', color: '#66ccff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
          ],
        },
        {
          label: 'OSCILLATOR 2',
          controls: [
            { type: 'select', key: 'o2Wave', label: 'WAVE', options: WAVE_OPTIONS },
            { type: 'knob', key: 'o2Pw', label: 'PW', color: '#ff9900', min: -1, max: 1, defaultValue: 0, bipolar: true, formatValue: (v) => `${Math.round(v * 100)}%` },
            { type: 'knob', key: 'o2Xpose', label: 'XPOSE', color: '#ffcc00', min: -24, max: 24, defaultValue: 0, bipolar: true, formatValue: (v) => `${Math.round(v)} st` },
            { type: 'knob', key: 'o2Unison', label: 'UNISON', color: '#cc66ff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'o2UnisonFrq', label: 'UNI FRQ', color: '#cc66ff', min: 0.01, max: 20, defaultValue: 0.5, formatValue: (v) => `${v.toFixed(1)} Hz` },
          ],
        },
        {
          label: 'MIX',
          controls: [
            { type: 'knob', key: 'o12Mix', label: 'MIX', color: '#66ccff', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'o12Detune', label: 'DETUNE', color: '#ffcc00', min: 0, max: 100, defaultValue: 10, formatValue: (v) => `${Math.round(v)} ct` },
            { type: 'select', key: 'phaseMode', label: 'PHASE', options: [
              { value: '0', label: 'Free' }, { value: '1', label: 'On Note' }, { value: '2', label: 'Random' },
              { value: '3', label: 'Sync' }, { value: '4', label: 'Phase 4' }, { value: '5', label: 'Phase 5' },
            ]},
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
            { type: 'select', key: 'filter', label: 'TYPE', options: FILTER_OPTIONS },
            { type: 'knob', key: 'cutoff', label: 'CUTOFF', color: '#ffcc00', min: 10, max: 16000, defaultValue: 2000, formatValue: fmtHz },
            { type: 'knob', key: 'res', label: 'RESO', color: '#ff6600', min: 0.7, max: 8, defaultValue: 1.5, formatValue: (v) => `${v.toFixed(1)}` },
            { type: 'knob', key: 'filterSep', label: 'SEP', color: '#33ccff', min: -2400, max: 2400, defaultValue: 0, bipolar: true, formatValue: (v) => `${Math.round(v)} ct` },
            { type: 'knob', key: 'keyFollow', label: 'KEY FLW', color: '#66ccff', min: 0, max: 2, defaultValue: 0.5, formatValue: (v) => `${Math.round(v * 100)}%` },
          ],
        },
        {
          label: 'EG1 (FILTER)',
          controls: [
            { type: 'knob', key: 'adsrA', label: 'ATK', color: '#22c55e', min: 1, max: 20000, defaultValue: 5, formatValue: fmtMs },
            { type: 'knob', key: 'adsrD', label: 'DEC', color: '#22c55e', min: 10, max: 20000, defaultValue: 200, formatValue: fmtMs },
            { type: 'knob', key: 'adsrS', label: 'SUS', color: '#22c55e', min: 0, max: 1, defaultValue: 0.7, formatValue: fmtPct },
            { type: 'knob', key: 'adsrR', label: 'REL', color: '#22c55e', min: 10, max: 20000, defaultValue: 200, formatValue: fmtMs },
            { type: 'knob', key: 'env2cutoff', label: 'CUTOFF', color: '#22c55e', min: -10800, max: 10800, defaultValue: 4000, bipolar: true, formatValue: (v) => `${Math.round(v)} ct` },
            { type: 'knob', key: 'env2res', label: 'RESO', color: '#22c55e', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'toggle', key: 'env2amp', label: 'AMP', labels: ['OFF', 'ON'] },
            { type: 'knob', key: 'adsrF', label: 'FADE', color: '#22c55e', min: -10000, max: 10000, defaultValue: 0, bipolar: true, formatValue: (v) => `${Math.round(v)}` },
          ],
        },
        {
          label: 'EG2 (MOD)',
          controls: [
            { type: 'knob', key: 'adsr2A', label: 'ATK', color: '#cc66ff', min: 1, max: 20000, defaultValue: 5, formatValue: fmtMs },
            { type: 'knob', key: 'adsr2D', label: 'DEC', color: '#cc66ff', min: 10, max: 20000, defaultValue: 200, formatValue: fmtMs },
            { type: 'knob', key: 'adsr2S', label: 'SUS', color: '#cc66ff', min: 0, max: 1, defaultValue: 0.7, formatValue: fmtPct },
            { type: 'knob', key: 'adsr2R', label: 'REL', color: '#cc66ff', min: 10, max: 20000, defaultValue: 200, formatValue: fmtMs },
            { type: 'knob', key: 'adsr2F', label: 'FADE', color: '#cc66ff', min: -10000, max: 10000, defaultValue: 0, bipolar: true, formatValue: (v) => `${Math.round(v)}` },
            { type: 'knob', key: 'adsr2Cutoff', label: 'CUTOFF', color: '#cc66ff', min: -10800, max: 10800, defaultValue: 0, bipolar: true, formatValue: (v) => `${Math.round(v)} ct` },
            { type: 'knob', key: 'adsr2Res', label: 'RESO', color: '#cc66ff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'toggle', key: 'adsr2Amp', label: 'AMP', labels: ['OFF', 'ON'] },
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
            { type: 'knob', key: 'lfoRate', label: 'RATE', color: '#9966ff', min: 0.01, max: 20, defaultValue: 2, formatValue: (v) => `${v.toFixed(1)} Hz` },
            { type: 'knob', key: 'lfoDelay', label: 'DELAY', color: '#9966ff', min: 0, max: 5, defaultValue: 0, formatValue: (v) => `${v.toFixed(1)}s` },
            { type: 'knob', key: 'lfo2filter', label: 'FILTER', color: '#cc66ff', min: -4800, max: 4800, defaultValue: 0, bipolar: true, formatValue: (v) => `${Math.round(v)} ct` },
            { type: 'knob', key: 'lfo2pitch', label: 'PITCH', color: '#cc66ff', min: 0, max: 1200, defaultValue: 0, formatValue: (v) => `${Math.round(v)} ct` },
            { type: 'knob', key: 'lfo2pw', label: 'PW', color: '#cc66ff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'mwhl2lfo', label: 'MWHL', color: '#cc66ff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'select', key: 'lfo1Trig', label: 'TRIG', options: [
              { value: '0', label: 'Free' }, { value: '1', label: 'Retrig' },
            ]},
          ],
        },
        {
          label: 'LFO 2',
          controls: [
            { type: 'knob', key: 'lfo2Rate', label: 'RATE', color: '#06b6d4', min: 0.01, max: 20, defaultValue: 2, formatValue: (v) => `${v.toFixed(1)} Hz` },
            { type: 'knob', key: 'lfo2Delay', label: 'DELAY', color: '#06b6d4', min: 0.1, max: 5, defaultValue: 0.1, formatValue: (v) => `${v.toFixed(1)}s` },
            { type: 'select', key: 'lfo2Trig', label: 'TRIG', options: [
              { value: '0', label: 'Free' }, { value: '1', label: 'Retrig' },
            ]},
          ],
        },
        {
          label: 'PERFORMANCE',
          controls: [
            { type: 'knob', key: 'portamento', label: 'PORTA', color: '#33ccff', min: 1, max: 2000, defaultValue: 10, formatValue: fmtMs },
            { type: 'select', key: 'legato', label: 'LEGATO', options: [
              { value: '0', label: 'Off' }, { value: '1', label: 'On' },
              { value: '2', label: 'Retrig' }, { value: '3', label: 'Fing' },
            ]},
            { type: 'knob', key: 'master', label: 'VOLUME', color: '#00ff99', min: 0, max: 100, defaultValue: 50, formatValue: (v) => `${Math.round(v)}%` },
          ],
        },
        {
          label: 'VELOCITY & TUNING',
          controls: [
            { type: 'knob', key: 'vel2filter', label: 'VEL>FLT', color: '#ff9900', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'vel2amp', label: 'VEL>AMP', color: '#ff9900', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'scaleDetune', label: 'DETUNE', color: '#ffcc00', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'pbendRange', label: 'PB RANGE', color: '#66ccff', min: 0, max: 2400, defaultValue: 200, formatValue: (v) => `${Math.round(v)} ct` },
            { type: 'select', key: 'midi', label: 'MIDI CH', options: [
              { value: '0', label: 'All' },
              { value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' },
              { value: '5', label: '5' }, { value: '6', label: '6' }, { value: '7', label: '7' }, { value: '8', label: '8' },
              { value: '9', label: '9' }, { value: '10', label: '10' }, { value: '11', label: '11' }, { value: '12', label: '12' },
              { value: '13', label: '13' }, { value: '14', label: '14' }, { value: '15', label: '15' }, { value: '16', label: '16' },
            ]},
          ],
        },
      ],
    },
  ],
};
