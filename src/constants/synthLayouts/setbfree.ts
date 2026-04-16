import type { SynthPanelLayout } from '@/types/synthPanel';

const fmtDb = (v: number) => `${Math.round(v)}`;
const fmtPct = (v: number) => `${Math.round(v * 100)}%`;
const fmtRpm = (v: number) => `${Math.round(v)} rpm`;

export const SETBFREE_LAYOUT: SynthPanelLayout = {
  name: 'setBfree Organ',
  configKey: 'setbfree',
  tabs: [
    {
      id: 'main',
      label: 'MAIN',
      sections: [
        {
          label: 'UPPER DRAWBARS',
          controls: [
            { type: 'knob', key: 'upper16', label: "16'", color: '#8b4513', min: 0, max: 8, defaultValue: 8, formatValue: fmtDb },
            { type: 'knob', key: 'upper513', label: "5\u2153'", color: '#8b4513', min: 0, max: 8, defaultValue: 8, formatValue: fmtDb },
            { type: 'knob', key: 'upper8', label: "8'", color: '#ffffff', min: 0, max: 8, defaultValue: 8, formatValue: fmtDb },
            { type: 'knob', key: 'upper4', label: "4'", color: '#ffffff', min: 0, max: 8, defaultValue: 0, formatValue: fmtDb },
            { type: 'knob', key: 'upper223', label: "2\u2154'", color: '#000000', min: 0, max: 8, defaultValue: 0, formatValue: fmtDb },
            { type: 'knob', key: 'upper2', label: "2'", color: '#ffffff', min: 0, max: 8, defaultValue: 0, formatValue: fmtDb },
            { type: 'knob', key: 'upper135', label: "1\u2155'", color: '#000000', min: 0, max: 8, defaultValue: 0, formatValue: fmtDb },
            { type: 'knob', key: 'upper113', label: "1\u2153'", color: '#000000', min: 0, max: 8, defaultValue: 0, formatValue: fmtDb },
            { type: 'knob', key: 'upper1', label: "1'", color: '#ffffff', min: 0, max: 8, defaultValue: 0, formatValue: fmtDb },
          ],
        },
        {
          label: 'PERCUSSION',
          controls: [
            { type: 'toggle', key: 'percEnable', label: 'PERC', labels: ['OFF', 'ON'] },
            { type: 'toggle', key: 'percVolume', label: 'VOL', labels: ['NORM', 'SOFT'] },
            { type: 'toggle', key: 'percDecay', label: 'DECAY', labels: ['SLOW', 'FAST'] },
            { type: 'toggle', key: 'percHarmonic', label: 'HARM', labels: ['2ND', '3RD'] },
            { type: 'knob', key: 'percGain', label: 'GAIN', color: '#ff9900', min: 0, max: 22, defaultValue: 11, formatValue: (v) => `${Math.round(v)}` },
          ],
        },
        {
          label: 'LESLIE',
          controls: [
            { type: 'select', key: 'leslieSpeed', label: 'SPEED', options: [
              { value: '0', label: 'Stop' }, { value: '1', label: 'Slow' }, { value: '2', label: 'Fast' },
            ]},
            { type: 'toggle', key: 'leslieBrake', label: 'BRAKE', labels: ['OFF', 'ON'] },
          ],
        },
        {
          label: 'EFFECTS',
          controls: [
            { type: 'toggle', key: 'overdriveEnable', label: 'DRIVE', labels: ['OFF', 'ON'] },
            { type: 'knob', key: 'overdriveCharacter', label: 'CHAR', color: '#ff3366', min: 0, max: 127, defaultValue: 0, formatValue: (v) => `${Math.round(v)}` },
            { type: 'knob', key: 'reverbMix', label: 'REVERB', color: '#cc66ff', min: 0, max: 1, defaultValue: 0.1, formatValue: fmtPct },
            { type: 'knob', key: 'reverbWet', label: 'REV WET', color: '#cc66ff', min: 0, max: 1, defaultValue: 0.1, formatValue: fmtPct },
            { type: 'knob', key: 'keyClick', label: 'CLICK', color: '#ff9900', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'volume', label: 'VOLUME', color: '#00ff99', min: 0, max: 1, defaultValue: 0.8, formatValue: fmtPct },
          ],
        },
      ],
    },
    {
      id: 'detail',
      label: 'DETAIL',
      sections: [
        {
          label: 'LOWER DRAWBARS',
          controls: [
            { type: 'knob', key: 'lower16', label: "16'", color: '#8b4513', min: 0, max: 8, defaultValue: 8, formatValue: fmtDb },
            { type: 'knob', key: 'lower513', label: "5\u2153'", color: '#8b4513', min: 0, max: 8, defaultValue: 4, formatValue: fmtDb },
            { type: 'knob', key: 'lower8', label: "8'", color: '#ffffff', min: 0, max: 8, defaultValue: 8, formatValue: fmtDb },
            { type: 'knob', key: 'lower4', label: "4'", color: '#ffffff', min: 0, max: 8, defaultValue: 0, formatValue: fmtDb },
            { type: 'knob', key: 'lower223', label: "2\u2154'", color: '#000000', min: 0, max: 8, defaultValue: 0, formatValue: fmtDb },
            { type: 'knob', key: 'lower2', label: "2'", color: '#ffffff', min: 0, max: 8, defaultValue: 0, formatValue: fmtDb },
            { type: 'knob', key: 'lower135', label: "1\u2155'", color: '#000000', min: 0, max: 8, defaultValue: 0, formatValue: fmtDb },
            { type: 'knob', key: 'lower113', label: "1\u2153'", color: '#000000', min: 0, max: 8, defaultValue: 0, formatValue: fmtDb },
            { type: 'knob', key: 'lower1', label: "1'", color: '#ffffff', min: 0, max: 8, defaultValue: 0, formatValue: fmtDb },
          ],
        },
        {
          label: 'PEDAL DRAWBARS',
          controls: [
            { type: 'knob', key: 'pedal16', label: "16'", color: '#8b4513', min: 0, max: 8, defaultValue: 8, formatValue: fmtDb },
            { type: 'knob', key: 'pedal513', label: "5\u2153'", color: '#8b4513', min: 0, max: 8, defaultValue: 0, formatValue: fmtDb },
            { type: 'knob', key: 'pedal8', label: "8'", color: '#8b4513', min: 0, max: 8, defaultValue: 4, formatValue: fmtDb },
            { type: 'knob', key: 'pedal4', label: "4'", color: '#ffffff', min: 0, max: 8, defaultValue: 0, formatValue: fmtDb },
            { type: 'knob', key: 'pedal223', label: "2\u2154'", color: '#000000', min: 0, max: 8, defaultValue: 0, formatValue: fmtDb },
            { type: 'knob', key: 'pedal2', label: "2'", color: '#ffffff', min: 0, max: 8, defaultValue: 0, formatValue: fmtDb },
            { type: 'knob', key: 'pedal135', label: "1\u2155'", color: '#000000', min: 0, max: 8, defaultValue: 0, formatValue: fmtDb },
            { type: 'knob', key: 'pedal113', label: "1\u2153'", color: '#000000', min: 0, max: 8, defaultValue: 0, formatValue: fmtDb },
            { type: 'knob', key: 'pedal1', label: "1'", color: '#ffffff', min: 0, max: 8, defaultValue: 0, formatValue: fmtDb },
          ],
        },
        {
          label: 'VIBRATO / CHORUS',
          controls: [
            { type: 'select', key: 'vibratoType', label: 'TYPE', options: [
              { value: '0', label: 'Off' }, { value: '1', label: 'V1' }, { value: '2', label: 'C1' },
              { value: '3', label: 'V2' }, { value: '4', label: 'C2' }, { value: '5', label: 'V3' }, { value: '6', label: 'C3' },
            ]},
            { type: 'toggle', key: 'vibratoUpper', label: 'UPPER', labels: ['OFF', 'ON'] },
            { type: 'toggle', key: 'vibratoLower', label: 'LOWER', labels: ['OFF', 'ON'] },
            { type: 'knob', key: 'vibratoFreq', label: 'FREQ', color: '#ffcc00', min: 4, max: 22, defaultValue: 7, formatValue: (v) => `${v.toFixed(1)} Hz` },
          ],
        },
        {
          label: 'LESLIE DETAIL',
          controls: [
            { type: 'knob', key: 'hornSlowRpm', label: 'H SLOW', color: '#33ccff', min: 5, max: 200, defaultValue: 40, formatValue: fmtRpm },
            { type: 'knob', key: 'hornFastRpm', label: 'H FAST', color: '#33ccff', min: 100, max: 900, defaultValue: 400, formatValue: fmtRpm },
            { type: 'knob', key: 'drumSlowRpm', label: 'D SLOW', color: '#9966ff', min: 5, max: 100, defaultValue: 36, formatValue: fmtRpm },
            { type: 'knob', key: 'drumFastRpm', label: 'D FAST', color: '#9966ff', min: 60, max: 600, defaultValue: 357, formatValue: fmtRpm },
            { type: 'knob', key: 'hornAccel', label: 'H ACCEL', color: '#33ccff', min: 0.05, max: 2.0, defaultValue: 0.16, formatValue: (v) => `${v.toFixed(2)}s` },
            { type: 'knob', key: 'drumAccel', label: 'D ACCEL', color: '#9966ff', min: 0.5, max: 10.0, defaultValue: 4.13, formatValue: (v) => `${v.toFixed(1)}s` },
          ],
        },
        {
          label: 'MASTER',
          controls: [
            { type: 'knob', key: 'outputLevel', label: 'OUTPUT', color: '#00ff99', min: 0, max: 1, defaultValue: 0.7, formatValue: fmtPct },
            { type: 'knob', key: 'tuning', label: 'TUNING', color: '#ffcc00', min: 220, max: 880, defaultValue: 440, formatValue: (v) => `${Math.round(v)} Hz` },
            { type: 'knob', key: 'swellPedal', label: 'SWELL', color: '#ff9900', min: 0, max: 1, defaultValue: 1, formatValue: fmtPct },
          ],
        },
      ],
    },
  ],
};
