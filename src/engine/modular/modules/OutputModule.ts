/**
 * OutputModule - Final Voice Output
 *
 * Final stage with level and pan control. Routes to voice output.
 */

import type { ModuleDescriptor, ModuleInstance, ModulePort } from '../../../types/modular';

export const OutputDescriptor: ModuleDescriptor = {
  id: 'Output',
  name: 'Output',
  category: 'io',
  voiceMode: 'per-voice',
  color: '#ef4444', // red

  ports: [
    { id: 'input', name: 'Input', direction: 'input', signal: 'audio' },
    { id: 'output', name: 'Output', direction: 'output', signal: 'audio' },
  ],

  parameters: [
    { id: 'level', name: 'Level', min: 0, max: 2, default: 1 },
    { id: 'pan', name: 'Pan', min: -1, max: 1, default: 0 },
  ],

  create: (ctx: AudioContext): ModuleInstance => {
    const level = ctx.createGain();
    const panner = ctx.createStereoPanner();

    // Initialize
    level.gain.value = 1;
    panner.pan.value = 0;

    // Route: level → panner
    level.connect(panner);

    const ports = new Map<string, ModulePort>([
      ['input', { id: 'input', name: 'Input', direction: 'input', signal: 'audio', node: level }],
      ['output', { id: 'output', name: 'Output', direction: 'output', signal: 'audio', node: panner }],
    ]);

    return {
      descriptorId: 'Output',
      ports,

      setParam: (paramId: string, value: number) => {
        switch (paramId) {
          case 'level':
            level.gain.value = value;
            break;
          case 'pan':
            panner.pan.value = value;
            break;
        }
      },

      getParam: (paramId: string) => {
        switch (paramId) {
          case 'level':
            return level.gain.value;
          case 'pan':
            return panner.pan.value;
          default:
            return 0;
        }
      },

      dispose: () => {
        level.disconnect();
        panner.disconnect();
      },
    };
  },
};
