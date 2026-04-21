/**
 * channelThrow — long-form echoThrow. One-bar hold + heavier feedback so
 * the throw swells into a full-bar sustained echo tail instead of a
 * snappy kiss. Same mechanic, different personality: where echoThrow is
 * the default "bread and butter" throw and dubStab is the short jab,
 * channelThrow is the dramatic "drop it in the echo and forget it" move.
 */

import type { DubMove } from './_types';

const beatsToMs = (bpm: number, beats: number) =>
  (60000 / Math.max(30, Math.min(300, bpm))) * beats;

export const channelThrow: DubMove = {
  id: 'channelThrow',
  kind: 'trigger',
  defaults: { throwBeats: 4.0, feedbackBoost: 0.30 },

  execute({ bus, channelId, deckId, params, bpm }) {
    if (channelId === undefined) return null;

    const throwBeats = params.throwBeats ?? this.defaults.throwBeats;
    const feedbackBoost = params.feedbackBoost ?? this.defaults.feedbackBoost;
    const holdMs = beatsToMs(bpm, throwBeats);

    const close = deckId
      ? bus.openChannelTap(channelId, 1.0, 0.010, { deckId })
      : bus.openChannelTap(channelId, 1.0, 0.010);
    bus.modulateFeedback(feedbackBoost, holdMs + 600);

    const timer = setTimeout(() => close(), holdMs);

    return {
      dispose() {
        clearTimeout(timer);
        close();
      },
    };
  },
};
