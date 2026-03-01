import type { SynthPanelLayout } from '../synthPanelTypes';

const fmtHz = (v: number) => `${Math.round(v)} Hz`;
const fmtMs = (v: number) => `${Math.round(v)}ms`;
const fmtPct = (v: number) => `${Math.round(v)}%`;
const fmtCt = (v: number) => `${Math.round(v)}ct`;
const fmtDb = (v: number) => `${Math.round(v)}dB`;
const fmtPan = (v: number) => v === 0 ? 'C' : v > 0 ? `R${Math.round(v)}` : `L${Math.round(-v)}`;

export const SUPER_SAW_LAYOUT: SynthPanelLayout = {
  name: 'Super Saw',
  configKey: 'superSaw',
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
          label: 'SUPER SAW',
          controls: [
            { type: 'knob', key: 'voices', label: 'VOICES', color: '#ff9900', min: 3, max: 9, defaultValue: 7, formatValue: (v) => `${Math.round(v)}` },
            { type: 'knob', key: 'detune', label: 'DETUNE', color: '#ffcc00', min: 0, max: 100, defaultValue: 30, formatValue: fmtCt },
            { type: 'knob', key: 'mix', label: 'MIX', color: '#ff6600', min: 0, max: 100, defaultValue: 50, formatValue: fmtPct },
            { type: 'knob', key: 'stereoSpread', label: 'WIDTH', color: '#66ccff', min: 0, max: 100, defaultValue: 80, formatValue: fmtPct },
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
            { type: 'knob', key: 'filter.resonance', label: 'RESO', color: '#ff6600', min: 0, max: 100, defaultValue: 20, formatValue: fmtPct },
            { type: 'knob', key: 'filter.envelopeAmount', label: 'ENV AMT', color: '#ff3366', min: -100, max: 100, defaultValue: 0, bipolar: true, formatValue: fmtPct },
          ],
        },
        {
          label: 'FILTER ENV',
          controls: [
            { type: 'knob', key: 'filterEnvelope.attack', label: 'ATK', color: '#ff9900', min: 0, max: 2000, defaultValue: 10, formatValue: fmtMs },
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
