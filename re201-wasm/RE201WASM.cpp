/**
 * RE201WASM.cpp — Roland RE-201 Space Echo model for WebAssembly
 *
 * Transpiled from je3928/RE201models (GPL-3.0).
 * Five DSP stages:
 *   1. VA Tone Stack (5F6-A discretised, bass/treble)
 *   2. Tape Magnetisation (cheap tanh + asymmetric saturation approximation)
 *   3. Tape Delay (3 playheads at 1x/2x/3x, wow/flutter, speed-dependent EQ)
 *   4. Waveguide Spring Reverb (8 parallel spring units, each with 4 waveguide delays)
 *   5. Wet-only output (dry/wet handled in TypeScript)
 *
 * Compiled to WebAssembly via Emscripten for AudioWorklet use.
 */

#include <cstdlib>
#include <cstring>
#include <cmath>
#include <algorithm>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

static constexpr float PI_F  = 3.14159265358979323846f;
static constexpr float TWOPI = 2.0f * PI_F;

// ============================================================
// Utility
// ============================================================
static inline float clampf(float x, float lo, float hi) {
  return x < lo ? lo : (x > hi ? hi : x);
}

// Flush denormals and Inf/NaN to zero
static inline float sanitize(float x) {
  // Catch NaN, Inf, and denormals
  union { float f; uint32_t i; } u;
  u.f = x;
  uint32_t exp = u.i & 0x7F800000u;
  if (exp == 0u || exp == 0x7F800000u) return 0.0f;
  return x;
}

// Clamp audio sample to safe range and sanitize
static inline float safeSample(float x) {
  if (!(x >= -10.0f && x <= 10.0f)) return 0.0f;  // catches NaN too
  return x;
}

// ============================================================
// White noise (xorshift32)
// ============================================================
struct NoiseGen {
  uint32_t state;
  NoiseGen(uint32_t seed = 123456789u) : state(seed) {}
  float next() {
    state ^= state << 13;
    state ^= state >> 17;
    state ^= state << 5;
    return (float)(int32_t)state / 2147483648.0f;
  }
};

// ============================================================
// 1-pole filter
// ============================================================
struct OnePole {
  float z1 = 0.0f;
  float a0 = 1.0f, b1 = 0.0f;

  void setLowpass(float freq, float sr) {
    float w = TWOPI * freq / sr;
    float c = cosf(w);
    b1 = 2.0f - c - sqrtf((2.0f - c) * (2.0f - c) - 1.0f);
    a0 = 1.0f - b1;
  }
  float process(float x) {
    z1 = x * a0 + z1 * b1;
    z1 = sanitize(z1);
    return z1;
  }
  void reset() { z1 = 0.0f; }
};

// ============================================================
// Biquad filter (LP / HP / shelf / allpass)
// ============================================================
struct Biquad {
  float x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  float b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0;

  void setLowpass(float freq, float Q, float sr) {
    float w0 = TWOPI * freq / sr;
    float alpha = sinf(w0) / (2.0f * Q);
    float cosw0 = cosf(w0);
    float norm = 1.0f / (1.0f + alpha);
    b0 = ((1.0f - cosw0) / 2.0f) * norm;
    b1 = (1.0f - cosw0) * norm;
    b2 = b0;
    a1 = -2.0f * cosw0 * norm;
    a2 = (1.0f - alpha) * norm;
  }

  void setHighpass(float freq, float Q, float sr) {
    float w0 = TWOPI * freq / sr;
    float alpha = sinf(w0) / (2.0f * Q);
    float cosw0 = cosf(w0);
    float norm = 1.0f / (1.0f + alpha);
    b0 = ((1.0f + cosw0) / 2.0f) * norm;
    b1 = -(1.0f + cosw0) * norm;
    b2 = b0;
    a1 = -2.0f * cosw0 * norm;
    a2 = (1.0f - alpha) * norm;
  }

  void setAllpass(float freq, float Q, float sr) {
    float w0 = TWOPI * freq / sr;
    float alpha = sinf(w0) / (2.0f * Q);
    float cosw0 = cosf(w0);
    float norm = 1.0f / (1.0f + alpha);
    b0 = (1.0f - alpha) * norm;
    b1 = -2.0f * cosw0 * norm;
    b2 = 1.0f;  // = (1+alpha)*norm
    a1 = b1;
    a2 = b0;
  }

  void setHighShelf(float freq, float Q, float gainDB, float sr) {
    float A = powf(10.0f, gainDB / 40.0f);
    float w0 = TWOPI * freq / sr;
    float alpha = sinf(w0) / (2.0f * Q);
    float cosw0 = cosf(w0);
    float sqrtA = sqrtf(A);
    float norm = 1.0f / ((A + 1.0f) - (A - 1.0f) * cosw0 + 2.0f * sqrtA * alpha);
    b0 = A * ((A + 1.0f) + (A - 1.0f) * cosw0 + 2.0f * sqrtA * alpha) * norm;
    b1 = -2.0f * A * ((A - 1.0f) + (A + 1.0f) * cosw0) * norm;
    b2 = A * ((A + 1.0f) + (A - 1.0f) * cosw0 - 2.0f * sqrtA * alpha) * norm;
    a1 = 2.0f * ((A - 1.0f) - (A + 1.0f) * cosw0) * norm;
    a2 = ((A + 1.0f) - (A - 1.0f) * cosw0 - 2.0f * sqrtA * alpha) * norm;
  }

  void setLowShelf(float freq, float Q, float gainDB, float sr) {
    float A = powf(10.0f, gainDB / 40.0f);
    float w0 = TWOPI * freq / sr;
    float alpha = sinf(w0) / (2.0f * Q);
    float cosw0 = cosf(w0);
    float sqrtA = sqrtf(A);
    float norm = 1.0f / ((A + 1.0f) + (A - 1.0f) * cosw0 + 2.0f * sqrtA * alpha);
    b0 = A * ((A + 1.0f) - (A - 1.0f) * cosw0 + 2.0f * sqrtA * alpha) * norm;
    b1 = 2.0f * A * ((A - 1.0f) - (A + 1.0f) * cosw0) * norm;
    b2 = A * ((A + 1.0f) - (A - 1.0f) * cosw0 - 2.0f * sqrtA * alpha) * norm;
    a1 = -2.0f * ((A - 1.0f) + (A + 1.0f) * cosw0) * norm;
    a2 = ((A + 1.0f) + (A - 1.0f) * cosw0 - 2.0f * sqrtA * alpha) * norm;
  }

  float process(float x) {
    float y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x;
    y2 = y1; y1 = sanitize(y);
    return y;
  }
  void reset() { x1 = x2 = y1 = y2 = 0.0f; }
};

// ============================================================
// Delay line with cubic interpolation
// ============================================================
class DelayLine {
  float* buf;
  int    sz;
  int    wr;
public:
  DelayLine() : buf(nullptr), sz(0), wr(0) {}
  ~DelayLine() { delete[] buf; }

  void init(int maxSamples) {
    delete[] buf;
    sz = maxSamples + 4;
    buf = new float[sz];
    memset(buf, 0, sz * sizeof(float));
    wr = 0;
  }

  void write(float s) {
    buf[wr] = s;
    if (++wr >= sz) wr = 0;
  }

  float readLinear(float delay) const {
    float rp = (float)wr - delay;
    while (rp < 0.0f) rp += (float)sz;
    int i0 = (int)rp;
    int i1 = i0 + 1;
    if (i0 >= sz) i0 -= sz;
    if (i1 >= sz) i1 -= sz;
    float f = rp - (float)(int)rp;
    return buf[i0] * (1.0f - f) + buf[i1] * f;
  }

  float readCubic(float delay) const {
    float rp = (float)wr - delay;
    while (rp < 0.0f) rp += (float)sz;
    int i1 = (int)rp;
    float f  = rp - (float)i1;
    int i0 = i1 - 1; if (i0 < 0) i0 += sz;
    int i2 = i1 + 1; if (i2 >= sz) i2 -= sz;
    int i3 = i1 + 2; if (i3 >= sz) i3 -= sz;
    if (i1 >= sz) i1 -= sz;
    float y0 = buf[i0], y1 = buf[i1], y2 = buf[i2], y3 = buf[i3];
    float a0 = y3 - y2 - y0 + y1;
    float a1 = y0 - y1 - a0;
    float a2 = y2 - y0;
    return ((a0 * f + a1) * f + a2) * f + y1;
  }

  void clear() {
    if (buf) memset(buf, 0, sz * sizeof(float));
    wr = 0;
  }
};

// ============================================================
// VA Tone Stack — 5F6-A discretised (Yeh 2006)
// 3rd-order IIR from bilinear transform of analog prototype
// Component values: C1=470pF C2=22nF C3=22nF R1=250k R2=100k R3=1k R4=100k
// ============================================================
struct ToneStack {
  float bass = 0.5f;
  float treble = 0.5f;
  // State variables for 3rd-order IIR
  float x1 = 0, x2 = 0, x3 = 0;
  float y1 = 0, y2 = 0, y3 = 0;
  // Coefficients (recomputed on param change)
  float b0c = 0, b1c = 0, b2c = 0, b3c = 0;
  float a1c = 0, a2c = 0, a3c = 0;

  void computeCoeffs(float sr) {
    // Component values
    const float C1 = 470e-12f, C2 = 22e-9f, C3 = 22e-9f;
    const float R1 = 250e3f * bass, R2 = 100e3f, R3 = 1e3f, R4 = 100e3f * treble;

    // Ensure minimum pot values
    float R1e = R1 < 1.0f ? 1.0f : R1;
    float R4e = R4 < 1.0f ? 1.0f : R4;

    // Analog prototype transfer function coefficients (s-domain)
    float b1a = R1e * C1;
    float b2a = C1 * C2 * R1e * R2 + C1 * C3 * R1e * R4e;
    float b3a = C1 * C2 * C3 * R1e * R2 * R4e;
    float a0a = 1.0f;
    float a1a = (R1e + R2) * C2 + R4e * C3 + R3 * (C1 + C2 + C3) + R1e * C1;
    float a2a = R1e * R2 * C1 * C2 + R4e * C3 * (R1e * C1 + R2 * C2 + R3 * (C1 + C2))
              + R3 * C2 * R1e * C1;
    float a3a = R1e * R2 * C1 * C2 * R4e * C3 + R3 * C2 * R1e * C1 * R4e * C3;

    // Bilinear transform: s = 2*sr * (1 - z^-1) / (1 + z^-1)
    float T  = 1.0f / sr;
    float T2 = T * T;
    float T3 = T2 * T;
    float c  = 2.0f * sr;
    float c2 = c * c;
    float c3 = c2 * c;

    // Denominator
    float D0 = a0a * c3 + a1a * c2 + a2a * c + a3a;
    if (fabsf(D0) < 1e-30f) D0 = 1e-30f;
    float iD = 1.0f / D0;

    // Numerator: b(z) = b0 + b1*z^-1 + b2*z^-2 + b3*z^-3
    // Using bilinear substitution on each s^n term:
    //   s^0 → 1
    //   s^1 → c*(1-z^-1)/(1+z^-1) etc.
    // After common denominator (1+z^-1)^3:
    float nb0 = b3a + b2a * c + b1a * c2;
    float nb1 = 3.0f * b3a + b2a * c - b1a * c2;
    float nb2 = 3.0f * b3a - b2a * c - b1a * c2;
    float nb3 = b3a - b2a * c + b1a * c2;

    float na0 = a3a + a2a * c + a1a * c2 + a0a * c3;
    float na1 = 3.0f * a3a + a2a * c - a1a * c2 - 3.0f * a0a * c3;
    float na2 = 3.0f * a3a - a2a * c - a1a * c2 + 3.0f * a0a * c3;
    float na3 = a3a - a2a * c + a1a * c2 - a0a * c3;

    float iA0 = 1.0f / (na0 < 1e-30f ? 1e-30f : na0);

    b0c = nb0 * iA0;
    b1c = nb1 * iA0;
    b2c = nb2 * iA0;
    b3c = nb3 * iA0;
    a1c = na1 * iA0;
    a2c = na2 * iA0;
    a3c = na3 * iA0;

    // Normalise gain so passband ≈ unity at 1kHz
    float w = TWOPI * 1000.0f / sr;
    float cw = cosf(w), sw = sinf(w);
    // Evaluate H(e^jw) magnitude-squared
    float re_num = b0c + b1c * cw + b2c * cosf(2.0f * w) + b3c * cosf(3.0f * w);
    float im_num = -(b1c * sw + b2c * sinf(2.0f * w) + b3c * sinf(3.0f * w));
    float re_den = 1.0f + a1c * cw + a2c * cosf(2.0f * w) + a3c * cosf(3.0f * w);
    float im_den = -(a1c * sw + a2c * sinf(2.0f * w) + a3c * sinf(3.0f * w));
    float mag_num = sqrtf(re_num * re_num + im_num * im_num);
    float mag_den = sqrtf(re_den * re_den + im_den * im_den);
    float mag = mag_den > 1e-10f ? mag_num / mag_den : 1.0f;
    if (mag > 1e-10f) {
      float inv = 1.0f / mag;
      b0c *= inv; b1c *= inv; b2c *= inv; b3c *= inv;
    }
  }

  float process(float x) {
    float y = b0c * x + b1c * x1 + b2c * x2 + b3c * x3
            - a1c * y1 - a2c * y2 - a3c * y3;
    x3 = x2; x2 = x1; x1 = x;
    y3 = y2; y2 = y1; y1 = sanitize(y);
    return safeSample(y);
  }

  void reset() {
    x1 = x2 = x3 = y1 = y2 = y3 = 0.0f;
  }
};

// ============================================================
// Tape Magnetisation — cheap approximation
// Pre-emphasis + asymmetric tanh saturation + de-emphasis
// Replaces full RK4 Jiles-Atherton (too expensive for WASM RT)
// ============================================================
struct TapeMag {
  OnePole preEmph;
  OnePole deEmph;
  float drive = 0.5f;
  float prevIn = 0.0f;

  void init(float sr) {
    preEmph.setLowpass(4000.0f, sr);
    deEmph.setLowpass(4000.0f, sr);
  }

  float process(float x) {
    // Pre-emphasis: boost highs via differentiation
    float diff = x - prevIn;
    prevIn = x;
    float pre = x + diff * 1.5f * drive;

    // Asymmetric soft saturation (tape character)
    float sat;
    if (pre >= 0.0f) {
      sat = tanhf(pre * (1.0f + drive * 2.0f));
    } else {
      sat = tanhf(pre * (1.0f + drive * 1.5f)) * 0.95f;
    }

    // De-emphasis filter
    return deEmph.process(sat);
  }

  void reset() {
    preEmph.reset();
    deEmph.reset();
    prevIn = 0.0f;
  }
};

// ============================================================
// Tape Delay — 3 playheads with wow/flutter and speed-dependent EQ
// Playhead 1: base delay, Playhead 2: 2× base, Playhead 3: 3× base
// ============================================================
struct TapeDelay {
  DelayLine line;
  OnePole   wowLPF;
  OnePole   paramSmooth;
  NoiseGen  noise;
  Biquad    hpf;    // 40 Hz HPF
  Biquad    lpf;    // variable LPF
  float     smoothedDelay = 0.0f;
  float     feedbackSample = 0.0f;
  float     sampleRate = 48000.0f;

  // Sine oscillators for wow/flutter
  float wowPhase = 0.0f;
  float flutPhase1 = 0.0f;
  float flutPhase2 = 0.0f;

  void init(float sr) {
    sampleRate = sr;
    int maxSamples = (int)(0.75f * sr) + 4;
    line.init(maxSamples);
    wowLPF.setLowpass(0.15f, sr);
    paramSmooth.setLowpass(2.0f, sr);
    hpf.setHighpass(40.0f, 0.707f, sr);
    lpf.setLowpass(10000.0f, 0.707f, sr);
    noise = NoiseGen(42u);
  }

  void updateLPF(float repeatRate) {
    // Slower tape = more highs; faster = duller
    float freq = 5000.0f + (1.0f - repeatRate) * 10000.0f;
    freq = clampf(freq, 2000.0f, 15000.0f);
    lpf.setLowpass(freq, 0.707f, sampleRate);
  }

  float calcBaseDelay(float repeatRate) const {
    // Map repeatRate 0→700ms, 1→50ms (inverted: higher = faster tape)
    float ms = 700.0f - repeatRate * 650.0f;
    return ms * sampleRate / 1000.0f;
  }

  void processBlock(
    const float* in, float* outL, float* outR, int n,
    float repeatRate, float intensity, float echoVol, float reverbVol,
    float wow, float flutter,
    bool h1, bool h2, bool h3,
    float* reverbSend, int reverbSendN
  ) {
    float fbGain = intensity * 0.85f;
    float baseDelay = calcBaseDelay(repeatRate);
    updateLPF(repeatRate);

    float wowDepth = wow * 3.0f;      // samples of wow modulation
    float flutDepth = flutter * 1.5f;

    for (int i = 0; i < n; i++) {
      // Smooth delay
      smoothedDelay = paramSmooth.process(baseDelay);

      // Wow (slow ~1Hz sine) + Flutter (faster 4Hz + 12Hz sines) + noise
      wowPhase += 1.0f / sampleRate;
      if (wowPhase > 1.0f) wowPhase -= 1.0f;
      float wowMod = sinf(TWOPI * wowPhase) * wowDepth;

      flutPhase1 += 4.0f / sampleRate;
      if (flutPhase1 > 1.0f) flutPhase1 -= 1.0f;
      flutPhase2 += 12.0f / sampleRate;
      if (flutPhase2 > 1.0f) flutPhase2 -= 1.0f;
      float flutMod = (sinf(TWOPI * flutPhase1) * 0.7f
                     + sinf(TWOPI * flutPhase2) * 0.3f) * flutDepth;

      float noiseMod = wowLPF.process(noise.next()) * flutter * 0.3f;

      float delay = smoothedDelay + wowMod + flutMod + noiseMod;
      delay = clampf(delay, 1.0f, sampleRate * 0.74f);

      // Write input + feedback
      float toWrite = in[i] + feedbackSample * fbGain;
      toWrite = tanhf(toWrite);  // tape saturation
      line.write(toWrite);

      // Read playheads
      float out = 0.0f;
      if (h1) out += line.readLinear(delay);
      if (h2) out += line.readLinear(clampf(delay * 2.0f, 1.0f, sampleRate * 0.74f));
      if (h3) out += line.readLinear(clampf(delay * 3.0f, 1.0f, sampleRate * 0.74f));

      // Speed-dependent EQ
      out = hpf.process(out);
      out = lpf.process(out);
      out = safeSample(out);

      feedbackSample = out;

      float echoOut = out * echoVol;
      outL[i] = echoOut;
      outR[i] = echoOut;

      // Feed reverb send
      if (i < reverbSendN) {
        reverbSend[i] = out * reverbVol;
      }
    }
  }

  void reset() {
    line.clear();
    wowLPF.reset();
    paramSmooth.reset();
    hpf.reset();
    lpf.reset();
    feedbackSample = 0.0f;
    smoothedDelay = 0.0f;
    wowPhase = flutPhase1 = flutPhase2 = 0.0f;
  }
};

// ============================================================
// Waveguide Spring Reverb
// 8 parallel spring units, each with 4 bidirectional waveguide
// delays and allpass dispersion filters.
// ============================================================
struct AllPassDelay {
  float* buf;
  int    sz;
  int    wr;
  float  g;

  AllPassDelay() : buf(nullptr), sz(0), wr(0), g(0.5f) {}
  ~AllPassDelay() { delete[] buf; }

  void init(int delaySamples, float gain) {
    delete[] buf;
    sz = delaySamples + 1;
    if (sz < 2) sz = 2;
    buf = new float[sz];
    memset(buf, 0, sz * sizeof(float));
    wr = 0;
    g  = gain;
  }

  float process(float x) {
    int rd = wr - (sz - 1);
    if (rd < 0) rd += sz;
    float delayed = buf[rd];
    float y = -g * x + delayed;
    buf[wr] = sanitize(x + g * delayed);
    if (++wr >= sz) wr = 0;
    return y;
  }

  void clear() {
    if (buf) memset(buf, 0, sz * sizeof(float));
    wr = 0;
  }
};

struct WaveguideUnit {
  DelayLine  delay;
  AllPassDelay ap[5];  // 5 allpass dispersors
  Biquad     lpf;
  Biquad     hpf;

  void init(int delaySamples, float sr, uint32_t seed) {
    delay.init(delaySamples);

    // Allpass dispersors at different delay lengths for metallic spring character
    NoiseGen rng(seed);
    for (int i = 0; i < 5; i++) {
      int apDelay = 3 + (int)(fabsf(rng.next()) * 30.0f);
      float apGain = 0.2f + fabsf(rng.next()) * 0.25f;  // 0.2-0.45 (capped for stability)
      ap[i].init(apDelay, apGain);
    }

    lpf.setLowpass(6000.0f, 0.707f, sr);
    hpf.setHighpass(120.0f, 0.707f, sr);
  }

  float process(float x, float delay_samp) {
    float d = delay.readLinear(delay_samp);
    // Allpass chain for dispersion
    float y = d;
    for (int i = 0; i < 5; i++) {
      y = ap[i].process(y);
    }
    y = lpf.process(y);
    y = hpf.process(y);
    y = safeSample(y);
    delay.write(x + y * 0.15f);  // reduced feedback for stability (was 0.3f)
    return y;
  }

  void clear() {
    delay.clear();
    for (int i = 0; i < 5; i++) ap[i].clear();
    lpf.reset();
    hpf.reset();
  }
};

struct SpringReverb {
  static constexpr int NUM_SPRINGS = 8;
  static constexpr int GUIDES_PER_SPRING = 4;

  WaveguideUnit guides[NUM_SPRINGS * GUIDES_PER_SPRING];
  float delayTimes[NUM_SPRINGS * GUIDES_PER_SPRING];
  float sampleRate = 48000.0f;

  void init(float sr) {
    sampleRate = sr;
    // Deterministic but varied delay times (30-50ms range)
    NoiseGen rng(777u);  // fixed seed for reproducibility
    NoiseGen rngR(888u); // different seed for R channel decorrelation

    for (int s = 0; s < NUM_SPRINGS; s++) {
      for (int g = 0; g < GUIDES_PER_SPRING; g++) {
        int idx = s * GUIDES_PER_SPRING + g;
        float ms = 30.0f + fabsf(rng.next()) * 20.0f;
        int delaySamp = (int)(ms * sr / 1000.0f);
        if (delaySamp < 4) delaySamp = 4;
        delayTimes[idx] = (float)delaySamp * 0.9f;

        uint32_t seed = 1000u + (uint32_t)(s * 100 + g * 10);
        guides[idx].init(delaySamp + 4, sr, seed);
      }
    }
  }

  void process(float inL, float inR, float& outL, float& outR) {
    float sumL = 0.0f, sumR = 0.0f;

    for (int s = 0; s < NUM_SPRINGS; s++) {
      // First half → L, second half → R (stereo decorrelation)
      float input = (s < NUM_SPRINGS / 2) ? inL : inR;
      float springOut = 0.0f;

      for (int g = 0; g < GUIDES_PER_SPRING; g++) {
        int idx = s * GUIDES_PER_SPRING + g;
        springOut += guides[idx].process(input, delayTimes[idx]);
      }
      springOut *= (1.0f / GUIDES_PER_SPRING);

      if (s < NUM_SPRINGS / 2)
        sumL += springOut;
      else
        sumR += springOut;
    }

    outL = sumL * (2.0f / NUM_SPRINGS);
    outR = sumR * (2.0f / NUM_SPRINGS);
  }

  void clear() {
    for (int i = 0; i < NUM_SPRINGS * GUIDES_PER_SPRING; i++) {
      guides[i].clear();
    }
  }
};

// ============================================================
// RE-201 Instance — full signal chain
// ============================================================
struct RE201Instance {
  float sampleRate;

  // Parameters (all 0-1)
  float bass       = 0.5f;
  float treble     = 0.5f;
  int   delayMode  = 7;     // 0-10 (selects heads + reverb)
  float repeatRate = 0.5f;
  float intensity  = 0.5f;
  float echoVolume = 0.8f;
  float reverbVolume = 0.3f;
  float inputLevel = 1.0f;

  // Derived head/reverb enable from delayMode
  bool h1 = true, h2 = false, h3 = false;
  bool reverbEnabled = true;
  bool delayEnabled  = true;

  // DSP
  ToneStack toneStack;
  TapeMag   tapeMag;
  TapeDelay tapeDelay;
  SpringReverb spring;

  // Temp buffers
  float* tmpMono     = nullptr;
  float* tmpRevSend  = nullptr;
  float* tmpEchoL    = nullptr;
  float* tmpEchoR    = nullptr;
  int    tmpSize     = 0;

  RE201Instance() : sampleRate(48000.0f) {}
  ~RE201Instance() {
    delete[] tmpMono;
    delete[] tmpRevSend;
    delete[] tmpEchoL;
    delete[] tmpEchoR;
  }

  void init(int sr) {
    sampleRate = (float)sr;
    toneStack.computeCoeffs(sampleRate);
    tapeMag.init(sampleRate);
    tapeDelay.init(sampleRate);
    spring.init(sampleRate);
    updateMode();
    ensureTmpBuf(128);
  }

  void ensureTmpBuf(int n) {
    if (n <= tmpSize) return;
    delete[] tmpMono;
    delete[] tmpRevSend;
    delete[] tmpEchoL;
    delete[] tmpEchoR;
    tmpMono    = new float[n];
    tmpRevSend = new float[n];
    tmpEchoL   = new float[n];
    tmpEchoR   = new float[n];
    tmpSize    = n;
  }

  void updateMode() {
    // Mode table (matching RE-201 selector):
    //  0: Reverb only
    //  1: Head 1 only
    //  2: Head 2 only
    //  3: Head 3 only
    //  4: Head 1+2
    //  5: Head 1+3
    //  6: Head 2+3
    //  7: Head 1 + Reverb
    //  8: Head 1+2 + Reverb
    //  9: Head 1+2+3
    // 10: Head 1+2+3 + Reverb
    h1 = h2 = h3 = false;
    reverbEnabled = false;
    delayEnabled  = false;

    switch (delayMode) {
      case 0:  reverbEnabled = true; break;
      case 1:  h1 = true; delayEnabled = true; break;
      case 2:  h2 = true; delayEnabled = true; break;
      case 3:  h3 = true; delayEnabled = true; break;
      case 4:  h1 = h2 = true; delayEnabled = true; break;
      case 5:  h1 = h3 = true; delayEnabled = true; break;
      case 6:  h2 = h3 = true; delayEnabled = true; break;
      case 7:  h1 = true; reverbEnabled = true; delayEnabled = true; break;
      case 8:  h1 = h2 = true; reverbEnabled = true; delayEnabled = true; break;
      case 9:  h1 = h2 = h3 = true; delayEnabled = true; break;
      case 10: h1 = h2 = h3 = true; reverbEnabled = true; delayEnabled = true; break;
      default: h1 = true; reverbEnabled = true; delayEnabled = true; break;
    }
  }

  void processBlock(float* inL, float* inR, float* outL, float* outR, int n) {
    ensureTmpBuf(n);

    // 1. Mono sum + input level
    for (int i = 0; i < n; i++) {
      tmpMono[i] = (inL[i] + inR[i]) * 0.5f * inputLevel;
    }

    // 2. Tone Stack
    for (int i = 0; i < n; i++) {
      tmpMono[i] = toneStack.process(tmpMono[i]);
    }

    // 3. Tape Magnetisation
    for (int i = 0; i < n; i++) {
      tmpMono[i] = tapeMag.process(tmpMono[i]);
    }

    // 4. Tape Delay (outputs echo + reverb send)
    memset(tmpEchoL, 0, n * sizeof(float));
    memset(tmpEchoR, 0, n * sizeof(float));
    memset(tmpRevSend, 0, n * sizeof(float));

    if (delayEnabled) {
      tapeDelay.processBlock(
        tmpMono, tmpEchoL, tmpEchoR, n,
        repeatRate, intensity, echoVolume, reverbVolume,
        0.3f, 0.2f,  // moderate wow/flutter by default
        h1, h2, h3,
        tmpRevSend, n
      );
    } else {
      // No delay — feed reverb from dry signal
      for (int i = 0; i < n; i++) {
        tmpRevSend[i] = tmpMono[i] * reverbVolume;
      }
    }

    // 5. Spring Reverb
    if (reverbEnabled) {
      for (int i = 0; i < n; i++) {
        float rvL, rvR;
        spring.process(tmpRevSend[i], tmpRevSend[i], rvL, rvR);
        outL[i] = tmpEchoL[i] + rvL;
        outR[i] = tmpEchoR[i] + rvR;
      }
    } else {
      for (int i = 0; i < n; i++) {
        outL[i] = tmpEchoL[i];
        outR[i] = tmpEchoR[i];
      }
    }
  }
};

// ============================================================
// Instance management (free-list)
// ============================================================
static constexpr int MAX_INSTANCES = 8;
static RE201Instance* g_instances[MAX_INSTANCES] = {};

static int findFreeSlot() {
  for (int i = 1; i < MAX_INSTANCES; i++) {
    if (!g_instances[i]) return i;
  }
  return 0;
}

static RE201Instance* getInstance(int handle) {
  if (handle < 1 || handle >= MAX_INSTANCES) return nullptr;
  return g_instances[handle];
}

// ============================================================
// WASM Exports
// ============================================================
extern "C" {

EMSCRIPTEN_KEEPALIVE
int re201_create(int sampleRate) {
  int slot = findFreeSlot();
  if (slot == 0) return 0;
  auto* inst = new RE201Instance();
  inst->init(sampleRate);
  g_instances[slot] = inst;
  return slot;
}

EMSCRIPTEN_KEEPALIVE
void re201_destroy(int handle) {
  auto* inst = getInstance(handle);
  if (inst) {
    delete inst;
    g_instances[handle] = nullptr;
  }
}

EMSCRIPTEN_KEEPALIVE
void re201_process(int handle, float* inL, float* inR,
                   float* outL, float* outR, int numSamples) {
  auto* inst = getInstance(handle);
  if (!inst) return;
  inst->processBlock(inL, inR, outL, outR, numSamples);
}

EMSCRIPTEN_KEEPALIVE
void re201_set_bass(int handle, float val) {
  auto* inst = getInstance(handle);
  if (!inst) return;
  inst->bass = clampf(val, 0.0f, 1.0f);
  inst->toneStack.bass = inst->bass;
  inst->toneStack.computeCoeffs(inst->sampleRate);
}

EMSCRIPTEN_KEEPALIVE
void re201_set_treble(int handle, float val) {
  auto* inst = getInstance(handle);
  if (!inst) return;
  inst->treble = clampf(val, 0.0f, 1.0f);
  inst->toneStack.treble = inst->treble;
  inst->toneStack.computeCoeffs(inst->sampleRate);
}

EMSCRIPTEN_KEEPALIVE
void re201_set_delay_mode(int handle, int mode) {
  auto* inst = getInstance(handle);
  if (!inst) return;
  inst->delayMode = std::max(0, std::min(mode, 10));
  inst->updateMode();
}

EMSCRIPTEN_KEEPALIVE
void re201_set_repeat_rate(int handle, float val) {
  auto* inst = getInstance(handle);
  if (!inst) return;
  inst->repeatRate = clampf(val, 0.0f, 1.0f);
}

EMSCRIPTEN_KEEPALIVE
void re201_set_intensity(int handle, float val) {
  auto* inst = getInstance(handle);
  if (!inst) return;
  inst->intensity = clampf(val, 0.0f, 1.0f);
}

EMSCRIPTEN_KEEPALIVE
void re201_set_echo_volume(int handle, float val) {
  auto* inst = getInstance(handle);
  if (!inst) return;
  inst->echoVolume = clampf(val, 0.0f, 1.0f);
}

EMSCRIPTEN_KEEPALIVE
void re201_set_reverb_volume(int handle, float val) {
  auto* inst = getInstance(handle);
  if (!inst) return;
  inst->reverbVolume = clampf(val, 0.0f, 1.0f);
}

EMSCRIPTEN_KEEPALIVE
void re201_set_input_level(int handle, float val) {
  auto* inst = getInstance(handle);
  if (!inst) return;
  inst->inputLevel = clampf(val, 0.0f, 5.0f);
}

} // extern "C"
