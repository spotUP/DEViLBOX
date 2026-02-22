#pragma once
#include <stdint.h>

/* Parameter IDs — must match PT2Param enum in PT2Hardware.tsx */
enum PT2Param {
    PT2_VOLUME = 0,       /* 0-64 */
    PT2_FINETUNE,         /* 0-15 (maps to -8..+7) */
    PT2_LOOP_START_HI,    /* Loop start high 16 bits */
    PT2_LOOP_START_LO,    /* Loop start low 16 bits */
    PT2_LOOP_LENGTH_HI,   /* Loop length high 16 bits */
    PT2_LOOP_LENGTH_LO,   /* Loop length low 16 bits */
    PT2_LOOP_TYPE,        /* 0=off, 1=forward */
    PT2_PARAM_COUNT
};

/* Initialise SDL2 canvas and internal state */
void pt2_sampled_init(int w, int h);

/* Start emscripten_set_main_loop (60 fps) */
void pt2_sampled_start(void);

/* Tear down SDL resources */
void pt2_sampled_shutdown(void);

/* Push signed 8-bit mono PCM data for waveform rendering */
void pt2_sampled_load_pcm(const int8_t *data, int length);

/* Set / get a single parameter by ID */
void pt2_sampled_set_param(int param_id, int value);
int  pt2_sampled_get_param(int param_id);

/*
 * Bulk config load/dump
 *
 * Buffer layout (11 bytes):
 *   [0]    volume      (0-64)
 *   [1]    finetune    (0-15, signed offset)
 *   [2-5]  loop_start  (uint32 LE)
 *   [6-9]  loop_length (uint32 LE)
 *   [10]   loop_type   (0=off, 1=forward)
 */
void pt2_sampled_load_config(const uint8_t *buf, int len);
int  pt2_sampled_dump_config(uint8_t *buf, int max_len);
