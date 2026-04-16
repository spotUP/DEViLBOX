import type { SynthPanelLayout } from '@/types/synthPanel';

const fmtPct = (v: number) => `${Math.round(v)}%`;

export const TR909_LAYOUT: SynthPanelLayout = {
  name: 'TR-909',
  configKey: '',
  tabs: [
    {
      id: 'kick',
      label: 'KICK',
      sections: [
        {
          label: 'BASS DRUM',
          controls: [
            { type: 'knob', key: 'tr909.kick.level', label: 'LEVEL', color: '#ff3366', min: 0, max: 100, defaultValue: 80, formatValue: fmtPct },
            { type: 'knob', key: 'tr909.kick.tune', label: 'TUNE', color: '#ff9900', min: 0, max: 100, defaultValue: 50, formatValue: fmtPct },
            { type: 'knob', key: 'tr909.kick.decay', label: 'DECAY', color: '#22c55e', min: 0, max: 100, defaultValue: 50, formatValue: fmtPct },
            { type: 'knob', key: 'tr909.kick.attack', label: 'ATTACK', color: '#66ccff', min: 0, max: 100, defaultValue: 50, formatValue: fmtPct },
          ],
        },
      ],
    },
    {
      id: 'snare',
      label: 'SNARE',
      sections: [
        {
          label: 'SNARE DRUM',
          controls: [
            { type: 'knob', key: 'tr909.snare.level', label: 'LEVEL', color: '#ff3366', min: 0, max: 100, defaultValue: 80, formatValue: fmtPct },
            { type: 'knob', key: 'tr909.snare.tune', label: 'TUNE', color: '#ff9900', min: 0, max: 100, defaultValue: 50, formatValue: fmtPct },
            { type: 'knob', key: 'tr909.snare.tone', label: 'TONE', color: '#ffcc00', min: 0, max: 100, defaultValue: 50, formatValue: fmtPct },
            { type: 'knob', key: 'tr909.snare.snappy', label: 'SNAPPY', color: '#cc66ff', min: 0, max: 100, defaultValue: 50, formatValue: fmtPct },
            { type: 'knob', key: 'tr909.snare.decay', label: 'DECAY', color: '#22c55e', min: 0, max: 100, defaultValue: 50, formatValue: fmtPct },
          ],
        },
      ],
    },
    {
      id: 'hats',
      label: 'HATS',
      sections: [
        {
          label: 'CLOSED HI-HAT',
          controls: [
            { type: 'knob', key: 'tr909.closedHat.level', label: 'LEVEL', color: '#ff3366', min: 0, max: 100, defaultValue: 80, formatValue: fmtPct },
            { type: 'knob', key: 'tr909.closedHat.decay', label: 'DECAY', color: '#22c55e', min: 0, max: 100, defaultValue: 50, formatValue: fmtPct },
          ],
        },
        {
          label: 'OPEN HI-HAT',
          controls: [
            { type: 'knob', key: 'tr909.openHat.level', label: 'LEVEL', color: '#ff3366', min: 0, max: 100, defaultValue: 80, formatValue: fmtPct },
            { type: 'knob', key: 'tr909.openHat.decay', label: 'DECAY', color: '#22c55e', min: 0, max: 100, defaultValue: 50, formatValue: fmtPct },
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
            { type: 'knob', key: 'tr909.tomLow.level', label: 'LEVEL', color: '#ff3366', min: 0, max: 100, defaultValue: 80, formatValue: fmtPct },
            { type: 'knob', key: 'tr909.tomLow.tune', label: 'TUNE', color: '#ff9900', min: 0, max: 100, defaultValue: 50, formatValue: fmtPct },
            { type: 'knob', key: 'tr909.tomLow.decay', label: 'DECAY', color: '#22c55e', min: 0, max: 100, defaultValue: 50, formatValue: fmtPct },
          ],
        },
        {
          label: 'MID TOM',
          controls: [
            { type: 'knob', key: 'tr909.tomMid.level', label: 'LEVEL', color: '#ff3366', min: 0, max: 100, defaultValue: 80, formatValue: fmtPct },
            { type: 'knob', key: 'tr909.tomMid.tune', label: 'TUNE', color: '#ff9900', min: 0, max: 100, defaultValue: 50, formatValue: fmtPct },
            { type: 'knob', key: 'tr909.tomMid.decay', label: 'DECAY', color: '#22c55e', min: 0, max: 100, defaultValue: 50, formatValue: fmtPct },
          ],
        },
        {
          label: 'HIGH TOM',
          controls: [
            { type: 'knob', key: 'tr909.tomHigh.level', label: 'LEVEL', color: '#ff3366', min: 0, max: 100, defaultValue: 80, formatValue: fmtPct },
            { type: 'knob', key: 'tr909.tomHigh.tune', label: 'TUNE', color: '#ff9900', min: 0, max: 100, defaultValue: 50, formatValue: fmtPct },
            { type: 'knob', key: 'tr909.tomHigh.decay', label: 'DECAY', color: '#22c55e', min: 0, max: 100, defaultValue: 50, formatValue: fmtPct },
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
            { type: 'knob', key: 'tr909.clap.level', label: 'LEVEL', color: '#ff3366', min: 0, max: 100, defaultValue: 80, formatValue: fmtPct },
          ],
        },
        {
          label: 'RIMSHOT',
          controls: [
            { type: 'knob', key: 'tr909.rimshot.level', label: 'LEVEL', color: '#ff3366', min: 0, max: 100, defaultValue: 80, formatValue: fmtPct },
          ],
        },
        {
          label: 'CRASH',
          controls: [
            { type: 'knob', key: 'tr909.crash.level', label: 'LEVEL', color: '#ff3366', min: 0, max: 100, defaultValue: 80, formatValue: fmtPct },
            { type: 'knob', key: 'tr909.crash.tune', label: 'TUNE', color: '#ff9900', min: 0, max: 100, defaultValue: 50, formatValue: fmtPct },
          ],
        },
        {
          label: 'RIDE',
          controls: [
            { type: 'knob', key: 'tr909.ride.level', label: 'LEVEL', color: '#ff3366', min: 0, max: 100, defaultValue: 80, formatValue: fmtPct },
            { type: 'knob', key: 'tr909.ride.tune', label: 'TUNE', color: '#ff9900', min: 0, max: 100, defaultValue: 50, formatValue: fmtPct },
          ],
        },
      ],
    },
  ],
};
