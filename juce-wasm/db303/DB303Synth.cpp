/**
 * DB303Synth.cpp - Roland TB-303 Synthesizer for WebAssembly (db303 variant)
 * Based on the Open303 project by Robin Schmidt (rosic) with additional tweaks
 *
 * This provides authentic TB-303 bass synthesis with:
 * - Saw/Square waveform blend
 * - Resonant lowpass filter (TeeBee filter)
 * - Accent and slide
 * - Proper envelope behavior
 *
 * License: MIT (Open303 license) + GPLv3 (JC-303 license)
 */

#include "rosic_Open303.h"

#include <cstring>
#include <algorithm>
#include <cmath>

#ifdef __EMSCRIPTEN__
#include <emscripten/bind.h>
#include <emscripten/val.h>
#endif

namespace devilbox {

/**
 * DB303 Parameter IDs
 */
enum class DB303Param {
    // Main parameters (0-9)
    WAVEFORM = 0,       // 0-1 (saw to square)
    TUNING = 1,         // Hz (default 440)
    CUTOFF = 2,         // Hz (filter cutoff)
    RESONANCE = 3,      // 0-100%
    ENV_MOD = 4,        // 0-100%
    DECAY = 5,          // ms
    ACCENT = 6,         // 0-100%
    VOLUME = 7,         // dB

    // Extended parameters (10-19)
    AMP_SUSTAIN = 10,   // dB
    SLIDE_TIME = 11,    // ms
    NORMAL_ATTACK = 12, // ms
    ACCENT_ATTACK = 13, // ms
    ACCENT_DECAY = 14,  // ms
    AMP_DECAY = 15,     // ms
    AMP_RELEASE = 16,   // ms

    // Filter tuning (20-29)
    PRE_FILTER_HP = 20,   // Hz
    FEEDBACK_HP = 21,     // Hz
    POST_FILTER_HP = 22,  // Hz
    SQUARE_PHASE = 23,    // degrees

    // Internal/advanced (30+)
    TANH_DRIVE = 30,
    TANH_OFFSET = 31,

    PARAM_COUNT = 32
};

/**
 * DB303Synth - TB-303 Bass Synthesizer (WASM)
 */
class DB303Synth {
public:
    DB303Synth()
        : sampleRate_(48000)
        , isInitialized_(false)
        , currentNote_(-1)
        , pitchBend_(0.0)
    {
    }

    void initialize(int sampleRate) {
        sampleRate_ = sampleRate;
        synth_.setSampleRate(static_cast<double>(sampleRate));

        // Use Open303's hardware-calibrated defaults (from rosic_Open303.cpp constructor)
        synth_.setWaveform(0.0);          // Saw wave
        synth_.setTuning(440.0);          // A4 = 440 Hz
        synth_.setCutoff(1000.0);         // Filter cutoff (hardware default)
        synth_.setResonance(50.0);        // Resonance
        synth_.setEnvMod(25.0);           // Env mod (hardware default)
        synth_.setDecay(1000.0);          // Normal decay (hardware default)
        synth_.setAccent(0.0);            // Accent off (hardware default)
        synth_.setVolume(-12.0);          // -12 dB (hardware default)

        // VCA envelope: Use rosic's hardware-calibrated defaults from the constructor
        // (ampEnv.setDecay(1230), normalAmpRelease=1.0, accentAmpRelease=50.0)
        // These were carefully tuned by Robin Schmidt from TB-303 circuit analysis.

        isInitialized_ = true;
    }

    bool isInitialized() const { return isInitialized_; }
    int getSampleRate() const { return sampleRate_; }

    void noteOn(int midiNote, int velocity) {
        if (!isInitialized_) return;

        if (velocity == 0) {
            noteOff(midiNote);
            return;
        }

        // Open303 uses detune parameter (0 for now)
        synth_.noteOn(midiNote, velocity, 0.0);
        currentNote_ = midiNote;
    }

    void noteOff(int midiNote) {
        if (!isInitialized_) return;

        // Note off is velocity 0
        synth_.noteOn(midiNote, 0, 0.0);
        if (currentNote_ == midiNote) {
            currentNote_ = -1;
        }
    }

    void allNotesOff() {
        if (!isInitialized_) return;
        synth_.allNotesOff();
        currentNote_ = -1;
    }

    void setParameter(int paramId, float value) {
        if (!isInitialized_) return;

        switch (static_cast<DB303Param>(paramId)) {
            case DB303Param::WAVEFORM:
                synth_.setWaveform(std::clamp(static_cast<double>(value), 0.0, 1.0));
                break;
            case DB303Param::TUNING:
                synth_.setTuning(static_cast<double>(value));
                break;
            case DB303Param::CUTOFF:
                synth_.setCutoff(std::clamp(static_cast<double>(value), 20.0, 20000.0));
                break;
            case DB303Param::RESONANCE:
                synth_.setResonance(std::clamp(static_cast<double>(value), 0.0, 100.0));
                break;
            case DB303Param::ENV_MOD:
                synth_.setEnvMod(std::clamp(static_cast<double>(value), 0.0, 100.0));
                break;
            case DB303Param::DECAY:
                synth_.setDecay(std::clamp(static_cast<double>(value), 30.0, 3000.0));
                break;
            case DB303Param::ACCENT:
                synth_.setAccent(std::clamp(static_cast<double>(value), 0.0, 100.0));
                break;
            case DB303Param::VOLUME:
                synth_.setVolume(static_cast<double>(value));
                break;
            case DB303Param::AMP_SUSTAIN:
                synth_.setAmpSustain(static_cast<double>(value));
                break;
            case DB303Param::SLIDE_TIME:
                synth_.setSlideTime(std::clamp(static_cast<double>(value), 1.0, 500.0));
                break;
            case DB303Param::NORMAL_ATTACK:
                synth_.setNormalAttack(std::clamp(static_cast<double>(value), 0.3, 30.0));
                break;
            case DB303Param::ACCENT_ATTACK:
                synth_.setAccentAttack(std::clamp(static_cast<double>(value), 0.3, 30.0));
                break;
            case DB303Param::ACCENT_DECAY:
                synth_.setAccentDecay(std::clamp(static_cast<double>(value), 30.0, 3000.0));
                break;
            case DB303Param::AMP_DECAY:
                synth_.setAmpDecay(std::clamp(static_cast<double>(value), 16.0, 3000.0));
                break;
            case DB303Param::AMP_RELEASE:
                synth_.setAmpRelease(std::clamp(static_cast<double>(value), 1.0, 3000.0));
                break;
            case DB303Param::PRE_FILTER_HP:
                synth_.setPreFilterHighpass(static_cast<double>(value));
                break;
            case DB303Param::FEEDBACK_HP:
                synth_.setFeedbackHighpass(static_cast<double>(value));
                break;
            case DB303Param::POST_FILTER_HP:
                synth_.setPostFilterHighpass(static_cast<double>(value));
                break;
            case DB303Param::SQUARE_PHASE:
                synth_.setSquarePhaseShift(static_cast<double>(value));
                break;
            case DB303Param::TANH_DRIVE:
                synth_.setTanhShaperDrive(static_cast<double>(value));
                break;
            case DB303Param::TANH_OFFSET:
                synth_.setTanhShaperOffset(static_cast<double>(value));
                break;
            default:
                break;
        }
    }

    float getParameter(int paramId) const {
        switch (static_cast<DB303Param>(paramId)) {
            case DB303Param::WAVEFORM:
                return static_cast<float>(synth_.getWaveform());
            case DB303Param::TUNING:
                return static_cast<float>(synth_.getTuning());
            case DB303Param::CUTOFF:
                return static_cast<float>(synth_.getCutoff());
            case DB303Param::RESONANCE:
                return static_cast<float>(synth_.getResonance());
            case DB303Param::ENV_MOD:
                return static_cast<float>(synth_.getEnvMod());
            case DB303Param::DECAY:
                return static_cast<float>(synth_.getDecay());
            case DB303Param::ACCENT:
                return static_cast<float>(synth_.getAccent());
            case DB303Param::VOLUME:
                return static_cast<float>(synth_.getVolume());
            case DB303Param::AMP_SUSTAIN:
                return static_cast<float>(synth_.getAmpSustain());
            case DB303Param::SLIDE_TIME:
                return static_cast<float>(synth_.getSlideTime());
            case DB303Param::NORMAL_ATTACK:
                return static_cast<float>(synth_.getNormalAttack());
            case DB303Param::ACCENT_ATTACK:
                return static_cast<float>(synth_.getAccentAttack());
            case DB303Param::ACCENT_DECAY:
                return static_cast<float>(synth_.getAccentDecay());
            case DB303Param::AMP_DECAY:
                return static_cast<float>(synth_.getAmpDecay());
            case DB303Param::AMP_RELEASE:
                return static_cast<float>(synth_.getAmpRelease());
            case DB303Param::PRE_FILTER_HP:
                return static_cast<float>(synth_.getPreFilterHighpass());
            case DB303Param::FEEDBACK_HP:
                return static_cast<float>(synth_.getFeedbackHighpass());
            case DB303Param::POST_FILTER_HP:
                return static_cast<float>(synth_.getPostFilterHighpass());
            case DB303Param::SQUARE_PHASE:
                return static_cast<float>(synth_.getSquarePhaseShift());
            case DB303Param::TANH_DRIVE:
                return static_cast<float>(synth_.getTanhShaperDrive());
            case DB303Param::TANH_OFFSET:
                return static_cast<float>(synth_.getTanhShaperOffset());
            default:
                return 0.0f;
        }
    }

    void controlChange(int cc, int value) {
        if (!isInitialized_) return;

        // Map common CCs to 303 parameters
        switch (cc) {
            case 1:  // Mod wheel -> Cutoff
                synth_.setCutoff(100.0 + (value / 127.0) * 4900.0);
                break;
            case 71: // Resonance (filter resonance)
                synth_.setResonance((value / 127.0) * 100.0);
                break;
            case 74: // Brightness (filter cutoff)
                synth_.setCutoff(100.0 + (value / 127.0) * 4900.0);
                break;
            case 91: // Env mod depth
                synth_.setEnvMod((value / 127.0) * 100.0);
                break;
            case 123: // All notes off
                allNotesOff();
                break;
        }
    }

    void pitchBend(int value) {
        if (!isInitialized_) return;

        // Convert 14-bit value (0-16383) to semitones (-2 to +2)
        double semitones = ((value - 8192) / 8192.0) * 2.0;
        synth_.setPitchBend(semitones);
        pitchBend_ = semitones;
    }

    void programChange(int program) {
        // Could load preset patterns - not implemented
    }

    // Maximum buffer size to prevent overflow
    static constexpr int MAX_OUTPUT_SAMPLES = 1024;

    // Main audio processing
    void process(float* outputL, float* outputR, int numSamples) {
        // Validate inputs
        if (!outputL || !outputR || numSamples <= 0) {
            return;
        }

        // Clamp to max buffer size
        if (numSamples > MAX_OUTPUT_SAMPLES) {
            numSamples = MAX_OUTPUT_SAMPLES;
        }

        if (!isInitialized_) {
            std::memset(outputL, 0, numSamples * sizeof(float));
            std::memset(outputR, 0, numSamples * sizeof(float));
            return;
        }

        for (int i = 0; i < numSamples; i++) {
            double sample = synth_.getSample();
            outputL[i] = static_cast<float>(sample);
            outputR[i] = static_cast<float>(sample);
        }
    }

    // JavaScript-friendly process method
    void processJS(uintptr_t outputLPtr, uintptr_t outputRPtr, int numSamples) {
        float* outputL = reinterpret_cast<float*>(outputLPtr);
        float* outputR = reinterpret_cast<float*>(outputRPtr);
        process(outputL, outputR, numSamples);
    }

    // Set accent for next note (for sequencer integration)
    void setNextNoteAccent(bool accent) {
        // Accent is handled through velocity in noteOn
        // High velocity (127) = accent, normal velocity (100) = no accent
    }

    // Set slide for next note (for sequencer integration)
    void setNextNoteSlide(bool slide) {
        // Slide is handled automatically when notes overlap
    }

private:
    int sampleRate_;
    bool isInitialized_;
    int currentNote_;
    double pitchBend_;

    mutable rosic::Open303 synth_;
};

} // namespace devilbox

// Emscripten bindings
#ifdef __EMSCRIPTEN__
EMSCRIPTEN_BINDINGS(DB303Synth_bindings) {
    emscripten::class_<devilbox::DB303Synth>("DB303Synth")
        .constructor<>()
        .function("initialize", &devilbox::DB303Synth::initialize)
        .function("isInitialized", &devilbox::DB303Synth::isInitialized)
        .function("getSampleRate", &devilbox::DB303Synth::getSampleRate)
        .function("noteOn", &devilbox::DB303Synth::noteOn)
        .function("noteOff", &devilbox::DB303Synth::noteOff)
        .function("allNotesOff", &devilbox::DB303Synth::allNotesOff)
        .function("setParameter", &devilbox::DB303Synth::setParameter)
        .function("getParameter", &devilbox::DB303Synth::getParameter)
        .function("controlChange", &devilbox::DB303Synth::controlChange)
        .function("pitchBend", &devilbox::DB303Synth::pitchBend)
        .function("programChange", &devilbox::DB303Synth::programChange)
        .function("process", &devilbox::DB303Synth::processJS);
}
#endif
