/**
 * DB303 AudioWorklet Processor
 * TB-303 Bass Synthesizer for DEViLBOX
 *
 * IMPORTANT: AudioWorklets don't support dynamic import().
 * The WASM module JS is passed as a string and executed via Function constructor.
 */

// Performance: Disable note event logging (causes severe slowdown if true)
const DEBUG_NOTE_EVENTS = false;

// ─────────────────────────────────────────────────────────────────────────────
// Post-synth drive stage — port of schwung-303 drive.h (GPL-3.0-or-later).
//   Model 0 "Soft": tilt-EQ + 2x-oversampled asymmetric tanh. Warm softclip.
//   Model 1 "RAT":  ProCo RAT port (davemollen/dm-Rat, GPL-3.0):
//                   distortion-modulated 3rd-order op-amp IIR → algebraic
//                   waveshaper x/(1+x^4)^(1/4) around 2x oversampling →
//                   fixed-mid tone stack.
// drive amount 0 fully bypasses; mix is dry/wet.
// ─────────────────────────────────────────────────────────────────────────────

class DriveBiquad {
  constructor() { this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0; this.z1 = 0; this.z2 = 0; }
  reset() { this.z1 = 0; this.z2 = 0; }
  process(x) {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
  setLowpass(fc, fs) {
    const q = 0.7071067811865476;
    const w0 = 2 * Math.PI * fc / fs;
    const cs = Math.cos(w0), sn = Math.sin(w0);
    const alpha = sn / (2 * q);
    const b0 = (1 - cs) * 0.5, b1 = 1 - cs, b2 = (1 - cs) * 0.5;
    const a0 = 1 + alpha, a1 = -2 * cs, a2 = 1 - alpha;
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0;
    this.a1 = a1 / a0; this.a2 = a2 / a0;
  }
  setLowShelf(fc, gainDb, fs) {
    const A = Math.pow(10, gainDb / 40);
    const w0 = 2 * Math.PI * fc / fs;
    const cs = Math.cos(w0), sn = Math.sin(w0);
    const S = 1.0;
    const alpha = sn * 0.5 * Math.sqrt((A + 1 / A) * (1 / S - 1) + 2);
    const sqrtA2alpha = 2 * Math.sqrt(A) * alpha;
    const b0 = A * ((A + 1) - (A - 1) * cs + sqrtA2alpha);
    const b1 = 2 * A * ((A - 1) - (A + 1) * cs);
    const b2 = A * ((A + 1) - (A - 1) * cs - sqrtA2alpha);
    const a0 = (A + 1) + (A - 1) * cs + sqrtA2alpha;
    const a1 = -2 * ((A - 1) + (A + 1) * cs);
    const a2 = (A + 1) + (A - 1) * cs - sqrtA2alpha;
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0;
    this.a1 = a1 / a0; this.a2 = a2 / a0;
  }
}

// One-pole LPF with cutoff re-tuning (dm-Rat's OnePoleFilter shape).
class DriveOnePoleLP {
  constructor(fs) { this.tNegTau = -2 * Math.PI / fs; this.z = 0; this.prevFreq = -1; this.b1 = 0; }
  reset() { this.z = 0; this.prevFreq = -1; }
  process(x, freq) {
    if (freq !== this.prevFreq) {
      this.b1 = Math.exp(freq * this.tNegTau);
      this.prevFreq = freq;
    }
    this.z = x * (1 - this.b1) + this.z * this.b1;
    return this.z;
  }
}

const SOFT_TANH_BIAS = 0.15;
const SOFT_TANH_BIAS_OUT = Math.tanh(SOFT_TANH_BIAS);
function softAsymTanh(x) { return Math.tanh(x + SOFT_TANH_BIAS) - SOFT_TANH_BIAS_OUT; }

class SoftDriveChannel {
  constructor(fs) {
    this.preShelf = new DriveBiquad();
    this.postShelf = new DriveBiquad();
    this.upLp = new DriveBiquad();
    this.downLp = new DriveBiquad();
    const fs2 = fs * 2;
    this.preShelf.setLowShelf(400, 6, fs);
    this.postShelf.setLowShelf(400, -6, fs);
    this.upLp.setLowpass(19000, fs2);
    this.downLp.setLowpass(19000, fs2);
    this.dcX1 = 0; this.dcY1 = 0;
  }
  reset() {
    this.preShelf.reset(); this.postShelf.reset();
    this.upLp.reset(); this.downLp.reset();
    this.dcX1 = 0; this.dcY1 = 0;
  }
  process(buf, frames, driveAmt, mix) {
    const preGain = Math.pow(10, driveAmt * 24 / 20);
    const invPre = 1 / preGain;
    const wet = mix, dry = 1 - mix;
    for (let n = 0; n < frames; n++) {
      const x = buf[n];
      const v = this.preShelf.process(x) * preGain;
      const up0 = 2 * this.upLp.process(v);
      const up1 = 2 * this.upLp.process(0);
      const sat0 = softAsymTanh(up0);
      const sat1 = softAsymTanh(up1);
      this.downLp.process(sat0);
      let y = this.downLp.process(sat1);
      y *= invPre;
      y = this.postShelf.process(y);
      const yHp = y - this.dcX1 + 0.9996 * this.dcY1;
      this.dcX1 = y; this.dcY1 = yHp;
      buf[n] = dry * x + wet * yHp;
    }
  }
}

// RAT op-amp circuit constants (dm-Rat op_amp.rs / clipper.rs / tone.rs).
const RAT_R1 = 100000.0;
const RAT_C1 = 1e-10;
const RAT_Z1_B0 = 2.72149e-7;
const RAT_Z1_B1 = 0.0027354;
const RAT_Z1_A0 = 6.27638e-9;
const RAT_Z1_A1 = 0.0000069;
const RAT_MAX_GAIN_AT_1HZ = 1119360.558108;
const RAT_MIN_DIST_GAIN = 1.0;
const RAT_MAX_DIST_GAIN = 2307.231003;
const RAT_CLIP_PRE_GAIN = 1.877;
const RAT_CLIP_POST_GAIN = 0.3204805;
const RAT_TONE_R1 = 100000.0;
const RAT_TONE_R2 = 1500.0;
const RAT_TONE_C1 = 3.3e-9;

function ratClip(x) {
  const x2 = x * x;
  return x / Math.sqrt(Math.sqrt(1 + x2 * x2));
}

function ratToneCutoff(tone) {
  const R = tone * RAT_TONE_R1 + RAT_TONE_R2;
  return 1 / (2 * Math.PI * R * RAT_TONE_C1);
}

class RatDriveChannel {
  constructor(fs) {
    // 3rd-order IIR (direct-form-2 transposed) state; coeffs shared via stage.
    this.z0 = 0; this.z1 = 0; this.z2 = 0;
    this.correction = new DriveOnePoleLP(fs);
    this.tone = new DriveOnePoleLP(fs);
    this.upLp = new DriveBiquad();
    this.downLp = new DriveBiquad();
    const fs2 = fs * 2;
    this.upLp.setLowpass(19000, fs2);
    this.downLp.setLowpass(19000, fs2);
    this.dcX1 = 0; this.dcY1 = 0;
  }
  reset() {
    this.z0 = 0; this.z1 = 0; this.z2 = 0;
    this.correction.reset(); this.tone.reset();
    this.upLp.reset(); this.downLp.reset();
    this.dcX1 = 0; this.dcY1 = 0;
  }
  process(buf, frames, coeffB, coeffA, correctionCutoff, toneFreq, mix) {
    const wet = mix, dry = 1 - mix;
    for (let n = 0; n < frames; n++) {
      const x = buf[n];
      // Op-amp stage — distortion-modulated 3rd-order IIR.
      const y0 = x * coeffB[0] + this.z0;
      this.z0 = x * coeffB[1] - y0 * coeffA[1] + this.z1;
      this.z1 = x * coeffB[2] - y0 * coeffA[2] + this.z2;
      this.z2 = x * coeffB[3] - y0 * coeffA[3];
      let v = this.correction.process(y0, correctionCutoff);
      v *= RAT_CLIP_PRE_GAIN;
      // 2x oversampling around the clipper.
      const up0 = 2 * this.upLp.process(v);
      const up1 = 2 * this.upLp.process(0);
      const sat0 = ratClip(up0);
      const sat1 = ratClip(up1);
      this.downLp.process(sat0);
      let y = this.downLp.process(sat1);
      y *= RAT_CLIP_POST_GAIN;
      y = this.tone.process(y, toneFreq);
      const yHp = y - this.dcX1 + 0.9996 * this.dcY1;
      this.dcX1 = y; this.dcY1 = yHp;
      buf[n] = dry * x + wet * yHp;
    }
  }
}

class DriveStage {
  constructor(fs) {
    this.fs = fs;
    this.model = 0;   // 0=Soft, 1=RAT
    this.amount = 0;  // 0..1, 0 = bypass
    this.mix = 1;     // dry/wet
    this.soft = [new SoftDriveChannel(fs), new SoftDriveChannel(fs)];
    this.rat = [new RatDriveChannel(fs), new RatDriveChannel(fs)];
    // Bilinear-transform scale factors (dm-Rat BilinearTransform).
    const t = 1 / fs;
    this.blS0 = t * 0.5;
    this.blS1 = t * t * 0.25;
    this.blS2 = t * t * t * 0.125;
    this.ratB = [1, 0, 0, 0];
    this.ratA = [1, 0, 0, 0];
  }
  setModel(m) {
    const next = m === 1 ? 1 : 0;
    if (next !== this.model) {
      // Reset destination state so we don't hear stale filter history.
      (next === 1 ? this.rat : this.soft).forEach((c) => c.reset());
      this.model = next;
    }
  }
  // Transforms s-domain polynomial [x0..x3] into z-domain [y0..y3].
  bilinear(x, out) {
    const x0 = x[0], x1 = x[1] * this.blS0, x2 = x[2] * this.blS1, x3 = x[3] * this.blS2;
    out[0] = x0 + x1 + x2 + x3;
    out[1] = -3 * x0 - x1 + x2 + 3 * x3;
    out[2] = 3 * x0 - x1 - x2 + 3 * x3;
    out[3] = -x0 + x1 - x2 + x3;
  }
  updateRatCoeffs(distortion) {
    const z2b0 = Math.max(distortion * RAT_R1, 1);
    const z2a0 = z2b0 * RAT_C1;
    const a0 = RAT_Z1_B0 * z2a0;
    const a1 = RAT_Z1_B0 + RAT_Z1_B1 * z2a0;
    const a2 = RAT_Z1_B1 + z2a0;
    const b0 = a0;
    const b1 = a1 + RAT_Z1_A0 * z2b0;
    const b2 = RAT_Z1_A1 * z2b0 + RAT_Z1_B1 + z2a0;
    const numZ = [0, 0, 0, 0], denZ = [0, 0, 0, 0];
    this.bilinear([b0, b1, b2, 1], numZ);
    this.bilinear([a0, a1, a2, 1], denZ);
    const invA0 = 1 / denZ[0];
    for (let i = 0; i < 4; i++) {
      this.ratB[i] = numZ[i] * invA0;
      this.ratA[i] = denZ[i] * invA0;
    }
  }
  process(bufL, bufR, frames) {
    if (this.amount <= 0 || this.mix <= 0) return;
    const stereo = bufR !== bufL;
    if (this.model === 0) {
      this.soft[0].process(bufL, frames, this.amount, this.mix);
      if (stereo) this.soft[1].process(bufR, frames, this.amount, this.mix);
    } else {
      const distortion = Math.max(this.amount, 0.001);
      this.updateRatCoeffs(distortion);
      const correctionCutoff = RAT_MAX_GAIN_AT_1HZ /
        (distortion * (RAT_MAX_DIST_GAIN - RAT_MIN_DIST_GAIN) + RAT_MIN_DIST_GAIN);
      const toneFreq = ratToneCutoff(0.5);
      this.rat[0].process(bufL, frames, this.ratB, this.ratA, correctionCutoff, toneFreq, this.mix);
      if (stereo) this.rat[1].process(bufR, frames, this.ratB, this.ratA, correctionCutoff, toneFreq, this.mix);
    }
  }
}

class DB303Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.synth = null;
    this.module = null;
    this.outputPtrL = 0;
    this.outputPtrR = 0;
    this.outputBufferL = null;
    this.outputBufferR = null;
    this.initialized = false;
    this.bufferSize = 128;
    this.lastHeapBuffer = null;
    this.currentNote = -1; // Track currently held note for slide logic
    this.slideNotes = new Set(); // Track orphaned notes from slide sequences
    this.pendingMessages = []; // Queue messages received before WASM init completes
    this.initializing = false;
    this.eventQueue = []; // Queue for sample-accurate events
    this.lastPeakL = 0; // Track peak from actual process() output
    this.processPath = 'unknown'; // Which process branch is used

    // Post-synth drive stage (Soft/RAT) — runs on worklet output, independent
    // of WASM init state. Params: overdrive, overdriveModel, overdriveMix.
    this.drive = new DriveStage(sampleRate);

    // Shadow state: track values sent to WASM setters (since getParameter may not exist)
    this.paramState = {
      cutoff: 0.5, resonance: 0.5, envMod: 0.5, decay: 0.3,
      accent: 0.5, volume: 0.8, waveform: 0, tuning: 0.5
    };

    // Parameter smoothing for glitch-sensitive params (delay time, etc.)
    // Rate is per audio block (~128 samples = 2.9ms at 44.1kHz)
    // Higher rate = faster response, lower rate = smoother
    // delayTime needs VERY slow smoothing to avoid tape-warble/garbage artifacts
    this.smoothedParams = {
      delayTime: { current: 0.3, target: 0.3, rate: 0.002 },  // VERY slow - delay time changes cause glitches
      // cutoff NOT smoothed — WASM engine has internal smoothing; JS smoothing
      // on top makes sweeps sluggish vs original db303.pages.dev
    };
    
    console.log('[DB303 Worklet] v1.3.2 (FilterSelect Validation)');

    this.port.onmessage = (event) => {
      this.handleMessage(event.data);
    };
  }
  
  // Update smoothed parameters - called each process() block
  updateSmoothedParams() {
    if (!this.synth) return;
    
    for (const [paramId, state] of Object.entries(this.smoothedParams)) {
      if (state.current !== state.target) {
        const diff = state.target - state.current;
        if (Math.abs(diff) < 0.0001) {
          state.current = state.target;
        } else {
          state.current += diff * state.rate;
        }
        // Apply the smoothed value to WASM
        const setterName = 'set' + paramId.charAt(0).toUpperCase() + paramId.slice(1);
        if (typeof this.synth[setterName] === 'function') {
          this.synth[setterName](state.current);
        }
      }
    }
  }

  async handleMessage(data) {
    // Drive-stage params live in the worklet (not WASM) — handle them before
    // any init queueing so they are never lost while WASM loads.
    if (data.type === 'setParameter') {
      if (data.paramId === 'overdrive') {
        this.drive.amount = Math.max(0, Math.min(1, parseFloat(data.value) || 0));
        return;
      }
      if (data.paramId === 'overdriveModel') {
        this.drive.setModel(parseInt(data.value, 10) || 0);
        return;
      }
      if (data.paramId === 'overdriveMix') {
        this.drive.mix = Math.max(0, Math.min(1, parseFloat(data.value) || 0));
        return;
      }
    }

    // Queue non-init messages while WASM is still loading
    if (data.type !== 'init' && data.type !== 'dispose' && !this.synth && this.initializing) {
      if (data.type === 'setParameter') {
        this.pendingMessages.push(data);
      }
      return;
    }

    switch (data.type) {
      case 'init':
        await this.initSynth(data.sampleRate, data.wasmBinary, data.jsCode);
        break;
      case 'noteOn':
        // Real TB-303 behavior: new note trigger cancels any pending gate-off
        // This ensures the sequencer's note always takes priority
        this.eventQueue = this.eventQueue.filter(e => e.type !== 'gateOff');
        if (data.time !== undefined) {
          this.eventQueue.push(data);
          this.eventQueue.sort((a, b) => a.time - b.time);
        } else {
          this.processEvent(data);
        }
        break;
      case 'noteOff':
      case 'gateOff':
        // Queue for sample-accurate timing (authentic 303 sequencer behavior)
        if (data.time !== undefined) {
          this.eventQueue.push(data);
          this.eventQueue.sort((a, b) => a.time - b.time);
        } else {
          this.processEvent(data);
        }
        break;
      case 'allNotesOff':
        if (this.synth) {
          if (DEBUG_NOTE_EVENTS) console.log('[DB303] ALL NOTES OFF');
          this.synth.allNotesOff();
          this.currentNote = -1;
          this.slideNotes.clear();
          this.eventQueue = [];
        }
        break;
      case 'setParameter':
        if (this.synth) {
          // Convert string to number
          const numericValue = parseFloat(data.value);
          
          // Named setters are the authoritative path — don't also call
          // setParameter() as the numeric API may interpret values differently
          const setterMap = {
            // Core 303 Parameters
            cutoff: 'setCutoff',
            resonance: 'setResonance',
            envMod: 'setEnvMod',
            decay: 'setDecay',
            accent: 'setAccent',
            volume: 'setVolume',
            waveform: 'setWaveform',
            tuning: 'setTuning',
            // Oscillator
            pulseWidth: 'setPulseWidth',
            subOscGain: 'setSubOscGain',
            subOscBlend: 'setSubOscBlend',
            pitchToPw: 'setPitchToPw',
            // Alternative name formats
            cutoffHz: 'setCutoffHz',
            envModPercent: 'setEnvModPercent',
            // DevilFish mods - Envelope
            slideTime: 'setSlideTime',
            normalDecay: 'setNormalDecay',
            accentDecay: 'setAccentDecay',
            softAttack: 'setSoftAttack',
            normalAttack: 'setSoftAttack', // Alias
            accentSoftAttack: 'setAccentSoftAttack',
            accentAttack: 'setAccentSoftAttack', // Alias
            ampSustain: 'setAmpSustain',
            ampDecay: 'setAmpDecay',
            ampRelease: 'setAmpRelease',
            // DevilFish mods - Filter
            filterTracking: 'setFilterTracking',
            filterInputDrive: 'setFilterInputDrive',
            passbandCompensation: 'setPassbandCompensation',
            resTracking: 'setResTracking',
            filterSelect: 'setFilterSelect',
            lpBpMix: 'setLpBpMix',
            // DevilFish mods - Korg-style filter params
            diodeCharacter: 'setDiodeCharacter',
            duffingAmount: 'setDuffingAmount',
            filterFmDepth: 'setFilterFmDepth',
            stageNLAmount: 'setStageNLAmount',
            korgWarmth: 'setKorgWarmth',
            korgStiffness: 'setKorgStiffness',
            korgFilterFm: 'setKorgFilterFm',
            korgIbiasScale: 'setKorgIbiasScale',
            korgBite: 'setKorgBite',
            korgClip: 'setKorgClip',
            korgCrossmod: 'setKorgCrossmod',
            korgQSag: 'setKorgQSag',
            korgSharpness: 'setKorgSharpness',
            // LFO Parameters
            lfoWaveform: 'setLfoWaveform',
            lfoRate: 'setLfoRate',
            lfoContour: 'setLfoContour',
            lfoPitchDepth: 'setLfoPitchDepth',
            lfoPwmDepth: 'setLfoPwmDepth',
            lfoFilterDepth: 'setLfoFilterDepth',
            lfoStiffDepth: 'setLfoStiffDepth',
            // Effects - Chorus
            chorusMode: 'setChorusMode',
            chorusMix: 'setChorusMix',
            // Effects - Phaser (both naming conventions)
            phaserRate: 'setPhaserLfoRate',
            phaserLfoRate: 'setPhaserLfoRate',  // Alias from TypeScript
            phaserWidth: 'setPhaserLfoWidth',
            phaserLfoWidth: 'setPhaserLfoWidth',  // Alias from TypeScript
            phaserFeedback: 'setPhaserFeedback',
            phaserMix: 'setPhaserMix',
            // Effects - Delay
            delayTime: 'setDelayTime',
            delayFeedback: 'setDelayFeedback',
            delayTone: 'setDelayTone',
            delayMix: 'setDelayMix',
            delaySpread: 'setDelaySpread',
            // Misc
            ensembleAmount: 'setEnsembleAmount',
            oversamplingOrder: 'setOversamplingOrder',
          };
          
          let setterName = setterMap[data.paramId];
          if (!setterName) {
            console.warn('[DB303] Unknown parameter:', data.paramId);
            break;
          }
          
          if (typeof this.synth[setterName] === 'function') {
            // CRITICAL: Convert to number - values come as strings via postMessage
            let numericValue = parseFloat(data.value);
            
            // Safety check: Clamp filterSelect to valid range (0-5)
            if (data.paramId === 'filterSelect') {
              if (numericValue > 5 || numericValue < 0) {
                console.warn('[DB303] Invalid filterSelect:', numericValue, '- clamping to 0');
                numericValue = 0;
              }
            }
            
            // Debug waveform specifically
            if (data.paramId === 'waveform') {
              console.log('[DB303] Setting waveform via', setterName, '=', numericValue);
              // ALSO try setParameter fallback since setWaveform may not work
              if (typeof this.synth.setParameter === 'function') {
                this.synth.setParameter(0, numericValue);
                console.log('[DB303] Also calling setParameter(0, ' + numericValue + ') for waveform');
              }
              // Try getting waveform back to verify
              if (typeof this.synth.getParameter === 'function') {
                const readBack = this.synth.getParameter(0);
                console.log('[DB303] Waveform readback:', readBack);
              }
            }
            
            // Track value in shadow state for diagnostics
            if (data.paramId in this.paramState) {
              this.paramState[data.paramId] = numericValue;
            }

            // Use smoothing for glitch-sensitive parameters
            if (this.smoothedParams[data.paramId]) {
              this.smoothedParams[data.paramId].target = numericValue;
              // Don't set directly - updateSmoothedParams will ramp to target
            } else {
              this.synth[setterName](numericValue);
            }
          } else {
            // Fallback: try numeric setParameter for known parameter IDs
            const paramIdMap = {
              waveform: 0,
              tuning: 1,
              cutoff: 2,
              resonance: 3,
              envMod: 4,
              decay: 5,
              accent: 6,
              volume: 7
            };
            const numericId = paramIdMap[data.paramId];
            if (numericId !== undefined && typeof this.synth.setParameter === 'function') {
              const numericValue = parseFloat(data.value);
              this.synth.setParameter(numericId, numericValue);
              console.log('[DB303] Fallback setParameter(' + numericId + ', ' + numericValue + ') for ' + data.paramId);
            } else {
              // Special case: waveform might need different method name
              if (data.paramId === 'waveform') {
                console.warn('[DB303] Waveform: setWaveform not found, trying alternatives...');
                const alts = ['setOscWaveform', 'setWaveForm', 'setOscillatorWaveform'];
                for (const alt of alts) {
                  if (typeof this.synth[alt] === 'function') {
                    this.synth[alt](parseFloat(data.value));
                    console.log('[DB303] Found waveform method:', alt);
                    break;
                  }
                }
              }
              console.warn('[DB303] Method not found:', setterName, '(and no setParameter fallback)');
            }
          }
        }
        break;
      case 'controlChange':
        if (this.synth) {
          this.synth.controlChange(data.cc, data.value);
        }
        break;
      case 'pitchBend':
        if (this.synth) {
          this.synth.pitchBend(data.value);
        }
        break;
      case 'programChange':
        if (this.synth) {
          this.synth.programChange(data.program);
        }
        break;
      case 'getDiagnostics':
        if (this.synth) {
          try {
            // Use lastPeakL captured during actual process() calls
            const peak = this.lastPeakL;
            this.lastPeakL = 0; // Reset for next measurement window

            // Use shadow state (paramState) since WASM may not have getParameter()
            const ps = this.paramState;

            // Enumerate methods including prototype (Emscripten classes use prototype)
            const methods = [];
            for (const k in this.synth) {
              if (typeof this.synth[k] === 'function') methods.push(k);
            }

            this.port.postMessage({
              type: 'diagnostics',
              cutoff: ps.cutoff,
              resonance: ps.resonance,
              envMod: ps.envMod,
              decay: ps.decay,
              accent: ps.accent,
              waveform: ps.waveform,
              volume: ps.volume,
              peakAmplitude: peak,
              currentNote: this.currentNote,
              initialized: this.initialized,
              processPath: this.processPath,
              wasmMethods: methods.join(',')
            });
          } catch (e) {
            this.port.postMessage({ type: 'diagnostics', error: e.message });
          }
        } else {
          this.port.postMessage({ type: 'diagnostics', error: 'synth not initialized', initialized: this.initialized, initializing: this.initializing });
        }
        break;
      case 'dispose':
        this.cleanup();
        break;
    }
  }

  processEvent(data) {
    if (!this.synth) return;

    switch (data.type) {
      case 'noteOn':
        if (!data.slide && this.currentNote >= 0) {
          if (DEBUG_NOTE_EVENTS) console.log('[DB303] TRIGGER: noteOff(' + this.currentNote + ') then noteOn(' + data.note + ') vel=' + data.velocity + ' at ' + currentTime.toFixed(3));
          // Use noteOff (NOT allNotesOff) to allow proper envelope release.
          // allNotesOff hard-kills all state, destroying filter character.
          // The reference site uses simple noteOn/noteOff pairs.
          // Clean up any slide-orphaned notes first, then release current.
          for (const orphan of this.slideNotes) {
            if (orphan !== this.currentNote) {
              this.synth.noteOff(orphan);
            }
          }
          this.slideNotes.clear();
          this.synth.noteOff(this.currentNote);
        } else if (data.slide && this.currentNote >= 0) {
          if (data.note === this.currentNote) {
            if (DEBUG_NOTE_EVENTS) console.log('[DB303] SAME-PITCH SLIDE: sustaining note ' + this.currentNote + ' (no WASM call) at ' + currentTime.toFixed(3));
            return;
          }
          if (DEBUG_NOTE_EVENTS) console.log('[DB303] SLIDE: noteOn(' + data.note + ') over held note ' + this.currentNote + ' vel=' + data.velocity + ' at ' + currentTime.toFixed(3));
          // Track slide-source notes so we can clean them up later
          this.slideNotes.add(this.currentNote);
        } else {
          if (DEBUG_NOTE_EVENTS) console.log('[DB303] FIRST NOTE: noteOn(' + data.note + ') vel=' + data.velocity + ' at ' + currentTime.toFixed(3));
        }
        this.synth.noteOn(data.note, data.velocity);
        this.currentNote = data.note;
        break;
      case 'noteOff':
        if (data.note > 0 && data.note === this.currentNote) {
          if (DEBUG_NOTE_EVENTS) console.log('[DB303] RELEASE: noteOff(' + data.note + ') at ' + currentTime.toFixed(3));
          this.synth.noteOff(data.note);
          this.currentNote = -1;
          this.slideNotes.clear();
        }
        break;
      case 'gateOff':
        // Release current note with proper noteOff (allows envelope release)
        // then clean up any slide-orphaned notes
        if (this.currentNote >= 0) {
          if (DEBUG_NOTE_EVENTS) console.log('[DB303] GATE OFF: noteOff(' + this.currentNote + ') at ' + currentTime.toFixed(3));
          this.synth.noteOff(this.currentNote);
          for (const orphan of this.slideNotes) {
            if (orphan !== this.currentNote) {
              this.synth.noteOff(orphan);
            }
          }
          this.slideNotes.clear();
          this.currentNote = -1;
        }
        break;
    }
  }

  async initSynth(sampleRate, wasmBinary, jsCode) {
    this.initializing = true;
    try {
      // Cleanup any existing allocation
      this.cleanup();

      // Load JS module via Function constructor (dynamic import not allowed in worklets)
      if (jsCode && !globalThis.DB303) {
        console.log('[DB303 Worklet] Loading JS module...');

        // Polyfills for DOM objects that Emscripten expects
        if (typeof globalThis.document === 'undefined') {
          globalThis.document = {
            createElement: () => ({
              relList: { supports: () => false },
              tagName: 'DIV',
              rel: '',
              addEventListener: () => {},
              removeEventListener: () => {}
            }),
            getElementById: () => null,
            querySelector: () => null,
            querySelectorAll: () => [],
            getElementsByTagName: () => [],
            head: { appendChild: () => {} },
            addEventListener: () => {},
            removeEventListener: () => {}
          };
        }

        if (typeof globalThis.window === 'undefined') {
          globalThis.window = {
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => {},
            customElements: { whenDefined: () => Promise.resolve() },
            location: { href: '', pathname: '' }
          };
        }

        // Polyfill MutationObserver
        if (typeof globalThis.MutationObserver === 'undefined') {
          globalThis.MutationObserver = class MutationObserver {
            constructor() {}
            observe() {}
            disconnect() {}
          };
        }

        // Polyfill DOMParser
        if (typeof globalThis.DOMParser === 'undefined') {
          globalThis.DOMParser = class DOMParser {
            parseFromString() {
              return { querySelector: () => null, querySelectorAll: () => [] };
            }
          };
        }

        // Polyfill URL if not available in AudioWorklet scope
        if (typeof globalThis.URL === 'undefined') {
          globalThis.URL = class URL {
            constructor(path) { this.href = path; }
          };
        }

        // The Emscripten module defines createDB303Module, aliased to DB303
        const wrappedCode = jsCode + '\nreturn DB303;';
        const factory = new Function(wrappedCode);
        const result = factory();

        if (typeof result === 'function') {
          globalThis.DB303 = result;
          console.log('[DB303 Worklet] ✓ JS module loaded');
        } else {
          console.error('[DB303 Worklet] Unexpected result type:', typeof result);
          this.port.postMessage({ type: 'error', message: 'Failed to load JS module' });
          return;
        }
      }

      if (typeof globalThis.DB303 !== 'function') {
        console.error('[DB303 Worklet] DB303 factory not available');
        this.port.postMessage({ type: 'error', message: 'DB303 factory not available' });
        return;
      }

      // Intercept WebAssembly.instantiate to capture WASM memory
      // (Emscripten may not export HEAPF32/wasmMemory on Module)
      let capturedMemory = null;
      const origInstantiate = WebAssembly.instantiate;
      WebAssembly.instantiate = async function(...args) {
        const result = await origInstantiate.apply(this, args);
        const instance = result.instance || result;
        if (instance.exports) {
          for (const value of Object.values(instance.exports)) {
            if (value instanceof WebAssembly.Memory) {
              capturedMemory = value;
              break;
            }
          }
        }
        return result;
      };

      // Initialize WASM module
      const config = {};
      if (wasmBinary) {
        config.wasmBinary = wasmBinary;
      }

      try {
        this.module = await globalThis.DB303(config);
      } finally {
        WebAssembly.instantiate = origInstantiate;
      }

      // Store captured memory for buffer access
      if (!this.module.wasmMemory && capturedMemory) {
        this.module.wasmMemory = capturedMemory;
      }
      console.log('[DB303 Worklet] WASM loaded');

      // Create synth engine instance - db303 WASM exports DB303Engine class
      if (this.module.DB303Engine) {
        this.synth = new this.module.DB303Engine(Math.floor(sampleRate));
        console.log('[DB303 Worklet] Created DB303Engine at', sampleRate, 'Hz');
        
        // Log all available methods for debugging
        const methods = [];
        for (const key in this.synth) {
          if (typeof this.synth[key] === 'function') {
            methods.push(key);
          }
        }
        // Debug: console.log('[DB303 Worklet] Available methods:', methods.join(', '));

        // Ensure filter is enabled
        if (typeof this.synth.setFilterSelect === 'function') {
          this.synth.setFilterSelect(0);
        }
        
        // DB303Engine/DB303Synth are Emscripten classes - methods are on the object directly
        // No need to wrap, just use them as-is
      } else if (this.module.DB303Synth) {
        // Fallback for older WASM builds
        this.synth = new this.module.DB303Synth();
        this.synth.initialize(sampleRate);
        console.log('[DB303 Worklet] Created DB303Synth');
      } else if (this.module._initSynth) {
        // Alternative API: direct function calls (C-style, not class-based)
        this.module._initSynth(sampleRate);
        // Create wrapper object for C-style functions
        this.synth = {
          noteOn: (note, vel) => this.module._noteOn(note, vel),
          noteOff: (note) => this.module._noteOff(note),
          allNotesOff: () => this.module._allNotesOff && this.module._allNotesOff(),
          setParameter: (id, val) => this.module._setParameter && this.module._setParameter(id, val),
          controlChange: (cc, val) => this.module._controlChange && this.module._controlChange(cc, val),
          pitchBend: (val) => this.module._pitchBend && this.module._pitchBend(val),
          programChange: (prog) => this.module._programChange && this.module._programChange(prog),
          process: (ptrL, ptrR, n) => this.module._render ? this.module._render(ptrL, ptrR, n) : this.module._process && this.module._process(ptrL, ptrR, n)
        };
      } else {
        throw new Error('No DB303 WASM interface found');
      }

      // Allocate output buffers in WASM memory (4 bytes per float)
      const malloc = this.module._malloc || this.module.malloc;
      if (malloc) {
        this.outputPtrL = malloc(this.bufferSize * 4);
        this.outputPtrR = malloc(this.bufferSize * 4);
      }

      // Create typed array views
      this.updateBufferViews();

      this.initialized = true;
      this.initializing = false;

      // Replay queued parameter messages that arrived during WASM init
      if (this.pendingMessages.length > 0) {
        console.log('[DB303 Worklet] Replaying ' + this.pendingMessages.length + ' queued parameter messages');
        // Deduplicate: keep only the last value for each paramId
        const paramMap = new Map();
        for (const msg of this.pendingMessages) {
          paramMap.set(msg.paramId, msg.value);
        }
        for (const [paramId, value] of paramMap) {
          // Use named setters (e.g., 'cutoff' -> 'setCutoff')
          if (typeof paramId === 'string') {
            const setterName = 'set' + paramId.charAt(0).toUpperCase() + paramId.slice(1);
            if (typeof this.synth[setterName] === 'function') {
              this.synth[setterName](value);
            }
          }
        }
        this.pendingMessages = [];
      }

      this.port.postMessage({ type: 'ready' });
      console.log('[DB303 Worklet] ✓ Ready');
    } catch (error) {
      this.initializing = false;
      console.error('[DB303 Worklet] Init error:', error);
      this.port.postMessage({ type: 'error', message: error.message });
    }
  }

  updateBufferViews() {
    if (!this.module || !this.outputPtrL) return;

    const heapF32 = this.module.HEAPF32 || (this.module.wasmMemory && new Float32Array(this.module.wasmMemory.buffer));
    if (!heapF32) return;

    // Check if WASM memory has grown (buffer changed)
    if (this.lastHeapBuffer !== heapF32.buffer) {
      this.outputBufferL = new Float32Array(heapF32.buffer, this.outputPtrL, this.bufferSize);
      this.outputBufferR = new Float32Array(heapF32.buffer, this.outputPtrR, this.bufferSize);
      this.lastHeapBuffer = heapF32.buffer;
    }
  }

  cleanup() {
    const free = this.module?._free || this.module?.free;
    if (free && this.outputPtrL) {
      free(this.outputPtrL);
      this.outputPtrL = 0;
    }
    if (free && this.outputPtrR) {
      free(this.outputPtrR);
      this.outputPtrR = 0;
    }
    this.outputBufferL = null;
    this.outputBufferR = null;
    this.synth = null;
    this.initialized = false;
    this.lastHeapBuffer = null;
  }

  process(inputs, outputs, parameters) {
    if (!this.initialized || !this.synth) {
      return true;
    }
    
    // Update smoothed parameters for glitch-free ramping
    this.updateSmoothedParams();

    const output = outputs[0];
    if (!output || output.length === 0) {
      return true;
    }

    const outputL = output[0];
    const outputR = output[1] || output[0];
    const blockLength = outputL.length;
    const numSamples = Math.min(blockLength, this.bufferSize);

    // Get HEAPF32 for reading output
    const heapF32 = this.module.HEAPF32 || (this.module.wasmMemory && new Float32Array(this.module.wasmMemory.buffer));
    if (!heapF32) return true;

    // Sample-accurate event processing (authentic TB-303 sequencer timing)
    const sampleTime = 1.0 / sampleRate;
    let processedSamples = 0;

    while (processedSamples < numSamples) {
      // Find the next event within this audio block
      let nextEvent = null;
      const blockEndTime = currentTime + numSamples * sampleTime;
      
      if (this.eventQueue.length > 0 && this.eventQueue[0].time <= blockEndTime) {
        nextEvent = this.eventQueue[0];
      }

      let samplesToProcess;
      if (nextEvent) {
        // Calculate samples to render before the event
        const eventSampleOffset = Math.max(0, (nextEvent.time - currentTime) / sampleTime - processedSamples);
        samplesToProcess = Math.min(numSamples - processedSamples, Math.floor(eventSampleOffset));
      } else {
        samplesToProcess = numSamples - processedSamples;
      }

      // Render audio sub-block
      if (samplesToProcess > 0) {
        if (typeof this.synth.process === 'function' && typeof this.synth.getOutputBufferPtr === 'function') {
          this.processPath = 'getOutputBufferPtr';
          this.synth.process(samplesToProcess);
          const outputPtr = this.synth.getOutputBufferPtr();
          const ptrIndex = outputPtr >> 2;

          for (let i = 0; i < samplesToProcess; i++) {
            const sL = heapF32[ptrIndex + i * 2];
            outputL[processedSamples + i] = sL;
            outputR[processedSamples + i] = heapF32[ptrIndex + i * 2 + 1];
            const absL = sL < 0 ? -sL : sL;
            if (absL > this.lastPeakL) this.lastPeakL = absL;
          }
        } else {
          this.processPath = 'outputPtr';
          this.updateBufferViews();
          if (this.outputBufferL && this.outputBufferR) {
            this.synth.process(this.outputPtrL, this.outputPtrR, samplesToProcess);
            for (let i = 0; i < samplesToProcess; i++) {
              const sL = this.outputBufferL[i];
              outputL[processedSamples + i] = sL;
              outputR[processedSamples + i] = this.outputBufferR[i];
              const absL = sL < 0 ? -sL : sL;
              if (absL > this.lastPeakL) this.lastPeakL = absL;
            }
          }
        }
        processedSamples += samplesToProcess;
      }

      // Process the event if we've reached it
      if (nextEvent && this.eventQueue.length > 0) {
        const event = this.eventQueue.shift();
        this.processEvent(event);
      } else if (!nextEvent) {
        break; // No more events, done with this block
      }
    }

    // Post-synth drive stage (bypassed at amount 0)
    this.drive.process(outputL, outputR, numSamples);

    return true;
  }
}

registerProcessor('db303-processor', DB303Processor);
