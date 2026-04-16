import type { SynthPanelLayout } from '@/types/synthPanel';

const fmtPct = (v: number) => `${Math.round(v * 100)}%`;

export const FLUIDSYNTH_LAYOUT: SynthPanelLayout = {
  name: 'FluidSynth',
  configKey: 'fluidsynth',
  sections: [
    {
      label: 'GENERAL',
      controls: [
        { type: 'knob', key: 'gain', label: 'GAIN', color: '#00ff99', min: 0, max: 10, defaultValue: 0.4, formatValue: (v) => `${v.toFixed(1)}` },
        { type: 'knob', key: 'polyphony', label: 'POLY', color: '#66ccff', min: 1, max: 256, defaultValue: 64, formatValue: (v) => `${Math.round(v)}` },
        { type: 'knob', key: 'tuning', label: 'TUNE', color: '#ffcc00', min: 430, max: 450, defaultValue: 440, formatValue: (v) => `${Math.round(v)} Hz` },
        { type: 'knob', key: 'transpose', label: 'XPOSE', color: '#ffcc00', min: -24, max: 24, defaultValue: 0, bipolar: true, formatValue: (v) => `${Math.round(v)} st` },
        { type: 'knob', key: 'program', label: 'PROG', color: '#ff9900', min: 0, max: 127, defaultValue: 0, formatValue: (v) => `${Math.round(v)}` },
        { type: 'knob', key: 'bank', label: 'BANK', color: '#ff9900', min: 0, max: 128, defaultValue: 0, formatValue: (v) => `${Math.round(v)}` },
      ],
    },
    {
      label: 'REVERB',
      controls: [
        { type: 'knob', key: 'reverbRoomSize', label: 'ROOM', color: '#cc66ff', min: 0, max: 1.2, defaultValue: 0.2, formatValue: (v) => `${v.toFixed(1)}` },
        { type: 'knob', key: 'reverbDamping', label: 'DAMP', color: '#cc66ff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
        { type: 'knob', key: 'reverbWidth', label: 'WIDTH', color: '#cc66ff', min: 0, max: 100, defaultValue: 0.5, formatValue: (v) => `${v.toFixed(1)}` },
        { type: 'knob', key: 'reverbLevel', label: 'LEVEL', color: '#cc66ff', min: 0, max: 1, defaultValue: 0.9, formatValue: fmtPct },
      ],
    },
    {
      label: 'CHORUS',
      controls: [
        { type: 'select', key: 'chorusType', label: 'TYPE', options: [
          { value: '0', label: 'Sine' }, { value: '1', label: 'Triangle' },
        ]},
        { type: 'knob', key: 'chorusVoices', label: 'VOICES', color: '#33ccff', min: 0, max: 99, defaultValue: 3, formatValue: (v) => `${Math.round(v)}` },
        { type: 'knob', key: 'chorusLevel', label: 'LEVEL', color: '#33ccff', min: 0, max: 10, defaultValue: 2, formatValue: (v) => `${v.toFixed(1)}` },
        { type: 'knob', key: 'chorusSpeed', label: 'SPEED', color: '#33ccff', min: 0.1, max: 5, defaultValue: 0.3, formatValue: (v) => `${v.toFixed(1)} Hz` },
        { type: 'knob', key: 'chorusDepth', label: 'DEPTH', color: '#33ccff', min: 0, max: 21, defaultValue: 8, formatValue: (v) => `${v.toFixed(1)}` },
      ],
    },
  ],
};
