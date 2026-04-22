/**
 * STFT.h — minimal overlap-add analysis/synthesis helper for the Resonance
 * Tamer. Not a general-purpose STFT: fixed 2048 / hop 1024 / Hann window.
 *
 * Contract with the caller:
 *   - push() feeds N input samples into the analysis ring buffer.
 *   - pullFrame() returns a pointer to a complete 2048-sample Hann-windowed
 *     frame + the frame index, or null if the next frame is not ready yet.
 *   - commit() receives a 2048-sample modified frame (from inverse FFT)
 *     and overlap-adds it into the output ring.
 *   - pop() drains N output samples. Matches the input rate in steady state.
 *
 * The caller runs FFT/IFFT between pullFrame() and commit().
 *
 * Internal delay: one hop (1024 samples = ~21 ms at 48 kHz).
 */
#pragma once
#include <vector>
#include <cstddef>

namespace devilbox {

class STFT {
public:
    static constexpr size_t FFT_SIZE = 2048;
    static constexpr size_t HOP_SIZE = 1024;

    STFT();

    /** Push one block of input samples (length = numSamples). */
    void push(const float* in, size_t numSamples);

    /** Returns a pointer to FFT_SIZE-length Hann-windowed frame ready for
     *  analysis, OR nullptr if not enough new samples accumulated yet.
     *  The buffer is owned by STFT; copy before calling pullFrame again. */
    const float* pullFrame();

    /** Overlap-add the modified (windowed) frame back into the output ring. */
    void commit(const float* frame);

    /** Drain numSamples of output. Output ring auto-zeroes after read. */
    void pop(float* out, size_t numSamples);

    /** Flush all internal state (on bypass disengage). */
    void clear();

    static const float* window();  // shared Hann window

private:
    std::vector<float> inputRing_;   // accumulates input samples
    std::vector<float> frameBuf_;    // FFT_SIZE windowed frame handed to caller
    std::vector<float> outputRing_;  // overlap-add accumulator
    size_t inputWritePos_ = 0;        // next write index in input ring (mod FFT_SIZE)
    size_t outputReadPos_ = 0;        // next read index in output ring
    size_t outputWritePos_ = 0;       // write head (aligned to frame starts)
    size_t totalInputWritten_ = 0;    // running sample counter since construction
    // Sample count at the most recent successful pullFrame. A pull only
    // succeeds when `totalInputWritten_ - totalInputAtLastPull_ >= HOP_SIZE`,
    // which guarantees each frame advances the read position by exactly
    // one hop relative to the previous frame — even when the first frame
    // is pulled from a 2048-sample backlog that would otherwise satisfy
    // the guard twice in a row.
    size_t totalInputAtLastPull_ = 0;
    bool   firstPullDone_ = false;
};

} // namespace devilbox
