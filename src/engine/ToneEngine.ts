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
  private static tb303WorkletLoaded: boolean = false; // Track if TB303 worklet is loaded

  // Master routing chain: instruments → masterInput → masterEffects → masterChannel → analyzers → destination
  public masterInput: Tone.Gain; // Where instruments connect
  public masterChannel: Tone.Channel; // Final output with volume/pan
  public analyser: Tone.Analyser;
  public fft: Tone.FFT;
  // Instruments keyed by "instrumentId-channelIndex" for per-channel independence
  public instruments: Map<string, Tone.PolySynth | Tone.Synth | any>;
  // Track synth types for proper release handling
  private instrumentSynthTypes: Map<string, string> = new Map();

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

  // Metronome synth and state
  private metronomeSynth: Tone.MembraneSynth | null = null;
  private metronomeVolume: Tone.Gain | null = null;
  private metronomeEnabled: boolean = false;
  private metronomePart: Tone.Part | null = null;

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
    if (Tone.getContext().state === 'suspended') {
      await Tone.start();
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

    // Configure Transport lookahead for reliable scheduling at high BPMs
    const transport = Tone.getTransport();
    transport.context.lookAhead = 0.1;
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
      try {
        await Tone.loaded();
      } catch (error) {
        console.error('[ToneEngine] Some samples failed to load:', error);
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
    const legacyKey = this.getInstrumentKey(instrumentId, -1);
    if (!isSharedType && this.instruments.has(legacyKey)) {
      return this.instruments.get(legacyKey);
    }

    // Create new instrument based on config
    let instrument: any;

    switch (config.synthType) {
      case 'Synth':
        // Adjust polyphony based on quality level for CPU savings
        const synthPolyphony = this.currentPerformanceQuality === 'high' ? 16 :
                               this.currentPerformanceQuality === 'medium' ? 8 : 4;
        instrument = new Tone.PolySynth(Tone.Synth, {
          maxPolyphony: synthPolyphony,
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
        instrument = new Tone.PolySynth(Tone.FMSynth, {
          maxPolyphony: fmPolyphony,
          oscillator: { type: config.oscillator?.type || 'sine' },
          envelope: {
            attack: (config.envelope?.attack ?? 10) / 1000,
            decay: (config.envelope?.decay ?? 200) / 1000,
            sustain: (config.envelope?.sustain ?? 50) / 100,
            release: (config.envelope?.release ?? 1000) / 1000,
          },
          modulationIndex: 10,
          volume: config.volume || -12,
        });
        break;

      case 'AMSynth':
        // AMSynth has dual oscillators, reduce polyphony on lower quality
        const amPolyphony = this.currentPerformanceQuality === 'high' ? 16 :
                            this.currentPerformanceQuality === 'medium' ? 8 : 4;
        instrument = new Tone.PolySynth(Tone.AMSynth, {
          maxPolyphony: amPolyphony,
          oscillator: { type: config.oscillator?.type || 'sine' },
          envelope: {
            attack: (config.envelope?.attack ?? 10) / 1000,
            decay: (config.envelope?.decay ?? 200) / 1000,
            sustain: (config.envelope?.sustain ?? 50) / 100,
            release: (config.envelope?.release ?? 1000) / 1000,
          },
          volume: config.volume || -12,
        });
        break;

      case 'PluckSynth':
        const pluckPolyphony = this.currentPerformanceQuality === 'high' ? 16 :
                               this.currentPerformanceQuality === 'medium' ? 8 : 4;
        instrument = new Tone.PolySynth(Tone.PluckSynth, {
          maxPolyphony: pluckPolyphony,
          attackNoise: 1,
          dampening: config.filter?.frequency || 4000,
          resonance: 0.7,
          volume: config.volume || -12,
        });
        break;

      case 'MetalSynth':
        instrument = new Tone.MetalSynth({
          envelope: {
            attack: (config.envelope?.attack ?? 1) / 1000,
            decay: (config.envelope?.decay ?? 100) / 1000,
            release: (config.envelope?.release ?? 100) / 1000,
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

        // Prepend BASE_URL for relative paths (handles /DEViLBOX/ prefix in production)
        if (sampleUrl && sampleUrl.startsWith('/') && !sampleUrl.startsWith('//')) {
          const baseUrl = import.meta.env.BASE_URL || '/';
          // Avoid double slashes - BASE_URL includes trailing slash
          sampleUrl = baseUrl.endsWith('/') && sampleUrl.startsWith('/')
            ? baseUrl + sampleUrl.slice(1)
            : baseUrl + sampleUrl;
        }

        if (sampleUrl) {
          // CRITICAL: For looping samples (chiptunes, MOD), use Tone.Player with loop
          // Tone.Sampler doesn't support proper looping for single-cycle waveforms
          if (hasLoop) {
            instrument = new Tone.Player({
              url: sampleUrl,
              loop: true,
              loopStart: loopStart / (config.sample?.sampleRate || 8363), // Convert samples to seconds
              loopEnd: loopEnd / (config.sample?.sampleRate || 8363),
              volume: config.volume || -12,
              onload: () => {
              },
              onerror: (err: Error) => {
                console.error(`[ToneEngine] Looping Player ${instrumentId} failed to load sample:`, err);
              },
            });
            // Store as 'Player' type for proper handling in other methods
            this.instrumentSynthTypes.set(key, 'Player');
          } else {
            // Non-looping: Use Tone.Sampler for pitch shifting
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
      case 'FormantSynth': {
        instrument = InstrumentFactory.createInstrument(config);
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
    // Track the synth type for proper release handling
    this.instrumentSynthTypes.set(key, config.synthType);

    // Create instrument effect chain and connect (fire-and-forget for initial creation)
    // For effect updates, use rebuildInstrumentEffects() which properly awaits
    this.buildInstrumentEffectChain(key, config.effects || [], instrument).catch((error) => {
      console.error('[ToneEngine] Failed to build initial effect chain:', error);
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
  public triggerNoteAttack(
    instrumentId: number,
    note: string,
    time: number,
    velocity: number = 1,
    config: InstrumentConfig,
    period?: number,
    accent?: boolean,
    slide?: boolean
  ): void {
    const instrument = this.getInstrument(instrumentId, config);

    if (!instrument || !instrument.triggerAttack) {
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
        // Check if Sampler has any loaded samples before triggering
        const sampler = instrument as Tone.Sampler;
        if (!sampler.loaded) {
          // Silently skip - no sample loaded yet
          return;
        }
        sampler.triggerAttack(note, safeTime, velocity);
      } else if (config.synthType === 'Player' || config.synthType === 'GranularSynth') {
        // Player/GranularSynth need a buffer loaded
        const player = instrument as Tone.Player | Tone.GrainPlayer;
        if (!player.buffer || !player.buffer.loaded) {
          // Silently skip - no sample loaded yet
          return;
        }

        // Check if this is a MOD/XM sample with period-based playback
        if (config.metadata?.modPlayback?.usePeriodPlayback && period) {
          // Calculate playback rate from Amiga period
          // Formula: frequency = AMIGA_PALFREQUENCY_HALF / period
          //          playbackRate = frequency / audioContext.sampleRate
          const modPlayback = config.metadata.modPlayback;

          // Apply finetune by adjusting period
          // ProTracker finetune: -8 to +7 (each step is ~1/8 semitone)
          // XM finetune: -128 to +127 (finer resolution)
          let finetunedPeriod = period;
          if (modPlayback.finetune !== 0) {
            // Calculate finetune multiplier
            // XM spec: 2^(finetune / 1536) where 1536 = 128 * 12 semitones
            // We use 1536 for XM accuracy
            // Note: finetune > 0 → higher pitch → lower period (divide)
            const finetuneMultiplier = Math.pow(2, modPlayback.finetune / 1536);
            finetunedPeriod = period / finetuneMultiplier; // DIVIDE to get correct direction
          }

          const frequency = modPlayback.periodMultiplier / finetunedPeriod;
          const playbackRate = frequency / Tone.getContext().sampleRate;

          // Set playback rate before starting
          player.playbackRate = playbackRate;
        } else if (config.metadata?.modPlayback?.usePeriodPlayback && !period) {
          // Warn if period-based playback is enabled but no period provided
          console.warn('[ToneEngine] MOD/XM sample expects period but none provided');
        }

        player.start(safeTime);
      } else {
        instrument.triggerAttack(note, safeTime, velocity);
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
        config.synthType === 'TB303'
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
    sampleOffset?: number // 9xx effect: start sample at byte offset
  ): void {
    const instrument = this.getInstrument(instrumentId, config, channelIndex);

    if (!instrument) {
      console.warn(`[ToneEngine] triggerNote: No instrument found for id=${instrumentId} type=${config.synthType}`);
      return;
    }

    // Get safe time for the note
    const safeTime = this.getSafeTime(time);
    if (safeTime === null) {
      console.warn(`[ToneEngine] triggerNote: Audio context not ready`);
      return; // Audio context not ready
    }


    try {
      // Handle different synth types with their specific APIs
      if (instrument instanceof TB303Synth) {
        // TB-303 has accent/slide support
        instrument.triggerAttackRelease(note, duration, safeTime, velocity, accent, slide);
      } else if (config.synthType === 'NoiseSynth') {
        // NoiseSynth doesn't take note parameter: triggerAttackRelease(duration, time, velocity)
        (instrument as Tone.NoiseSynth).triggerAttackRelease(duration, safeTime, velocity);
      } else if (config.synthType === 'MetalSynth') {
        // MetalSynth: triggerAttackRelease(note, duration, time, velocity)
        // Note controls the frequency, use time properly
        (instrument as Tone.MetalSynth).triggerAttackRelease(note, duration, safeTime, velocity);
      } else if (config.synthType === 'MembraneSynth') {
        // MembraneSynth: triggerAttackRelease(note, duration, time, velocity)
        (instrument as Tone.MembraneSynth).triggerAttackRelease(note, duration, safeTime, velocity);
      } else if (config.synthType === 'GranularSynth') {
        // GrainPlayer uses start/stop instead of triggerAttackRelease
        const grainPlayer = instrument as Tone.GrainPlayer;
        if (grainPlayer.buffer && grainPlayer.buffer.loaded) {
          // Check if this is a MOD/XM sample with period-based playback
          if (config.metadata?.modPlayback?.usePeriodPlayback && period) {
            // Calculate playback rate from Amiga period
            const modPlayback = config.metadata.modPlayback;
            let finetunedPeriod = period;

            if (modPlayback.finetune !== 0) {
              // Use ProTracker period table lookup for 100% accuracy
              const { periodToNoteIndex, getPeriod } = require('./effects/PeriodTables');
              const noteIndex = periodToNoteIndex(period, 0);
              if (noteIndex >= 0) {
                // Look up finetuned period from table
                finetunedPeriod = getPeriod(noteIndex, modPlayback.finetune);
              }
            }

            const frequency = modPlayback.periodMultiplier / finetunedPeriod;
            // Use the sample's original rate (8363 Hz for MOD), NOT the audio context rate
            const sampleRate = config.sample?.sampleRate || 8363;
            const playbackRate = frequency / sampleRate;
            grainPlayer.playbackRate = playbackRate * (config.granular?.playbackRate || 1);
          } else {
            // Calculate pitch shift from note (C4 = base pitch)
            const baseNote = Tone.Frequency('C4').toFrequency();
            const targetFreq = Tone.Frequency(note).toFrequency();
            const playbackRate = targetFreq / baseNote;
            grainPlayer.playbackRate = playbackRate * (config.granular?.playbackRate || 1);
          }
          grainPlayer.start(safeTime);
          grainPlayer.stop(safeTime + duration);
        }
      } else if (config.synthType === 'Player' || (config.synthType === 'Sampler' && config.sample?.loop)) {
        // Player uses start instead of triggerAttackRelease
        // Also handle looping Samplers which are converted to Players at creation time
        const player = instrument as Tone.Player;
        if (player.buffer && player.buffer.loaded) {
          // Check if this is a MOD/XM sample with period-based playback
          if (config.metadata?.modPlayback?.usePeriodPlayback && period) {
            // Calculate playback rate from Amiga period
            const modPlayback = config.metadata.modPlayback;
            let finetunedPeriod = period;

            if (modPlayback.finetune !== 0) {
              // Use ProTracker period table lookup for 100% accuracy
              // Import dynamically to avoid circular dependency
              const { periodToNoteIndex, getPeriod } = require('./effects/PeriodTables');
              const noteIndex = periodToNoteIndex(period, 0);
              if (noteIndex >= 0) {
                // Look up finetuned period from table
                finetunedPeriod = getPeriod(noteIndex, modPlayback.finetune);
              }
            }

            const frequency = modPlayback.periodMultiplier / finetunedPeriod;
            // Use the sample's original rate (8363 Hz for MOD), NOT the audio context rate
            const sampleRate = config.sample?.sampleRate || 8363;
            const playbackRate = frequency / sampleRate;
            player.playbackRate = playbackRate;
          } else if (config.metadata?.modPlayback?.usePeriodPlayback && !period) {
            // Warn if period-based playback is enabled but no period provided
            console.warn('[ToneEngine] MOD/XM sample expects period but none provided');
          } else {
            // Normal (non-period) playback - calculate pitch from note
            const baseNote = Tone.Frequency('C4').toFrequency();
            const targetFreq = Tone.Frequency(note).toFrequency();
            const playbackRate = targetFreq / baseNote;
            player.playbackRate = playbackRate;
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

        // CRITICAL DEBUG: Check what's inside the sampler
        const samplerDebug = {
          instrumentId,
          note,
          loaded: sampler.loaded,
          hasSample: !!config.sample,
          sampleUrl: config.sample?.url?.substring(0, 50),
          baseNote: config.sample?.baseNote,
          sampleOffset,
          // Check internal Tone.Sampler state
          samplerHasBuffers: Object.keys((sampler as any)._buffers?._buffers || {}).length > 0,
          samplerBufferKeys: Object.keys((sampler as any)._buffers?._buffers || {}),
        };

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

                offsetPlayer.playbackRate = playbackRate;

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
        if (instrument.triggerAttackRelease) {
          instrument.triggerAttackRelease(note, duration, safeTime, velocity);
        }
      } else if (config.synthType === 'DrumMachine') {
        // DrumMachine - some drum types don't take note parameter
        if (instrument.triggerAttackRelease) {
          instrument.triggerAttackRelease(note, duration, safeTime, velocity);
        }
      } else if (instrument.triggerAttackRelease) {
        // Standard synths (Synth, MonoSynth, FMSynth, AMSynth, PluckSynth, DuoSynth, PolySynth)
        instrument.triggerAttackRelease(note, duration, safeTime, velocity);
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
   * Release all notes and stop all players
   */
  public releaseAll(): void {
    this.instruments.forEach((instrument, key) => {
      try {
        // Handle Player/GrainPlayer - they use stop() not releaseAll()
        if (instrument instanceof Tone.Player || instrument instanceof Tone.GrainPlayer) {
          if (instrument.state === 'started') {
            instrument.stop();
          }
        } else if (instrument.releaseAll) {
          // Synths and Samplers use releaseAll()
          instrument.releaseAll();
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

    const hasNeuralEffect = pedalboard.enabled && pedalboard.chain.some(fx => fx.enabled && fx.type === 'neural');

    // Update all instances
    for (const synth of synths) {
      if (hasNeuralEffect) {
        // Find first enabled neural effect
        const neuralEffect = pedalboard.chain.find(fx => fx.enabled && fx.type === 'neural');
        if (neuralEffect && neuralEffect.modelIndex !== undefined) {
          try {
            // Load GuitarML model and enable
            await synth.setGuitarMLModel(neuralEffect.modelIndex);
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

    // Dispose all instrument effect chains
    this.instrumentEffectChains.forEach((chain, instrumentId) => {
      chain.effects.forEach((fx) => {
        try {
          fx.dispose();
        } catch {
          console.warn(`[ToneEngine] Failed to dispose effect for instrument ${instrumentId}:`, e);
        }
      });
      try {
        chain.output.dispose();
      } catch {
        console.warn(`[ToneEngine] Failed to dispose effect chain output for instrument ${instrumentId}:`, e);
      }
    });
    this.instrumentEffectChains.clear();

    // Dispose all instruments
    this.instruments.forEach((instrument, key) => {
      try {
        instrument.dispose();
      } catch {
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
    const instrument = this.instruments.get(instrumentId);
    if (!instrument) {
      console.warn('[ToneEngine] Cannot rebuild effects - instrument not found:', instrumentId);
      return;
    }

    // Disconnect instrument from current chain
    try {
      instrument.disconnect();
    } catch {
      // May not be connected
    }

    // Build new effect chain (await for neural effects)
    await this.buildInstrumentEffectChain(instrumentId, effects, instrument);
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

    if (enabledEffects.length === 0) {
      // No effects - direct connection
      this.masterInput.connect(this.masterChannel);
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

    // Connect chain: masterInput → effects[0] → effects[n] → masterChannel
    this.masterInput.connect(this.masterEffectsNodes[0]);

    for (let i = 0; i < this.masterEffectsNodes.length - 1; i++) {
      this.masterEffectsNodes[i].connect(this.masterEffectsNodes[i + 1]);
    }

    this.masterEffectsNodes[this.masterEffectsNodes.length - 1].connect(this.masterChannel);

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
  public setChannelPan(channelIndex: number, pan: number | null | undefined): void {
    const channelOutput = this.channelOutputs.get(channelIndex);
    if (channelOutput) {
      // Convert -100 to 100 range to -1 to 1, default to 0 if null/undefined
      const panValue = pan ?? 0;
      channelOutput.channel.pan.value = panValue / 100;
    }
  }

  /**
   * Set channel pitch for ProTracker effects (arpeggio, portamento, vibrato)
   * @param channelIndex - Channel to modify
   * @param pitchMultiplier - Pitch multiplier (1.0 = no change, 2.0 = octave up, 0.5 = octave down)
   */
  public setChannelPitch(channelIndex: number, pitchMultiplier: number): void {
    const pitchState = this.channelPitchState.get(channelIndex);
    if (!pitchState) {
      // Pitch state not initialized - normal for channels without active notes
      return;
    }

    const instrument = this.instruments.get(pitchState.instrumentKey);
    if (!instrument) {
      console.warn(`[ToneEngine] setChannelPitch: No instrument found for key ${pitchState.instrumentKey}`);
      return;
    }

    // Update current pitch multiplier
    pitchState.currentPitchMult = pitchMultiplier;

    // Apply pitch based on instrument type
    const synthType = this.instrumentSynthTypes.get(pitchState.instrumentKey);
    const cents = 1200 * Math.log2(pitchMultiplier);

    if (synthType === 'Player' || synthType === 'GranularSynth') {
      // For Players/GrainPlayers: multiply base playback rate
      const newRate = pitchState.basePlaybackRate * pitchMultiplier;
      if (instrument.playbackRate !== undefined) {
        instrument.playbackRate = newRate;
      }
    } else if (synthType === 'Sampler') {
      // For Sampler: use detune in cents
      if (instrument.detune !== undefined) {
        instrument.detune = cents;
      }
    } else {
      // For synths: use detune property (most Tone.js synths have this)
      let applied = false;
      if (instrument.detune !== undefined) {
        instrument.detune.value = cents;
        applied = true;
      } else if (instrument.oscillator?.detune !== undefined) {
        instrument.oscillator.detune.value = cents;
        applied = true;
      }
      if (applied) {
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
      } catch {
        console.warn(`[ToneEngine] Failed to dispose meter for channel ${channelIndex}:`, e);
      }
      try {
        channelOutput.channel.dispose();
      } catch {
        console.warn(`[ToneEngine] Failed to dispose channel ${channelIndex}:`, e);
      }
      try {
        channelOutput.input.dispose();
      } catch {
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
    this.instruments.forEach((instrument, key) => {
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
