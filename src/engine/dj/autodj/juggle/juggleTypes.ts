/**
 * Beat-juggling domain model (juggling plan sections 3-8, 13, 23, 29, 44-46,
 * 52). Explicit types above the deck/mixer primitives; the intelligence lives
 * in the juggle planner, the actions stay a small vocabulary.
 */
import type { DJSection, DJTrackAnalysis, SetEnergyPhase } from '../types';

export type JuggleDeckRole = 'PRIMARY' | 'SECONDARY' | 'VOICE' | 'RESPONSE' | 'FOUNDATION' | 'FILL' | 'LAYER' | 'SILENT';

export const JUGGLE_DECK_ROLES: readonly JuggleDeckRole[] = ['PRIMARY', 'SECONDARY', 'VOICE', 'RESPONSE', 'FOUNDATION', 'FILL', 'LAYER', 'SILENT'];

export type JuggleMode = 'OFF' | 'SAFE' | 'MUSICAL' | 'PERFORMER' | 'AGGRESSIVE' | 'CHAOS';

export const JUGGLE_MODES: readonly JuggleMode[] = ['OFF', 'SAFE', 'MUSICAL', 'PERFORMER', 'AGGRESSIVE', 'CHAOS'];

/** The stored Auto Juggle setting as a mode: anything unknown is OFF. */
export function juggleModeOf(value: string | null | undefined): JuggleMode {
  return (JUGGLE_MODES as readonly string[]).includes(value ?? '') ? (value as JuggleMode) : 'OFF';
}

export type JugglePhase = 'SETUP' | 'ESTABLISH' | 'INTENSIFY' | 'PEAK' | 'PAYOFF' | 'RELEASE';

export const JUGGLE_PHASES: readonly JugglePhase[] = ['SETUP', 'ESTABLISH', 'INTENSIFY', 'PEAK', 'PAYOFF', 'RELEASE'];

export type DJJuggleActionType =
  | 'CutIn' | 'CutOut' | 'TriggerCue' | 'JumpToBeat' | 'JumpToBar'
  | 'StartLoop' | 'ExitLoop' | 'LoopResize' | 'LoopRoll' | 'HoldDeck' | 'ReleaseDeck'
  | 'FilterIn' | 'FilterOut' | 'EQCut' | 'EQRestore' | 'BassSwap' | 'EchoThrow' | 'ReverbThrow'
  | 'ResetDeck' | 'ResyncDeck'
  /** Lock a deck to the other deck's bars before it is heard (owner plan section 16): a bend, or one re-cue while silent. */
  | 'PhaseLock';

export const JUGGLE_ACTION_TYPES: readonly DJJuggleActionType[] = [
  'CutIn', 'CutOut', 'TriggerCue', 'JumpToBeat', 'JumpToBar', 'StartLoop', 'ExitLoop',
  'LoopResize', 'LoopRoll', 'HoldDeck', 'ReleaseDeck', 'FilterIn', 'FilterOut', 'EQCut', 'EQRestore', 'BassSwap',
  'EchoThrow', 'ReverbThrow', 'ResetDeck', 'ResyncDeck', 'PhaseLock',
];

export type JuggleQuantization = 'beat' | 'halfBeat' | 'bar' | 'phrase';

export interface DJJuggleAction {
  type: DJJuggleActionType;
  deck: 'A' | 'B' | 'BOTH';
  /** Beats from the pattern start (the pattern is placed on an absolute master beat by the executor). */
  executeAtBeat: number;
  durationBeats?: number;
  /** Seconds on the deck (loops, cues, jumps). */
  targetPosition?: number;
  /** Loop length in beats (StartLoop/LoopResize) or jump size in beats. */
  beats?: number;
  quantization?: JuggleQuantization;
  strength?: number;
  reason?: string;
  phase?: JugglePhase;
  /**
   * Fire only when this deck's heard bar phase is verified against the other
   * deck's (owner plan section 16: align, verify, then permit); out of
   * tolerance the action is skipped and what plays holds.
   */
  verifyPhaseOf?: 'A' | 'B';
}

export type DJJugglePatternType =
  | 'phraseTrade' | 'tightPhraseTrade' | 'barTrade' | 'beatTrade' | 'doubleBeat' | 'callResponse' | 'drumBassTrade'
  | 'fillTrade' | 'loopTighten' | 'double' | 'transformer' | 'dropAndReturn' | 'escalatingJuggle'
  /** The juggle transition's ladder (juggling plan section 26): run by the transition executor, never chosen by the planner. */
  | 'transitionLadder';

/** The library the juggle planner chooses from: every pattern but the transition ladder. */
export type LibraryPatternType = Exclude<DJJugglePatternType, 'transitionLadder'>;

export const JUGGLE_PATTERN_TYPES: readonly LibraryPatternType[] = [
  'phraseTrade', 'tightPhraseTrade', 'barTrade', 'beatTrade', 'doubleBeat', 'callResponse', 'drumBassTrade', 'fillTrade',
  'loopTighten', 'double', 'transformer', 'dropAndReturn', 'escalatingJuggle',
];

export type EnergyProfile = 'BUILD' | 'FLAT' | 'PEAK' | 'RELEASE';

export interface DJJugglePattern {
  id: string;
  type: DJJugglePatternType;
  durationBars: number;
  intensity: number;
  actions: DJJuggleAction[];
  sourceDeck?: 'A' | 'B' | 'BOTH';
  targetDeck?: 'A' | 'B' | 'BOTH';
  energyProfile: EnergyProfile;
  confidence: number;
  reason: string;
  /** The grammar: which beats belong to which phase (SETUP -> RELEASE). */
  phases: Array<{ phase: JugglePhase; startBeat: number; endBeat: number }>;
  /** Human-readable trading sequence, e.g. "A B A B". */
  sequence: string;
  /** Needs the same track on both decks. */
  requiresDouble?: boolean;
  /** The roles each deck plays over the pattern. */
  roles: Array<{ beat: number; A: JuggleDeckRole; B: JuggleDeckRole }>;
  /** A transition ladder's rungs in bars (memory: the next ladder varies the shape, owner plan section 29). */
  ladderBars?: number[];
}

export type MaterialClass =
  | 'DRUM_FILL' | 'BASS_HIT' | 'VOCAL_HIT' | 'LEAD_HIT' | 'PERCUSSION_HIT' | 'FULL_GROOVE' | 'BREAK' | 'DROP' | 'BUILD' | 'SILENCE';

export const MATERIAL_CLASSES: readonly MaterialClass[] = [
  'DRUM_FILL', 'BASS_HIT', 'VOCAL_HIT', 'LEAD_HIT', 'PERCUSSION_HIT', 'FULL_GROOVE', 'BREAK', 'DROP', 'BUILD', 'SILENCE',
];

export interface MaterialWindow {
  deck: 'A' | 'B';
  startSec: number;
  endSec: number;
  startBar: number;
  bars: number;
  drums: number;
  bass: number;
  percussionDensity: number;
  melodic: number;
  vocal: number;
  harmonic: number;
  spectralDensity: number;
  energy: number;
  rhythmicDensity: number;
  importance: number;
  confidence: number;
  classes: MaterialClass[];
  primary: MaterialClass;
  /** 'tracker' when the module's own events/roles produced the class. */
  source: 'audio' | 'tracker';
  reason: string;
}

export interface DJDeckPerformanceState {
  deck: 'A' | 'B';
  trackId: string;
  position: number;
  beatPhase: number;
  barPhase: number;
  /** Absolute beat index on the deck's own grid. */
  beatIndex: number;
  bpm: number;
  /** The key heard at `position`: the local key (keyAt), shifted by the deck's varispeed. */
  key?: string;
  /** Confidence of `key` (the local segment's when one is used). */
  keyConfidence: number;
  section?: DJSection;
  cuePosition?: number;
  mixInPosition?: number;
  mixOutPosition?: number;
  energy: number;
  drumsActive: boolean;
  bassActive: boolean;
  vocalsActive: boolean;
  melodicActivity: number;
  loop?: { startSec: number; endSec: number; lengthBeats: number } | null;
  analysisConfidence: number;
  playing: boolean;
  analysis: DJTrackAnalysis | null;
}

export type DJPerformanceMode = 'NORMAL_MIX' | 'JUGGLE' | 'JUGGLE_TRANSITION' | 'PERFORMANCE_TRANSITION';

export interface DJJuggleHistory {
  patternType: DJJugglePatternType;
  durationBars: number;
  intensity: number;
  sourceTracks: string[];
  successScore: number;
  timestamp: number;
  sequence: string;
  sectionKind?: string;
  setPhase?: SetEnergyPhase;
  energy?: number;
  /** A transition ladder's rungs in bars. */
  ladderBars?: number[];
  /** Every crossfader move of the performance, as it played (JUGGLE-LAST-CUT-LATE): the evidence of a live report. */
  cuts?: JuggleCutTiming[];
}

/**
 * One crossfader move of a juggle: where the pattern planned it, where the executor fired it (beats from
 * the pattern start, on the pattern's own clock), and the error in ms (positive = late). Null = not fired
 * (blocked or skipped, with the reason).
 */
export interface JuggleCutTiming {
  type: 'CutIn' | 'CutOut' | 'HoldDeck' | 'ReleaseDeck';
  deck: 'A' | 'B' | 'BOTH';
  plannedBeat: number;
  executedBeat: number | null;
  errorMs: number | null;
  status: 'executed' | 'blocked' | 'skipped';
  reason?: string;
}

export interface DJJugglePerformanceContext {
  masterDeck: 'A' | 'B';
  masterBeat: number;
  masterBar: number;
  phrasePosition: number;
  phraseLengthBars: number;
  beatsPerBar: number;
  deckA: DJDeckPerformanceState;
  deckB: DJDeckPerformanceState;
  activeDeck: 'A' | 'B' | 'BOTH';
  performanceMode: DJPerformanceMode;
  energy: number;
  targetEnergy: number;
  setPhase: SetEnergyPhase;
  phraseConfidence: number;
  beatConfidence: number;
  sectionConfidence: number;
  deckSyncConfidence: number;
  materialConfidence: number;
  currentSection?: DJSection;
  nextSection?: DJSection;
  lastJuggle?: DJJuggleHistory;
  recentPatterns: DJJuggleHistory[];
  intensity: number;
  tension: number;
  fallbackAvailable: boolean;
  sameTrackOnBothDecks: boolean;
  transitionApproachingSec: number | null;
  elapsedSec: number;
  juggledSec: number;
  secondsSinceLastJuggle: number;
}

export interface JuggleQualityScore {
  timing: number;
  compatibility: number;
  energyFit: number;
  material: number;
  bassClarity: number;
  vocalClarity: number;
  coherence: number;
  novelty: number;
  impact: number;
  safety: number;
  overall: number;
}

export type JuggleEventKind =
  | 'juggleStarted' | 'jugglePatternSelected' | 'juggleActionScheduled' | 'juggleActionExecuted' | 'juggleActionBlocked'
  | 'juggleAborted' | 'juggleCompleted' | 'juggleFallback';

export interface JuggleCandidate {
  type: DJJugglePatternType;
  score: number;
  components: Record<string, number>;
  reasons: string[];
  blocked: string[];
}

/** What makes Auto DJ set up a stand-alone juggle (plan 2026-10-11-dj-juggling, P4.1); `request` is the user's Juggle Now (owner decision 2026-10-12). */
export type JuggleTrigger = 'break' | 'build' | 'phraseEnd' | 'energy' | 'request';
/** The idle deck's material for a stand-alone juggle: a double of the playing track, or the pre-rendered next track. */
export type StandaloneSource = 'double' | 'next';

/** Auto DJ's stand-alone juggle as the telemetry shows it (P4.5). */
export interface StandaloneTelemetry {
  trigger: JuggleTrigger;
  source: StandaloneSource;
  phase: 'loading' | 'cued' | 'running';
  deck: 'A' | 'B';
}

export interface JuggleTelemetry {
  mode: JuggleMode;
  active: boolean;
  pattern: DJJugglePatternType | null;
  sequence: string | null;
  phase: JugglePhase | null;
  intensity: number;
  activeDeck: 'A' | 'B' | 'BOTH';
  deckA: { material: string[]; confidence: number; role: JuggleDeckRole };
  deckB: { material: string[]; confidence: number; role: JuggleDeckRole };
  nextActions: Array<{ deck: string; type: DJJuggleActionType; beat: number }>;
  reason: string;
  confidence: number;
  safety: string;
  budget: { juggledFraction: number; secondsSinceLastJuggle: number; cooldownSec: number };
  lastQuality: JuggleQualityScore | null;
  history: Array<{ type: DJJugglePatternType; bars: number; score: number; cuts?: JuggleCutTiming[] }>;
  /** The stand-alone juggle Auto DJ is setting up or performing; null when none. */
  standalone: StandaloneTelemetry | null;
  /** The last Juggle Now request: pending while its juggle is set up, then started or refused with the reason. */
  juggleNow: JuggleNowState | null;
}

/** A Juggle Now request (owner decision 2026-10-12): the timing gates skipped, the safety gates kept. */
export interface JuggleNowState { state: 'pending' | 'started' | 'refused'; reason: string }
