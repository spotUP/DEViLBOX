import type { SynthPanelLayout } from '@/types/synthPanel';

const fmtPct = (v: number) => `${Math.round(v * 100)}%`;

export const PINK_TROMBONE_LAYOUT: SynthPanelLayout = {
  name: 'Pink Trombone',
  configKey: 'pinkTrombone',
  tabs: [
    {
      id: 'voice',
      label: 'VOICE',
      sections: [
        {
          label: 'GLOTTIS',
          controls: [
            { type: 'knob', key: 'tenseness', label: 'TENSE', color: '#ff3366', min: 0, max: 1, defaultValue: 0.6, formatValue: fmtPct },
            { type: 'knob', key: 'vibratoAmount', label: 'VIBRATO', color: '#9966ff', min: 0, max: 1, defaultValue: 0.1, formatValue: fmtPct },
          ],
        },
        {
          label: 'TONGUE',
          controls: [
            { type: 'knob', key: 'tongueIndex', label: 'POSITION', color: '#ff9900', min: 0, max: 1, defaultValue: 0.15, formatValue: fmtPct },
            { type: 'knob', key: 'tongueDiameter', label: 'HEIGHT', color: '#ff9900', min: 0, max: 1, defaultValue: 0.26, formatValue: fmtPct },
          ],
        },
        {
          label: 'MOUTH',
          controls: [
            { type: 'knob', key: 'lipDiameter', label: 'LIP', color: '#ff6600', min: 0, max: 1, defaultValue: 0.6, formatValue: fmtPct },
            { type: 'knob', key: 'velum', label: 'NASAL', color: '#cc66ff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
          ],
        },
        {
          label: 'CONSTRICTION',
          controls: [
            { type: 'knob', key: 'constrictionIndex', label: 'POSITION', color: '#33ccff', min: 0, max: 1, defaultValue: 0.57, formatValue: fmtPct },
            { type: 'knob', key: 'constrictionDiameter', label: 'SIZE', color: '#33ccff', min: 0, max: 1, defaultValue: 1, formatValue: fmtPct },
          ],
        },
      ],
    },
    {
      id: 'speech',
      label: 'SPEECH',
      sections: [
        {
          label: 'TTS',
          controls: [
            { type: 'knob', key: 'speed', label: 'SPEED', color: '#22c55e', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'speechPitch', label: 'PITCH', color: '#66ccff', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
          ],
        },
      ],
    },
  ],
};
