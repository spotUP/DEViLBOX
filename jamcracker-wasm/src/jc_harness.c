/*
 * JamCracker Pro WASM harness
 * Loads .jam module → pp_init → drives pp_play at 50Hz → renders via Paula
 */

#include "JamCrackerProReplay.c"  /* unity build */
#include "paula_soft.h"
#include <stdlib.h>
#include <string.h>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define EXPORT
#endif

/* ---- State ---- */
static int g_initialized = 0;
static double g_frames_per_tick = 0.0;
static double g_accum = 0.0;
static uint8_t *g_song_buf = NULL;
static uint16_t g_song_length = 0;
static uint16_t g_num_patterns = 0;
static uint16_t g_num_instruments = 0;
static uint32_t g_tick_count = 0;

#define VBLANK_HZ 50.0

/* ---- Public API ---- */

EXPORT int jc_init(const uint8_t *module_data, uint32_t module_size) {
    paula_reset();
    g_accum = 0.0;
    g_tick_count = 0;
    g_frames_per_tick = (double)PAULA_RATE_PAL / VBLANK_HZ;

    /* Free previous song data if any */
    if (g_song_buf) { free(g_song_buf); g_song_buf = NULL; }

    g_song_buf = (uint8_t *)malloc(module_size);
    if (!g_song_buf) return -1;
    memcpy(g_song_buf, module_data, module_size);

    /* Read module header for metadata (big-endian) */
    if (module_size >= 10) {
        g_num_instruments = (uint16_t)((module_data[4] << 8) | module_data[5]);
        uint32_t pos = 6 + g_num_instruments * 40;
        if (pos + 2 <= module_size) {
            g_num_patterns = (uint16_t)((module_data[pos] << 8) | module_data[pos + 1]);
            pos += 2 + g_num_patterns * 6;
            if (pos + 2 <= module_size) {
                g_song_length = (uint16_t)((module_data[pos] << 8) | module_data[pos + 1]);
            }
        }
    }

    /* pp_init expects a0 = module data pointer */
    a0 = (uint32_t)(uintptr_t)g_song_buf;
    pp_init();

    g_initialized = 1;
    return 0;
}

EXPORT int jc_render(float *buf, int frames) {
    if (!g_initialized) return 0;
    float *out = buf;
    int remaining = frames;

    while (remaining > 0) {
        double until_tick = g_frames_per_tick - g_accum;
        int n = (int)until_tick;
        if (n < 1) n = 1;
        if (n > remaining) n = remaining;

        int got = paula_render(out, n);
        out += got * 2;
        remaining -= got;
        g_accum += (double)got;

        if (g_accum >= g_frames_per_tick) {
            g_accum -= g_frames_per_tick;
            pp_play();
            g_tick_count++;
        }
    }
    return frames;
}

EXPORT void jc_stop(void) {
    if (!g_initialized) return;
    pp_end();
    g_initialized = 0;
    if (g_song_buf) { free(g_song_buf); g_song_buf = NULL; }
}

/* Position: current song position index (counts down from song_length) */
EXPORT int jc_get_song_pos(void) {
    if (!g_initialized) return 0;
    return (int)g_song_length - (int)READ16((uintptr_t)pp_songcnt);
}

/* Row within current pattern (counts down from pattern row count) */
EXPORT int jc_get_row(void) {
    if (!g_initialized) return 0;
    return (int)READ8((uintptr_t)pp_notecnt);
}

/* Current speed (ticks per row) */
EXPORT int jc_get_speed(void) {
    if (!g_initialized) return 6;
    return (int)READ8((uintptr_t)pp_wait);
}

/* Total tick count since init */
EXPORT uint32_t jc_get_tick(void) {
    return g_tick_count;
}

/* Module metadata */
EXPORT int jc_get_song_length(void) { return (int)g_song_length; }
EXPORT int jc_get_num_patterns(void) { return (int)g_num_patterns; }
EXPORT int jc_get_num_instruments(void) { return (int)g_num_instruments; }
EXPORT int jc_get_sample_rate(void) { return PAULA_RATE_PAL; }
