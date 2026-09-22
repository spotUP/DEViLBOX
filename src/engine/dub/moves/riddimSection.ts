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
import { msUntilMusicalReturn } from '@/lib/dub/musicalReturn';
import { useInstrumentStore } from '@/stores/useInstrumentStore';
import { classifySongRoles } from '@/bridge/analysis/ChannelNaming';
import { fire } from '../DubRouter';
import type { InstrumentConfig } from '@/types/instrument';
import type { ChannelRole } from '@/bridge/analysis/MusicAnalysis';
import { riddimChannelToKeep, medianNoteOf, type RiddimChannelPitch } from '@/lib/dub/riddimKeep';

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

    // Work out the mute candidates first, so the bass can be spared before a
    // single channel is touched.
    const candidateRoles: ChannelRole[] = [];
    const candidates: RiddimChannelPitch[] = [];
    let bassSurvives = false;
    for (let i = 0; i < channels.length; i++) {
      const ch = channels[i];
      if (!ch) { candidateRoles[i] = 'empty'; continue; }
      const role: ChannelRole = (ch.dubRole as ChannelRole | null) ?? roles[i] ?? 'empty';
      candidateRoles[i] = role;
      if (role === 'bass') { bassSurvives = true; continue; }
      if (!MELODIC_ROLES.has(role)) continue;
      // Median register of everything this channel plays across the song.
      const notes: number[] = [];
      for (const pattern of patterns) {
        const rows = pattern?.channels?.[i]?.rows;
        if (!rows) continue;
        for (const row of rows) if (row?.note) notes.push(row.note);
      }
      candidates.push({ channelIndex: i, medianNote: medianNoteOf(notes) });
    }

    // A riddim is drums AND bass. When role detection found no bass anywhere —
    // measured on `world class dub.mod`, which reads pad/percussion/pad/
    // percussion while channel 0 IS the bassline — spare the lowest-register
    // candidate rather than muting the bottom out of the song. Reported as
    // "i only heard drums no bass".
    const keepIndex = riddimChannelToKeep(candidates, bassSurvives);

    for (let i = 0; i < channels.length; i++) {
      const ch = channels[i];
      if (!ch) continue;
      const effectiveRole: ChannelRole = candidateRoles[i] ?? 'empty';
      if (!MELODIC_ROLES.has(effectiveRole)) continue;
      if (i === keepIndex) continue;
      // Borrowed, not set: the release hands the channel back to the user's
      // own mute state, and nested moves each close their own transient.
      beginDubTransient(i);
      setDubTransient(i, { muted: true });
      muted.push(i);
      // Pick the first skank/chord channel for the delayed echo return
      if (skankIdx === null && SKANK_ROLES.has(effectiveRole)) {
        skankIdx = i;
      }
    }

    if (muted.length === 0) {
      return { dispose() {} };
    }

    // Gate L1: the skank comes back on a MUSICAL boundary, not at 60% of the
    // hold. Sixty percent of four bars at 143 BPM is 4.03 s — the middle of a
    // bar, and wrong by an amount that changes with tempo. The mix returning
    // mid-bar is the difference between a move and a mistake.
    const bpm = ctx.bpm || 120;
    const barMs = (60000 / bpm) * 4;
    const holdBars = (typeof ctx.params?.holdBars === 'number') ? ctx.params.holdBars : 4;
    const transport = useTransportStore.getState();
    // `currentGlobalRow` only moves when the PATTERN changes, so alone it is
    // stale by up to a whole pattern — and this row decides WHEN the skank
    // comes back. Off by that much, the return lands nowhere near the musical
    // boundary it was aiming for. Same join the performer's clock uses.
    const row = resolveTransportRow(transport.currentGlobalRow, transport.currentRow) ?? 0;
    // The intention behind the return: bringing one part back inside a section
    // that is still held is a SPACE gesture, so it resolves on the next bar.
    // The ceiling keeps it inside the section it belongs to.
    const { ms: skankReturnMs } = msUntilMusicalReturn(
      row,
      transport.speed || 6,
      bpm,
      'SPACE',
      barMs * holdBars * 0.75,
    );

    let skankTimer: ReturnType<typeof setTimeout> | null = null;

    if (skankIdx !== null) {
      const ch = skankIdx;
      skankTimer = setTimeout(() => {
        try {
          // Skank comes back early — close ITS transient, not the whole move's.
          endDubTransient(ch);
          // Pull ch back out of muted so dispose() doesn't double-release it
          const pos = muted.indexOf(ch);
          if (pos !== -1) muted.splice(pos, 1);
          fire('echoThrow', ch, { intensity: 0.85 }, 'live');
        } catch { /* ok */ }
        skankTimer = null;
      }, skankReturnMs);
    }

    let released = false;
    return {
      dispose() {
        if (released) return;
        released = true;
        if (skankTimer !== null) {
          clearTimeout(skankTimer);
          skankTimer = null;
        }
        for (const i of muted) {
          try { endDubTransient(i); } catch { /* ok */ }
        }
      },
    };
  },
};
