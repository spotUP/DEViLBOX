/**
 * channelShape — hold a channel's sound-shaping slot at an effect.
 *
 * The per-channel colours of the slot (lib/dub/channelShape.ts) as a
 * performance gesture: a High Pass thinning the skank for a bar, a Low Pass
 * dropping the bass at the phrase seam, Ring Mod on the drums, Lo-fi on the
 * chords, Wobble on a lead, Saturation pushing the bass. What each persona
 * reaches for, on which channel role, is in AutoDub's RULES.
 *
 * Params (numbers, like every move's): `effect` = index into
 * CHANNEL_SHAPE_KINDS (1 High Pass, 2 Low Pass, 3 Ring Mod, 4 Lo-fi,
 * 5 Wobble, 6 Saturation); `amount` 0..1 across that effect's parameter range.
 *
 * The move BORROWS the slot: it never writes the mixer store, so the user's
 * own choice is untouched and comes back on release — through the manager's
 * override stack, which lets nested holds on one channel release in any
 * order (the same discipline channelMute keeps through dubChannelTransient).
 */
import type { DubMove } from './_types';
import { getChannelRoutedEffectsManager } from '../../tone/ChannelRoutedEffects';
import { channelShapeMoveTarget, describeChannelShape } from '@/lib/dub/channelShape';

export const channelShape: DubMove = {
  id: 'channelShape',
  kind: 'hold',
  defaults: { effect: 1, amount: 0.5 },

  execute({ channelId, params }) {
    if (channelId === undefined) return null;
    const target = channelShapeMoveTarget(params);
    if (!target) return null;
    const mgr = getChannelRoutedEffectsManager();
    if (!mgr) return null;
    console.log(`[DubBus] channelShape ▶ ch${channelId} ${describeChannelShape(target.kind, target.value)}`);
    const hold = mgr.holdChannelShape(channelId, target.kind, target.value);
    return {
      update(next) {
        const t = channelShapeMoveTarget({ ...params, ...next });
        if (t && t.kind === target.kind) hold.update(t.value);
      },
      dispose() {
        hold.release();
      },
    };
  },
};
