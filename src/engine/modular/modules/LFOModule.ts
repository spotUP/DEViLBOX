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
    const amplitudeGain = ctx.createGain();  // Controls oscillator amplitude
    const dcSource = ctx.createConstantSource();  // DC bias for unipolar mode
    const dcGain = ctx.createGain();              // DC bias amount (0=bipolar, depth*0.5=unipolar)
    const outputNode = ctx.createGain();          // Mixed output node (the output port)

    // Initialize
    lfo.type = 'sine';
    lfo.frequency.value = 1;
    amplitudeGain.gain.value = 0.5;  // Initial depth
    dcSource.offset.value = 1;       // Constant 1, scaled by dcGain
    dcGain.gain.value = 0;           // Bipolar by default (no DC)
    outputNode.gain.value = 1;
    dcSource.start();
    lfo.start();

    // Route: lfo → amplitudeGain → outputNode
    lfo.connect(amplitudeGain);
    amplitudeGain.connect(outputNode);

    // Route: dcSource → dcGain → outputNode (adds DC offset when unipolar)
    dcSource.connect(dcGain);
    dcGain.connect(outputNode);

    const ports = new Map<string, ModulePort>([
      ['rate', { id: 'rate', name: 'Rate', direction: 'input', signal: 'cv', param: lfo.frequency }],
      ['sync', { id: 'sync', name: 'Sync', direction: 'input', signal: 'trigger' }],
      ['output', { id: 'output', name: 'Output', direction: 'output', signal: 'cv', node: outputNode }],
    ]);

    let currentWaveform = 0;
    let currentBipolar = 1;
    let currentDepth = 0.5;

    function updateBipolarState() {
      if (currentBipolar) {
        // Bipolar: full depth, no DC offset
        amplitudeGain.gain.value = currentDepth;
        dcGain.gain.value = 0;
      } else {
        // Unipolar: half amplitude + half DC = range [0, depth]
        amplitudeGain.gain.value = currentDepth * 0.5;
        dcGain.gain.value = currentDepth * 0.5;
      }
    }

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
            currentDepth = value;
            updateBipolarState();
            break;
          case 'bipolar':
            currentBipolar = value >= 0.5 ? 1 : 0;
            updateBipolarState();
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
            return currentDepth;
          case 'bipolar':
            return currentBipolar;
          default:
            return 0;
        }
      },

      dispose: () => {
        lfo.stop();
        lfo.disconnect();
        amplitudeGain.disconnect();
        dcSource.stop();
        dcSource.disconnect();
        dcGain.disconnect();
        outputNode.disconnect();
      },
    };
  },
};
