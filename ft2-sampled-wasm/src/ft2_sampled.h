#pragma once
#include <stdint.h>

/* Parameter IDs — must match FT2Param constants in FT2Hardware.tsx */
enum FT2Param {
    FT2_VOLUME = 0,            /* 0-64 */
    FT2_PANNING,               /* 0-255 */
    FT2_FINETUNE,              /* -128..+127 (stored as int16) */
    FT2_RELATIVE_NOTE,         /* -48..+48 */
    FT2_LOOP_TYPE,             /* 0=off, 1=forward, 2=pingpong */
    FT2_FADEOUT,               /* 0-4095 */
    FT2_VIB_TYPE,              /* 0-3 (sine, square, rampDown, rampUp) */
    FT2_VIB_SWEEP,             /* 0-255 */
    FT2_VIB_DEPTH,             /* 0-15 */
    FT2_VIB_RATE,              /* 0-63 */
    FT2_VOL_ENV_ON,            /* bool */
    FT2_VOL_ENV_SUSTAIN,       /* point index (-1 = none) */
    FT2_VOL_ENV_LOOP_START,    /* point index (-1 = none) */
    FT2_VOL_ENV_LOOP_END,      /* point index (-1 = none) */
    FT2_VOL_ENV_NUM_POINTS,    /* 0-12 */
    FT2_PAN_ENV_ON,            /* bool */
    FT2_PAN_ENV_SUSTAIN,       /* point index (-1 = none) */
    FT2_PAN_ENV_LOOP_START,    /* point index (-1 = none) */
    FT2_PAN_ENV_LOOP_END,      /* point index (-1 = none) */
    FT2_PAN_ENV_NUM_POINTS,    /* 0-12 */
    FT2_PARAM_COUNT
};

/* Initialise SDL2 canvas and internal state */
void ft2_sampled_init(int w, int h);

/* Start emscripten_set_main_loop (60 fps) */
void ft2_sampled_start(void);

/* Tear down SDL resources */
void ft2_sampled_shutdown(void);

/* Push 16-bit signed mono PCM data for waveform rendering */
void ft2_sampled_load_pcm(const int16_t *data, int length);

/* Set/get a single parameter by ID */
void ft2_sampled_set_param(int param_id, int value);
int  ft2_sampled_get_param(int param_id);

/* Loop points (32-bit values, separate from param enum) */
void ft2_sampled_set_loop(int loop_start, int loop_length, int loop_type);

/* Envelope point access */
void ft2_sampled_set_vol_env_point(int index, int tick, int value);
void ft2_sampled_set_pan_env_point(int index, int tick, int value);

/*
 * Bulk config load/dump
 *
 * Buffer layout (121 bytes max):
 *   [0]      volume (0-64)
 *   [1]      panning (0-255)
 *   [2-3]    finetune (int16 LE)
 *   [4]      relative_note (int8)
 *   [5]      loop_type (0/1/2)
 *   [6-9]    loop_start (int32 LE)
 *   [10-13]  loop_length (int32 LE)
 *   [14-15]  fadeout (uint16 LE)
 *   [16]     vib_type
 *   [17]     vib_sweep
 *   [18]     vib_depth
 *   [19]     vib_rate
 *   Vol envelope (52 bytes):
 *     [20]     flags (bit0=enabled, bit1=sustain, bit2=loop)
 *     [21]     sustain_point
 *     [22]     loop_start_point
 *     [23]     loop_end_point
 *     [24..71] 12 points x 4 bytes (tick:uint16 LE, value:uint16 LE)
 *   Pan envelope (52 bytes):
 *     [72]     flags
 *     [73]     sustain_point
 *     [74]     loop_start_point
 *     [75]     loop_end_point
 *     [76..123] 12 points x 4 bytes
 *   Num points:
 *     [124]    vol_env_num_points
 *     [125]    pan_env_num_points
 * Total: 126 bytes
 */
void ft2_sampled_load_config(const uint8_t *buf, int len);
int  ft2_sampled_dump_config(uint8_t *buf, int max_len);
