// @ts-nocheck - Unused variable warnings
/**
 * TB303Engine - Roland TB-303 Acid Bass Synthesizer Emulation
 *
 * Improved emulation based on dittytoy's implementation:
 * - Cascaded dual filters for authentic 4-pole response
 * - Better accent behavior (boosts volume + cutoff + envelope)
 * - Improved resonance curve
 * - Overdrive with configurable drive amount
 * - Smoother slide/portamento
 *
 * Devil Fish Mod (Robin Whittle):
 * - Separate Normal/Accent decay controls
 * - VEG (Volume Envelope Generator) with sustain
 * - Filter FM (audio-rate filter modulation)
 * - Filter Tracking (filter follows note pitch)
 * - Sweep Speed control (accent buildup behavior)
 * - High Resonance mode (self-oscillation)
 * - Muffler (soft clipping on VCA output)
 */

import * as Tone from 'tone';
import type { TB303Config, DevilFishConfig } from '@typedefs/instrument';
import { DEFAULT_DEVIL_FISH } from '@typedefs/instrument';
import { GuitarMLEngine } from './GuitarMLEngine';
import type { PerformanceQuality } from '@stores/useUIStore';

export class TB303Synth {
  // Performance quality level
  private qualityLevel: PerformanceQuality = 'high';
  // Oscillator
  private oscillator: Tone.Oscillator;
  private oscillatorAsymmetry: Tone.WaveShaper; // Adds authentic 303 waveform character

  // Cascaded filters for authentic 4-pole response (2x 2-pole = 4-pole)
  private filter1: Tone.Filter;
  private filter2: Tone.Filter;
  private filterEnvelope: Tone.FrequencyEnvelope;

  // Additional filters from Open303 for authentic tone shaping
  private preFilterHP: Tone.Filter;    // 44.486 Hz highpass (pre-filter DC blocker)
  private postFilterHP: Tone.Filter;   // 24.167 Hz highpass (post-filter cleanup)
  private allpassFilter: Tone.Filter;  // 14.008 Hz allpass (phase correction)
  private notchFilter: Tone.Filter;    // 7.5164 Hz notch (rumble removal)

  // VCA
  private vca: Tone.Gain;
  private accentGain: Tone.Gain; // Separate gain for accent boost
  private vcaEnvelope: Tone.AmplitudeEnvelope;
  private vcaBleed: Tone.Gain; // Subtle signal bleed like real 303
  private accentClick: Tone.Gain; // Transient click for accented notes

  // Diode Ladder Filter Saturation
  // Simulates the soft saturation of the real 303's transistor/diode filter
  private filterSaturation: Tone.WaveShaper;

  // Overdrive/Saturation (Simple waveshaper)
  private overdrive: Tone.WaveShaper;
  private overdriveGain: Tone.Gain;
  private overdriveAmount: number = 0;

  // GuitarML Neural Network Overdrive (optional, replaces waveshaper when enabled)
  private guitarML: GuitarMLEngine | null = null;
  private guitarMLEnabled: boolean = false;
  private guitarMLInitialized: boolean = false; // Lazy loading flag
  private guitarMLBypass: Tone.Gain; // For routing: either through GuitarML or bypass

  // Output
  private output: Tone.Gain;

  // === DEVIL FISH ADDITIONS ===
  // Muffler - soft clipping on VCA output
  private muffler: Tone.WaveShaper;
  private mufflerBypass: Tone.Gain;

  // Filter FM - VCA output feeds back to filter frequency
  private filterFMGain: Tone.Gain;
  private filterFMAnalyser: Tone.Analyser;

  // State
  private config: TB303Config;
  private devilFish: DevilFishConfig;
  private currentNote: string | null = null;
  private currentNoteFreq: number = 440;
  private isSliding: boolean = false;
  private baseVolume: number = -6;
  private baseCutoff: number = 800;
  private baseEnvMod: number = 4000;
  private tuningCents: number = 0;
  private currentAccentBoost: number = 0;
  private currentBPM: number = 125; // Track current BPM for tempo-relative mode
  private tempoRelative: boolean = false; // Tempo-relative envelope mode

  // Envelope modulation calibration (from Open303 hardware measurements)
  // These values provide exponential modulation similar to the real TB-303
  private envScaler: number = 1.0;
  private envOffset: number = 0.0;

  // Devil Fish state
  private accentCharge: number = 0; // Capacitor charge for sweep speed
  private lastAccentTime: number = 0;
  private filterFMInterval: number | null = null;

  // Envelope tracking for visualization
  private lastTriggerTime: number = 0;
  private lastTriggerDuration: number = 0;
  private lastEnvOctaves: number = 0;
  private lastFilterDecay: number = 0.2;

  constructor(config: TB303Config) {
    this.config = this.normalizeConfig(config);
    this.devilFish = config.devilFish ? { ...DEFAULT_DEVIL_FISH, ...config.devilFish } : { ...DEFAULT_DEVIL_FISH };
    this.tempoRelative = config.tempoRelative ?? false;
    this.baseCutoff = this.config.filter.cutoff;

    // Calculate initial envelope modulation calibration (Open303-style)
    this.calculateEnvModScalerAndOffset();
    this.baseEnvMod = this.baseCutoff * (this.config.filterEnvelope.envMod / 100) * 10;

    // === OSCILLATOR ===
    // Using Tone.js oscillator - for true polyBLEP would need AudioWorklet
    this.oscillator = new Tone.Oscillator({
      type: this.config.oscillator.type,
      frequency: 440,
    });

    // === OSCILLATOR ASYMMETRY ===
    // Real 303 sawtooth has slight DC offset and asymmetry from analog circuitry
    // This adds warmth and character - subtle but audible
    this.oscillatorAsymmetry = new Tone.WaveShaper((x) => {
      // Add slight DC offset (real 303 has DC coupling issues)
      const dcOffset = 0.02;
      // Subtle asymmetric soft clipping - positive peaks slightly softer
      const asymmetry = x >= 0
        ? x * 0.98 + Math.tanh(x * 0.5) * 0.02
        : x * 1.0;
      return asymmetry + dcOffset;
    }, 4096);

    // === ADDITIONAL FILTERS (from Open303) ===
    // Pre-filter highpass: Removes DC offset and subsonic rumble before main filter
    this.preFilterHP = new Tone.Filter({
      type: 'highpass',
      frequency: 44.486,
      rolloff: -12,
      Q: 0.707, // Butterworth response
    });

    // === CASCADED FILTERS ===
    // Two 2-pole filters in series = 4-pole (24dB/oct) response
    // This gives a more authentic 303 filter sound
    // Quality: Medium/Low uses single filter to save CPU
    const filterQ = this.resonanceToQ(this.config.filter.resonance);

    this.filter1 = new Tone.Filter({
      type: 'lowpass',
      frequency: this.baseCutoff,
      rolloff: -12, // 2-pole
      Q: filterQ,
    });

    this.filter2 = new Tone.Filter({
      type: 'lowpass',
      frequency: this.baseCutoff,
      rolloff: -12, // 2-pole
      Q: filterQ * 0.7, // Slightly lower Q on second stage
    });

    // Post-filter highpass: Final cleanup of subsonic content
    this.postFilterHP = new Tone.Filter({
      type: 'highpass',
      frequency: 24.167,
      rolloff: -12,
      Q: 0.707,
    });

    // Allpass filter: Phase correction at low frequencies
    this.allpassFilter = new Tone.Filter({
      type: 'allpass',
      frequency: 14.008,
      Q: 0.707,
    });

    // Notch filter: Removes specific resonance/rumble frequency
    this.notchFilter = new Tone.Filter({
      type: 'notch',
      frequency: 7.5164,
      Q: 0.5, // Wide notch (4.7 octaves bandwidth approximation)
    });

    // TB-303 MEG (Main Envelope Generator) - Filter Envelope
    // Real 303: ~3ms attack, 200ms-2000ms decay depending on DECAY knob
    this.filterEnvelope = new Tone.FrequencyEnvelope({
      attack: 0.003, // 3ms attack (authentic 303)
      decay: this.config.filterEnvelope.decay / 1000,
      sustain: 0,
      release: 0.01,
      baseFrequency: this.baseCutoff,
      octaves: Math.log2((this.baseCutoff + this.baseEnvMod) / this.baseCutoff),
      exponent: 2,
    });

    // === VCA ===
    this.vca = new Tone.Gain(1);
    this.accentGain = new Tone.Gain(1); // For accent volume boost

    // TB-303 VEG (Volume Envelope Generator)
    // Real 303: ~3ms attack, ~3000ms decay, decays to zero (no sustain)
    // VEG decay is FIXED - independent of filter decay knob
    this.vcaEnvelope = new Tone.AmplitudeEnvelope({
      attack: 0.003, // 3ms attack (authentic 303)
      decay: 3.0, // ~3000ms decay (fixed, like real 303)
      sustain: 0, // Decays fully to zero
      release: 0.05,
    });

    // === VCA BLEED ===
    // Real 303 has very slight signal bleed even when VCA is "closed"
    // This prevents complete silence and adds warmth between notes
    // Typically -60dB to -50dB below full signal
    this.vcaBleed = new Tone.Gain(0.002); // ~-54dB bleed

    // === ACCENT CLICK ===
    // Real 303 accents have a characteristic percussive "click" at attack
    // Caused by the envelope driving the VCA hard with a fast transient
    this.accentClick = new Tone.Gain(0);

    // === DIODE LADDER FILTER SATURATION ===
    // Real 303 filter uses transistors/diodes that have soft saturation
    // This creates warmth and prevents harsh resonance peaks
    // Subtle asymmetric soft clipping to simulate diode nonlinearity
    this.filterSaturation = new Tone.WaveShaper((x) => {
      // Asymmetric soft saturation like real diodes
      // Positive side has slightly more headroom than negative
      const threshold = 0.7;
      if (Math.abs(x) < threshold) {
        return x;
      }
      const sign = x >= 0 ? 1 : -1;
      const asymmetry = x >= 0 ? 1.0 : 0.95; // Slight asymmetry
      const excess = Math.abs(x) - threshold;
      return sign * (threshold + Math.tanh(excess * 2.5) * (1 - threshold) * asymmetry);
    }, 4096);

    // === OVERDRIVE ===
    // Soft clipping with adjustable drive (inspired by dittytoy's approach)
    this.overdriveGain = new Tone.Gain(1);
    this.overdrive = new Tone.WaveShaper((x) => {
      // Soft clipping curve - gets more aggressive with higher input
      const drive = 1 + this.overdriveAmount * 8;
      return Math.tanh(x * drive) / Math.tanh(drive);
    }, 4096);

    // === GUITARML NEURAL NETWORK OVERDRIVE ===
    // Optional neural amp/pedal modeling (replaces waveshaper when enabled)
    this.guitarMLBypass = new Tone.Gain(1);
    this.guitarML = new GuitarMLEngine(Tone.getContext().rawContext as AudioContext);
    this.guitarMLEnabled = false;

    // === DEVIL FISH: MUFFLER ===
    // Soft clipping on VCA output - different character from overdrive
    // Muffler softens loudest extremes while adding square-wave buzz
    // Bass passes largely unaffected
    this.mufflerBypass = new Tone.Gain(1);
    this.muffler = new Tone.WaveShaper((x) => x, 4096); // Start with bypass curve
    this.updateMufflerCurve();

    // === DEVIL FISH: FILTER FM ===
    // VCA output feeds back to filter frequency for audio-rate modulation
    this.filterFMGain = new Tone.Gain(0); // Start with no FM
    this.filterFMAnalyser = new Tone.Analyser('waveform', 256);

    // === OUTPUT ===
    this.output = new Tone.Gain(1);

    // === CONNECT SIGNAL CHAIN (with Open303 filter improvements) ===
    // Oscillator → Asymmetry → PreHP → Filter1 → Filter2 → FilterSaturation → Allpass → PostHP → Notch → OverdriveGain →
    //    → [Overdrive (waveshaper) OR GuitarML] → VCA → Accent → Click → Envelope → Muffler → Output
    //                                                                                      ↓
    //                                                                                    Bleed → Output (parallel path)
    this.oscillator.connect(this.oscillatorAsymmetry);
    this.oscillatorAsymmetry.connect(this.preFilterHP);
    this.preFilterHP.connect(this.filter1);
    this.filter1.connect(this.filter2);
    this.filter2.connect(this.filterSaturation);
    this.filterSaturation.connect(this.allpassFilter);
    this.allpassFilter.connect(this.postFilterHP);
    this.postFilterHP.connect(this.notchFilter);
    this.notchFilter.connect(this.overdriveGain);

    // Overdrive routing: can switch between waveshaper and GuitarML
    // Default: waveshaper path (GuitarML disabled)
    this.overdriveGain.connect(this.overdrive);
    this.overdrive.connect(this.guitarMLBypass);
    this.guitarMLBypass.connect(this.vca);

    this.vca.connect(this.accentGain);
    this.accentGain.connect(this.accentClick);
    this.accentClick.connect(this.vcaEnvelope);
    this.vcaEnvelope.connect(this.muffler);
    this.muffler.connect(this.output);

    // VCA bleed path - bypasses envelope for subtle constant signal
    this.vca.connect(this.vcaBleed);
    this.vcaBleed.connect(this.output);

    // Connect filter envelope to BOTH filters for cascaded sweep
    this.filterEnvelope.connect(this.filter1.frequency);
    this.filterEnvelope.connect(this.filter2.frequency);

    // === DEVIL FISH: FILTER FM FEEDBACK ===
    // Manual: "VCA (which includes the Muffler on its output)" - tap AFTER muffler
    // Use analyser to sample VCA output for filter FM modulation
    this.muffler.connect(this.filterFMAnalyser);
    // Note: Filter FM is implemented via polling (startFilterFMProcessing) rather than
    // direct audio connections because Tone.js Signals don't support direct audio-rate modulation

    // Start oscillator
    this.oscillator.start();

    // Apply initial settings
    this.setVolume(this.baseVolume);
    this.setOverdrive(this.config.overdrive?.amount ?? 0);

    // GuitarML will be lazy-loaded when first enabled
  }

  /**
   * Initialize GuitarML engine (lazy loading)
   */
  private async initializeGuitarML(): Promise<void> {
    if (!this.guitarML || this.guitarMLInitialized) return;

    try {
      await this.guitarML.initialize();

      // Load model if specified in config
      if (this.config.overdrive?.modelIndex !== undefined) {
        await this.guitarML.loadModel(this.config.overdrive.modelIndex);
      }

      // Set initial parameters
      if (this.config.overdrive?.drive !== undefined) {
        this.guitarML.setGain((this.config.overdrive.drive - 50) * 0.36);
        this.guitarML.setCondition(this.config.overdrive.drive / 100);
      }

      // Set dry/wet to 100% (full wet) by default if not specified
      if (this.config.overdrive?.dryWet !== undefined) {
        this.guitarML.setDryWet(this.config.overdrive.dryWet / 100);
      } else {
        this.guitarML.setDryWet(1.0); // 100% wet by default
      }

      this.guitarMLInitialized = true;
    } catch (error) {
      console.error('[TB303Synth] Failed to initialize GuitarML:', error);
      throw error;
    }
  }

  /**
   * Calculate calibrated envelope scaler and offset
   * Based on Open303 hardware measurements for exponential modulation
   *
   * This provides the characteristic TB-303 envelope response where:
   * - Low cutoff frequencies have steeper envelope curves
   * - High cutoff frequencies have gentler envelope curves
   * - Envelope modulation is multiplicative (exponential), not additive
   */
  private calculateEnvModScalerAndOffset(): void {
    // Constants from Open303.cpp measurements (lines 297-304)
    const c0 = 313.8152786059267;   // Lowest nominal cutoff
    const c1 = 2394.411986817546;   // Highest nominal cutoff
    const oF = 0.048292930943553;
    const oC = 0.294391201442418;
    const sLoF = 3.773996325111173;
    const sLoC = 0.736965594166206;
    const sHiF = 4.194548788411135;
    const sHiC = 0.864344900642434;

    // Normalize envelope modulation (0-1)
    const e = (this.config.filterEnvelope.envMod / 100) / 4.0;

    // Normalize cutoff position (0-1)
    const c = Math.log(this.baseCutoff / c0) / Math.log(c1 / c0);

    // Calculate scaler (interpolate between low and high)
    const sLo = sLoF * e + sLoC;
    const sHi = sHiF * e + sHiC;
    this.envScaler = (1.0 - c) * sLo + c * sHi;

    // Calculate offset
    this.envOffset = oF * c + oC;
  }

  /**
   * Convert resonance percentage (0-100) to filter Q value
   * Based on dittytoy: kq = 1 - resonance * 0.9
   * Inverted and mapped to Tone.js Q range
   *
   * TB-303 AUTHENTIC RESONANCE CURVE:
   * Real 303 filter has a characteristic resonance response where:
   * - Low resonance: Gentle peak, warm sound
   * - Mid resonance: Strong "acid" character, not yet self-oscillating
   * - High resonance (>80%): Approaches self-oscillation, filter "sings"
   * - Max resonance: Clean sine wave at cutoff frequency
   */
  private resonanceToQ(resonance: number): number {
    const normalized = resonance / 100;

    // Use a curve that stays musical through the range but allows
    // self-oscillation at very high values (>90%)
    // Real 303 has a "sweet spot" around 60-80% that sounds very acid
    if (normalized < 0.8) {
      // 0-80%: Musical range, exponential curve
      // Range: 0.7 to ~15 (strong resonance but not oscillating)
      return 0.7 + Math.pow(normalized / 0.8, 1.8) * 14.3;
    } else {
      // 80-100%: Transition to self-oscillation range
      // Steeper curve to reach oscillation threshold
      const highNorm = (normalized - 0.8) / 0.2; // 0-1 for 80-100%
      return 15 + Math.pow(highNorm, 1.5) * 20; // 15 to 35
    }
  }

  /**
   * Normalize config with defaults
   */
  private normalizeConfig(config: TB303Config): TB303Config {
    return {
      oscillator: {
        type: config.oscillator?.type || 'sawtooth',
      },
      filter: {
        cutoff: config.filter?.cutoff ?? 800,
        resonance: config.filter?.resonance ?? 50,
      },
      filterEnvelope: {
        envMod: config.filterEnvelope?.envMod ?? 50,
        decay: config.filterEnvelope?.decay ?? 200,
      },
      accent: {
        amount: config.accent?.amount ?? 50,
      },
      slide: {
        time: config.slide?.time ?? 60,
        mode: config.slide?.mode || 'exponential',
      },
      overdrive: {
        amount: config.overdrive?.amount ?? 0,
      },
    };
  }

  /**
   * Trigger note with TB-303 accent and slide behavior
   * Accent behavior based on dittytoy:
   * - Boosts volume by (accent + 1) factor
   * - Boosts filter cutoff
   * - Faster filter envelope decay
   *
   * Devil Fish additions:
   * - Separate Normal/Accent decay times
   * - VEG decay and sustain for infinite notes
   * - Soft attack for non-accented notes
   * - Filter tracking (linear Hz response)
   * - Sweep speed capacitor simulation
   */
  public triggerAttackRelease(
    note: string,
    duration: number | string,
    time?: Tone.Unit.Time,
    velocity: number = 1,
    accent: boolean = false,
    slide: boolean = false
  ): void {
    const now = time !== undefined ? time : Tone.now();
    const currentTime = Tone.now();
    const targetFreq = Tone.Frequency(note).toFrequency();
    this.currentNoteFreq = targetFreq;

    // Handle slide (portamento to new note without retriggering envelopes)
    // In tracker notation: slide flag on current note means "slide FROM previous note TO this note"
    // The previous note does NOT need a slide flag - only the target note does
    //
    // TB-303 AUTHENTIC SLIDE: Real 303 uses RC circuit with ~60ms time constant
    // The slide time is FIXED regardless of interval (C2→C3 same time as C2→C4)
    // This is different from typical portamento which uses V/oct exponential ramps
    if (slide && this.currentNote && this.currentNote !== note) {
      // Fixed ~60ms RC time constant like real 303 (can be adjusted with slide.time knob)
      const slideTimeMs = this.config.slide.time; // Default 60ms
      const slideTimeSec = slideTimeMs / 1000;

      // Use linear ramp for authentic RC circuit behavior
      // RC circuits slew voltage linearly in Hz (not exponentially in V/oct)
      // This makes the slide sound consistent regardless of interval size
      const currentFreq = this.oscillator.frequency.value;
      this.oscillator.frequency.cancelScheduledValues(now);
      this.oscillator.frequency.setValueAtTime(currentFreq, now);
      this.oscillator.frequency.linearRampToValueAtTime(targetFreq, now + slideTimeSec);

      this.currentNote = note;
      this.isSliding = true; // Mark that we're in a slide
      // Update filter tracking for new note during slide
      if (this.devilFish.enabled && this.devilFish.filterTracking > 0) {
        this.applyFilterTracking(targetFreq);
      }
      return;
    }

    // Cancel any in-progress envelopes to ensure clean retrigger
    // This is critical for same-note sequences at high BPM
    this.vcaEnvelope.cancel(now);
    this.filterEnvelope.cancel(now);

    // Normal note trigger
    this.currentNote = note;
    this.isSliding = slide;

    // TB-303 TRIGGER DELAY: Real 303 has ~4ms delay from gate to envelope start
    // This creates the characteristic "staccato" attack feel
    // Only applies to non-slide notes (slide notes don't retrigger)
    const triggerDelay = 0.004; // 4ms like real 303

    // Set oscillator frequency (immediate, before envelopes start)
    this.oscillator.frequency.setValueAtTime(targetFreq, now);

    // === DEVIL FISH: Apply filter tracking (LINEAR Hz response per manual) ===
    if (this.devilFish.enabled && this.devilFish.filterTracking > 0) {
      this.applyFilterTracking(targetFreq);
    }

    // Calculate envelope and accent parameters
    let filterDecayTime: number;
    let vegDecayTime: number;
    let attackTime: number;
    let envMod = this.baseEnvMod;
    let cutoffBoost = 0;
    let accentMultiplier = 1;

    if (this.devilFish.enabled) {
      // === DEVIL FISH MODE ===
      // Use separate Normal/Accent decay times (with tempo scaling)
      const accentDecay = this.scaleDecayForTempo(this.devilFish.accentDecay);
      const normalDecay = this.scaleDecayForTempo(this.devilFish.normalDecay);
      filterDecayTime = accent ? accentDecay / 1000 : normalDecay / 1000;

      // VEG decay time (with tempo scaling)
      vegDecayTime = this.scaleDecayForTempo(this.devilFish.vegDecay) / 1000;

      // Soft attack for non-accented notes, authentic 3ms attack for accented notes
      attackTime = accent ? 0.003 : this.devilFish.softAttack / 1000;

      // Apply VEG sustain (0% = normal decay, 100% = infinite notes)
      this.vcaEnvelope.sustain = this.devilFish.vegSustain / 100;

      // Calculate accent boost using sweep speed capacitor simulation
      // Pass the scheduled time for accurate timing with pre-scheduled notes
      if (accent && this.devilFish.accentSweepEnabled) {
        accentMultiplier = 1 + this.calculateAccentBoost(true, now);
      } else if (accent) {
        accentMultiplier = 1 + (this.config.accent.amount / 100);
      }
    } else {
      // === STANDARD TB-303 MODE ===
      // MEG decay: controlled by Decay knob (200ms-2000ms)
      filterDecayTime = this.config.filterEnvelope.decay / 1000;
      // VEG decay: FIXED at ~3000ms (independent of Decay knob, like real 303)
      vegDecayTime = 3.0;
      // Attack: ~3ms (authentic 303)
      attackTime = 0.003;
      // Sustain: 0 (decays fully to zero)
      this.vcaEnvelope.sustain = 0;

      if (accent) {
        const accentAmount = this.config.accent.amount / 100;
        accentMultiplier = 1 + accentAmount;
        cutoffBoost = accentAmount * 0.4;
        envMod *= (1 + accentAmount * 0.5);
        // Accent forces MEG decay to ~200ms (authentic behavior)
        filterDecayTime = Math.min(filterDecayTime, 0.2);
      }
    }

    // Update envelope parameters
    this.vcaEnvelope.attack = attackTime;
    this.vcaEnvelope.decay = vegDecayTime;
    this.filterEnvelope.attack = attackTime;
    this.filterEnvelope.decay = filterDecayTime;

    // Update filter envelope octaves
    const octaves = Math.log2((this.baseCutoff + envMod) / this.baseCutoff) + cutoffBoost;
    this.filterEnvelope.octaves = Math.max(0.1, octaves);

    // Apply accent volume boost
    this.accentGain.gain.setValueAtTime(accentMultiplier, now);
    // Decay accent over time (like dittytoy's aenv *= 0.9995)
    // Start ramp slightly after setValueAtTime to avoid timing conflicts
    if (accent) {
      this.accentGain.gain.exponentialRampTo(1, 0.5, now + 0.001);

      // TB-303 ACCENT CLICK: Characteristic percussive transient
      // Real 303 accents have a brief "click" caused by the VCA being driven hard
      // This adds punch and attack to accented notes
      const clickIntensity = 1.0 + (this.config.accent.amount / 100) * 0.8; // 1.0 to 1.8x
      this.accentClick.gain.cancelScheduledValues(now);
      this.accentClick.gain.setValueAtTime(clickIntensity, now);
      // Very fast decay (~8ms) for the click transient
      this.accentClick.gain.exponentialRampToValueAtTime(1.0, now + 0.008);
    } else {
      // Non-accented: ensure click gain is at unity
      this.accentClick.gain.setValueAtTime(1.0, now);
    }

    // TB-303 ACCENT RESONANCE MODULATION
    // Real 303 boosts filter Q during accent for that characteristic "squelch"
    // The accent circuit feeds into the resonance control, increasing Q
    if (accent) {
      const accentAmount = this.config.accent.amount / 100;
      const baseQ = this.resonanceToQ(this.config.filter.resonance);
      // Boost Q by up to 50% during accent (creates the squelch)
      const accentQBoost = baseQ * accentAmount * 0.5;
      const accentQ = Math.min(baseQ + accentQBoost, 35); // Cap at 35 to prevent instability

      // Set boosted Q immediately
      this.filter1.Q.setValueAtTime(accentQ, now);
      this.filter2.Q.setValueAtTime(accentQ * 0.7, now);

      // Decay Q back to base over ~200ms (matches MEG accent decay)
      this.filter1.Q.exponentialRampToValueAtTime(baseQ, now + 0.2);
      this.filter2.Q.exponentialRampToValueAtTime(baseQ * 0.7, now + 0.2);
    }

    // Track envelope state for visualization
    this.lastTriggerTime = Tone.now();
    this.lastTriggerDuration = typeof duration === 'number' ? duration : Tone.Time(duration).toSeconds();
    this.lastEnvOctaves = octaves;
    this.lastFilterDecay = this.filterEnvelope.decay;

    // Trigger envelopes with 4ms delay (characteristic 303 feel)
    const envelopeTime = now + triggerDelay;
    this.vcaEnvelope.triggerAttackRelease(duration, envelopeTime, velocity);
    this.filterEnvelope.triggerAttackRelease(duration, envelopeTime);
  }

  /**
   * Trigger note attack only
   * Devil Fish: Uses separate decay times, VEG sustain, soft attack, filter tracking
   */
  public triggerAttack(
    note: string,
    time?: Tone.Unit.Time,
    velocity: number = 1,
    accent: boolean = false,
    slide: boolean = false
  ): void {
    const now = time !== undefined ? time : Tone.now();
    const targetFreq = Tone.Frequency(note).toFrequency();
    this.currentNoteFreq = targetFreq;

    // Slide: portamento from previous note without retriggering envelopes
    // TB-303 AUTHENTIC SLIDE: Fixed RC time constant (~60ms)
    if (slide && this.currentNote && this.currentNote !== note) {
      const slideTimeMs = this.config.slide.time;
      const slideTimeSec = slideTimeMs / 1000;

      // Linear ramp for authentic RC circuit behavior
      const currentFreq = this.oscillator.frequency.value;
      this.oscillator.frequency.cancelScheduledValues(now);
      this.oscillator.frequency.setValueAtTime(currentFreq, now);
      this.oscillator.frequency.linearRampToValueAtTime(targetFreq, now + slideTimeSec);

      this.currentNote = note;
      this.isSliding = true;
      if (this.devilFish.enabled && this.devilFish.filterTracking > 0) {
        this.applyFilterTracking(targetFreq);
      }
      return;
    }

    this.currentNote = note;
    this.isSliding = slide;

    // TB-303 TRIGGER DELAY: Real 303 has ~4ms delay from gate to envelope start
    const triggerDelay = 0.004; // 4ms like real 303

    this.oscillator.frequency.setValueAtTime(targetFreq, now);

    // Apply filter tracking
    if (this.devilFish.enabled && this.devilFish.filterTracking > 0) {
      this.applyFilterTracking(targetFreq);
    }

    let filterDecayTime: number;
    let vegDecayTime: number;
    let attackTime: number;
    let envMod = this.baseEnvMod;
    let cutoffBoost = 0;
    let accentMultiplier = 1;

    if (this.devilFish.enabled) {
      const accentDecay = this.scaleDecayForTempo(this.devilFish.accentDecay);
      const normalDecay = this.scaleDecayForTempo(this.devilFish.normalDecay);
      filterDecayTime = accent ? accentDecay / 1000 : normalDecay / 1000;
      vegDecayTime = this.scaleDecayForTempo(this.devilFish.vegDecay) / 1000;
      attackTime = accent ? 0.003 : this.devilFish.softAttack / 1000;
      this.vcaEnvelope.sustain = this.devilFish.vegSustain / 100;

      if (accent && this.devilFish.accentSweepEnabled) {
        accentMultiplier = 1 + this.calculateAccentBoost(true, now);
      } else if (accent) {
        accentMultiplier = 1 + (this.config.accent.amount / 100);
      }
    } else {
      // === STANDARD TB-303 MODE ===
      filterDecayTime = this.config.filterEnvelope.decay / 1000;
      vegDecayTime = 3.0; // Fixed ~3000ms VEG decay
      attackTime = 0.003; // 3ms attack
      this.vcaEnvelope.sustain = 0;

      if (accent) {
        const accentAmount = this.config.accent.amount / 100;
        accentMultiplier = 1 + accentAmount;
        cutoffBoost = accentAmount * 0.4;
        envMod *= (1 + accentAmount * 0.5);
        filterDecayTime = Math.min(filterDecayTime, 0.2);
      }
    }

    this.vcaEnvelope.attack = attackTime;
    this.vcaEnvelope.decay = vegDecayTime;
    this.filterEnvelope.attack = attackTime;
    this.filterEnvelope.decay = filterDecayTime;
    this.filterEnvelope.octaves = Math.max(0.1, Math.log2((this.baseCutoff + envMod) / this.baseCutoff) + cutoffBoost);

    this.accentGain.gain.setValueAtTime(accentMultiplier, now);
    // Start ramp slightly after setValueAtTime to avoid timing conflicts
    if (accent) {
      this.accentGain.gain.exponentialRampTo(1, 0.5, now + 0.001);

      // TB-303 ACCENT CLICK: Characteristic percussive transient
      const clickIntensity = 1.0 + (this.config.accent.amount / 100) * 0.8;
      this.accentClick.gain.cancelScheduledValues(now);
      this.accentClick.gain.setValueAtTime(clickIntensity, now);
      this.accentClick.gain.exponentialRampToValueAtTime(1.0, now + 0.008);
    } else {
      this.accentClick.gain.setValueAtTime(1.0, now);
    }

    // TB-303 ACCENT RESONANCE MODULATION
    // Real 303 boosts filter Q during accent for that characteristic "squelch"
    if (accent) {
      const accentAmount = this.config.accent.amount / 100;
      const baseQ = this.resonanceToQ(this.config.filter.resonance);
      const accentQBoost = baseQ * accentAmount * 0.5;
      const accentQ = Math.min(baseQ + accentQBoost, 35);

      this.filter1.Q.setValueAtTime(accentQ, now);
      this.filter2.Q.setValueAtTime(accentQ * 0.7, now);
      this.filter1.Q.exponentialRampToValueAtTime(baseQ, now + 0.2);
      this.filter2.Q.exponentialRampToValueAtTime(baseQ * 0.7, now + 0.2);
    }

    // Track envelope state for visualization
    this.lastTriggerTime = Tone.now();
    this.lastTriggerDuration = 10; // Long duration for attack-only triggers
    this.lastEnvOctaves = this.filterEnvelope.octaves;
    this.lastFilterDecay = filterDecayTime;

    // Trigger envelopes with 4ms delay (characteristic 303 feel)
    const envelopeTime = now + triggerDelay;
    this.vcaEnvelope.triggerAttack(envelopeTime, velocity);
    this.filterEnvelope.triggerAttack(envelopeTime);
  }

  /**
   * Trigger note release
   */
  public triggerRelease(time?: Tone.Unit.Time): void {
    // Ensure we have a valid time value
    let now: number;
    if (time !== undefined && time !== null && typeof time === 'number' && !isNaN(time)) {
      now = time;
    } else {
      now = Tone.now();
    }

    // Safety check - make sure we have a valid time
    if (now === null || now === undefined || isNaN(now)) {
      return; // Skip release if audio context isn't ready
    }

    this.vcaEnvelope.triggerRelease(now);
    this.filterEnvelope.triggerRelease(now);
    this.isSliding = false;
  }

  /**
   * Release all notes
   */
  public releaseAll(): void {
    this.triggerRelease();
  }

  /**
   * Set filter cutoff frequency
   * With Open303-style exponential modulation
   */
  public setCutoff(frequency: number): void {
    this.baseCutoff = Math.min(Math.max(frequency, 50), 18000);
    this.config.filter.cutoff = this.baseCutoff;

    // Update the envelope's base frequency - envelope handles smoothing
    this.filterEnvelope.baseFrequency = this.baseCutoff;

    // Recalculate envelope modulation calibration
    this.calculateEnvModScalerAndOffset();
    this.updateEnvMod();
  }

  /**
   * Set filter resonance
   * Based on dittytoy: kq = 1 - resonance * 0.9 - accent * 0.1
   */
  public setResonance(resonancePercent: number): void {
    const resonance = Math.min(Math.max(resonancePercent, 0), 100);
    this.config.filter.resonance = resonance;
    // Use high resonance Q curve if Devil Fish high resonance mode is enabled
    const q = this.devilFish.enabled && this.devilFish.highResonance
      ? this.resonanceToQHighRes(resonance)
      : this.resonanceToQ(resonance);

    // Direct set - resonance changes should be immediate for acid character
    this.filter1.Q.value = q;
    this.filter2.Q.value = q * 0.7;
  }

  /**
   * Set envelope modulation amount
   */
  public setEnvMod(envModPercent: number): void {
    this.config.filterEnvelope.envMod = Math.min(Math.max(envModPercent, 0), 100);

    // Recalculate envelope modulation calibration
    this.calculateEnvModScalerAndOffset();
    this.updateEnvMod();
  }

  /**
   * Update envelope modulation range
   * Uses Open303-style exponential modulation: cutoff * pow(2, envelope * octaves)
   */
  private updateEnvMod(): void {
    // Calculate envelope sweep in octaves using calibrated scaler
    // The envelope will sweep from baseCutoff to baseCutoff * pow(2, octaves)
    // envScaler determines how many octaves the envelope sweeps
    const maxOctaves = 5.0; // Maximum sweep range (like Open303)
    const envAmount = this.config.filterEnvelope.envMod / 100;

    // Use calibrated scaler to determine actual octave range
    // This provides the characteristic TB-303 response
    const octaves = this.envScaler * envAmount * maxOctaves;

    this.filterEnvelope.octaves = Math.max(0.1, octaves);
  }

  /**
   * Set envelope decay time
   * Based on dittytoy: fenv *= exp(-(1-decay) * 0.004)
   * Applies tempo scaling if tempo-relative mode is enabled
   *
   * NOTE: In Devil Fish mode, filter decay and VCA decay are independent.
   * This method only updates the filter envelope decay.
   * VCA envelope decay is controlled by vegDecay and set during note triggering.
   */
  public setDecay(decayMs: number): void {
    this.config.filterEnvelope.decay = Math.min(Math.max(decayMs, 30), 3000);
    const scaledDecay = this.scaleDecayForTempo(this.config.filterEnvelope.decay);
    const decaySeconds = scaledDecay / 1000;
    // Only update filter envelope decay - VCA uses vegDecay independently
    this.filterEnvelope.decay = decaySeconds;
  }

  /**
   * Set accent amount
   */
  public setAccentAmount(amount: number): void {
    this.config.accent.amount = Math.min(Math.max(amount, 0), 100);
  }

  /**
   * Set slide time
   */
  public setSlideTime(timeMs: number): void {
    this.config.slide.time = Math.min(Math.max(timeMs, 10), 500);
  }

  /**
   * Set overdrive amount (0-100)
   * Works for both waveshaper and GuitarML modes
   */
  public setOverdrive(amount: number): void {
    this.overdriveAmount = Math.min(Math.max(amount, 0), 100) / 100;
    this.config.overdrive = { ...this.config.overdrive, amount: this.overdriveAmount * 100 };

    if (this.guitarMLEnabled && this.guitarML) {
      // GuitarML mode: control drive and condition
      const drive = amount;
      this.guitarML.setGain((drive - 50) * 0.36); // -18 to +18 dB
      this.guitarML.setCondition(drive / 100); // 0-1
    } else {
      // Waveshaper mode
      // Update waveshaper curve
      this.overdrive.curve = new Float32Array(4096).map((_, i) => {
        const x = (i / 4096) * 2 - 1;
        const drive = 1 + this.overdriveAmount * 8;
        return Math.tanh(x * drive) / Math.tanh(drive);
      });

      // Boost input gain to drive the overdrive harder
      this.overdriveGain.gain.value = 1 + this.overdriveAmount * 2;
    }
  }

  /**
   * Enable/disable GuitarML neural overdrive
   * When enabled, replaces waveshaper with neural model
   */
  public async setGuitarMLEnabled(enabled: boolean): Promise<void> {
    if (!this.guitarML) {
      console.warn('[TB303Synth] GuitarML not available');
      return;
    }

    this.guitarMLEnabled = enabled;

    // If enabling GuitarML, initialize it lazily if not already done
    if (enabled && !this.guitarMLInitialized) {
      try {
        await this.initializeGuitarML();
      } catch (error) {
        console.error('[TB303Synth] Failed to lazy load GuitarML:', error);
        this.guitarMLEnabled = false;
        return;
      }
    }

    // If enabling GuitarML, wait for it to be ready
    if (enabled && !this.guitarML.isReady()) {
      // Wait up to 5 seconds for initialization
      const startTime = Date.now();
      while (!this.guitarML.isReady() && (Date.now() - startTime) < 5000) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      if (!this.guitarML.isReady()) {
        console.error('[TB303Synth] GuitarML initialization timeout');
        this.guitarMLEnabled = false;
        return;
      }
    }

    // Disconnect current routing
    this.overdriveGain.disconnect();
    this.overdrive.disconnect();
    this.guitarMLBypass.disconnect();

    if (this.guitarMLEnabled && this.guitarML.isReady()) {
      // Route: overdriveGain → GuitarML → bypass → vca
      this.overdriveGain.connect(this.guitarML.getInput());
      this.guitarML.connect(this.guitarMLBypass);
      this.guitarMLBypass.connect(this.vca);

      this.guitarML.setEnabled(true);

      // Ensure dry/wet is set to 100% (full wet) if not specified
      if (this.config.overdrive?.dryWet === undefined) {
        this.guitarML.setDryWet(1.0); // 100% wet
      }

      // Set gain/condition from overdrive amount
      const drive = this.config.overdrive?.amount ?? 50;
      this.guitarML.setGain((drive - 50) * 0.36);
      this.guitarML.setCondition(drive / 100);
    } else {
      // Route: overdriveGain → waveshaper → bypass → vca
      this.overdriveGain.connect(this.overdrive);
      this.overdrive.connect(this.guitarMLBypass);
      this.guitarMLBypass.connect(this.vca);

      if (this.guitarML) {
        this.guitarML.setEnabled(false);
      }
    }

  }

  /**
   * Load GuitarML model by index (lazy loads GuitarML if needed)
   */
  public async loadGuitarMLModel(modelIndex: number): Promise<void> {
    if (!this.guitarML) return;

    try {
      // Initialize GuitarML if not already done
      if (!this.guitarMLInitialized) {
        await this.initializeGuitarML();
      }

      await this.guitarML.loadModel(modelIndex);
      this.config.overdrive = { ...this.config.overdrive, modelIndex };
    } catch (error) {
      console.error('[TB303Synth] Failed to load GuitarML model:', error);
    }
  }

  /**
   * Set GuitarML dry/wet mix (0-100)
   */
  public setGuitarMLMix(mix: number): void {
    if (!this.guitarML) return;

    this.guitarML.setDryWet(mix / 100);
    this.config.overdrive = { ...this.config.overdrive, dryWet: mix };
  }

  /**
   * Get GuitarML engine for direct access
   */
  public getGuitarML(): GuitarMLEngine | null {
    return this.guitarML;
  }

  /**
   * Check if GuitarML is enabled
   */
  public isGuitarMLEnabled(): boolean {
    return this.guitarMLEnabled;
  }

  // ============================================
  // DEVIL FISH MOD METHODS
  // ============================================

  /**
   * Enable/disable Devil Fish mode with configuration
   */
  public enableDevilFish(enabled: boolean, config?: Partial<DevilFishConfig>): void {
    this.devilFish.enabled = enabled;
    if (config) {
      Object.assign(this.devilFish, config);
    }
    this.updateMufflerCurve();
    this.setFilterFM(this.devilFish.filterFM);
    this.updateResonanceMode();
  }

  /**
   * Scale decay time based on tempo if tempo-relative mode is enabled
   * Reference: 125 BPM (default)
   * Slower tempos = longer decay, faster tempos = shorter decay
   */
  private scaleDecayForTempo(decayMs: number): number {
    if (!this.tempoRelative) return decayMs;
    const referenceBPM = 125;
    return decayMs * (referenceBPM / this.currentBPM);
  }

  /**
   * Set current BPM for tempo-relative envelope scaling
   */
  public setBPM(bpm: number): void {
    this.currentBPM = Math.min(Math.max(bpm, 20), 999);
  }

  /**
   * Enable/disable tempo-relative envelope mode
   * When enabled, envelope times scale with BPM (slower = longer sweeps)
   */
  public setTempoRelative(enabled: boolean): void {
    this.tempoRelative = enabled;
  }

  /**
   * Set MEG (Main Envelope Generator) decay for normal (non-accented) notes
   * Devil Fish range: 30-3000ms
   */
  public setNormalDecay(decayMs: number): void {
    this.devilFish.normalDecay = Math.min(Math.max(decayMs, 30), 3000);
  }

  /**
   * Set MEG decay for accented notes
   * Devil Fish range: 30-3000ms
   * Original TB-303 had this fixed at ~200ms
   */
  public setAccentDecay(decayMs: number): void {
    this.devilFish.accentDecay = Math.min(Math.max(decayMs, 30), 3000);
  }

  /**
   * Set VEG (Volume Envelope Generator) decay
   * Devil Fish range: 16-3000ms
   * Original TB-303 had fixed ~3-4 second decay
   */
  public setVegDecay(decayMs: number): void {
    this.devilFish.vegDecay = Math.min(Math.max(decayMs, 16), 3000);
  }

  /**
   * Set VEG sustain level
   * 0% = normal TB-303 behavior (note fades)
   * 100% = infinite notes (drone mode)
   */
  public setVegSustain(percent: number): void {
    this.devilFish.vegSustain = Math.min(Math.max(percent, 0), 100);
  }

  /**
   * Set attack time for non-accented notes
   * Devil Fish range: 0.3-30ms
   * Original TB-303 had ~4ms delay + 3ms attack
   */
  public setSoftAttack(timeMs: number): void {
    this.devilFish.softAttack = Math.min(Math.max(timeMs, 0.3), 30);
  }

  /**
   * Set filter tracking amount
   * 0% = filter doesn't follow pitch (TB-303 default)
   * 100% = filter follows pitch 1:1
   * 200% = filter over-tracks (goes higher than pitch)
   */
  public setFilterTracking(percent: number): void {
    this.devilFish.filterTracking = Math.min(Math.max(percent, 0), 200);
  }

  /**
   * Set Filter FM amount
   * VCA output feeds back to filter frequency for audio-rate modulation
   * Creates edginess, complexity, even chaos
   * Uses polling approach since Tone.js Signals don't support direct audio-rate modulation
   */
  public setFilterFM(percent: number): void {
    this.devilFish.filterFM = Math.min(Math.max(percent, 0), 100);

    if (this.devilFish.filterFM > 0 && !this.filterFMInterval) {
      this.startFilterFMProcessing();
    } else if (this.devilFish.filterFM === 0 && this.filterFMInterval) {
      this.stopFilterFMProcessing();
    }
  }

  /**
   * Start Filter FM processing loop
   * Polls VCA output via analyser and modulates filter envelope base frequency
   * This allows FM and envelope to work together (FM modulates base, envelope adds on top)
   */
  private startFilterFMProcessing(): void {
    if (this.filterFMInterval) return;

    const processFilterFM = () => {
      if (this.devilFish.filterFM === 0) {
        this.filterFMInterval = null;
        return;
      }

      // Get VCA output level from analyser
      const waveform = this.filterFMAnalyser.getValue() as Float32Array;
      // Use average of waveform as modulation signal
      let sum = 0;
      for (let i = 0; i < waveform.length; i++) {
        sum += waveform[i];
      }
      const avgLevel = sum / waveform.length;

      // Scale FM amount: 0% = no FM, 100% = ±2000Hz modulation
      const fmAmount = (this.devilFish.filterFM / 100) * 2000;
      const fmOffset = avgLevel * fmAmount;

      // Modulate filter envelope's base frequency
      // This allows FM and envelope to work together
      const modulatedBase = Math.min(Math.max(this.baseCutoff + fmOffset, 50), 18000);
      this.filterEnvelope.baseFrequency = modulatedBase;

      this.filterFMInterval = requestAnimationFrame(processFilterFM);
    };

    this.filterFMInterval = requestAnimationFrame(processFilterFM);
  }

  /**
   * Stop filter FM processing
   */
  private stopFilterFMProcessing(): void {
    if (this.filterFMInterval) {
      cancelAnimationFrame(this.filterFMInterval);
      this.filterFMInterval = null;
    }
    // Reset filter envelope base frequency
    this.filterEnvelope.baseFrequency = this.baseCutoff;
  }

  /**
   * Set sweep speed mode
   * Controls how accent "charge" accumulates over consecutive accents
   * - fast: Quick discharge, smaller subsequent accents
   * - normal: Classic TB-303 behavior (accents build up)
   * - slow: Double buildup potential, longer cooldown
   */
  public setSweepSpeed(mode: 'fast' | 'normal' | 'slow'): void {
    this.devilFish.sweepSpeed = mode;
  }

  /**
   * Enable/disable accent sweep circuit
   */
  public setAccentSweepEnabled(enabled: boolean): void {
    this.devilFish.accentSweepEnabled = enabled;
  }

  /**
   * Enable/disable high resonance mode
   * When enabled, filter can self-oscillate at mid/high frequencies
   */
  public setHighResonance(enabled: boolean): void {
    this.devilFish.highResonance = enabled;
    this.updateResonanceMode();
  }

  /**
   * Update resonance curve based on mode
   */
  private updateResonanceMode(): void {
    if (this.devilFish.enabled && this.devilFish.highResonance) {
      // High resonance mode: allow self-oscillation
      const q = this.resonanceToQHighRes(this.config.filter.resonance);
      this.filter1.Q.value = q;
      this.filter2.Q.value = q * 0.7;
    } else {
      // Normal mode
      const q = this.resonanceToQ(this.config.filter.resonance);
      this.filter1.Q.value = q;
      this.filter2.Q.value = q * 0.7;
    }
  }

  /**
   * Convert resonance to Q in high resonance mode (self-oscillation enabled)
   */
  private resonanceToQHighRes(resonance: number): number {
    const normalized = resonance / 100;
    // Much higher Q range: 0.5 to 50 (self-oscillation threshold)
    return 0.5 + Math.pow(normalized, 1.2) * 49.5;
  }

  /**
   * Set muffler mode
   * - off: No muffler (TB-303 default)
   * - soft: Gentle soft clipping, adds warmth
   * - hard: Aggressive clipping, adds buzz/fuzz
   */
  public setMuffler(mode: 'off' | 'soft' | 'hard'): void {
    this.devilFish.muffler = mode;
    this.updateMufflerCurve();
  }

  /**
   * Update muffler waveshaper curve based on mode
   * Muffler is unique to Devil Fish - soft clips the VCA output
   * Different from overdrive which is pre-filter
   */
  private updateMufflerCurve(): void {
    if (!this.devilFish.enabled || this.devilFish.muffler === 'off') {
      // Bypass - linear curve
      this.muffler.curve = new Float32Array(4096).map((_, i) => {
        return (i / 4096) * 2 - 1;
      });
    } else if (this.devilFish.muffler === 'soft') {
      // Soft muffler - gentle limiting that preserves bass
      this.muffler.curve = new Float32Array(4096).map((_, i) => {
        const x = (i / 4096) * 2 - 1;
        // Soft knee compression - louder signals get compressed more
        const threshold = 0.5;
        if (Math.abs(x) < threshold) {
          return x;
        }
        const sign = x >= 0 ? 1 : -1;
        const excess = Math.abs(x) - threshold;
        return sign * (threshold + Math.tanh(excess * 2) * (1 - threshold));
      });
    } else {
      // Hard muffler - more aggressive clipping with buzz
      this.muffler.curve = new Float32Array(4096).map((_, i) => {
        const x = (i / 4096) * 2 - 1;
        // Hard limiting with subtle square-wave-like buzz
        const threshold = 0.3;
        if (Math.abs(x) < threshold) {
          return x;
        }
        const sign = x >= 0 ? 1 : -1;
        const excess = Math.abs(x) - threshold;
        // More aggressive compression
        return sign * (threshold + Math.tanh(excess * 4) * (1 - threshold) * 0.7);
      });
    }
  }

  /**
   * Apply filter tracking for a given note frequency
   * IMPORTANT: Devil Fish uses LINEAR tracking (Hz per volt), NOT exponential (1V/oct)
   *
   * From manual: "The voltage to frequency function of internal Filter Tracking pot is linear...
   * the relationship between the internal CV and the filter frequency is linear in a volts to Hertz sense"
   * "At maximum, the maximum Filter Tracking is about 2.7 kHz per volt"
   *
   * Reference: C2 (65.41 Hz) = 2V is the center point (no change)
   * Notes below this cause filter to DROP, notes above cause it to RISE
   */
  private applyFilterTracking(noteFreq: number): void {
    if (!this.devilFish.enabled || this.devilFish.filterTracking === 0) {
      return;
    }

    const trackingOffset = this.getFilterTrackingOffset(noteFreq);
    const targetCutoff = Math.min(Math.max(this.baseCutoff + trackingOffset, 50), 18000);

    this.filter1.frequency.value = targetCutoff;
    this.filter2.frequency.value = targetCutoff;
  }

  /**
   * Calculate filter tracking offset for a given note (LINEAR Hz response)
   *
   * From manual: "for instance, with a particular setting... the filter might have a cutoff
   * of say 1 kHz. With a CV of 3 volts this would become 1.5 kHz, with 4 volts it would
   * become 2 kHz and with 5 volts, it would become 2.5 kHz"
   *
   * This is LINEAR: each volt adds the same Hz amount (not exponential octaves)
   * TB-303 CV range: 1-5V over 3 octaves, center at 2V (C2 = 65.41 Hz)
   */
  private getFilterTrackingOffset(noteFreq: number): number {
    if (!this.devilFish.enabled || this.devilFish.filterTracking === 0) {
      return 0;
    }

    // Reference: C2 (65.41 Hz) at 2V is the "zero point" for filter tracking
    const referenceFreq = 65.41; // C2
    const referenceVoltage = 2.0;

    // Convert note frequency to CV voltage (1V/octave, C2 = 2V)
    const noteVoltage = referenceVoltage + Math.log2(noteFreq / referenceFreq);

    // Voltage difference from reference
    const voltageDiff = noteVoltage - referenceVoltage;

    // LINEAR tracking: ~2.7 kHz per volt at max setting
    // Scale by tracking amount (0-200%, where 100% = 1:1, 200% = over-tracking)
    const maxHzPerVolt = 2700; // 2.7 kHz per volt at max
    const trackingAmount = this.devilFish.filterTracking / 100;

    // Return LINEAR Hz offset (not exponential!)
    return voltageDiff * maxHzPerVolt * trackingAmount;
  }

  /**
   * Calculate accent boost based on sweep speed mode
   * Simulates the capacitor charge/discharge in Devil Fish
   * @param accent Whether this note is accented
   * @param time The scheduled time for this note (for accurate timing with scheduled notes)
   */
  private calculateAccentBoost(accent: boolean, time?: number): number {
    if (!this.devilFish.enabled || !this.devilFish.accentSweepEnabled) {
      return accent ? this.config.accent.amount / 100 : 0;
    }

    // Use provided time or fall back to Tone.now() for real-time triggering
    const noteTime = time !== undefined ? time : Tone.now();
    const timeSinceLastAccent = noteTime - this.lastAccentTime;

    // Discharge rate depends on sweep speed
    let dischargeRate: number;
    let chargeRate: number;
    let maxCharge: number;

    switch (this.devilFish.sweepSpeed) {
      case 'fast':
        dischargeRate = 0.8; // Fast discharge
        chargeRate = 0.3;
        maxCharge = 1.2;
        break;
      case 'slow':
        dischargeRate = 0.2; // Slow discharge
        chargeRate = 0.6;
        maxCharge = 2.0; // Can build up more
        break;
      case 'normal':
      default:
        dischargeRate = 0.5;
        chargeRate = 0.5;
        maxCharge = 1.5;
        break;
    }

    // Discharge over time
    this.accentCharge *= Math.exp(-dischargeRate * timeSinceLastAccent);

    if (accent) {
      // Charge up
      this.accentCharge = Math.min(this.accentCharge + chargeRate, maxCharge);
      this.lastAccentTime = noteTime;
    }

    // Base accent + charged boost
    const baseAccent = accent ? this.config.accent.amount / 100 : 0;
    return baseAccent * (1 + this.accentCharge * 0.5);
  }

  /**
   * Get Devil Fish configuration
   */
  public getDevilFishConfig(): DevilFishConfig {
    return { ...this.devilFish };
  }

  /**
   * Update Devil Fish configuration
   */
  public updateDevilFishConfig(config: Partial<DevilFishConfig>): void {
    if (config.enabled !== undefined) {
      this.enableDevilFish(config.enabled, config);
    } else {
      Object.assign(this.devilFish, config);
      if (config.muffler !== undefined) this.updateMufflerCurve();
      if (config.filterFM !== undefined) this.setFilterFM(config.filterFM);
      if (config.highResonance !== undefined) this.updateResonanceMode();
    }
  }

  // ============================================
  // END DEVIL FISH MOD METHODS
  // ============================================

  /**
   * Set tuning offset in cents
   */
  public setTuning(cents: number): void {
    this.tuningCents = Math.min(Math.max(cents, -1200), 1200);
    this.oscillator.detune.value = this.tuningCents;
  }

  /**
   * Get current tuning in cents
   */
  public getTuning(): number {
    return this.tuningCents;
  }

  /**
   * Set oscillator waveform
   */
  public setWaveform(type: 'sawtooth' | 'square'): void {
    this.config.oscillator.type = type;
    this.oscillator.type = type;
  }

  /**
   * Set output volume
   * Note: TB-303 has -3dB compensation to normalize with other synths
   */
  public setVolume(volumeDb: number): void {
    this.baseVolume = volumeDb;
    // Apply -3dB compensation to match other synth volumes
    // TB-303's resonant filter and VCA make it inherently louder
    this.vca.gain.value = Tone.dbToGain(volumeDb - 3);
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<TB303Config>): void {
    if (config.oscillator?.type) {
      this.setWaveform(config.oscillator.type);
    }
    if (config.filter) {
      if (config.filter.cutoff !== undefined) {
        this.setCutoff(config.filter.cutoff);
      }
      if (config.filter.resonance !== undefined) {
        this.setResonance(config.filter.resonance);
      }
    }
    if (config.filterEnvelope) {
      if (config.filterEnvelope.envMod !== undefined) {
        this.setEnvMod(config.filterEnvelope.envMod);
      }
      if (config.filterEnvelope.decay !== undefined) {
        this.setDecay(config.filterEnvelope.decay);
      }
    }
    if (config.accent?.amount !== undefined) {
      this.setAccentAmount(config.accent.amount);
    }
    if (config.slide) {
      if (config.slide.time !== undefined) {
        this.setSlideTime(config.slide.time);
      }
      if (config.slide.mode !== undefined) {
        this.config.slide.mode = config.slide.mode;
      }
    }
    if (config.overdrive?.amount !== undefined) {
      this.setOverdrive(config.overdrive.amount);
    }
  }

  /**
   * Connect to destination
   */
  public connect(destination: Tone.InputNode): this {
    this.output.connect(destination);
    return this;
  }

  /**
   * Disconnect from all destinations
   */
  public disconnect(): this {
    this.output.disconnect();
    return this;
  }

  /**
   * Dispose of all resources
   */
  public dispose(): void {
    // Stop filter FM processing if running
    this.stopFilterFMProcessing();

    // Dispose GuitarML
    if (this.guitarML) {
      this.guitarML.dispose();
      this.guitarML = null;
    }

    // Dispose all audio nodes
    this.oscillator.dispose();
    this.oscillatorAsymmetry.dispose();

    // Dispose Open303-style additional filters
    this.preFilterHP.dispose();
    this.postFilterHP.dispose();
    this.allpassFilter.dispose();
    this.notchFilter.dispose();

    this.filter1.dispose();
    this.filter2.dispose();
    this.filterSaturation.dispose();
    this.filterEnvelope.dispose();
    this.vca.dispose();
    this.accentGain.dispose();
    this.accentClick.dispose();
    this.vcaEnvelope.dispose();
    this.vcaBleed.dispose();
    this.overdrive.dispose();
    this.overdriveGain.dispose();
    this.guitarMLBypass.dispose();

    // Dispose Devil Fish nodes
    this.muffler.dispose();
    this.mufflerBypass.dispose();
    this.filterFMGain.dispose();
    this.filterFMAnalyser.dispose();

    this.output.dispose();
  }

  /**
   * Get the output node
   */
  public get audioNode(): Tone.Gain {
    return this.output;
  }

  /**
   * Get current configuration
   */
  public getConfig(): TB303Config {
    return { ...this.config };
  }

  /**
   * Get instantaneous filter cutoff frequency
   * Calculates the current envelope position for visualization
   * Returns estimated frequency including envelope modulation
   */
  public getInstantCutoff(): number {
    const now = Tone.now();
    const elapsed = now - this.lastTriggerTime;

    // If no recent trigger or very old, return base cutoff
    if (this.lastTriggerTime === 0 || elapsed > 5) {
      return this.baseCutoff;
    }

    const attack = this.filterEnvelope.attack;
    const decay = this.lastFilterDecay;
    const sustain = this.filterEnvelope.sustain;
    const release = this.filterEnvelope.release;
    const duration = this.lastTriggerDuration;

    // Calculate envelope value (0-1)
    let envValue = 0;

    if (elapsed < attack) {
      // Attack phase: ramp up to 1
      envValue = elapsed / attack;
    } else if (elapsed < attack + decay) {
      // Decay phase: exponential decay from 1 to sustain
      const decayElapsed = elapsed - attack;
      const decayProgress = decayElapsed / decay;
      envValue = 1 - (1 - sustain) * (1 - Math.exp(-3 * decayProgress));
    } else if (elapsed < duration) {
      // Sustain phase
      envValue = sustain;
    } else if (elapsed < duration + release) {
      // Release phase
      const releaseElapsed = elapsed - duration;
      const releaseProgress = releaseElapsed / release;
      envValue = sustain * Math.exp(-3 * releaseProgress);
    } else {
      // Envelope finished
      envValue = 0;
    }

    // Convert envelope value to frequency
    // FrequencyEnvelope uses octaves from baseFrequency
    const baseFreq = this.filterEnvelope.baseFrequency;
    const octaves = this.lastEnvOctaves;
    const maxFreq = baseFreq * Math.pow(2, octaves);

    // Envelope output is exponential interpolation
    const currentFreq = baseFreq * Math.pow(maxFreq / baseFreq, envValue);

    return Math.min(Math.max(currentFreq, 50), 18000);
  }

  /**
   * Get instantaneous accent gain
   * Returns current accent multiplier for visualization
   */
  public getInstantAccent(): number {
    return this.accentGain.gain.value;
  }

  /**
   * Get base cutoff (before modulation)
   */
  public getBaseCutoff(): number {
    return this.baseCutoff;
  }

  /**
   * Get current envelope position (0-1) for visualization
   * Returns normalized envelope position within ADSR curve
   */
  public getEnvelopePosition(): number {
    const now = Tone.now();
    const elapsed = now - this.lastTriggerTime;

    // If no recent trigger or very old, return 0
    if (this.lastTriggerTime === 0 || elapsed > 5) {
      return 0;
    }

    const attack = this.filterEnvelope.attack;
    const decay = this.lastFilterDecay;
    const sustain = this.filterEnvelope.sustain;
    const release = this.filterEnvelope.release;
    const duration = this.lastTriggerDuration;
    const totalTime = attack + decay + Math.max(duration - (attack + decay), 0) + release;

    // Normalize position to 0-1 over total envelope time
    return Math.min(elapsed / totalTime, 1);
  }

  /**
   * Get current envelope value (0-1) for visualization
   * Returns the actual envelope amplitude at current time
   */
  public getEnvelopeValue(): number {
    const now = Tone.now();
    const elapsed = now - this.lastTriggerTime;

    // If no recent trigger or very old, return 0
    if (this.lastTriggerTime === 0 || elapsed > 5) {
      return 0;
    }

    const attack = this.filterEnvelope.attack;
    const decay = this.lastFilterDecay;
    const sustain = this.filterEnvelope.sustain;
    const release = this.filterEnvelope.release;
    const duration = this.lastTriggerDuration;

    // Calculate envelope value (0-1)
    let envValue = 0;

    if (elapsed < attack) {
      // Attack phase: ramp up to 1
      envValue = elapsed / attack;
    } else if (elapsed < attack + decay) {
      // Decay phase: exponential decay from 1 to sustain
      const decayElapsed = elapsed - attack;
      const decayProgress = decayElapsed / decay;
      envValue = 1 - (1 - sustain) * (1 - Math.exp(-3 * decayProgress));
    } else if (elapsed < duration) {
      // Sustain phase
      envValue = sustain;
    } else if (elapsed < duration + release) {
      // Release phase
      const releaseElapsed = elapsed - duration;
      const releaseProgress = releaseElapsed / release;
      envValue = sustain * Math.exp(-3 * releaseProgress);
    }

    return envValue;
  }

  /**
   * Get accent charge level (0-1) for visualization
   * Returns the current Devil Fish accent sweep capacitor charge
   */
  public getAccentCharge(): number {
    return this.accentCharge;
  }

  /**
   * Check if envelope is currently active
   */
  public isEnvelopeActive(): boolean {
    const now = Tone.now();
    const elapsed = now - this.lastTriggerTime;
    return this.lastTriggerTime > 0 && elapsed < 5;
  }

  /**
   * Get current resonance (0-100)
   */
  public getResonance(): number {
    return this.config.filter.resonance;
  }

  /**
   * Get current envelope modulation amount (0-100)
   */
  public getEnvMod(): number {
    return this.config.filterEnvelope.envMod;
  }

  /**
   * Get current decay time in ms
   */
  public getDecay(): number {
    return this.config.filterEnvelope.decay;
  }

  /**
   * Get current accent amount (0-100)
   */
  public getAccentAmount(): number {
    return this.config.accent.amount;
  }

  /**
   * Get current overdrive amount (0-100)
   */
  public getOverdrive(): number {
    return this.overdriveAmount * 100;
  }

  // === Devil Fish Getters ===

  /**
   * Get normal decay time in ms (Devil Fish)
   */
  public getNormalDecay(): number {
    return this.devilFish.normalDecay;
  }

  /**
   * Get accent decay time in ms (Devil Fish)
   */
  public getAccentDecay(): number {
    return this.devilFish.accentDecay;
  }

  /**
   * Get VEG decay time in ms (Devil Fish)
   */
  public getVegDecay(): number {
    return this.devilFish.vegDecay;
  }

  /**
   * Get VEG sustain level (0-100) (Devil Fish)
   */
  public getVegSustain(): number {
    return this.devilFish.vegSustain;
  }

  /**
   * Get soft attack time in ms (Devil Fish)
   */
  public getSoftAttack(): number {
    return this.devilFish.softAttack;
  }

  /**
   * Get filter tracking amount (0-200) (Devil Fish)
   */
  public getFilterTracking(): number {
    return this.devilFish.filterTracking;
  }

  /**
   * Get filter FM amount (0-100) (Devil Fish)
   */
  public getFilterFM(): number {
    return this.devilFish.filterFM;
  }

  /**
   * Check if Devil Fish mode is enabled
   */
  public isDevilFishEnabled(): boolean {
    return this.devilFish.enabled;
  }

  // ============================================
  // PERFORMANCE QUALITY MANAGEMENT
  // ============================================

  /**
   * Set performance quality level
   * Dynamically reconfigures signal chain to reduce CPU usage on slower systems
   * while maintaining characteristic TB-303 sound
   *
   * - High: Full chain (cascaded filters, all processing)
   * - Medium: Simplified chain (single filter, no GuitarML, reduced extra filters)
   * - Low: Minimal chain (basic oscillator + filter + VCA only)
   */
  public setQuality(quality: PerformanceQuality): void {
    if (this.qualityLevel === quality) return; // Already at this quality level

    this.qualityLevel = quality;

    // Disconnect all nodes
    this.disconnectSignalChain();

    // Reconnect based on quality level
    switch (quality) {
      case 'high':
        this.connectHighQuality();
        break;
      case 'medium':
        this.connectMediumQuality();
        break;
      case 'low':
        this.connectLowQuality();
        break;
    }

  }

  /**
   * Get current quality level
   */
  public getQuality(): PerformanceQuality {
    return this.qualityLevel;
  }

  /**
   * Disconnect entire signal chain
   */
  private disconnectSignalChain(): void {
    // Disconnect all nodes safely
    try {
      this.oscillator.disconnect();
      this.oscillatorAsymmetry.disconnect();
      this.preFilterHP.disconnect();
      this.filter1.disconnect();
      this.filter2.disconnect();
      this.filterSaturation.disconnect();
      this.allpassFilter.disconnect();
      this.postFilterHP.disconnect();
      this.notchFilter.disconnect();
      this.overdriveGain.disconnect();
      this.overdrive.disconnect();
      this.guitarMLBypass.disconnect();
      this.vca.disconnect();
      this.accentGain.disconnect();
      this.accentClick.disconnect();
      this.vcaEnvelope.disconnect();
      this.vcaBleed.disconnect();
      this.muffler.disconnect();

      // Disconnect GuitarML if active
      if (this.guitarML && this.guitarML.isReady()) {
        this.guitarML.disconnect();
      }
    } catch (error) {
      console.warn('[TB303Synth] Error disconnecting nodes:', error);
    }
  }

  /**
   * Connect HIGH QUALITY signal chain
   * Full TB-303 emulation with all processing stages
   *
   * Chain: Oscillator → Asymmetry → PreHP → Filter1 → Filter2 → FilterSaturation →
   *        Allpass → PostHP → Notch → OverdriveGain → [Overdrive OR GuitarML] →
   *        VCA → AccentGain → AccentClick → VCAEnvelope → Muffler → Output
   *        VCA → VCABleed → Output (parallel path)
   */
  private connectHighQuality(): void {
    // Full signal chain (as in constructor)
    this.oscillator.connect(this.oscillatorAsymmetry);
    this.oscillatorAsymmetry.connect(this.preFilterHP);
    this.preFilterHP.connect(this.filter1);
    this.filter1.connect(this.filter2);
    this.filter2.connect(this.filterSaturation);
    this.filterSaturation.connect(this.allpassFilter);
    this.allpassFilter.connect(this.postFilterHP);
    this.postFilterHP.connect(this.notchFilter);
    this.notchFilter.connect(this.overdriveGain);

    // Overdrive routing: waveshaper or GuitarML
    if (this.guitarMLEnabled && this.guitarML && this.guitarML.isReady()) {
      this.overdriveGain.connect(this.guitarML.getInput());
      this.guitarML.connect(this.guitarMLBypass);
    } else {
      this.overdriveGain.connect(this.overdrive);
      this.overdrive.connect(this.guitarMLBypass);
    }

    this.guitarMLBypass.connect(this.vca);
    this.vca.connect(this.accentGain);
    this.accentGain.connect(this.accentClick);
    this.accentClick.connect(this.vcaEnvelope);
    this.vcaEnvelope.connect(this.muffler);
    this.muffler.connect(this.output);

    // VCA bleed path (parallel)
    this.vca.connect(this.vcaBleed);
    this.vcaBleed.connect(this.output);

    // Reconnect filter envelopes to BOTH filters
    this.filterEnvelope.disconnect();
    this.filterEnvelope.connect(this.filter1.frequency);
    this.filterEnvelope.connect(this.filter2.frequency);
  }

  /**
   * Connect MEDIUM QUALITY signal chain
   * Simplified processing - maintains TB-303 character with reduced CPU usage
   *
   * Optimizations:
   * - Single filter instead of cascaded dual filters (saves ~40% filter CPU)
   * - Bypass allpass and notch filters (subtle phase/rumble correction)
   * - Disable GuitarML neural network (heavy processing)
   * - Keep essential: oscillator asymmetry, pre/post HP, filter saturation
   *
   * Chain: Oscillator → Asymmetry → PreHP → Filter1 → FilterSaturation →
   *        PostHP → OverdriveGain → Overdrive → VCA → AccentGain → AccentClick →
   *        VCAEnvelope → Muffler → Output
   *        VCA → VCABleed → Output (parallel path)
   */
  private connectMediumQuality(): void {
    // Simplified chain - bypass second filter, allpass, notch, and GuitarML
    this.oscillator.connect(this.oscillatorAsymmetry);
    this.oscillatorAsymmetry.connect(this.preFilterHP);
    this.preFilterHP.connect(this.filter1);
    // Skip filter2 - use single filter (saves CPU)
    this.filter1.connect(this.filterSaturation);
    // Skip allpassFilter and notchFilter
    this.filterSaturation.connect(this.postFilterHP);
    this.postFilterHP.connect(this.overdriveGain);

    // Always use waveshaper overdrive (skip GuitarML for medium quality)
    this.overdriveGain.connect(this.overdrive);
    this.overdrive.connect(this.guitarMLBypass);

    this.guitarMLBypass.connect(this.vca);
    this.vca.connect(this.accentGain);
    this.accentGain.connect(this.accentClick);
    this.accentClick.connect(this.vcaEnvelope);
    this.vcaEnvelope.connect(this.muffler);
    this.muffler.connect(this.output);

    // VCA bleed path (parallel)
    this.vca.connect(this.vcaBleed);
    this.vcaBleed.connect(this.output);

    // Connect filter envelope to single filter only
    this.filterEnvelope.disconnect();
    this.filterEnvelope.connect(this.filter1.frequency);

    // Compensate for single filter by slightly boosting Q for similar character
    // (cascaded filters have cumulative resonance response)
    const currentQ = this.filter1.Q.value;
    this.filter1.Q.value = currentQ * 1.15; // +15% to compensate for missing filter2
  }

  /**
   * Connect LOW QUALITY signal chain
   * Minimal processing - basic TB-303 sound with maximum CPU savings
   *
   * Optimizations:
   * - Bypass all extra processing (asymmetry, extra filters, saturation, overdrive)
   * - Single simple filter
   * - Basic VCA envelope
   * - Saves ~70% CPU compared to high quality
   *
   * Chain: Oscillator → Filter1 → VCA → VCAEnvelope → Output
   */
  private connectLowQuality(): void {
    // Minimal chain - just oscillator → filter → VCA
    this.oscillator.connect(this.filter1);
    this.filter1.connect(this.vca);
    this.vca.connect(this.vcaEnvelope);
    this.vcaEnvelope.connect(this.output);

    // No bleed path for low quality (saves CPU)

    // Connect filter envelope
    this.filterEnvelope.disconnect();
    this.filterEnvelope.connect(this.filter1.frequency);

    // Boost Q and slightly reduce cutoff to compensate for missing saturation/overdrive
    const currentQ = this.filter1.Q.value;
    this.filter1.Q.value = Math.min(currentQ * 1.3, 35); // +30% Q, cap at 35
    this.filter1.frequency.value = this.baseCutoff * 0.9; // Slightly lower cutoff for warmth
  }

  // ============================================
  // END PERFORMANCE QUALITY MANAGEMENT
  // ============================================
}
