/**
 * sonarPing — classic Tubby/Perry sonar move: a clean 1 kHz sine burst
 * fed directly through tape echo for the "submarine ping" transition
 * effect. Sits nicely as a 1/2-bar intro gesture or between sections.
 * Research quote: "patch the console's built-in calibration tone into
 * an analog/tape delay for sonar-style echo hits."
 */

import type { DubMove } from './_types';

export const sonarPing: DubMove = {
  id: 'sonarPing',
  kind: 'trigger',
  defaults: { freq: 1000, durationMs: 140, level: 0.8 },

  execute({ bus, params }) {
    const freq = params.freq ?? this.defaults.freq;
    const durationMs = params.durationMs ?? this.defaults.durationMs;
    const level = params.level ?? this.defaults.level;
    bus.firePing(freq, durationMs, level);
    return null;
  },
};
