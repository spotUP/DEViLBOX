// pumatracker_wrapper.c — Emscripten C-linkage wrapper for PumaTracker replay
//
// Bridges the transpiled 68k replayer (pumatracker.c) with paula_soft audio output.
// The transpiled code uses Mt_Data (a global variable) as the module base address.

#include "pumatracker.h"
#include "paula_soft.h"
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

// Defined in pumatracker.c — the module data base address
extern uint32_t g_Mt_Data;

static int   s_loaded         = 0;
static int   s_finished       = 0;
static float s_tick_accum     = 0.0f;
static float s_ticks_per_sec  = 50.0f;  // CIA 50 Hz PAL
static float s_samples_per_tick = 0.0f;
static uint8_t* s_module_buf  = NULL;

void player_init(int sample_rate) {
    (void)sample_rate;
    s_ticks_per_sec    = 50.0f;
    s_samples_per_tick = (float)PAULA_RATE_PAL / s_ticks_per_sec;
    paula_reset();
    s_loaded   = 0;
    s_finished = 0;
    s_tick_accum = 0.0f;
}

int player_load(const uint8_t* data, int len) {
    if (!data || len <= 0) return 0;

    // Free previous module buffer
    if (s_module_buf) { free(s_module_buf); s_module_buf = NULL; }

    // Allocate and copy module data
    s_module_buf = (uint8_t*)malloc(len);
    if (!s_module_buf) return 0;
    memcpy(s_module_buf, data, len);

    // Set the module base address for the transpiled replayer
    g_Mt_Data = (uint32_t)(uintptr_t)s_module_buf;

    // Reset Paula and call the transpiled init
    paula_reset();
    Mt_init();

    s_loaded   = 1;
    s_finished = 0;
    s_tick_accum = 0.0f;
    return 1;
}

int player_render(float* buffer, int frames) {
    if (!s_loaded) { memset(buffer, 0, frames * 2 * sizeof(float)); return -1; }
    if (s_finished) { memset(buffer, 0, frames * 2 * sizeof(float)); return 0; }

    int written = 0;
    while (written < frames) {
        int chunk = (frames - written) < 64 ? (frames - written) : 64;
        paula_render(buffer + written * 2, chunk);
        written += chunk;
        s_tick_accum += (float)chunk;
        while (s_tick_accum >= s_samples_per_tick) {
            s_tick_accum -= s_samples_per_tick;
            Mt_Music();
        }
    }
    return frames;
}

void player_stop(void) {
    Mt_end();
    paula_reset();
    s_loaded   = 0;
    s_finished = 1;
}

void player_set_sample_rate(float rate) {
    paula_set_output_rate(rate);
    if (s_ticks_per_sec > 0.0f) {
        s_samples_per_tick = rate / s_ticks_per_sec;
    }
}

int player_is_finished(void) { return s_finished ? 1 : 0; }
int player_get_subsong_count(void) { return 1; }
void player_set_subsong(int n) { (void)n; }
const char* player_get_title(void) { return "PumaTracker"; }
double player_detect_duration(void) { return 0.0; }

void player_get_channel_levels(float* out4) {
    paula_get_channel_levels(out4);
}

void player_set_channel_gain(int ch, float gain) {
    paula_set_channel_gain(ch, gain);
}
