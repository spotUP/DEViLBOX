/**
 * AmiSamplerWASM.cpp — Ami-Sampler DSP compiled to WASM
 *
 * De-JUCEd extraction of the Ami-Sampler-VST DSP pipeline:
 *   - 8-bit Paula quantization (AmiSamplerSound.cpp)
 *   - Sample-and-Hold decimation (AmiSamplerSound.cpp)
 *   - Nearest-neighbor resampling (PluginProcessor.cpp)
 *   - Amiga RC filter emulation: A500/A1200 + LED (RCFilters.cpp)
 *
 * Original code by _astriid_ (Ami-Sampler-VST)
 * RC filters based on 8bitbubsy's pt2-clone (pt2_rcfilters.c)
 *
 * JUCE dependencies removed:
 *   - juce::MathConstants<double>::twoPi → constexpr TWO_PI
 *   - juce::MathConstants<double>::pi    → constexpr PI
 *   - JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR → deleted
 *   - juce::AudioSampleBuffer → raw float* + length
 */

#include <cmath>
#include <cstring>
#include <cstdlib>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

// ============================================================================
// Constants (replacing juce::MathConstants)
// ============================================================================

static constexpr double PI      = 3.14159265358979323846;
static constexpr double TWO_PI  = 6.28318530717958647693;
static constexpr double SMALL_NUMBER = 1E-4;

// ============================================================================
// RC Filter Structs & Functions
// (from RCFilters.h/cpp — 8bitbubsy pt2-clone Amiga filter emulation)
// ============================================================================

struct OnePoleFilter {
    double tmpL = 0.0, tmpR = 0.0, a1 = 0.0, a2 = 0.0;
};

struct TwoPoleFilter {
    double tmpL[4] = {0}, tmpR[4] = {0};
    double a1 = 0.0, a2 = 0.0, b1 = 0.0, b2 = 0.0;
};

static void clearOnePoleFilter(OnePoleFilter* f) {
    f->tmpL = f->tmpR = 0.0;
}

static void clearTwoPoleFilter(TwoPoleFilter* f) {
    f->tmpL[0] = f->tmpL[1] = f->tmpL[2] = f->tmpL[3] = 0.0;
    f->tmpR[0] = f->tmpR[1] = f->tmpR[2] = f->tmpR[3] = 0.0;
}

/* 1-pole RC low-pass/high-pass filter, based on:
** https://www.musicdsp.org/en/latest/Filters/116-one-pole-lp-and-hp.html
*/
static void setupOnePoleFilter(double audioRate, double cutOff, OnePoleFilter* f) {
    if (cutOff >= audioRate / 2.0)
        cutOff = (audioRate / 2.0) - SMALL_NUMBER;

    const double a = 2.0 - std::cos((TWO_PI * cutOff) / audioRate);
    const double b = a - std::sqrt((a * a) - 1.0);

    f->a1 = 1.0 - b;
    f->a2 = b;
}

static void onePoleLPFilter(OnePoleFilter* f, const float* inL, const float* inR, float* outL, float* outR) {
    f->tmpL = (*inL * f->a1) + (f->tmpL * f->a2);
    *outL = (float)f->tmpL;

    f->tmpR = (*inR * f->a1) + (f->tmpR * f->a2);
    *outR = (float)f->tmpR;
}

static void onePoleHPFilter(OnePoleFilter* f, const float* inL, const float* inR, float* outL, float* outR) {
    f->tmpL = (*inL * f->a1) + (f->tmpL * f->a2);
    *outL = (float)(*inL - f->tmpL);

    f->tmpR = (*inR * f->a1) + (f->tmpR * f->a2);
    *outR = (float)(*inR - f->tmpR);
}

/* 2-pole RC low-pass filter with Q factor, based on:
** https://www.musicdsp.org/en/latest/Filters/38-lp-and-hp-filter.html
*/
static void setupTwoPoleFilter(double audioRate, double cutOff, double qFactor, TwoPoleFilter* f) {
    if (cutOff >= audioRate / 2.0)
        cutOff = (audioRate / 2.0) - SMALL_NUMBER;

    const double a = 1.0 / std::tan((PI * cutOff) / audioRate);
    const double b = 1.0 / qFactor;

    f->a1 = 1.0 / (1.0 + b * a + a * a);
    f->a2 = 2.0 * f->a1;
    f->b1 = 2.0 * (1.0 - a * a) * f->a1;
    f->b2 = (1.0 - b * a + a * a) * f->a1;
}

static void twoPoleLPFilter(TwoPoleFilter* f, const float* inL, const float* inR, float* outL, float* outR) {
    const double LOut = (*inL * f->a1) + (f->tmpL[0] * f->a2) + (f->tmpL[1] * f->a1) - (f->tmpL[2] * f->b1) - (f->tmpL[3] * f->b2);
    const double ROut = (*inR * f->a1) + (f->tmpR[0] * f->a2) + (f->tmpR[1] * f->a1) - (f->tmpR[2] * f->b1) - (f->tmpR[3] * f->b2);

    f->tmpL[1] = f->tmpL[0];
    f->tmpL[0] = *inL;
    f->tmpL[3] = f->tmpL[2];
    f->tmpL[2] = LOut;

    f->tmpR[1] = f->tmpR[0];
    f->tmpR[0] = *inR;
    f->tmpR[3] = f->tmpR[2];
    f->tmpR[2] = ROut;

    *outL = (float)LOut;
    *outR = (float)ROut;
}

// ============================================================================
// 8-bit Paula Quantization (from AmiSamplerSound.cpp)
// ============================================================================

static inline float getAmi8Bit(const float samp) {
    const float amiSamp = samp < 0
        ? std::floor(samp * 128.f) / 128.f
        : std::floor(samp * 127.f) / 127.f;

    return amiSamp >= 1.f ? 1.f : amiSamp <= -1.f ? -1.f : amiSamp;
}

// ============================================================================
// Instance structure
// ============================================================================

struct AmiSamplerInstance {
    // Sample data
    float* sampleData     = nullptr;
    int    sampleLength   = 0;
    double sourceSampleRate = 44100.0;

    // Output buffer (after processing)
    float* outputData     = nullptr;
    int    outputLength   = 0;

    // Device sample rate
    double deviceSampleRate = 48000.0;

    // Filter state
    OnePoleFilter a500FilterLo;
    OnePoleFilter a500FilterHi;
    OnePoleFilter a1200FilterHi;
    TwoPoleFilter filterLED;

    // Settings
    int  isA500    = 1;   // 0=A1200, 1=A500
    int  ledOn     = 0;   // LED filter toggle
    int  snhValue  = 1;   // Sample & Hold (1=off, 2-16)
    int  quantize  = 1;   // 8-bit quantize toggle
};

static constexpr int MAX_INSTANCES = 8;
static AmiSamplerInstance g_instances[MAX_INSTANCES];
static int g_instanceCount = 0;

// ============================================================================
// Filter initialization (from PluginProcessor.cpp::initFilters)
// Exact Amiga hardware component values
// ============================================================================

static void initFilters(AmiSamplerInstance* inst) {
    double R, C, R1, R2, C1, C2, cutoff, qfactor;

    clearOnePoleFilter(&inst->a500FilterLo);
    clearOnePoleFilter(&inst->a500FilterHi);
    clearOnePoleFilter(&inst->a1200FilterHi);
    clearTwoPoleFilter(&inst->filterLED);

    // A500 1-pole (6dB/oct) RC low-pass filter:
    R = 360.0;   // R321 (360 ohm)
    C = 1e-7;    // C321 (0.1uF)
    cutoff = 1.0 / (TWO_PI * R * C);  // ~4420.971 Hz
    setupOnePoleFilter(inst->deviceSampleRate, cutoff, &inst->a500FilterLo);

    // A500 1-pole (6dB/oct) RC high-pass filter:
    R = 1390.0;    // R324 (1K ohm) + R325 (390 ohm)
    C = 2.233e-5;  // C334 (22uF) + C335 (0.33uF)
    cutoff = 1.0 / (TWO_PI * R * C);  // ~5.128 Hz
    setupOnePoleFilter(inst->deviceSampleRate, cutoff, &inst->a500FilterHi);

    // A1200 1-pole (6dB/oct) RC high-pass filter:
    R = 1360.0;  // R324 (1K ohm) + R325 (360 ohm)
    C = 2.2e-5;  // C334 (22uF)
    cutoff = 1.0 / (TWO_PI * R * C);  // ~5.319 Hz
    setupOnePoleFilter(inst->deviceSampleRate, cutoff, &inst->a1200FilterHi);

    // LED filter: 2-pole (12dB/oct) Butterworth-ish LP
    R1 = 10000.0;  // R322 (10K ohm)
    R2 = 10000.0;  // R323 (10K ohm)
    C1 = 6.8e-9;   // C322 (6800pF)
    C2 = 3.9e-9;   // C323 (3900pF)
    cutoff  = 1.0 / (TWO_PI * std::sqrt(R1 * R2 * C1 * C2));  // ~3090.533 Hz
    qfactor = std::sqrt(R1 * R2 * C1 * C2) / (C2 * (R1 + R2));  // ~0.660225
    setupTwoPoleFilter(inst->deviceSampleRate, cutoff, qfactor, &inst->filterLED);
}

// Apply Amiga filter chain to a single sample (from PluginProcessor.cpp::getAmiFilter)
static void applyAmiFilter(AmiSamplerInstance* inst, const float* inL, const float* inR, float* outL, float* outR) {
    float filteredL = 0.f;
    float filteredR = 0.f;

    if (inst->isA500) {
        onePoleLPFilter(&inst->a500FilterLo, inL, inR, &filteredL, &filteredR);
        onePoleHPFilter(&inst->a500FilterHi, &filteredL, &filteredR, &filteredL, &filteredR);
    } else {
        onePoleHPFilter(&inst->a1200FilterHi, inL, inR, &filteredL, &filteredR);
    }

    if (inst->ledOn) {
        twoPoleLPFilter(&inst->filterLED, &filteredL, &filteredR, &filteredL, &filteredR);
    }

    *outL = filteredL;
    *outR = filteredR;
}

// ============================================================================
// Exported C API
// ============================================================================

extern "C" {

EMSCRIPTEN_KEEPALIVE
int ami_create(double sampleRate) {
    if (g_instanceCount >= MAX_INSTANCES) return -1;

    int handle = g_instanceCount++;
    AmiSamplerInstance* inst = &g_instances[handle];

    // Zero-init
    *inst = AmiSamplerInstance();
    inst->deviceSampleRate = sampleRate;

    initFilters(inst);

    return handle;
}

EMSCRIPTEN_KEEPALIVE
void ami_destroy(int handle) {
    if (handle < 0 || handle >= g_instanceCount) return;

    AmiSamplerInstance* inst = &g_instances[handle];
    if (inst->sampleData) { free(inst->sampleData); inst->sampleData = nullptr; }
    if (inst->outputData) { free(inst->outputData); inst->outputData = nullptr; }
    inst->sampleLength = 0;
    inst->outputLength = 0;
}

// Load sample data from JS (copies into internal buffer)
EMSCRIPTEN_KEEPALIVE
void ami_load_sample(int handle, float* data, int length, double sourceSampleRate) {
    if (handle < 0 || handle >= g_instanceCount) return;

    AmiSamplerInstance* inst = &g_instances[handle];

    if (inst->sampleData) free(inst->sampleData);
    inst->sampleData = (float*)malloc(length * sizeof(float));
    std::memcpy(inst->sampleData, data, length * sizeof(float));
    inst->sampleLength = length;
    inst->sourceSampleRate = sourceSampleRate;

    // Also copy to output (start with unprocessed)
    if (inst->outputData) free(inst->outputData);
    inst->outputData = (float*)malloc(length * sizeof(float));
    std::memcpy(inst->outputData, data, length * sizeof(float));
    inst->outputLength = length;
}

// Nearest-neighbor resample (from PluginProcessor.cpp::resampleAudioData)
EMSCRIPTEN_KEEPALIVE
int ami_resample(int handle, double targetRate) {
    if (handle < 0 || handle >= g_instanceCount) return 0;

    AmiSamplerInstance* inst = &g_instances[handle];
    if (!inst->outputData || inst->outputLength <= 0) return 0;

    const double sourceRate = inst->sourceSampleRate;
    const double resampleRatio = sourceRate / targetRate;
    const int sourceSampleLength = inst->outputLength;
    const int newSampleLength = (int)std::floor((double)sourceSampleLength / resampleRatio);

    if (newSampleLength <= 0) return 0;

    float* newData = (float*)malloc(newSampleLength * sizeof(float));
    double resamplePos = 0.0;

    for (int i = 0; i < newSampleLength; i++) {
        const int pos = (int)std::floor(resamplePos);

        if (pos < sourceSampleLength) {
            newData[i] = inst->outputData[pos];
        } else {
            // Fill remaining with last valid sample
            for (int n = i; n < newSampleLength; n++) {
                newData[n] = inst->outputData[sourceSampleLength - 1];
            }
            break;
        }

        resamplePos += resampleRatio;
    }

    free(inst->outputData);
    inst->outputData = newData;
    inst->outputLength = newSampleLength;
    inst->sourceSampleRate = targetRate;

    return newSampleLength;
}

// Apply 8-bit quantization to output buffer
EMSCRIPTEN_KEEPALIVE
void ami_apply_8bit(int handle) {
    if (handle < 0 || handle >= g_instanceCount) return;

    AmiSamplerInstance* inst = &g_instances[handle];
    if (!inst->outputData) return;

    for (int i = 0; i < inst->outputLength; i++) {
        inst->outputData[i] = getAmi8Bit(inst->outputData[i]);
    }
}

// Apply Sample & Hold decimation (from AmiSamplerSound.cpp rendering)
EMSCRIPTEN_KEEPALIVE
void ami_apply_snh(int handle, int snh) {
    if (handle < 0 || handle >= g_instanceCount) return;
    if (snh <= 1) return;  // snh=1 means no decimation

    AmiSamplerInstance* inst = &g_instances[handle];
    if (!inst->outputData) return;

    for (int i = 0; i < inst->outputLength; i++) {
        // Snap position to nearest lower multiple of snh
        const int snappedPos = i - (i % snh);
        inst->outputData[i] = inst->outputData[snappedPos];
    }
}

// Set filter model (0=A1200, 1=A500)
EMSCRIPTEN_KEEPALIVE
void ami_set_model(int handle, int isA500) {
    if (handle < 0 || handle >= g_instanceCount) return;
    g_instances[handle].isA500 = isA500;
}

// Toggle LED filter
EMSCRIPTEN_KEEPALIVE
void ami_set_led(int handle, int on) {
    if (handle < 0 || handle >= g_instanceCount) return;
    g_instances[handle].ledOn = on;
}

// Apply RC filter chain to output buffer (processes mono as dual-mono)
EMSCRIPTEN_KEEPALIVE
void ami_apply_filters(int handle) {
    if (handle < 0 || handle >= g_instanceCount) return;

    AmiSamplerInstance* inst = &g_instances[handle];
    if (!inst->outputData) return;

    // Re-init filter state for clean pass
    initFilters(inst);

    for (int i = 0; i < inst->outputLength; i++) {
        float inSample = inst->outputData[i];
        float outL = 0.f, outR = 0.f;

        // Process as dual-mono (same sample to both channels)
        applyAmiFilter(inst, &inSample, &inSample, &outL, &outR);

        // Take left channel output (they're identical for mono input)
        inst->outputData[i] = outL;
    }
}

// All-in-one: reset from source → resample → 8bit → SnH → filters
EMSCRIPTEN_KEEPALIVE
int ami_process_full(int handle, double targetRate, int snh, int isA500, int ledOn, int quantize8bit) {
    if (handle < 0 || handle >= g_instanceCount) return 0;

    AmiSamplerInstance* inst = &g_instances[handle];
    if (!inst->sampleData || inst->sampleLength <= 0) return 0;

    // Reset output to source copy
    if (inst->outputData) free(inst->outputData);
    inst->outputData = (float*)malloc(inst->sampleLength * sizeof(float));
    std::memcpy(inst->outputData, inst->sampleData, inst->sampleLength * sizeof(float));
    inst->outputLength = inst->sampleLength;

    // Restore source sample rate (may have been overwritten by previous resample)
    double originalRate = inst->sourceSampleRate;

    // Apply settings
    inst->isA500 = isA500;
    inst->ledOn = ledOn;

    // 1. Resample (nearest-neighbor)
    int newLength = inst->outputLength;
    if (targetRate > 0 && targetRate != inst->sourceSampleRate) {
        newLength = ami_resample(handle, targetRate);
    }

    // 2. 8-bit quantize
    if (quantize8bit) {
        ami_apply_8bit(handle);
    }

    // 3. Sample & Hold
    if (snh > 1) {
        ami_apply_snh(handle, snh);
    }

    // 4. RC Filters
    ami_apply_filters(handle);

    // Restore source sample rate for future processing
    // (resample changes it, but we want the original for re-processing)
    inst->sourceSampleRate = originalRate;

    return inst->outputLength;
}

// Get pointer to output buffer (for JS to read via HEAPF32)
EMSCRIPTEN_KEEPALIVE
float* ami_get_output_ptr(int handle) {
    if (handle < 0 || handle >= g_instanceCount) return nullptr;
    return g_instances[handle].outputData;
}

// Get output buffer length
EMSCRIPTEN_KEEPALIVE
int ami_get_output_length(int handle) {
    if (handle < 0 || handle >= g_instanceCount) return 0;
    return g_instances[handle].outputLength;
}

// Get output sample rate (may differ from source after resampling)
EMSCRIPTEN_KEEPALIVE
double ami_get_output_rate(int handle) {
    if (handle < 0 || handle >= g_instanceCount) return 0;
    return g_instances[handle].sourceSampleRate;
}

} // extern "C"
