/**
 * TonewheelOrgan.h - Hammond-style tonewheel organ DSP
 *
 * Built from scratch for DEViLBOX.
 * 8-voice polyphonic with 9 drawbars, key click, percussion,
 * vibrato/chorus scanner, and soft-clip overdrive.
 *
 * Optimization: pre-computed 2048-entry sine table with linear interpolation.
 */
#pragma once

#include <cmath>
#include <cstring>
#include <algorithm>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

class TonewheelOrgan {
public:
    static constexpr int MAX_VOICES = 8;
    static constexpr int SINE_TABLE_SIZE = 2048;
    static constexpr int NUM_DRAWBARS = 9;

    // Drawbar harmonic ratios relative to 8' fundamental
    // 16', 5-1/3', 8', 4', 2-2/3', 2', 1-3/5', 1-1/3', 1'
    static constexpr double DRAWBAR_RATIOS[NUM_DRAWBARS] = {
        0.5, 1.5, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 8.0
    };

    void initialize(int sampleRate) {
        sampleRate_ = sampleRate;

        // Build sine table
        for (int i = 0; i < SINE_TABLE_SIZE; ++i) {
            sineTable_[i] = static_cast<float>(std::sin(2.0 * M_PI * i / SINE_TABLE_SIZE));
        }

        // Clear voices
        for (auto& v : voices_) {
            v.active = false;
            v.midiNote = -1;
            v.velocity = 0.0f;
            v.clickEnv = 0.0f;
            v.percEnv = 0.0f;
            std::memset(v.phases, 0, sizeof(v.phases));
        }

        // Vibrato LFO
        vibratoPhase_ = 0.0;
        vibratoDelayIdx_ = 0;
        std::memset(vibratoDelay_, 0, sizeof(vibratoDelay_));
    }

    void noteOn(int note, int velocity) {
        // Find free voice or steal oldest
        int vi = -1;
        int oldestAge = -1;
        for (int i = 0; i < MAX_VOICES; ++i) {
            if (!voices_[i].active) { vi = i; break; }
            if (voices_[i].age > oldestAge) { oldestAge = voices_[i].age; vi = i; }
        }
        if (vi < 0) vi = 0;

        auto& v = voices_[vi];
        v.active = true;
        v.midiNote = note;
        v.velocity = velocity / 127.0f;
        v.age = 0;
        v.clickEnv = click_;
        v.percEnv = (percussion_ > 0) ? (percSoft_ > 0.5f ? 0.5f : 1.0f) : 0.0f;
        std::memset(v.phases, 0, sizeof(v.phases));

        // Age all other voices
        for (int i = 0; i < MAX_VOICES; ++i) {
            if (i != vi && voices_[i].active) voices_[i].age++;
        }
    }

    void noteOff(int note) {
        for (auto& v : voices_) {
            if (v.active && v.midiNote == note) {
                v.active = false;
            }
        }
    }

    void allNotesOff() {
        for (auto& v : voices_) v.active = false;
    }

    void process(float* outL, float* outR, int n) {
        // Percussion decay rate
        float percDecay = percFast_ > 0.5f ? 0.9985f : 0.9997f;

        for (int i = 0; i < n; ++i) {
            float sample = 0.0f;

            for (auto& v : voices_) {
                if (!v.active && v.clickEnv < 0.001f && v.percEnv < 0.001f) continue;

                float freq = 440.0f * std::pow(2.0f, (v.midiNote - 69) / 12.0f);
                float voiceSample = 0.0f;

                // 9 drawbar oscillators
                for (int d = 0; d < NUM_DRAWBARS; ++d) {
                    if (drawbars_[d] < 0.01f) continue;
                    float harmFreq = freq * static_cast<float>(DRAWBAR_RATIOS[d]);
                    v.phases[d] += harmFreq / sampleRate_;
                    if (v.phases[d] >= 1.0) v.phases[d] -= 1.0;
                    voiceSample += lookupSine(v.phases[d]) * drawbars_[d];
                }

                // Normalize by max possible level (9 drawbars at 8)
                voiceSample /= 9.0f;

                // Key click (noise burst with fast decay)
                if (v.clickEnv > 0.001f) {
                    float noise = (static_cast<float>(rand()) / static_cast<float>(RAND_MAX) * 2.0f - 1.0f);
                    voiceSample += noise * v.clickEnv * 0.3f;
                    v.clickEnv *= 0.995f;
                }

                // Percussion (2nd or 3rd harmonic fast decay)
                if (v.percEnv > 0.001f) {
                    int percHarmonic = (percussion_ >= 2) ? 2 : 1; // index 3=4' or 4=2-2/3'
                    float percFreq = freq * static_cast<float>(DRAWBAR_RATIOS[percHarmonic + 2]);
                    // Use a dedicated phase (reuse phase slot 9)
                    voiceSample += lookupSine(v.phases[0] * DRAWBAR_RATIOS[percHarmonic + 2]) * v.percEnv * 0.4f;
                    v.percEnv *= percDecay;
                }

                sample += voiceSample * v.velocity;
            }

            // Vibrato/Chorus scanner
            sample = applyVibrato(sample);

            // Soft-clip overdrive
            if (overdrive_ > 0.01f) {
                float driven = sample * (1.0f + overdrive_ * 5.0f);
                sample = std::tanh(driven) * (1.0f / (1.0f + overdrive_ * 2.0f));
            }

            sample *= volume_;
            outL[i] = sample;
            outR[i] = sample;
        }
    }

    // Parameter setters
    void setDrawbar(int index, float value) {
        if (index >= 0 && index < NUM_DRAWBARS)
            drawbars_[index] = std::max(0.0f, std::min(8.0f, value)) / 8.0f;
    }
    void setPercussion(int v) { percussion_ = v; }        // 0=off, 1=2nd, 2=3rd
    void setPercFast(float v) { percFast_ = v; }           // 0-1
    void setPercSoft(float v) { percSoft_ = v; }           // 0-1
    void setClick(float v) { click_ = v; }                 // 0-1
    void setVibratoType(int v) { vibratoType_ = v; }       // 0-5
    void setVibratoDepth(float v) { vibratoDepth_ = v; }   // 0-1
    void setOverdrive(float v) { overdrive_ = v; }         // 0-1
    void setVolume(float v) { volume_ = v; }               // 0-1

private:
    int sampleRate_ = 48000;
    float sineTable_[SINE_TABLE_SIZE];

    struct OrgVoice {
        bool active = false;
        int midiNote = -1;
        float velocity = 0.0f;
        double phases[NUM_DRAWBARS] = {};
        float clickEnv = 0.0f;
        float percEnv = 0.0f;
        int age = 0;
    };

    OrgVoice voices_[MAX_VOICES];

    // Drawbar levels (0-1, representing 0-8 drawbar positions)
    float drawbars_[NUM_DRAWBARS] = { 1.0f, 1.0f, 1.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f };

    int percussion_ = 0;
    float percFast_ = 1.0f;
    float percSoft_ = 0.0f;
    float click_ = 0.3f;
    int vibratoType_ = 2;   // V1/V2/V3/C1/C2/C3
    float vibratoDepth_ = 0.5f;
    float overdrive_ = 0.0f;
    float volume_ = 0.8f;

    // Vibrato scanner (short delay line modulated by LFO)
    static constexpr int VIBRATO_DELAY_SIZE = 1024;
    float vibratoDelay_[VIBRATO_DELAY_SIZE] = {};
    int vibratoDelayIdx_ = 0;
    double vibratoPhase_ = 0.0;

    float lookupSine(double phase) {
        double idx = phase * SINE_TABLE_SIZE;
        int i0 = static_cast<int>(idx) & (SINE_TABLE_SIZE - 1);
        int i1 = (i0 + 1) & (SINE_TABLE_SIZE - 1);
        float frac = static_cast<float>(idx - std::floor(idx));
        return sineTable_[i0] + frac * (sineTable_[i1] - sineTable_[i0]);
    }

    float applyVibrato(float sample) {
        if (vibratoDepth_ < 0.01f) return sample;

        // Write to delay line
        vibratoDelay_[vibratoDelayIdx_] = sample;

        // LFO at ~7Hz
        double lfoRate = 7.0 / sampleRate_;
        vibratoPhase_ += lfoRate;
        if (vibratoPhase_ >= 1.0) vibratoPhase_ -= 1.0;

        double lfo = std::sin(vibratoPhase_ * 2.0 * M_PI);

        // Modulate delay read position
        float maxDelay = vibratoDepth_ * 4.0f; // max ~4 samples delay
        double readDelay = maxDelay * (1.0 + lfo) * 0.5;
        double readPos = vibratoDelayIdx_ - readDelay;
        if (readPos < 0) readPos += VIBRATO_DELAY_SIZE;
        int idx0 = static_cast<int>(readPos) & (VIBRATO_DELAY_SIZE - 1);
        int idx1 = (idx0 + 1) & (VIBRATO_DELAY_SIZE - 1);
        double frac = readPos - std::floor(readPos);

        float out = static_cast<float>(vibratoDelay_[idx0] * (1.0 - frac) + vibratoDelay_[idx1] * frac);

        vibratoDelayIdx_ = (vibratoDelayIdx_ + 1) & (VIBRATO_DELAY_SIZE - 1);

        // Chorus mode: blend dry + modulated; Vibrato mode: modulated only
        if (vibratoType_ >= 3) {
            // Chorus modes (C1/C2/C3)
            return sample * 0.5f + out * 0.5f;
        }
        return out;
    }
};
