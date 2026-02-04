/**
 * SpaceyDelayerWASM.cpp - Self-contained multitap delay effect for WASM
 *
 * DSP algorithm adapted from SpaceyDelayer by RackAFX/Will Pirkle.
 * Features:
 *   - Circular buffer delay with linear interpolation
 *   - Configurable first tap delay and tap spacing
 *   - 3-tap multitap mode with equal-spaced taps
 *   - Feedback with optional tape-style bandpass filter
 *   - Stereo processing (independent L/R delay lines)
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

// ============================================================
// Linear interpolation (from pluginconstants.h)
// ============================================================
static inline float dLinTerp(float x1, float x2, float y1, float y2, float x) {
  float denom = x2 - x1;
  if (denom == 0.0f) return y1;
  float dx = (x - x1) / denom;
  return dx * y2 + (1.0f - dx) * y1;
}

// ============================================================
// Simple 1-pole filter for tape emulation
// ============================================================
struct OnePoleFilter {
  float z1;     // state
  float a0;     // input coeff
  float b1;     // feedback coeff

  OnePoleFilter() : z1(0.0f), a0(1.0f), b1(0.0f) {}

  void setLowpass(float cutoffHz, float sampleRate) {
    float w = 2.0f * 3.14159265f * cutoffHz / sampleRate;
    float cosw = cosf(w);
    b1 = 2.0f - cosw - sqrtf((2.0f - cosw) * (2.0f - cosw) - 1.0f);
    a0 = 1.0f - b1;
  }

  void setHighpass(float cutoffHz, float sampleRate) {
    float w = 2.0f * 3.14159265f * cutoffHz / sampleRate;
    float cosw = cosf(w);
    b1 = 2.0f - cosw - sqrtf((2.0f - cosw) * (2.0f - cosw) - 1.0f);
    a0 = 1.0f - b1;
  }

  float processLowpass(float input) {
    z1 = input * a0 + z1 * b1;
    return z1;
  }

  float processHighpass(float input) {
    z1 = input * a0 + z1 * b1;
    return input - z1;
  }

  void reset() { z1 = 0.0f; }
};

// ============================================================
// DDLModule - Digital Delay Line
// ============================================================
class DDLModule {
public:
  float* m_pBuffer;
  int m_nBufferSize;
  int m_nReadIndex;
  int m_nWriteIndex;

  float m_fDelayInSamples;
  float m_fDelay_ms;
  float m_fFeedback;         // 0-1
  float m_fFeedback_pct;     // 0-100
  int m_nSampleRate;

  DDLModule()
    : m_pBuffer(nullptr)
    , m_nBufferSize(0)
    , m_nReadIndex(0)
    , m_nWriteIndex(0)
    , m_fDelayInSamples(0.0f)
    , m_fDelay_ms(250.0f)
    , m_fFeedback(0.0f)
    , m_fFeedback_pct(40.0f)
    , m_nSampleRate(48000)
  {}

  ~DDLModule() {
    delete[] m_pBuffer;
  }

  void init(int sampleRate) {
    m_nSampleRate = sampleRate;
    m_nBufferSize = 2 * sampleRate; // 2 seconds
    delete[] m_pBuffer;
    m_pBuffer = new float[m_nBufferSize];
    resetDelay();
    cookVariables();
  }

  void resetDelay() {
    if (m_pBuffer) {
      memset(m_pBuffer, 0, m_nBufferSize * sizeof(float));
    }
    m_nWriteIndex = 0;
    m_nReadIndex = 0;
    cookVariables();
  }

  void cookVariables() {
    // Clamp feedback to safe range
    m_fFeedback = std::min(m_fFeedback_pct, 95.0f) / 100.0f;

    // Clamp delay to buffer size
    float maxDelay_ms = (float)(m_nBufferSize - 1) * 1000.0f / (float)m_nSampleRate;
    float clampedDelay = std::min(m_fDelay_ms, maxDelay_ms);
    m_fDelayInSamples = clampedDelay * ((float)m_nSampleRate / 1000.0f);

    m_nReadIndex = m_nWriteIndex - (int)m_fDelayInSamples;
    if (m_nReadIndex < 0)
      m_nReadIndex += m_nBufferSize;
  }

  // Retrieve a sample from N samples ago relative to current read position
  float getPastSample(int nSamplesBack) const {
    if (nSamplesBack <= 0) return m_pBuffer[m_nReadIndex];
    // Safe modular wrapping for any offset
    int z = ((m_nReadIndex - nSamplesBack) % m_nBufferSize + m_nBufferSize) % m_nBufferSize;
    return m_pBuffer[z];
  }

  // Process one sample, returns delayed (wet-only) output
  float processSample(float xn) {
    if (!m_pBuffer) return xn;

    // Read delayed sample
    float yn = m_pBuffer[m_nReadIndex];

    // Handle zero or sub-sample delay
    if (m_nReadIndex == m_nWriteIndex && m_fDelayInSamples < 1.0f) {
      yn = xn;
    }

    // Linear interpolation for fractional delay
    int nReadIndex_1 = m_nReadIndex - 1;
    if (nReadIndex_1 < 0)
      nReadIndex_1 = m_nBufferSize - 1;

    float yn_1 = m_pBuffer[nReadIndex_1];
    float fFracDelay = m_fDelayInSamples - (int)m_fDelayInSamples;
    float fInterp = dLinTerp(0.0f, 1.0f, yn, yn_1, fFracDelay);

    if (m_fDelayInSamples == 0.0f)
      yn = xn;
    else
      yn = fInterp;

    // Write to buffer with feedback
    m_pBuffer[m_nWriteIndex] = xn + m_fFeedback * yn;

    // Advance indices
    m_nWriteIndex++;
    if (m_nWriteIndex >= m_nBufferSize) m_nWriteIndex = 0;
    m_nReadIndex++;
    if (m_nReadIndex >= m_nBufferSize) m_nReadIndex = 0;

    return yn;
  }
};

// ============================================================
// SpaceyDelayer - Complete effect instance
// ============================================================
struct SpaceyDelayerInstance {
  DDLModule ddlLeft;
  DDLModule ddlRight;

  float firstTap_ms;
  float tapSize_ms;
  float tapSizeInSamples;
  float feedback_pct;
  int multiTap;        // 0 or 1
  int tapeFilter;      // 0 or 1
  int sampleRate;

  // Tape filter (in feedback path)
  OnePoleFilter hpfL, hpfR;  // High-pass ~80Hz
  OnePoleFilter lpfL, lpfR;  // Low-pass ~4kHz

  SpaceyDelayerInstance()
    : firstTap_ms(250.0f)
    , tapSize_ms(150.0f)
    , tapSizeInSamples(0.0f)
    , feedback_pct(40.0f)
    , multiTap(1)
    , tapeFilter(0)
    , sampleRate(48000)
  {}

  void init(int sr) {
    sampleRate = sr;
    ddlLeft.init(sr);
    ddlRight.init(sr);
    updateParams();

    // Configure tape filters
    hpfL.setHighpass(80.0f, (float)sr);
    hpfR.setHighpass(80.0f, (float)sr);
    lpfL.setLowpass(4000.0f, (float)sr);
    lpfR.setLowpass(4000.0f, (float)sr);
  }

  void updateParams() {
    ddlLeft.m_fDelay_ms = firstTap_ms;
    ddlRight.m_fDelay_ms = firstTap_ms;
    ddlLeft.m_fFeedback_pct = feedback_pct;
    ddlRight.m_fFeedback_pct = feedback_pct;
    tapSizeInSamples = tapSize_ms * ((float)sampleRate / 1000.0f);
    ddlLeft.cookVariables();
    ddlRight.cookVariables();
  }

  // Process block — outputs wet-only signal (dry/wet mixing handled externally)
  void processBlock(float* inL, float* inR, float* outL, float* outR, int numSamples) {
    for (int i = 0; i < numSamples; i++) {
      float xnL = inL[i];
      float xnR = inR[i];

      // Process through delay lines
      float ynL = ddlLeft.processSample(xnL);
      float ynR = ddlRight.processSample(xnR);

      // Apply tape filter to the feedback path
      if (tapeFilter) {
        int idxL = ddlLeft.m_nWriteIndex - 1;
        if (idxL < 0) idxL += ddlLeft.m_nBufferSize;
        float fbL = ddlLeft.m_pBuffer[idxL] - xnL;
        fbL = hpfL.processHighpass(fbL);
        fbL = lpfL.processLowpass(fbL);
        ddlLeft.m_pBuffer[idxL] = xnL + fbL;

        int idxR = ddlRight.m_nWriteIndex - 1;
        if (idxR < 0) idxR += ddlRight.m_nBufferSize;
        float fbR = ddlRight.m_pBuffer[idxR] - xnR;
        fbR = hpfR.processHighpass(fbR);
        fbR = lpfR.processLowpass(fbR);
        ddlRight.m_pBuffer[idxR] = xnR + fbR;
      }

      // Multitap: add 2nd and 3rd taps
      if (multiTap) {
        int tapSamples = (int)tapSizeInSamples;
        if (tapSamples > 0) {
          ynL += ddlLeft.getPastSample(tapSamples);
          ynL += ddlLeft.getPastSample(tapSamples * 2);
          ynL *= (1.0f / 3.0f);

          ynR += ddlRight.getPastSample(tapSamples);
          ynR += ddlRight.getPastSample(tapSamples * 2);
          ynR *= (1.0f / 3.0f);
        }
      }

      // Output wet-only signal (dry/wet mix is handled by the TypeScript wrapper)
      outL[i] = ynL;
      outR[i] = ynR;
    }
  }
};

// ============================================================
// Instance management
// ============================================================
static constexpr int MAX_INSTANCES = 32;
static SpaceyDelayerInstance* g_instances[MAX_INSTANCES] = {};
static int g_nextHandle = 1;

static SpaceyDelayerInstance* getInstance(int handle) {
  if (handle < 1 || handle >= MAX_INSTANCES) return nullptr;
  return g_instances[handle];
}

// ============================================================
// WASM Exports
// ============================================================
extern "C" {

EMSCRIPTEN_KEEPALIVE
int spacey_delayer_create(int sampleRate) {
  if (g_nextHandle >= MAX_INSTANCES) return 0;
  SpaceyDelayerInstance* inst = new SpaceyDelayerInstance();
  inst->init(sampleRate);
  int handle = g_nextHandle++;
  g_instances[handle] = inst;
  return handle;
}

EMSCRIPTEN_KEEPALIVE
void spacey_delayer_destroy(int handle) {
  SpaceyDelayerInstance* inst = getInstance(handle);
  if (inst) {
    delete inst;
    g_instances[handle] = nullptr;
  }
}

EMSCRIPTEN_KEEPALIVE
void spacey_delayer_process(int handle, float* inL, float* inR,
                            float* outL, float* outR, int numSamples) {
  SpaceyDelayerInstance* inst = getInstance(handle);
  if (!inst) return;
  inst->processBlock(inL, inR, outL, outR, numSamples);
}

EMSCRIPTEN_KEEPALIVE
void spacey_delayer_set_first_tap(int handle, float ms) {
  SpaceyDelayerInstance* inst = getInstance(handle);
  if (!inst) return;
  inst->firstTap_ms = std::max(0.0f, std::min(ms, 2000.0f));
  inst->updateParams();
}

EMSCRIPTEN_KEEPALIVE
void spacey_delayer_set_tap_size(int handle, float ms) {
  SpaceyDelayerInstance* inst = getInstance(handle);
  if (!inst) return;
  inst->tapSize_ms = std::max(0.0f, std::min(ms, 1000.0f));
  inst->updateParams();
}

EMSCRIPTEN_KEEPALIVE
void spacey_delayer_set_feedback(int handle, float pct) {
  SpaceyDelayerInstance* inst = getInstance(handle);
  if (!inst) return;
  inst->feedback_pct = std::max(0.0f, std::min(pct, 95.0f));
  inst->updateParams();
}

EMSCRIPTEN_KEEPALIVE
void spacey_delayer_set_wetness(int handle, float wet) {
  SpaceyDelayerInstance* inst = getInstance(handle);
  if (!inst) return;
  // Wetness is now always 1.0 (wet-only output), kept for API compat
  (void)wet;
}

EMSCRIPTEN_KEEPALIVE
void spacey_delayer_set_multi_tap(int handle, int on) {
  SpaceyDelayerInstance* inst = getInstance(handle);
  if (!inst) return;
  inst->multiTap = on ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE
void spacey_delayer_set_tape_filter(int handle, int on) {
  SpaceyDelayerInstance* inst = getInstance(handle);
  if (!inst) return;
  inst->tapeFilter = on ? 1 : 0;
}

} // extern "C"
