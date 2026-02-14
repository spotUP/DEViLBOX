/**
 * Modular Synth Presets
 *
 * Factory patches for the modular synthesis engine.
 */

import type { ModularPatchConfig } from '../types/modular';

/**
 * Init Patch - Basic subtractive synthesis voice
 * VCO → VCF → VCA → Output
 * ADSR → VCA (amplitude envelope)
 * ADSR2 → VCF cutoff (filter envelope)
 */
export const MODULAR_INIT_PATCH: ModularPatchConfig = {
  modules: [
    {
      id: 'vco1',
      descriptorId: 'VCO',
      label: 'VCO 1',
      parameters: {
        waveform: 1, // Sawtooth
        detune: 0,
        octave: 0,
        pulseWidth: 0.5,
      },
      position: { x: 50, y: 100 },
      rackSlot: 0,
    },
    {
      id: 'vcf1',
      descriptorId: 'VCF',
      label: 'VCF 1',
      parameters: {
        type: 0, // Lowpass
        cutoff: 2000,
        resonance: 2,
        keyTracking: 0.5,
      },
      position: { x: 250, y: 100 },
      rackSlot: 1,
    },
    {
      id: 'vca1',
      descriptorId: 'VCA',
      label: 'VCA 1',
      parameters: {
        gain: 1,
        bias: 0,
      },
      position: { x: 450, y: 100 },
      rackSlot: 2,
    },
    {
      id: 'adsr1',
      descriptorId: 'ADSR',
      label: 'Amp Env',
      parameters: {
        attack: 0.01,
        decay: 0.2,
        sustain: 0.7,
        release: 0.5,
      },
      position: { x: 450, y: 300 },
      rackSlot: 3,
    },
    {
      id: 'adsr2',
      descriptorId: 'ADSR',
      label: 'Filter Env',
      parameters: {
        attack: 0.02,
        decay: 0.3,
        sustain: 0.3,
        release: 0.4,
      },
      position: { x: 250, y: 300 },
      rackSlot: 4,
    },
    {
      id: 'output1',
      descriptorId: 'Output',
      label: 'Output',
      parameters: {
        level: 0.8,
        pan: 0,
      },
      position: { x: 650, y: 100 },
      rackSlot: 5,
    },
  ],
  connections: [
    // Audio path: VCO → VCF → VCA → Output
    {
      id: 'conn1',
      source: { moduleId: 'vco1', portId: 'output' },
      target: { moduleId: 'vcf1', portId: 'input' },
      amount: 1,
    },
    {
      id: 'conn2',
      source: { moduleId: 'vcf1', portId: 'output' },
      target: { moduleId: 'vca1', portId: 'input' },
      amount: 1,
    },
    {
      id: 'conn3',
      source: { moduleId: 'vca1', portId: 'output' },
      target: { moduleId: 'output1', portId: 'input' },
      amount: 1,
    },
    // Amplitude envelope: ADSR1 → VCA CV
    {
      id: 'conn4',
      source: { moduleId: 'adsr1', portId: 'output' },
      target: { moduleId: 'vca1', portId: 'cv' },
      amount: 1,
    },
    // Filter envelope: ADSR2 → VCF cutoff
    {
      id: 'conn5',
      source: { moduleId: 'adsr2', portId: 'output' },
      target: { moduleId: 'vcf1', portId: 'cutoff' },
      amount: 0.5,
    },
  ],
  polyphony: 1,
  viewMode: 'rack',
};

/**
 * Bass Synth - Deep bass with filter sweep
 */
export const MODULAR_BASS_PATCH: ModularPatchConfig = {
  ...MODULAR_INIT_PATCH,
  modules: [
    ...MODULAR_INIT_PATCH.modules.map((m) => {
      if (m.id === 'vco1') {
        return {
          ...m,
          parameters: { ...m.parameters, waveform: 1, octave: -1 },
        };
      }
      if (m.id === 'vcf1') {
        return {
          ...m,
          parameters: { ...m.parameters, cutoff: 800, resonance: 5 },
        };
      }
      if (m.id === 'adsr1') {
        return {
          ...m,
          parameters: { attack: 0.001, decay: 0.15, sustain: 0.6, release: 0.2 },
        };
      }
      return m;
    }),
  ],
};

/**
 * Pad Synth - Lush pad with LFO modulation
 */
export const MODULAR_PAD_PATCH: ModularPatchConfig = {
  ...MODULAR_INIT_PATCH,
  modules: [
    ...MODULAR_INIT_PATCH.modules.map((m) => {
      if (m.id === 'adsr1') {
        return {
          ...m,
          parameters: { attack: 0.8, decay: 0.5, sustain: 0.7, release: 1.5 },
        };
      }
      if (m.id === 'adsr2') {
        return {
          ...m,
          parameters: { attack: 1.0, decay: 0.8, sustain: 0.5, release: 1.2 },
        };
      }
      return m;
    }),
  ],
  polyphony: 4,
};

export const MODULAR_PRESETS = {
  init: MODULAR_INIT_PATCH,
  bass: MODULAR_BASS_PATCH,
  pad: MODULAR_PAD_PATCH,
};
