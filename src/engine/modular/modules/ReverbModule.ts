/**
 * ReverbModule - Algorithmic Reverb
 *
 * Convolution-free algorithmic reverb using feedback delay networks.
 * Inspired by Max for Live's reverb devices and classic algorithms.
 */

import type { ModuleDescriptor, ModuleInstance, ModulePort } from '../../../types/modular';

export const ReverbDescriptor: ModuleDescriptor = {
  id: 'Reverb',
  name: 'Reverb',
  category: 'utility',
  voiceMode: 'shared', // Reverb is typically shared across voices
  color: '#06b6d4', // cyan

  ports: [
    { id: 'input', name: 'Input', direction: 'input', signal: 'audio' },
    { id: 'output', name: 'Output', direction: 'output', signal: 'audio' },
  ],

  parameters: [
    { id: 'size', name: 'Size', min: 0, max: 1, default: 0.5, unit: '%' },
    { id: 'decay', name: 'Decay', min: 0, max: 1, default: 0.5, unit: 's' },
    { id: 'damping', name: 'Damping', min: 0, max: 1, default: 0.5, unit: '%' },
    { id: 'mix', name: 'Dry/Wet', min: 0, max: 1, default: 0.3, unit: '%' },
    { id: 'predelay', name: 'Pre-delay', min: 0, max: 1, default: 0.0, unit: 'ms' },
  ],

  create: (ctx: AudioContext): ModuleInstance => {
    const input = ctx.createGain();
    const dryGain = ctx.createGain();
    const wetGain = ctx.createGain();
    const output = ctx.createGain();
    const predelay = ctx.createDelay(0.5); // Max 500ms predelay

    // Feedback delay network (4 delays)
    const delays: DelayNode[] = [];
    const delayGains: GainNode[] = [];
    const dampingFilters: BiquadFilterNode[] = [];

    // Create 4 parallel delays with feedback
    const delayTimes = [0.037, 0.041, 0.043, 0.047]; // Prime number ratios
    for (let i = 0; i < 4; i++) {
      const delay = ctx.createDelay(5.0);
      const feedback = ctx.createGain();
      const damping = ctx.createBiquadFilter();

      delay.delayTime.value = delayTimes[i];
      feedback.gain.value = 0.7;
      damping.type = 'lowpass';
      damping.frequency.value = 5000;

      // Feedback loop: delay → damping → feedback → delay
      delay.connect(damping);
      damping.connect(feedback);
      feedback.connect(delay);

      delays.push(delay);
      delayGains.push(feedback);
      dampingFilters.push(damping);
    }

    // Diffusion matrix (Hadamard matrix for mixing)
    const mixers: GainNode[] = [];
    for (let i = 0; i < 4; i++) {
      mixers.push(ctx.createGain());
      mixers[i].gain.value = 0.5;
    }

    // Routing: predelay → all delays → mixers → wet
    predelay.delayTime.value = 0.0;
    input.connect(predelay);

    // Connect predelay to all delays
    for (const delay of delays) {
      predelay.connect(delay);
    }

    // Mix delays together
    for (let i = 0; i < 4; i++) {
      delays[i].connect(mixers[i]);
      mixers[i].connect(wetGain);
    }

    // Dry/wet routing
    input.connect(dryGain);
    dryGain.connect(output);
    wetGain.connect(output);

    // Initial mix
    dryGain.gain.value = 0.7; // 70% dry
    wetGain.gain.value = 0.3; // 30% wet
    output.gain.value = 1.0;

    const ports = new Map<string, ModulePort>([
      ['input', { id: 'input', name: 'Input', direction: 'input', signal: 'audio', node: input }],
      ['output', { id: 'output', name: 'Output', direction: 'output', signal: 'audio', node: output }],
    ]);

    return {
      descriptorId: 'Reverb',
      ports,

      setParam: (paramId: string, value: number) => {
        switch (paramId) {
          case 'size':
            // Scale delay times (0.5x to 2x)
            const scale = 0.5 + value * 1.5;
            delays.forEach((delay, i) => {
              delay.delayTime.value = delayTimes[i] * scale;
            });
            break;

          case 'decay':
            // Control feedback (0.3 to 0.95)
            const feedback = 0.3 + value * 0.65;
            delayGains.forEach((gain) => {
              gain.gain.value = feedback;
            });
            break;

          case 'damping':
            // Control high-frequency rolloff (500Hz to 16kHz)
            const freq = 500 + (1 - value) * 15500;
            dampingFilters.forEach((filter) => {
              filter.frequency.value = freq;
            });
            break;

          case 'mix':
            // Equal power crossfade
            const wet = Math.sqrt(value);
            const dry = Math.sqrt(1 - value);
            wetGain.gain.value = wet;
            dryGain.gain.value = dry;
            break;

          case 'predelay':
            // 0 to 200ms
            predelay.delayTime.value = value * 0.2;
            break;
        }
      },

      getParam: (paramId: string) => {
        switch (paramId) {
          case 'size':
            return (delays[0].delayTime.value / delayTimes[0] - 0.5) / 1.5;
          case 'decay':
            return (delayGains[0].gain.value - 0.3) / 0.65;
          case 'damping':
            return 1 - (dampingFilters[0].frequency.value - 500) / 15500;
          case 'mix':
            return wetGain.gain.value * wetGain.gain.value;
          case 'predelay':
            return predelay.delayTime.value / 0.2;
          default:
            return 0;
        }
      },

      dispose: () => {
        input.disconnect();
        dryGain.disconnect();
        wetGain.disconnect();
        output.disconnect();
        predelay.disconnect();
        delays.forEach((d) => d.disconnect());
        delayGains.forEach((g) => g.disconnect());
        dampingFilters.forEach((f) => f.disconnect());
        mixers.forEach((m) => m.disconnect());
      },
    };
  },
};
