/**
 * echoThrow — the first tracker-dub move.
 *
 * Mechanic: open the selected channel's dub-send tap to full, boost echo
 * feedback by `feedbackBoost` for `throwBeats` beats, close the tap (ramps
 * back to the user's baseline dubSend), feedback decays naturally.
 *
 * Classic King Tubby vocabulary — the signature move where one note gets
 * "thrown" into the echo and rings out while the dry mix continues clean.
 * Quantize resolution happens upstream in DubRouter.fire (Phase 1 default:
 * 'offbeat' placement lands throws on the "&" between beats).
 */

import type { DubMove } from './_types';

const beatsToMs = (bpm: number, beats: number) =>
  (60000 / Math.max(30, Math.min(300, bpm))) * beats;

export const echoThrow: DubMove = {
  id: 'echoThrow',
  kind: 'trigger',
  defaults: { throwBeats: 0.5, feedbackBoost: 0.15 },

  execute({ bus, channelId, params, bpm }) {
    if (channelId === undefined) return null;

    const throwBeats = params.throwBeats ?? this.defaults.throwBeats;
    const feedbackBoost = params.feedbackBoost ?? this.defaults.feedbackBoost;
    const holdMs = beatsToMs(bpm, throwBeats);

    const close = bus.openChannelTap(channelId, 1.0, 0.005);
    bus.modulateFeedback(feedbackBoost, holdMs);

    const timer = setTimeout(() => close(), holdMs);

    return {
      dispose() {
        clearTimeout(timer);
        close();
      },
    };
  },
};
