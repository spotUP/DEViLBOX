/**
 * LimiterWASM.cpp — Look-ahead brick-wall limiter for DEViLBOX
 *
 * Inspired by X42 DARC / Calf limiter from Zynthian.
 * Feed-forward design with configurable look-ahead, attack/release,
 * and ceiling control. Prevents clipping without audible pumping.
 *
 * Build: emcmake cmake .. && emmake make
 * Output: public/limiter/Limiter.{js,wasm}
 */

#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 32;
static constexpr int MAX_LOOKAHEAD_SAMPLES = 4800; // 100ms at 48kHz

// ─── Delay Line ─────────────────────────────────────────────────────────────

class DelayLine {
public:
    float buffer[MAX_LOOKAHEAD_SAMPLES] = {};
    int writePos = 0;
    int length = 0;

    void setLength(int len) {
        length = std::min(len, MAX_LOOKAHEAD_SAMPLES);
        std::memset(buffer, 0, sizeof(buffer));
        writePos = 0;
    }

    void push(float sample) {
        buffer[writePos] = sample;
        writePos = (writePos + 1) % length;
    }

    float read() const {
        // Read from the oldest sample (= writePos, since we just overwrote it on next push)
        return buffer[writePos % length];
    }

    float readDelayed() const {
        return buffer[writePos];
    }
};

// ─── Limiter Instance ───────────────────────────────────────────────────────

struct LimiterInstance {
    bool active = false;
    float sampleRate = 48000.0f;

    // Parameters
    float thresholdDb = -1.0f;    // Limiting threshold in dB
    float ceilingDb   = -0.3f;    // Output ceiling in dB
    float attackMs    = 5.0f;     // Attack time ms
    float releaseMs   = 50.0f;    // Release time ms
    float lookaheadMs = 5.0f;     // Look-ahead delay ms
    float kneeDb      = 0.0f;     // Soft knee width in dB (0 = hard knee)

    // Derived
    float thresholdLin = 0.0f;
    float ceilingLin   = 0.0f;
    float attackCoeff  = 0.0f;
    float releaseCoeff = 0.0f;

    // State
    float gainReduction = 1.0f; // current gain multiplier (1 = no reduction)
    DelayLine delayL, delayR;

    void init(float sr) {
        sampleRate = sr;
        gainReduction = 1.0f;
        updateCoefficients();
    }

    void updateCoefficients() {
        thresholdLin = std::pow(10.0f, thresholdDb / 20.0f);
        ceilingLin   = std::pow(10.0f, ceilingDb / 20.0f);

        // Ballistics coefficients (one-pole)
        if (attackMs > 0.01f) {
            attackCoeff = std::exp(-1.0f / (attackMs * 0.001f * sampleRate));
        } else {
            attackCoeff = 0.0f;
        }
        if (releaseMs > 0.01f) {
            releaseCoeff = std::exp(-1.0f / (releaseMs * 0.001f * sampleRate));
        } else {
            releaseCoeff = 0.0f;
        }

        // Look-ahead delay
        int delaySamples = static_cast<int>(lookaheadMs * 0.001f * sampleRate);
        delaySamples = std::max(1, std::min(delaySamples, MAX_LOOKAHEAD_SAMPLES));
        delayL.setLength(delaySamples);
        delayR.setLength(delaySamples);
    }

    void process(const float* inL, const float* inR,
                 float* outL, float* outR, int numSamples)
    {
        for (int i = 0; i < numSamples; i++) {
            // Peak detection on input
            float peak = std::max(std::abs(inL[i]), std::abs(inR[i]));

            // Compute desired gain
            float desiredGain = 1.0f;
            if (peak > thresholdLin && thresholdLin > 0.0f) {
                desiredGain = thresholdLin / peak;
            }

            // Apply soft knee if configured
            if (kneeDb > 0.0f && peak > 0.0f) {
                float peakDb = 20.0f * std::log10(peak);
                float kneeStart = thresholdDb - kneeDb * 0.5f;
                float kneeEnd   = thresholdDb + kneeDb * 0.5f;
                if (peakDb > kneeStart && peakDb < kneeEnd) {
                    float x = (peakDb - kneeStart) / kneeDb;
                    float compressionDb = -x * x * (peakDb - thresholdDb);
                    desiredGain = std::pow(10.0f, compressionDb / 20.0f);
                }
            }

            // Ballistics: fast attack, slow release
            if (desiredGain < gainReduction) {
                // Attack (gain reducing)
                gainReduction = desiredGain + attackCoeff * (gainReduction - desiredGain);
            } else {
                // Release (gain recovering)
                gainReduction = desiredGain + releaseCoeff * (gainReduction - desiredGain);
            }

            // Clamp gain to prevent amplification
            float gain = std::min(gainReduction, 1.0f);

            // Apply ceiling scaling
            gain *= ceilingLin;

            // Read delayed audio and apply gain
            float delayedL = delayL.readDelayed();
            float delayedR = delayR.readDelayed();

            // Push current samples into delay
            delayL.push(inL[i]);
            delayR.push(inR[i]);

            outL[i] = delayedL * gain;
            outR[i] = delayedR * gain;
        }
    }
};

// ─── Instance Pool ──────────────────────────────────────────────────────────

static LimiterInstance instances[MAX_INSTANCES];

static int findFreeSlot() {
    for (int i = 0; i < MAX_INSTANCES; i++) {
        if (!instances[i].active) return i;
    }
    return -1;
}

// ─── Exported C API ─────────────────────────────────────────────────────────

extern "C" {

EMSCRIPTEN_KEEPALIVE
int limiter_create(int sampleRate) {
    int slot = findFreeSlot();
    if (slot < 0) return -1;
    instances[slot].active = true;
    instances[slot].init(static_cast<float>(sampleRate));
    return slot;
}

EMSCRIPTEN_KEEPALIVE
void limiter_destroy(int handle) {
    if (handle >= 0 && handle < MAX_INSTANCES) {
        instances[handle].active = false;
    }
}

EMSCRIPTEN_KEEPALIVE
void limiter_process(int handle, float* inL, float* inR,
                     float* outL, float* outR, int numSamples) {
    if (handle < 0 || handle >= MAX_INSTANCES || !instances[handle].active) {
        if (outL && inL) std::memcpy(outL, inL, numSamples * sizeof(float));
        if (outR && inR) std::memcpy(outR, inR, numSamples * sizeof(float));
        return;
    }
    instances[handle].process(inL, inR, outL, outR, numSamples);
}

EMSCRIPTEN_KEEPALIVE
void limiter_set_threshold(int handle, float db) {
    if (handle >= 0 && handle < MAX_INSTANCES && instances[handle].active) {
        instances[handle].thresholdDb = std::clamp(db, -30.0f, 0.0f);
        instances[handle].updateCoefficients();
    }
}

EMSCRIPTEN_KEEPALIVE
void limiter_set_ceiling(int handle, float db) {
    if (handle >= 0 && handle < MAX_INSTANCES && instances[handle].active) {
        instances[handle].ceilingDb = std::clamp(db, -12.0f, 0.0f);
        instances[handle].updateCoefficients();
    }
}

EMSCRIPTEN_KEEPALIVE
void limiter_set_attack(int handle, float ms) {
    if (handle >= 0 && handle < MAX_INSTANCES && instances[handle].active) {
        instances[handle].attackMs = std::clamp(ms, 0.01f, 50.0f);
        instances[handle].updateCoefficients();
    }
}

EMSCRIPTEN_KEEPALIVE
void limiter_set_release(int handle, float ms) {
    if (handle >= 0 && handle < MAX_INSTANCES && instances[handle].active) {
        instances[handle].releaseMs = std::clamp(ms, 1.0f, 1000.0f);
        instances[handle].updateCoefficients();
    }
}

EMSCRIPTEN_KEEPALIVE
void limiter_set_lookahead(int handle, float ms) {
    if (handle >= 0 && handle < MAX_INSTANCES && instances[handle].active) {
        instances[handle].lookaheadMs = std::clamp(ms, 0.0f, 100.0f);
        instances[handle].updateCoefficients();
    }
}

EMSCRIPTEN_KEEPALIVE
void limiter_set_knee(int handle, float db) {
    if (handle >= 0 && handle < MAX_INSTANCES && instances[handle].active) {
        instances[handle].kneeDb = std::clamp(db, 0.0f, 12.0f);
    }
}

} // extern "C"
