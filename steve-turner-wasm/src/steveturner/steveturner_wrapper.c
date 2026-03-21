// steveturner_wrapper.c — Emscripten WASM bridge for Steve Turner replayer

#include "steveturner.h"
#include "paula_soft.h"
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

static int   s_loaded         = 0;
static int   s_finished       = 0;
static int   s_paused         = 0;  // paused = render Paula but don't advance song
static float s_tick_accum     = 0.0f;
// Steve Turner timer = $1BC0 (7104). CIA PAL clock = 709379 Hz.
// Tick rate = 709379 / 7104 ≈ 99.86 Hz (2× standard VBlank)
static float s_ticks_per_sec  = 99.86f;
static float s_samples_per_tick = 0.0f;

void player_init(int sample_rate) {
    s_ticks_per_sec = 99.86f;
    // Use actual output sample rate for tick timing (not Paula's internal 28150 Hz clock)
    float rate = sample_rate > 0 ? (float)sample_rate : (float)PAULA_RATE_PAL;
    s_samples_per_tick = rate / s_ticks_per_sec;
    paula_reset();
    st_init();
    s_loaded = 0;
    s_finished = 0;
    s_paused = 0;
    s_tick_accum = 0.0f;
}

int player_load(const uint8_t *data, int len) {
    if (!data || len <= 0) return 0;

    paula_reset();

    if (!st_load(data, len)) return 0;

    // Start first subsong
    st_set_subsong(1);

    s_loaded = 1;
    s_finished = 0;
    s_paused = 0;
    s_tick_accum = 0.0f;
    return 1;
}

int player_render(float *buffer, int frames) {
    if (!s_loaded) { memset(buffer, 0, frames * 2 * sizeof(float)); return -1; }

    int written = 0;
    while (written < frames) {
        int chunk = (frames - written) < 64 ? (frames - written) : 64;
        // Always render Paula audio (needed for note preview even when paused/finished)
        paula_render(buffer + written * 2, chunk);
        written += chunk;

        // Only advance song ticks if not paused and not finished
        if (!s_paused && !s_finished) {
            s_tick_accum += (float)chunk;
            while (s_tick_accum >= s_samples_per_tick) {
                s_tick_accum -= s_samples_per_tick;
                st_tick();
                if (st_is_finished()) {
                    // Loop: restart the current subsong instead of stopping
                    st_set_subsong(1);
                    break;
                }
            }
        }
    }
    return frames;
}

void player_stop(void) {
    st_stop();
    paula_reset();
    s_loaded = 0;
    s_finished = 1;
    s_paused = 0;
}

void player_pause(void) {
    s_paused = 1;
    // Silence all Paula channels so song audio stops
    for (int i = 0; i < 4; i++) paula_set_volume(i, 0);
}

void player_resume(void) {
    s_paused = 0;
}

void player_set_sample_rate(float rate) {
    paula_set_output_rate(rate);
    if (s_ticks_per_sec > 0.0f) {
        s_samples_per_tick = rate / s_ticks_per_sec;
    }
}

int player_is_finished(void) { return s_finished ? 1 : 0; }

int player_get_subsong_count(void) { return st_get_subsong_count(); }

void player_set_subsong(int n) {
    if (!s_loaded) return;
    paula_reset();
    st_set_subsong(n);
    s_finished = 0;
    s_paused = 0;
    s_tick_accum = 0.0f;
}

const char *player_get_title(void) { return "Steve Turner"; }

double player_detect_duration(void) { return 0.0; }

void player_get_channel_levels(float *out4) {
    paula_get_channel_levels(out4);
}

void player_set_channel_gain(int ch, float gain) {
    paula_set_channel_gain(ch, gain);
}

int player_get_num_instruments(void) {
    return st_get_num_instruments();
}

int player_get_instrument_param(int inst, int param_id) {
    return st_get_instrument_param(inst, param_id);
}

void player_set_instrument_param(int inst, int param_id, int value) {
    st_set_instrument_param(inst, param_id, value);
}

void player_note_on(int instrument, int note, int velocity) {
    st_note_on(instrument, note, velocity);
}

void player_note_off(void) {
    st_note_off();
}
