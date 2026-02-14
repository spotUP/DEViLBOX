/**
 * MIDIInModule - MIDI Input
 *
 * Converts MIDI note messages to CV (pitch, gate, velocity).
 * This is a conceptual module - actual MIDI routing is handled by ModularVoice.
 */

import type { ModuleDescriptor, ModuleInstance, ModulePort } from '../../../types/modular';

export const MIDIInDescriptor: ModuleDescriptor = {
  id: 'MIDIIn',
  name: 'MIDI In',
  category: 'io',
  voiceMode: 'shared',
  color: '#a855f7', // purple

  ports: [
    { id: 'pitch', name: 'Pitch (V/Oct)', direction: 'output', signal: 'cv' },
    { id: 'gate', name: 'Gate', direction: 'output', signal: 'gate' },
    { id: 'velocity', name: 'Velocity', direction: 'output', signal: 'cv' },
  ],

  parameters: [],

  create: (ctx: AudioContext): ModuleInstance => {
    const pitchCV = ctx.createConstantSource();
    const gateCV = ctx.createConstantSource();
    const velocityCV = ctx.createConstantSource();

    pitchCV.offset.value = 440; // Default pitch
    gateCV.offset.value = 0; // Gate off
    velocityCV.offset.value = 1; // Max velocity

    pitchCV.start();
    gateCV.start();
    velocityCV.start();

    const ports = new Map<string, ModulePort>([
      ['pitch', { id: 'pitch', name: 'Pitch (V/Oct)', direction: 'output', signal: 'cv', node: pitchCV }],
      ['gate', { id: 'gate', name: 'Gate', direction: 'output', signal: 'gate', node: gateCV }],
      ['velocity', { id: 'velocity', name: 'Velocity', direction: 'output', signal: 'cv', node: velocityCV }],
    ]);

    return {
      descriptorId: 'MIDIIn',
      ports,

      setParam: () => {
        // No user parameters
      },

      getParam: () => 0,

      dispose: () => {
        pitchCV.stop();
        gateCV.stop();
        velocityCV.stop();
        pitchCV.disconnect();
        gateCV.disconnect();
        velocityCV.disconnect();
      },
    };
  },
};
