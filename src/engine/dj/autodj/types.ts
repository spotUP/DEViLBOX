/**
 * Auto DJ intelligence types - the unified DJTrackAnalysis (plan section 3)
 * and everything the planners exchange above the deck/mixer primitives
 * (plan sections 11-61).
 *
 * Nothing in here touches audio. The deck and mixer engines stay the only
 * execution layer (plan section 67).
 */

// ── Beat grid (plan section 5) ──────────────────────────────────────────────

export interface Beat {
  /** Seconds. */
  time: number;
  /** Index in the beat list. */
  index: number;
  /** Accent strength 0..1 from the bass+drum energy at the beat. */
  strength: number;
  isDownbeat: boolean;
}

export interface BeatGrid {
  bpm: number;
  /** Seconds of the first musical beat (not the first transient). */
  firstBeat: number;
  beats: Beat[];
  confidence: number;
}

export interface Bar {
  index: number;
  start: number;
  end: number;
  /** Seconds of the bar's downbeat (== start). */
  downbeat: number;
  /** Beat indices in this bar. */
  beats: number[];
  /** True when the bar holds a full beatsPerBar beats. */
  full: boolean;
}

export interface Meter {
  beatsPerBar: number;
  confidence: number;
}

export interface DownbeatGrid {
  bars: Bar[];
  meter: Meter;
  confidence: number;
  /** Which beat of the raw beat list is the first downbeat (0..beatsPerBar-1). */
  phaseOffset: number;
}

export interface MeterAnalysis {
  beatsPerBar: number;
  confidence: number;
  alternatives: Array<{ beatsPerBar: number; score: number }>;
}

/** The five positions plan section 5 says must be told apart. */
export interface GridLandmarks {
  firstTransient: number;
  firstMusicalBeat: number;
  firstDownbeat: number;
  firstFullBar: number;
  firstUsableMixPoint: number;
}

export interface TempoHypothesis {
  bpm: number;
  confidence: number;
  relationship?: 'normal' | 'half' | 'double';
}

// ── Key (plan sections 4, 13, 14) ───────────────────────────────────────────

export type KeyMode = 'major' | 'minor' | 'unknown';

export interface MusicalKey {
  /** "A minor", or "Unknown". */
  name: string;
  /** Pitch class 0..11 of the root, null when unknown. */
  root: number | null;
  mode: KeyMode;
  /** "8A" etc, null when unknown. */
  camelot: string | null;
  alternatives: Array<{ name: string; confidence: number }>;
}

export interface KeySegment {
  start: number;
  end: number;
  key: MusicalKey;
  confidence: number;
}

export interface TuningAnalysis {
  referenceHz: number;
  centsOffset: number;
  confidence: number;
}

// ── Loudness, energy, spectral, rhythmic, bass (plan section 4) ─────────────

export interface LoudnessAnalysis {
  integratedDb: number;
  /** Short-term (3 s) loudness in dB, one per `shortTermHopSec`. */
  shortTermDb: number[];
  shortTermHopSec: number;
  shortTermMaxDb: number;
  peakDb: number;
  /** 4x linear-interpolated inter-sample peak estimate. */
  truePeakDb: number;
  /** 95th - 10th percentile of short-term loudness. */
  dynamicRangeDb: number;
  crestFactorDb: number;
}

export interface EnergyAnalysis {
  bass: number;
  drums: number;
  transientDensity: number;
  brightness: number;
  harmonicDensity: number;
  vocalPresence: number;
  rhythmicDensity: number;
  arrangementDensity: number;
  /** The planner's energy: a weighted blend of the above, 0..1, not RMS. */
  perceivedIntensity: number;
  /** The legacy loudness-derived value, kept for comparison only. */
  loudnessEnergy: number;
}

export interface SpectralAnalysis {
  centroidHz: number;
  lowRatio: number;
  midRatio: number;
  highRatio: number;
  flatness: number;
  brightness: number;
  /** Energy density in 150-400 Hz relative to the whole: mud risk. */
  muddiness: number;
}

export type DrumPattern = 'four-on-floor' | 'breakbeat' | 'half-time' | 'sparse' | 'unknown';

export interface RhythmicAnalysis {
  onsetsPerBeat: number;
  fourOnFloorScore: number;
  syncopation: number;
  drumPattern: DrumPattern;
  tempoHypotheses: TempoHypothesis[];
  /** 1 = steady tempo through the track. */
  tempoStability: number;
}

export interface BassAnalysis {
  /** Mean bass activity 0..1. */
  level: number;
  /** 30-80 Hz share of the bass band. */
  subRatio: number;
  /** 0..1, "huge sub bass" is > 0.7. */
  heaviness: number;
  kickStrength: number;
  /** True when the bass band varies tonally (a bassline, not only a kick). */
  melodic: boolean;
  activity: ActivityTimeline;
  confidence: number;
}

export interface GenreAnalysis {
  primary: string;
  subgenre: string;
  confidence: number;
  mood: string;
}

// ── Structure (plan sections 6, 7) ──────────────────────────────────────────

export type SectionKind =
  | 'intro' | 'groove' | 'verse' | 'build' | 'pre-drop' | 'drop' | 'chorus'
  | 'breakdown' | 'bridge' | 'outro' | 'silence' | 'fill' | 'instrumental'
  | 'vocal-heavy' | 'drum-only' | 'bass-only';

export const SECTION_KINDS: readonly SectionKind[] = [
  'intro', 'groove', 'verse', 'build', 'pre-drop', 'drop', 'chorus', 'breakdown', 'bridge',
  'outro', 'silence', 'fill', 'instrumental', 'vocal-heavy', 'drum-only', 'bass-only',
];

export interface DJSection {
  kind: SectionKind;
  start: number;
  end: number;
  startBar: number;
  endBar: number;
  confidence: number;
  /** Mean perceived intensity 0..1 inside the section. */
  energy: number;
  alternatives: Array<{ kind: SectionKind; confidence: number }>;
}

export interface DJPhrase {
  index: number;
  start: number;
  end: number;
  startBar: number;
  lengthBars: number;
  confidence: number;
  sectionIndex: number;
}

export interface DJCuePoints {
  introStart?: number;
  firstBeat?: number;
  firstFullGroove?: number;
  firstDrums?: number;
  firstBass?: number;
  firstVocal?: number;
  firstHook?: number;
  firstDrop?: number;
  firstBreak?: number;
  bestMixIn?: number;
  bestMixOut?: number;
  outroStart?: number;
  outroGroove?: number;
  finalBeat?: number;
}

export interface ActivityTimeline {
  hopSec: number;
  /** 0..1 per hop. */
  values: number[];
  confidence: number;
}

export type ArrangementEventKind =
  | 'drums-in' | 'drums-out' | 'bass-in' | 'bass-out' | 'vocal-in' | 'vocal-out'
  | 'energy-up' | 'energy-down' | 'silence' | 'section-change';

export interface ArrangementEvent {
  kind: ArrangementEventKind;
  time: number;
  bar: number;
  confidence: number;
}

export interface AnalysisConfidence {
  bpm: number;
  beatGrid: number;
  downbeat: number;
  key: number;
  section: number;
  cue: number;
  vocal: number;
  bass: number;
  tracker: number;
  overall: number;
}

// ── Tracker-native analysis (plan sections 25-27) ───────────────────────────

export type InstrumentFamily = 'drums' | 'bass' | 'lead' | 'chords' | 'pad' | 'arpeggio' | 'fx' | 'unknown';
export type MusicalFunction = 'rhythm' | 'bass' | 'melody' | 'harmony' | 'texture' | 'silence';
export type RhythmicRole = 'kick' | 'snare' | 'hat' | 'perc' | 'sustained' | 'arpeggiated' | 'none';
export type Register = 'sub' | 'low' | 'mid' | 'high';

export interface TrackerChannelSegment {
  channel: number;
  start: number;
  end: number;
  instrumentFamily?: InstrumentFamily;
  musicalFunction?: MusicalFunction;
  rhythmicRole?: RhythmicRole;
  register?: Register;
  importance: number;
  density: number;
  confidence: number;
}

export type TrackerMixEventKind =
  | 'DRUM_ENTRY' | 'BASS_ENTRY' | 'BASS_EXIT' | 'MELODY_ENTRY' | 'INSTRUMENT_ENTRY'
  | 'INSTRUMENT_EXIT' | 'PATTERN_CHANGE' | 'FILL' | 'BREAK' | 'DROP' | 'DENSITY_INCREASE'
  | 'DENSITY_DECREASE' | 'SILENCE' | 'REPEATED_PHRASE';

export const TRACKER_MIX_EVENT_KINDS: readonly TrackerMixEventKind[] = [
  'DRUM_ENTRY', 'BASS_ENTRY', 'BASS_EXIT', 'MELODY_ENTRY', 'INSTRUMENT_ENTRY', 'INSTRUMENT_EXIT',
  'PATTERN_CHANGE', 'FILL', 'BREAK', 'DROP', 'DENSITY_INCREASE', 'DENSITY_DECREASE', 'SILENCE',
  'REPEATED_PHRASE',
];

export interface TrackerMixEvent {
  kind: TrackerMixEventKind;
  time: number;
  orderPosition: number;
  row: number;
  channel?: number;
  instrument?: number;
  confidence: number;
}

export interface TrackerOrderPosition {
  index: number;
  patternIndex: number;
  start: number;
  end: number;
  /** Rows played: from startRow to the pattern end or the row of a Dxx / Bxx. */
  rows: number;
  /** First row played (a Dxx in the position before can start a pattern mid-way). */
  startRow: number;
}

export interface TrackerMixAnalysis {
  orderPositions: TrackerOrderPosition[];
  /** Seconds at which a new order position starts. */
  patternBoundaries: number[];
  channelSegments: TrackerChannelSegment[];
  events: TrackerMixEvent[];
  noteDensity: ActivityTimeline;
  bassActivity: ActivityTimeline;
  drumActivity: ActivityTimeline;
  melodyActivity: ActivityTimeline;
  /** Per instrument number: first and last second it sounds, note count. */
  instrumentUsage: Array<{ instrument: number; firstTime: number; lastTime: number; notes: number }>;
  /** Instrument numbers in use (sample usage - every instrument of a sample tracker is a sample). */
  sampleUsage: number[];
  repeatedPhrases: Array<{ start: number; end: number; repeatOf: number }>;
  silences: Array<{ start: number; end: number }>;
  /** Seconds of structural change (density step, pattern change with new material). */
  structuralTransitions: number[];
  durationSec: number;
  confidence: number;
}

// ── The unified analysis (plan section 3) ───────────────────────────────────

export interface DJTrackAnalysis {
  /** Stable id: the deck file name or playlist track id. */
  id: string;
  durationSec: number;
  /** Version of the analysis format this was built from. */
  version: number;

  bpm: number;
  bpmConfidence: number;
  /** Where bpm, the beat grid and the bars come from: the module's own timing walk, or the audio analysis. */
  tempoSource: 'module' | 'audio';

  beatGrid: BeatGrid;
  downbeats: DownbeatGrid;
  meter: MeterAnalysis;
  landmarks: GridLandmarks;

  key: MusicalKey;
  keyConfidence: number;
  keyTimeline?: KeySegment[];

  tuning?: TuningAnalysis;

  loudness: LoudnessAnalysis;
  energy: EnergyAnalysis;
  spectral: SpectralAnalysis;
  rhythmic: RhythmicAnalysis;
  bass: BassAnalysis;

  danceability: number;
  genre?: GenreAnalysis;

  sections: DJSection[];
  phrases: DJPhrase[];
  /** Detected phrase length in bars (4, 8 or 16), per song. */
  phraseLengthBars: number;
  arrangementEvents: ArrangementEvent[];

  cuePoints: DJCuePoints;

  vocalActivity: ActivityTimeline;
  drumActivity: ActivityTimeline;
  bassActivity: ActivityTimeline;
  harmonicActivity: ActivityTimeline;
  /** Perceived intensity over time. */
  intensity: ActivityTimeline;

  analysisConfidence: AnalysisConfidence;

  tracker?: TrackerMixAnalysis;
}

/**
 * What the analysis worker adds beyond the legacy result: computed from PCM
 * once, carried through the pipeline, the cache and the pre-rendered track.
 */
export interface ExtendedAnalysis {
  version: number;
  hopSec: number;
  bass: number[];
  drums: number[];
  harmonic: number[];
  vocal: number[];
  brightness: number[];
  /** Short-term loudness in dB per hop (3 s window). */
  loudnessShortTermDb: number[];
  /** Onset (spectral flux) per hop, 0..1. */
  onsetFlux: number[];
  /** Chroma (12 bins) per key segment hop; segments are `keyHopSec` long. */
  keyHopSec: number;
  chroma: number[][];
  loudness: {
    integratedDb: number;
    shortTermMaxDb: number;
    peakDb: number;
    truePeakDb: number;
    dynamicRangeDb: number;
    crestFactorDb: number;
  };
  spectral: SpectralAnalysis;
  bassSummary: { subRatio: number; kickStrength: number; melodic: boolean };
  firstTransient: number;
}

/**
 * The compact per-track summary stored on a playlist track so the set planner
 * can look ahead over tracks that are not on a deck.
 */
export interface DJTrackSummary {
  version: number;
  durationSec: number;
  bpm: number;
  bpmConfidence: number;
  tempoHypotheses: TempoHypothesis[];
  key: string | null;
  keyConfidence: number;
  keyMode: KeyMode;
  energy: EnergyAnalysis;
  loudness: { integratedDb: number; truePeakDb: number; dynamicRangeDb: number };
  bassLevel: number;
  bassHeaviness: number;
  vocalPresence: number;
  drumPattern: DrumPattern;
  brightness: number;
  genre?: string;
  introLengthSec: number;
  outroLengthSec: number;
  hasDrop: boolean;
  hasBreakdown: boolean;
  cuePoints: DJCuePoints;
  phraseLengthBars: number;
  sectionKinds: SectionKind[];
  confidence: AnalysisConfidence;
  tracker: boolean;
  /** Mean vocal presence per eighth of the track, for overlap checks. */
  vocalProfile: number[];
  /** Mean bass activity per eighth of the track. */
  bassProfile: number[];
  /** Mean intensity per eighth of the track. */
  intensityProfile: number[];
}

// ── Set planning (plan sections 8-11, 28-30, 40, 54) ────────────────────────

export type SetEnergyPhase =
  | 'OPENING' | 'BUILDING' | 'CRUISING' | 'PEAKING' | 'PEAK' | 'RELEASE' | 'RECOVERY' | 'CLOSING';

export const SET_ENERGY_PHASES: readonly SetEnergyPhase[] = [
  'OPENING', 'BUILDING', 'CRUISING', 'PEAKING', 'PEAK', 'RELEASE', 'RECOVERY', 'CLOSING',
];

export type ScoreComponent =
  | 'harmonicCompatibility' | 'tempoCompatibility' | 'phraseCompatibility' | 'energyArcFit'
  | 'sectionCompatibility' | 'introOutroCompatibility' | 'drumCompatibility' | 'bassCompatibility'
  | 'vocalCompatibility' | 'genreCompatibility' | 'textureCompatibility' | 'novelty' | 'setNarrative'
  | 'repetition' | 'awkwardness' | 'risk';

export const SCORE_COMPONENTS: readonly ScoreComponent[] = [
  'harmonicCompatibility', 'tempoCompatibility', 'phraseCompatibility', 'energyArcFit',
  'sectionCompatibility', 'introOutroCompatibility', 'drumCompatibility', 'bassCompatibility',
  'vocalCompatibility', 'genreCompatibility', 'textureCompatibility', 'novelty', 'setNarrative',
  'repetition', 'awkwardness', 'risk',
];

export type ScoreWeights = Record<ScoreComponent, number>;

export type DJStyleName =
  | 'Smooth' | 'Club' | 'Aggressive' | 'Dub' | 'Progressive' | 'Classic' | 'Experimental'
  | 'Minimal' | 'Festival' | 'Radio';

export const DJ_STYLE_NAMES: readonly DJStyleName[] = [
  'Smooth', 'Club', 'Aggressive', 'Dub', 'Progressive', 'Classic', 'Experimental', 'Minimal',
  'Festival', 'Radio',
];

export interface DJStyleProfile {
  name: DJStyleName;
  /** Preferred transition length in bars; the planner scales around it. */
  transitionLengthBars: number;
  /** 0..1 session creative risk budget (plan section 54). */
  riskTolerance: number;
  /** Target energy rise per track in the building phase, -1..1. */
  energyMovement: number;
  /** 0..1 how often FX punctuation is used when musically triggered. */
  fxUsage: number;
  /** 'strict' owner handover, 'shared' allows overlaps, 'swap' quick swaps. */
  bassBehaviour: 'strict' | 'shared' | 'swap';
  /** 0..1, 1 = never a clash. */
  keyStrictness: number;
  /** Max tempo change in percent considered normal. */
  tempoTolerancePercent: number;
  /** 0..1 how willing the style is to use justified hard cuts. */
  cutFrequency: number;
  /** 0..1, 1 = repetition of a transition type is fine. */
  repetitionTolerance: number;
  /** 0..1, 1 = transitions only on phrase boundaries. */
  phraseStrictness: number;
  weights: ScoreWeights;
}

export interface DJTrackCandidate {
  index: number;
  trackId: string;
  name: string;
  summary: DJTrackSummary | null;
  score: number;
  components: Partial<Record<ScoreComponent, number>>;
  reasons: string[];
  rejections: string[];
}

export interface SetPlan {
  /** Indices into the user playlist, in performance order, starting with the next track. */
  order: number[];
  candidates: DJTrackCandidate[];
  phase: SetEnergyPhase;
  targetEnergy: number;
  lookahead: number;
  reasons: string[];
}

// ── Tempo and key solver (plan sections 12-14) ──────────────────────────────

export type TempoMethod =
  | 'beatmatch' | 'half-time' | 'double-time' | 'pitch' | 'tempo-bridge' | 'avoid' | 'creative-jump' | 'none';

export interface TempoPlan {
  method: TempoMethod;
  outgoingBpm: number;
  incomingBpm: number;
  /** Semitones applied to the incoming deck through the one pitch path. */
  incomingSemitones: number;
  ratio: number;
  percent: number;
  /** 'normal' | 'creative' | 'extreme' classification of the shift. */
  band: 'none' | 'normal' | 'creative' | 'extreme';
  keyLock: boolean;
  reason: string;
}

export type KeyConfidenceClass = 'known-high' | 'known-low' | 'unknown';

export interface KeyPlan {
  outgoingKey: string | null;
  incomingKey: string | null;
  relation: string;
  confidenceClass: KeyConfidenceClass;
  /** 0..1 harmonic clash risk after confidence weighting. */
  clashRisk: number;
  keyLock: boolean;
  /** Key of the incoming track after the tempo shift without key lock. */
  shiftedKey: string | null;
  reason: string;
}

// ── Transition plan (plan sections 15-24, 36, 37, 51-53) ────────────────────

export type TransitionStyle =
  | 'longBlend' | 'shortBlend' | 'bassSwap' | 'EQSwap' | 'filterBuild' | 'filterRelease'
  | 'echoOut' | 'reverbOut' | 'delayThrow' | 'loopExit' | 'breakdownMix' | 'dropMix'
  | 'drumIntroMix' | 'vocalSwap' | 'percussionSwap' | 'hardCut' | 'tempoBridge'
  | 'doubleTimeJump' | 'halfTimeJump' | 'juggleTransition';

export const TRANSITION_STYLES: readonly TransitionStyle[] = [
  'longBlend', 'shortBlend', 'bassSwap', 'EQSwap', 'filterBuild', 'filterRelease', 'echoOut',
  'reverbOut', 'delayThrow', 'loopExit', 'breakdownMix', 'dropMix', 'drumIntroMix', 'vocalSwap',
  'percussionSwap', 'hardCut', 'tempoBridge', 'doubleTimeJump', 'halfTimeJump', 'juggleTransition',
];

export type AutomationTarget =
  | 'crossfader'
  | 'outgoing.eqLow' | 'incoming.eqLow' | 'outgoing.eqMid' | 'incoming.eqMid'
  | 'outgoing.eqHigh' | 'incoming.eqHigh'
  | 'outgoing.filter' | 'incoming.filter'
  | 'outgoing.volume' | 'incoming.volume'
  | 'outgoing.echoSend' | 'outgoing.reverbSend';

export interface Keyframe {
  /** Beats from the transition start. */
  beat: number;
  value: number;
  curve?: 'linear' | 'ease' | 'exp';
}

export interface AutomationCurve {
  target: AutomationTarget;
  keyframes: Keyframe[];
}

export interface CrossfadePlan {
  curve: AutomationCurve;
  lengthBeats: number;
  law: 'equal-power' | 'linear' | 'cut';
}

export interface EQPlan {
  curves: AutomationCurve[];
}

export type FilterPlanKind = 'none' | 'high-pass-sweep' | 'low-pass-sweep' | 'resonant-build' | 'release' | 'filter-eq';

export interface FilterPlan {
  kind: FilterPlanKind;
  curves: AutomationCurve[];
  resonance: number;
}

export type BassOwner = 'OUTGOING' | 'INCOMING' | 'SHARED' | 'NEUTRAL';

export interface BassHandoverPlan {
  schedule: Array<{ bar: number; owner: BassOwner }>;
  curves: AutomationCurve[];
  coexist: boolean;
  outgoingHeavy: boolean;
  incomingHeavy: boolean;
  incomingKickStronger: boolean;
  outgoingBassNecessary: boolean;
  handoverBar: number;
  reason: string;
}

export interface GainPlan {
  incomingTrimDb: number;
  outgoingTrimDb: number;
  /** Extra attenuation applied to both decks during the overlap, dB <= 0. */
  overlapCompensationDb: number;
  eqBoostCapDb: number;
  fxReturnDb: number;
  masterCeilingDb: number;
  monitor: {
    integratedDb: number;
    shortTermDb: number;
    truePeakDb: number;
    lowFrequencyAccumulation: number;
  };
}

export type EffectKind = 'echo-out' | 'reverb-out' | 'delay-throw' | 'filter-rise' | 'clean-release' | 'reverb-expansion' | 'brake';

export interface DJEffectEvent {
  kind: EffectKind;
  deck: 'outgoing' | 'incoming';
  beat: number;
  lengthBeats: number;
  amount: number;
  reason: string;
}

export interface TransitionRisk {
  harmonic: number;
  tempo: number;
  phrase: number;
  bass: number;
  vocal: number;
  loudness: number;
  technical: number;
  overall: number;
}

export type CutReason = 'drop' | 'silence' | 'phraseBoundary' | 'impact' | 'emergency';

export interface CutCandidate {
  beat: number;
  reason: CutReason;
  confidence: number;
}

export type LoopPurpose = 'extend-intro' | 'extend-outro' | 'wait-for-phrase' | 'hold-breakdown' | 'bridge-bpm' | 'transition-window';

export interface LoopPlan {
  deck: 'outgoing' | 'incoming';
  startSec: number;
  endSec: number;
  lengthBeats: number;
  repeats: number;
  purpose: LoopPurpose;
  confidence: number;
  reason: string;
}

export type CueJumpTarget = 'drop' | 'breakdown' | 'hook' | 'outro' | 'drums';

export interface CueJumpPlan {
  deck: 'outgoing' | 'incoming';
  targetSec: number;
  target: CueJumpTarget;
  confidence: number;
  reason: string;
}

export interface HumanizePlan {
  /** 0..30 ms late-only start offset. */
  startOffsetMs: number;
  /** +-1 bar at most, 0 for most transitions. */
  lengthVariationBars: number;
  /** ms added to FX event times, 0..20. */
  fxOffsetMs: number;
}

export interface DJTransitionPlan {
  id: string;
  style: TransitionStyle;
  outgoingDeck: 'A' | 'B';
  incomingDeck: 'A' | 'B';

  /** Beat index on the outgoing grid where the transition starts. */
  startBeat: number;
  endBeat: number;
  /** Outgoing deck position in seconds where the transition starts. */
  startTimeSec: number;
  /** Incoming deck position in seconds at the transition start. */
  incomingPosition: number;

  durationBars: number;
  durationBeats: number;
  beatsPerBar: number;

  tempoPlan: TempoPlan;
  keyPlan: KeyPlan;

  crossfadePlan: CrossfadePlan;
  eqPlan: EQPlan;
  filterPlan: FilterPlan;
  bassPlan: BassHandoverPlan;
  gainPlan: GainPlan;

  effects: DJEffectEvent[];
  loop?: LoopPlan;
  cueJump?: CueJumpPlan;
  cut?: CutCandidate;
  /**
   * juggleTransition only: the trading ladder (bars per rung, outgoing then
   * incoming each rung) that runs from the transition start; `tradeBeats` is
   * its whole length. The release (`durationBars`) follows the ladder.
   */
  juggle?: { ladderBars: number[]; tradeBeats: number };

  confidence: number;
  risk: TransitionRisk;

  /** Beat-quantised start: 'phrase' waits for the next phrase boundary. */
  quantize: 'phrase' | 'bar' | 'beat' | 'none';
  humanize: HumanizePlan;

  fallbackStyle: TransitionStyle;
  emergencyStyle: 'longBlend' | 'shortBlend';

  reasons: string[];
  rejected: Array<{ style: TransitionStyle; reason: string }>;
}

export interface TransitionQuality {
  beatAlignment: number;
  phraseAlignment: number;
  harmonicCompatibility: number;
  tempoStability: number;
  bassHandover: number;
  loudnessConsistency: number;
  structuralFit: number;
  creativity: number;
  smoothness: number;
  surprise: number;
  overall: number;
}

// ── Memory, context, decisions (plan sections 28, 34, 45) ───────────────────

export interface TransitionRecord {
  time: number;
  fromTrackId: string;
  toTrackId: string;
  style: TransitionStyle;
  lengthBars: number;
  effects: EffectKind[];
  energyBefore: number;
  energyAfter: number;
  key: string | null;
  bpm: number;
  wasCut: boolean;
  wasBassSwap: boolean;
  hadVocalOverlap: boolean;
  quality?: TransitionQuality;
  fellBack: boolean;
}

export type DecisionKind =
  | 'SELECT_NEXT_TRACK' | 'PLAN_SESSION_ORDER' | 'PLAN_TRANSITION' | 'EXECUTE_TRANSITION'
  | 'FALLBACK' | 'PRELOAD' | 'WAIT' | 'LOOP' | 'CUE_JUMP' | 'SET_PHASE' | 'EMERGENCY' | 'ADAPT'
  /** A stand-alone juggle: trigger, source and how it ended (plan 2026-10-11-dj-juggling, P4.3). */
  | 'JUGGLE';

export interface DecisionLogEntry {
  seq: number;
  time: number;
  decision: DecisionKind;
  selectedTrack?: string;
  reasons: string[];
  rejectedAlternatives: Array<{ track: string; reason: string }>;
  details?: Record<string, unknown>;
}

export interface DJPerformanceContext {
  currentDeck: 'A' | 'B';
  incomingDeck?: 'A' | 'B';

  currentTrack: DJTrackAnalysis | null;
  incomingTrack: DJTrackAnalysis | null;

  currentPosition: number;
  currentBeat: number;
  currentBar: number;
  currentPhrase?: DJPhrase;
  currentSection?: DJSection;
  timeRemainingSec: number;

  setEnergy: number;
  targetEnergy: number;
  setPhase: SetEnergyPhase;

  recentHistory: SessionMemorySnapshot;

  candidateTracks: DJTrackCandidate[];

  transition?: DJTransitionPlan;

  style: DJStyleProfile;
  creativeRisk: number;

  confidence: number;
}

export interface SessionMemorySnapshot {
  recentTracks: string[];
  recentArtists: string[];
  recentKeys: string[];
  recentBPMs: number[];
  recentTransitionTypes: TransitionStyle[];
  recentFX: EffectKind[];
  recentEnergy: number[];
  recentCuts: number;
  recentBassSwaps: number;
  recentVocals: number;
  recentTransitionLengths: number[];
  recentPeaks: number[];
  repeatedTracks: string[];
  repeatedTransitionPatterns: string[];
  transitionCount: number;
  elapsedSec: number;
}
