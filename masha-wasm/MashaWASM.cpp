/**
 * MashaWASM.cpp — Beat grinder / stutter effect
 *
 * Records a chunk of audio and loops it when active. When inactive,
 * passes audio through. Creates glitch/stutter effects.
 *
 * Build: cd masha-wasm/build && emcmake cmake .. && emmake make
 */

#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;
static constexpr int MAX_BUFFER_SAMPLES = 24000; // 500ms at 48kHz

struct MashaInstance {
    bool active = false;
    float sampleRate = 48000.0f;

    float time = 100.0f;        // ms (10..500)
    float volume = 1.0f;        // loop volume (0..1)
    float passthrough = 0.0f;   // blend original (0..1)
    int stutterActive = 0;      // 0 = off, 1 = on
    float mix = 1.0f;

    float bufferL[MAX_BUFFER_SAMPLES] = {};
    float bufferR[MAX_BUFFER_SAMPLES] = {};
    int writePos = 0;
    int readPos = 0;
    int chunkLen = 4800;        // samples for current chunk
    bool recording = false;
    bool hasRecorded = false;

    void init(float sr) {
        sampleRate = sr;
        writePos = 0;
        readPos = 0;
        chunkLen = static_cast<int>(time * 0.001f * sampleRate);
        recording = false;
        hasRecorded = false;
        std::memset(bufferL, 0, sizeof(bufferL));
        std::memset(bufferR, 0, sizeof(bufferR));
    }

    void process(const float* inL, const float* inR,
                 float* outL, float* outR, int n)
    {
        chunkLen = std::clamp(static_cast<int>(time * 0.001f * sampleRate),
                               1, MAX_BUFFER_SAMPLES);

        for (int i = 0; i < n; i++) {
            if (stutterActive) {
                if (!recording && !hasRecorded) {
                    // Start recording
                    recording = true;
                    writePos = 0;
                }

                if (recording) {
                    bufferL[writePos] = inL[i];
                    bufferR[writePos] = inR[i];
                    writePos++;
                    if (writePos >= chunkLen) {
                        recording = false;
                        hasRecorded = true;
                        readPos = 0;
                    }
                    // While recording, pass through input
                    outL[i] = inL[i];
                    outR[i] = inR[i];
                } else if (hasRecorded) {
                    // Loop the recorded buffer
                    float loopL = bufferL[readPos] * volume;
                    float loopR = bufferR[readPos] * volume;
                    readPos = (readPos + 1) % chunkLen;

                    float wetL = loopL + inL[i] * passthrough;
                    float wetR = loopR + inR[i] * passthrough;

                    outL[i] = inL[i] * (1.0f - mix) + wetL * mix;
                    outR[i] = inR[i] * (1.0f - mix) + wetR * mix;
                } else {
                    outL[i] = inL[i];
                    outR[i] = inR[i];
                }
            } else {
                // Not active — reset state and pass through
                if (hasRecorded || recording) {
                    hasRecorded = false;
                    recording = false;
                    writePos = 0;
                    readPos = 0;
                }
                outL[i] = inL[i];
                outR[i] = inR[i];
            }
        }
    }
};

static MashaInstance instances[MAX_INSTANCES];
static int findFreeSlot() {
    for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i;
    return -1;
}

extern "C" {

EMSCRIPTEN_KEEPALIVE int masha_create(int sampleRate) {
    int s = findFreeSlot(); if (s < 0) return -1;
    instances[s].active = true;
    instances[s].init(static_cast<float>(sampleRate));
    return s;
}

EMSCRIPTEN_KEEPALIVE void masha_destroy(int h) {
    if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false;
}

EMSCRIPTEN_KEEPALIVE void masha_process(int h, float* inL, float* inR, float* outL, float* outR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (outL && inL) std::memcpy(outL, inL, n * sizeof(float));
        if (outR && inR) std::memcpy(outR, inR, n * sizeof(float));
        return;
    }
    instances[h].process(inL, inR, outL, outR, n);
}

EMSCRIPTEN_KEEPALIVE void masha_set_time(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].time = std::clamp(v, 10.0f, 500.0f);
}

EMSCRIPTEN_KEEPALIVE void masha_set_volume(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].volume = std::clamp(v, 0.0f, 1.0f);
}

EMSCRIPTEN_KEEPALIVE void masha_set_passthrough(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].passthrough = std::clamp(v, 0.0f, 1.0f);
}

EMSCRIPTEN_KEEPALIVE void masha_set_active(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].stutterActive = (v >= 0.5f) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE void masha_set_mix(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].mix = std::clamp(v, 0.0f, 1.0f);
}

} // extern "C"
