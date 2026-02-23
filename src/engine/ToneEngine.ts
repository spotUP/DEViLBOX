/**
 * ToneEngine - Tone.js Audio Engine Wrapper
 * Manages Tone.js lifecycle, instruments, master effects, and audio context
 */

import * as Tone from 'tone';
import type { InstrumentConfig, EffectConfig } from '@typedefs/instrument';
import type { DevilboxSynth } from '@typedefs/synth';
import { isDevilboxSynth } from '@typedefs/synth';
import { DB303Synth, DB303Synth as JC303Synth } from './db303';
import { MAMESynth } from './MAMESynth';
import { MAMEBaseSynth } from './mame/MAMEBaseSynth';
import { InstrumentFactory } from './InstrumentFactory';
import { periodToNoteIndex, getPeriodExtended } from './effects/PeriodTables';
import { AmigaFilter } from './effects/AmigaFilter';
import { TrackerEnvelope } from './TrackerEnvelope';
import { InstrumentAnalyser } from './InstrumentAnalyser';
import { FurnaceChipEngine, FurnaceChipType } from './chips/FurnaceChipEngine';
import { FurnaceDispatchSynth } from './furnace-dispatch/FurnaceDispatchSynth';
import { FurnaceDispatchEngine } from './furnace-dispatch/FurnaceDispatchEngine';
import { FurnaceSynth } from './FurnaceSynth';
import { normalizeUrl } from '@utils/urlUtils';
import { getNativeAudioNode, setDevilboxAudioContext } from '@utils/audio-context';
import { SpaceyDelayerEffect } from './effects/SpaceyDelayerEffect';
import { RETapeEchoEffect } from './effects/RETapeEchoEffect';
import { SpaceEchoEffect } from './effects/SpaceEchoEffect';
import { BiPhaseEffect } from './effects/BiPhaseEffect';
import { DubFilterEffect } from './effects/DubFilterEffect';
import { MoogFilterEffect, type MoogFilterModel, type MoogFilterMode } from './effects/MoogFilterEffect';
import { MVerbEffect } from './effects/MVerbEffect';
import { LeslieEffect } from './effects/LeslieEffect';
import { SpringReverbEffect } from './effects/SpringReverbEffect';
import { VinylNoiseEffect } from './effects/VinylNoiseEffect';
import { TumultEffect, type TumultOptions } from './effects/TumultEffect';
import { TapeSimulatorEffect } from './effects/TapeSimulatorEffect';
import { ToneArmEffect } from './effects/ToneArmEffect';
import { NeuralEffectWrapper } from './effects/NeuralEffectWrapper';
import { WAMEffectNode } from './wam/WAMEffectNode';
import { SidechainCompressor } from './effects/SidechainCompressor';
import { TapeSaturation } from './effects/TapeSaturation';
import { isEffectBpmSynced, getEffectSyncDivision, computeSyncedValue, SYNCABLE_EFFECT_PARAMS } from './bpmSync';
import { reportSynthError } from '../stores/useSynthErrorStore';
import { SYNTH_REGISTRY } from './vstbridge/synth-registry';
import { WAMSynth } from './wam/WAMSynth';
import { CHIP_SYNTH_DEFS } from '../constants/chipParameters';
import { useRomDialogStore } from '../stores/useRomDialogStore';
import { BlepManager } from './blep/BlepManager';
import { SynthRegistry } from './registry/SynthRegistry';
import { VoiceAllocator } from './audio/VoiceAllocator';

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

  // Master routing chain:
  // - Tracker instruments → masterInput → amigaFilter ─→ masterEffectsInput → [master fx?] → blepInput → [BLEP?] → masterChannel → destination
  // - DevilboxSynths → synthBus ───────────────────────→ masterEffectsInput → [master fx?] → blepInput → [BLEP?] → masterChannel → destination
  public masterInput: Tone.Gain; // Where tracker instruments connect
  public synthBus: Tone.Gain; // Bypass bus for DevilboxSynths (skips AmigaFilter)
  public masterEffectsInput: Tone.Gain; // Merge point for master effects (both paths feed in here)
  private blepInput: Tone.Gain; // BLEP insertion point — isolates BLEP routing from effects chain rebuilds
  public masterChannel: Tone.Channel; // Final output with volume/pan
  public analyser: Tone.Analyser;
  // FFT for frequency visualization
  public fft: Tone.FFT;
  private analysersConnected: boolean = false;

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

  // Metronome synth and state
  private metronomeSynth: Tone.MembraneSynth | null = null;
  private metronomeVolume: Tone.Gain | null = null;
  private metronomeEnabled: boolean = false;
  private metronomePart: Tone.Part | null = null;

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
    this.masterChannel = new Tone.Channel({
      volume: -6,
      pan: 0,
    }).toDestination();

    // Analyzers for visualization (created but not connected by default)
    this.analyser = new Tone.Analyser('waveform', 1024);
    this.fft = new Tone.FFT(1024);

    // Don't connect analyzers by default - use enableAnalysers() to connect when needed

    // Master effects merge point — both tracker and synth audio meet here
    this.masterEffectsInput = new Tone.Gain(1);

    // BLEP insertion point — sits between effects chain end and masterChannel.
    // This node is never disconnected by rebuildMasterEffects, so BLEP routing stays stable.
    this.blepInput = new Tone.Gain(1);

    // Default routing:
    //   masterInput → amigaFilter → masterEffectsInput → blepInput → masterChannel
    //   synthBus ──────────────────→ masterEffectsInput → blepInput → masterChannel
    this.masterInput.connect(this.amigaFilter);
    this.amigaFilter.connect(this.masterEffectsInput);
    this.masterEffectsInput.connect(this.blepInput);
    this.blepInput.connect(this.masterChannel);

    // Synth bus bypasses AmigaFilter for native synths (DB303, Vital, etc.)
    this.synthBus = new Tone.Gain(1);
    this.synthBus.connect(this.masterEffectsInput);

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
    const nativeDestination = getNativeAudioNode(destination as any);
    if (nativeDestination) {
      // Validate contexts match before connecting
      const sourceCtx = synthOutput.context;
      const destCtx = nativeDestination.context;

      if (sourceCtx !== destCtx) {
        console.error('[ToneEngine] AudioContext mismatch! Cannot connect nodes from different contexts.',
          'Source context:', sourceCtx,
          'Dest context:', destCtx,
          'Are they same instance?', sourceCtx === destCtx);
        // Try to reconnect via master output as workaround
        return;
      }

      try {
        synthOutput.connect(nativeDestination);
      } catch (e) {
        console.error('[ToneEngine] connectNativeSynth failed:', e,
          'synthOutput context:', sourceCtx.constructor?.name,
          'dest context:', destCtx.constructor?.name);
      }
    } else {
      console.warn('[ToneEngine] Could not find native AudioNode in Tone.js destination, falling back');
      // Last resort: try connecting to Tone.js input property
      const destWithInput = destination as unknown as { input?: AudioNode };
      if (destWithInput.input) {
        try {
          synthOutput.connect(destWithInput.input);
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
    } else if ('output' in instrument && (instrument as any).output instanceof GainNode) {
      // Generic native GainNode output (UADESynth, HivelySynth, etc.)
      const synthName = (instrument as any).name || 'NativeWASM';
      engineKey = synthName;
      engineGain = (instrument as any).output;
    } else {
      return;
    }

    if (!engineGain) return;

    let routing = this.nativeEngineRouting.get(engineKey);
    if (!routing) {
      routing = { gain: engineGain, destinations: new Set() };
      this.nativeEngineRouting.set(engineKey, routing);
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
   * Helper to decode an ArrayBuffer to an AudioBuffer
   * Also handles AudioBuffer (returns as-is) and Uint8Array (converts to ArrayBuffer)
   */
  public async decodeAudioData(buffer: ArrayBuffer | AudioBuffer | Uint8Array): Promise<AudioBuffer> {
    // If already an AudioBuffer, return as-is
    if (buffer instanceof AudioBuffer) {
      return buffer;
    }

    // If Uint8Array, convert to ArrayBuffer
    if (buffer instanceof Uint8Array) {
      const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
      return await Tone.getContext().rawContext.decodeAudioData(arrayBuffer);
    }

    // Verify it's actually an ArrayBuffer before trying to slice
    if (!(buffer instanceof ArrayBuffer)) {
      console.error('[ToneEngine] decodeAudioData: expected ArrayBuffer but got:', typeof buffer, buffer);
      throw new Error(`Invalid buffer type: ${typeof buffer}`);
    }

    // ArrayBuffer - decode it (slice to create a copy for decoding)
    return await Tone.getContext().rawContext.decodeAudioData(buffer.slice(0));
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
    if (Tone.getContext().state === 'suspended') {
      await Tone.start();
    }

    // Configure Transport for rock-solid audio scheduling
    // Always use interactive (10ms) for maximum snappiness
    Tone.getContext().lookAhead = 0.01;
    Tone.getTransport().bpm.value = 125; // Default BPM

    // Wait for context to actually be running
    const nativeCtx = this._nativeContext!;
    
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

    // Pre-initialize Furnace WASM chip engine
    // This ensures the WASM is ready before any Furnace synths are created
    try {
      const furnaceEngine = FurnaceChipEngine.getInstance();
      // Pass Tone.js context - the engine will extract the native AudioContext
      await furnaceEngine.init(Tone.getContext());
      console.warn('[ToneEngine] Furnace WASM chip engine initialized');
    } catch (error) {
      console.warn('[ToneEngine] Furnace WASM init failed:', error);
    }

    // Initialize BLEP processor (non-blocking, loads in background)
    this.blepManager.init().then(() => {
      // Connect BLEP into audio chain: masterEffectsInput → BLEP → masterChannel
      this.reconnectBlepChain();
    }).catch(error => {
      console.warn('[ToneEngine] BLEP init failed (continuing without BLEP):', error);
    });

    // Load AmigaFilter worklet handled by its class
  }

  /**
   * Reconnect the BLEP audio chain based on current settings.
   * Routes through: blepInput → [BLEP worklet?] → masterChannel
   * The blepInput node is never touched by rebuildMasterEffects, so this is stable.
   */
  private reconnectBlepChain(): void {
    // Disconnect blepInput → masterChannel (and any native worklet connections)
    try {
      this.blepInput.disconnect(this.masterChannel);
    } catch {
      // Ignore if not connected
    }

    // Reconnect with or without BLEP
    this.blepManager.connect(this.blepInput, this.masterChannel);
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
      c.synthType !== 'Sampler' &&
      c.synthType !== 'Player' &&
      c.synthType !== 'Sam' &&
      !(c.synthType === 'V2' && c.v2Speech)
    );

    // Create non-sampler instruments immediately
    otherConfigs.forEach((config) => {
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
    // This includes: MAME synths, Buzzmachine, Dexed, OBXd, TB303, V2, DubSiren, etc.
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
      ['TB303', 'Buzz3o3', 'V2', 'Sam', 'Synare', 'DubSiren', 'SpaceLaser', 'Dexed', 'OBXd', 'Furnace'].includes(c.synthType || '') ||
      c.synthType?.startsWith('Furnace')
    );
    if (wasmConfigs.length === 0) return;

    const promises: Promise<void>[] = [];
    for (const config of wasmConfigs) {
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
    this.masterChannel.volume.value = volumeDb;
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
    // then restoring after the effect buffers have cleared
    const currentVolume = this.masterChannel.volume.value;
    this.masterChannel.volume.value = -Infinity;

    // Restore volume after effects have flushed (delay/reverb tails)
    setTimeout(() => {
      this.masterChannel.volume.value = currentVolume;
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
    // Check if audio context is running
    if (Tone.context.state !== 'running') {
      // Log the actual state to help diagnose why it's not running
      console.warn(`[ToneEngine] getSafeTime: context state is '${Tone.context.state}', not 'running'`);
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
    // CRITICAL FIX: Many synth types don't need per-channel instances
    // They're already polyphonic and don't have per-channel automation
    // Creating new instances causes them to reload samples/ROMs/WASM, causing silence and performance issues
    const isMAME = config.synthType?.startsWith('MAME') || config.synthType === 'CZ101' || config.synthType === 'CEM3394' || config.synthType === 'SCSP';
    const isFurnace = config.synthType?.startsWith('Furnace') || config.synthType === 'Furnace';
    const isBuzzmachine = config.synthType?.startsWith('Buzz') || config.synthType === 'Buzzmachine';
    const isWASMSynth = ['TB303', 'V2', 'Sam', 'DubSiren', 'SpaceLaser', 'Synare', 'Dexed', 'OBXd', 'WAM'].includes(config.synthType || '');
    const isVSTBridge = !isWASMSynth && typeof config.synthType === 'string' && SYNTH_REGISTRY.has(config.synthType);
    const isSharedType = config.synthType === 'Sampler' || config.synthType === 'Player' || isMAME || isFurnace || isBuzzmachine || isWASMSynth || isVSTBridge;
    const key = isSharedType
      ? this.getInstrumentKey(instrumentId, -1)  // Use shared instance
      : this.getInstrumentKey(instrumentId, channelIndex);

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
        // Type matches, return cached instrument
        return cached ?? null;
      }
    }

    // PERFORMANCE FIX: Check for shared/legacy instrument before creating new one
    // Preload creates instruments with key ${id}--1, but playback uses ${id}-${channel}
    // Reuse the shared instance instead of creating expensive new synths per channel
    // BUT: Don't reuse for live voice channels (100+) - those need separate instances for polyphony
    const isLiveVoiceChannel = channelIndex !== undefined && channelIndex >= ToneEngine.LIVE_VOICE_BASE_CHANNEL;
    const legacyKey = this.getInstrumentKey(instrumentId, -1);
    if (!isSharedType && !isLiveVoiceChannel && this.instruments.has(legacyKey)) {
      // Verify the stored type matches what's requested — if not, dispose the stale instance
      const storedLegacyType = this.instrumentSynthTypes.get(legacyKey);
      if (config.synthType && storedLegacyType && storedLegacyType !== config.synthType) {
        console.warn(`[ToneEngine] STALE LEGACY INSTRUMENT: key=${legacyKey} stored as ${storedLegacyType} but config wants ${config.synthType} — disposing and recreating`);
        this.disposeInstrumentByKey(legacyKey);
      } else {
        return this.instruments.get(legacyKey) ?? null;
      }
    }

    // Create new instrument based on config
    let instrument: Tone.ToneAudioNode | DevilboxSynth | null = null;

    switch (config.synthType) {
      case 'Synth': {
        // Adjust polyphony based on quality level for CPU savings
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
          volume: config.volume || -12,
        } as any);
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
          volume: config.volume || -12,
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
          volume: config.volume || -12,
        });
        break;

      case 'FMSynth': {
        // FMSynth is CPU-intensive, reduce polyphony on lower quality
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
          volume: config.volume || -12,
        } as any);
        break;
      }

      case 'AMSynth': {
        // AMSynth has dual oscillators, reduce polyphony on lower quality
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
          volume: config.volume || -12,
        } as any);
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
          volume: config.volume || -12,
        });
        break;
      }

      case 'MetalSynth':
        // Use NoiseSynth as fast alternative for hi-hats/cymbals
        instrument = new Tone.NoiseSynth({
          noise: { type: 'white' },
          envelope: {
            attack: (config.envelope?.attack ?? 1) / 1000,
            decay: (config.envelope?.decay ?? 100) / 1000,
            sustain: 0,
            release: (config.envelope?.release ?? 100) / 1000,
          },
          volume: config.volume || -12,
        });
        break;

      case 'MembraneSynth':
        // PERFORMANCE FIX: MembraneSynth takes 117-122ms per note
        // Use a simpler Synth with pitch envelope for kick drums
        instrument = new Tone.Synth({
          oscillator: { type: 'sine' },
          envelope: {
            attack: (config.envelope?.attack ?? 1) / 1000,
            decay: (config.envelope?.decay ?? 400) / 1000,
            sustain: 0.01,
            release: (config.envelope?.release ?? 100) / 1000,
          },
          volume: config.volume || -12,
        });
        break;

      case 'NoiseSynth': {
        // NoiseSynth doesn't have built-in filter, so we create a wrapper
        const noiseSynth = new Tone.NoiseSynth({
          noise: {
            type: 'white',
          },
          envelope: {
            attack: (config.envelope?.attack ?? 10) / 1000,
            decay: (config.envelope?.decay ?? 200) / 1000,
            sustain: (config.envelope?.sustain ?? 50) / 100,
            release: (config.envelope?.release ?? 1000) / 1000,
          },
          volume: config.volume ?? -12,
        });

        // If filter is specified, route through filter
        if (config.filter && config.filter.type !== 'lowpass') {
          const filter = new Tone.Filter({
            type: config.filter.type,
            frequency: config.filter.frequency,
            Q: config.filter.Q || 1,
            rolloff: config.filter.rolloff || -12,
          });
          noiseSynth.connect(filter);
          // Create a wrapper object with filter output
          instrument = {
            triggerAttackRelease: (duration: number, time?: number, velocity?: number) => {
              noiseSynth.triggerAttackRelease(duration, time, velocity);
            },
            triggerAttack: ((_note: string | number, time?: number, velocity?: number) => {
              noiseSynth.triggerAttack(time, velocity);
            }) as any,
            triggerRelease: (time?: number) => {
              noiseSynth.triggerRelease(time);
            },
            connect: (dest: Tone.InputNode) => filter.connect(dest),
            disconnect: () => filter.disconnect(),
            dispose: () => {
              noiseSynth.dispose();
              filter.dispose();
            },
            volume: noiseSynth.volume,
          } as unknown as Tone.ToneAudioNode;
        } else {
          instrument = noiseSynth;
        }
        break;
      }

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
        const baseNote = config.sample?.baseNote || 'C4';
        const hasLoop = config.sample?.loop === true;
        const loopStart = config.sample?.loopStart || 0;
        const loopEnd = config.sample?.loopEnd || 0;

        // Check if we have an edited buffer stored (takes priority over URL)
        const storedBuffer = config.sample?.audioBuffer;

        // CRITICAL: Detect and reject stale blob URLs
        // Blob URLs don't survive page refreshes - they're session-specific
        // Data URLs (base64) and regular URLs survive, so those are fine
        if (sampleUrl && sampleUrl.startsWith('blob:')) {
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
        const isValidBuffer = storedBuffer instanceof ArrayBuffer ||
          (storedBuffer as unknown) instanceof Uint8Array ||
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
                volume: config.volume || 0,
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
                  console.error(`[ToneEngine] Sampler ${instrumentId} failed to load edited buffer:`, err);
                }
              })();
              this.instrumentLoadingPromises.set(key, loadPromise);
            } else {
              // Standard style: Use Tone.Sampler for polyphonic keyboard/MIDI play
              instrument = new Tone.Sampler({
                volume: config.volume || -12,
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
                  console.error(`[ToneEngine] Sampler ${instrumentId} failed to load edited buffer:`, err);
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
              volume: config.volume || 0,
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

            instrument = new Tone.Sampler({
              urls,
              volume: config.volume || -12,
              onerror: (err: Error) => {
                console.error(`[ToneEngine] Sampler ${instrumentId} failed to load sample:`, err);
              },
            });
            this.instrumentSynthTypes.set(key, 'Sampler');
          }
        }

        // If still no instrument created, create empty sampler (will be silent)
        if (!instrument) {
          console.warn(`[ToneEngine] Sampler ${instrumentId} has no valid sample source`);
          instrument = new Tone.Sampler({
            volume: config.volume || -12,
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
            volume: config.volume || -12,
            onload: () => {
            },
            onerror: (err: Error) => {
              console.error(`[ToneEngine] Player ${instrumentId} failed to load sample:`, err);
            },
          });
        } else {
          instrument = new Tone.Player({
            volume: config.volume || -12,
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
            volume: config.volume || -12,
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
            volume: config.volume || -12,
          });
        }
        break;
      }

      // New synths - use InstrumentFactory for complex synths
      case 'SuperSaw':
      case 'PolySynth':
      case 'Organ':
      case 'DrumMachine':
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
      // JUCE WASM Synths -- falls through
      case 'Dexed':
      case 'OBXd':
      // MAME-based Synths -- falls through
      case 'MAMEVFX':
      case 'MAMEDOC':
      case 'MAMERSA':
      case 'MAMESWP30':
      case 'CZ101':
      case 'CEM3394':
      case 'SCSP':
      // MAME Per-Chip WASM Synths -- falls through
      case 'MAMEAICA':
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
      case 'Synare':
      case 'WAM':
      case 'Buzzmachine':
      // WASM song players (full-module playback via AudioWorklet)
      case 'HivelySynth':
      case 'UADESynth': {
        instrument = InstrumentFactory.createInstrument(config);
        break;
      }

      default: {
        // Check VSTBridge registry and new SynthRegistry for dynamically registered synths
        if (SYNTH_REGISTRY.has(config.synthType || '') || SynthRegistry.knows(config.synthType || '')) {
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

    // Create instrument effect chain and connect (fire-and-forget for initial creation)
    // For effect updates, use rebuildInstrumentEffects() which properly awaits
    this.buildInstrumentEffectChain(key, config.effects || [], instrument).catch((error) => {
      console.error('[ToneEngine] Failed to build initial effect chain:', error);
    });

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
    analyser.output.connect(this.getInstrumentOutputDestination(instrumentId, isNative));

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
    const instrument = this.getInstrument(instrumentId, config, channelIndex);

    if (!instrument) {
      return;
    }

    // Check if instrument can play - allow triggerAttack (synths) or start (Players)
    const canPlay = (instrument as any).triggerAttack || (instrument as any).start;
    if (!canPlay) {
      return;
    }

    // Get safe time for the attack
    // If instrument is marked as "Live", always use immediate triggering to bypass lookahead
    const safeTime = config.isLive ? this.getImmediateTime() : this.getSafeTime(time);
    if (safeTime === null) {
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
                  volume: Tone.gainToDb(velocity) + (config.volume || -12),
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
    const instrument = this.getInstrument(instrumentId, config, channelIndex);

    if (!instrument || !(instrument as any).triggerRelease) {
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
      if (
        config.synthType === 'NoiseSynth' ||
        config.synthType === 'MonoSynth' ||
        config.synthType === 'DuoSynth' ||
        config.synthType === 'MetalSynth' ||
        config.synthType === 'MembraneSynth' ||
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
        config.synthType.startsWith('MAME')
      ) {
        // These synths use triggerRelease(time) - no note parameter
        (instrument as any).triggerRelease(safeTime);
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
    'Synth', 'FMSynth', 'AMSynth', 'PluckSynth', 'Sampler',
    // InstrumentFactory types that use PolySynth internally
    'SuperSaw', 'PolySynth', 'Organ', 'ChipSynth', 'PWMSynth',
    'StringMachine', 'FormantSynth', 'Wavetable', 'WobbleBass'
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
    // Monophonic synths (enforced at runtime for safety, even if config.monophonic isn't set)
    // These synths are architecturally monophonic and will break with polyphonic note allocation
    const monoSynthTypes = new Set([
      // Speech synthesis (have speech sequencers that conflict with polyphony)
      'MAMEMEA8000', 'MAMETMS5220', 'MAMESP0250', 'MAMEVotrax', 'Sam', 'V2Speech',
      // Single-voice generators
      'MAMECM3394', 'MAMETMS36XX', 'MAMESN76477', 'MAMEUPD931', 'MAMEUPD933',
      // Monophonic synths
      'MonoSynth', 'DuoSynth', 'TB303', 'Buzz3o3', 'DB303', 'DubSiren', 'SpaceLaser', 'Synare',
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
      console.warn(`[ToneEngine] triggerNote: safeTime is null for id=${instrumentId}`);
      return;
    }

    const instrument = this.getInstrument(instrumentId, config, channelIndex);
    if (!instrument) {
      console.warn(`[ToneEngine] triggerNote: No instrument for id=${instrumentId} type=${config.synthType}`);
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
      // For mono synths where voiceNode === instrument, check if voice already exists
      const existingVoiceIndex = voices.findIndex(v => v.instrument === voiceNode);
      if (existingVoiceIndex >= 0) {
        // Mono synth: reuse existing voice entry, just update the note
        voices[existingVoiceIndex].note = note;
      } else {
        // Create new voice entry
        const voice = this.createVoice(channelIndex, voiceNode, note, config);
        if (!isDevilboxSynth(voiceNode)) {
          voiceNode.connect(voice.nodes.gain);
        }
        // DevilboxSynths: audio flows via buildInstrumentEffectChain → masterInput
        voices.push(voice);
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
            // Warn if period-based playback is enabled but no period provided
            console.warn('[ToneEngine] MOD/XM sample expects period but none provided');
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
                  volume: Tone.gainToDb(velocity) + (config.volume || -12),
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
                  volume: Tone.gainToDb(velocity) + (config.volume || -12),
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
      } else if (config.synthType === 'DrumMachine') {
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
          if (instrument.state === 'started') {
            instrument.stop(now);
          }
        } else if (instrument instanceof JC303Synth) {
          // TB303 has its own release method
          instrument.releaseAll();
        } else if ((instrument as any).releaseAll) {
          // Synths and Samplers use releaseAll()
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

    // Also clear pitch state and active player tracking for all channels
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
    // Cancel all pending release-restore timeouts to prevent them from
    // firing on new instruments and restoring wrong volume values
    this.releaseRestoreTimeouts.forEach((timeout) => clearTimeout(timeout));
    this.releaseRestoreTimeouts.clear();
    this.instrumentOutputOverrides.clear();

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
   * Update WAM parameters in real-time
   */
  public updateWAMParameters(instrumentId: number, wamConfig: NonNullable<InstrumentConfig['wam']>): void {
    const synths: WAMSynth[] = [];
    this.instruments.forEach((instrument, key) => {
      if (this.instrumentIdFromKey(key) === instrumentId && instrument instanceof WAMSynth) {
        synths.push(instrument);
      }
    });

    if (synths.length === 0) {
      this.invalidateInstrument(instrumentId);
      return;
    }

    synths.forEach((synth) => {
      // Handle individual parameter updates (from fallback UI)
      if (wamConfig.parameterValues) {
        Object.entries(wamConfig.parameterValues).forEach(([id, value]) => {
          synth.setParameter(id, value);
        });
      }
      // Handle full state replacement
      if (wamConfig.pluginState) {
        synth.setPluginState(wamConfig.pluginState);
      }
    });
  }

  /**
   * Update TB303 parameters in real-time without recreating the synth
   * Supports both JC303Synth (TB303) and BuzzmachineGenerator (Buzz3o3)
   */
  public updateTB303Parameters(instrumentId: number, tb303Config: NonNullable<InstrumentConfig['tb303']>): void {
    // Find all DB303Synth instances for this instrument
    const synths: DB303Synth[] = [];
    this.instruments.forEach((instrument, key) => {
      if (this.instrumentIdFromKey(key) === instrumentId && instrument instanceof DB303Synth) {
        synths.push(instrument);
      }
    });

    if (synths.length === 0) {
      // No instances yet - instrument will be created with correct config on next note
      this.invalidateInstrument(instrumentId);
      return;
    }

    // Delegate directly to DB303Synth — it owns its own parameter mapping.
    // All config values are already 0-1 normalized from the UI knobs.
    synths.forEach((synth) => synth.applyConfig(tb303Config));
  }

  /**
   * Update Furnace instrument parameters in real-time
   * Re-encodes the instrument config to binary format and re-uploads to WASM
   */
  public updateFurnaceInstrument(instrumentId: number, config: InstrumentConfig): void {
    if (!config.furnace || !config.synthType?.startsWith('Furnace')) {
      console.warn('[ToneEngine] updateFurnaceInstrument called on non-Furnace instrument');
      return;
    }

    // Find all FurnaceDispatchSynth instances for this instrument
    const synths: Array<{ uploadInstrumentData: (data: Uint8Array) => void }> = [];
    this.instruments.forEach((instrument, key) => {
      if (this.instrumentIdFromKey(key) === instrumentId && (instrument as unknown as { uploadInstrumentData?: unknown }).uploadInstrumentData) {
        synths.push(instrument as unknown as { uploadInstrumentData: (data: Uint8Array) => void });
      }
    });

    if (synths.length === 0) {
      // No instances yet - instrument will be created with correct config on next note
      this.invalidateInstrument(instrumentId);
      return;
    }

    // Dynamically import the encoder (code-split to reduce main bundle)
    import('@lib/export/FurnaceInstrumentEncoder').then(({ updateFurnaceInstrument }) => {
      const furnaceIndex = config.furnace!.furnaceIndex ?? 0;
      const binaryData = updateFurnaceInstrument(config.furnace!, config.name, furnaceIndex);
      
      // Update all synth instances
      synths.forEach((synth) => {
        synth.uploadInstrumentData(binaryData);
      });
      
    }).catch(err => {
      console.error('[ToneEngine] Failed to encode Furnace instrument:', err);
    });
  }

  /**
   * Update HarmonicSynth parameters in real-time without recreating the synth
   */
  public updateHarmonicSynthParameters(instrumentId: number, harmonicConfig: NonNullable<InstrumentConfig['harmonicSynth']>): void {
    const synths: Array<{ applyConfig: (config: typeof harmonicConfig) => void }> = [];
    this.instruments.forEach((instrument, key) => {
      if (this.instrumentIdFromKey(key) === instrumentId && (instrument as unknown as { applyConfig?: unknown }).applyConfig) {
        synths.push(instrument as unknown as { applyConfig: (config: typeof harmonicConfig) => void });
      }
    });

    if (synths.length === 0) {
      // No instances yet - instrument will be created with correct config on next note
      this.invalidateInstrument(instrumentId);
      return;
    }

    // Apply config to all active instances
    synths.forEach((synth) => synth.applyConfig(harmonicConfig));
  }

  /**
   * Get the WASM handle for a MAME synth instance
   */
  public getMAMESynthHandle(instrumentId: number): number {
    const key = this.getInstrumentKey(instrumentId, -1);
    const instrument = this.instruments.get(key);
    if (instrument instanceof MAMESynth) {
      return (instrument as unknown as { getHandle: () => number }).getHandle();
    }
    return 0;
  }

  /**
   * Get a MAME chip synth instance (extends MAMEBaseSynth)
   * Used for accessing oscilloscope data and macro controls
   */
  public getMAMEChipSynth(instrumentId: number): MAMEBaseSynth | null {
    const key = this.getInstrumentKey(instrumentId, -1);
    const instrument = this.instruments.get(key);
    if (instrument instanceof MAMEBaseSynth) {
      return instrument;
    }
    // Also check channel-specific keys
    for (const [k, inst] of this.instruments) {
      if ((k >> 16) === instrumentId && inst instanceof MAMEBaseSynth) {
        return inst;
      }
    }
    return null;
  }

  /**
   * Update MAME parameters in real-time
   */
  public updateMAMEParameters(instrumentId: number, config: Partial<import('@typedefs/instrument').MAMEConfig>): void {
    const key = this.getInstrumentKey(instrumentId, -1);
    const instrument = this.instruments.get(key);
    if (instrument instanceof MAMESynth) {
      // MAMESynth instances are typically updated via register writes
      // Apply global config changes like clock if provided
      void config; // Reserved for future per-register update support
    }
  }

  /**
   * Update a parameter on a MAME chip synth instrument in real-time.
   * @param instrumentId - The instrument ID
   * @param key - Parameter key (e.g. 'vibrato_speed', 'algorithm')
   * @param value - Parameter value
   */
  public updateMAMEChipParam(instrumentId: number, key: string, value: number): void {
    const instrumentKey = this.getInstrumentKey(instrumentId, -1);
    const instrument = this.instruments.get(instrumentKey);
    if (!instrument) return;
    const inst = instrument as unknown as { setParam?: (key: string, value: number) => void };
    if (typeof inst.setParam === 'function') {
      inst.setParam(key, value);
    }
  }

  /**
   * Load a built-in WASM preset on a MAME chip synth instrument.
   * @param instrumentId - The instrument ID
   * @param program - Preset program number
   */
  public loadMAMEChipPreset(instrumentId: number, program: number): void {
    const instrumentKey = this.getInstrumentKey(instrumentId, -1);
    const instrument = this.instruments.get(instrumentKey);
    if (!instrument) return;
    const inst = instrument as unknown as { loadPreset?: (program: number) => void };
    if (typeof inst.loadPreset === 'function') {
      inst.loadPreset(program);
    }
  }

  /**
   * Update a text parameter on a MAME chip synth instrument (e.g. speech text).
   */
  public updateMAMEChipTextParam(instrumentId: number, key: string, value: string): void {
    const instrumentKey = this.getInstrumentKey(instrumentId, -1);
    const instrument = this.instruments.get(instrumentKey);
    if (!instrument) return;
    const inst = instrument as unknown as { setTextParam?: (key: string, value: string) => void; applyConfig?: (config: Record<string, string>) => void };
    if (typeof inst.setTextParam === 'function') {
      inst.setTextParam(key, value);
    } else if (typeof inst.applyConfig === 'function') {
      inst.applyConfig({ [key]: value });
    }
  }

  /**
   * Trigger text-to-speech on a MAME speech chip synth.
   * Lazily creates the instrument if it hasn't been preloaded into the engine yet.
   */
  public async speakMAMEChipText(instrumentId: number, text: string): Promise<void> {
    const instrumentKey = this.getInstrumentKey(instrumentId, -1);
    let instrument = this.instruments.get(instrumentKey);

    // If instrument not in engine map, create it on-demand from the instrument store
    if (!instrument) {
      try {
        const { useInstrumentStore } = await import('../stores/useInstrumentStore');
        const config = useInstrumentStore.getState().instruments.find(
          (i: InstrumentConfig) => i.id === instrumentId
        );
        if (config) {
          instrument = this.getInstrument(instrumentId, config) ?? undefined;
          // Wait for WASM synth to initialize (ensures worklet is ready before speakText)
          if (instrument && typeof (instrument as any).ensureInitialized === 'function') {
            await (instrument as any).ensureInitialized();
          }
          // Also wait for async effect chain to connect (buildInstrumentEffectChain is fire-and-forget in getInstrument)
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      } catch (_err) {
        console.warn('[ToneEngine] speakMAMEChipText: failed to lazy-create instrument:', _err);
      }
    }

    if (!instrument) {
      console.warn(`[ToneEngine] speakMAMEChipText: no instrument config found for id=${instrumentId}`);
      return;
    }

    const synth = instrument as unknown as { speakText?: (text: string) => void; _isReady?: boolean; workletNode?: unknown };
    if (typeof synth.speakText === 'function') {
      synth.speakText(text);
    } else {
      console.warn(`[ToneEngine] speakMAMEChipText: instrument key="${instrumentKey}" has no speakText method`);
    }
  }

  /**
   * Load ROM data into a synth that requires external ROM files.
   * Dispatches to the appropriate ROM loading method based on synthType.
   */
  public loadSynthROM(instrumentId: number, synthType: string, bank: number, data: Uint8Array): void {
    const instrumentKey = this.getInstrumentKey(instrumentId, -1);
    const instrument = this.instruments.get(instrumentKey);
    if (!instrument) return;

    const synth = instrument as unknown as { loadROM?: (bank: number, data: Uint8Array) => void; loadWaveROM?: (buffer: ArrayBuffer) => void; setRom?: (bank: number, data: Uint8Array) => void };

    if (synthType === 'MAMERSA') {
      // RdPianoSynth / D50Synth: loadROM(romId, data)
      if (typeof synth.loadROM === 'function') {
        synth.loadROM(bank, data);
      }
    } else if (synthType === 'MAMESWP30') {
      // MU2000Synth: loadWaveROM(data) - single ROM bank
      if (typeof synth.loadWaveROM === 'function') {
        synth.loadWaveROM(data.buffer as ArrayBuffer);
      }
    } else {
      // Generic fallback: try loadROM, then setRom
      if (typeof synth.loadROM === 'function') {
        synth.loadROM(bank, data);
      } else if (typeof synth.setRom === 'function') {
        synth.setRom(bank, data);
      }
    }
  }

  /**
   * Update Dub Siren parameters in real-time
   */
  public updateDubSirenParameters(instrumentId: number, config: NonNullable<InstrumentConfig['dubSiren']>): void {
    let found = false;
    this.instruments.forEach((instrument, key) => {
      if (this.instrumentIdFromKey(key) === instrumentId) {
        // Use feature detection for more reliable check across HMR/bundling
        if (instrument && typeof (instrument as unknown as { applyConfig?: unknown }).applyConfig === 'function') {
          (instrument as unknown as { applyConfig: (config: unknown) => void }).applyConfig(config);
          found = true;
        }
      }
    });
    if (!found) {
      console.warn(`[ToneEngine] No DubSiren synth found to update for instrument ${instrumentId}`);
    }
  }

  /**
   * Update Space Laser parameters in real-time
   */
  public updateSpaceLaserParameters(instrumentId: number, config: NonNullable<InstrumentConfig['spaceLaser']>): void {
    this.instruments.forEach((instrument, key) => {
      if (this.instrumentIdFromKey(key) === instrumentId) {
        if (instrument && typeof (instrument as unknown as { applyConfig?: unknown }).applyConfig === 'function') {
          (instrument as unknown as { applyConfig: (config: unknown) => void }).applyConfig(config);
        }
      }
    });
  }

  /**
   * Update V2 parameters in real-time
   */
  public updateV2Parameters(instrumentId: number, config: NonNullable<InstrumentConfig['v2']>): void {
    this.instruments.forEach((instrument, key) => {
      if (this.instrumentIdFromKey(key) === instrumentId) {
        if (instrument && (instrument as unknown as { name?: string }).name === 'V2Synth') {
          const v2 = instrument as unknown as { setParameter: (index: number, value: number) => void };
          
          // Ground Truth Mapping from V2 v2defs.cpp / Params[]
          
          // Osc 1 (indices 2-7)
          if (config.osc1) {
            v2.setParameter(2, config.osc1.mode);
            v2.setParameter(4, config.osc1.transpose + 64);
            v2.setParameter(5, config.osc1.detune + 64);
            v2.setParameter(6, config.osc1.color);
            v2.setParameter(7, config.osc1.level);
          }
          
          // Osc 2 (indices 8-13)
          if (config.osc2) {
            v2.setParameter(8, config.osc2.mode);
            v2.setParameter(9, config.osc2.ringMod ? 1 : 0);
            v2.setParameter(10, config.osc2.transpose + 64);
            v2.setParameter(11, config.osc2.detune + 64);
            v2.setParameter(12, config.osc2.color);
            v2.setParameter(13, config.osc2.level);
          }

          // Osc 3 (indices 14-19)
          if (config.osc3) {
            v2.setParameter(14, config.osc3.mode);
            v2.setParameter(15, config.osc3.ringMod ? 1 : 0);
            v2.setParameter(16, config.osc3.transpose + 64);
            v2.setParameter(17, config.osc3.detune + 64);
            v2.setParameter(18, config.osc3.color);
            v2.setParameter(19, config.osc3.level);
          }

          // Filter 1 (indices 20-22)
          if (config.filter1) {
            v2.setParameter(20, config.filter1.mode);
            v2.setParameter(21, config.filter1.cutoff);
            v2.setParameter(22, config.filter1.resonance);
          }

          // Filter 2 (indices 23-25)
          if (config.filter2) {
            v2.setParameter(23, config.filter2.mode);
            v2.setParameter(24, config.filter2.cutoff);
            v2.setParameter(25, config.filter2.resonance);
          }

          // Routing (indices 26-27)
          if (config.routing) {
            v2.setParameter(26, config.routing.mode);
            v2.setParameter(27, config.routing.balance);
          }

          // Amp Envelope (indices 32-37: Attack, Decay, Sustain, SusTime, Release, Amplify)
          if (config.envelope) {
            v2.setParameter(32, config.envelope.attack);
            v2.setParameter(33, config.envelope.decay);
            v2.setParameter(34, config.envelope.sustain);
            v2.setParameter(36, config.envelope.release);
          }

          // Envelope 2 (indices 38-43: Attack, Decay, Sustain, SusTime, Release, Amplify)
          if (config.envelope2) {
            v2.setParameter(38, config.envelope2.attack);
            v2.setParameter(39, config.envelope2.decay);
            v2.setParameter(40, config.envelope2.sustain);
            v2.setParameter(42, config.envelope2.release);
          }

          // LFO 1 (indices 44-50: Mode, KeySync, EnvMode, Rate, Phase, Polarity, Amplify)
          if (config.lfo1) {
            v2.setParameter(47, config.lfo1.rate);
            v2.setParameter(50, config.lfo1.depth);
          }
        }
      }
    });
  }

  /**
   * Update Synare parameters in real-time
   */
  public updateSynareParameters(instrumentId: number, config: NonNullable<InstrumentConfig['synare']>): void {
    this.instruments.forEach((instrument, key) => {
      if (this.instrumentIdFromKey(key) === instrumentId) {
        if (instrument && typeof (instrument as unknown as { applyConfig?: unknown }).applyConfig === 'function') {
          (instrument as unknown as { applyConfig: (config: unknown) => void }).applyConfig(config);
        }
      }
    });
  }

  /**
   * Update Furnace parameters in real-time
   */
  public updateFurnaceParameters(instrumentId: number, config: NonNullable<InstrumentConfig['furnace']>): void {
    void config; // Reserved for future direct parameter update support
    this.instruments.forEach((instrument, key) => {
      if (this.instrumentIdFromKey(key) === instrumentId) {
        if (instrument && typeof (instrument as unknown as { updateParameters?: unknown }).updateParameters === 'function') {
          (instrument as unknown as { updateParameters: () => void }).updateParameters();
        }
      }
    });
  }

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
    const x = (param >> 4) & 0x0F;
    const y = param & 0x0F;
    const chipType = synth.getChipType();

    // Standard effects (all platforms)
    switch (effect) {
      case 0x08: // Panning
        synth.writePanRegister(param);
        return;
    }

    // Platform-specific effect routing
    if (this.isFMChip(chipType)) {
      this.applyFMEffect(synth, effect, param, x, y);
    } else if (this.isPSGChip(chipType)) {
      this.applyPSGEffect(synth, effect, param, chipType);
    } else if (this.isWavetableChip(chipType)) {
      this.applyWavetableEffect(synth, effect, param, chipType);
    } else if (this.isC64Chip(chipType)) {
      this.applyC64Effect(synth, effect, param);
    }
  }

  /** Check if chip is FM-based */
  private isFMChip(chipType: number): boolean {
    return ([
      FurnaceChipType.OPN2, FurnaceChipType.OPM, FurnaceChipType.OPL3,
      FurnaceChipType.OPLL, FurnaceChipType.OPNA, FurnaceChipType.OPNB,
      FurnaceChipType.OPZ, FurnaceChipType.Y8950, FurnaceChipType.OPL4,
      FurnaceChipType.OPN, FurnaceChipType.OPNB_B, FurnaceChipType.ESFM
    ] as number[]).includes(chipType);
  }

  /** Check if chip is PSG-based (square wave with duty/envelope) */
  private isPSGChip(chipType: number): boolean {
    return ([
      FurnaceChipType.NES, FurnaceChipType.GB, FurnaceChipType.PSG,
      FurnaceChipType.AY, FurnaceChipType.AY8930, FurnaceChipType.SAA,
      FurnaceChipType.VIC, FurnaceChipType.TED
    ] as number[]).includes(chipType);
  }

  /** Check if chip is wavetable-based */
  private isWavetableChip(chipType: number): boolean {
    return ([
      FurnaceChipType.PCE, FurnaceChipType.SCC, FurnaceChipType.SWAN,
      FurnaceChipType.N163, FurnaceChipType.NAMCO, FurnaceChipType.FDS,
      FurnaceChipType.BUBBLE, FurnaceChipType.X1_010, FurnaceChipType.SM8521
    ] as number[]).includes(chipType);
  }

  /** Check if chip is C64/SID-based */
  private isC64Chip(chipType: number): boolean {
    return ([
      FurnaceChipType.SID, FurnaceChipType.SID_6581, FurnaceChipType.SID_8580
    ] as number[]).includes(chipType);
  }

  /** Apply FM-specific effects */
  private applyFMEffect(synth: FurnaceSynth, effect: number, _param: number, x: number, y: number): void {
    switch (effect) {
      // 0x10 = LFO - not directly supported by FurnaceSynth register writes
      case 0x11: // 11xy - Set operator TL (x=op, y=value*8)
        synth.writeOperatorTL(x, y * 8);
        break;
      case 0x12: // 12xy - Set operator AR (x=op, y=value*2)
        synth.writeOperatorAR(x, y * 2);
        break;
      case 0x13: // 13xy - Set operator DR (x=op, y=value*2)
        synth.writeOperatorDR(x, y * 2);
        break;
      case 0x14: // 14xy - Set operator MULT (x=op, y=value)
        synth.writeOperatorMult(x, y);
        break;
      case 0x15: // 15xy - Set operator RR (x=op, y=value)
        synth.writeOperatorRR(x, y);
        break;
      case 0x16: // 16xy - Set operator SL (x=op, y=value)
        synth.writeOperatorSL(x, y);
        break;
      // 0x17 = DT, 0x18 = ALG/FB, 0x19 = FB - not directly supported
    }
  }

  /** Apply PSG-specific effects (NES, GB, AY, etc.) */
  private applyPSGEffect(synth: FurnaceSynth, effect: number, param: number, chipType: number): void {
    switch (chipType) {
      case FurnaceChipType.GB:
        // GB: 0x10 = sweep, 0x11 = wave select, 0x12 = length/duty
        if (effect === 0x11) {
          synth.writeWavetableSelect(param);
        } else if (effect === 0x12) {
          synth.writeDutyRegister(param & 0x03); // Lower 2 bits = duty
        }
        break;

      case FurnaceChipType.NES:
        // NES: 0x11 = length counter, 0x12 = duty/envelope
        if (effect === 0x12) {
          synth.writeDutyRegister((param >> 6) & 0x03); // Upper 2 bits = duty
        }
        break;

      case FurnaceChipType.AY:
      case FurnaceChipType.AY8930:
        // AY: 0x10 = envelope shape, 0x11-0x12 = envelope period
        // These are envelope effects, not duty - handled differently
        break;

      case FurnaceChipType.PSG:
        // SN76489: No programmable duty
        break;
    }
  }

  /** Apply wavetable-specific effects (PCE, SCC, N163, etc.) */
  private applyWavetableEffect(synth: FurnaceSynth, effect: number, param: number, chipType: number): void {
    switch (chipType) {
      case FurnaceChipType.PCE:
        // PCE: 0x10 = LFO mode, 0x11 = LFO speed, 0x12 = wave select
        if (effect === 0x12) {
          synth.writeWavetableSelect(param);
        }
        break;

      case FurnaceChipType.SCC:
        // SCC: 0x10 = wave select
        if (effect === 0x10) {
          synth.writeWavetableSelect(param);
        }
        break;

      case FurnaceChipType.N163:
        // N163: 0x10 = wave select, 0x11 = wave position, 0x12 = wave length
        if (effect === 0x10) {
          synth.writeWavetableSelect(param);
        }
        break;

      case FurnaceChipType.NAMCO:
        // Namco WSG: 0x10 = wave select
        if (effect === 0x10) {
          synth.writeWavetableSelect(param);
        }
        break;

      case FurnaceChipType.FDS:
        // FDS: 0x10-0x14 = modulation effects
        // Wave is set via instrument, not effects
        break;

      case FurnaceChipType.SWAN:
      case FurnaceChipType.SM8521:
      case FurnaceChipType.BUBBLE:
      case FurnaceChipType.X1_010:
        // Generic wavetable: 0x10 or 0x11 for wave select
        if (effect === 0x10 || effect === 0x11) {
          synth.writeWavetableSelect(param);
        }
        break;
    }
  }

  /** Apply C64/SID-specific effects */
  private applyC64Effect(synth: FurnaceSynth, effect: number, param: number): void {
    // C64: 0x10 = duty reset, 0x11 = cutoff, 0x12 = fine duty
    // Note: FurnaceSynth may not fully support C64 register writes
    // These would need specific register write methods in FurnaceSynth
    if (effect === 0x10 || effect === 0x12) {
      // Duty effects - would need C64-specific implementation
      synth.writeDutyRegister(param);
    }
  }

  /**
   * Update Dexed (DX7) parameters in real-time
   */
  public updateDexedParameters(instrumentId: number, config: NonNullable<InstrumentConfig['dexed']>): void {
    this.instruments.forEach((instrument, key) => {
      if (this.instrumentIdFromKey(key) === instrumentId) {
        if (instrument && typeof (instrument as unknown as { applyConfig?: unknown }).applyConfig === 'function') {
          (instrument as unknown as { applyConfig: (config: unknown) => void }).applyConfig(config);
        }
      }
    });
  }

  /**
   * Update OBXd (Oberheim) parameters in real-time
   */
  public updateOBXdParameters(instrumentId: number, config: NonNullable<InstrumentConfig['obxd']>): void {
    this.instruments.forEach((instrument, key) => {
      if (this.instrumentIdFromKey(key) === instrumentId) {
        if (instrument && typeof (instrument as unknown as { applyConfig?: unknown }).applyConfig === 'function') {
          (instrument as unknown as { applyConfig: (config: unknown) => void }).applyConfig(config);
        }
      }
    });
  }

  /**
   * Generic method to update complex synths that use the applyConfig pattern
   */
  public updateComplexSynthParameters(instrumentId: number, config: unknown): void {
    this.instruments.forEach((instrument, key) => {
      if (this.instrumentIdFromKey(key) === instrumentId) {
        if (instrument && typeof (instrument as unknown as { applyConfig?: unknown }).applyConfig === 'function') {
          (instrument as unknown as { applyConfig: (config: unknown) => void }).applyConfig(config);
        }
      }
    });
  }

  /**
   * Update standard Tone.js synth parameters in real-time (no instrument recreation)
   * Handles oscillator, envelope, filter, filterEnvelope changes with smooth ramping
   */
  public updateToneJsSynthInPlace(instrumentId: number, config: InstrumentConfig): void {
    const R = ToneEngine.EFFECT_RAMP_TIME;
    this.instruments.forEach((instrument, key) => {
      if (this.instrumentIdFromKey(key) !== instrumentId) return;
      const inst = instrument as any;

      // Update oscillator type (discrete, no ramp needed)
      if (config.oscillator?.type && inst.oscillator) {
        try {
          const type = config.oscillator.type === 'noise' ? 'sawtooth' : config.oscillator.type;
          inst.oscillator.type = type;
        } catch { /* PolySynth wraps oscillator differently */ }
      }
      // PolySynth: update via .set()
      if (instrument instanceof Tone.PolySynth && config.oscillator?.type) {
        try {
          const type = config.oscillator.type === 'noise' ? 'sawtooth' : config.oscillator.type;
          instrument.set({ oscillator: { type: type as Tone.ToneOscillatorType } } as any);
        } catch { /* ignore */ }
      }

      // Update envelope (with ramp for smooth transitions)
      if (config.envelope) {
        const env = config.envelope;
        try {
          if (instrument instanceof Tone.PolySynth) {
            instrument.set({
              envelope: {
                attack: (env.attack ?? 10) / 1000,
                decay: (env.decay ?? 200) / 1000,
                sustain: (env.sustain ?? 50) / 100,
                release: (env.release ?? 1000) / 1000,
              }
            });
          } else if (inst.envelope) {
            inst.envelope.attack = (env.attack ?? 10) / 1000;
            inst.envelope.decay = (env.decay ?? 200) / 1000;
            inst.envelope.sustain = (env.sustain ?? 50) / 100;
            inst.envelope.release = (env.release ?? 1000) / 1000;
          }
        } catch { /* ignore */ }
      }

      // Update filter (with ramp)
      if (config.filter && inst.filter) {
        try {
          if (config.filter.frequency !== undefined) {
            inst.filter.frequency.rampTo(config.filter.frequency, R);
          }
          if (config.filter.Q !== undefined) {
            inst.filter.Q.rampTo(config.filter.Q, R);
          }
          if (config.filter.type) {
            inst.filter.type = config.filter.type;
          }
        } catch { /* ignore */ }
      }

      // Update volume (with ramp)
      if (config.volume !== undefined && inst.volume) {
        try {
          inst.volume.rampTo(config.volume, R);
        } catch { /* ignore */ }
      }
    });
  }

  /**
   * Update Buzzmachine parameters in real-time
   */
  public updateBuzzmachineParameters(instrumentId: number, buzzmachine: NonNullable<InstrumentConfig['buzzmachine']>): void {
    this.instruments.forEach((instrument, key) => {
      if (this.instrumentIdFromKey(key) === instrumentId) {
        const inst = instrument as unknown as { setParameter?: (index: number, value: number) => void };
        if (instrument && typeof inst.setParameter === 'function') {
          Object.entries(buzzmachine.parameters).forEach(([index, value]) => {
            inst.setParameter!(Number(index), value);
          });
        }
      }
    });
  }

  /**
   * Update TB303 pedalboard/GuitarML configuration
   * Only call this when pedalboard config changes to avoid audio interruptions
   */
  public async updateTB303Pedalboard(instrumentId: number, pedalboard: NonNullable<InstrumentConfig['tb303']>['pedalboard']): Promise<void> {
    if (!pedalboard) return;

    // Find all channel instances of this instrument
    const synths: JC303Synth[] = [];
    this.instruments.forEach((instrument, key) => {
      if ((key >> 16) === instrumentId && (instrument instanceof JC303Synth)) {
        synths.push(instrument);
      }
    });

    if (synths.length === 0) {
      console.warn('[ToneEngine] Cannot update TB303 pedalboard - no TB303 instances found for instrument', instrumentId);
      return;
    }

    const hasNeuralEffect = pedalboard.enabled && pedalboard.chain.some((fx: { enabled: boolean; type: string }) => fx.enabled && fx.type === 'neural');

    // Update all instances
    for (const synth of synths) {
      if (hasNeuralEffect) {
        // Find first enabled neural effect
        const neuralEffect = pedalboard.chain.find((fx: { enabled: boolean; type: string }) => fx.enabled && fx.type === 'neural');
        const fx = neuralEffect as EffectConfig | undefined;
        if (fx && fx.neuralModelIndex !== undefined) {
          try {
            // Load GuitarML model and enable
            await synth.loadGuitarMLModel(fx.neuralModelIndex);
            await synth.setGuitarMLEnabled(true);

            // Set dry/wet mix if specified
            if (fx.parameters?.dryWet !== undefined) {
              synth.setGuitarMLMix(fx.parameters.dryWet as number);
            }
          } catch (err) {
            console.error('[ToneEngine] Failed to update GuitarML:', err);
          }
        }
      } else {
        // Disable GuitarML if no neural effects
        try {
          await synth.setGuitarMLEnabled(false);
        } catch (err) {
          console.error('[ToneEngine] Failed to disable GuitarML:', err);
        }
      }
    }
  }

  /**
   * Update ChipSynth arpeggio configuration in real-time
   * @param instrumentId - Instrument ID
   * @param arpeggioConfig - New arpeggio configuration
   */
  public updateChipSynthArpeggio(instrumentId: number, arpeggioConfig: NonNullable<InstrumentConfig['chipSynth']>['arpeggio']): void {
    if (!arpeggioConfig) return;

    // Find all channel instances of this instrument
    this.instruments.forEach((instrument, key) => {
      if ((key >> 16) === instrumentId && (instrument as any).updateArpeggio) {
        (instrument as any).updateArpeggio(arpeggioConfig);
      }
    });
  }

  /**
   * Get current arpeggio step for a ChipSynth instrument (for UI visualization)
   * @param instrumentId - Instrument ID
   * @returns Current step index or 0 if not found/playing
   */
  public getChipSynthArpeggioStep(instrumentId: number): number {
    // Find first channel instance with arpeggio engine
    for (const [key, instrument] of this.instruments.entries()) {
      if ((key >> 16) === instrumentId && (instrument as any).getCurrentArpeggioStep) {
        return (instrument as any).getCurrentArpeggioStep();
      }
    }
    return 0;
  }

  /**
   * Check if ChipSynth arpeggio is currently playing
   * @param instrumentId - Instrument ID
   * @returns True if arpeggio is actively playing
   */
  public isChipSynthArpeggioPlaying(instrumentId: number): boolean {
    // Find first channel instance with arpeggio engine
    for (const [key, instrument] of this.instruments.entries()) {
      if ((key >> 16) === instrumentId && (instrument as any).isArpeggioPlaying) {
        return (instrument as any).isArpeggioPlaying();
      }
    }
    return false;
  }

  // ============================================================================
  // METRONOME
  // ============================================================================

  /**
   * Initialize metronome synth (lazy initialization)
   */
  private initMetronome(): void {
    if (this.metronomeSynth) return;

    // Create a percussive click synth
    this.metronomeSynth = new Tone.MembraneSynth({
      pitchDecay: 0.008,
      octaves: 2,
      oscillator: { type: 'sine' },
      envelope: {
        attack: 0.001,
        decay: 0.1,
        sustain: 0,
        release: 0.1,
      },
    });

    // Create volume control for metronome
    this.metronomeVolume = new Tone.Gain(0.5);

    // Route through volume to master (bypassing master input to keep it separate)
    this.metronomeSynth.connect(this.metronomeVolume);
    this.metronomeVolume.connect(this.masterChannel);

  }

  /**
   * Set metronome enabled state
   */
  public setMetronomeEnabled(enabled: boolean): void {
    this.metronomeEnabled = enabled;
    if (enabled) {
      this.initMetronome();
    }
  }

  /**
   * Check if metronome is enabled
   */
  public isMetronomeEnabled(): boolean {
    return this.metronomeEnabled;
  }

  /**
   * Set metronome volume (0-100)
   */
  public setMetronomeVolume(volume: number): void {
    if (!this.metronomeVolume) {
      this.initMetronome();
    }
    // Convert 0-100 to gain (0-1)
    const gain = Math.max(0, Math.min(1, volume / 100));
    this.metronomeVolume?.set({ gain });
  }

  /**
   * Trigger a metronome click at precise time
   * @param time Transport time for the click
   * @param isDownbeat True for accented beat (beat 1), false for regular beat
   */
  public triggerMetronomeClick(time: number, isDownbeat: boolean = false): void {
    if (!this.metronomeEnabled || !this.metronomeSynth) return;

    // Use different pitch for downbeat vs regular beat
    const note = isDownbeat ? 'C5' : 'C4';
    const velocity = isDownbeat ? 0.8 : 0.5;

    this.metronomeSynth.triggerAttackRelease(note, '32n', time, velocity);
  }

  /**
   * Stop and dispose metronome part
   */
  public stopMetronome(): void {
    if (this.metronomePart) {
      this.metronomePart.stop();
      this.metronomePart.dispose();
      this.metronomePart = null;
    }
  }

  /**
   * Dispose metronome resources
   */
  private disposeMetronome(): void {
    this.stopMetronome();
    if (this.metronomeSynth) {
      this.metronomeSynth.dispose();
      this.metronomeSynth = null;
    }
    if (this.metronomeVolume) {
      this.metronomeVolume.dispose();
      this.metronomeVolume = null;
    }
  }

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
    this.synthBus.dispose();
    this.masterEffectsInput.dispose();
    this.blepInput.dispose();
    this.masterInput.dispose();
    this.masterChannel.dispose();

    ToneEngine.instance = null;
  }

  // ============================================================================
  // INSTRUMENT EFFECTS CHAIN MANAGEMENT
  // ============================================================================

  /**
   * Build or rebuild an instrument's effect chain (now async for neural effects)
   * Route: instrument → effects → masterInput
   * Supports both Tone.js ToneAudioNodes and native DevilboxSynths.
   * @param key - Composite key (instrumentId-channelIndex) for per-channel chains
   */
  private async buildInstrumentEffectChain(
    key: number,
    effects: EffectConfig[],
    instrument: Tone.ToneAudioNode | DevilboxSynth
  ): Promise<void> {
    // Dispose existing effect chain if any
    const existing = this.instrumentEffectChains.get(key);
    if (existing) {
      // Clean up per-node registry entries
      for (const [effectId, entry] of this.instrumentEffectNodes) {
        if (existing.effects.includes(entry.node)) {
          this.instrumentEffectNodes.delete(effectId);
        }
      }
      existing.effects.forEach((fx) => {
        try {
          fx.disconnect();
          fx.dispose();
        } catch {
          // Node may already be disposed
        }
      });
      if (existing.bridge) {
        try {
          existing.bridge.disconnect();
          existing.bridge.dispose();
        } catch {
          // Bridge may already be disposed
        }
      }
      existing.output.disconnect();
      existing.output.dispose();
    }

    // Create output gain node
    const output = new Tone.Gain(1);

    // Detect if this is a native DevilboxSynth (non-Tone.js) or a Tone.js node
    const isNativeSynth = isDevilboxSynth(instrument);

    // Helper: connect instrument to a Tone.js destination node
    const connectInstrumentTo = (dest: Tone.ToneAudioNode) => {
      if (isNativeSynth) {
        // Native AudioNode → Tone.js node bridge
        this.connectNativeSynth((instrument as DevilboxSynth).output, dest);
      } else {
        // Tone.js → Tone.js (existing path)
        (instrument as Tone.ToneAudioNode).connect(dest);
      }
    };

    // Filter to only enabled effects
    const enabledEffects = effects.filter((fx) => fx.enabled);

    if (enabledEffects.length === 0) {
      // No effects - direct connection
      connectInstrumentTo(output);

      // Determine destination: use instrument analyser if active, otherwise master input
      const instrumentId = key >>> 16;
      const activeAnalyser = this.instrumentAnalysers.get(instrumentId);

      if (activeAnalyser) {
        output.connect(activeAnalyser.input);
      } else {
        output.connect(this.getInstrumentOutputDestination(instrumentId, isNativeSynth));
      }

      this.instrumentEffectChains.set(key, { effects: [], output });
      return;
    }

    // Create effect nodes (async for neural effects)
    const effectNodes = (await Promise.all(
      enabledEffects.map((config) => InstrumentFactory.createEffect(config))
    )) as Tone.ToneAudioNode[];

    // Build full chain: instrument → [bridge?] → effect[0] → ... → effect[N-1] → output → destination
    let bridge: Tone.Gain | undefined;
    if (effectNodes.length > 0) {
      if (isNativeSynth) {
        // Native synths can't connect directly to Tone.js effects (CrossFade input).
        // Insert a Tone.Gain bridge whose .input IS a native GainNode.
        bridge = new Tone.Gain(1);
        connectInstrumentTo(bridge);
        bridge.connect(effectNodes[0] as Tone.ToneAudioNode);
      } else {
        (instrument as Tone.ToneAudioNode).connect(effectNodes[0] as Tone.ToneAudioNode);
      }
      // Chain effects together
      for (let i = 0; i < effectNodes.length - 1; i++) {
        (effectNodes[i] as Tone.ToneAudioNode).connect(effectNodes[i + 1] as Tone.ToneAudioNode);
      }
      // Connect last effect to output
      (effectNodes[effectNodes.length - 1] as Tone.ToneAudioNode).connect(output);
    } else {
      connectInstrumentTo(output);
    }

    // Determine destination: use instrument analyser if active, otherwise master input
    const instrumentId2 = key >>> 16;
    const activeAnalyser = this.instrumentAnalysers.get(instrumentId2);

    if (activeAnalyser) {
      output.connect(activeAnalyser.input);
    } else {
      output.connect(this.getInstrumentOutputDestination(instrumentId2, isNativeSynth));
    }

    this.instrumentEffectChains.set(key, { effects: effectNodes as Tone.ToneAudioNode[], output, bridge });

    // Register individual effect nodes for real-time parameter updates
    enabledEffects.forEach((config, i) => {
      this.instrumentEffectNodes.set(config.id, { node: effectNodes[i] as Tone.ToneAudioNode, config });
    });
  }

  /**
   * Rebuild an instrument's effect chain (public method for store to call, now async)
   */
  public async rebuildInstrumentEffects(instrumentId: number, effects: EffectConfig[]): Promise<void> {
    const key = this.getInstrumentKey(instrumentId, -1);
    const instrument = this.instruments.get(key);
    if (!instrument) {
      console.warn('[ToneEngine] Cannot rebuild effects - instrument not found:', instrumentId);
      return;
    }

    // Disconnect instrument from current chain
    try {
      if (isDevilboxSynth(instrument)) {
        // Native synth — disconnect the AudioNode output
        instrument.output.disconnect();
      } else {
        instrument.disconnect();
      }
    } catch {
      // May not be connected
    }

    // Build new effect chain (await for neural effects)
    await this.buildInstrumentEffectChain(key, effects, instrument);
  }

  /**
   * Override the output destination for an instrument's effect chain and voice routing.
   * Used by DJ mode to route audio through deck gain → EQ → filter → crossfader.
   * Must be called BEFORE the instrument is created/preloaded, as existing
   * effect chains are not re-routed.
   */
  public setInstrumentOutputOverride(instrumentId: number, destination: Tone.ToneAudioNode): void {
    this.instrumentOutputOverrides.set(instrumentId, destination);
  }

  public removeInstrumentOutputOverride(instrumentId: number): void {
    this.instrumentOutputOverrides.delete(instrumentId);
  }

  /**
   * Momentarily "throw" an instrument into an effect (e.g. Dub Delay Throw)
   * Ramps the wet level of a specific effect type in the instrument's chain
   */
  public throwInstrumentToEffect(
    instrumentId: number, 
    effectType: string, 
    wetAmount: number = 1.0, 
    durationMs: number = 0
  ): void {
    // Find the chain - for throws, we typically look at the base instrument chain (-1)
    // or iterate all channels if it's a live instrument
    const chains: Array<{ effects: Tone.ToneAudioNode[]; output: Tone.Gain }> = [];
    this.instrumentEffectChains.forEach((chain, chainKey) => {
      if ((chainKey >> 16) === instrumentId) {
        chains.push(chain);
      }
    });

    if (chains.length === 0) return;

    chains.forEach(chain => {
      // Find the target effect node in the chain
      const targetFx = chain.effects.find((fx) => (fx as unknown as { _fxType?: string })._fxType === effectType);

      if (targetFx && 'wet' in targetFx) {
        const wetParam = (targetFx as unknown as { wet: Tone.Param<"normalRange"> }).wet;
        const now = Tone.immediate();
        
        // Ramp up instantly (10ms)
        wetParam.cancelScheduledValues(now);
        wetParam.rampTo(wetAmount, 0.01, now);
        
        // If duration is provided, ramp back down after that time
        if (durationMs > 0) {
          wetParam.rampTo(0, 0.1, now + durationMs / 1000);
        }
      }
    });
  }

  /**
   * Dispose instrument effect chain
   */
  private disposeInstrumentEffectChain(key: number): void {
    const chain = this.instrumentEffectChains.get(key);
    if (chain) {
      chain.effects.forEach((fx) => {
        try {
          fx.dispose();
        } catch {
          // Node may already be disposed
        }
      });
      try {
        chain.output.dispose();
      } catch {
        // Node may already be disposed
      }
      this.instrumentEffectChains.delete(key);
    }
  }

  // ============================================================================
  // MASTER EFFECTS CHAIN MANAGEMENT
  // ============================================================================

  /**
   * Rebuild entire master effects chain from config array (now async for neural effects)
   * Called when effects are added, removed, or reordered
   */
  public async rebuildMasterEffects(effects: EffectConfig[]): Promise<void> {
    // Fast path: if only parameters changed (no add/remove/reorder), just update params
    if (this.canUseParameterUpdatePath(effects)) {
      this.updateEffectParameters(effects);
      return;
    }

    // Version guard: if another rebuild starts while we're async, abort this one
    const myVersion = ++this.masterEffectsRebuildVersion;
    // Debug log only (verbose in StrictMode due to double-invocation)
    // console.log('[ToneEngine] rebuildMasterEffects v' + myVersion + ', effects:', effects.map(e => `${e.type}(${e.id})`));

    // Deep clone effects to avoid Immer proxy revocation issues during async operations
    const effectsCopy = structuredClone(effects) as EffectConfig[];

    // Disconnect masterEffectsInput output (preserves upstream connections from amigaFilter & synthBus)
    this.masterEffectsInput.disconnect();
    this.masterEffectsNodes.forEach((node) => {
      try {
        node.disconnect();
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

    // Filter to only enabled effects
    const enabledEffects = effectsCopy.filter((fx) => fx.enabled);

    if (enabledEffects.length === 0) {
      // No effects - direct connection to BLEP input (which routes to masterChannel)
      this.masterEffectsInput.connect(this.blepInput);
      return;
    }

    // Ensure AudioContext is running before creating worklet-based effects (BitCrusher, etc.)
    if (Tone.getContext().state === 'suspended') {
      try { await Tone.start(); } catch { /* user gesture required */ }
    }

    // Check if a newer rebuild superseded us
    if (myVersion !== this.masterEffectsRebuildVersion) {
      // Debug: console.log('[ToneEngine] rebuildMasterEffects v' + myVersion + ' aborted (superseded by v' + this.masterEffectsRebuildVersion + ')');
      return;
    }

    // Create effect nodes individually — skip any that fail (e.g. worklet on suspended context)
    const successNodes: Tone.ToneAudioNode[] = [];
    const successConfigs: EffectConfig[] = [];
    for (const config of enabledEffects) {
      try {
        const node = await InstrumentFactory.createEffect(config) as Tone.ToneAudioNode;
        // Check again after each async operation
        if (myVersion !== this.masterEffectsRebuildVersion) {
          // Debug: console.log('[ToneEngine] rebuildMasterEffects v' + myVersion + ' aborted mid-create');
          // Dispose the node we just created since we're aborting
          try { node.disconnect(); node.dispose(); } catch { /* */ }
          // Dispose any previously created nodes in this batch
          successNodes.forEach(n => { try { n.disconnect(); n.dispose(); } catch { /* */ } });
          return;
        }
        successNodes.push(node);
        successConfigs.push(config);
      } catch (error) {
        console.warn(`[ToneEngine] Failed to create effect ${config.type}, skipping:`, error);
      }
    }

    // Final version check before connecting
    if (myVersion !== this.masterEffectsRebuildVersion) {
      // Debug: console.log('[ToneEngine] rebuildMasterEffects v' + myVersion + ' aborted before connect');
      successNodes.forEach(n => { try { n.disconnect(); n.dispose(); } catch { /* */ } });
      return;
    }

    if (successNodes.length === 0) {
      // All effects failed — direct connection to BLEP input
      this.masterEffectsInput.connect(this.blepInput);
      return;
    }

    // Store nodes and configs
    successNodes.forEach((node, index) => {
      this.masterEffectsNodes.push(node);
      this.masterEffectConfigs.set(successConfigs[index].id, { node, config: successConfigs[index] });
    });

    // Connect chain: masterEffectsInput → effects[0] → effects[n] → blepInput → [BLEP?] → masterChannel
    // Both tracker audio (via amigaFilter) and synth audio (via synthBus) feed masterEffectsInput
    this.masterEffectsInput.connect(this.masterEffectsNodes[0]);

    for (let i = 0; i < this.masterEffectsNodes.length - 1; i++) {
      this.masterEffectsNodes[i].connect(this.masterEffectsNodes[i + 1]);
    }

    this.masterEffectsNodes[this.masterEffectsNodes.length - 1].connect(this.blepInput);
    // Debug: Success
    // console.log('[ToneEngine] rebuildMasterEffects v' + myVersion + ' connected chain OK, nodes:',
    //   this.masterEffectsNodes.map(n => n?.name || n?.constructor?.name).join(' → '));

    // Create pre/post AnalyserNode taps for each effect (side-branch, non-destructive)
    const rawCtx = Tone.getContext().rawContext as AudioContext;
    for (let i = 0; i < successNodes.length; i++) {
      const config = successConfigs[i];

      const pre = rawCtx.createAnalyser();
      pre.fftSize = 2048;
      pre.smoothingTimeConstant = 0.8;

      const post = rawCtx.createAnalyser();
      post.fftSize = 2048;
      post.smoothingTimeConstant = 0.8;

      // Pre-tap: tap the signal feeding into effect[i]
      // For effect[0]: source is masterEffectsInput; for others: source is the OUTPUT of the previous effect
      const preSourceToneNode = i === 0
        ? this.masterEffectsInput
        : successNodes[i - 1];
      const preOutputNode = i === 0
        ? undefined
        : (successNodes[i - 1] as unknown as { output?: unknown }).output;
      const preNative = preOutputNode
        ? getNativeAudioNode(preOutputNode)
        : getNativeAudioNode(preSourceToneNode);
      if (preNative) {
        try { preNative.connect(pre); } catch (e) {
          // Non-fatal: analyser just won't show data for this effect
          console.debug('[ToneEngine] Pre-analyser tap failed for effect', config.id, e);
        }
      } else {
        // Some effect types don't expose their internal AudioNode — analyser won't display
        console.debug('[ToneEngine] Pre-analyser: could not get native node for effect', config.id);
      }

      // Post-tap: tap the output of effect[i]
      const postOutputNode = (successNodes[i] as unknown as { output?: unknown }).output;
      const postNative = postOutputNode
        ? getNativeAudioNode(postOutputNode)
        : getNativeAudioNode(successNodes[i]);
      if (postNative) {
        try { postNative.connect(post); } catch (e) {
          console.debug('[ToneEngine] Post-analyser tap failed for effect', config.id, e);
        }
      } else {
        console.debug('[ToneEngine] Post-analyser: could not get native node for effect', config.id);
      }

      this.masterEffectAnalysers.set(config.id, { pre, post });
    }

    // Sync playback state into freshly created noise-generating nodes
    this._notifyNoiseEffectsPlaying(this._isPlaying);
  }

  /**
   * Check if we can use the fast parameter update path (no structural changes).
   */
  private canUseParameterUpdatePath(newEffects: EffectConfig[]): boolean {
    // Filter to enabled effects (like rebuild does)
    const enabledNew = newEffects.filter((fx) => fx.enabled);
    const currentIds = Array.from(this.masterEffectConfigs.keys());

    // Different number of effects - need full rebuild
    if (enabledNew.length !== currentIds.length) {
      return false;
    }

    // Check if IDs and order match
    for (let i = 0; i < enabledNew.length; i++) {
      if (enabledNew[i].id !== currentIds[i]) {
        return false; // Order changed or different effect
      }

      const current = this.masterEffectConfigs.get(currentIds[i]);
      if (!current) return false;

      // Type changed - need rebuild
      if (enabledNew[i].type !== current.config.type) {
        return false;
      }
    }

    return true; // Only parameters changed - safe for fast path
  }

  /**
   * Update effect parameters without rebuilding the chain (fast path).
   */
  private updateEffectParameters(newEffects: EffectConfig[]): void {
    const enabledNew = newEffects.filter((fx) => fx.enabled);

    for (const newConfig of enabledNew) {
      const existing = this.masterEffectConfigs.get(newConfig.id);
      if (!existing) continue;

      // Update parameters on the existing node
      Object.entries(newConfig.parameters || {}).forEach(([key, value]) => {
        if (key in existing.node) {
          const nodeAny = existing.node as any;
          // Handle Tone.js Signal/Param types
          if (nodeAny[key]?.value !== undefined) {
            nodeAny[key].value = value;
          } else {
            nodeAny[key] = value;
          }
        }
      });

      // Update enabled state (bypass)
      if ('wet' in existing.node) {
        (existing.node as any).wet.value = newConfig.enabled ? 1 : 0;
      }

      // Update stored config
      existing.config = newConfig;
    }
  }

  /**
   * Get the audio node for a master effect by ID (used by WAM GUI rendering)
   */
  public getMasterEffectNode(effectId: string): Tone.ToneAudioNode | null {
    return this.masterEffectConfigs.get(effectId)?.node ?? null;
  }

  /**
   * Returns the pre/post AnalyserNodes for a master effect by ID.
   * Pre-analyser receives the signal before the effect; post receives after.
   * Returns null if the effect ID is not found (effect disabled or not yet built).
   */
  public getMasterEffectAnalysers(id: string): { pre: AnalyserNode; post: AnalyserNode } | null {
    return this.masterEffectAnalysers.get(id) ?? null;
  }

  /**
   * Update parameters for a single master effect
   * Called when effect parameters change (wet, specific params)
   */
  public updateMasterEffectParams(effectId: string, config: EffectConfig): void {
    const effectData = this.masterEffectConfigs.get(effectId);
    if (!effectData) {
      console.warn('[ToneEngine] Effect not found for update:', effectId, 'available:', [...this.masterEffectConfigs.keys()]);
      return;
    }

    const { node, config: prevConfig } = effectData;

    try {
      // Only update wet if it actually changed
      if (config.wet !== prevConfig.wet) {
        const wetValue = config.wet / 100;
        if ('wet' in node && node.wet instanceof Tone.Signal) {
          node.wet.rampTo(wetValue, 0.02);
        } else if ('wet' in node && typeof (node as Record<string, unknown>).wet === 'number') {
          // Custom WASM effects (MoogFilter, MVerb, Leslie, SpringReverb) use a plain setter
          (node as Record<string, unknown>).wet = wetValue;
        }
      }

      // Compute which parameters actually changed
      const changedParams: Record<string, number | string> = {};
      for (const [key, value] of Object.entries(config.parameters)) {
        if (prevConfig.parameters[key] !== value) {
          changedParams[key] = value;
        }
      }

      // Only apply effect params if something actually changed
      if (Object.keys(changedParams).length > 0) {
        this.applyEffectParametersDiff(node, config.type, changedParams);

        // If bpmSync or syncDivision changed, immediately recompute synced params
        if ('bpmSync' in changedParams || 'syncDivision' in changedParams) {
          const currentBpm = Tone.getTransport().bpm.value;
          this.updateBpmSyncedEffects(currentBpm).catch(() => {});
        }
      }

      // Update stored config
      effectData.config = config;

    } catch (error) {
      console.error('[ToneEngine] Failed to update effect params:', error);
    }
  }

  /**
   * Update parameters for a per-instrument effect in real-time
   */
  public updateInstrumentEffectParams(effectId: string, config: EffectConfig): void {
    const effectData = this.instrumentEffectNodes.get(effectId);
    if (!effectData) return; // Effect not in active chain

    const { node, config: prevConfig } = effectData;

    try {
      // Only update wet if it actually changed
      if (config.wet !== prevConfig.wet) {
        const wetValue = config.wet / 100;
        if ('wet' in node && node.wet instanceof Tone.Signal) {
          node.wet.rampTo(wetValue, 0.02);
        } else if ('wet' in node && typeof (node as Record<string, unknown>).wet === 'number') {
          (node as Record<string, unknown>).wet = wetValue;
        }
      }

      // Compute which parameters actually changed
      const changedParams: Record<string, number | string> = {};
      for (const [key, value] of Object.entries(config.parameters)) {
        if (prevConfig.parameters[key] !== value) {
          changedParams[key] = value;
        }
      }

      // Only apply effect params if something actually changed
      if (Object.keys(changedParams).length > 0) {
        this.applyEffectParametersDiff(node, config.type, changedParams);
      }

      effectData.config = config;
    } catch (error) {
      console.error('[ToneEngine] Failed to update instrument effect params:', error);
    }
  }

  // Smooth ramp time for effect parameter changes (20ms eliminates zipper noise)
  private static readonly EFFECT_RAMP_TIME = 0.02;

  /**
   * Apply only the changed parameters to an effect node (diff-based).
   * Avoids redundant parameter sets which cause clicks/zipper noise.
   */
  private applyEffectParametersDiff(
    node: Tone.ToneAudioNode,
    type: string,
    changed: Record<string, number | string>
  ): void {
    const R = ToneEngine.EFFECT_RAMP_TIME;

    switch (type) {
      case 'Distortion':
        if (node instanceof Tone.Distortion) {
          if ('drive' in changed) node.distortion = changed.drive as number;
          if ('oversample' in changed) node.oversample = changed.oversample as OverSampleType;
        }
        break;

      case 'Delay':
      case 'FeedbackDelay':
        if (node instanceof Tone.FeedbackDelay) {
          if ('time' in changed) node.delayTime.rampTo(changed.time as number, R);
          if ('feedback' in changed) node.feedback.rampTo(changed.feedback as number, R);
        }
        break;

      case 'Chorus':
        if (node instanceof Tone.Chorus) {
          if ('frequency' in changed) node.frequency.rampTo(changed.frequency as number, R);
          if ('depth' in changed) node.depth = changed.depth as number;
        }
        break;

      case 'Phaser':
        if (node instanceof Tone.Phaser) {
          if ('frequency' in changed) node.frequency.rampTo(changed.frequency as number, R);
          if ('octaves' in changed) node.octaves = changed.octaves as number;
          if ('baseFrequency' in changed) node.baseFrequency = Number(changed.baseFrequency);
          if ('Q' in changed) node.Q.rampTo(changed.Q as number, R);
        }
        break;

      case 'Tremolo':
        if (node instanceof Tone.Tremolo) {
          if ('frequency' in changed) node.frequency.rampTo(changed.frequency as number, R);
          if ('depth' in changed) node.depth.rampTo(changed.depth as number, R);
        }
        break;

      case 'Vibrato':
        if (node instanceof Tone.Vibrato) {
          if ('frequency' in changed) node.frequency.rampTo(changed.frequency as number, R);
          if ('depth' in changed) node.depth.rampTo(changed.depth as number, R);
        }
        break;

      case 'BitCrusher': {
        // BitCrusher is implemented as a Distortion with a staircase WaveShaper curve
        const crusherNode = node as unknown as {
          _isBitCrusher?: boolean;
          _bitsValue?: number;
          _shaper?: { setMap: (fn: (v: number) => number, len?: number) => void };
        };
        if (crusherNode._isBitCrusher && 'bits' in changed) {
          const newBits = Number(changed.bits) || 4;
          crusherNode._bitsValue = newBits;
          const step = Math.pow(0.5, newBits - 1);
          crusherNode._shaper?.setMap(
            (val: number) => step * Math.floor(val / step + 0.5), 4096
          );
        }
        break;
      }

      case 'PingPongDelay':
        if (node instanceof Tone.PingPongDelay) {
          if ('time' in changed) node.delayTime.rampTo(changed.time as number, R);
          if ('feedback' in changed) node.feedback.rampTo(changed.feedback as number, R);
        }
        break;

      case 'PitchShift':
        if (node instanceof Tone.PitchShift) {
          if ('pitch' in changed) node.pitch = changed.pitch as number;
        }
        break;

      case 'Compressor':
        if (node instanceof Tone.Compressor) {
          if ('threshold' in changed) node.threshold.rampTo(changed.threshold as number, R);
          if ('ratio' in changed) node.ratio.rampTo(changed.ratio as number, R);
          if ('attack' in changed) node.attack.rampTo(changed.attack as number, R);
          if ('release' in changed) node.release.rampTo(changed.release as number, R);
        }
        break;

      case 'EQ3':
        if (node instanceof Tone.EQ3) {
          if ('low' in changed) node.low.rampTo(changed.low as number, R);
          if ('mid' in changed) node.mid.rampTo(changed.mid as number, R);
          if ('high' in changed) node.high.rampTo(changed.high as number, R);
        }
        break;

      case 'Filter':
        if (node instanceof Tone.Filter) {
          if ('frequency' in changed) node.frequency.rampTo(changed.frequency as number, R);
          if ('Q' in changed) node.Q.rampTo(changed.Q as number, R);
          if ('type' in changed) node.type = changed.type as Tone.Filter['type'];
          if ('rolloff' in changed) node.rolloff = changed.rolloff as Tone.FilterRollOff;
          if ('gain' in changed) node.gain.rampTo(changed.gain as number, R);
        }
        break;

      case 'AutoFilter':
        if (node instanceof Tone.AutoFilter) {
          if ('frequency' in changed) node.frequency.rampTo(changed.frequency as number, R);
          if ('baseFrequency' in changed) node.baseFrequency = changed.baseFrequency as number;
          if ('octaves' in changed) node.octaves = changed.octaves as number;
        }
        break;

      case 'AutoPanner':
        if (node instanceof Tone.AutoPanner) {
          if ('frequency' in changed) node.frequency.rampTo(changed.frequency as number, R);
          if ('depth' in changed) node.depth.rampTo(changed.depth as number, R);
        }
        break;

      case 'StereoWidener':
        if (node instanceof Tone.StereoWidener) {
          if ('width' in changed) node.width.rampTo(Math.min(0.85, Number(changed.width)), R);
        }
        break;

      case 'SpaceyDelayer':
        if (node instanceof SpaceyDelayerEffect) {
          if ('firstTap' in changed) node.setFirstTap(Number(changed.firstTap));
          if ('tapSize' in changed) node.setTapSize(Number(changed.tapSize));
          if ('feedback' in changed) node.setFeedback(Number(changed.feedback));
          if ('multiTap' in changed) node.setMultiTap(Number(changed.multiTap));
          if ('tapeFilter' in changed) node.setTapeFilter(Number(changed.tapeFilter));
        }
        break;

      case 'RETapeEcho':
        if (node instanceof RETapeEchoEffect) {
          if ('mode' in changed) node.setMode(Number(changed.mode));
          if ('repeatRate' in changed) node.setRepeatRate(Number(changed.repeatRate));
          if ('intensity' in changed) node.setIntensity(Number(changed.intensity));
          if ('echoVolume' in changed) node.setEchoVolume(Number(changed.echoVolume));
          if ('wow' in changed) node.setWow(Number(changed.wow));
          if ('flutter' in changed) node.setFlutter(Number(changed.flutter));
          if ('dirt' in changed) node.setDirt(Number(changed.dirt));
          if ('inputBleed' in changed) node.setInputBleed(Number(changed.inputBleed));
          if ('loopAmount' in changed) node.setLoopAmount(Number(changed.loopAmount));
          if ('playheadFilter' in changed) node.setPlayheadFilter(Number(changed.playheadFilter));
        }
        break;

      case 'SpaceEcho':
        if (node instanceof SpaceEchoEffect) {
          if ('mode' in changed) node.setMode(Number(changed.mode));
          if ('rate' in changed) node.setRate(Number(changed.rate));
          if ('intensity' in changed) node.setIntensity(Number(changed.intensity));
          if ('echoVolume' in changed) node.setEchoVolume(Number(changed.echoVolume));
          if ('reverbVolume' in changed) node.setReverbVolume(Number(changed.reverbVolume));
          if ('bass' in changed) node.setBass(Number(changed.bass));
          if ('treble' in changed) node.setTreble(Number(changed.treble));
        }
        break;

      case 'BiPhase':
        if (node instanceof BiPhaseEffect) {
          const biPhase = node as unknown as { rateA: number; depthA: number; rateB: number; depthB: number; feedback: number };
          if ('rateA' in changed) biPhase.rateA = Number(changed.rateA);
          if ('depthA' in changed) biPhase.depthA = Number(changed.depthA);
          if ('rateB' in changed) biPhase.rateB = Number(changed.rateB);
          if ('depthB' in changed) biPhase.depthB = Number(changed.depthB);
          if ('feedback' in changed) biPhase.feedback = Number(changed.feedback);
        }
        break;

      case 'DubFilter':
        if (node instanceof DubFilterEffect) {
          if ('cutoff' in changed) node.setCutoff(Number(changed.cutoff));
          if ('resonance' in changed) node.setResonance(Number(changed.resonance));
          if ('gain' in changed) node.setGain(Number(changed.gain));
        }
        break;

      case 'MoogFilter':
        if (node instanceof MoogFilterEffect) {
          if ('cutoff' in changed) node.setCutoff(Number(changed.cutoff));
          if ('resonance' in changed) node.setResonance(Number(changed.resonance) / 100); // UI 0-100 → WASM 0-1
          if ('drive' in changed) node.setDrive(Number(changed.drive));
          if ('model' in changed) node.setModel(Number(changed.model) as MoogFilterModel);
          if ('filterMode' in changed) node.setFilterMode(Number(changed.filterMode) as MoogFilterMode);
        }
        break;

      case 'MVerb':
        if (node instanceof MVerbEffect) {
          if ('damping' in changed) node.setDamping(Number(changed.damping));
          if ('density' in changed) node.setDensity(Number(changed.density));
          if ('bandwidth' in changed) node.setBandwidth(Number(changed.bandwidth));
          if ('decay' in changed) node.setDecay(Number(changed.decay));
          if ('predelay' in changed) node.setPredelay(Number(changed.predelay));
          if ('size' in changed) node.setSize(Number(changed.size));
          if ('gain' in changed) node.setGain(Number(changed.gain));
          if ('mix' in changed) node.setMix(Number(changed.mix));
          if ('earlyMix' in changed) node.setEarlyMix(Number(changed.earlyMix));
        }
        break;

      case 'Leslie':
        if (node instanceof LeslieEffect) {
          if ('speed' in changed) node.setSpeed(Number(changed.speed));
          if ('hornRate' in changed) node.setHornRate(Number(changed.hornRate));
          if ('drumRate' in changed) node.setDrumRate(Number(changed.drumRate));
          if ('hornDepth' in changed) node.setHornDepth(Number(changed.hornDepth));
          if ('drumDepth' in changed) node.setDrumDepth(Number(changed.drumDepth));
          if ('doppler' in changed) node.setDoppler(Number(changed.doppler));
          if ('mix' in changed) node.setMix(Number(changed.mix));
          if ('width' in changed) node.setWidth(Number(changed.width));
          if ('acceleration' in changed) node.setAcceleration(Number(changed.acceleration));
        }
        break;

      case 'SpringReverb':
        if (node instanceof SpringReverbEffect) {
          if ('decay' in changed) node.setDecay(Number(changed.decay));
          if ('damping' in changed) node.setDamping(Number(changed.damping));
          if ('tension' in changed) node.setTension(Number(changed.tension));
          if ('mix' in changed) node.setSpringMix(Number(changed.mix));
          if ('drip' in changed) node.setDrip(Number(changed.drip));
          if ('diffusion' in changed) node.setDiffusion(Number(changed.diffusion));
        }
        break;

      case 'Reverb':
        if (node instanceof Tone.Reverb) {
          if ('decay' in changed) node.decay = changed.decay as number;
          if ('preDelay' in changed) node.preDelay = changed.preDelay as number;
        }
        break;

      case 'JCReverb':
        if (node instanceof Tone.JCReverb) {
          if ('roomSize' in changed) node.roomSize.rampTo(Math.min(0.9, Number(changed.roomSize)), R);
        }
        break;

      case 'SidechainCompressor':
        if (node instanceof SidechainCompressor) {
          if ('threshold' in changed) node.threshold = changed.threshold as number;
          if ('ratio' in changed) node.ratio = changed.ratio as number;
          if ('attack' in changed) node.attack = changed.attack as number;
          if ('release' in changed) node.release = changed.release as number;
          if ('knee' in changed) node.knee = changed.knee as number;
          if ('sidechainGain' in changed) node.sidechainGain = changed.sidechainGain as number;
        }
        break;

      case 'TapeSaturation':
        if (node instanceof TapeSaturation) {
          if ('drive' in changed) node.drive = (changed.drive as number) / 100; // UI 0-100 → internal 0-1
          if ('tone' in changed) node.tone = changed.tone as number;
        }
        break;

      case 'VinylNoise':
        if (node instanceof VinylNoiseEffect) {
          if ('hiss'            in changed) node.setHiss           (Number(changed.hiss)            / 100);
          if ('dust'            in changed) node.setDust           (Number(changed.dust)            / 100);
          if ('age'             in changed) node.setAge            (Number(changed.age)             / 100);
          if ('speed'           in changed) node.setSpeed          (Number(changed.speed)           / 100);
          if ('riaa'            in changed) node.setRiaa           (Number(changed.riaa)            / 100);
          if ('stylusResonance' in changed) node.setStylusResonance(Number(changed.stylusResonance) / 100);
          if ('wornStylus'      in changed) node.setWornStylus     (Number(changed.wornStylus)      / 100);
          if ('pinch'           in changed) node.setPinch          (Number(changed.pinch)           / 100);
          if ('innerGroove'     in changed) node.setInnerGroove    (Number(changed.innerGroove)     / 100);
          if ('ghostEcho'       in changed) node.setGhostEcho      (Number(changed.ghostEcho)       / 100);
          if ('dropout'         in changed) node.setDropout        (Number(changed.dropout)         / 100);
          if ('warp'            in changed) node.setWarp           (Number(changed.warp)            / 100);
          if ('eccentricity'    in changed) node.setEccentricity   (Number(changed.eccentricity)    / 100);
        }
        break;

      case 'Tumult':
        if (node instanceof TumultEffect) {
          for (const key of Object.keys(changed)) {
            node.setParam(key as keyof TumultOptions, Number(changed[key]));
          }
        }
        break;

      case 'TapeSimulator':
        if (node instanceof TapeSimulatorEffect) {
          if ('drive'     in changed) node.setDrive    (Number(changed.drive)     / 100);
          if ('character' in changed) node.setCharacter(Number(changed.character) / 100);
          if ('bias'      in changed) node.setBias     (Number(changed.bias)      / 100);
          if ('shame'     in changed) node.setShame    (Number(changed.shame)     / 100);
          if ('hiss'      in changed) node.setHiss     (Number(changed.hiss)      / 100);
          if ('speed'     in changed) node.setSpeed    (Number(changed.speed)); // 0|1 integer, not /100
        }
        break;

      case 'ToneArm':
        if (node instanceof ToneArmEffect) {
          if ('wow'     in changed) node.setWow    (Number(changed.wow)     / 100);
          if ('coil'    in changed) node.setCoil   (Number(changed.coil)    / 100);
          if ('flutter' in changed) node.setFlutter(Number(changed.flutter) / 100);
          if ('riaa'    in changed) node.setRiaa   (Number(changed.riaa)    / 100);
          if ('stylus'  in changed) node.setStylus (Number(changed.stylus)  / 100);
          if ('hiss'    in changed) node.setHiss   (Number(changed.hiss)    / 100);
          if ('pops'    in changed) node.setPops   (Number(changed.pops)    / 100);
          if ('rpm'     in changed) node.setRpm    (Number(changed.rpm)); // raw value, not /100
        }
        break;

      case 'AutoWah':
        if (node instanceof Tone.AutoWah) {
          if ('baseFrequency' in changed) node.baseFrequency = changed.baseFrequency as number;
          if ('octaves' in changed) node.octaves = changed.octaves as number;
          if ('sensitivity' in changed) node.sensitivity = changed.sensitivity as number;
          if ('Q' in changed) node.Q.rampTo(changed.Q as number, R);
          if ('gain' in changed) node.gain.rampTo(changed.gain as number, R);
          if ('follower' in changed) node.follower = changed.follower as number;
        }
        break;

      case 'Chebyshev':
        if (node instanceof Tone.Chebyshev) {
          if ('order' in changed) node.order = changed.order as number;
          if ('oversample' in changed) node.oversample = changed.oversample as OverSampleType;
        }
        break;

      case 'FrequencyShifter':
        if (node instanceof Tone.FrequencyShifter) {
          if ('frequency' in changed) node.frequency.rampTo(changed.frequency as number, R);
        }
        break;

      // WAM 2.0 effects
      case 'WAMBigMuff':
      case 'WAMTS9':
      case 'WAMDistoMachine':
      case 'WAMQuadraFuzz':
      case 'WAMVoxAmp':
      case 'WAMStonePhaser':
      case 'WAMPingPongDelay':
      case 'WAMFaustDelay':
      case 'WAMPitchShifter':
      case 'WAMGraphicEQ':
      case 'WAMPedalboard':
        if (node instanceof WAMEffectNode) {
          for (const [key, value] of Object.entries(changed)) {
            if (key === 'bpmSync' || key === 'syncDivision') continue;
            node.setParameter(key, Number(value));
          }
        }
        break;

      case 'Neural':
        if (node instanceof NeuralEffectWrapper) {
          for (const [key, value] of Object.entries(changed)) {
            node.setParameter(key, Number(value));
          }
        }
        break;
    }
  }

  /**
   * Update all BPM-synced effects (master + per-instrument) when BPM changes.
   * Recalculates timing values in-place — no chain rebuild needed.
   */
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
    // Lazy-import to avoid circular: useInstrumentStore -> ToneEngine -> useInstrumentStore
    try {
      const { useInstrumentStore } = await import('../stores/useInstrumentStore');
      const instruments = useInstrumentStore.getState().instruments;

      this.instrumentEffectChains.forEach((chain, key) => {
        // key format: numeric composite (instrumentId << 16 | channelIndex)
        const instrumentId = key >> 16;
        const instrument = instruments.find((inst: { id: number }) => inst.id === instrumentId);
        if (!instrument?.effects) return;

        const enabledEffects = instrument.effects.filter((fx: EffectConfig) => fx.enabled);

        // Match chain nodes to enabled configs by index
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

  /**
   * Apply a single BPM-synced parameter value to an effect node.
   * Routes via the correct setter per effect type.
   */
  private applyBpmSyncedParam(
    node: Tone.ToneAudioNode,
    effectType: string,
    paramKey: string,
    value: number,
  ): void {
    try {
      switch (effectType) {
        case 'Delay':
        case 'FeedbackDelay':
          if (paramKey === 'time' && node instanceof Tone.FeedbackDelay) {
            node.delayTime.rampTo(value, 0.02);
          }
          break;
        case 'PingPongDelay':
          if (paramKey === 'time' && node instanceof Tone.PingPongDelay) {
            node.delayTime.rampTo(value, 0.02);
          }
          break;
        case 'SpaceEcho':
          if (paramKey === 'rate' && node instanceof SpaceEchoEffect) {
            node.setRate(value);
          }
          break;
        case 'SpaceyDelayer':
          if (paramKey === 'firstTap' && node instanceof SpaceyDelayerEffect) {
            node.setFirstTap(value);
          }
          break;
        case 'RETapeEcho':
          if (paramKey === 'repeatRate' && node instanceof RETapeEchoEffect) {
            node.setRepeatRate(value);
          }
          break;
        case 'Chorus':
          if (paramKey === 'frequency' && node instanceof Tone.Chorus) {
            node.frequency.rampTo(value, 0.02);
          }
          break;
        case 'BiPhase':
          if (paramKey === 'rateA' && node instanceof BiPhaseEffect) {
            (node as unknown as { rateA: number }).rateA = value;
          }
          break;
      }
    } catch (error) {
      console.warn('[ToneEngine] Failed to apply BPM-synced param:', effectType, paramKey, error);
    }
  }

  // ============================================================================
  // PER-CHANNEL ROUTING (VOLUME, PAN, MUTE/SOLO)
  // ============================================================================

  /**
   * Get or create a channel's audio chain
   * Route: [Voices] → channelInput → channel (volume/pan) → masterInput
   */
  public getChannelOutput(channelIndex: number): Tone.Gain {
    if (!this.channelOutputs.has(channelIndex)) {
      // Create channel audio chain with metering
      const input = new Tone.Gain(1);
      const channel = new Tone.Channel({ volume: 0, pan: 0 });
      const meter = new Tone.Meter({ smoothing: 0.8 });

      // Connect: input → channel → meter → masterInput
      input.connect(channel);
      channel.connect(meter);
      channel.connect(this.masterInput);

      this.channelOutputs.set(channelIndex, {
        input,
        channel,
        meter,
      });
    }

    return this.channelOutputs.get(channelIndex)!.input;
  }

  /**
   * Create a new voice chain for a note
   */
  private createVoice(channelIndex: number, instrument: Tone.ToneAudioNode | DevilboxSynth, note: string, config: InstrumentConfig): VoiceState {
    const channelOutput = this.channelOutputs.get(channelIndex);
    if (!channelOutput) throw new Error(`Channel ${channelIndex} not initialized`);

    const gain = new Tone.Gain(1);
    
    // Hardware Quirk: Use IT-specific high-fidelity filter for IT modules
    let filter: Tone.Filter | AudioWorkletNode;
    const isIT = config.metadata?.importedFrom === 'IT';
    
    if (isIT && ToneEngine.itFilterWorkletLoaded) {
      // Use native AudioWorkletNode directly (matches FurnaceDispatch fix)
      const nCtx = this._nativeContext!;
      filter = new AudioWorkletNode(nCtx, 'it-filter-processor');
    } else {
      filter = new Tone.Filter({
        type: 'lowpass',
        frequency: 20000,
        Q: 0,
        rolloff: -12,
      });
    }
    
    const panner = new Tone.Panner(0);

    // Connect: Voice → gain → filter → panner → channelInput
    if (filter instanceof Tone.Filter) {
      gain.connect(filter);
      filter.connect(panner);
    } else {
      // Raw Web Audio node connection
      gain.connect(filter);
      Tone.connect(filter, panner);
    }
    
    // In DJ mode, route voices through deck audio chain instead of per-channel masterInput
    const voiceOverride = this.instrumentOutputOverrides.get(config.id);
    if (voiceOverride) {
      panner.connect(voiceOverride);
    } else {
      panner.connect(channelOutput.input);
    }

    const envs = config.metadata?.envelopes?.[config.id];
    const volEnv = new TrackerEnvelope();
    const panEnv = new TrackerEnvelope();
    const pitchEnv = new TrackerEnvelope();

    if (envs?.volumeEnvelope) volEnv.init(envs.volumeEnvelope);
    if (envs?.panningEnvelope) panEnv.init(envs.panningEnvelope);
    if (envs?.pitchEnvelope) pitchEnv.init(envs.pitchEnvelope);

    return {
      instrument,
      note,
      volumeEnv: volEnv,
      panningEnv: panEnv,
      pitchEnv: pitchEnv,
      fadeout: 65536,
      fadeoutStep: config.metadata?.modPlayback?.fadeout || 0,
      isKeyOff: false,
      isFilterEnvelope: (envs?.pitchEnvelope as any)?.type === 'filter',
      lastCutoff: 127,
      lastResonance: 0,
      nodes: { gain, filter, panner }
    };
  }

  /**
   * Helper to stop a specific voice
   */
  private stopVoice(voice: VoiceState, time: number): void {
    if ((voice.instrument as any).stop) (voice.instrument as any).stop(time);
    else if ((voice.instrument as any).triggerRelease) (voice.instrument as any).triggerRelease(time);

    // Dispose nodes after a short delay to allow for audio tail/clipping prevention
    setTimeout(() => {
      voice.nodes.gain.dispose();
      if (typeof (voice.nodes.filter as any).dispose === 'function') (voice.nodes.filter as any).dispose();
      voice.nodes.panner.dispose();
    }, 100);
  }

  /**
   * Set channel volume (affects active voices on this channel)
   * ProTracker Cxx command targets the voice/sample volume, not mixer volume
   */
  public setChannelVolume(channelIndex: number, volumeDb: number): void {
    // Update active voice gains (ProTracker-style: Cxx affects sample volume)
    const voices = this.activeVoices.get(channelIndex);

    if (voices && voices.length > 0) {
      const now = Tone.now();
      // Convert dB to linear gain for voice nodes
      const linearGain = volumeDb <= -60 ? 0 : Math.pow(10, volumeDb / 20);
      for (const voice of voices) {
        if (voice.nodes.gain) {
          voice.nodes.gain.gain.setValueAtTime(linearGain, now);
        } else {
          console.warn(`[ToneEngine] Voice has no gain node!`, voice.nodes);
        }
      }
    }

    // Also update channel output for consistency (affects future notes)
    const channelOutput = this.channelOutputs.get(channelIndex);
    if (channelOutput) {
      // Store as "base" volume but don't apply to channel mixer
      // The voice gain handles the actual volume control
    }
  }

  /**
   * Set channel filter cutoff (IT Zxx command)
   * Target the "current" voice's filter
   */
  public setChannelFilterCutoff(channelIndex: number, cutoff: number): void {
    const voices = this.activeVoices.get(channelIndex);
    if (!voices || voices.length === 0) return;

    // Apply to the most recent voice (the "current" one)
    const voice = voices[voices.length - 1];
    voice.lastCutoff = cutoff;
    const resonance = voice.lastResonance;

    const filter = voice.nodes.filter;
    const now = Tone.now();

    // Hardware Quirk: Filter is bypassed ONLY if Cutoff=127 AND Resonance=0
    // Or if ITHandler explicitly requested bypass via value 255
    if ((cutoff >= 127 && resonance === 0) || cutoff === 255) {
      if (filter instanceof Tone.Filter) {
        filter.frequency.setValueAtTime(24000, now);
        filter.Q.setValueAtTime(0, now);
      } else if (filter instanceof AudioWorkletNode) {
        filter.parameters.get('cutoff')?.setValueAtTime(127, now);
        filter.parameters.get('resonance')?.setValueAtTime(0, now);
      }
      return;
    }

    if (filter instanceof Tone.Filter) {
      // High-Fidelity IT Mapping:
      // Cutoff 0-127 -> ~100Hz to 10000Hz (Exponential)
      const freq = 100 * Math.pow(100, cutoff / 127);
      filter.frequency.setValueAtTime(freq, now);
    } else if (filter instanceof AudioWorkletNode) {
      // Worklet uses raw IT values
      filter.parameters.get('cutoff')?.setValueAtTime(cutoff, now);
    }
  }

  /**
   * Set channel filter resonance (IT Z8x command)
   * Target the "current" voice's filter
   */
  public setChannelFilterResonance(channelIndex: number, resonance: number): void {
    const voices = this.activeVoices.get(channelIndex);
    if (!voices || voices.length === 0) return;

    // Apply to the most recent voice
    const voice = voices[voices.length - 1];
    voice.lastResonance = resonance;
    const cutoff = voice.lastCutoff;

    const filter = voice.nodes.filter;
    const now = Tone.now();

    if (filter instanceof Tone.Filter) {
      // High-Fidelity IT Mapping:
      // IT resonance was quite aggressive. 0-127 -> Q 0.0 to ~25.0
      // We use an exponential mapping for that "biting" resonance character
      const q = (resonance / 127) * (resonance / 127) * 25;
      filter.Q.setValueAtTime(q, now);
    } else if (filter instanceof AudioWorkletNode) {
      filter.parameters.get('resonance')?.setValueAtTime(resonance, now);
    }

    // If resonance was set but cutoff is at max, re-evaluate bypass
    if (resonance > 0 && cutoff >= 127) {
      this.setChannelFilterCutoff(channelIndex, cutoff);
    }
  }

  /**
   * Set channel pan (-100 to 100)
   */
  public setChannelPan(channelIndex: number, pan: number | null | undefined): void {
    const voices = this.activeVoices.get(channelIndex);
    if (!voices || voices.length === 0) return;

    // Apply to current voice
    const voice = voices[voices.length - 1];
    const panValue = (pan ?? 0) / 100; // -1..1
    voice.nodes.panner.pan.setValueAtTime(panValue, Tone.now());
  }

  /**
   * Set channel Funk Repeat (EFx Invert Loop)
   * Shifts the loop points of the current voice
   */
  public setChannelFunkRepeat(channelIndex: number, position: number): void {
    const voices = this.activeVoices.get(channelIndex);
    if (!voices || voices.length === 0) return;

    const voice = voices[voices.length - 1];
    const player = voice.instrument;

    // Funk repeat only works on looping Players
    if (player instanceof Tone.Player && player.loop) {
      if (position === 0) {
        // Reset to original loop points if needed (would need to store them)
        return;
      }

      // ProTracker EFx shifts the loop start point within the loop
      // position 0x00..0x80
      const buffer = player.buffer;
      if (buffer.loaded) {
        const playerExt = player as unknown as { _originalLoopStart?: number };
        const originalLoopStart = playerExt._originalLoopStart ?? player.loopStart;
        if (playerExt._originalLoopStart === undefined) {
          playerExt._originalLoopStart = player.loopStart as number;
        }

        // Shift loopStart based on position (approximate behavior)
        const shiftSeconds = (position / 128) * ((player.loopEnd as number) - (originalLoopStart as number));
        player.loopStart = (originalLoopStart as number) + shiftSeconds;
      }
    }
  }

  /**
   * Handle IT Past Note Action (S77-S79)
   * Targets all voices EXCEPT the most recent one
   */
  public handlePastNoteAction(channelIndex: number, action: number): void {
    const voices = this.activeVoices.get(channelIndex);
    if (!voices || voices.length <= 1) return;

    // All voices except the last one are "past"
    const pastVoices = voices.slice(0, voices.length - 1);
    const currentVoice = voices[voices.length - 1];

    if (action === 0) { // CUT
      pastVoices.forEach(v => this.stopVoice(v, Tone.now()));
      this.activeVoices.set(channelIndex, [currentVoice]);
    } else if (action === 2) { // NOTE OFF
      pastVoices.forEach(v => v.volumeEnv.keyOff());
    } else if (action === 3) { // NOTE FADE
      pastVoices.forEach(v => {
        v.isKeyOff = true;
        if (v.fadeoutStep === 0) v.fadeoutStep = 1024;
      });
    }
  }

  /**
   * Set channel pitch for ProTracker effects (arpeggio, portamento, vibrato)
   * @param channelIndex - Channel to modify
   * @param pitchMultiplier - Pitch multiplier (1.0 = no change, 2.0 = octave up, 0.5 = octave down)
   */
  public setChannelPitch(channelIndex: number, pitchMultiplier: number): void {
    const pitchState = this.channelPitchState.get(channelIndex);
    if (!pitchState) return;

    // Update current pitch multiplier
    pitchState.currentPitchMult = pitchMultiplier;

    // Apply to the most recent active voice on this channel
    const voices = this.activeVoices.get(channelIndex);
    if (!voices || voices.length === 0) {
      // Fallback to shared instrument for non-NNA playback
      const instrument = this.instruments.get(pitchState.instrumentKey);
      if (!instrument) return;
      this.applyPitchToNode(instrument, pitchMultiplier, pitchState.basePlaybackRate, pitchState.instrumentKey);
      return;
    }

    const currentVoice = voices[voices.length - 1];
    this.applyPitchToNode(currentVoice.instrument, pitchMultiplier, pitchState.basePlaybackRate, pitchState.instrumentKey);
  }

  /**
   * Helper to apply pitch multiplier to a specific Tone node
   */
  private applyPitchToNode(node: Tone.ToneAudioNode | DevilboxSynth, pitchMultiplier: number, baseRate: number, instrumentKey: number): void {
    const synthType = this.instrumentSynthTypes.get(instrumentKey);
    const cents = 1200 * Math.log2(pitchMultiplier);

    const n = node as any;
    if (node instanceof Tone.Player || node instanceof Tone.GrainPlayer) {
      (node as unknown as { playbackRate: number }).playbackRate = baseRate * pitchMultiplier;
    } else if (synthType === 'Sampler') {
      if (n.detune !== undefined) n.detune.value = cents;
    } else {
      // For synths: use detune property
      if (n.detune !== undefined && n.detune instanceof Tone.Signal) {
        n.detune.value = cents;
      } else if (n.oscillator?.detune !== undefined) {
        n.oscillator.detune.value = cents;
      } else if (n.detune !== undefined) {
        n.detune = cents; // Primitive
      }
    }
  }

  /**
   * Set channel pitch using frequency directly (for portamento/arpeggio)
   * @param channelIndex - Channel to modify
   * @param frequency - Target frequency in Hz
   */
  public setChannelFrequency(channelIndex: number, frequency: number): void {
    const pitchState = this.channelPitchState.get(channelIndex);
    if (!pitchState || pitchState.baseFrequency === 0) {
      // No pitch state - normal for channels without active notes
      return;
    }

    // Calculate pitch multiplier from frequency ratio
    const pitchMultiplier = frequency / pitchState.baseFrequency;
    this.setChannelPitch(channelIndex, pitchMultiplier);
  }

  /**
   * Initialize pitch state when a note is triggered on a channel
   * Called from PatternScheduler when a note starts
   */
  public initChannelPitch(
    channelIndex: number,
    instrumentKey: number,
    baseFrequency: number,
    basePlaybackRate: number = 1
  ): void {
    this.channelPitchState.set(channelIndex, {
      instrumentKey,
      basePlaybackRate,
      baseFrequency,
      currentPitchMult: 1.0,
    });
  }

  /**
   * Clear pitch state for a channel (on note off or channel reset)
   */
  public clearChannelPitch(channelIndex: number): void {
    const pitchState = this.channelPitchState.get(channelIndex);
    if (pitchState) {
      // Reset pitch to normal before clearing
      this.setChannelPitch(channelIndex, 1.0);
      this.channelPitchState.delete(channelIndex);
    }
  }

  /**
   * Mute/unmute channel
   */
  public setChannelMute(channelIndex: number, muted: boolean): void {
    // Ensure channel exists
    if (!this.channelOutputs.has(channelIndex)) {
      this.getChannelOutput(channelIndex);
    }
    const channelOutput = this.channelOutputs.get(channelIndex);
    if (channelOutput) {
      channelOutput.channel.mute = muted;
    }
  }

  /**
   * Update mute states for all channels considering solo logic
   * Solo logic: if any channel is solo'd, only solo'd channels play
   */
  public updateMuteStates(channels: { muted: boolean; solo: boolean }[]): void {
    const anySolo = channels.some(ch => ch.solo);

    channels.forEach((channel, idx) => {
      const shouldMute = anySolo
        ? !channel.solo  // If any solo, mute non-solo'd channels
        : channel.muted;  // Otherwise, respect individual mute states

      // Store in quick lookup map
      this.channelMuteStates.set(idx, shouldMute);

      // Also update channel output if it exists
      this.setChannelMute(idx, shouldMute);
    });
  }

  /**
   * Check if a channel should be muted (for use during note triggering)
   */
  public isChannelMuted(channelIndex: number): boolean {
    return this.channelMuteStates.get(channelIndex) ?? false;
  }

  /**
   * Dispose channel outputs
   */
  private disposeChannelOutputs(): void {
    this.channelOutputs.forEach((channelOutput, channelIndex) => {
      try {
        channelOutput.meter.dispose();
      } catch (e) {
        console.warn(`[ToneEngine] Failed to dispose meter for channel ${channelIndex}:`, e);
      }
      try {
        channelOutput.channel.dispose();
      } catch (e) {
        console.warn(`[ToneEngine] Failed to dispose channel ${channelIndex}:`, e);
      }
      try {
        channelOutput.input.dispose();
      } catch (e) {
        console.warn(`[ToneEngine] Failed to dispose input for channel ${channelIndex}:`, e);
      }
    });
    this.channelOutputs.clear();
  }

  /**
   * Get all channel meter levels for VU meters
   * Returns array of normalized values (0-1) for each channel
   */
  public getChannelLevels(numChannels: number): number[] {
    const levels: number[] = [];
    for (let i = 0; i < numChannels; i++) {
      const channelOutput = this.channelOutputs.get(i);
      if (channelOutput) {
        // Meter returns dB value, convert to 0-1 range
        // -60dB = 0, 0dB = 1
        const db = channelOutput.meter.getValue() as number;
        const normalized = Math.max(0, Math.min(1, (db + 60) / 60));
        levels.push(normalized);
      } else {
        levels.push(0);
      }
    }
    return levels;
  }

  // Channel trigger levels for VU meters (set when notes trigger)
  private channelTriggerLevels: Map<number, number> = new Map();
  // PERF: Pre-allocated arrays for trigger levels — never reallocated
  private triggerLevelsCache: number[] = new Array(16).fill(0);
  private triggerGensCache: number[] = new Array(16).fill(0);

  // Per-channel generation counter — bumped each time a trigger fires.
  // Consumers compare their "last seen" generation to detect new triggers
  // without consume-on-read zeroing (which caused missed triggers due to
  // RAF ordering between Tone.Draw and consumer animation loops).
  private channelTriggerGens = new Map<number, number>();
  private triggerGenCounter = 0;

  /**
   * Trigger a channel's VU meter (called when a note plays on that channel)
   */
  public triggerChannelMeter(channelIndex: number, velocity: number): void {
    this.channelTriggerLevels.set(channelIndex, Math.min(1, velocity * 1.2));
    this.channelTriggerGens.set(channelIndex, ++this.triggerGenCounter);
  }

  /**
   * Clear all channel trigger levels (called on playback stop for instant VU silence)
   */
  public clearChannelTriggerLevels(): void {
    this.channelTriggerLevels.clear();
    this.channelTriggerGens.clear();
  }

  /**
   * Get channel trigger levels for VU meters (real-time note triggers).
   * Does NOT zero triggers on read — multiple consumers can read the same
   * trigger. Consumers use getChannelTriggerGenerations() to detect NEW
   * triggers vs. stale ones they've already processed.
   * PERF: Reuses internal array to avoid allocations every frame.
   */
  public getChannelTriggerLevels(numChannels: number): number[] {
    // Grow cache if needed (never shrinks — avoids reallocation)
    if (this.triggerLevelsCache.length < numChannels) {
      const old = this.triggerLevelsCache;
      this.triggerLevelsCache = new Array(Math.max(numChannels, 16)).fill(0);
      for (let j = 0; j < old.length; j++) this.triggerLevelsCache[j] = old[j];
    }

    for (let i = 0; i < numChannels; i++) {
      this.triggerLevelsCache[i] = this.channelTriggerLevels.get(i) || 0;
    }
    return this.triggerLevelsCache;
  }

  /**
   * Get per-channel trigger generation counters.
   * Each call to triggerChannelMeter() bumps the generation for that channel.
   * Consumers compare with their "last seen" generation to detect new triggers.
   * PERF: Reuses internal array to avoid allocations every frame.
   */
  public getChannelTriggerGenerations(numChannels: number): number[] {
    if (this.triggerGensCache.length < numChannels) {
      this.triggerGensCache = new Array(Math.max(numChannels, 16)).fill(0);
    }
    for (let i = 0; i < numChannels; i++) {
      this.triggerGensCache[i] = this.channelTriggerGens.get(i) || 0;
    }
    return this.triggerGensCache;
  }

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

        if (synthType && ['Synth', 'FMSynth', 'AMSynth', 'PluckSynth'].includes(synthType)) {
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
  public updateChannelEnvelopes(channelIndex: number): void {
    const voices = this.activeVoices.get(channelIndex);
    const channelOutput = this.channelOutputs.get(channelIndex);
    if (!voices || voices.length === 0 || !channelOutput) return;

    // Cache current time once for all voices (hot path optimization)
    const now = Tone.now();
    const basePan = channelOutput.channel.pan.value;

    // In-place filtering: track write index
    let writeIdx = 0;
    const len = voices.length;

    for (let i = 0; i < len; i++) {
      const voice = voices[i];

      // 1. Advance volume envelope (0-64)
      const envVol = voice.volumeEnv.tickNext();

      // Advance fadeout if key is off
      if (voice.isKeyOff && voice.fadeout > 0) {
        voice.fadeout = Math.max(0, voice.fadeout - voice.fadeoutStep);
      }

      // Calculate final volume multiplier (0.0 to 1.0)
      const volMult = (envVol / 64) * (voice.fadeout / 65536);
      voice.nodes.gain.gain.setValueAtTime(volMult, now);

      // 2. Advance panning envelope (0-64)
      const envPan = voice.panningEnv.tickNext();
      if (envPan !== 32) {
        const envOffset = (envPan - 32) / 32;
        const finalPan = Math.max(-1, Math.min(1, basePan + envOffset));
        voice.nodes.panner.pan.setValueAtTime(finalPan, now);
      }

      // 3. Advance pitch/filter envelope
      const envPitch = voice.pitchEnv.tickNext();
      if (voice.pitchEnv.isEnabled()) {
        if (voice.isFilterEnvelope) {
          const baseCutoff = voice.lastCutoff;
          const envOffset = (envPitch - 32);
          const finalCutoff = Math.max(0, Math.min(127, baseCutoff + envOffset));

          // Apply to voice filter using LUT
          if (voice.nodes.filter instanceof Tone.Filter) {
            const freq = ToneEngine.FILTER_CUTOFF_LUT[finalCutoff];
            voice.nodes.filter.frequency.setValueAtTime(freq, now);
          } else if (voice.nodes.filter instanceof AudioWorkletNode) {
            voice.nodes.filter.parameters.get('cutoff')?.setValueAtTime(finalCutoff, now);
          }
        } else {
          // Pitch modulation (Additive semitones)
          const semitoneOffset = (envPitch - 32) / 32 * 12; // +/- 12 semitones
          const instWithDetune = voice.instrument as unknown as { detune?: { value: number } };
          if (instWithDetune.detune !== undefined) {
            instWithDetune.detune.value = semitoneOffset * 100;
          }
        }
      }

      // Cleanup: check if voice is finished
      const isFinished = (voice.isKeyOff && voice.fadeout <= 0) ||
                        (voice.volumeEnv.isFinished() && voice.isKeyOff);

      if (!isFinished) {
        // Keep voice - write to current position
        voices[writeIdx++] = voice;
      } else {
        // Dispose nodes
        voice.nodes.gain.dispose();
        if (typeof (voice.nodes.filter as any).dispose === 'function') (voice.nodes.filter as any).dispose();
        voice.nodes.panner.dispose();
      }
    }

    // Truncate array in-place
    if (writeIdx > 0) {
      voices.length = writeIdx;
    } else {
      this.activeVoices.delete(channelIndex);
    }
  }

  /**
   * Signal key-off for a channel
   */
  public setChannelKeyOff(channelIndex: number): void {
    const voices = this.activeVoices.get(channelIndex);
    if (voices) {
      voices.forEach(voice => {
        voice.isKeyOff = true;
        voice.volumeEnv.keyOff();
        voice.panningEnv.keyOff();
        voice.pitchEnv.keyOff();
      });
    }
  }

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
  // END PERFORMANCE QUALITY MANAGEMENT
  // ============================================
}

// Export singleton instance getter
export const getToneEngine = () => ToneEngine.getInstance();
