/**
 * SampleHoldModule - Sample & Hold
 *
 * Samples input CV on trigger and holds the value.
 */

import type { ModuleDescriptor, ModuleInstance, ModulePort } from '../../../types/modular';

export const SampleHoldDescriptor: ModuleDescriptor = {
  id: 'SampleHold',
  name: 'Sample & Hold',
  category: 'utility',
  voiceMode: 'shared',
  color: '#f97316', // orange

  ports: [
    { id: 'input', name: 'Input', direction: 'input', signal: 'cv' },
    { id: 'clock', name: 'Clock', direction: 'input', signal: 'trigger' },
    { id: 'output', name: 'Output', direction: 'output', signal: 'cv' },
  ],

  parameters: [{ id: 'slew', name: 'Slew', min: 0, max: 0.5, default: 0 }], // Glide time

  create: (ctx: AudioContext): ModuleInstance => {
    const output = ctx.createConstantSource();
    output.offset.value = 0;
    output.start();

    const ports = new Map<string, ModulePort>([
      ['input', { id: 'input', name: 'Input', direction: 'input', signal: 'cv' }],
      ['clock', { id: 'clock', name: 'Clock', direction: 'input', signal: 'trigger' }],
      ['output', { id: 'output', name: 'Output', direction: 'output', signal: 'cv', node: output }],
    ]);

    let slew = 0;
    let inputValue = 0;

    return {
      descriptorId: 'SampleHold',
      ports,

      setParam: (paramId: string, value: number) => {
        if (paramId === 'slew') {
          slew = value;
        } else if (paramId === 'inputValue') {
          // Internal: store input value
          inputValue = value;
        }
      },

      getParam: (paramId: string) => {
        if (paramId === 'slew') return slew;
        if (paramId === 'inputValue') return inputValue;
        return 0;
      },

      // Trigger sampling on clock
      gateOn: (time: number) => {
        const now = time || ctx.currentTime;
        if (slew > 0) {
          // Smooth transition
          output.offset.cancelScheduledValues(now);
          output.offset.setValueAtTime(output.offset.value, now);
          output.offset.linearRampToValueAtTime(inputValue, now + slew);
        } else {
          // Instant change
          output.offset.setValueAtTime(inputValue, now);
        }
      },

      dispose: () => {
        output.stop();
        output.disconnect();
      },
    };
  },
};
