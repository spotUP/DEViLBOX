import type { SynthPanelLayout } from '../synthPanelTypes';

const fmtHz = (v: number) => `${Math.round(v)} Hz`;
const fmtMs = (v: number) => `${Math.round(v)}ms`;
const fmtPct = (v: number) => `${Math.round(v)}%`;
const fmtCt = (v: number) => `${Math.round(v)}ct`;
const fmtDb = (v: number) => `${Math.round(v)}dB`;
const fmtPan = (v: number) => v === 0 ? 'C' : v > 0 ? `R${Math.round(v)}` : `L${Math.round(-v)}`;

export const PWM_SYNTH_LAYOUT: SynthPanelLayout = {
  name: 'PWM Synth',
  configKey: 'pwmSynth',
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
          label: 'PULSE',
          controls: [
            { type: 'knob', key: 'pulseWidth', label: 'WIDTH', color: '#ff9900', min: 0, max: 100, defaultValue: 50, formatValue: fmtPct },
            { type: 'knob', key: 'pwmDepth', label: 'PWM DEPTH', color: '#ff6600', min: 0, max: 100, defaultValue: 30, formatValue: fmtPct },
            { type: 'knob', key: 'pwmRate', label: 'PWM RATE', color: '#cc66ff', min: 0.1, max: 20, defaultValue: 2, formatValue: (v) => `${v.toFixed(1)} Hz` },
          ],
        },
        {
          label: 'OSCILLATORS',
          controls: [
            { type: 'knob', key: 'oscillators', label: 'COUNT', color: '#ff9900', min: 1, max: 3, defaultValue: 2, formatValue: (v) => `${Math.round(v)}` },
            { type: 'knob', key: 'detune', label: 'DETUNE', color: '#ffcc00', min: 0, max: 50, defaultValue: 10, formatValue: fmtCt },
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
            { type: 'knob', key: 'filter.cutoff', label: 'CUTOFF', color: '#ffcc00', min: 20, max: 20000, defaultValue: 4000, formatValue: fmtHz },
            { type: 'knob', key: 'filter.resonance', label: 'RESO', color: '#ff6600', min: 0, max: 100, defaultValue: 20, formatValue: fmtPct },
            { type: 'knob', key: 'filter.envelopeAmount', label: 'ENV AMT', color: '#ff3366', min: -100, max: 100, defaultValue: 30, bipolar: true, formatValue: fmtPct },
            { type: 'knob', key: 'filter.keyTracking', label: 'KEY TRK', color: '#33ccff', min: 0, max: 100, defaultValue: 50, formatValue: fmtPct },
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
            { type: 'knob', key: 'envelope.attack', label: 'ATK', color: '#ff9900', min: 0, max: 2000, defaultValue: 50, formatValue: fmtMs },
            { type: 'knob', key: 'envelope.decay', label: 'DEC', color: '#ff9900', min: 0, max: 2000, defaultValue: 500, formatValue: fmtMs },
            { type: 'knob', key: 'envelope.sustain', label: 'SUS', color: '#ff9900', min: 0, max: 100, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'envelope.release', label: 'REL', color: '#ff9900', min: 0, max: 5000, defaultValue: 100, formatValue: fmtMs },
          ],
        },
      ],
    },
  ],
};
