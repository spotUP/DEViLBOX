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
    size_t inputFrameStart_ = 0;      // read index of the last frame we handed out
    size_t samplesSincePull_ = 0;     // counts new samples since last pullFrame
    size_t outputReadPos_ = 0;        // next read index in output ring
    size_t outputWritePos_ = 0;       // write head (aligned to frame starts)
    size_t totalInputWritten_ = 0;    // running sample counter for frame alignment
};

} // namespace devilbox
