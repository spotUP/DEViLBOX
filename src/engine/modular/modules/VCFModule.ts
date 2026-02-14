/**
 * VCFModule - Voltage Controlled Filter
 *
 * Multi-mode filter with cutoff and resonance modulation.
 */

import type { ModuleDescriptor, ModuleInstance, ModulePort } from '../../../types/modular';

export const VCFDescriptor: ModuleDescriptor = {
  id: 'VCF',
  name: 'VCF (Filter)',
  category: 'filter',
  voiceMode: 'per-voice',
  color: '#f59e0b', // amber

  ports: [
    { id: 'input', name: 'Input', direction: 'input', signal: 'audio' },
    { id: 'cutoff', name: 'Cutoff', direction: 'input', signal: 'cv' },
    { id: 'resonance', name: 'Resonance', direction: 'input', signal: 'cv' },
    { id: 'output', name: 'Output', direction: 'output', signal: 'audio' },
  ],

  parameters: [
    { id: 'type', name: 'Type', min: 0, max: 3, default: 0 }, // 0=lowpass, 1=highpass, 2=bandpass, 3=notch
    { id: 'cutoff', name: 'Cutoff', min: 20, max: 20000, default: 1000, curve: 'exponential' },
    { id: 'resonance', name: 'Resonance', min: 0, max: 30, default: 1 },
    { id: 'keyTracking', name: 'Key Tracking', min: 0, max: 1, default: 0 },
  ],

  create: (ctx: AudioContext): ModuleInstance => {
    const filter = ctx.createBiquadFilter();
    const cutoffScale = ctx.createGain();
    const resonanceScale = ctx.createGain();

    // Initialize
    filter.type = 'lowpass';
    filter.frequency.value = 1000;
    filter.Q.value = 1;

    // CV scaling (100 = 1Hz for cutoff)
    cutoffScale.gain.value = 100;
    resonanceScale.gain.value = 1;

    const ports = new Map<string, ModulePort>([
      ['input', { id: 'input', name: 'Input', direction: 'input', signal: 'audio', node: filter }],
      [
        'cutoff',
        {
          id: 'cutoff',
          name: 'Cutoff',
          direction: 'input',
          signal: 'cv',
          param: filter.frequency,
          scaleNode: cutoffScale,
        },
      ],
      [
        'resonance',
        {
          id: 'resonance',
          name: 'Resonance',
          direction: 'input',
          signal: 'cv',
          param: filter.Q,
          scaleNode: resonanceScale,
        },
      ],
      ['output', { id: 'output', name: 'Output', direction: 'output', signal: 'audio', node: filter }],
    ]);

    let currentType = 0;
    let currentKeyTracking = 0;

    return {
      descriptorId: 'VCF',
      ports,

      setParam: (paramId: string, value: number) => {
        switch (paramId) {
          case 'type':
            currentType = Math.floor(value);
            const types: BiquadFilterType[] = ['lowpass', 'highpass', 'bandpass', 'notch'];
            filter.type = types[currentType] || 'lowpass';
            break;
          case 'cutoff':
            filter.frequency.value = value;
            break;
          case 'resonance':
            filter.Q.value = value;
            break;
          case 'keyTracking':
            currentKeyTracking = value;
            break;
        }
      },

      getParam: (paramId: string) => {
        switch (paramId) {
          case 'type':
            return currentType;
          case 'cutoff':
            return filter.frequency.value;
          case 'resonance':
            return filter.Q.value;
          case 'keyTracking':
            return currentKeyTracking;
          default:
            return 0;
        }
      },

      dispose: () => {
        filter.disconnect();
        cutoffScale.disconnect();
        resonanceScale.disconnect();
      },
    };
  },
};
