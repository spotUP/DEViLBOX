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

// JUCE NormalisableRange with skew factor — matches JUCE's convertFrom0to1.
// skew < 1 = more resolution at low end (frequencies).
inline float juceSkew(float x, float a, float b, float skew) {
    return a + (b - a) * std::pow(x, skew);
}

// ── Converters: 0..1 → native units matching createLayout() exactly ──
//
// Each function maps the DEViLBOX store's normalized 0..1 value to the
// same native-unit value that aelapse's processBlock() receives from
// the JUCE parameter system. The processBlock code then does its own
// conversion (e.g., /100 for percentages) before calling DSP setters.

// delay_seconds: NormalisableRange{0.01, 5.0, 0.001, 0.5}
inline float delaySeconds(float x) { return juceSkew(x, 0.01f, 5.0f, 0.5f); }

// delay_feedback: NormalisableRange{0, 120, 0.1}  → /100 in processBlock
inline float delayFeedback(float x) { return lerp(x, 0.f, 120.f); }

// delay_cutoff_low: NormalisableRange{100, 20000, 1, 0.5}
// NOTE: processBlock passes this directly to setCutHiPass (swapped names in aelapse!)
inline float delayCutLow(float x) { return juceSkew(x, 100.f, 20000.f, 0.5f); }

// delay_cutoff_hi: NormalisableRange{20, 3000, 1, 0.5}
// NOTE: processBlock passes this directly to setCutLowPass (swapped!)
inline float delayCutHi(float x) { return juceSkew(x, 20.f, 3000.f, 0.5f); }

// delay_saturation: range -40..15 (linear)
inline float delaySaturation(float x) { return lerp(x, -40.f, 15.f); }

// delay_drift: NormalisableRange{0, 100, 0.1} → /100 in processBlock
inline float delayDrift(float x) { return lerp(x, 0.f, 100.f); }

// springs_drywet: NormalisableRange{0, 100, 0.1} → /100 in processBlock
inline float springsDryWet(float x) { return lerp(x, 0.f, 100.f); }

// springs_width: NormalisableRange{0, 100, 0.1} → /100 in processBlock
inline float springsWidth(float x) { return lerp(x, 0.f, 100.f); }

// springs_length: NormalisableRange{0.02, 0.2, 0.001, 0.6} → direct to setTd
inline float springsLength(float x) { return juceSkew(x, 0.02f, 0.2f, 0.6f); }

// springs_decay: NormalisableRange{0.3, 10, 0.001, 0.6} → direct to setT60
inline float springsDecay(float x) { return juceSkew(x, 0.3f, 10.f, 0.6f); }

// springs_damp: NormalisableRange{200, 12000, 1, 0.5} → direct to setFreq
inline float springsDamp(float x) { return juceSkew(x, 200.f, 12000.f, 0.5f); }

// springs_shape: NormalisableRange{-5, 5, 0.01, 0.3, true} → direct to setRes
inline float springsShape(float x) { return juceSkew(x, -5.f, 5.f, 0.3f); }

// springs_tone: 0..1 (direct) → direct to setTone
inline float springsTone(float x) { return x; }

// springs_scatter: NormalisableRange{0, 120, 0.1} → /100 in processBlock
inline float springsScatter(float x) { return lerp(x, 0.f, 120.f); }

// springs_chaos: NormalisableRange{0, 100, 0.1} → /100 in processBlock
inline float springsChaos(float x) { return lerp(x, 0.f, 100.f); }

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

    // applyParam: converts 0..1 normalized → native units → DSP setter.
    // The conversion chain mirrors PluginProcessorArch.cpp::processBlock()
    // exactly: first map 0..1 to the JUCE NormalisableRange value, then
    // apply the same /100 or direct-pass the original code uses.
    void applyParam(int id, int blockSize) {
        const float v = params_[id]; // 0..1 normalized
        switch (id) {
        case PARAM_DELAY_ACTIVE:
            delayActive_ = v > 0.5f;
            break;
        case PARAM_DELAY_DRYWET:
            // JUCE range 0..100 → processBlock: /100
            tapedelay_.setDryWet(v, blockSize); // v is already 0..1
            break;
        case PARAM_DELAY_SECONDS:
            // JUCE range 0.01..5.0 skew 0.5 → processBlock: direct to setDelay
            tapedelay_.setDelay(delaySeconds(v), blockSize);
            break;
        case PARAM_DELAY_FEEDBACK:
            // JUCE range 0..120 → processBlock: /100 → 0..1.2
            tapedelay_.setFeedback(delayFeedback(v) / 100.f, blockSize);
            break;
        case PARAM_DELAY_CUT_LOW:
            // JUCE range 100..20000 Hz skew 0.5 → processBlock: direct to setCutHiPass
            // (yes, "cut_low" controls the highpass in the original — swapped names)
            tapedelay_.setCutHiPass(delayCutLow(v), blockSize);
            break;
        case PARAM_DELAY_CUT_HI:
            // JUCE range 20..3000 Hz skew 0.5 → processBlock: direct to setCutLowPass
            tapedelay_.setCutLowPass(delayCutHi(v), blockSize);
            break;
        case PARAM_DELAY_SATURATION:
            // JUCE range -40..15 → processBlock: direct to setSaturation
            tapedelay_.setSaturation(delaySaturation(v), blockSize);
            break;
        case PARAM_DELAY_DRIFT:
            // JUCE range 0..100 → processBlock: /100
            tapedelay_.setDrift(delayDrift(v) / 100.f, blockSize);
            break;
        case PARAM_DELAY_MODE: {
            // 0..1 → 0/1/2 (Normal/BackForth/Reverse)
            const int m = static_cast<int>(v * 2.999f);
            tapedelay_.setMode(
                static_cast<processors::TapeDelay::Mode>(m), blockSize);
            break;
        }
        case PARAM_SPRINGS_ACTIVE:
            springsActive_ = v > 0.5f;
            break;
        case PARAM_SPRINGS_DRYWET:
            // JUCE range 0..100 → processBlock: /100
            springs_.setDryWet(springsDryWet(v) / 100.f, blockSize);
            break;
        case PARAM_SPRINGS_WIDTH:
            // JUCE range 0..100 → processBlock: /100
            springs_.setWidth(springsWidth(v) / 100.f, blockSize);
            break;
        case PARAM_SPRINGS_LENGTH:
            // JUCE range 0.02..0.2 skew 0.6 → processBlock: direct to setTd
            springs_.setTd(springsLength(v), blockSize);
            break;
        case PARAM_SPRINGS_DECAY:
            // JUCE range 0.3..10 skew 0.6 → processBlock: direct to setT60
            springs_.setT60(springsDecay(v), blockSize);
            break;
        case PARAM_SPRINGS_DAMP:
            // JUCE range 200..12000 Hz skew 0.5 → processBlock: direct to setFreq
            springs_.setFreq(springsDamp(v), blockSize);
            break;
        case PARAM_SPRINGS_SHAPE:
            // JUCE range -5..5 skew 0.3 → processBlock: direct to setRes
            springs_.setRes(springsShape(v), blockSize);
            break;
        case PARAM_SPRINGS_TONE:
            // JUCE range 0..1 → processBlock: direct to setTone
            springs_.setTone(springsTone(v), blockSize);
            break;
        case PARAM_SPRINGS_SCATTER:
            // JUCE range 0..120 → processBlock: /100
            springs_.setScatter(springsScatter(v) / 100.f, blockSize);
            break;
        case PARAM_SPRINGS_CHAOS:
            // JUCE range 0..100 → processBlock: /100
            springs_.setChaos(springsChaos(v) / 100.f, blockSize);
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
