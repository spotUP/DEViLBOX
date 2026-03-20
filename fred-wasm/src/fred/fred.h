// fred.h — Fred Editor replayer API
// Translated from FlodJS FEPlayer.js by Christian Corti (Neoart)
// Original format by Frederic Hahn
#pragma once
#include <stdint.h>

void fred_init(void);
int  fred_load(const uint8_t *data, int len);
void fred_tick(void);           // call at 50 Hz (PAL VBlank rate)
void fred_stop(void);
void fred_set_subsong(int n);   // 0-based
int  fred_get_subsong_count(void);
int  fred_is_finished(void);
int  fred_get_num_instruments(void);
int  fred_get_speed(void);

// Synth parameter access (inst = 0-based instrument index)
int  fred_get_instrument_param(int inst, int param_id);
void fred_set_instrument_param(int inst, int param_id, int value);

// Parameter IDs for fred_get/set_instrument_param
#define FRED_PARAM_ENVELOPE_VOL    0
#define FRED_PARAM_ATTACK_SPEED    1
#define FRED_PARAM_ATTACK_VOL      2
#define FRED_PARAM_DECAY_SPEED     3
#define FRED_PARAM_DECAY_VOL       4
#define FRED_PARAM_SUSTAIN_TIME    5
#define FRED_PARAM_RELEASE_SPEED   6
#define FRED_PARAM_RELEASE_VOL     7
#define FRED_PARAM_VIBRATO_DELAY   8
#define FRED_PARAM_VIBRATO_SPEED   9
#define FRED_PARAM_VIBRATO_DEPTH   10
#define FRED_PARAM_ARPEGGIO_LIMIT  11
#define FRED_PARAM_ARPEGGIO_SPEED  12
#define FRED_PARAM_PULSE_RATE_NEG  13
#define FRED_PARAM_PULSE_RATE_POS  14
#define FRED_PARAM_PULSE_SPEED     15
#define FRED_PARAM_PULSE_POS_L     16
#define FRED_PARAM_PULSE_POS_H     17
#define FRED_PARAM_PULSE_DELAY     18
#define FRED_PARAM_TYPE            19
#define FRED_PARAM_BLEND_RATE      20
#define FRED_PARAM_BLEND_DELAY     21
#define FRED_PARAM_RELATIVE        22  // 16-bit
#define FRED_PARAM_COUNT           23

// Note preview
void fred_note_on(int instrument, int note, int velocity);
void fred_note_off(void);
