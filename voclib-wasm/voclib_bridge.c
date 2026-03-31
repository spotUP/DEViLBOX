/**
 * voclib_bridge.c — WASM bridge for voclib channel vocoder.
 *
 * Exposes voclib + built-in carrier oscillator (saw/square/noise/chord)
 * for use in an AudioWorkletProcessor. The carrier is generated internally
 * so only the modulator (mic) signal needs to be passed in.
 *
 * Public domain / MIT — voclib by Philip Bennefall (blastbay.com)
 */

#define VOCLIB_IMPLEMENTATION
#include "voclib.h"

#include <stdlib.h>
#include <string.h>
#include <math.h>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#define EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define EXPORT
#endif

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

/* Carrier waveform types */
#define CARRIER_SAW    0
#define CARRIER_SQUARE 1
#define CARRIER_NOISE  2
#define CARRIER_CHORD  3

/* Simple xorshift32 PRNG for noise */
static unsigned int noise_state = 0x12345678;
static float noise_next(void) {
    noise_state ^= noise_state << 13;
    noise_state ^= noise_state >> 17;
    noise_state ^= noise_state << 5;
    return (float)(noise_state) / (float)(0xFFFFFFFF) * 2.0f - 1.0f;
}

typedef struct {
    voclib_instance voclib;
    float sample_rate;
    unsigned char bands;
    
    /* Carrier oscillator state */
    int carrier_type;
    float carrier_freq;       /* Hz */
    float phase1;             /* Main oscillator */
    float phase2;             /* Chord: +1 octave */
    float phase3;             /* Chord: perfect 5th */
    
    /* Mix */
    float wet;                /* 0-1 */
    
    /* RMS tracking */
    float rms_accum;
    int rms_count;
    float last_rms;
    
    /* Internal buffers */
    float carrier_buf[512];
    float output_buf[512];
} vocoder_state;

EXPORT vocoder_state* vocoder_create(float sample_rate, int bands, int filters_per_band) {
    vocoder_state* s = (vocoder_state*)calloc(1, sizeof(vocoder_state));
    if (!s) return NULL;
    
    s->sample_rate = sample_rate;
    s->bands = (unsigned char)bands;
    s->carrier_type = CARRIER_CHORD;
    s->carrier_freq = 130.81f;  /* C3 */
    s->phase1 = 0.0f;
    s->phase2 = 0.0f;
    s->phase3 = 0.0f;
    s->wet = 1.0f;
    s->rms_accum = 0.0f;
    s->rms_count = 0;
    s->last_rms = 0.0f;
    
    if (!voclib_initialize(&s->voclib, (unsigned char)bands, (unsigned char)filters_per_band,
                           (unsigned int)sample_rate, 1 /* mono carrier */)) {
        free(s);
        return NULL;
    }
    
    return s;
}

EXPORT void vocoder_destroy(vocoder_state* s) {
    if (s) free(s);
}

/* Generate one sample of the carrier signal */
static float generate_carrier_sample(vocoder_state* s) {
    float sample = 0.0f;
    float inc1 = s->carrier_freq / s->sample_rate;
    
    switch (s->carrier_type) {
        case CARRIER_SAW:
            sample = s->phase1 * 2.0f - 1.0f;
            s->phase1 += inc1;
            if (s->phase1 >= 1.0f) s->phase1 -= 1.0f;
            break;
            
        case CARRIER_SQUARE:
            sample = s->phase1 < 0.5f ? 0.8f : -0.8f;
            s->phase1 += inc1;
            if (s->phase1 >= 1.0f) s->phase1 -= 1.0f;
            break;
            
        case CARRIER_NOISE:
            sample = noise_next() * 0.7f;
            break;
            
        case CARRIER_CHORD: {
            /* Root + octave up + perfect 5th — thick Kraftwerk robot chord */
            float inc2 = (s->carrier_freq * 2.0f) / s->sample_rate;   /* +1 octave */
            float inc3 = (s->carrier_freq * 1.5f) / s->sample_rate;   /* perfect 5th */
            
            float saw1 = s->phase1 * 2.0f - 1.0f;
            float saw2 = s->phase2 * 2.0f - 1.0f;
            float saw3 = s->phase3 * 2.0f - 1.0f;
            
            sample = (saw1 * 0.5f + saw2 * 0.3f + saw3 * 0.35f);
            
            s->phase1 += inc1;
            s->phase2 += inc2;
            s->phase3 += inc3;
            if (s->phase1 >= 1.0f) s->phase1 -= 1.0f;
            if (s->phase2 >= 1.0f) s->phase2 -= 1.0f;
            if (s->phase3 >= 1.0f) s->phase3 -= 1.0f;
            break;
        }
    }
    
    return sample;
}

/**
 * Process a block of audio.
 * modulator_in: mono mic signal (128 frames)
 * output: mono vocoded output (128 frames)
 * Returns current RMS level of the output.
 */
EXPORT float vocoder_process(vocoder_state* s, const float* modulator_in, float* output, int frames) {
    int i;
    
    /* Generate carrier signal */
    for (i = 0; i < frames; i++) {
        s->carrier_buf[i] = generate_carrier_sample(s);
    }
    
    /* Run the vocoder */
    voclib_process(&s->voclib, s->carrier_buf, modulator_in, s->output_buf, (unsigned int)frames);
    
    /* Mix wet/dry and compute RMS */
    float rms_sum = 0.0f;
    for (i = 0; i < frames; i++) {
        float wet_sample = s->output_buf[i];
        float dry_sample = modulator_in[i];
        float mixed = wet_sample * s->wet + dry_sample * (1.0f - s->wet);
        output[i] = mixed;
        rms_sum += mixed * mixed;
    }
    
    s->last_rms = sqrtf(rms_sum / (float)frames);
    return s->last_rms;
}

EXPORT float vocoder_get_rms(vocoder_state* s) {
    return s->last_rms;
}

EXPORT void vocoder_set_carrier_type(vocoder_state* s, int type) {
    if (type >= CARRIER_SAW && type <= CARRIER_CHORD) {
        s->carrier_type = type;
    }
}

EXPORT void vocoder_set_carrier_freq(vocoder_state* s, float freq) {
    if (freq >= 20.0f && freq <= 2000.0f) {
        s->carrier_freq = freq;
    }
}

EXPORT void vocoder_set_wet(vocoder_state* s, float wet) {
    s->wet = wet < 0.0f ? 0.0f : (wet > 1.0f ? 1.0f : wet);
}

EXPORT int vocoder_set_reaction_time(vocoder_state* s, float time) {
    return voclib_set_reaction_time(&s->voclib, time);
}

EXPORT int vocoder_set_formant_shift(vocoder_state* s, float shift) {
    return voclib_set_formant_shift(&s->voclib, shift);
}

EXPORT void vocoder_reset(vocoder_state* s) {
    voclib_reset_history(&s->voclib);
    s->phase1 = 0.0f;
    s->phase2 = 0.0f;
    s->phase3 = 0.0f;
    s->last_rms = 0.0f;
}

/* Allocate a float buffer in WASM memory (for passing data from JS) */
EXPORT float* vocoder_alloc_buffer(int frames) {
    return (float*)malloc(frames * sizeof(float));
}

EXPORT void vocoder_free_buffer(float* buf) {
    free(buf);
}
