/**
 * CompressorModule - Dynamics Compressor
 *
 * Dynamic range compression for controlling dynamics.
 * Inspired by Max for Live's Compressor device.
 */

import type { ModuleDescriptor, ModuleInstance, ModulePort } from '../../../types/modular';

export const CompressorDescriptor: ModuleDescriptor = {
  id: 'Compressor',
  name: 'Compressor',
  category: 'utility',
  voiceMode: 'per-voice',
  color: '#8b5cf6', // purple

  ports: [
    { id: 'input', name: 'Input', direction: 'input', signal: 'audio' },
    { id: 'sidechain', name: 'Sidechain', direction: 'input', signal: 'audio' },
    { id: 'output', name: 'Output', direction: 'output', signal: 'audio' },
  ],

  parameters: [
    { id: 'threshold', name: 'Threshold', min: 0, max: 1, default: 0.7, unit: 'dB' },
    { id: 'ratio', name: 'Ratio', min: 0, max: 1, default: 0.5 }, // Maps to 1:1 → 20:1
    { id: 'attack', name: 'Attack', min: 0, max: 1, default: 0.1, unit: 's' },
    { id: 'release', name: 'Release', min: 0, max: 1, default: 0.3, unit: 's' },
    { id: 'knee', name: 'Knee', min: 0, max: 1, default: 0.5, unit: 'dB' },
    { id: 'makeup', name: 'Makeup', min: 0, max: 1, default: 0.0, unit: 'dB' },
  ],

  create: (ctx: AudioContext): ModuleInstance => {
    const input = ctx.createGain();
    const compressor = ctx.createDynamicsCompressor();
    const makeup = ctx.createGain();
    const output = ctx.createGain();

    // Initialize with musical defaults
    compressor.threshold.value = -24; // dB
    compressor.knee.value = 30; // dB
    compressor.ratio.value = 4; // 4:1
    compressor.attack.value = 0.003; // 3ms
    compressor.release.value = 0.25; // 250ms

    makeup.gain.value = 1.0; // 0dB
    output.gain.value = 1.0;

    // Routing
    input.connect(compressor);
    compressor.connect(makeup);
    makeup.connect(output);

    const ports = new Map<string, ModulePort>([
      ['input', { id: 'input', name: 'Input', direction: 'input', signal: 'audio', node: input }],
      ['sidechain', { id: 'sidechain', name: 'Sidechain', direction: 'input', signal: 'audio', node: compressor }],
      ['output', { id: 'output', name: 'Output', direction: 'output', signal: 'audio', node: output }],
    ]);

    return {
      descriptorId: 'Compressor',
      ports,

      setParam: (paramId: string, value: number) => {
        switch (paramId) {
          case 'threshold':
            // Map 0-1 to -60dB to 0dB
            compressor.threshold.value = value * 60 - 60;
            break;

          case 'ratio':
            // Map 0-1 to 1:1 → 20:1
            compressor.ratio.value = 1 + value * 19;
            break;

          case 'attack':
            // Map 0-1 to 0.001s to 1s (exponential)
            compressor.attack.value = 0.001 * Math.pow(1000, value);
            break;

          case 'release':
            // Map 0-1 to 0.01s to 3s (exponential)
            compressor.release.value = 0.01 * Math.pow(300, value);
            break;

          case 'knee':
            // Map 0-1 to 0dB to 40dB
            compressor.knee.value = value * 40;
            break;

          case 'makeup':
            // Map 0-1 to 0dB to +24dB
            const makeupDb = value * 24;
            makeup.gain.value = Math.pow(10, makeupDb / 20);
            break;
        }
      },

      getParam: (paramId: string) => {
        switch (paramId) {
          case 'threshold':
            return (compressor.threshold.value + 60) / 60;
          case 'ratio':
            return (compressor.ratio.value - 1) / 19;
          case 'attack':
            return Math.log(compressor.attack.value / 0.001) / Math.log(1000);
          case 'release':
            return Math.log(compressor.release.value / 0.01) / Math.log(300);
          case 'knee':
            return compressor.knee.value / 40;
          case 'makeup':
            return (20 * Math.log10(makeup.gain.value)) / 24;
          default:
            return 0;
        }
      },

      dispose: () => {
        input.disconnect();
        compressor.disconnect();
        makeup.disconnect();
        output.disconnect();
      },
    };
  },
};
