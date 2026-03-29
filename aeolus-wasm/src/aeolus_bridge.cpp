// aeolus_bridge.cpp — C API bridge for Aeolus pipe organ WASM module
// Wraps the Aeolus additive synthesis engine with a simple C interface
// Original Aeolus: Copyright (C) 2003-2022 Fons Adriaensen <fons@linuxaudio.org>
// Bridge: DEViLBOX project

#include <stdlib.h>
#include <string.h>
#include <math.h>

#include "addsynth.h"
#include "rankwave.h"
#include "division.h"
#include "asection.h"
#include "reverb.h"
#include "scales.h"
#include "aeolus_stops.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#define EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define EXPORT
#endif

extern "C" {

// Parameter IDs
enum {
    // Per-stop on/off (0-13)
    PARAM_STOP_FIRST          = 0,
    PARAM_STOP_LAST           = 13,
    // Division parameters (14-22)
    PARAM_GREAT_SWELL         = 14,
    PARAM_SWELL_SWELL         = 15,
    PARAM_PEDAL_SWELL         = 16,
    PARAM_TREM_SPEED          = 17,  // tremulant frequency (Hz)
    PARAM_TREM_DEPTH          = 18,  // tremulant depth (0-1)
    PARAM_TREM_ENABLE         = 19,  // tremulant on/off
    // Reverb parameters (20-25)
    PARAM_REVERB_AMOUNT       = 20,
    PARAM_REVERB_DELAY        = 21,
    PARAM_REVERB_TIME         = 22,
    PARAM_REVERB_BASS_TIME    = 23,
    PARAM_REVERB_TREBLE_TIME  = 24,
    // Global parameters (25-31)
    PARAM_MASTER_VOLUME       = 25,
    PARAM_TUNING              = 26,  // A4 frequency in Hz
    PARAM_TEMPERAMENT         = 27,  // 0-10 scale index
    PARAM_AZIMUTH             = 28,
    PARAM_STEREO_WIDTH        = 29,
    PARAM_DIRECT_LEVEL        = 30,
    PARAM_REFLECT_LEVEL       = 31,
    NUM_PARAMS                = 32
};

struct AeolusEngine {
    float        fsamp;
    float        fbase;          // A4 tuning (Hz)
    int          temperament;    // scale index 0-10
    float       *scale;          // current temperament scale

    Addsynth    *synths[NUM_STOPS];
    Rankwave    *ranks[NUM_STOPS];
    Asection    *asections[NUM_DIVISIONS];
    Division    *divisions[NUM_DIVISIONS];
    Reverb       reverb;

    float        master_vol;
    bool         stop_on[NUM_STOPS];
    bool         trem_enabled;
    float        trem_speed;
    float        trem_depth;
    float        reverb_amount;

    // Audio output buffers
    float        out_W[PERIOD];
    float        out_X[PERIOD];
    float        out_Y[PERIOD];
    float        out_Z[PERIOD];
    float        out_R[PERIOD];

    // Key state for all notes (MIDI 36-96 = 61 notes)
    uint16_t     keys[NNOTES];

    bool         initialized;
};

static AeolusEngine *g_engine = nullptr;

EXPORT void *aeolus_create(float sample_rate)
{
    AeolusEngine *e = new AeolusEngine();
    memset(e, 0, sizeof(AeolusEngine));

    e->fsamp = sample_rate;
    e->fbase = 440.0f;
    e->temperament = 5;  // equally tempered
    e->scale = scales[e->temperament]._data;
    e->master_vol = 0.35f;
    e->trem_enabled = false;
    e->trem_speed = 4.0f;
    e->trem_depth = 0.3f;
    e->reverb_amount = 0.32f;

    // Create audio sections (one per division)
    for (int d = 0; d < NUM_DIVISIONS; d++) {
        e->asections[d] = new Asection(sample_rate);
    }

    // Create divisions
    for (int d = 0; d < NUM_DIVISIONS; d++) {
        e->divisions[d] = new Division(e->asections[d], sample_rate);
        e->divisions[d]->set_swell(1.0f);
        e->divisions[d]->set_tfreq(e->trem_speed);
        e->divisions[d]->set_tmodd(e->trem_depth);
    }

    // Create and generate all stops
    for (int s = 0; s < NUM_STOPS; s++) {
        e->synths[s] = new Addsynth();
        stop_init_funcs[s](e->synths[s]);

        int n0 = e->synths[s]->_n0;
        int n1 = e->synths[s]->_n1;
        e->ranks[s] = new Rankwave(n0, n1);
        e->ranks[s]->gen_waves(e->synths[s], sample_rate, e->fbase, e->scale);

        int div = stop_division[s];
        int rank_in_div = 0;
        for (int j = 0; j < s; j++) {
            if (stop_division[j] == div) rank_in_div++;
        }
        e->divisions[div]->set_rank(rank_in_div, e->ranks[s], stop_pan[s], 0);
        e->stop_on[s] = false;
    }

    // Initialize reverb
    e->reverb.init(sample_rate);

    // Default: turn on Principal 8' and Subbass 16'
    e->stop_on[STOP_GREAT_PRINCIPAL_8] = true;
    e->stop_on[STOP_PEDAL_SUBBASS_16] = true;

    // Set initial stop masks
    for (int s = 0; s < NUM_STOPS; s++) {
        int div = stop_division[s];
        int rank_in_div = 0;
        for (int j = 0; j < s; j++) {
            if (stop_division[j] == div) rank_in_div++;
        }
        if (e->stop_on[s]) {
            e->divisions[div]->set_rank_mask(rank_in_div, NKEYBD);
        } else {
            e->divisions[div]->clr_rank_mask(rank_in_div, NKEYBD);
        }
    }

    e->initialized = true;
    g_engine = e;
    return e;
}

EXPORT void aeolus_destroy(void *handle)
{
    AeolusEngine *e = (AeolusEngine *)handle;
    if (!e) return;

    for (int d = 0; d < NUM_DIVISIONS; d++) {
        delete e->divisions[d];
        delete e->asections[d];
    }
    e->reverb.fini();

    for (int s = 0; s < NUM_STOPS; s++) {
        delete e->synths[s];
        // ranks are owned by divisions, deleted there
    }

    if (g_engine == e) g_engine = nullptr;
    delete e;
}

static int get_rank_in_div(int stop_idx)
{
    int div = stop_division[stop_idx];
    int rank = 0;
    for (int j = 0; j < stop_idx; j++) {
        if (stop_division[j] == div) rank++;
    }
    return rank;
}

EXPORT void aeolus_note_on(void *handle, int note, int velocity)
{
    AeolusEngine *e = (AeolusEngine *)handle;
    if (!e || !e->initialized) return;
    if (note < 36 || note > 96) return;

    int idx = note - 36;
    if (idx >= NNOTES) return;

    // Determine which divisions should receive this note based on note range:
    // MIDI 36-59 (C2-B3): could be Pedal
    // MIDI 36-96 (C2-C7): Great and Swell
    uint16_t mask = (1 << NKEYBD);  // all keyboards
    e->keys[idx] = mask;

    for (int d = 0; d < NUM_DIVISIONS; d++) {
        e->divisions[d]->update(idx, mask);
    }
}

EXPORT void aeolus_note_off(void *handle, int note)
{
    AeolusEngine *e = (AeolusEngine *)handle;
    if (!e || !e->initialized) return;
    if (note < 36 || note > 96) return;

    int idx = note - 36;
    if (idx >= NNOTES) return;

    e->keys[idx] = 0;

    for (int d = 0; d < NUM_DIVISIONS; d++) {
        e->divisions[d]->update(idx, 0);
    }
}

EXPORT void aeolus_all_notes_off(void *handle)
{
    AeolusEngine *e = (AeolusEngine *)handle;
    if (!e || !e->initialized) return;

    for (int i = 0; i < NNOTES; i++) {
        e->keys[i] = 0;
    }
    for (int d = 0; d < NUM_DIVISIONS; d++) {
        e->divisions[d]->update(e->keys);
    }
}

EXPORT void aeolus_set_param(void *handle, int param, float value)
{
    AeolusEngine *e = (AeolusEngine *)handle;
    if (!e || !e->initialized) return;

    // Stop on/off
    if (param >= PARAM_STOP_FIRST && param <= PARAM_STOP_LAST) {
        int s = param - PARAM_STOP_FIRST;
        bool on = (value >= 0.5f);
        if (e->stop_on[s] != on) {
            e->stop_on[s] = on;
            int div = stop_division[s];
            int rank = get_rank_in_div(s);
            if (on) {
                e->divisions[div]->set_rank_mask(rank, NKEYBD);
            } else {
                e->divisions[div]->clr_rank_mask(rank, NKEYBD);
            }
            // Re-update keys so newly enabled stops pick up active notes
            e->divisions[div]->update(e->keys);
        }
        return;
    }

    switch (param) {
    case PARAM_GREAT_SWELL:
        e->divisions[DIV_GREAT]->set_swell(value);
        break;
    case PARAM_SWELL_SWELL:
        e->divisions[DIV_SWELL]->set_swell(value);
        break;
    case PARAM_PEDAL_SWELL:
        e->divisions[DIV_PEDAL]->set_swell(value);
        break;
    case PARAM_TREM_SPEED:
        e->trem_speed = 2.0f + value * 6.0f;  // 0-1 → 2-8 Hz
        for (int d = 0; d < NUM_DIVISIONS; d++)
            e->divisions[d]->set_tfreq(e->trem_speed);
        break;
    case PARAM_TREM_DEPTH:
        e->trem_depth = value * 0.6f;  // 0-1 → 0-0.6
        for (int d = 0; d < NUM_DIVISIONS; d++)
            e->divisions[d]->set_tmodd(e->trem_depth);
        break;
    case PARAM_TREM_ENABLE:
        e->trem_enabled = (value >= 0.5f);
        for (int d = 0; d < NUM_DIVISIONS; d++) {
            if (e->trem_enabled) e->divisions[d]->trem_on();
            else                 e->divisions[d]->trem_off();
        }
        break;
    case PARAM_REVERB_AMOUNT:
        e->reverb_amount = value;
        for (int d = 0; d < NUM_DIVISIONS; d++) {
            Fparm *p = e->asections[d]->get_apar();
            p[4]._val = value;  // REVERB index
        }
        break;
    case PARAM_REVERB_DELAY:
        e->reverb.set_delay(0.01f + value * 0.14f);  // 0-1 → 10-150ms
        break;
    case PARAM_REVERB_TIME:
        e->reverb.set_t60mf(1.0f + value * 9.0f);  // 0-1 → 1-10s
        break;
    case PARAM_REVERB_BASS_TIME:
        e->reverb.set_t60lo(1.0f + value * 14.0f, 250.0f);
        break;
    case PARAM_REVERB_TREBLE_TIME:
        e->reverb.set_t60hi(0.5f + value * 4.5f, 4000.0f);
        break;
    case PARAM_MASTER_VOLUME:
        e->master_vol = value;
        break;
    case PARAM_TUNING:
        e->fbase = 392.0f + value * 102.0f;  // 0-1 → 392-494 Hz
        break;
    case PARAM_TEMPERAMENT: {
        int idx = (int)(value * 10.99f);
        if (idx < 0) idx = 0;
        if (idx >= NSCALES) idx = NSCALES - 1;
        if (idx != e->temperament) {
            e->temperament = idx;
            e->scale = scales[idx]._data;
            // Regenerate waves with new temperament
            for (int s = 0; s < NUM_STOPS; s++) {
                e->ranks[s]->gen_waves(e->synths[s], e->fsamp, e->fbase, e->scale);
            }
        }
        break;
    }
    case PARAM_AZIMUTH:
        for (int d = 0; d < NUM_DIVISIONS; d++) {
            Fparm *p = e->asections[d]->get_apar();
            p[0]._val = value - 0.5f;  // 0-1 → -0.5 to 0.5
        }
        break;
    case PARAM_STEREO_WIDTH:
        for (int d = 0; d < NUM_DIVISIONS; d++) {
            Fparm *p = e->asections[d]->get_apar();
            p[1]._val = value;
        }
        break;
    case PARAM_DIRECT_LEVEL:
        for (int d = 0; d < NUM_DIVISIONS; d++) {
            Fparm *p = e->asections[d]->get_apar();
            p[2]._val = value;
        }
        break;
    case PARAM_REFLECT_LEVEL:
        for (int d = 0; d < NUM_DIVISIONS; d++) {
            Fparm *p = e->asections[d]->get_apar();
            p[3]._val = value;
        }
        break;
    }
}

EXPORT float aeolus_get_param(void *handle, int param)
{
    AeolusEngine *e = (AeolusEngine *)handle;
    if (!e || !e->initialized) return 0.0f;

    if (param >= PARAM_STOP_FIRST && param <= PARAM_STOP_LAST) {
        return e->stop_on[param] ? 1.0f : 0.0f;
    }

    switch (param) {
    case PARAM_GREAT_SWELL:    return 1.0f;
    case PARAM_SWELL_SWELL:    return 1.0f;
    case PARAM_PEDAL_SWELL:    return 1.0f;
    case PARAM_TREM_SPEED:     return (e->trem_speed - 2.0f) / 6.0f;
    case PARAM_TREM_DEPTH:     return e->trem_depth / 0.6f;
    case PARAM_TREM_ENABLE:    return e->trem_enabled ? 1.0f : 0.0f;
    case PARAM_REVERB_AMOUNT:  return e->reverb_amount;
    case PARAM_REVERB_DELAY:   return 0.286f;  // default
    case PARAM_REVERB_TIME:    return 0.333f;   // default
    case PARAM_MASTER_VOLUME:  return e->master_vol;
    case PARAM_TUNING:         return (e->fbase - 392.0f) / 102.0f;
    case PARAM_TEMPERAMENT:    return (float)e->temperament / 10.0f;
    case PARAM_AZIMUTH:        return 0.5f;
    case PARAM_STEREO_WIDTH:   return 0.8f;
    case PARAM_DIRECT_LEVEL:   return 0.56f;
    case PARAM_REFLECT_LEVEL:  return 0.25f;
    default:                   return 0.0f;
    }
}

// Process one block (PERIOD = 64 samples), write interleaved stereo to out
EXPORT void aeolus_process(void *handle, float *out_L, float *out_R, int nframes)
{
    AeolusEngine *e = (AeolusEngine *)handle;
    if (!e || !e->initialized) {
        memset(out_L, 0, nframes * sizeof(float));
        memset(out_R, 0, nframes * sizeof(float));
        return;
    }

    int pos = 0;
    while (pos < nframes) {
        int block = nframes - pos;
        if (block > PERIOD) block = PERIOD;

        // Clear mixing buffers
        memset(e->out_W, 0, PERIOD * sizeof(float));
        memset(e->out_X, 0, PERIOD * sizeof(float));
        memset(e->out_Y, 0, PERIOD * sizeof(float));
        memset(e->out_Z, 0, PERIOD * sizeof(float));
        memset(e->out_R, 0, PERIOD * sizeof(float));

        // Process each division
        for (int d = 0; d < NUM_DIVISIONS; d++) {
            e->divisions[d]->process();
            e->asections[d]->process(
                e->master_vol,
                e->out_W, e->out_X, e->out_Y,
                e->out_R
            );
        }

        // Process reverb
        e->reverb.process(
            PERIOD,
            e->master_vol,
            e->out_R,
            e->out_W, e->out_X, e->out_Y, e->out_Z
        );

        // Decode ambisonics W-X to stereo: L = W+X, R = W-X
        float vol = e->master_vol;
        for (int i = 0; i < block; i++) {
            out_L[pos + i] = (e->out_W[i] + e->out_X[i]) * vol;
            out_R[pos + i] = (e->out_W[i] - e->out_X[i]) * vol;
        }

        pos += block;
    }
}

// Get number of parameters
EXPORT int aeolus_get_num_params(void)
{
    return NUM_PARAMS;
}

// Get parameter name (returns static string)
EXPORT const char *aeolus_get_param_name(int param)
{
    static const char *names[NUM_PARAMS] = {
        "Great: Principal 8'",
        "Great: Octave 4'",
        "Great: Fifteenth 2'",
        "Great: Mixture III",
        "Great: Flute 8'",
        "Great: Bourdon 16'",
        "Great: Trumpet 8'",
        "Swell: Gedackt 8'",
        "Swell: Salicional 8'",
        "Swell: Voix Celeste",
        "Swell: Oboe 8'",
        "Pedal: Subbass 16'",
        "Pedal: Principalbass 8'",
        "Pedal: Trompete 8'",
        "Great Expression",
        "Swell Expression",
        "Pedal Expression",
        "Tremulant Speed",
        "Tremulant Depth",
        "Tremulant On/Off",
        "Reverb Amount",
        "Reverb Delay",
        "Reverb Time",
        "Reverb Bass Time",
        "Reverb Treble Time",
        "Master Volume",
        "Tuning (A4 Hz)",
        "Temperament",
        "Azimuth",
        "Stereo Width",
        "Direct Level",
        "Reflection Level",
    };
    if (param >= 0 && param < NUM_PARAMS) return names[param];
    return "Unknown";
}

// Get stop name for a specific stop index
EXPORT const char *aeolus_get_stop_name(int stop_idx)
{
    if (stop_idx < 0 || stop_idx >= NUM_STOPS) return "Unknown";
    static const char *names[NUM_STOPS] = {
        "Principal 8'", "Octave 4'", "Fifteenth 2'", "Mixture III",
        "Flute 8'", "Bourdon 16'", "Trumpet 8'",
        "Gedackt 8'", "Salicional 8'", "Voix Celeste 8'", "Oboe 8'",
        "Subbass 16'", "Principalbass 8'", "Trompete 8'"
    };
    return names[stop_idx];
}

EXPORT int aeolus_get_num_stops(void)
{
    return NUM_STOPS;
}

EXPORT int aeolus_get_stop_division(int stop_idx)
{
    if (stop_idx < 0 || stop_idx >= NUM_STOPS) return -1;
    return stop_division[stop_idx];
}

EXPORT const char *aeolus_get_division_name(int div)
{
    static const char *names[NUM_DIVISIONS] = { "Great", "Swell", "Pedal" };
    if (div >= 0 && div < NUM_DIVISIONS) return names[div];
    return "Unknown";
}

EXPORT int aeolus_get_num_divisions(void)
{
    return NUM_DIVISIONS;
}

EXPORT int aeolus_get_block_size(void)
{
    return PERIOD;
}

EXPORT const char *aeolus_get_temperament_name(int idx)
{
    if (idx >= 0 && idx < NSCALES) return scales[idx]._label;
    return "Unknown";
}

EXPORT int aeolus_get_num_temperaments(void)
{
    return NSCALES;
}

}  // extern "C"
