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

/**
 * Percussion Synth - Noise-based percussion with fast envelope
 */
export const MODULAR_PERCUSSION_PATCH: ModularPatchConfig = {
  modules: [
    {
      id: 'noise1',
      descriptorId: 'Noise',
      label: 'Noise',
      parameters: {
        type: 0, // White noise
      },
      position: { x: 50, y: 100 },
      rackSlot: 0,
    },
    {
      id: 'vcf1',
      descriptorId: 'VCF',
      label: 'VCF 1',
      parameters: {
        type: 2, // Bandpass
        cutoff: 800,
        resonance: 8,
        keyTracking: 0,
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
      label: 'Env',
      parameters: {
        attack: 0.001,
        decay: 0.08,
        sustain: 0,
        release: 0.1,
      },
      position: { x: 450, y: 300 },
      rackSlot: 3,
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
      rackSlot: 4,
    },
  ],
  connections: [
    {
      id: 'conn1',
      source: { moduleId: 'noise1', portId: 'output' },
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
    {
      id: 'conn4',
      source: { moduleId: 'adsr1', portId: 'output' },
      target: { moduleId: 'vca1', portId: 'cv' },
      amount: 1,
    },
    {
      id: 'conn5',
      source: { moduleId: 'adsr1', portId: 'output' },
      target: { moduleId: 'vcf1', portId: 'cutoff' },
      amount: 0.8,
    },
  ],
  polyphony: 1,
  viewMode: 'rack',
};

/**
 * FM Bell - Frequency modulation bell sound
 */
export const MODULAR_FM_BELL_PATCH: ModularPatchConfig = {
  modules: [
    {
      id: 'vco1',
      descriptorId: 'VCO',
      label: 'Carrier',
      parameters: {
        waveform: 0, // Sine
        detune: 0,
        octave: 0,
        pulseWidth: 0.5,
      },
      position: { x: 250, y: 100 },
      rackSlot: 0,
    },
    {
      id: 'vco2',
      descriptorId: 'VCO',
      label: 'Modulator',
      parameters: {
        waveform: 0, // Sine
        detune: 7, // Slightly detuned for bell character
        octave: 1, // One octave higher
        pulseWidth: 0.5,
      },
      position: { x: 50, y: 100 },
      rackSlot: 1,
    },
    {
      id: 'vcf1',
      descriptorId: 'VCF',
      label: 'VCF 1',
      parameters: {
        type: 0, // Lowpass
        cutoff: 4000,
        resonance: 1,
        keyTracking: 0.8,
      },
      position: { x: 450, y: 100 },
      rackSlot: 2,
    },
    {
      id: 'vca1',
      descriptorId: 'VCA',
      label: 'VCA 1',
      parameters: {
        gain: 1,
        bias: 0,
      },
      position: { x: 650, y: 100 },
      rackSlot: 3,
    },
    {
      id: 'adsr1',
      descriptorId: 'ADSR',
      label: 'Amp Env',
      parameters: {
        attack: 0.01,
        decay: 0.8,
        sustain: 0.2,
        release: 1.5,
      },
      position: { x: 650, y: 300 },
      rackSlot: 4,
    },
    {
      id: 'adsr2',
      descriptorId: 'ADSR',
      label: 'FM Env',
      parameters: {
        attack: 0.005,
        decay: 0.3,
        sustain: 0.1,
        release: 0.5,
      },
      position: { x: 250, y: 300 },
      rackSlot: 5,
    },
    {
      id: 'output1',
      descriptorId: 'Output',
      label: 'Output',
      parameters: {
        level: 0.7,
        pan: 0,
      },
      position: { x: 850, y: 100 },
      rackSlot: 6,
    },
  ],
  connections: [
    // FM path: VCO2 → VCO1 FM input
    {
      id: 'conn1',
      source: { moduleId: 'vco2', portId: 'output' },
      target: { moduleId: 'vco1', portId: 'fm' },
      amount: 0.8,
    },
    // Audio path: VCO1 → VCF → VCA → Output
    {
      id: 'conn2',
      source: { moduleId: 'vco1', portId: 'output' },
      target: { moduleId: 'vcf1', portId: 'input' },
      amount: 1,
    },
    {
      id: 'conn3',
      source: { moduleId: 'vcf1', portId: 'output' },
      target: { moduleId: 'vca1', portId: 'input' },
      amount: 1,
    },
    {
      id: 'conn4',
      source: { moduleId: 'vca1', portId: 'output' },
      target: { moduleId: 'output1', portId: 'input' },
      amount: 1,
    },
    // Amplitude envelope
    {
      id: 'conn5',
      source: { moduleId: 'adsr1', portId: 'output' },
      target: { moduleId: 'vca1', portId: 'cv' },
      amount: 1,
    },
    // FM envelope → modulator VCA
    {
      id: 'conn6',
      source: { moduleId: 'adsr2', portId: 'output' },
      target: { moduleId: 'vco1', portId: 'fm' },
      amount: 0.6,
    },
  ],
  polyphony: 4,
  viewMode: 'rack',
};

/**
 * Lead Synth - Bright lead with vibrato
 */
export const MODULAR_LEAD_PATCH: ModularPatchConfig = {
  modules: [
    {
      id: 'vco1',
      descriptorId: 'VCO',
      label: 'VCO 1',
      parameters: {
        waveform: 1, // Sawtooth
        detune: 0,
        octave: 1,
        pulseWidth: 0.5,
      },
      position: { x: 250, y: 100 },
      rackSlot: 0,
    },
    {
      id: 'lfo1',
      descriptorId: 'LFO',
      label: 'Vibrato',
      parameters: {
        waveform: 0, // Sine
        rate: 5,
        depth: 1,
        bipolar: 1, // 1=bipolar (-1 to 1), 0=unipolar (0-1)
      },
      position: { x: 50, y: 100 },
      rackSlot: 1,
    },
    {
      id: 'vcf1',
      descriptorId: 'VCF',
      label: 'VCF 1',
      parameters: {
        type: 0, // Lowpass
        cutoff: 3000,
        resonance: 3,
        keyTracking: 0.7,
      },
      position: { x: 450, y: 100 },
      rackSlot: 2,
    },
    {
      id: 'vca1',
      descriptorId: 'VCA',
      label: 'VCA 1',
      parameters: {
        gain: 1,
        bias: 0,
      },
      position: { x: 650, y: 100 },
      rackSlot: 3,
    },
    {
      id: 'adsr1',
      descriptorId: 'ADSR',
      label: 'Amp Env',
      parameters: {
        attack: 0.02,
        decay: 0.15,
        sustain: 0.8,
        release: 0.3,
      },
      position: { x: 650, y: 300 },
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
      position: { x: 850, y: 100 },
      rackSlot: 5,
    },
  ],
  connections: [
    // LFO vibrato → VCO pitch
    {
      id: 'conn1',
      source: { moduleId: 'lfo1', portId: 'output' },
      target: { moduleId: 'vco1', portId: 'pitch' },
      amount: 0.03,
    },
    // Audio path: VCO → VCF → VCA → Output
    {
      id: 'conn2',
      source: { moduleId: 'vco1', portId: 'output' },
      target: { moduleId: 'vcf1', portId: 'input' },
      amount: 1,
    },
    {
      id: 'conn3',
      source: { moduleId: 'vcf1', portId: 'output' },
      target: { moduleId: 'vca1', portId: 'input' },
      amount: 1,
    },
    {
      id: 'conn4',
      source: { moduleId: 'vca1', portId: 'output' },
      target: { moduleId: 'output1', portId: 'input' },
      amount: 1,
    },
    // Amplitude envelope
    {
      id: 'conn5',
      source: { moduleId: 'adsr1', portId: 'output' },
      target: { moduleId: 'vca1', portId: 'cv' },
      amount: 1,
    },
  ],
  polyphony: 1,
  viewMode: 'rack',
};

export const MODULAR_PRESETS = {
  init: MODULAR_INIT_PATCH,
  bass: MODULAR_BASS_PATCH,
  pad: MODULAR_PAD_PATCH,
  percussion: MODULAR_PERCUSSION_PATCH,
  fmBell: MODULAR_FM_BELL_PATCH,
  lead: MODULAR_LEAD_PATCH,
};
