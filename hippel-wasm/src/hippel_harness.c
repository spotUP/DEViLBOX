/*
 * Jochen Hippel WASM harness
 */

#include "hippel/paula_soft.c"
#include "hippel/hippel.c"  /* unity build */
#include <stdlib.h>
#include <string.h>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define EXPORT
#endif

static int g_initialized = 0;
static double g_frames_per_tick = 0.0;
static double g_accum = 0.0;
static uint8_t *g_song_buf = NULL;
static uint32_t g_tick_count = 0;

#define VBLANK_HZ 50.0

EXPORT int player_init(const uint8_t *module_data, uint32_t module_size) {
    paula_reset();
    g_accum = 0.0;
    g_tick_count = 0;
    g_frames_per_tick = (double)PAULA_RATE_PAL / VBLANK_HZ;

    if (g_song_buf) { free(g_song_buf); g_song_buf = NULL; }

    g_song_buf = (uint8_t *)malloc(module_size);
    if (!g_song_buf) return -1;
    memcpy(g_song_buf, module_data, module_size);

    a0 = (uint32_t)(uintptr_t)g_song_buf;
    InitSound();
    InitPlayer();

    g_initialized = 1;
    return 0;
}

EXPORT int player_render(float *buf, int frames) {
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
            Interrupt();
            g_tick_count++;
        }
    }
    return frames;
}

EXPORT void player_stop(void) {
    if (g_initialized) {
        EndPlayer();
        paula_reset();
        if (g_song_buf) { free(g_song_buf); g_song_buf = NULL; }
        g_initialized = 0;
    }
}

EXPORT int player_is_finished(void) { return 0; }
EXPORT int player_get_subsong_count(void) { return 1; }
EXPORT void player_set_subsong(int n) { (void)n; }
EXPORT const char* player_get_title(void) { return "Jochen Hippel"; }
EXPORT double player_detect_duration(void) { return 0.0; }
