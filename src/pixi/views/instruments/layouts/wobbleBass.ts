import type { SynthPanelLayout } from '../synthPanelTypes';

const fmtHz = (v: number) => `${Math.round(v)} Hz`;
const fmtMs = (v: number) => `${Math.round(v)}ms`;
const fmtPct = (v: number) => `${Math.round(v)}%`;
const fmtCt = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}ct`;
const fmtDb = (v: number) => `${Math.round(v)}dB`;
const fmtPan = (v: number) => v === 0 ? 'C' : v > 0 ? `R${Math.round(v)}` : `L${Math.round(-v)}`;

export const WOBBLE_BASS_LAYOUT: SynthPanelLayout = {
  name: 'Wobble Bass',
  configKey: 'wobbleBass',
  tabs: [
    {
      id: 'osc',
      label: 'OSC',
      sections: [
        {
          label: 'AMP',
          controls: [
            { type: 'knob', key: '~volume', label: 'VOLUME', color: '#00ff99', min: -60, max: 0, defaultValue: -12, formatValue: fmtDb },
            { type: 'knob', key: '~pan', label: 'PAN', color: '#66ccff', min: -100, max: 100, defaultValue: 0, bipolar: true, formatValue: fmtPan },
          ],
        },
        {
          label: 'OSC 1',
          controls: [
            { type: 'knob', key: 'osc1.detune', label: 'DETUNE', color: '#ff9900', min: -100, max: 100, defaultValue: 0, bipolar: true, formatValue: fmtCt },
            { type: 'knob', key: 'osc1.level', label: 'LEVEL', color: '#ff6600', min: 0, max: 100, defaultValue: 100, formatValue: fmtPct },
          ],
        },
        {
          label: 'OSC 2',
          controls: [
            { type: 'knob', key: 'osc2.detune', label: 'DETUNE', color: '#ff9900', min: -100, max: 100, defaultValue: 7, bipolar: true, formatValue: fmtCt },
            { type: 'knob', key: 'osc2.level', label: 'LEVEL', color: '#ff6600', min: 0, max: 100, defaultValue: 80, formatValue: fmtPct },
          ],
        },
        {
          label: 'UNISON',
          controls: [
            { type: 'knob', key: 'unison.voices', label: 'VOICES', color: '#9966ff', min: 1, max: 16, defaultValue: 1, formatValue: (v) => `${Math.round(v)}` },
            { type: 'knob', key: 'unison.detune', label: 'SPREAD', color: '#cc66ff', min: 0, max: 100, defaultValue: 0, formatValue: fmtCt },
          ],
        },
      ],
    },
    {
      id: 'filter',
      label: 'FILT',
      sections: [
        {
          label: 'FILTER',
          controls: [
            { type: 'knob', key: 'filter.cutoff', label: 'CUTOFF', color: '#ffcc00', min: 20, max: 20000, defaultValue: 1000, formatValue: fmtHz },
            { type: 'knob', key: 'filter.resonance', label: 'RESO', color: '#ff6600', min: 0, max: 100, defaultValue: 50, formatValue: fmtPct },
            { type: 'knob', key: 'filter.drive', label: 'DRIVE', color: '#ff3366', min: 0, max: 100, defaultValue: 20, formatValue: fmtPct },
          ],
        },
        {
          label: 'FILTER ENV',
          controls: [
            { type: 'knob', key: 'filterEnvelope.amount', label: 'AMT', color: '#ff9900', min: -100, max: 100, defaultValue: 70, bipolar: true, formatValue: fmtPct },
            { type: 'knob', key: 'filterEnvelope.attack', label: 'ATK', color: '#ff9900', min: 0, max: 2000, defaultValue: 5, formatValue: fmtMs },
            { type: 'knob', key: 'filterEnvelope.decay', label: 'DEC', color: '#ff9900', min: 0, max: 2000, defaultValue: 500, formatValue: fmtMs },
            { type: 'knob', key: 'filterEnvelope.sustain', label: 'SUS', color: '#ff9900', min: 0, max: 100, defaultValue: 0, formatValue: fmtPct },
          ],
        },
      ],
    },
    {
      id: 'wobble',
      label: 'WOBBLE',
      sections: [
        {
          label: 'WOBBLE LFO',
          controls: [
            { type: 'toggle', key: 'wobbleLFO.enabled', label: 'ON' },
            { type: 'knob', key: 'wobbleLFO.rate', label: 'RATE', color: '#9966ff', min: 0.1, max: 20, defaultValue: 2, formatValue: (v) => `${v.toFixed(1)} Hz` },
            { type: 'knob', key: 'wobbleLFO.amount', label: 'AMOUNT', color: '#cc66ff', min: 0, max: 100, defaultValue: 80, formatValue: fmtPct },
            { type: 'knob', key: 'wobbleLFO.pitchAmount', label: 'PITCH', color: '#66ccff', min: 0, max: 100, defaultValue: 0, formatValue: fmtCt },
          ],
        },
        {
          label: 'AMP ENVELOPE',
          controls: [
            { type: 'knob', key: 'envelope.attack', label: 'ATK', color: '#ff9900', min: 0, max: 2000, defaultValue: 5, formatValue: fmtMs },
            { type: 'knob', key: 'envelope.decay', label: 'DEC', color: '#ff9900', min: 0, max: 2000, defaultValue: 500, formatValue: fmtMs },
            { type: 'knob', key: 'envelope.sustain', label: 'SUS', color: '#ff9900', min: 0, max: 100, defaultValue: 70, formatValue: fmtPct },
            { type: 'knob', key: 'envelope.release', label: 'REL', color: '#ff9900', min: 0, max: 5000, defaultValue: 200, formatValue: fmtMs },
          ],
        },
      ],
    },
  ],
};
