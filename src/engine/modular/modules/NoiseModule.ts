/**
 * NoiseModule - Noise Generator
 *
 * Shared white/pink/brown noise source.
 */

import type { ModuleDescriptor, ModuleInstance, ModulePort } from '../../../types/modular';

export const NoiseDescriptor: ModuleDescriptor = {
  id: 'Noise',
  name: 'Noise',
  category: 'source',
  voiceMode: 'shared', // One noise source shared across voices
  color: '#6b7280', // gray

  ports: [{ id: 'output', name: 'Output', direction: 'output', signal: 'audio' }],

  parameters: [{ id: 'type', name: 'Type', min: 0, max: 2, default: 0 }], // 0=white, 1=pink, 2=brown

  create: (ctx: AudioContext): ModuleInstance => {
    // Create noise using buffer source
    const bufferSize = ctx.sampleRate * 2; // 2 seconds of noise
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // White noise
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    noise.start();

    const gain = ctx.createGain();
    gain.gain.value = 0.3; // Reduce volume
    noise.connect(gain);

    const ports = new Map<string, ModulePort>([
      ['output', { id: 'output', name: 'Output', direction: 'output', signal: 'audio', node: gain }],
    ]);

    let currentType = 0;

    return {
      descriptorId: 'Noise',
      ports,

      setParam: (paramId: string, value: number) => {
        if (paramId === 'type') {
          currentType = Math.floor(value);
          // TODO: Implement pink/brown noise filtering
        }
      },

      getParam: (paramId: string) => {
        if (paramId === 'type') return currentType;
        return 0;
      },

      dispose: () => {
        noise.stop();
        noise.disconnect();
        gain.disconnect();
      },
    };
  },
};
