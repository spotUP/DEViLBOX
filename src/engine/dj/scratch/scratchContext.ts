/**
 * Scratch performance context (owner plan section 5, 6; ledger SCR-P4.1): the
 * bridge between the Auto DJ's analysis and the scratch brain. Everything
 * here is READ from `DJPerformanceContext` / `DJTrackAnalysis` - beat grid,
 * downbeats, phrases, sections, activity timelines - never measured again
 * (section 6: no second analysis).
 */

import { barIndexAt, fractionalBeatAt, timelineAt } from '../autodj/beatGrid';
import type { DJPerformanceContext, DJPhrase, DJSection, DJTrackAnalysis, SectionKind, TransitionStyle } from '../autodj/types';
import type { ScratchSection } from './scratchPlacement';
import type { ScratchDJStyle } from './scratchTypes';

export interface ScratchPerformanceContext {
  /** Fractional beat index on the master deck's grid. */
  masterBeat: number;
  /** Bar index (0-based) containing the position. */
  masterBar: number;
  /** 0..1 position of the bar inside its phrase (bar-in-phrase / phrase length). */
  phrasePosition: number;
  /** Bar-in-phrase and the phrase length in bars, for the planner's phrase-end logic. */
  barInPhrase: number;
  phraseBars: number;

  bpm: number;
  meter: number;
  beatConfidence: number;
  phraseConfidence: number;

  section: DJSection | undefined;
  nextSection?: DJSection;
  /** The reference section name the placement brain speaks. */
  sectionName: ScratchSection;

  /** Perceived intensity of the track at the position (0..1); the section's mean when the timeline is empty. */
  energy: number;
  targetEnergy: number;

  activeDeck: 'A' | 'B' | 'BOTH';
  outgoingDeck?: 'A' | 'B';
  incomingDeck?: 'A' | 'B';

  vocalActivity: number;
  drumActivity: number;
  bassActivity: number;
  melodicActivity: number;

  transitionType?: TransitionStyle;
  juggleIntensity: number;
  transitionIntensity: number;

  scratchPermission: number;
  scratchIntensity: number;

  recentGestures: string[];
  recentSources: string[];
  recentRoutines: string[];

  style: ScratchDJStyle;
}

export interface ScratchContextInput {
  perf: DJPerformanceContext;
  style: ScratchDJStyle;
  /** Position in seconds on the master deck; `perf.currentPosition` when omitted. */
  position?: number;
  juggleIntensity?: number;
  transitionIntensity?: number;
  /** P7.11: how much scratching the Auto DJ allows now (0..1). */
  scratchPermission?: number;
  scratchIntensity?: number;
  memory?: { recentGestures?: readonly string[]; recentSources?: readonly string[]; recentRoutines?: readonly string[] };
}

/** Auto DJ section kinds -> the reference section names the placement tables are written in. */
export const SECTION_OF_KIND: Readonly<Record<SectionKind, ScratchSection>> = {
  intro: 'intro', groove: 'A', verse: 'verse', build: 'call', 'pre-drop': 'response', drop: 'break', chorus: 'hook',
  breakdown: 'breakdown', bridge: 'bridge', outro: 'outro', silence: 'verse', fill: 'call', instrumental: 'instrumental',
  'vocal-heavy': 'verse', 'drum-only': 'dj_break', 'bass-only': 'A',
};

export const scratchSectionFor = (kind: SectionKind | undefined): ScratchSection => (kind ? SECTION_OF_KIND[kind] : undefined) ?? 'A';

function phraseAtBar(track: DJTrackAnalysis, bar: number): DJPhrase | undefined {
  return track.phrases.find((p) => bar >= p.startBar && bar < p.startBar + p.lengthBars);
}

function sectionAtBar(track: DJTrackAnalysis, bar: number): DJSection | undefined {
  return track.sections.find((s) => bar >= s.startBar && bar < s.endBar);
}

/** The scratch context at a position of the master deck, from the Auto DJ's own analysis. */
export function buildScratchContext(input: ScratchContextInput): ScratchPerformanceContext | null {
  const { perf } = input;
  const track = perf.currentTrack;
  if (!track) return null;
  const t = input.position ?? perf.currentPosition;
  const masterBar = barIndexAt(track.downbeats, t);
  const phrase = phraseAtBar(track, masterBar) ?? perf.currentPhrase;
  const phraseBars = phrase?.lengthBars ?? track.phraseLengthBars ?? 4;
  const barInPhrase = phrase ? Math.max(0, masterBar - phrase.startBar) : masterBar % phraseBars;
  const section = sectionAtBar(track, masterBar) ?? perf.currentSection;
  const nextSection = section ? track.sections[track.sections.indexOf(section) + 1] : undefined;
  const at = (tl: { values: number[]; hopSec: number }): number => timelineAt(tl.values, tl.hopSec, t);
  const intensity = track.intensity.values.length ? at(track.intensity) : (section?.energy ?? perf.setEnergy);
  const transition = perf.transition;
  return {
    masterBeat: fractionalBeatAt(track.beatGrid, t),
    masterBar,
    phrasePosition: barInPhrase / Math.max(1, phraseBars),
    barInPhrase,
    phraseBars,
    bpm: track.bpm,
    meter: track.meter.beatsPerBar,
    beatConfidence: track.beatGrid.confidence,
    phraseConfidence: phrase?.confidence ?? 0,
    section,
    nextSection,
    sectionName: scratchSectionFor(section?.kind),
    energy: intensity,
    targetEnergy: perf.targetEnergy,
    activeDeck: transition ? 'BOTH' : perf.currentDeck,
    outgoingDeck: transition?.outgoingDeck,
    incomingDeck: transition?.incomingDeck ?? perf.incomingDeck,
    vocalActivity: at(track.vocalActivity),
    drumActivity: at(track.drumActivity),
    bassActivity: at(track.bassActivity),
    melodicActivity: at(track.harmonicActivity),
    transitionType: transition?.style,
    juggleIntensity: input.juggleIntensity ?? 0,
    transitionIntensity: input.transitionIntensity ?? 0,
    scratchPermission: input.scratchPermission ?? 1,
    scratchIntensity: input.scratchIntensity ?? 0,
    recentGestures: [...(input.memory?.recentGestures ?? [])],
    recentSources: [...(input.memory?.recentSources ?? [])],
    recentRoutines: [...(input.memory?.recentRoutines ?? [])],
    style: input.style,
  };
}
