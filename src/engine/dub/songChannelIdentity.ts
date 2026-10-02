/**
 * What each channel of the loaded song IS — one answer for the whole app.
 *
 * The deck labels its channel strips from Auto Dub's merged roles, while the
 * moves (Version Drop, Bass Emphasis, targeting) built their own profiles from
 * the CURRENT pattern's notes alone. On a song whose current pattern carries
 * no evidence — a Hively/libopenmpt song never advances currentPatternIndex —
 * the deck said lead/chords/skank and Version Drop said "every channel reads
 * as riddim" (2026-10-02). Both now read this.
 */
import { useTransportStore } from '@/stores/useTransportStore';
import { useMixerStore } from '@/stores/useMixerStore';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useInstrumentStore } from '@/stores/useInstrumentStore';
import { useInstrumentTypeStore } from '@/stores/useInstrumentTypeStore';
import { useChannelTypeStore } from '@/stores/useChannelTypeStore';
import type { ChannelRole } from '@/bridge/analysis/MusicAnalysis';
import { classifySongRoles } from '@/bridge/analysis/ChannelNaming';
import { getAllRuntimeChannelRoles, mergeOfflineAndRuntimeRoles } from '@/bridge/analysis/ChannelAudioClassifier';
import { buildSongRoleTimeline, getRolesAtPosition, type SongRoleTimeline } from '@/bridge/analysis/SongRoleTimeline';
import { resolveChannelNames } from '@/lib/tracker/channelNames';
import type { Pattern } from '@/types/tracker';
import type { InstrumentConfig } from '@/types/instrument/defaults';

export interface SongChannelIdentity {
  /** Role per channel: the performer's own role where set, else the merged verdict. */
  roles: ChannelRole[];
  /** The pattern the verdicts describe: the song's richest, not the current one. */
  pattern: Pattern | null;
  /** Channel names as the deck shows them. */
  names: (string | null | undefined)[];
  currentRow: number;
}

// ── CED song role timeline cache ─────────────────────────────────────────────
// Rebuilt whenever the instrument type map changes (new CED results arrive).
// Keyed by the patterns array reference + instrumentTypes map size to detect
// both song changes and progressive CED result updates.
let _cedTimeline: SongRoleTimeline | null = null;
let _cedTimelinePatternRef: Pattern[] | null = null;
let _cedTimelineResultCount = -1;

function getCedTimeline(patterns: Pattern[], patternOrder: number[]): SongRoleTimeline | null {
  const store = useInstrumentTypeStore.getState();
  const resultCount = store.results.size;
  if (resultCount === 0) return null;
  // Rebuild when patterns change or new CED results arrive
  if (
    _cedTimeline === null ||
    _cedTimelinePatternRef !== patterns ||
    _cedTimelineResultCount !== resultCount
  ) {
    const typeMap = new Map<number, import('@/bridge/analysis/AudioSetInstrumentMap').InstrumentType>();
    const confidenceMap = new Map<number, number>();
    const MIN_CED_CONFIDENCE = 0.15;
    for (const [id, r] of store.results) {
      if (r.instrumentType !== 'unknown' && r.confidence >= MIN_CED_CONFIDENCE) {
        typeMap.set(id, r.instrumentType);
        confidenceMap.set(id, r.confidence);
      }
    }
    _cedTimeline = buildSongRoleTimeline(patterns, patternOrder, typeMap, confidenceMap);
    _cedTimelinePatternRef = patterns;
    _cedTimelineResultCount = resultCount;
  }
  return _cedTimeline;
}

/** Resolve the currently-playing pattern's channel roles + the pattern
 *  itself (used by the look-ahead / density helpers) + the channel-name
 *  array (for user-rename boost). Returns a neutral bundle when no song
 *  is loaded — callers fall through to the Phase-1 behaviour.
 *
 *  Roles come from a three-stage pipeline:
 *    1. `classifySongRoles` — offline: picks the richest pattern per channel
 *       and classifies via note-stats + instrument metadata + sample FFT.
 *       Handles the 2026-04-21 bug where libopenmpt-driven MODs left
 *       currentPatternIndex on a near-empty intro, collapsing every role
 *       to `empty`.
 *    2. `getAllRuntimeChannelRoles` — runtime: reads the live audio tap
 *       from useOscilloscopeStore (which the WASM per-channel isolation
 *       already feeds) and classifies by sustained spectral features.
 *    3. `mergeOfflineAndRuntimeRoles` — promotes offline=`empty|pad`
 *       channels to `bass|percussion|lead` when runtime strongly disagrees.
 *       Keeps strong offline roles intact so runtime doesn't override a
 *       correctly-detected bass/perc with a transient misread. */
export function readSongChannelIdentity(): SongChannelIdentity {
  const empty = { roles: [] as ChannelRole[], pattern: null, names: [], currentRow: 0 };
  try {
    const tracker = useTrackerStore.getState();
    const patterns = tracker.patterns;
    if (!Array.isArray(patterns) || patterns.length === 0) return empty;
    const transport = useTransportStore.getState();

    // Use the richest pattern (max total notes across all channels) for the
    // look-ahead. libopenmpt engines never update transport.currentPatternIndex
    // so it stays at 0 even mid-song, meaning pattern 0 (often a sparse intro)
    // would cause channelHasNoteInWindow to return false for every channel and
    // silently skip all role-targeted rules (channelMute, echoThrow, snareCrack).
    // The richest pattern is the best proxy for "does this channel play notes
    // in this song at all" — which is the only question the look-ahead answers.
    let richestPattern = patterns[0];
    let richestTotal = 0;
    for (const pat of patterns) {
      if (!pat?.channels) continue;
      let total = 0;
      for (const ch of pat.channels) {
        if (!ch?.rows) continue;
        for (const cell of ch.rows) if (cell && cell.note >= 1 && cell.note <= 96) total++;
      }
      if (total > richestTotal) { richestTotal = total; richestPattern = pat; }
    }
    const pattern = richestPattern;
    if (!pattern || !pattern.channels?.length) return empty;

    const insts = useInstrumentStore.getState().instruments;
    const lookup = new Map<number, InstrumentConfig>();
    for (const inst of insts) {
      if (inst && typeof inst.id === 'number') lookup.set(inst.id, inst);
    }

    // Trigger CED instrument classification in the background (no-op if already running).
    useInstrumentTypeStore.getState().classifyInstruments(insts);

    const offlineRoles = classifySongRoles(patterns, lookup, useTrackerStore.getState().patternOrder);
    const runtimeHints = getAllRuntimeChannelRoles(offlineRoles.length);
    let mergedRoles = mergeOfflineAndRuntimeRoles(offlineRoles, runtimeHints);

    // Overlay CED timeline roles where available. CED knows the CURRENT
    // instrument at each song position, so it tracks mid-song instrument
    // switches that static classifySongRoles misses.
    const patternOrder: number[] = tracker.patternOrder ?? [];
    const positionIndex: number = tracker.currentPositionIndex ?? 0;
    const currentRow = transport.currentRow ?? 0;
    const cedTimeline = getCedTimeline(patterns, patternOrder);
    if (cedTimeline) {
      // Only override roles where CED had at least 0.3 confidence at that position.
      const cedRoles = getRolesAtPosition(cedTimeline, positionIndex, currentRow, 0.3);
      mergedRoles = mergedRoles.map((r, ch) => cedRoles[ch] ?? r);
    }

    // Overlay live channel CED results (from CedChannelAccumulator / SidVoiceClassifier).
    // These have higher priority because they reflect what's actually playing NOW,
    // not a static instrument-level snapshot. Only override when we have a result.
    const channelCedRoles = useChannelTypeStore.getState().getRolesSnapshot(mergedRoles.length);
    mergedRoles = mergedRoles.map((r, ch) => channelCedRoles[ch] ?? r);

    // Names come from the first pattern — channel names are global per the
    // tracker store's updateChannelName (same name across all patterns).
    // The performer's own role wins, and the names are the ones the deck
    // shows (mixer names over the tracker's), so every reader of this agrees
    // with the labels on the channel strips.
    const mixerChannels = useMixerStore.getState().channels;
    const roles = mergedRoles.map((r, ch) => (mixerChannels[ch]?.dubRole as ChannelRole | null | undefined) ?? r);
    const names = resolveChannelNames(
      mixerChannels.map(c => c?.name ?? null),
      pattern.channels.map(c => c?.name ?? null),
    );
    return { roles, pattern, names, currentRow };
  } catch {
    return empty;
  }
}
