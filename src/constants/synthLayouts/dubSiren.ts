import type { SynthPanelLayout } from '@/types/synthPanel';

const fmtHz = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)} Hz`;
const fmtPct = (v: number) => `${Math.round(v)}%`;
const fmtSec = (v: number) => `${v.toFixed(2)}s`;
const fmtDb = (v: number) => `${Math.round(v)}dB`;

export const DUB_SIREN_LAYOUT: SynthPanelLayout = {
  name: 'Dub Siren',
  configKey: 'dubSiren',
  tabs: [
    {
      id: 'main',
      label: 'MAIN',
      sections: [
        {
          label: 'AMP',
          controls: [
            { type: 'knob', key: '~volume', label: 'VOLUME', color: '#00ff99', min: -60, max: 0, defaultValue: -12, formatValue: fmtDb },
            { type: 'knob', key: '~pan', label: 'PAN', color: '#66ccff', min: -100, max: 100, defaultValue: 0, bipolar: true, formatValue: (v) => v === 0 ? 'C' : v > 0 ? `R${Math.round(v)}` : `L${Math.round(-v)}` },
          ],
        },
        {
          label: 'OSCILLATOR',
          controls: [
            { type: 'select', key: 'oscillator.waveform', label: 'WAVEFORM', options: [
              { value: 'sine', label: 'Sine' },
              { value: 'square', label: 'Square' },
              { value: 'sawtooth', label: 'Sawtooth' },
              { value: 'triangle', label: 'Triangle' },
            ]},
            { type: 'knob', key: 'oscillator.frequency', label: 'FREQ', color: '#ff6600', min: 60, max: 1000, defaultValue: 440, formatValue: fmtHz },
          ],
        },
        {
          label: 'LFO / SIREN',
          controls: [
            { type: 'toggle', key: 'lfo.enabled', label: 'ENABLE', labels: ['OFF', 'ON'] },
            { type: 'select', key: 'lfo.waveform', label: 'LFO WAVE', options: [
              { value: 'sine', label: 'Sine' },
              { value: 'square', label: 'Square' },
              { value: 'sawtooth', label: 'Saw' },
              { value: 'triangle', label: 'Triangle' },
            ]},
            { type: 'knob', key: 'lfo.rate', label: 'RATE', color: '#9966ff', min: 0, max: 20, defaultValue: 2, formatValue: (v) => `${v.toFixed(1)} Hz` },
            { type: 'knob', key: 'lfo.depth', label: 'DEPTH', color: '#cc66ff', min: 0, max: 1000, defaultValue: 100, formatValue: (v) => `${Math.round(v)}` },
          ],
        },
      ],
    },
    {
      id: 'fx',
      label: 'FX',
      sections: [
        {
          label: 'DELAY',
          controls: [
            { type: 'toggle', key: 'delay.enabled', label: 'DELAY' },
            { type: 'knob', key: 'delay.time', label: 'TIME', color: '#33ccff', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtSec },
            { type: 'knob', key: 'delay.feedback', label: 'FDBK', color: '#3399ff', min: 0, max: 1, defaultValue: 0.4, formatValue: fmtPct },
            { type: 'knob', key: 'delay.wet', label: 'WET', color: '#66ccff', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
          ],
        },
        {
          label: 'FILTER',
          controls: [
            { type: 'toggle', key: 'filter.enabled', label: 'FILTER' },
            { type: 'select', key: 'filter.type', label: 'TYPE', options: [
              { value: 'lowpass', label: 'Lowpass' },
              { value: 'highpass', label: 'Highpass' },
              { value: 'bandpass', label: 'Bandpass' },
              { value: 'notch', label: 'Notch' },
            ]},
            { type: 'select', key: 'filter.rolloff', label: 'ROLLOFF', options: [
              { value: '-12', label: '-12 dB' },
              { value: '-24', label: '-24 dB' },
              { value: '-48', label: '-48 dB' },
              { value: '-96', label: '-96 dB' },
            ]},
            { type: 'knob', key: 'filter.frequency', label: 'CUTOFF', color: '#ffcc00', min: 20, max: 20000, defaultValue: 2000, formatValue: fmtHz },
          ],
        },
        {
          label: 'REVERB',
          controls: [
            { type: 'toggle', key: 'reverb.enabled', label: 'REVERB' },
            { type: 'knob', key: 'reverb.decay', label: 'DECAY', color: '#cc66ff', min: 0.1, max: 10, defaultValue: 2, formatValue: (v) => `${v.toFixed(1)}s` },
            { type: 'knob', key: 'reverb.wet', label: 'WET', color: '#9966ff', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
          ],
        },
      ],
    },
  ],
};
