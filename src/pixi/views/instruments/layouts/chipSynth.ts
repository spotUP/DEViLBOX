import type { SynthPanelLayout } from '../synthPanelTypes';

const fmtHz = (v: number) => `${Math.round(v)} Hz`;
const fmtMs = (v: number) => `${Math.round(v)} ms`;
const fmtPct = (v: number) => `${Math.round(v)}%`;

export const CHIP_SYNTH_LAYOUT: SynthPanelLayout = {
  name: 'Chip Synth',
  configKey: 'chipSynth',
  tabs: [
    {
      id: 'main',
      label: 'MAIN',
      sections: [
        {
          label: 'SOUND',
          controls: [
            { type: 'knob', key: 'bitDepth', label: 'BITS', min: 4, max: 16, defaultValue: 8, formatValue: (v) => `${Math.round(v)}` },
            { type: 'knob', key: 'sampleRate', label: 'RATE', min: 4000, max: 44100, defaultValue: 22050, formatValue: fmtHz },
          ],
        },
        {
          label: 'ENVELOPE',
          controls: [
            { type: 'knob', key: 'envelope.attack', label: 'A', formatValue: fmtMs },
            { type: 'knob', key: 'envelope.decay', label: 'D', formatValue: fmtMs },
            { type: 'knob', key: 'envelope.sustain', label: 'S', formatValue: fmtPct },
            { type: 'knob', key: 'envelope.release', label: 'R', formatValue: fmtMs },
          ],
        },
        {
          label: 'VIBRATO',
          controls: [
            { type: 'knob', key: 'vibrato.speed', label: 'SPEED', formatValue: fmtHz },
            { type: 'knob', key: 'vibrato.depth', label: 'DEPTH', formatValue: fmtPct },
            { type: 'knob', key: 'vibrato.delay', label: 'DELAY', formatValue: fmtMs },
          ],
        },
      ],
    },
  ],
};
