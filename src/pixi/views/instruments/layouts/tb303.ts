import type { SynthPanelLayout } from '../synthPanelTypes';

const fmtHz = (v: number) => `${Math.round(314 * Math.pow(2394 / 314, v))} Hz`;
const fmtMs = (v: number) => `${Math.round(200 + v * 1800)} ms`;
const fmtPct = (v: number) => `${Math.round(v * 100)}%`;

export const TB303_LAYOUT: SynthPanelLayout = {
  name: 'TB-303 Bass Line',
  configKey: 'tb303',
  tabs: [
    {
      id: 'main',
      label: 'MAIN',
      sections: [
        {
          label: 'FILTER',
          controls: [
            { type: 'knob', key: 'filter.cutoff', label: 'CUTOFF', color: '#ffcc00', formatValue: fmtHz },
            { type: 'knob', key: 'filter.resonance', label: 'RESO', color: '#ff6600', formatValue: fmtPct },
            { type: 'knob', key: 'filter.envMod', label: 'ENV MOD', color: '#ff3366', formatValue: fmtPct },
            { type: 'knob', key: 'filter.decay', label: 'DECAY', color: '#33ccff', formatValue: fmtMs },
          ],
        },
        {
          label: 'AMP',
          controls: [
            { type: 'knob', key: 'filter.accent', label: 'ACCENT', color: '#ff0066', formatValue: fmtPct },
            { type: 'knob', key: 'volume', label: 'VOLUME', color: '#00ff99', formatValue: (v) => `${Math.round(-60 + v * 60)} dB` },
          ],
        },
        {
          label: 'OSCILLATOR',
          controls: [
            { type: 'knob', key: 'waveform', label: 'WAVE', color: '#9966ff', formatValue: (v) => v < 0.5 ? 'SAW' : 'SQR' },
            { type: 'knob', key: 'tuning', label: 'TUNE', color: '#66ccff', formatValue: (v) => `${Math.round(400 + v * 80)} Hz` },
          ],
        },
      ],
    },
    {
      id: 'devilfish',
      label: 'DEVIL',
      sections: [
        {
          label: 'DEVIL FISH MODS',
          controls: [
            { type: 'knob', key: 'devilFish.normalDecay', label: 'NORM DEC', formatValue: (v) => `${Math.round(30 + v * 2970)} ms` },
            { type: 'knob', key: 'devilFish.accentDecay', label: 'ACC DEC', formatValue: (v) => `${Math.round(30 + v * 2970)} ms` },
            { type: 'knob', key: 'devilFish.softAttack', label: 'SOFT ATK', formatValue: (v) => `${Math.round(0.3 + v * 3000)} ms` },
            { type: 'knob', key: 'devilFish.filterInputDrive', label: 'DRIVE', formatValue: fmtPct },
            { type: 'knob', key: 'devilFish.diodeCharacter', label: 'DIODE', formatValue: fmtPct },
            { type: 'knob', key: 'devilFish.duffingAmount', label: 'DUFF', formatValue: fmtPct },
          ],
        },
      ],
    },
  ],
};
