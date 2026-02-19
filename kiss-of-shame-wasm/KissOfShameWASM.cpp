/**
 * KissOfShame WASM DSP
 *
 * Self-contained C++ port of The Kiss of Shame tape deck emulator.
 * No JUCE dependencies — compiled to WebAssembly via Emscripten.
 *
 * Algorithms ported from TheKissOfShame-main:
 *   - InputSaturation.h  — odd/even harmonic waveshaping + single-pole LP
 *   - Shame.h            — cosine LFO + circular delay (wow + flutter instances)
 *   - HurricaneSandy.h   — LP filter only (bias rolloff)
 *   - Hiss               — PinkNoise synthesis (replaces WAV file)
 *
 * Additions:
 *   - Head bump — peaking EQ at speed-dependent frequency
 *   - Speed selector — 0=S-111 (15 IPS/150Hz bump), 1=A-456 (30 IPS/75Hz bump)
 */

#include <cstdlib>
#include <cstring>
#include <cmath>
#include <algorithm>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

static const float KOS_PI     = 3.14159265358979323846f;
static const float KOS_TWO_PI = 6.28318530717958647692f;

// ============================================================================
// InputSaturation
// Ported from TheKissOfShame-main/Source/AudioProcessing/InputSaturation.h
// Fixed params from AudioGraph.h: threshold=0.0, rateOdd=2.0, rateEven=0.272
// ============================================================================

struct InputSaturation {
    float sr = 44100.0f;
    float coef = 0.0f;
    float priorL = 0.0f;
    float priorR = 0.0f;

    // oddGain=1.0, evenGain=0.3 are the KoS fixed defaults
    static constexpr float oddGain  = 1.0f;
    static constexpr float evenGain = 0.3f;
    static constexpr float rateOdd  = 2.0f;
    static constexpr float rateEven = 0.272f;

    void prepare(float sampleRate) {
        sr = sampleRate;
        // 4kHz LP rolloff matching KoS setFrequencyRolloff(4000)
        float c = KOS_TWO_PI * 4000.0f / sampleRate;
        coef = c < 1.0f ? c : 1.0f;
        priorL = priorR = 0.0f;
    }

    void process(float* L, float* R, int n, float drive, float character) {
        // drive: 0-1 → -18dB to +18dB (KoS setDrive formula)
        const float driveLinear = std::pow(10.0f, (drive * 36.0f - 18.0f) * 0.05f);

        // character: 0-1 blends between KoS default mix and 50/50 odd/even
        const float g = 1.0f / (oddGain + evenGain);
        const float mixOdd  = (1.0f - character) * oddGain  * g + character * 0.5f;
        const float mixEven = (1.0f - character) * evenGain * g + character * 0.5f;

        const float feedback = 1.0f - coef;

        for (int i = 0; i < n; ++i) {
            float xl = L[i];
            float xr = R[i];

            // Odd harmonics: sign(x)*tanh(rateOdd*|x|)  (threshold=0, KoS simplification)
            // Note: in the original KoS, InputSaturation::drive is always 1.0f (setDrive()
            // is never called; the external inputDrive gain hits both paths equally before
            // processInputSaturation is called). Here we expose drive as a user parameter
            // and apply it to the even-harmonic path only — an intentional design extension
            // that makes the drive knob increase even-harmonic character asymmetrically.
            float oddL = (xl >= 0.0f ? 1.0f : -1.0f) * std::tanh(rateOdd * std::abs(xl));
            float oddR = (xr >= 0.0f ? 1.0f : -1.0f) * std::tanh(rateOdd * std::abs(xr));

            // Even harmonics: tanh(rateEven * |x| * driveLinear)
            float evenL = std::tanh(rateEven * std::abs(xl) * driveLinear);
            float evenR = std::tanh(rateEven * std::abs(xr) * driveLinear);

            float outL = mixOdd * oddL + mixEven * evenL;
            float outR = mixOdd * oddR + mixEven * evenR;

            // Single-pole LP at 4kHz
            priorL = coef * outL + feedback * priorL;
            priorR = coef * outR + feedback * priorR;

            L[i] = priorL;
            R[i] = priorR;
        }
    }
};

// ============================================================================
// Shame — cosine LFO + circular delay
// Ported from TheKissOfShame-main/Source/AudioProcessing/Shame.h
// Uses a 256-sample ring buffer (max depth=60 samples, well within 256)
// instead of the original 44100-sample buffer.
// ============================================================================

struct Shame {
    static constexpr int BUF = 256;
    static constexpr int BUF_MASK = BUF - 1;

    float sampleBuf[2][BUF];
    int   writePos = 0;

    float lfoPhase       = 0.0f;
    float rateFluctuation = 0.0f;
    float depth           = 0.5f;
    float rate_hz         = 7.0f;
    float randPeriodicity = 0.5f;

    uint32_t rngState = 987654321u;

    Shame() {
        std::memset(sampleBuf, 0, sizeof(sampleBuf));
    }

    // Xorshift32 PRNG
    float nextRand() {
        rngState ^= rngState << 13;
        rngState ^= rngState >> 17;
        rngState ^= rngState << 5;
        return static_cast<float>(static_cast<int32_t>(rngState)) / 2147483648.0f;
    }

    // Set parameters from 0-1 knob value.
    // isWow=true  → slow (wow) instance — lower rates
    // isWow=false → fast (flutter) instance — uses original KoS Shame curve
    void setInterpolated(float input, bool isWow) {
        if (input < 0.0f) input = 0.0f;
        if (input > 1.0f) input = 1.0f;

        if (isWow) {
            // Wow (slow) — custom curve, lower rates than original KoS
            if (input <= 0.5f) {
                depth           = 5.0f * input / 0.5f;
                rate_hz         = 0.5f + 1.5f * (input / 0.5f);  // 0.5→2 Hz
                randPeriodicity = 0.5f;
            } else if (input <= 0.85f) {
                float t = (input - 0.5f) / (0.85f - 0.5f);
                depth           = 5.0f + 15.0f * t;              // 5→20
                rate_hz         = 2.0f + 1.0f * t;               // 2→3 Hz
                randPeriodicity = 0.5f;
            } else {
                float t = (input - 0.85f) / 0.15f;
                depth           = 20.0f + 10.0f * t;             // 20→30
                rate_hz         = 3.0f - 0.5f * t;               // 3→2.5 Hz
                randPeriodicity = 0.5f;
            }
        } else {
            // Flutter (fast) — mirrors original KoS Shame::setInterpolatedParameters
            if (input <= 0.5f) {
                depth           = 5.0f * input / 0.5f;
                randPeriodicity = 0.5f;
                rate_hz         = 7.0f;
            } else if (input <= 0.85f) {
                float t = (input - 0.5f) / (0.85f - 0.5f);
                depth           = 5.0f + 25.0f * t;              // 5→30
                randPeriodicity = 0.5f - 0.25f * t;
                rate_hz         = 7.0f + 70.0f * t;              // 7→77
            } else {
                float t = (input - 0.85f) / 0.15f;
                depth           = 30.0f + 30.0f * t;             // 30→60
                randPeriodicity = 0.25f + 0.5f * t;
                rate_hz         = 77.0f - 20.0f * t;             // 77→57
            }
        }
    }

    void process(float* L, float* R, int n, float sr) {
        for (int i = 0; i < n; ++i) {
            // Write input to circular buffer
            sampleBuf[0][writePos & BUF_MASK] = L[i];
            sampleBuf[1][writePos & BUF_MASK] = R[i];

            // LFO: 0.5*(cos(phase)-1) → [−1, 0] (unipolar, always negative)
            float lfoVal = 0.5f * (std::cos(lfoPhase) - 1.0f);

            // Advance LFO phase using current effective rate (base + fluctuation).
            // rateFluctuation mirrors KoS Shame.h: chosen randomly each full cycle,
            // applied as an additive offset to the stepping rate (curPos_wTable logic).
            const float effectiveRate = rate_hz + rateFluctuation;
            lfoPhase += effectiveRate * KOS_TWO_PI / sr;
            if (lfoPhase >= KOS_TWO_PI) {
                lfoPhase -= KOS_TWO_PI;
                // New fluctuation chosen at each cycle wrap, bounded by randPeriodicity
                float rnd = nextRand();  // -1..+1
                rateFluctuation = rnd * rate_hz * randPeriodicity;
            }

            // Delay in samples: depth * (-lfoVal) → [0, depth]
            float delay = depth * (-lfoVal);
            float delayFrac = delay - std::floor(delay);
            int   delaySamples = static_cast<int>(delay);

            // Read positions in circular buffer (linear interpolation)
            int readPos0 = (writePos - delaySamples + BUF) & BUF_MASK;
            int readPos1 = (writePos - delaySamples - 1 + BUF) & BUF_MASK;

            L[i] = sampleBuf[0][readPos0] * (1.0f - delayFrac)
                 + sampleBuf[0][readPos1] * delayFrac;
            R[i] = sampleBuf[1][readPos0] * (1.0f - delayFrac)
                 + sampleBuf[1][readPos1] * delayFrac;

            writePos = (writePos + 1) & BUF_MASK;
        }
    }
};

// ============================================================================
// Biquad — second-order filter
// Supports:
//   - Lowpass Butterworth (KoS Biquads.h formula, Direct Form I)
//   - Peaking EQ (Audio EQ Cookbook, Direct Form I)
// ============================================================================

struct Biquad {
    float a0 = 0.0f, a1 = 0.0f, a2 = 0.0f;
    float b1 = 0.0f, b2 = 0.0f;

    // State for two channels
    float x1[2] = {0,0}, x2[2] = {0,0};
    float y1[2] = {0,0}, y2[2] = {0,0};

    // KoS Biquads.h 2nd-order Butterworth lowpass
    // theta = π*fc/sr (matches KoS: theta = fc * PI / sampleRate)
    void setLowpassButterworth(float fc, float sr) {
        float theta = fc * KOS_PI / sr;
        if (theta >= 0.49f * KOS_PI) theta = 0.49f * KOS_PI;
        if (theta <= 0.0f)           theta = 1e-6f;

        const float sqrt2 = 1.41421356f;
        float C  = 1.0f / std::tan(theta);
        float CC = C * C;

        a0 = 1.0f / (1.0f + sqrt2 * C + CC);
        a1 = 2.0f * a0;
        a2 = a0;
        b1 = 2.0f * a0 * (1.0f - CC);
        b2 = a0 * (1.0f - sqrt2 * C + CC);
    }

    // Audio EQ Cookbook peaking EQ
    void setPeakingEQ(float fc, float Q, float dBgain, float sr) {
        float A      = std::pow(10.0f, dBgain / 40.0f);
        float w0     = KOS_TWO_PI * fc / sr;
        float sinW   = std::sin(w0);
        float cosW   = std::cos(w0);
        float alpha  = sinW / (2.0f * Q);

        float b0_raw =  1.0f + alpha * A;
        float b1_raw = -2.0f * cosW;
        float b2_raw =  1.0f - alpha * A;
        float a0_raw =  1.0f + alpha / A;
        float a1_raw = -2.0f * cosW;
        float a2_raw =  1.0f - alpha / A;

        float inv = 1.0f / a0_raw;
        a0 = b0_raw * inv;
        a1 = b1_raw * inv;
        a2 = b2_raw * inv;
        b1 = a1_raw * inv;
        b2 = a2_raw * inv;
    }

    float process(float x, int ch) {
        float y = a0 * x + a1 * x1[ch] + a2 * x2[ch]
                          - b1 * y1[ch] - b2 * y2[ch];
        x2[ch] = x1[ch];
        x1[ch] = x;
        y2[ch] = y1[ch];
        y1[ch] = y;
        return y;
    }
};

// ============================================================================
// PinkNoise — Paul Kellett 7-coefficient approximation
// Replaces the WAV-based Hiss in the original KoS
// ============================================================================

struct PinkNoise {
    float b0=0, b1=0, b2=0, b3=0, b4=0, b5=0, b6=0;
    uint32_t st = 987654321u;

    float white() {
        st ^= st << 13;
        st ^= st >> 17;
        st ^= st << 5;
        return static_cast<float>(static_cast<int32_t>(st)) / 2147483648.0f;
    }

    float tick() {
        float w = white();
        b0 = 0.99886f * b0 + w * 0.0555179f;
        b1 = 0.99332f * b1 + w * 0.0750759f;
        b2 = 0.96900f * b2 + w * 0.1538520f;
        b3 = 0.86650f * b3 + w * 0.3104856f;
        b4 = 0.55000f * b4 + w * 0.5329522f;
        b5 = -0.7616f * b5 - w * 0.0168980f;
        b6 = w * 0.115926f;
        return (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362f) * 0.11f;
    }
};

// ============================================================================
// KissOfShame — main struct
// Signal chain: InputSaturation → BiasLP → HeadBump → +Hiss → Wow → Flutter
// ============================================================================

struct KissOfShame {
    float sr = 44100.0f;

    InputSaturation sat;

    // HurricaneSandy LP (bias rolloff): 22050→2000 Hz
    Biquad biasLpL, biasLpR;

    // Head bump peaking EQ (speed-dependent)
    Biquad headBumpL, headBumpR;

    // Hiss LP shaper at 12kHz
    Biquad hissLpL, hissLpR;

    // Wow (slow) and Flutter (fast) delay modulators
    Shame wow, flutter;

    PinkNoise hissL, hissR;

    float drive     = 0.3f;
    float character = 0.4f;
    float bias      = 0.4f;
    float shameAmt  = 0.2f;
    float hissAmt   = 0.2f;
    int   speed     = 0;   // 0=S-111/15IPS → 150Hz bump, 1=A-456/30IPS → 75Hz bump

    void prepare(float sampleRate) {
        sr = sampleRate;
        sat.prepare(sampleRate);

        updateBias();
        updateHeadBump();
        updateShame();

        // Hiss LP shaper at 12kHz
        hissLpL.setLowpassButterworth(12000.0f, sampleRate);
        hissLpR.setLowpassButterworth(12000.0f, sampleRate);
    }

    void updateBias() {
        // 22050→2000 Hz (bias=0 → bright, bias=1 → dark/muffled)
        float fc = 20050.0f * (1.0f - bias) + 2000.0f;
        biasLpL.setLowpassButterworth(fc, sr);
        biasLpR.setLowpassButterworth(fc, sr);
    }

    void updateHeadBump() {
        // Speed-dependent head bump frequency
        float fc  = (speed == 0) ? 150.0f : 75.0f;
        float Q   = 1.2f;
        float dB  = 4.0f;
        headBumpL.setPeakingEQ(fc, Q, dB, sr);
        headBumpR.setPeakingEQ(fc, Q, dB, sr);
    }

    void updateShame() {
        wow.setInterpolated(shameAmt, true);
        flutter.setInterpolated(shameAmt, false);
    }

    void process(float* inL, float* inR, float* outL, float* outR, int n) {
        // Copy input → output buffers
        std::memcpy(outL, inL, n * sizeof(float));
        std::memcpy(outR, inR, n * sizeof(float));

        // 1. Input saturation (odd/even harmonic waveshaping + LP)
        sat.process(outL, outR, n, drive, character);

        // 2. Bias LP (HurricaneSandy LP) — tape bias rolloff
        for (int i = 0; i < n; ++i) {
            outL[i] = biasLpL.process(outL[i], 0);
            outR[i] = biasLpR.process(outR[i], 0);
        }

        // 3. Head bump peaking EQ
        for (int i = 0; i < n; ++i) {
            outL[i] = headBumpL.process(outL[i], 0);
            outR[i] = headBumpR.process(outR[i], 0);
        }

        // 4. Hiss (pink noise shaped by 12kHz LP)
        //    max level: hissAmt * 0.04 → approx -28 dBFS at hissAmt=1
        const float hissScale = hissAmt * 0.04f;
        for (int i = 0; i < n; ++i) {
            outL[i] += hissLpL.process(hissL.tick() * hissScale, 0);
            outR[i] += hissLpR.process(hissR.tick() * hissScale, 0);
        }

        // 5. Wow (slow pitch modulation)
        wow.process(outL, outR, n, sr);

        // 6. Flutter (fast pitch modulation)
        flutter.process(outL, outR, n, sr);
    }
};

// ============================================================================
// C API — exported to JavaScript
// ============================================================================

extern "C" {

EMSCRIPTEN_KEEPALIVE
void* kiss_of_shame_create(float sampleRate) {
    KissOfShame* kos = new KissOfShame();
    kos->prepare(sampleRate);
    return static_cast<void*>(kos);
}

EMSCRIPTEN_KEEPALIVE
void kiss_of_shame_destroy(void* h) {
    delete static_cast<KissOfShame*>(h);
}

EMSCRIPTEN_KEEPALIVE
void kiss_of_shame_process(void* h, float* iL, float* iR, float* oL, float* oR, int n) {
    static_cast<KissOfShame*>(h)->process(iL, iR, oL, oR, n);
}

EMSCRIPTEN_KEEPALIVE
void kiss_of_shame_set_drive(void* h, float v) {
    static_cast<KissOfShame*>(h)->drive = v;
}

EMSCRIPTEN_KEEPALIVE
void kiss_of_shame_set_character(void* h, float v) {
    static_cast<KissOfShame*>(h)->character = v;
}

EMSCRIPTEN_KEEPALIVE
void kiss_of_shame_set_bias(void* h, float v) {
    KissOfShame* kos = static_cast<KissOfShame*>(h);
    kos->bias = v;
    kos->updateBias();
}

EMSCRIPTEN_KEEPALIVE
void kiss_of_shame_set_shame(void* h, float v) {
    KissOfShame* kos = static_cast<KissOfShame*>(h);
    kos->shameAmt = v;
    kos->updateShame();
}

EMSCRIPTEN_KEEPALIVE
void kiss_of_shame_set_hiss(void* h, float v) {
    static_cast<KissOfShame*>(h)->hissAmt = v;
}

EMSCRIPTEN_KEEPALIVE
void kiss_of_shame_set_speed(void* h, float v) {
    KissOfShame* kos = static_cast<KissOfShame*>(h);
    kos->speed = static_cast<int>(v);
    kos->updateHeadBump();
}

} // extern "C"
