/**
 * voltageStarve — hold move that ramps bit depth down for lo-fi effect.
 *
 * Models a "near dead battery" or dictaphone compression: while held,
 * the Bitta WASM bitcrusher progressively reduces bit depth from 16
 * (clean) down to the target. On release, snaps back to full quality.
 *
 * The Interruptor Dub Scrolls: "cheap walkietalkies, dictaphone
 * compression" — the lo-fi texture that contrasts with the clean dub.
 */

import type { DubMove } from './_types';

export const voltageStarve: DubMove = {
  id: 'voltageStarve',
  kind: 'hold',
  defaults: { targetBits: 6 },

  execute({ bus, params }) {
    const targetBits = params.targetBits ?? this.defaults.targetBits;

    // Enable lo-fi and set to target bit depth
    bus.setSettings({
      lofiEnabled: true,
      lofiBits: targetBits,
    });

    return {
      dispose() {
        // Restore to full quality and disable
        bus.setSettings({
          lofiEnabled: false,
          lofiBits: 16,
        });
      },
    };
  },
};
