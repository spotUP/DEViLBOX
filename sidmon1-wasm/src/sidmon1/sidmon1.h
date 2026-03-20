// sidmon1.h — SidMon 1.0 replayer API
// Faithful C translation of the FlodJS S1Player.js playback engine
// by Christian Corti (Neoart Costa Rica), original format by Reinier van Vliet (1988)
#pragma once
#include <stdint.h>

void sm1r_init(void);
int  sm1r_load(const uint8_t *data, int len);
void sm1r_tick(void);           // call at 50 Hz (PAL VBlank rate)
void sm1r_stop(void);
int  sm1r_is_finished(void);
int  sm1r_get_num_instruments(void);

// Synth parameter access (inst = 0-based instrument index)
int  sm1r_get_instrument_param(int inst, int param_id);
void sm1r_set_instrument_param(int inst, int param_id, int value);

// Parameter IDs for get/set_instrument_param
#define SM1R_PARAM_ATTACK_SPEED    0
#define SM1R_PARAM_ATTACK_MAX      1
#define SM1R_PARAM_DECAY_SPEED     2
#define SM1R_PARAM_DECAY_MIN       3
#define SM1R_PARAM_SUSTAIN         4
#define SM1R_PARAM_RELEASE_SPEED   5
#define SM1R_PARAM_RELEASE_MIN     6
#define SM1R_PARAM_PHASE_SHIFT     7
#define SM1R_PARAM_PHASE_SPEED     8
#define SM1R_PARAM_FINETUNE        9
#define SM1R_PARAM_PITCH_FALL      10
#define SM1R_PARAM_WAVEFORM        11
#define SM1R_PARAM_COUNT           12

// Note preview (triggers instrument on Paula channel 0)
void sm1r_note_on(int instrument, int note, int velocity);
void sm1r_note_off(void);
