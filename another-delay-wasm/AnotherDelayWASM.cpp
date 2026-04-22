/**
 * AnotherDelayWASM.cpp — Tape delay with wow/flutter/saturation/reverb
 *
 * Transpiled from dllim/anotherdelay (MIT).
 * Features:
 *   - Circular delay buffer with cubic interpolation
 *   - Wow + flutter oscillators
 *   - IIR lowpass + highpass filtering on wet signal
 *   - atan waveshaping tape saturation
 *   - Schroeder reverb (8 comb + 4 allpass, matching JUCE Reverb topology)
 *   - Wet-only output (dry/wet handled in TypeScript)
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

static inline float clampf(float x, float lo, float hi) {
  return x < lo ? lo : (x > hi ? hi : x);
}

// ============================================================
// Biquad filter (LP / HP)
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

  float process(float x) {
    float y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x;
    y2 = y1; y1 = y;
    return y;
  }

  void reset() { x1 = x2 = y1 = y2 = 0.0f; }
};

// ============================================================
// Delay line with cubic Hermite interpolation
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

  float readCubic(float delay) const {
    float rp = (float)wr - delay;
    while (rp < 0.0f) rp += (float)sz;
    int i1 = (int)rp;
    float f = rp - (float)i1;
    int i0 = i1 - 1; if (i0 < 0) i0 += sz;
    int i2 = i1 + 1; if (i2 >= sz) i2 -= sz;
    int i3 = i1 + 2; if (i3 >= sz) i3 -= sz;
    if (i1 >= sz) i1 -= sz;
    float y0 = buf[i0], y1 = buf[i1], y2 = buf[i2], y3 = buf[i3];
    // Hermite interpolation
    float a0 = y3 - y2 - y0 + y1;
    float a1v = y0 - y1 - a0;
    float a2 = y2 - y0;
    return ((a0 * f + a1v) * f + a2) * f + y1;
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

  void clear() {
    if (buf) memset(buf, 0, sz * sizeof(float));
    wr = 0;
  }
};

// ============================================================
// Schroeder/JUCE-style Reverb
// 8 comb filters + 4 allpass filters (Freeverb topology)
// ============================================================
struct CombFilter {
  float* buf;
  int    sz;
  int    idx;
  float  feedback;
  float  damp1, damp2;
  float  filterStore;

  CombFilter() : buf(nullptr), sz(0), idx(0), feedback(0.5f),
                 damp1(0.5f), damp2(0.5f), filterStore(0.0f) {}
  ~CombFilter() { delete[] buf; }

  void init(int size) {
    delete[] buf;
    sz = size;
    buf = new float[sz];
    memset(buf, 0, sz * sizeof(float));
    idx = 0;
    filterStore = 0.0f;
  }

  float process(float input) {
    float output = buf[idx];
    filterStore = output * damp2 + filterStore * damp1;
    buf[idx] = input + filterStore * feedback;
    if (++idx >= sz) idx = 0;
    return output;
  }

  void clear() {
    if (buf) memset(buf, 0, sz * sizeof(float));
    filterStore = 0.0f;
  }
};

struct AllPassFilter {
  float* buf;
  int    sz;
  int    idx;

  AllPassFilter() : buf(nullptr), sz(0), idx(0) {}
  ~AllPassFilter() { delete[] buf; }

  void init(int size) {
    delete[] buf;
    sz = size;
    buf = new float[sz];
    memset(buf, 0, sz * sizeof(float));
    idx = 0;
  }

  float process(float input) {
    float delayed = buf[idx];
    buf[idx] = input + delayed * 0.5f;
    if (++idx >= sz) idx = 0;
    return delayed - input;
  }

  void clear() {
    if (buf) memset(buf, 0, sz * sizeof(float));
  }
};

struct SchroederReverb {
  static constexpr int NUM_COMBS = 8;
  static constexpr int NUM_ALLPASSES = 4;

  CombFilter combL[NUM_COMBS];
  CombFilter combR[NUM_COMBS];
  AllPassFilter apL[NUM_ALLPASSES];
  AllPassFilter apR[NUM_ALLPASSES];

  float roomSize = 0.5f;
  float damping  = 0.5f;
  float width    = 1.0f;
  bool  enabled  = true;

  // JUCE Reverb comb/allpass sizes (at 44100)
  static constexpr int combTuningL[NUM_COMBS] = {
    1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617
  };
  static constexpr int combTuningR[NUM_COMBS] = {
    1116 + 23, 1188 + 23, 1277 + 23, 1356 + 23,
    1422 + 23, 1491 + 23, 1557 + 23, 1617 + 23
  };
  static constexpr int apTuningL[NUM_ALLPASSES] = { 556, 441, 341, 225 };
  static constexpr int apTuningR[NUM_ALLPASSES] = { 579, 464, 364, 248 };

  void init(float sr) {
    float ratio = sr / 44100.0f;
    for (int i = 0; i < NUM_COMBS; i++) {
      combL[i].init((int)(combTuningL[i] * ratio));
      combR[i].init((int)(combTuningR[i] * ratio));
    }
    for (int i = 0; i < NUM_ALLPASSES; i++) {
      apL[i].init((int)(apTuningL[i] * ratio));
      apR[i].init((int)(apTuningR[i] * ratio));
    }
    updateParams();
  }

  void updateParams() {
    float fb = roomSize * 0.28f + 0.7f;
    float damp1 = damping * 0.4f;
    float damp2 = 1.0f - damp1;
    for (int i = 0; i < NUM_COMBS; i++) {
      combL[i].feedback = fb;
      combR[i].feedback = fb;
      combL[i].damp1 = damp1;
      combR[i].damp1 = damp1;
      combL[i].damp2 = damp2;
      combR[i].damp2 = damp2;
    }
  }

  void process(float inL, float inR, float& outL, float& outR) {
    if (!enabled) { outL = outR = 0.0f; return; }

    float input = (inL + inR) * 0.015f;
    float sumL = 0.0f, sumR = 0.0f;

    for (int i = 0; i < NUM_COMBS; i++) {
      sumL += combL[i].process(input);
      sumR += combR[i].process(input);
    }

    for (int i = 0; i < NUM_ALLPASSES; i++) {
      sumL = apL[i].process(sumL);
      sumR = apR[i].process(sumR);
    }

    float wet1 = width * 0.5f + 0.5f;
    float wet2 = (1.0f - width) * 0.5f;
    outL = sumL * wet1 + sumR * wet2;
    outR = sumR * wet1 + sumL * wet2;
  }

  void clear() {
    for (int i = 0; i < NUM_COMBS; i++) { combL[i].clear(); combR[i].clear(); }
    for (int i = 0; i < NUM_ALLPASSES; i++) { apL[i].clear(); apR[i].clear(); }
  }
};

// ============================================================
// AnotherDelay Instance
// ============================================================
struct AnotherDelayInstance {
  float sampleRate;

  // Parameters
  float delayTimeMs  = 300.0f;  // ms
  float feedback     = 0.3f;    // 0-1
  float gain         = 1.0f;    // linear
  float lowpassFreq  = 12000.0f;
  float highpassFreq = 80.0f;
  float flutterFreq  = 3.5f;
  float flutterDepth = 0.0f;
  float wowFreq      = 0.5f;
  float wowDepth     = 0.0f;

  // DSP
  DelayLine delayL, delayR;
  Biquad lpL, lpR;
  Biquad hpL, hpR;
  SchroederReverb reverb;

  // Oscillator phases
  float flutPhase = 0.0f;
  float wowPhase  = 0.0f;

  AnotherDelayInstance() : sampleRate(48000.0f) {}

  void init(int sr) {
    sampleRate = (float)sr;
    // Max 2 seconds delay
    int maxSamp = (int)(2.0f * sampleRate) + 4;
    delayL.init(maxSamp);
    delayR.init(maxSamp);

    lpL.setLowpass(lowpassFreq, 0.707f, sampleRate);
    lpR.setLowpass(lowpassFreq, 0.707f, sampleRate);
    hpL.setHighpass(highpassFreq, 0.707f, sampleRate);
    hpR.setHighpass(highpassFreq, 0.707f, sampleRate);

    reverb.init(sampleRate);
  }

  void processBlock(float* inL, float* inR, float* outL, float* outR, int n) {
    float delaySamp = delayTimeMs * sampleRate / 1000.0f;
    delaySamp = clampf(delaySamp, 1.0f, sampleRate * 1.99f);

    for (int i = 0; i < n; i++) {
      // Wow + flutter modulation
      flutPhase += flutterFreq / sampleRate;
      if (flutPhase > 1.0f) flutPhase -= 1.0f;
      wowPhase += wowFreq / sampleRate;
      if (wowPhase > 1.0f) wowPhase -= 1.0f;

      float mod = sinf(TWOPI * flutPhase) * flutterDepth
                + sinf(TWOPI * wowPhase) * wowDepth;
      float d = delaySamp * (1.0f + mod);
      d = clampf(d, 1.0f, sampleRate * 1.99f);

      // Read from delay with cubic interpolation
      float delOutL = delayL.readCubic(d);
      float delOutR = delayR.readCubic(d);

      // Filters on wet path
      delOutL = lpL.process(delOutL);
      delOutR = lpR.process(delOutR);
      delOutL = hpL.process(delOutL);
      delOutR = hpR.process(delOutR);

      // Tape saturation: (1/atan(2)) * atan(2*x)
      static const float invAtan2 = 1.0f / atanf(2.0f);
      delOutL = invAtan2 * atanf(2.0f * delOutL);
      delOutR = invAtan2 * atanf(2.0f * delOutR);

      // Write input + feedback to delay
      delayL.write(inL[i] * gain + delOutL * feedback);
      delayR.write(inR[i] * gain + delOutR * feedback);

      // Reverb
      float revL = 0.0f, revR = 0.0f;
      reverb.process(delOutL, delOutR, revL, revR);

      // Wet output = delay + reverb
      outL[i] = delOutL + revL;
      outR[i] = delOutR + revR;
    }
  }
};

// ============================================================
// Instance management (free-list)
// ============================================================
static constexpr int MAX_INSTANCES = 8;
static AnotherDelayInstance* g_instances[MAX_INSTANCES] = {};

static int findFreeSlot() {
  for (int i = 1; i < MAX_INSTANCES; i++) {
    if (!g_instances[i]) return i;
  }
  return 0;
}

static AnotherDelayInstance* getInstance(int handle) {
  if (handle < 1 || handle >= MAX_INSTANCES) return nullptr;
  return g_instances[handle];
}

// ============================================================
// WASM Exports
// ============================================================
extern "C" {

EMSCRIPTEN_KEEPALIVE
int another_delay_create(int sampleRate) {
  int slot = findFreeSlot();
  if (slot == 0) return 0;
  auto* inst = new AnotherDelayInstance();
  inst->init(sampleRate);
  g_instances[slot] = inst;
  return slot;
}

EMSCRIPTEN_KEEPALIVE
void another_delay_destroy(int handle) {
  auto* inst = getInstance(handle);
  if (inst) {
    delete inst;
    g_instances[handle] = nullptr;
  }
}

EMSCRIPTEN_KEEPALIVE
void another_delay_process(int handle, float* inL, float* inR,
                           float* outL, float* outR, int numSamples) {
  auto* inst = getInstance(handle);
  if (!inst) return;
  inst->processBlock(inL, inR, outL, outR, numSamples);
}

EMSCRIPTEN_KEEPALIVE
void another_delay_set_delay_time(int handle, float ms) {
  auto* inst = getInstance(handle);
  if (!inst) return;
  inst->delayTimeMs = clampf(ms, 1.0f, 2000.0f);
}

EMSCRIPTEN_KEEPALIVE
void another_delay_set_feedback(int handle, float val) {
  auto* inst = getInstance(handle);
  if (!inst) return;
  inst->feedback = clampf(val, 0.0f, 0.95f);
}

EMSCRIPTEN_KEEPALIVE
void another_delay_set_lowpass(int handle, float freq) {
  auto* inst = getInstance(handle);
  if (!inst) return;
  inst->lowpassFreq = clampf(freq, 200.0f, 20000.0f);
  inst->lpL.setLowpass(inst->lowpassFreq, 0.707f, inst->sampleRate);
  inst->lpR.setLowpass(inst->lowpassFreq, 0.707f, inst->sampleRate);
}

EMSCRIPTEN_KEEPALIVE
void another_delay_set_highpass(int handle, float freq) {
  auto* inst = getInstance(handle);
  if (!inst) return;
  inst->highpassFreq = clampf(freq, 1.0f, 5000.0f);
  inst->hpL.setHighpass(inst->highpassFreq, 0.707f, inst->sampleRate);
  inst->hpR.setHighpass(inst->highpassFreq, 0.707f, inst->sampleRate);
}

EMSCRIPTEN_KEEPALIVE
void another_delay_set_flutter_freq(int handle, float freq) {
  auto* inst = getInstance(handle);
  if (!inst) return;
  inst->flutterFreq = clampf(freq, 0.1f, 10.0f);
}

EMSCRIPTEN_KEEPALIVE
void another_delay_set_flutter_depth(int handle, float depth) {
  auto* inst = getInstance(handle);
  if (!inst) return;
  inst->flutterDepth = clampf(depth, 0.0f, 0.3f);
}

EMSCRIPTEN_KEEPALIVE
void another_delay_set_wow_freq(int handle, float freq) {
  auto* inst = getInstance(handle);
  if (!inst) return;
  inst->wowFreq = clampf(freq, 0.01f, 5.0f);
}

EMSCRIPTEN_KEEPALIVE
void another_delay_set_wow_depth(int handle, float depth) {
  auto* inst = getInstance(handle);
  if (!inst) return;
  inst->wowDepth = clampf(depth, 0.0f, 0.3f);
}

EMSCRIPTEN_KEEPALIVE
void another_delay_set_reverb_enabled(int handle, int on) {
  auto* inst = getInstance(handle);
  if (!inst) return;
  inst->reverb.enabled = (on != 0);
}

EMSCRIPTEN_KEEPALIVE
void another_delay_set_room_size(int handle, float val) {
  auto* inst = getInstance(handle);
  if (!inst) return;
  inst->reverb.roomSize = clampf(val, 0.0f, 1.0f);
  inst->reverb.updateParams();
}

EMSCRIPTEN_KEEPALIVE
void another_delay_set_damping(int handle, float val) {
  auto* inst = getInstance(handle);
  if (!inst) return;
  inst->reverb.damping = clampf(val, 0.0f, 1.0f);
  inst->reverb.updateParams();
}

EMSCRIPTEN_KEEPALIVE
void another_delay_set_width(int handle, float val) {
  auto* inst = getInstance(handle);
  if (!inst) return;
  inst->reverb.width = clampf(val, 0.0f, 1.0f);
}

EMSCRIPTEN_KEEPALIVE
void another_delay_set_gain(int handle, float val) {
  auto* inst = getInstance(handle);
  if (!inst) return;
  inst->gain = clampf(val, 0.0f, 4.0f);
}

} // extern "C"
