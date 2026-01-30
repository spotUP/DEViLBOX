/**
 * ToneEngine - Tone.js Audio Engine Wrapper
 * Manages Tone.js lifecycle, instruments, master effects, and audio context
 */

import * as Tone from 'tone';
import type { InstrumentConfig, EffectConfig } from '@typedefs/instrument';
import { DEFAULT_TB303 } from '@typedefs/instrument';
import { TB303Synth } from './TB303Engine';
import { InstrumentFactory } from './InstrumentFactory';
import { periodToNoteIndex, getPeriodExtended } from './effects/PeriodTables';
import { AmigaFilter } from './effects/AmigaFilter';
import { TrackerEnvelope } from './TrackerEnvelope';
import { InstrumentAnalyser } from './InstrumentAnalyser';
import { FurnaceChipEngine } from './chips/FurnaceChipEngine';

interface VoiceState {
  instrument: any;
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
    filter: any;
    panner: Tone.Panner;
  };
}

export class ToneEngine {
  private static instance: ToneEngine | null = null;
  private static tb303WorkletLoaded: boolean = false; // Track if TB303 worklet is loaded
  private static itFilterWorkletLoaded: boolean = false; // Track if ITFilter worklet is loaded

  // Master routing chain: instruments → masterInput → masterEffects → masterChannel → analyzers → destination
  public masterInput: Tone.Gain; // Where instruments connect
  public masterChannel: Tone.Channel; // Final output with volume/pan
  public analyser: Tone.Analyser;
  public fft: Tone.FFT;
  // Instruments keyed by "instrumentId-channelIndex" for per-channel independence
  public instruments: Map<string, Tone.PolySynth | Tone.Synth | any>;
  // Track synth types for proper release handling
  private instrumentSynthTypes: Map<string, string> = new Map();
  // Track loading promises for samplers/players (keyed by instrument key)
  private instrumentLoadingPromises: Map<string, Promise<void>> = new Map();

  // Polyphonic voice allocation for live keyboard/MIDI playing
  // Maps note (e.g., "C4") to channel index used for that note
  private liveVoiceAllocation: Map<string, number> = new Map();
  // Pool of available channel indices for polyphonic playback (channels 100-115)
  private liveVoicePool: number[] = [];
  private static readonly LIVE_VOICE_BASE_CHANNEL = 100; // Start at channel 100 to avoid tracker channels
  private static readonly MAX_LIVE_VOICES = 16;

  // Active voices per channel (for IT NNA support)
  private activeVoices: Map<number, VoiceState[]> = new Map();

  // Master effects chain
  private masterEffectsNodes: Tone.ToneAudioNode[] = [];
  private masterEffectConfigs: Map<string, { node: Tone.ToneAudioNode; config: EffectConfig }> = new Map();

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
    instrumentKey: string;
    basePlaybackRate: number;  // For samplers/players
    baseFrequency: number;     // For synths (Hz)
    currentPitchMult: number;  // Current pitch multiplier (1.0 = no change)
  }> = new Map();

  // Track active looping players per channel (to stop when new note triggers)
  private channelActivePlayer: Map<number, Tone.Player> = new Map();


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

  // Per-instrument effect chains (keyed by composite string "instrumentId-channelIndex")
  private instrumentEffectChains: Map<string | number, {
    effects: Tone.ToneAudioNode[];
    output: Tone.Gain;
  }> = new Map();

  // Per-instrument analysers for visualization (keyed by instrumentId)
  // Lazy-created: only exists when visualization requests it
  private instrumentAnalysers: Map<number, InstrumentAnalyser> = new Map();

  private constructor() {
    // Master input (where all instruments connect)
    this.masterInput = new Tone.Gain(1);

    // Amiga audio filter (E0x) - 1:1 hardware emulation
    this.amigaFilter = new AmigaFilter();

    // Master output channel with volume/pan control
    this.masterChannel = new Tone.Channel({
      volume: -6,
      pan: 0,
    }).toDestination();

    // Analyzers for visualization
    this.analyser = new Tone.Analyser('waveform', 1024);
    this.fft = new Tone.FFT(1024);

    // Connect analyzers to master channel
    this.masterChannel.connect(this.analyser);
    this.masterChannel.connect(this.fft);

    // Default routing: masterInput → masterEffectsNode? → amigaFilter → masterChannel
    this.masterInput.connect(this.amigaFilter);
    this.amigaFilter.connect(this.masterChannel);

    // Instrument map
    this.instruments = new Map();

    // Initialize live voice pool (channels 100-115 for polyphonic keyboard/MIDI)
    this.liveVoicePool = [];
    for (let i = 0; i < ToneEngine.MAX_LIVE_VOICES; i++) {
      this.liveVoicePool.push(ToneEngine.LIVE_VOICE_BASE_CHANNEL + i);
    }
  }

  /**
   * Singleton pattern - get or create instance
   */
  public static getInstance(): ToneEngine {
    if (!ToneEngine.instance) {
      ToneEngine.instance = new ToneEngine();
    }
    return ToneEngine.instance;
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
   * Initialize audio context (must be called after user interaction)
   */
  public async init(): Promise<void> {
    if (Tone.getContext().state === 'suspended') {
      await Tone.start();
    }

    // Wait for context to actually be running (Tone.start() may return before state changes)
    const ctx = Tone.getContext().rawContext;
    if (ctx.state !== 'running') {
      await new Promise<void>((resolve) => {
        const checkState = () => {
          if (ctx.state === 'running') {
            resolve();
          } else {
            setTimeout(checkState, 10);
          }
        };
        checkState();
      });
    }

    // Pre-load TB303 AudioWorklet (prevents async loading delay for TB-303 synth)
    // Only load once - AudioWorklet processors can only be registered once
    if (!ToneEngine.tb303WorkletLoaded) {
      try {
        const baseUrl = import.meta.env.BASE_URL || '/';
        await Tone.getContext().rawContext.audioWorklet.addModule(`${baseUrl}TB303.worklet.js`);
        ToneEngine.tb303WorkletLoaded = true;
      } catch (error) {
        // Non-fatal - worklet will be loaded on-demand when TB-303 synth is used
      }
    }

    // Pre-load ITFilter AudioWorklet
    if (!ToneEngine.itFilterWorkletLoaded) {
      try {
        const baseUrl = import.meta.env.BASE_URL || '/';
        await Tone.getContext().rawContext.audioWorklet.addModule(`${baseUrl}ITFilter.worklet.js`);
        ToneEngine.itFilterWorkletLoaded = true;
      } catch (error) {
        console.error('[ToneEngine] Failed to load ITFilter worklet:', error);
      }
    }

    // Pre-initialize Furnace WASM chip engine
    // This ensures the WASM is ready before any Furnace synths are created
    try {
      const furnaceEngine = FurnaceChipEngine.getInstance();
      // Pass Tone.js context - the engine will extract the native AudioContext
      await furnaceEngine.init(Tone.getContext());
      console.log('[ToneEngine] Furnace WASM chip engine initialized');
    } catch (error) {
      console.warn('[ToneEngine] Furnace WASM init failed, will use fallback synths:', error);
    }

    // Load AmigaFilter worklet handled by its class
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

    // First, dispose any existing instruments to start fresh
    configs.forEach((config) => {
      // BUG FIX: Use proper key format (was checking config.id but Map keys are strings like "3--1")
      const key = this.getInstrumentKey(config.id, -1);
      if (this.instruments.has(key)) {
        this.disposeInstrument(config.id);
      }
    });

    // Create all instruments
    const samplerConfigs = configs.filter((c) => c.synthType === 'Sampler' || c.synthType === 'Player');
    const otherConfigs = configs.filter((c) => c.synthType !== 'Sampler' && c.synthType !== 'Player');

    // Create non-sampler instruments immediately
    otherConfigs.forEach((config) => {
      this.getInstrument(config.id, config);
    });

    // Create sampler instruments
    samplerConfigs.forEach((config) => {
      this.getInstrument(config.id, config);
    });

    // Wait for all audio buffers to load
    if (samplerConfigs.length > 0) {
      try {
        // Wait for Tone.js internal loading (URL-based samples)
        await Tone.loaded();

        // Also wait for any custom buffer loading promises (ArrayBuffer-based samples)
        const pendingLoads = Array.from(this.instrumentLoadingPromises.values());
        if (pendingLoads.length > 0) {
          console.log(`[ToneEngine] Waiting for ${pendingLoads.length} samples to decode...`);
          await Promise.all(pendingLoads);
          console.log(`[ToneEngine] All ${pendingLoads.length} samples loaded`);
        }
      } catch (error) {
        console.error('[ToneEngine] Some samples failed to load:', error);
      }
    }

    // PERFORMANCE FIX: Warm up CPU-intensive synths by triggering a silent note
    // This forces Tone.js to compile/initialize audio graphs before playback starts
    const warmUpTypes = ['MetalSynth', 'MembraneSynth', 'NoiseSynth', 'FMSynth'];
    for (const config of configs) {
      if (warmUpTypes.includes(config.synthType || '')) {
        const key = this.getInstrumentKey(config.id, -1);
        const instrument = this.instruments.get(key);
        if (instrument) {
          try {
            // Save original volume, set to silent
            const originalVol = instrument.volume.value;
            instrument.volume.value = -Infinity;

            // Trigger a very short note to warm up the synth
            if (config.synthType === 'NoiseSynth' || config.synthType === 'MetalSynth') {
              // MetalSynth is now NoiseSynth under the hood for performance
              (instrument as Tone.NoiseSynth).triggerAttackRelease(0.001, Tone.now());
            } else if (config.synthType === 'MembraneSynth') {
              // MembraneSynth is now regular Synth for performance
              (instrument as Tone.Synth).triggerAttackRelease('C2', 0.001, Tone.now());
            } else {
              instrument.triggerAttackRelease?.('C4', 0.001, Tone.now());
            }

            // Restore volume
            instrument.volume.value = originalVol;
          } catch (e) {
            // Ignore warm-up errors
          }
        }
      }
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
      if (instrument && typeof instrument.processTick === 'function') {
        instrument.processTick(time);
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
  }

  /**
   * Get current BPM
   */
  public getBPM(): number {
    return Tone.getTransport().bpm.value;
  }

  /**
   * Start transport (also ensures audio context is running)
   */
  public async start(): Promise<void> {
    // Ensure audio context is running (may have suspended due to inactivity)
    if (Tone.getContext().state === 'suspended') {
      await Tone.start();
    }

    Tone.getTransport().start();
  }

  /**
   * Stop transport
   */
  public stop(): void {
    // Release all active notes before stopping to prevent hanging notes
    this.releaseAll();

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
  private getInstrumentKey(instrumentId: number, channelIndex?: number): string {
    // If no channel specified, use -1 as default (backwards compatibility)
    return `${instrumentId}-${channelIndex ?? -1}`;
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
      return null;
    }

    // Get current time from Tone.js
    const now = Tone.now();
    if (now === undefined || now === null || isNaN(now)) {
      return null;
    }

    // If time is provided and valid (> 0), use it as base
    // Time of 0 means "play immediately" so we use now()
    let targetTime: number;
    if (time !== undefined && time !== null && !isNaN(time) && time > 0) {
      targetTime = time;
    } else {
      // Use current time with a small offset to ensure it's scheduled properly
      targetTime = now + 0.001;
    }

    // Ensure this time is strictly greater than the last trigger time
    // This prevents "Start time must be strictly greater than previous start time" errors
    // especially for rapid MIDI input or drum machines
    if (targetTime <= this.lastTriggerTime) {
      targetTime = this.lastTriggerTime + 0.001;
    }

    this.lastTriggerTime = targetTime;
    return targetTime;
  }

  /**
   * Create or get instrument (per-channel to avoid automation conflicts)
   */
  public getInstrument(instrumentId: number, config: InstrumentConfig, channelIndex?: number): Tone.PolySynth | Tone.Synth | any {
    // CRITICAL FIX: Samplers and Players don't need per-channel instances
    // They're already polyphonic and don't have per-channel automation
    // Creating new instances causes them to reload samples, causing silence
    const isSharedType = config.synthType === 'Sampler' || config.synthType === 'Player';
    const key = isSharedType
      ? this.getInstrumentKey(instrumentId, -1)  // Use shared instance
      : this.getInstrumentKey(instrumentId, channelIndex);

    // Check if instrument already exists for this channel
    if (this.instruments.has(key)) {
      return this.instruments.get(key);
    }

    // PERFORMANCE FIX: Check for shared/legacy instrument before creating new one
    // Preload creates instruments with key ${id}--1, but playback uses ${id}-${channel}
    // Reuse the shared instance instead of creating expensive new synths per channel
    // BUT: Don't reuse for live voice channels (100+) - those need separate instances for polyphony
    const isLiveVoiceChannel = channelIndex !== undefined && channelIndex >= ToneEngine.LIVE_VOICE_BASE_CHANNEL;
    const legacyKey = this.getInstrumentKey(instrumentId, -1);
    if (!isSharedType && !isLiveVoiceChannel && this.instruments.has(legacyKey)) {
      console.log(`[ToneEngine] getInstrument: REUSING shared instance for key=${key}, legacyKey=${legacyKey}`);
      return this.instruments.get(legacyKey);
    }

    console.log(`[ToneEngine] getInstrument: CREATING NEW instance for key=${key}, isLiveVoice=${isLiveVoiceChannel}, synthType=${config.synthType}`);

    // Create new instrument based on config
    let instrument: any;

    switch (config.synthType) {
      case 'Synth':
        // Adjust polyphony based on quality level for CPU savings
        const synthPolyphony = this.currentPerformanceQuality === 'high' ? 16 :
                               this.currentPerformanceQuality === 'medium' ? 8 : 4;
        instrument = new Tone.PolySynth({
          voice: Tone.Synth,
          maxPolyphony: synthPolyphony,
          options: {
            oscillator: {
              type: config.oscillator?.type || 'sawtooth',
            },
            envelope: {
              attack: (config.envelope?.attack ?? 10) / 1000,
              decay: (config.envelope?.decay ?? 200) / 1000,
              sustain: (config.envelope?.sustain ?? 50) / 100,
              release: (config.envelope?.release ?? 1000) / 1000,
            },
          },
          volume: config.volume || -12,
        });
        break;

      case 'MonoSynth':
        instrument = new Tone.MonoSynth({
          oscillator: {
            type: config.oscillator?.type || 'sawtooth',
          },
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
            oscillator: { type: config.oscillator?.type || 'sawtooth' },
            envelope: {
              attack: (config.envelope?.attack ?? 10) / 1000,
              decay: (config.envelope?.decay ?? 200) / 1000,
              sustain: (config.envelope?.sustain ?? 50) / 100,
              release: (config.envelope?.release ?? 1000) / 1000,
            },
          },
          voice1: {
            oscillator: { type: config.oscillator?.type || 'sawtooth' },
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

      case 'FMSynth':
        // FMSynth is CPU-intensive, reduce polyphony on lower quality
        const fmPolyphony = this.currentPerformanceQuality === 'high' ? 16 :
                            this.currentPerformanceQuality === 'medium' ? 6 : 3;
        instrument = new Tone.PolySynth({
          voice: Tone.FMSynth,
          maxPolyphony: fmPolyphony,
          options: {
            oscillator: { type: config.oscillator?.type || 'sine' },
            envelope: {
              attack: (config.envelope?.attack ?? 10) / 1000,
              decay: (config.envelope?.decay ?? 200) / 1000,
              sustain: (config.envelope?.sustain ?? 50) / 100,
              release: (config.envelope?.release ?? 1000) / 1000,
            },
            modulationIndex: 10,
          },
          volume: config.volume || -12,
        });
        break;

      case 'AMSynth':
        // AMSynth has dual oscillators, reduce polyphony on lower quality
        const amPolyphony = this.currentPerformanceQuality === 'high' ? 16 :
                            this.currentPerformanceQuality === 'medium' ? 8 : 4;
        instrument = new Tone.PolySynth({
          voice: Tone.AMSynth,
          maxPolyphony: amPolyphony,
          options: {
            oscillator: { type: config.oscillator?.type || 'sine' },
            envelope: {
              attack: (config.envelope?.attack ?? 10) / 1000,
              decay: (config.envelope?.decay ?? 200) / 1000,
              sustain: (config.envelope?.sustain ?? 50) / 100,
              release: (config.envelope?.release ?? 1000) / 1000,
            },
          },
          volume: config.volume || -12,
        });
        break;

      case 'PluckSynth':
        const pluckPolyphony = this.currentPerformanceQuality === 'high' ? 16 :
                               this.currentPerformanceQuality === 'medium' ? 8 : 4;
        instrument = new (Tone.PolySynth as any)({
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
            triggerAttack: (time?: number, velocity?: number) => {
              noiseSynth.triggerAttack(time, velocity);
            },
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
          };
        } else {
          instrument = noiseSynth;
        }
        break;
      }

      case 'TB303':
        // Authentic TB-303 acid bass synthesizer
        if (config.tb303) {
          instrument = new TB303Synth(config.tb303);
          instrument.setVolume(config.volume || -12);
        } else {
          // Fallback if no TB-303 config
          instrument = new TB303Synth(DEFAULT_TB303);
          instrument.setVolume(config.volume || -12);
        }
        break;

      case 'Sampler': {
        // Sample-based instrument - loads a sample URL and pitches it
        // Check both parameters.sampleUrl (legacy) and sample.url (new standard)
        let sampleUrl = config.parameters?.sampleUrl || config.sample?.url;
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
        // But skip if URL already starts with BASE_URL to avoid double prefix
        if (sampleUrl && sampleUrl.startsWith('/') && !sampleUrl.startsWith('//')) {
          const baseUrl = import.meta.env.BASE_URL || '/';
          // Check if URL already has BASE_URL prefix (sample packs already include it)
          const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
          if (normalizedBase !== '/' && !sampleUrl.startsWith(normalizedBase)) {
            // Only prepend if not already prefixed
            sampleUrl = baseUrl.endsWith('/') && sampleUrl.startsWith('/')
              ? baseUrl + sampleUrl.slice(1)
              : baseUrl + sampleUrl;
          }
        }

        // If we have a stored edited buffer, use that instead of URL
        // Note: audioBuffer can be ArrayBuffer, Uint8Array, or base64 string (from persistence)
        if (storedBuffer) {
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
            } catch (e) {
              console.warn(`[ToneEngine] Sampler ${instrumentId}: audioBuffer is string but not valid base64, skipping`);
              bufferToUse = null;
            }
          }

          if (bufferToUse) {
            const usePeriodPlayback = config.metadata?.modPlayback?.usePeriodPlayback;

            if (hasLoop || usePeriodPlayback) {
              instrument = new Tone.Player({
                loop: hasLoop,
                loopStart: hasLoop ? loopStart / (config.sample?.sampleRate || 8363) : 0,
                loopEnd: hasLoop ? loopEnd / (config.sample?.sampleRate || 8363) : 0,
                volume: config.volume || 0,
              });
              // Store as 'Player' type for proper handling in other methods
              this.instrumentSynthTypes.set(key, 'Player');

              // Load the stored buffer asynchronously and track the promise
              const bufferForDecode = bufferToUse;
              const playerRef = instrument as Tone.Player;
              const loadPromise = (async () => {
                try {
                  const audioBuffer = await this.decodeAudioData(bufferForDecode);
                  playerRef.buffer = new Tone.ToneAudioBuffer(audioBuffer);
                  console.log(`[ToneEngine] Sampler ${instrumentId} loaded edited buffer`);
                } catch (err) {
                  console.error(`[ToneEngine] Sampler ${instrumentId} failed to load edited buffer:`, err);
                }
              })();
              this.instrumentLoadingPromises.set(key, loadPromise);
            } else {
              // Non-looping: Use Tone.Sampler
              instrument = new Tone.Sampler({
                volume: config.volume || -12,
              });

              // Load the stored buffer asynchronously and track the promise
              const bufferForDecode = bufferToUse;
              const samplerRef = instrument as Tone.Sampler;
              const loadPromise = (async () => {
                try {
                  const audioBuffer = await this.decodeAudioData(bufferForDecode);
                  const toneBuffer = new Tone.ToneAudioBuffer(audioBuffer);
                  samplerRef.add(baseNote as Tone.Unit.Note, toneBuffer);
                  console.log(`[ToneEngine] Sampler ${instrumentId} loaded edited buffer`);
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
          // CRITICAL: For MOD/XM samples or looping samples, use Tone.Player
          // Tone.Player allows direct playbackRate control for accurate pitch
          // Tone.Sampler rounds to nearest semitone, losing precision
          const usePeriodPlayback = config.metadata?.modPlayback?.usePeriodPlayback;

          if (hasLoop || usePeriodPlayback) {
            instrument = new Tone.Player({
              url: sampleUrl,
              loop: hasLoop,
              loopStart: hasLoop ? loopStart / (config.sample?.sampleRate || 8363) : 0,
              loopEnd: hasLoop ? loopEnd / (config.sample?.sampleRate || 8363) : 0,
              volume: config.volume || 0, // Use unity gain - volume controlled via velocity
              onload: () => {
              },
              onerror: (err: Error) => {
                console.error(`[ToneEngine] Player ${instrumentId} failed to load sample:`, err);
              },
            });
            // Store as 'Player' type for proper handling in other methods
            this.instrumentSynthTypes.set(key, 'Player');
          } else {
            // Non-MOD, non-looping: Use Tone.Sampler for note-based playback
            const urls: { [note: string]: string } = {};
            urls[baseNote] = sampleUrl;

            instrument = new Tone.Sampler({
              urls,
              volume: config.volume || -12,
              onload: () => {
              },
              onerror: (err: Error) => {
                console.error(`[ToneEngine] Sampler ${instrumentId} failed to load sample:`, err);
              },
            });
          }
        }

        // If still no instrument created, create empty sampler (will be silent)
        if (!instrument) {
          console.warn(`[ToneEngine] Sampler ${instrumentId} has no valid sample source`);
          instrument = new Tone.Sampler({
            volume: config.volume || -12,
          });
        }
        break;
      }

      case 'Player': {
        // One-shot player (doesn't pitch)
        const playerUrl = config.parameters?.sampleUrl;

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
        const granularUrl = config.granular?.sampleUrl || config.parameters?.sampleUrl;
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
      // FM Synthesis Chips
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
      // Console PSG Chips
      case 'FurnaceNES':
      case 'FurnaceGB':
      case 'FurnacePSG':
      case 'FurnacePCE':
      case 'FurnaceSNES':
      case 'FurnaceVB':
      case 'FurnaceLynx':
      case 'FurnaceSWAN':
      // NES Expansion Audio
      case 'FurnaceVRC6':
      case 'FurnaceVRC7':
      case 'FurnaceN163':
      case 'FurnaceFDS':
      case 'FurnaceMMC5':
      // Computer Chips
      case 'FurnaceC64':
      case 'FurnaceSID6581':
      case 'FurnaceSID8580':
      case 'FurnaceAY':
      case 'FurnaceVIC':
      case 'FurnaceSAA':
      case 'FurnaceTED':
      case 'FurnaceVERA':
      // Arcade PCM Chips
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
      // Wavetable Chips
      case 'FurnaceSCC':
      case 'FurnaceX1_010':
      case 'FurnaceBUBBLE':
      // Other
      case 'FurnaceTIA':
      case 'FurnaceSM8521':
      case 'FurnaceT6W28':
      case 'FurnaceSUPERVISION':
      case 'FurnaceUPD1771':
      // Buzzmachine Generators (WASM-emulated Buzz synths)
      case 'BuzzDTMF':
      case 'BuzzFreqBomb':
      case 'BuzzKick':
      case 'BuzzKickXP':
      case 'BuzzNoise':
      case 'BuzzTrilok':
      case 'Buzz4FM2F':
      case 'BuzzDynamite6':
      case 'BuzzM3':
      case 'Buzz3o3': {
        instrument = InstrumentFactory.createInstrument(config);
        break;
      }

      default:
        // Default to basic synth
        instrument = new Tone.PolySynth({
          voice: Tone.Synth,
          maxPolyphony: 16, // Increased for high BPM playback
          volume: config.volume || -12,
        });
    }

    // Apply filter if specified
    if (config.filter && instrument.filter) {
      instrument.filter.type = config.filter.type;
      instrument.filter.frequency.value = config.filter.frequency;
      instrument.filter.Q.value = config.filter.Q;
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

    // Find the instrument - try shared key first (Samplers/Players)
    const sharedKey = this.getInstrumentKey(instrumentId, -1);
    let instrument = this.instruments.get(sharedKey);

    // If not found, try to find any instance of this instrument
    if (!instrument) {
      for (const [key, inst] of this.instruments) {
        if (key.startsWith(`${instrumentId}-`)) {
          instrument = inst;
          break;
        }
      }
    }

    if (!instrument) {
      return null;
    }

    // Create new analyser
    analyser = new InstrumentAnalyser();

    // Get the effect chain output for this instrument
    const effectChain = this.instrumentEffectChains.get(sharedKey);

    if (effectChain) {
      // Disconnect instrument from current destination
      try {
        instrument.disconnect();
      } catch {
        // May not be connected
      }

      // Re-route: instrument → analyser.input → analyser.output → effect chain
      instrument.connect(analyser.input);

      // Reconnect effects
      if (effectChain.effects.length > 0) {
        analyser.output.connect(effectChain.effects[0]);
      } else {
        analyser.output.connect(effectChain.output);
      }
    } else {
      // No effect chain - connect directly through analyser
      try {
        instrument.disconnect();
      } catch {
        // May not be connected
      }
      instrument.connect(analyser.input);
      analyser.output.connect(this.masterInput);
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
        if (key.startsWith(`${instrumentId}-`)) {
          instrument = inst;
          break;
        }
      }
    }

    // Re-route instrument directly (bypass analyser)
    if (instrument) {
      try {
        instrument.disconnect();
      } catch {
        // May not be connected
      }

      const effectChain = this.instrumentEffectChains.get(sharedKey);
      if (effectChain) {
        if (effectChain.effects.length > 0) {
          instrument.connect(effectChain.effects[0]);
        } else {
          instrument.connect(effectChain.output);
        }
      } else {
        instrument.connect(this.masterInput);
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
  private applyAutomationToInstrument(instrument: any, parameter: string, value: number): void {
    // Get safe time for automation - skip if context not ready
    const now = this.getSafeTime();
    if (now === null) {
      return;
    }

    try {
      switch (parameter) {
        case 'cutoff':
          // Map 0-1 to 200-20000 Hz (logarithmic)
          if (instrument instanceof TB303Synth) {
            const cutoffHz = 200 * Math.pow(100, value); // 200 to 20000 Hz
            instrument.setCutoff(cutoffHz);
          } else if (instrument.filter) {
            const cutoffHz = 200 * Math.pow(100, value);
            instrument.filter.frequency.setValueAtTime(cutoffHz, now);
          }
          break;

        case 'resonance':
          // Map 0-1 to 0-100%
          if (instrument instanceof TB303Synth) {
            instrument.setResonance(value * 100);
          } else if (instrument.filter) {
            instrument.filter.Q.setValueAtTime(value * 10, now);
          }
          break;

        case 'envMod':
          // Map 0-1 to 0-100% envelope modulation
          if (instrument instanceof TB303Synth) {
            instrument.setEnvMod(value * 100);
          }
          break;

        case 'volume':
          // Map 0-1 to -40dB to 0dB
          const volumeDb = -40 + value * 40;
          instrument.volume.setValueAtTime(volumeDb, now);
          break;

        case 'pan':
          // Map 0-1 to -1 to +1 (left to right)
          const panValue = value * 2 - 1;
          if (instrument.pan) {
            instrument.pan.setValueAtTime(panValue, now);
          }
          break;

        case 'decay':
          // Map 0-1 to 30-3000ms decay time
          if (instrument instanceof TB303Synth) {
            const decayMs = 30 + value * 2970; // 30 to 3000ms
            instrument.setDecay(decayMs);
          }
          break;

        case 'accent':
          // Map 0-1 to 0-100% accent amount
          if (instrument instanceof TB303Synth) {
            instrument.setAccentAmount(value * 100);
          }
          break;

        case 'tuning':
          // Map 0-1 to -100 to +100 cents
          if (instrument instanceof TB303Synth) {
            const cents = (value - 0.5) * 200; // -100 to +100
            instrument.setTuning(cents);
          }
          break;

        case 'overdrive':
          // Map 0-1 to 0-100% overdrive
          if (instrument instanceof TB303Synth) {
            instrument.setOverdrive(value * 100);
          }
          break;

        // Devil Fish parameters
        case 'normalDecay':
          // Map 0-1 to 30-3000ms decay time for normal notes
          if (instrument instanceof TB303Synth) {
            const decayMs = 30 + value * 2970; // 30 to 3000ms
            instrument.setNormalDecay(decayMs);
          }
          break;

        case 'accentDecay':
          // Map 0-1 to 30-3000ms decay time for accented notes
          if (instrument instanceof TB303Synth) {
            const decayMs = 30 + value * 2970; // 30 to 3000ms
            instrument.setAccentDecay(decayMs);
          }
          break;

        case 'vegDecay':
          // Map 0-1 to 16-3000ms VEG decay time
          if (instrument instanceof TB303Synth) {
            const decayMs = 16 + value * 2984; // 16 to 3000ms
            instrument.setVegDecay(decayMs);
          }
          break;

        case 'vegSustain':
          // Map 0-1 to 0-100% VEG sustain level
          if (instrument instanceof TB303Synth) {
            instrument.setVegSustain(value * 100);
          }
          break;

        case 'softAttack':
          // Map 0-1 to 0.3-30ms soft attack time (logarithmic)
          if (instrument instanceof TB303Synth) {
            const attackMs = 0.3 * Math.pow(100, value); // 0.3 to 30ms
            instrument.setSoftAttack(attackMs);
          }
          break;

        case 'filterTracking':
          // Map 0-1 to 0-200% filter tracking
          if (instrument instanceof TB303Synth) {
            instrument.setFilterTracking(value * 200);
          }
          break;

        case 'filterFM':
          // Map 0-1 to 0-100% filter FM amount
          if (instrument instanceof TB303Synth) {
            instrument.setFilterFM(value * 100);
          }
          break;

        case 'distortion':
        case 'delay':
        case 'reverb':
          // These are handled by master effects chain
          break;

        default:
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
    instrument: any,
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
        
        if (instrument.oscillator?.frequency) {
          // Synth, MonoSynth, etc.
          freqParam = instrument.oscillator.frequency;
        } else if (instrument.voice0?.oscillator?.frequency) {
          // DuoSynth has voice0 and voice1
          freqParam = instrument.voice0.oscillator.frequency;
        } else if (instrument.frequency) {
          // Some synths expose frequency directly
          freqParam = instrument.frequency;
        }
        
        if (freqParam) {
          try {
            // Set to previous frequency first (no ramp)
            freqParam.setValueAtTime(lastNote.frequency, time);
            // Then exponentially approach target frequency (RC circuit style)
            freqParam.setTargetAtTime(targetFreq, time, ToneEngine.SLIDE_TIME_CONSTANT);
          } catch (e) {
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
    channelIndex?: number
  ): void {
    const instrument = this.getInstrument(instrumentId, config, channelIndex);

    if (!instrument) {
      return;
    }

    // Check if instrument can play - allow triggerAttack (synths) or start (Players)
    const canPlay = instrument.triggerAttack || instrument.start;
    if (!canPlay) {
      return;
    }

    // Get safe time for the attack
    const safeTime = this.getSafeTime(time);
    if (safeTime === null) {
      return; // Audio context not ready
    }

    try {
      // Handle TB-303 with accent/slide support
      if (instrument instanceof TB303Synth) {
        instrument.triggerAttack(note, safeTime, velocity, accent, slide);
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

            // Debug logging for sample playback
            console.log(`[ToneEngine] Play inst=${config.id} period=${period} fineP=${finetunedPeriod} freq=${frequency.toFixed(1)}Hz sampleRate=${sampleRate} bufRate=${player.buffer?.sampleRate} rate=${playbackRate.toFixed(4)}`);

            (player as any).playbackRate = playbackRate;
          } else {
            // No period provided (keyboard playback) - calculate playback rate from note
            // The sample's base note is the pitch at playbackRate 1.0
            const baseNote = config.sample?.baseNote || 'C4';
            const baseFreq = Tone.Frequency(baseNote).toFrequency();
            const targetFreq = Tone.Frequency(note).toFrequency();
            const playbackRate = targetFreq / baseFreq;

            // Debug logging for sample playback (non-period)
            console.log(`[ToneEngine] Play inst=${config.id} note=${note} base=${baseNote} baseF=${baseFreq.toFixed(1)} targetF=${targetFreq.toFixed(1)} bufRate=${player.buffer?.sampleRate} rate=${playbackRate.toFixed(4)}`);

            (player as any).playbackRate = playbackRate;
          }

          player.start(safeTime);
        } else {
          // Regular Sampler
          const sampler = instrument as Tone.Sampler;
          if (!sampler.loaded) {
            return;
          }
          sampler.triggerAttack(note, safeTime, velocity);
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
          const baseFreq = Tone.Frequency(baseNote).toFrequency();
          const targetFreq = Tone.Frequency(note).toFrequency();
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
      } else {
        // Standard synths - apply slide/accent for 303-style effects
        const targetFreq = Tone.Frequency(note).toFrequency();
        const finalVelocity = this.applySlideAndAccent(
          instrument, targetFreq, safeTime, velocity,
          accent, slide, channelIndex, instrumentId
        );
        const isPoly = instrument instanceof Tone.PolySynth;
        const instType = instrument.constructor?.name || 'unknown';
        // Use object identity to track instances
        const instId = (instrument as any).__debugId ?? ((instrument as any).__debugId = Math.random().toString(36).slice(2, 8));
        console.log(`[ToneEngine] triggerAttack: note=${note}, time=${safeTime.toFixed(3)}, velocity=${finalVelocity.toFixed(2)}, isPoly=${isPoly}, type=${instType}, instId=${instId}, channelIdx=${channelIndex ?? 'none'}`);
        instrument.triggerAttack(note, safeTime, finalVelocity);
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

    if (!instrument || !instrument.triggerRelease) {
      return;
    }

    // Ensure we have a valid time - Tone.now() can return null if context isn't ready
    const safeTime = this.getSafeTime(time);
    if (safeTime === null) {
      return; // Audio context not ready, skip release
    }

    try {
      // Handle sample-based instruments
      if (config.synthType === 'Sampler') {
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
        config.synthType === 'Furnace' ||
        // Buzzmachine generators (monophonic, no note parameter)
        config.synthType === 'BuzzKick' ||
        config.synthType === 'BuzzKickXP' ||
        config.synthType === 'BuzzNoise' ||
        config.synthType === 'BuzzTrilok' ||
        config.synthType === 'Buzz4FM2F' ||
        config.synthType === 'BuzzDynamite6' ||
        config.synthType === 'BuzzM3' ||
        config.synthType === 'Buzz3o3'
      ) {
        // These synths use triggerRelease(time) - no note parameter
        instrument.triggerRelease(safeTime);
      } else {
        // PolySynth and others use triggerRelease(note, time)
        instrument.triggerRelease(note, safeTime);
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
   */
  public triggerPolyNoteAttack(
    instrumentId: number,
    note: string,
    velocity: number,
    config: InstrumentConfig
  ): void {
    // For natively polyphonic synths (PolySynth-based), just use the shared instance
    // They already support multiple simultaneous notes
    // Also treat undefined synthType as polyphonic (default creates PolySynth)
    const synthType = config.synthType;
    const isNativePoly = !synthType || ToneEngine.NATIVE_POLY_TYPES.has(synthType);
    console.log(`[ToneEngine] triggerPolyNoteAttack: synthType=${synthType}, isNativePoly=${isNativePoly}, inSet=${ToneEngine.NATIVE_POLY_TYPES.has(synthType || '')}`);
    if (isNativePoly) {
      // Track active notes for release
      this.liveVoiceAllocation.set(note, -1); // -1 = using shared instance
      console.log(`[ToneEngine] POLY ATTACK (native): note=${note}, synthType=${synthType ?? 'default'}`);
      // Use shared instance (channelIndex undefined)
      this.triggerNoteAttack(instrumentId, note, 0, velocity, config);
      return;
    }

    // For monophonic synths (TB303, MonoSynth, etc.), allocate separate channel/instance
    // Check if this note is already playing
    if (this.liveVoiceAllocation.has(note)) {
      // Release the old voice first
      this.triggerPolyNoteRelease(instrumentId, note, config);
    }

    // Allocate a voice channel from the pool
    if (this.liveVoicePool.length === 0) {
      console.warn('[ToneEngine] No free voice channels for polyphonic playback');
      return;
    }

    const channelIndex = this.liveVoicePool.shift()!;
    this.liveVoiceAllocation.set(note, channelIndex);

    console.log(`[ToneEngine] POLY ATTACK (allocated): note=${note}, channel=${channelIndex}, synthType=${synthType}`);

    // Trigger the note on this channel (creates separate instance for monophonic synths)
    this.triggerNoteAttack(instrumentId, note, 0, velocity, config, undefined, false, false, channelIndex);
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

    if (channelIndex === -1) {
      // Native polyphonic synth - release on shared instance
      this.triggerNoteRelease(instrumentId, note, 0, config);
    } else {
      // Allocated voice channel - release on specific instance
      this.triggerNoteRelease(instrumentId, note, 0, config, channelIndex);
      // Return the channel to the pool
      this.liveVoicePool.push(channelIndex);
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
        this.liveVoicePool.push(channelIndex);
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

    if (!instrument.triggerRelease) return;

    // Mono-style synths use triggerRelease(time) - no note parameter
    const isMonoStyle = synthType === 'MonoSynth' ||
                        synthType === 'DuoSynth' ||
                        synthType === 'MetalSynth' ||
                        synthType === 'MembraneSynth' ||
                        synthType === 'NoiseSynth' ||
                        synthType === 'TB303';

    try {
      if (isMonoStyle) {
        instrument.triggerRelease(safeTime);
      } else {
        // PolySynth and others take note parameter
        instrument.triggerRelease(note, safeTime);
      }
    } catch {
      // Fallback: try without note if with note fails
      try {
        instrument.triggerRelease(safeTime);
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
    nnaAction: number = 0  // IT New Note Action: 0=Cut, 1=Cont, 2=Off, 3=Fade
  ): void {
    const safeTime = this.getSafeTime(time);
    if (safeTime === null) return;

    const instrument = this.getInstrument(instrumentId, config, channelIndex);
    if (!instrument) return;

    if (channelIndex !== undefined) {
      // 1. Handle Past Note Actions (NNA)
      let voices = this.activeVoices.get(channelIndex) || [];

      if (nnaAction === 0) { // CUT (Standard MOD/XM/S3M behavior)
        // IMPORTANT: Don't stop voices that use the same instrument instance as the new note
        // This prevents mono synths (like FurnaceSynth) from having keyOff called right after keyOn
        voices.forEach(v => {
          if (v.instrument !== instrument) {
            this.stopVoice(v, safeTime);
          }
        });
        // Filter out voices that were stopped, keep those using the same instrument
        voices = voices.filter(v => v.instrument === instrument);
      } else {
        // IT NNA: Continue, Note Off, or Fade
        voices.forEach(v => {
          if (nnaAction === 2) v.volumeEnv.keyOff(); // Note Off
          if (nnaAction === 3) {
            v.isKeyOff = true; // Start fadeout
            // Use instrument's fadeout rate if available
            if (v.fadeoutStep === 0) v.fadeoutStep = 1024; // Default approx 1/64
          }
        });
      }

      // 2. Create independent playback node for this voice
      // This is essential for IT NNA so overlapping notes have separate envelopes/filters
      let voiceNode: any;
      if (config.synthType === 'Sampler' || config.synthType === 'Player') {
        voiceNode = new Tone.Player(instrument.buffer);
        // FIX: Copy looping settings from parent instrument
        voiceNode.loop = instrument.loop;
        voiceNode.loopStart = instrument.loopStart;
        voiceNode.loopEnd = instrument.loopEnd;
      } else if (config.synthType === 'Synth') {
        voiceNode = new Tone.Synth(instrument.get());
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
        voiceNode.connect(voice.nodes.gain);
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
            (voiceNode as any).playbackRate = frequency / sampleRate;
          } else {
            // FIX: Handle non-period playback for voice nodes (matches triggerNoteAttack)
            const baseNote = config.sample?.baseNote || 'C4';
            const baseFreq = Tone.Frequency(baseNote).toFrequency();
            const targetFreq = Tone.Frequency(note).toFrequency();
            const playbackRate = targetFreq / baseFreq;
            (voiceNode as any).playbackRate = playbackRate;
          }
          const offset = sampleOffset ? sampleOffset / (voiceNode.buffer.sampleRate || 44100) : 0;
          voiceNode.start(safeTime, offset);
        } else if (voiceNode.triggerAttack) {
          // NoiseSynth and MetalSynth don't take note parameter: triggerAttack(time, velocity)
          if (config.synthType === 'NoiseSynth' || config.synthType === 'MetalSynth') {
            voiceNode.triggerAttack(safeTime, velocity);
          } else {
            voiceNode.triggerAttack(note, safeTime, velocity);
          }
        }
      } catch (e) {
        console.error(`[ToneEngine] Voice trigger error:`, e);
      }
      return; // Handled via voice system
    }

    try {
      // Fallback for non-channel triggers (like pre-listening)
      if (instrument instanceof TB303Synth) {
        // TB-303 has accent/slide support
        instrument.triggerAttackRelease(note, duration, safeTime, velocity, accent, slide);
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
            (grainPlayer as any).playbackRate = playbackRate * (config.granular?.playbackRate || 1);
          } else {
            // Calculate pitch shift from note (C4 = base pitch)
            const baseNote = Tone.Frequency('C4').toFrequency();
            const targetFreq = Tone.Frequency(note).toFrequency();
            const playbackRate = targetFreq / baseNote;
            (grainPlayer as any).playbackRate = playbackRate * (config.granular?.playbackRate || 1);
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
            (player as any).playbackRate = playbackRate;
          } else if (config.metadata?.modPlayback?.usePeriodPlayback && !period) {
            // Warn if period-based playback is enabled but no period provided
            console.warn('[ToneEngine] MOD/XM sample expects period but none provided');
          } else {
            // Normal (non-period) playback - calculate pitch from note
            const baseNote = Tone.Frequency('C4').toFrequency();
            const targetFreq = Tone.Frequency(note).toFrequency();
            const playbackRate = targetFreq / baseNote;
            (player as any).playbackRate = playbackRate;
          }

          // Apply sample offset (9xx command) if present
          const startOffset = sampleOffset && sampleOffset > 0
            ? sampleOffset / (player.buffer?.sampleRate || Tone.getContext().sampleRate)
            : 0;

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

          if (sampleOffset && sampleOffset > 0) {
            // 9xx Sample offset: Use Player for offset support
            // Tone.Sampler doesn't support sample offset, so we create a one-shot Player
            const baseNote = config.sample?.baseNote || 'C4';
            const buffer = (sampler as any)._buffers?.get(baseNote) ||
                           (sampler as any)._buffers?._buffers?.[baseNote];

            if (buffer && buffer.duration) {
              const sampleRate = buffer.sampleRate || Tone.getContext().sampleRate;
              // Sample offset in MOD format is in 256-byte units, convert to seconds
              const timeOffset = (sampleOffset * 256) / sampleRate;

              // Clamp offset to buffer duration
              const clampedOffset = Math.min(timeOffset, buffer.duration - 0.001);

              // Create a one-shot Player for this offset playback
              try {
                const offsetPlayer = new Tone.Player({
                  url: buffer,
                  volume: Tone.gainToDb(velocity) + (config.volume || -12),
                }).toDestination();

                // Calculate pitch adjustment for the note (relative to base note)
                const baseFreq = Tone.Frequency(baseNote).toFrequency();
                const targetFreq = Tone.Frequency(note).toFrequency();
                const playbackRate = targetFreq / baseFreq;

                (offsetPlayer as any).playbackRate = playbackRate;

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
        if (instrument.triggerAttackRelease) {
          const targetFreq = Tone.Frequency(note).toFrequency();
          const finalVelocity = this.applySlideAndAccent(
            instrument, targetFreq, safeTime, velocity,
            accent, slide, channelIndex, instrumentId
          );
          instrument.triggerAttackRelease(note, duration, safeTime, finalVelocity);
        }
      } else if (config.synthType === 'DrumMachine') {
        // DrumMachine - some drum types don't take note parameter
        // Apply accent (velocity boost) but not slide (drums don't pitch slide)
        if (instrument.triggerAttackRelease) {
          const finalVelocity = accent ? Math.min(1, velocity * ToneEngine.ACCENT_BOOST) : velocity;
          instrument.triggerAttackRelease(note, duration, safeTime, finalVelocity);
        }
      } else if (instrument.triggerAttackRelease) {
        // Standard synths (Synth, MonoSynth, FMSynth, AMSynth, PluckSynth, DuoSynth, PolySynth)
        // Apply slide/accent for 303-style effects on all synths
        const targetFreq = Tone.Frequency(note).toFrequency();
        const finalVelocity = this.applySlideAndAccent(
          instrument, targetFreq, safeTime, velocity,
          accent, slide, channelIndex, instrumentId
        );
        instrument.triggerAttackRelease(note, duration, safeTime, finalVelocity);
      }
    } catch (error) {
      console.error(`[ToneEngine] Error triggering note for ${config.synthType}:`, error);
    }
  }

  /**
   * Schedule pattern events
   */
  public schedulePatternEvents(events: any[], _patternId: string): void {
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
        } else if (instrument instanceof TB303Synth) {
          // TB303 has its own release method
          instrument.releaseAll();
        } else if (instrument.releaseAll) {
          // Synths and Samplers use releaseAll()
          instrument.releaseAll(now);
        }

        // CRITICAL: Force immediate silence by ramping volume to -Infinity
        // This prevents long release tails from continuing to sound
        if (instrument.volume && typeof instrument.volume.rampTo === 'function') {
          const currentVolume = instrument.volume.value;
          instrument.volume.rampTo(-Infinity, 0.05, now); // 50ms fade out
          // Restore volume after fade for next playback
          setTimeout(() => {
            try {
              if (instrument.volume) {
                instrument.volume.value = currentVolume;
              }
            } catch {
              // Instrument may be disposed
            }
          }, 100);
        }
      } catch (e) {
        console.warn(`[ToneEngine] Error releasing instrument ${key}:`, e);
      }
    });

    // Also clear pitch state and active player tracking for all channels
    this.channelPitchState.clear();
    this.channelActivePlayer.clear();
  }

  /**
   * Dispose of instrument and its effect chain (all channel instances)
   */
  public disposeInstrument(instrumentId: number): void {
    // Dispose effect chain first
    this.disposeInstrumentEffectChain(instrumentId);

    // Find and dispose all channel instances of this instrument
    const keysToDelete: string[] = [];
    this.instruments.forEach((instrument, key) => {
      if (key.startsWith(`${instrumentId}-`)) {
        try {
          instrument.disconnect();
          instrument.dispose();
        } catch {
          // May already be disposed
        }
        keysToDelete.push(key);
      }
    });

    // Delete the keys after iteration
    keysToDelete.forEach(key => {
      this.instruments.delete(key);
      this.instrumentSynthTypes.delete(key);
    });

    if (keysToDelete.length > 0) {
    }
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

  /**
   * Update TB303 parameters in real-time without recreating the synth
   * Updates all channel instances of this instrument
   */
  public updateTB303Parameters(instrumentId: number, tb303Config: NonNullable<InstrumentConfig['tb303']>): void {
    // Find all channel instances of this instrument
    const synths: TB303Synth[] = [];
    this.instruments.forEach((instrument, key) => {
      if (key.startsWith(`${instrumentId}-`) && instrument instanceof TB303Synth) {
        synths.push(instrument);
      }
    });

    if (synths.length === 0) {
      // No instances yet - this is normal if no notes have been played
      // The synth will be created with the correct config on the next note
      return;
    }

    // Update all instances
    synths.forEach((synth) => {

    // Update core TB303 parameters
    if (tb303Config.filter) {
      synth.setCutoff(tb303Config.filter.cutoff);
      synth.setResonance(tb303Config.filter.resonance);
    }
    if (tb303Config.filterEnvelope) {
      synth.setEnvMod(tb303Config.filterEnvelope.envMod);
      synth.setDecay(tb303Config.filterEnvelope.decay);
    }
    if (tb303Config.accent) {
      synth.setAccentAmount(tb303Config.accent.amount);
    }
    if (tb303Config.slide) {
      synth.setSlideTime(tb303Config.slide.time);
    }
    if (tb303Config.overdrive) {
      synth.setOverdrive(tb303Config.overdrive.amount);
    }
    if (tb303Config.oscillator) {
      synth.setWaveform(tb303Config.oscillator.type);
    }

    // Update Devil Fish parameters
    if (tb303Config.devilFish) {
      const df = tb303Config.devilFish;
      synth.enableDevilFish(df.enabled, df);

      if (df.enabled) {
        synth.setNormalDecay(df.normalDecay);
        synth.setAccentDecay(df.accentDecay);
        synth.setVegDecay(df.vegDecay);
        synth.setVegSustain(df.vegSustain);
        synth.setSoftAttack(df.softAttack);
        synth.setFilterTracking(df.filterTracking);
        synth.setFilterFM(df.filterFM);
        synth.setSweepSpeed(df.sweepSpeed);
        synth.setAccentSweepEnabled(df.accentSweepEnabled);
        synth.setHighResonance(df.highResonance);
        synth.setMuffler(df.muffler);
      }
    }
    }); // End synths.forEach
  }

  /**
   * Update TB303 pedalboard/GuitarML configuration
   * Only call this when pedalboard config changes to avoid audio interruptions
   */
  public async updateTB303Pedalboard(instrumentId: number, pedalboard: NonNullable<InstrumentConfig['tb303']>['pedalboard']): Promise<void> {
    if (!pedalboard) return;

    // Find all channel instances of this instrument
    const synths: TB303Synth[] = [];
    this.instruments.forEach((instrument, key) => {
      if (key.startsWith(`${instrumentId}-`) && instrument instanceof TB303Synth) {
        synths.push(instrument);
      }
    });

    if (synths.length === 0) {
      console.warn('[ToneEngine] Cannot update TB303 pedalboard - no TB303 instances found for instrument', instrumentId);
      return;
    }

    const hasNeuralEffect = pedalboard.enabled && pedalboard.chain.some((fx: any) => fx.enabled && fx.type === 'neural');

    // Update all instances
    for (const synth of synths) {
      if (hasNeuralEffect) {
        // Find first enabled neural effect
        const neuralEffect = pedalboard.chain.find((fx: any) => fx.enabled && fx.type === 'neural');
        if (neuralEffect && neuralEffect.modelIndex !== undefined) {
          try {
            // Load GuitarML model and enable
            await synth.loadGuitarMLModel(neuralEffect.modelIndex);
            await synth.setGuitarMLEnabled(true);

            // Set dry/wet mix if specified
            if (neuralEffect.parameters?.dryWet !== undefined) {
              synth.setGuitarMLMix(neuralEffect.parameters.dryWet);
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
      if (key.startsWith(`${instrumentId}-`) && instrument.updateArpeggio) {
        instrument.updateArpeggio(arpeggioConfig);
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
      if (key.startsWith(`${instrumentId}-`) && instrument.getCurrentArpeggioStep) {
        return instrument.getCurrentArpeggioStep();
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
      if (key.startsWith(`${instrumentId}-`) && instrument.isArpeggioPlaying) {
        return instrument.isArpeggioPlaying();
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

    // Dispose master channel and analyzers
    this.analyser.dispose();
    this.fft.dispose();
    this.amigaFilter.dispose();
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
   * @param key - Composite key (instrumentId-channelIndex) for per-channel chains
   */
  private async buildInstrumentEffectChain(
    key: string | number,
    effects: EffectConfig[],
    instrument: Tone.ToneAudioNode
  ): Promise<void> {
    // Dispose existing effect chain if any
    const existing = this.instrumentEffectChains.get(key);
    if (existing) {
      existing.effects.forEach((fx) => {
        try {
          fx.disconnect();
          fx.dispose();
        } catch {
          // Node may already be disposed
        }
      });
      existing.output.disconnect();
      existing.output.dispose();
    }

    // Create output gain node
    const output = new Tone.Gain(1);

    // Filter to only enabled effects
    const enabledEffects = effects.filter((fx) => fx.enabled);

    if (enabledEffects.length === 0) {
      // No effects - direct connection
      instrument.connect(output);
      output.connect(this.masterInput);
      this.instrumentEffectChains.set(key, { effects: [], output });
      return;
    }

    // Create effect nodes (async for neural effects)
    const effectNodes = await Promise.all(
      enabledEffects.map((config) => InstrumentFactory.createEffect(config))
    );

    // Connect: instrument → effects[0] → effects[n] → output → masterInput
    instrument.connect(effectNodes[0]);

    for (let i = 0; i < effectNodes.length - 1; i++) {
      effectNodes[i].connect(effectNodes[i + 1]);
    }

    effectNodes[effectNodes.length - 1].connect(output);
    output.connect(this.masterInput);

    this.instrumentEffectChains.set(key, { effects: effectNodes, output });
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
      instrument.disconnect();
    } catch (e) {
      // May not be connected
    }

    // Build new effect chain (await for neural effects)
    await this.buildInstrumentEffectChain(key, effects, instrument);
  }

  /**
   * Dispose instrument effect chain
   */
  private disposeInstrumentEffectChain(key: string | number): void {
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
    // Deep clone effects to avoid Immer proxy revocation issues during async operations
    const effectsCopy = JSON.parse(JSON.stringify(effects)) as EffectConfig[];

    // Disconnect current chain
    this.masterInput.disconnect();
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

    // Filter to only enabled effects
    const enabledEffects = effectsCopy.filter((fx) => fx.enabled);

    // Helper to get final output (respecting Amiga filter state)
    const getFinalOutput = () => this.amigaFilterEnabled ? this.amigaFilter : this.masterChannel;

    if (enabledEffects.length === 0) {
      // No effects - connect through Amiga filter if enabled
      if (this.amigaFilterEnabled) {
        this.masterInput.connect(this.amigaFilter);
      } else {
        this.masterInput.connect(this.masterChannel);
      }
      return;
    }

    // Create effect nodes (async for neural effects)
    const effectNodes = await Promise.all(
      enabledEffects.map((config) => InstrumentFactory.createEffect(config))
    );

    // Store nodes and configs
    effectNodes.forEach((node, index) => {
      this.masterEffectsNodes.push(node);
      this.masterEffectConfigs.set(enabledEffects[index].id, { node, config: enabledEffects[index] });
    });

    // Connect chain: masterInput → effects[0] → effects[n] → [amigaFilter] → masterChannel
    this.masterInput.connect(this.masterEffectsNodes[0]);

    for (let i = 0; i < this.masterEffectsNodes.length - 1; i++) {
      this.masterEffectsNodes[i].connect(this.masterEffectsNodes[i + 1]);
    }

    // Final effect connects to Amiga filter (if enabled) or directly to master channel
    this.masterEffectsNodes[this.masterEffectsNodes.length - 1].connect(getFinalOutput());

  }

  /**
   * Update parameters for a single master effect
   * Called when effect parameters change (wet, specific params)
   */
  public updateMasterEffectParams(effectId: string, config: EffectConfig): void {
    const effectData = this.masterEffectConfigs.get(effectId);
    if (!effectData) {
      console.warn('[ToneEngine] Effect not found for update:', effectId);
      return;
    }

    const { node } = effectData;
    const wetValue = config.wet / 100;

    try {
      // Update wet/dry if the effect supports it
      if ('wet' in node && node.wet instanceof Tone.Signal) {
        node.wet.value = wetValue;
      }

      // Update specific parameters based on effect type
      this.applyEffectParameters(node, config);

      // Update stored config
      effectData.config = config;

    } catch (error) {
      console.error('[ToneEngine] Failed to update effect params:', error);
    }
  }

  /**
   * Apply effect-specific parameters to a node
   */
  private applyEffectParameters(node: Tone.ToneAudioNode, config: EffectConfig): void {
    const params = config.parameters;

    switch (config.type) {
      case 'Distortion':
        if (node instanceof Tone.Distortion) {
          node.distortion = params.drive as any ?? 0.4;
          node.oversample = params.oversample as any ?? 'none';
        }
        break;

      case 'Reverb':
        // Reverb decay can't be changed after creation, would need rebuild
        break;

      case 'Delay':
      case 'FeedbackDelay':
        if (node instanceof Tone.FeedbackDelay) {
          node.delayTime.value = params.time as any ?? 0.25;
          node.feedback.value = params.feedback as any ?? 0.5;
        }
        break;

      case 'Chorus':
        if (node instanceof Tone.Chorus) {
          node.frequency.value = params.frequency as any ?? 1.5;
          node.depth = params.depth as any ?? 0.7;
        }
        break;

      case 'Phaser':
        if (node instanceof Tone.Phaser) {
          node.frequency.value = params.frequency as any ?? 0.5;
          node.octaves = params.octaves as any ?? 3;
        }
        break;

      case 'Tremolo':
        if (node instanceof Tone.Tremolo) {
          node.frequency.value = params.frequency as any ?? 10;
          node.depth.value = params.depth as any ?? 0.5;
        }
        break;

      case 'Vibrato':
        if (node instanceof Tone.Vibrato) {
          node.frequency.value = params.frequency as any ?? 5;
          node.depth.value = params.depth as any ?? 0.1;
        }
        break;

      case 'BitCrusher':
        if (node instanceof Tone.BitCrusher) {
          node.bits.value = params.bits as any ?? 4;
        }
        break;

      case 'PingPongDelay':
        if (node instanceof Tone.PingPongDelay) {
          node.delayTime.value = params.time as any ?? 0.25;
          node.feedback.value = params.feedback as any ?? 0.5;
        }
        break;

      case 'PitchShift':
        if (node instanceof Tone.PitchShift) {
          node.pitch = params.pitch as any ?? 0;
        }
        break;

      case 'Compressor':
        if (node instanceof Tone.Compressor) {
          node.threshold.value = params.threshold as any ?? -24;
          node.ratio.value = params.ratio as any ?? 12;
          node.attack.value = params.attack as any ?? 0.003;
          node.release.value = params.release as any ?? 0.25;
        }
        break;

      case 'EQ3':
        if (node instanceof Tone.EQ3) {
          node.low.value = params.low as any ?? 0;
          node.mid.value = params.mid as any ?? 0;
          node.high.value = params.high as any ?? 0;
        }
        break;

      case 'Filter':
        if (node instanceof Tone.Filter) {
          node.frequency.value = params.frequency as any ?? 350;
          node.Q.value = params.Q as any ?? 1;
        }
        break;

      case 'AutoFilter':
        if (node instanceof Tone.AutoFilter) {
          node.frequency.value = params.frequency as any ?? 1;
          node.baseFrequency = params.baseFrequency as any ?? 200;
          node.octaves = params.octaves as any ?? 2.6;
        }
        break;

      case 'AutoPanner':
        if (node instanceof Tone.AutoPanner) {
          node.frequency.value = params.frequency as any ?? 1;
          node.depth.value = params.depth as any ?? 1;
        }
        break;

      case 'StereoWidener':
        if (node instanceof Tone.StereoWidener) {
          node.width.value = params.width as any ?? 0.5;
        }
        break;
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
  private createVoice(channelIndex: number, instrument: any, note: string, config: InstrumentConfig): VoiceState {
    const channelOutput = this.channelOutputs.get(channelIndex);
    if (!channelOutput) throw new Error(`Channel ${channelIndex} not initialized`);

    const gain = new Tone.Gain(1);
    
    // Hardware Quirk: Use IT-specific high-fidelity filter for IT modules
    let filter: any;
    const isIT = config.metadata?.importedFrom === 'IT';
    
    if (isIT && ToneEngine.itFilterWorkletLoaded) {
      filter = new AudioWorkletNode(Tone.getContext().rawContext, 'it-filter-processor');
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
    
    panner.connect(channelOutput.input);

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
      isFilterEnvelope: envs?.pitchEnvelope?.type === 'filter',
      lastCutoff: 127,
      lastResonance: 0,
      nodes: { gain, filter, panner }
    };
  }

  /**
   * Helper to stop a specific voice
   */
  private stopVoice(voice: VoiceState, time: number): void {
    if (voice.instrument.stop) voice.instrument.stop(time);
    else if (voice.instrument.triggerRelease) voice.instrument.triggerRelease(time);
    
    // Dispose nodes after a short delay to allow for audio tail/clipping prevention
    setTimeout(() => {
      voice.nodes.gain.dispose();
      voice.nodes.filter.dispose();
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
        const originalLoopStart = (player as any)._originalLoopStart ?? player.loopStart;
        if ((player as any)._originalLoopStart === undefined) {
          (player as any)._originalLoopStart = player.loopStart;
        }

        // Shift loopStart based on position (approximate behavior)
        const shiftSeconds = (position / 128) * (player.loopEnd as number - originalLoopStart as number);
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
  private applyPitchToNode(node: any, pitchMultiplier: number, baseRate: number, instrumentKey: string): void {
    const synthType = this.instrumentSynthTypes.get(instrumentKey);
    const cents = 1200 * Math.log2(pitchMultiplier);

    if (node instanceof Tone.Player || node instanceof Tone.GrainPlayer) {
      (node as any).playbackRate = baseRate * pitchMultiplier;
    } else if (synthType === 'Sampler') {
      if (node.detune !== undefined) node.detune.value = cents;
    } else {
      // For synths: use detune property
      if (node.detune !== undefined && node.detune instanceof Tone.Signal) {
        node.detune.value = cents;
      } else if (node.oscillator?.detune !== undefined) {
        node.oscillator.detune.value = cents;
      } else if (node.detune !== undefined) {
        node.detune = cents; // Primitive
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
    instrumentKey: string,
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
  // PERF: Reusable array for getChannelTriggerLevels to avoid GC pressure
  private triggerLevelsCache: number[] = [];

  /**
   * Trigger a channel's VU meter (called when a note plays on that channel)
   */
  public triggerChannelMeter(channelIndex: number, velocity: number): void {
    this.channelTriggerLevels.set(channelIndex, Math.min(1, velocity * 1.2));
  }

  /**
   * Get channel trigger levels for VU meters (real-time note triggers)
   * PERF: Reuses internal array to avoid allocations every frame
   */
  public getChannelTriggerLevels(numChannels: number): number[] {
    // Resize cache array if needed (only allocates when channel count changes)
    if (this.triggerLevelsCache.length !== numChannels) {
      this.triggerLevelsCache = new Array(numChannels).fill(0);
    }

    for (let i = 0; i < numChannels; i++) {
      const current = this.channelTriggerLevels.get(i) || 0;
      this.triggerLevelsCache[i] = current;

      // Decay the trigger level
      if (current > 0) {
        const decayed = current * 0.85;
        this.channelTriggerLevels.set(i, decayed < 0.01 ? 0 : decayed);
      }
    }
    return this.triggerLevelsCache;
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
    let tb303Count = 0;
    this.instruments.forEach((instrument, _key) => {
      if (instrument instanceof TB303Synth) {
        instrument.setQuality(quality);
        tb303Count++;
      }
    });

    // For PolySynths, we need to track which ones need recreation
    // Store configs so we can recreate them with new polyphony settings
    const polySynthsToRecreate: Array<{
      key: string;
      instrumentId: number;
      channelIndex: number | undefined;
      config: any;
    }> = [];

    this.instruments.forEach((instrument, key) => {
      // Check if it's a PolySynth (has maxPolyphony property)
      if (instrument && typeof instrument === 'object' && 'maxPolyphony' in instrument) {
        // Parse key to get instrumentId and channelIndex
        const parts = key.split('-');
        const instrumentId = parseInt(parts[0], 10);
        const channelIndex = parts[1] === '-1' ? undefined : parseInt(parts[1], 10);

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
          if ((voice.instrument as any).detune !== undefined) {
            (voice.instrument as any).detune.value = semitoneOffset * 100;
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
        voice.nodes.filter.dispose();
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
