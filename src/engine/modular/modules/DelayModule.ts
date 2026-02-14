/**
 * DelayModule - Delay Effect
 *
 * Shared delay line with time, feedback, and mix controls.
 */

import type { ModuleDescriptor, ModuleInstance, ModulePort } from '../../../types/modular';

export const DelayDescriptor: ModuleDescriptor = {
  id: 'Delay',
  name: 'Delay',
  category: 'utility',
  voiceMode: 'shared', // One delay shared across voices
  color: '#06b6d4', // cyan

  ports: [
    { id: 'input', name: 'Input', direction: 'input', signal: 'audio' },
    { id: 'time', name: 'Time', direction: 'input', signal: 'cv' },
    { id: 'feedback', name: 'Feedback', direction: 'input', signal: 'cv' },
    { id: 'output', name: 'Output', direction: 'output', signal: 'audio' },
  ],

  parameters: [
    { id: 'time', name: 'Time', min: 0.001, max: 2, default: 0.25, curve: 'linear' },
    { id: 'feedback', name: 'Feedback', min: 0, max: 0.95, default: 0.3 },
    { id: 'mix', name: 'Mix', min: 0, max: 1, default: 0.5 },
  ],

  create: (ctx: AudioContext): ModuleInstance => {
    const delay = ctx.createDelay(2);
    const feedbackGain = ctx.createGain();
    const mixGain = ctx.createGain();
    const dryGain = ctx.createGain();
    const output = ctx.createGain();

    // Initialize
    delay.delayTime.value = 0.25;
    feedbackGain.gain.value = 0.3;
    mixGain.gain.value = 0.5;
    dryGain.gain.value = 0.5;

    // Routing: input → delay → feedbackGain → delay (feedback loop)
    //                  delay → mixGain → output
    //          input → dryGain → output
    delay.connect(feedbackGain);
    feedbackGain.connect(delay);
    delay.connect(mixGain);
    mixGain.connect(output);
    dryGain.connect(output);

    const ports = new Map<string, ModulePort>([
      ['input', { id: 'input', name: 'Input', direction: 'input', signal: 'audio', node: delay }],
      ['time', { id: 'time', name: 'Time', direction: 'input', signal: 'cv', param: delay.delayTime }],
      [
        'feedback',
        { id: 'feedback', name: 'Feedback', direction: 'input', signal: 'cv', param: feedbackGain.gain },
      ],
      ['output', { id: 'output', name: 'Output', direction: 'output', signal: 'audio', node: output }],
    ]);

    // Also connect dry signal
    const inputSplitter = ctx.createGain();
    inputSplitter.connect(delay);
    inputSplitter.connect(dryGain);

    return {
      descriptorId: 'Delay',
      ports,

      setParam: (paramId: string, value: number) => {
        switch (paramId) {
          case 'time':
            delay.delayTime.value = value;
            break;
          case 'feedback':
            feedbackGain.gain.value = value;
            break;
          case 'mix':
            mixGain.gain.value = value;
            dryGain.gain.value = 1 - value;
            break;
        }
      },

      getParam: (paramId: string) => {
        switch (paramId) {
          case 'time':
            return delay.delayTime.value;
          case 'feedback':
            return feedbackGain.gain.value;
          case 'mix':
            return mixGain.gain.value;
          default:
            return 0;
        }
      },

      dispose: () => {
        delay.disconnect();
        feedbackGain.disconnect();
        mixGain.disconnect();
        dryGain.disconnect();
        output.disconnect();
        inputSplitter.disconnect();
      },
    };
  },
};
