/**
 * WaveshaperModule - Waveshaping/Saturation/Distortion
 *
 * Non-linear waveshaping for adding harmonics and saturation.
 * Inspired by Max for Live's Saturator and waveshaping devices.
 */

import type { ModuleDescriptor, ModuleInstance, ModulePort } from '../../../types/modular';

export const WaveshaperDescriptor: ModuleDescriptor = {
  id: 'Waveshaper',
  name: 'Waveshaper',
  category: 'utility',
  voiceMode: 'per-voice',
  color: '#f59e0b', // amber

  ports: [
    { id: 'input', name: 'Input', direction: 'input', signal: 'audio' },
    { id: 'drive', name: 'Drive CV', direction: 'input', signal: 'cv' },
    { id: 'output', name: 'Output', direction: 'output', signal: 'audio' },
  ],

  parameters: [
    { id: 'drive', name: 'Drive', min: 0, max: 1, default: 0.5, unit: '%' },
    { id: 'mix', name: 'Dry/Wet', min: 0, max: 1, default: 1.0, unit: '%' },
    { id: 'curve', name: 'Curve', min: 0, max: 5, default: 0 }, // 0=soft, 1=hard, 2=tube, 3=fuzz, 4=fold, 5=bitcrush
    { id: 'bias', name: 'Bias', min: -1, max: 1, default: 0 },
  ],

  create: (ctx: AudioContext): ModuleInstance => {
    const input = ctx.createGain();
    const driveGain = ctx.createGain();
    const waveshaper = ctx.createWaveShaper();
    const outputGain = ctx.createGain();
    const dryGain = ctx.createGain();
    const wetGain = ctx.createGain();

    // Initialize
    driveGain.gain.value = 1.0;
    outputGain.gain.value = 1.0;
    dryGain.gain.value = 0.0; // Start fully wet
    wetGain.gain.value = 1.0;

    // Create default soft clipping curve
    const curveAmount = 128;
    const curve = new Float32Array(curveAmount);
    for (let i = 0; i < curveAmount; i++) {
      const x = (i * 2) / curveAmount - 1;
      curve[i] = Math.tanh(x * 2);
    }
    waveshaper.curve = curve;
    waveshaper.oversample = '4x';

    // Routing: input → driveGain → waveshaper → wetGain → outputGain
    //                 ↘ dryGain ↗
    input.connect(driveGain);
    driveGain.connect(waveshaper);
    waveshaper.connect(wetGain);
    wetGain.connect(outputGain);

    input.connect(dryGain);
    dryGain.connect(outputGain);

    const ports = new Map<string, ModulePort>([
      ['input', { id: 'input', name: 'Input', direction: 'input', signal: 'audio', node: input }],
      ['drive', { id: 'drive', name: 'Drive CV', direction: 'input', signal: 'cv', param: driveGain.gain }],
      ['output', { id: 'output', name: 'Output', direction: 'output', signal: 'audio', node: outputGain }],
    ]);

    let currentDrive = 0.5;
    let currentMix = 1.0;
    let currentCurve = 0;
    let currentBias = 0;

    /**
     * Generate waveshaping curve based on type
     */
    function updateCurve() {
      const samples = 256;
      const newCurve = new Float32Array(samples);
      const k = currentDrive * 10; // Drive amount

      for (let i = 0; i < samples; i++) {
        let x = (i * 2) / samples - 1;

        // Apply bias
        x += currentBias * 0.3;

        let y = x;

        switch (currentCurve) {
          case 0: // Soft clipping (tanh)
            y = Math.tanh(x * k);
            break;

          case 1: // Hard clipping
            y = Math.max(-1, Math.min(1, x * k));
            break;

          case 2: // Tube saturation (asymmetric)
            if (x >= 0) {
              y = Math.tanh(x * k);
            } else {
              y = Math.tanh(x * k * 1.5); // More distortion on negative side
            }
            break;

          case 3: // Fuzz (cubic)
            y = x * k - (x * x * x) * (k / 3);
            y = Math.max(-1, Math.min(1, y));
            break;

          case 4: // Wave folding
            y = Math.sin(x * k * Math.PI);
            break;

          case 5: // Bit reduction
            const bits = Math.floor(8 - currentDrive * 6); // 8-bit to 2-bit
            const steps = Math.pow(2, bits);
            y = Math.round(x * steps) / steps;
            break;
        }

        newCurve[i] = y;
      }

      waveshaper.curve = newCurve;
    }

    return {
      descriptorId: 'Waveshaper',
      ports,

      setParam: (paramId: string, value: number) => {
        switch (paramId) {
          case 'drive':
            currentDrive = value;
            driveGain.gain.value = 1 + value * 10; // 1x to 11x gain
            updateCurve();
            break;

          case 'mix':
            currentMix = value;
            // Equal power crossfade
            const wetAmt = Math.sqrt(value);
            const dryAmt = Math.sqrt(1 - value);
            wetGain.gain.value = wetAmt;
            dryGain.gain.value = dryAmt;
            break;

          case 'curve':
            currentCurve = Math.floor(value);
            updateCurve();
            break;

          case 'bias':
            currentBias = value;
            updateCurve();
            break;
        }
      },

      getParam: (paramId: string) => {
        switch (paramId) {
          case 'drive':
            return currentDrive;
          case 'mix':
            return currentMix;
          case 'curve':
            return currentCurve;
          case 'bias':
            return currentBias;
          default:
            return 0;
        }
      },

      dispose: () => {
        input.disconnect();
        driveGain.disconnect();
        waveshaper.disconnect();
        wetGain.disconnect();
        dryGain.disconnect();
        outputGain.disconnect();
      },
    };
  },
};
