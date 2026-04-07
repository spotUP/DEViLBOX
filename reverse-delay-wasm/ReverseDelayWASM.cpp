#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;
static constexpr int MAX_DELAY_SAMPLES = 96000; // 2s at 48kHz

struct ReverseDelayInstance {
    bool active = false;
    float sampleRate = 48000.0f;

    // Parameters
    float time = 500.0f;    // ms (10-2000)
    float feedback = 0.3f;  // 0-0.95
    float mix = 0.5f;       // 0-1

    // State - record buffer and playback
    float bufL[MAX_DELAY_SAMPLES] = {};
    float bufR[MAX_DELAY_SAMPLES] = {};
    int writePos = 0;
    int blockSize = 0;      // delay time in samples
    int readPos = 0;        // counts down within current block
    bool blockReady = false; // have we filled a full block?
    int samplesWritten = 0;  // samples written to current block

    // Feedback buffer (mixed back in)
    float fbL = 0.0f;
    float fbR = 0.0f;

    void init(float sr) {
        sampleRate = sr;
        updateBlockSize();
        writePos = 0;
        readPos = 0;
        blockReady = false;
        samplesWritten = 0;
        fbL = fbR = 0.0f;
        std::memset(bufL, 0, sizeof(bufL));
        std::memset(bufR, 0, sizeof(bufR));
    }

    void updateBlockSize() {
        blockSize = std::clamp(static_cast<int>(time * 0.001f * sampleRate), 1, MAX_DELAY_SAMPLES);
    }

    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        for (int i = 0; i < n; i++) {
            // Write input + feedback into record buffer
            float inSampleL = inL[i] + fbL * feedback;
            float inSampleR = inR[i] + fbR * feedback;

            bufL[writePos] = inSampleL;
            bufR[writePos] = inSampleR;
            writePos++;
            samplesWritten++;

            // Check if we've filled a block
            if (samplesWritten >= blockSize) {
                blockReady = true;
                // readPos starts at end of written block, reads backwards
                readPos = writePos - 1;
                samplesWritten = 0;
            }

            // Wrap write position
            if (writePos >= MAX_DELAY_SAMPLES) writePos = 0;

            // Read reversed output
            float wetL = 0.0f, wetR = 0.0f;
            if (blockReady) {
                int rp = readPos;
                if (rp < 0) rp += MAX_DELAY_SAMPLES;
                wetL = bufL[rp];
                wetR = bufR[rp];
                fbL = wetL;
                fbR = wetR;
                readPos--;
                if (readPos < 0) readPos += MAX_DELAY_SAMPLES;
            }

            outL[i] = inL[i] * (1.0f - mix) + wetL * mix;
            outR[i] = inR[i] * (1.0f - mix) + wetR * mix;
        }
    }
};

static ReverseDelayInstance instances[MAX_INSTANCES];
static int findFree() { for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i; return -1; }

extern "C" {

EMSCRIPTEN_KEEPALIVE int reverse_delay_create(int sr) {
    int s = findFree();
    if (s < 0) return -1;
    instances[s].active = true;
    instances[s].init(static_cast<float>(sr));
    return s;
}

EMSCRIPTEN_KEEPALIVE void reverse_delay_destroy(int h) {
    if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false;
}

EMSCRIPTEN_KEEPALIVE void reverse_delay_process(int h, float* iL, float* iR, float* oL, float* oR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (oL && iL) std::memcpy(oL, iL, n * 4);
        if (oR && iR) std::memcpy(oR, iR, n * 4);
        return;
    }
    instances[h].process(iL, iR, oL, oR, n);
}

EMSCRIPTEN_KEEPALIVE void reverse_delay_set_time(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].time = std::clamp(v, 10.0f, 2000.0f);
        instances[h].updateBlockSize();
    }
}

EMSCRIPTEN_KEEPALIVE void reverse_delay_set_feedback(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active)
        instances[h].feedback = std::clamp(v, 0.0f, 0.95f);
}

EMSCRIPTEN_KEEPALIVE void reverse_delay_set_mix(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active)
        instances[h].mix = std::clamp(v, 0.0f, 1.0f);
}

} // extern "C"
