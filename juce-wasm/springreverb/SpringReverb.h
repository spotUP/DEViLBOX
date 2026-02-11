/**
 * SpringReverb.h - Classic dub spring tank reverb
 *
 * Built from scratch for DEViLBOX. No external dependencies.
 *
 * Architecture:
 *   - 4-stage nested allpass diffuser
 *   - 6 parallel comb filters with one-pole lowpass damping
 *   - Transient detector driving chirp oscillator ("drip")
 *   - Tension control scales allpass delay times
 */
#pragma once

#include <cmath>
#include <cstring>
#include <algorithm>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

class SpringReverb {
public:
    static constexpr int MAX_DELAY = 8192;

    void initialize(int sampleRate) {
        sampleRate_ = sampleRate;
        double sr = sampleRate / 44100.0;

        // Allpass diffuser sizes (scaled to sample rate)
        apSizes_[0] = std::max(1, (int)(556 * sr));
        apSizes_[1] = std::max(1, (int)(441 * sr));
        apSizes_[2] = std::max(1, (int)(341 * sr));
        apSizes_[3] = std::max(1, (int)(225 * sr));

        // Comb filter sizes (mutually prime, scaled)
        combSizes_[0] = std::max(1, (int)(1116 * sr));
        combSizes_[1] = std::max(1, (int)(1188 * sr));
        combSizes_[2] = std::max(1, (int)(1277 * sr));
        combSizes_[3] = std::max(1, (int)(1356 * sr));
        combSizes_[4] = std::max(1, (int)(1422 * sr));
        combSizes_[5] = std::max(1, (int)(1491 * sr));

        // Clear all buffers
        for (int i = 0; i < 4; ++i) {
            std::memset(apBuf_[i], 0, sizeof(apBuf_[i]));
            apIdx_[i] = 0;
        }
        for (int i = 0; i < 6; ++i) {
            std::memset(combBuf_[i], 0, sizeof(combBuf_[i]));
            combIdx_[i] = 0;
            combLP_[i] = 0.0f;
        }

        // Drip state
        dripEnvFollower_ = 0.0f;
        dripPhase_ = 0.0;
        dripFreq_ = 2000.0;
        dripActive_ = false;
        dripEnv_ = 0.0f;
        prevInput_ = 0.0f;
    }

    void process(float* inL, float* inR, float* outL, float* outR, int n) {
        float feedback = 0.3f + decay_ * 0.65f; // 0.3 - 0.95
        float dampCoeff = 0.1f + damping_ * 0.8f;  // one-pole LP coefficient
        float tensionScale = 0.5f + tension_;        // 0.5x - 1.5x allpass delays

        for (int i = 0; i < n; ++i) {
            float mono = (inL[i] + inR[i]) * 0.5f;

            // Transient detection for drip
            float diff = std::abs(mono - prevInput_);
            prevInput_ = mono;
            dripEnvFollower_ += (diff - dripEnvFollower_) * 0.01f;
            if (diff > dripEnvFollower_ * 3.0f + 0.01f && !dripActive_) {
                dripActive_ = true;
                dripEnv_ = drip_;
                dripFreq_ = 2000.0;
            }

            // Generate drip chirp
            float dripSample = 0.0f;
            if (dripActive_) {
                dripSample = dripEnv_ * static_cast<float>(std::sin(dripPhase_ * 2.0 * M_PI));
                dripPhase_ += dripFreq_ / sampleRate_;
                if (dripPhase_ >= 1.0) dripPhase_ -= 1.0;
                dripFreq_ *= 0.9995; // Chirp sweep down
                if (dripFreq_ < 200.0) dripFreq_ = 200.0;
                dripEnv_ *= 0.997f;
                if (dripEnv_ < 0.001f) dripActive_ = false;
            }

            float input = mono + dripSample * 0.3f;

            // 4-stage allpass diffuser
            float diffused = input;
            for (int j = 0; j < 4; ++j) {
                int sz = std::max(1, std::min((int)(apSizes_[j] * tensionScale), MAX_DELAY - 1));
                float* buf = apBuf_[j];
                int& idx = apIdx_[j];
                float buffered = buf[idx];
                float ap_out = -diffused * diffusion_ + buffered;
                buf[idx] = diffused + buffered * diffusion_;
                idx = (idx + 1) % sz;
                diffused = ap_out;
            }

            // 6 parallel comb filters with damping
            float combSum = 0.0f;
            for (int j = 0; j < 6; ++j) {
                float* buf = combBuf_[j];
                int& idx = combIdx_[j];
                int sz = std::min(combSizes_[j], MAX_DELAY - 1);

                float out = buf[idx];
                // One-pole lowpass in feedback path
                combLP_[j] = out + dampCoeff * (combLP_[j] - out);
                buf[idx] = diffused + combLP_[j] * feedback;
                idx = (idx + 1) % sz;
                combSum += out;
            }
            combSum /= 6.0f;

            // Mix
            float wet = combSum;
            outL[i] = inL[i] * (1.0f - mix_) + wet * mix_;
            outR[i] = inR[i] * (1.0f - mix_) + wet * mix_;
        }
    }

    // Parameters
    void setDecay(float v) { decay_ = v; }
    void setDamping(float v) { damping_ = v; }
    void setTension(float v) { tension_ = v; }
    void setMix(float v) { mix_ = v; }
    void setDrip(float v) { drip_ = v; }
    void setDiffusion(float v) { diffusion_ = v; }

private:
    int sampleRate_ = 48000;

    float decay_ = 0.6f;
    float damping_ = 0.4f;
    float tension_ = 0.5f;
    float mix_ = 0.35f;
    float drip_ = 0.5f;
    float diffusion_ = 0.7f;

    // Allpass diffuser
    float apBuf_[4][MAX_DELAY] = {};
    int apIdx_[4] = {};
    int apSizes_[4] = {};

    // Comb filters
    float combBuf_[6][MAX_DELAY] = {};
    int combIdx_[6] = {};
    int combSizes_[6] = {};
    float combLP_[6] = {};

    // Drip
    float dripEnvFollower_ = 0.0f;
    double dripPhase_ = 0.0;
    double dripFreq_ = 2000.0;
    bool dripActive_ = false;
    float dripEnv_ = 0.0f;
    float prevInput_ = 0.0f;
};
