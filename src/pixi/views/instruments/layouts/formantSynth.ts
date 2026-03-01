import type { SynthPanelLayout } from '../synthPanelTypes';

const fmtHz = (v: number) => `${Math.round(v)} Hz`;
const fmtMs = (v: number) => `${Math.round(v)}ms`;
const fmtPct = (v: number) => `${Math.round(v)}%`;
const fmtDb = (v: number) => `${Math.round(v)}dB`;
const fmtPan = (v: number) => v === 0 ? 'C' : v > 0 ? `R${Math.round(v)}` : `L${Math.round(-v)}`;

export const FORMANT_SYNTH_LAYOUT: SynthPanelLayout = {
  name: 'Formant Synth',
  configKey: 'formantSynth',
  tabs: [
    {
      id: 'vowel',
      label: 'VOWEL',
      sections: [
        {
          label: 'AMP',
          controls: [
            { type: 'knob', key: '~volume', label: 'VOLUME', color: '#00ff99', min: -60, max: 0, defaultValue: -12, formatValue: fmtDb },
            { type: 'knob', key: '~pan', label: 'PAN', color: '#66ccff', min: -100, max: 100, defaultValue: 0, bipolar: true, formatValue: fmtPan },
          ],
        },
        {
          label: 'VOWEL MORPH',
          controls: [
            { type: 'knob', key: 'vowelMorph.amount', label: 'MORPH', color: '#ff9900', min: 0, max: 100, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'vowelMorph.rate', label: 'RATE', color: '#cc66ff', min: 0, max: 5, defaultValue: 0, formatValue: (v) => `${v.toFixed(1)} Hz` },
          ],
        },
        {
          label: 'FORMANTS',
          controls: [
            { type: 'knob', key: 'formants.f1', label: 'F1', color: '#ff6600', min: 200, max: 1000, defaultValue: 500, formatValue: fmtHz },
            { type: 'knob', key: 'formants.f2', label: 'F2', color: '#ff9900', min: 600, max: 3000, defaultValue: 1500, formatValue: fmtHz },
            { type: 'knob', key: 'formants.f3', label: 'F3', color: '#ffcc00', min: 1500, max: 4000, defaultValue: 2500, formatValue: fmtHz },
            { type: 'knob', key: 'formants.bandwidth', label: 'BW', color: '#33ccff', min: 50, max: 200, defaultValue: 80, formatValue: fmtHz },
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
            { type: 'knob', key: 'envelope.decay', label: 'DEC', color: '#ff9900', min: 0, max: 2000, defaultValue: 200, formatValue: fmtMs },
            { type: 'knob', key: 'envelope.sustain', label: 'SUS', color: '#ff9900', min: 0, max: 100, defaultValue: 70, formatValue: fmtPct },
            { type: 'knob', key: 'envelope.release', label: 'REL', color: '#ff9900', min: 0, max: 5000, defaultValue: 300, formatValue: fmtMs },
          ],
        },
        {
          label: 'TIMBRE',
          controls: [
            { type: 'knob', key: 'brightness', label: 'BRIGHT', color: '#ffcc00', min: 0, max: 100, defaultValue: 50, formatValue: fmtPct },
          ],
        },
      ],
    },
  ],
};
