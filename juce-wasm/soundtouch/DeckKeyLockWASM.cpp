/**
 * DeckKeyLockWASM.cpp — WASM wrapper for SoundTouch (Olli Parviainen, LGPLv2.1)
 *
 * Provides pitch-shift processing for the DJ deck's AudioBufferSourceNode
 * (WAV) path when Key Lock is ON. The tracker path has native key-lock via
 * replayer.setPitchMultiplier(1.0) + setDetuneCents(0); this wrapper fills
 * the gap for AudioBuffer playback whose .playbackRate couples pitch+tempo.
 *
 * Design contract with the worklet:
 *   - Worklet feeds 128 input frames per process() block.
 *   - Worklet expects 128 output frames back, glitch-free.
 *
 * Why an output FIFO:
 *   SoundTouch's WSOLA/TDStretch stages accumulate an internal ~40 ms
 *   window before producing output. During that warm-up (and briefly
 *   on every pitch/tempo change) receiveSamples() returns fewer samples
 *   than we fed in. A naive wrapper that zero-pads the tail is audible
 *   as rhythmic clicking/stuttering — exactly the "90s timestretch with
 *   gaps" problem the user reported on 2026-04-21. The FIFO decouples
 *   the output cadence from SoundTouch's internal processing: we drain
 *   whatever ST produces into the queue, then serve exactly N frames
 *   per block from the queue. Output lags by a few blocks during
 *   warm-up, then locks to steady-state with no gaps.
 *
 * initialize() primes the pipeline with a short burst of silence so the
 * WSOLA window is already warm when the first real audio arrives — the
 * FIFO accumulates the primed output, and steady-state is reached in 1-2
 * worklet blocks instead of 15+.
 */

#include "SoundTouch.h"
#include <cstdint>
#include <cstring>
#include <deque>
#include <vector>

#ifdef __EMSCRIPTEN__
#include <emscripten/bind.h>
#endif

using soundtouch::SoundTouch;

namespace devilbox {

class SoundTouchProcessor {
public:
    SoundTouchProcessor()
        : st_(new SoundTouch()), sampleRate_(48000)
    {
        interleaveBuf_.reserve(2048);
        drainBuf_.reserve(DRAIN_BATCH * 2);
    }

    ~SoundTouchProcessor() {
        delete st_;
        st_ = nullptr;
    }

    void initialize(int sampleRate) {
        sampleRate_ = sampleRate;
        st_->setSampleRate(static_cast<uint32_t>(sampleRate));
        st_->setChannels(2);
        // Neutral defaults — caller pushes setTempo / setPitchSemiTones when
        // key-lock engages.
        st_->setTempo(1.0);
        st_->setRate(1.0);
        st_->setPitch(1.0);
        // Quality: anti-alias ON, full seek (higher CPU but cleaner result).
        // For DJ use with ±6 semitones range, this is audibly transparent.
        st_->setSetting(SETTING_USE_QUICKSEEK, 0);
        st_->setSetting(SETTING_USE_AA_FILTER, 1);

        // Prime the pipeline: push enough silence to saturate the WSOLA
        // window (default SEQUENCE_MS=40 → 1920 frames at 48kHz). Drain the
        // output immediately so the FIFO starts empty, but the library's
        // internal history is warm. Result: first real audio block produces
        // full-length output; no startup gap.
        const uint32_t PRIME_FRAMES = 4096;
        std::vector<float> silence(PRIME_FRAMES * 2, 0.0f);
        st_->putSamples(silence.data(), PRIME_FRAMES);
        drainToDevNull();

        outputFIFO_.clear();
    }

    void setPitchSemiTones(double semitones) {
        st_->setPitchSemiTones(semitones);
    }

    void setTempo(double tempo) {
        st_->setTempo(tempo);
    }

    void setRate(double rate) {
        st_->setRate(rate);
    }

    void clearBuffer() {
        st_->clear();
        outputFIFO_.clear();
    }

    unsigned int getOutputSamples() {
        // Frames in our FIFO (not stereo samples).
        return static_cast<unsigned int>(outputFIFO_.size() / 2);
    }

    /**
     * Block processor: push N input frames, guarantee N output frames.
     *
     * Flow:
     *   1. Interleave input (planar L/R → stereo frames) and push to ST.
     *   2. Drain all ready output from ST into our FIFO.
     *   3. Pop N frames from the FIFO into planar L/R output.
     *   4. On cold-start, FIFO may have < N frames; zero-pad the tail
     *      (this only happens during the first block or two because
     *      initialize() primes the pipeline).
     *
     * Returns: number of REAL (non-padded) frames written to output,
     *          clamped to numSamples.
     */
    unsigned int processJS(uint32_t inLPtr, uint32_t inRPtr,
                           uint32_t outLPtr, uint32_t outRPtr,
                           int numSamples) {
        if (numSamples <= 0) return 0;
        float* inL  = reinterpret_cast<float*>(static_cast<uintptr_t>(inLPtr));
        float* inR  = reinterpret_cast<float*>(static_cast<uintptr_t>(inRPtr));
        float* outL = reinterpret_cast<float*>(static_cast<uintptr_t>(outLPtr));
        float* outR = reinterpret_cast<float*>(static_cast<uintptr_t>(outRPtr));
        const size_t n = static_cast<size_t>(numSamples);

        // Step 1: interleave & feed SoundTouch.
        if (interleaveBuf_.size() < n * 2) interleaveBuf_.resize(n * 2);
        for (size_t i = 0; i < n; ++i) {
            interleaveBuf_[i * 2]     = inL[i];
            interleaveBuf_[i * 2 + 1] = inR[i];
        }
        st_->putSamples(interleaveBuf_.data(), static_cast<uint32_t>(n));

        // Step 2: drain all ready output into our FIFO.
        drainToFIFO();

        // Step 3: serve n frames from FIFO → planar output.
        const size_t framesAvailable = outputFIFO_.size() / 2;
        const size_t toOutput = framesAvailable < n ? framesAvailable : n;
        for (size_t i = 0; i < toOutput; ++i) {
            outL[i] = outputFIFO_[0];
            outR[i] = outputFIFO_[1];
            outputFIFO_.pop_front();
            outputFIFO_.pop_front();
        }

        // Step 4: zero-pad tail if cold-starting (rare after prime).
        for (size_t i = toOutput; i < n; ++i) {
            outL[i] = 0.0f;
            outR[i] = 0.0f;
        }
        return static_cast<unsigned int>(toOutput);
    }

private:
    static constexpr uint32_t DRAIN_BATCH = 1024;

    SoundTouch* st_;
    int sampleRate_;
    std::vector<float> interleaveBuf_;
    std::vector<float> drainBuf_;
    // Output FIFO holds interleaved stereo frames: [L0,R0,L1,R1,...].
    // deque gives us O(1) push_back + O(1) pop_front. For ~40 ms of
    // buffered audio at 48kHz that's ~3840 floats — trivial memory.
    std::deque<float> outputFIFO_;

    void drainToFIFO() {
        if (drainBuf_.size() < DRAIN_BATCH * 2) drainBuf_.resize(DRAIN_BATCH * 2);
        while (true) {
            const uint32_t got = st_->receiveSamples(drainBuf_.data(), DRAIN_BATCH);
            if (got == 0) break;
            for (uint32_t i = 0; i < got * 2; ++i) {
                outputFIFO_.push_back(drainBuf_[i]);
            }
            if (got < DRAIN_BATCH) break;
        }
    }

    /** Drain ALL pending output into nowhere. Used after priming to empty
     *  the internal queue without flushing WSOLA's warm state. */
    void drainToDevNull() {
        if (drainBuf_.size() < DRAIN_BATCH * 2) drainBuf_.resize(DRAIN_BATCH * 2);
        while (true) {
            const uint32_t got = st_->receiveSamples(drainBuf_.data(), DRAIN_BATCH);
            if (got == 0) break;
        }
    }
};

} // namespace devilbox

#ifdef __EMSCRIPTEN__
EMSCRIPTEN_BINDINGS(SoundTouchProcessor_bindings) {
    emscripten::class_<devilbox::SoundTouchProcessor>("SoundTouchProcessor")
        .constructor<>()
        .function("initialize",         &devilbox::SoundTouchProcessor::initialize)
        .function("setPitchSemiTones",  &devilbox::SoundTouchProcessor::setPitchSemiTones)
        .function("setTempo",           &devilbox::SoundTouchProcessor::setTempo)
        .function("setRate",            &devilbox::SoundTouchProcessor::setRate)
        .function("clearBuffer",        &devilbox::SoundTouchProcessor::clearBuffer)
        .function("getOutputSamples",   &devilbox::SoundTouchProcessor::getOutputSamples)
        .function("process",            &devilbox::SoundTouchProcessor::processJS);
}
#endif
