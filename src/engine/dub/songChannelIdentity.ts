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
import { classifySongRoles, classifyInstrument } from '@/bridge/analysis/ChannelNaming';
import { getAllRuntimeChannelRoles, mergeOfflineAndRuntimeRoles, type RuntimeRoleHint } from '@/bridge/analysis/ChannelAudioClassifier';
import type { InstrumentType } from '@/bridge/analysis/AudioSetInstrumentMap';
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
/**
 * Channel roles for a given song (not the editor's): the Auto DJ reads a
 * deck's module through this (plan sections 25-27); the editor path below
 * adds its live sources (runtime audio evidence, CED, performer-set roles).
 *
 * Roles merge the way the Dub Deck's do: the song-wide instrument-aware
 * classifier (ChannelNaming.classifySongRoles), promoted by runtime audio
 * hints where given, overridden over time by the role timeline (instrument
 * types per position), then by explicit per-channel roles.
 */
export interface SongChannelRolesInput {
  patterns: Pattern[];
  patternOrder: number[];
  instruments: InstrumentConfig[];
  runtimeHints?: ReadonlyArray<RuntimeRoleHint | null>;
  /** A CED/instrument-type timeline; when omitted one is built from the instruments' own classification. */
  timeline?: SongRoleTimeline | null;
  explicitRoles?: ReadonlyArray<ChannelRole | null | undefined>;
}

export interface SongChannelRoles {
  /** Song-wide role per channel (after every merge, at position 0). */
  roles: ChannelRole[];
  /** Roles over time; `getRolesAtPosition(timeline, pos, row)` for a position. */
  timeline: SongRoleTimeline | null;
  /** Roles before the timeline and explicit overrides: the per-song baseline. */
  baseRoles: ChannelRole[];
}

/** Instrument type from the instrument's own classification (name, drum type, sample spectrum), for songs the CED has not seen. */
function instrumentTypesFromConfigs(instruments: InstrumentConfig[]): { types: Map<number, InstrumentType>; confidences: Map<number, number> } {
  const types = new Map<number, InstrumentType>();
  const confidences = new Map<number, number>();
  for (const inst of instruments) {
    if (!inst || typeof inst.id !== 'number') continue;
    const c = classifyInstrument(inst);
    const type: InstrumentType | null = c.role === 'percussion'
      ? (c.subrole === 'kick' ? 'kick' : c.subrole === 'snare' ? 'snare' : c.subrole === 'hat' ? 'hihat' : 'percussion')
      : c.role === 'bass' ? 'bass' : c.role === 'pad' ? 'pad' : c.role === 'lead' ? 'synthesizer'
      : c.role === 'chord' || c.role === 'arpeggio' || c.role === 'skank' ? 'keyboard' : null;
    if (type && c.confidence > 0) { types.set(inst.id, type); confidences.set(inst.id, c.confidence); }
  }
  return { types, confidences };
}

export function resolveSongChannelRoles(input: SongChannelRolesInput): SongChannelRoles {
  const { patterns, patternOrder } = input;
  if (!Array.isArray(patterns) || patterns.length === 0) return { roles: [], timeline: null, baseRoles: [] };
  const lookup = new Map<number, InstrumentConfig>();
  for (const inst of input.instruments) if (inst && typeof inst.id === 'number') lookup.set(inst.id, inst);
  const offlineRoles = classifySongRoles(patterns, lookup, patternOrder);
  const baseRoles = input.runtimeHints ? mergeOfflineAndRuntimeRoles(offlineRoles, input.runtimeHints) : offlineRoles.slice();
  let timeline = input.timeline ?? null;
  if (timeline === null && input.timeline === undefined) {
    const { types, confidences } = instrumentTypesFromConfigs(input.instruments);
    timeline = types.size > 0 ? buildSongRoleTimeline(patterns, patternOrder, types, confidences) : null;
  }
  let roles = baseRoles.slice();
  if (timeline) {
    const atStart = getRolesAtPosition(timeline, 0, 0, 0.3);
    roles = roles.map((r, ch) => atStart[ch] ?? r);
  }
  if (input.explicitRoles) roles = roles.map((r, ch) => input.explicitRoles![ch] ?? r);
  return { roles, timeline, baseRoles };
}

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

    // Trigger CED instrument classification in the background (no-op if already running).
    useInstrumentTypeStore.getState().classifyInstruments(insts);

    const patternOrder: number[] = tracker.patternOrder ?? [];
    const positionIndex: number = tracker.currentPositionIndex ?? 0;
    const currentRow = transport.currentRow ?? 0;
    const cedTimeline = getCedTimeline(patterns, patternOrder);
    // The same resolution the Auto DJ uses for a deck's song (song-wide
    // instrument-aware roles promoted by runtime audio evidence), with the
    // editor's live overlays added below.
    const resolved = resolveSongChannelRoles({
      patterns, patternOrder, instruments: insts,
      runtimeHints: getAllRuntimeChannelRoles(pattern.channels.length),
      timeline: cedTimeline,
    });
    let mergedRoles = resolved.baseRoles;

    // Overlay CED timeline roles where available. CED knows the CURRENT
    // instrument at each song position, so it tracks mid-song instrument
    // switches that static classifySongRoles misses.
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
