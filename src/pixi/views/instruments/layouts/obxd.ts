import type { SynthPanelLayout } from '../synthPanelTypes';

const fmtPct = (v: number) => `${Math.round(v * 100)}%`;
const fmtSec = (v: number) => v < 0.1 ? `${Math.round(v * 1000)}ms` : `${v.toFixed(2)}s`;

export const OBXD_LAYOUT: SynthPanelLayout = {
  name: 'OB-Xd Analog',
  configKey: 'obxd',
  tabs: [
    {
      id: 'osc',
      label: 'OSC',
      sections: [
        {
          label: 'OSCILLATOR 1',
          controls: [
            { type: 'knob', key: 'osc1Level', label: 'LEVEL', formatValue: fmtPct },
            { type: 'knob', key: 'osc1PulseWidth', label: 'PW', formatValue: fmtPct },
            { type: 'knob', key: 'osc1Detune', label: 'DETUNE', bipolar: true, formatValue: (v) => `${(v * 100).toFixed(0)}ct` },
          ],
        },
        {
          label: 'OSCILLATOR 2',
          controls: [
            { type: 'knob', key: 'osc2Level', label: 'LEVEL', formatValue: fmtPct },
            { type: 'knob', key: 'osc2PulseWidth', label: 'PW', formatValue: fmtPct },
            { type: 'knob', key: 'osc2Detune', label: 'DETUNE', bipolar: true, formatValue: (v) => `${(v * 100).toFixed(0)}ct` },
          ],
        },
        {
          label: 'MIXER',
          controls: [
            { type: 'knob', key: 'noiseLevel', label: 'NOISE', formatValue: fmtPct },
            { type: 'knob', key: 'subOscLevel', label: 'SUB', formatValue: fmtPct },
            { type: 'toggle', key: 'oscSync', label: 'SYNC' },
          ],
        },
      ],
    },
    {
      id: 'filter',
      label: 'FILTER',
      sections: [
        {
          label: 'FILTER',
          controls: [
            { type: 'knob', key: 'filterCutoff', label: 'CUTOFF', color: '#ffcc00', formatValue: fmtPct },
            { type: 'knob', key: 'filterResonance', label: 'RESO', color: '#ff6600', formatValue: fmtPct },
            { type: 'knob', key: 'filterEnvAmount', label: 'ENV AMT', formatValue: fmtPct },
            { type: 'knob', key: 'filterKeyTrack', label: 'KEY TRK', formatValue: fmtPct },
          ],
        },
        {
          label: 'FILTER ENVELOPE',
          controls: [
            { type: 'knob', key: 'filterAttack', label: 'A', formatValue: fmtSec },
            { type: 'knob', key: 'filterDecay', label: 'D', formatValue: fmtSec },
            { type: 'knob', key: 'filterSustain', label: 'S', formatValue: fmtPct },
            { type: 'knob', key: 'filterRelease', label: 'R', formatValue: fmtSec },
          ],
        },
      ],
    },
    {
      id: 'amp',
      label: 'AMP',
      sections: [
        {
          label: 'AMP ENVELOPE',
          controls: [
            { type: 'knob', key: 'ampAttack', label: 'A', formatValue: fmtSec },
            { type: 'knob', key: 'ampDecay', label: 'D', formatValue: fmtSec },
            { type: 'knob', key: 'ampSustain', label: 'S', formatValue: fmtPct },
            { type: 'knob', key: 'ampRelease', label: 'R', formatValue: fmtSec },
          ],
        },
        {
          label: 'LFO',
          controls: [
            { type: 'knob', key: 'lfoRate', label: 'RATE', formatValue: fmtPct },
            { type: 'knob', key: 'lfoOscAmount', label: 'OSC', formatValue: fmtPct },
            { type: 'knob', key: 'lfoFilterAmount', label: 'FLT', formatValue: fmtPct },
            { type: 'knob', key: 'lfoPwAmount', label: 'PW', formatValue: fmtPct },
          ],
        },
        {
          label: 'GLOBAL',
          controls: [
            { type: 'knob', key: 'masterVolume', label: 'VOLUME', formatValue: fmtPct },
            { type: 'knob', key: 'portamento', label: 'PORTA', formatValue: fmtPct },
            { type: 'knob', key: 'drift', label: 'DRIFT', formatValue: fmtPct },
          ],
        },
      ],
    },
  ],
};
