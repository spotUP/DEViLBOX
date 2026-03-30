#pragma once

#include <cmath>
#include <cstdint>
#include <cstring>
#include <list>

// Parameter indices (0-based, matching LV2 port order minus midi/audio ports)
enum RaffoParam {
    P_VOLUME = 0,
    P_WAVE0, P_WAVE1, P_WAVE2, P_WAVE3,          // 1-4
    P_RANGE0, P_RANGE1, P_RANGE2, P_RANGE3,       // 5-8
    P_VOL0, P_VOL1, P_VOL2, P_VOL3,               // 9-12
    P_ATTACK, P_DECAY, P_SUSTAIN, P_RELEASE,       // 13-16
    P_FILTER_CUTOFF,                                // 17
    P_FILTER_ATTACK, P_FILTER_DECAY, P_FILTER_SUSTAIN, // 18-20
    P_GLIDE,                                        // 21
    P_OSC_BUTTON0, P_OSC_BUTTON1, P_OSC_BUTTON2, P_OSC_BUTTON3, // 22-25
    P_FILTER_RESONANCE,                             // 26
    P_TUNING0, P_TUNING1, P_TUNING2, P_TUNING3,   // 27-30
    P_FILTER_RELEASE,                               // 31
    RAFFO_NUM_PARAMS
};

class RaffoSynth {
public:
    RaffoSynth(float sampleRate);
    ~RaffoSynth();

    void process(float* outL, float* outR, int frames);
    void noteOn(int note, int velocity);
    void noteOff(int note);
    void setParameter(int index, float value);
    float getParameter(int index);
    void allNotesOff();
    void pitchBend(int value); // 0-16383, 8192=center
    int getNumParams() { return RAFFO_NUM_PARAMS; }

private:
    void render(uint32_t from, uint32_t to);
    void runEqualizer(int sample_count);

    double sample_rate;
    float params[RAFFO_NUM_PARAMS];

    std::list<unsigned char> keys;
    uint32_t period;
    float glide_period;

    float last_val[4];
    float pre_buf_end;
    float prev_vals[6]; // [in[n-2], in[n-1], lpf[n-2], lpf[n-1], peak[n-2], peak[n-1]]
    bool primer_nota;

    uint32_t counter;
    int envelope_count;
    int filter_count;
    float modwheel;
    float pitch;
    double glide;

    float* buffer;
    int buffer_size;
};
