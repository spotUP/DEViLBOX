/**
 * RdPianoSynth.cpp - Roland SA-synthesis Digital Piano WASM Wrapper
 *
 * Wraps librdpiano (by Giulio Zausa) for Emscripten/WebAssembly.
 * Provides cycle-accurate emulation of MKS-20 and MK-80 digital pianos.
 *
 * Processing chain (matching the JUCE plugin exactly):
 *   MCU generate_next_sample() → SpaceD chorus → Phaser → resample → tremolo → midEQ
 */

#include <cmath>
#include <cstring>
#include <cstdlib>
#include <vector>
#include <algorithm>

#include "mcu.h"
#include "spaced.h"
#include "phaser.h"
#include "libresample.h"

#include <emscripten/bind.h>

// ============================================================================
// Biquad Peak Filter (replaces JUCE's dsp::IIR for midEQ)
// Audio EQ Cookbook: peakingEQ
// ============================================================================
class BiquadPeakFilter {
public:
    void prepare(float sampleRate, float freq, float Q, float gainDB) {
        float A = std::pow(10.0f, gainDB / 40.0f);
        float w0 = 2.0f * 3.14159265358979323846f * freq / sampleRate;
        float sinW0 = std::sin(w0);
        float cosW0 = std::cos(w0);
        float alpha = sinW0 / (2.0f * Q);

        float b0 = 1.0f + alpha * A;
        float b1 = -2.0f * cosW0;
        float b2 = 1.0f - alpha * A;
        float a0 = 1.0f + alpha / A;
        float a1 = -2.0f * cosW0;
        float a2 = 1.0f - alpha / A;

        b0_ = b0 / a0;
        b1_ = b1 / a0;
        b2_ = b2 / a0;
        a1_ = a1 / a0;
        a2_ = a2 / a0;

        x1L_ = x2L_ = y1L_ = y2L_ = 0.0f;
        x1R_ = x2R_ = y1R_ = y2R_ = 0.0f;
    }

    void processStereo(float* L, float* R, int n) {
        for (int i = 0; i < n; i++) {
            float xL = L[i];
            float yL = b0_ * xL + b1_ * x1L_ + b2_ * x2L_ - a1_ * y1L_ - a2_ * y2L_;
            x2L_ = x1L_; x1L_ = xL;
            y2L_ = y1L_; y1L_ = yL;
            L[i] = yL;

            float xR = R[i];
            float yR = b0_ * xR + b1_ * x1R_ + b2_ * x2R_ - a1_ * y1R_ - a2_ * y2R_;
            x2R_ = x1R_; x1R_ = xR;
            y2R_ = y1R_; y1R_ = yR;
            R[i] = yR;
        }
    }

private:
    float b0_ = 1, b1_ = 0, b2_ = 0, a1_ = 0, a2_ = 0;
    float x1L_ = 0, x2L_ = 0, y1L_ = 0, y2L_ = 0;
    float x1R_ = 0, x2R_ = 0, y1R_ = 0, y2R_ = 0;
};

// ============================================================================
// Patch definitions (from PluginProcessor.cpp)
// ============================================================================
struct PatchDef {
    int romSet;        // 0=MKS20A, 1=MKS20B, 2=MK80
    size_t offset;
    int sampleRate;
    const char* name;
};

static const PatchDef PATCHES[16] = {
    // MKS-20
    { 0, 0x000000, 20000, "MKS-20: Piano 1" },
    { 0, 0x008000, 20000, "MKS-20: Piano 2" },
    { 0, 0x010000, 20000, "MKS-20: Piano 3" },
    { 1, 0x018000, 32000, "MKS-20: Harpsichord" },
    { 1, 0x003c20, 32000, "MKS-20: Clavi" },
    { 1, 0x00ab50, 20000, "MKS-20: Vibraphone" },
    { 1, 0x014260, 20000, "MKS-20: E-Piano 1" },
    { 1, 0x01bef0, 32000, "MKS-20: E-Piano 2" },
    // MK-80
    { 2, 0x000020, 20000, "MK-80: Classic" },
    { 2, 0x008000, 20000, "MK-80: Special" },
    { 2, 0x010000, 20000, "MK-80: Blend" },
    { 2, 0x018000, 32000, "MK-80: Contemporary" },
    { 2, 0x002c00, 20000, "MK-80: A. Piano 1" },
    { 2, 0x00b1f0, 20000, "MK-80: A. Piano 2" },
    { 2, 0x012910, 32000, "MK-80: Clavi" },
    { 2, 0x0199f0, 20000, "MK-80: Vibraphone" },
};

// Chorus rate-to-period lookup (from PluginProcessor.cpp)
static const int chorusRateToMsPeriod[15] = {
    2700, 1380, 910, 680, 540, 450, 385, 335, 300, 265, 245, 220, 205, 190, 175
};
static const int chorusRateToDepthChange[15] = {
    11200, 5600, 3700, 2700, 2200, 1800, 1520, 1360, 1200, 1040, 960, 880, 800, 720, 680
};

// ============================================================================
// Parameter IDs
// ============================================================================
enum ParamId {
    PARAM_CHORUS_ENABLED = 0,
    PARAM_CHORUS_RATE = 1,
    PARAM_CHORUS_DEPTH = 2,
    PARAM_EFX_ENABLED = 3,
    PARAM_PHASER_RATE = 4,
    PARAM_PHASER_DEPTH = 5,
    PARAM_TREMOLO_ENABLED = 6,
    PARAM_TREMOLO_RATE = 7,
    PARAM_TREMOLO_DEPTH = 8,
    PARAM_VOLUME = 9,
};

// ============================================================================
// Main synth class
// ============================================================================
class RdPianoSynth {
public:
    RdPianoSynth() = default;
    ~RdPianoSynth() {
        cleanup();
    }

    void initialize(int sampleRate) {
        hostSampleRate_ = sampleRate;

        // Allocate emu buffers (generous size: up to 20000 internal samples)
        emuBufferSize_ = 20000;
        emuBufferL_ = new float[emuBufferSize_];
        emuBufferR_ = new float[emuBufferSize_];

        // Allocate resampled buffers (for host output)
        resampledSize_ = 8192;
        resampledL_ = new float[resampledSize_];
        resampledR_ = new float[resampledSize_];

        // Initialize midEQ (350Hz, Q=0.2, +8dB peak)
        midEQ_.prepare((float)sampleRate, 350.0f, 0.2f, 8.0f);
    }

    // Load the program ROM (RD200_B.bin, ~8KB)
    void loadProgramROM(uintptr_t dataPtr, int length) {
        const uint8_t* data = reinterpret_cast<const uint8_t*>(dataPtr);
        progRom_.assign(data, data + length);
    }

    // Load a ROM set (4 files: ic5, ic6, ic7, ic18)
    void loadROMSet(int setIndex,
                    uintptr_t ic5Ptr, int ic5Len,
                    uintptr_t ic6Ptr, int ic6Len,
                    uintptr_t ic7Ptr, int ic7Len,
                    uintptr_t ic18Ptr, int ic18Len) {
        if (setIndex < 0 || setIndex > 2) return;

        auto copyRom = [](std::vector<uint8_t>& dest, uintptr_t ptr, int len) {
            const uint8_t* data = reinterpret_cast<const uint8_t*>(ptr);
            dest.assign(data, data + len);
        };

        copyRom(romSets_[setIndex].ic5, ic5Ptr, ic5Len);
        copyRom(romSets_[setIndex].ic6, ic6Ptr, ic6Len);
        copyRom(romSets_[setIndex].ic7, ic7Ptr, ic7Len);
        copyRom(romSets_[setIndex].ic18, ic18Ptr, ic18Len);
        romSetsLoaded_[setIndex] = true;
    }

    // Create MCU instance and run handshake
    bool initMCU() {
        if (progRom_.empty()) return false;
        if (!romSetsLoaded_[0] && !romSetsLoaded_[1] && !romSetsLoaded_[2]) return false;

        // Find first loaded ROM set for initial construction
        int initSet = 0;
        for (int i = 0; i < 3; i++) {
            if (romSetsLoaded_[i]) { initSet = i; break; }
        }

        // Create MCU with initial ROM set
        if (mcu_) delete mcu_;
        mcu_ = new Mcu(
            romSets_[initSet].ic5.data(),
            romSets_[initSet].ic6.data(),
            romSets_[initSet].ic7.data(),
            progRom_.data(),
            romSets_[initSet].ic18.data()
        );

        // Create effects
        if (spaceD_) delete spaceD_;
        spaceD_ = new SpaceD();
        spaceD_->reset();

        if (phaser_) delete phaser_;
        phaser_ = new Phaser();
        phaser_->reset();

        // MCU handshake (from PluginProcessor.cpp mcuReset)
        mcu_->reset();
        mcu_->commands_queue.push(0x30);
        mcu_->commands_queue.push(0xE0);
        mcu_->commands_queue.push(0x00); // tuneMsb = 0 (no detune)
        mcu_->commands_queue.push(0x00); // tuneLsb = 0
        for (int cycle = 0; cycle < 1024; cycle++) {
            mcu_->generate_next_sample();
        }
        mcu_->commands_queue.push(0x31);
        mcu_->commands_queue.push(0x30);

        // Select default patch
        currentPatch_ = 0;
        sourceSampleRate_ = PATCHES[0].sampleRate;

        // Load sounds for initial patch
        const PatchDef& patch = PATCHES[0];
        int rs = patch.romSet;
        if (romSetsLoaded_[rs]) {
            mcu_->loadSounds(
                romSets_[rs].ic5.data(),
                romSets_[rs].ic6.data(),
                romSets_[rs].ic7.data(),
                romSets_[rs].ic18.data(),
                patch.offset
            );
            mcu_->commands_queue.push(0x31);
            mcu_->commands_queue.push(0x30);
        }

        // Initialize resamplers
        initResamplers();

        mcuReady_ = true;
        return true;
    }

    void selectPatch(int index) {
        if (index < 0 || index >= 16 || !mcu_ || !mcuReady_) return;

        const PatchDef& patch = PATCHES[index];
        int rs = patch.romSet;
        if (!romSetsLoaded_[rs]) return;

        mcu_->loadSounds(
            romSets_[rs].ic5.data(),
            romSets_[rs].ic6.data(),
            romSets_[rs].ic7.data(),
            romSets_[rs].ic18.data(),
            patch.offset
        );

        currentPatch_ = index;
        mcu_->commands_queue.push(0x31);
        mcu_->commands_queue.push(0x30);

        // Update source sample rate and reinit resamplers
        sourceSampleRate_ = patch.sampleRate;
        initResamplers();
    }

    void noteOn(int note, int velocity) {
        if (!mcu_ || !mcuReady_) return;
        note = std::clamp(note, 0, 127);
        velocity = std::clamp(velocity, 0, 127);
        mcu_->sendMidiCmd(0x90, (u8)note, (u8)velocity);
    }

    void noteOff(int note) {
        if (!mcu_ || !mcuReady_) return;
        note = std::clamp(note, 0, 127);
        mcu_->sendMidiCmd(0x80, (u8)note, 0);
    }

    void allNotesOff() {
        if (!mcu_ || !mcuReady_) return;
        mcu_->sendMidiCmd(0xB0, 123, 0);
    }

    void controlChange(int cc, int value) {
        if (!mcu_ || !mcuReady_) return;
        cc = std::clamp(cc, 0, 127);
        value = std::clamp(value, 0, 127);
        mcu_->sendMidiCmd(0xB0, (u8)cc, (u8)value);
    }

    void pitchBend(int value) {
        if (!mcu_ || !mcuReady_) return;
        value = std::clamp(value, 0, 16383);
        u8 lsb = value & 0x7F;
        u8 msb = (value >> 7) & 0x7F;
        mcu_->sendMidiCmd(0xE0, lsb, msb);
    }

    void setParameter(int id, float value) {
        switch (id) {
            case PARAM_CHORUS_ENABLED:
                chorusEnabled_ = value >= 0.5f;
                break;
            case PARAM_CHORUS_RATE:
                chorusRate_ = std::clamp((int)value, 0, 14);
                break;
            case PARAM_CHORUS_DEPTH:
                chorusDepth_ = std::clamp((int)value, 0, 14);
                break;
            case PARAM_EFX_ENABLED:
                efxEnabled_ = value >= 0.5f;
                break;
            case PARAM_PHASER_RATE:
                phaserRate_ = std::clamp(value, 0.0f, 1.0f);
                break;
            case PARAM_PHASER_DEPTH:
                phaserDepth_ = std::clamp(value, 0.0f, 1.0f);
                break;
            case PARAM_TREMOLO_ENABLED:
                tremoloEnabled_ = value >= 0.5f;
                break;
            case PARAM_TREMOLO_RATE:
                tremoloRate_ = std::clamp((int)value, 0, 14);
                break;
            case PARAM_TREMOLO_DEPTH:
                tremoloDepth_ = std::clamp((int)value, 0, 14);
                break;
            case PARAM_VOLUME:
                volume_ = std::clamp(value, 0.0f, 1.0f);
                break;
        }
    }

    float getParameter(int id) const {
        switch (id) {
            case PARAM_CHORUS_ENABLED: return chorusEnabled_ ? 1.0f : 0.0f;
            case PARAM_CHORUS_RATE: return (float)chorusRate_;
            case PARAM_CHORUS_DEPTH: return (float)chorusDepth_;
            case PARAM_EFX_ENABLED: return efxEnabled_ ? 1.0f : 0.0f;
            case PARAM_PHASER_RATE: return phaserRate_;
            case PARAM_PHASER_DEPTH: return phaserDepth_;
            case PARAM_TREMOLO_ENABLED: return tremoloEnabled_ ? 1.0f : 0.0f;
            case PARAM_TREMOLO_RATE: return (float)tremoloRate_;
            case PARAM_TREMOLO_DEPTH: return (float)tremoloDepth_;
            case PARAM_VOLUME: return volume_;
            default: return 0.0f;
        }
    }

    // Main processing: generate numSamples at host sample rate
    void processJS(uintptr_t outLPtr, uintptr_t outRPtr, int numSamples) {
        float* outL = reinterpret_cast<float*>(outLPtr);
        float* outR = reinterpret_cast<float*>(outRPtr);

        if (!mcu_ || !mcuReady_ || numSamples <= 0) {
            std::memset(outL, 0, numSamples * sizeof(float));
            std::memset(outR, 0, numSamples * sizeof(float));
            return;
        }

        // Calculate internal render buffer size with drift correction
        double renderBufferFramesFloat =
            (double)numSamples / (double)hostSampleRate_ * (double)sourceSampleRate_;
        unsigned int renderBufferFrames = (unsigned int)std::ceil(renderBufferFramesFloat);
        double currentError = renderBufferFrames - renderBufferFramesFloat;

        int limit = numSamples / 4;
        if (limit < 1) limit = 1;
        if (samplesError_ > limit && renderBufferFrames > (unsigned int)limit) {
            renderBufferFrames -= limit;
            currentError -= limit;
        } else if (-samplesError_ > limit) {
            renderBufferFrames += limit;
            currentError += limit;
        }

        if (renderBufferFrames < 2) {
            std::memset(outL, 0, numSamples * sizeof(float));
            std::memset(outR, 0, numSamples * sizeof(float));
            return;
        }
        if (renderBufferFrames > (unsigned int)emuBufferSize_) {
            renderBufferFrames = emuBufferSize_;
        }

        // Clear emu buffers
        std::memset(emuBufferL_, 0, renderBufferFrames * sizeof(float));
        std::memset(emuBufferR_, 0, renderBufferFrames * sizeof(float));

        bool mode32khz = sourceSampleRate_ == 32000;

        // Update SpaceD parameters
        if (spaceD_) {
            spaceD_->rate = spaceDRateFromMs(1000.0f / chorusRateToMsPeriod[chorusRate_] / 4.0f);
            spaceD_->depth = spaceDDepth((float)chorusDepth_ / 15.0f);
        }

        // Update Phaser parameters
        if (phaser_) {
            extern int32_t phaserRateTable[];
            extern int32_t phaserDepthTable[];
            phaser_->rate = phaserRateTable[(int)std::floor(phaserRate_ * 0x7f)];
            phaser_->depth = phaserDepthTable[(int)std::floor(phaserDepth_ * 0x7f)];
        }

        // Generate internal samples
        for (unsigned int i = 0; i < renderBufferFrames; i++) {
            int32_t sample = mcu_->generate_next_sample(mode32khz);

            // SpaceD BBD chorus
            if (spaceD_) {
                spaceD_->audioInL = sample << 5;
                spaceD_->audioInR = sample << 5;
                if (chorusEnabled_) {
                    spaceD_->process();
                } else {
                    spaceD_->audioOutL = spaceD_->audioInL;
                    spaceD_->audioOutR = spaceD_->audioInR;
                }
                spaceD_->audioOutL >>= 6;
                spaceD_->audioOutR >>= 6;

                int32_t finalL = spaceD_->audioOutL;
                int32_t finalR = spaceD_->audioOutR;

                // Phaser (if EFX enabled)
                if (efxEnabled_ && phaser_) {
                    phaser_->audioInL = finalL << 5;
                    phaser_->audioInR = finalR << 5;
                    phaser_->process();
                    finalL = phaser_->audioOutL >> 6;
                    finalR = phaser_->audioOutR >> 6;
                }

                emuBufferL_[i] = (float)finalL / 65536.0f * volume_;
                emuBufferR_[i] = (float)finalR / 65536.0f * volume_;
            } else {
                emuBufferL_[i] = (float)sample / 65536.0f * volume_;
                emuBufferR_[i] = (float)sample / 65536.0f * volume_;
            }
        }

        // Resample from source rate to host rate
        double ratio = (double)hostSampleRate_ / (double)sourceSampleRate_;

        // Check if resamplers need reinit (rate changed)
        if (savedSourceRate_ != sourceSampleRate_ || savedDestRate_ != hostSampleRate_) {
            initResamplers();
        }

        int inUsed = 0;
        int outCount = 0;

        if (resampleL_ && resampleR_) {
            outCount = resample_process(resampleL_, ratio, emuBufferL_,
                                        renderBufferFrames, 0, &inUsed,
                                        resampledL_, numSamples);
            resample_process(resampleR_, ratio, emuBufferR_,
                             renderBufferFrames, 0, &inUsed,
                             resampledR_, numSamples);
        }

        samplesError_ += currentError;
        if (inUsed == 0) {
            samplesError_ = 0;
        }

        // Clear output first
        std::memset(outL, 0, numSamples * sizeof(float));
        std::memset(outR, 0, numSamples * sizeof(float));

        // Copy resampled data with scaling (0.5f matches JUCE plugin)
        const float scaling = 0.5f;
        int copyCount = std::min(outCount, numSamples);
        for (int i = 0; i < copyCount; i++) {
            outL[i] = resampledL_[i] * scaling;
            outR[i] = resampledR_[i] * scaling;
        }

        // Apply tremolo at host rate (stereo, L and R 180 degrees apart)
        if (tremoloEnabled_) {
            float rate = (float)tremoloRate_;
            float depth = (float)tremoloDepth_ / 14.0f;
            double destRate = (double)hostSampleRate_;
            for (int i = 0; i < numSamples; i++) {
                float tremoloL = 0.5f + 0.5f * std::sin(rate * 3.14159265359 * tremoloPhase_ / destRate);
                float tremoloR = 0.5f + 0.5f * std::sin(3.14159265359 + rate * 3.14159265359 * tremoloPhase_ / destRate);
                outL[i] *= (1.0f - depth) + (tremoloL * depth);
                outR[i] *= (1.0f - depth) + (tremoloR * depth);
                tremoloPhase_ = (tremoloPhase_ + 1) & 0xFFFFFFFF;
            }
        }

        // Apply midEQ (350Hz, Q=0.2, +8dB peak)
        midEQ_.processStereo(outL, outR, numSamples);
    }

    int getNumPatches() const { return 16; }
    int getCurrentPatch() const { return currentPatch_; }
    std::string getPatchName(int index) const {
        if (index < 0 || index >= 16) return "";
        return std::string(PATCHES[index].name);
    }
    bool isROMSetLoaded(int setIndex) const {
        if (setIndex < 0 || setIndex > 2) return false;
        return romSetsLoaded_[setIndex];
    }
    bool isReady() const { return mcuReady_; }

private:
    void cleanup() {
        if (mcu_) { delete mcu_; mcu_ = nullptr; }
        if (spaceD_) { delete spaceD_; spaceD_ = nullptr; }
        if (phaser_) { delete phaser_; phaser_ = nullptr; }
        if (resampleL_) { resample_close(resampleL_); resampleL_ = nullptr; }
        if (resampleR_) { resample_close(resampleR_); resampleR_ = nullptr; }
        if (emuBufferL_) { delete[] emuBufferL_; emuBufferL_ = nullptr; }
        if (emuBufferR_) { delete[] emuBufferR_; emuBufferR_ = nullptr; }
        if (resampledL_) { delete[] resampledL_; resampledL_ = nullptr; }
        if (resampledR_) { delete[] resampledR_; resampledR_ = nullptr; }
    }

    void initResamplers() {
        if (resampleL_) { resample_close(resampleL_); resampleL_ = nullptr; }
        if (resampleR_) { resample_close(resampleR_); resampleR_ = nullptr; }

        double ratio = (double)hostSampleRate_ / (double)sourceSampleRate_;
        resampleL_ = resample_open(1, ratio, ratio);
        resampleR_ = resample_open(1, ratio, ratio);

        savedSourceRate_ = sourceSampleRate_;
        savedDestRate_ = hostSampleRate_;
    }

    // MCU instance
    Mcu* mcu_ = nullptr;
    bool mcuReady_ = false;

    // Effects
    SpaceD* spaceD_ = nullptr;
    Phaser* phaser_ = nullptr;
    BiquadPeakFilter midEQ_;

    // Resampling
    void* resampleL_ = nullptr;
    void* resampleR_ = nullptr;
    int savedSourceRate_ = 0;
    int savedDestRate_ = 0;
    double samplesError_ = 0.0;

    // Buffers
    float* emuBufferL_ = nullptr;
    float* emuBufferR_ = nullptr;
    int emuBufferSize_ = 0;
    float* resampledL_ = nullptr;
    float* resampledR_ = nullptr;
    int resampledSize_ = 0;

    // ROM storage
    std::vector<uint8_t> progRom_;
    struct RomSetData {
        std::vector<uint8_t> ic5;
        std::vector<uint8_t> ic6;
        std::vector<uint8_t> ic7;
        std::vector<uint8_t> ic18;
    };
    RomSetData romSets_[3];
    bool romSetsLoaded_[3] = {false, false, false};

    // State
    int hostSampleRate_ = 48000;
    int sourceSampleRate_ = 20000;
    int currentPatch_ = 0;

    // Parameters
    bool chorusEnabled_ = true;
    int chorusRate_ = 5;
    int chorusDepth_ = 14;
    bool efxEnabled_ = false;
    float phaserRate_ = 0.4f;
    float phaserDepth_ = 0.8f;
    bool tremoloEnabled_ = false;
    int tremoloRate_ = 6;
    int tremoloDepth_ = 6;
    float volume_ = 1.0f;
    uint32_t tremoloPhase_ = 0;
};

// ============================================================================
// Emscripten bindings
// ============================================================================
EMSCRIPTEN_BINDINGS(rdpiano) {
    emscripten::class_<RdPianoSynth>("RdPianoSynth")
        .constructor<>()
        .function("initialize", &RdPianoSynth::initialize)
        .function("loadProgramROM", &RdPianoSynth::loadProgramROM)
        .function("loadROMSet", &RdPianoSynth::loadROMSet)
        .function("initMCU", &RdPianoSynth::initMCU)
        .function("selectPatch", &RdPianoSynth::selectPatch)
        .function("noteOn", &RdPianoSynth::noteOn)
        .function("noteOff", &RdPianoSynth::noteOff)
        .function("allNotesOff", &RdPianoSynth::allNotesOff)
        .function("controlChange", &RdPianoSynth::controlChange)
        .function("pitchBend", &RdPianoSynth::pitchBend)
        .function("setParameter", &RdPianoSynth::setParameter)
        .function("getParameter", &RdPianoSynth::getParameter)
        .function("processJS", &RdPianoSynth::processJS)
        .function("getNumPatches", &RdPianoSynth::getNumPatches)
        .function("getCurrentPatch", &RdPianoSynth::getCurrentPatch)
        .function("getPatchName", &RdPianoSynth::getPatchName)
        .function("isROMSetLoaded", &RdPianoSynth::isROMSetLoaded)
        .function("isReady", &RdPianoSynth::isReady);
}
