import type { SynthPanelLayout } from '@/types/synthPanel';

const fmtPct = (v: number) => `${Math.round(v * 100)}%`;

export const AEOLUS_LAYOUT: SynthPanelLayout = {
  name: 'Aeolus Organ',
  configKey: 'aeolus',
  tabs: [
    {
      id: 'great',
      label: 'GREAT',
      sections: [
        {
          label: 'GREAT STOPS',
          controls: [
            { type: 'toggle', key: 'greatStop0', label: "Princ 8'", labels: ['OFF', 'ON'] },
            { type: 'toggle', key: 'greatStop1', label: "Oct 4'", labels: ['OFF', 'ON'] },
            { type: 'toggle', key: 'greatStop2', label: "15th 2'", labels: ['OFF', 'ON'] },
            { type: 'toggle', key: 'greatStop3', label: 'Mixture', labels: ['OFF', 'ON'] },
            { type: 'toggle', key: 'greatStop4', label: "Flute 8'", labels: ['OFF', 'ON'] },
            { type: 'toggle', key: 'greatStop5', label: "Brd 16'", labels: ['OFF', 'ON'] },
            { type: 'toggle', key: 'greatStop6', label: "Trpt 8'", labels: ['OFF', 'ON'] },
            { type: 'toggle', key: 'greatStop7', label: "Clar 4'", labels: ['OFF', 'ON'] },
          ],
        },
        {
          label: 'GREAT EXPRESSION',
          controls: [
            { type: 'knob', key: 'greatExpression', label: 'EXPR', color: '#00ff99', min: 0, max: 1, defaultValue: 1, formatValue: fmtPct },
          ],
        },
      ],
    },
    {
      id: 'swell',
      label: 'SWELL',
      sections: [
        {
          label: 'SWELL STOPS',
          controls: [
            { type: 'toggle', key: 'swellStop0', label: "Ged 8'", labels: ['OFF', 'ON'] },
            { type: 'toggle', key: 'swellStop1', label: "Salic 8'", labels: ['OFF', 'ON'] },
            { type: 'toggle', key: 'swellStop2', label: 'V.Celeste', labels: ['OFF', 'ON'] },
            { type: 'toggle', key: 'swellStop3', label: "Oboe 8'", labels: ['OFF', 'ON'] },
            { type: 'toggle', key: 'swellStop4', label: "Gems 4'", labels: ['OFF', 'ON'] },
            { type: 'toggle', key: 'swellStop5', label: "Rohr 4'", labels: ['OFF', 'ON'] },
            { type: 'toggle', key: 'swellStop6', label: "Tromp 8'", labels: ['OFF', 'ON'] },
            { type: 'toggle', key: 'swellStop7', label: "Clrn 4'", labels: ['OFF', 'ON'] },
          ],
        },
        {
          label: 'SWELL EXPRESSION',
          controls: [
            { type: 'knob', key: 'swellExpression', label: 'EXPR', color: '#00ff99', min: 0, max: 1, defaultValue: 0.7, formatValue: fmtPct },
          ],
        },
      ],
    },
    {
      id: 'pedal',
      label: 'PEDAL',
      sections: [
        {
          label: 'PEDAL STOPS',
          controls: [
            { type: 'toggle', key: 'pedalStop0', label: "Sub 16'", labels: ['OFF', 'ON'] },
            { type: 'toggle', key: 'pedalStop1', label: "Princ 8'", labels: ['OFF', 'ON'] },
            { type: 'toggle', key: 'pedalStop2', label: "Tromp 8'", labels: ['OFF', 'ON'] },
            { type: 'toggle', key: 'pedalStop3', label: "Oct 4'", labels: ['OFF', 'ON'] },
            { type: 'toggle', key: 'pedalStop4', label: "Brd 8'", labels: ['OFF', 'ON'] },
          ],
        },
        {
          label: 'COUPLERS',
          controls: [
            { type: 'toggle', key: 'couplerSwellGreat', label: 'SW-GT', labels: ['OFF', 'ON'] },
            { type: 'toggle', key: 'couplerGreatPedal', label: 'GT-PD', labels: ['OFF', 'ON'] },
            { type: 'toggle', key: 'couplerSwellPedal', label: 'SW-PD', labels: ['OFF', 'ON'] },
            { type: 'toggle', key: 'couplerSwellOctave', label: 'SW OCT', labels: ['OFF', 'ON'] },
          ],
        },
      ],
    },
    {
      id: 'fx',
      label: 'FX',
      sections: [
        {
          label: 'TREMULANT',
          controls: [
            { type: 'toggle', key: 'tremulantOn', label: 'TREM', labels: ['OFF', 'ON'] },
            { type: 'knob', key: 'tremulantSpeed', label: 'SPEED', color: '#9966ff', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'tremulantDepth', label: 'DEPTH', color: '#cc66ff', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
          ],
        },
        {
          label: 'REVERB',
          controls: [
            { type: 'knob', key: 'reverbAmount', label: 'AMOUNT', color: '#33ccff', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
            { type: 'knob', key: 'reverbSize', label: 'SIZE', color: '#33ccff', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
          ],
        },
        {
          label: 'MASTER',
          controls: [
            { type: 'knob', key: 'volume', label: 'VOLUME', color: '#00ff99', min: 0, max: 1, defaultValue: 0.8, formatValue: fmtPct },
            { type: 'knob', key: 'windPressure', label: 'WIND', color: '#ff9900', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'tuning', label: 'TUNE', color: '#ffcc00', min: 415, max: 466, defaultValue: 440, formatValue: (v) => `${Math.round(v)} Hz` },
          ],
        },
      ],
    },
  ],
};
