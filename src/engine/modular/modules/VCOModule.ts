/**
 * VCOModule - Voltage Controlled Oscillator
 *
 * Core oscillator module with multiple waveforms and modulation inputs.
 */

import type { ModuleDescriptor, ModuleInstance, ModulePort } from '../../../types/modular';

export const VCODescriptor: ModuleDescriptor = {
  id: 'VCO',
  name: 'VCO (Oscillator)',
  category: 'source',
  voiceMode: 'per-voice',
  color: '#3b82f6', // blue

  ports: [
    { id: 'pitch', name: 'Pitch', direction: 'input', signal: 'cv' },
    { id: 'pwm', name: 'PWM', direction: 'input', signal: 'cv' },
    { id: 'fm', name: 'FM', direction: 'input', signal: 'cv' },
    { id: 'output', name: 'Output', direction: 'output', signal: 'audio' },
  ],

  parameters: [
    { id: 'waveform', name: 'Waveform', min: 0, max: 3, default: 0 }, // 0=sine, 1=saw, 2=square, 3=triangle
    { id: 'detune', name: 'Detune', min: -100, max: 100, default: 0 },
    { id: 'octave', name: 'Octave', min: -2, max: 2, default: 0 },
    { id: 'pulseWidth', name: 'Pulse Width', min: 0, max: 1, default: 0.5 },
  ],

  create: (ctx: AudioContext): ModuleInstance => {
    const osc = ctx.createOscillator();
    const pitchCV = ctx.createConstantSource();
    const gain = ctx.createGain();

    // Initialize
    osc.type = 'sawtooth';
    osc.frequency.value = 440;
    pitchCV.offset.value = 440;
    pitchCV.start();
    osc.start();

    // Route: pitchCV → osc.frequency
    pitchCV.connect(osc.frequency);

    // Output gain
    osc.connect(gain);

    const ports = new Map<string, ModulePort>([
      ['pitch', { id: 'pitch', name: 'Pitch', direction: 'input', signal: 'cv', param: pitchCV.offset }],
      ['pwm', { id: 'pwm', name: 'PWM', direction: 'input', signal: 'cv' }], // TODO: PWM implementation
      ['fm', { id: 'fm', name: 'FM', direction: 'input', signal: 'cv', param: osc.frequency }],
      ['output', { id: 'output', name: 'Output', direction: 'output', signal: 'audio', node: gain }],
    ]);

    let currentWaveform = 0;
    let currentDetune = 0;
    let currentOctave = 0;

    return {
      descriptorId: 'VCO',
      ports,

      setParam: (paramId: string, value: number) => {
        switch (paramId) {
          case 'waveform':
            currentWaveform = Math.floor(value);
            const types: OscillatorType[] = ['sine', 'sawtooth', 'square', 'triangle'];
            osc.type = types[currentWaveform] || 'sawtooth';
            break;
          case 'detune':
            currentDetune = value;
            osc.detune.value = value;
            break;
          case 'octave':
            currentOctave = Math.floor(value);
            // Octave shifts are applied via pitch CV multiplication
            break;
          case 'pulseWidth':
            // TODO: Implement PWM via PeriodicWave
            break;
          case 'frequency':
            // Direct frequency set (used during noteOn)
            const freq = value * Math.pow(2, currentOctave);
            pitchCV.offset.value = freq;
            break;
        }
      },

      getParam: (paramId: string) => {
        switch (paramId) {
          case 'waveform':
            return currentWaveform;
          case 'detune':
            return currentDetune;
          case 'octave':
            return currentOctave;
          default:
            return 0;
        }
      },

      dispose: () => {
        osc.stop();
        osc.disconnect();
        pitchCV.stop();
        pitchCV.disconnect();
        gain.disconnect();
      },
    };
  },
};
