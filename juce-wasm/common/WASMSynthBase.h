/**
 * WASMSynthBase.h - Common base class for WASM synthesizers
 * Provides a standardized interface for AudioWorklet communication
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
 * Base class for all WASM synthesizers
 * Provides common interface for AudioWorklet communication
 */
class WASMSynthBase {
public:
    static constexpr int DEFAULT_SAMPLE_RATE = 48000;
    static constexpr int DEFAULT_BLOCK_SIZE = 128;

    WASMSynthBase() : sampleRate_(DEFAULT_SAMPLE_RATE), isInitialized_(false) {}
    virtual ~WASMSynthBase() = default;

    // Initialization
    virtual void initialize(int sampleRate) {
        sampleRate_ = sampleRate;
        isInitialized_ = true;
    }

    bool isInitialized() const { return isInitialized_; }
    int getSampleRate() const { return sampleRate_; }

    // Note control
    virtual void noteOn(int midiNote, int velocity) = 0;
    virtual void noteOff(int midiNote) = 0;
    virtual void allNotesOff() = 0;

    // Audio processing
    virtual void process(float* outputL, float* outputR, int numSamples) = 0;

    // Parameter control
    virtual void setParameter(int paramId, float value) = 0;
    virtual float getParameter(int paramId) const = 0;

    // MIDI CC
    virtual void controlChange(int cc, int value) {
        // Default implementation - override in subclasses
    }

    // Pitch bend (14-bit value, 8192 = center)
    virtual void pitchBend(int value) {
        // Default implementation - override in subclasses
    }

    // Program change / preset loading
    virtual void programChange(int program) {
        // Default implementation - override in subclasses
    }

    // SysEx data (for DX7 patches, etc.)
    virtual void sysEx(const uint8_t* data, int length) {
        // Default implementation - override in subclasses
    }

    // --- Parameter metadata (for auto-generated UIs) ---
    virtual int getParameterCount() const { return 0; }
    virtual const char* getParameterName(int paramId) const { return ""; }
    virtual float getParameterMin(int paramId) const { return 0.0f; }
    virtual float getParameterMax(int paramId) const { return 1.0f; }
    virtual float getParameterDefault(int paramId) const { return 0.0f; }

    // Extension hook — synths can handle arbitrary typed commands
    // (SysEx loading, wavetable data, patch formats, etc.)
    // Returns true if handled, false if unknown command
    virtual bool handleCommand(const char* commandType, const uint8_t* data, int length) {
        return false;
    }

#ifdef __EMSCRIPTEN__
    // JS-callable wrapper for handleCommand (accepts emscripten::val)
    bool handleCommandJS(const std::string& commandType, emscripten::val jsData) {
        auto length = jsData["length"].as<int>();
        std::vector<uint8_t> buf(length);
        for (int i = 0; i < length; i++) {
            buf[i] = jsData[i].as<uint8_t>();
        }
        return handleCommand(commandType.c_str(), buf.data(), length);
    }

    // JS-callable wrapper for getParameterName (returns std::string)
    std::string getParameterNameJS(int paramId) const {
        return std::string(getParameterName(paramId));
    }
#endif

protected:
    int sampleRate_;
    bool isInitialized_;

    // Utility functions
    static float midiNoteToFrequency(int midiNote) {
        return 440.0f * std::pow(2.0f, (midiNote - 69) / 12.0f);
    }

    static float velocityToGain(int velocity) {
        return velocity / 127.0f;
    }

    static float clamp(float value, float min, float max) {
        return value < min ? min : (value > max ? max : value);
    }
};

/**
 * Voice structure for polyphonic synths
 */
struct Voice {
    int midiNote = -1;
    float frequency = 0.0f;
    float velocity = 0.0f;
    float phase = 0.0f;
    bool active = false;
    bool releasing = false;
    int age = 0;  // For voice stealing
};

/**
 * ADSR envelope generator
 */
class ADSREnvelope {
public:
    enum class Stage { Idle, Attack, Decay, Sustain, Release };

    void setAttack(float seconds) { attack_ = seconds; }
    void setDecay(float seconds) { decay_ = seconds; }
    void setSustain(float level) { sustain_ = level; }
    void setRelease(float seconds) { release_ = seconds; }
    void setSampleRate(int sampleRate) { sampleRate_ = sampleRate; }

    void noteOn() {
        stage_ = Stage::Attack;
        level_ = 0.0f;
    }

    void noteOff() {
        if (stage_ != Stage::Idle) {
            stage_ = Stage::Release;
            releaseLevel_ = level_;
        }
    }

    float process() {
        float delta;

        switch (stage_) {
            case Stage::Attack:
                delta = 1.0f / (attack_ * sampleRate_ + 1);
                level_ += delta;
                if (level_ >= 1.0f) {
                    level_ = 1.0f;
                    stage_ = Stage::Decay;
                }
                break;

            case Stage::Decay:
                delta = (1.0f - sustain_) / (decay_ * sampleRate_ + 1);
                level_ -= delta;
                if (level_ <= sustain_) {
                    level_ = sustain_;
                    stage_ = Stage::Sustain;
                }
                break;

            case Stage::Sustain:
                level_ = sustain_;
                break;

            case Stage::Release:
                delta = releaseLevel_ / (release_ * sampleRate_ + 1);
                level_ -= delta;
                if (level_ <= 0.0f) {
                    level_ = 0.0f;
                    stage_ = Stage::Idle;
                }
                break;

            case Stage::Idle:
            default:
                level_ = 0.0f;
                break;
        }

        return level_;
    }

    bool isActive() const { return stage_ != Stage::Idle; }
    Stage getStage() const { return stage_; }

private:
    Stage stage_ = Stage::Idle;
    float level_ = 0.0f;
    float releaseLevel_ = 0.0f;
    float attack_ = 0.01f;
    float decay_ = 0.1f;
    float sustain_ = 0.7f;
    float release_ = 0.3f;
    int sampleRate_ = 48000;
};

} // namespace devilbox
