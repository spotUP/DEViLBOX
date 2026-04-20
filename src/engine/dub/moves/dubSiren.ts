/**
 * dubSiren — fires the dedicated DubSirenSynth (pitch-swept square osc with
 * LFO, the Rasta-box voice) into the bus input so echo + spring process it.
 * Held for as long as the caller keeps the move alive; release triggers the
 * synth's release envelope.
 *
 * Global move (channelId ignored). The old implementation drove echo feedback
 * into self-oscillation — that produced a drone, not a siren. Replaced 2026-04-20.
 */

import type { DubMove } from './_types';

export const dubSiren: DubMove = {
  id: 'dubSiren',
  kind: 'hold',
  defaults: {},

  execute({ bus }) {
    const release = bus.startSiren();
    return { dispose: release };
  },
};
