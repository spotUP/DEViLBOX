/**
 * skankEchoThrow — the floating offbeat echo.
 *
 * The most iconic skank dub technique: throw the upbeat chord/skank channel
 * into the echo with the delay set to dotted-quarter timing (1.5 × quarter
 * note). The echo repeats land at offset positions — 1.5 beats after each
 * hit — creating a 3:2 polyrhythm against the music that sounds like the
 * echo is floating at 2/3 the original tempo. "Lower by a third" in feel.
 *
 * Mechanic:
 *   1. Capture the current echo rate
 *   2. Switch echo to dotted-quarter (1.5 × beat length)
 *   3. Open the channel tap at full level
 *   4. Boost feedback slightly so echoes sustain over the hold
 *   5. On release: close tap, restore echo rate
 *
 * Hold move — the offbeat echo floats for as long as you hold, then the
 * channel tap closes and the original echo rate returns.
 */

import type { DubMove } from './_types';

export const skankEchoThrow: DubMove = {
  id: 'skankEchoThrow',
  kind: 'hold',
  defaults: { feedbackBoost: 0.12, holdMs: 0 },

  execute({ bus, channelId, params, bpm }) {
    if (channelId === undefined) return null;

    const safeBpm = Math.max(30, Math.min(300, bpm));
    // Dotted quarter = 1.5 × beat duration — creates the floating 2/3-tempo feel
    const dottedMs = (60000 / safeBpm) * 1.5;

    const priorRate = bus.getEchoRateMs();
    bus.setEchoRate(dottedMs);

    const feedbackBoost = (params.feedbackBoost as number | undefined) ?? 0.12;
    const close = bus.openChannelTap(channelId, 1.0, 0.005);
    bus.modulateFeedback(feedbackBoost, 8000); // sustain feedback during hold

    return {
      dispose() {
        try { close(); } catch { /* ok */ }
        try { bus.setEchoRate(priorRate); } catch { /* ok */ }
      },
    };
  },
};
