/**
 * ringMod — hold move that activates the ring modulator.
 *
 * While held, the ring modulator sends metallic, robotic harmonics
 * through the dub bus return. The carrier frequency multiplied with
 * the input creates sum and difference frequencies — classic sci-fi
 * dub texture.
 *
 * The Interruptor: "Ring modulators sound very unique on drum loops."
 * Multiple contributors recommend it for drums, bass, and weird textures.
 */

import type { DubMove } from './_types';

export const ringMod: DubMove = {
  id: 'ringMod',
  kind: 'hold',
  defaults: { freq: 440, amount: 0.5 },

  execute({ bus, params }) {
    const freq = params.freq ?? this.defaults.freq;
    const amount = params.amount ?? this.defaults.amount;

    bus.setSettings({
      ringModEnabled: true,
      ringModFreq: freq,
      ringModAmount: amount,
    });
    // Claim these keys for the length of the hold. The store does not know this
    // move changed them, so the next mirror push would otherwise arrive with
    // `ringModEnabled: false` and switch the effect off while the pad is still
    // down. Released before the dispose write, so that write lands.
    const release = bus.claimSettingKeys(['ringModEnabled', 'ringModFreq', 'ringModAmount']);

    return {
      dispose() {
        release();
        bus.setSettings({
          ringModEnabled: false,
          ringModAmount: 0,
        });
      },
    };
  },
};
