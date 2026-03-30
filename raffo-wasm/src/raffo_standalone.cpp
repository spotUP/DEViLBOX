#include "raffo_standalone.h"

#include <cmath>
#include <cstdlib>
#include <algorithm>

#define MAX_SAMPLES 256
#define MAX_BUFFER 4096

// Envelope macro equivalents using params array
#define ATTACK        ((params[P_ATTACK] + 2) * 100)
#define DECAY         (params[P_DECAY] * 100 + 0.1f)
#define SUSTAIN       powf(params[P_SUSTAIN], 2)
#define RELEASE       params[P_RELEASE]
#define FILTER_ATTACK ((params[P_FILTER_ATTACK] + 2) * 100)
#define FILTER_DECAY  (params[P_FILTER_DECAY] * 100 + 0.1f)
#define FILTER_SUSTAIN params[P_FILTER_SUSTAIN]
#define FILTER_RELEASE params[P_FILTER_RELEASE]

// --- Inlined oscillator functions (from oscillators.c) ---

static void ondaTriangular(uint32_t from, uint32_t to, uint32_t counter,
                           float* buf, float subperiod, float vol, float env) {
    for (uint32_t i = from; i < to; ++i, counter++) {
        buf[i] += vol * (4.0f * (fabsf(fmodf(((float)counter + subperiod / 4.0f), subperiod)
                  / subperiod - 0.5f) - 0.25f)) * env;
    }
}

static void ondaSierra(uint32_t from, uint32_t to, uint32_t counter,
                       float* buf, float subperiod, float vol, float env) {
    for (uint32_t i = from; i < to; ++i, counter++) {
        buf[i] += vol * (2.0f * fmodf((float)counter, subperiod) / subperiod - 1.0f) * env;
    }
}

static void ondaCuadrada(uint32_t from, uint32_t to, uint32_t counter,
                         float* buf, float subperiod, float vol, float env) {
    for (uint32_t i = from; i < to; ++i, counter++) {
        buf[i] += vol * (2.0f * ((fmodf((float)counter, subperiod) / subperiod - 0.5f) < 0) - 1.0f) * env;
    }
}

static void ondaPulso(uint32_t from, uint32_t to, uint32_t counter,
                      float* buf, float subperiod, float vol, float env) {
    for (uint32_t i = from; i < to; ++i, counter++) {
        buf[i] += vol * (2.0f * ((fmodf((float)counter, subperiod) / subperiod - 0.2f) < 0) - 1.0f) * env;
    }
}

// --- Inlined equalizer (from equalizer.c) ---

static void equalizer(float* buf, float* prev, uint32_t sample_count,
                      float psuma0, float psuma2, float psuma3,
                      float ssuma0, float ssuma1, float ssuma2, float ssuma3,
                      float factorSuma2) {
    float psuma1 = psuma0 * 2.0f;
    for (uint32_t i = 0; i < sample_count; i++) {
        // Low-pass filter
        float temp = buf[i];
        buf[i] *= psuma0;
        buf[i] += psuma0 * prev[0] + psuma1 * prev[1]
                + psuma2 * prev[2] + psuma3 * prev[3];
        prev[0] = prev[1];
        prev[1] = temp;

        // Peaking EQ (resonance)
        float temp2 = buf[i];
        buf[i] *= factorSuma2;
        buf[i] += ssuma0 * prev[2] + ssuma1 * prev[3]
                + ssuma2 * prev[4] + ssuma3 * prev[5];
        prev[2] = prev[3];
        prev[3] = temp;
        prev[4] = prev[5];
        prev[5] = buf[i];
    }
}

// --- Helper functions (from raffo.cpp) ---

static inline float key2hz(unsigned char key) {
    return 8.1758f * powf(1.0594f, (float)key);
}

static float min_fact(float a, float b) {
    return (fabsf(a - 1.0f) > fabsf(b - 1.0f)) ? b : a;
}

static float envelope(int count, float a, float d, float s) {
    // Quadratic ADSR
    if (count > a + d) return s;
    if (count < a) return -(count - a) * (count - a) / (a * a) + 1.0f;
    return (count - a - d) * (count - a - d) * (1.0f - s) / (d * d) + s;
}

static float inv_envelope(float env, float a) {
    // Inverse of quadratic attack phase
    return a - sqrtf(-a * a * (env - 1.0f));
}

// --- RaffoSynth implementation ---

RaffoSynth::RaffoSynth(float sampleRate)
    : sample_rate(sampleRate)
{
    buffer = new float[MAX_BUFFER];
    buffer_size = MAX_BUFFER;

    // Defaults from TTL
    params[P_VOLUME] = 7.0f;
    params[P_WAVE0] = 2.0f; params[P_WAVE1] = 2.0f; params[P_WAVE2] = 0.0f; params[P_WAVE3] = 3.0f;
    params[P_RANGE0] = 2.0f; params[P_RANGE1] = 2.0f; params[P_RANGE2] = 1.0f; params[P_RANGE3] = 2.0f;
    params[P_VOL0] = 7.0f; params[P_VOL1] = 5.0f; params[P_VOL2] = 4.0f; params[P_VOL3] = 7.0f;
    params[P_ATTACK] = 0.0f;
    params[P_DECAY] = 200.0f;
    params[P_SUSTAIN] = 0.8f;
    params[P_RELEASE] = 0.4f;
    params[P_FILTER_CUTOFF] = 3000.0f;
    params[P_FILTER_ATTACK] = 200.0f;
    params[P_FILTER_DECAY] = 400.0f;
    params[P_FILTER_SUSTAIN] = 0.7f;
    params[P_GLIDE] = 1.0f;
    params[P_OSC_BUTTON0] = 1.0f; params[P_OSC_BUTTON1] = 1.0f;
    params[P_OSC_BUTTON2] = 1.0f; params[P_OSC_BUTTON3] = 0.0f;
    params[P_FILTER_RESONANCE] = 3.0f;
    params[P_TUNING0] = 0.0f; params[P_TUNING1] = -0.02f;
    params[P_TUNING2] = 0.02f; params[P_TUNING3] = 0.0f;
    params[P_FILTER_RELEASE] = 0.5f;

    // Init state
    period = 500;
    glide_period = 500;
    pre_buf_end = 0;
    primer_nota = true;
    counter = 0;
    envelope_count = 0;
    filter_count = 0;
    modwheel = 0;
    pitch = 1.0f;
    glide = 0;
    last_val[0] = last_val[1] = last_val[2] = last_val[3] = 0;
    memset(prev_vals, 0, sizeof(prev_vals));
}

RaffoSynth::~RaffoSynth() {
    delete[] buffer;
}

void RaffoSynth::setParameter(int index, float value) {
    if (index >= 0 && index < RAFFO_NUM_PARAMS)
        params[index] = value;
}

float RaffoSynth::getParameter(int index) {
    if (index >= 0 && index < RAFFO_NUM_PARAMS)
        return params[index];
    return 0.0f;
}

void RaffoSynth::noteOn(int note, int velocity) {
    if (velocity == 0) {
        noteOff(note);
        return;
    }
    unsigned char key = (unsigned char)note;
    if (keys.empty()) {
        if (primer_nota) {
            glide_period = sample_rate * 4.0f / key2hz(key);
            primer_nota = false;
        }
    }
    keys.push_front(key);
    period = (uint32_t)(sample_rate * 4.0 / key2hz(key));
}

void RaffoSynth::noteOff(int note) {
    unsigned char key = (unsigned char)note;
    keys.remove(key);
    if (keys.empty()) {
        float env = envelope(envelope_count, ATTACK, DECAY, SUSTAIN);
        envelope_count = (int)inv_envelope(env, ATTACK);
        if (envelope_count < 0) envelope_count = 0;

        float fenv = envelope(filter_count, FILTER_ATTACK, FILTER_DECAY, FILTER_SUSTAIN);
        filter_count = (int)inv_envelope(fenv, FILTER_ATTACK);
        if (filter_count < 0) filter_count = 0;
    } else {
        period = (uint32_t)(sample_rate * 4.0 / key2hz(keys.front()));
    }
}

void RaffoSynth::allNotesOff() {
    keys.clear();
    envelope_count = 0;
    filter_count = 0;
}

void RaffoSynth::pitchBend(int value) {
    // value: 0-16383, 8192=center. Pitch bend range = 2 semitones
    pitch = powf(2.0f, (((float)value / 8191.0f) - 1.0f) / 6.0f);
}

void RaffoSynth::render(uint32_t from, uint32_t to) {
    // Clear buffer
    for (uint32_t i = from; i < to; ++i) buffer[i] = 0;

    double glide_factor;
    if (params[P_GLIDE] < 0.1f) {
        glide_period = (float)period;
        glide_factor = 1.0;
    } else {
        glide = pow(2.0, (double)(to - from) / (sample_rate * (params[P_GLIDE] / 5.0)));
        glide_factor = min_fact(
            (glide_period < period) ? (float)glide : 1.0f / (float)glide,
            (float)period / glide_period
        );
        glide_period *= (float)glide_factor;
    }

    if (keys.empty()) {
        envelope_count = (int)(envelope_count *
            (pow(1.3, -pow(500.0, -RELEASE) * (to - from) / 256.0) + 0.00052));
        filter_count = (int)(filter_count *
            (pow(1.3, -pow(500.0, -FILTER_RELEASE) * (to - from) / 256.0) + 0.00052));
    } else {
        envelope_count += to - from;
        filter_count += to - from;
    }

    // Oscillators
    for (int osc = 0; osc < 4; osc++) {
        if (params[P_OSC_BUTTON0 + osc] == 1.0f) {
            float vol = powf(params[P_VOLUME] * params[P_VOL0 + osc] / 100.0f, 0.5f) / 4.0f;
            float subperiod = glide_period / (powf(2.0f, params[P_RANGE0 + osc])
                              * pitch * powf(2.0f, params[P_TUNING0 + osc] / 12.0f));

            float env = envelope(envelope_count, ATTACK, DECAY, SUSTAIN);
            counter = (uint32_t)(last_val[osc] * subperiod);

            switch ((int)params[P_WAVE0 + osc]) {
                case 0:
                    ondaTriangular(from, to, counter, buffer, subperiod, vol, env);
                    counter += (to - from);
                    break;
                case 1:
                    ondaSierra(from, to, counter, buffer, subperiod, vol, env);
                    counter += (to - from);
                    break;
                case 2:
                    ondaCuadrada(from, to, counter, buffer, subperiod, vol, env);
                    counter += (to - from);
                    break;
                case 3:
                    ondaPulso(from, to, counter, buffer, subperiod, vol, env);
                    counter += (to - from);
                    break;
            }
            last_val[osc] = fmodf((float)counter, subperiod) / subperiod;
        }
    }
}

void RaffoSynth::runEqualizer(int sample_count) {
    float env = envelope(filter_count, FILTER_ATTACK, FILTER_DECAY, FILTER_SUSTAIN);

    float w0 = 6.28318530717959f * (params[P_FILTER_CUTOFF] * env + 100.0f) / (float)sample_rate;
    float alpha = sinf(w0) / 4.0f;
    float cosw0 = cosf(w0);

    float lpf_a0 = 1.0f + alpha;
    float lpf_a1 = -2.0f * cosw0 / lpf_a0;
    float lpf_a2 = (1.0f - alpha) / lpf_a0;
    float lpf_b1 = (1.0f - cosw0) / lpf_a0;
    float lpf_b0 = lpf_b1 / 2.0f;

    float gain_factor = powf(10.0f, params[P_FILTER_RESONANCE] / 20.0f);
    float peak_w0 = 6.28318530717959f * (params[P_FILTER_CUTOFF] * env + 100.0f) * 0.9f / (float)sample_rate;
    float peak_alpha = sinf(peak_w0) / 4.0f;
    float cos_peak_w0 = cosf(peak_w0);
    float peak_a0 = 1.0f + peak_alpha / gain_factor;
    float peak_a1 = -2.0f * cos_peak_w0 / peak_a0;
    float peak_a2 = (1.0f - peak_alpha / gain_factor) / peak_a0;
    float peak_b0 = (1.0f + peak_alpha * gain_factor) / peak_a0;
    float peak_b1 = -2.0f * cos_peak_w0 / peak_a0;
    float peak_b2 = (1.0f - peak_alpha * gain_factor) / peak_a0;

    equalizer(buffer, prev_vals, sample_count,
              lpf_b0, -lpf_a2, -lpf_a1,
              peak_b2, peak_b1, -peak_a2, -peak_a1, peak_b0);
}

void RaffoSynth::process(float* outL, float* outR, int frames) {
    if (frames > buffer_size) {
        delete[] buffer;
        buffer_size = frames;
        buffer = new float[buffer_size];
    }

    // Render oscillators in chunks
    uint32_t done = 0;
    while (done < (uint32_t)frames) {
        uint32_t chunk = std::min((uint32_t)MAX_SAMPLES, (uint32_t)frames - done);
        render(done, done + chunk);
        done += chunk;
    }

    // Apply filter over entire buffer
    runEqualizer(frames);

    // Copy mono to stereo
    for (int i = 0; i < frames; i++) {
        outL[i] = buffer[i];
        outR[i] = buffer[i];
    }
}
