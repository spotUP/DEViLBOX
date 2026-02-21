#pragma once
#include <stdint.h>

/* Parameter IDs (matching HivelyConfig fields) */
enum InsedParam {
    INSED_VOLUME = 0,
    INSED_WAVELENGTH,
    INSED_ATTACK_FRAMES,
    INSED_ATTACK_VOLUME,
    INSED_DECAY_FRAMES,
    INSED_DECAY_VOLUME,
    INSED_SUSTAIN_FRAMES,
    INSED_RELEASE_FRAMES,
    INSED_RELEASE_VOLUME,
    INSED_VIBRATO_DELAY,
    INSED_VIBRATO_DEPTH,
    INSED_VIBRATO_SPEED,
    INSED_SQUARE_LOWER,
    INSED_SQUARE_UPPER,
    INSED_SQUARE_SPEED,
    INSED_FILTER_LOWER,
    INSED_FILTER_UPPER,
    INSED_FILTER_SPEED,
    INSED_PERF_SPEED,
    INSED_PERF_LENGTH,
    INSED_HARDCUT_FRAMES,
    INSED_HARDCUT_RELEASE,
    INSED_PARAM_COUNT
};

/* Initialize SDL, load assets, create renderer targeting the Emscripten canvas */
void insed_init(int canvas_width, int canvas_height);

/* Start the main loop (Emscripten) */
void insed_start(void);

/* Set/get a parameter value by ID */
void insed_set_param(int param_id, int value);
int  insed_get_param(int param_id);

/* Performance list entry access */
void insed_set_plist_entry(int index, int note, int waveform, int fixed,
                           int fx0, int fxparam0, int fx1, int fxparam1);
void insed_get_plist_entry(int index, int *note, int *waveform, int *fixed,
                           int *fx0, int *fxparam0, int *fx1, int *fxparam1);

/* Bulk load/dump for full sync
   Header (22 bytes): vol, wavelen, aF, aV, dF, dV, sF, rF, rV,
                       vibDel, vibDep, vibSpd, sqLo, sqHi, sqSpd,
                       fltLo, fltHi, fltSpd, perfSpd, perfLen,
                       hardcutFrames, hardcutRelease
   Per-entry (5 bytes): note, waveform|(fixed<<7), fx0<<4|fx1, fxparam0, fxparam1 */
void insed_load_from_buffer(const uint8_t *buf, int len);
int  insed_dump_to_buffer(uint8_t *buf, int max_len);

/* Cleanup SDL resources */
void insed_shutdown(void);
