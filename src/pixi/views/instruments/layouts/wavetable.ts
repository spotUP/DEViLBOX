import type { SynthPanelLayout } from '../synthPanelTypes';

const fmtHz = (v: number) => `${Math.round(v)} Hz`;
const fmtMs = (v: number) => `${Math.round(v)}ms`;
const fmtPct = (v: number) => `${Math.round(v)}%`;
const fmtCt = (v: number) => `${Math.round(v)}ct`;
const fmtDb = (v: number) => `${Math.round(v)}dB`;
const fmtPan = (v: number) => v === 0 ? 'C' : v > 0 ? `R${Math.round(v)}` : `L${Math.round(-v)}`;

export const WAVETABLE_LAYOUT: SynthPanelLayout = {
  name: 'Wavetable',
  configKey: 'wavetable',
  tabs: [
    {
      id: 'wt',
      label: 'WT',
      sections: [
        {
          label: 'AMP',
          controls: [
            { type: 'knob', key: '~volume', label: 'VOLUME', color: '#00ff99', min: -60, max: 0, defaultValue: -12, formatValue: fmtDb },
            { type: 'knob', key: '~pan', label: 'PAN', color: '#66ccff', min: -100, max: 100, defaultValue: 0, bipolar: true, formatValue: fmtPan },
          ],
        },
        {
          label: 'WAVETABLE',
          controls: [
            { type: 'knob', key: 'morphPosition', label: 'MORPH', color: '#ff9900', min: 0, max: 100, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'morphModAmount', label: 'MOD AMT', color: '#ff6600', min: 0, max: 100, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'morphLFORate', label: 'LFO RATE', color: '#cc66ff', min: 0.1, max: 20, defaultValue: 1, formatValue: (v) => `${v.toFixed(1)} Hz` },
          ],
        },
        {
          label: 'UNISON',
          controls: [
            { type: 'knob', key: 'unison.voices', label: 'VOICES', color: '#ff9900', min: 1, max: 8, defaultValue: 1, formatValue: (v) => `${Math.round(v)}` },
            { type: 'knob', key: 'unison.detune', label: 'DETUNE', color: '#ffcc00', min: 0, max: 100, defaultValue: 0, formatValue: fmtCt },
            { type: 'knob', key: 'unison.stereoSpread', label: 'WIDTH', color: '#66ccff', min: 0, max: 100, defaultValue: 0, formatValue: fmtPct },
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
            { type: 'knob', key: 'filter.cutoff', label: 'CUTOFF', color: '#ffcc00', min: 20, max: 20000, defaultValue: 8000, formatValue: fmtHz },
            { type: 'knob', key: 'filter.resonance', label: 'RESO', color: '#ff6600', min: 0, max: 100, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'filter.envelopeAmount', label: 'ENV AMT', color: '#ff3366', min: -100, max: 100, defaultValue: 0, bipolar: true, formatValue: fmtPct },
          ],
        },
        {
          label: 'FILTER ENV',
          controls: [
            { type: 'knob', key: 'filterEnvelope.attack', label: 'ATK', color: '#ff9900', min: 0, max: 2000, defaultValue: 0, formatValue: fmtMs },
            { type: 'knob', key: 'filterEnvelope.decay', label: 'DEC', color: '#ff9900', min: 0, max: 2000, defaultValue: 500, formatValue: fmtMs },
            { type: 'knob', key: 'filterEnvelope.sustain', label: 'SUS', color: '#ff9900', min: 0, max: 100, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'filterEnvelope.release', label: 'REL', color: '#ff9900', min: 0, max: 5000, defaultValue: 100, formatValue: fmtMs },
          ],
        },
      ],
    },
    {
      id: 'env',
      label: 'ENV',
      sections: [
        {
          label: 'AMP ENVELOPE',
          controls: [
            { type: 'knob', key: 'envelope.attack', label: 'ATK', color: '#ff9900', min: 0, max: 2000, defaultValue: 10, formatValue: fmtMs },
            { type: 'knob', key: 'envelope.decay', label: 'DEC', color: '#ff9900', min: 0, max: 2000, defaultValue: 500, formatValue: fmtMs },
            { type: 'knob', key: 'envelope.sustain', label: 'SUS', color: '#ff9900', min: 0, max: 100, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'envelope.release', label: 'REL', color: '#ff9900', min: 0, max: 5000, defaultValue: 100, formatValue: fmtMs },
          ],
        },
      ],
    },
  ],
};
