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

export type JugglePhase = 'SETUP' | 'ESTABLISH' | 'INTENSIFY' | 'PEAK' | 'PAYOFF' | 'RELEASE';

export const JUGGLE_PHASES: readonly JugglePhase[] = ['SETUP', 'ESTABLISH', 'INTENSIFY', 'PEAK', 'PAYOFF', 'RELEASE'];

export type DJJuggleActionType =
  | 'CutIn' | 'CutOut' | 'CrossfadeTo' | 'CrossfadeFrom' | 'TriggerCue' | 'JumpToBeat' | 'JumpToBar'
  | 'StartLoop' | 'ExitLoop' | 'LoopResize' | 'LoopRoll' | 'HoldDeck' | 'ReleaseDeck'
  | 'FilterIn' | 'FilterOut' | 'EQCut' | 'EQRestore' | 'BassSwap' | 'EchoThrow' | 'ReverbThrow'
  | 'ResetDeck' | 'ResyncDeck';

export const JUGGLE_ACTION_TYPES: readonly DJJuggleActionType[] = [
  'CutIn', 'CutOut', 'CrossfadeTo', 'CrossfadeFrom', 'TriggerCue', 'JumpToBeat', 'JumpToBar', 'StartLoop', 'ExitLoop',
  'LoopResize', 'LoopRoll', 'HoldDeck', 'ReleaseDeck', 'FilterIn', 'FilterOut', 'EQCut', 'EQRestore', 'BassSwap',
  'EchoThrow', 'ReverbThrow', 'ResetDeck', 'ResyncDeck',
];

export type JuggleQuantization = 'beat' | 'halfBeat' | 'bar' | 'phrase';

export interface DJJuggleAction {
  type: DJJuggleActionType;
  deck: 'A' | 'B' | 'BOTH';
  /** Beats from the pattern start (the pattern is placed on an absolute master beat by the executor). */
  executeAtBeat: number;
  durationBeats?: number;
  /** Seconds on the deck (loops, cues, jumps) or a crossfader position for CrossfadeTo. */
  targetPosition?: number;
  /** Loop length in beats (StartLoop/LoopResize) or jump size in beats. */
  beats?: number;
  quantization?: JuggleQuantization;
  strength?: number;
  reason?: string;
  phase?: JugglePhase;
}

export type DJJugglePatternType =
  | 'phraseTrade' | 'tightPhraseTrade' | 'barTrade' | 'beatTrade' | 'doubleBeat' | 'callResponse' | 'drumBassTrade'
  | 'fillTrade' | 'loopTighten' | 'double' | 'transformer' | 'dropAndReturn' | 'escalatingJuggle';

export const JUGGLE_PATTERN_TYPES: readonly DJJugglePatternType[] = [
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
  key?: string;
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
  history: Array<{ type: DJJugglePatternType; bars: number; score: number }>;
}
