#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;

struct OnePoleLP {
    float coeff = 0.0f;
    float z1L = 0.0f, z1R = 0.0f;

    void setFreq(float freq, float sr) {
        float w = 2.0f * 3.14159265f * freq / sr;
        coeff = 1.0f - std::exp(-w);
    }
    void reset() { z1L = z1R = 0.0f; }
};

struct DistortionShaperInstance {
    bool active = false;
    float sampleRate = 48000.0f;
    float inputGain = 1.0f;
    float point1x = -0.5f, point1y = -0.5f;
    float point2x = 0.5f, point2y = 0.5f;
    float outputGain = 1.0f;
    float preLpfFreq = 20000.0f;
    float postLpfFreq = 20000.0f;
    float mix = 1.0f;
    OnePoleLP preFilt, postFilt;

    void init(float sr) {
        sampleRate = sr;
        preFilt.reset(); postFilt.reset();
        preFilt.setFreq(preLpfFreq, sr);
        postFilt.setFreq(postLpfFreq, sr);
    }

    // Piecewise cubic Hermite interpolation for the transfer function
    // Fixed points: (-1,-1) and (1,1) — identity at extremes
    // User control points: (point1x, point1y) and (point2x, point2y)
    float transferFunction(float x) {
        x = std::clamp(x, -1.0f, 1.0f);

        // Sort control points with the fixed endpoints
        // We have 4 points: (-1,-1), (p1x,p1y), (p2x,p2y), (1,1)
        // Use cubic Hermite between segments
        float px[4] = { -1.0f, point1x, point2x, 1.0f };
        float py[4] = { -1.0f, point1y, point2y, 1.0f };

        // Ensure x-coordinates are ordered
        if (px[1] > px[2]) {
            std::swap(px[1], px[2]);
            std::swap(py[1], py[2]);
        }
        px[1] = std::clamp(px[1], -0.99f, px[2] - 0.01f);
        px[2] = std::clamp(px[2], px[1] + 0.01f, 0.99f);

        // Find which segment x falls in
        int seg;
        if (x <= px[1]) seg = 0;
        else if (x <= px[2]) seg = 1;
        else seg = 2;

        float x0 = px[seg], x1 = px[seg + 1];
        float y0 = py[seg], y1 = py[seg + 1];
        float dx = x1 - x0;
        if (dx < 0.001f) return y0;

        float t = (x - x0) / dx;

        // Estimate tangents using Catmull-Rom style
        float m0, m1;
        if (seg > 0) m0 = (py[seg + 1] - py[seg - 1]) / (px[seg + 1] - px[seg - 1]);
        else m0 = (y1 - y0) / dx;

        if (seg < 2) m1 = (py[seg + 2] - py[seg]) / (px[seg + 2] - px[seg]);
        else m1 = (y1 - y0) / dx;

        // Scale tangents by segment length
        m0 *= dx;
        m1 *= dx;

        // Cubic Hermite
        float t2 = t * t, t3 = t2 * t;
        float h00 = 2.0f * t3 - 3.0f * t2 + 1.0f;
        float h10 = t3 - 2.0f * t2 + t;
        float h01 = -2.0f * t3 + 3.0f * t2;
        float h11 = t3 - t2;

        return std::clamp(h00 * y0 + h10 * m0 + h01 * y1 + h11 * m1, -1.0f, 1.0f);
    }

    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        for (int i = 0; i < n; i++) {
            float dryL = inL[i], dryR = inR[i];
            float sL = inL[i] * inputGain;
            float sR = inR[i] * inputGain;

            // Pre LPF
            preFilt.z1L += preFilt.coeff * (sL - preFilt.z1L); sL = preFilt.z1L;
            preFilt.z1R += preFilt.coeff * (sR - preFilt.z1R); sR = preFilt.z1R;

            // Apply transfer function
            sL = transferFunction(sL);
            sR = transferFunction(sR);

            // Output gain
            sL *= outputGain;
            sR *= outputGain;

            // Post LPF
            postFilt.z1L += postFilt.coeff * (sL - postFilt.z1L); sL = postFilt.z1L;
            postFilt.z1R += postFilt.coeff * (sR - postFilt.z1R); sR = postFilt.z1R;

            // Mix
            outL[i] = dryL + mix * (sL - dryL);
            outR[i] = dryR + mix * (sR - dryR);
        }
    }
};

static DistortionShaperInstance instances[MAX_INSTANCES];
static int findFree() { for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i; return -1; }

extern "C" {

EMSCRIPTEN_KEEPALIVE int distortion_shaper_create(int sr) {
    int s = findFree(); if (s < 0) return -1;
    instances[s] = DistortionShaperInstance{};
    instances[s].active = true;
    instances[s].init(static_cast<float>(sr));
    return s;
}

EMSCRIPTEN_KEEPALIVE void distortion_shaper_destroy(int h) {
    if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false;
}

EMSCRIPTEN_KEEPALIVE void distortion_shaper_process(int h, float* iL, float* iR, float* oL, float* oR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (oL && iL) std::memcpy(oL, iL, n * 4);
        if (oR && iR) std::memcpy(oR, iR, n * 4);
        return;
    }
    instances[h].process(iL, iR, oL, oR, n);
}

EMSCRIPTEN_KEEPALIVE void distortion_shaper_set_inputGain(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active)
        instances[h].inputGain = std::clamp(v, 0.0f, 4.0f);
}

EMSCRIPTEN_KEEPALIVE void distortion_shaper_set_point1x(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active)
        instances[h].point1x = std::clamp(v, -1.0f, 1.0f);
}

EMSCRIPTEN_KEEPALIVE void distortion_shaper_set_point1y(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active)
        instances[h].point1y = std::clamp(v, -1.0f, 1.0f);
}

EMSCRIPTEN_KEEPALIVE void distortion_shaper_set_point2x(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active)
        instances[h].point2x = std::clamp(v, -1.0f, 1.0f);
}

EMSCRIPTEN_KEEPALIVE void distortion_shaper_set_point2y(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active)
        instances[h].point2y = std::clamp(v, -1.0f, 1.0f);
}

EMSCRIPTEN_KEEPALIVE void distortion_shaper_set_outputGain(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active)
        instances[h].outputGain = std::clamp(v, 0.0f, 4.0f);
}

EMSCRIPTEN_KEEPALIVE void distortion_shaper_set_preLpf(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].preLpfFreq = std::clamp(v, 200.0f, 20000.0f);
        instances[h].preFilt.setFreq(instances[h].preLpfFreq, instances[h].sampleRate);
    }
}

EMSCRIPTEN_KEEPALIVE void distortion_shaper_set_postLpf(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].postLpfFreq = std::clamp(v, 200.0f, 20000.0f);
        instances[h].postFilt.setFreq(instances[h].postLpfFreq, instances[h].sampleRate);
    }
}

EMSCRIPTEN_KEEPALIVE void distortion_shaper_set_mix(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active)
        instances[h].mix = std::clamp(v, 0.0f, 1.0f);
}

}
