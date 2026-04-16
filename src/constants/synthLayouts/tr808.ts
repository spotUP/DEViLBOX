import type { SynthPanelLayout } from '@/types/synthPanel';

/**
 * TR-808 layout for Pixi synth panel.
 * Keys are flat (underscore-separated) matching the TR808Hardware UI parameter format.
 * configKey = 'parameters' so keys resolve to e.g. parameters.kick_tone.
 */

const fmtPct = (v: number) => `${Math.round(v)}%`;
const fmtDb = (v: number) => `${Math.round(v)}dB`;
const fmtPan = (v: number) => v === 0 ? 'C' : v > 0 ? `R${Math.round(v)}` : `L${Math.round(-v)}`;

export const TR808_LAYOUT: SynthPanelLayout = {
  name: 'TR-808',
  configKey: 'parameters',
  tabs: [
    {
      id: 'kick',
      label: 'KICK',
      sections: [
        {
          label: 'AMP',
          controls: [
            { type: 'knob', key: '~volume', label: 'VOLUME', color: '#00ff99', min: -60, max: 0, defaultValue: 0, formatValue: fmtDb },
            { type: 'knob', key: '~pan', label: 'PAN', color: '#66ccff', min: -100, max: 100, defaultValue: 0, bipolar: true, formatValue: fmtPan },
          ],
        },
        {
          label: 'KICK',
          controls: [
            { type: 'knob', key: 'kick_level', label: 'LEVEL', color: '#ff5a00', min: 0, max: 100, defaultValue: 75, formatValue: fmtPct },
            { type: 'knob', key: 'kick_tone', label: 'TONE', color: '#ffcc00', min: 0, max: 100, defaultValue: 50, formatValue: fmtPct },
            { type: 'knob', key: 'kick_decay', label: 'DECAY', color: '#ff6600', min: 0, max: 100, defaultValue: 50, formatValue: fmtPct },
          ],
        },
      ],
    },
    {
      id: 'snare',
      label: 'SNARE',
      sections: [
        {
          label: 'SNARE',
          controls: [
            { type: 'knob', key: 'snare_level', label: 'LEVEL', color: '#ff5a00', min: 0, max: 100, defaultValue: 75, formatValue: fmtPct },
            { type: 'knob', key: 'snare_tone', label: 'TONE', color: '#ffcc00', min: 0, max: 100, defaultValue: 50, formatValue: fmtPct },
            { type: 'knob', key: 'snare_snappy', label: 'SNAPPY', color: '#cc66ff', min: 0, max: 100, defaultValue: 50, formatValue: fmtPct },
          ],
        },
      ],
    },
    {
      id: 'hats',
      label: 'HATS',
      sections: [
        {
          label: 'CLOSED HAT',
          controls: [
            { type: 'knob', key: 'ch_level', label: 'LEVEL', color: '#ff5a00', min: 0, max: 100, defaultValue: 75, formatValue: fmtPct },
          ],
        },
        {
          label: 'OPEN HAT',
          controls: [
            { type: 'knob', key: 'oh_level', label: 'LEVEL', color: '#ff5a00', min: 0, max: 100, defaultValue: 75, formatValue: fmtPct },
            { type: 'knob', key: 'oh_decay', label: 'DECAY', color: '#ff6600', min: 0, max: 100, defaultValue: 50, formatValue: fmtPct },
          ],
        },
      ],
    },
    {
      id: 'toms',
      label: 'TOMS',
      sections: [
        {
          label: 'LOW TOM',
          controls: [
            { type: 'knob', key: 'low_tom_level', label: 'LEVEL', color: '#ff5a00', min: 0, max: 100, defaultValue: 75, formatValue: fmtPct },
            { type: 'knob', key: 'low_tom_tuning', label: 'TUNING', color: '#ffcc00', min: 0, max: 100, defaultValue: 50, formatValue: fmtPct },
          ],
        },
        {
          label: 'MID TOM',
          controls: [
            { type: 'knob', key: 'mid_tom_level', label: 'LEVEL', color: '#ff5a00', min: 0, max: 100, defaultValue: 75, formatValue: fmtPct },
            { type: 'knob', key: 'mid_tom_tuning', label: 'TUNING', color: '#ffcc00', min: 0, max: 100, defaultValue: 50, formatValue: fmtPct },
          ],
        },
        {
          label: 'HI TOM',
          controls: [
            { type: 'knob', key: 'hi_tom_level', label: 'LEVEL', color: '#ff5a00', min: 0, max: 100, defaultValue: 75, formatValue: fmtPct },
            { type: 'knob', key: 'hi_tom_tuning', label: 'TUNING', color: '#ffcc00', min: 0, max: 100, defaultValue: 50, formatValue: fmtPct },
          ],
        },
      ],
    },
    {
      id: 'perc',
      label: 'PERC',
      sections: [
        {
          label: 'CLAP',
          controls: [
            { type: 'knob', key: 'clap_level', label: 'LEVEL', color: '#ff5a00', min: 0, max: 100, defaultValue: 75, formatValue: fmtPct },
          ],
        },
        {
          label: 'RIMSHOT',
          controls: [
            { type: 'knob', key: 'rimshot_level', label: 'LEVEL', color: '#ff5a00', min: 0, max: 100, defaultValue: 75, formatValue: fmtPct },
          ],
        },
        {
          label: 'COWBELL',
          controls: [
            { type: 'knob', key: 'cowbell_level', label: 'LEVEL', color: '#ff5a00', min: 0, max: 100, defaultValue: 75, formatValue: fmtPct },
          ],
        },
        {
          label: 'CYMBAL',
          controls: [
            { type: 'knob', key: 'cymbal_level', label: 'LEVEL', color: '#ff5a00', min: 0, max: 100, defaultValue: 75, formatValue: fmtPct },
            { type: 'knob', key: 'cymbal_tone', label: 'TONE', color: '#ffcc00', min: 0, max: 100, defaultValue: 50, formatValue: fmtPct },
            { type: 'knob', key: 'cymbal_decay', label: 'DECAY', color: '#ff6600', min: 0, max: 100, defaultValue: 50, formatValue: fmtPct },
          ],
        },
      ],
    },
  ],
};
