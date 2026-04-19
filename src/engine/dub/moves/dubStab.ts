/**
 * dubStab — short-and-sharp echo kiss on a tracker channel.
 *
 * Mechanic: same shape as echoThrow (open tap → feedback boost → close) but
 * with a much shorter hold window and a stronger feedback spike so the echo
 * produces a tight "stab" rather than a sustained throw. Used for rhythmic
 * punches that decorate a groove rather than taking it over.
 */

import type { DubMove } from './_types';

const beatsToMs = (bpm: number, beats: number) =>
  (60000 / Math.max(30, Math.min(300, bpm))) * beats;

export const dubStab: DubMove = {
  id: 'dubStab',
  kind: 'trigger',
  defaults: { stabBeats: 0.125, feedbackBoost: 0.25 },

  execute({ bus, channelId, params, bpm }) {
    if (channelId === undefined) return null;

    const stabBeats = params.stabBeats ?? this.defaults.stabBeats;
    const feedbackBoost = params.feedbackBoost ?? this.defaults.feedbackBoost;
    const holdMs = beatsToMs(bpm, stabBeats);

    const close = bus.openChannelTap(channelId, 1.0, 0.002);  // near-instant attack
    bus.modulateFeedback(feedbackBoost, holdMs + 300);         // feedback lingers past the tap

    const timer = setTimeout(() => close(), holdMs);

    return {
      dispose() {
        clearTimeout(timer);
        close();
      },
    };
  },
};
