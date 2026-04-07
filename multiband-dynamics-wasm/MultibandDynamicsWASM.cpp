/**
 * MultibandDynamicsWASM.cpp — MultibandDynamics effect for DEViLBOX
 * Build: emcmake cmake .. && emmake make
 */
#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;

struct MultibandDynamicsInstance {
    bool active = false;
    float sampleRate = 48000.0f;

    // Parameters
    float lowCross = 200.0f;
    float highCross = 4000.0f;
    float lowExpThresh = -40.0f;
    float midExpThresh = -40.0f;
    float highExpThresh = -40.0f;
    float lowCompThresh = -12.0f;
    float midCompThresh = -12.0f;
    float highCompThresh = -12.0f;
    float ratio = 4.0f;
    float attack = 10.0f;
    float release = 100.0f;
    float mix = 1.0f;

    // DSP state & methods

    float lpState1L[2]={}, lpState1R[2]={}, lpState2L[2]={}, lpState2R[2]={};
    float lowCoeff=0, highCoeff=0;
    float envLow=0, envMid=0, envHigh=0;
    float attCoeff=0, relCoeff=0;

    void init(float sr) {
        sampleRate = sr;
        std::memset(lpState1L,0,sizeof(lpState1L)); std::memset(lpState1R,0,sizeof(lpState1R));
        std::memset(lpState2L,0,sizeof(lpState2L)); std::memset(lpState2R,0,sizeof(lpState2R));
        envLow = envMid = envHigh = 0.0f;
        updateCoeffs();
    }
    void updateCoeffs() {
        lowCoeff = std::exp(-2.0f * 3.14159265f * lowCross / sampleRate);
        highCoeff = std::exp(-2.0f * 3.14159265f * highCross / sampleRate);
        attCoeff = std::exp(-1.0f / (sampleRate * attack * 0.001f));
        relCoeff = std::exp(-1.0f / (sampleRate * release * 0.001f));
    }
    static float lp1(float in, float& st, float c) { st = in*(1.0f-c)+st*c; return st; }
    static float computeGain(float envDb, float expThresh, float compThresh, float rat) {
        float gain = 0.0f;
        if (envDb < expThresh) gain = (envDb - expThresh) * (rat - 1.0f) / rat;
        else if (envDb > compThresh) gain = (compThresh - envDb) * (1.0f - 1.0f / rat);
        return std::pow(10.0f, gain / 20.0f);
    }
    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        for (int i = 0; i < n; i++) {
            float lowL = lp1(lp1(inL[i],lpState1L[0],lowCoeff),lpState1L[1],lowCoeff);
            float lowR = lp1(lp1(inR[i],lpState1R[0],lowCoeff),lpState1R[1],lowCoeff);
            float restL = inL[i]-lowL, restR = inR[i]-lowR;
            float midL = lp1(lp1(restL,lpState2L[0],highCoeff),lpState2L[1],highCoeff);
            float midR = lp1(lp1(restR,lpState2R[0],highCoeff),lpState2R[1],highCoeff);
            float highL = restL-midL, highR = restR-midR;
            // Envelopes
            float aLow = std::max(std::fabs(lowL),std::fabs(lowR));
            float aMid = std::max(std::fabs(midL),std::fabs(midR));
            float aHigh = std::max(std::fabs(highL),std::fabs(highR));
            envLow = aLow>envLow ? aLow+(envLow-aLow)*attCoeff : aLow+(envLow-aLow)*relCoeff;
            envMid = aMid>envMid ? aMid+(envMid-aMid)*attCoeff : aMid+(envMid-aMid)*relCoeff;
            envHigh = aHigh>envHigh ? aHigh+(envHigh-aHigh)*attCoeff : aHigh+(envHigh-aHigh)*relCoeff;
            float eLdB = 20.0f*std::log10(envLow+1e-30f);
            float eMdB = 20.0f*std::log10(envMid+1e-30f);
            float eHdB = 20.0f*std::log10(envHigh+1e-30f);
            float gL = computeGain(eLdB,lowExpThresh,lowCompThresh,ratio);
            float gM = computeGain(eMdB,midExpThresh,midCompThresh,ratio);
            float gH = computeGain(eHdB,highExpThresh,highCompThresh,ratio);
            float wetL = lowL*gL + midL*gM + highL*gH;
            float wetR = lowR*gL + midR*gM + highR*gH;
            outL[i] = inL[i]*(1.0f-mix) + wetL*mix;
            outR[i] = inR[i]*(1.0f-mix) + wetR*mix;
        }
    }
};

static MultibandDynamicsInstance instances[MAX_INSTANCES];
static int findFreeSlot() {
    for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i;
    return -1;
}

extern "C" {

EMSCRIPTEN_KEEPALIVE int multiband_dynamics_create(int sampleRate) {
    int s = findFreeSlot(); if (s < 0) return -1;
    instances[s].active = true;
    instances[s].init(static_cast<float>(sampleRate));
    return s;
}

EMSCRIPTEN_KEEPALIVE void multiband_dynamics_destroy(int h) {
    if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false;
}

EMSCRIPTEN_KEEPALIVE void multiband_dynamics_process(int h, float* inL, float* inR, float* outL, float* outR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (outL && inL) std::memcpy(outL, inL, n * sizeof(float));
        if (outR && inR) std::memcpy(outR, inR, n * sizeof(float));
        return;
    }
    instances[h].process(inL, inR, outL, outR, n);
}

EMSCRIPTEN_KEEPALIVE void multiband_dynamics_set_lowCross(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].lowCross = std::clamp(v, 20.0f, 1000.0f);
        instances[h].updateCoeffs();
    }
}

EMSCRIPTEN_KEEPALIVE void multiband_dynamics_set_highCross(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].highCross = std::clamp(v, 500.0f, 16000.0f);
        instances[h].updateCoeffs();
    }
}

EMSCRIPTEN_KEEPALIVE void multiband_dynamics_set_lowExpThresh(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].lowExpThresh = std::clamp(v, -60.0f, -10.0f);
    }
}

EMSCRIPTEN_KEEPALIVE void multiband_dynamics_set_midExpThresh(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].midExpThresh = std::clamp(v, -60.0f, -10.0f);
    }
}

EMSCRIPTEN_KEEPALIVE void multiband_dynamics_set_highExpThresh(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].highExpThresh = std::clamp(v, -60.0f, -10.0f);
    }
}

EMSCRIPTEN_KEEPALIVE void multiband_dynamics_set_lowCompThresh(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].lowCompThresh = std::clamp(v, -30.0f, 0.0f);
    }
}

EMSCRIPTEN_KEEPALIVE void multiband_dynamics_set_midCompThresh(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].midCompThresh = std::clamp(v, -30.0f, 0.0f);
    }
}

EMSCRIPTEN_KEEPALIVE void multiband_dynamics_set_highCompThresh(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].highCompThresh = std::clamp(v, -30.0f, 0.0f);
    }
}

EMSCRIPTEN_KEEPALIVE void multiband_dynamics_set_ratio(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].ratio = std::clamp(v, 1.0f, 20.0f);
    }
}

EMSCRIPTEN_KEEPALIVE void multiband_dynamics_set_attack(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].attack = std::clamp(v, 0.1f, 100.0f);
        instances[h].updateCoeffs();
    }
}

EMSCRIPTEN_KEEPALIVE void multiband_dynamics_set_release(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].release = std::clamp(v, 10.0f, 1000.0f);
        instances[h].updateCoeffs();
    }
}

EMSCRIPTEN_KEEPALIVE void multiband_dynamics_set_mix(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].mix = std::clamp(v, 0.0f, 1.0f);
    }
}

} // extern "C"
