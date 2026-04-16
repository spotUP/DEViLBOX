import type { SynthPanelLayout } from '@/types/synthPanel';

const fmtHz = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)} Hz`;
const fmtMs = (v: number) => `${Math.round(v)}ms`;
const fmtPct = (v: number) => `${Math.round(v)}%`;
const fmtDb = (v: number) => `${Math.round(v)}dB`;
const fmtPan = (v: number) => v === 0 ? 'C' : v > 0 ? `R${Math.round(v)}` : `L${Math.round(-v)}`;

export const SYNARE_LAYOUT: SynthPanelLayout = {
  name: 'Synare Drum',
  configKey: 'synare',
  tabs: [
    {
      id: 'main',
      label: 'MAIN',
      sections: [
        {
          label: 'AMP',
          controls: [
            { type: 'knob', key: '~volume', label: 'VOLUME', color: '#00ff99', min: -60, max: 0, defaultValue: -12, formatValue: fmtDb },
            { type: 'knob', key: '~pan', label: 'PAN', color: '#66ccff', min: -100, max: 100, defaultValue: 0, bipolar: true, formatValue: fmtPan },
          ],
        },
        {
          label: 'OSCILLATOR 1',
          controls: [
            { type: 'select', key: 'oscillator.type', label: 'TYPE', options: [
              { value: 'square', label: 'Square' },
              { value: 'pulse', label: 'Pulse' },
            ]},
            { type: 'knob', key: 'oscillator.tune', label: 'TUNE', color: '#ff9900', min: 20, max: 2000, defaultValue: 200, formatValue: fmtHz },
            { type: 'knob', key: 'oscillator.fine', label: 'FINE', color: '#ffcc00', min: -100, max: 100, defaultValue: 0, bipolar: true, formatValue: (v) => `${v > 0 ? '+' : ''}${Math.round(v)}ct` },
          ],
        },
        {
          label: 'OSCILLATOR 2',
          controls: [
            { type: 'toggle', key: 'osc2.enabled', label: 'ENABLE', labels: ['OFF', 'ON'] },
            { type: 'knob', key: 'osc2.mix', label: 'MIX', color: '#fb923c', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'osc2.detune', label: 'DETUNE', color: '#fb923c', min: -1200, max: 1200, defaultValue: 0, bipolar: true, formatValue: (v) => `${Math.round(v)}ct` },
          ],
        },
        {
          label: 'NOISE',
          controls: [
            { type: 'toggle', key: 'noise.enabled', label: 'ENABLE', labels: ['OFF', 'ON'] },
            { type: 'select', key: 'noise.type', label: 'TYPE', options: [
              { value: 'white', label: 'White' },
              { value: 'pink', label: 'Pink' },
            ]},
            { type: 'knob', key: 'noise.mix', label: 'MIX', color: '#cc66ff', min: 0, max: 1, defaultValue: 0.1, formatValue: fmtPct },
            { type: 'knob', key: 'noise.color', label: 'COLOR', color: '#a78bfa', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
          ],
        },
        {
          label: 'ENVELOPE',
          controls: [
            { type: 'knob', key: 'envelope.decay', label: 'DECAY', color: '#22c55e', min: 10, max: 2000, defaultValue: 300, formatValue: fmtMs },
            { type: 'knob', key: 'envelope.sustain', label: 'SUSTAIN', color: '#22c55e', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
          ],
        },
        {
          label: 'SWEEP',
          controls: [
            { type: 'toggle', key: 'sweep.enabled', label: 'SWEEP' },
            { type: 'knob', key: 'sweep.amount', label: 'AMOUNT', color: '#f97316', min: 0, max: 48, defaultValue: 12, formatValue: (v) => `${Math.round(v)} st` },
            { type: 'knob', key: 'sweep.time', label: 'TIME', color: '#f97316', min: 1, max: 2000, defaultValue: 100, formatValue: fmtMs },
          ],
        },
      ],
    },
    {
      id: 'mod',
      label: 'MOD',
      sections: [
        {
          label: 'FILTER',
          controls: [
            { type: 'knob', key: 'filter.cutoff', label: 'CUTOFF', color: '#ffcc00', min: 20, max: 20000, defaultValue: 2000, formatValue: fmtHz },
            { type: 'knob', key: 'filter.resonance', label: 'RESO', color: '#ff6600', min: 0, max: 100, defaultValue: 50, formatValue: fmtPct },
            { type: 'knob', key: 'filter.envMod', label: 'ENV MOD', color: '#ff3366', min: 0, max: 100, defaultValue: 80, formatValue: fmtPct },
            { type: 'knob', key: 'filter.decay', label: 'F DEC', color: '#ff9900', min: 10, max: 2000, defaultValue: 200, formatValue: fmtMs },
          ],
        },
        {
          label: 'LFO',
          controls: [
            { type: 'toggle', key: 'lfo.enabled', label: 'ENABLE', labels: ['OFF', 'ON'] },
            { type: 'select', key: 'lfo.target', label: 'TARGET', options: [
              { value: 'pitch', label: 'Pitch' },
              { value: 'filter', label: 'Filter' },
              { value: 'both', label: 'Both' },
            ]},
            { type: 'knob', key: 'lfo.rate', label: 'RATE', color: '#06b6d4', min: 0.1, max: 30, defaultValue: 5, formatValue: (v) => `${v.toFixed(1)} Hz` },
            { type: 'knob', key: 'lfo.depth', label: 'DEPTH', color: '#06b6d4', min: 0, max: 100, defaultValue: 50, formatValue: fmtPct },
          ],
        },
      ],
    },
  ],
};
