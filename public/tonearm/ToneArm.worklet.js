// public/tonearm/ToneArm.worklet.js
// ToneArm vinyl record physics simulation — AudioWorklet processor.
// 1:1 port of the Python ToneArm library (github.com/kieranmanning/ToneArm).
//
// Signal chain (exact order from simulate.py):
//   1. groove_pitch scale  — stylus.groove_pitch = 1e-3 (Stylus.py)
//   2. simulate_wow        — variable-delay time-warp (simulate.py)
//   3. simulate_flutter    — amplitude modulation (simulate.py)
//   4. noise_hiss          — Gaussian-windowed sine bursts (simulate.py)
//   5. noise_pops          — weighted bump() transients (simulate.py)
//   6. Coil.induced_voltage — Faraday induction (Coil.py)
//   7. Gaussian noise       — N(0, 1e-4) on voltages (simulate.py line 172)
//   8. riaa_filter          — 2nd-order IIR playback EQ (Processing.py)
//   9. normalize_audio      — running peak follower (Processing.py)
//  10. filter_stylus_radius — biquad LP at 5000 Hz (Processing.py)

'use strict';

// ─── Physical constants from Stylus.py ───────────────────────────────────────
const GROOVE_PITCH  = 1e-3;   // stylus.groove_pitch (m)
const STYLUS_RADIUS = 25e-6;  // stylus.radius (m)
// filter_stylus_radius(signal, stylus, velocity=0.5):
//   cutoff_freq = velocity / (4 * stylus.radius) = 0.5 / (4 * 25e-6) = 5000 Hz
const STYLUS_LPF_VEL    = 0.5;  // default velocity (m/s) in filter_stylus_radius
const STYLUS_LPF_CUTOFF = STYLUS_LPF_VEL / (4 * STYLUS_RADIUS);  // 5000 Hz

// ─── Physical constants from Coil.py ─────────────────────────────────────────
const COIL_RADIUS    = 1e-2;   // coil_radius (m)
const NUM_TURNS      = 1000;   // number_of_turns
const REMANENCE      = 1.0;    // remanence (T)
const MAGNET_VOLUME  = 1e-6;   // magnet_volume (m³ = 0.01^3)
const RESTING_DIST   = 1e-4;   // resting_distance (m)
const DISTANCE_FUDGE = 0.01;   // distance_fudge
const FLUX_FUDGE     = 1e-4;   // flux_fudge
const MU0            = 4 * Math.PI * 1e-7;  // permeability of free space

// Precomputed flux constant (from calculate_flux):
//   B = (mu0 / 4π) * (2 * Br * V) / (resting + d)^3
//   flux = B * π * r²
//   FLUX_CONSTANT = (mu0/4π) * 2*Br*V * π*r²
//                = 1e-7 * 2*1.0*1e-6 * π*(1e-2)²
//                = 2π × 1e-17 ≈ 6.2832e-17
const FLUX_CONSTANT = (MU0 / (4 * Math.PI)) * (2 * REMANENCE * MAGNET_VOLUME)
                    * (Math.PI * COIL_RADIUS * COIL_RADIUS);

// ─── Box-Muller Gaussian random number generator ──────────────────────────────
// Used for: hiss amplitude N(1e-4, 1e-4), pop amplitude N(0.001, 0.001),
//           voltage noise N(0, 1e-4)
function gaussRandom(mean, std) {
  const u1 = Math.max(1e-15, Math.random());
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + std * z;
}

// ─── bump(freq, length) — exact port from Processing.py ──────────────────────
// Gaussian-windowed sine: exp(-(10^(-ln(0.01*l))) * (x - l/2)^2) * sin(2π*freq/sr*x)
// Note: Math.log in JS is natural log (ln), same as np.log in Python. ✓
function bump(freq, length) {
  const out    = new Float32Array(length);
  const coeff  = Math.pow(10, -Math.log(0.01 * length));
  const halfL  = length / 2;
  const phInc  = 2 * Math.PI * freq / sampleRate;
  for (let x = 0; x < length; x++) {
    const dx = x - halfL;
    out[x] = Math.exp(-coeff * dx * dx) * Math.sin(phInc * x);
  }
  return out;
}

// ─── RIAA playback filter coefficients (from Processing.py) ──────────────────
// zeros = [-0.2014898, 0.9233820], poles = [0.7083149, 0.9924091]
// Normalized to 0 dB at 1 kHz.
// Returns { b: [b0,b1,b2], a: [1, a1, a2] } for Direct Form I IIR.
function computeRIAACoeffs() {
  // Polynomial coefficients (pre-normalization)
  let b0 = 1.0;
  let b1 = -(-0.2014898 + 0.9233820);        // = -0.7218922
  let b2 =   (-0.2014898 * 0.9233820);       // ≈ -0.1860519

  const a0 = 1.0;
  const a1 = -(0.7083149 + 0.9924091);       // = -1.700724
  const a2 =   0.7083149 * 0.9924091;        // ≈  0.7029367

  // Normalize to 0 dB at 1 kHz
  const y     = 2 * Math.PI * 1000 / sampleRate;
  const cosY  = Math.cos(-y);
  const cos2Y = Math.cos(-2 * y);
  const sinY  = Math.sin(-y);
  const sin2Y = Math.sin(-2 * y);

  const b_re  = b0 + b1 * cosY  + b2 * cos2Y;
  const b_im  =      b1 * sinY  + b2 * sin2Y;
  const a_re  = a0 + a1 * cosY  + a2 * cos2Y;
  const a_im  =      a1 * sinY  + a2 * sin2Y;
  const g     = Math.sqrt((a_re * a_re + a_im * a_im) / (b_re * b_re + b_im * b_im));

  b0 *= g;  b1 *= g;  b2 *= g;

  return { b: [b0, b1, b2], a: [1.0, a1, a2] };
}

// ─── 2nd-order Butterworth LP biquad ─────────────────────────────────────────
// Approximation of Python's 5th-order Butterworth at STYLUS_LPF_CUTOFF.
// Returns { b: [b0,b1,b2], a: [1, a1, a2] }
function computeButterworthLP(fc, fs) {
  const k    = Math.tan(Math.PI * fc / fs);   // bilinear transform prewarped k
  const k2   = k * k;
  const Q    = Math.SQRT1_2;                  // 1/√2 for Butterworth (maximally flat)
  const norm = k2 + k / Q + 1;

  const b0 = k2 / norm;
  const b1 = 2 * b0;
  const b2 = b0;
  const a1 = 2 * (k2 - 1) / norm;
  const a2 = (k2 - k / Q + 1) / norm;

  return { b: [b0, b1, b2], a: [1.0, a1, a2] };
}

// ─── ToneArmProcessor ─────────────────────────────────────────────────────────
class ToneArmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // ── Parameters (0-1 normalized, or raw for rpm) ──────────────────────────
    this._wow     = 0.0;
    this._coil    = 0.5;
    this._flutter = 0.0;
    this._riaa    = 0.5;
    this._stylus  = 0.0;
    this._hiss    = 0.0;
    this._pops    = 0.0;
    this._wet     = 1.0;
    this._rpm     = 33.333;

    // ── Wow: variable delay line ─────────────────────────────────────────────
    // Max wow depth = wow_max * 0.0025 s = 0.0025 * 44100 ≈ 110 samples.
    // Read offset spans [0, 2*max] → 512-sample buffer is sufficient.
    const WOW_BUF_SIZE = 512;
    this._wowBufL     = new Float32Array(WOW_BUF_SIZE);
    this._wowBufR     = new Float32Array(WOW_BUF_SIZE);
    this._wowBufSize  = WOW_BUF_SIZE;
    this._wowWritePos = 0;
    this._wowPhase    = 0.0;

    // ── Flutter: AM LFO phase ────────────────────────────────────────────────
    this._flutterPhase = 0.0;

    // ── Coil: previous sample per channel (for Faraday Δflux) ───────────────
    this._prevSampleL = 0.0;
    this._prevSampleR = 0.0;

    // ── RIAA filter state per channel [L, R] ─────────────────────────────────
    // Direct Form I: x[n-1], x[n-2], y[n-1], y[n-2]
    const riaa = computeRIAACoeffs();
    this._riaaB  = riaa.b;
    this._riaaA  = riaa.a;
    this._riaaX1 = [0.0, 0.0];
    this._riaaX2 = [0.0, 0.0];
    this._riaaY1 = [0.0, 0.0];
    this._riaaY2 = [0.0, 0.0];

    // ── Stylus LPF state per channel [L, R] ──────────────────────────────────
    // 2nd-order Butterworth at STYLUS_LPF_CUTOFF (5000 Hz)
    const lpf = computeButterworthLP(STYLUS_LPF_CUTOFF, sampleRate);
    this._lpfB  = lpf.b;
    this._lpfA  = lpf.a;
    this._lpfX1 = [0.0, 0.0];
    this._lpfX2 = [0.0, 0.0];
    this._lpfY1 = [0.0, 0.0];
    this._lpfY2 = [0.0, 0.0];

    // ── Peak follower for running normalize_audio ────────────────────────────
    // Python normalize_audio() normalizes to peak 1.0 after RIAA.
    // Real-time approximation: slow-release peak envelope.
    // Release TC = 5 s → decays to 37% in 5 s (keeps gain stable during quiet passages)
    this._peakL       = 0.0;
    this._peakR       = 0.0;
    this._peakRelease = Math.exp(-1 / (5.0 * sampleRate));

    // ── Active hiss bumps: [{data: Float32Array, pos: number, amp: number}] ──
    // noise_hiss: bump(randint(5000,12000), 100), amp = clip(N(1e-4,1e-4), 0, 2e-4)
    this._hissBumps = [];

    // ── Active pop bumps: [{data: Float32Array, pos: number, amp: number}] ───
    // noise_pops: bump(weighted_freq, weighted_len), amp = clip(N(0.001,0.001), 0, 0.002)
    this._popBumps = [];

    // ── Message handler ──────────────────────────────────────────────────────
    this.port.onmessage = (e) => {
      const { param, value } = e.data;
      switch (param) {
        case 'wow':     this._wow     = value; break;
        case 'coil':    this._coil    = value; break;
        case 'flutter': this._flutter = value; break;
        case 'riaa':    this._riaa    = value; break;
        case 'stylus':  this._stylus  = value; break;
        case 'hiss':    this._hiss    = value; break;
        case 'pops':    this._pops    = value; break;
        case 'wet':     this._wet     = value; break;
        case 'rpm':     this._rpm     = value; break;
      }
    };
  }

  // ─── process ────────────────────────────────────────────────────────────────
  process(inputs, outputs) {
    const input  = inputs[0]  || [];
    const output = outputs[0] || [];

    const inL  = input[0]  || new Float32Array(128);
    const inR  = input[1]  || inL;   // mono → both channels
    const outL = output[0];
    const outR = output[1] || output[0];

    if (!outL) return true;

    // ── Read params once per block ───────────────────────────────────────────
    const wow     = this._wow;
    const coil    = this._coil;
    const flutter = this._flutter;
    const riaa    = this._riaa;
    const stylus  = this._stylus;
    const hiss    = this._hiss;
    const pops    = this._pops;
    const wet     = this._wet;
    const rpm     = this._rpm;

    // ── Derived constants (from Stylus.calculate_wow_flutter_frequencies) ───
    // wow_freq  = record_speed_hz * 2   (2 rotation-relative cycles)
    // flutter_freq = record_speed_hz * 20 (20 rotation-relative cycles)
    const rotHz       = rpm / 60.0;
    const wowFreq     = rotHz * 2.0;
    const flutterFreq = rotHz * 20.0;

    // ── Parameter → Python range mapping ────────────────────────────────────
    // wow_depth (seconds): Python default 0.0005 ≈ UI default 0.2 * 0.0025
    const wowDepthSecs    = wow * 0.0025;
    const wowDepthSamples = wowDepthSecs * sampleRate;  // max ≈ 110 samples

    // flutter_depth: Python default 0.0001 ≈ UI default 0.15 * 0.000667
    // simulate_flutter: audio * (1 + depth * sin(2π*freq*t))
    const flutterDepth = flutter * 0.000667;

    // hiss probability per sample: at hiss=0.2 → prob=0.001 ≈ Python density 1000
    // noise_hiss: number = length/density = per-sample prob of 1/density
    const hissProb = hiss * 0.005;

    // pop probability per sample: at pops=0.15 → prob≈0.0002 ≈ Python density 5000
    const popProb = pops / 750.0;

    // ── Phase increments ─────────────────────────────────────────────────────
    const dt              = 1.0 / sampleRate;
    const wowPhaseInc     = 2 * Math.PI * wowFreq     * dt;
    const flutterPhaseInc = 2 * Math.PI * flutterFreq * dt;

    // ── Coil: precomputed gain constant ──────────────────────────────────────
    // voltage = -N_TURNS * dFlux * FLUX_FUDGE / dt = -N_TURNS * dFlux * FLUX_FUDGE * sampleRate
    const coilGain = NUM_TURNS * FLUX_FUDGE * sampleRate;  // = 1000 * 1e-4 * sr

    // ── Local state (unpacked for inner-loop speed) ──────────────────────────
    let wowPhase     = this._wowPhase;
    let flutterPhase = this._flutterPhase;
    let wowWritePos  = this._wowWritePos;
    let prevSampleL  = this._prevSampleL;
    let prevSampleR  = this._prevSampleR;
    let peakL        = this._peakL;
    let peakR        = this._peakR;

    const peakRelease = this._peakRelease;

    const wowBufL    = this._wowBufL;
    const wowBufR    = this._wowBufR;
    const wowBufSize = this._wowBufSize;

    const riaaB = this._riaaB;
    const riaaA = this._riaaA;
    let riaaX1L = this._riaaX1[0], riaaX1R = this._riaaX1[1];
    let riaaX2L = this._riaaX2[0], riaaX2R = this._riaaX2[1];
    let riaaY1L = this._riaaY1[0], riaaY1R = this._riaaY1[1];
    let riaaY2L = this._riaaY2[0], riaaY2R = this._riaaY2[1];

    const lpfB = this._lpfB;
    const lpfA = this._lpfA;
    let lpfX1L = this._lpfX1[0], lpfX1R = this._lpfX1[1];
    let lpfX2L = this._lpfX2[0], lpfX2R = this._lpfX2[1];
    let lpfY1L = this._lpfY1[0], lpfY1R = this._lpfY1[1];
    let lpfY2L = this._lpfY2[0], lpfY2R = this._lpfY2[1];

    const hissBumps = this._hissBumps;
    const popBumps  = this._popBumps;

    const len = outL.length;

    // ─────────────────────────────────────────────────────────────────────────
    for (let i = 0; i < len; i++) {

      // ── Dry samples (saved for wet/dry mix at the end) ────────────────────
      const dryL = inL[i];
      const dryR = inR[i];

      let xL = dryL;
      let xR = dryR;

      // ── Step 1: groove_pitch scale ────────────────────────────────────────
      // Python: data = stylus.groove_pitch * data  (= 1e-3 * data)
      xL *= GROOVE_PITCH;
      xR *= GROOVE_PITCH;

      // ── Step 2: simulate_wow — time-warp via variable delay line ─────────
      // Python simulate_wow: new_t = t + depth*sin(2π*freq*t); interpolate to t.
      // Real-time approximation: baseline delay = wowDepthSamples, modulated ±depth.
      //   delay(t) = wowDepthSamples - wowLFO(t)
      //   When lfo = +depth: delay = 0 (fastest, looks ahead → no net delay)
      //   When lfo = -depth: delay = 2*depth (slowest, max delay)
      wowBufL[wowWritePos] = xL;
      wowBufR[wowWritePos] = xR;

      const wowLFO      = wowDepthSamples * Math.sin(wowPhase);
      const readDelay   = Math.max(0, wowDepthSamples - wowLFO);
      const readPosF    = (wowWritePos - readDelay + wowBufSize) % wowBufSize;
      const readPos0    = Math.floor(readPosF);
      const readPos1    = (readPos0 + 1) % wowBufSize;
      const frac        = readPosF - readPos0;

      const wowXL = wowBufL[readPos0] + frac * (wowBufL[readPos1] - wowBufL[readPos0]);
      const wowXR = wowBufR[readPos0] + frac * (wowBufR[readPos1] - wowBufR[readPos0]);

      // Blend: wow=0 → pass-through (wowDepthSamples=0 → wowXL=xL anyway)
      xL = xL * (1 - wow) + wowXL * wow;
      xR = xR * (1 - wow) + wowXR * wow;

      wowWritePos = (wowWritePos + 1) % wowBufSize;
      wowPhase   += wowPhaseInc;
      if (wowPhase >= 2 * Math.PI) wowPhase -= 2 * Math.PI;

      // ── Step 3: simulate_flutter — amplitude modulation ───────────────────
      // Python: return audio * (1 + depth * sin(2π * freq * t))
      const flutterLFO = flutterDepth * Math.sin(flutterPhase);
      xL *= 1 + flutterLFO;
      xR *= 1 + flutterLFO;

      flutterPhase += flutterPhaseInc;
      if (flutterPhase >= 2 * Math.PI) flutterPhase -= 2 * Math.PI;

      // ── Step 4: noise_hiss — stochastic Gaussian-windowed sine bursts ─────
      // Python: for s in randint(0,length, size=length/density):
      //           l=100; a=clip(N(1e-4,1e-4),0,2e-4); f=randint(5000,12000)
      //           data[s:s+l] += a * bump(freq=f, length=l)
      // Real-time: per-sample Bernoulli trial with prob = 1/density
      if (hiss > 0 && Math.random() < hissProb) {
        const hFreq = 5000 + Math.random() * 7000;          // randint(5000, 12000)
        const hAmp  = Math.max(0, Math.min(2e-4, gaussRandom(1e-4, 1e-4)));
        hissBumps.push({ data: bump(hFreq, 100), pos: 0, amp: hAmp });
      }

      // Add all active hiss bumps to the signal (same value to both channels)
      for (let b = hissBumps.length - 1; b >= 0; b--) {
        const hb  = hissBumps[b];
        const s   = hb.amp * hb.data[hb.pos++];
        xL += s;
        xR += s;
        if (hb.pos >= hb.data.length) hissBumps.splice(b, 1);
      }

      // ── Step 5: noise_pops — stochastic low-freq bump transients ──────────
      // Python: lengths=[100,200,500,1000] p=[0.45,0.3,0.2,0.05]
      //         freqs=[10,50,100,500,1000,2000,5000]  p=[1,1,4,4,2,1,0.5]/13.5
      //         a = clip(N(0.001,0.001), 0, 0.002)
      if (pops > 0 && Math.random() < popProb) {
        // Length weighted choice
        const lRand = Math.random();
        const pLen  = lRand < 0.45 ? 100
                    : lRand < 0.75 ? 200
                    : lRand < 0.95 ? 500
                    : 1000;

        // Frequency weighted choice (sum of weights = 1+1+4+4+2+1+0.5 = 13.5)
        const fRand = Math.random() * 13.5;
        const pFreq = fRand <  1 ?   10
                    : fRand <  2 ?   50
                    : fRand <  6 ?  100
                    : fRand < 10 ?  500
                    : fRand < 12 ? 1000
                    : fRand < 13 ? 2000
                    : 5000;

        const pAmp = Math.max(0, Math.min(0.002, gaussRandom(0.001, 0.001)));
        popBumps.push({ data: bump(pFreq, pLen), pos: 0, amp: pAmp });
      }

      // Add all active pop bumps
      for (let b = popBumps.length - 1; b >= 0; b--) {
        const pb = popBumps[b];
        const s  = pb.amp * pb.data[pb.pos++];
        xL += s;
        xR += s;
        if (pb.pos >= pb.data.length) popBumps.splice(b, 1);
      }

      // ── Step 6: Coil.induced_voltage — Faraday induction (Coil.py) ────────
      // flux(d) = FLUX_CONSTANT / (RESTING_DIST + d)^3
      // dFlux   = flux(df) - flux(di);  di = DISTANCE_FUDGE * prev;  df = DISTANCE_FUDGE * curr
      // voltage = -NUM_TURNS * dFlux * FLUX_FUDGE / dt
      //         = -NUM_TURNS * dFlux * FLUX_FUDGE * sampleRate  (= -coilGain * dFlux)
      const diL       = DISTANCE_FUDGE * prevSampleL;
      const dfL       = DISTANCE_FUDGE * xL;
      const rdL       = RESTING_DIST + dfL;
      const riL       = RESTING_DIST + diL;
      const dFluxL    = FLUX_CONSTANT * (1 / (rdL * rdL * rdL) - 1 / (riL * riL * riL));
      const voltageL  = -coilGain * dFluxL;

      const diR       = DISTANCE_FUDGE * prevSampleR;
      const dfR       = DISTANCE_FUDGE * xR;
      const rdR       = RESTING_DIST + dfR;
      const riR       = RESTING_DIST + diR;
      const dFluxR    = FLUX_CONSTANT * (1 / (rdR * rdR * rdR) - 1 / (riR * riR * riR));
      const voltageR  = -coilGain * dFluxR;

      prevSampleL = xL;
      prevSampleR = xR;

      // Blend: coil=0 → groove-pitch signal, coil=1 → full Faraday voltage
      xL = xL * (1 - coil) + voltageL * coil;
      xR = xR * (1 - coil) + voltageR * coil;

      // ── Step 7: Gaussian noise on voltages ────────────────────────────────
      // Python: voltages += np.random.normal(0, 1e-4, size=len(voltages))
      // Added to the coil-blended signal (scaled by coil amount for naturalness)
      const noiseScale = coil;
      xL += gaussRandom(0, 1e-4) * noiseScale;
      xR += gaussRandom(0, 1e-4) * noiseScale;

      // ── Step 8: riaa_filter — 2nd-order IIR, Direct Form I ───────────────
      // Python: signal.lfilter(b, a, data) with playback RIAA coefficients.
      // y[n] = b0*x[n] + b1*x[n-1] + b2*x[n-2] - a1*y[n-1] - a2*y[n-2]
      const riaaOutL = riaaB[0] * xL + riaaB[1] * riaaX1L + riaaB[2] * riaaX2L
                     - riaaA[1] * riaaY1L - riaaA[2] * riaaY2L;
      riaaX2L = riaaX1L;  riaaX1L = xL;
      riaaY2L = riaaY1L;  riaaY1L = riaaOutL;

      const riaaOutR = riaaB[0] * xR + riaaB[1] * riaaX1R + riaaB[2] * riaaX2R
                     - riaaA[1] * riaaY1R - riaaA[2] * riaaY2R;
      riaaX2R = riaaX1R;  riaaX1R = xR;
      riaaY2R = riaaY1R;  riaaY1R = riaaOutR;

      // Blend: riaa=0 → pre-RIAA signal, riaa=1 → fully RIAA-equalized
      xL = xL * (1 - riaa) + riaaOutL * riaa;
      xR = xR * (1 - riaa) + riaaOutR * riaa;

      // ── Step 9: normalize_audio — running peak follower ───────────────────
      // Python: peak * audio / max(abs(audio)) normalizes the full buffer.
      // Real-time: slow-release peak envelope (5 s TC) to maintain stable gain.
      const absL = Math.abs(xL);
      const absR = Math.abs(xR);
      peakL = Math.max(absL, peakL * peakRelease);
      peakR = Math.max(absR, peakR * peakRelease);
      if (peakL > 1e-10) xL /= peakL;
      if (peakR > 1e-10) xR /= peakR;

      // ── Step 10: filter_stylus_radius — biquad LP at 5000 Hz ─────────────
      // Python: Butterworth LPF order=5 at velocity/(4*radius) = 5000 Hz.
      // Here: 2nd-order Butterworth (approximation).
      const lpfOutL = lpfB[0] * xL + lpfB[1] * lpfX1L + lpfB[2] * lpfX2L
                    - lpfA[1] * lpfY1L - lpfA[2] * lpfY2L;
      lpfX2L = lpfX1L;  lpfX1L = xL;
      lpfY2L = lpfY1L;  lpfY1L = lpfOutL;

      const lpfOutR = lpfB[0] * xR + lpfB[1] * lpfX1R + lpfB[2] * lpfX2R
                    - lpfA[1] * lpfY1R - lpfA[2] * lpfY2R;
      lpfX2R = lpfX1R;  lpfX1R = xR;
      lpfY2R = lpfY1R;  lpfY1R = lpfOutR;

      // Blend: stylus=0 → no LPF rolloff, stylus=1 → full 5 kHz rolloff
      xL = xL * (1 - stylus) + lpfOutL * stylus;
      xR = xR * (1 - stylus) + lpfOutR * stylus;

      // ── Wet / dry mix ─────────────────────────────────────────────────────
      outL[i] = dryL * (1 - wet) + xL * wet;
      outR[i] = dryR * (1 - wet) + xR * wet;
    }

    // ── Write state back ─────────────────────────────────────────────────────
    this._wowPhase     = wowPhase;
    this._flutterPhase = flutterPhase;
    this._wowWritePos  = wowWritePos;
    this._prevSampleL  = prevSampleL;
    this._prevSampleR  = prevSampleR;
    this._peakL        = peakL;
    this._peakR        = peakR;

    this._riaaX1[0] = riaaX1L;  this._riaaX1[1] = riaaX1R;
    this._riaaX2[0] = riaaX2L;  this._riaaX2[1] = riaaX2R;
    this._riaaY1[0] = riaaY1L;  this._riaaY1[1] = riaaY1R;
    this._riaaY2[0] = riaaY2L;  this._riaaY2[1] = riaaY2R;

    this._lpfX1[0] = lpfX1L;  this._lpfX1[1] = lpfX1R;
    this._lpfX2[0] = lpfX2L;  this._lpfX2[1] = lpfX2R;
    this._lpfY1[0] = lpfY1L;  this._lpfY1[1] = lpfY1R;
    this._lpfY2[0] = lpfY2L;  this._lpfY2[1] = lpfY2R;

    return true;
  }
}

registerProcessor('tonearm-processor', ToneArmProcessor);
