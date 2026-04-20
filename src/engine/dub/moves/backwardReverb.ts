/**
 * backwardReverb — classic dub move where the last N seconds of bus audio
 * are time-reversed and fed back through echo + spring. The reverb "builds
 * up" into the original attack rather than trailing from it.
 *
 * NOT a spring-wet swell — the bus's ReverseCapture worklet snapshots the
 * actual recent audio and plays it back in reverse. Stacks cleanly; each
 * fire is independent.
 *
 * Global, one-shot. The bus method returns a Promise (worklet message
 * round-trip), but we don't await it — the move fires and forgets.
 */

import type { DubMove } from './_types';

export const backwardReverb: DubMove = {
  id: 'backwardReverb',
  kind: 'trigger',
  defaults: { durationSec: 0.8 },

  execute({ bus, params }) {
    const durationSec = params.durationSec ?? this.defaults.durationSec;
    console.log(`[backwardReverb] fired durationSec=${durationSec}`);
    void bus.backwardReverb(durationSec);
    return null;
  },
};
