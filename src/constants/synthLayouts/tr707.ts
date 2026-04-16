import type { SynthPanelLayout } from '@/types/synthPanel';

const fmtPct = (v: number) => `${Math.round(v * 100)}%`;

/**
 * TR-707 layout for Pixi synth panel.
 * Roland TR-707 Rhythm Composer (1985).
 * Parameters from chipParameters.ts MAMETR707 entry.
 */
export const TR707_LAYOUT: SynthPanelLayout = {
  name: 'TR-707',
  configKey: 'parameters',
  tabs: [
    {
      id: 'drums',
      label: 'DRUMS',
      sections: [
        {
          label: 'KICK / SNARE',
          controls: [
            { type: 'knob', key: 'bass', label: 'BASS', color: '#dc2626', min: 0, max: 1, defaultValue: 0.8, formatValue: fmtPct },
            { type: 'knob', key: 'snare', label: 'SNARE', color: '#f97316', min: 0, max: 1, defaultValue: 0.8, formatValue: fmtPct },
          ],
        },
        {
          label: 'TOMS',
          controls: [
            { type: 'knob', key: 'low_tom', label: 'LO TOM', color: '#eab308', min: 0, max: 1, defaultValue: 0.8, formatValue: fmtPct },
            { type: 'knob', key: 'mid_tom', label: 'MI TOM', color: '#22c55e', min: 0, max: 1, defaultValue: 0.8, formatValue: fmtPct },
            { type: 'knob', key: 'hi_tom', label: 'HI TOM', color: '#14b8a6', min: 0, max: 1, defaultValue: 0.8, formatValue: fmtPct },
          ],
        },
        {
          label: 'PERC',
          controls: [
            { type: 'knob', key: 'rimshot', label: 'RIM', color: '#8b5cf6', min: 0, max: 1, defaultValue: 0.8, formatValue: fmtPct },
            { type: 'knob', key: 'handclap', label: 'CLAP', color: '#a78bfa', min: 0, max: 1, defaultValue: 0.8, formatValue: fmtPct },
          ],
        },
      ],
    },
    {
      id: 'cymbals',
      label: 'CYMBALS',
      sections: [
        {
          label: 'HI-HAT',
          controls: [
            { type: 'knob', key: 'hihat', label: 'HI-HAT', color: '#60a5fa', min: 0, max: 1, defaultValue: 0.8, formatValue: fmtPct },
          ],
        },
        {
          label: 'CYMBALS',
          controls: [
            { type: 'knob', key: 'crash', label: 'CRASH', color: '#93c5fd', min: 0, max: 1, defaultValue: 0.8, formatValue: fmtPct },
            { type: 'knob', key: 'ride', label: 'RIDE', color: '#bfdbfe', min: 0, max: 1, defaultValue: 0.8, formatValue: fmtPct },
          ],
        },
      ],
    },
    {
      id: 'master',
      label: 'MASTER',
      sections: [
        {
          label: 'MASTER',
          controls: [
            { type: 'knob', key: 'volume', label: 'VOLUME', color: '#f97316', min: 0, max: 1, defaultValue: 0.8, formatValue: fmtPct },
            { type: 'knob', key: 'accent', label: 'ACCENT', color: '#dc2626', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'decay', label: 'DECAY', color: '#22c55e', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
          ],
        },
      ],
    },
  ],
};
