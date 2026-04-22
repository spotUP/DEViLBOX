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
        // √Hann: sqrt(0.5 * (1 - cos(2π i / (N-1)))).
        //
        // Why √Hann and not Hann? We apply this window on BOTH analysis
        // and synthesis (in ResonanceTamerEffect). Combined: √Hann × √Hann
        // = Hann. Sum of Hann at 50 % overlap (hop N/2) = 1.0 constant —
        // perfect OLA reconstruction.
        //
        // Alternative pairings cause audible artifacts:
        //   - Hann analysis + rectangular synthesis: modified frames
        //     produce boundary clicks at hop rate (47 Hz stutter).
        //   - Hann analysis + Hann synthesis: OLA sum is Hann² which
        //     varies 0.5..1.0 → ~47 Hz amplitude modulation.
        // √Hann on both sides gives the best of both: the synthesis
        // taper kills boundary clicks; the combined Hann sums to constant.
        const float phase = (2.0f * 3.14159265358979323846f * static_cast<float>(i))
                          / static_cast<float>(STFT::FFT_SIZE - 1);
        const float hann = 0.5f * (1.0f - std::cos(phase));
        s_hannWindow[i] = std::sqrt(hann);
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
        ++totalInputWritten_;
    }
}

const float* STFT::pullFrame() {
    // Gate 1: input ring must be fully populated once before any frame is
    // readable (first pull needs FFT_SIZE samples).
    if (totalInputWritten_ < FFT_SIZE) return nullptr;

    // Gate 2: each subsequent pull must be exactly one hop (HOP_SIZE new
    // samples) after the previous pull. Without this check, the first pull
    // could be followed immediately by a second pull reading the same ring
    // contents — two frames with identical content committed at different
    // OLA positions, corrupting the first second of output.
    if (firstPullDone_) {
        const size_t advanced = totalInputWritten_ - totalInputAtLastPull_;
        if (advanced < HOP_SIZE) return nullptr;
    }

    // Walk the ring from the oldest sample (at inputWritePos_ — next slot to
    // be overwritten) forward FFT_SIZE positions to reach the newest.
    size_t readPos = inputWritePos_;
    const float* hann = window();
    for (size_t i = 0; i < FFT_SIZE; ++i) {
        frameBuf_[i] = inputRing_[readPos] * hann[i];
        readPos = (readPos + 1) % FFT_SIZE;
    }
    totalInputAtLastPull_ = totalInputWritten_;
    firstPullDone_ = true;
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
    inputWritePos_        = 0;
    outputReadPos_        = 0;
    outputWritePos_       = 0;
    totalInputWritten_    = 0;
    totalInputAtLastPull_ = 0;
    firstPullDone_        = false;
}

} // namespace devilbox
