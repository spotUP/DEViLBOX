import type { SynthPanelLayout } from '../synthPanelTypes';

const fmtHz = (v: number) => `${Math.round(314 * Math.pow(2394 / 314, v))} Hz`;
const fmtMs = (v: number) => `${Math.round(200 + v * 1800)} ms`;
const fmtMsRaw = (v: number) => `${Math.round(30 + v * 2970)} ms`;
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
      id: 'osc',
      label: 'OSC',
      sections: [
        {
          label: 'SUB OSCILLATOR',
          controls: [
            { type: 'knob', key: 'osc.subGain', label: 'SUB GAIN', color: '#c084fc', formatValue: fmtPct },
            { type: 'knob', key: 'osc.subBlend', label: 'SUB BLEND', color: '#c084fc', formatValue: fmtPct },
          ],
        },
        {
          label: 'PULSE WIDTH',
          controls: [
            { type: 'knob', key: 'osc.pulseWidth', label: 'PW', color: '#818cf8', formatValue: fmtPct },
            { type: 'knob', key: 'osc.pwmDepth', label: 'PWM', color: '#818cf8', formatValue: fmtPct },
          ],
        },
      ],
    },
    {
      id: 'mojo',
      label: 'MOJO',
      sections: [
        {
          label: 'FILTER CHARACTER',
          controls: [
            { type: 'select', key: 'mojo.filterSelect', label: 'FILTER', options: [
              { value: '0', label: 'Diode Ladder' },
              { value: '5', label: 'MissThang-20' },
            ]},
            { type: 'knob', key: 'mojo.lpBpMix', label: 'LP/BP MIX', color: '#f472b6', formatValue: fmtPct },
            { type: 'knob', key: 'mojo.bite', label: 'BITE', color: '#f472b6', formatValue: fmtPct },
            { type: 'knob', key: 'mojo.tension', label: 'TENSION', color: '#f472b6', formatValue: fmtPct },
          ],
        },
        {
          label: 'SATURATION',
          controls: [
            { type: 'knob', key: 'mojo.saturation', label: 'SATUR', color: '#fb923c', formatValue: fmtPct },
            { type: 'knob', key: 'mojo.stageNonlin', label: 'NONLIN', color: '#fb923c', formatValue: fmtPct },
          ],
        },
        {
          label: 'COMPENSATION',
          controls: [
            { type: 'knob', key: 'devilFish.passbandCompensation', label: 'PASSBAND', formatValue: fmtPct },
            { type: 'knob', key: 'devilFish.resTracking', label: 'RES TRACK', formatValue: fmtPct },
          ],
        },
      ],
    },
    {
      id: 'lfo',
      label: 'LFO',
      sections: [
        {
          label: 'LFO',
          controls: [
            { type: 'select', key: 'lfo.waveform', label: 'WAVE', options: [
              { value: 'sine', label: 'Sine' },
              { value: 'square', label: 'Square' },
              { value: 'sawtooth', label: 'Saw' },
              { value: 'triangle', label: 'Triangle' },
              { value: 'random', label: 'Random' },
              { value: 'samplehold', label: 'S&H' },
            ]},
            { type: 'knob', key: 'lfo.rate', label: 'RATE', color: '#06b6d4', formatValue: (v) => `${(v * 20).toFixed(1)} Hz` },
            { type: 'knob', key: 'lfo.contour', label: 'CONTOUR', color: '#06b6d4', formatValue: fmtPct },
          ],
        },
        {
          label: 'LFO DEPTH',
          controls: [
            { type: 'knob', key: 'lfo.filterDepth', label: 'FILTER', color: '#22d3ee', formatValue: fmtPct },
            { type: 'knob', key: 'lfo.pitchMod', label: 'PITCH', color: '#22d3ee', formatValue: fmtPct },
            { type: 'knob', key: 'lfo.pwmMod', label: 'PWM', color: '#22d3ee', formatValue: fmtPct },
            { type: 'knob', key: 'lfo.tensionDepth', label: 'TENSION', color: '#22d3ee', formatValue: fmtPct },
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
            { type: 'knob', key: 'devilFish.normalDecay', label: 'NORM DEC', formatValue: fmtMsRaw },
            { type: 'knob', key: 'devilFish.accentDecay', label: 'ACC DEC', formatValue: fmtMsRaw },
            { type: 'knob', key: 'devilFish.softAttack', label: 'SOFT ATK', formatValue: (v) => `${Math.round(0.3 + v * 3000)} ms` },
            { type: 'knob', key: 'devilFish.accentSoftAttack', label: 'ACC ATK', formatValue: (v) => `${Math.round(0.3 + v * 3000)} ms` },
            { type: 'knob', key: 'devilFish.filterInputDrive', label: 'DRIVE', formatValue: fmtPct },
            { type: 'knob', key: 'devilFish.diodeCharacter', label: 'DIODE', formatValue: fmtPct },
            { type: 'knob', key: 'devilFish.duffingAmount', label: 'DUFF', formatValue: fmtPct },
          ],
        },
        {
          label: 'SLIDE & ENVELOPE',
          controls: [
            { type: 'knob', key: 'devilFish.slideTime', label: 'SLIDE', formatValue: (v) => `${Math.round(2 + v * 358)} ms` },
            { type: 'knob', key: 'devilFish.vegDecay', label: 'VEG DEC', formatValue: fmtMsRaw },
            { type: 'knob', key: 'devilFish.vegSustain', label: 'VEG SUS', formatValue: fmtPct },
            { type: 'knob', key: 'devilFish.filterFmDepth', label: 'FM DEPTH', formatValue: fmtPct },
          ],
        },
        {
          label: 'TOGGLES',
          controls: [
            { type: 'toggle', key: 'devilFish.accentSweep', label: 'ACC SWEEP', labels: ['OFF', 'ON'] },
            { type: 'toggle', key: 'devilFish.hiResonance', label: 'HI RESO', labels: ['OFF', 'ON'] },
            { type: 'toggle', key: 'devilFish.tempoRelative', label: 'TEMPO REL', labels: ['OFF', 'ON'] },
          ],
        },
      ],
    },
    {
      id: 'fx',
      label: 'FX',
      sections: [
        {
          label: 'CHORUS',
          controls: [
            { type: 'toggle', key: 'fx.chorus.enabled', label: 'ENABLE', labels: ['OFF', 'ON'] },
            { type: 'knob', key: 'fx.chorus.rate', label: 'RATE', color: '#a78bfa', formatValue: (v) => `${(v * 10).toFixed(1)} Hz` },
            { type: 'knob', key: 'fx.chorus.depth', label: 'DEPTH', color: '#a78bfa', formatValue: fmtPct },
            { type: 'knob', key: 'fx.chorus.wet', label: 'WET', color: '#a78bfa', formatValue: fmtPct },
          ],
        },
        {
          label: 'PHASER',
          controls: [
            { type: 'toggle', key: 'fx.phaser.enabled', label: 'ENABLE', labels: ['OFF', 'ON'] },
            { type: 'knob', key: 'fx.phaser.rate', label: 'RATE', color: '#34d399', formatValue: (v) => `${(v * 10).toFixed(1)} Hz` },
            { type: 'knob', key: 'fx.phaser.depth', label: 'DEPTH', color: '#34d399', formatValue: fmtPct },
            { type: 'knob', key: 'fx.phaser.wet', label: 'WET', color: '#34d399', formatValue: fmtPct },
          ],
        },
        {
          label: 'DELAY',
          controls: [
            { type: 'toggle', key: 'fx.delay.enabled', label: 'ENABLE', labels: ['OFF', 'ON'] },
            { type: 'knob', key: 'fx.delay.time', label: 'TIME', color: '#60a5fa', formatValue: (v) => `${Math.round(v * 1000)} ms` },
            { type: 'knob', key: 'fx.delay.feedback', label: 'FDBK', color: '#60a5fa', formatValue: fmtPct },
            { type: 'knob', key: 'fx.delay.wet', label: 'WET', color: '#60a5fa', formatValue: fmtPct },
          ],
        },
        {
          label: 'OVERDRIVE',
          controls: [
            { type: 'toggle', key: 'fx.overdrive.enabled', label: 'ENABLE', labels: ['OFF', 'ON'] },
            { type: 'knob', key: 'fx.overdrive.drive', label: 'DRIVE', color: '#f87171', formatValue: fmtPct },
            { type: 'knob', key: 'fx.overdrive.tone', label: 'TONE', color: '#f87171', formatValue: fmtPct },
            { type: 'knob', key: 'fx.overdrive.wet', label: 'WET', color: '#f87171', formatValue: fmtPct },
          ],
        },
      ],
    },
  ],
};
