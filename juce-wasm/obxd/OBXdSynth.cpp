/**
 * OBXdSynth.cpp - Oberheim OB-X Synthesizer for WebAssembly
 * Based on the discoDSP OB-Xd architecture
 *
 * This provides an 8-voice analog-modeled polyphonic synthesizer
 * emulating the classic Oberheim OB-X/OB-Xa sound.
 *
 * License: GPL-3.0 (original OB-Xd license)
 */

#include "WASMSynthBase.h"
#include "WASMExports.h"

#include <vector>
#include <array>
#include <cmath>
#include <cstring>
#include <algorithm>
#include <random>

#ifdef __EMSCRIPTEN__
#include <emscripten/bind.h>
#include <emscripten/val.h>
#endif

namespace devilbox {

/**
 * OB-Xd Parameter IDs
 */
enum class OBXdParam {
    // Oscillator 1
    OSC1_WAVEFORM = 0,    // 0=saw, 1=pulse, 2=tri, 3=noise
    OSC1_OCTAVE = 1,      // -2 to +2
    OSC1_DETUNE = 2,      // -1 to +1 semitones
    OSC1_PW = 3,          // 0-1 pulse width
    OSC1_LEVEL = 4,       // 0-1

    // Oscillator 2
    OSC2_WAVEFORM = 5,
    OSC2_OCTAVE = 6,
    OSC2_DETUNE = 7,
    OSC2_PW = 8,
    OSC2_LEVEL = 9,

    // Oscillator Mix
    OSC_MIX = 10,         // 0-1 (0=osc1, 1=osc2)
    OSC_SYNC = 11,        // 0-1
    OSC_XOR = 12,         // 0-1 (ring mod style)

    // Filter
    FILTER_CUTOFF = 13,   // 20-20000 Hz (stored as 0-1)
    FILTER_RESONANCE = 14,// 0-1
    FILTER_TYPE = 15,     // 0=LP24, 1=LP12, 2=HP, 3=BP, 4=Notch
    FILTER_ENV_AMOUNT = 16,
    FILTER_KEY_TRACK = 17,
    FILTER_VELOCITY = 18,

    // Filter Envelope
    FILTER_ATTACK = 19,
    FILTER_DECAY = 20,
    FILTER_SUSTAIN = 21,
    FILTER_RELEASE = 22,

    // Amp Envelope
    AMP_ATTACK = 23,
    AMP_DECAY = 24,
    AMP_SUSTAIN = 25,
    AMP_RELEASE = 26,

    // LFO
    LFO_RATE = 27,        // 0.1-20 Hz (stored as 0-1)
    LFO_WAVEFORM = 28,    // 0=sin, 1=tri, 2=saw, 3=square, 4=s&h
    LFO_DELAY = 29,       // 0-1
    LFO_OSC_AMOUNT = 30,
    LFO_FILTER_AMOUNT = 31,
    LFO_AMP_AMOUNT = 32,
    LFO_PW_AMOUNT = 33,

    // Global
    MASTER_VOLUME = 34,
    VOICES = 35,          // 1-8
    UNISON = 36,          // 0-1
    UNISON_DETUNE = 37,
    PORTAMENTO = 38,      // 0-1 time
    PAN_SPREAD = 39,      // 0-1
    VELOCITY_SENSITIVITY = 40,

    // Extended
    NOISE_LEVEL = 41,
    SUB_OSC_LEVEL = 42,
    SUB_OSC_OCTAVE = 43,  // -1 or -2
    DRIFT = 44,           // 0-1 analog drift

    PARAM_COUNT = 45
};

static constexpr int OBXD_COUNT = static_cast<int>(OBXdParam::PARAM_COUNT);

static const char* OBXD_PARAM_NAMES[OBXD_COUNT] = {
    "Osc1:Waveform", "Osc1:Octave", "Osc1:Detune", "Osc1:Pulse Width", "Osc1:Level",
    "Osc2:Waveform", "Osc2:Octave", "Osc2:Detune", "Osc2:Pulse Width", "Osc2:Level",
    "Osc:Mix", "Osc:Sync", "Osc:Ring Mod",
    "Filter:Cutoff", "Filter:Resonance", "Filter:Type", "Filter:Env Amount", "Filter:Key Track", "Filter:Velocity",
    "Filter Env:Attack", "Filter Env:Decay", "Filter Env:Sustain", "Filter Env:Release",
    "Amp Env:Attack", "Amp Env:Decay", "Amp Env:Sustain", "Amp Env:Release",
    "LFO:Rate", "LFO:Waveform", "LFO:Delay", "LFO:Osc Amount", "LFO:Filter Amount", "LFO:Amp Amount", "LFO:PW Amount",
    "Master:Volume", "Master:Voices", "Master:Unison", "Master:Unison Detune", "Master:Portamento", "Master:Pan Spread", "Master:Velocity Sens",
    "Osc:Noise Level", "Sub Osc:Level", "Sub Osc:Octave", "Osc:Drift"
};

static const float OBXD_PARAM_MINS[OBXD_COUNT] = {
    0, -2, -1, 0, 0,
    0, -2, -1, 0, 0,
    0, 0, 0,
    0, 0, 0, -1, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0,
    0, 1, 0, 0, 0, 0, 0,
    0, 0, -2, 0
};

static const float OBXD_PARAM_MAXS[OBXD_COUNT] = {
    3, 2, 1, 1, 1,
    3, 2, 1, 1, 1,
    1, 1, 1,
    1, 1, 4, 1, 1, 1,
    1, 1, 1, 1,
    1, 1, 1, 1,
    1, 4, 1, 1, 1, 1, 1,
    1, 8, 1, 1, 1, 1, 1,
    1, 1, -1, 1
};

static const float OBXD_PARAM_DEFAULTS[OBXD_COUNT] = {
    0, 0, 0, 0.5f, 1.0f,
    0, 0, 0.1f, 0.5f, 0.7f,
    0, 0, 0,
    0.7f, 0.3f, 0, 0.5f, 0, 0,
    0.01f, 0.3f, 0.3f, 0.3f,
    0.01f, 0.2f, 0.7f, 0.3f,
    0.2f, 0, 0, 0, 0, 0, 0,
    0.7f, 8, 0, 0, 0, 0.3f, 0.5f,
    0, 0, -1, 0
};

/**
 * Simple biquad filter for the Oberheim-style filter
 */
class BiquadFilter {
public:
    void reset() {
        z1_ = z2_ = 0.0f;
    }

    void setCoefficients(float b0, float b1, float b2, float a1, float a2) {
        b0_ = b0; b1_ = b1; b2_ = b2;
        a1_ = a1; a2_ = a2;
    }

    void setLowpass(float freq, float q, float sampleRate) {
        float omega = 2.0f * M_PI * freq / sampleRate;
        float sinOmega = std::sin(omega);
        float cosOmega = std::cos(omega);
        float alpha = sinOmega / (2.0f * q);

        float a0 = 1.0f + alpha;
        b0_ = ((1.0f - cosOmega) / 2.0f) / a0;
        b1_ = (1.0f - cosOmega) / a0;
        b2_ = b0_;
        a1_ = (-2.0f * cosOmega) / a0;
        a2_ = (1.0f - alpha) / a0;
    }

    void setHighpass(float freq, float q, float sampleRate) {
        float omega = 2.0f * M_PI * freq / sampleRate;
        float sinOmega = std::sin(omega);
        float cosOmega = std::cos(omega);
        float alpha = sinOmega / (2.0f * q);

        float a0 = 1.0f + alpha;
        b0_ = ((1.0f + cosOmega) / 2.0f) / a0;
        b1_ = -(1.0f + cosOmega) / a0;
        b2_ = b0_;
        a1_ = (-2.0f * cosOmega) / a0;
        a2_ = (1.0f - alpha) / a0;
    }

    float process(float input) {
        // Transposed Direct Form II - more numerically stable
        float output = b0_ * input + z1_;
        z1_ = b1_ * input - a1_ * output + z2_;
        z2_ = b2_ * input - a2_ * output;
        return output;
    }

private:
    float b0_ = 1, b1_ = 0, b2_ = 0, a1_ = 0, a2_ = 0;
    float z1_ = 0, z2_ = 0;
};

/**
 * ADSR Envelope with velocity sensitivity
 */
class OBXdEnvelope {
public:
    enum Stage { Idle, Attack, Decay, Sustain, Release };

    void setParameters(float attack, float decay, float sustain, float release) {
        attack_ = std::max(0.001f, attack);
        decay_ = std::max(0.001f, decay);
        sustain_ = sustain;
        release_ = std::max(0.001f, release);
    }

    void setSampleRate(float sr) { sampleRate_ = sr; }

    void noteOn(float velocity = 1.0f) {
        velocity_ = velocity;
        stage_ = Attack;
    }

    void noteOff() {
        if (stage_ != Idle) {
            releaseLevel_ = level_;
            stage_ = Release;
        }
    }

    float process() {
        switch (stage_) {
            case Attack: {
                float rate = 1.0f / (attack_ * sampleRate_);
                level_ += rate;
                if (level_ >= 1.0f) {
                    level_ = 1.0f;
                    stage_ = Decay;
                }
                break;
            }
            case Decay: {
                float rate = (1.0f - sustain_) / (decay_ * sampleRate_);
                level_ -= rate;
                if (level_ <= sustain_) {
                    level_ = sustain_;
                    stage_ = Sustain;
                }
                break;
            }
            case Sustain:
                level_ = sustain_;
                break;
            case Release: {
                float rate = releaseLevel_ / (release_ * sampleRate_);
                level_ -= rate;
                if (level_ <= 0.0f) {
                    level_ = 0.0f;
                    stage_ = Idle;
                }
                break;
            }
            case Idle:
            default:
                level_ = 0.0f;
        }
        return level_ * velocity_;
    }

    bool isActive() const { return stage_ != Idle; }
    Stage getStage() const { return stage_; }

private:
    Stage stage_ = Idle;
    float level_ = 0, releaseLevel_ = 0;
    float attack_ = 0.01f, decay_ = 0.1f, sustain_ = 0.7f, release_ = 0.3f;
    float velocity_ = 1.0f;
    float sampleRate_ = 48000;
};

/**
 * Simple LFO
 */
class OBXdLFO {
public:
    enum Waveform { Sine, Triangle, Saw, Square, SampleHold };

    void setRate(float hz) { rate_ = hz; }
    void setWaveform(Waveform w) { waveform_ = w; }
    void setSampleRate(float sr) { sampleRate_ = sr; }
    void reset() { phase_ = 0; shValue_ = 0; }

    float process() {
        float output = 0.0f;
        float increment = rate_ / sampleRate_;

        switch (waveform_) {
            case Sine:
                output = std::sin(phase_ * 2.0f * M_PI);
                break;
            case Triangle:
                output = 2.0f * std::abs(2.0f * (phase_ - std::floor(phase_ + 0.5f))) - 1.0f;
                break;
            case Saw:
                output = 2.0f * (phase_ - std::floor(phase_)) - 1.0f;
                break;
            case Square:
                output = phase_ < 0.5f ? 1.0f : -1.0f;
                break;
            case SampleHold:
                if (phase_ + increment >= 1.0f) {
                    shValue_ = (rand_.nextFloat() * 2.0f - 1.0f);
                }
                output = shValue_;
                break;
        }

        phase_ += increment;
        if (phase_ >= 1.0f) phase_ -= 1.0f;

        return output;
    }

private:
    Waveform waveform_ = Sine;
    float rate_ = 1.0f;
    float phase_ = 0.0f;
    float shValue_ = 0.0f;
    float sampleRate_ = 48000;

    struct SimpleRandom {
        uint32_t state = 12345;
        float nextFloat() {
            state = state * 1103515245 + 12345;
            return (state & 0x7FFFFFFF) / (float)0x7FFFFFFF;
        }
    } rand_;
};

/**
 * OB-Xd Voice
 */
class OBXdVoice {
public:
    bool active = false;
    bool releasing = false;
    int midiNote = -1;
    float velocity = 0;
    int age = 0;

    void noteOn(int note, float vel, float sampleRate) {
        midiNote = note;
        velocity = vel;
        active = true;
        releasing = false;
        age = 0;

        frequency_ = 440.0f * std::pow(2.0f, (note - 69) / 12.0f);
        osc1Phase_ = 0;
        osc2Phase_ = 0;

        ampEnv_.setSampleRate(sampleRate);
        filterEnv_.setSampleRate(sampleRate);
        ampEnv_.noteOn(vel);
        filterEnv_.noteOn(vel);

        filter1_.reset();
        filter2_.reset();
    }

    void noteOff() {
        releasing = true;
        ampEnv_.noteOff();
        filterEnv_.noteOff();
    }

    void setParameters(const std::array<float, static_cast<size_t>(OBXdParam::PARAM_COUNT)>& params) {
        // Store for processing
        params_ = params;

        // Set envelope parameters
        ampEnv_.setParameters(
            params[static_cast<int>(OBXdParam::AMP_ATTACK)] * 2.0f,
            params[static_cast<int>(OBXdParam::AMP_DECAY)] * 2.0f,
            params[static_cast<int>(OBXdParam::AMP_SUSTAIN)],
            params[static_cast<int>(OBXdParam::AMP_RELEASE)] * 3.0f
        );

        filterEnv_.setParameters(
            params[static_cast<int>(OBXdParam::FILTER_ATTACK)] * 2.0f,
            params[static_cast<int>(OBXdParam::FILTER_DECAY)] * 2.0f,
            params[static_cast<int>(OBXdParam::FILTER_SUSTAIN)],
            params[static_cast<int>(OBXdParam::FILTER_RELEASE)] * 3.0f
        );
    }

    float process(float lfoValue, float sampleRate) {
        if (!active) return 0.0f;

        // Get parameters
        float osc1Wave = params_[static_cast<int>(OBXdParam::OSC1_WAVEFORM)];
        float osc1Oct = params_[static_cast<int>(OBXdParam::OSC1_OCTAVE)];
        float osc1Detune = params_[static_cast<int>(OBXdParam::OSC1_DETUNE)];
        float osc1PW = params_[static_cast<int>(OBXdParam::OSC1_PW)];
        float osc1Level = params_[static_cast<int>(OBXdParam::OSC1_LEVEL)];

        float osc2Wave = params_[static_cast<int>(OBXdParam::OSC2_WAVEFORM)];
        float osc2Oct = params_[static_cast<int>(OBXdParam::OSC2_OCTAVE)];
        float osc2Detune = params_[static_cast<int>(OBXdParam::OSC2_DETUNE)];
        float osc2PW = params_[static_cast<int>(OBXdParam::OSC2_PW)];
        float osc2Level = params_[static_cast<int>(OBXdParam::OSC2_LEVEL)];

        float filterCutoff = params_[static_cast<int>(OBXdParam::FILTER_CUTOFF)];
        float filterRes = params_[static_cast<int>(OBXdParam::FILTER_RESONANCE)];
        float filterEnvAmt = params_[static_cast<int>(OBXdParam::FILTER_ENV_AMOUNT)];

        float lfoOscAmt = params_[static_cast<int>(OBXdParam::LFO_OSC_AMOUNT)];
        float lfoFilterAmt = params_[static_cast<int>(OBXdParam::LFO_FILTER_AMOUNT)];
        float lfoPWAmt = params_[static_cast<int>(OBXdParam::LFO_PW_AMOUNT)];

        // Calculate frequencies with LFO modulation
        float freq1 = frequency_ * std::pow(2.0f, osc1Oct + osc1Detune / 12.0f);
        float freq2 = frequency_ * std::pow(2.0f, osc2Oct + osc2Detune / 12.0f);

        freq1 *= std::pow(2.0f, lfoValue * lfoOscAmt);
        freq2 *= std::pow(2.0f, lfoValue * lfoOscAmt);

        // Calculate phase increments
        float inc1 = freq1 / sampleRate;
        float inc2 = freq2 / sampleRate;

        // Generate oscillators
        float pw1 = osc1PW + lfoValue * lfoPWAmt;
        float pw2 = osc2PW + lfoValue * lfoPWAmt;
        pw1 = std::clamp(pw1, 0.05f, 0.95f);
        pw2 = std::clamp(pw2, 0.05f, 0.95f);

        float osc1 = generateOscillator(osc1Phase_, osc1Wave, pw1);
        float osc2 = generateOscillator(osc2Phase_, osc2Wave, pw2);

        // Advance phases
        osc1Phase_ += inc1;
        osc2Phase_ += inc2;
        if (osc1Phase_ >= 1.0f) osc1Phase_ -= 1.0f;
        if (osc2Phase_ >= 1.0f) osc2Phase_ -= 1.0f;

        // Hard sync
        if (params_[static_cast<int>(OBXdParam::OSC_SYNC)] > 0.5f) {
            if (osc1Phase_ < inc1) {
                osc2Phase_ = 0.0f;
            }
        }

        // Mix oscillators
        float mix = osc1 * osc1Level + osc2 * osc2Level;

        // XOR / Ring mod
        if (params_[static_cast<int>(OBXdParam::OSC_XOR)] > 0.5f) {
            mix = osc1 * osc2;
        }

        // Process envelopes
        float filterEnvValue = filterEnv_.process();
        float ampEnvValue = ampEnv_.process();

        // Calculate filter cutoff with envelope and LFO
        float cutoffHz = 20.0f + filterCutoff * filterCutoff * 19980.0f;  // Exponential response
        cutoffHz *= std::pow(2.0f, filterEnvValue * filterEnvAmt * 4.0f);
        cutoffHz *= std::pow(2.0f, lfoValue * lfoFilterAmt);
        cutoffHz = std::clamp(cutoffHz, 20.0f, 20000.0f);

        // Update filter
        float q = 0.5f + filterRes * 9.5f;
        filter1_.setLowpass(cutoffHz, q, sampleRate);
        filter2_.setLowpass(cutoffHz, q, sampleRate);

        // Apply cascaded filter (24dB)
        float filtered = filter2_.process(filter1_.process(mix));

        // Apply amplitude envelope
        float output = filtered * ampEnvValue * velocity;

        // Check if voice should be released
        if (!ampEnv_.isActive()) {
            active = false;
        }

        age++;
        return output;
    }

private:
    float frequency_ = 440.0f;
    float osc1Phase_ = 0, osc2Phase_ = 0;
    OBXdEnvelope ampEnv_, filterEnv_;
    BiquadFilter filter1_, filter2_;
    std::array<float, static_cast<size_t>(OBXdParam::PARAM_COUNT)> params_;

    // Thread-safe PRNG for noise generation
    struct NoiseGenerator {
        uint32_t state = 12345;
        float next() {
            // Linear congruential generator
            state = state * 1103515245 + 12345;
            return ((state >> 16) & 0x7FFF) / 16383.5f - 1.0f;
        }
    } noise_;

    float generateOscillator(float phase, float waveform, float pulseWidth) {
        int wave = static_cast<int>(waveform);
        switch (wave) {
            case 0:  // Saw
                return 2.0f * phase - 1.0f;
            case 1:  // Pulse
                return phase < pulseWidth ? 1.0f : -1.0f;
            case 2:  // Triangle
                return 2.0f * std::abs(2.0f * (phase - 0.5f)) - 1.0f;
            case 3:  // Noise
                return noise_.next();
            default:
                return 2.0f * phase - 1.0f;
        }
    }
};

/**
 * OB-Xd Synthesizer - 8-voice polyphonic
 */
class OBXdSynth : public WASMSynthBase {
public:
    static constexpr int MAX_VOICES = 8;

    OBXdSynth() : WASMSynthBase() {
        initializeParameters();
    }

    void initialize(int sampleRate) override {
        WASMSynthBase::initialize(sampleRate);
        lfo_.setSampleRate(sampleRate);
        lfo_.reset();

        for (auto& voice : voices_) {
            voice.active = false;
        }
    }

    void noteOn(int midiNote, int velocity) override {
        if (velocity == 0) {
            noteOff(midiNote);
            return;
        }

        // Find a free voice or steal the oldest
        int voiceIdx = findFreeVoice(midiNote);
        if (voiceIdx >= 0) {
            float vel = velocity / 127.0f;
            vel = vel * params_[static_cast<int>(OBXdParam::VELOCITY_SENSITIVITY)] +
                  (1.0f - params_[static_cast<int>(OBXdParam::VELOCITY_SENSITIVITY)]);

            voices_[voiceIdx].noteOn(midiNote, vel, sampleRate_);
            voices_[voiceIdx].setParameters(params_);
        }
    }

    void noteOff(int midiNote) override {
        for (auto& voice : voices_) {
            if (voice.active && voice.midiNote == midiNote && !voice.releasing) {
                voice.noteOff();
            }
        }
    }

    void allNotesOff() override {
        for (auto& voice : voices_) {
            voice.noteOff();
        }
    }

    void process(float* outputL, float* outputR, int numSamples) override {
        if (!isInitialized_) {
            std::memset(outputL, 0, numSamples * sizeof(float));
            std::memset(outputR, 0, numSamples * sizeof(float));
            return;
        }

        // Update LFO parameters
        lfo_.setRate(0.1f + params_[static_cast<int>(OBXdParam::LFO_RATE)] * 19.9f);
        lfo_.setWaveform(static_cast<OBXdLFO::Waveform>(
            static_cast<int>(params_[static_cast<int>(OBXdParam::LFO_WAVEFORM)])
        ));

        float masterVol = params_[static_cast<int>(OBXdParam::MASTER_VOLUME)];
        float panSpread = params_[static_cast<int>(OBXdParam::PAN_SPREAD)];

        for (int i = 0; i < numSamples; ++i) {
            float lfoValue = lfo_.process();
            float sumL = 0.0f, sumR = 0.0f;

            for (int v = 0; v < MAX_VOICES; ++v) {
                if (voices_[v].active) {
                    float sample = voices_[v].process(lfoValue, sampleRate_);

                    // Pan spread per voice
                    float pan = 0.5f + (v - MAX_VOICES / 2.0f) / MAX_VOICES * panSpread;
                    pan = std::clamp(pan, 0.0f, 1.0f);

                    sumL += sample * (1.0f - pan);
                    sumR += sample * pan;
                }
            }

            outputL[i] = sumL * masterVol;
            outputR[i] = sumR * masterVol;
        }
    }

#ifdef __EMSCRIPTEN__
    void processJS(uintptr_t outputLPtr, uintptr_t outputRPtr, int numSamples) {
        float* outputL = reinterpret_cast<float*>(outputLPtr);
        float* outputR = reinterpret_cast<float*>(outputRPtr);
        process(outputL, outputR, numSamples);
    }
#endif

    void setParameter(int paramId, float value) override {
        if (paramId >= 0 && paramId < static_cast<int>(OBXdParam::PARAM_COUNT)) {
            params_[paramId] = value;

            // Update active voices
            for (auto& voice : voices_) {
                if (voice.active) {
                    voice.setParameters(params_);
                }
            }
        }
    }

    float getParameter(int paramId) const override {
        if (paramId >= 0 && paramId < static_cast<int>(OBXdParam::PARAM_COUNT)) {
            return params_[paramId];
        }
        return 0.0f;
    }

    int getParameterCount() const override { return OBXD_COUNT; }
    const char* getParameterName(int paramId) const override {
        if (paramId >= 0 && paramId < OBXD_COUNT) return OBXD_PARAM_NAMES[paramId];
        return "";
    }
    float getParameterMin(int paramId) const override {
        if (paramId >= 0 && paramId < OBXD_COUNT) return OBXD_PARAM_MINS[paramId];
        return 0.0f;
    }
    float getParameterMax(int paramId) const override {
        if (paramId >= 0 && paramId < OBXD_COUNT) return OBXD_PARAM_MAXS[paramId];
        return 1.0f;
    }
    float getParameterDefault(int paramId) const override {
        if (paramId >= 0 && paramId < OBXD_COUNT) return OBXD_PARAM_DEFAULTS[paramId];
        return 0.0f;
    }

    void controlChange(int cc, int value) override {
        float normValue = value / 127.0f;

        switch (cc) {
            case 1:  // Mod wheel -> LFO amount
                params_[static_cast<int>(OBXdParam::LFO_OSC_AMOUNT)] = normValue * 0.5f;
                break;
            case 74:  // Filter cutoff
                params_[static_cast<int>(OBXdParam::FILTER_CUTOFF)] = normValue;
                break;
            case 71:  // Filter resonance
                params_[static_cast<int>(OBXdParam::FILTER_RESONANCE)] = normValue;
                break;
            case 7:  // Volume
                params_[static_cast<int>(OBXdParam::MASTER_VOLUME)] = normValue;
                break;
        }
    }

    void pitchBend(int value) override {
        // 14-bit value, 8192 = center
        pitchBendValue_ = (value - 8192) / 8192.0f * 2.0f;  // +/- 2 semitones
    }

private:
    std::array<OBXdVoice, MAX_VOICES> voices_;
    std::array<float, static_cast<size_t>(OBXdParam::PARAM_COUNT)> params_;
    OBXdLFO lfo_;
    float pitchBendValue_ = 0.0f;

    void initializeParameters() {
        // Default init patch
        params_.fill(0.0f);

        // Oscillator 1
        params_[static_cast<int>(OBXdParam::OSC1_WAVEFORM)] = 0;  // Saw
        params_[static_cast<int>(OBXdParam::OSC1_OCTAVE)] = 0;
        params_[static_cast<int>(OBXdParam::OSC1_LEVEL)] = 1.0f;
        params_[static_cast<int>(OBXdParam::OSC1_PW)] = 0.5f;

        // Oscillator 2
        params_[static_cast<int>(OBXdParam::OSC2_WAVEFORM)] = 0;  // Saw
        params_[static_cast<int>(OBXdParam::OSC2_OCTAVE)] = 0;
        params_[static_cast<int>(OBXdParam::OSC2_DETUNE)] = 0.1f;
        params_[static_cast<int>(OBXdParam::OSC2_LEVEL)] = 0.7f;
        params_[static_cast<int>(OBXdParam::OSC2_PW)] = 0.5f;

        // Filter
        params_[static_cast<int>(OBXdParam::FILTER_CUTOFF)] = 0.7f;
        params_[static_cast<int>(OBXdParam::FILTER_RESONANCE)] = 0.3f;
        params_[static_cast<int>(OBXdParam::FILTER_ENV_AMOUNT)] = 0.5f;

        // Filter envelope
        params_[static_cast<int>(OBXdParam::FILTER_ATTACK)] = 0.01f;
        params_[static_cast<int>(OBXdParam::FILTER_DECAY)] = 0.3f;
        params_[static_cast<int>(OBXdParam::FILTER_SUSTAIN)] = 0.3f;
        params_[static_cast<int>(OBXdParam::FILTER_RELEASE)] = 0.3f;

        // Amp envelope
        params_[static_cast<int>(OBXdParam::AMP_ATTACK)] = 0.01f;
        params_[static_cast<int>(OBXdParam::AMP_DECAY)] = 0.2f;
        params_[static_cast<int>(OBXdParam::AMP_SUSTAIN)] = 0.7f;
        params_[static_cast<int>(OBXdParam::AMP_RELEASE)] = 0.3f;

        // LFO
        params_[static_cast<int>(OBXdParam::LFO_RATE)] = 0.2f;
        params_[static_cast<int>(OBXdParam::LFO_WAVEFORM)] = 0;  // Sine

        // Global
        params_[static_cast<int>(OBXdParam::MASTER_VOLUME)] = 0.7f;
        params_[static_cast<int>(OBXdParam::VELOCITY_SENSITIVITY)] = 0.5f;
        params_[static_cast<int>(OBXdParam::PAN_SPREAD)] = 0.3f;
    }

    int findFreeVoice(int midiNote) {
        // First, check if note is already playing (retrigger)
        for (int i = 0; i < MAX_VOICES; ++i) {
            if (voices_[i].midiNote == midiNote && voices_[i].active) {
                return i;
            }
        }

        // Find inactive voice
        for (int i = 0; i < MAX_VOICES; ++i) {
            if (!voices_[i].active) {
                return i;
            }
        }

        // Voice stealing - find oldest releasing voice
        int oldest = 0;
        int oldestAge = 0;
        for (int i = 0; i < MAX_VOICES; ++i) {
            if (voices_[i].releasing && voices_[i].age > oldestAge) {
                oldest = i;
                oldestAge = voices_[i].age;
            }
        }

        // If no releasing voice, steal oldest active
        if (oldestAge == 0) {
            for (int i = 0; i < MAX_VOICES; ++i) {
                if (voices_[i].age > oldestAge) {
                    oldest = i;
                    oldestAge = voices_[i].age;
                }
            }
        }

        return oldest;
    }
};

#ifdef __EMSCRIPTEN__
EXPORT_WASM_SYNTH_EXTENDED_EX(OBXdSynth, devilbox::OBXdSynth, "OBXdSynth")
#endif

} // namespace devilbox
