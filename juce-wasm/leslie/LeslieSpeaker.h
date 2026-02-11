/**
 * LeslieSpeaker.h - Rotary Speaker DSP
 *
 * Classic electromechanical Leslie cabinet simulation.
 * Built from scratch for DEViLBOX. No external dependencies.
 *
 * Architecture:
 *   1. Crossover filter (2nd-order Butterworth ~800Hz) → horn (high) + drum (low)
 *   2. Per-rotor: amplitude modulation + doppler pitch shift via interpolated delay
 *   3. Stereo panning with phase offset
 *   4. Speed ramping between slow/fast with configurable acceleration
 */
#pragma once

#include <cmath>
#include <cstring>
#include <algorithm>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

class LeslieSpeaker {
public:
    static constexpr int MAX_DELAY = 4096;

    void initialize(int sampleRate) {
        sampleRate_ = sampleRate;
        hornPhase_ = 0.0;
        drumPhase_ = 0.0;
        currentHornRate_ = 0.8;  // slow default
        currentDrumRate_ = 0.7;

        std::memset(delayBufL_, 0, sizeof(delayBufL_));
        std::memset(delayBufR_, 0, sizeof(delayBufR_));
        delayWriteIdx_ = 0;

        // Init crossover filter coefficients (Butterworth LP/HP at 800Hz)
        updateCrossover(800.0);
        std::memset(lpStateL_, 0, sizeof(lpStateL_));
        std::memset(lpStateR_, 0, sizeof(lpStateR_));
        std::memset(hpStateL_, 0, sizeof(hpStateL_));
        std::memset(hpStateR_, 0, sizeof(hpStateR_));
    }

    void process(float* inL, float* inR, float* outL, float* outR, int n) {
        // Ramp rotor speeds toward target
        double targetHorn = getTargetRate(true);
        double targetDrum = getTargetRate(false);
        double rampCoeff = 1.0 - std::exp(-acceleration_ * 10.0 / sampleRate_);

        for (int i = 0; i < n; ++i) {
            currentHornRate_ += (targetHorn - currentHornRate_) * rampCoeff;
            currentDrumRate_ += (targetDrum - currentDrumRate_) * rampCoeff;

            // Crossover split
            float lowL, lowR, highL, highR;
            applyLP(inL[i], inR[i], lowL, lowR);
            highL = inL[i] - lowL;
            highR = inR[i] - lowR;

            // Horn rotor (high frequencies)
            double hornSin = std::sin(hornPhase_ * 2.0 * M_PI);
            double hornCos = std::cos(hornPhase_ * 2.0 * M_PI);

            // AM (tremolo)
            double hornAM = 1.0 - hornDepth_ * 0.5 * (1.0 - hornSin);
            float hornL = highL * static_cast<float>(hornAM);
            float hornR = highR * static_cast<float>(hornAM);

            // Doppler via modulated delay
            double dopplerSamples = doppler_ * 20.0 * (1.0 + hornSin);
            float hornDopL = readDelay(delayBufL_, dopplerSamples);
            float hornDopR = readDelay(delayBufR_, dopplerSamples);

            // Blend doppler
            hornL = hornL * (1.0f - static_cast<float>(doppler_)) + hornDopL * static_cast<float>(doppler_);
            hornR = hornR * (1.0f - static_cast<float>(doppler_)) + hornDopR * static_cast<float>(doppler_);

            // Stereo pan for horn
            float hornPanL = static_cast<float>(0.5 + 0.5 * width_ * hornCos);
            float hornPanR = static_cast<float>(0.5 - 0.5 * width_ * hornCos);

            // Drum rotor (low frequencies)
            double drumSin = std::sin(drumPhase_ * 2.0 * M_PI);
            double drumCos = std::cos(drumPhase_ * 2.0 * M_PI);
            double drumAM = 1.0 - drumDepth_ * 0.5 * (1.0 - drumSin);
            float drumL = lowL * static_cast<float>(drumAM);
            float drumR = lowR * static_cast<float>(drumAM);

            float drumPanL = static_cast<float>(0.5 + 0.5 * width_ * drumCos);
            float drumPanR = static_cast<float>(0.5 - 0.5 * width_ * drumCos);

            // Write to delay line for doppler
            delayBufL_[delayWriteIdx_] = highL;
            delayBufR_[delayWriteIdx_] = highR;
            delayWriteIdx_ = (delayWriteIdx_ + 1) & (MAX_DELAY - 1);

            // Mix
            float wetL = hornL * hornPanL + drumL * drumPanL;
            float wetR = hornR * hornPanR + drumR * drumPanR;

            outL[i] = inL[i] * (1.0f - mix_) + wetL * mix_;
            outR[i] = inR[i] * (1.0f - mix_) + wetR * mix_;

            // Advance rotor phases
            hornPhase_ += currentHornRate_ / sampleRate_;
            if (hornPhase_ >= 1.0) hornPhase_ -= 1.0;
            drumPhase_ += currentDrumRate_ / sampleRate_;
            if (drumPhase_ >= 1.0) drumPhase_ -= 1.0;
        }
    }

    // Parameters
    void setSpeed(float v) { speed_ = v; }           // 0=slow, 0.5=brake, 1=fast
    void setHornRate(float v) { hornRate_ = v; }      // 0.1-10 Hz
    void setDrumRate(float v) { drumRate_ = v; }      // 0.1-8 Hz
    void setHornDepth(float v) { hornDepth_ = v; }    // 0-1
    void setDrumDepth(float v) { drumDepth_ = v; }    // 0-1
    void setDoppler(float v) { doppler_ = v; }        // 0-1
    void setMix(float v) { mix_ = v; }                // 0-1
    void setWidth(float v) { width_ = v; }            // 0-1
    void setAcceleration(float v) { acceleration_ = v; } // 0-1

private:
    int sampleRate_ = 48000;

    // Rotor parameters
    float speed_ = 0.0f;
    float hornRate_ = 6.8f;
    float drumRate_ = 5.9f;
    float hornDepth_ = 0.7f;
    float drumDepth_ = 0.5f;
    float doppler_ = 0.5f;
    float mix_ = 1.0f;
    float width_ = 0.8f;
    float acceleration_ = 0.5f;

    // Rotor state
    double hornPhase_ = 0.0;
    double drumPhase_ = 0.0;
    double currentHornRate_ = 0.8;
    double currentDrumRate_ = 0.7;

    // Delay line for doppler
    float delayBufL_[MAX_DELAY] = {};
    float delayBufR_[MAX_DELAY] = {};
    int delayWriteIdx_ = 0;

    // Crossover filter state (2nd-order biquad LP)
    double lpA1_, lpA2_, lpB0_, lpB1_, lpB2_;
    double lpStateL_[4] = {};
    double lpStateR_[4] = {};
    double hpStateL_[4] = {};
    double hpStateR_[4] = {};

    double getTargetRate(bool isHorn) {
        if (speed_ < 0.25) {
            // Slow (chorale)
            return isHorn ? hornRate_ * 0.12 : drumRate_ * 0.12; // ~0.8Hz
        } else if (speed_ > 0.75) {
            // Fast (tremolo)
            return isHorn ? hornRate_ : drumRate_;
        } else {
            // Brake
            return 0.001;
        }
    }

    void updateCrossover(double freq) {
        double w0 = 2.0 * M_PI * freq / sampleRate_;
        double cosW = std::cos(w0);
        double sinW = std::sin(w0);
        double alpha = sinW / (2.0 * 0.7071); // Q = sqrt(2)/2 for Butterworth
        double a0 = 1.0 + alpha;
        lpB0_ = ((1.0 - cosW) / 2.0) / a0;
        lpB1_ = (1.0 - cosW) / a0;
        lpB2_ = lpB0_;
        lpA1_ = (-2.0 * cosW) / a0;
        lpA2_ = (1.0 - alpha) / a0;
    }

    void applyLP(float inL, float inR, float& outL, float& outR) {
        // Direct Form II Transposed
        double xL = static_cast<double>(inL);
        double yL = lpB0_ * xL + lpStateL_[0];
        lpStateL_[0] = lpB1_ * xL - lpA1_ * yL + lpStateL_[1];
        lpStateL_[1] = lpB2_ * xL - lpA2_ * yL;
        outL = static_cast<float>(yL);

        double xR = static_cast<double>(inR);
        double yR = lpB0_ * xR + lpStateR_[0];
        lpStateR_[0] = lpB1_ * xR - lpA1_ * yR + lpStateR_[1];
        lpStateR_[1] = lpB2_ * xR - lpA2_ * yR;
        outR = static_cast<float>(yR);
    }

    float readDelay(float* buf, double delaySamples) {
        double readPos = delayWriteIdx_ - 1 - delaySamples;
        if (readPos < 0) readPos += MAX_DELAY;
        int idx0 = static_cast<int>(readPos) & (MAX_DELAY - 1);
        int idx1 = (idx0 + 1) & (MAX_DELAY - 1);
        double frac = readPos - std::floor(readPos);
        return static_cast<float>(buf[idx0] * (1.0 - frac) + buf[idx1] * frac);
    }
};
