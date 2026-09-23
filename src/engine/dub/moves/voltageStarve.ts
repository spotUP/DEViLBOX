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
  /**
   * Four bits, not six.
   *
   * Two of sixteen.
   *
   * Six was a gentle grain. Four was verified 2026-09-23 to be fully in
   * circuit — the crossfade puts `lofiSend` at 1 and `lofiBypass` at 0, and
   * the crusher runs mix and wet at 1 — and the owner still could not hear
   * it over the echo and spring. So the stage was never the problem and the
   * depth was: `BittaEffect` clamps crush to 1..16, and two bits is a dying
   * battery rather than a hint of one, which is what this move's own
   * description promises.
   */
  defaults: { targetBits: 2 },

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
