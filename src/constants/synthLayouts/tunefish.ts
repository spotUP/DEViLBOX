import type { SynthPanelLayout } from '@/types/synthPanel';

const fmtPct = (v: number) => `${Math.round(v * 100)}%`;
const fmtOn = (v: number) => v >= 0.5 ? 'ON' : 'OFF';

export const TUNEFISH_LAYOUT: SynthPanelLayout = {
  name: 'Tunefish 4',
  configKey: 'tunefish',
  tabs: [
    {
      id: 'gen',
      label: 'GENERATOR',
      sections: [
        {
          label: 'OSCILLATOR',
          columns: 4,
          controls: [
            { type: 'knob', key: 'genBandwidth', label: 'BANDWIDTH', color: '#33ccff', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'genNumHarmonics', label: 'HARMONICS', color: '#33ccff', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'genDamp', label: 'DAMP', color: '#33ccff', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'genModulation', label: 'MOD', color: '#33ccff', min: 0, max: 1, defaultValue: 0.0, formatValue: fmtPct },
          ],
        },
        {
          label: 'VOICE',
          columns: 4,
          controls: [
            { type: 'knob', key: 'genVolume', label: 'VOLUME', color: '#66ff99', min: 0, max: 1, defaultValue: 0.8, formatValue: fmtPct },
            { type: 'knob', key: 'genPanning', label: 'PAN', color: '#66ff99', min: 0, max: 1, defaultValue: 0.5, formatValue: (v) => `${Math.round((v - 0.5) * 200)}` },
            { type: 'knob', key: 'genDrive', label: 'DRIVE', color: '#ff6633', min: 0, max: 1, defaultValue: 0.0, formatValue: fmtPct },
            { type: 'knob', key: 'globalGain', label: 'GAIN', color: '#66ff99', min: 0, max: 1, defaultValue: 0.7, formatValue: fmtPct },
          ],
        },
        {
          label: 'PITCH',
          columns: 4,
          controls: [
            { type: 'knob', key: 'genOctave', label: 'OCTAVE', color: '#ffcc33', min: 0, max: 1, defaultValue: 0.5, formatValue: (v) => `${Math.round((v - 0.5) * 8)}` },
            { type: 'knob', key: 'genFreq', label: 'FREQ', color: '#ffcc33', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'genDetune', label: 'DETUNE', color: '#ffcc33', min: 0, max: 1, defaultValue: 0.0, formatValue: fmtPct },
            { type: 'knob', key: 'genGlide', label: 'GLIDE', color: '#ffcc33', min: 0, max: 1, defaultValue: 0.0, formatValue: fmtPct },
          ],
        },
        {
          label: 'UNISON',
          columns: 4,
          controls: [
            { type: 'knob', key: 'genPolyphony', label: 'POLY', color: '#cc66ff', min: 0, max: 1, defaultValue: 1.0, formatValue: (v) => `${Math.round(v * 16)}` },
            { type: 'knob', key: 'genUnisono', label: 'UNISON', color: '#cc66ff', min: 0, max: 1, defaultValue: 0.0, formatValue: (v) => `${Math.round(v * 8)}` },
            { type: 'knob', key: 'genSpread', label: 'SPREAD', color: '#cc66ff', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'genSlop', label: 'SLOP', color: '#cc66ff', min: 0, max: 1, defaultValue: 0.0, formatValue: fmtPct },
          ],
        },
      ],
    },
    {
      id: 'filter',
      label: 'FILTER',
      sections: [
        {
          label: 'LOWPASS',
          columns: 3,
          controls: [
            { type: 'knob', key: 'lpFilterOn', label: 'ON', color: '#ff6633', min: 0, max: 1, defaultValue: 0, formatValue: fmtOn },
            { type: 'knob', key: 'lpFilterCutoff', label: 'CUTOFF', color: '#ff6633', min: 0, max: 1, defaultValue: 1.0, formatValue: fmtPct },
            { type: 'knob', key: 'lpFilterResonance', label: 'RESO', color: '#ff6633', min: 0, max: 1, defaultValue: 0.0, formatValue: fmtPct },
          ],
        },
        {
          label: 'HIGHPASS',
          columns: 3,
          controls: [
            { type: 'knob', key: 'hpFilterOn', label: 'ON', color: '#33ccff', min: 0, max: 1, defaultValue: 0, formatValue: fmtOn },
            { type: 'knob', key: 'hpFilterCutoff', label: 'CUTOFF', color: '#33ccff', min: 0, max: 1, defaultValue: 0.0, formatValue: fmtPct },
            { type: 'knob', key: 'hpFilterResonance', label: 'RESO', color: '#33ccff', min: 0, max: 1, defaultValue: 0.0, formatValue: fmtPct },
          ],
        },
        {
          label: 'BANDPASS',
          columns: 3,
          controls: [
            { type: 'knob', key: 'bpFilterOn', label: 'ON', color: '#ffcc33', min: 0, max: 1, defaultValue: 0, formatValue: fmtOn },
            { type: 'knob', key: 'bpFilterCutoff', label: 'CUTOFF', color: '#ffcc33', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'bpFilterQ', label: 'Q', color: '#ffcc33', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
          ],
        },
        {
          label: 'NOTCH',
          columns: 3,
          controls: [
            { type: 'knob', key: 'ntFilterOn', label: 'ON', color: '#cc66ff', min: 0, max: 1, defaultValue: 0, formatValue: fmtOn },
            { type: 'knob', key: 'ntFilterCutoff', label: 'CUTOFF', color: '#cc66ff', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'ntFilterQ', label: 'Q', color: '#cc66ff', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
          ],
        },
        {
          label: 'NOISE',
          columns: 3,
          controls: [
            { type: 'knob', key: 'noiseAmount', label: 'AMOUNT', color: '#999999', min: 0, max: 1, defaultValue: 0.0, formatValue: fmtPct },
            { type: 'knob', key: 'noiseFreq', label: 'FREQ', color: '#999999', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'noiseBw', label: 'BW', color: '#999999', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
          ],
        },
      ],
    },
    {
      id: 'fx',
      label: 'EFFECTS',
      sections: [
        {
          label: 'DISTORTION',
          controls: [
            { type: 'knob', key: 'distortAmount', label: 'AMOUNT', color: '#ff3333', min: 0, max: 1, defaultValue: 0.0, formatValue: fmtPct },
          ],
        },
        {
          label: 'CHORUS',
          columns: 3,
          controls: [
            { type: 'knob', key: 'chorusRate', label: 'RATE', color: '#33ccff', min: 0, max: 1, defaultValue: 0.0, formatValue: fmtPct },
            { type: 'knob', key: 'chorusDepth', label: 'DEPTH', color: '#33ccff', min: 0, max: 1, defaultValue: 0.0, formatValue: fmtPct },
            { type: 'knob', key: 'chorusGain', label: 'GAIN', color: '#33ccff', min: 0, max: 1, defaultValue: 0.0, formatValue: fmtPct },
          ],
        },
        {
          label: 'DELAY',
          columns: 3,
          controls: [
            { type: 'knob', key: 'delayLeft', label: 'LEFT', color: '#66ff99', min: 0, max: 1, defaultValue: 0.0, formatValue: fmtPct },
            { type: 'knob', key: 'delayRight', label: 'RIGHT', color: '#66ff99', min: 0, max: 1, defaultValue: 0.0, formatValue: fmtPct },
            { type: 'knob', key: 'delayDecay', label: 'DECAY', color: '#66ff99', min: 0, max: 1, defaultValue: 0.0, formatValue: fmtPct },
          ],
        },
        {
          label: 'REVERB',
          columns: 4,
          controls: [
            { type: 'knob', key: 'reverbRoomsize', label: 'SIZE', color: '#cc66ff', min: 0, max: 1, defaultValue: 0.0, formatValue: fmtPct },
            { type: 'knob', key: 'reverbDamp', label: 'DAMP', color: '#cc66ff', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'reverbWet', label: 'WET', color: '#cc66ff', min: 0, max: 1, defaultValue: 0.0, formatValue: fmtPct },
            { type: 'knob', key: 'reverbWidth', label: 'WIDTH', color: '#cc66ff', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
          ],
        },
        {
          label: 'FLANGER',
          columns: 4,
          controls: [
            { type: 'knob', key: 'flangerLfo', label: 'LFO', color: '#ffcc33', min: 0, max: 1, defaultValue: 0.0, formatValue: fmtPct },
            { type: 'knob', key: 'flangerFrequency', label: 'FREQ', color: '#ffcc33', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'flangerAmplitude', label: 'AMP', color: '#ffcc33', min: 0, max: 1, defaultValue: 0.0, formatValue: fmtPct },
            { type: 'knob', key: 'flangerWet', label: 'WET', color: '#ffcc33', min: 0, max: 1, defaultValue: 0.0, formatValue: fmtPct },
          ],
        },
        {
          label: 'FORMANT / EQ',
          columns: 4,
          controls: [
            { type: 'knob', key: 'formantWet', label: 'FORMANT', color: '#ff9933', min: 0, max: 1, defaultValue: 0.0, formatValue: fmtPct },
            { type: 'knob', key: 'eqLow', label: 'EQ LOW', color: '#ff6633', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'eqMid', label: 'EQ MID', color: '#ffcc33', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'eqHigh', label: 'EQ HIGH', color: '#33ccff', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
          ],
        },
      ],
    },
  ],
};
