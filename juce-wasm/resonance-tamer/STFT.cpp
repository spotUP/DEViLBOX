#include "STFT.h"
#include <cmath>
#include <cstring>
#include <algorithm>

namespace devilbox {

// Shared Hann window — generated once, read-only.
static float s_hannWindow[STFT::FFT_SIZE];
static bool  s_hannInit = false;

static void ensureHann() {
    if (s_hannInit) return;
    for (size_t i = 0; i < STFT::FFT_SIZE; ++i) {
        // Hann: 0.5 * (1 - cos(2π i / (N-1))).
        // With 50 % overlap this gives perfect OLA reconstruction on
        // unmodified frames (sum of squared Hann windows = 1 at hop 1024).
        const float phase = (2.0f * 3.14159265358979323846f * static_cast<float>(i))
                          / static_cast<float>(STFT::FFT_SIZE - 1);
        s_hannWindow[i] = 0.5f * (1.0f - std::cos(phase));
    }
    s_hannInit = true;
}

const float* STFT::window() {
    ensureHann();
    return s_hannWindow;
}

STFT::STFT()
    : inputRing_(FFT_SIZE, 0.0f),
      frameBuf_(FFT_SIZE, 0.0f),
      outputRing_(FFT_SIZE * 2, 0.0f)
{
    ensureHann();
}

void STFT::push(const float* in, size_t n) {
    for (size_t i = 0; i < n; ++i) {
        inputRing_[inputWritePos_] = in[i];
        inputWritePos_ = (inputWritePos_ + 1) % FFT_SIZE;
        ++samplesSincePull_;
        ++totalInputWritten_;
    }
}

const float* STFT::pullFrame() {
    // Need to have accumulated at least one hop since the previous pull,
    // AND the input ring must be filled once (first pull waits for FFT_SIZE).
    if (totalInputWritten_ < FFT_SIZE) return nullptr;
    if (samplesSincePull_ < HOP_SIZE) return nullptr;

    // Read the last FFT_SIZE samples from the ring, oldest first.
    // Ring is circular; the oldest sample is at inputWritePos_ (next write
    // overwrites the oldest). Walk FFT_SIZE forward from there.
    size_t readPos = inputWritePos_;
    const float* hann = window();
    for (size_t i = 0; i < FFT_SIZE; ++i) {
        frameBuf_[i] = inputRing_[readPos] * hann[i];
        readPos = (readPos + 1) % FFT_SIZE;
    }
    samplesSincePull_ -= HOP_SIZE;
    return frameBuf_.data();
}

void STFT::commit(const float* frame) {
    // OLA the modified frame back into outputRing_ at outputWritePos_.
    // The frame is expected to be ALREADY windowed (synthesis window).
    const size_t ringLen = outputRing_.size();
    for (size_t i = 0; i < FFT_SIZE; ++i) {
        const size_t idx = (outputWritePos_ + i) % ringLen;
        outputRing_[idx] += frame[i];
    }
    // Advance write head by one hop — next commit overlaps by FFT_SIZE - HOP.
    outputWritePos_ = (outputWritePos_ + HOP_SIZE) % ringLen;
}

void STFT::pop(float* out, size_t n) {
    const size_t ringLen = outputRing_.size();
    for (size_t i = 0; i < n; ++i) {
        out[i] = outputRing_[outputReadPos_];
        // Zero after read so the OLA accumulator drains cleanly.
        outputRing_[outputReadPos_] = 0.0f;
        outputReadPos_ = (outputReadPos_ + 1) % ringLen;
    }
}

void STFT::clear() {
    std::fill(inputRing_.begin(),  inputRing_.end(),  0.0f);
    std::fill(frameBuf_.begin(),   frameBuf_.end(),   0.0f);
    std::fill(outputRing_.begin(), outputRing_.end(), 0.0f);
    inputWritePos_     = 0;
    inputFrameStart_   = 0;
    samplesSincePull_  = 0;
    outputReadPos_     = 0;
    outputWritePos_    = 0;
    totalInputWritten_ = 0;
}

} // namespace devilbox
