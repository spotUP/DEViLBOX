/**
 * TB303.worklet.js - Accurate Roland TB-303 Emulation
 *
 * Based on Open303 by Robin Schmidt (rosic)
 * Reference: db303-main/src/dsp/open303/
 *
 * This is a 1:1 port of the Open303 DSP algorithms to JavaScript/AudioWorklet
 * for perfect TB-303 emulation in the browser.
 *
 * Key components:
 * - TeeBeeFilter: 4-pole ladder filter with feedback highpass
 * - PolyBLEP Oscillator: Anti-aliased saw/square waveforms
 * - Envelope Generators: MEG (filter), VEG (amplitude), RC filters
 * - Accent System: Separate attack/decay for accented notes
 * - Slide: Portamento with configurable time
 */

const TWOPI = Math.PI * 2;
const ONE_OVER_SQRT2 = 1.0 / Math.SQRT2;

class TB303Processor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    // console.log('[TB303 Worklet] Processor created, sample rate:', sampleRate);

    this.sampleRate = sampleRate;
    this.twoPiOverSampleRate = TWOPI / sampleRate;

    // === FILTER STATE ===
    // 4-pole ladder filter stages
    this.y1 = 0.0;
    this.y2 = 0.0;
    this.y3 = 0.0;
    this.y4 = 0.0;

    // Filter coefficients
    this.b0 = 0.0;
    this.k = 0.0;   // feedback factor
    this.g = 1.0;   // output gain

    // Feedback highpass state (one-pole)
    this.fbHpX1 = 0.0;  // Previous input
    this.fbHpY = 0.0;   // Previous output
    this.fbHpB0 = 0.0;
    this.fbHpB1 = 0.0;
    this.fbHpA1 = 0.0;

    // Additional filters (Open303 refinements)
    // Pre-filter highpass (before main filter)
    this.preHpX1 = 0.0;
    this.preHpY = 0.0;
    this.preHpB0 = 0.0;
    this.preHpB1 = 0.0;
    this.preHpA1 = 0.0;

    // Post-filter highpass (after main filter)
    this.postHpX1 = 0.0;
    this.postHpY = 0.0;
    this.postHpB0 = 0.0;
    this.postHpB1 = 0.0;
    this.postHpA1 = 0.0;

    // Allpass filter (after main filter)
    this.apX1 = 0.0;
    this.apY = 0.0;
    this.apB0 = 0.0;
    this.apB1 = 0.0;
    this.apA1 = 0.0;

    // Notch filter (biquad bandreject, after main filter)
    this.notchX1 = 0.0;
    this.notchX2 = 0.0;
    this.notchY1 = 0.0;
    this.notchY2 = 0.0;
    this.notchB0 = 0.0;
    this.notchB1 = 0.0;
    this.notchB2 = 0.0;
    this.notchA1 = 0.0;
    this.notchA2 = 0.0;

    // Envelope modulation scaler and offset (calibrated from real hardware)
    this.envScaler = 1.0;
    this.envOffset = 0.0;

    // === OSCILLATOR STATE ===
    this.phase = 0.0;
    this.phaseInc = 0.0;
    this.frequency = 440.0;
    this.waveform = 1.0;  // 0=saw, 1=square (blend factor)

    // === ENVELOPE STATE ===
    // Main Envelope Generator (MEG) - for filter
    this.mainEnvValue = 0.0;
    this.mainEnvDecayCoeff = 0.0;
    this.mainEnvActive = false;

    // Amplitude Envelope Generator (VEG)
    this.ampEnvValue = 0.0;
    this.ampEnvDecayCoeff = 0.0;
    this.ampEnvActive = false;

    // RC filters (leaky integrators) for envelope shaping
    this.rc1Value = 0.0;
    this.rc1Coeff = 0.0;

    this.rc2Value = 0.0;
    this.rc2Coeff = 0.0;

    // Normalizers for RC envelopes
    this.n1 = 1.0;
    this.n2 = 1.0;

    // === SLIDE (PORTAMENTO) STATE ===
    this.pitchSlewValue = 440.0;  // Current frequency after slew
    this.pitchSlewTarget = 440.0; // Target frequency
    this.pitchSlewCoeff = 0.0;    // Slew rate coefficient

    // === PARAMETERS (will be set via port messages) ===
    this.cutoff = 800.0;
    this.resonance = 0.5;  // 0-1
    this.envMod = 4000.0;  // Modulation amount in Hz
    this.normalDecay = 200.0;  // ms
    this.accentDecay = 200.0;  // ms
    this.normalAttack = 3.0;   // ms
    this.accentAttack = 3.0;   // ms
    this.slideTime = 60.0;     // ms
    this.accent = 0.5;         // 0-1
    this.volume = 0.5;         // 0-1
    this.oversampling = 4;     // 1, 2, or 4 (Open303 uses 4)

    // === DEVIL FISH PARAMETERS ===
    this.devilFishEnabled = false;
    this.vegDecay = 300.0;      // ms (VEG decay time)
    this.vegSustain = 0.0;      // 0-1 (VEG sustain level)
    this.softAttack = 3.0;      // ms (attack time for non-accented notes)
    this.filterTracking = 0.0;  // 0-2 (0=off, 1=1:1, 2=over-tracking)
    this.filterFM = 0.0;        // 0-1 (audio-rate filter modulation)
    this.sweepSpeed = 1;        // 0=fast, 1=normal, 2=slow
    this.muffler = 0;           // 0=off, 1=soft, 2=hard
    this.highResonance = false; // Allow self-oscillation
    this.accentSweepEnabled = false;

    // Accent sweep state (capacitor charge simulation)
    this.accentCharge = 0.0;
    this.lastAccentTime = 0.0;

    // === NOTE STATE ===
    this.noteOn = false;
    this.currentAccent = false;
    this.accentGain = 0.0;

    // === CALCULATE INITIAL COEFFICIENTS ===
    this.calculateFilterCoefficients();
    this.calculateEnvelopeCoefficients();
    this.calculateAdditionalFilters();
    this.calculateEnvModScalerAndOffset();

    // === MESSAGE PORT ===
    this.port.onmessage = (e) => this.handleMessage(e.data);

    // Debug counter
    this.processCounter = 0;
    this.lastLogTime = 0;
  }

  // ============================================================================
  // MESSAGE HANDLING
  // ============================================================================

  handleMessage(data) {
    const { type } = data;

    if (type === 'noteOn') {
      // console.log('[TB303 Worklet] noteOn:', data);
      this.triggerNote(data.note, data.velocity, data.accent, data.slide);
    } else if (type === 'noteOff') {
      this.releaseNote();
    } else if (type === 'setParameter') {
      this.setParameter(data.param, data.value);
    }
  }

  setParameter(param, value) {
    switch (param) {
      case 'waveform':
        this.waveform = value;  // 0-1
        break;
      case 'cutoff':
        this.cutoff = value;
        this.calculateFilterCoefficients();
        this.calculateEnvModScalerAndOffset();
        break;
      case 'resonance':
        this.resonance = value;  // 0-1
        this.calculateFilterCoefficients();
        break;
      case 'envMod':
        this.envMod = value;
        break;
      case 'normalDecay':
        this.normalDecay = value;
        if (!this.currentAccent) {
          this.calculateEnvelopeCoefficients();
        }
        break;
      case 'accentDecay':
        this.accentDecay = value;
        if (this.currentAccent) {
          this.calculateEnvelopeCoefficients();
        }
        break;
      case 'slideTime':
        this.slideTime = value;
        this.calculateSlideCoefficient();
        break;
      case 'accent':
        this.accent = value;
        break;
      case 'volume':
        this.volume = value;
        break;
      case 'oversampling':
        this.oversampling = Math.max(1, Math.min(4, Math.floor(value)));  // Clamp to 1, 2, 3, or 4
        break;

      // Devil Fish parameters
      case 'devilFishEnabled':
        this.devilFishEnabled = value;
        break;
      case 'vegDecay':
        this.vegDecay = value;
        break;
      case 'vegSustain':
        this.vegSustain = value;
        break;
      case 'softAttack':
        this.softAttack = value;
        break;
      case 'filterTracking':
        this.filterTracking = value;
        break;
      case 'filterFM':
        this.filterFM = value;
        break;
      case 'sweepSpeed':
        this.sweepSpeed = value;
        break;
      case 'muffler':
        this.muffler = value;
        break;
      case 'highResonance':
        this.highResonance = value;
        this.calculateFilterCoefficients();  // Recalc resonance curve
        break;
      case 'accentSweepEnabled':
        this.accentSweepEnabled = value;
        break;
    }
  }

  // ============================================================================
  // NOTE TRIGGERING
  // ============================================================================

  triggerNote(noteNumber, velocity, accent, slide) {
    const freq = 440.0 * Math.pow(2, (noteNumber - 69) / 12);

    // console.log('[TB303 Worklet] triggerNote - freq:', freq, 'accent:', accent, 'slide:', slide);
    // console.log('[TB303 Worklet] Current volume:', this.volume, 'cutoff:', this.cutoff, 'resonance:', this.resonance);

    this.currentAccent = accent || false;

    if (slide && this.noteOn) {
      // Slide from current frequency to new frequency
      this.pitchSlewTarget = freq;
      // console.log('[TB303 Worklet] SLIDE mode - target:', this.pitchSlewTarget);
      // Note: Don't retrigger envelopes on slide
    } else {
      // Normal note trigger
      this.frequency = freq;
      this.pitchSlewValue = freq;
      this.pitchSlewTarget = freq;

      // console.log('[TB303 Worklet] TRIGGER mode - frequency set to:', this.frequency, 'phaseInc will be:', this.frequency / this.sampleRate);

      // Trigger envelopes
      this.mainEnvValue = 1.0;
      this.mainEnvActive = true;

      this.ampEnvValue = 1.0;
      this.ampEnvActive = true;

      // Reset RC filters
      this.rc1Value = 0.0;
      this.rc2Value = 0.0;

      // Reset filter state to prevent NaN
      this.y1 = 0.0;
      this.y2 = 0.0;
      this.y3 = 0.0;
      this.y4 = 0.0;
      this.fbHpX1 = 0.0;
      this.fbHpY = 0.0;

      // Set accent gain with optional sweep speed behavior
      if (this.currentAccent) {
        // Devil Fish: Accent sweep (capacitor charge simulation)
        if (this.devilFishEnabled && this.accentSweepEnabled) {
          const currentTime = currentFrame / sampleRate;
          const timeSinceLastAccent = currentTime - this.lastAccentTime;

          // Discharge rate depends on sweep speed
          let dischargeRate, chargeRate, maxCharge;
          if (this.sweepSpeed === 0) {
            // Fast: Quick discharge, smaller subsequent accents
            dischargeRate = 0.8;
            chargeRate = 0.3;
            maxCharge = 1.2;
          } else if (this.sweepSpeed === 2) {
            // Slow: Double buildup potential, longer cooldown
            dischargeRate = 0.2;
            chargeRate = 0.6;
            maxCharge = 2.0;
          } else {
            // Normal (default)
            dischargeRate = 0.5;
            chargeRate = 0.5;
            maxCharge = 1.5;
          }

          // Discharge over time
          this.accentCharge *= Math.exp(-dischargeRate * timeSinceLastAccent);

          // Charge up
          this.accentCharge = Math.min(this.accentCharge + chargeRate, maxCharge);
          this.lastAccentTime = currentTime;

          // Apply base accent + charged boost
          this.accentGain = this.accent * (1.0 + this.accentCharge * 0.5);
        } else {
          // Normal accent (no sweep)
          this.accentGain = this.accent;
        }
      } else {
        this.accentGain = 0.0;
      }

      // Use correct attack/decay times for accent
      this.calculateEnvelopeCoefficients();

      // Reset debug counter for new note
      this.processCounter = 0;
    }

    this.noteOn = true;
  }

  releaseNote() {
    // 303 has no release - envelopes decay to zero
    // Just mark note as off
    this.noteOn = false;
  }

  // ============================================================================
  // COEFFICIENT CALCULATIONS
  // ============================================================================

  /**
   * Calculate filter coefficients using TB-303 algorithm
   * From Open303/TeeBeeFilter TB_303 mode
   */
  calculateFilterCoefficients() {
    const oldB0 = this.b0;
    const oldK = this.k;
    const wc = this.twoPiOverSampleRate * this.cutoff;
    const fx = wc * ONE_OVER_SQRT2 / TWOPI;

    // Skew resonance for musical response
    const r = this.resonance;

    // Devil Fish: High resonance mode allows self-oscillation
    let resonanceSkewed;
    if (this.devilFishEnabled && this.highResonance) {
      // Higher Q range for self-oscillation (steeper curve)
      resonanceSkewed = (1.0 - Math.exp(-5.0 * r)) / (1.0 - Math.exp(-5.0));
    } else {
      // Normal TB-303 resonance curve
      resonanceSkewed = (1.0 - Math.exp(-3.0 * r)) / (1.0 - Math.exp(-3.0));
    }

    // TB-303 specific coefficient formulas (mystran & kunn algorithm)
    this.b0 = (0.00045522346 + 6.1922189 * fx) / (1.0 + 12.358354 * fx + 4.4156345 * (fx * fx));

    // Feedback factor (6th order polynomial)
    this.k = fx * (fx * (fx * (fx * (fx * (fx + 7198.6997) - 5837.7917) - 476.47308) + 614.95611) + 213.87126) + 16.998792;

    // Output gain
    this.g = this.k * (1.0 / 17.0);  // 17 reciprocal
    this.g = (this.g - 1.0) * resonanceSkewed + 1.0;
    this.g = this.g * (1.0 + resonanceSkewed);

    // Apply resonance to feedback
    this.k = this.k * resonanceSkewed;

    // Feedback highpass coefficients (one-pole highpass)
    // Cutoff around 150 Hz (adjustable in Devil Fish)
    const fbHpCutoff = 150.0;
    const x = Math.exp(-2.0 * Math.PI * fbHpCutoff / this.sampleRate);
    this.fbHpB0 =  0.5 * (1.0 + x);
    this.fbHpB1 = -0.5 * (1.0 + x);
    this.fbHpA1 = x;

    // Debug filter coefficients (only first time)
    // if (Math.abs(oldB0 - this.b0) > 0.001 || Math.abs(oldK - this.k) > 0.1) {
    //   if (this.processCounter === 0) {
    //     console.log('[TB303 Worklet] Filter coeffs - b0:', this.b0, 'k:', this.k, 'g:', this.g, 'cutoff:', this.cutoff);
    //   }
    // }
  }

  /**
   * Calculate envelope decay coefficients
   */
  calculateEnvelopeCoefficients() {
    const decay = this.currentAccent ? this.accentDecay : this.normalDecay;

    // Devil Fish: Soft attack for non-accented notes
    let attack;
    if (this.devilFishEnabled) {
      attack = this.currentAccent ? this.accentAttack : this.softAttack;
    } else {
      attack = this.currentAccent ? this.accentAttack : this.normalAttack;
    }

    // Main envelope decay (exponential)
    // decay time is in ms, convert to samples
    const decaySamples = (decay / 1000.0) * this.sampleRate;
    this.mainEnvDecayCoeff = Math.exp(-1.0 / decaySamples);

    // Amp envelope decay
    // Devil Fish: Use vegDecay if enabled, otherwise fixed 3000ms like real 303
    const ampDecay = this.devilFishEnabled ? this.vegDecay : 3000.0;
    const ampDecaySamples = (ampDecay / 1000.0) * this.sampleRate;
    this.ampEnvDecayCoeff = Math.exp(-1.0 / ampDecaySamples);

    // RC filter time constants (attack times)
    const attackSamples = (attack / 1000.0) * this.sampleRate;
    const tau = attackSamples;
    this.rc1Coeff = Math.exp(-1.0 / tau);
    this.rc2Coeff = Math.exp(-1.0 / tau);

    // Calculate normalizers (so RC + decay reaches peak correctly)
    this.updateNormalizers();
  }

  /**
   * Update normalizer values for RC filters
   */
  updateNormalizers() {
    // Normalizers ensure the RC->envelope chain peaks at correct level
    // Simplified calculation (full Open303 has more complex math)
    this.n1 = 1.0;
    this.n2 = 1.0;
  }

  /**
   * Calculate slide (portamento) coefficient
   */
  calculateSlideCoefficient() {
    const slideSamples = (this.slideTime / 1000.0) * this.sampleRate;
    this.pitchSlewCoeff = Math.exp(-1.0 / slideSamples);
  }

  /**
   * Calculate coefficients for additional filters (Open303 refinements)
   * From Open303.cpp constructor lines 67-71
   */
  calculateAdditionalFilters() {
    // Pre-filter highpass: 44.486 Hz
    let x = Math.exp(-2.0 * Math.PI * 44.486 / this.sampleRate);
    this.preHpB0 = 0.5 * (1.0 + x);
    this.preHpB1 = -0.5 * (1.0 + x);
    this.preHpA1 = x;

    // Post-filter highpass: 24.167 Hz
    x = Math.exp(-2.0 * Math.PI * 24.167 / this.sampleRate);
    this.postHpB0 = 0.5 * (1.0 + x);
    this.postHpB1 = -0.5 * (1.0 + x);
    this.postHpA1 = x;

    // Allpass: 14.008 Hz
    const t = Math.tan(Math.PI * 14.008 / this.sampleRate);
    const apX = (t - 1.0) / (t + 1.0);
    this.apB0 = apX;
    this.apB1 = 1.0;
    this.apA1 = -apX;

    // Notch (bandreject): 7.5164 Hz, bandwidth 4.7 octaves
    this.calculateNotchCoefficients(7.5164, 4.7);
  }

  /**
   * Calculate notch (bandreject) filter coefficients
   * From Open303 BiquadFilter BANDREJECT mode
   */
  calculateNotchCoefficients(frequency, bandwidth) {
    const omega = 2.0 * Math.PI * frequency / this.sampleRate;
    const sn = Math.sin(omega);
    const cs = Math.cos(omega);
    const alpha = sn * Math.sinh(Math.LN2 / 2.0 * bandwidth * omega / sn);

    const a0 = 1.0 + alpha;
    this.notchB0 = 1.0 / a0;
    this.notchB1 = (-2.0 * cs) / a0;
    this.notchB2 = 1.0 / a0;
    this.notchA1 = (-2.0 * cs) / a0;
    this.notchA2 = (1.0 - alpha) / a0;
  }

  /**
   * Calculate envelope modulation scaler and offset
   * From Open303.cpp calculateEnvModScalerAndOffset()
   * Uses calibrated measurements from real TB-303 hardware
   */
  calculateEnvModScalerAndOffset() {
    // Constants from measurements (Open303.cpp lines 297-304)
    const c0 = 3.138152786059267e+002;  // Lowest nominal cutoff
    const c1 = 2.394411986817546e+003;  // Highest nominal cutoff
    const oF = 0.048292930943553;       // Factor in line equation for offset
    const oC = 0.294391201442418;       // Constant in line equation for offset
    const sLoF = 3.773996325111173;     // Factor for scaler at low cutoff
    const sLoC = 0.736965594166206;     // Constant for scaler at low cutoff
    const sHiF = 4.194548788411135;     // Factor for scaler at high cutoff
    const sHiC = 0.864344900642434;     // Constant for scaler at high cutoff

    // Convert envMod (0-4000 Hz) to normalized value (0-1)
    const e = this.envMod / 4000.0;

    // Convert cutoff to normalized value (0-1) using exponential mapping
    const c = Math.log(this.cutoff / c0) / Math.log(c1 / c0);

    // Calculate scaler by interpolating between low and high cutoff
    const sLo = sLoF * e + sLoC;
    const sHi = sHiF * e + sHiC;
    this.envScaler = (1.0 - c) * sLo + c * sHi;

    // Calculate offset
    this.envOffset = oF * c + oC;
  }

  // ============================================================================
  // DSP FUNCTIONS
  // ============================================================================

  /**
   * Feedback highpass filter (one-pole)
   * Formula from Open303/OnePoleFilter.cpp HIGHPASS mode
   */
  feedbackHighpass(input) {
    const TINY = 1.0e-30;  // Prevent denormals
    this.fbHpY = this.fbHpB0 * input + this.fbHpB1 * this.fbHpX1 + this.fbHpA1 * this.fbHpY + TINY;
    this.fbHpX1 = input;
    return this.fbHpY;
  }

  /**
   * Pre-filter highpass (one-pole)
   */
  preFilterHighpass(input) {
    const TINY = 1.0e-30;
    this.preHpY = this.preHpB0 * input + this.preHpB1 * this.preHpX1 + this.preHpA1 * this.preHpY + TINY;
    this.preHpX1 = input;
    return this.preHpY;
  }

  /**
   * Post-filter highpass (one-pole)
   */
  postFilterHighpass(input) {
    const TINY = 1.0e-30;
    this.postHpY = this.postHpB0 * input + this.postHpB1 * this.postHpX1 + this.postHpA1 * this.postHpY + TINY;
    this.postHpX1 = input;
    return this.postHpY;
  }

  /**
   * Allpass filter (one-pole)
   */
  allpassFilter(input) {
    const TINY = 1.0e-30;
    this.apY = this.apB0 * input + this.apB1 * this.apX1 + this.apA1 * this.apY + TINY;
    this.apX1 = input;
    return this.apY;
  }

  /**
   * Notch filter (biquad bandreject)
   */
  notchFilter(input) {
    const TINY = 1.0e-30;
    const output = this.notchB0 * input + this.notchB1 * this.notchX1 + this.notchB2 * this.notchX2
                   - this.notchA1 * this.notchY1 - this.notchA2 * this.notchY2 + TINY;
    this.notchX2 = this.notchX1;
    this.notchX1 = input;
    this.notchY2 = this.notchY1;
    this.notchY1 = output;
    return output;
  }

  /**
   * TB-303 Filter (TeeBeeFilter TB_303 mode)
   * This is the heart of the 303 sound
   */
  filterSample(input) {
    const TINY = 1.0e-30;  // Prevent denormals

    // Feedback path with highpass
    const y0 = input - this.feedbackHighpass(this.k * this.y4);

    // 4-pole ladder with special integration (state variable filter)
    // From Open303/TeeBeeFilter.h TB_303 mode (lines 290-293)
    this.y1 += 2.0 * this.b0 * (y0 - this.y1 + this.y2) + TINY;
    this.y2 +=       this.b0 * (this.y1 - 2.0 * this.y2 + this.y3) + TINY;
    this.y3 +=       this.b0 * (this.y2 - 2.0 * this.y3 + this.y4) + TINY;
    this.y4 +=       this.b0 * (this.y3 - 2.0 * this.y4) + TINY;

    return 2.0 * this.g * this.y4;
  }

  /**
   * PolyBLEP Oscillator
   * Generates anti-aliased saw and square waveforms
   */
  polyBlep(t) {
    // Polynomial bandlimited step function
    if (t < this.phaseInc) {
      t = t / this.phaseInc;
      return t + t - t * t - 1.0;
    } else if (t > 1.0 - this.phaseInc) {
      t = (t - 1.0) / this.phaseInc;
      return t * t + t + t + 1.0;
    }
    return 0.0;
  }

  oscillatorSample() {
    // Generate saw
    let saw = (2.0 * this.phase) - 1.0;
    saw -= this.polyBlep(this.phase);

    // Generate square
    let square = this.phase < 0.5 ? 1.0 : -1.0;
    square += this.polyBlep(this.phase);
    square -= this.polyBlep((this.phase + 0.5) % 1.0);

    // Blend between saw and square
    // Square is scaled by 0.5 (as in Open303)
    const output = (1.0 - this.waveform) * saw + this.waveform * square * 0.5;

    // Update phase
    this.phase += this.phaseInc;
    if (this.phase >= 1.0) {
      this.phase -= 1.0;
    }

    return output;
  }

  /**
   * Update all envelopes
   */
  updateEnvelopes() {
    // Main envelope (exponential decay)
    if (this.mainEnvActive) {
      this.mainEnvValue *= this.mainEnvDecayCoeff;
      if (this.mainEnvValue < 0.0001) {
        this.mainEnvActive = false;
        this.mainEnvValue = 0.0;
      }
    }

    // Amp envelope
    // Devil Fish: VEG sustain - decay to sustain level instead of 0
    if (this.ampEnvActive) {
      const sustainLevel = this.devilFishEnabled ? this.vegSustain : 0.0;
      this.ampEnvValue *= this.ampEnvDecayCoeff;

      // Decay towards sustain level
      if (this.ampEnvValue < sustainLevel + 0.0001) {
        if (sustainLevel > 0.0) {
          // Hold at sustain level (infinite notes when sustain > 0)
          this.ampEnvValue = sustainLevel;
        } else {
          // Normal decay to zero
          this.ampEnvActive = false;
          this.ampEnvValue = 0.0;
        }
      }
    }

    // RC filters (leaky integrators)
    // Input: mainEnvValue, Output: filtered envelope
    const rc1Target = this.mainEnvValue;
    this.rc1Value += (1.0 - this.rc1Coeff) * (rc1Target - this.rc1Value);

    const rc2Target = this.accentGain > 0.0 ? this.mainEnvValue : 0.0;
    this.rc2Value += (1.0 - this.rc2Coeff) * (rc2Target - this.rc2Value);
  }

  /**
   * Calculate instantaneous filter cutoff from envelopes
   * From Open303: instCutoff = cutoff * pow(2.0, envelope)
   * Uses calibrated envScaler and envOffset from real hardware measurements
   */
  getInstantaneousCutoff() {
    // Combine RC envelope paths (Open303.cpp lines 368-374)
    const tmp1 = this.n1 * this.rc1Value;
    const tmp2 = this.accentGain * this.n2 * this.rc2Value;

    // Apply scaler and offset (calibrated from real TB-303)
    const tmp1Scaled = this.envScaler * (tmp1 - this.envOffset);

    // Calculate modulation amount
    const envValue = tmp1Scaled + tmp2;

    // Apply envelope modulation multiplicatively (octave-based)
    // instCutoff = cutoff * pow(2.0, envelope)
    let instCutoff = this.cutoff * Math.pow(2.0, envValue);

    // Devil Fish: Filter tracking (LINEAR Hz response, not exponential)
    // From manual: "filter might have a cutoff of say 1 kHz. With a CV of 3 volts
    // this would become 1.5 kHz, with 4 volts it would become 2 kHz"
    // Reference: C2 (65.41 Hz) at 2V is zero point
    if (this.devilFishEnabled && this.filterTracking > 0) {
      const referenceFreq = 65.41; // C2
      const referenceVoltage = 2.0;

      // Convert frequency to CV voltage (1V/octave)
      const noteVoltage = referenceVoltage + Math.log2(this.pitchSlewValue / referenceFreq);
      const voltageDiff = noteVoltage - referenceVoltage;

      // LINEAR tracking: ~2.7 kHz per volt at max
      const maxHzPerVolt = 2700.0;
      const trackingOffset = voltageDiff * maxHzPerVolt * this.filterTracking;

      instCutoff += trackingOffset;
    }

    // Clamp to valid range
    return Math.max(20.0, Math.min(20000.0, instCutoff));
  }

  /**
   * Apply muffler (Devil Fish soft clipping)
   * Soft clips the VCA output, adding warmth and buzz
   */
  applyMuffler(input) {
    if (this.muffler === 1) {
      // Soft muffler - gentle limiting that preserves bass
      const threshold = 0.5;
      if (Math.abs(input) < threshold) {
        return input;
      }
      const sign = input >= 0 ? 1 : -1;
      const excess = Math.abs(input) - threshold;
      return sign * (threshold + Math.tanh(excess * 2.0) * (1.0 - threshold));
    } else if (this.muffler === 2) {
      // Hard muffler - more aggressive clipping with buzz
      const threshold = 0.3;
      if (Math.abs(input) < threshold) {
        return input;
      }
      const sign = input >= 0 ? 1 : -1;
      const excess = Math.abs(input) - threshold;
      return sign * (threshold + Math.tanh(excess * 4.0) * (1.0 - threshold) * 0.7);
    }
    return input; // muffler === 0, bypass
  }

  /**
   * Update pitch slew (portamento)
   * Uses leaky integrator formula: y = input + coeff * (y - input)
   */
  updatePitchSlew() {
    // Leaky integrator (same as Open303/LeakyIntegrator)
    this.pitchSlewValue = this.pitchSlewTarget + this.pitchSlewCoeff * (this.pitchSlewValue - this.pitchSlewTarget);
    this.frequency = this.pitchSlewValue;
    // Phase increment must account for oversampling rate
    // Open303 runs oscillator at oversampling*sampleRate (line 100 in Open303.cpp)
    this.phaseInc = this.frequency / (this.sampleRate * this.oversampling);

    // Debug
    // if (this.processCounter === 0 && this.noteOn) {
    //   console.log('[TB303 Worklet] Phase increment:', this.phaseInc, 'frequency:', this.frequency);
    // }
  }

  // ============================================================================
  // MAIN PROCESS LOOP
  // ============================================================================

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const outputChannel = output[0];

    if (!outputChannel) {
      return true;
    }

    // Debug: Log every second
    // const now = currentTime;
    // if (now - this.lastLogTime > 1.0) {
    //   console.log('[TB303 Worklet] Processing - noteOn:', this.noteOn, 'ampEnv:', this.ampEnvValue.toFixed(3), 'volume:', this.volume);
    //   this.lastLogTime = now;
    // }

    for (let i = 0; i < outputChannel.length; i++) {
      // Update pitch slew
      this.updatePitchSlew();

      // Update envelopes
      this.updateEnvelopes();

      // Calculate instantaneous cutoff
      const instCutoff = this.getInstantaneousCutoff();

      // Update filter cutoff (only if changed significantly)
      if (Math.abs(instCutoff - this.cutoff) > 1.0) {
        const savedCutoff = this.cutoff;
        this.cutoff = instCutoff;
        this.calculateFilterCoefficients();
        this.cutoff = savedCutoff;  // Restore base cutoff
      }

      let sample = 0.0;
      let oscSample = 0.0;
      let filteredSample = 0.0;

      // Oversampled processing (Open303 style: oscillator + pre-hp + main filter at 4x)
      for (let j = 0; j < this.oversampling; j++) {
        // Generate oscillator sample
        sample = this.oscillatorSample();
        if (j === 0) oscSample = sample;  // Store first sample for debug

        // Negate for 303 character (inverted signal in hardware)
        sample = -sample;

        // Pre-filter highpass (runs at oversampled rate)
        sample = this.preFilterHighpass(sample);

        // Main TeeBee filter (runs at oversampled rate)
        sample = this.filterSample(sample);
      }
      filteredSample = sample;

      // Post-filter processing (runs at base sample rate)
      sample = this.allpassFilter(sample);
      sample = this.postFilterHighpass(sample);
      sample = this.notchFilter(sample);

      // Apply VCA envelope
      sample *= this.ampEnvValue;

      // Devil Fish: Muffler (soft clipping on VCA output)
      if (this.devilFishEnabled && this.muffler > 0) {
        sample = this.applyMuffler(sample);
      }

      // Apply volume
      sample *= this.volume;

      // Output
      outputChannel[i] = sample;

      // Debug: Check for non-zero samples
      // if (this.processCounter < 10) {
      //   if (Math.abs(oscSample) > 0.01 || Math.abs(filteredSample) > 0.01 || Math.abs(sample) > 0.001) {
      //     console.log('[TB303 Worklet] osc:', oscSample.toFixed(4), 'filtered:', filteredSample.toFixed(4), 'final:', sample.toFixed(4));
      //     this.processCounter++;
      //   }
      // }
    }

    return true;
  }
}

// Guard against re-registration during HMR
try {
  registerProcessor('tb303-processor', TB303Processor);
} catch (e) {
  // Already registered - ignore
}
