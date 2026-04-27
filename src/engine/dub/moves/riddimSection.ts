/**
 * riddimSection — bass & drums breakdown with skank tape-reverb return.
 *
 * Strips the mix to bass+drums by muting all melodic channels, then brings
 * the skank back soaked in echo at 60% of the hold duration (the classic
 * "drop everything — let the riddim breathe — skank creeps back in" arc).
 * On dispose, releases all remaining mutes.
 *
 * Uses the same classifySongRoles() call AutoDub uses (cached on the pattern
 * set, O(1) on repeated calls). User dubRole overrides in the mixer are
 * respected. If no role data is available (no patterns loaded), fires as a
 * graceful no-op — no channels muted.
 */

import type { DubMove } from './_types';
import { useMixerStore } from '@/stores/useMixerStore';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useInstrumentStore } from '@/stores/useInstrumentStore';
import { classifySongRoles } from '@/bridge/analysis/ChannelNaming';
import { fire } from '../DubRouter';
import type { InstrumentConfig } from '@/types/instrument';
import type { ChannelRole } from '@/bridge/analysis/MusicAnalysis';

const MELODIC_ROLES = new Set<ChannelRole>(['lead', 'chord', 'arpeggio', 'pad', 'skank']);
const SKANK_ROLES = new Set<ChannelRole>(['chord', 'skank']);

export const riddimSection: DubMove = {
  id: 'riddimSection',
  kind: 'hold',
  defaults: {},

  execute(ctx) {
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
    const channels = mixer.channels;
    const muted: number[] = [];
    let skankIdx: number | null = null;

    for (let i = 0; i < channels.length; i++) {
      const ch = channels[i];
      if (!ch) continue;
      const effectiveRole: ChannelRole = (ch.dubRole as ChannelRole | null) ?? roles[i] ?? 'empty';
      if (!MELODIC_ROLES.has(effectiveRole)) continue;
      if (!(ch.muted ?? false)) {
        mixer.setChannelMute(i, true);
        muted.push(i);
        // Pick the first skank/chord channel for the delayed echo return
        if (skankIdx === null && SKANK_ROLES.has(effectiveRole)) {
          skankIdx = i;
        }
      }
    }

    if (muted.length === 0) {
      return { dispose() {} };
    }

    // Schedule skank return at 60% of the hold duration
    // barMs = one bar in ms. holdBars comes from persona config via adaptedParams.
    const bpm = ctx.bpm || 120;
    const barMs = (60000 / bpm) * 4;
    const holdBars = (typeof ctx.params?.holdBars === 'number') ? ctx.params.holdBars : 4;
    const skankReturnMs = barMs * holdBars * 0.6; // 60% of hold duration

    let skankTimer: ReturnType<typeof setTimeout> | null = null;

    if (skankIdx !== null) {
      const ch = skankIdx;
      skankTimer = setTimeout(() => {
        try {
          useMixerStore.getState().setChannelMute(ch, false);
          // Pull ch back out of muted so dispose() doesn't double-unmute it
          const pos = muted.indexOf(ch);
          if (pos !== -1) muted.splice(pos, 1);
          fire('echoThrow', ch, { intensity: 0.85 }, 'live');
        } catch { /* ok */ }
        skankTimer = null;
      }, skankReturnMs);
    }

    return {
      dispose() {
        if (skankTimer !== null) {
          clearTimeout(skankTimer);
          skankTimer = null;
        }
        const m = useMixerStore.getState();
        for (const i of muted) {
          try { m.setChannelMute(i, false); } catch { /* ok */ }
        }
      },
    };
  },
};
