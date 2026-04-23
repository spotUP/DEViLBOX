/**
 * ToneEngine - Tone.js Audio Engine Wrapper
 * Manages Tone.js lifecycle, instruments, master effects, and audio context
 */

import * as Tone from 'tone';
import type { InstrumentConfig, EffectConfig } from '@typedefs/instrument';
import type { DevilboxSynth } from '@typedefs/synth';
import { isDevilboxSynth } from '@typedefs/synth';
import { DB303Synth, DB303Synth as JC303Synth } from './db303';
// MAMESynth imported via MAMEBaseSynth
import { MAMEBaseSynth } from './mame/MAMEBaseSynth';
import { InstrumentFactory } from './InstrumentFactory';
import { periodToNoteIndex, getPeriodExtended, _registerToneEngineRef } from './effects/PeriodTables';
import { AmigaFilter } from './effects/AmigaFilter';
import { TrackerEnvelope } from './TrackerEnvelope';
import { InstrumentAnalyser } from './InstrumentAnalyser';
import { FurnaceChipEngine } from './chips/FurnaceChipEngine';
import { FurnaceDispatchSynth } from './furnace-dispatch/FurnaceDispatchSynth';
import { FurnaceDispatchEngine } from './furnace-dispatch/FurnaceDispatchEngine';
import { FurnaceSynth } from './FurnaceSynth';
import { OPL3Synth } from './opl3/OPL3Synth';
import { normalizeUrl } from '@utils/urlUtils';
import { getNativeAudioNode, setDevilboxAudioContext } from '@utils/audio-context';
import { VinylNoiseEffect } from './effects/VinylNoiseEffect';
import { TumultEffect } from './effects/TumultEffect';
import { isEffectBpmSynced, getEffectSyncDivision, computeSyncedValue, SYNCABLE_EFFECT_PARAMS } from './bpmSync';
import { reportSynthError } from '../stores/useSynthErrorStore';
import { SYNTH_REGISTRY } from './vstbridge/synth-registry';
import { WAMSynth } from './wam/WAMSynth';
import { CHIP_SYNTH_DEFS } from '../constants/chipParameters';
import { useRomDialogStore } from '../stores/useRomDialogStore';
import { BlepManager } from './blep/BlepManager';
import { preloadTR909Resources } from './tr909/TR909Synth';
import { SynthRegistry } from './registry/SynthRegistry';
import { VoiceAllocator } from './audio/VoiceAllocator';
import { getSendBusManager } from './SendBusManager';
import { getNormalizedVolume } from './factories/volumeNormalization';

// Extracted modules
import { applyEffectParametersDiff as _applyEffectParamsDiff, applyBpmSyncedParam as _applyBpmSyncedParam } from './tone/EffectParameterEngine';
import { applyFurnaceSynthEffect as _applyFurnaceSynthEffect } from './tone/FurnaceEffects';
import { MetronomeManager } from './tone/Metronome';
import { AutoGainController } from './tone/AutoGainController';
import {
  type SynthUpdateContext,
  updateWAMParameters as _updateWAMParameters,
  updateTB303Parameters as _updateTB303Parameters,
  updateFurnaceInstrument as _updateFurnaceInstrument,
  updateHarmonicSynthParameters as _updateHarmonicSynthParameters,
  getMAMESynthHandle as _getMAMESynthHandle,
  getMAMEChipSynth as _getMAMEChipSynth,
  updateMAMEParameters as _updateMAMEParameters,
  updateMAMEChipParam as _updateMAMEChipParam,
  loadMAMEChipPreset as _loadMAMEChipPreset,
  updateMAMEChipTextParam as _updateMAMEChipTextParam,
  speakMAMEChipText as _speakMAMEChipText,
  loadSynthROM as _loadSynthROM,
  updateDubSirenParameters as _updateDubSirenParameters,
  updateSpaceLaserParameters as _updateSpaceLaserParameters,
  updateV2Parameters as _updateV2Parameters,
  updateSynareParameters as _updateSynareParameters,
  updateFurnaceParameters as _updateFurnaceParameters,
  updateComplexSynthParameters as _updateComplexSynthParameters,
  updateToneJsSynthInPlace as _updateToneJsSynthInPlace,
  updateBuzzmachineParameters as _updateBuzzmachineParameters,
  updateTB303Pedalboard as _updateTB303Pedalboard,
  updateChipSynthArpeggio as _updateChipSynthArpeggio,
  getChipSynthArpeggioStep as _getChipSynthArpeggioStep,
  isChipSynthArpeggioPlaying as _isChipSynthArpeggioPlaying,
  updateSonicArrangerParameters as _updateSonicArrangerParameters,
  updateNativeSynthConfig as _updateNativeSynthConfig,
} from './tone/SynthParameterUpdates';
import {
  type ChannelRoutingContext,
  type ChannelOutput,
  ChannelMeterState,
  triggerChannelMeter as _triggerChannelMeter,
  clearChannelTriggerLevels as _clearChannelTriggerLevels,
  getChannelTriggerLevels as _getChannelTriggerLevels,
  getChannelTriggerGenerations as _getChannelTriggerGenerations,
  getChannelOutput as _getChannelOutput,
  createVoice as _createVoice,
  stopVoice as _stopVoice,
  setChannelVolume as _setChannelVolume,
  setChannelFilterCutoff as _setChannelFilterCutoff,
  setChannelFilterResonance as _setChannelFilterResonance,
  setChannelPan as _setChannelPan,
  setChannelFunkRepeat as _setChannelFunkRepeat,
  handlePastNoteAction as _handlePastNoteAction,
  setChannelPitch as _setChannelPitch,
  setChannelFrequency as _setChannelFrequency,
  initChannelPitch as _initChannelPitch,
  clearChannelPitch as _clearChannelPitch,
  setChannelMute as _setChannelMute,
  setMixerChannelVolume as _setMixerChannelVolume,
  setMixerChannelPan as _setMixerChannelPan,
  updateMuteStates as _updateMuteStates,
  isChannelMuted as _isChannelMuted,
  disposeChannelOutputs as _disposeChannelOutputs,
  getChannelLevels as _getChannelLevels,
  updateChannelEnvelopes as _updateChannelEnvelopes,
  setChannelKeyOff as _setChannelKeyOff,
  updateRealtimeChannelLevels as _updateRealtimeChannelLevels,
  getRealtimeChannelLevels as _getRealtimeChannelLevels,
} from './tone/ChannelRouting';
import {
  type MasterEffectsContext,
  rebuildMasterEffects as _rebuildMasterEffects,
  getMasterEffectNode as _getMasterEffectNode,
  getMasterEffectAnalysers as _getMasterEffectAnalysers,
  updateMasterEffectParams as _updateMasterEffectParams,
  updateInstrumentEffectParams as _updateInstrumentEffectParams,
  registerSidechainResolver,
} from './tone/MasterEffectsChain';
import { captureLiveAudio, mixAndNormalize, MONO_WASM_SYNTHS } from '@/lib/audio/LiveCapture';
import { notifyInstrumentAttack, notifyInstrumentRelease } from './instrumentPlaybackTracker';
import {
  type InstrumentEffectsContext,
  buildInstrumentEffectChain as _buildInstrumentEffectChain,
  rebuildInstrumentEffects as _rebuildInstrumentEffects,
  setInstrumentOutputOverride as _setInstrumentOutputOverride,
  removeInstrumentOutputOverride as _removeInstrumentOutputOverride,
  throwInstrumentToEffect as _throwInstrumentToEffect,
  disposeInstrumentEffectChain as _disposeInstrumentEffectChain,
  clearConnectedNativeOutputs,
} from './tone/InstrumentEffectsChain';

// Module-level frequency cache: avoids creating transient Tone.Frequency objects on every call.
// Note name strings (e.g. "C4", "D#3") are finite and reused, so this cache stays small.
const _freqCache = new Map<string, number>();
function cachedFrequency(note: string): number {
  let freq = _freqCache.get(note);
  if (freq === undefined) {
    freq = Tone.Frequency(note).toFrequency();
    _freqCache.set(note, freq);
  }
  return freq;
}

interface VoiceState {
  instrument: Tone.ToneAudioNode | DevilboxSynth;
  note: string;
  volumeEnv: TrackerEnvelope;
  panningEnv: TrackerEnvelope;
  pitchEnv: TrackerEnvelope;
  fadeout: number;
  fadeoutStep: number;
  isKeyOff: boolean;
  isFilterEnvelope: boolean;
  lastCutoff: number;
  lastResonance: number;
  nodes: {
    gain: Tone.Gain;
    filter: Tone.Filter | AudioWorkletNode;
    panner: Tone.Panner;
  };
}

export class ToneEngine {
  private static instance: ToneEngine | null = null;
  private static itFilterWorkletLoaded: boolean = false; // Track if ITFilter worklet is loaded
  private static itFilterWorkletPromise: Promise<void> | null = null; // Promise for ITFilter loading

  // Master routing chain (AmigaFilter bypassed — players have their own):
  // - Tracker instruments → masterInput → masterEffectsInput → [master fx?] → blepInput → [BLEP?] → safetyLimiter → exportTap → masterChannel → destination
  // - DevilboxSynths → synthBus ────────→ masterEffectsInput → [master fx?] → blepInput → [BLEP?] → safetyLimiter → exportTap → masterChannel → destination
  public masterInput: Tone.Gain; // Where tracker instruments connect
  public synthBus: Tone.Gain; // Bypass bus for DevilboxSynths
  private synthBusMeter: Tone.Meter; // Level meter on synthBus for WASM engine metering
  private masterMeter: Tone.Meter; // Level meter at masterEffectsInput merge point
  private pitchResamplerNode: AudioWorkletNode | null = null; // Pitch resampler for WASM engines
  public masterEffectsInput: Tone.Gain; // Merge point for master effects (both paths feed in here)
  public blepInput: Tone.Gain; // BLEP insertion point — isolates BLEP routing from effects chain rebuilds
  // Safety limiter — prevents channel summing from exceeding 0 dBFS at destination.
  // 16 channels at unity gain can peak at ±16.0 (~+24 dB), destroying WAV exports
  // and screen recordings. This near-brickwall compressor catches those peaks.
  public safetyLimiter: Tone.Compressor;
  // Post-limiter tap for WAV/MP3 export — captures the limited signal so exports
  // match what the user hears through speakers (post-limiter, pre-master-volume).
  public exportTap: Tone.Gain;
  public masterChannel: Tone.Channel; // Final output with volume/pan
  public analyser: Tone.Analyser;
  // FFT for frequency visualization
  public fft: Tone.FFT;
  private analysersConnected: boolean = false;

  // Auto-gain: proportional controller that balances sample bus vs synth bus levels
  private autoGainSampleCorr: number = 0; // dB correction applied on top of manual gain
  private autoGainSynthCorr: number = 0;
  private _manualSampleGainDb: number = 0; // tracks last setSampleBusGain arg
  private _manualSynthGainDb: number = 0;
  private _masterVolumeDb: number = -6;   // tracks intended master volume (avoids race in stop())

  // Native AudioContext — owned by DEViLBOX, shared with Tone.js via Tone.setContext()
  // This allows WASM/WAM synths to use the real BaseAudioContext directly.
  private _nativeContext: AudioContext | null = null;

  // BLEP (Band-Limited Step) processor for reducing aliasing
  private blepManager: BlepManager = new BlepManager();

  // High-performance WASM instance for DSP and scheduling
  private wasmInstance: WebAssembly.Exports | null = null;

  // Global playback rate multiplier for pitch shifting (DJ slider, etc.)
  private globalPlaybackRate: number = 1.0;
  // Global detune in cents for pitch shifting synths (Wxx effect / DJ slider)
  private globalDetuneCents: number = 0;

  // Instruments keyed by numeric composite key (instrumentId<<16 | channelIndex) for per-channel independence
  public instruments: Map<number, Tone.ToneAudioNode | DevilboxSynth>;
  // Track synth types for proper release handling
  private instrumentSynthTypes: Map<number, string> = new Map();
  // SunVox output connected to synthBus (reset on disposeAllInstruments to reconnect on next song)
  private _sunvoxOutputConnected = false;
  // Track loading promises for samplers/players (keyed by instrument key)
  private instrumentLoadingPromises: Map<number, Promise<void>> = new Map();
  // Store decoded AudioBuffers for TrackerReplayer access (keyed by instrument ID)
  private decodedAudioBuffers: Map<number, AudioBuffer> = new Map();

  // Polyphonic voice allocation for live keyboard/MIDI playing
  // Maps note (e.g., "C4") to channel index used for that note
  private liveVoiceAllocation: Map<string, number> = new Map();
  // Voice allocator with priority-based stealing (replaces simple pool)
  private voiceAllocator: VoiceAllocator;
  private static readonly LIVE_VOICE_BASE_CHANNEL = 100; // Start at channel 100 to avoid tracker channels
  private static readonly MAX_LIVE_VOICES = 16;

  // Active voices per channel (for IT NNA support)
  private activeVoices: Map<number, VoiceState[]> = new Map();
  // Per-channel voice limit (0 = unlimited)
  private channelMaxVoices: Map<number, number> = new Map();

  // Master effects chain
  private masterEffectsNodes: Tone.ToneAudioNode[] = [];
  private masterEffectConfigs: Map<string, { node: Tone.ToneAudioNode; config: EffectConfig }> = new Map();
  private masterEffectsRebuildVersion = 0;
  // Pre/post AnalyserNode taps for each master effect (for visualizers)
  private masterEffectAnalysers: Map<string, { pre: AnalyserNode; post: AnalyserNode }> = new Map();
  private _isPlaying = false;

  // Track native engine routing destinations (engine key → gain node + connected destinations)
  // Supports dynamic re-routing for DJ mode (deck-specific routing) vs tracker mode (synthBus)
  private nativeEngineRouting: Map<string, { gain: GainNode; destinations: Set<AudioNode> }> = new Map();

  // Per-channel audio routing (volume, pan, mute/solo, metering)
  private channelOutputs: Map<number, {
    input: Tone.Gain;
    channel: Tone.Channel;
    meter: Tone.Meter;
  }> = new Map();

  // Channel mute/solo state for quick lookup during playback
  private channelMuteStates: Map<number, boolean> = new Map(); // true = should be muted

  // Per-channel pitch state for ProTracker effects (arpeggio, portamento, vibrato)
  // Tracks: active instrument key, base playback rate, current pitch offset
  private channelPitchState: Map<number, {
    instrumentKey: number;
    basePlaybackRate: number;  // For samplers/players
    baseFrequency: number;     // For synths (Hz)
    currentPitchMult: number;  // Current pitch multiplier (1.0 = no change)
  }> = new Map();

  // Track active looping players per channel (to stop when new note triggers)
  private channelActivePlayer: Map<number, Tone.Player> = new Map();

  // Active slice players for reference-based slicing (keyed by "instrumentId-note")
  private slicePlayersMap: Map<string, Tone.Player> = new Map();

  // Per-channel last note state for slide/portamento effects (non-TB303 synths)
  // Tracks the last triggered note frequency so slides can glide to the new note
  private channelLastNote: Map<number, {
    frequency: number;    // Last note frequency in Hz
    time: number;         // When the note was triggered (for time-based decisions)
    instrumentId: number; // Which instrument played it
  }> = new Map();




  // Slide time constant (RC circuit time constant, similar to TB-303's ~60ms)
  private static readonly SLIDE_TIME_CONSTANT = 0.06; // 60ms slide time
  // Accent velocity boost factor
  private static readonly ACCENT_BOOST = 1.35; // 35% velocity increase for accents

  /** Enable note trigger debug logging. Toggle: (window as any).NOTE_DEBUG = true/false */
  public static get NOTE_DEBUG(): boolean { return (globalThis as any).__NOTE_DEBUG ?? false; }
  public static set NOTE_DEBUG(v: boolean) { (globalThis as any).__NOTE_DEBUG = v; }

  // ===== PERFORMANCE OPTIMIZATION: Pre-computed lookup tables =====

  // MIDI note frequency LUT (128 entries, A4=440Hz standard)
  public static readonly MIDI_FREQ_LUT: Float64Array = (() => {
    const lut = new Float64Array(128);
    for (let i = 0; i < 128; i++) {
      lut[i] = 440 * Math.pow(2, (i - 69) / 12);
    }
    return lut;
  })();

  // Filter cutoff frequency LUT (128 entries, exponential curve 100Hz to 10kHz)
  private static readonly FILTER_CUTOFF_LUT: Float64Array = (() => {
    const lut = new Float64Array(128);
    for (let i = 0; i < 128; i++) {
      // Exponential curve: 100 * 100^(i/127) gives range ~100Hz to ~10kHz
      lut[i] = 100 * Math.pow(100, i / 127);
    }
    return lut;
  })();

  // Pitch cents LUT for common pitch multipliers (avoid Math.log2 in hot path)
  public static readonly PITCH_CENTS_CACHE: Map<number, number> = new Map();

  // Metronome (delegated to MetronomeManager)
  private metronome: MetronomeManager | null = null;

  // Auto-gain controller (delegated to AutoGainController)
  private autoGain: AutoGainController | null = null;

  // Channel metering state (delegated to ChannelMeterState)
  private channelMeter: ChannelMeterState = new ChannelMeterState();

  // Amiga audio filter (E0x command) - 1:1 hardware emulation
  // E00 = filter ON (LED on), E01 = filter OFF (LED off/bypassed)
  private amigaFilter: AmigaFilter;
  private amigaFilterEnabled: boolean = true; // Default: filter ON (like real Amiga)

  // Per-instrument effect chains (keyed by numeric composite key instrumentId<<16 | channelIndex)
  private instrumentEffectChains: Map<number, {
    effects: Tone.ToneAudioNode[];
    output: Tone.Gain;
    bridge?: Tone.Gain;
  }> = new Map();

  // Per-instrument effect nodes indexed by effectId for real-time parameter updates
  private instrumentEffectNodes: Map<string, { node: Tone.ToneAudioNode; config: EffectConfig }> = new Map();

  // Per-instrument analysers for visualization (keyed by instrumentId)
  // Lazy-created: only exists when visualization requests it
  private instrumentAnalysers: Map<number, InstrumentAnalyser> = new Map();

  // Output overrides for DJ mode: routes instrument effect chain output
  // to a deck's deckGain instead of masterInput/synthBus
  private instrumentOutputOverrides: Map<number, Tone.ToneAudioNode> = new Map();

  // Track pending releaseAll gain-restore timeouts per instrument key
  // Prevents race condition where double-releaseAll captures gain=0 and restores to 0
  private releaseRestoreTimeouts: Map<number, ReturnType<typeof setTimeout>> = new Map();

  // Guard against concurrent preloadInstruments calls
  private preloadGeneration = 0;

  private constructor() {
    // === Phase 1: DEViLBOX owns the native AudioContext ===
    // Create the native AudioContext FIRST, before any Tone.js nodes.
    // This ensures all Tone.js nodes are created on the same context as native synths.
    // The context starts in 'suspended' state — init() resumes it after user interaction.
    //
    // NOTE: Do NOT hardcode sampleRate. iOS Safari natively uses 48000 Hz and
    // forcing 44100 can cause silent output or context creation failure.
    // Let the browser pick the optimal rate for the device hardware.
    this._nativeContext = new AudioContext({ latencyHint: 'interactive' });
    Tone.setContext(this._nativeContext);
    // Register globally so WAM/WASM synths can access it without importing ToneEngine
    setDevilboxAudioContext(this._nativeContext);

    // Master input (where all instruments connect)
    this.masterInput = new Tone.Gain(1);

    // Amiga audio filter (E0x) - 1:1 hardware emulation
    this.amigaFilter = new AmigaFilter();

    // Master output channel with volume/pan control
    // channelCount: 2 required to preserve stereo (default is 1 = mono downmix!)
    this.masterChannel = new Tone.Channel({
      volume: 0,
      pan: 0,
      channelCount: 2,
    }).toDestination();

    // Analyzers for visualization (created but not connected by default)
    this.analyser = new Tone.Analyser('waveform', 1024);
    this.fft = new Tone.FFT(1024);

    // Don't connect analyzers by default - use enableAnalysers() to connect when needed

    // Master effects merge point — both tracker and synth audio meet here
    this.masterEffectsInput = new Tone.Gain(1);

    // BLEP insertion point — sits between effects chain end and safetyLimiter.
    // This node is never disconnected by rebuildMasterEffects, so BLEP routing stays stable.
    this.blepInput = new Tone.Gain(1);

    // Safety limiter — near-brickwall compressor to prevent channel summing overloads.
    // Without this, 16 channels at 0 dB can produce ±16.0 peaks (+24 dB over full scale),
    // destroying WAV exports and screen recordings while sounding OK through speakers
    // (because the DAC clips inaudibly at moderate volume).
    this.safetyLimiter = new Tone.Compressor({
      threshold: -1,    // Start compressing near full scale
      ratio: 20,        // Near-brickwall limiting
      attack: 0.003,    // 3ms — fast enough for transients
      release: 0.25,    // Smooth release
      knee: 1,          // Tight knee
    });

    // Post-limiter export tap — WAV/MP3 captures tap here (post-limiter, pre-master-volume)
    this.exportTap = new Tone.Gain(1);

    // Register sidechain resolver so wireMasterSidechain can access channel outputs
    // without a circular dynamic import (this module imports MasterEffectsChain)
    registerSidechainResolver(
      (index: number) => this.getChannelOutputByIndex(index),
      () => this.masterEffectsInput,
      () => this.blepInput,
    );

    // Default routing (with safety limiter to prevent clipping from channel summing):
    //   masterInput → masterEffectsInput → blepInput → [BLEP?] → safetyLimiter → exportTap → masterChannel
    //   synthBus ──→ masterEffectsInput → blepInput → [BLEP?] → safetyLimiter → exportTap → masterChannel
    this.masterInput.connect(this.masterEffectsInput);
    this.masterEffectsInput.connect(this.blepInput);
    // blepInput → safetyLimiter is handled by reconnectBlepChain (via BlepManager)
    this.blepInput.connect(this.safetyLimiter);
    // Static tail: safetyLimiter → exportTap → masterChannel (never rebuilt)
    this.safetyLimiter.connect(this.exportTap);
    this.exportTap.connect(this.masterChannel);

    // Synth bus bypasses AmigaFilter for native synths (DB303, Vital, etc.)
    this.synthBus = new Tone.Gain(1);
    // PitchResampler inserted async between synthBus and masterEffectsInput (see initPitchResampler)
    this.synthBus.connect(this.masterEffectsInput);

    // Initialize send/return buses — returns feed into masterEffectsInput
    getSendBusManager().init(this.masterEffectsInput);

    // Meters start disconnected to avoid idle CPU usage from AnalyserNode processing.
    // Connected on play via connectMeters(), disconnected on stop via disconnectMeters().
    this.synthBusMeter = new Tone.Meter({ normalRange: true });
    this.masterMeter = new Tone.Meter({ normalRange: true });

    // Init pitch resampler for WASM engine pitch shifting (async — falls back to direct connection)
    this.initPitchResampler();

    /* Pre-register the dub-bus feedback-tap NaN/soft-limit worklet on the
       shared AudioContext. DubBus is constructed later by DrumPadEngine;
       by the time its constructor runs, this addModule promise is usually
       resolved so the worklet can be instantiated synchronously on the
       feedback tap — closing the race window where the placeholder
       passthrough GainNode would leak NaN from an echo-engine swap into
       the feedback biquad chain and latch all 5 biquads to "state is
       bad" (the King Tubby preset symptom). Fire-and-forget; DubBus
       also retries the load itself as a safety net. */
    try {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      (Tone.getContext().rawContext as AudioContext).audioWorklet
        .addModule(`${base}worklets/nan-scrubber.worklet.js`)
        .catch((e) => {
          console.warn('[ToneEngine] nan-scrubber worklet pre-load failed (dub bus will fallback):', e);
        });
    } catch { /* ok — DubBus has its own load path */ }

    // Instrument map
    this.instruments = new Map();

    // Initialize polyphonic voice allocator with priority-based stealing
    this.voiceAllocator = new VoiceAllocator(
      ToneEngine.LIVE_VOICE_BASE_CHANNEL,
      ToneEngine.MAX_LIVE_VOICES
    );
  }

  /**
   * Singleton pattern - get or create instance
   */
  public static getInstance(): ToneEngine {
    if (!ToneEngine.instance) {
      ToneEngine.instance = new ToneEngine();
      // Expose for console diagnostics (scripts/db303-knob-diag.js)
      (window as unknown as Record<string, unknown>)._toneEngine = ToneEngine.instance;
    }
    return ToneEngine.instance;
  }

  /**
   * Get the native AudioContext owned by DEViLBOX.
   * Always available — created in the constructor before any Tone.js nodes.
   * WASM/WAM synths should use getDevilboxAudioContext() from audio-context.ts
   * to avoid circular imports. This accessor is for ToneEngine-internal use.
   */
  public get nativeContext(): AudioContext {
    return this._nativeContext!;
  }

  /**
   * Connect a native AudioNode (from a DevilboxSynth) into a Tone.js effect chain.
   * Bridges the native → Tone.js boundary using getNativeAudioNode().
   */
  public connectNativeSynth(synthOutput: AudioNode, destination: Tone.ToneAudioNode): void {
    console.log('[ToneEngine] connectNativeSynth called, synthOutput:', synthOutput.constructor?.name, 'destination:', destination.constructor?.name);
    const nativeDestination = getNativeAudioNode(destination as any);
    if (nativeDestination) {
      // Validate contexts match before connecting
      const sourceCtx = synthOutput.context;
      const destCtx = nativeDestination.context;

      if (sourceCtx !== destCtx) {
        console.warn('[ToneEngine] AudioContext mismatch — bridging via MediaStream.',
          'Source:', sourceCtx.state, 'Dest:', destCtx.state);
        // Create a cross-context bridge: source → MediaStreamDestination → MediaStreamSource → dest
        try {
          const msDest = (sourceCtx as AudioContext).createMediaStreamDestination();
          synthOutput.connect(msDest);
          const msSource = (destCtx as AudioContext).createMediaStreamSource(msDest.stream);
          msSource.connect(nativeDestination);
          console.log('[ToneEngine] connectNativeSynth: cross-context bridge established');
          return;
        } catch (bridgeErr) {
          console.error('[ToneEngine] Cross-context bridge failed:', bridgeErr);
          return;
        }
      }

      try {
        synthOutput.connect(nativeDestination);
        console.log('[ToneEngine] connectNativeSynth: connected successfully');
      } catch (e) {
        console.error('[ToneEngine] connectNativeSynth failed:', e,
          'synthOutput context:', sourceCtx.constructor?.name,
          'dest context:', destCtx.constructor?.name);
      }
    } else {
      console.log('[ToneEngine] Could not find native AudioNode in Tone.js destination, falling back');
      // Last resort: try connecting to Tone.js input property
      const destWithInput = destination as unknown as { input?: AudioNode };
      if (destWithInput.input) {
        try {
          synthOutput.connect(destWithInput.input);
          console.log('[ToneEngine] connectNativeSynth: fallback connected successfully');
        } catch (e) {
          console.error('[ToneEngine] connectNativeSynth fallback also failed:', e);
        }
      }
    }
  }

  /**
   * Route a native chip engine's audio output to synthBus so it goes through the
   * master effects chain. Chip engines (FurnaceChipEngine, FurnaceDispatchEngine)
   * have their own native AudioWorklets whose output needs to feed into synthBus
   * instead of going directly to destination. Only routes each engine once (to synthBus
   * by default). Use rerouteNativeEngine() to redirect to a different destination (e.g. DJ deck).
   */
  public routeNativeEngineOutput(instrument: Tone.ToneAudioNode | DevilboxSynth): void {
    const nativeSynthBus = getNativeAudioNode(this.synthBus as any);
    if (!nativeSynthBus) return;

    let engineKey: string;
    let engineGain: GainNode | null = null;

    if (instrument instanceof FurnaceSynth) {
      engineKey = 'FurnaceChipEngine';
      const chipEngine = FurnaceChipEngine.getInstance();
      if (!chipEngine.isInitialized()) return;
      engineGain = chipEngine.getNativeOutput();
    } else if (instrument instanceof FurnaceDispatchSynth) {
      engineKey = 'FurnaceDispatchEngine';
      const dispatchEngine = FurnaceDispatchEngine.getInstance();
      if (!dispatchEngine.isInitialized) return;
      engineGain = dispatchEngine.getOrCreateSharedGain();
    } else {
      // DevilboxSynths with GainNode outputs (FP, JC, SA, HivelySynth, UADESynth, etc.)
      // are routed by buildInstrumentEffectChain — no extra routing needed here.
      // Only FurnaceSynth/FurnaceDispatchSynth need explicit routing because their
      // shared engine GainNode is separate from the synth instance's output.
      return;
    }

    if (!engineGain) return;

    let routing = this.nativeEngineRouting.get(engineKey);
    if (!routing) {
      routing = { gain: engineGain, destinations: new Set() };
      this.nativeEngineRouting.set(engineKey, routing);
    } else if (routing.gain !== engineGain) {
      // New instance of same synth type (e.g. SunVox song reload after reset).
      // Disconnect the old GainNode from all its destinations and re-route to the new one.
      routing.destinations.forEach((dest) => {
        try { routing!.gain.disconnect(dest); } catch { /* already disconnected */ }
      });
      routing.gain = engineGain;
      routing.destinations.clear();
    }

    // Default: connect to synthBus if not connected to anything yet
    if (routing.destinations.size === 0) {
      engineGain.connect(nativeSynthBus);
      routing.destinations.add(nativeSynthBus);
      console.log(`[ToneEngine] Routed ${engineKey} output → synthBus`);
    }
  }

  /**
   * Redirect a native engine's audio output to a new destination (e.g. a DJ deck's deckGain).
   * Disconnects from all current destinations and connects to the new one.
   */
  public rerouteNativeEngine(engineKey: string, newDestination: AudioNode): void {
    const routing = this.nativeEngineRouting.get(engineKey);
    if (!routing?.gain) return;

    // Disconnect from all current destinations
    for (const dest of routing.destinations) {
      try { routing.gain.disconnect(dest); } catch { /* not connected */ }
    }
    routing.destinations.clear();

    // Connect to new destination
    routing.gain.connect(newDestination);
    routing.destinations.add(newDestination);
    console.log(`[ToneEngine] Rerouted ${engineKey} output → DJ deck`);
  }

  /**
   * Restore a native engine's audio output back to synthBus (default routing).
   * Called when a DJ deck unloads a Furnace song or disposes.
   */
  public restoreNativeEngineRouting(engineKey: string): void {
    const routing = this.nativeEngineRouting.get(engineKey);
    if (!routing?.gain) return;

    const nativeSynthBus = getNativeAudioNode(this.synthBus as any);
    if (!nativeSynthBus) return;

    // Already connected to synthBus only? Nothing to do.
    if (routing.destinations.has(nativeSynthBus) && routing.destinations.size === 1) return;

    // Disconnect from all current destinations
    for (const dest of routing.destinations) {
      try { routing.gain.disconnect(dest); } catch { /* not connected */ }
    }
    routing.destinations.clear();

    // Reconnect to synthBus
    routing.gain.connect(nativeSynthBus);
    routing.destinations.add(nativeSynthBus);
    console.log(`[ToneEngine] Restored ${engineKey} output → synthBus`);
  }

  /**
   * Stop a native engine (UADE/Hively) by type name.
   */
  public async stopNativeEngine(type: string): Promise<void> {
    if (type === 'UADESynth') {
      const { UADEEngine } = await import('./uade/UADEEngine');
      if (UADEEngine.hasInstance()) {
        UADEEngine.getInstance().stop();
      }
    } else if (type === 'HivelySynth') {
      const { HivelyEngine } = await import('./hively/HivelyEngine');
      if (HivelyEngine.hasInstance()) {
        HivelyEngine.getInstance().stop();
      }
    } else if (type === 'SymphonieSynth') {
      const { SymphonieEngine } = await import('./symphonie/SymphonieEngine');
      if (SymphonieEngine.hasInstance()) {
        SymphonieEngine.getInstance().stop();
      }
    } else if (type === 'MusicLineSynth') {
      const { MusicLineEngine } = await import('./musicline/MusicLineEngine');
      if (MusicLineEngine.hasInstance()) {
        MusicLineEngine.getInstance().stop();
      }
    }
  }

  /**
   * Helper to decode an ArrayBuffer to an AudioBuffer
   * Also handles AudioBuffer (returns as-is) and Uint8Array (converts to ArrayBuffer)
   */
  public async decodeAudioData(buffer: ArrayBuffer | AudioBuffer | Uint8Array): Promise<AudioBuffer> {
    // If already an AudioBuffer, return as-is
    if (buffer instanceof AudioBuffer) {
      return buffer;
    }

    // Normalize to ArrayBuffer
    let arrayBuffer: ArrayBuffer;
    if (buffer instanceof Uint8Array) {
      arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    } else if (buffer instanceof ArrayBuffer) {
      arrayBuffer = buffer;
    } else {
      console.error('[ToneEngine] decodeAudioData: expected ArrayBuffer but got:', typeof buffer, buffer);
      throw new Error(`Invalid buffer type: ${typeof buffer}`);
    }

    // Try browser's native decoder first (handles MP3, OGG, FLAC, etc.)
    try {
      return await Tone.getContext().rawContext.decodeAudioData(arrayBuffer.slice(0));
    } catch {
      // Native decoder failed — fall back to manual WAV parser for low sample
      // rate WAVs (e.g. 8363 Hz from MOD/tracker imports) that browsers reject
      const { isWavBuffer, parseWavToAudioBuffer } = await import('@/utils/audio/wavParser');
      if (isWavBuffer(arrayBuffer)) {
        return parseWavToAudioBuffer(arrayBuffer.slice(0));
      }
      // Not a WAV — re-throw original error
      throw new Error('Unable to decode audio data');
    }
  }

  /**
   * Helper to convert an AudioBuffer back to an ArrayBuffer (Float32 PCM)
   * Note: This returns the raw Float32 data of the first channel for now.
   * Proper multi-channel interleaved encoding is a future enhancement.
   */
  public async encodeAudioData(buffer: AudioBuffer): Promise<ArrayBuffer> {
    return buffer.getChannelData(0).buffer.slice(0);
  }

  /**
   * Get a decoded AudioBuffer for an instrument (used by TrackerReplayer)
   * Returns undefined if the instrument hasn't been loaded yet
   */
  public getDecodedBuffer(instrumentId: number): AudioBuffer | undefined {
    return this.decodedAudioBuffers.get(instrumentId);
  }

  /**
   * Await all pending Sampler/Player decode operations (with timeout).
   * Called from TrackerReplayer.play() so the scheduler doesn't fire notes
   * before sample buffers are ready — which would cause dropped first notes.
   */
  public async awaitPendingLoads(timeoutMs = 5000): Promise<void> {
    const pending = Array.from(this.instrumentLoadingPromises.values());
    if (pending.length === 0) return;
    try {
      await Promise.race([
        Promise.all(pending),
        new Promise<void>(resolve => setTimeout(resolve, timeoutMs)),
      ]);
    } catch {
      // Individual decode failures are already logged inside each promise; ignore here
    }
  }

  /**
   * Get the global high-performance WASM instance
   */
  public getWasmInstance(): WebAssembly.Exports | null {
    return this.wasmInstance;
  }

  /**
   * Initialize audio context (must be called after user interaction)
   * Native AudioContext was already created in the constructor and passed to Tone.js.
   * This method resumes the context (which starts suspended until user gesture).
   */
  public async init(): Promise<void> {
    const nativeCtx = this._nativeContext!;

    // Resume if EITHER Tone.js or the native AudioContext is not running.
    // Tone.js can cache a stale 'running' state after the browser auto-suspends
    // the context (30s silence, page focus lost, etc.), so we check both.
    if (Tone.getContext().state === 'suspended' || nativeCtx.state !== 'running') {
      await Tone.start();
      // Belt-and-suspenders: also resume native context directly in case
      // Tone.start() didn't catch the stale-state scenario.
      if (nativeCtx.state !== 'running') {
        await nativeCtx.resume().catch(() => {
          // resume() requires a user gesture — safe to swallow here since
          // init() is always called from user-gesture handlers.
        });
      }
    }

    // Configure Transport for rock-solid audio scheduling
    // Always use interactive (10ms) for maximum snappiness
    Tone.getContext().lookAhead = 0.01;
    Tone.getTransport().bpm.value = 125; // Default BPM

    // Wait for context to actually be running
    if (nativeCtx.state !== 'running') {
      await new Promise<void>((resolve) => {
        const checkState = () => {
          if (nativeCtx.state === 'running') {
            resolve();
          } else {
            setTimeout(checkState, 10);
          }
        };
        checkState();
      });
    }

    // === UNIFIED WASM LOADING ===
    let dspBinary: ArrayBuffer | null = null;
    const fetchDSP = async () => {
      if (dspBinary) return dspBinary;
      const baseUrl = import.meta.env.BASE_URL || '/';
      const res = await fetch(`${baseUrl}DevilboxDSP.wasm`);
      if (res.ok) {
        dspBinary = await res.arrayBuffer();
        
        // Initialize the WASM instance for Main Thread usage (Scheduler)
        try {
          const imports = { env: { abort: () => console.error('Main WASM Aborted') } };
          const { instance } = await WebAssembly.instantiate(dspBinary, imports);
          this.wasmInstance = instance.exports;
          if ((this.wasmInstance as any).init) (this.wasmInstance as any).init();
          console.warn('[ToneEngine] Unified DevilboxDSP WASM instance ready');
        } catch (e) {
          console.error('[ToneEngine] Failed to init Main Thread WASM:', e);
        }

        return dspBinary;
      }
      return null;
    };

    // Pre-load ITFilter AudioWorklet
    if (!ToneEngine.itFilterWorkletLoaded) {
      if (!ToneEngine.itFilterWorkletPromise) {
        ToneEngine.itFilterWorkletPromise = (async () => {
          try {
            const baseUrl = import.meta.env.BASE_URL || '/';
            // Add module to native AudioContext (not standardized-audio-context wrapper)
            // toneCreateAudioWorkletNode throws InvalidStateError with rawContext
            await nativeCtx.audioWorklet.addModule(`${baseUrl}ITFilter.worklet.js`);

            const binary = await fetchDSP();
            if (binary) {
              // Use native AudioWorkletNode directly (matches FurnaceDispatch fix)
              const tempNode = new AudioWorkletNode(nativeCtx, 'it-filter-processor');
              tempNode.port.postMessage({ type: 'init', wasmBinary: binary });
              tempNode.disconnect();
            }

            ToneEngine.itFilterWorkletLoaded = true;
          } catch (error: unknown) {
            console.error('[ToneEngine] Failed to load ITFilter worklet:', error);
            // Only keep the promise if it's already registered.
            // Otherwise, allow retry on next attempt.
            const errMsg = error instanceof Error ? error.message : '';
            const isAlreadyRegistered = errMsg.includes('already') || errMsg.includes('duplicate');
            if (!isAlreadyRegistered) {
              ToneEngine.itFilterWorkletPromise = null;
            }
          }
        })();
      }
      await ToneEngine.itFilterWorkletPromise;
    }

    // Furnace WASM chip engine is initialized lazily — only when a Furnace
    // synth instrument is first created (via ensureWASMSynthsReady or getInstrument).
    // No reason to load 347KB of chip emulation for non-Furnace formats.

    // Initialize BLEP processor — await so the chain is stable before playback starts.
    try {
      await this.blepManager.init();
      this.reconnectBlepChain();
    } catch (error) {
      console.warn('[ToneEngine] BLEP init failed (continuing without BLEP):', error);
    }

    // Preload TR909 samples in background (shared singleton — fast for all pads)
    preloadTR909Resources(nativeCtx).catch(e => {
      console.warn('[ToneEngine] TR909 sample preload failed:', e);
    });

    // Load AmigaFilter worklet handled by its class
  }

  /**
   * Reconnect the BLEP audio chain based on current settings.
   * Routes through: blepInput → [BLEP worklet?] → safetyLimiter
   * The static tail (safetyLimiter → exportTap → masterChannel) is never rebuilt.
   */
  private reconnectBlepChain(): void {
    // Disconnect blepInput → safetyLimiter (and any native worklet connections)
    try {
      this.blepInput.disconnect(this.safetyLimiter);
    } catch {
      // Ignore if not connected
    }

    // Reconnect with or without BLEP — BLEP targets safetyLimiter
    this.blepManager.connect(this.blepInput, this.safetyLimiter);
  }

  /**
   * Enable or disable BLEP processing
   * @param enabled Whether to enable BLEP
   */
  public setBlepEnabled(enabled: boolean): void {
    this.blepManager.setEnabled(enabled);
    // Reconnect audio chain to route through or bypass BLEP
    if (this.blepManager.isInitialized()) {
      this.reconnectBlepChain();
    }
  }

  /**
   * Check if BLEP is currently enabled
   */
  public isBlepEnabled(): boolean {
    return this.blepManager.isEnabled();
  }

  /**
   * Get audio context state
   */
  public getContextState(): AudioContextState {
    return Tone.getContext().state;
  }

  /**
   * Returns true only when BOTH the Tone.js wrapper AND the native AudioContext
   * report 'running'. Tone.js can cache a stale 'running' state after the browser
   * auto-suspends the context (e.g. after 30s of silence), so checking both is
   * required to avoid false positives.
   */
  public isContextActuallyRunning(): boolean {
    return (
      Tone.getContext().state === 'running' &&
      (this._nativeContext?.state ?? 'suspended') === 'running'
    );
  }

  /**
   * Synchronously fire-and-forget resume attempt, for use within iOS user gesture handlers.
   *
   * iOS requires AudioContext.resume() to be called synchronously within the gesture event
   * (or in a microtask directly chained from it). Calling it later via await breaks the
   * gesture chain on iOS < 14.5. This method must be called synchronously — before any
   * await — inside a touchstart/mousedown/keydown handler.
   *
   * Safe to call on every key press: it's a no-op when the context is already running.
   */
  public syncResume(): void {
    if (this._nativeContext?.state !== 'running') {
      void this._nativeContext?.resume().catch(() => {});
    }
  }

  /**
   * Preload instruments (especially Samplers) and wait for them to be ready
   * Call this after importing a module to ensure samples are loaded before playback
   */
  public async preloadInstruments(configs: InstrumentConfig[]): Promise<void> {
    // Bump generation to invalidate any in-flight preload
    const generation = ++this.preloadGeneration;

    // First, ensure lazy-loaded synths are registered
    const lazyLoadPromises = configs
      .map(config => SynthRegistry.ensure(config.synthType))
      .filter(Boolean);
    if (lazyLoadPromises.length > 0) {
      await Promise.all(lazyLoadPromises);
      if (generation !== this.preloadGeneration) return; // Superseded
    }

    // Then, dispose any existing instruments to start fresh
    configs.forEach((config) => {
      // BUG FIX: Use proper key format (was checking config.id but Map keys are strings like "3--1")
      const key = this.getInstrumentKey(config.id, -1);
      if (this.instruments.has(key)) {
        this.disposeInstrument(config.id);
      }
    });

    // Create all instruments
    const samplerConfigs = configs.filter((c) => c.synthType === 'Sampler' || c.synthType === 'Player');
    // Speech synths need async rendering (SAM and V2 with v2Speech)
    const speechConfigs = configs.filter((c) => c.synthType === 'Sam' || (c.synthType === 'V2' && c.v2Speech));
    const otherConfigs = configs.filter((c) =>
      c.synthType &&
      c.synthType !== 'Sampler' &&
      c.synthType !== 'Player' &&
      c.synthType !== 'Sam' &&
      !(c.synthType === 'V2' && c.v2Speech)
    );

    // For native whole-song players (HivelySynth, UADESynth, etc.) only create ONE
    // instance — the engine is a singleton that handles all channels internally.
    // Creating a standalone player per instrument exhausts the WASM player pool.
    const nativePlayerTypes = new Set([
      'HivelySynth', 'UADESynth', 'UADEEditableSynth', 'SymphonieSynth',
      'MusicLineSynth', 'JamCrackerSynth', 'PreTrackerSynth', 'FuturePlayerSynth',
      'TFMXSynth', 'FCSynth', 'C64SID',
      // WASM player-pool synths — each has a fixed-size pool, must dedup
      'SoundMonSynth', 'SidMonSynth', 'SidMon1Synth', 'DigMugSynth',
      'FredSynth', 'FredEditorReplayerSynth', 'OctaMEDSynth',
      'HippelCoSoSynth', 'RobHubbardSynth', 'SteveTurnerSynth',
      'DavidWhittakerSynth', 'SonicArrangerSynth',
      'InStereo2Synth', 'InStereo1Synth', 'StartrekkerAMSynth',
      'DeltaMusic1Synth', 'DeltaMusic2Synth',
      // OPL3 has 18 internal voices — one WASM instance handles all channels
      'OPL3',
    ]);
    const seenNativeTypes = new Set<string>();
    const dedupedOther = otherConfigs.filter((c) => {
      if (c.synthType && nativePlayerTypes.has(c.synthType)) {
        if (seenNativeTypes.has(c.synthType)) return false;
        seenNativeTypes.add(c.synthType);
      }
      return true;
    });

    // Create non-sampler instruments immediately
    dedupedOther.forEach((config) => {
      this.getInstrument(config.id, config);
    });

    // Create sampler instruments
    samplerConfigs.forEach((config) => {
      this.getInstrument(config.id, config);
    });

    // Create and wait for speech synths
    const speechReadyPromises: Promise<void>[] = [];
    speechConfigs.forEach((config) => {
      const instrument = this.getInstrument(config.id, config);
      if ((instrument as any)?.ready) {
        speechReadyPromises.push((instrument as any).ready());
      }
    });

    // Wait for all audio buffers to load
    if (samplerConfigs.length > 0) {
      try {
        // Wait for Tone.js internal loading (URL-based samples)
        await Tone.loaded();
        if (generation !== this.preloadGeneration) return; // Superseded by newer preload

        // Also wait for any custom buffer loading promises (ArrayBuffer-based samples)
        const pendingLoads = Array.from(this.instrumentLoadingPromises.values());
        if (pendingLoads.length > 0) {
          await Promise.all(pendingLoads);
          if (generation !== this.preloadGeneration) return; // Superseded
        }
      } catch (error) {
        console.error('[ToneEngine] Some samples failed to load:', error);
      }
    }

    // Wait for speech synths to render
    if (speechReadyPromises.length > 0) {
      try {
        await Promise.all(speechReadyPromises);
        if (generation !== this.preloadGeneration) return; // Superseded
      } catch (error) {
        console.error('[ToneEngine] Some speech synths failed to render:', error);
      }
    }

    // Wait for ALL WASM-based synths to initialize their AudioWorklet
    // This includes: MAME synths, Buzzmachine, TB303, V2, DubSiren, etc.
    const wasmPromises: Promise<void>[] = [];
    for (const config of configs) {
      const key = this.getInstrumentKey(config.id, -1);
      const instrument = this.instruments.get(key);
      // Check if instrument has ensureInitialized method (all WASM-based synths should)
      if (instrument && typeof (instrument as any).ensureInitialized === 'function') {
        wasmPromises.push((instrument as any).ensureInitialized());
      }
    }
    if (wasmPromises.length > 0) {
      try {
        await Promise.all(wasmPromises);
        if (generation !== this.preloadGeneration) return; // Superseded
      } catch (error) {
        console.error('[ToneEngine] Some WASM synths failed to initialize:', error);
      }
    }

    // PERFORMANCE FIX: Warm up CPU-intensive synths by triggering a silent note
    // This forces Tone.js to compile/initialize audio graphs before playback starts
    const warmUpTypes = ['MetalSynth', 'MembraneSynth', 'NoiseSynth', 'FMSynth'];
    for (const config of configs) {
      if (warmUpTypes.includes(config.synthType || '')) {
        const key = this.getInstrumentKey(config.id, -1);
        const instrument = this.instruments.get(key);
        if (instrument && !isDevilboxSynth(instrument)) {
          try {
            const inst = instrument as any;
            // Save original volume, set to silent
            const originalVol = inst.volume.value;
            inst.volume.value = -Infinity;

            // Trigger a very short note to warm up the synth
            if (config.synthType === 'NoiseSynth' || config.synthType === 'MetalSynth') {
              // MetalSynth is now NoiseSynth under the hood for performance
              (instrument as Tone.NoiseSynth).triggerAttackRelease(0.001, Tone.now());
            } else if (config.synthType === 'MembraneSynth') {
              // MembraneSynth is now regular Synth for performance
              (instrument as Tone.Synth).triggerAttackRelease('C2', 0.001, Tone.now());
            } else {
              inst.triggerAttackRelease?.('C4', 0.001, Tone.now());
            }

            // Restore volume
            inst.volume.value = originalVol;
          } catch {
            // Ignore warm-up errors
          }
        }
      }
    }

    // Pre-warm WASM synths: trigger a silent note to prime the audio pipeline
    for (const config of configs) {
      const key = this.getInstrumentKey(config.id, -1);
      const instrument = this.instruments.get(key);
      if (instrument && isDevilboxSynth(instrument)) {
        try {
          const ds = instrument as DevilboxSynth;
          const savedGain = ds.output instanceof GainNode ? (ds.output as GainNode).gain.value : null;
          if (ds.output instanceof GainNode) (ds.output as GainNode).gain.value = 0;
          ds.triggerAttack?.('C4', undefined, 0.01);
          setTimeout(() => {
            // Monophonic synths don't take a note parameter in triggerRelease
            ds.triggerRelease?.();
            if (savedGain !== null && ds.output instanceof GainNode) {
              (ds.output as GainNode).gain.value = savedGain;
            }
          }, 50);
        } catch {
          // Ignore warm-up errors
        }
      }
    }

    // Check ROM status for MAME chip synths that have romConfig.
    // Initialization is already handled above in the general WASM init loop.
    const romChipConfigs = configs.filter((c) => {
      const chipDef = CHIP_SYNTH_DEFS[c.synthType || ''];
      return chipDef?.romConfig;
    });
    if (romChipConfigs.length > 0) {
      // Check ROM loaded status for each chip (lazy import to avoid circular dep)
      const { useInstrumentStore: romInstStore } = await import('../stores/useInstrumentStore');
      const instStore = romInstStore.getState();
      for (const config of romChipConfigs) {
        const key = this.getInstrumentKey(config.id, -1);
        const synth = this.instruments.get(key) as any;
        const chipDef = CHIP_SYNTH_DEFS[config.synthType || ''];
        if (!synth || !chipDef?.romConfig) continue;

        const loaded = synth.romLoaded === true;
        const inst = instStore.instruments.find((i: any) => i.id === config.id);
        if (inst) {
          instStore.updateInstrument(config.id, {
            parameters: { ...inst.parameters, _romsLoaded: loaded ? 1 : 0 },
          });
        }

        if (!loaded) {
          // Show ROM upload dialog for the first failed chip
          useRomDialogStore.getState().showRomDialog({
            instrumentId: config.id,
            synthType: config.synthType || '',
            chipName: chipDef.name,
            requiredZip: chipDef.romConfig.requiredZip,
            bankCount: chipDef.romConfig.bankCount,
          });
          break; // Only show one dialog at a time
        }
      }
    }

  }

  /**
   * Ensure all WASM-based synths for the given instruments are initialized.
   * Creates instances if needed and waits for their AudioWorklet WASM to be ready.
   */
  public async ensureWASMSynthsReady(configs: InstrumentConfig[]): Promise<void> {
    const wasmConfigs = configs.filter((c) => 
      ['TB303', 'Buzz3o3', 'V2', 'V2Speech', 'Sam', 'DECtalk', 'PinkTrombone', 'Synare', 'DubSiren', 'SpaceLaser', 'Furnace', 'HivelySynth', 'UADESynth', 'UADEEditableSynth', 'SymphonieSynth', 'MusicLineSynth',
       'SoundMonSynth', 'SidMonSynth', 'DigMugSynth', 'FCSynth', 'FredSynth', 'TFMXSynth',
       'OctaMEDSynth', 'SidMon1Synth', 'HippelCoSoSynth', 'RobHubbardSynth', 'SteveTurnerSynth', 'FredEditorReplayerSynth', 'DavidWhittakerSynth',
       'SonicArrangerSynth', 'InStereo2Synth', 'InStereo1Synth', 'DeltaMusic1Synth', 'DeltaMusic2Synth',
       'StartrekkerAMSynth', 'SunVoxSynth', 'JamCrackerSynth', 'PreTrackerSynth', 'FuturePlayerSynth',
       'KlysSynth', 'WaveSabreSynth', 'OidosSynth', 'TunefishSynth', 'OPL3'].includes(c.synthType || '') ||
      c.synthType?.startsWith('Furnace')
    );
    if (wasmConfigs.length === 0) return;

    // For native whole-song players (HivelySynth, UADESynth) only create ONE
    // instance regardless of how many instrument configs use them — the engine
    // is a singleton that handles all channels internally.
    const seenNativePlayers = new Set<string>();
    const deduped = wasmConfigs.filter(c => {
      if (c.synthType === 'HivelySynth' || c.synthType === 'UADESynth' || c.synthType === 'UADEEditableSynth' || c.synthType === 'SymphonieSynth' || c.synthType === 'MusicLineSynth' || c.synthType === 'JamCrackerSynth' || c.synthType === 'PreTrackerSynth' || c.synthType === 'FuturePlayerSynth' || c.synthType === 'TFMXSynth' || c.synthType === 'FCSynth' || c.synthType === 'C64SID'
        || c.synthType === 'SoundMonSynth' || c.synthType === 'SidMonSynth' || c.synthType === 'SidMon1Synth' || c.synthType === 'DigMugSynth'
        || c.synthType === 'FredSynth' || c.synthType === 'FredEditorReplayerSynth' || c.synthType === 'OctaMEDSynth'
        || c.synthType === 'HippelCoSoSynth' || c.synthType === 'RobHubbardSynth' || c.synthType === 'SteveTurnerSynth'
        || c.synthType === 'DavidWhittakerSynth' || c.synthType === 'SonicArrangerSynth'
        || c.synthType === 'InStereo2Synth' || c.synthType === 'InStereo1Synth' || c.synthType === 'StartrekkerAMSynth'
        || c.synthType === 'DeltaMusic1Synth' || c.synthType === 'DeltaMusic2Synth'
        || c.synthType === 'OPL3') {
        if (seenNativePlayers.has(c.synthType!)) return false;
        seenNativePlayers.add(c.synthType!);
      }
      return true;
    });

    const promises: Promise<void>[] = [];
    for (const config of deduped) {
      // Create the instrument if it doesn't exist yet
      const instrument = this.getInstrument(config.id, config);
      if ((instrument as any)?.ensureInitialized) {
        promises.push((instrument as any).ensureInitialized());
      }
    }
    if (promises.length > 0) {
      await Promise.all(promises);
    }
  }

  /**
   * Ensure a single instrument is ready to play.
   * Creates the instrument if needed and waits for WASM/async initialization.
   * Call this before triggerNoteAttack for FurnaceDispatch and other WASM synths.
   */
  public async ensureInstrumentReady(config: InstrumentConfig): Promise<void> {
    const instrument = this.getInstrument(config.id, config);
    if (instrument && typeof (instrument as any).ensureInitialized === 'function') {
      await (instrument as any).ensureInitialized();
    }
  }

  /**
   * Set master volume
   */
  public setMasterVolume(volumeDb: number): void {
    this._masterVolumeDb = volumeDb;
    this.masterChannel.volume.value = volumeDb;
  }

  /**
   * Set sample bus gain (tracker/MOD/XM sample path: masterInput → amigaFilter)
   * Use to balance samples vs synths. 0 = unity gain (default).
   */
  public setSampleBusGain(db: number): void {
    this._manualSampleGainDb = db;
    this._applyBusGains();
  }

  /**
   * Set synth bus gain (native chip/UADE/DB303 path: synthBus → masterEffectsInput)
   * Use to balance synths vs samples. 0 = unity gain (default).
   */
  public setSynthBusGain(db: number): void {
    this._manualSynthGainDb = db;
    this._applyBusGains();
  }

  /** Apply bus gains: manual setting + auto-gain correction combined */
  private _applyBusGains(): void {
    const sampleDb = this._manualSampleGainDb + this.autoGainSampleCorr;
    const synthDb = this._manualSynthGainDb + this.autoGainSynthCorr;
    this.masterInput.gain.value = Math.pow(10, sampleDb / 20);
    this.synthBus.gain.value = Math.pow(10, synthDb / 20);
  }

  /**
   * Enable/disable automatic bus gain balancing.
   * When enabled, a proportional controller continuously adjusts sample and synth
   * bus gains to equalize their RMS levels. Corrections reset to 0 when disabled.
   */
  public setAutoGain(enabled: boolean): void {
    if (!this.autoGain) {
      this.autoGain = new AutoGainController(
        this.masterInput, this.synthBus,
        (sampleCorr, synthCorr) => {
          this.autoGainSampleCorr = sampleCorr;
          this.autoGainSynthCorr = synthCorr;
          this._applyBusGains();
        }
      );
    }
    this.autoGain.setAutoGain(enabled);
    if (!enabled) {
      this.autoGainSampleCorr = 0;
      this.autoGainSynthCorr = 0;
      this._applyBusGains();
    }
  }

  public getAutoGain(): boolean {
    return this.autoGain?.getAutoGain() ?? false;
  }

  /** Returns current auto-gain corrections in dB (informational, for UI display) */
  public getAutoGainCorrections(): { sample: number; synth: number } {
    return this.autoGain?.getAutoGainCorrections() ?? { sample: 0, synth: 0 };
  }

  /**
   * Set master mute
   */
  public setMasterMute(muted: boolean): void {
    this.masterChannel.mute = muted;
  }

  /**
   * Set Amiga audio filter state (E0x command)
   * E00 = filter ON (LED on, softer sound)
   * E01 = filter OFF (LED off, brighter sound)
   */
  public setAmigaFilter(enabled: boolean): void {
    this.amigaFilterEnabled = enabled;
    this.amigaFilter.filterEnabled = enabled;
    this.amigaFilter.ledFilterEnabled = enabled;
  }

  /**
   * Get current Amiga filter state
   */
  public getAmigaFilterEnabled(): boolean {
    return this.amigaFilterEnabled;
  }

  /**
   * Process a single tracker tick for all active instruments
   * Supports macro modulation for Furnace and other tick-aware synths
   */
  public processInstrumentTicks(time: number = Tone.now()): void {
    this.instruments.forEach((instrument) => {
      if (instrument && typeof (instrument as any).processTick === 'function') {
        (instrument as any).processTick(time);
      }
    });
  }

  /**
   * Set BPM with smooth ramping to prevent audio glitches
   */
  public setBPM(bpm: number): void {
    const transport = Tone.getTransport();
    // Use a tiny ramp (20ms) to prevent clicks/glitches when changing BPM during playback
    if (transport.state === 'started') {
      transport.bpm.rampTo(bpm, 0.02);
    } else {
      transport.bpm.value = bpm;
    }

    // Update all BPM-synced effects (master + per-instrument)
    this.updateBpmSyncedEffects(bpm);
  }

  /**
   * Get current BPM
   */
  public getBPM(): number {
    return Tone.getTransport().bpm.value;
  }

  /**
   * Set global playback rate multiplier for pitch shifting (affects all sample playback)
   * @param rate - Playback rate multiplier (1.0 = normal, 2.0 = double speed/up one octave, 0.5 = half speed/down one octave)
   */
  public setGlobalPlaybackRate(rate: number): void {
    this.globalPlaybackRate = rate;
  }

  /**
   * Get current global playback rate multiplier
   */
  public getGlobalPlaybackRate(): number {
    return this.globalPlaybackRate;
  }

  /**
   * Initialize the PitchResampler AudioWorklet between synthBus and masterEffectsInput.
   * All WASM/native DevilboxSynths feed through synthBus — the resampler pitch-shifts
   * their audio for the DJ pitch slider without per-engine modifications.
   */
  private async initPitchResampler(): Promise<void> {
    try {
      const nativeCtx = (Tone.getContext().rawContext as AudioContext);
      await nativeCtx.audioWorklet.addModule('/pitch-resampler/PitchResampler.worklet.js');

      const resampler = new AudioWorkletNode(nativeCtx, 'pitch-resampler', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });

      // Re-route: synthBus → resampler → masterEffectsInput (instead of synthBus → masterEffectsInput)
      const nativeSynthBus = getNativeAudioNode(this.synthBus as any);
      const nativeMasterFxIn = getNativeAudioNode(this.masterEffectsInput as any);
      if (nativeSynthBus && nativeMasterFxIn) {
        nativeSynthBus.disconnect(nativeMasterFxIn);
        nativeSynthBus.connect(resampler);
        resampler.connect(nativeMasterFxIn);
        this.pitchResamplerNode = resampler;
        console.log('[ToneEngine] PitchResampler worklet inserted: synthBus → resampler → masterEffectsInput');
      }
    } catch (e) {
      console.warn('[ToneEngine] PitchResampler worklet failed to load, WASM pitch shifting unavailable:', e);
    }
  }

  /**
   * Set pitch rate for WASM/native synth bus (DJ pitch slider).
   * Rate 1.0 = normal, 2.0 = octave up, 0.5 = octave down.
   */
  public setSynthBusPitchRate(rate: number): void {
    if (this.pitchResamplerNode) {
      this.pitchResamplerNode.port.postMessage({ type: 'set-rate', rate });
    }
  }

  /**
   * Set global detune in cents for synth instruments (Wxx effect / DJ slider).
   * Sample-based instruments use playback rate instead; this handles synths that
   * use triggerAttack(note) and need real-time pitch adjustment.
   */
  public setGlobalDetune(cents: number): void {
    this.globalDetuneCents = cents;
    // Apply to all currently active synth voices
    this.applyGlobalDetuneToActiveVoices();
  }

  /**
   * Get current global detune in cents
   */
  public getGlobalDetune(): number {
    return this.globalDetuneCents;
  }

  /**
   * Apply global detune to all currently active synth voices.
   * Iterates activeVoices and sets detune on Tone.js synths that support it.
   */
  private applyGlobalDetuneToActiveVoices(): void {
    this.activeVoices.forEach((voices) => {
      for (const voice of voices) {
        const inst = voice.instrument;
        // Tone.js synths (Synth, FMSynth, MonoSynth, etc.) have a detune signal
        if (!isDevilboxSynth(inst) && (inst as any).detune?.value !== undefined) {
          (inst as any).detune.value = this.globalDetuneCents;
        }
        // PolySynth wraps individual voices — set detune on each
        if ((inst as any).set && (inst as any)._voices) {
          try { (inst as any).set({ detune: this.globalDetuneCents }); } catch { /* not all synths support detune */ }
        }
      }
    });
  }

  /**
   * Start transport (also ensures audio context is running)
   */
  public async start(): Promise<void> {
    // Ensure audio context is running (may have suspended due to inactivity)
    if (Tone.getContext().state === 'suspended') {
      await Tone.start();
    }

    this._isPlaying = true;
    this._notifyNoiseEffectsPlaying(true);
    Tone.getTransport().start();
  }

  /**
   * Stop transport
   */
  public stop(): void {
    // Release all active notes before stopping to prevent hanging notes
    this.releaseAll();
    this._isPlaying = false;
    this._notifyNoiseEffectsPlaying(false);

    // Clear VU meter trigger levels so meters die instantly on stop
    this.clearChannelTriggerLevels();

    // Kill master effects tails (delay, reverb) by temporarily muting output
    // then restoring after the effect buffers have cleared.
    // Use _masterVolumeDb (not .volume.value) to avoid race condition:
    // if stop() is called twice within 50ms, reading .volume.value captures
    // -Infinity from the first call, permanently silencing the master channel.
    const restoreVolume = this._masterVolumeDb;
    this.masterChannel.volume.value = -Infinity;

    // Restore volume after effects have flushed (delay/reverb tails)
    setTimeout(() => {
      this.masterChannel.volume.value = restoreVolume;
    }, 50);

    Tone.getTransport().stop();
  }

  /** Notify noise-generating master effects (VinylNoise, Tumult) of playback state. */
  private _notifyNoiseEffectsPlaying(playing: boolean): void {
    this.masterEffectConfigs.forEach(({ node }) => {
      if (node instanceof VinylNoiseEffect) {
        node.setPlaying(playing);
      } else if (node instanceof TumultEffect) {
        node.setPlaying(playing);
      }
    });
  }

  /**
   * Pause transport
   */
  public pause(): void {
    Tone.getTransport().pause();
  }

  /**
   * Get transport position
   */
  public getPosition(): string {
    return Tone.getTransport().position as string;
  }

  /**
   * Set transport position
   */
  public setPosition(position: string): void {
    Tone.getTransport().position = position;
  }

  /**
   * Return the final output Gain of an instrument's effect chain, if it has
   * been built. Used by the drumpad's dub-bus tap to feed synth-pad audio
   * into the shared dub bus (see DrumPadEngine.attachSynthPadDubSend).
   *
   * Returns `undefined` when:
   *   - The instrument has never been triggered (chain not built yet).
   *   - The composite key doesn't match (wrong channelIndex).
   * Callers should attempt re-attachment on the NEXT trigger rather than retry.
   */
  public getInstrumentChainOutput(instrumentId: number, channelIndex?: number): Tone.Gain | undefined {
    const key = this.getInstrumentKey(instrumentId, channelIndex);
    return this.instrumentEffectChains.get(key)?.output;
  }

  /**
   * Generate composite key for per-channel instrument instances
   */
  public getInstrumentKey(instrumentId: number, channelIndex?: number): number {
    // Numeric composite key: instrumentId in upper 16 bits, channelIndex in lower 16.
    // Avoids string allocation on every call (~512/sec).
    return (instrumentId << 16) | ((channelIndex ?? -1) & 0xFFFF);
  }

  /** Extract instrumentId from a composite key (upper 16 bits, unsigned). */
  private instrumentIdFromKey(key: number): number {
    return key >>> 16;
  }

  private getInstrumentOutputDestination(instrumentId: number, isNativeSynth: boolean): Tone.ToneAudioNode {
    const override = this.instrumentOutputOverrides.get(instrumentId);
    if (override) return override;
    return isNativeSynth ? this.synthBus : this.masterInput;
  }

  // Track the last trigger time to ensure strictly increasing times
  private lastTriggerTime: number = 0;

  /**
   * Get a safe time value for scheduling audio events
   * Returns null if audio context is not ready
   * Ensures each returned time is strictly greater than the previous one
   */
  private getSafeTime(time?: number): number | null {
    // Check if audio context is running — use isContextActuallyRunning() which checks BOTH
    // the Tone.js wrapper state AND the native AudioContext state. Tone.js can cache a stale
    // 'running' state after the browser auto-suspends the context (silence timeout, tab focus),
    // causing getSafeTime to return valid times even when audio is actually suspended.
    if (!this.isContextActuallyRunning()) {
      const toneState = Tone.context.state;
      const nativeState = this._nativeContext?.state ?? 'unknown';
      console.warn(`[ToneEngine] getSafeTime: context not ready (Tone: '${toneState}', native: '${nativeState}')`);
      return null;
    }

    // Determine base time: use immediate (currentTime) for interactive triggers,
    // or now() (currentTime + lookAhead) for scheduled triggers
    const isInteractive = time === undefined || time === null || isNaN(time) || time <= 0;
    const baseTime = isInteractive ? Tone.immediate() : Tone.now();

    // If time is provided and valid (> 0), use it as base
    // Time of 0 means "play immediately"
    let targetTime: number;
    if (time !== undefined && time !== null && !isNaN(time) && time > 0) {
      targetTime = time;
    } else {
      // Use base time with a tiny offset to ensure it's scheduled properly
      targetTime = baseTime + 0.001;
    }

    // Ensure this time is strictly greater than the last trigger time
    // This prevents "Start time must be strictly greater than previous start time" errors
    if (targetTime <= this.lastTriggerTime) {
      targetTime = this.lastTriggerTime + 0.0005;
    }

    this.lastTriggerTime = targetTime;
    return targetTime;
  }

  /**
   * Get an immediate time value for user interactions (keyboard/MIDI)
   * Bypasses the lookAhead buffer for instant response
   */
  private getImmediateTime(): number {
    const immediate = Tone.immediate();
    
    // Still ensure strictly increasing times to avoid Web Audio API warnings
    let targetTime = immediate;
    if (targetTime <= this.lastTriggerTime) {
      targetTime = this.lastTriggerTime + 0.0001; // Smaller increment for immediate triggers
    }
    
    this.lastTriggerTime = targetTime;
    return targetTime;
  }

  /**
   * Create or get instrument (per-channel to avoid automation conflicts)
   */
  public getInstrument(instrumentId: number, config: InstrumentConfig, channelIndex?: number): Tone.ToneAudioNode | DevilboxSynth | null {
    // Ensure Tone.js context matches our native context — prevents cross-context
    // AudioNode errors when creating instruments after libopenmpt/UADE playback
    if (this._nativeContext && Tone.getContext().rawContext !== this._nativeContext) {
      Tone.setContext(this._nativeContext);
    }

    // CRITICAL FIX: Many synth types don't need per-channel instances
    // They're already polyphonic and don't have per-channel automation
    // Creating new instances causes them to reload samples/ROMs/WASM, causing silence and performance issues
    const isMAME = config.synthType?.startsWith('MAME') || config.synthType === 'CZ101' || config.synthType === 'CEM3394' || config.synthType === 'SCSP';
    const isFurnace = config.synthType?.startsWith('Furnace') || config.synthType === 'Furnace';
    const isBuzzmachine = config.synthType?.startsWith('Buzz') || config.synthType === 'Buzzmachine';
    const isWAM = config.synthType?.startsWith('WAM');
    const isWASMSynth = [
      // AudioWorklet WASM synths — use shared instances (one per instrument ID)
      // to avoid exhausting fixed player-handle pools across channels.
      'TB303', 'Buzz3o3', 'V2', 'V2Speech', 'Sam', 'DECtalk', 'PinkTrombone', 'DubSiren', 'SpaceLaser', 'Synare', 'WAM',
      'TR808', 'TR909',
      'SonicArrangerSynth', 'InStereo2Synth', 'InStereo1Synth', 'JamCrackerSynth', 'PreTrackerSynth', 'FuturePlayerSynth',
      'SoundMonSynth', 'SidMonSynth', 'SidMon1Synth',
      'DigMugSynth', 'DeltaMusic1Synth', 'DeltaMusic2Synth',
      'FCSynth', 'TFMXSynth', 'MusicLineSynth', 'SymphonieSynth', 'SunVoxSynth',
      'FredSynth', 'HippelCoSoSynth', 'RobHubbardSynth', 'SteveTurnerSynth', 'FredEditorReplayerSynth', 'StartrekkerAMSynth',
      'OctaMEDSynth', 'DavidWhittakerSynth',
      'HivelySynth', 'KlysSynth', 'MAMEVASynth', 'UADESynth', 'UADEEditableSynth',
      'WaveSabreSynth', 'OidosSynth', 'TunefishSynth', 'SunVoxModular',
      // Zynthian WASM synths — shared instances
      'MdaEPiano', 'MdaJX10', 'MdaDX10', 'Amsynth', 'RaffoSynth', 'CalfMono',
      'SetBfree', 'SynthV1', 'TalNoizeMaker', 'Aeolus', 'FluidSynth', 'Sfizz',
      'ZynAddSubFX', 'Monique', 'VL1',
      'DX7', 'OPL3', 'OpenWurli',
    ].includes(config.synthType || '');
    const isVSTBridge = !isWASMSynth && typeof config.synthType === 'string' && SYNTH_REGISTRY.has(config.synthType);
    const isSharedType = config.synthType === 'Sampler' || config.synthType === 'Player' || config.synthType === 'SunVoxSynth' || isMAME || isFurnace || isBuzzmachine || isWASMSynth || isWAM || isVSTBridge;
    const key = isSharedType
      ? this.getInstrumentKey(instrumentId, -1)  // Use shared instance
      : this.getInstrumentKey(instrumentId, channelIndex);
    if (config.synthType === 'SuperCollider') {
      console.log('[SC:ToneEngine] getInstrument — id:', instrumentId, 'channelIndex:', channelIndex, 'isSharedType:', isSharedType, 'key:', key, 'hasCached:', this.instruments.has(key));
    }

    // Check if instrument already exists for this channel
    if (this.instruments.has(key)) {
      const cached = this.instruments.get(key);
      // Diagnostic: warn if cached instrument type doesn't match requested config
      // Use instrumentSynthTypes map (not constructor.name which gets minified by bundlers)
      const storedType = this.instrumentSynthTypes.get(key);
      if (config.synthType && storedType && storedType !== config.synthType && storedType !== 'Player') {
        console.warn(`[ToneEngine] STALE INSTRUMENT: key=${key} stored as ${storedType} but config wants ${config.synthType} — disposing and recreating`);
        // Dispose the stale instrument immediately and create a new one
        this.disposeInstrumentByKey(key);
        // Continue to create new instrument below
      } else {
        // FP/JC singleton synths: always update the instrument pointer from config
        // before returning, since all instrument IDs share the same synth instance.
        if (cached && config.synthType === 'FuturePlayerSynth') {
          const fpPtr = config.metadata?.fpInstrPtr;
          if (typeof fpPtr === 'number' && fpPtr > 0) {
            (cached as any).set('instrumentPtr', fpPtr);
          }
        } else if (cached && config.synthType === 'JamCrackerSynth') {
          const jcIdx = typeof config.id === 'number' ? config.id - 1 : 0;
          (cached as any).set('instrumentIndex', jcIdx);
        }
        // Type matches, return cached instrument
        return cached ?? null;
      }
    }

    // PERFORMANCE FIX: Check for shared/legacy instrument before creating new one
    // Preload creates instruments with key ${id}--1, but playback uses ${id}-${channel}
    // Reuse the shared instance instead of creating expensive new synths per channel
    // BUT: Don't reuse for live voice channels (100+) - those need separate instances for polyphony
    // BUT: Don't reuse for Tone.js synths on tracker channels - they need per-channel
    //       monophonic instances for proper pitch effect support (arpeggio, vibrato, portamento)
    const isLiveVoiceChannel = channelIndex !== undefined && channelIndex >= ToneEngine.LIVE_VOICE_BASE_CHANNEL;
    const isTrackerChannel = channelIndex !== undefined && channelIndex >= 0 && channelIndex < 100;
    const isToneJSSynth = ['Synth', 'MonoSynth', 'DuoSynth', 'FMSynth', 'ToneAM', 'PluckSynth', 'MembraneSynth', 'MetalSynth', 'NoiseSynth', 'PolySynth', 'SuperSaw'].includes(config.synthType || '');
    const needsPerChannelInstance = isTrackerChannel && isToneJSSynth;
    const legacyKey = this.getInstrumentKey(instrumentId, -1);
    if (needsPerChannelInstance) {
      // Skip legacy reuse — falls through to create per-channel MonoSynth
    } else if (!isSharedType && !isLiveVoiceChannel && this.instruments.has(legacyKey)) {
      // Verify the stored type matches what's requested — if not, dispose the stale instance
      const storedLegacyType = this.instrumentSynthTypes.get(legacyKey);
      if (config.synthType && storedLegacyType && storedLegacyType !== config.synthType) {
        console.warn(`[ToneEngine] STALE LEGACY INSTRUMENT: key=${legacyKey} stored as ${storedLegacyType} but config wants ${config.synthType} — disposing and recreating`);
        this.disposeInstrumentByKey(legacyKey);
      } else {
        return this.instruments.get(legacyKey) ?? null;
      }
    }

    // Singleton WASM engine synths: FuturePlayer and JamCracker engines are singletons.
    // Reuse any existing instance of the same synthType (just update the instrument pointer/index).
    // This avoids creating disconnected synth instances that can't route audio.
    if (config.synthType === 'FuturePlayerSynth' || config.synthType === 'JamCrackerSynth' || config.synthType === 'PreTrackerSynth') {
      for (const [existingKey, existingSynth] of this.instruments) {
        const storedType = this.instrumentSynthTypes.get(existingKey);
        if (storedType === config.synthType && existingSynth) {
          // Update the instrument pointer/index for the new instrument
          if (config.synthType === 'FuturePlayerSynth') {
            const fpPtr = config.metadata?.fpInstrPtr;
            if (typeof fpPtr === 'number' && fpPtr > 0) {
              (existingSynth as any).set('instrumentPtr', fpPtr);
            }
          } else if (config.synthType === 'JamCrackerSynth') {
            const jcIdx = typeof config.id === 'number' ? config.id - 1 : 0;
            (existingSynth as any).set('instrumentIndex', jcIdx);
          }
          // Cache under the new key so future lookups find it
          this.instruments.set(key, existingSynth);
          this.instrumentSynthTypes.set(key, config.synthType);
          return existingSynth;
        }
      }
    }

    // OPL3 singleton: one WASM instance handles all 18 voices via register addressing.
    // Set the channel FIRST (for channel-addressed patch routing), then update the patch.
    if (config.synthType === 'OPL3') {
      for (const [existingKey, existingSynth] of this.instruments) {
        const storedType = this.instrumentSynthTypes.get(existingKey);
        if (storedType === 'OPL3' && existingSynth) {
          // Set channel before patch so chSetPatch goes to the right voice
          if (channelIndex !== undefined && existingSynth instanceof OPL3Synth) {
            existingSynth.setChannel(channelIndex % 18);
          }
          const opl = config.opl3;
          if (opl) {
            (existingSynth as any).applyPatch?.(opl);
          }
          this.instruments.set(key, existingSynth);
          this.instrumentSynthTypes.set(key, 'OPL3');
          return existingSynth;
        }
      }
    }

    // Create new instrument based on config
    let instrument: Tone.ToneAudioNode | DevilboxSynth | null = null;
    
    switch (config.synthType) {
      case 'Synth': {
        if (isTrackerChannel) {
          // Use MonoSynth for tracker channels - allows direct frequency modulation
          instrument = new Tone.MonoSynth({
            oscillator: {
              type: (config.oscillator?.type === 'noise' ? 'sawtooth' : (config.oscillator?.type || 'sawtooth')) as Tone.ToneOscillatorType,
            } as any,
            envelope: {
              attack: (config.envelope?.attack ?? 10) / 1000,
              decay: (config.envelope?.decay ?? 200) / 1000,
              sustain: (config.envelope?.sustain ?? 50) / 100,
              release: (config.envelope?.release ?? 1000) / 1000,
            },
            volume: getNormalizedVolume('Synth', config.volume),
          });
        } else {
          // Use PolySynth for non-tracker use (UI, live input, etc.)
          const synthPolyphony = this.currentPerformanceQuality === 'high' ? 16 :
                                 this.currentPerformanceQuality === 'medium' ? 8 : 4;
          instrument = new Tone.PolySynth({
            voice: Tone.Synth,
            maxPolyphony: synthPolyphony,
            options: {
              oscillator: {
                type: (config.oscillator?.type === 'noise' ? 'sawtooth' : (config.oscillator?.type || 'sawtooth')) as Tone.ToneOscillatorType,
              } as any,
              envelope: {
                attack: (config.envelope?.attack ?? 10) / 1000,
                decay: (config.envelope?.decay ?? 200) / 1000,
                sustain: (config.envelope?.sustain ?? 50) / 100,
                release: (config.envelope?.release ?? 1000) / 1000,
              },
            },
            volume: getNormalizedVolume('Synth', config.volume),
          } as any);
        }
        break;
      }

      case 'MonoSynth':
        instrument = new Tone.MonoSynth({
          oscillator: {
            type: (config.oscillator?.type === 'noise' ? 'sawtooth' : (config.oscillator?.type || 'sawtooth')) as Tone.ToneOscillatorType,
          } as any,
          envelope: {
            attack: (config.envelope?.attack ?? 10) / 1000,
            decay: (config.envelope?.decay ?? 200) / 1000,
            sustain: (config.envelope?.sustain ?? 50) / 100,
            release: (config.envelope?.release ?? 1000) / 1000,
          },
          volume: getNormalizedVolume('MonoSynth', config.volume),
        });
        break;

      case 'DuoSynth':
        instrument = new Tone.DuoSynth({
          voice0: {
            oscillator: { type: (config.oscillator?.type === 'noise' ? 'sawtooth' : (config.oscillator?.type || 'sawtooth')) as Tone.ToneOscillatorType } as any,
            envelope: {
              attack: (config.envelope?.attack ?? 10) / 1000,
              decay: (config.envelope?.decay ?? 200) / 1000,
              sustain: (config.envelope?.sustain ?? 50) / 100,
              release: (config.envelope?.release ?? 1000) / 1000,
            },
          },
          voice1: {
            oscillator: { type: (config.oscillator?.type === 'noise' ? 'sawtooth' : (config.oscillator?.type || 'sawtooth')) as Tone.ToneOscillatorType } as any,
            envelope: {
              attack: (config.envelope?.attack ?? 10) / 1000,
              decay: (config.envelope?.decay ?? 200) / 1000,
              sustain: (config.envelope?.sustain ?? 50) / 100,
              release: (config.envelope?.release ?? 1000) / 1000,
            },
          },
          vibratoAmount: config.oscillator?.detune ? config.oscillator.detune / 100 : 0.5,
          vibratoRate: 5,
          volume: getNormalizedVolume('DuoSynth', config.volume),
        });
        break;

      case 'FMSynth': {
        if (isTrackerChannel) {
          // Use raw FMSynth for tracker channels
          instrument = new Tone.FMSynth({
            oscillator: { type: (config.oscillator?.type === 'noise' ? 'sine' : (config.oscillator?.type || 'sine')) as Tone.ToneOscillatorType } as any,
            envelope: {
              attack: (config.envelope?.attack ?? 10) / 1000,
              decay: (config.envelope?.decay ?? 200) / 1000,
              sustain: (config.envelope?.sustain ?? 50) / 100,
              release: (config.envelope?.release ?? 1000) / 1000,
            },
            modulationIndex: 10,
            volume: getNormalizedVolume('FMSynth', config.volume),
          });
        } else {
          // Use PolySynth wrapper for non-tracker use
          const fmPolyphony = this.currentPerformanceQuality === 'high' ? 16 :
                              this.currentPerformanceQuality === 'medium' ? 6 : 3;
          instrument = new Tone.PolySynth({
            voice: Tone.FMSynth,
            maxPolyphony: fmPolyphony,
            options: {
              oscillator: { type: (config.oscillator?.type === 'noise' ? 'sine' : (config.oscillator?.type || 'sine')) as Tone.ToneOscillatorType } as any,
              envelope: {
                attack: (config.envelope?.attack ?? 10) / 1000,
                decay: (config.envelope?.decay ?? 200) / 1000,
                sustain: (config.envelope?.sustain ?? 50) / 100,
                release: (config.envelope?.release ?? 1000) / 1000,
              },
              modulationIndex: 10,
            },
            volume: getNormalizedVolume('FMSynth', config.volume),
          } as any);
        }
        break;
      }

      case 'ToneAM': {
        if (isTrackerChannel) {
          // Use raw AMSynth for tracker channels
          instrument = new Tone.AMSynth({
            oscillator: { type: (config.oscillator?.type === 'noise' ? 'sine' : (config.oscillator?.type || 'sine')) as Tone.ToneOscillatorType } as any,
            envelope: {
              attack: (config.envelope?.attack ?? 10) / 1000,
              decay: (config.envelope?.decay ?? 200) / 1000,
              sustain: (config.envelope?.sustain ?? 50) / 100,
              release: (config.envelope?.release ?? 1000) / 1000,
            },
            volume: getNormalizedVolume('ToneAM', config.volume),
          });
        } else {
          // Use PolySynth wrapper for non-tracker use
          const amPolyphony = this.currentPerformanceQuality === 'high' ? 16 :
                              this.currentPerformanceQuality === 'medium' ? 8 : 4;
          instrument = new Tone.PolySynth({
            voice: Tone.AMSynth,
            maxPolyphony: amPolyphony,
            options: {
              oscillator: { type: (config.oscillator?.type === 'noise' ? 'sine' : (config.oscillator?.type || 'sine')) as Tone.ToneOscillatorType } as any,
              envelope: {
                attack: (config.envelope?.attack ?? 10) / 1000,
                decay: (config.envelope?.decay ?? 200) / 1000,
                sustain: (config.envelope?.sustain ?? 50) / 100,
                release: (config.envelope?.release ?? 1000) / 1000,
              },
            },
            volume: getNormalizedVolume('ToneAM', config.volume),
          } as any);
        }
        break;
      }

      case 'PluckSynth': {
        const pluckPolyphony = this.currentPerformanceQuality === 'high' ? 16 :
                               this.currentPerformanceQuality === 'medium' ? 8 : 4;
        instrument = new (Tone.PolySynth as unknown as new (options: Record<string, unknown>) => Tone.PolySynth)({
          voice: Tone.PluckSynth,
          maxPolyphony: pluckPolyphony,
          options: {
            attackNoise: 1,
            dampening: config.filter?.frequency || 4000,
            resonance: 0.7,
          },
          volume: getNormalizedVolume('PluckSynth', config.volume),
        });
        break;
      }

      case 'MetalSynth':
      case 'MembraneSynth':
      case 'NoiseSynth':
        // Use SynthRegistry (proper Tone.MetalSynth/MembraneSynth/NoiseSynth)
        instrument = InstrumentFactory.createInstrument(config);
        break;

      case 'TB303':
        // Always use InstrumentFactory which now uses JC303 WASM engine
        instrument = InstrumentFactory.createInstrument(config);
        break;

      case 'Sampler': {
        // Sample-based instrument - loads a sample URL and pitches it
        // sample.url (new standard) takes priority over parameters.sampleUrl (legacy)
        // to match SampleEditor's display priority and ensure preset changes take effect
        let sampleUrl = (config.sample?.url || config.parameters?.sampleUrl) as string | undefined;
        // CRITICAL FIX: Use the actual base note from the sample config, not hardcoded C4
        // Strip dash from tracker-style notes (C-4 → C4) for Tone.js compatibility
        const rawBaseNote = config.sample?.baseNote || 'C4';
        const baseNote = rawBaseNote.replace('-', '');
        const hasLoop = config.sample?.loop === true;
        const loopStart = config.sample?.loopStart || 0;
        const loopEnd = config.sample?.loopEnd || 0;

        // Check if we have an edited buffer stored (takes priority over URL)
        const storedBuffer = config.sample?.audioBuffer;

        // Detect potentially stale blob URLs — blob URLs don't survive page
        // refreshes. But if audioBuffer exists alongside the blob URL, the URL
        // was likely created this session (e.g., baked chord) and is still valid.
        if (sampleUrl && sampleUrl.startsWith('blob:') && !storedBuffer) {
          console.warn(`[ToneEngine] Sampler ${instrumentId} has stale blob URL (won't survive page refresh). Re-import the module to fix.`);
          sampleUrl = undefined; // Clear invalid URL
        }

        // Prepend BASE_URL for relative paths (handles /DEViLBOX/ prefix in production)
        if (sampleUrl) {
          sampleUrl = normalizeUrl(sampleUrl);
        }

        // If we have a stored edited buffer, use that instead of URL
        // Note: audioBuffer can be ArrayBuffer, Uint8Array, or base64 string (from persistence)
        // Guard: after JSON deserialization, ArrayBuffer becomes {} — reject non-buffer objects
        // Also reject empty buffers (byteLength === 0) from OpenMPT empty samples — cause EncodingError
        const isValidBuffer = (storedBuffer instanceof ArrayBuffer && storedBuffer.byteLength > 0) ||
          ((storedBuffer as unknown) instanceof Uint8Array && (storedBuffer as unknown as Uint8Array).byteLength > 0) ||
          typeof storedBuffer === 'string';
        if (storedBuffer && isValidBuffer) {
          // Convert base64 string to ArrayBuffer if needed
          let bufferToUse: ArrayBuffer | Uint8Array | null = storedBuffer;
          if (typeof storedBuffer === 'string') {
            try {
              // Base64 decode
              const binaryString = atob(storedBuffer);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              bufferToUse = bytes.buffer;
            } catch {
              console.warn(`[ToneEngine] Sampler ${instrumentId}: audioBuffer is string but not valid base64, skipping`);
              bufferToUse = null;
            }
          }

          if (bufferToUse) {
            const usePeriodPlayback = config.metadata?.modPlayback?.usePeriodPlayback;

            if (usePeriodPlayback || hasLoop) {
              instrument = new Tone.Player({
                loop: hasLoop,
                volume: getNormalizedVolume('Player', config.volume),
              });
              this.instrumentSynthTypes.set(key, 'Player');

              const bufferForDecode = bufferToUse;
              const playerRef = instrument as Tone.Player;
              const loadPromise = (async () => {
                try {
                  const audioBuffer = await this.decodeAudioData(bufferForDecode);
                  playerRef.buffer = new Tone.ToneAudioBuffer(audioBuffer);
                  
                  if (hasLoop) {
                    const originalSampleRate = config.sample?.sampleRate || 8363;
                    const duration = audioBuffer.duration;
                    // Clamp loop points to buffer duration to avoid RangeError
                    playerRef.loopStart = Math.min(loopStart / originalSampleRate, duration - 0.0001);
                    playerRef.loopEnd = Math.min(loopEnd / originalSampleRate, duration);
                    
                    if (playerRef.loopEnd <= playerRef.loopStart) {
                      playerRef.loopEnd = duration;
                    }
                  }
                  
                  this.decodedAudioBuffers.set(instrumentId, audioBuffer);
                } catch (err) {
                  // Raw Amiga/module PCM fails decodeAudioData — expected for tracker samples
                  console.warn(`[ToneEngine] Sampler ${instrumentId} could not decode audio buffer (raw PCM?):`, (err as Error)?.message ?? err);
                  // Fallback: try loading from data URL (e.g. WAV-wrapped PCM from createSamplerInstrument)
                  if (sampleUrl) {
                    playerRef.load(sampleUrl).catch(e => console.warn(`[ToneEngine] URL fallback also failed for Sampler ${instrumentId}:`, e));
                  }
                }
              })();
              this.instrumentLoadingPromises.set(key, loadPromise);
            } else {
              // Standard style: Use Tone.Sampler for polyphonic keyboard/MIDI play
              instrument = new Tone.Sampler({
                volume: getNormalizedVolume('Sampler', config.volume),
              });
              this.instrumentSynthTypes.set(key, 'Sampler');

              const bufferForDecode = bufferToUse;
              const samplerRef = instrument as Tone.Sampler;
              const loadPromise = (async () => {
                try {
                  const audioBuffer = await this.decodeAudioData(bufferForDecode);
                  const toneBuffer = new Tone.ToneAudioBuffer(audioBuffer);
                  samplerRef.add(baseNote as Tone.Unit.Note, toneBuffer);
                  this.decodedAudioBuffers.set(instrumentId, audioBuffer);
                } catch (err) {
                  // Raw Amiga/module PCM fails decodeAudioData — expected for tracker samples
                  console.warn(`[ToneEngine] Sampler ${instrumentId} could not decode audio buffer (raw PCM?):`, (err as Error)?.message ?? err);
                  // Fallback: try loading from data URL (e.g. WAV-wrapped PCM from createSamplerInstrument)
                  if (sampleUrl) {
                    samplerRef.add(baseNote as Tone.Unit.Note, sampleUrl);
                  }
                }
              })();
              this.instrumentLoadingPromises.set(key, loadPromise);
            }
          }
        }

        // If no instrument created from stored buffer, try URL
        if (!instrument && sampleUrl) {
          const usePeriodPlayback = config.metadata?.modPlayback?.usePeriodPlayback;

          if (usePeriodPlayback || hasLoop) {
            const playerRef = new Tone.Player({
              url: sampleUrl,
              loop: hasLoop,
              volume: getNormalizedVolume('Player', config.volume),
              onload: () => {
                if (hasLoop) {
                  const originalSampleRate = config.sample?.sampleRate || 8363;
                  const audioBuffer = playerRef.buffer.get();
                  const duration = audioBuffer ? audioBuffer.duration : 0;
                  
                  if (duration > 0) {
                    playerRef.loopStart = Math.min(loopStart / originalSampleRate, duration - 0.0001);
                    playerRef.loopEnd = Math.min(loopEnd / originalSampleRate, duration);
                    
                    if (playerRef.loopEnd <= playerRef.loopStart) {
                      playerRef.loopEnd = duration;
                    }
                  }
                }
                
                const audioBuffer = playerRef.buffer.get();
                if (audioBuffer) {
                  this.decodedAudioBuffers.set(instrumentId, audioBuffer);
                }
              },
              onerror: (err: Error) => {
                console.error(`[ToneEngine] Player ${instrumentId} failed to load sample:`, err);
              },
            });
            instrument = playerRef;
            this.instrumentSynthTypes.set(key, 'Player');
          } else {
            // Use multi-map if available, otherwise single sample
            const urls: Record<string, string> = (config.sample?.multiMap || {}) as Record<string, string>;
            if (!config.sample?.multiMap && sampleUrl) {
              urls[baseNote] = sampleUrl;
            }

            const sampleBad = new Set<number>();
            instrument = new Tone.Sampler({
              urls,
              volume: getNormalizedVolume('Sampler', config.volume),
              onerror: (err: Error) => {
                sampleBad.add(instrumentId);
                console.warn(`[ToneEngine] Sampler ${instrumentId} "${config.name ?? '?'}" has unusable audio data — skipping (${(err as Error)?.message ?? err})`);
              },
            });
            this.instrumentSynthTypes.set(key, 'Sampler');
            // Tone.Sampler has no onload callback with direct AudioBuffer access.
            // Fetch+decode the primary URL separately so TrackerReplayer's period-based
            // playback path can find it in decodedAudioBuffers after .dbx reload.
            if (sampleUrl) {
              const primaryUrl = sampleUrl;
              const loadPromise = (async () => {
                try {
                  const response = await fetch(primaryUrl);
                  const arrayBuffer = await response.arrayBuffer();
                  const audioBuffer = await this.decodeAudioData(arrayBuffer);
                  this.decodedAudioBuffers.set(instrumentId, audioBuffer);
                } catch (err) {
                  // If Tone.Sampler already reported this one as bad, don't double-log.
                  if (!sampleBad.has(instrumentId)) {
                    console.warn(`[ToneEngine] Sampler ${instrumentId} "${config.name ?? '?'}" URL decode failed — skipping (${(err as Error)?.message ?? err})`);
                  }
                }
              })();
              this.instrumentLoadingPromises.set(key, loadPromise);
            }
          }
        }

        // If still no instrument created, create empty sampler (will be silent)
        if (!instrument) {
          console.debug(`[ToneEngine] Sampler ${instrumentId} has no valid sample source`);
          instrument = new Tone.Sampler({
            volume: getNormalizedVolume('Sampler', config.volume),
          });
          this.instrumentSynthTypes.set(key, 'EmptySampler');
        }
        break;
      }

      case 'Player': {
        // One-shot player (doesn't pitch)
        const playerUrl = config.parameters?.sampleUrl as string | undefined;

        if (playerUrl) {
          instrument = new Tone.Player({
            url: playerUrl,
            volume: getNormalizedVolume('Player', config.volume),
            onload: () => {
            },
            onerror: (err: Error) => {
              console.error(`[ToneEngine] Player ${instrumentId} failed to load sample:`, err);
            },
          });
        } else {
          instrument = new Tone.Player({
            volume: getNormalizedVolume('Player', config.volume),
          });
        }
        break;
      }

      case 'GranularSynth': {
        // Granular synthesis from sample
        const granularUrl = (config.granular?.sampleUrl || config.parameters?.sampleUrl) as string | undefined;
        const granularConfig = config.granular;

        if (granularUrl) {
          instrument = new Tone.GrainPlayer({
            url: granularUrl,
            grainSize: (granularConfig?.grainSize || 100) / 1000, // ms to seconds
            overlap: (granularConfig?.grainOverlap || 50) / 100, // percentage to ratio
            playbackRate: granularConfig?.playbackRate || 1,
            detune: granularConfig?.detune || 0,
            reverse: granularConfig?.reverse || false,
            loop: true,
            volume: getNormalizedVolume('GranularSynth', config.volume),
            onload: () => {
            },
            onerror: (err: Error) => {
              console.error(`[ToneEngine] GranularSynth ${instrumentId} failed to load sample:`, err);
            },
          });
        } else {
          instrument = new Tone.GrainPlayer({
            grainSize: 0.1,
            overlap: 0.5,
            loop: true,
            volume: getNormalizedVolume('GranularSynth', config.volume),
          });
        }
        break;
      }

      // New synths - use InstrumentFactory for complex synths
      // For tracker channels, PolySynth/SuperSaw create MonoSynth for pitch effects
      case 'PolySynth':
      case 'SuperSaw': {
        if (isTrackerChannel) {
          const oscType = config.polySynth?.oscillator?.type || config.oscillator?.type || 'sawtooth';
          instrument = new Tone.MonoSynth({
            oscillator: {
              type: (oscType === 'noise' ? 'sawtooth' : oscType) as Tone.ToneOscillatorType,
            } as any,
            envelope: {
              attack: (config.polySynth?.envelope?.attack ?? config.envelope?.attack ?? 50) / 1000,
              decay: (config.polySynth?.envelope?.decay ?? config.envelope?.decay ?? 200) / 1000,
              sustain: (config.polySynth?.envelope?.sustain ?? config.envelope?.sustain ?? 70) / 100,
              release: (config.polySynth?.envelope?.release ?? config.envelope?.release ?? 1000) / 1000,
            },
            volume: getNormalizedVolume('Synth', config.volume),
          });
        } else {
          instrument = InstrumentFactory.createInstrument(config);
        }
        break;
      }
      case 'Organ':
      case 'DrumMachine':
      case 'TR808':
      case 'TR909':
      case 'ChipSynth':
      case 'PWMSynth':
      case 'StringMachine':
      case 'FormantSynth':
      case 'Wavetable':
      case 'WobbleBass':
      case 'Furnace':
      // Furnace chip-specific synth types - all use FurnaceSynth with different chip IDs
      // FM Synthesis Chips -- falls through
      case 'FurnaceOPN':
      case 'FurnaceOPM':
      case 'FurnaceOPL':
      case 'FurnaceOPLL':
      case 'FurnaceOPZ':
      case 'FurnaceOPNA':
      case 'FurnaceOPNB':
      case 'FurnaceOPL4':
      case 'FurnaceY8950':
      case 'FurnaceESFM':
      // Console PSG Chips -- falls through
      case 'FurnaceNES':
      case 'FurnaceGB':
      case 'FurnacePSG':
      case 'FurnacePCE':
      case 'FurnaceSNES':
      case 'FurnaceVB':
      case 'FurnaceLynx':
      case 'FurnaceSWAN':
      // NES Expansion Audio -- falls through
      case 'FurnaceVRC6':
      case 'FurnaceVRC7':
      case 'FurnaceN163':
      case 'FurnaceFDS':
      case 'FurnaceMMC5':
      // Computer Chips -- falls through
      case 'FurnaceC64':
      case 'FurnaceSID6581':
      case 'FurnaceSID8580':
      case 'FurnaceAY':
      case 'FurnaceVIC':
      case 'FurnaceSAA':
      case 'FurnaceTED':
      case 'FurnaceVERA':
      // Arcade PCM Chips -- falls through
      case 'FurnaceSEGAPCM':
      case 'FurnaceQSOUND':
      case 'FurnaceES5506':
      case 'FurnaceRF5C68':
      case 'FurnaceC140':
      case 'FurnaceK007232':
      case 'FurnaceK053260':
      case 'FurnaceGA20':
      case 'FurnaceOKI':
      case 'FurnaceYMZ280B':
      // Wavetable Chips -- falls through
      case 'FurnaceSCC':
      case 'FurnaceX1_010':
      case 'FurnaceBUBBLE':
      // Other -- falls through
      case 'FurnaceTIA':
      case 'FurnaceSM8521':
      case 'FurnaceT6W28':
      case 'FurnaceSUPERVISION':
      case 'FurnaceUPD1771':
      case 'FurnaceOPN2203':
      case 'FurnaceOPNBB':
      case 'FurnaceAY8930':
      case 'FurnaceNDS':
      case 'FurnaceGBA':
      case 'FurnacePOKEMINI':
      case 'FurnaceNAMCO':
      case 'FurnacePET':
      case 'FurnacePOKEY':
      case 'FurnaceMSM6258':
      case 'FurnaceMSM5232':
      case 'FurnaceMULTIPCM':
      case 'FurnaceAMIGA':
      case 'FurnacePCSPKR':
      case 'FurnacePONG':
      case 'FurnacePV1000':
      case 'FurnaceDAVE':
      case 'FurnaceSU':
      case 'FurnacePOWERNOISE':
      case 'FurnaceZXBEEPER':
      case 'FurnaceSCVTONE':
      case 'FurnacePCMDAC':
      case 'DrumKit':
      case 'ChiptuneModule':
      // MAME-based Synths -- falls through
      case 'MAMEVFX':
      case 'MAMEDOC':
      case 'MAMERSA':
      case 'MAMESWP30':
      case 'CZ101':
      case 'CEM3394':
      case 'SCSP':
      // MAME Per-Chip WASM Synths -- falls through
      case 'MAMEASC':
      case 'MAMEAstrocade':
      case 'MAMEC352':
      case 'MAMEES5503':
      case 'MAMEICS2115':
      case 'MAMEK054539':
      case 'MAMEMEA8000':
      case 'MAMEMSM5232':
      case 'MAMERF5C400':
      case 'MAMESN76477':
      case 'MAMESNKWave':
      case 'MAMESP0250':
      case 'MAMETIA':
      case 'MAMETMS36XX':
      case 'MAMETMS5220':
      case 'MAMETR707':
      case 'MAMEUPD931':
      case 'MAMEUPD933':
      case 'MAMEVotrax':
      case 'MAMEYMF271':
      case 'MAMEYMOPQ':
      case 'MAMEVASynth':
      case 'MAMECMI':
      case 'MAMEFZPCM':
      case 'MAMEPS1SPU':
      case 'MAMEMultiPCM':
      case 'MAMEZSG2':
      case 'MAMEKS0164':
      case 'MAMESWP00':
      case 'MAMESWP20':
      case 'MAMERolandGP':
      case 'MAMES14001A':
      case 'MAMEVLM5030':
      case 'MAMEHC55516':
      // Buzzmachine Generators (WASM-emulated Buzz synths) -- falls through
      case 'BuzzDTMF':
      case 'BuzzFreqBomb':
      case 'BuzzKick':
      case 'BuzzKickXP':
      case 'BuzzNoise':
      case 'BuzzTrilok':
      case 'Buzz4FM2F':
      case 'BuzzDynamite6':
      case 'BuzzM3':
      case 'Buzz3o3':
      case 'DubSiren':
      case 'SpaceLaser':
      case 'V2':
      case 'V2Speech':
      case 'Sam':
      case 'DECtalk':
      case 'PinkTrombone':
      case 'Synare':
      case 'WAM':
      case 'Buzzmachine':
      // WASM song players (full-module playback via AudioWorklet)
      case 'HivelySynth':
      case 'UADESynth':
      case 'UADEEditableSynth':
      case 'SymphonieSynth':
      case 'MusicLineSynth':
      case 'JamCrackerSynth':
      case 'PreTrackerSynth':
      case 'FuturePlayerSynth':
      // Klystrack chiptune synth
      case 'KlysSynth':
      // UADE format-specific synths (per-note WASM synthesis)
      case 'SoundMonSynth':
      case 'SidMonSynth':
      case 'DigMugSynth':
      case 'FCSynth':
      case 'FredSynth':
      case 'TFMXSynth':
      case 'OctaMEDSynth':
      case 'SidMon1Synth':
      case 'HippelCoSoSynth':
      case 'RobHubbardSynth':
      case 'SteveTurnerSynth':
      case 'FredEditorReplayerSynth':
      case 'DavidWhittakerSynth':
      case 'SonicArrangerSynth':
      case 'InStereo2Synth':
      case 'InStereo1Synth':
      case 'StartrekkerAMSynth':
      case 'DeltaMusic1Synth':
      case 'DeltaMusic2Synth':
      // SunVox WASM patch player / modular editor
      case 'SunVoxSynth':
      case 'SunVoxModular':
      // Demoscene synths
      case 'WaveSabreSynth':
      case 'OidosSynth':
      case 'TunefishSynth': {
        instrument = InstrumentFactory.createInstrument(config);
        break;
      }

      // Zynthian community synth ports
      case 'MdaEPiano':
      case 'MdaJX10':
      case 'MdaDX10':
      case 'Amsynth':
      case 'RaffoSynth':
      case 'CalfMono':
      case 'SetBfree':
      case 'SynthV1':
      case 'TalNoizeMaker':
      case 'Aeolus':
      case 'FluidSynth':
      case 'Sfizz':
      case 'ZynAddSubFX':
      case 'Monique':
      case 'VL1': {
        instrument = InstrumentFactory.createInstrument(config);
        if (instrument) {
          console.log('[ToneEngine] Zynthian synth created:', config.synthType,
            'isDevilbox:', isDevilboxSynth(instrument),
            'output:', (instrument as any).output?.constructor?.name,
            'toDestination:', typeof (instrument as any).toDestination);
        }
        break;
      }

      // Direct-routing WASM engines with no per-instrument audio
      case 'C64SID':
      case 'Sc68Synth':
      case 'GTUltraSynth':
      case 'SF2Synth':
        return null;

      default: {
        // Check VSTBridge registry and new SynthRegistry for dynamically registered synths
        const synthTypeStr = config.synthType || '';
        if (config.synthType === 'SuperCollider') {
          console.log('[SC:ToneEngine] getInstrument default case — synthType:', config.synthType, 'SYNTH_REGISTRY.has:', SYNTH_REGISTRY.has(synthTypeStr), 'SynthRegistry.knows:', SynthRegistry.knows(synthTypeStr));
        }
        if (SYNTH_REGISTRY.has(synthTypeStr) || SynthRegistry.knows(synthTypeStr)) {
          if (config.synthType === 'SuperCollider') {
            console.log('[SC:ToneEngine] creating SuperColliderSynth via InstrumentFactory...');
          }
          instrument = InstrumentFactory.createInstrument(config);
          break;
        }
        reportSynthError(
          config.synthType || 'Unknown',
          `Unsupported synth type "${config.synthType}". This instrument cannot produce sound.`,
          {
            synthName: config.name,
            errorType: 'init',
            debugData: { synthType: config.synthType, instrumentId },
          }
        );
        return null;
      }
    }

    if (!instrument) {
      return null;
    }

    // Apply filter if specified
    if (config.filter && (instrument as any).filter) {
      (instrument as any).filter.type = config.filter.type;
      (instrument as any).filter.frequency.value = config.filter.frequency;
      (instrument as any).filter.Q.value = config.filter.Q;
    }

    // Store instrument with composite key (per-channel)
    this.instruments.set(key, instrument);
    // Track the synth type for proper release handling
    // Don't overwrite if already set (e.g., Sampler converted to Player)
    if (!this.instrumentSynthTypes.has(key)) {
      this.instrumentSynthTypes.set(key, config.synthType);
    }

    // SunVoxModular: all instances share one GainNode (SunVoxEngine singleton output).
    // Connect it directly to synthBus ONCE — don't use per-instrument effect chains
    // which would disconnect/reconnect the shared node on every React re-render.
    if (config.synthType === 'SunVoxModular' && isDevilboxSynth(instrument)) {
      if (!this._sunvoxOutputConnected) {
        // Connect the worklet's raw output directly to synthBus's native node.
        // Using the intermediate engine.output GainNode is unreliable — Tone.js/SAC
        // dispose cycles silently sever native-level connections between songs.
        // Guard with hasInstance() to avoid eagerly initializing WASM on project
        // restore from IndexedDB — the heavy init should only happen on first play.
        const nativeSynthBus = getNativeAudioNode(this.synthBus as any);
        if (nativeSynthBus) {
          import('./sunvox/SunVoxEngine').then(({ SunVoxEngine }) => {
            if (SunVoxEngine.hasInstance()) {
              SunVoxEngine.getInstance().connectWorkletTo(nativeSynthBus);
            }
            // else: will connect lazily when engine is actually created on play
          });
        }
        this._sunvoxOutputConnected = true;
      }
    } else {
      // Create instrument effect chain and connect (fire-and-forget for initial creation)
      // For effect updates, use rebuildInstrumentEffects() which properly awaits
      this.buildInstrumentEffectChain(key, config.effects || [], instrument).catch((error) => {
        console.error('[ToneEngine] Failed to build initial effect chain:', error);
      });
    }

    // Route native chip engine output to synthBus for master effects processing.
    // Chip engines (FurnaceChipEngine, FurnaceDispatchEngine) use native AudioWorklets
    // that output to a shared GainNode. We connect that GainNode to synthBus so the
    // audio flows through the master effects chain instead of going directly to destination.
    this.routeNativeEngineOutput(instrument);

    return instrument;
  }

  // ============================================================================
  // INSTRUMENT ANALYSER FOR VISUALIZATION
  // ============================================================================

  /**
   * Get or create an analyser for an instrument
   * Lazy-creates the analyser only when visualization requests it
   * Returns null if instrument doesn't exist or isn't connected
   */
  public getInstrumentAnalyser(instrumentId: number): InstrumentAnalyser | null {
    // Check if analyser already exists
    let analyser = this.instrumentAnalysers.get(instrumentId);
    if (analyser) {
      return analyser;
    }

    // Create new analyser
    analyser = new InstrumentAnalyser();

    // Determine if this instrument is a DevilboxSynth to pick the right output bus
    let isNative = false;
    for (const [key, inst] of this.instruments) {
      if ((key >> 16) === instrumentId) {
        if (isDevilboxSynth(inst)) isNative = true;
        break;
      }
    }
    try {
      analyser.output.connect(this.getInstrumentOutputDestination(instrumentId, isNative));
    } catch (e) {
      // May fail if synth was recreated on a different audio context
      console.warn('[ToneEngine] Analyser connect failed (context mismatch):', e);
      return analyser;
    }

    // Redirect ALL existing effect chains for this instrument to the analyser
    let foundChains = 0;
    this.instrumentEffectChains.forEach((chain, key) => {
      if ((key >> 16) === instrumentId) {
        // Disconnect from all possible destinations, then connect to analyser
        try { chain.output.disconnect(this.masterInput); } catch { /* May not be connected */ }
        try { chain.output.disconnect(this.synthBus); } catch { /* May not be connected */ }
        const override = this.instrumentOutputOverrides.get(instrumentId);
        if (override) try { chain.output.disconnect(override); } catch { /* May not be connected */ }
        chain.output.connect(analyser.input);
        foundChains++;
      }
    });

    if (foundChains === 0) {
      // No active chains found, but we still store the analyser
      // so future chains (from buildInstrumentEffectChain) will connect to it
    }
    this.instrumentAnalysers.set(instrumentId, analyser);
    return analyser;
  }

  /**
   * Dispose an instrument analyser when no longer needed
   */
  public disposeInstrumentAnalyser(instrumentId: number): void {
    const analyser = this.instrumentAnalysers.get(instrumentId);
    if (!analyser) return;

    // Find the instrument
    const sharedKey = this.getInstrumentKey(instrumentId, -1);
    let instrument = this.instruments.get(sharedKey);

    if (!instrument) {
      for (const [key, inst] of this.instruments) {
        if ((key >> 16) === instrumentId) {
          instrument = inst;
          break;
        }
      }
    }

    // Re-route instrument directly (bypass analyser)
    if (instrument) {
      const isNative = isDevilboxSynth(instrument);
      try {
        if (isNative) {
          (instrument as DevilboxSynth).output.disconnect();
        } else {
          (instrument as Tone.ToneAudioNode).disconnect();
        }
      } catch {
        // May not be connected
      }

      const effectChain = this.instrumentEffectChains.get(sharedKey);
      const connectTo = (dest: Tone.ToneAudioNode) => {
        if (isNative) {
          this.connectNativeSynth((instrument as DevilboxSynth).output, dest);
        } else {
          (instrument as Tone.ToneAudioNode).connect(dest);
        }
      };

      if (effectChain) {
        if (effectChain.effects.length > 0) {
          connectTo(effectChain.effects[0]);
        } else {
          connectTo(effectChain.output);
        }
        // Reconnect effect chain output back to the correct bus
        // (it was disconnected from synthBus/masterInput when the analyser was created)
        try { effectChain.output.disconnect(analyser.input); } catch { /* not connected */ }
        effectChain.output.connect(this.getInstrumentOutputDestination(instrumentId, isNative));
      } else {
        connectTo(this.getInstrumentOutputDestination(instrumentId, isNative));
      }
    }

    analyser.dispose();
    this.instrumentAnalysers.delete(instrumentId);
  }

  /**
   * Dispose all instrument analysers
   */
  private disposeAllInstrumentAnalysers(): void {
    this.instrumentAnalysers.forEach((_analyser, id) => {
      this.disposeInstrumentAnalyser(id);
    });
  }

  /**
   * Apply automation parameter to an instrument (per-channel)
   */
  public applyAutomation(
    instrumentId: number,
    parameter: string,
    value: number, // 0-1 normalized
    channelIndex?: number
  ): void {
    const key = this.getInstrumentKey(instrumentId, channelIndex);
    const instrument = this.instruments.get(key);
    if (!instrument) {
      // Try legacy key without channel (backwards compatibility)
      const legacyInstrument = this.instruments.get(this.getInstrumentKey(instrumentId, -1));
      if (!legacyInstrument) {
        console.warn(`[ToneEngine.applyAutomation] No instrument found for key ${key}`);
        return;
      }
      // Use legacy instrument
      this.applyAutomationToInstrument(legacyInstrument, parameter, value);
      return;
    }

    this.applyAutomationToInstrument(instrument, parameter, value);
  }

  /**
   * Apply automation to a specific instrument instance
   */
  private applyAutomationToInstrument(instrument: Tone.ToneAudioNode | DevilboxSynth, parameter: string, value: number): void {
    // Get safe time for automation - skip if context not ready
    const now = this.getSafeTime();
    if (now === null) {
      return;
    }

    try {
      // TB303-style synths — delegate to set() for all params
      if (instrument instanceof JC303Synth || instrument.constructor.name === 'BuzzmachineGenerator') {
        if (typeof instrument.set === 'function') {
          instrument.set(parameter, value);
          return;
        }
      }

      // Non-TB303 instruments
      const inst = instrument as any;
      switch (parameter) {
        case 'cutoff':
          if (inst.filter) {
            const cutoffHz = 200 * Math.pow(100, value);
            inst.filter.frequency.setValueAtTime(cutoffHz, now);
          }
          break;

        case 'resonance':
          if (inst.filter) {
            inst.filter.Q.setValueAtTime(value * 10, now);
          }
          break;

        case 'volume': {
          const volumeDb = -40 + value * 40;
          if (isDevilboxSynth(instrument)) {
            const gain = Math.pow(10, volumeDb / 20);
            (instrument.output as GainNode).gain.setValueAtTime(gain, now);
          } else if (inst.volume) {
            inst.volume.setValueAtTime(volumeDb, now);
          }
          break;
        }

        case 'pan': {
          const panValue = value * 2 - 1;
          if (inst.pan) {
            inst.pan.setValueAtTime(panValue, now);
          }
          break;
        }

        case 'distortion':
        case 'delay':
        case 'reverb':
          // These are handled by master effects chain
          break;

        default:
          // Handle WAM parameters or generic setParam
          if (instrument instanceof WAMSynth) {
            instrument.setParameter(parameter, value);
          } else if (typeof inst.setParam === 'function') {
            inst.setParam(parameter, value);
          }
          break;
      }
    } catch (error) {
      console.error(`Failed to apply automation for ${parameter}:`, error);
    }
  }

  /**
   * Trigger note attack
   */

  /**
   * Apply slide (portamento) and accent effects to a synth instrument
   * This implements 303-style slide/accent for all oscillator-based synths
   * 
   * @param instrument The synth instrument
   * @param targetFreq Target note frequency in Hz
   * @param time Scheduled time for the note
   * @param velocity Original velocity (0-1)
   * @param accent If true, boost velocity
   * @param slide If true, glide from previous frequency
   * @param channelIndex Channel index for tracking last note
   * @param instrumentId Instrument ID for tracking
   * @returns Modified velocity (with accent boost applied)
   */
  private applySlideAndAccent(
    instrument: Tone.ToneAudioNode | DevilboxSynth,
    targetFreq: number,
    time: number,
    velocity: number,
    accent?: boolean,
    slide?: boolean,
    channelIndex?: number,
    instrumentId?: number
  ): number {
    // Apply accent: boost velocity
    let finalVelocity = velocity;
    if (accent) {
      finalVelocity = Math.min(1, velocity * ToneEngine.ACCENT_BOOST);
    }

    // Apply slide: glide from previous note frequency
    if (slide && channelIndex !== undefined) {
      const lastNote = this.channelLastNote.get(channelIndex);
      
      // Only slide if there was a previous note on this channel
      if (lastNote && lastNote.frequency > 0) {
        // Get the oscillator frequency parameter
        // Different synths have different structures
        let freqParam: Tone.Param<'frequency'> | null = null;
        const s = instrument as any;

        if (s.oscillator?.frequency) {
          // Synth, MonoSynth, etc.
          freqParam = s.oscillator.frequency;
        } else if (s.voice0?.oscillator?.frequency) {
          // DuoSynth has voice0 and voice1
          freqParam = s.voice0.oscillator.frequency;
        } else if (s.frequency) {
          // Some synths expose frequency directly
          freqParam = s.frequency;
        }
        
        if (freqParam) {
          try {
            // Set to previous frequency first (no ramp)
            freqParam.setValueAtTime(lastNote.frequency, time);
            // Then exponentially approach target frequency (RC circuit style)
            freqParam.setTargetAtTime(targetFreq, time, ToneEngine.SLIDE_TIME_CONSTANT);
          } catch {
            // Silently ignore if frequency manipulation fails
            // The note will still play at the target frequency
          }
        }
      }
    }

    // Update last note tracking for this channel
    if (channelIndex !== undefined && instrumentId !== undefined) {
      this.channelLastNote.set(channelIndex, {
        frequency: targetFreq,
        time: time,
        instrumentId: instrumentId
      });
    }

    return finalVelocity;
  }

  public triggerNoteAttack(
    instrumentId: number,
    note: string,
    time: number,
    velocity: number = 1,
    config: InstrumentConfig,
    period?: number,
    accent?: boolean,
    slide?: boolean,
    channelIndex?: number,
    hammer?: boolean
  ): void {
    if (ToneEngine.NOTE_DEBUG) {
      console.log(`[NOTE] ▶ attack id=${instrumentId} ${config.synthType} ${note} ch=${channelIndex ?? '-'} vel=${velocity.toFixed(2)}`);
    }
    if (config.synthType === 'SuperCollider') {
      console.log('[SC:ToneEngine] triggerNoteAttack called — id:', instrumentId, 'note:', note, 'channelIndex:', channelIndex);
    }
    const instrument = this.getInstrument(instrumentId, config, channelIndex);

    if (!instrument) {
      if (ToneEngine.NOTE_DEBUG) {
        console.warn(`[NOTE] ✗ DROPPED (no instrument) id=${instrumentId} ${config.synthType} ${note}`);
      }
      if (config.synthType === 'SuperCollider') {
        console.warn('[SC:ToneEngine] triggerNoteAttack: getInstrument returned null!');
      }
      return;
    }

    // Sync the latest config into cached SC instances. The cached synth may have
    // been created with a stale (empty) config if the React prop hadn't updated yet
    // when the instance was first created. updateConfig() only reloads the binary
    // when it actually changes, so this is safe to call on every note trigger.
    if (config.synthType === 'SuperCollider' && config.superCollider) {
      (instrument as { updateConfig?: (c: typeof config.superCollider) => void })
        .updateConfig?.(config.superCollider);
    }

    // Check if instrument can play - allow triggerAttack (synths) or start (Players)
    const canPlay = (instrument as any).triggerAttack || (instrument as any).start;
    if (!canPlay) {
      if (ToneEngine.NOTE_DEBUG) {
        console.warn(`[NOTE] ✗ DROPPED (no triggerAttack/start) id=${instrumentId} ${config.synthType} ${note}`);
      }
      return;
    }

    // Resume audio context if suspended (prevents first keypress silence)
    // Do this synchronously before any timing checks
    const ctx = this._nativeContext;
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => { /* safe to ignore - requires user gesture */ });
    }

    // Get safe time for the attack.
    // isLive instruments (and SuperCollider which ignores the time param) always use immediate
    // triggering to bypass the Tone.js lookahead buffer and the getSafeTime null-check.
    const useImmediate = config.isLive || config.synthType === 'SuperCollider';
    const safeTime = useImmediate ? this.getImmediateTime() : this.getSafeTime(time);
    if (safeTime === null) {
      if (ToneEngine.NOTE_DEBUG) {
        console.warn(`[NOTE] ✗ DROPPED (context not ready) id=${instrumentId} ${config.synthType} ${note}`);
      }
      return; // Audio context not ready
    }

    try {
      // Try SynthRegistry hook first (new registry architecture)
      const registryDesc = SynthRegistry.get(config.synthType);
      if (registryDesc?.onTriggerAttack) {
        const handled = registryDesc.onTriggerAttack(instrument, note, safeTime, velocity, {
          accent, slide, hammer, period, channelIndex, config,
        });
        if (handled) return;
      }

      // Handle TB-303 with JC303 or DB303 engine (both support accent/slide)
      if (instrument instanceof JC303Synth) {
        // DEBUG LOGGING for JC303 synth calls
        if (typeof window !== 'undefined' && (window as unknown as { TB303_DEBUG_ENABLED?: boolean }).TB303_DEBUG_ENABLED) {
          console.log(
            `%c  └─► JC303.triggerAttack(%c"${note}", t=${safeTime.toFixed(3)}, vel=${velocity.toFixed(2)}, acc=${accent}, sld=${slide}%c)`,
            'color: #66f',
            'color: #aaa',
            'color: #66f'
          );
        }
        instrument.triggerAttack(note, safeTime, velocity, accent, slide);
      } else if (instrument instanceof DB303Synth) {
        // DEBUG LOGGING for DB303 synth calls
        if (typeof window !== 'undefined' && (window as unknown as { TB303_DEBUG_ENABLED?: boolean }).TB303_DEBUG_ENABLED) {
          console.log(
            `%c  └─► DB303.triggerAttack(%c"${note}", t=${safeTime.toFixed(3)}, vel=${velocity.toFixed(2)}, acc=${accent}, sld=${slide}, ham=${hammer}%c)`,
            'color: #66f',
            'color: #aaa',
            'color: #66f'
          );
        }
        // DB303Synth supports hammer for legato without pitch glide (TT-303 extension)
        instrument.triggerAttack(note, safeTime, velocity, accent, slide, hammer);
      } else if (config.synthType === 'NoiseSynth') {
        // NoiseSynth.triggerAttack(time, velocity) - no note
        (instrument as Tone.NoiseSynth).triggerAttack(safeTime, velocity);
      } else if (config.synthType === 'Sampler') {
        // MOD/XM samples with period-based playback are created as Players
        // Check the stored type to determine actual instrument class
        const key = this.getInstrumentKey(instrumentId, undefined);
        const actualType = this.instrumentSynthTypes.get(key);

        if (actualType === 'Player') {
          // This is actually a Player (MOD/XM sample), handle as Player
          const player = instrument as Tone.Player;

          if (!player.buffer || !player.buffer.loaded) {
            console.warn('[ToneEngine] Player buffer not loaded, skipping');
            return;
          }

          // Apply velocity as volume
          const velocityDb = velocity > 0 ? Tone.gainToDb(velocity) : -Infinity;
          player.volume.value = velocityDb;

          // Check if this is a MOD/XM sample with period-based playback
          if (config.metadata?.modPlayback?.usePeriodPlayback && period) {
            // Calculate playback rate from Amiga period (same formula as triggerNote)
            const modPlayback = config.metadata.modPlayback;
            let finetunedPeriod = period;

            if (modPlayback.finetune !== 0) {
              // Use ProTracker period table lookup for 100% accuracy
              const noteIndex = periodToNoteIndex(period, 0);
              if (noteIndex >= 0) {
                // Look up finetuned period from table
                finetunedPeriod = getPeriodExtended(noteIndex, modPlayback.finetune);
              }
            }

            // Calculate target frequency from period
            const frequency = modPlayback.periodMultiplier / finetunedPeriod;
            // Use the sample's original rate (8363 Hz for MOD), NOT the audio context rate
            const sampleRate = config.sample?.sampleRate || 8363;
            const playbackRate = frequency / sampleRate;

            // Apply global playback rate multiplier for pitch shifting
            (player as unknown as { playbackRate: number }).playbackRate = playbackRate * this.globalPlaybackRate;
          } else {
            // No period provided (keyboard playback) - calculate playback rate from note
            // The sample's base note is the pitch at playbackRate 1.0
            const baseNote = config.sample?.baseNote || 'C4';
            const baseFreq = cachedFrequency(baseNote);
            const targetFreq = cachedFrequency(note);
            const playbackRate = targetFreq / baseFreq;

            // Apply global playback rate multiplier for pitch shifting
            (player as unknown as { playbackRate: number }).playbackRate = playbackRate * this.globalPlaybackRate;
          }

          player.start(safeTime);
        } else {
          // Regular Sampler (or empty Sampler with no buffers)
          if (actualType === 'EmptySampler') return; // No sample data, skip silently
          const sampler = instrument as Tone.Sampler;
          if (!sampler.loaded) {
            return;
          }

          // Reference-based slicing: Check if this is a sliced instrument
          const isSlicedSample = config.sample?.sliceStart !== undefined && config.sample?.sliceEnd !== undefined;

          if (isSlicedSample) {
            // Play only the slice range using Tone.Player
            const baseNote = config.sample?.baseNote || 'C4';
            const samplerInternal = sampler as unknown as { _buffers?: { get?: (note: string) => Tone.ToneAudioBuffer | undefined; _buffers?: Record<string, Tone.ToneAudioBuffer> } };
            const buffer = samplerInternal._buffers?.get?.(baseNote) ||
                           samplerInternal._buffers?._buffers?.[baseNote];

            if (buffer && buffer.duration) {
              const sampleRate = buffer.sampleRate || Tone.getContext().sampleRate;
              const sliceStart = config.sample!.sliceStart!;
              // Note: sliceEnd is available but not used here - slice plays until release

              // Convert frame indices to time offsets
              const startTime = sliceStart / sampleRate;

              try {
                // Create a one-shot Player for this slice (no duration, plays until release)
                const slicePlayer = new Tone.Player({
                  url: buffer,
                  volume: Tone.gainToDb(velocity) + getNormalizedVolume('Sampler', config.volume),
                });
                slicePlayer.connect(this.getInstrumentOutputDestination(instrumentId, false));

                // Calculate pitch adjustment for the note (relative to base note)
                const baseFreq = cachedFrequency(baseNote);
                const targetFreq = cachedFrequency(note);
                const playbackRate = targetFreq / baseFreq;

                // Apply global playback rate multiplier for pitch shifting
                (slicePlayer as unknown as { playbackRate: number }).playbackRate = playbackRate * this.globalPlaybackRate;

                // Start at slice start
                slicePlayer.start(safeTime, startTime);

                // Store player reference for later release
                this.slicePlayersMap.set(`${instrumentId}-${note}`, slicePlayer);

              } catch (e) {
                console.warn('[ToneEngine] Slice triggerAttack failed, falling back:', e);
                sampler.triggerAttack(note, safeTime, velocity);
              }
            } else {
              sampler.triggerAttack(note, safeTime, velocity);
            }
          } else {
            try {
              sampler.triggerAttack(note, safeTime, velocity);
            } catch {
              // Sampler may throw "No available buffers" if async loading hasn't completed
            }
          }
        }
      } else if (config.synthType === 'Player' || config.synthType === 'GranularSynth') {
        // Player/GranularSynth need a buffer loaded
        const player = instrument as Tone.Player | Tone.GrainPlayer;
        if (!player.buffer || !player.buffer.loaded) {
          // Silently skip - no sample loaded yet
          return;
        }

        // Apply velocity as volume (Player doesn't have velocity parameter like Sampler)
        // Convert velocity (0-1) to dB: velocity 1.0 = 0dB, 0.5 = -6dB, 0 = -Infinity
        const velocityDb = velocity > 0 ? Tone.gainToDb(velocity) : -Infinity;
        player.volume.value = velocityDb;

        // Check if this is a MOD/XM sample with period-based playback
        if (config.metadata?.modPlayback?.usePeriodPlayback && period) {
          // Calculate playback rate from Amiga period (same formula as triggerNote)
          const modPlayback = config.metadata.modPlayback;
          let finetunedPeriod = period;

          if (modPlayback.finetune !== 0) {
            // Use ProTracker period table lookup for 100% accuracy
            const noteIndex = periodToNoteIndex(period, 0);
            if (noteIndex >= 0) {
              // Look up finetuned period from table
              finetunedPeriod = getPeriodExtended(noteIndex, modPlayback.finetune);
            }
          }

          // Calculate target frequency from period
          const frequency = modPlayback.periodMultiplier / finetunedPeriod;
          // Use the sample's original rate (8363 Hz for MOD), NOT the audio context rate
          const sampleRate = config.sample?.sampleRate || 8363;
          const playbackRate = frequency / sampleRate;
          player.playbackRate = playbackRate;
        } else {
          // No period provided (keyboard playback) - calculate playback rate from note
          const baseNote = config.sample?.baseNote || 'C4';
          const baseFreq = cachedFrequency(baseNote);
          const targetFreq = cachedFrequency(note);
          const playbackRate = targetFreq / baseFreq;
          player.playbackRate = playbackRate;
        }

        player.start(safeTime);
      } else if ((config.synthType as string) === 'NoiseSynth') {
        // NoiseSynth doesn't use note frequencies - just trigger at time with velocity
        const noiseSynth = instrument as Tone.NoiseSynth;
        const finalVelocity = accent ? Math.min(1, velocity * ToneEngine.ACCENT_BOOST) : velocity;
        noiseSynth.triggerAttack(safeTime, finalVelocity);
      } else if (config.synthType === 'MetalSynth') {
        // MetalSynth uses frequency but through its own API
        const metalSynth = instrument as Tone.MetalSynth;
        const finalVelocity = accent ? Math.min(1, velocity * ToneEngine.ACCENT_BOOST) : velocity;
        // MetalSynth.triggerAttack(time, velocity) - no note parameter
        metalSynth.triggerAttack(safeTime, finalVelocity);
      } else if (config.synthType === 'MembraneSynth') {
        // MembraneSynth takes note but has a different signature
        const membraneSynth = instrument as Tone.MembraneSynth;
        const finalVelocity = accent ? Math.min(1, velocity * ToneEngine.ACCENT_BOOST) : velocity;
        membraneSynth.triggerAttack(note, safeTime, finalVelocity);
      } else if (instrument.constructor.name === 'BuzzmachineGenerator') {
        // Buzzmachine generators support accent/slide for 303 behavior
        (instrument as unknown as { triggerAttack: (note: string, time: number, velocity: number, accent?: boolean, slide?: boolean) => void }).triggerAttack(note, safeTime, velocity, accent, slide);
      } else if (instrument instanceof WAMSynth) {
        instrument.triggerAttack(note, safeTime, velocity);
      } else {
        // Set chip channel on FurnaceSynth before triggering (for multi-channel tracker playback)
        if (instrument instanceof FurnaceSynth && channelIndex !== undefined) {
          const maxCh = FurnaceSynth.getMaxChannels(instrument.getChipType());
          instrument.setChannelIndex(channelIndex % maxCh);
        }
        // Set chip channel on FurnaceDispatchSynth (for C64/GB/NES multi-channel tracker playback)
        if (instrument instanceof FurnaceDispatchSynth && channelIndex !== undefined) {
          const maxCh = instrument.getNumChannels() || 3;
          const chipChannel = channelIndex % maxCh;
          instrument.setChannel(chipChannel);
        }
        // Standard synths - apply slide/accent for 303-style effects
        const targetFreq = cachedFrequency(note);
        const finalVelocity = this.applySlideAndAccent(
          instrument, targetFreq, safeTime, velocity,
          accent, slide, channelIndex, instrumentId
        );
        (instrument as any).triggerAttack(note, safeTime, finalVelocity);
      }
    } catch (error) {
      console.error(`[ToneEngine] Error in triggerNoteAttack for ${config.synthType}:`, error);
    }
  }

  /**
   * Trigger note release
   */
  public triggerNoteRelease(
    instrumentId: number,
    note: string,
    time: number,
    config: InstrumentConfig,
    channelIndex?: number
  ): void {
    notifyInstrumentRelease(instrumentId);
    const instrument = this.getInstrument(instrumentId, config, channelIndex);

    if (!instrument || !(instrument as any).triggerRelease) {
      // Special case: Sampler instruments created as Tone.Player (looped waves/wavetables)
      // have no triggerRelease but must be explicitly stopped to prevent infinite looping.
      if (config.synthType === 'Sampler') {
        const playerKey = this.getInstrumentKey(instrumentId, -1);
        const playerActualType = this.instrumentSynthTypes.get(playerKey);
        if (playerActualType === 'Player') {
          const player = instrument as Tone.Player;
          if (player.state === 'started') {
            const stopTime = config.isLive ? this.getImmediateTime() : this.getSafeTime(time);
            if (stopTime !== null) player.stop(stopTime);
          }
        }
      }
      // Special case: GranularSynth (Tone.GrainPlayer) has no triggerRelease — use stop().
      if (config.synthType === 'GranularSynth' && instrument) {
        const player = instrument as Tone.GrainPlayer;
        if (player.state === 'started') {
          const stopTime = config.isLive ? this.getImmediateTime() : this.getSafeTime(time);
          if (stopTime !== null) player.stop(stopTime);
        }
      }
      return;
    }

    // Ensure we have a valid time - Tone.now() can return null if context isn't ready
    // If instrument is marked as "Live", always use immediate time to bypass lookahead
    const safeTime = config.isLive ? this.getImmediateTime() : this.getSafeTime(time);
    if (safeTime === null) {
      return; // Audio context not ready, skip release
    }

    try {
      // Try SynthRegistry hook first (new registry architecture)
      const registryDesc = SynthRegistry.get(config.synthType);
      if (registryDesc?.onTriggerRelease) {
        const handled = registryDesc.onTriggerRelease(instrument, note, safeTime, { config });
        if (handled) return;
      }

      // Handle sample-based instruments
      if (config.synthType === 'Sampler') {
        // Check if this is a sliced sample with an active player
        const sliceKey = `${instrumentId}-${note}`;
        const slicePlayer = this.slicePlayersMap.get(sliceKey);

        if (slicePlayer) {
          // Stop and dispose the slice player
          if (slicePlayer.state === 'started') {
            slicePlayer.stop(safeTime);
          }
          // Schedule disposal after a short delay to allow for envelope decay
          Tone.getTransport().scheduleOnce(() => {
            slicePlayer.dispose();
          }, safeTime + 0.1);
          this.slicePlayersMap.delete(sliceKey);
          return;
        }

        // Regular sampler release
        const sampler = instrument as Tone.Sampler;
        if (!sampler.loaded) return; // No sample loaded
        sampler.triggerRelease(note, safeTime);
        return;
      }

      if (config.synthType === 'Player' || config.synthType === 'GranularSynth') {
        // Player/GranularSynth use stop() instead of triggerRelease
        const player = instrument as Tone.Player | Tone.GrainPlayer;
        if (player.state === 'started') {
          player.stop(safeTime);
        }
        return;
      }

      // Some synths don't take a note parameter for release
      if (config.synthType === 'OPL3') {
        // OPL3: set channel before release for channel-addressed note-off
        if (instrument instanceof OPL3Synth && channelIndex !== undefined) {
          instrument.setChannel(channelIndex % 18);
        }
        (instrument as any).triggerRelease(undefined, safeTime);
        return;
      }
      if (
        config.synthType === 'NoiseSynth' ||
        config.synthType === 'MonoSynth' ||
        config.synthType === 'DuoSynth' ||
        config.synthType === 'MetalSynth' ||
        config.synthType === 'MembraneSynth' ||
        config.synthType === 'DrumMachine' ||
        config.synthType === 'TR808' ||
        config.synthType === 'TR909' ||
        config.synthType === 'TB303' ||
        config.synthType === 'DubSiren' ||
        config.synthType === 'Synare' ||
        config.synthType === 'Furnace' ||
        // Buzzmachine generators (monophonic, no note parameter)
        config.synthType === 'BuzzKick' ||
        config.synthType === 'BuzzKickXP' ||
        config.synthType === 'BuzzNoise' ||
        config.synthType === 'BuzzTrilok' ||
        config.synthType === 'Buzz4FM2F' ||
        config.synthType === 'BuzzDynamite6' ||
        config.synthType === 'BuzzM3' ||
        config.synthType === 'Buzz3o3' ||
        config.synthType === 'SpaceLaser' ||
        // MAME chip synths and hardware WASM synths use triggerRelease(time) - no note
        config.synthType === 'Sam' ||
        config.synthType === 'DECtalk' ||
        config.synthType === 'PinkTrombone' ||
        config.synthType === 'V2' ||
        config.synthType === 'V2Speech' ||
        config.synthType === 'MAMEVFX' ||
        config.synthType === 'MAMEDOC' ||
        config.synthType === 'MAMERSA' ||
        config.synthType === 'MAMESWP30' ||
        config.synthType === 'CZ101' ||
        config.synthType === 'CEM3394' ||
        config.synthType === 'SCSP' ||
        // MAME worklet synths (all use triggerRelease with no note)
        config.synthType.startsWith('MAME') ||
        config.synthType === 'SunVoxSynth' ||
        // WASM monosynths track current note internally
        config.synthType === 'Monique' ||
        config.synthType === 'Amsynth' ||
        config.synthType === 'RaffoSynth'
      ) {
        // These synths use triggerRelease(time) - no note parameter
        (instrument as any).triggerRelease(safeTime);
      } else if (
        // Tone.js monophonic synths (when NOT wrapped in PolySynth)
        // These track the current note internally and don't need note parameter
        instrument instanceof Tone.MonoSynth ||
        instrument instanceof Tone.DuoSynth ||
        instrument instanceof Tone.FMSynth ||
        instrument instanceof Tone.AMSynth
      ) {
        // MonoSynth-style: triggerRelease(time)
        instrument.triggerRelease(safeTime);
      } else {
        // PolySynth and others use triggerRelease(note, time)
        (instrument as any).triggerRelease(note, safeTime);
      }
    } catch (error) {
      console.error(`[ToneEngine] Error in triggerNoteRelease for ${config.synthType}:`, error);
    }
  }

  // Synth types that are natively polyphonic (PolySynth-based) and don't need voice allocation
  // These either ARE PolySynths or wrap a PolySynth internally
  private static readonly NATIVE_POLY_TYPES = new Set([
    'Synth', 'FMSynth', 'ToneAM', 'PluckSynth', 'Sampler',
    // InstrumentFactory types that use PolySynth internally
    'SuperSaw', 'PolySynth', 'Organ', 'ChipSynth', 'PWMSynth',
    'StringMachine', 'FormantSynth', 'Wavetable', 'WobbleBass',
    // Zynthian WASM synths (polyphony handled internally by WASM)
    'MdaEPiano', 'MdaJX10', 'MdaDX10', 'ToneAM',
    'Amsynth', 'RaffoSynth', 'CalfMono', 'SetBfree', 'SynthV1',
    'TalNoizeMaker', 'Aeolus', 'FluidSynth', 'Sfizz',
    'ZynAddSubFX', 'Monique', 'VL1',
    // Retromulator WASM synths (polyphony handled internally by emulated hardware)
    'DX7', 'OPL3', 'OpenWurli',
  ]);

  /**
   * Trigger a polyphonic note attack - allocates a voice channel automatically
   * Use this for keyboard and MIDI playback when polyphonic mode is enabled
   *
   * @param accent - TB-303 accent flag (boosts filter/volume)
   * @param slide - TB-303 slide flag (legato - pitch glides without retriggering envelopes)
   */
  public triggerPolyNoteAttack(
    instrumentId: number,
    note: string,
    velocity: number,
    config: InstrumentConfig,
    accent: boolean = false,
    slide: boolean = false
  ): void {
    if (config.synthType === 'SuperCollider') {
      console.log('[SC:ToneEngine] triggerPolyNoteAttack called — id:', instrumentId, 'note:', note, 'synthType:', config.synthType, 'binary:', config.superCollider?.binary ? `${config.superCollider.binary.length}b` : 'EMPTY');
    }

    // Side-channel: record the attack time for this instrument so the
    // SampleEditor playhead can animate when notes are triggered via
    // the test keyboard / piano / external MIDI (not just the editor's
    // own Play button).
    notifyInstrumentAttack(instrumentId, Tone.getContext().rawContext.currentTime);

    // Fire-and-forget drum machines: trigger immediately, no voice tracking or release.
    // Drums create independent Web Audio nodes per hit — no gate/release cycle needed.
    if (config.synthType === 'TR808' || config.synthType === 'TR909' || config.synthType === 'DrumMachine') {
      const triggerTime = config.isLive ? this.getImmediateTime() : this.getImmediateTime();
      this.triggerNoteAttack(instrumentId, note, triggerTime, velocity, config, undefined, accent);
      return;
    }

    // Monophonic synths (enforced at runtime for safety, even if config.monophonic isn't set)
    // These synths are architecturally monophonic and will break with polyphonic note allocation
    const monoSynthTypes = new Set([
      // Speech synthesis (have speech sequencers that conflict with polyphony)
      'MAMEMEA8000', 'MAMETMS5220', 'MAMESP0250', 'MAMEVotrax', 'Sam', 'DECtalk', 'PinkTrombone', 'V2Speech',
      // Single-voice generators
      'MAMECM3394', 'MAMETMS36XX', 'MAMESN76477', 'MAMEUPD931', 'MAMEUPD933',
      // Monophonic synths
      'MonoSynth', 'DuoSynth', 'TB303', 'Buzz3o3', 'DB303', 'DubSiren', 'SpaceLaser', 'Synare',
      // Zynthian mono synths (single-voice WASM engines)
      'RaffoSynth', 'CalfMono', 'Monique', 'VL1',
    ]);
    const isMonoSynth = config.synthType ? monoSynthTypes.has(config.synthType) : false;

    // Check if instrument is explicitly marked as monophonic or is an inherently mono synth
    if (config.monophonic === true || isMonoSynth) {
      // Force monophonic: Release any previous notes for this instrument first
      // IMPORTANT: For 303 slide, we DON'T release first - the slide maintains the gate
      if (!slide) {
        this.releaseAllPolyNotes(instrumentId, config);
      }
      // Fall through to monophonic triggering logic below
    }

    // For natively polyphonic synths (PolySynth-based), just use the shared instance
    // They already support multiple simultaneous notes
    // Also treat undefined synthType as polyphonic (default creates PolySynth)
    const synthType = config.synthType;
    const isNativePoly = !synthType || ToneEngine.NATIVE_POLY_TYPES.has(synthType);
    if (isNativePoly && config.monophonic !== true) {
      // Track active notes for release
      this.liveVoiceAllocation.set(note, -1); // -1 = using shared instance
      // Use shared instance (channelIndex undefined)
      // Use immediate time if isLive
      const triggerTime = config.isLive ? this.getImmediateTime() : 0;
      this.triggerNoteAttack(instrumentId, note, triggerTime, velocity, config, undefined, accent, slide);
      return;
    }

    // WASM monophonic synths: Always use shared instance to avoid expensive per-note
    // WASM instantiation. These synths handle note transitions internally
    // (e.g., Open303 uses noteList for slide/trigger behavior per Classic-Naive MIDI).
    // Creating separate instances per note causes: orphaned audio, parameter updates
    // going to wrong instances, and unnecessary WASM init overhead.
    if (synthType === 'TB303' || synthType === 'Buzz3o3') {
      // Monophonic: release previous notes unless sliding
      if (!slide) {
        this.releaseAllPolyNotes(instrumentId, config);
      }
      // Use shared instance (channelIndex undefined → key = instrumentId--1)
      this.liveVoiceAllocation.set(note, -1);
      const triggerTime = config.isLive ? this.getImmediateTime() : 0;
      this.triggerNoteAttack(instrumentId, note, triggerTime, velocity, config, undefined, accent, slide);
      return;
    }

    // For other monophonic synths, allocate separate channel/instance
    // Check if this note is already playing
    if (this.liveVoiceAllocation.has(note)) {
      // For slide, we don't release - we glide to the new pitch
      if (!slide) {
        // Release the old voice first
        this.triggerPolyNoteRelease(instrumentId, note, config);
      }
    }

    // Allocate a voice channel (with stealing if all voices busy)
    const channelIndex = this.voiceAllocator.allocate(note, instrumentId, velocity);
    this.liveVoiceAllocation.set(note, channelIndex);

    // Get immediate time for lowest latency triggering
    const immediateTime = this.getImmediateTime();

    // Trigger the note on this channel (creates separate instance for monophonic synths)
    // Pass accent and slide flags for 303 behavior
    this.triggerNoteAttack(instrumentId, note, immediateTime, velocity, config, undefined, accent, slide, channelIndex);
  }

  /**
   * Release a polyphonic note - frees the voice channel
   */
  public triggerPolyNoteRelease(
    instrumentId: number,
    note: string,
    config: InstrumentConfig
  ): void {
    const channelIndex = this.liveVoiceAllocation.get(note);
    if (channelIndex === undefined) {
      return; // Note wasn't playing
    }

    this.liveVoiceAllocation.delete(note);

    const immediateTime = config.isLive ? this.getImmediateTime() : 0;

    if (channelIndex === -1) {
      // Native polyphonic synth - release on shared instance
      this.triggerNoteRelease(instrumentId, note, immediateTime, config);
    } else {
      // Allocated voice channel - release on specific instance
      // Mark voice as releasing (lowers priority for stealing)
      this.voiceAllocator.markReleasing(channelIndex);
      this.triggerNoteRelease(instrumentId, note, immediateTime, config, channelIndex);
      // Free the voice after release envelope completes
      setTimeout(() => {
        this.voiceAllocator.free(channelIndex);
      }, 100);
    }
  }

  /**
   * Release all polyphonic voices
   */
  public releaseAllPolyNotes(instrumentId: number, config: InstrumentConfig): void {
    for (const [note, channelIndex] of this.liveVoiceAllocation.entries()) {
      if (channelIndex === -1) {
        // Native polyphonic synth
        this.triggerNoteRelease(instrumentId, note, 0, config);
      } else {
        // Allocated voice channel
        this.triggerNoteRelease(instrumentId, note, 0, config, channelIndex);
        this.voiceAllocator.free(channelIndex);
      }
    }
    this.liveVoiceAllocation.clear();
  }

  /**
   * Check if polyphonic mode has any active notes
   */
  public hasActivePolyNotes(): boolean {
    return this.liveVoiceAllocation.size > 0;
  }

  /**
   * Release a note (simpler version without config)
   */
  public releaseNote(instrumentId: number, note: string, time?: number, channelIndex?: number): void {
    const key = this.getInstrumentKey(instrumentId, channelIndex);
    let instrument = this.instruments.get(key);

    // Fallback to legacy key if not found
    if (!instrument) {
      instrument = this.instruments.get(this.getInstrumentKey(instrumentId, -1));
    }

    if (!instrument) return;

    // Ensure we have a valid time
    const safeTime = this.getSafeTime(time);
    if (safeTime === null) {
      return; // Audio context not ready, skip release
    }

    // Check the stored synth type to determine release method
    const synthType = this.instrumentSynthTypes.get(key) ||
                      this.instrumentSynthTypes.get(this.getInstrumentKey(instrumentId, -1));

    // Handle sample-based instruments
    if (synthType === 'Sampler') {
      const sampler = instrument as Tone.Sampler;
      if (sampler.loaded && sampler.triggerRelease) {
        try {
          sampler.triggerRelease(note, safeTime);
        } catch { /* Silently ignore */ }
      }
      return;
    }

    if (synthType === 'Player' || synthType === 'GranularSynth') {
      // Player/GranularSynth use stop() instead of triggerRelease
      const player = instrument as Tone.Player | Tone.GrainPlayer;
      if (player.state === 'started') {
        try {
          player.stop(safeTime);
        } catch { /* Silently ignore */ }
      }
      return;
    }

    if (!(instrument as any).triggerRelease) return;

    // Mono-style synths use triggerRelease(time) - no note parameter
    const isMonoStyle = synthType === 'MonoSynth' ||
                        synthType === 'DuoSynth' ||
                        synthType === 'MetalSynth' ||
                        synthType === 'MembraneSynth' ||
                        synthType === 'NoiseSynth' ||
                        synthType === 'TB303' ||
                        synthType === 'Buzz3o3' ||
                        synthType === 'BuzzKick' ||
                        synthType === 'BuzzKickXP' ||
                        synthType === 'BuzzNoise' ||
                        synthType === 'BuzzTrilok' ||
                        synthType === 'Buzz4FM2F' ||
                        synthType === 'BuzzDynamite6' ||
                        synthType === 'BuzzM3' ||
                        synthType === 'DubSiren' ||
                        synthType === 'Synare';

    try {
      if (isMonoStyle) {
        (instrument as any).triggerRelease(safeTime);
      } else {
        // PolySynth and others take note parameter
        (instrument as any).triggerRelease(note, safeTime);
      }
    } catch {
      // Fallback: try without note if with note fails
      try {
        (instrument as any).triggerRelease(safeTime);
      } catch {
        // Silently ignore - note may have already been released
      }
    }
  }

  /**
   * Trigger note attack and release (one-shot)
   */
  public triggerNote(
    instrumentId: number,
    note: string,
    duration: number,
    time: number,
    velocity: number = 1,
    config: InstrumentConfig,
    accent?: boolean,
    slide?: boolean,
    channelIndex?: number,
    period?: number,
    sampleOffset?: number, // 9xx effect: start sample at byte offset
    nnaAction: number = 0,  // IT New Note Action: 0=Cut, 1=Cont, 2=Off, 3=Fade
    hammer?: boolean        // TT-303 hammer: legato without pitch glide
  ): void {
    const safeTime = this.getSafeTime(time);
    if (safeTime === null) {
      if (ToneEngine.NOTE_DEBUG) {
        console.warn(`[NOTE] ✗ DROPPED (context not ready) id=${instrumentId} ${config.synthType} ${note} ch=${channelIndex}`);
      }
      return;
    }

    if (ToneEngine.NOTE_DEBUG) {
      console.log(`[NOTE] ▶ trigger id=${instrumentId} ${config.synthType} ${note} ch=${channelIndex} dur=${duration.toFixed(3)} vel=${velocity.toFixed(2)}`);
    }

    const instrument = this.getInstrument(instrumentId, config, channelIndex);
    if (!instrument) {
      if (ToneEngine.NOTE_DEBUG) {
        console.warn(`[NOTE] ✗ DROPPED (no instrument) id=${instrumentId} ${config.synthType} ${note} ch=${channelIndex}`);
      }
      return;
    }
    
    if (channelIndex !== undefined) {
      // 1. Handle Past Note Actions (NNA)
      let voices = this.activeVoices.get(channelIndex) || [];

      if (nnaAction === 0) { // CUT (Standard MOD/XM/S3M behavior)
        // IMPORTANT: Don't stop voices that use the same instrument instance as the new note
        // This prevents mono synths (like FurnaceSynth) from having keyOff called right after keyOn
        // Stop non-matching voices and compact in-place (avoids filter() allocation)
        let writeIdx = 0;
        for (let i = 0; i < voices.length; i++) {
          if (voices[i].instrument === instrument) {
            voices[writeIdx++] = voices[i];
          } else {
            this.stopVoice(voices[i], safeTime);
          }
        }
        voices.length = writeIdx;
      } else {
        // IT NNA: Continue, Note Off, or Fade
        for (let i = 0; i < voices.length; i++) {
          if (nnaAction === 2) voices[i].volumeEnv.keyOff(); // Note Off
          if (nnaAction === 3) {
            voices[i].isKeyOff = true; // Start fadeout
            // Use instrument's fadeout rate if available
            if (voices[i].fadeoutStep === 0) voices[i].fadeoutStep = 1024; // Default approx 1/64
          }
        }
      }

      // 2. Create independent playback node for this voice
      // This is essential for IT NNA so overlapping notes have separate envelopes/filters
      let voiceNode: Tone.ToneAudioNode | DevilboxSynth;
      if (config.synthType === 'Sampler' || config.synthType === 'Player') {
        const playerInst = instrument as Tone.Player;
        voiceNode = new Tone.Player(playerInst.buffer);
        // FIX: Copy looping settings from parent instrument
        (voiceNode as Tone.Player).loop = playerInst.loop;
        (voiceNode as Tone.Player).loopStart = playerInst.loopStart;
        (voiceNode as Tone.Player).loopEnd = playerInst.loopEnd;
      } else if (config.synthType === 'Synth') {
        voiceNode = new Tone.Synth((instrument as Tone.Synth).get());
      } else {
        voiceNode = instrument; // Fallback for specialized synths (mono synths like FurnaceSynth)
      }

      // 3. Create new voice state and routing chain
      // Enforce per-channel voice limit (stop oldest voices if over limit)
      const maxV = this.channelMaxVoices.get(channelIndex) || 0;
      if (maxV > 0) {
        while (voices.length >= maxV) {
          const oldest = voices.shift();
          if (oldest) this.stopVoice(oldest, safeTime);
        }
      }

      // For mono synths where voiceNode === instrument, check if voice already exists
      const existingVoiceIndex = voices.findIndex(v => v.instrument === voiceNode);
      if (existingVoiceIndex >= 0) {
        // Mono synth: reuse existing voice entry, just update the note
        voices[existingVoiceIndex].note = note;
      } else {
        // Create new voice entry
        try {
          const voice = this.createVoice(channelIndex, voiceNode, note, config);
          if (!isDevilboxSynth(voiceNode)) {
            voiceNode.connect(voice.nodes.gain);
          }
          // DevilboxSynths: audio flows via buildInstrumentEffectChain → masterInput
          voices.push(voice);
        } catch (voiceErr) {
          console.error(`[ToneEngine] createVoice failed for ch=${channelIndex} type=${config.synthType}:`, voiceErr);
          // Still try to trigger the sound even without voice routing
        }
      }
      this.activeVoices.set(channelIndex, voices);

      // 4. Trigger the playback
      try {
        if (voiceNode instanceof Tone.Player) {
          // Apply velocity as volume
          const velocityDb = velocity > 0 ? Tone.gainToDb(velocity) : -Infinity;
          voiceNode.volume.value = velocityDb;

          if (config.metadata?.modPlayback?.usePeriodPlayback && period) {
            const modPlayback = config.metadata.modPlayback;
            const frequency = modPlayback.periodMultiplier / period;
            const sampleRate = config.sample?.sampleRate || 8363;
            const playbackRate = frequency / sampleRate;
            // Apply global playback rate multiplier for pitch shifting
            (voiceNode as unknown as { playbackRate: number }).playbackRate = playbackRate * this.globalPlaybackRate;
          } else {
            // FIX: Handle non-period playback for voice nodes (matches triggerNoteAttack)
            const baseNote = config.sample?.baseNote || 'C4';
            const baseFreq = cachedFrequency(baseNote);
            const targetFreq = cachedFrequency(note);
            const playbackRate = targetFreq / baseFreq;
            // Apply global playback rate multiplier for pitch shifting
            (voiceNode as unknown as { playbackRate: number }).playbackRate = playbackRate * this.globalPlaybackRate;
          }
          // sampleOffset is in frames at the ORIGINAL sample rate (8363 Hz for MOD/XM).
          // The decoded buffer runs at the AudioContext rate (44100 Hz) — do NOT use that.
          // pt2-clone bounds check: if sampleOffset >= total sample length, play from beginning.
          const origRate = config.sample?.sampleRate || 8363;
          const bufferDuration = voiceNode.buffer?.duration ?? 0;
          let offset = 0;
          if (sampleOffset && sampleOffset > 0 && bufferDuration > 0) {
            const bufferFrames = bufferDuration * origRate;
            if (sampleOffset < bufferFrames) {
              offset = Math.min(sampleOffset / origRate, bufferDuration - 0.001);
            }
            // else: offset >= sample length → play from beginning (pt2-clone behavior)
            console.log(`[9xx:voice] sampleOffset=${sampleOffset} origRate=${origRate} bufferDur=${bufferDuration.toFixed(4)}s bufferFrames=${Math.round(bufferFrames)} → timeOffset=${offset.toFixed(4)}s ${sampleOffset >= bufferFrames ? '(CLAMPED TO 0 — offset >= length!)' : ''}`);
          }
          voiceNode.start(safeTime, offset);
        } else if ((voiceNode as any).triggerAttack) {
          // Safety: ensure DevilboxSynth output gain isn't stuck at 0
          if (isDevilboxSynth(voiceNode)) {
            const gain = (voiceNode.output as GainNode).gain;
            if (gain.value === 0) { gain.cancelScheduledValues(0); gain.value = 1; }
          }
          // Set chip channel on FurnaceSynth before triggering (for multi-channel tracker playback)
          if (voiceNode instanceof FurnaceSynth && channelIndex !== undefined) {
            const maxCh = FurnaceSynth.getMaxChannels(voiceNode.getChipType());
            voiceNode.setChannelIndex(channelIndex % maxCh);
          }
          // Set chip channel on FurnaceDispatchSynth (for C64/GB/NES multi-channel tracker playback)
          if (voiceNode instanceof FurnaceDispatchSynth && channelIndex !== undefined) {
            const maxCh = voiceNode.getNumChannels() || 3;
            const chipChannel = channelIndex % maxCh;
            voiceNode.setChannel(chipChannel);
          }
          // Set chip channel on OPL3Synth (for multi-timbral AdLib tracker playback)
          if (voiceNode instanceof OPL3Synth && channelIndex !== undefined) {
            voiceNode.setChannel(channelIndex % 18);
          }
          // NoiseSynth and MetalSynth don't take note parameter: triggerAttack(time, velocity)
          if (config.synthType === 'NoiseSynth' || config.synthType === 'MetalSynth') {
            const finalVelocity = accent ? Math.min(1, velocity * ToneEngine.ACCENT_BOOST) : velocity;
            (voiceNode as any).triggerAttack(safeTime, finalVelocity);
          } else if (voiceNode instanceof JC303Synth) {
            // JC303 WASM engine (now supports accent/slide)
            voiceNode.triggerAttack(note, safeTime, velocity, accent, slide);
          } else if (voiceNode instanceof DB303Synth) {
            // DB303 WASM engine (now supports accent/slide)
            voiceNode.triggerAttack(note, safeTime, velocity, accent, slide);
          } else {
            // Standard synths - apply slide/accent for 303-style effects
            const targetFreq = cachedFrequency(note);
            const finalVelocity = this.applySlideAndAccent(
              voiceNode, targetFreq, safeTime, velocity,
              accent, slide, channelIndex, instrumentId
            );
            (voiceNode as any).triggerAttack(note, safeTime, finalVelocity);
          }
        }
      } catch (e) {
        console.error(`[ToneEngine] Voice trigger error:`, e);
      }

      // Apply global detune to newly triggered synth voices (Wxx pitch slide)
      if (this.globalDetuneCents !== 0 && !isDevilboxSynth(voiceNode)) {
        if ((voiceNode as any).detune?.value !== undefined) {
          (voiceNode as any).detune.value = this.globalDetuneCents;
        } else if ((voiceNode as any).set) {
          try { (voiceNode as any).set({ detune: this.globalDetuneCents }); } catch { /* */ }
        }
      }

      return; // Handled via voice system
    }

    // Safety: ensure DevilboxSynth output gain hasn't been stuck at 0
    // (can happen if releaseAll gain-restore races with instrument disposal/recreation)
    if (isDevilboxSynth(instrument)) {
      const gain = (instrument.output as GainNode).gain;
      if (gain.value === 0) {
        gain.cancelScheduledValues(0);
        gain.value = 1;
      }
    }

    try {
      // Fallback for non-channel triggers (like pre-listening)
      if (instrument instanceof JC303Synth) {
        (instrument as any).triggerAttackRelease(note, duration, safeTime, velocity, accent, slide);
      } else if (instrument instanceof DB303Synth) {
        // DB303Synth supports hammer for legato without pitch glide (TT-303 extension)
        (instrument as any).triggerAttackRelease(note, duration, safeTime, velocity, accent, slide, hammer);
      } else if (config.synthType === 'NoiseSynth') {
        // NoiseSynth doesn't take note parameter: triggerAttackRelease(duration, time, velocity)
        (instrument as Tone.NoiseSynth).triggerAttackRelease(duration, safeTime, velocity);
      } else if (config.synthType === 'MetalSynth') {
        // MetalSynth replaced with NoiseSynth - doesn't take note parameter
        (instrument as Tone.NoiseSynth).triggerAttackRelease(duration, safeTime, velocity);
      } else if (config.synthType === 'MembraneSynth') {
        // MembraneSynth replaced with regular Synth for performance
        (instrument as Tone.Synth).triggerAttackRelease(note, duration, safeTime, velocity);
      } else if (config.synthType === 'GranularSynth') {
        // GrainPlayer uses start/stop instead of triggerAttackRelease
        const grainPlayer = instrument as Tone.GrainPlayer;
        if (grainPlayer.buffer && grainPlayer.buffer.loaded) {
          // Apply velocity as volume
          const velocityDb = velocity > 0 ? Tone.gainToDb(velocity) : -Infinity;
          grainPlayer.volume.value = velocityDb;

          // Check if this is a MOD/XM sample with period-based playback
          if (config.metadata?.modPlayback?.usePeriodPlayback && period) {
            // Calculate playback rate from Amiga period
            const modPlayback = config.metadata.modPlayback;
            let finetunedPeriod = period;

            if (modPlayback.finetune !== 0) {
              // Use ProTracker period table lookup for 100% accuracy
              // PERFORMANCE FIX: Use static import instead of dynamic require()
              const noteIndex = periodToNoteIndex(period, 0);
              if (noteIndex >= 0) {
                // Look up finetuned period from table
                finetunedPeriod = getPeriodExtended(noteIndex, modPlayback.finetune);
              }
            }

            const frequency = modPlayback.periodMultiplier / finetunedPeriod;
            // Use the sample's original rate (8363 Hz for MOD), NOT the audio context rate
            const sampleRate = config.sample?.sampleRate || 8363;
            const playbackRate = frequency / sampleRate;
            // Apply global playback rate multiplier for pitch shifting
            (grainPlayer as unknown as { playbackRate: number }).playbackRate = playbackRate * (config.granular?.playbackRate || 1) * this.globalPlaybackRate;
          } else {
            // Calculate pitch shift from note (C4 = base pitch)
            const baseNote = cachedFrequency('C4');
            const targetFreq = cachedFrequency(note);
            const playbackRate = targetFreq / baseNote;
            // Apply global playback rate multiplier for pitch shifting
            (grainPlayer as unknown as { playbackRate: number }).playbackRate = playbackRate * (config.granular?.playbackRate || 1) * this.globalPlaybackRate;
          }
          grainPlayer.start(safeTime);
          grainPlayer.stop(safeTime + duration);
        }
      } else if (config.synthType === 'Player' ||
                 (config.synthType === 'Sampler' && config.sample?.loop) ||
                 (config.synthType === 'Sampler' && config.metadata?.modPlayback?.usePeriodPlayback)) {
        // Player uses start instead of triggerAttackRelease
        // Also handle looping Samplers and MOD/XM samples which are converted to Players at creation time
        const player = instrument as Tone.Player;
        if (player.buffer && player.buffer.loaded) {
          // Apply accent: boost velocity for louder/punchier sound
          const finalVelocity = accent ? Math.min(1, velocity * ToneEngine.ACCENT_BOOST) : velocity;
          // Apply velocity as volume (Player doesn't have velocity parameter like Sampler)
          const velocityDb = finalVelocity > 0 ? Tone.gainToDb(finalVelocity) : -Infinity;
          player.volume.value = velocityDb;

          // Check if this is a MOD/XM sample with period-based playback
          if (config.metadata?.modPlayback?.usePeriodPlayback && period) {
            // Calculate playback rate from Amiga period
            const modPlayback = config.metadata.modPlayback;
            let finetunedPeriod = period;

            if (modPlayback.finetune !== 0) {
              // Use ProTracker period table lookup for 100% accuracy
              // PERFORMANCE FIX: Use static import instead of dynamic require()
              const noteIndex = periodToNoteIndex(period, 0);
              if (noteIndex >= 0) {
                // Look up finetuned period from table
                finetunedPeriod = getPeriodExtended(noteIndex, modPlayback.finetune);
              }
            }

            const frequency = modPlayback.periodMultiplier / finetunedPeriod;
            // Use the sample's original rate (8363 Hz for MOD), NOT the audio context rate
            const sampleRate = config.sample?.sampleRate || 8363;
            const playbackRate = frequency / sampleRate;
            // Apply global playback rate multiplier for pitch shifting
            const finalRate = playbackRate * this.globalPlaybackRate;
            (player as unknown as { playbackRate: number }).playbackRate = finalRate;
          } else if (config.metadata?.modPlayback?.usePeriodPlayback && !period) {
            // No period provided for period-based instrument — play at natural rate (1.0x).
            // This resets any stale playbackRate from previous playback, so the sample
            // always sounds at its recorded pitch during instrument preview.
            (player as unknown as { playbackRate: number }).playbackRate = this.globalPlaybackRate;
          } else {
            // Normal (non-period) playback - calculate pitch from note
            const baseNote = cachedFrequency('C4');
            const targetFreq = cachedFrequency(note);
            const playbackRate = targetFreq / baseNote;
            // Apply global playback rate multiplier for pitch shifting
            (player as unknown as { playbackRate: number }).playbackRate = playbackRate * this.globalPlaybackRate;
          }

          // Apply sample offset (9xx command) if present.
          // sampleOffset is in frames at the ORIGINAL sample rate (8363 Hz for MOD/XM).
          // The decoded buffer runs at the AudioContext rate — do NOT use player.buffer.sampleRate.
          // pt2-clone bounds check: if sampleOffset >= total sample length, play from beginning.
          const origSampleRate = config.sample?.sampleRate || 8363;
          let startOffset = 0;
          if (sampleOffset && sampleOffset > 0 && player.buffer) {
            const bufferFrames = player.buffer.duration * origSampleRate;
            if (sampleOffset < bufferFrames) {
              startOffset = Math.min(sampleOffset / origSampleRate, player.buffer.duration - 0.001);
            }
            // else: offset >= sample length → play from beginning (pt2-clone behavior)
            console.log(`[9xx:player] sampleOffset=${sampleOffset} origRate=${origSampleRate} bufferDur=${player.buffer.duration.toFixed(4)}s bufferFrames=${Math.round(bufferFrames)} → startOffset=${startOffset.toFixed(4)}s loop=${player.loop} ${sampleOffset >= bufferFrames ? '(CLAMPED TO 0 — offset >= length!)' : ''}`);
          }

          // For looping samples: DON'T schedule a stop - let them loop until new note or stop button
          // For non-looping samples: Stop after duration
          if (player.loop) {
            // Stop any previously playing looping sample on this channel
            if (channelIndex !== undefined) {
              const prevPlayer = this.channelActivePlayer.get(channelIndex);
              if (prevPlayer && prevPlayer.state === 'started') {
                prevPlayer.stop(safeTime); // Stop at the same time new note starts
              }
              this.channelActivePlayer.set(channelIndex, player);
            }
            player.start(safeTime, startOffset);
            // Looping samples play until replaced by a new note or explicit stop
          } else {
            player.start(safeTime, startOffset);
            player.stop(safeTime + duration);
          }
        }
      } else if (config.synthType === 'Sampler' && !config.sample?.loop) {
        // Non-looping Sampler needs loaded samples
        // (Looping samples are handled as Players above)
        const sampler = instrument as Tone.Sampler;

        if (sampler.loaded) {

          // Reference-based slicing: Check if this is a sliced instrument
          const isSlicedSample = config.sample?.sliceStart !== undefined && config.sample?.sliceEnd !== undefined;

          if (isSlicedSample) {
            // Play only the slice range using Tone.Player
            const baseNote = config.sample?.baseNote || 'C4';
            const samplerInternal = sampler as unknown as { _buffers?: { get?: (note: string) => Tone.ToneAudioBuffer | undefined; _buffers?: Record<string, Tone.ToneAudioBuffer> } };
            const buffer = samplerInternal._buffers?.get?.(baseNote) ||
                           samplerInternal._buffers?._buffers?.[baseNote];

            if (buffer && buffer.duration) {
              const sampleRate = buffer.sampleRate || Tone.getContext().sampleRate;
              const sliceStart = config.sample!.sliceStart!;
              const sliceEnd = config.sample!.sliceEnd!;

              // Convert frame indices to time offsets
              const startTime = sliceStart / sampleRate;
              const endTime = sliceEnd / sampleRate;
              const sliceDuration = endTime - startTime;

              try {
                // Create a one-shot Player for this slice
                const slicePlayer = new Tone.Player({
                  url: buffer,
                  volume: Tone.gainToDb(velocity) + getNormalizedVolume('Sampler', config.volume),
                });
                slicePlayer.connect(this.getInstrumentOutputDestination(instrumentId, false));

                // Calculate pitch adjustment for the note (relative to base note)
                const baseFreq = cachedFrequency(baseNote);
                const targetFreq = cachedFrequency(note);
                const playbackRate = targetFreq / baseFreq;

                // Apply global playback rate multiplier for pitch shifting
                (slicePlayer as unknown as { playbackRate: number }).playbackRate = playbackRate * this.globalPlaybackRate;

                // Start at slice start, stop at slice end
                slicePlayer.start(safeTime, startTime);
                slicePlayer.stop(safeTime + Math.min(duration, sliceDuration));

                // Dispose after playback completes
                Tone.getTransport().scheduleOnce(() => {
                  slicePlayer.dispose();
                }, safeTime + duration + 0.1);

              } catch (e) {
                console.warn('[ToneEngine] Slice playback failed, falling back:', e);
                sampler.triggerAttackRelease(note, duration, safeTime, velocity);
              }
            } else {
              console.warn('[ToneEngine] Cannot play slice - no buffer found');
              sampler.triggerAttackRelease(note, duration, safeTime, velocity);
            }
          } else if (sampleOffset && sampleOffset > 0) {
            // 9xx Sample offset: Use Player for offset support
            // Tone.Sampler doesn't support sample offset, so we create a one-shot Player
            const baseNote = config.sample?.baseNote || 'C4';
            const samplerInternal = sampler as unknown as { _buffers?: { get?: (note: string) => Tone.ToneAudioBuffer | undefined; _buffers?: Record<string, Tone.ToneAudioBuffer> } };
            const buffer = samplerInternal._buffers?.get?.(baseNote) ||
                           samplerInternal._buffers?._buffers?.[baseNote];

            if (buffer && buffer.duration) {
              // sampleOffset is in frames at the ORIGINAL sample rate (8363 Hz for MOD/XM).
              // buffer.sampleRate is the decoded AudioContext rate — do NOT use it here.
              const origRate = config.sample?.sampleRate || 8363;
              const timeOffset = sampleOffset / origRate;
              console.log(`[9xx:sampler] sampleOffset=${sampleOffset} origRate=${origRate} bufferDur=${buffer.duration.toFixed(4)}s → timeOffset=${timeOffset.toFixed(4)}s baseNote=${baseNote} note=${note}`);

              // Clamp offset to buffer duration
              const clampedOffset = Math.min(timeOffset, buffer.duration - 0.001);

              // Create a one-shot Player for this offset playback
              try {
                const offsetPlayer = new Tone.Player({
                  url: buffer,
                  volume: Tone.gainToDb(velocity) + getNormalizedVolume('Sampler', config.volume),
                });
                offsetPlayer.connect(this.getInstrumentOutputDestination(instrumentId, false));

                // Calculate pitch adjustment for the note (relative to base note)
                const baseFreq = cachedFrequency(baseNote);
                const targetFreq = cachedFrequency(note);
                const playbackRate = targetFreq / baseFreq;

                // Apply global playback rate multiplier for pitch shifting
                (offsetPlayer as unknown as { playbackRate: number }).playbackRate = playbackRate * this.globalPlaybackRate;

                // Start at offset, stop after duration
                offsetPlayer.start(safeTime, clampedOffset);
                offsetPlayer.stop(safeTime + duration);

                // Dispose after playback completes
                Tone.getTransport().scheduleOnce(() => {
                  offsetPlayer.dispose();
                }, safeTime + duration + 0.1);

              } catch (e) {
                console.warn('[ToneEngine] Sample offset Player creation failed, falling back:', e);
                sampler.triggerAttackRelease(note, duration, safeTime, velocity);
              }
            } else {
              console.warn('[ToneEngine] Cannot apply sample offset - no buffer found');
              sampler.triggerAttackRelease(note, duration, safeTime, velocity);
            }
          } else {
            // Normal playback without offset
            sampler.triggerAttackRelease(note, duration, safeTime, velocity);
          }
        } else {
          console.warn('[ToneEngine] Sampler not loaded yet');
        }
      } else if (
        config.synthType === 'SuperSaw' ||
        config.synthType === 'PolySynth' ||
        config.synthType === 'Organ' ||
        config.synthType === 'ChipSynth' ||
        config.synthType === 'PWMSynth' ||
        config.synthType === 'StringMachine' ||
        config.synthType === 'FormantSynth'
      ) {
        // New synths with triggerAttackRelease interface
        // Apply slide/accent for mono synths (PolySynth can't slide between notes)
        if ((instrument as any).triggerAttackRelease) {
          const targetFreq = cachedFrequency(note);
          const finalVelocity = this.applySlideAndAccent(
            instrument, targetFreq, safeTime, velocity,
            accent, slide, channelIndex, instrumentId
          );
          (instrument as any).triggerAttackRelease(note, duration, safeTime, finalVelocity);
        }
      } else if (instrument instanceof WAMSynth) {
        (instrument as any).triggerAttackRelease(note, duration, safeTime, velocity);
      } else if (config.synthType === 'DrumMachine' || config.synthType === 'TR808' || config.synthType === 'TR909') {
        // DrumMachine - some drum types don't take note parameter
        // Apply accent (velocity boost) but not slide (drums don't pitch slide)
        if ((instrument as any).triggerAttackRelease) {
          const finalVelocity = accent ? Math.min(1, velocity * ToneEngine.ACCENT_BOOST) : velocity;
          (instrument as any).triggerAttackRelease(note, duration, safeTime, finalVelocity);
        }
      } else if ((instrument as any).triggerAttackRelease) {
        // Standard synths (Synth, MonoSynth, FMSynth, AMSynth, PluckSynth, DuoSynth, PolySynth)
        // Apply slide/accent for 303-style effects on all synths
        const targetFreq = cachedFrequency(note);
        const finalVelocity = this.applySlideAndAccent(
          instrument, targetFreq, safeTime, velocity,
          accent, slide, channelIndex, instrumentId
        );
        (instrument as any).triggerAttackRelease(note, duration, safeTime, finalVelocity);
      }
    } catch (error) {
      console.error(`[ToneEngine] Error triggering note for ${config.synthType}:`, error);
    }
  }

  /**
   * Schedule pattern events
   */
  public schedulePatternEvents(events: Array<{ instrumentId: number; note: string; duration: number; time: string; velocity: number; config: InstrumentConfig }>): void {
    // Clear any existing events for this pattern
    Tone.getTransport().cancel();

    // Schedule new events
    events.forEach((event) => {
      Tone.getTransport().schedule((time) => {
        this.triggerNote(
          event.instrumentId,
          event.note,
          event.duration,
          time,
          event.velocity,
          event.config
        );
      }, event.time);
    });
  }

  /**
   * Clear all scheduled events
   */
  public clearSchedule(): void {
    Tone.getTransport().cancel();
  }

  /**
   * Release all notes and stop all players - IMMEDIATELY silences everything
   */
  public releaseAll(): void {
    const now = Tone.now();

    this.instruments.forEach((instrument, key) => {
      try {
        // Handle Player/GrainPlayer - they use stop() not releaseAll()
        if (instrument instanceof Tone.Player || instrument instanceof Tone.GrainPlayer) {
          // Disable loop BEFORE stopping to prevent looped samples from continuing
          instrument.loop = false;
          if (instrument.state === 'started') {
            instrument.stop(now);
          }
        } else if (instrument instanceof Tone.Sampler) {
          // Sampler: releaseAll() only triggers envelope release, looped samples keep playing
          // Force-stop all voices by accessing internal _activeSources
          (instrument as any).releaseAll(now);
          // Also try to stop all active buffer sources (internal Tone.js implementation detail)
          const activeSources = (instrument as any)._activeSources;
          if (activeSources && activeSources instanceof Map) {
            activeSources.forEach((sources: any[]) => {
              if (Array.isArray(sources)) {
                sources.forEach((source: any) => {
                  try {
                    if (source && typeof source.stop === 'function') {
                      source.stop(now + 0.05); // Stop after short fade
                    }
                  } catch { /* ignore */ }
                });
              }
            });
          }
        } else if (instrument instanceof JC303Synth) {
          // TB303 has its own release method
          instrument.releaseAll();
        } else if ((instrument as any).releaseAll) {
          // Synths use releaseAll()
          (instrument as any).releaseAll(now);
        } else if (isDevilboxSynth(instrument) && instrument.triggerRelease) {
          // DevilboxSynths don't have releaseAll(), use triggerRelease()
          instrument.triggerRelease!(undefined, now);
          // Also stop any active speech synthesis
          if (typeof (instrument as any).stopSpeaking === 'function') {
            (instrument as any).stopSpeaking();
          }
        }

        // CRITICAL: Force immediate silence by ramping volume to -Infinity
        // This prevents long release tails from continuing to sound
        const instAny = instrument as any;
        if (instAny.volume && typeof instAny.volume.rampTo === 'function') {
          const currentVolume = instAny.volume.value;
          // Guard against null volume value (can happen if instrument is in bad state)
          if (currentVolume === null || currentVolume === undefined) {
            return; // Skip this instrument in forEach
          }
          // Cancel any scheduled automation before ramping to prevent conflicts
          if (typeof instAny.volume.cancelScheduledValues === 'function') {
            instAny.volume.cancelScheduledValues(now);
          }
          instAny.volume.rampTo(-Infinity, 0.05, now); // 50ms fade out
          // Cancel any pending restore for this key to prevent race conditions
          const prevTimeout = this.releaseRestoreTimeouts.get(key);
          if (prevTimeout) clearTimeout(prevTimeout);
          // Restore volume after fade for next playback
          const timeout = setTimeout(() => {
            this.releaseRestoreTimeouts.delete(key);
            try {
              if (instAny.volume) {
                instAny.volume.value = currentVolume;
              }
            } catch {
              // Instrument may be disposed
            }
          }, 100);
          this.releaseRestoreTimeouts.set(key, timeout);
        } else if (isDevilboxSynth(instrument)) {
          // DevilboxSynths without .volume: ramp native GainNode to silence
          const outputGain = (instrument.output as GainNode).gain;
          // Cancel any pending restore to prevent race condition where
          // double-releaseAll captures gain=0 and permanently silences the instrument
          const prevTimeout = this.releaseRestoreTimeouts.get(key);
          if (prevTimeout) clearTimeout(prevTimeout);
          outputGain.cancelScheduledValues(now);
          outputGain.setValueAtTime(outputGain.value || 1, now);
          outputGain.linearRampToValueAtTime(0, now + 0.05);
          // Always restore to 1.0 — DevilboxSynth output GainNode is a pass-through
          const timeout = setTimeout(() => {
            this.releaseRestoreTimeouts.delete(key);
            try {
              outputGain.cancelScheduledValues(0);
              outputGain.value = 1;
            } catch {
              // Instrument may be disposed
            }
          }, 100);
          this.releaseRestoreTimeouts.set(key, timeout);
        }
      } catch (e) {
        console.warn(`[ToneEngine] Error releasing instrument ${key}:`, e);
      }
    });

    // Stop all active voice clones (critical for 'Synth' type which creates per-note clones
    // that aren't in this.instruments — without this, cloned voices keep playing forever)
    this.activeVoices.forEach((voices) => {
      for (const voice of voices) {
        try {
          this.stopVoice(voice, now);
        } catch { /* ignored */ }
      }
    });
    this.activeVoices.clear();

    // Silence Furnace chip engine outputs — their audio flows through the shared
    // engine outputGain, not through individual synth .output GainNodes
    this.muteChipEngineOutputs(now);

    // Stop all active looping players before clearing the map
    // This is critical for samples with loops - they continue playing until explicitly stopped
    this.channelActivePlayer.forEach((player) => {
      try {
        player.loop = false; // Disable loop first to prevent restart
        if (player.state === 'started') {
          player.stop(now);
        }
      } catch { /* ignored */ }
    });
    this.channelPitchState.clear();
    this.channelActivePlayer.clear();

    // Stop and dispose all active slice players
    this.slicePlayersMap.forEach((player) => {
      try {
        if (player.state === 'started') {
          player.stop();
        }
        player.dispose();
      } catch {
        // Ignore errors during cleanup
      }
    });
    this.slicePlayersMap.clear();

  }

  /**
   * Mute Furnace chip engine outputs for immediate silence on stop.
   * Chip engines share a single outputGain that isn't the individual synth's .output,
   * so releaseAll()'s per-instrument GainNode ramp doesn't affect them.
   */
  // Sentinel keys for chip engine timeout entries in releaseRestoreTimeouts
  private static readonly CHIP_ENGINE_KEY = -1;
  private static readonly DISPATCH_ENGINE_KEY = -2;

  private muteChipEngineOutputs(now: number): void {
    const muteAndRestore = (engineKey: number, getGain: () => GainNode | null) => {
      const gain = getGain();
      if (!gain) return;
      const prevTimeout = this.releaseRestoreTimeouts.get(engineKey);
      if (prevTimeout) clearTimeout(prevTimeout);
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value || 1, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.05);
      const timeout = setTimeout(() => {
        this.releaseRestoreTimeouts.delete(engineKey);
        try {
          gain.gain.cancelScheduledValues(0);
          gain.gain.value = 1;
        } catch { /* engine may be disposed */ }
      }, 100);
      this.releaseRestoreTimeouts.set(engineKey, timeout);
    };

    if (this.nativeEngineRouting.has('FurnaceChipEngine')) {
      muteAndRestore(ToneEngine.CHIP_ENGINE_KEY, () => FurnaceChipEngine.getInstance().getNativeOutput());
    }
    if (this.nativeEngineRouting.has('FurnaceDispatchEngine')) {
      muteAndRestore(ToneEngine.DISPATCH_ENGINE_KEY, () => FurnaceDispatchEngine.getInstance().getOrCreateSharedGain());
    }
  }

  /**
   * Internal helper to dispose an instrument by its internal Map key
   */
  private disposeInstrumentByKey(key: number): void {
    const instrument = this.instruments.get(key);
    if (instrument) {
      // Remove from maps IMMEDIATELY so future triggers don't find it
      this.instruments.delete(key);
      this.instrumentSynthTypes.delete(key);
      this.instrumentLoadingPromises.delete(key);

      // Release all notes on this synth before disposal
      try {
        if (!(instrument as any).disposed) {
          if ((instrument as any).releaseAll) (instrument as any).releaseAll();
          else if ((instrument as any).triggerRelease) (instrument as any).triggerRelease();
        }
      } catch {
        // Ignore release errors
      }

      // Re-route and dispose effects chain
      this.disposeInstrumentEffectChain(key);

      // Dispose the synth itself
      try {
        if (!(instrument as any).disposed) {
          instrument.dispose();
        }
      } catch {
        // Already disposed
      }
    }
  }

  /**
   * Dispose instrument by ID
   */
  public disposeInstrument(instrumentId: number): void {
    const keysToRemove: number[] = [];
    this.instruments.forEach((_instrument, key) => {
      if (this.instrumentIdFromKey(key) === instrumentId) {
        keysToRemove.push(key);
      }
    });

    keysToRemove.forEach((key) => {
      this.disposeInstrumentByKey(key);
    });
  }

  /**
   * Dispose ALL instruments in the engine (for clean module import).
   * Removes all audio nodes, effect chains, analysers, and type mappings.
   */
  public disposeAllInstruments(): void {
    // DIAGNOSTIC: trace who's calling disposeAllInstruments (debug MIDI silence on loop)
    console.warn(`[ToneEngine] disposeAllInstruments called, ${this.instruments.size} instruments`);
    console.trace('[ToneEngine] disposeAllInstruments caller');

    // Cancel all pending release-restore timeouts to prevent them from
    // firing on new instruments and restoring wrong volume values
    this.releaseRestoreTimeouts.forEach((timeout) => clearTimeout(timeout));
    this.releaseRestoreTimeouts.clear();
    this.instrumentOutputOverrides.clear();
    this._sunvoxOutputConnected = false;
    clearConnectedNativeOutputs();

    const allKeys = Array.from(this.instruments.keys());
    allKeys.forEach((key) => {
      this.disposeInstrumentByKey(key);
    });
    this.instrumentSynthTypes.clear();
    this.instrumentLoadingPromises.clear();
    this.decodedAudioBuffers.clear();
    this.activeVoices.clear();
    this.channelLastNote.clear();
    this.channelMuteStates.clear();
    this.channelPitchState.clear();
    // Stop all active looping players before clearing
    this.channelActivePlayer.forEach((player) => {
      try {
        player.loop = false;
        if (player.state === 'started') player.stop();
      } catch { /* ignored */ }
    });
    this.channelActivePlayer.clear();
    this.lastTriggerTime = 0;
  }

  /**
   * Invalidate instrument (force recreation on next use)
   * Call this when instrument config changes
   */
  public invalidateInstrument(instrumentId: number): void {
    this.disposeInstrument(instrumentId);
  }

  /**
   * Update instrument with new config (dispose old, create new)
   */
  public updateInstrument(instrumentId: number, config: InstrumentConfig): void {
    // Dispose old instrument
    this.disposeInstrument(instrumentId);
    // Create new instrument with updated config
    this.getInstrument(instrumentId, config);
  }

  /**
   * Preview a slice of an audio sample
   * Creates a one-shot player for the specified frame range and plays it
   */
  public async previewSlice(
    instrumentId: number,
    startFrame: number,
    endFrame: number
  ): Promise<void> {
    // Ensure audio context is started
    await Tone.start();

    // Get the instrument config
    const instrumentStore = await import('../stores/useInstrumentStore').then(m => m.useInstrumentStore.getState());
    const instrument = instrumentStore.instruments.find(i => i.id === instrumentId);

    // Check for stored edited buffer first, then URL
    const storedBuffer = instrument?.sample?.audioBuffer;
    const sampleUrl = instrument?.sample?.url;

    if (!storedBuffer && !sampleUrl) {
      console.warn('[ToneEngine] Cannot preview slice: no sample buffer or URL');
      return;
    }

    try {
      let audioBuffer: AudioBuffer;

      if (storedBuffer) {
        // Use stored edited buffer
        audioBuffer = await this.decodeAudioData(storedBuffer);
      } else {
        // Fetch and decode from URL
        const response = await fetch(sampleUrl!);
        const arrayBuffer = await response.arrayBuffer();
        audioBuffer = await this.decodeAudioData(arrayBuffer);
      }

      const sampleRate = audioBuffer.sampleRate;
      const sliceLength = endFrame - startFrame;

      if (sliceLength <= 0) {
        console.warn('[ToneEngine] Invalid slice range');
        return;
      }

      // Create a buffer for just the slice
      const sliceBuffer = Tone.context.createBuffer(
        audioBuffer.numberOfChannels,
        sliceLength,
        sampleRate
      );

      // Copy the slice data
      for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
        const sourceData = audioBuffer.getChannelData(ch);
        const destData = sliceBuffer.getChannelData(ch);
        for (let i = 0; i < sliceLength; i++) {
          destData[i] = sourceData[startFrame + i];
        }
      }

      // Create a one-shot player
      const player = new Tone.Player(sliceBuffer).toDestination();
      player.start();

      // Auto-dispose after playback
      const durationMs = (sliceLength / sampleRate) * 1000 + 100;
      setTimeout(() => {
        try {
          player.stop();
          player.dispose();
        } catch {
          // May already be disposed
        }
      }, durationMs);

    } catch (error) {
      console.error('[ToneEngine] Failed to preview slice:', error);
    }
  }

  public async bakeInstrument(config: InstrumentConfig, duration: number = 2, note: string = "C4"): Promise<AudioBuffer> {
    // We use Tone.Offline to render the sound
    // Note: We create a fresh factory instance inside the offline context
    const result = await Tone.Offline(async () => {
      // Create the instrument in the offline context
      const instrument = InstrumentFactory.createInstrument(config) as Tone.ToneAudioNode | DevilboxSynth;
      
      // Create effects chain if present
      if (config.effects && config.effects.length > 0) {
        const effects = await InstrumentFactory.createEffectChain(config.effects);
        let firstNode: Tone.ToneAudioNode;
        if (isDevilboxSynth(instrument)) {
          const bridge = new Tone.Gain(1);
          const nativeBridge = getNativeAudioNode(bridge as any);
          if (nativeBridge) instrument.output.connect(nativeBridge);
          firstNode = bridge;
        } else {
          firstNode = instrument as Tone.ToneAudioNode;
        }
        let lastNode = firstNode;
        for (const effect of effects) {
          lastNode.connect(effect as Tone.ToneAudioNode);
          lastNode = effect as Tone.ToneAudioNode;
        }
        lastNode.toDestination();
      } else {
        if (isDevilboxSynth(instrument)) {
          const bridge = new Tone.Gain(1);
          const nativeBridge = getNativeAudioNode(bridge as any);
          if (nativeBridge) instrument.output.connect(nativeBridge);
          bridge.toDestination();
        } else {
          (instrument as Tone.ToneAudioNode).toDestination();
        }
      }

      // Trigger the specific note
      if ((instrument as any).triggerAttack) {
        (instrument as any).triggerAttack(note, 0);
        // Release after 1 second to allow for decay/release
        if ((instrument as any).triggerRelease) {
          (instrument as any).triggerRelease(1);
        }
      }

      // Wait for the duration
    }, duration);

    return result as unknown as AudioBuffer;
  }

  /**
   * Live-bake a WASM/AudioWorklet synth by recording its output in real-time.
   * Unlike bakeInstrument() which uses Tone.Offline, this works with AudioWorklet synths
   * that require a real-time audio context.
   */
  public async liveBakeInstrument(
    instrumentId: number,
    config: InstrumentConfig,
    duration: number = 4,
    note: string = 'C4',
  ): Promise<AudioBuffer> {
    // Ensure synth is loaded and initialized
    await this.ensureInstrumentReady(config);

    const instrument = this.getInstrument(instrumentId, config);
    if (!instrument || !isDevilboxSynth(instrument)) {
      throw new Error(`[ToneEngine] liveBakeInstrument: instrument ${instrumentId} is not a DevilboxSynth`);
    }

    const synthOutput = instrument.output;

    // Disconnect synth output from normal signal chain (silent bake)
    // We disconnect ALL destinations — the effect chain bridge, synthBus, etc.
    try {
      synthOutput.disconnect();
    } catch {
      // May not be connected to anything yet
    }

    try {
      const buffer = await captureLiveAudio(
        synthOutput,
        () => {
          // Trigger note attack
          if (instrument.triggerAttack) {
            instrument.triggerAttack(note, undefined, 0.8);
          }
        },
        () => {
          // Release note
          if (instrument.triggerRelease) {
            instrument.triggerRelease(note);
          }
        },
        duration,
      );
      return buffer;
    } finally {
      // Reconnect synth to its normal signal chain by rebuilding the effect chain
      // This is the safest way to restore all connections (bridge, effects, analyser, bus)
      const key = this.getInstrumentKey(instrumentId, -1);
      const effectConfigs = config.effects || [];
      await this.buildInstrumentEffectChain(key, effectConfigs, instrument);
    }
  }

  /**
   * Live-bake a chord from a WASM synth.
   * Polyphonic synths: trigger all notes simultaneously, single capture.
   * Monophonic synths: capture each note sequentially, mix and normalize.
   */
  public async liveBakeChord(
    instrumentId: number,
    config: InstrumentConfig,
    notes: string[],
  ): Promise<AudioBuffer> {
    const isMono = MONO_WASM_SYNTHS.has(config.synthType || '');

    if (isMono) {
      // Sequential capture + mix for mono synths
      const buffers: AudioBuffer[] = [];
      for (const note of notes) {
        buffers.push(await this.liveBakeInstrument(instrumentId, config, 4, note));
      }
      return mixAndNormalize(buffers);
    }

    // Polyphonic: simultaneous capture
    await this.ensureInstrumentReady(config);

    const instrument = this.getInstrument(instrumentId, config);
    if (!instrument || !isDevilboxSynth(instrument)) {
      throw new Error(`[ToneEngine] liveBakeChord: instrument ${instrumentId} is not a DevilboxSynth`);
    }

    const synthOutput = instrument.output;

    try {
      synthOutput.disconnect();
    } catch {
      // May not be connected
    }

    try {
      const buffer = await captureLiveAudio(
        synthOutput,
        () => {
          // Trigger ALL chord notes simultaneously
          for (const note of notes) {
            if (instrument.triggerAttack) {
              instrument.triggerAttack(note, undefined, 0.8);
            }
          }
        },
        () => {
          // Release ALL notes
          for (const note of notes) {
            if (instrument.triggerRelease) {
              instrument.triggerRelease(note);
            }
          }
        },
        4,
      );
      return buffer;
    } finally {
      const key = this.getInstrumentKey(instrumentId, -1);
      const effectConfigs = config.effects || [];
      await this.buildInstrumentEffectChain(key, effectConfigs, instrument);
    }
  }

  /**
   * Update WAM parameters in real-time
   */
  // Extracted synth update context
  private get _synthCtx(): SynthUpdateContext {
    return {
      instruments: this.instruments,
      instrumentIdFromKey: (key: number) => this.instrumentIdFromKey(key),
      getInstrumentKey: (id: number, ch: number) => this.getInstrumentKey(id, ch),
      invalidateInstrument: (id: number) => this.invalidateInstrument(id),
      getInstrument: (id: number, config: InstrumentConfig) => this.getInstrument(id, config),
    };
  }

  public updateWAMParameters(instrumentId: number, wamConfig: NonNullable<InstrumentConfig['wam']>): void { _updateWAMParameters(this._synthCtx, instrumentId, wamConfig); }
  public updateTB303Parameters(instrumentId: number, tb303Config: NonNullable<InstrumentConfig['tb303']>): void { _updateTB303Parameters(this._synthCtx, instrumentId, tb303Config); }
  public updateFurnaceInstrument(instrumentId: number, config: InstrumentConfig): void { _updateFurnaceInstrument(this._synthCtx, instrumentId, config); }
  public updateHarmonicSynthParameters(instrumentId: number, harmonicConfig: NonNullable<InstrumentConfig['harmonicSynth']>): void { _updateHarmonicSynthParameters(this._synthCtx, instrumentId, harmonicConfig); }
  public getMAMESynthHandle(instrumentId: number): number { return _getMAMESynthHandle(this._synthCtx, instrumentId); }
  public getMAMEChipSynth(instrumentId: number): MAMEBaseSynth | null { return _getMAMEChipSynth(this._synthCtx, instrumentId); }
  public updateMAMEParameters(instrumentId: number, config: Partial<import('@typedefs/instrument').MAMEConfig>): void { _updateMAMEParameters(this._synthCtx, instrumentId, config); }
  public updateMAMEChipParam(instrumentId: number, key: string, value: number): void { _updateMAMEChipParam(this._synthCtx, instrumentId, key, value); }
  public loadMAMEChipPreset(instrumentId: number, program: number): void { _loadMAMEChipPreset(this._synthCtx, instrumentId, program); }
  public updateMAMEChipTextParam(instrumentId: number, key: string, value: string): void { _updateMAMEChipTextParam(this._synthCtx, instrumentId, key, value); }
  public async speakMAMEChipText(instrumentId: number, text: string): Promise<void> { return _speakMAMEChipText(this._synthCtx, instrumentId, text); }
  public loadSynthROM(instrumentId: number, synthType: string, bank: number, data: Uint8Array): void { _loadSynthROM(this._synthCtx, instrumentId, synthType, bank, data); }
  public updateDubSirenParameters(instrumentId: number, config: NonNullable<InstrumentConfig['dubSiren']>): void { _updateDubSirenParameters(this._synthCtx, instrumentId, config); }
  public updateSpaceLaserParameters(instrumentId: number, config: NonNullable<InstrumentConfig['spaceLaser']>): void { _updateSpaceLaserParameters(this._synthCtx, instrumentId, config); }
  public updateV2Parameters(instrumentId: number, config: NonNullable<InstrumentConfig['v2']>): void { _updateV2Parameters(this._synthCtx, instrumentId, config); }
  public updateSynareParameters(instrumentId: number, config: NonNullable<InstrumentConfig['synare']>): void { _updateSynareParameters(this._synthCtx, instrumentId, config); }
  public updateFurnaceParameters(instrumentId: number, config: NonNullable<InstrumentConfig['furnace']>): void { _updateFurnaceParameters(this._synthCtx, instrumentId, config); }

  /**
   * Apply a tracker effect to a Furnace instrument.
   * Routes effect through FurnaceEffectRouter → FurnaceDispatchEngine.
   * @param instrumentId The instrument ID
   * @param effect Effect code (0x00-0xFF)
   * @param param Effect parameter (0x00-0xFF)
   * @param channel Optional channel (defaults to 0)
   * @returns true if effect was applied, false if instrument is not Furnace-based
   */
  public applyFurnaceEffect(instrumentId: number, effect: number, param: number, channel: number = 0): boolean {
    // Get the synth type for this instrument
    const synthType = this.instrumentSynthTypes.get(this.getInstrumentKey(instrumentId, -1));
    if (!synthType || !synthType.startsWith('Furnace')) {
      return false;
    }

    // Find the synth instance(s) for this instrument
    for (const [key, instrument] of this.instruments) {
      if (this.instrumentIdFromKey(key) !== instrumentId) continue;

      // Handle FurnaceDispatchSynth (has full effect routing via FurnaceEffectRouter)
      if (instrument instanceof FurnaceDispatchSynth) {
        instrument.applyEffect(effect, param, channel);
        return true;
      }

      // Handle FurnaceSynth (register-based, needs direct register writes)
      // For now, handle common effects that FurnaceSynth can process
      if (instrument instanceof FurnaceSynth) {
        this.applyFurnaceSynthEffect(instrument, effect, param);
        return true;
      }
    }

    return false;
  }

  /**
   * Apply an OPL-native effect (0x30-0x3F range) to an OPL3 instrument.
   * These are AdLib/HSC effects that control OPL registers directly:
   *   0x30 = set feedback (param 0-7)
   *   0x31 = carrier volume (param 0-15, scaled to 0-63)
   *   0x32 = modulator volume (param 0-15, scaled to 0-63)
   *   0x33 = instrument volume (param 0-15, sets both operators)
   */
  public applyOPLEffect(instrumentId: number, effect: number, param: number, _channel: number = 0): boolean {
    for (const [key, instrument] of this.instruments) {
      if (this.instrumentIdFromKey(key) !== instrumentId) continue;
      if (!(instrument instanceof OPL3Synth)) continue;

      switch (effect) {
        case 0x30: // set feedback
          instrument.set('feedback', param & 0x7);
          return true;
        case 0x31: // carrier volume (param << 2 to get 0-63 range)
          instrument.set('op2Level', (param & 0xF) << 2);
          return true;
        case 0x32: // modulator volume (param << 2 to get 0-63 range)
          instrument.set('op1Level', (param & 0xF) << 2);
          return true;
        case 0x33: // instrument volume (both operators)
          instrument.set('op1Level', (param & 0xF) << 2);
          instrument.set('op2Level', (param & 0xF) << 2);
          return true;
      }
      return false;
    }
    return false;
  }

  /**
   * Apply an extended effect (Exy format) to a Furnace instrument.
   * @param instrumentId The instrument ID
   * @param x Effect subtype (0x0-0xF)
   * @param y Effect value (0x0-0xF)
   * @param channel Optional channel (defaults to 0)
   * @returns true if effect was applied
   */
  public applyFurnaceExtendedEffect(instrumentId: number, x: number, y: number, channel: number = 0): boolean {
    const synthType = this.instrumentSynthTypes.get(this.getInstrumentKey(instrumentId, -1));
    if (!synthType || !synthType.startsWith('Furnace')) {
      return false;
    }

    for (const [key, instrument] of this.instruments) {
      if (this.instrumentIdFromKey(key) !== instrumentId) continue;

      if (instrument instanceof FurnaceDispatchSynth) {
        instrument.applyExtendedEffect(x, y, channel);
        return true;
      }
    }

    return false;
  }

  /**
   * Apply effect to FurnaceSynth (register-based).
   * Translates effects to register writes based on chip type.
   * Effect codes match FurnaceEffectRouter mappings.
   */
  private applyFurnaceSynthEffect(synth: FurnaceSynth, effect: number, param: number): void {
    _applyFurnaceSynthEffect(synth, effect, param);
  }

  /**
   * Update Dexed (DX7) parameters in real-time
   */
  public updateDexedParameters(_instrumentId: number, _config: unknown): void { /* Dexed removed — DX7 replaces it */ }
  public updateOBXdParameters(_instrumentId: number, _config: unknown): void { /* OBXd removed — OBXf replaces it */ }
  public updateComplexSynthParameters(instrumentId: number, config: unknown): void { _updateComplexSynthParameters(this._synthCtx, instrumentId, config); }
  public updateToneJsSynthInPlace(instrumentId: number, config: InstrumentConfig): void { _updateToneJsSynthInPlace(this._synthCtx, instrumentId, config); }
  public updateBuzzmachineParameters(instrumentId: number, buzzmachine: NonNullable<InstrumentConfig['buzzmachine']>): void { _updateBuzzmachineParameters(this._synthCtx, instrumentId, buzzmachine); }
  public updateSonicArrangerParameters(instrumentId: number, config: NonNullable<InstrumentConfig['sonicArranger']>): void { _updateSonicArrangerParameters(this._synthCtx, instrumentId, config); }
  public updateNativeSynthConfig(instrumentId: number, config: unknown): void { _updateNativeSynthConfig(this._synthCtx, instrumentId, config); }
  public async updateTB303Pedalboard(instrumentId: number, pedalboard: NonNullable<InstrumentConfig['tb303']>['pedalboard']): Promise<void> { return _updateTB303Pedalboard(this._synthCtx, instrumentId, pedalboard); }
  public updateChipSynthArpeggio(instrumentId: number, arpeggioConfig: NonNullable<InstrumentConfig['chipSynth']>['arpeggio']): void { _updateChipSynthArpeggio(this._synthCtx, instrumentId, arpeggioConfig); }
  public getChipSynthArpeggioStep(instrumentId: number): number { return _getChipSynthArpeggioStep(this._synthCtx, instrumentId); }
  public isChipSynthArpeggioPlaying(instrumentId: number): boolean { return _isChipSynthArpeggioPlaying(this._synthCtx, instrumentId); }

  // ============================================================================
  // METRONOME (delegated to MetronomeManager)
  // ============================================================================

  private ensureMetronome(): MetronomeManager {
    if (!this.metronome) {
      this.metronome = new MetronomeManager(this.masterChannel);
    }
    return this.metronome;
  }

  public setMetronomeEnabled(enabled: boolean): void { this.ensureMetronome().setMetronomeEnabled(enabled); }
  public isMetronomeEnabled(): boolean { return this.metronome?.isMetronomeEnabled() ?? false; }
  public setMetronomeVolume(volume: number): void { this.ensureMetronome().setMetronomeVolume(volume); }
  public triggerMetronomeClick(time: number, isDownbeat: boolean = false): void { this.metronome?.triggerMetronomeClick(time, isDownbeat); }
  public stopMetronome(): void { this.metronome?.stopMetronome(); }
  private disposeMetronome(): void { this.metronome?.dispose(); this.metronome = null; }

  /**
   * Dispose of all resources
   */
  public dispose(): void {
    this.stop();
    this.clearSchedule();

    // Dispose metronome
    this.disposeMetronome();

    // Dispose all instrument analysers
    this.disposeAllInstrumentAnalysers();

    // Dispose all instrument effect chains
    this.instrumentEffectChains.forEach((chain, instrumentId) => {
      chain.effects.forEach((fx) => {
        try {
          fx.dispose();
        } catch (e) {
          console.warn(`[ToneEngine] Failed to dispose effect for instrument ${instrumentId}:`, e);
        }
      });
      try {
        chain.output.dispose();
      } catch (e) {
        console.warn(`[ToneEngine] Failed to dispose effect chain output for instrument ${instrumentId}:`, e);
      }
    });
    this.instrumentEffectChains.clear();
    this.instrumentEffectNodes.clear();

    // Dispose all instruments
    this.instruments.forEach((instrument, key) => {
      try {
        instrument.dispose();
      } catch (e) {
        console.warn(`[ToneEngine] Failed to dispose instrument ${key}:`, e);
      }
    });
    this.instruments.clear();

    // Dispose channel outputs
    this.disposeChannelOutputs();

    // Dispose master effects
    this.masterEffectsNodes.forEach((node) => {
      try {
        node.dispose();
      } catch {
        // Node may already be disposed
      }
    });
    this.masterEffectsNodes = [];
    this.masterEffectConfigs.clear();
    // Disconnect and clear analyser taps
    this.masterEffectAnalysers.forEach(({ pre, post }) => {
      try { pre.disconnect(); } catch { /* */ }
      try { post.disconnect(); } catch { /* */ }
    });
    this.masterEffectAnalysers.clear();

    // Dispose master channel and analyzers
    this.analyser.dispose();
    this.fft.dispose();
    this.amigaFilter.dispose();
    this.synthBusMeter.dispose();
    this.masterMeter.dispose();
    this.synthBus.dispose();
    this.masterEffectsInput.dispose();
    this.blepInput.dispose();
    this.safetyLimiter.dispose();
    this.exportTap.dispose();
    this.masterInput.dispose();
    this.masterChannel.dispose();

    ToneEngine.instance = null;
  }

  // ============================================================================
  // INSTRUMENT EFFECTS CHAIN MANAGEMENT (delegated to InstrumentEffectsChain)
  // ============================================================================

  private get _instrFxCtx(): InstrumentEffectsContext {
    return {
      instrumentEffectChains: this.instrumentEffectChains,
      instrumentEffectNodes: this.instrumentEffectNodes,
      instrumentAnalysers: this.instrumentAnalysers,
      instrumentOutputOverrides: this.instrumentOutputOverrides,
      instruments: this.instruments,
      masterInput: this.masterInput,
      synthBus: this.synthBus,
      connectNativeSynth: (o, d) => this.connectNativeSynth(o, d),
      getInstrumentOutputDestination: (id, n) => this.getInstrumentOutputDestination(id, n),
      getInstrumentKey: (id, ch) => this.getInstrumentKey(id, ch),
    };
  }

  private async buildInstrumentEffectChain(key: number, effects: EffectConfig[], instrument: Tone.ToneAudioNode | DevilboxSynth): Promise<void> {
    return _buildInstrumentEffectChain(this._instrFxCtx, key, effects, instrument);
  }

  public async rebuildInstrumentEffects(instrumentId: number, effects: EffectConfig[]): Promise<void> {
    return _rebuildInstrumentEffects(this._instrFxCtx, instrumentId, effects);
  }

  public setInstrumentOutputOverride(instrumentId: number, destination: Tone.ToneAudioNode): void {
    _setInstrumentOutputOverride(this._instrFxCtx, instrumentId, destination);
  }

  public removeInstrumentOutputOverride(instrumentId: number): void {
    _removeInstrumentOutputOverride(this._instrFxCtx, instrumentId);
  }

  public throwInstrumentToEffect(instrumentId: number, effectType: string, wetAmount: number = 1.0, durationMs: number = 0): void {
    _throwInstrumentToEffect(this._instrFxCtx, instrumentId, effectType, wetAmount, durationMs);
  }

  private disposeInstrumentEffectChain(key: number): void {
    _disposeInstrumentEffectChain(this._instrFxCtx, key);
  }

  // ============================================================================
  // ============================================================================
  // MASTER EFFECTS CHAIN MANAGEMENT (delegated to MasterEffectsChain)
  // ============================================================================

  private get _masterFxCtx(): MasterEffectsContext {
    const self = this;
    const ctx = {
      masterEffectsInput: this.masterEffectsInput,
      blepInput: this.blepInput,
      masterEffectConfigs: this.masterEffectConfigs,
      masterEffectAnalysers: this.masterEffectAnalysers,
      _notifyNoiseEffectsPlaying: (p: boolean) => this._notifyNoiseEffectsPlaying(p),
      applyEffectParametersDiff: (n: Tone.ToneAudioNode, t: string, c: Record<string, number | string>) => this.applyEffectParametersDiff(n, t, c),
      updateBpmSyncedEffects: (bpm: number) => this.updateBpmSyncedEffects(bpm),
    } as MasterEffectsContext;
    // Mutable fields need property proxies so writes flow back to ToneEngine
    Object.defineProperty(ctx, 'masterEffectsRebuildVersion', {
      get: () => self.masterEffectsRebuildVersion,
      set: (v: number) => { self.masterEffectsRebuildVersion = v; },
    });
    Object.defineProperty(ctx, 'masterEffectsNodes', {
      get: () => self.masterEffectsNodes,
      set: (v: Tone.ToneAudioNode[]) => { self.masterEffectsNodes = v; },
    });
    Object.defineProperty(ctx, 'masterEffectConfigs', {
      get: () => self.masterEffectConfigs,
      set: (v: Map<string, { node: Tone.ToneAudioNode; config: EffectConfig }>) => { self.masterEffectConfigs = v; },
    });
    Object.defineProperty(ctx, '_isPlaying', {
      get: () => self._isPlaying,
    });
    return ctx;
  }

  public async rebuildMasterEffects(effects: EffectConfig[]): Promise<void> {
    // Channel-targeted effects (those with selectedChannels) are routed via
    // WASM isolation in scheduleWasmEffectRebuild, NOT the master serial chain.
    // Don't tear down isolation here — it's managed by ChannelRoutedEffects.
    await _rebuildMasterEffects(this._masterFxCtx, effects);
  }

  public getMasterEffectNode(effectId: string): Tone.ToneAudioNode | null {
    return _getMasterEffectNode(this._masterFxCtx, effectId);
  }

  public getMasterEffectAnalysers(id: string): { pre: AnalyserNode; post: AnalyserNode } | null {
    return _getMasterEffectAnalysers(this._masterFxCtx, id);
  }

  public updateMasterEffectParams(effectId: string, config: EffectConfig): void {
    _updateMasterEffectParams(this._masterFxCtx, effectId, config);
  }

  public updateInstrumentEffectParams(effectId: string, config: EffectConfig): void {
    _updateInstrumentEffectParams(this.instrumentEffectNodes, this._masterFxCtx.applyEffectParametersDiff, effectId, config);
  }

  private applyEffectParametersDiff(node: Tone.ToneAudioNode, type: string, changed: Record<string, number | string>): void {
    _applyEffectParamsDiff(node, type, changed);
  }

  private applyBpmSyncedParam(node: Tone.ToneAudioNode, effectType: string, paramKey: string, value: number): void {
    _applyBpmSyncedParam(node, effectType, paramKey, value);
  }

  public async updateBpmSyncedEffects(bpm: number): Promise<void> {
    // 1. Master effects
    this.masterEffectConfigs.forEach(({ node, config }) => {
      if (!isEffectBpmSynced(config.parameters)) return;
      const syncEntries = SYNCABLE_EFFECT_PARAMS[config.type];
      if (!syncEntries) return;
      const division = getEffectSyncDivision(config.parameters);
      for (const entry of syncEntries) {
        const value = computeSyncedValue(bpm, division, entry.unit);
        this.applyBpmSyncedParam(node, config.type, entry.param, value);
      }
    });

    // 2. Per-instrument effects
    try {
      const { useInstrumentStore } = await import('../stores/useInstrumentStore');
      const instruments = useInstrumentStore.getState().instruments;

      this.instrumentEffectChains.forEach((chain, key) => {
        const instrumentId = key >> 16;
        const instrument = instruments.find((inst: { id: number }) => inst.id === instrumentId);
        if (!instrument?.effects) return;

        const enabledEffects = instrument.effects.filter((fx: EffectConfig) => fx.enabled);

        enabledEffects.forEach((config: EffectConfig, idx: number) => {
          if (idx >= chain.effects.length) return;
          if (!isEffectBpmSynced(config.parameters)) return;
          const syncEntries = SYNCABLE_EFFECT_PARAMS[config.type];
          if (!syncEntries) return;
          const division = getEffectSyncDivision(config.parameters);
          const node = chain.effects[idx];
          for (const entry of syncEntries) {
            const value = computeSyncedValue(bpm, division, entry.unit);
            this.applyBpmSyncedParam(node, config.type, entry.param, value);
          }
        });
      });
    } catch {
      // Store not yet initialized — skip instrument sync
    }
  }

  // ============================================================================
  // PER-CHANNEL ROUTING — delegated to ChannelRouting module
  // ============================================================================

  private get _channelCtx(): ChannelRoutingContext {
    return {
      masterInput: this.masterInput,
      channelOutputs: this.channelOutputs,
      activeVoices: this.activeVoices,
      channelPitchState: this.channelPitchState,
      channelMuteStates: this.channelMuteStates,
      instruments: this.instruments,
      instrumentSynthTypes: this.instrumentSynthTypes,
      instrumentOutputOverrides: this.instrumentOutputOverrides,
      itFilterWorkletLoaded: ToneEngine.itFilterWorkletLoaded,
      nativeContext: this._nativeContext,
      FILTER_CUTOFF_LUT: ToneEngine.FILTER_CUTOFF_LUT,
    };
  }

  public getChannelOutput(channelIndex: number): Tone.Gain { return _getChannelOutput(this._channelCtx, channelIndex); }
  private createVoice(channelIndex: number, instrument: Tone.ToneAudioNode | DevilboxSynth, note: string, config: InstrumentConfig): VoiceState { return _createVoice(this._channelCtx, channelIndex, instrument, note, config); }
  private stopVoice(voice: VoiceState, time: number): void { _stopVoice(voice, time); }
  public setChannelVolume(channelIndex: number, volumeDb: number): void { _setChannelVolume(this._channelCtx, channelIndex, volumeDb); }
  public setChannelFilterCutoff(channelIndex: number, cutoff: number): void { _setChannelFilterCutoff(this._channelCtx, channelIndex, cutoff); }
  public setChannelFilterResonance(channelIndex: number, resonance: number): void { _setChannelFilterResonance(this._channelCtx, channelIndex, resonance); }
  public setChannelPan(channelIndex: number, pan: number | null | undefined): void { _setChannelPan(this._channelCtx, channelIndex, pan); }
  public setChannelFunkRepeat(channelIndex: number, position: number): void { _setChannelFunkRepeat(this._channelCtx, channelIndex, position); }
  public handlePastNoteAction(channelIndex: number, action: number): void { _handlePastNoteAction(this._channelCtx, channelIndex, action); }
  public setChannelPitch(channelIndex: number, pitchMultiplier: number): void { _setChannelPitch(this._channelCtx, channelIndex, pitchMultiplier); }
  public setChannelFrequency(channelIndex: number, frequency: number): void { _setChannelFrequency(this._channelCtx, channelIndex, frequency); }
  /** Get the last note frequency triggered on a channel (for SynthEffectProcessor) */
  public getChannelLastNoteFrequency(channelIndex: number): number {
    return this.channelLastNote.get(channelIndex)?.frequency ?? 0;
  }
  public initChannelPitch(channelIndex: number, instrumentKey: number, baseFrequency: number, basePlaybackRate: number = 1): void { _initChannelPitch(this._channelCtx, channelIndex, instrumentKey, baseFrequency, basePlaybackRate); }
  public clearChannelPitch(channelIndex: number): void { _clearChannelPitch(this._channelCtx, channelIndex); }
  public setChannelMute(channelIndex: number, muted: boolean): void { _setChannelMute(this._channelCtx, channelIndex, muted); }
  public setMixerChannelVolume(channelIndex: number, volumeDb: number): void { _setMixerChannelVolume(this._channelCtx, channelIndex, volumeDb); }
  public setMixerChannelPan(channelIndex: number, pan: number): void { _setMixerChannelPan(this._channelCtx, channelIndex, pan); }
  public updateMuteStates(channels: { muted: boolean; solo: boolean }[]): void { _updateMuteStates(this._channelCtx, channels); }
  public isChannelMuted(channelIndex: number): boolean { return _isChannelMuted(this._channelCtx, channelIndex); }
  public setChannelMaxVoices(channelIndex: number, maxVoices: number): void { this.channelMaxVoices.set(channelIndex, maxVoices); }
  public getChannelMaxVoices(channelIndex: number): number { return this.channelMaxVoices.get(channelIndex) || 0; }
  private disposeChannelOutputs(): void { _disposeChannelOutputs(this._channelCtx); }
  public getChannelLevels(numChannels: number): number[] {
    // Per-channel meter data from TypeScript synths (each channel has its own Tone.Meter)
    const perChannelLevels = _getChannelLevels(this._channelCtx, numChannels);

    // Check for realtime per-channel levels from WASM engines (libopenmpt, etc.)
    const wasmLevels = _getRealtimeChannelLevels(this.channelMeter, numChannels);

    // Merge: use per-channel Tone.Meter data, overlay WASM levels where available
    const result = perChannelLevels;
    if (wasmLevels) {
      for (let i = 0; i < numChannels; i++) {
        if (wasmLevels[i] > result[i]) result[i] = wasmLevels[i];
      }
    }
    return result;
  }
  /** Update realtime per-channel levels from WASM engines */
  public updateRealtimeChannelLevels(levels: number[]): void { _updateRealtimeChannelLevels(this.channelMeter, levels); }
  /** Get the master level (0-1) from masterEffectsInput where all audio converges */
  public getMasterLevel(): number { return this.masterMeter.getValue() as number; }
  /** Get the synthBus level (0-1) for WASM engines that bypass per-channel routing */
  public getSynthBusLevel(): number { return this.synthBusMeter.getValue() as number; }

  /** Get channel output by index (for send bus wiring) */
  public getChannelOutputByIndex(channelIndex: number): ChannelOutput | null {
    return this.channelOutputs.get(channelIndex) ?? null;
  }

  // Channel metering — delegated to ChannelMeterState
  public triggerChannelMeter(channelIndex: number, velocity: number): void { _triggerChannelMeter(this.channelMeter, channelIndex, velocity); }
  public clearChannelTriggerLevels(): void { _clearChannelTriggerLevels(this.channelMeter); }
  public getChannelTriggerLevels(numChannels: number): number[] { return _getChannelTriggerLevels(this.channelMeter, numChannels); }
  public getChannelTriggerGenerations(numChannels: number): number[] { return _getChannelTriggerGenerations(this.channelMeter, numChannels); }

  /**
   * Get waveform data for oscilloscope
   */
  public getWaveform(): Float32Array {
    return this.analyser.getValue() as Float32Array;
  }

  /**
   * Get FFT data for spectrum analyzer
   */
  public getFFT(): Float32Array {
    return this.fft.getValue() as Float32Array;
  }

  /**
   * Enable analysers for visualization (connects them to the audio graph)
   */
  public enableAnalysers(): void {
    if (!this.analysersConnected) {
      this.masterChannel.connect(this.analyser);
      this.masterChannel.connect(this.fft);
      this.analysersConnected = true;
    }
  }

  /**
   * Disable analysers to save CPU when visualizations are hidden
   */
  public disableAnalysers(): void {
    if (this.analysersConnected) {
      this.masterChannel.disconnect(this.analyser);
      this.masterChannel.disconnect(this.fft);
      this.analysersConnected = false;
    }
  }

  // ── Level meter connect/disconnect (idle CPU savings) ─────────────────
  private metersConnected = false;

  /** Connect level meters — call when playback starts or UI needs levels */
  public connectMeters(): void {
    if (this.metersConnected) return;
    this.synthBus.connect(this.synthBusMeter);
    this.masterEffectsInput.connect(this.masterMeter);
    this.metersConnected = true;
  }

  /** Disconnect level meters — call when playback stops to save CPU */
  public disconnectMeters(): void {
    if (!this.metersConnected) return;
    try { this.synthBus.disconnect(this.synthBusMeter); } catch { /* already disconnected */ }
    try { this.masterEffectsInput.disconnect(this.masterMeter); } catch { /* already disconnected */ }
    this.metersConnected = false;
  }

  // ============================================
  // PERFORMANCE QUALITY MANAGEMENT
  // ============================================

  private currentPerformanceQuality: 'high' | 'medium' | 'low' = 'high';

  /**
   * Set performance quality for all synth engines
   * Dynamically reconfigures demanding synths (TB-303, etc.) to reduce CPU usage
   * while maintaining characteristic sound
   *
   * Quality levels:
   * - High: Full processing (cascaded filters, all effects), max polyphony
   * - Medium: Simplified processing (~40-50% CPU reduction), reduced polyphony
   * - Low: Minimal processing (~70% CPU reduction), minimal polyphony
   */
  public setPerformanceQuality(quality: 'high' | 'medium' | 'low'): void {
    if (this.currentPerformanceQuality === quality) return;

    this.currentPerformanceQuality = quality;

    // Update all TB-303 synths (can reconfigure dynamically)
    this.instruments.forEach((instrument) => {
      if (instrument instanceof JC303Synth) {
        instrument.setQuality(quality);
      }
    });

    // For PolySynths, we need to track which ones need recreation
    // Store configs so we can recreate them with new polyphony settings
    const polySynthsToRecreate: Array<{
      key: number;
      instrumentId: number;
      channelIndex: number | undefined;
      config: { synthType: string };
    }> = [];

    this.instruments.forEach((instrument, key) => {
      // Check if it's a PolySynth (has maxPolyphony property)
      if (instrument && typeof instrument === 'object' && 'maxPolyphony' in instrument) {
        // Parse key to get instrumentId and channelIndex
        const instrumentId = key >>> 16;
        const rawChannel = key & 0xFFFF;
        const channelIndex = rawChannel === 0xFFFF ? undefined : rawChannel;

        // Get synth type from instrumentSynthTypes map
        const synthType = this.instrumentSynthTypes.get(key);

        if (synthType && ['Synth', 'FMSynth', 'ToneAM', 'PluckSynth'].includes(synthType)) {
          polySynthsToRecreate.push({
            key,
            instrumentId,
            channelIndex,
            config: { synthType } // We'll need to recreate with full config
          });
        }
      }
    });

    // Dispose PolySynths that need recreation
    // They'll be recreated with new polyphony settings the next time they're used
    if (polySynthsToRecreate.length > 0) {
      polySynthsToRecreate.forEach(({ key }) => {
        const instrument = this.instruments.get(key);
        if (instrument && typeof instrument.dispose === 'function') {
          try {
            instrument.dispose();
          } catch (error) {
            console.warn(`[ToneEngine] Error disposing instrument ${key}:`, error);
          }
        }
        this.instruments.delete(key);
        this.instrumentSynthTypes.delete(key);
      });
    }

  }

  // ============================================================================
  // TRACKER ENVELOPE PROCESSING (XM/IT)
  // ============================================================================

  /**
   * Process tracker envelopes for a channel (Sub-tick processing)
   */
  public updateChannelEnvelopes(channelIndex: number): void { _updateChannelEnvelopes(this._channelCtx, channelIndex); }
  public setChannelKeyOff(channelIndex: number): void { _setChannelKeyOff(this._channelCtx, channelIndex); }

  // ============================================
  // END TRACKER ENVELOPE PROCESSING
  // ============================================

  /**
   * Get current performance quality level
   */
  public getPerformanceQuality(): 'high' | 'medium' | 'low' {
    return this.currentPerformanceQuality;
  }

  // ============================================
  // EFFECT COMMAND SUPPORT FOR SYNTHS
  // ============================================

  /**
   * Apply volume to a synth instrument (for Cxx, Axy, 7xy effects)
   * @param instrumentId - Instrument ID
   * @param volume - Volume 0-1 (linear gain)
   * @param time - Audio time
   * @param channelIndex - Channel index for per-channel synths
   */
  public applySynthVolume(instrumentId: number, volume: number, time: number, channelIndex?: number): void {
    const key = this.getInstrumentKey(instrumentId, channelIndex);
    const instrument = this.instruments.get(key);
    if (!instrument) return;

    const safeTime = this.getSafeTime(time) ?? Tone.now();
    
    // Convert 0-1 linear gain to decibels for Tone.js
    const dbVolume = volume <= 0 ? -Infinity : Tone.gainToDb(volume);
    
    // Most Tone.js synths have .volume (Param<"decibels">)
    if ('volume' in instrument && instrument.volume) {
      const volParam = instrument.volume as unknown as Tone.Param<'decibels'>;
      if (typeof volParam.setValueAtTime === 'function') {
        volParam.setValueAtTime(dbVolume, safeTime);
      }
    }
  }

  /**
   * Apply panning to a synth instrument (for 8xx, Pxy effects)
   * @param instrumentId - Instrument ID
   * @param pan - Pan -1 (left) to 1 (right)
   * @param time - Audio time
   * @param channelIndex - Channel index for per-channel synths
   */
  public applySynthPan(instrumentId: number, pan: number, time: number, channelIndex?: number): void {
    const key = this.getInstrumentKey(instrumentId, channelIndex);
    const instrument = this.instruments.get(key);
    if (!instrument) return;

    const safeTime = this.getSafeTime(time) ?? Tone.now();
    
    // Check if synth has internal panner
    if ('pan' in instrument && instrument.pan) {
      const panParam = instrument.pan as unknown as Tone.Param<'audioRange'>;
      if (typeof panParam.setValueAtTime === 'function') {
        panParam.setValueAtTime(pan, safeTime);
      }
    } else {
      // TODO: Create external panner if synth doesn't have one
      // For now, synths without .pan won't respond to pan effects
    }
  }

  /**
   * Apply pitch offset to a synth instrument (for portamento, vibrato, arpeggio)
   * @param instrumentId - Instrument ID
   * @param semitones - Pitch offset in semitones (can be fractional)
   * @param time - Audio time
   * @param channelIndex - Channel index for per-channel synths
   * @param rampTime - If provided, ramp to the pitch over this duration
   */
  public applySynthPitch(instrumentId: number, semitones: number, time: number, channelIndex?: number, rampTime?: number): void {
    const key = this.getInstrumentKey(instrumentId, channelIndex);
    const instrument = this.instruments.get(key);
    
    if (!instrument) return;

    const safeTime = this.getSafeTime(time) ?? Tone.now();
    const cents = semitones * 100;

    // PolySynth: detune all active voices AND the base instrument
    if (instrument instanceof Tone.PolySynth) {
      // Detune active voices
      const activeVoices = (instrument as any)._activeVoices;
      if (activeVoices && activeVoices.length > 0) {
        activeVoices.forEach((voice: any) => {
          if (voice.detune) {
            voice.detune.setValueAtTime(cents, safeTime);
          }
        });
      }
      
      // ALSO detune the PolySynth itself (for future notes)
      if ('detune' in instrument && instrument.detune) {
        const detune = instrument.detune as any;
        if (typeof detune.setValueAtTime === 'function') {
          if (rampTime) {
            detune.linearRampToValueAtTime(cents, safeTime + rampTime);
          } else {
            detune.setValueAtTime(cents, safeTime);
          }
        } else if ('value' in detune) {
          detune.value = cents;
        }
      }
      return;
    }

    // Regular synths with .detune parameter
    if ('detune' in instrument && instrument.detune) {
      const detune = instrument.detune as any;
      
      if (typeof detune.setValueAtTime === 'function') {
        // Param-based detune
        if (rampTime && typeof detune.linearRampToValueAtTime === 'function') {
          detune.linearRampToValueAtTime(cents, safeTime + rampTime);
        } else {
          detune.setValueAtTime(cents, safeTime);
        }
      } else if ('value' in detune) {
        // Signal-based detune (MonoSynth, DuoSynth)
        detune.value = cents;
      }
    }
  }

  /**
   * Apply frequency modulation to a synth (FT2-style effects: arpeggio, vibrato, etc.)
   * Modulates the oscillator frequency directly without retriggering notes.
   * This is how FastTracker 2 implements pitch effects - updates playback frequency, not note.
   * 
   * @param instrumentId - Instrument ID
   * @param frequency - Target frequency in Hz
   * @param channelIndex - Channel index for per-channel synths
   * @param rampTime - If provided, ramp to the frequency over this duration
   */
  public applySynthFrequency(instrumentId: number, frequency: number, channelIndex?: number, rampTime?: number): void {
    const key = this.getInstrumentKey(instrumentId, channelIndex);
    let instrument = this.instruments.get(key);
    
    // Fallback: try legacy shared key if per-channel not found
    if (!instrument && channelIndex !== undefined) {
      const legacyKey = this.getInstrumentKey(instrumentId, -1);
      instrument = this.instruments.get(legacyKey);
    }
    
    if (!instrument) return;

    const safeTime = this.getSafeTime() ?? Tone.now();

    // Handle monophonic synths (MonoSynth, DuoSynth, FMSynth, AMSynth)
    let freqParam: Tone.Param<'frequency'> | undefined;
    
    if ('frequency' in instrument && instrument.frequency) {
      freqParam = instrument.frequency as Tone.Param<'frequency'>;
    } else if ('oscillator' in instrument && (instrument as any).oscillator?.frequency) {
      freqParam = (instrument as any).oscillator.frequency;
    } else if ('voice0' in instrument && (instrument as any).voice0?.oscillator?.frequency) {
      freqParam = (instrument as any).voice0.oscillator.frequency;
    }

    if (freqParam && typeof freqParam.setValueAtTime === 'function') {
      if (rampTime && typeof freqParam.exponentialRampToValueAtTime === 'function') {
        freqParam.exponentialRampToValueAtTime(Math.max(0.01, frequency), safeTime + rampTime);
      } else {
        freqParam.setValueAtTime(frequency, safeTime);
      }
      return;
    }

    // PolySynth: Apply to all active voices (fallback for non-tracker use)
    if (instrument instanceof Tone.PolySynth) {
      const activeVoices = (instrument as any)._activeVoices;
      if (activeVoices && activeVoices.length > 0) {
        activeVoices.forEach((voice: any) => {
          let voiceFreqParam: Tone.Param<'frequency'> | undefined;
          
          if (voice.frequency) {
            voiceFreqParam = voice.frequency;
          } else if (voice.oscillator?.frequency) {
            voiceFreqParam = voice.oscillator.frequency;
          } else if (voice.voice0?.oscillator?.frequency) {
            voiceFreqParam = voice.voice0.oscillator.frequency;
          }
          
          if (voiceFreqParam && typeof voiceFreqParam.setValueAtTime === 'function') {
            if (rampTime && typeof voiceFreqParam.exponentialRampToValueAtTime === 'function') {
              voiceFreqParam.exponentialRampToValueAtTime(Math.max(0.01, frequency), safeTime + rampTime);
            } else {
              voiceFreqParam.setValueAtTime(frequency, safeTime);
            }
          }
        });
      }
      return;
    }
  }

  // ============================================
  // END EFFECT COMMAND SUPPORT
  // ============================================

  // ============================================
  // END PERFORMANCE QUALITY MANAGEMENT
  // ============================================
}

// Export singleton instance getter
export const getToneEngine = () => ToneEngine.getInstance();

// Register engine ref for PeriodTables (breaks circular dependency)
_registerToneEngineRef(getToneEngine);
