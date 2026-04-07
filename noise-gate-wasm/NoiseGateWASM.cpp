/**
 * NoiseGateWASM.cpp — Noise Gate effect for DEViLBOX
 * 
 * Inspired by abGate (LV2 noise gate plugin from Zynthian).
 * Simple envelope-following gate with threshold, attack, hold, release,
 * and optional sidechain high-pass filter.
 *
 * Build: emcmake cmake .. && emmake make
 * Output: public/noise-gate/NoiseGate.{js,wasm}
 */

#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 32;

// ─── One-pole smoother ──────────────────────────────────────────────────────

class OnePoleSmoother {
public:
    void setCoeff(float timeMs, float sampleRate) {
        if (timeMs <= 0.0f) {
            coeff_ = 0.0f;
        } else {
            coeff_ = std::exp(-1.0f / (timeMs * 0.001f * sampleRate));
        }
    }
    float process(float target) {
        state_ = target + coeff_ * (state_ - target);
        return state_;
    }
    void reset(float value = 0.0f) { state_ = value; }
private:
    float coeff_ = 0.0f;
    float state_ = 0.0f;
};

// ─── High-pass filter for sidechain ─────────────────────────────────────────

class HighPassFilter {
public:
    void setFrequency(float freq, float sampleRate) {
        float rc = 1.0f / (2.0f * 3.14159265f * freq);
        float dt = 1.0f / sampleRate;
        alpha_ = rc / (rc + dt);
    }
    float process(float input) {
        float output = alpha_ * (prevOutput_ + input - prevInput_);
        prevInput_ = input;
        prevOutput_ = output;
        return output;
    }
    void reset() { prevInput_ = prevOutput_ = 0.0f; }
private:
    float alpha_ = 1.0f;
    float prevInput_ = 0.0f;
    float prevOutput_ = 0.0f;
};

// ─── Noise Gate Instance ────────────────────────────────────────────────────

struct NoiseGateInstance {
    bool active = false;
    float sampleRate = 48000.0f;

    // Parameters
    float thresholdDb = -40.0f;   // Gate threshold in dB
    float attackMs = 0.5f;        // Attack time ms
    float holdMs = 50.0f;         // Hold time ms
    float releaseMs = 100.0f;     // Release time ms
    float range = 0.0f;           // Range: 0 = full gate, 1 = no gating
    float hpfFreq = 0.0f;         // Sidechain HPF frequency (0 = off)

    // State
    OnePoleSmoother attackSmoother;
    OnePoleSmoother releaseSmoother;
    HighPassFilter hpfL, hpfR;
    float envelope = 0.0f;
    float gateGain = 0.0f;
    int holdCounter = 0;
    bool gateOpen = false;

    void init(float sr) {
        sampleRate = sr;
        updateCoefficients();
        attackSmoother.reset(0.0f);
        releaseSmoother.reset(0.0f);
        hpfL.reset();
        hpfR.reset();
        envelope = 0.0f;
        gateGain = 0.0f;
        holdCounter = 0;
        gateOpen = false;
    }

    void updateCoefficients() {
        attackSmoother.setCoeff(attackMs, sampleRate);
        releaseSmoother.setCoeff(releaseMs, sampleRate);
        if (hpfFreq > 20.0f) {
            hpfL.setFrequency(hpfFreq, sampleRate);
            hpfR.setFrequency(hpfFreq, sampleRate);
        }
    }

    void process(const float* inL, const float* inR,
                 float* outL, float* outR, int numSamples)
    {
        float threshLin = std::pow(10.0f, thresholdDb / 20.0f);
        int holdSamples = static_cast<int>(holdMs * 0.001f * sampleRate);
        float minGain = range; // 0 = full silence when closed, 1 = no gating

        for (int i = 0; i < numSamples; i++) {
            // Sidechain signal (optionally high-pass filtered)
            float scL = inL[i];
            float scR = inR[i];
            if (hpfFreq > 20.0f) {
                scL = hpfL.process(scL);
                scR = hpfR.process(scR);
            }

            // Envelope follower (peak)
            float peak = std::max(std::abs(scL), std::abs(scR));
            if (peak > envelope) {
                envelope = attackSmoother.process(peak);
            } else {
                envelope = releaseSmoother.process(peak);
            }

            // Gate logic with hold
            if (envelope >= threshLin) {
                gateOpen = true;
                holdCounter = holdSamples;
            } else if (holdCounter > 0) {
                holdCounter--;
                // Gate stays open during hold
            } else {
                gateOpen = false;
            }

            // Smooth gain transition
            float targetGain = gateOpen ? 1.0f : minGain;
            // Simple exponential smoothing for gain to avoid clicks
            gateGain += (targetGain - gateGain) * 0.005f;

            outL[i] = inL[i] * gateGain;
            outR[i] = inR[i] * gateGain;
        }
    }
};

// ─── Instance Pool ──────────────────────────────────────────────────────────

static NoiseGateInstance instances[MAX_INSTANCES];

static int findFreeSlot() {
    for (int i = 0; i < MAX_INSTANCES; i++) {
        if (!instances[i].active) return i;
    }
    return -1;
}

// ─── Exported C API ─────────────────────────────────────────────────────────

extern "C" {

EMSCRIPTEN_KEEPALIVE
int noise_gate_create(int sampleRate) {
    int slot = findFreeSlot();
    if (slot < 0) return -1;
    instances[slot].active = true;
    instances[slot].init(static_cast<float>(sampleRate));
    return slot;
}

EMSCRIPTEN_KEEPALIVE
void noise_gate_destroy(int handle) {
    if (handle >= 0 && handle < MAX_INSTANCES) {
        instances[handle].active = false;
    }
}

EMSCRIPTEN_KEEPALIVE
void noise_gate_process(int handle, float* inL, float* inR,
                        float* outL, float* outR, int numSamples) {
    if (handle < 0 || handle >= MAX_INSTANCES || !instances[handle].active) {
        if (outL && inL) std::memcpy(outL, inL, numSamples * sizeof(float));
        if (outR && inR) std::memcpy(outR, inR, numSamples * sizeof(float));
        return;
    }
    instances[handle].process(inL, inR, outL, outR, numSamples);
}

EMSCRIPTEN_KEEPALIVE
void noise_gate_set_threshold(int handle, float db) {
    if (handle >= 0 && handle < MAX_INSTANCES && instances[handle].active) {
        instances[handle].thresholdDb = std::clamp(db, -80.0f, 0.0f);
    }
}

EMSCRIPTEN_KEEPALIVE
void noise_gate_set_attack(int handle, float ms) {
    if (handle >= 0 && handle < MAX_INSTANCES && instances[handle].active) {
        instances[handle].attackMs = std::clamp(ms, 0.01f, 100.0f);
        instances[handle].updateCoefficients();
    }
}

EMSCRIPTEN_KEEPALIVE
void noise_gate_set_hold(int handle, float ms) {
    if (handle >= 0 && handle < MAX_INSTANCES && instances[handle].active) {
        instances[handle].holdMs = std::clamp(ms, 0.0f, 2000.0f);
    }
}

EMSCRIPTEN_KEEPALIVE
void noise_gate_set_release(int handle, float ms) {
    if (handle >= 0 && handle < MAX_INSTANCES && instances[handle].active) {
        instances[handle].releaseMs = std::clamp(ms, 1.0f, 5000.0f);
        instances[handle].updateCoefficients();
    }
}

EMSCRIPTEN_KEEPALIVE
void noise_gate_set_range(int handle, float range) {
    if (handle >= 0 && handle < MAX_INSTANCES && instances[handle].active) {
        instances[handle].range = std::clamp(range, 0.0f, 1.0f);
    }
}

EMSCRIPTEN_KEEPALIVE
void noise_gate_set_hpf(int handle, float freq) {
    if (handle >= 0 && handle < MAX_INSTANCES && instances[handle].active) {
        instances[handle].hpfFreq = std::clamp(freq, 0.0f, 2000.0f);
        instances[handle].updateCoefficients();
    }
}

} // extern "C"
