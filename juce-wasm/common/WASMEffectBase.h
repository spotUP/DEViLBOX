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
    // JS-callable wrapper for process (accepts uintptr_t pointers)
    void processJS(uintptr_t inLPtr, uintptr_t inRPtr,
                   uintptr_t outLPtr, uintptr_t outRPtr, int numSamples) {
        float* inputL = reinterpret_cast<float*>(inLPtr);
        float* inputR = reinterpret_cast<float*>(inRPtr);
        float* outputL = reinterpret_cast<float*>(outLPtr);
        float* outputR = reinterpret_cast<float*>(outRPtr);
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

// Macro to export an effect class with standard interface
#define EXPORT_WASM_EFFECT(ClassName) \
    EMSCRIPTEN_BINDINGS(ClassName##_bindings) { \
        emscripten::class_<ClassName>(#ClassName) \
            .constructor<>() \
            .function("initialize", &ClassName::initialize) \
            .function("isInitialized", &ClassName::isInitialized) \
            .function("getSampleRate", &ClassName::getSampleRate) \
            .function("setParameter", &ClassName::setParameter) \
            .function("getParameter", &ClassName::getParameter) \
            .function("getParameterCount", &ClassName::getParameterCount) \
            .function("getParameterName", &ClassName::getParameterNameJS) \
            .function("getParameterMin", &ClassName::getParameterMin) \
            .function("getParameterMax", &ClassName::getParameterMax) \
            .function("getParameterDefault", &ClassName::getParameterDefault) \
            .function("process", &ClassName::processJS); \
    }

} // namespace devilbox
