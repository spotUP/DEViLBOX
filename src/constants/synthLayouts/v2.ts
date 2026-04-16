import type { SynthPanelLayout } from '@/types/synthPanel';

const OSC_NAMES = ['Off', 'Saw', 'Pulse', 'Sin', 'Noise', 'FM', 'AuxA', 'AuxB'];
const FILT_NAMES = ['Off', 'Low', 'Band', 'High', 'Notch', 'All', 'MoogL', 'MoogH'];
const fmtOsc = (v: number) => OSC_NAMES[Math.round(v)] || '?';
const fmtFilt = (v: number) => FILT_NAMES[Math.round(v)] || '?';
const fmtVal = (v: number) => `${Math.round(v)}`;
const fmtSigned = (v: number) => `${Math.round(v) - 64}`;

export const V2_LAYOUT: SynthPanelLayout = {
  name: 'V2 Synthesizer',
  configKey: 'v2',
  tabs: [
    {
      id: 'osc',
      label: 'OSCILLATORS',
      sections: [
        {
          label: 'OSC 1',
          columns: 4,
          controls: [
            { type: 'knob', key: 'osc1.mode', label: 'MODE', color: '#33ccff', min: 0, max: 7, defaultValue: 1, formatValue: fmtOsc },
            { type: 'knob', key: 'osc1.transpose', label: 'TRANS', color: '#ffcc33', min: 0, max: 127, defaultValue: 64, formatValue: fmtSigned },
            { type: 'knob', key: 'osc1.detune', label: 'DETUNE', color: '#ffcc33', min: 0, max: 127, defaultValue: 64, formatValue: fmtSigned },
            { type: 'knob', key: 'osc1.color', label: 'COLOR', color: '#ff9933', min: 0, max: 127, defaultValue: 0, formatValue: fmtVal },
          ],
        },
        {
          label: 'OSC 2',
          columns: 4,
          controls: [
            { type: 'knob', key: 'osc2.mode', label: 'MODE', color: '#ff6633', min: 0, max: 7, defaultValue: 0, formatValue: fmtOsc },
            { type: 'knob', key: 'osc2.transpose', label: 'TRANS', color: '#ffcc33', min: 0, max: 127, defaultValue: 64, formatValue: fmtSigned },
            { type: 'knob', key: 'osc2.detune', label: 'DETUNE', color: '#ffcc33', min: 0, max: 127, defaultValue: 64, formatValue: fmtSigned },
            { type: 'knob', key: 'osc2.color', label: 'COLOR', color: '#ff9933', min: 0, max: 127, defaultValue: 32, formatValue: fmtVal },
          ],
        },
        {
          label: 'OSC 3',
          columns: 4,
          controls: [
            { type: 'knob', key: 'osc3.mode', label: 'MODE', color: '#cc66ff', min: 0, max: 7, defaultValue: 0, formatValue: fmtOsc },
            { type: 'knob', key: 'osc3.transpose', label: 'TRANS', color: '#ffcc33', min: 0, max: 127, defaultValue: 64, formatValue: fmtSigned },
            { type: 'knob', key: 'osc3.detune', label: 'DETUNE', color: '#ffcc33', min: 0, max: 127, defaultValue: 64, formatValue: fmtSigned },
            { type: 'knob', key: 'osc3.color', label: 'COLOR', color: '#ff9933', min: 0, max: 127, defaultValue: 32, formatValue: fmtVal },
          ],
        },
        {
          label: 'LEVELS',
          columns: 3,
          controls: [
            { type: 'knob', key: 'osc1.level', label: 'OSC1 VOL', color: '#66ff99', min: 0, max: 127, defaultValue: 127, formatValue: fmtVal },
            { type: 'knob', key: 'osc2.level', label: 'OSC2 VOL', color: '#66ff99', min: 0, max: 127, defaultValue: 0, formatValue: fmtVal },
            { type: 'knob', key: 'osc3.level', label: 'OSC3 VOL', color: '#66ff99', min: 0, max: 127, defaultValue: 0, formatValue: fmtVal },
          ],
        },
      ],
    },
    {
      id: 'filter',
      label: 'FILTERS',
      sections: [
        {
          label: 'FILTER 1',
          columns: 3,
          controls: [
            { type: 'knob', key: 'filter1.mode', label: 'MODE', color: '#ff6633', min: 0, max: 7, defaultValue: 1, formatValue: fmtFilt },
            { type: 'knob', key: 'filter1.cutoff', label: 'CUTOFF', color: '#ff6633', min: 0, max: 127, defaultValue: 127, formatValue: fmtVal },
            { type: 'knob', key: 'filter1.resonance', label: 'RESO', color: '#ff6633', min: 0, max: 127, defaultValue: 0, formatValue: fmtVal },
          ],
        },
        {
          label: 'FILTER 2',
          columns: 3,
          controls: [
            { type: 'knob', key: 'filter2.mode', label: 'MODE', color: '#33ccff', min: 0, max: 7, defaultValue: 0, formatValue: fmtFilt },
            { type: 'knob', key: 'filter2.cutoff', label: 'CUTOFF', color: '#33ccff', min: 0, max: 127, defaultValue: 64, formatValue: fmtVal },
            { type: 'knob', key: 'filter2.resonance', label: 'RESO', color: '#33ccff', min: 0, max: 127, defaultValue: 0, formatValue: fmtVal },
          ],
        },
        {
          label: 'ROUTING',
          columns: 2,
          controls: [
            { type: 'knob', key: 'routing.mode', label: 'ROUTE', color: '#cc66ff', min: 0, max: 2, defaultValue: 0, formatValue: (v) => ['Single', 'Serial', 'Paral'][Math.round(v)] || '?' },
            { type: 'knob', key: 'routing.balance', label: 'BALANCE', color: '#cc66ff', min: 0, max: 127, defaultValue: 64, formatValue: fmtSigned },
          ],
        },
      ],
    },
    {
      id: 'env',
      label: 'ENVELOPES',
      sections: [
        {
          label: 'AMP ENVELOPE',
          columns: 4,
          controls: [
            { type: 'knob', key: 'envelope.attack', label: 'ATTACK', color: '#66ff99', min: 0, max: 127, defaultValue: 0, formatValue: fmtVal },
            { type: 'knob', key: 'envelope.decay', label: 'DECAY', color: '#66ff99', min: 0, max: 127, defaultValue: 64, formatValue: fmtVal },
            { type: 'knob', key: 'envelope.sustain', label: 'SUSTAIN', color: '#66ff99', min: 0, max: 127, defaultValue: 127, formatValue: fmtVal },
            { type: 'knob', key: 'envelope.release', label: 'RELEASE', color: '#66ff99', min: 0, max: 127, defaultValue: 32, formatValue: fmtVal },
          ],
        },
        {
          label: 'MOD ENVELOPE',
          columns: 4,
          controls: [
            { type: 'knob', key: 'envelope2.attack', label: 'ATTACK', color: '#ff9933', min: 0, max: 127, defaultValue: 0, formatValue: fmtVal },
            { type: 'knob', key: 'envelope2.decay', label: 'DECAY', color: '#ff9933', min: 0, max: 127, defaultValue: 64, formatValue: fmtVal },
            { type: 'knob', key: 'envelope2.sustain', label: 'SUSTAIN', color: '#ff9933', min: 0, max: 127, defaultValue: 127, formatValue: fmtVal },
            { type: 'knob', key: 'envelope2.release', label: 'RELEASE', color: '#ff9933', min: 0, max: 127, defaultValue: 32, formatValue: fmtVal },
          ],
        },
        {
          label: 'LFO 1',
          columns: 2,
          controls: [
            { type: 'knob', key: 'lfo1.rate', label: 'RATE', color: '#33ccff', min: 0, max: 127, defaultValue: 64, formatValue: fmtVal },
            { type: 'knob', key: 'lfo1.depth', label: 'DEPTH', color: '#33ccff', min: 0, max: 127, defaultValue: 0, formatValue: fmtVal },
          ],
        },
      ],
    },
  ],
};
