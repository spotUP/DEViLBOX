/**
 * Melodica.h - Melodica physical model DSP
 *
 * Built from scratch for DEViLBOX.
 * Monophonic reed instrument: sawtooth oscillator (reed vibration)
 * + filtered white noise (breath) + body resonance bandpass + vibrato.
 */
#pragma once

#include <cmath>
#include <cstring>
#include <cstdlib>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

class MelodicaDSP {
public:
    void initialize(int sampleRate) {
        sampleRate_ = sampleRate;
        phase_ = 0.0;
        targetFreq_ = 0.0;
        currentFreq_ = 0.0;
        vibratoPhase_ = 0.0;
        envLevel_ = 0.0f;
        noteActive_ = false;
        velocity_ = 0.0f;

        // SVF state
        svfLow_ = 0.0f;
        svfBand_ = 0.0f;
    }

    void noteOn(int note, int velocity) {
        targetFreq_ = 440.0 * std::pow(2.0, (note - 69) / 12.0);
        if (!noteActive_) currentFreq_ = targetFreq_;
        velocity_ = velocity / 127.0f;
        noteActive_ = true;
        envStage_ = ENV_ATTACK;
    }

    void noteOff(int /*note*/) {
        envStage_ = ENV_RELEASE;
    }

    void allNotesOff() {
        noteActive_ = false;
        envLevel_ = 0.0f;
        envStage_ = ENV_IDLE;
    }

    void process(float* outL, float* outR, int n) {
        float portCoeff = 1.0f - std::exp(-10.0f * (1.0f - portamento_) / sampleRate_);
        float attackRate = 1.0f / (attack_ * sampleRate_ + 1);
        float releaseRate = 1.0f / (release_ * sampleRate_ + 1);

        // SVF coefficients for body resonance
        float svfCutoff = 800.0f + brightness_ * 3000.0f;
        float svfQ = 2.0f + brightness_ * 4.0f;
        float f = 2.0f * std::sin(static_cast<float>(M_PI) * svfCutoff / sampleRate_);
        float q = 1.0f / svfQ;

        for (int i = 0; i < n; ++i) {
            // Envelope
            switch (envStage_) {
                case ENV_ATTACK:
                    envLevel_ += attackRate;
                    if (envLevel_ >= 1.0f) { envLevel_ = 1.0f; envStage_ = ENV_SUSTAIN; }
                    break;
                case ENV_SUSTAIN:
                    break;
                case ENV_RELEASE:
                    envLevel_ -= releaseRate;
                    if (envLevel_ <= 0.0f) { envLevel_ = 0.0f; envStage_ = ENV_IDLE; noteActive_ = false; }
                    break;
                case ENV_IDLE:
                default:
                    break;
            }

            if (envLevel_ < 0.0001f) {
                outL[i] = 0.0f;
                outR[i] = 0.0f;
                continue;
            }

            // Portamento
            currentFreq_ += (targetFreq_ - currentFreq_) * portCoeff;

            // Vibrato
            vibratoPhase_ += vibratoRate_ / sampleRate_;
            if (vibratoPhase_ >= 1.0) vibratoPhase_ -= 1.0;
            double vibrato = std::sin(vibratoPhase_ * 2.0 * M_PI) * vibratoDepth_ * 0.02;

            // Detune in cents
            double detuneRatio = std::pow(2.0, detune_ / 1200.0);

            // Reed oscillator (sawtooth via phase accumulation)
            double freq = currentFreq_ * (1.0 + vibrato) * detuneRatio;
            phase_ += freq / sampleRate_;
            if (phase_ >= 1.0) phase_ -= 1.0;
            float saw = static_cast<float>(2.0 * phase_ - 1.0);

            // Breath noise
            float noiseVal = (static_cast<float>(rand()) / static_cast<float>(RAND_MAX) * 2.0f - 1.0f) * noise_;

            // Mix reed + noise
            float sample = (saw * breath_ + noiseVal) * envLevel_ * velocity_;

            // Body resonance (2nd-order SVF bandpass)
            svfLow_ += f * svfBand_;
            float high = sample - svfLow_ - q * svfBand_;
            svfBand_ += f * high;

            // Mix bandpass with direct signal
            float resonant = svfBand_ * 0.6f + sample * 0.4f;

            float output = resonant * volume_;
            outL[i] = output;
            outR[i] = output;
        }
    }

    // Parameters
    void setBreath(float v) { breath_ = v; }
    void setBrightness(float v) { brightness_ = v; }
    void setVibratoRate(float v) { vibratoRate_ = v; }
    void setVibratoDepth(float v) { vibratoDepth_ = v; }
    void setDetune(float v) { detune_ = v; }
    void setNoise(float v) { noise_ = v; }
    void setPortamento(float v) { portamento_ = v; }
    void setAttack(float v) { attack_ = v; }
    void setRelease(float v) { release_ = v; }
    void setVolume(float v) { volume_ = v; }

private:
    int sampleRate_ = 48000;

    // Oscillator
    double phase_ = 0.0;
    double targetFreq_ = 0.0;
    double currentFreq_ = 0.0;

    // Vibrato
    double vibratoPhase_ = 0.0;

    // Envelope
    enum EnvStage { ENV_IDLE, ENV_ATTACK, ENV_SUSTAIN, ENV_RELEASE };
    EnvStage envStage_ = ENV_IDLE;
    float envLevel_ = 0.0f;
    bool noteActive_ = false;
    float velocity_ = 0.0f;

    // SVF state (body resonance)
    float svfLow_ = 0.0f;
    float svfBand_ = 0.0f;

    // Parameters
    float breath_ = 0.7f;
    float brightness_ = 0.5f;
    float vibratoRate_ = 4.5f;
    float vibratoDepth_ = 0.2f;
    float detune_ = 5.0f;       // cents
    float noise_ = 0.15f;
    float portamento_ = 0.1f;
    float attack_ = 0.15f;
    float release_ = 0.2f;
    float volume_ = 0.8f;
};
