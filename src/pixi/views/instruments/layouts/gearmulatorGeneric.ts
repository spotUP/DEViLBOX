import type { SynthPanelLayout } from '../synthPanelTypes';

const fmtPct = (v: number) => `${Math.round(v * 100)}%`;
const fmt127 = (v: number) => `${Math.round(v * 127)}`;
const fmtMs = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${Math.round(v)}ms`;

/**
 * Generic Gearmulator layout for synths that don't have dedicated panels yet.
 * Uses common subtractive synth parameters (OSC, Filter, Amp, LFO).
 */
function makeGearmulatorLayout(name: string): SynthPanelLayout {
  return {
    name,
    configKey: 'gearmulator',
    tabs: [
      {
        id: 'osc',
        label: 'OSC',
        sections: [
          {
            label: 'OSCILLATOR',
            controls: [
              { type: 'knob', key: 'osc1Shape', label: 'SHAPE', formatValue: fmt127 },
              { type: 'knob', key: 'osc1PulseWidth', label: 'PW', formatValue: fmtPct },
            ],
          },
          {
            label: 'MIXER',
            controls: [
              { type: 'knob', key: 'oscBalance', label: 'BALANCE', bipolar: true, formatValue: fmtPct },
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
            label: 'FILTER',
            controls: [
              { type: 'knob', key: 'filter1Cutoff', label: 'CUTOFF', color: '#ff6644', formatValue: fmt127 },
              { type: 'knob', key: 'filter1Resonance', label: 'RESO', color: '#ff6644', formatValue: fmt127 },
              { type: 'knob', key: 'filter1EnvAmount', label: 'ENV AMT', color: '#ff6644', bipolar: true, formatValue: fmt127 },
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
    ],
  };
}

/** Waldorf microQ — DSP56300 based VA synth */
export const GEARMULATOR_MICROQ_LAYOUT = makeGearmulatorLayout('Waldorf microQ');

/** Waldorf XT — DSP56300 based VA synth */
export const GEARMULATOR_XT_LAYOUT = makeGearmulatorLayout('Waldorf XT');

/** Clavia Nord Lead 2x — DSP56300 based VA synth */
export const GEARMULATOR_NORD_LAYOUT = makeGearmulatorLayout('Nord Lead 2x');

/** Roland JP-8000 — ESP DSP based VA synth */
export const GEARMULATOR_JP8000_LAYOUT = makeGearmulatorLayout('Roland JP-8000');
