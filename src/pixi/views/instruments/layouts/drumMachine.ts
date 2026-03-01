import type { SynthPanelLayout } from '../synthPanelTypes';

// DrumMachineConfig lives at config.drumMachine.
// drumType selects the active voice; each voice (kick/snare/hihat/clap) has its own section.
// Tabs let user access all voices regardless of current drumType.

const fmtHz = (v: number) => `${Math.round(v)} Hz`;
const fmtMs = (v: number) => `${Math.round(v)}ms`;
const fmtPct = (v: number) => `${Math.round(v)}%`;
const fmtDb = (v: number) => `${Math.round(v)}dB`;
const fmtPan = (v: number) => v === 0 ? 'C' : v > 0 ? `R${Math.round(v)}` : `L${Math.round(-v)}`;

export const DRUM_MACHINE_LAYOUT: SynthPanelLayout = {
  name: 'Drum Machine',
  configKey: 'drumMachine',
  tabs: [
    {
      id: 'kick',
      label: 'KICK',
      sections: [
        {
          label: 'AMP',
          controls: [
            { type: 'knob', key: '~volume', label: 'VOLUME', color: '#00ff99', min: -60, max: 0, defaultValue: -12, formatValue: fmtDb },
            { type: 'knob', key: '~pan', label: 'PAN', color: '#66ccff', min: -100, max: 100, defaultValue: 0, bipolar: true, formatValue: fmtPan },
          ],
        },
        {
          label: 'KICK',
          controls: [
            { type: 'knob', key: 'kick.pitch', label: 'PITCH', color: '#ff9900', min: 30, max: 100, defaultValue: 80, formatValue: fmtHz },
            { type: 'knob', key: 'kick.decay', label: 'DECAY', color: '#ff6600', min: 50, max: 2000, defaultValue: 300, formatValue: fmtMs },
            { type: 'knob', key: 'kick.tone', label: 'TONE', color: '#ffcc00', min: 0, max: 100, defaultValue: 50, formatValue: fmtPct },
            { type: 'knob', key: 'kick.drive', label: 'DRIVE', color: '#ff3366', min: 0, max: 100, defaultValue: 50, formatValue: fmtPct },
            { type: 'knob', key: 'kick.envAmount', label: 'ENV AMT', color: '#cc66ff', min: 1, max: 10, defaultValue: 2.5, formatValue: (v) => `${v.toFixed(1)}x` },
            { type: 'knob', key: 'kick.envDuration', label: 'ENV TIME', color: '#9966ff', min: 0, max: 200, defaultValue: 50, formatValue: fmtMs },
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
            { type: 'knob', key: 'snare.pitch', label: 'PITCH', color: '#ff9900', min: 100, max: 500, defaultValue: 220, formatValue: fmtHz },
            { type: 'knob', key: 'snare.decay', label: 'DECAY', color: '#ff6600', min: 50, max: 500, defaultValue: 100, formatValue: fmtMs },
            { type: 'knob', key: 'snare.tone', label: 'TONE', color: '#ffcc00', min: 0, max: 100, defaultValue: 50, formatValue: fmtPct },
            { type: 'knob', key: 'snare.snappy', label: 'SNAPPY', color: '#cc66ff', min: 0, max: 100, defaultValue: 70, formatValue: fmtPct },
            { type: 'knob', key: 'snare.toneDecay', label: 'SNAP DEC', color: '#9966ff', min: 10, max: 500, defaultValue: 250, formatValue: fmtMs },
          ],
        },
      ],
    },
    {
      id: 'hihat',
      label: 'HH',
      sections: [
        {
          label: 'HI-HAT',
          controls: [
            { type: 'knob', key: 'hihat.tone', label: 'TONE', color: '#ffcc00', min: 0, max: 100, defaultValue: 50, formatValue: fmtPct },
            { type: 'knob', key: 'hihat.decay', label: 'DECAY', color: '#ff6600', min: 10, max: 1000, defaultValue: 50, formatValue: fmtMs },
            { type: 'knob', key: 'hihat.metallic', label: 'METALLIC', color: '#cc66ff', min: 0, max: 100, defaultValue: 50, formatValue: fmtPct },
          ],
        },
      ],
    },
    {
      id: 'clap',
      label: 'CLAP',
      sections: [
        {
          label: 'CLAP',
          controls: [
            { type: 'knob', key: 'clap.tone', label: 'TONE', color: '#ffcc00', min: 0, max: 100, defaultValue: 50, formatValue: fmtPct },
            { type: 'knob', key: 'clap.decay', label: 'DECAY', color: '#ff6600', min: 50, max: 500, defaultValue: 115, formatValue: fmtMs },
            { type: 'knob', key: 'clap.spread', label: 'SPREAD', color: '#cc66ff', min: 0, max: 100, defaultValue: 10, formatValue: fmtMs },
          ],
        },
      ],
    },
  ],
};
