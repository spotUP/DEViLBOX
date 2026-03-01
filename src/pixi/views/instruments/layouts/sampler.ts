import type { SynthPanelLayout } from '../synthPanelTypes';

const fmtDb = (v: number) => `${Math.round(v)} dB`;
const fmtPan = (v: number) => v === 0 ? 'C' : v > 0 ? `R${Math.round(v)}` : `L${Math.round(-v)}`;
const fmtCents = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)} ct`;
const fmtRate = (v: number) => `${v.toFixed(2)}x`;

export const SAMPLER_LAYOUT: SynthPanelLayout = {
  name: 'Sampler',
  configKey: 'sampler',
  sections: [
    {
      label: 'AMP',
      controls: [
        { type: 'knob', key: 'volume', label: 'VOLUME', color: '#00ff99', min: -60, max: 0, defaultValue: 0, formatValue: fmtDb },
        { type: 'knob', key: 'pan', label: 'PAN', color: '#66ccff', min: -100, max: 100, defaultValue: 0, bipolar: true, formatValue: fmtPan },
      ],
    },
    {
      label: 'PITCH',
      controls: [
        { type: 'knob', key: 'sample.detune', label: 'DETUNE', color: '#ff9900', min: -100, max: 100, defaultValue: 0, bipolar: true, formatValue: fmtCents },
        { type: 'knob', key: 'sample.playbackRate', label: 'SPEED', color: '#cc66ff', min: 0.25, max: 4, defaultValue: 1, formatValue: fmtRate },
      ],
    },
    {
      label: 'LOOP',
      controls: [
        { type: 'toggle', key: 'sample.loop', label: 'LOOP', labels: ['OFF', 'ON'] },
        { type: 'toggle', key: 'sample.reverse', label: 'REVERSE', labels: ['FWD', 'REV'] },
      ],
    },
  ],
};
