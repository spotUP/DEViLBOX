/**
 * AelapseEffect.cpp — WASM DSP wrapper for ÆLAPSE (smiarx/aelapse)
 *
 * Ports the tape delay + spring reverb DSP from third-party/aelapse to the
 * DEViLBOX WASM effect framework. The signal chain matches the reference
 * plugin exactly: tape delay first, springs second, either side individually
 * bypassable via the *Active* parameters.
 *
 * Reference DSP lives in third-party/aelapse/submodules/dsp/. This wrapper
 * pulls in processors::TapeDelay and processors::Springs compiled under the
 * newly-added `wasm` DSP_ARCH_NAMESPACE (see cpu/defines.h patch).
 *
 * SPRINGS_RMS is compile-enabled so the overlay WebGL2 springs shader can
 * read the RMS stack for animation. A C-exported helper copies the RMS
 * frames into a caller-allocated buffer (Embind can't return pointers to
 * WASM memory directly; see getRMSFrame / getRMSFrameCount).
 */

#include "WASMEffectBase.h"

#include "tapedelay/TapeDelay.h"
#include "springs/Springs.h"

#include <algorithm>
#include <array>
#include <cstring>

namespace devilbox {

// ─── Parameter enumeration ─────────────────────────────────────────────────
//
// Mirrors aelapse::PluginProcessor::ParamId with the delay time type and
// beat-sync controls omitted — DEViLBOX will ship delay time in seconds only
// for the first release; BPM sync can be added later via the effect
// descriptor's bpmSyncParams field.

enum AelapseParam {
    PARAM_DELAY_ACTIVE       = 0,
    PARAM_DELAY_DRYWET       = 1,
    PARAM_DELAY_SECONDS      = 2,
    PARAM_DELAY_FEEDBACK     = 3,
    PARAM_DELAY_CUT_LOW      = 4,
    PARAM_DELAY_CUT_HI       = 5,
    PARAM_DELAY_SATURATION   = 6,
    PARAM_DELAY_DRIFT        = 7,
    PARAM_DELAY_MODE         = 8,   // 0 = Normal, 1 = Back-and-forth, 2 = Reverse

    PARAM_SPRINGS_ACTIVE     = 9,
    PARAM_SPRINGS_DRYWET     = 10,
    PARAM_SPRINGS_WIDTH      = 11,
    PARAM_SPRINGS_LENGTH     = 12,  // Td — spring travel time (seconds-ish)
    PARAM_SPRINGS_DECAY      = 13,  // T60 — reverb decay time
    PARAM_SPRINGS_DAMP       = 14,  // Freq — damping/eigenfrequency (Hz)
    PARAM_SPRINGS_SHAPE      = 15,  // R — resonance of the all-pass chain
    PARAM_SPRINGS_TONE       = 16,  // Tone filter cutoff (Hz)
    PARAM_SPRINGS_SCATTER    = 17,
    PARAM_SPRINGS_CHAOS      = 18,

    PARAM_COUNT              = 19
};

static const char* PARAM_NAMES[PARAM_COUNT] = {
    "DelayActive", "DelayDryWet", "DelayTime", "DelayFeedback",
    "DelayCutLow", "DelayCutHi", "DelaySaturation", "DelayDrift", "DelayMode",
    "SpringsActive", "SpringsDryWet", "SpringsWidth", "SpringsLength",
    "SpringsDecay", "SpringsDamp", "SpringsShape", "SpringsTone",
    "SpringsScatter", "SpringsChaos",
};

// All parameters are driven from JS in the 0..1 range (the WASM wrapper
// converts to the DSP's native units before forwarding). This matches the
// convention in every other DEViLBOX WASM effect.

static const float PARAM_MINS[PARAM_COUNT] = {
    0.f, 0.f, 0.f, 0.f, 0.f, 0.f, 0.f, 0.f, 0.f,
    0.f, 0.f, 0.f, 0.f, 0.f, 0.f, 0.f, 0.f, 0.f, 0.f,
};

static const float PARAM_MAXS[PARAM_COUNT] = {
    1.f, 1.f, 1.f, 1.f, 1.f, 1.f, 1.f, 1.f, 1.f,
    1.f, 1.f, 1.f, 1.f, 1.f, 1.f, 1.f, 1.f, 1.f, 1.f,
};

// Defaults picked from the aelapse factory "springreverb" preset — they
// produce an obviously non-silent output on plain drum input, which makes
// smoke-testing easier.
static const float PARAM_DEFAULTS[PARAM_COUNT] = {
    1.f,   // DelayActive
    0.35f, // DelayDryWet
    0.3f,  // DelayTime        -> ~0.6 s
    0.45f, // DelayFeedback
    0.05f, // DelayCutLow      -> ~100 Hz
    0.75f, // DelayCutHi       -> ~8 kHz
    0.25f, // DelayDrive
    0.15f, // DelayDrift
    0.f,   // DelayMode        -> Normal
    1.f,   // SpringsActive
    0.4f,  // SpringsDryWet
    1.f,   // SpringsWidth
    0.5f,  // SpringsLength    -> mid
    0.4f,  // SpringsDecay     -> ~2 s
    0.3f,  // SpringsDamp      -> ~80 Hz
    0.3f,  // SpringsShape
    0.5f,  // SpringsTone      -> mid
    0.5f,  // SpringsScatter
    0.1f,  // SpringsChaos
};

// ─── Parameter → DSP-unit conversion ───────────────────────────────────────
//
// Ranges are copied from aelapse's createLayout() in PluginProcessor.cpp so
// the same 0..1 knob position produces the same audible result. The JUCE
// plugin internally works in 0..100% for dry/wet/feedback/width/chaos/drive
// and linear Hz / seconds for time / tone / damp / decay.

namespace {

// Linear interpolation between two bounds.
inline float lerp(float x, float a, float b) { return a + x * (b - a); }

// Exponential interpolation for frequency-like params.
inline float lerpExp(float x, float a, float b) {
    const float la = std::log(a);
    const float lb = std::log(b);
    return std::exp(la + x * (lb - la));
}

// Delay time — 0.02 .. 5.0 s (aelapse range)
inline float delaySeconds(float x)   { return lerp(x, 0.02f, 5.0f); }

// Tape filter cutoffs — logarithmic Hz
inline float delayCutLowHz(float x)  { return lerpExp(x, 20.f, 500.f); }
inline float delayCutHiHz(float x)   { return lerpExp(x, 1000.f, 20000.f); }

// Springs length (Td) — linear seconds, 0.02 .. 0.2 s
inline float springsLengthSec(float x) { return lerp(x, 0.02f, 0.2f); }

// Springs decay (T60) — 0.3 .. 10 s
inline float springsDecaySec(float x) { return lerp(x, 0.3f, 10.f); }

// Springs damping frequency — 20 .. 1000 Hz
inline float springsDampHz(float x)  { return lerpExp(x, 20.f, 1000.f); }

// Springs tone cutoff — 80 .. 5000 Hz (kToneMin..kToneMax in Springs.h)
inline float springsToneHz(float x)  { return lerpExp(x, 80.f, 5000.f); }

// Springs shape (resonance coefficient) — 0 .. 0.95 (avoid runaway)
inline float springsShape(float x)   { return x * 0.95f; }

} // namespace

// ─── Effect class ──────────────────────────────────────────────────────────

class AelapseEffect : public WASMEffectBase {
public:
    AelapseEffect() {
        for (int i = 0; i < PARAM_COUNT; ++i) params_[i] = PARAM_DEFAULTS[i];
    }

    ~AelapseEffect() override = default;

    void initialize(int sampleRate) override {
        WASMEffectBase::initialize(sampleRate);
        const int blockSize = DEFAULT_BLOCK_SIZE;
        tapedelay_.prepare(static_cast<float>(sampleRate), blockSize);
        springs_.prepare(static_cast<float>(sampleRate), blockSize);
        applyAll(blockSize);
    }

    void process(float* inputL, float* inputR,
                 float* outputL, float* outputR, int numSamples) override
    {
        numSamples = std::min(numSamples, DEFAULT_BLOCK_SIZE * 4);

        if (!isInitialized_) {
            if (inputL != outputL) std::memcpy(outputL, inputL, numSamples * sizeof(float));
            if (inputR != outputR) std::memcpy(outputR, inputR, numSamples * sizeof(float));
            return;
        }

        const float* ins[2]  = { inputL, inputR };
        float*       outs[2] = { outputL, outputR };

        // Start by copying input → output. If either stage is bypassed, the
        // data flows through unchanged. Stages that are active process
        // in-place on the output buffers.
        if (inputL != outputL) std::memcpy(outputL, inputL, numSamples * sizeof(float));
        if (inputR != outputR) std::memcpy(outputR, inputR, numSamples * sizeof(float));

        if (delayActive_) {
            // TapeDelay reads from `ins`, writes to `outs`.
            tapedelay_.process(ins, outs, numSamples);
            // For the next stage, input comes from the stage we just wrote.
            ins[0] = outputL;
            ins[1] = outputR;
        }
        if (springsActive_) {
            springs_.process(ins, outs, numSamples);
        }
    }

    void setParameter(int paramId, float value) override {
        if (paramId < 0 || paramId >= PARAM_COUNT) return;
        value = clamp(value, PARAM_MINS[paramId], PARAM_MAXS[paramId]);
        params_[paramId] = value;
        applyParam(paramId, DEFAULT_BLOCK_SIZE);
    }

    float getParameter(int paramId) const override {
        return (paramId >= 0 && paramId < PARAM_COUNT) ? params_[paramId] : 0.f;
    }

    int getParameterCount() const override { return PARAM_COUNT; }
    const char* getParameterName(int paramId) const override {
        return (paramId >= 0 && paramId < PARAM_COUNT) ? PARAM_NAMES[paramId] : "";
    }
    float getParameterMin(int paramId) const override {
        return (paramId >= 0 && paramId < PARAM_COUNT) ? PARAM_MINS[paramId] : 0.f;
    }
    float getParameterMax(int paramId) const override {
        return (paramId >= 0 && paramId < PARAM_COUNT) ? PARAM_MAXS[paramId] : 1.f;
    }
    float getParameterDefault(int paramId) const override {
        return (paramId >= 0 && paramId < PARAM_COUNT) ? PARAM_DEFAULTS[paramId] : 0.f;
    }

#ifdef __EMSCRIPTEN__
    // ── RMS stack accessors for the overlay WebGL2 springs shader ─────────
    //
    // Springs::getRMSStack() returns a raw pointer into internal memory. We
    // expose (1) the stack size in mtype units (4 springs per frame) and
    // (2) a copy-into-JS-buffer helper. The JS side allocates a Float32Array
    // and calls getRMSFrame() every frame to refresh the shader uniform.

    int getRMSFrameCount() const {
        return static_cast<int>(processors::Springs::kRmsStackSize);
    }

    // Copy `count` frames into the provided Float32Array-backed buffer. Each
    // frame is 4 floats (one per spring). `dstPtr` is a uintptr_t of the WASM
    // heap offset; Embind doesn't support uintptr_t directly so unsigned int
    // is used in the wrapper below.
    void copyRMSFrames(unsigned int dstPtrBits, int maxFrames) {
        if (maxFrames <= 0) return;
        auto* dst = reinterpret_cast<float*>(static_cast<uintptr_t>(dstPtrBits));
        const auto* src = springs_.getRMSStack();
        if (!src) { std::memset(dst, 0, sizeof(float) * 4 * maxFrames); return; }
        const int count = std::min(maxFrames, getRMSFrameCount());
        std::memcpy(dst, src, sizeof(float) * 4 * count);
    }

    int getRMSStackPos() const {
        // Springs::getRMSStackPos() returns a pointer to a size_t; dereference
        // to get the current write position so the shader can roll through
        // the circular buffer in chronological order.
        const auto* p = springs_.getRMSStackPos();
        return p ? static_cast<int>(*p) : 0;
    }
#endif

private:
    processors::TapeDelay tapedelay_;
    processors::Springs   springs_;

    bool delayActive_{true};
    bool springsActive_{true};

    float params_[PARAM_COUNT]{};

    void applyParam(int id, int blockSize) {
        switch (id) {
        case PARAM_DELAY_ACTIVE:
            delayActive_ = params_[id] > 0.5f;
            break;
        case PARAM_DELAY_DRYWET:
            tapedelay_.setDryWet(params_[id], blockSize);
            break;
        case PARAM_DELAY_SECONDS:
            tapedelay_.setDelay(delaySeconds(params_[id]), blockSize);
            break;
        case PARAM_DELAY_FEEDBACK:
            tapedelay_.setFeedback(params_[id], blockSize);
            break;
        case PARAM_DELAY_CUT_LOW:
            tapedelay_.setCutHiPass(delayCutLowHz(params_[id]), blockSize);
            break;
        case PARAM_DELAY_CUT_HI:
            tapedelay_.setCutLowPass(delayCutHiHz(params_[id]), blockSize);
            break;
        case PARAM_DELAY_SATURATION:
            tapedelay_.setSaturation(params_[id], blockSize);
            break;
        case PARAM_DELAY_DRIFT:
            tapedelay_.setDrift(params_[id], blockSize);
            break;
        case PARAM_DELAY_MODE: {
            // Quantize to 0/1/2.
            const int m = static_cast<int>(params_[id] * 2.999f);
            tapedelay_.setMode(
                static_cast<processors::TapeDelay::Mode>(m), blockSize);
            break;
        }
        case PARAM_SPRINGS_ACTIVE:
            springsActive_ = params_[id] > 0.5f;
            break;
        case PARAM_SPRINGS_DRYWET:
            springs_.setDryWet(params_[id], blockSize);
            break;
        case PARAM_SPRINGS_WIDTH:
            springs_.setWidth(params_[id], blockSize);
            break;
        case PARAM_SPRINGS_LENGTH:
            springs_.setTd(springsLengthSec(params_[id]), blockSize);
            break;
        case PARAM_SPRINGS_DECAY:
            springs_.setT60(springsDecaySec(params_[id]), blockSize);
            break;
        case PARAM_SPRINGS_DAMP:
            springs_.setFreq(springsDampHz(params_[id]), blockSize);
            break;
        case PARAM_SPRINGS_SHAPE:
            springs_.setRes(springsShape(params_[id]), blockSize);
            break;
        case PARAM_SPRINGS_TONE:
            springs_.setTone(springsToneHz(params_[id]), blockSize);
            break;
        case PARAM_SPRINGS_SCATTER:
            springs_.setScatter(params_[id], blockSize);
            break;
        case PARAM_SPRINGS_CHAOS:
            springs_.setChaos(params_[id], blockSize);
            break;
        default:
            break;
        }
    }

    void applyAll(int blockSize) {
        for (int i = 0; i < PARAM_COUNT; ++i) applyParam(i, blockSize);
    }
};

// ─── Embind export ─────────────────────────────────────────────────────────

#ifdef __EMSCRIPTEN__

// We re-declare the base-class binding so the derived class can use
// emscripten::base<WASMEffectBase>. The macro expands to TWO bindings blocks
// (base + derived) because each EMSCRIPTEN_BINDINGS block must be unique
// per translation unit.
REGISTER_WASM_EFFECT_BASE()

EMSCRIPTEN_BINDINGS(AelapseEffect_bindings) {
    emscripten::class_<AelapseEffect, emscripten::base<WASMEffectBase>>("AelapseEffect")
        .constructor<>()
        .function("getRMSFrameCount", &AelapseEffect::getRMSFrameCount)
        .function("getRMSStackPos",   &AelapseEffect::getRMSStackPos)
        .function("copyRMSFrames",    &AelapseEffect::copyRMSFrames);
}

#endif

} // namespace devilbox
