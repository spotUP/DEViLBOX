/**
 * DeckKeyLockWASM.cpp — WASM wrapper for SoundTouch (Olli Parviainen, LGPLv2.1)
 *
 * Provides pitch-shift-only processing for the DJ deck's audio-buffer (WAV)
 * playback path when Key Lock is ON. The tracker path has native key-lock
 * via replayer.setPitchMultiplier(1.0) + setDetuneCents(0); this wrapper
 * fills the gap for AudioBufferSourceNode playback whose .playbackRate
 * couples pitch and tempo.
 *
 * Usage from the worklet:
 *   1. new SoundTouchProcessor()
 *   2. initialize(sampleRate)
 *   3. setPitchSemiTones(-S) where S = semitones of playbackRate compensation
 *   4. Each block: process(inL, inR, outL, outR, 128)
 *   5. On key-lock OFF: clear() to flush the FIFO, then stop feeding input
 *
 * SoundTouch model: FIFO in, FIFO out. In tempo=1.0, pitch-only mode the
 * long-run input:output ratio is 1:1; short-term startup latency is ~64-128
 * samples. The process() wrapper zero-pads short output blocks so the
 * worklet contract (always returns `numSamples` samples) is honored.
 */

#include "SoundTouch.h"
#include <cstdint>
#include <cstring>
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
        interleaveBuf_.reserve(1024);
        deinterleaveBuf_.reserve(1024);
    }

    ~SoundTouchProcessor() {
        delete st_;
        st_ = nullptr;
    }

    void initialize(int sampleRate) {
        sampleRate_ = sampleRate;
        st_->setSampleRate(static_cast<uint32_t>(sampleRate));
        st_->setChannels(2);
        // Neutral defaults — caller will push setPitchSemiTones when key-lock engages.
        st_->setTempo(1.0);
        st_->setRate(1.0);
        st_->setPitch(1.0);
        // Quality: anti-alias on, SEQUENCE_MS/SEEKWINDOW_MS at library defaults.
        // SETTING_USE_QUICKSEEK=0 favors audio quality over CPU.
        st_->setSetting(SETTING_USE_QUICKSEEK, 0);
        st_->setSetting(SETTING_USE_AA_FILTER, 1);
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
    }

    unsigned int getOutputSamples() {
        return st_->numSamples();
    }

    /**
     * Block processor with interleave/deinterleave and zero-pad.
     * Returns the number of REAL samples produced (before zero-padding).
     * The worklet can use this to detect startup latency if desired, but the
     * output buffers are always fully written to `numSamples`.
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

        // Interleave L/R → stereo frame format SoundTouch expects.
        if (interleaveBuf_.size() < n * 2) interleaveBuf_.resize(n * 2);
        for (size_t i = 0; i < n; ++i) {
            interleaveBuf_[i * 2]     = inL[i];
            interleaveBuf_[i * 2 + 1] = inR[i];
        }
        st_->putSamples(interleaveBuf_.data(), static_cast<uint32_t>(n));

        // Pull up to n samples out.
        if (deinterleaveBuf_.size() < n * 2) deinterleaveBuf_.resize(n * 2);
        uint32_t got = st_->receiveSamples(deinterleaveBuf_.data(), static_cast<uint32_t>(n));

        // De-interleave into outL / outR.
        for (uint32_t i = 0; i < got; ++i) {
            outL[i] = deinterleaveBuf_[i * 2];
            outR[i] = deinterleaveBuf_[i * 2 + 1];
        }
        // Zero-pad any remaining samples so downstream never sees uninitialized
        // memory. Only fires during the first few blocks after init/clear.
        for (size_t i = got; i < n; ++i) {
            outL[i] = 0.0f;
            outR[i] = 0.0f;
        }
        return got;
    }

private:
    SoundTouch* st_;
    int sampleRate_;
    std::vector<float> interleaveBuf_;
    std::vector<float> deinterleaveBuf_;
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
