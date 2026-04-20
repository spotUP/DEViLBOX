/**
 * reverseEcho — distinct from backwardReverb. Samples the last N ms of
 * bus content, reverses it, plays it forward once, and routes ONLY into
 * the echo chain (not the spring) so the result reads as a short reverse
 * flourish that gets echoed. The classic "reverse swell preceding the
 * downbeat" transition — think Snare rolls + vocal adlibs preceded by
 * their own reversed tail.
 *
 * One-shot trigger. Separate from Backward Reverb which snapshots longer
 * content and slams it through the FULL bus wet chain.
 */

import type { DubMove } from './_types';

export const reverseEcho: DubMove = {
  id: 'reverseEcho',
  kind: 'trigger',
  defaults: { durationSec: 0.4, amount: 1.2 },

  execute({ bus, params }) {
    const durationSec = params.durationSec ?? this.defaults.durationSec;
    const amount = params.amount ?? this.defaults.amount;
    void bus.reverseEcho(durationSec, amount);
    return null;
  },
};
