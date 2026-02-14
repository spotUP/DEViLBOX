/**
 * VCAModule - Voltage Controlled Amplifier
 *
 * Amplifier with CV control for dynamics and envelope shaping.
 */

import type { ModuleDescriptor, ModuleInstance, ModulePort } from '../../../types/modular';

export const VCADescriptor: ModuleDescriptor = {
  id: 'VCA',
  name: 'VCA (Amplifier)',
  category: 'amplifier',
  voiceMode: 'per-voice',
  color: '#10b981', // emerald

  ports: [
    { id: 'input', name: 'Input', direction: 'input', signal: 'audio' },
    { id: 'cv', name: 'CV', direction: 'input', signal: 'cv' },
    { id: 'output', name: 'Output', direction: 'output', signal: 'audio' },
  ],

  parameters: [
    { id: 'gain', name: 'Gain', min: 0, max: 2, default: 1 },
    { id: 'bias', name: 'Bias', min: 0, max: 1, default: 0 }, // Minimum gain when CV = 0
  ],

  create: (ctx: AudioContext): ModuleInstance => {
    const vca = ctx.createGain();
    const cvScale = ctx.createGain();

    // Initialize
    vca.gain.value = 0;
    cvScale.gain.value = 1;

    const ports = new Map<string, ModulePort>([
      ['input', { id: 'input', name: 'Input', direction: 'input', signal: 'audio', node: vca }],
      [
        'cv',
        {
          id: 'cv',
          name: 'CV',
          direction: 'input',
          signal: 'cv',
          param: vca.gain,
          scaleNode: cvScale,
        },
      ],
      ['output', { id: 'output', name: 'Output', direction: 'output', signal: 'audio', node: vca }],
    ]);

    let currentGain = 1;
    let currentBias = 0;

    return {
      descriptorId: 'VCA',
      ports,

      setParam: (paramId: string, value: number) => {
        switch (paramId) {
          case 'gain':
            currentGain = value;
            cvScale.gain.value = value;
            break;
          case 'bias':
            currentBias = value;
            // Bias sets minimum gain
            vca.gain.value = Math.max(vca.gain.value, value);
            break;
        }
      },

      getParam: (paramId: string) => {
        switch (paramId) {
          case 'gain':
            return currentGain;
          case 'bias':
            return currentBias;
          default:
            return 0;
        }
      },

      dispose: () => {
        vca.disconnect();
        cvScale.disconnect();
      },
    };
  },
};
