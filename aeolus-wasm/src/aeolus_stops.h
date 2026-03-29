// aeolus_stops.h — Programmatic organ stop definitions for WASM
// Creates realistic organ stops without needing .ae data files
// Based on classical organ pipe harmonic analysis

#ifndef __AEOLUS_STOPS_H
#define __AEOLUS_STOPS_H

#include "addsynth.h"
#include <string.h>
#include <math.h>

// Stop indices — 3 divisions: Great (0-6), Swell (7-10), Pedal (11-13)
enum StopIndex {
    // Great division
    STOP_GREAT_PRINCIPAL_8   = 0,
    STOP_GREAT_OCTAVE_4      = 1,
    STOP_GREAT_FIFTEENTH_2   = 2,
    STOP_GREAT_MIXTURE       = 3,
    STOP_GREAT_FLUTE_8       = 4,
    STOP_GREAT_BOURDON_16    = 5,
    STOP_GREAT_TRUMPET_8     = 6,
    // Swell division
    STOP_SWELL_GEDACKT_8     = 7,
    STOP_SWELL_SALICIONAL_8  = 8,
    STOP_SWELL_VOIX_CELESTE  = 9,
    STOP_SWELL_OBOE_8        = 10,
    // Pedal division
    STOP_PEDAL_SUBBASS_16    = 11,
    STOP_PEDAL_PRINCIPAL_8   = 12,
    STOP_PEDAL_TROMPETE_8    = 13,
    NUM_STOPS                = 14
};

// Division indices
enum DivisionIndex {
    DIV_GREAT = 0,
    DIV_SWELL = 1,
    DIV_PEDAL = 2,
    NUM_DIVISIONS = 3
};

static inline void set_uniform(N_func *nf, float val)
{
    for (int i = 0; i < N_NOTE; i++) nf->setv(i, val);
}

// Set harmonic level for a specific harmonic across all notes
static inline void set_harmonic(HN_func *hf, int h, float db)
{
    for (int i = 0; i < N_NOTE; i++) hf->setv(h, i, db);
}

// Set harmonic with rolloff towards high notes
static inline void set_harmonic_rolloff(HN_func *hf, int h, float db, float rolloff_db)
{
    for (int i = 0; i < N_NOTE; i++) {
        float r = (float)i / (N_NOTE - 1);
        hf->setv(h, i, db - r * rolloff_db);
    }
}

static inline void init_principal_8(Addsynth *s)
{
    s->reset();
    strncpy(s->_stopname, "Principal 8'", 31);
    strncpy(s->_mnemonic, "PR8", 7);
    s->_fn = 1; s->_fd = 1;
    s->_n0 = 36; s->_n1 = 96;

    set_uniform(&s->_n_vol, -6.0f);
    set_uniform(&s->_n_att, 0.04f);
    set_uniform(&s->_n_dct, 0.08f);
    set_uniform(&s->_n_ins, 0.001f);
    set_uniform(&s->_n_ran, 0.3f);

    // Principal: strong fundamental, moderate odd harmonics, weaker even
    set_harmonic_rolloff(&s->_h_lev, 0,  0.0f, 3.0f);   // fundamental
    set_harmonic_rolloff(&s->_h_lev, 1, -8.0f, 4.0f);   // 2nd
    set_harmonic_rolloff(&s->_h_lev, 2, -12.0f, 6.0f);  // 3rd
    set_harmonic_rolloff(&s->_h_lev, 3, -16.0f, 8.0f);  // 4th
    set_harmonic_rolloff(&s->_h_lev, 4, -20.0f, 10.0f);
    set_harmonic_rolloff(&s->_h_lev, 5, -24.0f, 12.0f);
    set_harmonic_rolloff(&s->_h_lev, 6, -28.0f, 14.0f);
    set_harmonic_rolloff(&s->_h_lev, 7, -32.0f, 16.0f);
    for (int h = 8; h < 16; h++)
        set_harmonic_rolloff(&s->_h_lev, h, -32.0f - 3.0f * (h - 8), 16.0f);
}

static inline void init_octave_4(Addsynth *s)
{
    s->reset();
    strncpy(s->_stopname, "Octave 4'", 31);
    strncpy(s->_mnemonic, "OC4", 7);
    s->_fn = 2; s->_fd = 1;  // sounds one octave higher
    s->_n0 = 36; s->_n1 = 96;

    set_uniform(&s->_n_vol, -8.0f);
    set_uniform(&s->_n_att, 0.03f);
    set_uniform(&s->_n_dct, 0.06f);
    set_uniform(&s->_n_ins, 0.0008f);

    set_harmonic_rolloff(&s->_h_lev, 0,  0.0f, 4.0f);
    set_harmonic_rolloff(&s->_h_lev, 1, -10.0f, 6.0f);
    set_harmonic_rolloff(&s->_h_lev, 2, -14.0f, 8.0f);
    set_harmonic_rolloff(&s->_h_lev, 3, -20.0f, 10.0f);
    set_harmonic_rolloff(&s->_h_lev, 4, -26.0f, 12.0f);
    for (int h = 5; h < 12; h++)
        set_harmonic_rolloff(&s->_h_lev, h, -26.0f - 4.0f * (h - 5), 14.0f);
}

static inline void init_fifteenth_2(Addsynth *s)
{
    s->reset();
    strncpy(s->_stopname, "Fifteenth 2'", 31);
    strncpy(s->_mnemonic, "FI2", 7);
    s->_fn = 4; s->_fd = 1;  // sounds two octaves higher
    s->_n0 = 36; s->_n1 = 96;

    set_uniform(&s->_n_vol, -10.0f);
    set_uniform(&s->_n_att, 0.02f);
    set_uniform(&s->_n_dct, 0.04f);
    set_uniform(&s->_n_ins, 0.0006f);

    set_harmonic_rolloff(&s->_h_lev, 0,  0.0f, 6.0f);
    set_harmonic_rolloff(&s->_h_lev, 1, -12.0f, 8.0f);
    set_harmonic_rolloff(&s->_h_lev, 2, -18.0f, 12.0f);
    set_harmonic_rolloff(&s->_h_lev, 3, -28.0f, 16.0f);
}

static inline void init_mixture(Addsynth *s)
{
    s->reset();
    strncpy(s->_stopname, "Mixture III", 31);
    strncpy(s->_mnemonic, "MIX", 7);
    s->_fn = 2; s->_fd = 1;
    s->_n0 = 36; s->_n1 = 96;

    set_uniform(&s->_n_vol, -12.0f);
    set_uniform(&s->_n_att, 0.025f);
    set_uniform(&s->_n_dct, 0.05f);
    set_uniform(&s->_n_ins, 0.001f);
    set_uniform(&s->_n_ran, 0.5f);

    // Mixture: prominent harmonics at 2nd, 3rd, octave+fifth
    set_harmonic_rolloff(&s->_h_lev, 0, -3.0f, 4.0f);
    set_harmonic_rolloff(&s->_h_lev, 1, -3.0f, 5.0f);   // octave
    set_harmonic_rolloff(&s->_h_lev, 2, -3.0f, 5.0f);   // twelfth
    set_harmonic_rolloff(&s->_h_lev, 3, -6.0f, 8.0f);
    set_harmonic_rolloff(&s->_h_lev, 4, -10.0f, 10.0f);
    set_harmonic_rolloff(&s->_h_lev, 5, -10.0f, 10.0f);
    for (int h = 6; h < 16; h++)
        set_harmonic_rolloff(&s->_h_lev, h, -14.0f - 3.0f * (h - 6), 12.0f);
}

static inline void init_flute_8(Addsynth *s)
{
    s->reset();
    strncpy(s->_stopname, "Flute 8'", 31);
    strncpy(s->_mnemonic, "FL8", 7);
    s->_fn = 1; s->_fd = 1;
    s->_n0 = 36; s->_n1 = 96;

    set_uniform(&s->_n_vol, -5.0f);
    set_uniform(&s->_n_att, 0.06f);
    set_uniform(&s->_n_dct, 0.10f);
    set_uniform(&s->_n_ins, 0.002f);
    set_uniform(&s->_n_ran, 0.4f);

    // Flute: strong fundamental, very weak harmonics (mostly odd)
    set_harmonic_rolloff(&s->_h_lev, 0,  0.0f, 2.0f);
    set_harmonic_rolloff(&s->_h_lev, 1, -22.0f, 8.0f);
    set_harmonic_rolloff(&s->_h_lev, 2, -18.0f, 10.0f);  // odd harmonic slightly stronger
    set_harmonic_rolloff(&s->_h_lev, 3, -30.0f, 12.0f);
    set_harmonic_rolloff(&s->_h_lev, 4, -26.0f, 14.0f);
}

static inline void init_bourdon_16(Addsynth *s)
{
    s->reset();
    strncpy(s->_stopname, "Bourdon 16'", 31);
    strncpy(s->_mnemonic, "BO16", 7);
    s->_fn = 1; s->_fd = 2;  // sounds one octave lower
    s->_n0 = 36; s->_n1 = 96;

    set_uniform(&s->_n_vol, -4.0f);
    set_uniform(&s->_n_att, 0.08f);
    set_uniform(&s->_n_dct, 0.15f);
    set_uniform(&s->_n_ins, 0.003f);

    // Stopped pipe: only odd harmonics
    set_harmonic_rolloff(&s->_h_lev, 0,  0.0f, 2.0f);
    set_harmonic_rolloff(&s->_h_lev, 2, -8.0f, 6.0f);   // 3rd (odd)
    set_harmonic_rolloff(&s->_h_lev, 4, -16.0f, 10.0f);  // 5th (odd)
    set_harmonic_rolloff(&s->_h_lev, 6, -24.0f, 14.0f);  // 7th (odd)
    set_harmonic_rolloff(&s->_h_lev, 8, -32.0f, 18.0f);  // 9th (odd)
}

static inline void init_trumpet_8(Addsynth *s)
{
    s->reset();
    strncpy(s->_stopname, "Trumpet 8'", 31);
    strncpy(s->_mnemonic, "TR8", 7);
    s->_fn = 1; s->_fd = 1;
    s->_n0 = 36; s->_n1 = 96;

    set_uniform(&s->_n_vol, -4.0f);
    set_uniform(&s->_n_att, 0.015f);
    set_uniform(&s->_n_dct, 0.04f);
    set_uniform(&s->_n_ins, 0.0005f);

    // Reed: rich harmonics, relatively even decay
    set_harmonic_rolloff(&s->_h_lev, 0,  0.0f, 2.0f);
    for (int h = 1; h < 24; h++)
        set_harmonic_rolloff(&s->_h_lev, h, -3.0f - 1.5f * h, 3.0f + 0.5f * h);
}

static inline void init_gedackt_8(Addsynth *s)
{
    s->reset();
    strncpy(s->_stopname, "Gedackt 8'", 31);
    strncpy(s->_mnemonic, "GD8", 7);
    s->_fn = 1; s->_fd = 1;
    s->_n0 = 36; s->_n1 = 96;

    set_uniform(&s->_n_vol, -5.0f);
    set_uniform(&s->_n_att, 0.07f);
    set_uniform(&s->_n_dct, 0.12f);
    set_uniform(&s->_n_ins, 0.002f);
    set_uniform(&s->_n_ran, 0.3f);

    // Covered/stopped pipe: strong odd harmonics
    set_harmonic_rolloff(&s->_h_lev, 0,  0.0f, 2.0f);
    set_harmonic_rolloff(&s->_h_lev, 2, -10.0f, 6.0f);
    set_harmonic_rolloff(&s->_h_lev, 4, -20.0f, 10.0f);
    set_harmonic_rolloff(&s->_h_lev, 6, -30.0f, 14.0f);
    // Even harmonics very quiet
    set_harmonic_rolloff(&s->_h_lev, 1, -28.0f, 10.0f);
    set_harmonic_rolloff(&s->_h_lev, 3, -34.0f, 12.0f);
}

static inline void init_salicional_8(Addsynth *s)
{
    s->reset();
    strncpy(s->_stopname, "Salicional 8'", 31);
    strncpy(s->_mnemonic, "SA8", 7);
    s->_fn = 1; s->_fd = 1;
    s->_n0 = 36; s->_n1 = 96;

    set_uniform(&s->_n_vol, -8.0f);
    set_uniform(&s->_n_att, 0.05f);
    set_uniform(&s->_n_dct, 0.10f);
    set_uniform(&s->_n_ins, 0.002f);
    set_uniform(&s->_n_ran, 0.2f);

    // String: many harmonics with gradual decay
    set_harmonic_rolloff(&s->_h_lev, 0,  0.0f, 3.0f);
    for (int h = 1; h < 20; h++)
        set_harmonic_rolloff(&s->_h_lev, h, -4.0f - 2.0f * h, 4.0f + h);
}

static inline void init_voix_celeste(Addsynth *s)
{
    // Same as salicional but with slight sharp detune for chorus
    init_salicional_8(s);
    strncpy(s->_stopname, "Voix Celeste 8'", 31);
    strncpy(s->_mnemonic, "VC8", 7);
    // Detune: +6 cents sharp
    set_uniform(&s->_n_off, 6.0f);
    set_uniform(&s->_n_ins, 0.003f);
}

static inline void init_oboe_8(Addsynth *s)
{
    s->reset();
    strncpy(s->_stopname, "Oboe 8'", 31);
    strncpy(s->_mnemonic, "OB8", 7);
    s->_fn = 1; s->_fd = 1;
    s->_n0 = 36; s->_n1 = 96;

    set_uniform(&s->_n_vol, -6.0f);
    set_uniform(&s->_n_att, 0.02f);
    set_uniform(&s->_n_dct, 0.05f);
    set_uniform(&s->_n_ins, 0.0008f);

    // Reed: strong odd harmonics
    set_harmonic_rolloff(&s->_h_lev, 0,  0.0f, 3.0f);
    set_harmonic_rolloff(&s->_h_lev, 1, -12.0f, 6.0f);
    set_harmonic_rolloff(&s->_h_lev, 2, -4.0f, 4.0f);    // strong 3rd
    set_harmonic_rolloff(&s->_h_lev, 3, -14.0f, 8.0f);
    set_harmonic_rolloff(&s->_h_lev, 4, -8.0f, 6.0f);    // strong 5th
    set_harmonic_rolloff(&s->_h_lev, 5, -16.0f, 10.0f);
    set_harmonic_rolloff(&s->_h_lev, 6, -12.0f, 8.0f);   // strong 7th
    for (int h = 7; h < 20; h++)
        set_harmonic_rolloff(&s->_h_lev, h, -14.0f - 2.0f * (h - 7), 8.0f + h);
}

static inline void init_subbass_16(Addsynth *s)
{
    s->reset();
    strncpy(s->_stopname, "Subbass 16'", 31);
    strncpy(s->_mnemonic, "SB16", 7);
    s->_fn = 1; s->_fd = 2;
    s->_n0 = 36; s->_n1 = 72;  // pedal range

    set_uniform(&s->_n_vol, -3.0f);
    set_uniform(&s->_n_att, 0.10f);
    set_uniform(&s->_n_dct, 0.20f);
    set_uniform(&s->_n_ins, 0.004f);

    // Deep stopped pipe
    set_harmonic_rolloff(&s->_h_lev, 0,  0.0f, 1.0f);
    set_harmonic_rolloff(&s->_h_lev, 2, -6.0f, 4.0f);
    set_harmonic_rolloff(&s->_h_lev, 4, -14.0f, 8.0f);
    set_harmonic_rolloff(&s->_h_lev, 6, -22.0f, 12.0f);
}

static inline void init_principal_bass_8(Addsynth *s)
{
    s->reset();
    strncpy(s->_stopname, "Principalbass 8'", 31);
    strncpy(s->_mnemonic, "PB8", 7);
    s->_fn = 1; s->_fd = 1;
    s->_n0 = 36; s->_n1 = 72;

    set_uniform(&s->_n_vol, -5.0f);
    set_uniform(&s->_n_att, 0.05f);
    set_uniform(&s->_n_dct, 0.10f);
    set_uniform(&s->_n_ins, 0.0015f);

    set_harmonic_rolloff(&s->_h_lev, 0,  0.0f, 2.0f);
    set_harmonic_rolloff(&s->_h_lev, 1, -8.0f, 4.0f);
    set_harmonic_rolloff(&s->_h_lev, 2, -14.0f, 6.0f);
    set_harmonic_rolloff(&s->_h_lev, 3, -20.0f, 8.0f);
    set_harmonic_rolloff(&s->_h_lev, 4, -26.0f, 10.0f);
    for (int h = 5; h < 10; h++)
        set_harmonic_rolloff(&s->_h_lev, h, -26.0f - 4.0f * (h - 5), 12.0f);
}

static inline void init_trompete_8(Addsynth *s)
{
    s->reset();
    strncpy(s->_stopname, "Trompete 8'", 31);
    strncpy(s->_mnemonic, "TP8", 7);
    s->_fn = 1; s->_fd = 1;
    s->_n0 = 36; s->_n1 = 72;

    set_uniform(&s->_n_vol, -4.0f);
    set_uniform(&s->_n_att, 0.02f);
    set_uniform(&s->_n_dct, 0.05f);
    set_uniform(&s->_n_ins, 0.0006f);

    // Pedal reed: powerful harmonics
    set_harmonic_rolloff(&s->_h_lev, 0,  0.0f, 1.5f);
    for (int h = 1; h < 20; h++)
        set_harmonic_rolloff(&s->_h_lev, h, -2.0f - 1.5f * h, 2.0f + 0.5f * h);
}

typedef void (*StopInitFunc)(Addsynth *);

static StopInitFunc stop_init_funcs[NUM_STOPS] = {
    init_principal_8,
    init_octave_4,
    init_fifteenth_2,
    init_mixture,
    init_flute_8,
    init_bourdon_16,
    init_trumpet_8,
    init_gedackt_8,
    init_salicional_8,
    init_voix_celeste,
    init_oboe_8,
    init_subbass_16,
    init_principal_bass_8,
    init_trompete_8,
};

// Which division each stop belongs to
static int stop_division[NUM_STOPS] = {
    DIV_GREAT, DIV_GREAT, DIV_GREAT, DIV_GREAT,
    DIV_GREAT, DIV_GREAT, DIV_GREAT,
    DIV_SWELL, DIV_SWELL, DIV_SWELL, DIV_SWELL,
    DIV_PEDAL, DIV_PEDAL, DIV_PEDAL,
};

// Pan positions: L, C, R, or W (wide)
static char stop_pan[NUM_STOPS] = {
    'C', 'C', 'C', 'C', 'L', 'C', 'R',  // Great
    'L', 'R', 'R', 'C',                    // Swell
    'C', 'C', 'C',                          // Pedal
};

#endif
