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
  /**
   * Amount is the SEND into the return, mix is the modulator's own dry/wet.
   *
   * Both were 0.5, and the send is a parallel ADD alongside the full core wet
   * chain — so the ring-modulated content arrived at a quarter of the dry it
   * was sitting next to, and the move read as a faint sheen rather than as
   * ring modulation. Measured 2026-09-23: +6 dB at 10 kHz, which is real but
   * nothing like what pressing a button called Ring should do.
   *
   * A colour move is a gesture, not a garnish: while it is held it should be
   * unmistakably what it says. So the send opens fully and the modulator runs
   * fully wet — its output IS the effect, and the core wet chain is still
   * there underneath it.
   */
  defaults: { freq: 440, amount: 1, mix: 1 },

  execute({ bus, params }) {
    const freq = params.freq ?? this.defaults.freq;
    const amount = params.amount ?? this.defaults.amount;
    const mix = params.mix ?? this.defaults.mix;
    // What the user had set, so the release puts their voicing back rather
    // than the move's.
    const priorMix = bus.getSettings().ringModMix;

    // Announced like the moves that own a bus method. This one reaches the
    // audio through `setSettings`, which does not log these keys, so without
    // this line the move is invisible to `get_console_errors` and "did Ring
    // engage" has no answer short of reading node gains.
    console.log(`[DubBus] ringMod ▶ freq=${freq}Hz amount=${amount} mix=${mix}`);
    bus.setSettings({
      ringModEnabled: true,
      ringModFreq: freq,
      ringModAmount: amount,
      ringModMix: mix,
    });
    // Claim these keys for the length of the hold. The store does not know this
    // move changed them, so the next mirror push would otherwise arrive with
    // `ringModEnabled: false` and switch the effect off while the pad is still
    // down. Released before the dispose write, so that write lands.
    const releaseGesture = bus.holdWetGesture();
    const release = bus.claimSettingKeys(['ringModEnabled', 'ringModFreq', 'ringModAmount', 'ringModMix']);

    return {
      dispose() {
        releaseGesture();
        release();
        bus.setSettings({
          ringModEnabled: false,
          ringModAmount: 0,
          ringModMix: priorMix,
        });
      },
    };
  },
};
