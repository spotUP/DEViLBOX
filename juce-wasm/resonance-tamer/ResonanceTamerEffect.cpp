/**
 * ResonanceTamerEffect.cpp — adaptive multi-notch resonance suppressor.
 *
 * Detects resonant peaks in the spectrum relative to a long-time average
 * and dynamically attenuates them. Sits on the master bus; user sees one
 * "Amount" knob (with optional "Character" selector). Soothe-style target,
 * but simpler — no psychoacoustic modelling, just honest STFT peak-detect
 * + per-bin dynamic gain.
 *
 * Algorithm per frame:
 *   1. STFT analysis frame (Hann, 2048, hop 1024).
 *   2. Compute magnitude per bin → 1025 real bins for 2048 real input.
 *   3. Update per-bin long-time average (EMA, τ ≈ 10 s).
 *   4. For each bin: excess = max(0, |X| − avg · (1 + threshold)).
 *      The more a bin sticks out above its own long-term average, the
 *      more gain reduction we apply.
 *   5. Smooth gain-reduction across adjacent bins (3-bin box) so notches
 *      are shaped, not single-bin spikes that ring.
 *   6. Apply per-bin gain envelope (attack/release). Each bin has its own
 *      smoothed gain-reduction value that tracks the target.
 *   7. Synthesis window + IFFT + OLA back to time domain.
 *
 * "Amount" knob maps to: threshold (how far above average before ducking
 * starts) and max_reduction (how hard to duck). 0 % = passthrough;
 * 100 % = aggressive.
 */

#include "WASMEffectBase.h"
#include "STFT.h"

extern "C" {
#include "kiss_fftr.h"
}

#include <cmath>
#include <cstring>
#include <algorithm>
#include <vector>

namespace devilbox {

enum ResonanceTamerParam {
    PARAM_AMOUNT     = 0,  // 0..1 — primary "dial it in" knob
    PARAM_CHARACTER  = 1,  // 0=Transparent, 1=Warm, 2=Bright (encoded 0..1)
    PARAM_MIX        = 2,  // 0..1 — dry/wet (1 = full processed)
    PARAM_COUNT      = 3,
};

static const char* PARAM_NAMES[PARAM_COUNT] = { "Amount", "Character", "Mix" };
static const float PARAM_MINS[PARAM_COUNT]  = { 0.0f, 0.0f, 0.0f };
static const float PARAM_MAXS[PARAM_COUNT]  = { 1.0f, 1.0f, 1.0f };
static const float PARAM_DEFS[PARAM_COUNT]  = { 0.35f, 0.0f, 1.0f };

constexpr size_t FFT_SIZE = STFT::FFT_SIZE;
constexpr size_t NUM_BINS = FFT_SIZE / 2 + 1;

class ResonanceTamerEffect : public WASMEffectBase {
public:
    ResonanceTamerEffect()
        : fftCfg_(kiss_fftr_alloc(FFT_SIZE, 0, nullptr, nullptr)),
          ifftCfg_(kiss_fftr_alloc(FFT_SIZE, 1, nullptr, nullptr))
    {
        // Long-time average — per-bin EMA of magnitude. Starts at tiny
        // positive so divide-by-zero never fires; the first ~5 s of playback
        // converges the average to the real spectrum shape.
        avgMag_.assign(NUM_BINS, 1e-6f);
        // Per-bin smoothed gain-reduction state (0 dB = 1.0 = no cut).
        binGain_.assign(NUM_BINS, 1.0f);
        spectrumRe_.resize(NUM_BINS * 2);   // kiss_fftr complex: [re,im,re,im,...]
        spectrumIm_.resize(NUM_BINS * 2);
        fftIn_.resize(FFT_SIZE);
        fftOutR_.resize(NUM_BINS);
        fftOutI_.resize(NUM_BINS);
        ifftOut_.resize(FFT_SIZE);
        synthWin_.resize(FFT_SIZE);
        processed_.resize(FFT_SIZE);

        const float* hann = STFT::window();
        // Synthesis window = analysis window (perfect Hann OLA at hop 1024 → scale 0.5).
        // The extra 1/FFT_SIZE compensates kiss_fftr's unnormalised inverse.
        const float synthScale = 1.0f / static_cast<float>(FFT_SIZE);
        for (size_t i = 0; i < FFT_SIZE; ++i) {
            synthWin_[i] = hann[i] * synthScale;
        }

        for (int i = 0; i < PARAM_COUNT; ++i) params_[i] = PARAM_DEFS[i];
    }

    ~ResonanceTamerEffect() override {
        if (fftCfg_)  free(fftCfg_);
        if (ifftCfg_) free(ifftCfg_);
    }

    void initialize(int sampleRate) override {
        WASMEffectBase::initialize(sampleRate);
        // Average-time constant: 10 s. per-sample α = 1 - exp(-1/(τ·fs)).
        // Use per-frame α because we update once per 1024-sample hop.
        const float tauSeconds = 10.0f;
        const float hopsPerSec = static_cast<float>(sampleRate) / static_cast<float>(STFT::HOP_SIZE);
        avgAlpha_ = 1.0f - std::exp(-1.0f / (tauSeconds * hopsPerSec));

        // Attack/release in frames, not samples — we update gain once per hop.
        // 20 ms attack (bin responds quickly to rising resonance), 200 ms
        // release (holds the notch for musical transitions rather than
        // chattering). Both tuned by ear on broadband music.
        attackAlpha_  = 1.0f - std::exp(-1.0f / (0.020f * hopsPerSec));
        releaseAlpha_ = 1.0f - std::exp(-1.0f / (0.200f * hopsPerSec));
    }

    void process(float* inL, float* inR,
                 float* outL, float* outR, int numSamples) override {
        numSamples = std::min(numSamples, DEFAULT_BLOCK_SIZE * 4);

        if (!isInitialized_ || !fftCfg_ || !ifftCfg_) {
            if (inL != outL) std::memcpy(outL, inL, numSamples * sizeof(float));
            if (inR != outR) std::memcpy(outR, inR, numSamples * sizeof(float));
            return;
        }

        // We process stereo as a single mid-signal through the detector
        // (so both channels see the SAME notches — preserves stereo image)
        // while applying the computed gain to each channel independently.
        // This matches what Soothe does: detect on summed, process on each.

        // Mix to mid for the analysis side only.
        midIn_.resize(numSamples);
        for (int i = 0; i < numSamples; ++i) {
            midIn_[i] = 0.5f * (inL[i] + inR[i]);
        }

        // Push mid into STFT; process every hop that pulls a frame.
        analysisSTFT_.push(midIn_.data(), numSamples);
        // We also need the ORIGINAL L/R to pass through per-bin gain, so
        // push them into their own STFTs.
        leftSTFT_.push(inL,  numSamples);
        rightSTFT_.push(inR, numSamples);

        // Pull as many frames as are ready this block.
        while (true) {
            const float* midFrame = analysisSTFT_.pullFrame();
            if (!midFrame) break;
            const float* lFrame = leftSTFT_.pullFrame();
            const float* rFrame = rightSTFT_.pullFrame();
            // Paranoid: the three STFTs should be in sync. If any returns
            // null while mid returns a frame, drain and skip — the next
            // block will realign.
            if (!lFrame || !rFrame) break;

            processFrame(midFrame, lFrame, rFrame);
        }

        // Pop the processed frames out.
        procL_.resize(numSamples);
        procR_.resize(numSamples);
        leftSTFT_.pop(procL_.data(), numSamples);
        rightSTFT_.pop(procR_.data(), numSamples);
        // Drain the mid STFT so it stays aligned with L/R (we don't use
        // its output, but its ring buffer must advance).
        midDrain_.resize(numSamples);
        analysisSTFT_.pop(midDrain_.data(), numSamples);

        // Dry/wet mix.
        const float wet = params_[PARAM_MIX];
        const float dry = 1.0f - wet;
        for (int i = 0; i < numSamples; ++i) {
            outL[i] = inL[i] * dry + procL_[i] * wet;
            outR[i] = inR[i] * dry + procR_[i] * wet;
        }
    }

    void setParameter(int id, float v) override {
        if (id < 0 || id >= PARAM_COUNT) return;
        params_[id] = clamp(v, PARAM_MINS[id], PARAM_MAXS[id]);
    }
    float getParameter(int id) const override {
        if (id < 0 || id >= PARAM_COUNT) return 0.0f;
        return params_[id];
    }
    int getParameterCount() const override { return PARAM_COUNT; }
    const char* getParameterName(int id) const override {
        return (id >= 0 && id < PARAM_COUNT) ? PARAM_NAMES[id] : "";
    }
    float getParameterMin(int id) const override { return (id >= 0 && id < PARAM_COUNT) ? PARAM_MINS[id] : 0.0f; }
    float getParameterMax(int id) const override { return (id >= 0 && id < PARAM_COUNT) ? PARAM_MAXS[id] : 1.0f; }
    float getParameterDefault(int id) const override { return (id >= 0 && id < PARAM_COUNT) ? PARAM_DEFS[id] : 0.0f; }

private:
    kiss_fftr_cfg fftCfg_;
    kiss_fftr_cfg ifftCfg_;

    STFT analysisSTFT_;
    STFT leftSTFT_;
    STFT rightSTFT_;

    std::vector<float>         avgMag_;     // per-bin long-time EMA (NUM_BINS)
    std::vector<float>         binGain_;    // per-bin smoothed gain (NUM_BINS)
    std::vector<kiss_fft_cpx>  spectrumRe_; // scratch complex spectrum
    std::vector<kiss_fft_cpx>  spectrumIm_;
    std::vector<float>         fftIn_;
    std::vector<float>         fftOutR_;
    std::vector<float>         fftOutI_;
    std::vector<float>         ifftOut_;
    std::vector<float>         synthWin_;
    std::vector<float>         processed_;
    std::vector<float>         midIn_;
    std::vector<float>         procL_;
    std::vector<float>         procR_;
    std::vector<float>         midDrain_;

    float params_[PARAM_COUNT];
    float avgAlpha_     = 0.01f;
    float attackAlpha_  = 0.3f;
    float releaseAlpha_ = 0.03f;

    void processFrame(const float* midFrame, const float* lFrame, const float* rFrame) {
        // 1) Analysis FFT on the mid frame to get detection spectrum.
        // kiss_fftr expects already-windowed real input; midFrame is
        // pre-windowed by STFT::pullFrame (multiplied by Hann).
        std::vector<kiss_fft_cpx> midSpec(NUM_BINS);
        kiss_fftr(fftCfg_, midFrame, midSpec.data());

        // 2) Compute magnitudes and update per-bin long-time average.
        std::vector<float> mag(NUM_BINS);
        for (size_t i = 0; i < NUM_BINS; ++i) {
            const float re = midSpec[i].r;
            const float im = midSpec[i].i;
            mag[i] = std::sqrt(re * re + im * im);
            avgMag_[i] = avgMag_[i] + avgAlpha_ * (mag[i] - avgMag_[i]);
        }

        // 3) Compute per-bin target gain reduction.
        const float amount = params_[PARAM_AMOUNT];
        // Threshold mapping: Amount=0 → 12 dB above average triggers (never);
        //                    Amount=1 → 0 dB above average triggers (any
        //                                bin sticking out at all).
        const float thresholdRatio = std::pow(10.0f, (12.0f * (1.0f - amount)) / 20.0f);
        // Max cut in dB: Amount=0 → 0 dB (no cut),
        //                Amount=1 → 12 dB (aggressive).
        const float maxCutDb = 12.0f * amount;
        const float minGain  = std::pow(10.0f, -maxCutDb / 20.0f);

        // Character: Warm widens the smoothing; Bright gates low freqs.
        const int character = static_cast<int>(params_[PARAM_CHARACTER] * 2.999f); // 0..2
        const float sampleRate = static_cast<float>(sampleRate_);
        const float hzPerBin = sampleRate / static_cast<float>(FFT_SIZE);
        const int brightMinBin = (character == 2) // Bright: only above 3 kHz
            ? static_cast<int>(3000.0f / hzPerBin)
            : 0;
        const int smoothWidth = (character == 1) ? 5 : 3; // Warm: wider smoothing

        std::vector<float> targetGain(NUM_BINS, 1.0f);
        for (size_t i = 1; i < NUM_BINS - 1; ++i) {  // skip DC and Nyquist
            if (static_cast<int>(i) < brightMinBin) {
                targetGain[i] = 1.0f;
                continue;
            }
            const float floor = avgMag_[i] * thresholdRatio;
            if (mag[i] > floor && avgMag_[i] > 1e-5f) {
                // Gain reduction proportional to how much it sticks out,
                // clamped to minGain. Using inverse ratio so slight peaks
                // get gentle cuts and big spikes get harder cuts.
                const float excessRatio = mag[i] / floor;  // >= 1
                const float gain = 1.0f / (1.0f + (excessRatio - 1.0f) * 0.5f);
                targetGain[i] = std::max(gain, minGain);
            }
        }

        // 4) Smooth target gain across adjacent bins (box filter).
        std::vector<float> smoothed(NUM_BINS, 1.0f);
        const int half = smoothWidth / 2;
        for (size_t i = 0; i < NUM_BINS; ++i) {
            float sum = 0.0f;
            int count = 0;
            for (int d = -half; d <= half; ++d) {
                const int idx = static_cast<int>(i) + d;
                if (idx < 0 || idx >= static_cast<int>(NUM_BINS)) continue;
                sum += targetGain[idx];
                ++count;
            }
            smoothed[i] = (count > 0) ? (sum / count) : 1.0f;
        }

        // 5) Per-bin attack/release envelope — move binGain_ toward target.
        for (size_t i = 0; i < NUM_BINS; ++i) {
            const float target = smoothed[i];
            const float alpha = (target < binGain_[i]) ? attackAlpha_ : releaseAlpha_;
            binGain_[i] += alpha * (target - binGain_[i]);
        }

        // 6) Apply gains to L and R independently (frame-by-frame),
        //    then IFFT and synthesis-window + OLA.
        applyGainAndSynth(lFrame, &leftSTFT_);
        applyGainAndSynth(rFrame, &rightSTFT_);
    }

    void applyGainAndSynth(const float* frame, STFT* outSTFT) {
        std::vector<kiss_fft_cpx> spec(NUM_BINS);
        kiss_fftr(fftCfg_, frame, spec.data());

        for (size_t i = 0; i < NUM_BINS; ++i) {
            spec[i].r *= binGain_[i];
            spec[i].i *= binGain_[i];
        }

        kiss_fftri(ifftCfg_, spec.data(), ifftOut_.data());

        // Synthesis-window the IFFT output (Hann · 1/N) before OLA.
        for (size_t i = 0; i < FFT_SIZE; ++i) {
            processed_[i] = ifftOut_[i] * synthWin_[i];
        }
        outSTFT->commit(processed_.data());
    }
};

#ifdef __EMSCRIPTEN__
EXPORT_WASM_EFFECT(ResonanceTamerEffect)
#endif

} // namespace devilbox
