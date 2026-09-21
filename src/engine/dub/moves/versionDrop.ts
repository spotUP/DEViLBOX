/**
 * versionDrop — "just the riddim": take the arrangement away, leave the pulse.
 *
 * Gate I. This used to mute every channel whose legacy role was melodic and
 * unmute them all together on release. Three things were wrong with that, and
 * all three were audible:
 *
 *  1. Role is not importance. A pad nobody can hear and the hook the tune
 *     rests on were treated the same.
 *  2. Everything left at once, so the drop was a cut rather than a dub. The
 *     classic move is throw-then-mute: the channel goes into the echo FIRST,
 *     then mutes, and the tail carries the part out of the mix — the listener
 *     hears it leave instead of vanishing.
 *  3. Everything came back at once too. Restoring most-important-first lets
 *     the riddim re-form under the melody rather than the mix reappearing like
 *     a switch being flipped.
 *
 * The plan comes from `planDrop`, which reads the same channel profiles the
 * performer's targeting uses, so what a drop considers expendable and what a
 * throw considers worth aiming at cannot disagree.
 */

import { resolveTransportRow } from '@/lib/dub/transportRow';
import type { DubMove } from './_types';
import { useMixerStore } from '@/stores/useMixerStore';
import {
  beginDubTransient,
  setDubTransient,
  endDubTransient,
} from '@/lib/dub/dubChannelTransient';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useTransportStore } from '@/stores/useTransportStore';
import { buildInstrumentLookup, getChannelProfiles } from '../channelProfiles';
import {
  planDrop,
  droppedChannels,
  restoreDelayMs,
  type ChannelDropPlan,
} from '@/lib/dub/arrangementIntelligence';
import { computeMusicalPosition } from '@/lib/dub/musicalClock';

/** How long the echo gets the channel before the mute lands, in ms. */
const THROW_LEAD_MS = 90;
/** Gap between channels returning. */
const RESTORE_STEP_MS = 180;
const RESTORE_MAX_MS = 700;

export const versionDrop: DubMove = {
  id: 'versionDrop',
  kind: 'hold',
  defaults: {},

  execute({ bus }) {
    const mixer = useMixerStore.getState();
    const tracker = useTrackerStore.getState();
    const transport = useTransportStore.getState();

    const pattern = tracker.patterns?.[tracker.currentPatternIndex ?? 0] ?? null;
    if (!pattern?.channels?.length) return { dispose() {} };

    // The coarse/fine join, not the raw field: `currentGlobalRow` only moves on
    // a pattern change, and this grid is what the drop plans its return
    // against.
    const grid = computeMusicalPosition(
      resolveTransportRow(transport.currentGlobalRow, transport.currentRow) ?? 0,
      transport.speed || 6,
    );
    const profiles = getChannelProfiles(
      pattern,
      mixer.channels.map(c => c?.name ?? null),
      grid.rowsPerBeat,
      grid.rowsPerBar,
      buildInstrumentLookup(),
    );

    // A channel the user has already muted is theirs, not ours: it must not
    // come back just because the drop released.
    const alreadyMuted = new Set<number>();
    mixer.channels.forEach((ch, i) => { if (ch?.muted) alreadyMuted.add(i); });

    const plans = planDrop(profiles, { exclude: alreadyMuted });
    const taking = droppedChannels(plans);
    if (taking.length === 0) return { dispose() {} };

    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const held: ChannelDropPlan[] = [];

    for (const plan of taking) {
      beginDubTransient(plan.channel);
      held.push(plan);

      if (plan.behavior === 'throwThenMute') {
        // Into the echo first, then out of the mix: the tail carries it.
        setDubTransient(plan.channel, { dubSend: 1.0 });
        try { bus.modulateFeedback(0.15, THROW_LEAD_MS + 600); } catch { /* bus optional */ }
        timers.push(setTimeout(() => {
          setDubTransient(plan.channel, { muted: true });
        }, THROW_LEAD_MS));
      } else {
        setDubTransient(plan.channel, { muted: true });
      }
    }

    let released = false;
    return {
      dispose() {
        if (released) return;
        released = true;
        for (const t of timers) clearTimeout(t);

        // Most important first, staggered — the riddim re-forms under the
        // melody instead of the whole mix snapping back.
        for (const plan of held) {
          const delay = restoreDelayMs(plan, RESTORE_STEP_MS, RESTORE_MAX_MS);
          if (delay <= 0) {
            endDubTransient(plan.channel);
          } else {
            setTimeout(() => {
              try { endDubTransient(plan.channel); } catch (err) {
                console.error(`[versionDrop] restore failed ch${plan.channel}:`, err);
              }
            }, delay);
          }
        }
      },
    };
  },
};
