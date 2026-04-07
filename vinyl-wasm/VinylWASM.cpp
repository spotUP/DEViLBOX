/**
 * VinylWASM.cpp — Vinyl record simulation
 *
 * Motor rumble, static crackle, hiss noise, and LP filtering for
 * vintage vinyl sound. Uses xorshift PRNG for deterministic noise.
 *
 * Build: cd vinyl-wasm/build && emcmake cmake .. && emmake make
 */

#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;
static constexpr float PI = 3.14159265358979323846f;
static constexpr float TWO_PI = 2.0f * PI;

// Xorshift32 PRNG
struct XorShift32 {
    uint32_t state = 2463534242u;

    uint32_t next() {
        state ^= state << 13;
        state ^= state >> 17;
        state ^= state << 5;
        return state;
    }

    // Returns -1..1
    float nextFloat() {
        return static_cast<float>(static_cast<int32_t>(next())) / 2147483648.0f;
    }

    // Returns 0..1
    float nextUFloat() {
        return static_cast<float>(next()) / 4294967296.0f;
    }
};

// Simple one-pole LP filter
struct OnePoleLPF {
    float z1 = 0.0f;
    float a = 0.5f;

    void setCutoff(float freq, float sr) {
        float w = TWO_PI * std::clamp(freq, 20.0f, sr * 0.49f) / sr;
        a = w / (1.0f + w);
    }

    float process(float x) {
        z1 += a * (x - z1);
        return z1;
    }

    void clear() { z1 = 0.0f; }
};

struct VinylInstance {
    bool active = false;
    float sampleRate = 48000.0f;

    float crackle = 0.3f;   // 0..1
    float noise = 0.2f;     // 0..1
    float rumble = 0.1f;    // 0..1
    float wear = 0.3f;      // 0..1 (more = darker)
    float speed = 0.5f;     // 0..1 (0.5=33rpm normal)
    float mix = 1.0f;

    XorShift32 rng;
    OnePoleLPF wearFilterL, wearFilterR;
    OnePoleLPF noiseFilter;
    OnePoleLPF rumbleFilter;
    float rumblePhase = 0.0f;
    int crackleCounter = 0;

    void init(float sr) {
        sampleRate = sr;
        rng.state = 2463534242u;
        wearFilterL.clear(); wearFilterR.clear();
        noiseFilter.clear(); rumbleFilter.clear();
        rumblePhase = 0.0f;
        crackleCounter = 0;
        updateWear();
    }

    void updateWear() {
        // More wear = lower cutoff (darker)
        float cutoff = 20000.0f * std::pow(0.1f, wear); // 20kHz (new) to 2kHz (worn)
        cutoff = std::clamp(cutoff, 2000.0f, 20000.0f);
        wearFilterL.setCutoff(cutoff, sampleRate);
        wearFilterR.setCutoff(cutoff, sampleRate);
    }

    void process(const float* inL, const float* inR,
                 float* outL, float* outR, int n)
    {
        updateWear();
        noiseFilter.setCutoff(8000.0f, sampleRate);
        rumbleFilter.setCutoff(60.0f, sampleRate);

        float rumbleInc = 33.33f * speed * 2.0f / sampleRate; // ~33Hz at speed=0.5

        for (int i = 0; i < n; i++) {
            float addL = 0.0f, addR = 0.0f;

            // Crackle: random high-amplitude pops
            if (crackle > 0.001f) {
                crackleCounter--;
                if (crackleCounter <= 0) {
                    // Schedule next crackle
                    crackleCounter = static_cast<int>(rng.nextUFloat() * sampleRate * 0.1f / (crackle + 0.01f));
                    float pop = rng.nextFloat() * crackle * 0.5f;
                    // Short pop with random pan
                    float panR = rng.nextUFloat();
                    addL += pop * (1.0f - panR);
                    addR += pop * panR;
                }
            }

            // Noise: continuous filtered hiss
            if (noise > 0.001f) {
                float raw = rng.nextFloat();
                float filtered = noiseFilter.process(raw);
                float n_level = noise * 0.05f;
                addL += filtered * n_level;
                addR += filtered * n_level * 0.95f + rng.nextFloat() * n_level * 0.05f;
            }

            // Rumble: low-frequency motor noise
            if (rumble > 0.001f) {
                float rumbleRaw = std::sin(rumblePhase * TWO_PI) + rng.nextFloat() * 0.3f;
                float rumbleFiltered = rumbleFilter.process(rumbleRaw);
                float r_level = rumble * 0.08f;
                addL += rumbleFiltered * r_level;
                addR += rumbleFiltered * r_level;
                rumblePhase += rumbleInc;
                if (rumblePhase >= 1.0f) rumblePhase -= 1.0f;
            }

            // Apply wear filter to input signal
            float filteredL = wearFilterL.process(inL[i]);
            float filteredR = wearFilterR.process(inR[i]);

            // Speed affects pitch conceptually but we just apply the artifacts
            float wetL = filteredL + addL;
            float wetR = filteredR + addR;

            outL[i] = inL[i] * (1.0f - mix) + wetL * mix;
            outR[i] = inR[i] * (1.0f - mix) + wetR * mix;
        }
    }
};

static VinylInstance instances[MAX_INSTANCES];
static int findFreeSlot() {
    for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i;
    return -1;
}

extern "C" {

EMSCRIPTEN_KEEPALIVE int vinyl_create(int sampleRate) {
    int s = findFreeSlot(); if (s < 0) return -1;
    instances[s].active = true;
    instances[s].init(static_cast<float>(sampleRate));
    return s;
}

EMSCRIPTEN_KEEPALIVE void vinyl_destroy(int h) {
    if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false;
}

EMSCRIPTEN_KEEPALIVE void vinyl_process(int h, float* inL, float* inR, float* outL, float* outR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (outL && inL) std::memcpy(outL, inL, n * sizeof(float));
        if (outR && inR) std::memcpy(outR, inR, n * sizeof(float));
        return;
    }
    instances[h].process(inL, inR, outL, outR, n);
}

EMSCRIPTEN_KEEPALIVE void vinyl_set_crackle(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].crackle = std::clamp(v, 0.0f, 1.0f);
}

EMSCRIPTEN_KEEPALIVE void vinyl_set_noise(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].noise = std::clamp(v, 0.0f, 1.0f);
}

EMSCRIPTEN_KEEPALIVE void vinyl_set_rumble(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].rumble = std::clamp(v, 0.0f, 1.0f);
}

EMSCRIPTEN_KEEPALIVE void vinyl_set_wear(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].wear = std::clamp(v, 0.0f, 1.0f);
}

EMSCRIPTEN_KEEPALIVE void vinyl_set_speed(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].speed = std::clamp(v, 0.0f, 1.0f);
}

EMSCRIPTEN_KEEPALIVE void vinyl_set_mix(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].mix = std::clamp(v, 0.0f, 1.0f);
}

} // extern "C"
