/**
 * oscBass — self-oscillating LPF as a bass source. Classic jungle/dub
 * trick where the filter's resonance is cranked past self-oscillation
 * and the cutoff frequency becomes the pitch of a bass note. Research
 * quote: "Nord Modular classic LP: cutoff 31 Hz, resonance > 125 → filter
 * screams and plays a bass note."
 *
 * Hold move. While held, an oscillator at `freq` rings through the bus
 * input with heavy resonance character. Release fades out over 200 ms.
 */

import type { DubMove } from './_types';

export const oscBass: DubMove = {
  id: 'oscBass',
  kind: 'hold',
  defaults: { freq: 55, level: 0.9 },

  execute({ bus, params }) {
    const freq = params.freq ?? this.defaults.freq;
    const level = params.level ?? this.defaults.level;
    const release = bus.startOscBass(freq, level);
    return { dispose: release };
  },
};
