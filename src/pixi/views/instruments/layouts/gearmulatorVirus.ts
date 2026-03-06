import type { SynthPanelLayout } from '../synthPanelTypes';

const fmtPct = (v: number) => `${Math.round(v * 100)}%`;
const fmtHz = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}kHz` : `${Math.round(v)}Hz`;
const fmtMs = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${Math.round(v)}ms`;
const fmt127 = (v: number) => `${Math.round(v * 127)}`;
const fmtSemi = (v: number) => {
  const semi = Math.round((v - 0.5) * 48);
  return semi === 0 ? '0' : semi > 0 ? `+${semi}` : `${semi}`;
};

/**
 * Access Virus quick-edit panel for Pixi GL channel strip.
 * Key parameters only — the full skin is rendered via DOM overlay.
 */
export const GEARMULATOR_VIRUS_LAYOUT: SynthPanelLayout = {
  name: 'Access Virus',
  configKey: 'gearmulator',
  tabs: [
    {
      id: 'osc',
      label: 'OSC',
      sections: [
        {
          label: 'OSCILLATOR 1',
          controls: [
            { type: 'knob', key: 'osc1Shape', label: 'SHAPE', formatValue: fmt127 },
            { type: 'knob', key: 'osc1PulseWidth', label: 'PW', formatValue: fmtPct },
            { type: 'knob', key: 'osc1Semitone', label: 'SEMI', bipolar: true, formatValue: fmtSemi },
          ],
        },
        {
          label: 'OSCILLATOR 2',
          controls: [
            { type: 'knob', key: 'osc2Shape', label: 'SHAPE', formatValue: fmt127 },
            { type: 'knob', key: 'osc2PulseWidth', label: 'PW', formatValue: fmtPct },
            { type: 'knob', key: 'osc2Semitone', label: 'SEMI', bipolar: true, formatValue: fmtSemi },
            { type: 'knob', key: 'osc2Detune', label: 'DETUNE', bipolar: true, formatValue: fmt127 },
          ],
        },
        {
          label: 'MIXER',
          controls: [
            { type: 'knob', key: 'oscBalance', label: 'BALANCE', bipolar: true, formatValue: fmtPct },
            { type: 'knob', key: 'subOscVolume', label: 'SUB', formatValue: fmt127 },
            { type: 'knob', key: 'noiseVolume', label: 'NOISE', formatValue: fmt127 },
          ],
        },
      ],
    },
    {
      id: 'filter',
      label: 'FILTER',
      sections: [
        {
          label: 'FILTER 1',
          controls: [
            { type: 'knob', key: 'filter1Cutoff', label: 'CUTOFF', color: '#ff6644', formatValue: fmt127 },
            { type: 'knob', key: 'filter1Resonance', label: 'RESO', color: '#ff6644', formatValue: fmt127 },
            { type: 'knob', key: 'filter1EnvAmount', label: 'ENV AMT', color: '#ff6644', bipolar: true, formatValue: fmt127 },
            { type: 'knob', key: 'filter1KeyFollow', label: 'KEY FOL', formatValue: fmt127 },
          ],
        },
        {
          label: 'FILTER 2',
          controls: [
            { type: 'knob', key: 'filter2Cutoff', label: 'CUTOFF', color: '#44aaff', formatValue: fmt127 },
            { type: 'knob', key: 'filter2Resonance', label: 'RESO', color: '#44aaff', formatValue: fmt127 },
            { type: 'knob', key: 'filter2EnvAmount', label: 'ENV AMT', color: '#44aaff', bipolar: true, formatValue: fmt127 },
          ],
        },
        {
          label: 'FILTER ENVELOPE',
          controls: [
            { type: 'knob', key: 'filterEnvAttack', label: 'ATK', formatValue: fmtMs },
            { type: 'knob', key: 'filterEnvDecay', label: 'DEC', formatValue: fmtMs },
            { type: 'knob', key: 'filterEnvSustain', label: 'SUS', formatValue: fmtPct },
            { type: 'knob', key: 'filterEnvRelease', label: 'REL', formatValue: fmtMs },
          ],
        },
      ],
    },
    {
      id: 'amp',
      label: 'AMP',
      sections: [
        {
          label: 'AMPLIFIER',
          controls: [
            { type: 'knob', key: 'patchVolume', label: 'VOLUME', formatValue: fmt127 },
            { type: 'knob', key: 'panorama', label: 'PAN', bipolar: true, formatValue: fmt127 },
          ],
        },
        {
          label: 'AMP ENVELOPE',
          controls: [
            { type: 'knob', key: 'ampEnvAttack', label: 'ATK', formatValue: fmtMs },
            { type: 'knob', key: 'ampEnvDecay', label: 'DEC', formatValue: fmtMs },
            { type: 'knob', key: 'ampEnvSustain', label: 'SUS', formatValue: fmtPct },
            { type: 'knob', key: 'ampEnvRelease', label: 'REL', formatValue: fmtMs },
          ],
        },
      ],
    },
    {
      id: 'lfo',
      label: 'LFO',
      sections: [
        {
          label: 'LFO 1',
          controls: [
            { type: 'knob', key: 'lfo1Rate', label: 'RATE', formatValue: fmtHz },
            { type: 'knob', key: 'lfo1Amount', label: 'AMOUNT', formatValue: fmt127 },
          ],
        },
        {
          label: 'LFO 2',
          controls: [
            { type: 'knob', key: 'lfo2Rate', label: 'RATE', formatValue: fmtHz },
            { type: 'knob', key: 'lfo2Amount', label: 'AMOUNT', formatValue: fmt127 },
          ],
        },
      ],
    },
    {
      id: 'fx',
      label: 'FX',
      sections: [
        {
          label: 'EFFECTS',
          controls: [
            { type: 'knob', key: 'chorusMix', label: 'CHORUS', formatValue: fmtPct },
            { type: 'knob', key: 'delayTime', label: 'DELAY T', formatValue: fmtMs },
            { type: 'knob', key: 'delayFeedback', label: 'DELAY FB', formatValue: fmtPct },
            { type: 'knob', key: 'reverbDecay', label: 'REVERB', formatValue: fmtMs },
          ],
        },
        {
          label: 'DISTORTION',
          controls: [
            { type: 'knob', key: 'distortionIntensity', label: 'DRIVE', formatValue: fmt127 },
          ],
        },
      ],
    },
  ],
};
