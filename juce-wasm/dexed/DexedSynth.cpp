/**
 * DexedSynth.cpp - DX7 FM Synthesizer for WebAssembly
 * Wraps the msfa engine from music-synthesizer-for-android
 *
 * This provides a full 6-operator FM synthesis engine compatible
 * with original DX7 patches via SysEx.
 *
 * License: Apache 2.0 (msfa engine) + GPL-3.0 (Dexed wrapper)
 */

#include "../common/WASMSynthBase.h"
#include "../common/WASMExports.h"

// msfa headers
#include "msfa/synth.h"
#include "msfa/freqlut.h"
#include "msfa/sin.h"
#include "msfa/exp2.h"
#include "msfa/env.h"
#include "msfa/pitchenv.h"
#include "msfa/dx7note.h"
#include "msfa/lfo.h"
#include "msfa/controllers.h"
#include "msfa/tuning.h"

// EngineMkI for FM rendering
#include "EngineMkI.h"

#include <vector>
#include <array>
#include <cstring>
#include <memory>
#include <cmath>

#ifdef __EMSCRIPTEN__
#include <emscripten/bind.h>
#include <emscripten/val.h>
#endif

namespace devilbox {

// Constants
static constexpr int MAX_VOICES = 16;
static constexpr int BLOCK_SIZE = 64;  // N from synth.h

/**
 * Default DX7 "INIT VOICE" patch data (156 bytes)
 * Standard DX7 initialized voice
 */
static const uint8_t INIT_VOICE[156] = {
    // Op 6 (carriers first in DX7 format)
    99, 99, 99, 99, 99, 99, 99, 0, 0, 0, 0, 0, 0, 0, 0, 99, 0, 1, 0, 7,
    // Op 5
    99, 99, 99, 99, 99, 99, 99, 0, 0, 0, 0, 0, 0, 0, 0, 99, 0, 1, 0, 7,
    // Op 4
    99, 99, 99, 99, 99, 99, 99, 0, 0, 0, 0, 0, 0, 0, 0, 99, 0, 1, 0, 7,
    // Op 3
    99, 99, 99, 99, 99, 99, 99, 0, 0, 0, 0, 0, 0, 0, 0, 99, 0, 1, 0, 7,
    // Op 2
    99, 99, 99, 99, 99, 99, 99, 0, 0, 0, 0, 0, 0, 0, 0, 99, 0, 1, 0, 7,
    // Op 1
    99, 99, 99, 99, 99, 99, 99, 0, 0, 0, 0, 0, 0, 0, 0, 99, 0, 1, 0, 7,
    // Pitch EG: rates, levels
    99, 99, 99, 99, 50, 50, 50, 50,
    // Algorithm, feedback, osc sync
    0, 0, 1,
    // LFO: speed, delay, PMD, AMD, sync, wave, PMS
    35, 0, 0, 0, 0, 0, 0,
    // Transpose (24 = C3)
    24,
    // Voice name (10 chars) - optional, not used in synthesis
    'I', 'N', 'I', 'T', ' ', 'V', 'O', 'I', 'C', 'E'
};

/**
 * Voice structure for polyphonic handling
 */
struct DexedVoice {
    std::unique_ptr<Dx7Note> note;
    int midiNote = -1;
    bool active = false;
    bool sustained = false;
    uint32_t age = 0;  // Use uint32 to prevent overflow (wraps safely)
};

/**
 * DexedSynth - DX7 FM Synthesizer (WASM)
 */
class DexedSynth {
public:
    DexedSynth()
        : sampleRate_(48000)
        , isInitialized_(false)
        , sustainPedal_(false)
    {
        // Initialize with default patch
        std::memcpy(currentPatch_, INIT_VOICE, 156);
    }

    void initialize(int sampleRate) {
        sampleRate_ = sampleRate;

        // Initialize lookup tables
        Freqlut::init(sampleRate);
        Sin::init();
        Exp2::init();
        Tanh::init();
        Env::init_sr(sampleRate);
        PitchEnv::init(sampleRate);
        Lfo::init(sampleRate);

        // Initialize tuning state (standard 12-TET)
        tuningState_ = createStandardTuning();

        // Initialize engine
        engine_ = std::make_unique<EngineMkI>();

        // Initialize controllers
        controllers_.core = engine_.get();
        controllers_.refresh();

        // Initialize LFO
        lfo_.reset(currentPatch_ + 137);  // LFO params start at byte 137

        // Initialize voices
        for (int i = 0; i < MAX_VOICES; i++) {
            voices_[i].note = std::make_unique<Dx7Note>(tuningState_, nullptr);
            voices_[i].active = false;
            voices_[i].midiNote = -1;
        }

        isInitialized_ = true;
    }

    bool isInitialized() const { return isInitialized_; }
    int getSampleRate() const { return sampleRate_; }

    void noteOn(int midiNote, int velocity) {
        if (!isInitialized_ || velocity == 0) {
            noteOff(midiNote);
            return;
        }

        // Find a free voice or steal the oldest
        int voiceIdx = findFreeVoice(midiNote);
        if (voiceIdx < 0) return;

        DexedVoice& voice = voices_[voiceIdx];

        // Initialize the note
        voice.note->init(currentPatch_, midiNote, velocity, 0, &controllers_);
        voice.midiNote = midiNote;
        voice.active = true;
        voice.sustained = false;
        voice.age = 0;
    }

    void noteOff(int midiNote) {
        for (int i = 0; i < MAX_VOICES; i++) {
            if (voices_[i].active && voices_[i].midiNote == midiNote) {
                if (sustainPedal_) {
                    voices_[i].sustained = true;
                } else {
                    voices_[i].note->keyup();
                }
            }
        }
    }

    void allNotesOff() {
        for (int i = 0; i < MAX_VOICES; i++) {
            if (voices_[i].active) {
                voices_[i].note->keyup();
            }
        }
    }

    void setParameter(int paramId, float value) {
        if (paramId >= 0 && paramId < 156) {
            currentPatch_[paramId] = static_cast<uint8_t>(
                std::max(0.0f, std::min(99.0f, value))
            );

            // Update LFO if LFO params changed
            if (paramId >= 137 && paramId <= 143) {
                lfo_.reset(currentPatch_ + 137);
            }

            // Update active voices
            for (int i = 0; i < MAX_VOICES; i++) {
                if (voices_[i].active) {
                    voices_[i].note->update(currentPatch_,
                        voices_[i].midiNote, 100, 0);
                }
            }
        }
    }

    float getParameter(int paramId) const {
        if (paramId >= 0 && paramId < 156) {
            return static_cast<float>(currentPatch_[paramId]);
        }
        return 0.0f;
    }

    void controlChange(int cc, int value) {
        switch (cc) {
            case 1:  // Mod wheel
                controllers_.modwheel_cc = value;
                controllers_.refresh();
                break;
            case 2:  // Breath
                controllers_.breath_cc = value;
                controllers_.refresh();
                break;
            case 4:  // Foot
                controllers_.foot_cc = value;
                controllers_.refresh();
                break;
            case 64: // Sustain pedal
                sustainPedal_ = value >= 64;
                if (!sustainPedal_) {
                    // Release sustained notes
                    for (int i = 0; i < MAX_VOICES; i++) {
                        if (voices_[i].sustained) {
                            voices_[i].note->keyup();
                            voices_[i].sustained = false;
                        }
                    }
                }
                break;
            case 123: // All notes off
                allNotesOff();
                break;
        }
    }

    void pitchBend(int value) {
        // 14-bit value, 8192 = center
        controllers_.values_[kControllerPitch] = value;
    }

    void programChange(int program) {
        // Would load preset from bank - not implemented
    }

    // Maximum buffer size to prevent overflow (128 samples is AudioWorklet default)
    static constexpr int MAX_OUTPUT_SAMPLES = 1024;

    // Main audio processing
    void process(float* outputL, float* outputR, int numSamples) {
        // Validate inputs
        if (!outputL || !outputR || numSamples <= 0) {
            return;
        }

        // Clamp to max buffer size to prevent overflow
        if (numSamples > MAX_OUTPUT_SAMPLES) {
            numSamples = MAX_OUTPUT_SAMPLES;
        }

        if (!isInitialized_) {
            std::memset(outputL, 0, numSamples * sizeof(float));
            std::memset(outputR, 0, numSamples * sizeof(float));
            return;
        }

        // Process in blocks of BLOCK_SIZE (N)
        int samplesProcessed = 0;

        while (samplesProcessed < numSamples) {
            int blockSize = std::min(BLOCK_SIZE, numSamples - samplesProcessed);

            // Clear output buffer
            std::memset(audioBuf_, 0, sizeof(audioBuf_));

            // Get LFO value for this block
            lfo_.keydown();
            int32_t lfoValue = lfo_.getsample();
            int32_t lfoDelay = lfo_.getdelay();

            // Render all active voices
            for (int v = 0; v < MAX_VOICES; v++) {
                if (voices_[v].active) {
                    voices_[v].note->compute(audioBuf_, lfoValue, lfoDelay, &controllers_);
                    voices_[v].age++;

                    // Check if voice finished
                    if (!voices_[v].note->isPlaying()) {
                        voices_[v].active = false;
                        voices_[v].midiNote = -1;
                    }
                }
            }

            // Convert from int32 to float and copy to output
            // msfa uses Q24 format internally
            const float scale = 1.0f / (1 << 24);

            for (int i = 0; i < blockSize; i++) {
                float sample = audioBuf_[i] * scale;

                // Soft clip
                if (sample > 1.0f) sample = 1.0f;
                if (sample < -1.0f) sample = -1.0f;

                outputL[samplesProcessed + i] = sample;
                outputR[samplesProcessed + i] = sample;
            }

            samplesProcessed += blockSize;
        }
    }

    // JavaScript-friendly process method
    void processJS(uintptr_t outputLPtr, uintptr_t outputRPtr, int numSamples) {
        float* outputL = reinterpret_cast<float*>(outputLPtr);
        float* outputR = reinterpret_cast<float*>(outputRPtr);
        process(outputL, outputR, numSamples);
    }

    // Load SysEx patch data
    void loadSysEx(const std::vector<uint8_t>& data) {
        if (data.size() >= 156) {
            std::memcpy(currentPatch_, data.data(), 156);
            lfo_.reset(currentPatch_ + 137);

            // Update active voices
            for (int i = 0; i < MAX_VOICES; i++) {
                if (voices_[i].active) {
                    voices_[i].note->update(currentPatch_,
                        voices_[i].midiNote, 100, 0);
                }
            }
        }
    }

#ifdef __EMSCRIPTEN__
    void loadSysExJS(emscripten::val jsArray) {
        std::vector<uint8_t> data = emscripten::convertJSArrayToNumberVector<uint8_t>(jsArray);
        loadSysEx(data);
    }
#endif

private:
    int sampleRate_;
    bool isInitialized_;
    bool sustainPedal_;

    uint8_t currentPatch_[156];
    int32_t audioBuf_[BLOCK_SIZE];

    std::shared_ptr<TuningState> tuningState_;
    std::unique_ptr<EngineMkI> engine_;
    Controllers controllers_;
    Lfo lfo_;

    std::array<DexedVoice, MAX_VOICES> voices_;

    int findFreeVoice(int midiNote) {
        // First check if note is already playing (retrigger)
        for (int i = 0; i < MAX_VOICES; i++) {
            if (voices_[i].active && voices_[i].midiNote == midiNote) {
                return i;
            }
        }

        // Find inactive voice
        for (int i = 0; i < MAX_VOICES; i++) {
            if (!voices_[i].active) {
                return i;
            }
        }

        // Voice stealing - find oldest voice
        int oldest = 0;
        int maxAge = 0;
        for (int i = 0; i < MAX_VOICES; i++) {
            if (voices_[i].age > maxAge) {
                maxAge = voices_[i].age;
                oldest = i;
            }
        }

        return oldest;
    }
};

} // namespace devilbox

// Emscripten bindings
#ifdef __EMSCRIPTEN__
EMSCRIPTEN_BINDINGS(DexedSynth_bindings) {
    emscripten::class_<devilbox::DexedSynth>("DexedSynth")
        .constructor<>()
        .function("initialize", &devilbox::DexedSynth::initialize)
        .function("isInitialized", &devilbox::DexedSynth::isInitialized)
        .function("getSampleRate", &devilbox::DexedSynth::getSampleRate)
        .function("noteOn", &devilbox::DexedSynth::noteOn)
        .function("noteOff", &devilbox::DexedSynth::noteOff)
        .function("allNotesOff", &devilbox::DexedSynth::allNotesOff)
        .function("setParameter", &devilbox::DexedSynth::setParameter)
        .function("getParameter", &devilbox::DexedSynth::getParameter)
        .function("controlChange", &devilbox::DexedSynth::controlChange)
        .function("pitchBend", &devilbox::DexedSynth::pitchBend)
        .function("programChange", &devilbox::DexedSynth::programChange)
        .function("loadSysEx", &devilbox::DexedSynth::loadSysExJS)
        .function("process", &devilbox::DexedSynth::processJS);
}
#endif
