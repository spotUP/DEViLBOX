/**
 * Song-only channel role resolution (no stores): a leaf so the Auto DJ's
 * mix analysis can use it without importing the editor stores
 * (songChannelIdentity re-exports it).
 */
import type { ChannelRole } from '@/bridge/analysis/MusicAnalysis';
import { classifySongRoles, classifyInstrument } from '@/bridge/analysis/ChannelNaming';
import { mergeOfflineAndRuntimeRoles, type RuntimeRoleHint } from '@/bridge/analysis/ChannelAudioClassifier';
import type { InstrumentType } from '@/bridge/analysis/AudioSetInstrumentMap';
import { buildSongRoleTimeline, getRolesAtPosition, type SongRoleTimeline } from '@/bridge/analysis/SongRoleTimeline';
import type { Pattern } from '@/types/tracker';
import type { InstrumentConfig } from '@/types/instrument/defaults';

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
