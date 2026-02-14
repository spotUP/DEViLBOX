/**
 * ADSRModule - Attack Decay Sustain Release Envelope
 *
 * Classic envelope generator triggered by gate signal.
 */

import type { ModuleDescriptor, ModuleInstance, ModulePort } from '../../../types/modular';

export const ADSRDescriptor: ModuleDescriptor = {
  id: 'ADSR',
  name: 'ADSR (Envelope)',
  category: 'envelope',
  voiceMode: 'per-voice',
  color: '#8b5cf6', // violet

  ports: [
    { id: 'gate', name: 'Gate', direction: 'input', signal: 'gate' },
    { id: 'retrigger', name: 'Retrigger', direction: 'input', signal: 'trigger' },
    { id: 'output', name: 'Output', direction: 'output', signal: 'cv' },
  ],

  parameters: [
    { id: 'attack', name: 'Attack', min: 0.001, max: 2, default: 0.01, curve: 'exponential' },
    { id: 'decay', name: 'Decay', min: 0.001, max: 2, default: 0.1, curve: 'exponential' },
    { id: 'sustain', name: 'Sustain', min: 0, max: 1, default: 0.7 },
    { id: 'release', name: 'Release', min: 0.001, max: 5, default: 0.3, curve: 'exponential' },
  ],

  create: (ctx: AudioContext): ModuleInstance => {
    const envelope = ctx.createConstantSource();
    envelope.offset.value = 0;
    envelope.start();

    const ports = new Map<string, ModulePort>([
      ['gate', { id: 'gate', name: 'Gate', direction: 'input', signal: 'gate' }],
      ['retrigger', { id: 'retrigger', name: 'Retrigger', direction: 'input', signal: 'trigger' }],
      ['output', { id: 'output', name: 'Output', direction: 'output', signal: 'cv', node: envelope }],
    ]);

    let attack = 0.01;
    let decay = 0.1;
    let sustain = 0.7;
    let release = 0.3;

    return {
      descriptorId: 'ADSR',
      ports,

      setParam: (paramId: string, value: number) => {
        switch (paramId) {
          case 'attack':
            attack = value;
            break;
          case 'decay':
            decay = value;
            break;
          case 'sustain':
            sustain = value;
            break;
          case 'release':
            release = value;
            break;
        }
      },

      getParam: (paramId: string) => {
        switch (paramId) {
          case 'attack':
            return attack;
          case 'decay':
            return decay;
          case 'sustain':
            return sustain;
          case 'release':
            return release;
          default:
            return 0;
        }
      },

      gateOn: (time: number, velocity: number) => {
        const param = envelope.offset;
        const now = time || ctx.currentTime;

        // Cancel scheduled values
        param.cancelScheduledValues(now);

        // Attack phase
        param.setValueAtTime(param.value, now);
        param.linearRampToValueAtTime(velocity, now + attack);

        // Decay phase
        param.linearRampToValueAtTime(sustain * velocity, now + attack + decay);
      },

      gateOff: (time: number) => {
        const param = envelope.offset;
        const now = time || ctx.currentTime;

        // Cancel scheduled values and ramp to 0
        param.cancelScheduledValues(now);
        param.setValueAtTime(param.value, now);
        param.linearRampToValueAtTime(0, now + release);
      },

      dispose: () => {
        envelope.stop();
        envelope.disconnect();
      },
    };
  },
};
