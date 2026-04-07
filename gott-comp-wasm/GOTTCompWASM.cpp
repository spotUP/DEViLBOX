/**
 * GOTTCompWASM.cpp — GOTTComp effect for DEViLBOX
 * Build: emcmake cmake .. && emmake make
 */
#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;

struct GOTTCompInstance {
    bool active = false;
    float sampleRate = 48000.0f;

    // Parameters
    float lowCross = 200.0f;
    float highCross = 4000.0f;
    float lowThresh = -18.0f;
    float midThresh = -18.0f;
    float highThresh = -18.0f;
    float lowRatio = 4.0f;
    float midRatio = 4.0f;
    float highRatio = 4.0f;
    float attack = 10.0f;
    float release = 100.0f;
    float mix = 1.0f;

    // DSP state & methods

    float lp1L[2]={}, lp1R[2]={}, lp2L[2]={}, lp2R[2]={};
    float lowCoeff=0, highCoeff=0;
    float envLow=0, envMid=0, envHigh=0;
    float attCoeff=0, relCoeff=0;

    void init(float sr) {
        sampleRate=sr;
        std::memset(lp1L,0,sizeof(lp1L)); std::memset(lp1R,0,sizeof(lp1R));
        std::memset(lp2L,0,sizeof(lp2L)); std::memset(lp2R,0,sizeof(lp2R));
        envLow=envMid=envHigh=0;
        updateCoeffs();
    }
    void updateCoeffs() {
        lowCoeff=std::exp(-2.0f*3.14159265f*lowCross/sampleRate);
        highCoeff=std::exp(-2.0f*3.14159265f*highCross/sampleRate);
        attCoeff=std::exp(-1.0f/(sampleRate*attack*0.001f));
        relCoeff=std::exp(-1.0f/(sampleRate*release*0.001f));
    }
    static float lp(float in,float&st,float c){st=in*(1.0f-c)+st*c;return st;}
    static float compGain(float envDb, float thresh, float rat) {
        if (envDb <= thresh) return 1.0f;
        float over = envDb - thresh;
        // Soft knee (2dB)
        float knee = 2.0f;
        float gainDb;
        if (over < knee) {
            gainDb = -over * over / (2.0f * knee) * (1.0f - 1.0f/rat);
        } else {
            gainDb = -(over - knee/2.0f) * (1.0f - 1.0f/rat);
        }
        return std::pow(10.0f, gainDb/20.0f);
    }
    static float autoMakeup(float thresh, float rat) {
        float reduction = -thresh * (1.0f - 1.0f/rat) * 0.5f;
        return std::pow(10.0f, reduction/20.0f);
    }
    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        float mkL=autoMakeup(lowThresh,lowRatio);
        float mkM=autoMakeup(midThresh,midRatio);
        float mkH=autoMakeup(highThresh,highRatio);
        for (int i=0; i<n; i++) {
            float lowL=lp(lp(inL[i],lp1L[0],lowCoeff),lp1L[1],lowCoeff);
            float lowR=lp(lp(inR[i],lp1R[0],lowCoeff),lp1R[1],lowCoeff);
            float restL=inL[i]-lowL, restR=inR[i]-lowR;
            float midL=lp(lp(restL,lp2L[0],highCoeff),lp2L[1],highCoeff);
            float midR=lp(lp(restR,lp2R[0],highCoeff),lp2R[1],highCoeff);
            float hiL=restL-midL, hiR=restR-midR;
            float aL=std::max(std::fabs(lowL),std::fabs(lowR));
            float aM=std::max(std::fabs(midL),std::fabs(midR));
            float aH=std::max(std::fabs(hiL),std::fabs(hiR));
            envLow=aL>envLow?aL+(envLow-aL)*attCoeff:aL+(envLow-aL)*relCoeff;
            envMid=aM>envMid?aM+(envMid-aM)*attCoeff:aM+(envMid-aM)*relCoeff;
            envHigh=aH>envHigh?aH+(envHigh-aH)*attCoeff:aH+(envHigh-aH)*relCoeff;
            float gL=compGain(20.0f*std::log10(envLow+1e-30f),lowThresh,lowRatio)*mkL;
            float gM=compGain(20.0f*std::log10(envMid+1e-30f),midThresh,midRatio)*mkM;
            float gH=compGain(20.0f*std::log10(envHigh+1e-30f),highThresh,highRatio)*mkH;
            float wetL=lowL*gL+midL*gM+hiL*gH;
            float wetR=lowR*gL+midR*gM+hiR*gH;
            outL[i]=inL[i]*(1.0f-mix)+wetL*mix;
            outR[i]=inR[i]*(1.0f-mix)+wetR*mix;
        }
    }
};

static GOTTCompInstance instances[MAX_INSTANCES];
static int findFreeSlot() {
    for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i;
    return -1;
}

extern "C" {

EMSCRIPTEN_KEEPALIVE int gott_comp_create(int sampleRate) {
    int s = findFreeSlot(); if (s < 0) return -1;
    instances[s].active = true;
    instances[s].init(static_cast<float>(sampleRate));
    return s;
}

EMSCRIPTEN_KEEPALIVE void gott_comp_destroy(int h) {
    if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false;
}

EMSCRIPTEN_KEEPALIVE void gott_comp_process(int h, float* inL, float* inR, float* outL, float* outR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (outL && inL) std::memcpy(outL, inL, n * sizeof(float));
        if (outR && inR) std::memcpy(outR, inR, n * sizeof(float));
        return;
    }
    instances[h].process(inL, inR, outL, outR, n);
}

EMSCRIPTEN_KEEPALIVE void gott_comp_set_lowCross(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].lowCross = std::clamp(v, 20.0f, 1000.0f);
        instances[h].updateCoeffs();
    }
}

EMSCRIPTEN_KEEPALIVE void gott_comp_set_highCross(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].highCross = std::clamp(v, 500.0f, 16000.0f);
        instances[h].updateCoeffs();
    }
}

EMSCRIPTEN_KEEPALIVE void gott_comp_set_lowThresh(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].lowThresh = std::clamp(v, -60.0f, 0.0f);
    }
}

EMSCRIPTEN_KEEPALIVE void gott_comp_set_midThresh(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].midThresh = std::clamp(v, -60.0f, 0.0f);
    }
}

EMSCRIPTEN_KEEPALIVE void gott_comp_set_highThresh(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].highThresh = std::clamp(v, -60.0f, 0.0f);
    }
}

EMSCRIPTEN_KEEPALIVE void gott_comp_set_lowRatio(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].lowRatio = std::clamp(v, 1.0f, 20.0f);
    }
}

EMSCRIPTEN_KEEPALIVE void gott_comp_set_midRatio(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].midRatio = std::clamp(v, 1.0f, 20.0f);
    }
}

EMSCRIPTEN_KEEPALIVE void gott_comp_set_highRatio(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].highRatio = std::clamp(v, 1.0f, 20.0f);
    }
}

EMSCRIPTEN_KEEPALIVE void gott_comp_set_attack(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].attack = std::clamp(v, 0.1f, 100.0f);
        instances[h].updateCoeffs();
    }
}

EMSCRIPTEN_KEEPALIVE void gott_comp_set_release(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].release = std::clamp(v, 10.0f, 1000.0f);
        instances[h].updateCoeffs();
    }
}

EMSCRIPTEN_KEEPALIVE void gott_comp_set_mix(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].mix = std::clamp(v, 0.0f, 1.0f);
    }
}

} // extern "C"
