/**
 * RETapeEchoWASM.cpp - Self-contained Roland RE-150/201 tape echo for WASM
 *
 * DSP algorithm adapted from RE-Tape-Echo Pure Data patch by Instruments of Things.
 * Features:
 *   - Two playback heads at fixed 3:1 ratio
 *   - 6 echo modes (head selection + feedback combinations)
 *   - Wow / Flutter / Dirt tape speed modulation
 *   - tanh tape saturation
 *   - Speed-dependent playhead EQ (based on real RE-150 measurements)
 *   - Tape loop ghost echo simulation (incomplete erasure)
 *   - Input bleed simulation
 *   - Mono echo engine, stereo I/O via routing modes
 *
 * Compiled to WebAssembly via Emscripten for use in AudioWorklet.
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

static constexpr float PI = 3.14159265358979323846f;
static constexpr float TWO_PI = 2.0f * PI;

// ============================================================
// White noise generator (xorshift32)
// ============================================================
struct NoiseGen {
  uint32_t state;

  NoiseGen() : state(123456789) {}

  float next() {
    state ^= state << 13;
    state ^= state >> 17;
    state ^= state << 5;
    // Convert to float in [-1, 1]
    return (float)(int32_t)state / 2147483648.0f;
  }
};

// ============================================================
// 1-pole filter (lowpass / highpass)
// ============================================================
struct OnePole {
  float z1;
  float a0, b1;

  OnePole() : z1(0.0f), a0(1.0f), b1(0.0f) {}

  void setLowpass(float freqHz, float sr) {
    float w = TWO_PI * freqHz / sr;
    float cosw = cosf(w);
    b1 = 2.0f - cosw - sqrtf((2.0f - cosw) * (2.0f - cosw) - 1.0f);
    a0 = 1.0f - b1;
  }

  float processLP(float x) {
    z1 = x * a0 + z1 * b1;
    return z1;
  }

  void reset() { z1 = 0.0f; }
};

// ============================================================
// 2-pole bandpass filter (resonant)
// ============================================================
struct BandPass {
  float x1, x2, y1, y2;
  float a0, a1, a2, b1, b2;

  BandPass() : x1(0), x2(0), y1(0), y2(0), a0(1), a1(0), a2(0), b1(0), b2(0) {}

  void setParams(float freqHz, float Q, float sr) {
    float w0 = TWO_PI * freqHz / sr;
    float alpha = sinf(w0) / (2.0f * Q);
    float norm = 1.0f / (1.0f + alpha);
    a0 = alpha * norm;
    a1 = 0.0f;
    a2 = -alpha * norm;
    b1 = -2.0f * cosf(w0) * norm;
    b2 = (1.0f - alpha) * norm;
  }

  float process(float x) {
    float y = a0 * x + a1 * x1 + a2 * x2 - b1 * y1 - b2 * y2;
    x2 = x1; x1 = x;
    y2 = y1; y1 = y;
    return y;
  }

  void reset() { x1 = x2 = y1 = y2 = 0.0f; }
};

// ============================================================
// Biquad filter (for playhead EQ)
// ============================================================
struct Biquad {
  float x1, x2, y1, y2;
  float b0, b1, b2, a1, a2; // normalized (a0 = 1)

  Biquad() : x1(0), x2(0), y1(0), y2(0), b0(1), b1(0), b2(0), a1(0), a2(0) {}

  void setHighpass(float freq, float Q, float sr) {
    float w0 = TWO_PI * freq / sr;
    float alpha = sinf(w0) / (2.0f * Q);
    float cosw0 = cosf(w0);
    float norm = 1.0f / (1.0f + alpha);
    b0 = ((1.0f + cosw0) / 2.0f) * norm;
    b1 = -(1.0f + cosw0) * norm;
    b2 = b0;
    a1 = -2.0f * cosw0 * norm;
    a2 = (1.0f - alpha) * norm;
  }

  void setLowpass(float freq, float Q, float sr) {
    float w0 = TWO_PI * freq / sr;
    float alpha = sinf(w0) / (2.0f * Q);
    float cosw0 = cosf(w0);
    float norm = 1.0f / (1.0f + alpha);
    b0 = ((1.0f - cosw0) / 2.0f) * norm;
    b1 = (1.0f - cosw0) * norm;
    b2 = b0;
    a1 = -2.0f * cosw0 * norm;
    a2 = (1.0f - alpha) * norm;
  }

  void setHighShelf(float freq, float Q, float gainDB, float sr) {
    float A = powf(10.0f, gainDB / 40.0f);
    float w0 = TWO_PI * freq / sr;
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

  void setPeaking(float freq, float Q, float gainDB, float sr) {
    float A = powf(10.0f, gainDB / 40.0f);
    float w0 = TWO_PI * freq / sr;
    float alpha = sinf(w0) / (2.0f * Q);
    float cosw0 = cosf(w0);
    float norm = 1.0f / (1.0f + alpha / A);
    b0 = (1.0f + alpha * A) * norm;
    b1 = -2.0f * cosw0 * norm;
    b2 = (1.0f - alpha * A) * norm;
    a1 = b1;
    a2 = (1.0f - alpha / A) * norm;
  }

  float process(float x) {
    float y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x;
    y2 = y1; y1 = y;
    return y;
  }

  void reset() { x1 = x2 = y1 = y2 = 0.0f; }
};

// ============================================================
// Variable-length delay line with linear interpolation
// ============================================================
class DelayLine {
  float* buffer;
  int size;
  int writeIdx;

public:
  DelayLine() : buffer(nullptr), size(0), writeIdx(0) {}
  ~DelayLine() { delete[] buffer; }

  void init(int maxSamples) {
    delete[] buffer;
    size = maxSamples + 1;
    buffer = new float[size];
    memset(buffer, 0, size * sizeof(float));
    writeIdx = 0;
  }

  void write(float sample) {
    buffer[writeIdx] = sample;
    writeIdx++;
    if (writeIdx >= size) writeIdx = 0;
  }

  // Read with fractional-sample linear interpolation
  float readInterp(float delaySamples) const {
    float readPos = (float)writeIdx - delaySamples;
    while (readPos < 0.0f) readPos += (float)size;

    int idx0 = (int)readPos;
    int idx1 = idx0 + 1;
    if (idx0 >= size) idx0 -= size;
    if (idx1 >= size) idx1 -= size;

    float frac = readPos - (float)(int)readPos;
    return buffer[idx0] * (1.0f - frac) + buffer[idx1] * frac;
  }

  void clear() {
    if (buffer) memset(buffer, 0, size * sizeof(float));
    writeIdx = 0;
  }
};

// ============================================================
// Playhead EQ - Speed-dependent 4-band parametric
// Based on measured Roland RE-150 frequency response
// ============================================================
struct PlayheadEQ {
  Biquad hp;      // HPF at 130 Hz
  Biquad peak;    // Peak at 4472 Hz
  Biquad hs;      // High-shelf at 3701 Hz
  Biquad lp;      // LPF, frequency varies with speed
  float overallGain;  // +2.3 dB

  void init(float sr) {
    hp.setHighpass(130.0f, 0.707946f, sr);
    peak.setPeaking(4472.96f, 1.49249f, 6.09f, sr);  // Default gain for mid speed
    hs.setHighShelf(3701.87f, 1.99526f, -20.0f, sr); // Default gain for mid speed
    lp.setLowpass(16000.0f, 0.7079f, sr);             // Default freq for mid speed
    overallGain = powf(10.0f, 2.3f / 20.0f);          // +2.3 dB
  }

  // Update speed-dependent parameters (speed: 0-1 repeat rate)
  void updateSpeed(float speed, float sr) {
    // High-shelf gain: from -30 dB (slow) to -8.26 dB (fast)
    float hsGain = speed * 21.7391f - 30.0f;
    hs.setHighShelf(3701.87f, 1.99526f, hsGain, sr);

    // Peak gain: from +6.09 dB (slow) to +2.18 dB (fast)
    float pkGain = speed * (-3.90435f) + 6.08696f;
    peak.setPeaking(4472.96f, 1.49249f, pkGain, sr);

    // LP frequency: from 20000 Hz (slow) to 12258 Hz (fast)
    float lpFreq = speed * (-7742.0f) + 20000.0f;
    lpFreq = std::max(500.0f, std::min(lpFreq, 20000.0f));
    lp.setLowpass(lpFreq, 0.7079f, sr);
  }

  float process(float x) {
    float y = hp.process(x);
    y = peak.process(y);
    y = hs.process(y);
    y = lp.process(y);
    return y * overallGain;
  }

  void reset() {
    hp.reset(); peak.reset(); hs.reset(); lp.reset();
  }
};

// ============================================================
// RE-Tape-Echo instance
// ============================================================
struct RETapeEchoInstance {
  int sampleRate;

  // Parameters
  int   echoMode;       // 0-5
  float repeatRate;     // 0-1 (tape speed)
  float intensity;      // 0-1 (feedback amount)
  float echoVolume;     // 0-1 (wet level)
  float wow;            // 0-1
  float flutter;        // 0-1
  float dirt;           // 0-1
  int   inputBleed;     // 0 or 1
  float loopAmount;     // 0-1 (tape loop ghost)
  int   playheadFilter; // 0 or 1

  // Head routing (derived from mode)
  bool h1Active, h2Active, fbActive;

  // DSP components
  DelayLine echoDelay;     // Main echo heads (~500ms max)
  DelayLine tapeLoopDelay; // Tape loop ghost (~23s max)

  NoiseGen noise;
  OnePole wowLPF1, wowLPF2;    // Double lowpass for wow
  BandPass flutterBP;           // Bandpass for flutter
  BandPass dirtBP;              // Bandpass for dirt

  OnePole paramSmooth;           // Parameter smoothing for delay time
  float smoothedDelay;           // Current smoothed delay value

  PlayheadEQ eq;                 // Speed-dependent EQ

  // Feedback state
  float feedbackSample;

  RETapeEchoInstance()
    : sampleRate(48000)
    , echoMode(3)
    , repeatRate(0.5f)
    , intensity(0.5f)
    , echoVolume(0.8f)
    , wow(0.0f)
    , flutter(0.0f)
    , dirt(0.0f)
    , inputBleed(0)
    , loopAmount(0.0f)
    , playheadFilter(1)
    , h1Active(true), h2Active(false), fbActive(true)
    , smoothedDelay(0.0f)
    , feedbackSample(0.0f)
  {}

  void init(int sr) {
    sampleRate = sr;

    // Main echo delay: 500ms max (head2 can be 3x head1, head1 max ~155ms, so 3*155 = 465ms)
    int echoMaxSamples = (int)(0.5f * sr) + 1;
    echoDelay.init(echoMaxSamples);

    // Tape loop: ~23 seconds max
    int tapeMaxSamples = (int)(23.0f * sr) + 1;
    tapeLoopDelay.init(tapeMaxSamples);

    // Wow filters: double lowpass at 0.1 Hz
    wowLPF1.setLowpass(0.1f, (float)sr);
    wowLPF2.setLowpass(0.1f, (float)sr);

    // Flutter/dirt bandpass at 50 Hz, Q = 0.707
    flutterBP.setParams(50.0f, 0.707f, (float)sr);
    dirtBP.setParams(50.0f, 0.707f, (float)sr);

    // Parameter smoothing (very slow, 0.1 Hz)
    paramSmooth.setLowpass(0.1f, (float)sr);

    eq.init((float)sr);

    updateMode();
    smoothedDelay = calcBaseDelaySamples();
  }

  void updateMode() {
    switch (echoMode) {
      case 0: h1Active = true;  h2Active = false; fbActive = false; break; // Head 1 only
      case 1: h1Active = false; h2Active = true;  fbActive = false; break; // Head 2 only
      case 2: h1Active = true;  h2Active = true;  fbActive = false; break; // Both heads
      case 3: h1Active = true;  h2Active = false; fbActive = true;  break; // Head 1 + feedback
      case 4: h1Active = false; h2Active = true;  fbActive = true;  break; // Head 2 + feedback
      case 5: h1Active = true;  h2Active = true;  fbActive = true;  break; // Both + feedback
      default: h1Active = true; h2Active = false; fbActive = true;  break;
    }
  }

  float calcBaseDelaySamples() const {
    // From Pd: offset = 1 - (repeatrate * 2.3), delay_ms = (offset + 1) * 47
    // But we work in samples: delay_samples = delay_ms * sr / 1000
    float offset = 1.0f - (repeatRate * 2.3f);
    float delay_ms = (offset + 1.0f) * 47.0f;
    return delay_ms * (float)sampleRate / 1000.0f;
  }

  // Convert intensity (0-1) to feedback gain using dB mapping
  float calcFeedbackGain() const {
    // Pd: dB = intensity * 30 + 70, then dbtorms
    // dbtorms(x) = pow(10, (x - 100) / 20)
    float dB = intensity * 30.0f + 70.0f;
    return powf(10.0f, (dB - 100.0f) / 20.0f);
  }

  void processBlock(float* inL, float* inR, float* outL, float* outR, int numSamples) {
    float fbGain = calcFeedbackGain();

    // Pre-compute wow/flutter/dirt scaling
    float wowScale = wow * 1.5f;
    wowScale = wowScale * wowScale;    // Squared for exponential response
    float flutterScale = flutter * 0.3f;
    flutterScale = flutterScale * flutterScale;
    float dirtScale = dirt * 0.3f;
    dirtScale = dirtScale * dirtScale;

    float baseDelaySamples = calcBaseDelaySamples();

    // Update playhead EQ if active
    if (playheadFilter) {
      eq.updateSpeed(repeatRate, (float)sampleRate);
    }

    for (int i = 0; i < numSamples; i++) {
      // Mono sum of stereo input
      float xn = (inL[i] + inR[i]) * 0.5f;

      // === Speed modulation ===
      float n = noise.next();

      float wowMod = wowLPF2.processLP(wowLPF1.processLP(n)) * wowScale;
      float flutterMod = flutterBP.process(n) * flutterScale;
      float dirtMod = dirtBP.process(n) * dirtScale;
      float speedMod = 1.0f + wowMod + flutterMod + dirtMod;

      // === Smooth delay time (very slow interpolation) ===
      smoothedDelay = paramSmooth.processLP(baseDelaySamples);

      float modulatedDelay = smoothedDelay * speedMod;
      // Clamp to valid range
      modulatedDelay = std::max(1.0f, std::min(modulatedDelay, (float)sampleRate * 0.5f));

      // === Sum feedback + input ===
      float toRecord = xn;
      if (fbActive) {
        toRecord += feedbackSample * fbGain;
      }

      // === Tape saturation ===
      toRecord = tanhf(toRecord);

      // === Write to delay line ===
      echoDelay.write(toRecord);

      // === Also write to tape loop delay ===
      tapeLoopDelay.write(toRecord);

      // === Read from heads ===
      float head1Out = echoDelay.readInterp(modulatedDelay);
      float head2Delay = modulatedDelay * 3.0f;
      head2Delay = std::min(head2Delay, (float)sampleRate * 0.5f);
      float head2Out = echoDelay.readInterp(head2Delay);

      // === Mix active heads ===
      float echoOut = 0.0f;
      if (h1Active) echoOut += head1Out;
      if (h2Active) echoOut += head2Out;

      // === Tape loop ghost ===
      float tapeGhost = 0.0f;
      if (loopAmount > 0.001f) {
        // Tape loop read position scales with delay time
        float tapeDelaySamples = smoothedDelay * (6919.3f / 47.0f);
        tapeDelaySamples = std::max(1.0f, std::min(tapeDelaySamples, (float)(sampleRate * 22)));
        tapeGhost = tapeLoopDelay.readInterp(tapeDelaySamples) * 0.005f * loopAmount;
      }

      // === Feedback path (with EQ if enabled) ===
      float fbSignal = echoOut + tapeGhost;
      if (playheadFilter) {
        fbSignal = eq.process(fbSignal);
      }
      feedbackSample = fbSignal;

      // === Input bleed ===
      float bleed = inputBleed ? xn * 0.01f : 0.0f;

      // === Wet output ===
      float wetOut = echoOut * echoVolume + bleed;

      // Output wet-only signal (dry/wet mix handled by TypeScript wrapper)
      outL[i] = wetOut;
      outR[i] = wetOut;
    }
  }
};

// ============================================================
// Instance management
// ============================================================
static constexpr int MAX_INSTANCES = 32;
static RETapeEchoInstance* g_instances[MAX_INSTANCES] = {};
static int g_nextHandle = 1;

static RETapeEchoInstance* getInstance(int handle) {
  if (handle < 1 || handle >= MAX_INSTANCES) return nullptr;
  return g_instances[handle];
}

// ============================================================
// WASM Exports
// ============================================================
extern "C" {

EMSCRIPTEN_KEEPALIVE
int re_tape_echo_create(int sampleRate) {
  if (g_nextHandle >= MAX_INSTANCES) return 0;
  auto* inst = new RETapeEchoInstance();
  inst->init(sampleRate);
  int handle = g_nextHandle++;
  g_instances[handle] = inst;
  return handle;
}

EMSCRIPTEN_KEEPALIVE
void re_tape_echo_destroy(int handle) {
  auto* inst = getInstance(handle);
  if (inst) {
    delete inst;
    g_instances[handle] = nullptr;
  }
}

EMSCRIPTEN_KEEPALIVE
void re_tape_echo_process(int handle, float* inL, float* inR,
                           float* outL, float* outR, int numSamples) {
  auto* inst = getInstance(handle);
  if (!inst) return;
  inst->processBlock(inL, inR, outL, outR, numSamples);
}

EMSCRIPTEN_KEEPALIVE
void re_tape_echo_set_mode(int handle, int mode) {
  auto* inst = getInstance(handle);
  if (!inst) return;
  inst->echoMode = std::max(0, std::min(mode, 5));
  inst->updateMode();
}

EMSCRIPTEN_KEEPALIVE
void re_tape_echo_set_repeat_rate(int handle, float rate) {
  auto* inst = getInstance(handle);
  if (!inst) return;
  inst->repeatRate = std::max(0.0f, std::min(rate, 1.0f));
}

EMSCRIPTEN_KEEPALIVE
void re_tape_echo_set_intensity(int handle, float val) {
  auto* inst = getInstance(handle);
  if (!inst) return;
  inst->intensity = std::max(0.0f, std::min(val, 1.0f));
}

EMSCRIPTEN_KEEPALIVE
void re_tape_echo_set_echo_volume(int handle, float vol) {
  auto* inst = getInstance(handle);
  if (!inst) return;
  inst->echoVolume = std::max(0.0f, std::min(vol, 1.0f));
}

EMSCRIPTEN_KEEPALIVE
void re_tape_echo_set_wow(int handle, float val) {
  auto* inst = getInstance(handle);
  if (!inst) return;
  inst->wow = std::max(0.0f, std::min(val, 1.0f));
}

EMSCRIPTEN_KEEPALIVE
void re_tape_echo_set_flutter(int handle, float val) {
  auto* inst = getInstance(handle);
  if (!inst) return;
  inst->flutter = std::max(0.0f, std::min(val, 1.0f));
}

EMSCRIPTEN_KEEPALIVE
void re_tape_echo_set_dirt(int handle, float val) {
  auto* inst = getInstance(handle);
  if (!inst) return;
  inst->dirt = std::max(0.0f, std::min(val, 1.0f));
}

EMSCRIPTEN_KEEPALIVE
void re_tape_echo_set_input_bleed(int handle, int on) {
  auto* inst = getInstance(handle);
  if (!inst) return;
  inst->inputBleed = on ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE
void re_tape_echo_set_loop_amount(int handle, float val) {
  auto* inst = getInstance(handle);
  if (!inst) return;
  inst->loopAmount = std::max(0.0f, std::min(val, 1.0f));
}

EMSCRIPTEN_KEEPALIVE
void re_tape_echo_set_playhead_filter(int handle, int on) {
  auto* inst = getInstance(handle);
  if (!inst) return;
  inst->playheadFilter = on ? 1 : 0;
}

} // extern "C"
