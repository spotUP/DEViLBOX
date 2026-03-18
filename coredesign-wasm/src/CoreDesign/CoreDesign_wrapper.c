// CoreDesign_wrapper.c — Emscripten C-linkage shim for Core Design replayer
#include "CoreDesign.h"
#include "paula_soft.h"
#include <stdint.h>
#include <string.h>
#include <stdlib.h>
#include <emscripten.h>

// Forward declarations for transpiled replayer functions
extern void InitPlayer(void);
extern void InitSound(void);
extern void Interrupt(void);
extern void EndSound(void);

// Module data storage
static uint8_t* s_mod_buf = NULL;
static int       s_mod_len = 0;
static int       s_loaded         = 0;
static int       s_finished       = 0;
static float     s_tick_accum     = 0.0f;
static float     s_ticks_per_sec  = 50.0f;
static float     s_samples_per_tick = 0.0f;

EMSCRIPTEN_KEEPALIVE
void player_init(int sample_rate) {
    int rate = sample_rate > 0 ? sample_rate : PAULA_RATE_PAL;
    s_ticks_per_sec    = 50.0f;
    s_samples_per_tick = (float)rate / s_ticks_per_sec;
    paula_reset();
    paula_set_output_rate((float)rate);
    s_loaded   = 0;
    s_finished = 0;
    s_tick_accum = 0.0f;
}

EMSCRIPTEN_KEEPALIVE
int player_load(const uint8_t* data, int len) {
    if (!data || len <= 0) return 0;
    if (s_mod_buf) { free(s_mod_buf); s_mod_buf = NULL; }
    s_mod_buf = (uint8_t*)malloc(len);
    if (!s_mod_buf) return 0;
    memcpy(s_mod_buf, data, len);
    s_mod_len = len;

    // Set the module pointer in the transpiled replayer's data segment.
    // ModulePtr is at _ds+346 — a 32-bit value storing the module address.
    // In the transpiled code, addresses are raw pointers cast to uint32_t.
    extern uint8_t _ds[];
    {
        uintptr_t ptr = (uintptr_t)s_mod_buf;
        // Store as native pointer (not big-endian) since READ32 handles byte order
        _ds[346] = (uint8_t)(ptr >> 24);
        _ds[347] = (uint8_t)(ptr >> 16);
        _ds[348] = (uint8_t)(ptr >> 8);
        _ds[349] = (uint8_t)(ptr);
    }

    paula_reset();
    InitPlayer();
    InitSound();

    s_loaded   = 1;
    s_finished = 0;
    s_tick_accum = 0.0f;
    return 1;
}

EMSCRIPTEN_KEEPALIVE
int player_render(float* buffer, int frames) {
    if (!s_loaded)  { memset(buffer, 0, frames * 2 * sizeof(float)); return -1; }
    if (s_finished) { memset(buffer, 0, frames * 2 * sizeof(float)); return 0; }
    int written = 0;
    while (written < frames) {
        int chunk = (frames - written) < 64 ? (frames - written) : 64;
        paula_render(buffer + written * 2, chunk);
        written += chunk;
        s_tick_accum += (float)chunk;
        while (s_tick_accum >= s_samples_per_tick) {
            s_tick_accum -= s_samples_per_tick;
            Interrupt();
        }
    }
    return frames;
}

EMSCRIPTEN_KEEPALIVE void player_stop(void) { EndSound(); paula_reset(); s_loaded = 0; s_finished = 1; }
EMSCRIPTEN_KEEPALIVE int player_is_finished(void) { return s_finished ? 1 : 0; }
EMSCRIPTEN_KEEPALIVE int player_get_subsong_count(void) { return 1; }
EMSCRIPTEN_KEEPALIVE void player_set_subsong(int n) { (void)n; }
EMSCRIPTEN_KEEPALIVE const char* player_get_title(void) { return "Core Design"; }
EMSCRIPTEN_KEEPALIVE double player_detect_duration(void) { return 0.0; }
EMSCRIPTEN_KEEPALIVE void player_get_channel_levels(float* out4) { paula_get_channel_levels(out4); }
