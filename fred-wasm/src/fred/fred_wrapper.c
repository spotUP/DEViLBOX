// fred_wrapper.c — Emscripten WASM bridge for Fred Editor replayer

#include "fred.h"
#include "paula_soft.h"
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

static int   s_loaded         = 0;
static int   s_finished       = 0;
static int   s_paused         = 0;
static float s_ticks_per_sec  = 50.0f;  // PAL VBlank rate
static float s_samples_per_tick = 0.0f;
static float s_tick_accum     = 0.0f;

void player_init(int sample_rate) {
    (void)sample_rate;
    s_ticks_per_sec = 50.0f;
    s_samples_per_tick = (float)PAULA_RATE_PAL / s_ticks_per_sec;
    paula_reset();
    fred_init();
    s_loaded = 0;
    s_finished = 0;
    s_paused = 0;
    s_tick_accum = 0.0f;
}

int player_load(const uint8_t *data, int len) {
    if (!data || len <= 0) return 0;

    paula_reset();

    if (!fred_load(data, len)) return 0;

    // Start first subsong
    fred_set_subsong(0);

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
        paula_render(buffer + written * 2, chunk);
        written += chunk;

        if (!s_paused && !s_finished) {
            s_tick_accum += (float)chunk;
            while (s_tick_accum >= s_samples_per_tick) {
                s_tick_accum -= s_samples_per_tick;
                fred_tick();
                if (fred_is_finished()) {
                    // Loop: restart current subsong
                    fred_set_subsong(0);
                    break;
                }
            }
        }
    }
    return frames;
}

void player_stop(void) {
    fred_stop();
    paula_reset();
    s_loaded = 0;
    s_finished = 1;
    s_paused = 0;
}

void player_pause(void) {
    s_paused = 1;
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

int player_get_subsong_count(void) { return fred_get_subsong_count(); }

void player_set_subsong(int n) {
    if (!s_loaded) return;
    paula_reset();
    fred_set_subsong(n);
    s_finished = 0;
    s_paused = 0;
    s_tick_accum = 0.0f;
}

const char *player_get_title(void) { return "Fred Editor"; }

double player_detect_duration(void) { return 0.0; }

void player_get_channel_levels(float *out4) {
    paula_get_channel_levels(out4);
}

void player_set_channel_gain(int ch, float gain) {
    paula_set_channel_gain(ch, gain);
}

int player_get_num_instruments(void) {
    return fred_get_num_instruments();
}

int player_get_instrument_param(int inst, int param_id) {
    return fred_get_instrument_param(inst, param_id);
}

void player_set_instrument_param(int inst, int param_id, int value) {
    fred_set_instrument_param(inst, param_id, value);
}

void player_note_on(int instrument, int note, int velocity) {
    fred_note_on(instrument, note, velocity);
}

void player_note_off(void) {
    fred_note_off();
}
