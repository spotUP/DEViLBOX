/**
 * SunVox Modular Presets — Factory presets for the SunVox modular editor.
 */

import type { ModularPatchConfig } from '@/types/modular';

/** Basic subtractive: Analog Generator → Filter → Output */
export const SUNVOX_PRESET_SUBTRACTIVE: ModularPatchConfig = {
  modules: [
    { id: 'out', descriptorId: 'sv_output', parameters: {}, position: { x: 500, y: 200 } },
    { id: 'gen', descriptorId: 'sv_analog_generator', parameters: {}, position: { x: 100, y: 200 } },
    { id: 'flt', descriptorId: 'sv_filter_pro', parameters: {}, position: { x: 300, y: 200 } },
  ],
  connections: [
    { id: 'c1', source: { moduleId: 'gen', portId: 'output' }, target: { moduleId: 'flt', portId: 'input' }, amount: 1 },
    { id: 'c2', source: { moduleId: 'flt', portId: 'output' }, target: { moduleId: 'out', portId: 'input' }, amount: 1 },
  ],
  polyphony: 1,
  viewMode: 'canvas',
  backend: 'sunvox',
};

/** FM Bell: FM → Output */
export const SUNVOX_PRESET_FM_BELL: ModularPatchConfig = {
  modules: [
    { id: 'out', descriptorId: 'sv_output', parameters: {}, position: { x: 400, y: 200 } },
    { id: 'fm', descriptorId: 'sv_fm', parameters: {}, position: { x: 100, y: 200 } },
    { id: 'rev', descriptorId: 'sv_reverb', parameters: {}, position: { x: 250, y: 200 } },
  ],
  connections: [
    { id: 'c1', source: { moduleId: 'fm', portId: 'output' }, target: { moduleId: 'rev', portId: 'input' }, amount: 1 },
    { id: 'c2', source: { moduleId: 'rev', portId: 'output' }, target: { moduleId: 'out', portId: 'input' }, amount: 1 },
  ],
  polyphony: 1,
  viewMode: 'canvas',
  backend: 'sunvox',
};

/** Drum Machine: Kicker + DrumSynth → Compressor → Output */
export const SUNVOX_PRESET_DRUMS: ModularPatchConfig = {
  modules: [
    { id: 'out', descriptorId: 'sv_output', parameters: {}, position: { x: 600, y: 200 } },
    { id: 'kick', descriptorId: 'sv_kicker', parameters: {}, position: { x: 100, y: 100 } },
    { id: 'drum', descriptorId: 'sv_drumsynth', parameters: {}, position: { x: 100, y: 300 } },
    { id: 'comp', descriptorId: 'sv_compressor', parameters: {}, position: { x: 400, y: 200 } },
  ],
  connections: [
    { id: 'c1', source: { moduleId: 'kick', portId: 'output' }, target: { moduleId: 'comp', portId: 'input' }, amount: 1 },
    { id: 'c2', source: { moduleId: 'drum', portId: 'output' }, target: { moduleId: 'comp', portId: 'input' }, amount: 1 },
    { id: 'c3', source: { moduleId: 'comp', portId: 'output' }, target: { moduleId: 'out', portId: 'input' }, amount: 1 },
  ],
  polyphony: 1,
  viewMode: 'canvas',
  backend: 'sunvox',
};

/** Ambient Pad: SpectraVoice → Filter Pro → Reverb → Delay → Output */
export const SUNVOX_PRESET_AMBIENT_PAD: ModularPatchConfig = {
  modules: [
    { id: 'out', descriptorId: 'sv_output', parameters: {}, position: { x: 700, y: 200 } },
    { id: 'spec', descriptorId: 'sv_spectravoice', parameters: {}, position: { x: 100, y: 200 } },
    { id: 'flt', descriptorId: 'sv_filter_pro', parameters: {}, position: { x: 250, y: 200 } },
    { id: 'rev', descriptorId: 'sv_reverb', parameters: {}, position: { x: 400, y: 200 } },
    { id: 'dly', descriptorId: 'sv_delay', parameters: {}, position: { x: 550, y: 200 } },
  ],
  connections: [
    { id: 'c1', source: { moduleId: 'spec', portId: 'output' }, target: { moduleId: 'flt', portId: 'input' }, amount: 1 },
    { id: 'c2', source: { moduleId: 'flt', portId: 'output' }, target: { moduleId: 'rev', portId: 'input' }, amount: 1 },
    { id: 'c3', source: { moduleId: 'rev', portId: 'output' }, target: { moduleId: 'dly', portId: 'input' }, amount: 1 },
    { id: 'c4', source: { moduleId: 'dly', portId: 'output' }, target: { moduleId: 'out', portId: 'input' }, amount: 1 },
  ],
  polyphony: 1,
  viewMode: 'canvas',
  backend: 'sunvox',
};

export const SUNVOX_MODULAR_PRESETS = {
  subtractive: SUNVOX_PRESET_SUBTRACTIVE,
  fmBell: SUNVOX_PRESET_FM_BELL,
  drums: SUNVOX_PRESET_DRUMS,
  ambientPad: SUNVOX_PRESET_AMBIENT_PAD,
} as const;
