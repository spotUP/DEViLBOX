/**
 * SorcerWASM.cpp - OpenAV Sorcer wavetable synth → WASMSynthBase adapter
 *
 * Wraps the FAUST-generated Sorcer DSP for use in DEViLBOX's VSTBridge framework.
 * Sorcer is GPL2 licensed. Original by OpenAV Productions.
 *
 * Architecture:
 *   SorcerSynth (WASMSynthBase)
 *     +-- mydsp[16]  -- per-voice FAUST DSP instances (mono, with built-in ADSR)
 *
 * The original Sorcer is monophonic with a single gate/freq/gain input.
 * We create 16 instances for polyphony, each with independent note state.
 *
 * Parameters use "Group:Name" naming for VSTBridgePanel auto-grouping.
 * 21 user-facing params across 6 groups.
 */

#include "../common/WASMSynthBase.h"
#include "../common/WASMExports.h"

#include <cmath>
#include <cstring>
#include <algorithm>

using std::min;
using std::max;

// ============================================================================
// FAUST power templates
// ============================================================================
#ifndef FAUSTPOWER
#define FAUSTPOWER
template <int N> inline float faustpower(float x)   { return powf(x, N); }
template <int N> inline double faustpower(double x)  { return pow(x, N); }
template <int N> inline int faustpower(int x)        { return faustpower<N/2>(x) * faustpower<N-N/2>(x); }
template <>      inline int faustpower<0>(int x)     { return 1; }
template <>      inline int faustpower<1>(int x)     { return x; }
#endif

#ifndef FAUSTFLOAT
#define FAUSTFLOAT float
#endif

// ============================================================================
// Sorcer wavetable data (from wavetables/*.h)
// ============================================================================
#include "wavetable_shout_0.h"
#include "wavetable_shout_100.h"
#include "wavetable_sqwak_0.h"
#include "wavetable_sqwak_100.h"

static float* wave1 = shout_0::wavetable;
static float* wave2 = shout_100::wavetable;
static float* wave3 = sqwak_0::wavetable;
static float* wave4 = sqwak_100::wavetable;

static inline float wavetable1(int index) { return wave1[index]; }
static inline float wavetable2(int index) { return wave2[index]; }
static inline float wavetable3(int index) { return wave3[index]; }
static inline float wavetable4(int index) { return wave4[index]; }

// ============================================================================
// Helpers (from faust/helpers.h — clip function)
// ============================================================================
static inline float clip(float low, float high, float sig) {
    if (sig > high) sig = high;
    if (sig < low) sig = low;
    return sig;
}

// ============================================================================
// FAUST dsp base class (minimal)
// ============================================================================
class dsp {
protected:
    int fSamplingFreq;
public:
    dsp() : fSamplingFreq(0) {}
    virtual ~dsp() {}
    virtual int getNumInputs() = 0;
    virtual int getNumOutputs() = 0;
    virtual void init(int samplingRate) = 0;
    virtual void compute(int len, float** inputs, float** outputs) = 0;
};

// ============================================================================
// FAUST-generated Sorcer DSP (from sorcer-master/faust/main.cpp lines 407-696)
// Modification: all members public for direct parameter access from wrapper
// ============================================================================
class mydsp : public dsp {
public:
    class SIG0 {
    private:
        int fSamplingFreq;
        int iRec2[2];
    public:
        int getNumInputs()  { return 0; }
        int getNumOutputs() { return 1; }
        void init(int samplingFreq) {
            fSamplingFreq = samplingFreq;
            for (int i = 0; i < 2; i++) iRec2[i] = 0;
        }
        void fill(int count, float output[]) {
            for (int i = 0; i < count; i++) {
                iRec2[0] = (1 + iRec2[1]);
                output[i] = sinf((9.587379924285257e-05f * float((iRec2[0] - 1))));
                iRec2[1] = iRec2[0];
            }
        }
    };

    int    iConst0;
    float  fConst1;
    float  fConst2;
    FAUSTFLOAT fslider0;   // filter1cutoff
    float  fConst3;
    float  fRec1[2];
    static float ftbl0[65536];
    FAUSTFLOAT fslider1;   // lfo1freq
    float  fConst4;
    float  fConst5;
    float  fRec3[2];
    FAUSTFLOAT fslider2;   // filter1lfo1range
    FAUSTFLOAT fslider3;   // lfo1amp
    float  fConst6;
    FAUSTFLOAT fslider4;   // compThreshold
    FAUSTFLOAT fentry0;    // freq (Hz, MIDI-controlled)
    float  fConst7;
    float  fRec9[2];
    FAUSTFLOAT fslider5;   // osc3vol
    FAUSTFLOAT fslider6;   // lfo1_wavetable2pos
    FAUSTFLOAT fslider7;   // wavetable2pos
    FAUSTFLOAT fslider8;   // osc2vol
    FAUSTFLOAT fslider9;   // lfo1_wavetable1pos
    FAUSTFLOAT fslider10;  // wavetable1pos
    FAUSTFLOAT fslider11;  // osc1vol
    float  fRec8[3];
    float  fRec7[3];
    FAUSTFLOAT fbutton0;   // gate (MIDI-controlled)
    int    iRec10[2];
    FAUSTFLOAT fslider12;  // sustain
    FAUSTFLOAT fslider13;  // release
    FAUSTFLOAT fslider14;  // decay
    FAUSTFLOAT fslider15;  // attack
    float  fRec11[2];
    FAUSTFLOAT fslider16;  // compressorEnable
    FAUSTFLOAT fslider17;  // vol
    FAUSTFLOAT fentry1;    // gain (MIDI-controlled)
    FAUSTFLOAT fslider18;  // compRelease
    float  fConst8;
    float  fRec6[2];
    FAUSTFLOAT fslider19;  // compAttack
    float  fRec5[2];
    float  fConst9;
    float  fRec4[2];
    FAUSTFLOAT fslider20;  // compMakeup
    float  fRec0[2];
    FAUSTFLOAT fbargraph0;

    static void classInit(int samplingFreq) {
        SIG0 sig0;
        sig0.init(samplingFreq);
        sig0.fill(65536, ftbl0);
    }

    virtual int getNumInputs()  { return 0; }
    virtual int getNumOutputs() { return 1; }

    virtual void instanceInit(int samplingFreq) {
        fSamplingFreq = samplingFreq;
        iConst0 = min(192000, max(1, fSamplingFreq));
        fConst1 = (96.0f / float(iConst0));
        fConst2 = expf((0 - (16.666666666666668f / float(iConst0))));
        fslider0 = 1.0f;
        fConst3 = (1.0f - fConst2);
        for (int i = 0; i < 2; i++) fRec1[i] = 0;
        fslider1 = 0.3f;
        fConst4 = float(iConst0);
        fConst5 = (float(10) / fConst4);
        for (int i = 0; i < 2; i++) fRec3[i] = 0;
        fslider2 = 0.0f;
        fslider3 = 0.1f;
        fConst6 = (3.141592653589793f / float(iConst0));
        fslider4 = 0.0f;
        fentry0 = 2e+01f;
        fConst7 = (0.5f / fConst4);
        for (int i = 0; i < 2; i++) fRec9[i] = 0;
        fslider5 = 0.3f;
        fslider6 = 0.0f;
        fslider7 = 0.0f;
        fslider8 = 0.3f;
        fslider9 = 0.0f;
        fslider10 = 0.0f;
        fslider11 = 0.3f;
        for (int i = 0; i < 3; i++) fRec8[i] = 0;
        for (int i = 0; i < 3; i++) fRec7[i] = 0;
        fbutton0 = 0.0;
        for (int i = 0; i < 2; i++) iRec10[i] = 0;
        fslider12 = 1.0f;
        fslider13 = 0.2f;
        fslider14 = 0.3f;
        fslider15 = 0.01f;
        for (int i = 0; i < 2; i++) fRec11[i] = 0;
        fslider16 = 0.0f;
        fslider17 = 0.3f;
        fentry1 = 0.3f;
        fslider18 = 0.0f;
        fConst8 = (2.0f / float(iConst0));
        for (int i = 0; i < 2; i++) fRec6[i] = 0;
        fslider19 = 0.0f;
        for (int i = 0; i < 2; i++) fRec5[i] = 0;
        fConst9 = (4.0f / float(iConst0));
        for (int i = 0; i < 2; i++) fRec4[i] = 0;
        fslider20 = 0.0f;
        for (int i = 0; i < 2; i++) fRec0[i] = 0;
    }

    virtual void init(int samplingFreq) {
        classInit(samplingFreq);
        instanceInit(samplingFreq);
    }

    virtual void compute(int count, FAUSTFLOAT** input, FAUSTFLOAT** output) {
        float fSlow0 = (fConst3 * float(fslider0));
        float fSlow1 = (fConst5 * float(fslider1));
        float fSlow2 = (float(fslider3) - 0.01f);
        float fSlow3 = (fSlow2 * clip(0, 6000, (faustpower<4>((1 + (4 * float(fslider2)))) - 1)));
        float fSlow4 = (20 * (float(fslider4) - 1));
        float fSlow5 = (fConst7 * float(fentry0));
        float fSlow6 = float(fslider5);
        float fSlow7 = (fSlow2 * float(fslider6));
        float fSlow8 = float(fslider7);
        float fSlow9 = float(fslider8);
        float fSlow10 = (fSlow2 * float(fslider9));
        float fSlow11 = float(fslider10);
        float fSlow12 = float(fslider11);
        float fSlow13 = float(fbutton0);
        int   iSlow14 = (fSlow13 > 0);
        int   iSlow15 = (fSlow13 <= 0);
        float fSlow16 = float(fslider12);
        float fSlow17 = (0.1f + fSlow16);
        float fSlow18 = (0.1f + (fSlow16 + (0.001f * (fSlow17 == 0.0f))));
        float fSlow19 = (0.1f + float(fslider13));
        float fSlow20 = (1 - (1.0f / powf((1e+03f * fSlow18), (1.0f / ((iConst0 * fSlow19) + (fSlow19 == 0.0f))))));
        float fSlow21 = (0.2f + (0.8f * float(fslider14)));
        float fSlow22 = (1 - powf(fSlow18, (1.0f / ((iConst0 * fSlow21) + (fSlow21 == 0.0f)))));
        float fSlow23 = (0.01f + float(fslider15));
        float fSlow24 = (1.0f / ((fSlow23 == 0.0f) + (iConst0 * fSlow23)));
        float fSlow25 = float(fslider16);
        float fSlow26 = (float(fentry1) * float(fslider17));
        float fSlow27 = (fSlow26 * fSlow25);
        float fSlow28 = expf((0 - (fConst8 / (0.01f + float(fslider18)))));
        float fSlow29 = (1.0f - fSlow28);
        float fSlow30 = (0.01f + float(fslider19));
        float fSlow31 = expf((0 - (fConst8 / fSlow30)));
        float fSlow32 = (1.0f - fSlow31);
        float fSlow33 = expf((0 - (fConst9 / fSlow30)));
        float fSlow34 = (1.0f - fSlow33);
        float fSlow35 = (1 - fSlow25);
        float fSlow36 = (fSlow26 * (1 + float(fslider20)));
        FAUSTFLOAT* output0 = output[0];
        for (int i = 0; i < count; i++) {
            fRec1[0] = (fSlow0 + (fConst2 * fRec1[1]));
            float fTemp0 = (fSlow1 + fRec3[1]);
            fRec3[0] = (fTemp0 - floorf(fTemp0));
            float fTemp1 = ftbl0[int((65536.0f * fRec3[0]))];
            float fTemp2 = tanf((fConst6 * clip(80, 16000, ((fSlow3 * fTemp1) + clip(80, 18000, (18000 * faustpower<4>((0.3f + (0.5f * fRec1[0])))))))));
            float fTemp3 = (1.0f / fTemp2);
            float fTemp4 = (1 + ((0.7653668647301795f + fTemp3) / fTemp2));
            float fTemp5 = (1 - (1.0f / faustpower<2>(fTemp2)));
            float fTemp6 = (1 + ((1.8477590650225735f + fTemp3) / fTemp2));
            float fTemp7 = (fRec9[1] + fSlow5);
            fRec9[0] = (fTemp7 - floorf(fTemp7));
            float fTemp8 = ftbl0[int((65536.0f * fRec9[0]))];
            float fTemp9 = (375.5f * (1 + fTemp8));
            float fTemp10 = clip(0.0f, 1.0f, (fSlow8 + (fSlow7 * fTemp1)));
            float fTemp11 = clip(0.0f, 1.0f, (fSlow11 + (fSlow10 * fTemp1)));
            fRec8[0] = ((((fSlow12 * ((wavetable1(fTemp9) * (1 - fTemp11)) + (fTemp11 * wavetable2(fTemp9)))) + (fSlow9 * ((wavetable4(fTemp9) * (1 - fTemp10)) + (fTemp10 * wavetable3(fTemp9))))) + (fSlow6 * fTemp8)) - (((fRec8[2] * (1 + ((fTemp3 - 1.8477590650225735f) / fTemp2))) + (2 * (fRec8[1] * fTemp5))) / fTemp6));
            fRec7[0] = (((fRec8[2] + (fRec8[0] + (2 * fRec8[1]))) / fTemp6) - (((fRec7[2] * (1 + ((fTemp3 - 0.7653668647301795f) / fTemp2))) + (2 * (fTemp5 * fRec7[1]))) / fTemp4));
            iRec10[0] = (iSlow14 & (iRec10[1] | (fRec11[1] >= 1)));
            int iTemp12 = (iSlow15 & (fRec11[1] > 0));
            fRec11[0] = (((fSlow24 * (((iRec10[1] == 0) & iSlow14) & (fRec11[1] < 1))) + (fRec11[1] * ((1 - (fSlow22 * (iRec10[1] & (fRec11[1] > fSlow17)))) - (fSlow20 * iTemp12)))) * ((iTemp12 == 0) | (fRec11[1] >= 1e-06f)));
            float fTemp13 = (fRec11[0] * (fRec7[2] + (fRec7[0] + (2 * fRec7[1]))));
            float fTemp14 = fabsf((fSlow27 * (fTemp13 / fTemp4)));
            fRec6[0] = ((fSlow28 * max(fTemp14, fRec6[1])) + (fSlow29 * fTemp14));
            fRec5[0] = ((fSlow31 * fRec5[1]) + (fSlow32 * fRec6[0]));
            fRec4[0] = ((fSlow33 * fRec4[1]) + (fSlow34 * (0 - (0.9f * max(((20 * log10f(fRec5[0])) - fSlow4), 0.0f)))));
            float fTemp15 = (fSlow36 * ((fTemp13 * (fSlow35 + (fSlow25 * powf(10, (0.05f * fRec4[0]))))) / fTemp4));
            fRec0[0] = max((fRec0[1] - fConst1), min((float)10, (20 * log10f(max(1.584893192461114e-05f, fabsf(fTemp15))))));
            fbargraph0 = fRec0[0];
            output0[i] = (FAUSTFLOAT)fTemp15;
            // post processing
            fRec0[1] = fRec0[0];
            fRec4[1] = fRec4[0];
            fRec5[1] = fRec5[0];
            fRec6[1] = fRec6[0];
            fRec11[1] = fRec11[0];
            iRec10[1] = iRec10[0];
            fRec7[2] = fRec7[1]; fRec7[1] = fRec7[0];
            fRec8[2] = fRec8[1]; fRec8[1] = fRec8[0];
            fRec9[1] = fRec9[0];
            fRec3[1] = fRec3[0];
            fRec1[1] = fRec1[0];
        }
    }
};

float mydsp::ftbl0[65536];

// ============================================================================
// WASM Wrapper
// ============================================================================

namespace devilbox {

// ============================================================================
// Parameter definitions — 21 params, 6 groups
// ============================================================================
struct SorcerParamDef {
    const char* name;
    float defaultVal;
    float minVal;
    float maxVal;
};

static const SorcerParamDef PARAMS[] = {
    // --- Osc (5) ---
    { "Osc:Osc1 Vol",        0.3f, 0.0f, 1.0f },
    { "Osc:Osc2 Vol",        0.3f, 0.0f, 1.0f },
    { "Osc:Osc3 Vol",        0.3f, 0.0f, 1.0f },
    { "Osc:WT1 Pos",         0.0f, 0.0f, 1.0f },
    { "Osc:WT2 Pos",         0.0f, 0.0f, 1.0f },

    // --- Filter (2) ---
    { "Filter:Cutoff",        1.0f, 0.0f, 1.0f },
    { "Filter:LFO Range",     0.0f, 0.0f, 1.0f },

    // --- LFO (4) ---
    { "LFO:Freq",             0.3f, 0.0f, 1.0f },
    { "LFO:Amp",              0.1f, 0.0f, 1.0f },
    { "LFO:WT1 Pos",          0.0f, 0.0f, 1.0f },
    { "LFO:WT2 Pos",          0.0f, 0.0f, 1.0f },

    // --- Env (4) ---
    { "Env:Attack",           0.01f, 0.01f, 1.0f },
    { "Env:Decay",            0.3f,  0.0f,  1.0f },
    { "Env:Sustain",          1.0f,  0.0f,  1.0f },
    { "Env:Release",          0.2f,  0.0f,  1.0f },

    // --- Master (1) ---
    { "Master:Volume",        0.3f, 0.0f, 1.0f },

    // --- Comp (5) ---
    { "Comp:Enable",          0.0f, 0.0f, 1.0f },
    { "Comp:Threshold",       0.0f, 0.0f, 1.0f },
    { "Comp:Attack",          0.0f, 0.0f, 1.0f },
    { "Comp:Release",         0.0f, 0.0f, 1.0f },
    { "Comp:Makeup",          0.0f, 0.0f, 1.0f },
};

static constexpr int PARAM_COUNT = sizeof(PARAMS) / sizeof(SorcerParamDef);
static constexpr int NUM_VOICES = 16;
static constexpr int MAX_BLOCK = 512;
static constexpr int RELEASE_TIMEOUT = 48000 * 5;  // 5 seconds

// Apply a parameter to a single mydsp instance
static void applyParam(mydsp& d, int paramId, float value) {
    switch (paramId) {
        case  0: d.fslider11 = value; break;  // Osc1 Vol
        case  1: d.fslider8  = value; break;  // Osc2 Vol
        case  2: d.fslider5  = value; break;  // Osc3 Vol
        case  3: d.fslider10 = value; break;  // WT1 Pos
        case  4: d.fslider7  = value; break;  // WT2 Pos
        case  5: d.fslider0  = value; break;  // Filter Cutoff
        case  6: d.fslider2  = value; break;  // Filter LFO Range
        case  7: d.fslider1  = value; break;  // LFO Freq
        case  8: d.fslider3  = value; break;  // LFO Amp
        case  9: d.fslider9  = value; break;  // LFO WT1 Pos
        case 10: d.fslider6  = value; break;  // LFO WT2 Pos
        case 11: d.fslider15 = value; break;  // Env Attack
        case 12: d.fslider14 = value; break;  // Env Decay
        case 13: d.fslider12 = value; break;  // Env Sustain
        case 14: d.fslider13 = value; break;  // Env Release
        case 15: d.fslider17 = value; break;  // Master Vol
        case 16: d.fslider16 = value; break;  // Comp Enable
        case 17: d.fslider4  = value; break;  // Comp Threshold
        case 18: d.fslider19 = value; break;  // Comp Attack
        case 19: d.fslider18 = value; break;  // Comp Release
        case 20: d.fslider20 = value; break;  // Comp Makeup
    }
}

// ============================================================================
// Voice state
// ============================================================================
struct SorcerVoice {
    mydsp dsp;
    int midiNote = -1;
    bool gateOn = false;
    int releaseCounter = RELEASE_TIMEOUT;
};

// ============================================================================
// SorcerSynth — polyphonic WASMSynthBase wrapper
// ============================================================================
class SorcerSynth : public WASMSynthBase {
public:
    SorcerSynth() {
        for (int i = 0; i < PARAM_COUNT; ++i) {
            cachedParams_[i] = PARAMS[i].defaultVal;
        }
    }

    void initialize(int sampleRate) override {
        WASMSynthBase::initialize(sampleRate);

        // Fill static sine lookup table once
        mydsp::classInit(sampleRate);

        // Init all voice instances
        for (int v = 0; v < NUM_VOICES; ++v) {
            voices_[v].dsp.instanceInit(sampleRate);
            voices_[v].midiNote = -1;
            voices_[v].gateOn = false;
            voices_[v].releaseCounter = RELEASE_TIMEOUT;

            // Apply default params
            for (int i = 0; i < PARAM_COUNT; ++i) {
                applyParam(voices_[v].dsp, i, cachedParams_[i]);
            }
        }
        voiceAge_ = 0;
    }

    void noteOn(int midiNote, int velocity) override {
        if (!isInitialized_) return;
        if (velocity == 0) { noteOff(midiNote); return; }

        int v = findVoice(midiNote);
        voices_[v].midiNote = midiNote;
        voices_[v].gateOn = true;
        voices_[v].releaseCounter = 0;

        float freq = midiNoteToFrequency(midiNote);
        voices_[v].dsp.fentry0 = freq;
        voices_[v].dsp.fentry1 = velocity / 127.0f;
        voices_[v].dsp.fbutton0 = 1.0f;
    }

    void noteOff(int midiNote) override {
        if (!isInitialized_) return;
        for (int v = 0; v < NUM_VOICES; ++v) {
            if (voices_[v].gateOn && voices_[v].midiNote == midiNote) {
                voices_[v].dsp.fbutton0 = 0.0f;
                voices_[v].gateOn = false;
                voices_[v].releaseCounter = 0;
            }
        }
    }

    void allNotesOff() override {
        for (int v = 0; v < NUM_VOICES; ++v) {
            voices_[v].dsp.fbutton0 = 0.0f;
            voices_[v].gateOn = false;
            voices_[v].releaseCounter = RELEASE_TIMEOUT;
            voices_[v].midiNote = -1;
        }
    }

    void process(float* outputL, float* outputR, int numSamples) override {
        if (!isInitialized_ || numSamples <= 0) {
            if (numSamples > 0) {
                std::memset(outputL, 0, numSamples * sizeof(float));
                std::memset(outputR, 0, numSamples * sizeof(float));
            }
            return;
        }

        int n = numSamples < MAX_BLOCK ? numSamples : MAX_BLOCK;
        std::memset(outputL, 0, n * sizeof(float));
        std::memset(outputR, 0, n * sizeof(float));

        float* outputs[1] = { voiceBuf_ };

        for (int v = 0; v < NUM_VOICES; ++v) {
            bool active = voices_[v].gateOn ||
                          (voices_[v].releaseCounter < RELEASE_TIMEOUT);
            if (!active) continue;

            voices_[v].dsp.compute(n, nullptr, outputs);

            for (int i = 0; i < n; ++i) {
                outputL[i] += voiceBuf_[i];
                outputR[i] += voiceBuf_[i];
            }

            if (!voices_[v].gateOn) {
                voices_[v].releaseCounter += n;
            }
        }

        // Headroom scaling
        constexpr float scale = 0.25f;
        for (int i = 0; i < n; ++i) {
            outputL[i] *= scale;
            outputR[i] *= scale;
        }
    }

    void setParameter(int paramId, float value) override {
        if (paramId < 0 || paramId >= PARAM_COUNT) return;
        cachedParams_[paramId] = value;
        if (isInitialized_) {
            for (int v = 0; v < NUM_VOICES; ++v) {
                applyParam(voices_[v].dsp, paramId, value);
            }
        }
    }

    float getParameter(int paramId) const override {
        if (paramId < 0 || paramId >= PARAM_COUNT) return 0.0f;
        return cachedParams_[paramId];
    }

    int getParameterCount() const override { return PARAM_COUNT; }

    const char* getParameterName(int paramId) const override {
        if (paramId >= 0 && paramId < PARAM_COUNT) return PARAMS[paramId].name;
        return "";
    }

    float getParameterMin(int paramId) const override {
        if (paramId >= 0 && paramId < PARAM_COUNT) return PARAMS[paramId].minVal;
        return 0.0f;
    }

    float getParameterMax(int paramId) const override {
        if (paramId >= 0 && paramId < PARAM_COUNT) return PARAMS[paramId].maxVal;
        return 1.0f;
    }

    float getParameterDefault(int paramId) const override {
        if (paramId >= 0 && paramId < PARAM_COUNT) return PARAMS[paramId].defaultVal;
        return 0.0f;
    }

#ifdef __EMSCRIPTEN__
    void processJS(uintptr_t outputLPtr, uintptr_t outputRPtr, int numSamples) {
        process(reinterpret_cast<float*>(outputLPtr),
                reinterpret_cast<float*>(outputRPtr), numSamples);
    }
#endif

private:
    SorcerVoice voices_[NUM_VOICES];
    float cachedParams_[PARAM_COUNT] = {};
    float voiceBuf_[MAX_BLOCK] = {};
    int voiceAge_ = 0;

    int findVoice(int midiNote) {
        // 1. Reuse existing voice with same note
        for (int v = 0; v < NUM_VOICES; ++v) {
            if (voices_[v].midiNote == midiNote && voices_[v].gateOn) return v;
        }
        // 2. Find fully released voice
        for (int v = 0; v < NUM_VOICES; ++v) {
            if (!voices_[v].gateOn && voices_[v].releaseCounter >= RELEASE_TIMEOUT)
                return v;
        }
        // 3. Steal oldest releasing voice
        int oldest = 0;
        int maxAge = -1;
        for (int v = 0; v < NUM_VOICES; ++v) {
            if (!voices_[v].gateOn && voices_[v].releaseCounter > maxAge) {
                oldest = v;
                maxAge = voices_[v].releaseCounter;
            }
        }
        if (maxAge >= 0) return oldest;
        // 4. Steal first voice (fallback)
        return 0;
    }
};

} // namespace devilbox

EXPORT_WASM_SYNTH_EXTENDED_EX(SorcerSynth, devilbox::SorcerSynth, "SorcerSynth")
