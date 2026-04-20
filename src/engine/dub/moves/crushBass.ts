/**
 * crushBass — 3-bit quantize-distortion bass drone. Research-quoted
 * jungle/dub trick: "Bit-depth reduction to 3/2/1-bit → lowpass after
 * to remove hiss = Jungle distortion bass." The crushed sawtooth
 * produces heavy odd harmonics that read as aggressive digital bass,
 * then the LPF tames the ultra-highs.
 *
 * Hold. Release fades out over 200 ms.
 */

import type { DubMove } from './_types';

export const crushBass: DubMove = {
  id: 'crushBass',
  kind: 'hold',
  defaults: { freq: 55, bits: 3, level: 0.75 },

  execute({ bus, params }) {
    const freq = params.freq ?? this.defaults.freq;
    const bits = params.bits ?? this.defaults.bits;
    const level = params.level ?? this.defaults.level;
    const release = bus.startCrushBass(freq, bits, level);
    return { dispose: release };
  },
};
