/**
 * TubeAmpWASM.cpp — Tube amplifier simulation for DEViLBOX
 *
 * Models a classic tube amp signal chain:
 *   Pre-gain → Asymmetric tube waveshaper → 3-band tone stack → Power amp sag → Master
 *
 * The waveshaper uses tanh with a DC bias to produce the even-harmonic
 * asymmetric distortion characteristic of real tube amps.
 *
 * Build: emcmake cmake .. && emmake make
 */

#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;
static constexpr float PI = 3.14159265358979323846f;

// ─── Biquad filter (for tone stack) ─────────────────────────────────────────

struct Biquad {
    float b0, b1, b2, a1, a2;
    float z1L, z2L, z1R, z2R;

    Biquad() : b0(1), b1(0), b2(0), a1(0), a2(0),
               z1L(0), z2L(0), z1R(0), z2R(0) {}

    void setLowShelf(float freq, float gainDb, float Q, float sr) {
        float A = std::pow(10.0f, gainDb / 40.0f);
        float w0 = 2.0f * PI * freq / sr;
        float cosw = std::cos(w0), sinw = std::sin(w0);
        float alpha = sinw / (2.0f * Q);
        float sqA = std::sqrt(A);
        float t = (A + 1.0f) - (A - 1.0f) * cosw;
        float u = (A + 1.0f) + (A - 1.0f) * cosw;
        float v = 2.0f * sqA * alpha;
        b0 = A * (t + v);
        b1 = 2.0f * A * ((A - 1.0f) - (A + 1.0f) * cosw);
        b2 = A * (t - v);
        float a0 = u + v;
        a1 = -2.0f * ((A - 1.0f) + (A + 1.0f) * cosw);
        a2 = u - v;
        float inv = 1.0f / a0;
        b0 *= inv; b1 *= inv; b2 *= inv; a1 *= inv; a2 *= inv;
    }

    void setPeaking(float freq, float gainDb, float Q, float sr) {
        float A = std::pow(10.0f, gainDb / 40.0f);
        float w0 = 2.0f * PI * freq / sr;
        float cosw = std::cos(w0), sinw = std::sin(w0);
        float alpha = sinw / (2.0f * Q);
        b0 = 1.0f + alpha * A;
        b1 = -2.0f * cosw;
        b2 = 1.0f - alpha * A;
        float a0 = 1.0f + alpha / A;
        a1 = -2.0f * cosw;
        a2 = 1.0f - alpha / A;
        float inv = 1.0f / a0;
        b0 *= inv; b1 *= inv; b2 *= inv; a1 *= inv; a2 *= inv;
    }

    void setHighShelf(float freq, float gainDb, float Q, float sr) {
        float A = std::pow(10.0f, gainDb / 40.0f);
        float w0 = 2.0f * PI * freq / sr;
        float cosw = std::cos(w0), sinw = std::sin(w0);
        float alpha = sinw / (2.0f * Q);
        float sqA = std::sqrt(A);
        float t = (A + 1.0f) + (A - 1.0f) * cosw;
        float u = (A + 1.0f) - (A - 1.0f) * cosw;
        float v = 2.0f * sqA * alpha;
        b0 = A * (t + v);
        b1 = -2.0f * A * ((A - 1.0f) + (A + 1.0f) * cosw);
        b2 = A * (t - v);
        float a0 = u + v;
        a1 = 2.0f * ((A - 1.0f) - (A + 1.0f) * cosw);
        a2 = u - v;
        float inv = 1.0f / a0;
        b0 *= inv; b1 *= inv; b2 *= inv; a1 *= inv; a2 *= inv;
    }

    float processL(float in) {
        float out = b0 * in + z1L;
        z1L = b1 * in - a1 * out + z2L;
        z2L = b2 * in - a2 * out;
        return out;
    }

    float processR(float in) {
        float out = b0 * in + z1R;
        z1R = b1 * in - a1 * out + z2R;
        z2R = b2 * in - a2 * out;
        return out;
    }
};

// ─── Tube Amp Instance ──────────────────────────────────────────────────────

struct TubeAmpInstance {
    bool active = false;
    float sampleRate = 48000.0f;

    // Parameters (all 0-1)
    float drive = 0.5f;
    float bass = 0.5f;
    float mid = 0.5f;
    float treble = 0.5f;
    float presence = 0.5f;
    float master = 0.5f;
    float sag = 0.3f;

    // Tone stack filters
    Biquad bassFilter;     // Low shelf at 150 Hz
    Biquad midFilter;      // Peaking at 800 Hz
    Biquad trebleFilter;   // High shelf at 3000 Hz
    Biquad presenceFilter; // Peaking at 5000 Hz

    // Power amp sag envelope follower
    float sagEnvL = 0, sagEnvR = 0;
    float sagAttack, sagRelease;

    // DC blocker
    float dcInL = 0, dcOutL = 0;
    float dcInR = 0, dcOutR = 0;

    void init(float sr) {
        sampleRate = sr;
        sagAttack = 1.0f - std::exp(-1.0f / (sr * 0.002f));  // 2ms attack
        sagRelease = 1.0f - std::exp(-1.0f / (sr * 0.1f));   // 100ms release
        sagEnvL = sagEnvR = 0;
        dcInL = dcOutL = dcInR = dcOutR = 0;
        updateToneStack();
    }

    void updateToneStack() {
        // Map 0-1 params to dB gain range (-12..+12 dB)
        float bassDb = (bass - 0.5f) * 24.0f;
        float midDb = (mid - 0.5f) * 24.0f;
        float trebleDb = (treble - 0.5f) * 24.0f;
        float presDb = (presence - 0.5f) * 16.0f;

        bassFilter.setLowShelf(150.0f, bassDb, 0.707f, sampleRate);
        midFilter.setPeaking(800.0f, midDb, 1.5f, sampleRate);
        trebleFilter.setHighShelf(3000.0f, trebleDb, 0.707f, sampleRate);
        presenceFilter.setPeaking(5000.0f, presDb, 2.0f, sampleRate);
    }

    // Asymmetric tube waveshaper — positive half clips harder (even harmonics)
    static float tubeWaveshape(float x) {
        float bias = 0.1f;
        float biased = x + bias;
        // Soft clipping with asymmetry
        float shaped = std::tanh(biased * 1.5f);
        // Add subtle even-harmonic content via half-wave rectification blend
        float even = (shaped + std::fabs(shaped)) * 0.25f;
        return shaped * 0.8f + even * 0.2f;
    }

    float dcBlock(float in, float& prevIn, float& prevOut) {
        float out = in - prevIn + 0.9995f * prevOut;
        prevIn = in;
        prevOut = out;
        return out;
    }

    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        // Pre-gain: drive 0→1 maps to gain 1→50 (exponential)
        float preGain = 1.0f + drive * drive * 49.0f;
        float masterGain = master * master; // quadratic taper

        for (int i = 0; i < n; i++) {
            // Pre-gain stage
            float sL = inL[i] * preGain;
            float sR = inR[i] * preGain;

            // Tube waveshaper
            sL = tubeWaveshape(sL);
            sR = tubeWaveshape(sR);

            // Tone stack
            sL = bassFilter.processL(sL);
            sR = bassFilter.processR(sR);
            sL = midFilter.processL(sL);
            sR = midFilter.processR(sR);
            sL = trebleFilter.processL(sL);
            sR = trebleFilter.processR(sR);
            sL = presenceFilter.processL(sL);
            sR = presenceFilter.processR(sR);

            // Power amp sag — envelope-following gain reduction
            float absL = std::fabs(sL);
            float absR = std::fabs(sR);
            float coeffL = absL > sagEnvL ? sagAttack : sagRelease;
            float coeffR = absR > sagEnvR ? sagAttack : sagRelease;
            sagEnvL += coeffL * (absL - sagEnvL);
            sagEnvR += coeffR * (absR - sagEnvR);

            float sagGainL = 1.0f - sag * sagEnvL * 0.5f;
            float sagGainR = 1.0f - sag * sagEnvR * 0.5f;
            sagGainL = std::max(sagGainL, 0.3f);
            sagGainR = std::max(sagGainR, 0.3f);

            sL *= sagGainL;
            sR *= sagGainR;

            // Master volume
            sL *= masterGain;
            sR *= masterGain;

            // DC blocker
            sL = dcBlock(sL, dcInL, dcOutL);
            sR = dcBlock(sR, dcInR, dcOutR);

            outL[i] = sL;
            outR[i] = sR;
        }
    }
};

static TubeAmpInstance instances[MAX_INSTANCES];
static int findFree() { for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i; return -1; }

extern "C" {

EMSCRIPTEN_KEEPALIVE int tube_amp_create(int sr) {
    int s = findFree(); if (s < 0) return -1;
    instances[s].active = true; instances[s].init(static_cast<float>(sr)); return s;
}
EMSCRIPTEN_KEEPALIVE void tube_amp_destroy(int h) { if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false; }
EMSCRIPTEN_KEEPALIVE void tube_amp_process(int h, float* iL, float* iR, float* oL, float* oR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) { if (oL && iL) std::memcpy(oL, iL, n*4); if (oR && iR) std::memcpy(oR, iR, n*4); return; }
    instances[h].process(iL, iR, oL, oR, n);
}
EMSCRIPTEN_KEEPALIVE void tube_amp_set_drive(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].drive = std::clamp(v, 0.0f, 1.0f); }
EMSCRIPTEN_KEEPALIVE void tube_amp_set_bass(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].bass = std::clamp(v, 0.0f, 1.0f); instances[h].updateToneStack(); } }
EMSCRIPTEN_KEEPALIVE void tube_amp_set_mid(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].mid = std::clamp(v, 0.0f, 1.0f); instances[h].updateToneStack(); } }
EMSCRIPTEN_KEEPALIVE void tube_amp_set_treble(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].treble = std::clamp(v, 0.0f, 1.0f); instances[h].updateToneStack(); } }
EMSCRIPTEN_KEEPALIVE void tube_amp_set_presence(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].presence = std::clamp(v, 0.0f, 1.0f); instances[h].updateToneStack(); } }
EMSCRIPTEN_KEEPALIVE void tube_amp_set_master(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].master = std::clamp(v, 0.0f, 1.0f); }
EMSCRIPTEN_KEEPALIVE void tube_amp_set_sag(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].sag = std::clamp(v, 0.0f, 1.0f); }

} // extern "C"
