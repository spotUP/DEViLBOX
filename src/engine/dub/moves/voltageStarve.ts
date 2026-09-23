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

    // Announced for the same reason as ringMod: this move reaches the audio
    // through `setSettings`, so nothing else says it ran.
    console.log(`[DubBus] voltageStarve ▶ bits=${targetBits}`);
    // Enable lo-fi and set to target bit depth
    bus.setSettings({
      lofiEnabled: true,
      lofiBits: targetBits,
    });
    // Same as ringMod: the store never learns this move touched lo-fi, so an
    // unclaimed key would be reverted by the next settings mirror mid-hold.
    const releaseGesture = bus.holdWetGesture();
    const release = bus.claimSettingKeys(['lofiEnabled', 'lofiBits']);

    return {
      dispose() {
        releaseGesture();
        release();
        // Restore to full quality and disable
        bus.setSettings({
          lofiEnabled: false,
          lofiBits: 16,
        });
      },
    };
  },
};
