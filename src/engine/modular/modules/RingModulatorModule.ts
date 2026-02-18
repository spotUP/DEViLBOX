/**
 * RingModulatorModule - Ring Modulation
 *
 * Classic ring modulation effect by multiplying two signals.
 * Creates metallic, bell-like tones and inharmonic spectra.
 */

import type { ModuleDescriptor, ModuleInstance, ModulePort } from '../../../types/modular';

export const RingModulatorDescriptor: ModuleDescriptor = {
  id: 'RingModulator',
  name: 'Ring Modulator',
  category: 'utility',
  voiceMode: 'per-voice',
  color: '#ec4899', // pink

  ports: [
    { id: 'carrier', name: 'Carrier', direction: 'input', signal: 'audio' },
    { id: 'modulator', name: 'Modulator', direction: 'input', signal: 'audio' },
    { id: 'output', name: 'Output', direction: 'output', signal: 'audio' },
  ],

  parameters: [
    { id: 'frequency', name: 'Frequency', min: 0, max: 1, default: 0.5, unit: 'Hz' },
    { id: 'mix', name: 'Dry/Wet', min: 0, max: 1, default: 1.0, unit: '%' },
    { id: 'internalOsc', name: 'Internal Osc', min: 0, max: 1, default: 1.0 }, // Use internal oscillator
  ],

  create: (ctx: AudioContext): ModuleInstance => {
    const carrierInput = ctx.createGain();
    const modulatorInput = ctx.createGain();
    const internalOsc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    const ringMod = ctx.createGain(); // Acts as multiplier via gain modulation
    const dryGain = ctx.createGain();
    const wetGain = ctx.createGain();
    const output = ctx.createGain();

    // Initialize
    internalOsc.frequency.value = 440;
    internalOsc.type = 'sine';
    internalOsc.start();

    oscGain.gain.value = 1.0; // Use internal osc by default
    ringMod.gain.value = 0;
    dryGain.gain.value = 0;
    wetGain.gain.value = 1.0;

    // Routing for ring modulation:
    // carrier → ringMod (whose gain is controlled by modulator) → wetGain → output
    carrierInput.connect(ringMod);
    ringMod.connect(wetGain);
    wetGain.connect(output);

    // Modulator input (external or internal)
    modulatorInput.connect(ringMod.gain); // Modulate the gain
    internalOsc.connect(oscGain);
    oscGain.connect(ringMod.gain);

    // Dry signal
    carrierInput.connect(dryGain);
    dryGain.connect(output);

    const ports = new Map<string, ModulePort>([
      ['carrier', { id: 'carrier', name: 'Carrier', direction: 'input', signal: 'audio', node: carrierInput }],
      ['modulator', { id: 'modulator', name: 'Modulator', direction: 'input', signal: 'audio', node: modulatorInput }],
      ['output', { id: 'output', name: 'Output', direction: 'output', signal: 'audio', node: output }],
    ]);

    return {
      descriptorId: 'RingModulator',
      ports,

      setParam: (paramId: string, value: number) => {
        switch (paramId) {
          case 'frequency':
            // Map 0-1 to 20Hz - 5000Hz (exponential)
            internalOsc.frequency.value = 20 * Math.pow(250, value);
            break;

          case 'mix':
            // Equal power crossfade
            const wet = Math.sqrt(value);
            const dry = Math.sqrt(1 - value);
            wetGain.gain.value = wet;
            dryGain.gain.value = dry;
            break;

          case 'internalOsc':
            // Crossfade between external and internal modulator
            oscGain.gain.value = value;
            break;
        }
      },

      getParam: (paramId: string) => {
        switch (paramId) {
          case 'frequency':
            return Math.log(internalOsc.frequency.value / 20) / Math.log(250);
          case 'mix':
            return wetGain.gain.value * wetGain.gain.value;
          case 'internalOsc':
            return oscGain.gain.value;
          default:
            return 0;
        }
      },

      dispose: () => {
        carrierInput.disconnect();
        modulatorInput.disconnect();
        internalOsc.stop();
        internalOsc.disconnect();
        oscGain.disconnect();
        ringMod.disconnect();
        dryGain.disconnect();
        wetGain.disconnect();
        output.disconnect();
      },
    };
  },
};
