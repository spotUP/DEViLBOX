/**
 * madProfPingPong — Mad Professor's Ariwa Sounds SDE-3000 stereo ping-pong.
 *
 * Two delay lines at different times, panned hard left (3/8 note) and right
 * (1/2 note), with cross-channel feedback. This is what gives Mad Professor's
 * mixes their distinctive wide, rhythmically-offset stereo feel — completely
 * different from M/S width which is mono-compatible.
 *
 * The research doc specifies: Ariwa's Roland SDE-3000 ran 3/8 note to the
 * left and 1/2 note to the right — "the Ariwa signature" that no other
 * engineer replicated.
 *
 * Hold move: the ping-pong runs while held, fades out on release.
 */

import type { DubMove } from './_types';

export const madProfPingPong: DubMove = {
  id: 'madProfPingPong',
  kind: 'hold',
  defaults: { lMs: 337, rMs: 450, feedback: 0.5, wet: 0.7 },

  execute({ bus, params }) {
    const lMs      = (params.lMs      as number | undefined) ?? 337;
    const rMs      = (params.rMs      as number | undefined) ?? 450;
    const feedback = (params.feedback as number | undefined) ?? 0.5;
    const wet      = (params.wet      as number | undefined) ?? 0.7;
    const release  = bus.startPingPong(lMs, rMs, feedback, wet);
    return { dispose: release };
  },
};
