/**
 * WASMEffectBase.h - Common base class for WASM audio effects
 * Unlike WASMSynthBase (which generates audio), this processes input->output.
 */
#pragma once

#include <cstdint>
#include <cmath>
#include <cstring>

#ifdef __EMSCRIPTEN__
#include <emscripten/bind.h>
#include <emscripten/val.h>
#endif

namespace devilbox {

/**
 * Base class for all WASM audio effects
 * Provides common interface for AudioWorklet effect processing
 */
class WASMEffectBase {
public:
    static constexpr int DEFAULT_SAMPLE_RATE = 48000;
    static constexpr int DEFAULT_BLOCK_SIZE = 128;

    WASMEffectBase() : sampleRate_(DEFAULT_SAMPLE_RATE), isInitialized_(false) {}
    virtual ~WASMEffectBase() = default;

    // Initialization
    virtual void initialize(int sampleRate) {
        sampleRate_ = sampleRate;
        isInitialized_ = true;
    }

    bool isInitialized() const { return isInitialized_; }
    int getSampleRate() const { return sampleRate_; }

    // Audio processing (input -> output)
    virtual void process(float* inputL, float* inputR,
                        float* outputL, float* outputR, int numSamples) = 0;

    // Parameter control
    virtual void setParameter(int paramId, float value) = 0;
    virtual float getParameter(int paramId) const = 0;

    // Parameter metadata
    virtual int getParameterCount() const { return 0; }
    virtual const char* getParameterName(int paramId) const { return ""; }
    virtual float getParameterMin(int paramId) const { return 0.0f; }
    virtual float getParameterMax(int paramId) const { return 1.0f; }
    virtual float getParameterDefault(int paramId) const { return 0.0f; }

#ifdef __EMSCRIPTEN__
    // JS-callable wrapper for process (uses unsigned int for Embind compatibility)
    void processJS(unsigned int inLPtr, unsigned int inRPtr,
                   unsigned int outLPtr, unsigned int outRPtr, int numSamples) {
        float* inputL = reinterpret_cast<float*>(static_cast<uintptr_t>(inLPtr));
        float* inputR = reinterpret_cast<float*>(static_cast<uintptr_t>(inRPtr));
        float* outputL = reinterpret_cast<float*>(static_cast<uintptr_t>(outLPtr));
        float* outputR = reinterpret_cast<float*>(static_cast<uintptr_t>(outRPtr));
        process(inputL, inputR, outputL, outputR, numSamples);
    }

    std::string getParameterNameJS(int paramId) const {
        return std::string(getParameterName(paramId));
    }
#endif

protected:
    int sampleRate_;
    bool isInitialized_;

    static float clamp(float value, float min, float max) {
        return value < min ? min : (value > max ? max : value);
    }
};

// Register the base class once per WASM module (each effect is its own module).
// The base binding provides process(), isInitialized(), getSampleRate(), getParameterName().
// Virtual methods (setParameter, getParameter, etc.) are dispatched via vtable so
// calling them on a derived instance invokes the override.
#define REGISTER_WASM_EFFECT_BASE() \
    EMSCRIPTEN_BINDINGS(WASMEffectBase_bindings) { \
        emscripten::class_<WASMEffectBase>("WASMEffectBase") \
            .function("initialize", &WASMEffectBase::initialize) \
            .function("isInitialized", &WASMEffectBase::isInitialized) \
            .function("getSampleRate", &WASMEffectBase::getSampleRate) \
            .function("setParameter", &WASMEffectBase::setParameter) \
            .function("getParameter", &WASMEffectBase::getParameter) \
            .function("getParameterCount", &WASMEffectBase::getParameterCount) \
            .function("getParameterName", &WASMEffectBase::getParameterNameJS) \
            .function("getParameterMin", &WASMEffectBase::getParameterMin) \
            .function("getParameterMax", &WASMEffectBase::getParameterMax) \
            .function("getParameterDefault", &WASMEffectBase::getParameterDefault) \
            .function("process", &WASMEffectBase::processJS); \
    }

// Macro to export a derived effect class with base class relationship
#define EXPORT_WASM_EFFECT(ClassName) \
    REGISTER_WASM_EFFECT_BASE() \
    EMSCRIPTEN_BINDINGS(ClassName##_bindings) { \
        emscripten::class_<ClassName, emscripten::base<WASMEffectBase>>(#ClassName) \
            .constructor<>(); \
    }

} // namespace devilbox
