/**
 * NoiseModule - Noise Generator
 *
 * White, pink (1/f), and brown (1/f²) noise source.
 */

import type { ModuleDescriptor, ModuleInstance, ModulePort } from '../../../types/modular';

/** Generate a white noise buffer */
function generateWhiteNoise(bufferSize: number): Float32Array {
  const data = new Float32Array(bufferSize);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return data;
}

/** Generate a pink noise buffer using the Paul Kellet algorithm */
function generatePinkNoise(bufferSize: number): Float32Array {
  const data = new Float32Array(bufferSize);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) / 9;
    b6 = white * 0.115926;
  }
  return data;
}

/** Generate a brown noise buffer (integrated white noise) */
function generateBrownNoise(bufferSize: number): Float32Array {
  const data = new Float32Array(bufferSize);
  let lastOut = 0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    lastOut = (lastOut + 0.02 * white) / 1.02;
    data[i] = lastOut * 3.5; // Scale to roughly full range
  }
  return data;
}

export const NoiseDescriptor: ModuleDescriptor = {
  id: 'Noise',
  name: 'Noise',
  category: 'source',
  voiceMode: 'shared', // One noise source shared across voices
  color: '#6b7280', // gray

  ports: [{ id: 'output', name: 'Output', direction: 'output', signal: 'audio' }],

  parameters: [{ id: 'type', name: 'Type', min: 0, max: 2, default: 0 }], // 0=white, 1=pink, 2=brown

  create: (ctx: AudioContext): ModuleInstance => {
    const bufferSize = ctx.sampleRate * 2; // 2 seconds of noise

    // Pre-generate all three noise buffers
    const buffers: AudioBuffer[] = [0, 1, 2].map((type) => {
      const ab = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = type === 0
        ? generateWhiteNoise(bufferSize)
        : type === 1
          ? generatePinkNoise(bufferSize)
          : generateBrownNoise(bufferSize);
      ab.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
      return ab;
    });

    const gain = ctx.createGain();
    gain.gain.value = 0.3; // Reduce volume

    let currentType = 0;
    let currentSource: AudioBufferSourceNode | null = null;

    function startSource(type: number): void {
      if (currentSource) {
        try { currentSource.stop(); } catch { /* already stopped */ }
        currentSource.disconnect();
      }
      const source = ctx.createBufferSource();
      source.buffer = buffers[type];
      source.loop = true;
      source.connect(gain);
      source.start();
      currentSource = source;
    }

    // Start with white noise
    startSource(0);

    const ports = new Map<string, ModulePort>([
      ['output', { id: 'output', name: 'Output', direction: 'output', signal: 'audio', node: gain }],
    ]);

    return {
      descriptorId: 'Noise',
      ports,

      setParam: (paramId: string, value: number) => {
        if (paramId === 'type') {
          const newType = Math.max(0, Math.min(2, Math.floor(value)));
          if (newType !== currentType) {
            currentType = newType;
            startSource(currentType);
          }
        }
      },

      getParam: (paramId: string) => {
        if (paramId === 'type') return currentType;
        return 0;
      },

      dispose: () => {
        if (currentSource) {
          try { currentSource.stop(); } catch { /* already stopped */ }
          currentSource.disconnect();
        }
        gain.disconnect();
      },
    };
  },
};
