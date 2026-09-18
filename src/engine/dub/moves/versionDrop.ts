/**
 * versionDrop — hold all melodic channels silent, leave percussion + bass.
 *
 * The defining dub technique: "just the riddim." Mutes every channel whose
 * detected role is lead / chord / arpeggio / pad / skank, leaving drums and
 * bass untouched so the dub bus echo + spring tail plays over the raw rhythm.
 *
 * Uses the same classifySongRoles() call AutoDub uses (cached on the pattern
 * set, O(1) on repeated calls). User dubRole overrides in the mixer are
 * respected. If no role data is available (no patterns loaded), fires as a
 * graceful no-op — no channels muted.
 */

import type { DubMove } from './_types';
import { useMixerStore } from '@/stores/useMixerStore';
import {
  beginDubTransient,
  setDubTransient,
  endDubTransient,
} from '@/lib/dub/dubChannelTransient';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useInstrumentStore } from '@/stores/useInstrumentStore';
import { classifySongRoles } from '@/bridge/analysis/ChannelNaming';
import type { InstrumentConfig } from '@/types/instrument';
import type { ChannelRole } from '@/bridge/analysis/MusicAnalysis';

const MELODIC_ROLES = new Set<ChannelRole>(['lead', 'chord', 'arpeggio', 'pad', 'skank']);

export const versionDrop: DubMove = {
  id: 'versionDrop',
  kind: 'hold',
  defaults: {},

  execute(_ctx) {
    const mixer = useMixerStore.getState();
    const tracker = useTrackerStore.getState();
    const patterns = tracker.patterns;

    // Resolve roles — fall back to empty if no song is loaded
    let roles: ChannelRole[] = [];
    if (Array.isArray(patterns) && patterns.length > 0) {
      const insts = useInstrumentStore.getState().instruments;
      const lookup = new Map<number, InstrumentConfig>();
      for (const inst of insts) {
        if (inst && typeof inst.id === 'number') lookup.set(inst.id, inst);
      }
      roles = classifySongRoles(patterns, lookup);
    }

    // Mute every melodic channel; respect user dubRole overrides
    // Every muted channel is a transient: the move never decides what the
    // channel's resting mute is, it only borrows it (channelSendBaseline.ts).
    const channels = mixer.channels;
    const muted: number[] = [];

    for (let i = 0; i < channels.length; i++) {
      const ch = channels[i];
      if (!ch) continue;
      // User override beats offline classifier
      const effectiveRole: ChannelRole = (ch.dubRole as ChannelRole | null) ?? roles[i] ?? 'empty';
      if (!MELODIC_ROLES.has(effectiveRole)) continue;

      beginDubTransient(i);
      setDubTransient(i, { muted: true });
      muted.push(i);
    }

    let released = false;
    return {
      dispose() {
        if (released) return;
        released = true;
        for (const i of muted) {
          try { endDubTransient(i); } catch (err) {
            console.error(`[versionDrop] RESTORE failed ch${i}:`, err);
          }
        }
      },
    };
  },
};
