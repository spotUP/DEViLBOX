/**
 * skankEchoThrow — catch one skank stab and throw it into the echo.
 *
 * This is the defining offbeat dub gesture. The producer is not putting the
 * skank channel through a delay; he is performing on the send. He hears a
 * particular chord stab coming, opens the send for that one hit, lets the
 * feedback throw repeats into the spaces after it, and gets out before the
 * next stab. The dry skank keeps playing clean.
 *
 *   SKANK:  CHACK        CHACK        CHACK        CHACK
 *              │
 *           [THROW]
 *              ↓
 *   ECHO:         chak    chuk    chk   ...
 *
 * The repeats land 0.75 beats apart — a dotted eighth, the classic reggae
 * delay — so they fall between the subsequent stabs instead of on top of
 * them. The bus's in-feedback HPF/LPF darken each pass, so the tail reads as
 * a decaying echo rather than four identical copies.
 *
 * Mechanic (same shape as `echoThrow`, which is the general form of this
 * gesture):
 *   1. Snapshot the echo rate, set it to a dotted eighth of the current tempo
 *   2. Open the channel tap for `captureBeats` — ONE stab, not a phrase
 *   3. Boost feedback for the capture plus a `tailBeats` ring-out
 *   4. Close the tap; when the tail has spoken, restore the prior echo rate
 *
 * History (2026-09-17): this move used to be `kind: 'hold'` with no close
 * timer, an 8000 ms fixed feedback window, and an echo-rate change that
 * lasted as long as the hold. AutoDub fires it with `holdBars: 2`, so at
 * 120 BPM the tap sat open for 4 seconds — roughly eight offbeat stabs
 * thrown at once, each spawning repeats, over the top of the dry channel.
 * That is a wash, not a throw, and it is why the skanks never sounded like
 * a dub record. See `skankFloatThrow` for the 3:2 polyrhythmic variant that
 * the old 1.5-beat timing actually produced.
 */

import type { DubMove } from './_types';

const beatMs = (bpm: number) => 60000 / Math.max(30, Math.min(300, bpm));

/** Shared implementation — `division` is the echo time as a fraction of a beat. */
export function makeSkankThrow(id: string, division: number): DubMove {
  return {
    id,
    kind: 'trigger',
    defaults: { captureBeats: 0.5, tailBeats: 2, feedbackBoost: 0.12 },

    execute({ bus, channelId, deckId, params, bpm }) {
      if (channelId === undefined) return null;

      const beat = beatMs(bpm);
      const captureMs = beat * (params.captureBeats ?? 0.5);
      const tailMs = beat * (params.tailBeats ?? 2);
      const feedbackBoost = params.feedbackBoost ?? 0.12;

      // Delay time is set for the duration of the gesture only. The bus-wide
      // `echoSyncDivision` setting is the user's; we borrow the rate and give
      // it back once the repeats have rung out. Restoring it mid-tail would
      // re-pitch the repeats still in flight, so the restore waits for them.
      const priorRate = bus.getEchoRateMs();
      bus.setEchoRate(Math.round(beat * division));

      const close = deckId
        ? bus.openChannelTap(channelId, 1.0, 0.005, { deckId })
        : bus.openChannelTap(channelId, 1.0, 0.005);
      bus.modulateFeedback(feedbackBoost, captureMs + tailMs);

      let done = false;
      const closeTimer = setTimeout(() => close(), captureMs);
      const restoreTimer = setTimeout(() => {
        done = true;
        bus.setEchoRate(priorRate);
      }, captureMs + tailMs);

      return {
        dispose() {
          clearTimeout(closeTimer);
          clearTimeout(restoreTimer);
          close();
          if (!done) {
            done = true;
            bus.setEchoRate(priorRate);
          }
        },
      };
    },
  };
}

/** Dotted eighth (0.75 beat) — the classic reggae/dub skank delay. */
export const skankEchoThrow: DubMove = makeSkankThrow('skankEchoThrow', 0.75);
