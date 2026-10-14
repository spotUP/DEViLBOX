/**
 * useDJStore - Zustand store for all DJ mode state
 *
 * Single store managing both decks, mixer, and headphone cueing state.
 * Engine state is the source of truth for audio; this store tracks UI state.
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { enableMapSet } from 'immer';
import type { SeratoCuePoint, SeratoLoop, SeratoBeatMarker } from '@/lib/serato/seratoMetadata';
import type { BeatGridData } from '@/engine/dj/DJAudioCache';
import { clockNowMs, positionAtFrame, type ClockAnchor } from '@/engine/audioLatency';
import type { DJTrackAnalysis } from '@/engine/dj/autodj/types';
import type { AutoDJTelemetry } from '@/engine/dj/autodj/telemetry';
import type { JuggleTelemetry } from '@/engine/dj/autodj/juggle/juggleTypes';
import type { ScratchDJTelemetry } from '@/engine/dj/scratch/DJScratchDJ';
import { CRATE_LOAD_ORDER } from '@/engine/dj/scratch/scratchCatalogue';
import { DEFAULT_SCRATCH_RENDER } from '@/engine/dj/scratch/scratchStyles';
import type { ScratchPhrase } from '@/engine/dj/scratch/scratchPhrase';

// Immer needs MapSet support to draft `Set<number>` fields (fxTargetChannels).
// Calling at module load is idempotent — main.tsx calls it too, but tests
// bypass the app bootstrap so this import-time call is the store's own
// guarantee that Set drafts work even in isolated unit-test contexts.
enableMapSet();

// Native hot cue (compatible shape with Serato, but user-created)
export interface HotCue {
  position: number;    // ms from start
  color: string;       // hex color
  name: string;        // user label
}

// Pending quantized action — purely for UI feedback while a deferred
// transport/cue action is waiting for the next beat/bar boundary.
export type PendingActionKind = 'play' | 'cue' | 'hotcue' | 'loop' | 'jump';
export interface PendingAction {
  kind: PendingActionKind;
  mode: 'beat' | 'bar';
  startedAt: number;   // performance.now() at scheduling
  etaMs: number;       // total wait length in ms
}

// ============================================================================
// TYPES
// ============================================================================

export interface DeckState {
  // Track info
  fileName: string | null;
  trackName: string;
  trackAuthor: string;
  detectedBPM: number;

  // Transport
  isPlaying: boolean;
  songPos: number;
  pattPos: number;
  totalPositions: number;
  /** Bumped each time the deck's replayer takes a song (DeckEngine.loadSong): what reads the deck's song re-reads it. */
  songVersion: number;
  elapsedMs: number;

  // Pitch / BPM
  pitchOffset: number;         // -16 to +16 semitones
  effectiveBPM: number;
  repitchLock: boolean;
  keyLockEnabled: boolean;    // Key lock (master tempo) — pitch slider changes tempo only

  // EQ
  eqLow: number;              // dB (-12 to +12)
  eqMid: number;
  eqHigh: number;
  eqLowKill: boolean;
  eqMidKill: boolean;
  eqHighKill: boolean;
  eqPreset: string | null;    // active quick-EQ preset id, null = custom

  // Filter
  filterPosition: number;     // -1 (HPF) to 0 (off) to +1 (LPF)
  filterResonance: number;

  // Volume
  volume: number;              // 0 to 1 (channel fader)
  trimGain: number;            // Auto-gain trim in dB (-12 to +12)
  autoGainEnabled: boolean;    // Whether auto-gain is active
  rmsDb: number;               // Analyzed RMS loudness
  peakDb: number;              // Analyzed peak level

  // Cue
  cuePoint: number;            // Song position for cue point
  pflEnabled: boolean;

  // Pending quantized action (UI feedback during a beat-quantized wait).
  // Set by quantizeAction() while a deferred play/cue/hot-cue/loop/jump
  // is waiting for the next beat or bar boundary. Cleared on fire/cancel.
  pendingAction: PendingAction | null;

  // Hot cues (native — 8 slots, compatible with Serato format)
  hotCues: (HotCue | null)[];

  // Loop
  loopActive: boolean;
  lineLoopSize: 1 | 2 | 4 | 8 | 16 | 32;
  patternLoopStart: number;
  patternLoopEnd: number;
  loopMode: 'line' | 'pattern' | 'off';

  // Audio-mode loop (time-based, in seconds)
  audioLoopIn: number | null;
  audioLoopOut: number | null;

  // Slip
  slipEnabled: boolean;
  slipSongPos: number;
  slipPattPos: number;

  // Channel mutes (bitmask: bit N = channel N+1 enabled)
  channelMask: number;

  // Per-channel FX targeting — which channels of the loaded tracker song
  // receive DUB moves / EQ / filter sweeps when `channelModeUI === 'fx'`.
  // Empty set means "all channels" (no targeting active — today's behaviour).
  // Non-empty set lets DJs throw an echo on just the drums (ch 1-2) while
  // the bassline (ch 3) keeps playing dry.
  fxTargetChannels: Set<number>;

  // Click-mode for the scope + channel-toggle widgets.
  //   'mute' → click toggles channelMask (today's behaviour)
  //   'fx'   → click toggles fxTargetChannels
  // Shift+click keeps its solo semantic in both modes.
  channelModeUI: 'mute' | 'fx';

  // Scratch
  scratchActive: boolean;
  scratchVelocity: number;  // current scratch velocity for UI feedback (turntable, pattern scroll)
  scratchFaderGain: number; // current scratch fader gain (0-1) for visual feedback on channel strip
  faderLFOActive: boolean;
  faderLFODivision: '1/4' | '1/8' | '1/16' | '1/32' | null;
  activePatternName: string | null;

  // Audio file playback mode
  playbackMode: 'tracker' | 'audio';
  durationMs: number;             // total duration for audio files (ms)
  audioPosition: number;          // current position in seconds
  /**
   * The heard-position clock: audioPosition (tracker: elapsedMs) at an instant
   * plus its rate. Per-frame visuals extrapolate it with positionAtFrame
   * instead of drawing the held 20 Hz value. Every write of the position
   * re-anchors it; stopping the deck freezes it.
   */
  positionAnchor: ClockAnchor;
  waveformPeaks: Float32Array | null;  // for waveform display

  // Serato metadata (populated when loading Serato-analyzed tracks)
  seratoCuePoints: SeratoCuePoint[];
  seratoLoops: SeratoLoop[];
  seratoBeatGrid: SeratoBeatMarker[];
  seratoKey: string | null;

  // Analysis state (populated by DJPipeline background analysis)
  analysisState: 'none' | 'pending' | 'rendering' | 'analyzing' | 'separating' | 'ready';
  analysisProgress: number; // 0-100
  beatGrid: BeatGridData | null;
  musicalKey: string | null;
  keyConfidence: number;
  frequencyPeaks: Float32Array[] | null;  // [low, mid, high] band peaks
  
  // Genre classification
  genrePrimary: string | null;      // e.g. "Electronic", "Hip Hop"
  genreSubgenre: string | null;     // e.g. "Techno", "Drum n Bass"
  genreConfidence: number;          // 0-1
  mood: string | null;              // e.g. "Energetic", "Chill"
  energy: number;                   // 0-1 (low → high energy)
  danceability: number;             // 0-1
  /** The unified Auto DJ analysis of the loaded track (plan section 3); null until the pipeline applies one. */
  trackAnalysis: DJTrackAnalysis | null;

  /** Channels the deck has a per-channel scope signal for (channelScopeTrack.ts); 0 = none (an audio file, or a render without a per-channel tap). */
  channelScopeCount: number;
  /** Channels of the loaded rendered audio a channel mute reaches (DeckChannelMute stems); 0 = none, the mute pads stay off. */
  channelStemCount: number;

  // Stem separation
  stemsAvailable: boolean;          // stems loaded and ready for playback
  stemNames: string[];              // e.g. ['drums', 'bass', 'vocals', 'other']
  stemMode: boolean;                // true = stem playback active (vs full mix)
  stemMutes: Record<string, boolean>;  // per-stem mute state
  stemVolumes: Record<string, number>; // per-stem volume 0-1
  stemSolos: Record<string, boolean>;  // per-stem solo state
  stemDubSends: Record<string, boolean>;  // per-stem dub bus send toggles
  stemWaveformPeaks: Record<string, Float32Array> | null; // per-stem waveform peaks for visualization
  stemSeparationProgress: number | null;  // null = idle, 0-1 = separation in progress
}

export type DeckId = 'A' | 'B' | 'C';

export type CueMode = 'multi-output' | 'split-stereo' | 'none';
export type CrossfaderCurve = 'linear' | 'cut' | 'smooth';

// ============================================================================
// DEFAULT DECK STATE
// ============================================================================

// Factory — avoids sharing reference-typed fields (fxTargetChannels Set,
// hotCues array) across deck slots and across resets.
const makeDefaultDeckState = (): DeckState => ({
  fileName: null,
  trackName: '',
  trackAuthor: '',
  detectedBPM: 125,
  isPlaying: false,
  songPos: 0,
  pattPos: 0,
  totalPositions: 0,
  songVersion: 0,
  elapsedMs: 0,
  pitchOffset: 0,
  effectiveBPM: 125,
  repitchLock: false,
  keyLockEnabled: true,
  eqLow: 0,
  eqMid: 0,
  eqHigh: 0,
  eqLowKill: false,
  eqMidKill: false,
  eqHighKill: false,
  eqPreset: null,
  filterPosition: 0,
  filterResonance: 1,
  volume: 1,
  trimGain: 0,
  autoGainEnabled: true,
  rmsDb: -100,
  peakDb: -100,
  cuePoint: 0,
  pflEnabled: false,
  pendingAction: null,
  hotCues: Array(8).fill(null) as (HotCue | null)[],
  loopActive: false,
  lineLoopSize: 4,
  patternLoopStart: 0,
  patternLoopEnd: 0,
  loopMode: 'off',
  audioLoopIn: null,
  audioLoopOut: null,
  slipEnabled: false,
  slipSongPos: 0,
  slipPattPos: 0,
  channelMask: 0xFFFF, // All channels enabled (16 bits)
  fxTargetChannels: new Set<number>(),
  channelModeUI: 'mute',

  // Scratch
  scratchActive: false,
  scratchVelocity: 0,
  scratchFaderGain: 1,
  faderLFOActive: false,
  faderLFODivision: null,
  activePatternName: null,

  // Audio file playback
  playbackMode: 'tracker',
  durationMs: 0,
  audioPosition: 0,
  positionAnchor: { positionSec: 0, rate: 0, anchorMs: 0 },
  waveformPeaks: null,

  // Serato metadata
  seratoCuePoints: [],
  seratoLoops: [],
  seratoBeatGrid: [],
  seratoKey: null,

  // Analysis
  analysisState: 'none',
  analysisProgress: 0,
  beatGrid: null,
  musicalKey: null,
  keyConfidence: 0,
  frequencyPeaks: null,
  
  // Genre classification
  genrePrimary: null,
  genreSubgenre: null,
  genreConfidence: 0,
  mood: null,
  energy: 0.5,
  danceability: 0.5,
  trackAnalysis: null,
  channelScopeCount: 0,
  channelStemCount: 0,

  // Stems
  stemsAvailable: false,
  stemNames: [],
  stemMode: false,
  stemMutes: {},
  stemVolumes: {},
  stemSolos: {},
  stemDubSends: {},
  stemWaveformPeaks: null,
  stemSeparationProgress: null,
});

// ============================================================================
// STORE
// ============================================================================

export type DeckViewMode = 'visualizer' | 'vinyl' | '3d';

/** The open tab of a deck's lower panel (Pads, Scratch, Loop & Cue, Mix). */
export type DeckPanelTab = 'pads' | 'scratch' | 'loopcue' | 'mix';

/** 'paused': the Auto DJ is on but holds (its Pause, a deck paused by hand, the Three Deck Showcase holding the set). */
export type AutoDJStatus = 'idle' | 'playing' | 'paused' | 'preloading' | 'preload-failed' | 'transition-pending' | 'transitioning';

interface DJState {
  // Global
  djModeActive: boolean;
  deckViewMode: DeckViewMode;
  /** Open lower-panel tab per deck; survives deck re-renders and view switches. */
  deckPanelTab: Record<'A' | 'B' | 'C', DeckPanelTab>;
  /** Whether the lower panel body is open per deck. Only used while the layout opens the panel on demand (short screens); docked, the body is always shown. Not persisted. */
  deckPanelOpen: Record<'A' | 'B' | 'C', boolean>;
  /** The crate record Deck C's scratch pads play (scratchCatalogue id). */
  deckCRecordId: string;
  thirdDeckActive: boolean;
  crossfaderPosition: number;
  crossfaderCurve: CrossfaderCurve;
  hamsterSwitch: boolean; // Reverse crossfader direction
  masterVolume: number;
  boothVolume: number; // Booth/monitor output 0-1.5
  sessionMonitorVolume: number; // Session/CF monitor output 0-1.5
  cueMix: number; // Headphone cue/mix blend: 0=cue only, 1=master only
  jogWheelSensitivity: number; // 0.5-2.0x multiplier (1.0 = default)

  // Per-deck
  decks: { A: DeckState; B: DeckState; C: DeckState };

  // Headphone cueing
  cueMode: CueMode;
  cueDeviceId: string | null;
  cueDeviceName: string | null;
  cueVolume: number;
  headphoneSetupDone: boolean;

  // Pipeline (background render + analysis)
  pipelineActive: boolean;
  pipelineQueue: number;           // Number of pending tasks
  pipelineCurrentTask: string | null; // e.g. "Rendering mod.symphony..." or "Analyzing..."

  // Auto DJ
  autoDJEnabled: boolean;
  autoDJStatus: AutoDJStatus;
  autoDJCurrentTrackIndex: number;
  autoDJNextTrackIndex: number;
  autoDJTransitionBars: number;
  autoDJShuffle: boolean;
  autoDJWithFilter: boolean;
  /**
   * Smart Cuts — pattern-data-aware transition overrides for Auto DJ.
   * Off by default (respects the 2026-04-18 gig-fix rule against
   * random hard cuts). When true, Auto DJ's selectTransitionType can:
   *   - force a hard cut when the outgoing track's tail is a drum break
   *   - defer to crossfade when a chord change is imminent
   *   - make harmonic bass-swap deterministic (vs 30% random roll) for
   *     key-compatible high-energy pairs
   * Requires both decks loaded with tracker-format songs — a deck holding
   * a track without a song (an MP3) returns null from
   * DeckEngine.getLoadedSong() and the overrides fall through to the
   * default path.
   */
  autoDJSmartCuts: boolean;
  /** DJ style profile name (plan section 30). */
  autoDJStyle: string;
  /** Session creative risk budget 0..1 (plan section 54); -1 = the style's own. */
  autoDJCreativeRisk: number;
  /** Performance order: indices into the user playlist, next track first (plan section 10). Never the playlist itself. */
  autoDJSessionOrder: number[];
  /** Telemetry snapshot for the debug view (plan section 44), written by the session controller. */
  autoDJTelemetry: AutoDJTelemetry | null;
  /** Auto Juggle mode (juggling plan section 44). */
  autoDJJuggleMode: string;
  /** Auto Juggle intensity 0..1; -1 = the set decides. */
  autoDJJuggleIntensity: number;
  /** Juggle telemetry (juggling plan section 45), written by the juggle controller. */
  autoDJJuggleTelemetry: JuggleTelemetry | null;
  /** Auto Scratch mode (scratch plan section 62): OFF, SAFE, MUSICAL, PERFORMER, BATTLE. */
  autoDJScratchMode: string;
  /** Auto Scratch intensity 0..1; -1 = the set decides. */
  autoDJScratchIntensity: number;
  /** Auto Scratch style: 'auto' (from the track's genre and the Auto DJ style) or a palette id. */
  autoDJScratchStyle: string;
  /** Auto Scratch "Records" (the demo's selector, R8): a `record_set` choice ('style' - the demo's default -, 'clean', 'bank', 'cat:fresh', 'off', ...) or the checked record ids. */
  autoDJScratchRecords: string | string[];
  /** Auto Scratch "Render" (the demo's Render mode, owner S2 2026-10-13): 'section', 'three_deck' (default), 'dj_routine'. */
  autoDJScratchRender: string;
  /** The spoken phrase dropped on Deck C (R5): its cue records by role; Deck C's three-deck routine scratches them. Null = the crate. */
  autoDJScratchPhrase: ScratchPhrase | null;
  /** Scratch telemetry (scratch plan section 64), written by the scratch controller. */
  autoDJScratchTelemetry: ScratchDJTelemetry | null;
  /** DJ FX actions engaged right now, by action id -> deck (the pad lights from this, whoever fired it). */
  djFxActive: Record<string, DeckId | null>;
  /** Pre-separate stems for upcoming playlist tracks in the background */
  stemPreSeparation: boolean;
  /** Enable auto-dub for streamed audio decks — fires dub moves timed to
   *  the beat grid, using stem roles (drums/bass/vocals/other) for targeting. */
  streamAutoDub: boolean;
  /** Demucs model: '4s' = drums/bass/vocals/other, '6s' = + guitar/piano */
  stemModel: '4s' | '6s';
}

interface DJActions {
  // Global
  setDJModeActive: (active: boolean) => void;
  cycleDeckViewMode: () => void;
  setDeckViewMode: (mode: DeckViewMode) => void;
  setDeckPanelTab: (deck: 'A' | 'B' | 'C', tab: DeckPanelTab) => void;
  setDeckPanelOpen: (deck: 'A' | 'B' | 'C', open: boolean) => void;
  setDeckCRecordId: (id: string) => void;
  setThirdDeckActive: (active: boolean) => void;
  setCrossfader: (position: number) => void;
  setCrossfaderCurve: (curve: CrossfaderCurve) => void;
  setHamsterSwitch: (enabled: boolean) => void;
  setMasterVolume: (volume: number) => void;
  setBoothVolume: (volume: number) => void;
  setSessionMonitorVolume: (volume: number) => void;
  setCueMix: (mix: number) => void;
  setJogWheelSensitivity: (multiplier: number) => void;

  // Per-deck
  setDeckState: (deck: DeckId, partial: Partial<DeckState>) => void;
  setDeckPlaying: (deck: DeckId, playing: boolean) => void;
  setDeckPosition: (deck: DeckId, songPos: number, pattPos: number) => void;
  setDeckEQ: (deck: DeckId, band: 'low' | 'mid' | 'high', dB: number) => void;
  setDeckEQKill: (deck: DeckId, band: 'low' | 'mid' | 'high', kill: boolean) => void;
  setDeckFilter: (deck: DeckId, position: number) => void;
  setDeckFilterResonance: (deck: DeckId, q: number) => void;
  setDeckVolume: (deck: DeckId, volume: number) => void;
  setDeckTrimGain: (deck: DeckId, trimDb: number) => void;
  setDeckAutoGain: (deck: DeckId, enabled: boolean) => void;
  setDeckCuePoint: (deck: DeckId, songPos: number) => void;
  setDeckPending: (deck: DeckId, pending: PendingAction | null) => void;
  setDeckPFL: (deck: DeckId, enabled: boolean) => void;
  togglePFL: (deck: DeckId) => void;
  setDeckLoop: (deck: DeckId, mode: 'line' | 'pattern' | 'off', active: boolean) => void;
  setDeckLoopSize: (deck: DeckId, size: 1 | 2 | 4 | 8 | 16 | 32) => void;
  setLineLoopSize: (deck: DeckId, size: 1 | 2 | 4 | 8 | 16 | 32) => void;
  toggleLoop: (deck: DeckId) => void;

  // Hot cues
  setHotCue: (deck: DeckId, index: number, cue: HotCue | null) => void;
  deleteHotCue: (deck: DeckId, index: number) => void;

  // Audio loop
  setAudioLoopIn: (deck: DeckId, timeSec: number | null) => void;
  setAudioLoopOut: (deck: DeckId, timeSec: number | null) => void;
  setDeckSlip: (deck: DeckId, enabled: boolean) => void;
  setDeckKeyLock: (deck: DeckId, enabled: boolean) => void;
  toggleDeckChannel: (deck: DeckId, channel: number) => void;
  setAllDeckChannels: (deck: DeckId, enabled: boolean) => void;
  /** Toggle channel membership in the per-deck FX target set. */
  toggleFxTarget: (deck: DeckId, channel: number) => void;
  /** Replace the FX target set for a deck (pass [] to clear). */
  setFxTarget: (deck: DeckId, channels: number[]) => void;
  /** Clear the FX target set (back to "all channels" semantic). */
  clearFxTarget: (deck: DeckId) => void;
  /** Switch scope-click between mute-mask and fx-target-mask. */
  setChannelMode: (deck: DeckId, mode: 'mute' | 'fx') => void;
  resetDeck: (deck: DeckId) => void;

  // Scratch
  setDeckScratchActive: (deck: DeckId, active: boolean) => void;
  setDeckFaderLFO: (deck: DeckId, active: boolean, division?: '1/4' | '1/8' | '1/16' | '1/32') => void;
  setDeckPattern: (deck: DeckId, name: string | null) => void;

  // Pipeline
  setPipelineState: (queue: number, currentTask: string | null) => void;
  setDeckAnalysisProgress: (deck: DeckId, progress: number) => void;

  // Headphone cueing
  setCueMode: (mode: CueMode) => void;
  setCueDevice: (deviceId: string | null, deviceName?: string | null) => void;
  setCueVolume: (volume: number) => void;
  setHeadphoneSetupDone: (done: boolean) => void;

  // Auto DJ
  setAutoDJEnabled: (enabled: boolean) => void;
  setAutoDJStatus: (status: AutoDJStatus) => void;
  setAutoDJTrackIndices: (current: number, next: number) => void;
  setAutoDJConfig: (config: Partial<{ transitionBars: number; shuffle: boolean; withFilter: boolean; smartCuts: boolean; stemPreSeparation: boolean; streamAutoDub: boolean; stemModel: '4s' | '6s'; style: string; creativeRisk: number; juggleMode: string; juggleIntensity: number; scratchMode: string; scratchIntensity: number; scratchStyle: string; scratchRecords: string | string[]; scratchRender: string; scratchPhrase: ScratchPhrase | null }>) => void;
  setAutoDJSessionOrder: (order: number[]) => void;
  setDjFxActive: (id: string, deck: DeckId | null) => void;
  setAutoDJTelemetry: (telemetry: AutoDJTelemetry | null) => void;
  setAutoDJJuggleTelemetry: (telemetry: JuggleTelemetry | null) => void;
  setAutoDJScratchTelemetry: (telemetry: ScratchDJTelemetry | null) => void;
}

type DJStore = DJState & DJActions;

/**
 * The deck's position anchor follows every position write that does not
 * carry its own anchor (seeks, cue jumps, loads): re-anchored at the written
 * position now, moving at the previous rate while the deck plays. A stop
 * freezes it where it is heard.
 */
function keepPositionAnchor(d: DeckState, partial: Partial<DeckState>): void {
  if (partial.positionAnchor !== undefined) return;
  const now = clockNowMs();
  const written = partial.audioPosition ?? (partial.elapsedMs !== undefined ? partial.elapsedMs / 1000 : undefined);
  if (written !== undefined) {
    d.positionAnchor = { positionSec: written, rate: d.isPlaying ? d.positionAnchor.rate : 0, anchorMs: now };
  } else if (partial.isPlaying === false && d.positionAnchor.rate !== 0) {
    d.positionAnchor = { positionSec: positionAtFrame(d.positionAnchor, now), rate: 0, anchorMs: now };
  }
}

export const useDJStore = create<DJStore>()(
  subscribeWithSelector(immer((set) => ({
    // Initial state
    djModeActive: false,
    deckViewMode: 'visualizer' as DeckViewMode,
    deckPanelTab: { A: 'pads', B: 'pads', C: 'pads' } as Record<'A' | 'B' | 'C', DeckPanelTab>,
    deckPanelOpen: { A: false, B: false, C: false } as Record<'A' | 'B' | 'C', boolean>,
    deckCRecordId: CRATE_LOAD_ORDER[0]?.id ?? '',
    thirdDeckActive: false,
    crossfaderPosition: 0.5,
    crossfaderCurve: 'smooth' as CrossfaderCurve,
    hamsterSwitch: false,
    masterVolume: 1.0,
    boothVolume: 1,
    sessionMonitorVolume: 1,
    cueMix: 0.5,
    jogWheelSensitivity: 1.0, // default 1.0x

    decks: {
      A: makeDefaultDeckState(),
      B: makeDefaultDeckState(),
      C: makeDefaultDeckState(),
    },

    cueMode: 'none' as CueMode,
    cueDeviceId: null,
    cueDeviceName: null,
    cueVolume: 1,
    headphoneSetupDone: false,

    // Pipeline
    pipelineActive: false,
    pipelineQueue: 0,
    pipelineCurrentTask: null as string | null,

    // Auto DJ
    autoDJEnabled: false,
    autoDJStatus: 'idle' as AutoDJStatus,
    autoDJCurrentTrackIndex: 0,
    autoDJNextTrackIndex: 1,
    autoDJTransitionBars: 8,
    autoDJShuffle: false,
    autoDJWithFilter: true,
    autoDJSmartCuts: false,
    autoDJStyle: 'Classic',
    autoDJCreativeRisk: -1,
    autoDJSessionOrder: [] as number[],
    autoDJTelemetry: null as AutoDJTelemetry | null,
    // Owner decision 2026-10-11 (plan 2026-10-11-dj-juggling, section 8.2): Auto Juggle on, MUSICAL.
    // Not persisted (no storage middleware, not in the DJ environment snapshot): no migration needed.
    autoDJJuggleMode: 'MUSICAL',
    autoDJJuggleIntensity: -1,
    autoDJJuggleTelemetry: null as JuggleTelemetry | null,
    // Owner decision 2026-10-11 (scratch ledger, decision 1): Auto Scratch on, MUSICAL; style Auto. Not persisted.
    autoDJScratchMode: 'MUSICAL',
    autoDJScratchIntensity: -1,
    autoDJScratchStyle: 'auto',
    autoDJScratchRecords: 'style',
    autoDJScratchRender: DEFAULT_SCRATCH_RENDER as string,
    autoDJScratchPhrase: null,
    autoDJScratchTelemetry: null as ScratchDJTelemetry | null,
    djFxActive: {} as Record<string, DeckId | null>,
    stemPreSeparation: false,
    streamAutoDub: false,
    stemModel: '4s' as const,

    // ========================================================================
    // ACTIONS
    // ========================================================================

    setDJModeActive: (active) =>
      set((state) => {
        state.djModeActive = active;
      }),

    cycleDeckViewMode: () =>
      set((state) => {
        const order: DeckViewMode[] = ['visualizer', 'vinyl', '3d'];
        const idx = order.indexOf(state.deckViewMode);
        state.deckViewMode = order[(idx + 1) % order.length];
      }),

    setDeckViewMode: (mode) =>
      set((state) => {
        state.deckViewMode = mode;
      }),

    setDeckCRecordId: (id) => set((state) => { state.deckCRecordId = id; }),
    setDeckPanelTab: (deck, tab) =>
      set((state) => {
        state.deckPanelTab[deck] = tab;
      }),
    setDeckPanelOpen: (deck, open) =>
      set((state) => {
        state.deckPanelOpen[deck] = open;
      }),

    setThirdDeckActive: (active) =>
      set((state) => {
        state.thirdDeckActive = active;
      }),

    setCrossfader: (position) =>
      set((state) => {
        state.crossfaderPosition = Math.max(0, Math.min(1, position));
      }),

    setCrossfaderCurve: (curve) =>
      set((state) => {
        state.crossfaderCurve = curve;
      }),

    setHamsterSwitch: (enabled) =>
      set((state) => {
        state.hamsterSwitch = enabled;
      }),

    setMasterVolume: (volume) =>
      set((state) => {
        state.masterVolume = Math.max(0, Math.min(1.5, volume));
      }),

    setBoothVolume: (volume) =>
      set((state) => {
        state.boothVolume = Math.max(0, Math.min(1.5, volume));
      }),

    setSessionMonitorVolume: (volume) =>
      set((state) => {
        state.sessionMonitorVolume = Math.max(0, Math.min(1.5, volume));
      }),

    setCueMix: (mix) =>
      set((state) => {
        state.cueMix = Math.max(0, Math.min(1, mix));
      }),

    setJogWheelSensitivity: (multiplier) =>
      set((state) => {
        state.jogWheelSensitivity = Math.max(0.5, Math.min(2.0, multiplier));
      }),

    setDeckState: (deck, partial) =>
      set((state) => {
        // When loading a new track (fileName changes), explicitly clear old Serato/analysis
        // arrays first so previous data is dereferenced before new data arrives.
        // This prevents unbounded memory growth when rapidly loading tracks.
        if (partial.fileName !== undefined && partial.fileName !== state.decks[deck].fileName) {
          state.decks[deck].seratoCuePoints = [];
          state.decks[deck].seratoLoops = [];
          state.decks[deck].seratoBeatGrid = [];
          state.decks[deck].beatGrid = null;
          state.decks[deck].frequencyPeaks = null;
          state.decks[deck].waveformPeaks = null;
          // The previous track's key, energy and genre are not this track's:
          // a deck loaded without an analysis kept them (Auto DJ chose its
          // transition from the track two loads back).
          state.decks[deck].musicalKey = null;
          state.decks[deck].keyConfidence = 0;
          state.decks[deck].energy = 0.5;
          state.decks[deck].danceability = 0.5;
          state.decks[deck].trackAnalysis = null;
          state.decks[deck].genrePrimary = null;
          state.decks[deck].genreSubgenre = null;
          state.decks[deck].genreConfidence = 0;
          state.decks[deck].mood = null;
        }
        Object.assign(state.decks[deck], partial);
        keepPositionAnchor(state.decks[deck], partial);
      }),

    setDeckPlaying: (deck, playing) =>
      set((state) => {
        state.decks[deck].isPlaying = playing;
        keepPositionAnchor(state.decks[deck], { isPlaying: playing });
      }),

    setDeckPosition: (deck, songPos, pattPos) =>
      set((state) => {
        state.decks[deck].songPos = songPos;
        state.decks[deck].pattPos = pattPos;
      }),

    setDeckEQ: (deck, band, dB) =>
      set((state) => {
        const key = `eq${band.charAt(0).toUpperCase() + band.slice(1)}` as 'eqLow' | 'eqMid' | 'eqHigh';
        state.decks[deck][key] = Math.max(-12, Math.min(12, dB));
        state.decks[deck].eqPreset = null;
      }),

    setDeckEQKill: (deck, band, kill) =>
      set((state) => {
        const key = `eq${band.charAt(0).toUpperCase() + band.slice(1)}Kill` as 'eqLowKill' | 'eqMidKill' | 'eqHighKill';
        state.decks[deck][key] = kill;
      }),

    setDeckFilter: (deck, position) =>
      set((state) => {
        state.decks[deck].filterPosition = Math.max(-1, Math.min(1, position));
      }),

    setDeckFilterResonance: (deck, q) =>
      set((state) => {
        state.decks[deck].filterResonance = Math.max(0.5, Math.min(15, q));
      }),

    setDeckVolume: (deck, volume) =>
      set((state) => {
        state.decks[deck].volume = Math.max(0, Math.min(1.5, volume));
      }),

    setDeckTrimGain: (deck, trimDb) =>
      set((state) => {
        state.decks[deck].trimGain = Math.max(-12, Math.min(12, trimDb));
      }),

    setDeckAutoGain: (deck, enabled) =>
      set((state) => {
        state.decks[deck].autoGainEnabled = enabled;
      }),

    setDeckCuePoint: (deck, songPos) =>
      set((state) => {
        state.decks[deck].cuePoint = songPos;
      }),

    setDeckPending: (deck, pending) =>
      set((state) => {
        state.decks[deck].pendingAction = pending;
      }),

    setDeckPFL: (deck, enabled) =>
      set((state) => {
        state.decks[deck].pflEnabled = enabled;
      }),

    togglePFL: (deck) =>
      set((state) => {
        state.decks[deck].pflEnabled = !state.decks[deck].pflEnabled;
      }),

    setDeckLoop: (deck, mode, active) =>
      set((state) => {
        state.decks[deck].loopMode = mode;
        state.decks[deck].loopActive = active;
      }),

    setDeckLoopSize: (deck, size) =>
      set((state) => {
        state.decks[deck].lineLoopSize = size;
      }),

    setLineLoopSize: (deck, size) =>
      set((state) => {
        state.decks[deck].lineLoopSize = size;
      }),

    toggleLoop: (deck) =>
      set((state) => {
        state.decks[deck].loopActive = !state.decks[deck].loopActive;
      }),

    setHotCue: (deck, index, cue) =>
      set((state) => {
        if (index >= 0 && index < 8) {
          state.decks[deck].hotCues[index] = cue;
        }
      }),

    deleteHotCue: (deck, index) =>
      set((state) => {
        if (index >= 0 && index < 8) {
          state.decks[deck].hotCues[index] = null;
        }
      }),

    setAudioLoopIn: (deck, timeSec) =>
      set((state) => {
        state.decks[deck].audioLoopIn = timeSec;
      }),

    setAudioLoopOut: (deck, timeSec) =>
      set((state) => {
        state.decks[deck].audioLoopOut = timeSec;
      }),

    setDeckSlip: (deck, enabled) =>
      set((state) => {
        state.decks[deck].slipEnabled = enabled;
      }),

    setDeckKeyLock: (deck, enabled) =>
      set((state) => {
        state.decks[deck].keyLockEnabled = enabled;
      }),

    toggleDeckChannel: (deck, channel) =>
      set((state) => {
        state.decks[deck].channelMask ^= (1 << channel);
      }),

    setAllDeckChannels: (deck, enabled) =>
      set((state) => {
        state.decks[deck].channelMask = enabled ? 0xFFFF : 0;
      }),

    toggleFxTarget: (deck, channel) =>
      set((state) => {
        const s = state.decks[deck].fxTargetChannels;
        if (s.has(channel)) s.delete(channel);
        else s.add(channel);
      }),

    setFxTarget: (deck, channels) =>
      set((state) => {
        state.decks[deck].fxTargetChannels = new Set(channels);
      }),

    clearFxTarget: (deck) =>
      set((state) => {
        state.decks[deck].fxTargetChannels = new Set();
      }),

    setChannelMode: (deck, mode) =>
      set((state) => {
        state.decks[deck].channelModeUI = mode;
      }),

    resetDeck: (deck) =>
      set((state) => {
        state.decks[deck] = makeDefaultDeckState();
      }),

    setDeckScratchActive: (deck, active) =>
      set((state) => {
        state.decks[deck].scratchActive = active;
      }),

    setDeckFaderLFO: (deck, active, division) =>
      set((state) => {
        state.decks[deck].faderLFOActive = active;
        if (division !== undefined) {
          state.decks[deck].faderLFODivision = active ? division : null;
        } else if (!active) {
          state.decks[deck].faderLFODivision = null;
        }
      }),

    setDeckPattern: (deck, name) =>
      set((state) => {
        state.decks[deck].activePatternName = name;
      }),

    setCueMode: (mode) =>
      set((state) => {
        state.cueMode = mode;
      }),

    setCueDevice: (deviceId, deviceName) =>
      set((state) => {
        state.cueDeviceId = deviceId;
        state.cueDeviceName = deviceName ?? null;
      }),

    setCueVolume: (volume) =>
      set((state) => {
        state.cueVolume = Math.max(0, Math.min(1.5, volume));
      }),

    setHeadphoneSetupDone: (done) =>
      set((state) => {
        state.headphoneSetupDone = done;
      }),

    setPipelineState: (queue, currentTask) =>
      set((state) => {
        state.pipelineQueue = queue;
        state.pipelineCurrentTask = currentTask;
        state.pipelineActive = queue > 0 || currentTask !== null;
      }),

    setDeckAnalysisProgress: (deck, progress) =>
      set((state) => {
        state.decks[deck].analysisProgress = progress;
      }),

    // Auto DJ
    setAutoDJEnabled: (enabled) =>
      set((state) => {
        state.autoDJEnabled = enabled;
        if (!enabled) state.autoDJStatus = 'idle';
      }),

    setAutoDJStatus: (status) =>
      set((state) => {
        state.autoDJStatus = status;
      }),

    setAutoDJSessionOrder: (order) =>
      set((state) => {
        state.autoDJSessionOrder = order;
      }),

    setDjFxActive: (id, deck) =>
      set((state) => {
        if (deck === null) delete state.djFxActive[id]; else state.djFxActive[id] = deck;
      }),

    setAutoDJJuggleTelemetry: (telemetry) =>
      set((state) => {
        state.autoDJJuggleTelemetry = telemetry;
      }),

    setAutoDJScratchTelemetry: (telemetry) =>
      set((state) => {
        state.autoDJScratchTelemetry = telemetry;
      }),

    setAutoDJTelemetry: (telemetry) =>
      set((state) => {
        state.autoDJTelemetry = telemetry;
      }),

    setAutoDJTrackIndices: (current, next) =>
      set((state) => {
        state.autoDJCurrentTrackIndex = current;
        state.autoDJNextTrackIndex = next;
      }),

    setAutoDJConfig: (config) =>
      set((state) => {
        if (config.transitionBars !== undefined) state.autoDJTransitionBars = config.transitionBars;
        if (config.shuffle !== undefined) state.autoDJShuffle = config.shuffle;
        if (config.withFilter !== undefined) state.autoDJWithFilter = config.withFilter;
        if (config.smartCuts !== undefined) state.autoDJSmartCuts = config.smartCuts;
        if (config.style !== undefined) state.autoDJStyle = config.style;
        if (config.creativeRisk !== undefined) state.autoDJCreativeRisk = config.creativeRisk;
        if (config.juggleMode !== undefined) state.autoDJJuggleMode = config.juggleMode;
        if (config.juggleIntensity !== undefined) state.autoDJJuggleIntensity = config.juggleIntensity;
        if (config.scratchMode !== undefined) state.autoDJScratchMode = config.scratchMode;
        if (config.scratchIntensity !== undefined) state.autoDJScratchIntensity = config.scratchIntensity;
        if (config.scratchStyle !== undefined) state.autoDJScratchStyle = config.scratchStyle;
        if (config.scratchRecords !== undefined) state.autoDJScratchRecords = config.scratchRecords;
        if (config.scratchRender !== undefined) state.autoDJScratchRender = config.scratchRender;
        if (config.scratchPhrase !== undefined) state.autoDJScratchPhrase = config.scratchPhrase;
        if (config.stemPreSeparation !== undefined) state.stemPreSeparation = config.stemPreSeparation;
        if (config.streamAutoDub !== undefined) state.streamAutoDub = config.streamAutoDub;
        if (config.stemModel !== undefined) state.stemModel = config.stemModel;
      }),
  })))
);

// ============================================================================
// CONVENIENCE SELECTORS
// ============================================================================

export const useDJModeActive = () => useDJStore((s) => s.djModeActive);
export const useDeckViewMode = () => useDJStore((s) => s.deckViewMode);
/** @deprecated Use useDeckViewMode instead */
export const useVinylMode = () => useDJStore((s) => s.deckViewMode !== 'visualizer');
export const useThirdDeckActive = () => useDJStore((s) => s.thirdDeckActive);
export const useDeckState = (deck: DeckId) => useDJStore((s) => s.decks[deck]);
export const useCrossfader = () => useDJStore((s) => s.crossfaderPosition);
export const useCrossfaderCurve = () => useDJStore((s) => s.crossfaderCurve);

// ============================================================================
// DECK C'S TEMPO (owner report 2026-10-13: Deck C showed 125 - the store default - while A and B played at 100)
// ============================================================================

/**
 * The set's master clock: the beat deck the set is heard on - the one playing A/B deck, or with both playing the
 * one the crossfader favours (A at the centre). Null when neither plays.
 */
export function setMasterDeck(s: Pick<DJStore, 'decks' | 'crossfaderPosition'>): 'A' | 'B' | null {
  const a = s.decks.A.isPlaying, b = s.decks.B.isPlaying;
  if (a && b) return s.crossfaderPosition > 0.5 ? 'B' : 'A';
  return a ? 'A' : b ? 'B' : null;
}

/**
 * The one writer of Deck C's tempo while it is the scratch deck (no track of its own): the master deck's tempo,
 * as that deck shows it. Every reader - the display, a pad's or the MCP's scratch stroke on Deck C - reads
 * `decks.C.effectiveBPM`. A track loaded on Deck C keeps its own tempo.
 */
function followSetTempo(s: DJStore): void {
  if (s.decks.C.fileName) return;
  const m = setMasterDeck(s);
  if (!m) return;
  const bpm = s.decks[m].effectiveBPM;
  if (bpm > 0 && (s.decks.C.effectiveBPM !== bpm || s.decks.C.detectedBPM !== bpm)) s.setDeckState('C', { effectiveBPM: bpm, detectedBPM: bpm });
}
useDJStore.subscribe(
  (s) => [s.decks.A.isPlaying, s.decks.B.isPlaying, s.decks.A.effectiveBPM, s.decks.B.effectiveBPM, s.crossfaderPosition, s.decks.C.fileName, s.decks.C.effectiveBPM] as const,
  () => followSetTempo(useDJStore.getState()),
  { equalityFn: (x, y) => x.every((v, i) => v === y[i]) },
);
