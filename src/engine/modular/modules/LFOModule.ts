/**
 * LFOModule - Low Frequency Oscillator
 *
 * Shared modulation source for filter sweeps, vibrato, etc.
 */

import type { ModuleDescriptor, ModuleInstance, ModulePort } from '../../../types/modular';

export const LFODescriptor: ModuleDescriptor = {
  id: 'LFO',
  name: 'LFO',
  category: 'modulator',
  voiceMode: 'shared', // One LFO shared across all voices
  color: '#ec4899', // pink

  ports: [
    { id: 'rate', name: 'Rate', direction: 'input', signal: 'cv' },
    { id: 'sync', name: 'Sync', direction: 'input', signal: 'trigger' },
    { id: 'output', name: 'Output', direction: 'output', signal: 'cv' },
  ],

  parameters: [
    { id: 'waveform', name: 'Waveform', min: 0, max: 3, default: 0 }, // 0=sine, 1=saw, 2=square, 3=triangle
    { id: 'rate', name: 'Rate', min: 0.01, max: 20, default: 1, curve: 'exponential' },
    { id: 'depth', name: 'Depth', min: 0, max: 1, default: 0.5 },
    { id: 'bipolar', name: 'Bipolar', min: 0, max: 1, default: 1 }, // 0=unipolar (0-1), 1=bipolar (-1 to 1)
  ],

  create: (ctx: AudioContext): ModuleInstance => {
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();

    // Initialize
    lfo.type = 'sine';
    lfo.frequency.value = 1;
    depth.gain.value = 0.5;
    lfo.start();

    // Route: LFO → depth
    lfo.connect(depth);

    const ports = new Map<string, ModulePort>([
      ['rate', { id: 'rate', name: 'Rate', direction: 'input', signal: 'cv', param: lfo.frequency }],
      ['sync', { id: 'sync', name: 'Sync', direction: 'input', signal: 'trigger' }],
      ['output', { id: 'output', name: 'Output', direction: 'output', signal: 'cv', node: depth }],
    ]);

    let currentWaveform = 0;
    let currentBipolar = 1;

    return {
      descriptorId: 'LFO',
      ports,

      setParam: (paramId: string, value: number) => {
        switch (paramId) {
          case 'waveform':
            currentWaveform = Math.floor(value);
            const types: OscillatorType[] = ['sine', 'sawtooth', 'square', 'triangle'];
            lfo.type = types[currentWaveform] || 'sine';
            break;
          case 'rate':
            lfo.frequency.value = value;
            break;
          case 'depth':
            depth.gain.value = value;
            break;
          case 'bipolar':
            currentBipolar = value;
            // TODO: Add DC offset for unipolar mode
            break;
        }
      },

      getParam: (paramId: string) => {
        switch (paramId) {
          case 'waveform':
            return currentWaveform;
          case 'rate':
            return lfo.frequency.value;
          case 'depth':
            return depth.gain.value;
          case 'bipolar':
            return currentBipolar;
          default:
            return 0;
        }
      },

      dispose: () => {
        lfo.stop();
        lfo.disconnect();
        depth.disconnect();
      },
    };
  },
};
