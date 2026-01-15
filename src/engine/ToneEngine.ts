// @ts-nocheck - Tone.js API type issues need resolution
/**
 * ToneEngine - Tone.js Audio Engine Wrapper
 * Manages Tone.js lifecycle, instruments, master effects, and audio context
 */

import * as Tone from 'tone';
import type { InstrumentConfig, EffectConfig } from '@typedefs/instrument';
import { DEFAULT_TB303 } from '@typedefs/instrument';
import { TB303Synth } from './TB303Engine';
import { InstrumentFactory } from './InstrumentFactory';

export class ToneEngine {
  private static instance: ToneEngine | null = null;

  // Master routing chain: instruments → masterInput → masterEffects → masterChannel → analyzers → destination
  public masterInput: Tone.Gain; // Where instruments connect
  public masterChannel: Tone.Channel; // Final output with volume/pan
  public analyser: Tone.Analyser;
  public fft: Tone.FFT;
  // Instruments keyed by "instrumentId-channelIndex" for per-channel independence
  public instruments: Map<string, Tone.PolySynth | Tone.Synth | any>;

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

  // Per-instrument effect chains (keyed by composite string "instrumentId-channelIndex")
  private instrumentEffectChains: Map<string | number, {
    effects: Tone.ToneAudioNode[];
    output: Tone.Gain;
  }> = new Map();

  private constructor() {
    // Master input (where all instruments connect)
    this.masterInput = new Tone.Gain(1);

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

    // Default routing: masterInput → masterChannel (no effects)
    this.masterInput.connect(this.masterChannel);

    // Instrument map
    this.instruments = new Map();
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
   * Initialize audio context (must be called after user interaction)
   */
  public async init(): Promise<void> {
    console.log('[ToneEngine] init() called, context state:', Tone.getContext().state);
    if (Tone.getContext().state === 'suspended') {
      await Tone.start();
      console.log('[ToneEngine] Audio context started successfully', {
        contextState: Tone.getContext().state,
        sampleRate: Tone.getContext().sampleRate,
        currentTime: Tone.getContext().currentTime
      });
    } else {
      console.log('[ToneEngine] Audio context already running');
    }

    // Configure Transport lookahead for reliable scheduling at high BPMs
    // Higher lookahead = more latency but more reliable timing
    const transport = Tone.getTransport();
    transport.context.lookAhead = 0.1; // 100ms lookahead (default is ~0.05)
    console.log('[ToneEngine] Transport lookahead set to:', transport.context.lookAhead);
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
    console.log('[ToneEngine] Preloading', configs.length, 'instruments...');

    // First, dispose any existing instruments to start fresh
    configs.forEach((config) => {
      if (this.instruments.has(config.id)) {
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
      console.log('[ToneEngine] Waiting for', samplerConfigs.length, 'samples to load...');
      try {
        await Tone.loaded();
        console.log('[ToneEngine] All samples loaded successfully');
      } catch (error) {
        console.error('[ToneEngine] Some samples failed to load:', error);
      }
    }

    console.log('[ToneEngine] Preload complete:', this.instruments.size, 'instruments ready');
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
      console.log('[ToneEngine] Resuming suspended audio context...');
      await Tone.start();
    }

    Tone.getTransport().start();
    console.log('[ToneEngine] Transport started', {
      bpm: Tone.getTransport().bpm.value,
      position: Tone.getTransport().position,
      state: Tone.getTransport().state,
      contextState: Tone.getContext().state
    });
  }

  /**
   * Stop transport
   */
  public stop(): void {
    Tone.getTransport().stop();
    console.log('[ToneEngine] Transport stopped');
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

  /**
   * Create or get instrument (per-channel to avoid automation conflicts)
   */
  public getInstrument(instrumentId: number, config: InstrumentConfig, channelIndex?: number): Tone.PolySynth | Tone.Synth | any {
    const key = this.getInstrumentKey(instrumentId, channelIndex);

    // Check if instrument already exists for this channel
    if (this.instruments.has(key)) {
      return this.instruments.get(key);
    }

    // Create new instrument based on config
    let instrument: any;

    switch (config.synthType) {
      case 'Synth':
        instrument = new Tone.PolySynth(Tone.Synth, {
          maxPolyphony: 16, // Increased for high BPM playback
          oscillator: {
            type: config.oscillator?.type || 'sawtooth',
          },
          envelope: {
            attack: (config.envelope?.attack || 10) / 1000,
            decay: (config.envelope?.decay || 200) / 1000,
            sustain: (config.envelope?.sustain || 50) / 100,
            release: (config.envelope?.release || 1000) / 1000,
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
            attack: (config.envelope?.attack || 10) / 1000,
            decay: (config.envelope?.decay || 200) / 1000,
            sustain: (config.envelope?.sustain || 50) / 100,
            release: (config.envelope?.release || 1000) / 1000,
          },
          volume: config.volume || -12,
        });
        break;

      case 'DuoSynth':
        instrument = new Tone.DuoSynth({
          voice0: {
            oscillator: { type: config.oscillator?.type || 'sawtooth' },
            envelope: {
              attack: (config.envelope?.attack || 10) / 1000,
              decay: (config.envelope?.decay || 200) / 1000,
              sustain: (config.envelope?.sustain || 50) / 100,
              release: (config.envelope?.release || 1000) / 1000,
            },
          },
          voice1: {
            oscillator: { type: config.oscillator?.type || 'sawtooth' },
            envelope: {
              attack: (config.envelope?.attack || 10) / 1000,
              decay: (config.envelope?.decay || 200) / 1000,
              sustain: (config.envelope?.sustain || 50) / 100,
              release: (config.envelope?.release || 1000) / 1000,
            },
          },
          vibratoAmount: config.oscillator?.detune ? config.oscillator.detune / 100 : 0.5,
          vibratoRate: 5,
          volume: config.volume || -12,
        });
        break;

      case 'FMSynth':
        instrument = new Tone.PolySynth(Tone.FMSynth, {
          maxPolyphony: 16, // Increased for high BPM playback
          oscillator: { type: config.oscillator?.type || 'sine' },
          envelope: {
            attack: (config.envelope?.attack || 10) / 1000,
            decay: (config.envelope?.decay || 200) / 1000,
            sustain: (config.envelope?.sustain || 50) / 100,
            release: (config.envelope?.release || 1000) / 1000,
          },
          modulationIndex: 10,
          volume: config.volume || -12,
        });
        break;

      case 'AMSynth':
        instrument = new Tone.PolySynth(Tone.AMSynth, {
          maxPolyphony: 16, // Increased for high BPM playback
          oscillator: { type: config.oscillator?.type || 'sine' },
          envelope: {
            attack: (config.envelope?.attack || 10) / 1000,
            decay: (config.envelope?.decay || 200) / 1000,
            sustain: (config.envelope?.sustain || 50) / 100,
            release: (config.envelope?.release || 1000) / 1000,
          },
          volume: config.volume || -12,
        });
        break;

      case 'PluckSynth':
        instrument = new Tone.PolySynth(Tone.PluckSynth, {
          maxPolyphony: 16, // Increased for high BPM playback
          attackNoise: 1,
          dampening: config.filter?.frequency || 4000,
          resonance: 0.7,
          volume: config.volume || -12,
        });
        break;

      case 'MetalSynth':
        instrument = new Tone.MetalSynth({
          envelope: {
            attack: (config.envelope?.attack || 1) / 1000,
            decay: (config.envelope?.decay || 100) / 1000,
            release: (config.envelope?.release || 100) / 1000,
          },
          volume: config.volume || -12,
        });
        break;

      case 'MembraneSynth':
        instrument = new Tone.MembraneSynth({
          pitchDecay: 0.05,
          octaves: 10,
          oscillator: { type: config.oscillator?.type || 'sine' },
          envelope: {
            attack: (config.envelope?.attack || 1) / 1000,
            decay: (config.envelope?.decay || 400) / 1000,
            sustain: 0.01,
            release: (config.envelope?.release || 100) / 1000,
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
            attack: (config.envelope?.attack || 10) / 1000,
            decay: (config.envelope?.decay || 200) / 1000,
            sustain: (config.envelope?.sustain || 50) / 100,
            release: (config.envelope?.release || 1000) / 1000,
          },
          volume: config.volume || -12,
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
        console.log('[ToneEngine] Creating TB-303 instrument', { instrumentId, config });
        if (config.tb303) {
          instrument = new TB303Synth(config.tb303);
          instrument.setVolume(config.volume || -12);
        } else {
          // Fallback if no TB-303 config
          instrument = new TB303Synth(DEFAULT_TB303);
          instrument.setVolume(config.volume || -12);
        }
        console.log('[ToneEngine] TB-303 created successfully');
        break;

      case 'Sampler': {
        // Sample-based instrument - loads a sample URL and pitches it
        const sampleUrl = config.parameters?.sampleUrl;
        console.log('[ToneEngine] Creating Sampler instrument', { instrumentId, hasSample: !!sampleUrl });

        if (sampleUrl) {
          instrument = new Tone.Sampler({
            urls: {
              C4: sampleUrl,  // Map sample to C4, will be pitched for other notes
            },
            volume: config.volume || -12,
            onload: () => {
              console.log(`[ToneEngine] Sampler ${instrumentId} sample loaded successfully`);
            },
            onerror: (err: Error) => {
              console.error(`[ToneEngine] Sampler ${instrumentId} failed to load sample:`, err);
            },
          });
        } else {
          // No sample - create empty sampler (will be silent)
          console.warn(`[ToneEngine] Sampler ${instrumentId} has no sample URL`);
          instrument = new Tone.Sampler({
            volume: config.volume || -12,
          });
        }
        break;
      }

      case 'Player': {
        // One-shot player (doesn't pitch)
        const playerUrl = config.parameters?.sampleUrl;
        console.log('[ToneEngine] Creating Player instrument', { instrumentId, hasSample: !!playerUrl });

        if (playerUrl) {
          instrument = new Tone.Player({
            url: playerUrl,
            volume: config.volume || -12,
            onload: () => {
              console.log(`[ToneEngine] Player ${instrumentId} sample loaded successfully`);
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

      default:
        // Default to basic synth
        instrument = new Tone.PolySynth(Tone.Synth, {
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

    // Create instrument effect chain and connect (use composite key to avoid disconnecting other channels)
    this.buildInstrumentEffectChain(key, config.effects || [], instrument);

    console.log('[ToneEngine] Instrument created with effect chain', {
      instrumentId,
      channelIndex,
      key,
      synthType: config.synthType,
      effectCount: config.effects?.length || 0,
      masterVolume: this.masterChannel.volume.value,
      masterMuted: this.masterChannel.mute
    });

    return instrument;
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
    try {
      switch (parameter) {
        case 'cutoff':
          // Map 0-1 to 200-20000 Hz (logarithmic)
          if (instrument instanceof TB303Synth) {
            const cutoffHz = 200 * Math.pow(100, value); // 200 to 20000 Hz
            instrument.setCutoff(cutoffHz);
          } else if (instrument.filter) {
            const cutoffHz = 200 * Math.pow(100, value);
            instrument.filter.frequency.setValueAtTime(cutoffHz, Tone.now());
          }
          break;

        case 'resonance':
          // Map 0-1 to 0-100%
          if (instrument instanceof TB303Synth) {
            instrument.setResonance(value * 100);
          } else if (instrument.filter) {
            instrument.filter.Q.setValueAtTime(value * 10, Tone.now());
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
          instrument.volume.setValueAtTime(volumeDb, Tone.now());
          break;

        case 'pan':
          // Map 0-1 to -1 to +1 (left to right)
          const panValue = value * 2 - 1;
          if (instrument.pan) {
            instrument.pan.setValueAtTime(panValue, Tone.now());
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
  public triggerNoteAttack(
    instrumentId: number,
    note: string,
    time: number,
    velocity: number = 1,
    config: InstrumentConfig
  ): void {
    const instrument = this.getInstrument(instrumentId, config);

    if (!instrument || !instrument.triggerAttack) {
      return;
    }

    try {
      if (config.synthType === 'NoiseSynth') {
        // NoiseSynth.triggerAttack(time, velocity) - no note
        (instrument as Tone.NoiseSynth).triggerAttack(time, velocity);
      } else {
        instrument.triggerAttack(note, time, velocity);
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
    config: InstrumentConfig
  ): void {
    const instrument = this.getInstrument(instrumentId, config);

    if (!instrument || !instrument.triggerRelease) {
      return;
    }

    try {
      if (config.synthType === 'NoiseSynth') {
        // NoiseSynth.triggerRelease(time) - no note
        (instrument as Tone.NoiseSynth).triggerRelease(time);
      } else {
        instrument.triggerRelease(note, time);
      }
    } catch (error) {
      console.error(`[ToneEngine] Error in triggerNoteRelease for ${config.synthType}:`, error);
    }
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

    if (instrument && instrument.triggerRelease) {
      instrument.triggerRelease(note, time || Tone.now());
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
    channelIndex?: number
  ): void {
    const instrument = this.getInstrument(instrumentId, config, channelIndex);

    if (!instrument || !instrument.triggerAttackRelease) {
      return;
    }

    try {
      // Handle different synth types with their specific APIs
      if (instrument instanceof TB303Synth) {
        // TB-303 has accent/slide support
        instrument.triggerAttackRelease(note, duration, time, velocity, accent, slide);
      } else if (config.synthType === 'NoiseSynth') {
        // NoiseSynth doesn't take note parameter: triggerAttackRelease(duration, time, velocity)
        (instrument as Tone.NoiseSynth).triggerAttackRelease(duration, time, velocity);
      } else if (config.synthType === 'MetalSynth') {
        // MetalSynth: triggerAttackRelease(note, duration, time, velocity)
        // Note controls the frequency, use time properly
        (instrument as Tone.MetalSynth).triggerAttackRelease(note, duration, time, velocity);
      } else if (config.synthType === 'MembraneSynth') {
        // MembraneSynth: triggerAttackRelease(note, duration, time, velocity)
        (instrument as Tone.MembraneSynth).triggerAttackRelease(note, duration, time, velocity);
      } else {
        // Standard synths (Synth, MonoSynth, FMSynth, AMSynth, PluckSynth, DuoSynth, PolySynth)
        instrument.triggerAttackRelease(note, duration, time, velocity);
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
   * Release all notes
   */
  public releaseAll(): void {
    this.instruments.forEach((instrument) => {
      if (instrument.releaseAll) {
        instrument.releaseAll();
      }
    });
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
        } catch (e) {
          // May already be disposed
        }
        keysToDelete.push(key);
      }
    });

    // Delete the keys after iteration
    keysToDelete.forEach(key => this.instruments.delete(key));

    if (keysToDelete.length > 0) {
      console.log(`[ToneEngine] Disposed ${keysToDelete.length} channel instances for instrument ${instrumentId}`);
    }
  }

  /**
   * Invalidate instrument (force recreation on next use)
   * Call this when instrument config changes
   */
  public invalidateInstrument(instrumentId: number): void {
    console.log('[ToneEngine] Invalidating instrument', instrumentId);
    this.disposeInstrument(instrumentId);
  }

  /**
   * Update instrument with new config (dispose old, create new)
   */
  public updateInstrument(instrumentId: number, config: InstrumentConfig): void {
    console.log('[ToneEngine] Updating instrument', instrumentId, config.synthType);
    // Dispose old instrument
    this.disposeInstrument(instrumentId);
    // Create new instrument with updated config
    this.getInstrument(instrumentId, config);
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
      console.warn('[ToneEngine] Cannot update TB303 parameters - no TB303 instances found for instrument', instrumentId);
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

    console.log('[ToneEngine] Updated TB303 parameters for', synths.length, 'instances of instrument', instrumentId);
  }

  /**
   * Dispose of all resources
   */
  public dispose(): void {
    this.stop();
    this.clearSchedule();

    // Dispose all instrument effect chains
    this.instrumentEffectChains.forEach((chain, instrumentId) => {
      chain.effects.forEach((fx) => {
        try { fx.dispose(); } catch (e) {}
      });
      try { chain.output.dispose(); } catch (e) {}
    });
    this.instrumentEffectChains.clear();

    // Dispose all instruments
    this.instruments.forEach((instrument) => {
      try { instrument.dispose(); } catch (e) {}
    });
    this.instruments.clear();

    // Dispose channel outputs
    this.disposeChannelOutputs();

    // Dispose master effects
    this.masterEffectsNodes.forEach((node) => {
      try {
        node.dispose();
      } catch (e) {
        // Node may already be disposed
      }
    });
    this.masterEffectsNodes = [];
    this.masterEffectConfigs.clear();

    // Dispose master channel and analyzers
    this.analyser.dispose();
    this.fft.dispose();
    this.masterInput.dispose();
    this.masterChannel.dispose();

    ToneEngine.instance = null;
  }

  // ============================================================================
  // INSTRUMENT EFFECTS CHAIN MANAGEMENT
  // ============================================================================

  /**
   * Build or rebuild an instrument's effect chain
   * Route: instrument → effects → masterInput
   * @param key - Composite key (instrumentId-channelIndex) for per-channel chains
   */
  private buildInstrumentEffectChain(
    key: string | number,
    effects: EffectConfig[],
    instrument: Tone.ToneAudioNode
  ): void {
    // Dispose existing effect chain if any
    const existing = this.instrumentEffectChains.get(key);
    if (existing) {
      existing.effects.forEach((fx) => {
        try {
          fx.disconnect();
          fx.dispose();
        } catch (e) {
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

    // Create effect nodes
    const effectNodes = enabledEffects.map((config) => InstrumentFactory.createEffect(config));

    // Connect: instrument → effects[0] → effects[n] → output → masterInput
    instrument.connect(effectNodes[0]);

    for (let i = 0; i < effectNodes.length - 1; i++) {
      effectNodes[i].connect(effectNodes[i + 1]);
    }

    effectNodes[effectNodes.length - 1].connect(output);
    output.connect(this.masterInput);

    this.instrumentEffectChains.set(key, { effects: effectNodes, output });

    console.log(`[ToneEngine] Instrument ${key} effect chain built:`,
      enabledEffects.map((e) => e.type).join(' → ') || 'direct');
  }

  /**
   * Rebuild an instrument's effect chain (public method for store to call)
   */
  public rebuildInstrumentEffects(instrumentId: number, effects: EffectConfig[]): void {
    const instrument = this.instruments.get(instrumentId);
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

    // Build new effect chain
    this.buildInstrumentEffectChain(instrumentId, effects, instrument);
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
        } catch (e) {
          // Node may already be disposed
        }
      });
      try {
        chain.output.dispose();
      } catch (e) {
        // Node may already be disposed
      }
      this.instrumentEffectChains.delete(key);
    }
  }

  // ============================================================================
  // MASTER EFFECTS CHAIN MANAGEMENT
  // ============================================================================

  /**
   * Rebuild entire master effects chain from config array
   * Called when effects are added, removed, or reordered
   */
  public rebuildMasterEffects(effects: EffectConfig[]): void {
    console.log('[ToneEngine] Rebuilding master effects chain', effects.length, 'effects');

    // Disconnect current chain
    this.masterInput.disconnect();
    this.masterEffectsNodes.forEach((node) => {
      try {
        node.disconnect();
        node.dispose();
      } catch (e) {
        // Node may already be disposed
      }
    });
    this.masterEffectsNodes = [];
    this.masterEffectConfigs.clear();

    // Filter to only enabled effects
    const enabledEffects = effects.filter((fx) => fx.enabled);

    if (enabledEffects.length === 0) {
      // No effects - direct connection
      this.masterInput.connect(this.masterChannel);
      console.log('[ToneEngine] No master effects, direct routing');
      return;
    }

    // Create effect nodes
    enabledEffects.forEach((config) => {
      const node = InstrumentFactory.createEffect(config);
      this.masterEffectsNodes.push(node);
      this.masterEffectConfigs.set(config.id, { node, config });
    });

    // Connect chain: masterInput → effects[0] → effects[n] → masterChannel
    this.masterInput.connect(this.masterEffectsNodes[0]);

    for (let i = 0; i < this.masterEffectsNodes.length - 1; i++) {
      this.masterEffectsNodes[i].connect(this.masterEffectsNodes[i + 1]);
    }

    this.masterEffectsNodes[this.masterEffectsNodes.length - 1].connect(this.masterChannel);

    console.log('[ToneEngine] Master effects chain rebuilt:', enabledEffects.map((e) => e.type).join(' → '));
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

      console.log('[ToneEngine] Updated master effect:', config.type, config.parameters);
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
          node.distortion = params.drive ?? 0.4;
          node.oversample = params.oversample ?? 'none';
        }
        break;

      case 'Reverb':
        // Reverb decay can't be changed after creation, would need rebuild
        break;

      case 'Delay':
      case 'FeedbackDelay':
        if (node instanceof Tone.FeedbackDelay) {
          node.delayTime.value = params.time ?? 0.25;
          node.feedback.value = params.feedback ?? 0.5;
        }
        break;

      case 'Chorus':
        if (node instanceof Tone.Chorus) {
          node.frequency.value = params.frequency ?? 1.5;
          node.depth = params.depth ?? 0.7;
        }
        break;

      case 'Phaser':
        if (node instanceof Tone.Phaser) {
          node.frequency.value = params.frequency ?? 0.5;
          node.octaves = params.octaves ?? 3;
        }
        break;

      case 'Tremolo':
        if (node instanceof Tone.Tremolo) {
          node.frequency.value = params.frequency ?? 10;
          node.depth.value = params.depth ?? 0.5;
        }
        break;

      case 'Vibrato':
        if (node instanceof Tone.Vibrato) {
          node.frequency.value = params.frequency ?? 5;
          node.depth.value = params.depth ?? 0.1;
        }
        break;

      case 'BitCrusher':
        if (node instanceof Tone.BitCrusher) {
          node.bits.value = params.bits ?? 4;
        }
        break;

      case 'PingPongDelay':
        if (node instanceof Tone.PingPongDelay) {
          node.delayTime.value = params.time ?? 0.25;
          node.feedback.value = params.feedback ?? 0.5;
        }
        break;

      case 'PitchShift':
        if (node instanceof Tone.PitchShift) {
          node.pitch = params.pitch ?? 0;
        }
        break;

      case 'Compressor':
        if (node instanceof Tone.Compressor) {
          node.threshold.value = params.threshold ?? -24;
          node.ratio.value = params.ratio ?? 12;
          node.attack.value = params.attack ?? 0.003;
          node.release.value = params.release ?? 0.25;
        }
        break;

      case 'EQ3':
        if (node instanceof Tone.EQ3) {
          node.low.value = params.low ?? 0;
          node.mid.value = params.mid ?? 0;
          node.high.value = params.high ?? 0;
        }
        break;

      case 'Filter':
        if (node instanceof Tone.Filter) {
          node.frequency.value = params.frequency ?? 350;
          node.Q.value = params.Q ?? 1;
        }
        break;

      case 'AutoFilter':
        if (node instanceof Tone.AutoFilter) {
          node.frequency.value = params.frequency ?? 1;
          node.baseFrequency = params.baseFrequency ?? 200;
          node.octaves = params.octaves ?? 2.6;
        }
        break;

      case 'AutoPanner':
        if (node instanceof Tone.AutoPanner) {
          node.frequency.value = params.frequency ?? 1;
          node.depth.value = params.depth ?? 1;
        }
        break;

      case 'StereoWidener':
        if (node instanceof Tone.StereoWidener) {
          node.width.value = params.width ?? 0.5;
        }
        break;
    }
  }

  // ============================================================================
  // PER-CHANNEL ROUTING (VOLUME, PAN, MUTE/SOLO)
  // ============================================================================

  /**
   * Get or create a channel's audio chain
   * Route: channelInput → channel (volume/pan) → masterInput
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

      console.log(`[ToneEngine] Created channel output for channel ${channelIndex}`);
    }

    return this.channelOutputs.get(channelIndex)!.input;
  }

  /**
   * Set channel volume
   */
  public setChannelVolume(channelIndex: number, volumeDb: number): void {
    const channelOutput = this.channelOutputs.get(channelIndex);
    if (channelOutput) {
      channelOutput.channel.volume.value = volumeDb;
    }
  }

  /**
   * Set channel pan
   */
  public setChannelPan(channelIndex: number, pan: number): void {
    const channelOutput = this.channelOutputs.get(channelIndex);
    if (channelOutput) {
      // Convert -100 to 100 range to -1 to 1
      channelOutput.channel.pan.value = pan / 100;
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

    console.log('[ToneEngine] Updated mute states:',
      Array.from(this.channelMuteStates.entries()).map(([ch, muted]) => `ch${ch}:${muted ? 'muted' : 'playing'}`).join(', ')
    );
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
    this.channelOutputs.forEach((channelOutput) => {
      try { channelOutput.meter.dispose(); } catch (e) {}
      try { channelOutput.channel.dispose(); } catch (e) {}
      try { channelOutput.input.dispose(); } catch (e) {}
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

  /**
   * Trigger a channel's VU meter (called when a note plays on that channel)
   */
  public triggerChannelMeter(channelIndex: number, velocity: number): void {
    this.channelTriggerLevels.set(channelIndex, Math.min(1, velocity * 1.2));
  }

  /**
   * Get channel trigger levels for VU meters (real-time note triggers)
   */
  public getChannelTriggerLevels(numChannels: number): number[] {
    const levels: number[] = [];
    for (let i = 0; i < numChannels; i++) {
      levels.push(this.channelTriggerLevels.get(i) || 0);
      // Decay the trigger level
      const current = this.channelTriggerLevels.get(i) || 0;
      if (current > 0) {
        this.channelTriggerLevels.set(i, current * 0.85);
        if (current < 0.01) {
          this.channelTriggerLevels.set(i, 0);
        }
      }
    }
    return levels;
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
}

// Export singleton instance getter
export const getToneEngine = () => ToneEngine.getInstance();
