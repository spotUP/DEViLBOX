// steveturner.h — Steve Turner format replayer API
// Translated from 68k ASM: wanted_team/SteveTurner/src/Steve Turner_v4.asm
#pragma once
#include <stdint.h>

void st_init(void);
int  st_load(const uint8_t *data, int len);
void st_tick(void);           // call at 50 Hz (PAL VBlank rate)
void st_stop(void);
void st_set_subsong(int n);   // 1-based
int  st_get_subsong_count(void);
int  st_is_finished(void);
int  st_get_num_instruments(void);

// Synth parameter access (inst = 0-based instrument index)
// param_id maps to instrument byte offsets 0x00-0x2F
int  st_get_instrument_param(int inst, int param_id);
void st_set_instrument_param(int inst, int param_id, int value);

// Parameter IDs for st_get/set_instrument_param
#define ST_PARAM_PRIO        0   // priority level (byte at $1E)
#define ST_PARAM_SAMPLE      1   // sample index (byte at $1F)
#define ST_PARAM_DELAY       2   // init delay (byte at $20)
#define ST_PARAM_ENV1_DUR    3   // envelope seg 1 duration (byte at $21)
#define ST_PARAM_ENV1_DELTA  4   // envelope seg 1 pitch delta (byte at $22)
#define ST_PARAM_ENV2_DUR    5   // envelope seg 2 duration (byte at $23)
#define ST_PARAM_ENV2_DELTA  6   // envelope seg 2 pitch delta (byte at $24)
#define ST_PARAM_SHIFT       7   // pitch right-shift (byte at $25)
#define ST_PARAM_OSC_COUNT   8   // oscillation counter (word at $26-$27)
#define ST_PARAM_OSC_DELTA   9   // oscillation delta (byte at $28)
#define ST_PARAM_OSC_LOOP    10  // oscillation loop count (byte at $29)
#define ST_PARAM_DECAY       11  // decay delta (byte at $2A)
#define ST_PARAM_NUM_VIB     12  // vibrato entry count (byte at $2B)
#define ST_PARAM_VIB_DELAY   13  // vibrato delay (byte at $2C)
#define ST_PARAM_VIB_SPEED   14  // vibrato speed (byte at $2D)
#define ST_PARAM_VIB_MAX     15  // vibrato max depth (byte at $2E)
#define ST_PARAM_CHAIN       16  // instrument chain (byte at $2F)
#define ST_PARAM_COUNT       17

// Note preview (triggers instrument sample on Paula channel 0)
void st_note_on(int instrument, int note, int velocity);
void st_note_off(void);
