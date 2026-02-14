/**
 * MixerModule - Audio Mixer
 *
 * Combines multiple audio signals with level control.
 */

import type { ModuleDescriptor, ModuleInstance, ModulePort } from '../../../types/modular';

export const MixerDescriptor: ModuleDescriptor = {
  id: 'Mixer',
  name: 'Mixer',
  category: 'utility',
  voiceMode: 'per-voice',
  color: '#14b8a6', // teal

  ports: [
    { id: 'in1', name: 'Input 1', direction: 'input', signal: 'audio' },
    { id: 'in2', name: 'Input 2', direction: 'input', signal: 'audio' },
    { id: 'in3', name: 'Input 3', direction: 'input', signal: 'audio' },
    { id: 'in4', name: 'Input 4', direction: 'input', signal: 'audio' },
    { id: 'output', name: 'Output', direction: 'output', signal: 'audio' },
  ],

  parameters: [
    { id: 'level1', name: 'Level 1', min: 0, max: 1, default: 1 },
    { id: 'level2', name: 'Level 2', min: 0, max: 1, default: 1 },
    { id: 'level3', name: 'Level 3', min: 0, max: 1, default: 1 },
    { id: 'level4', name: 'Level 4', min: 0, max: 1, default: 1 },
  ],

  create: (ctx: AudioContext): ModuleInstance => {
    const mixerOutput = ctx.createGain();
    const inputs: GainNode[] = [];

    // Create 4 input channels with gain control
    for (let i = 0; i < 4; i++) {
      const inputGain = ctx.createGain();
      inputGain.gain.value = 1;
      inputGain.connect(mixerOutput);
      inputs.push(inputGain);
    }

    const ports = new Map<string, ModulePort>([
      ['in1', { id: 'in1', name: 'Input 1', direction: 'input', signal: 'audio', node: inputs[0] }],
      ['in2', { id: 'in2', name: 'Input 2', direction: 'input', signal: 'audio', node: inputs[1] }],
      ['in3', { id: 'in3', name: 'Input 3', direction: 'input', signal: 'audio', node: inputs[2] }],
      ['in4', { id: 'in4', name: 'Input 4', direction: 'input', signal: 'audio', node: inputs[3] }],
      ['output', { id: 'output', name: 'Output', direction: 'output', signal: 'audio', node: mixerOutput }],
    ]);

    return {
      descriptorId: 'Mixer',
      ports,

      setParam: (paramId: string, value: number) => {
        const match = paramId.match(/level(\d+)/);
        if (match) {
          const index = parseInt(match[1], 10) - 1;
          if (index >= 0 && index < 4) {
            inputs[index].gain.value = value;
          }
        }
      },

      getParam: (paramId: string) => {
        const match = paramId.match(/level(\d+)/);
        if (match) {
          const index = parseInt(match[1], 10) - 1;
          if (index >= 0 && index < 4) {
            return inputs[index].gain.value;
          }
        }
        return 0;
      },

      dispose: () => {
        inputs.forEach((input) => input.disconnect());
        mixerOutput.disconnect();
      },
    };
  },
};
