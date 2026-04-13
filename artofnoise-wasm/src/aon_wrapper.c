/**
 * aon_wrapper.c — Thin Emscripten wrapper around aon_player.c
 *
 * Exposes the standard DEViLBOX WASM engine API:
 *   player_init, player_load, player_render, player_stop,
 *   player_set_sample_rate, player_is_finished, player_get_title, etc.
 *
 * The AoN player outputs interleaved stereo float samples directly,
 * so no Paula emulation or format conversion is needed.
 */

#include "aon_player.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#endif

static AonSong* g_song = NULL;
static uint32_t g_sample_rate = 48000;
static char g_title[512] = {0};

// Channel level tracking (peak per channel per render call)
static float g_channel_levels[AON_MAX_CHANNELS * 2]; // L+R per channel

void player_init(void) {
    // Nothing to do globally; song is created on load
}

int player_load(const uint8_t* data, uint32_t size) {
    if (g_song) {
        aon_song_destroy(g_song);
        g_song = NULL;
    }

    g_song = aon_song_create(data, size);
    if (!g_song) return 0;

    aon_song_set_sample_rate(g_song, g_sample_rate);
    aon_song_start(g_song);

    // Build title from metadata
    const AonSongMetadata* meta = aon_song_get_metadata(g_song);
    if (meta && meta->song_name[0]) {
        snprintf(g_title, sizeof(g_title), "%s", meta->song_name);
    } else {
        g_title[0] = '\0';
    }

    return 1;
}

int player_render(float* buffer, int num_frames) {
    if (!g_song) return 0;
    int rendered = aon_song_decode(g_song, buffer, num_frames);
    return rendered > 0 ? rendered : 0;
}

void player_stop(void) {
    if (g_song) {
        aon_song_destroy(g_song);
        g_song = NULL;
    }
}

void player_set_sample_rate(uint32_t rate) {
    g_sample_rate = rate;
    if (g_song) {
        aon_song_set_sample_rate(g_song, rate);
    }
}

int player_is_finished(void) {
    if (!g_song) return 1;
    return aon_song_is_finished(g_song) ? 1 : 0;
}

int player_get_subsong_count(void) {
    return 1; // AoN modules have a single song
}

void player_set_subsong(int index) {
    (void)index; // Only one subsong
}

const char* player_get_title(void) {
    return g_title;
}

int player_detect_duration(void) {
    return 0; // Duration detection not supported
}

/**
 * Get per-channel audio levels (peak amplitude per render).
 * Returns pointer to float array: [ch0_L, ch0_R, ch1_L, ch1_R, ...]
 * This is populated by enabling scope capture and reading back.
 */
float* player_get_channel_levels(void) {
    if (!g_song) {
        memset(g_channel_levels, 0, sizeof(g_channel_levels));
        return g_channel_levels;
    }

    const AonSongMetadata* meta = aon_song_get_metadata(g_song);
    int nch = meta ? meta->num_channels : 4;

    // Use scope capture for per-channel levels
    aon_song_enable_scope_capture(g_song, 1);
    float scope_buf[AON_SCOPE_BUFFER_SIZE];
    for (int ch = 0; ch < nch && ch < AON_MAX_CHANNELS; ch++) {
        uint32_t count = aon_song_get_scope_data(g_song, ch, scope_buf, AON_SCOPE_BUFFER_SIZE);
        float peak = 0.0f;
        for (uint32_t i = 0; i < count; i++) {
            float v = scope_buf[i] < 0 ? -scope_buf[i] : scope_buf[i];
            if (v > peak) peak = v;
        }
        // AoN uses Amiga-style L/R panning: ch 0,3,4,7=left, 1,2,5,6=right
        int is_right = (ch == 1 || ch == 2 || ch == 5 || ch == 6);
        g_channel_levels[ch * 2 + 0] = is_right ? 0.0f : peak;
        g_channel_levels[ch * 2 + 1] = is_right ? peak : 0.0f;
    }

    return g_channel_levels;
}

void player_set_channel_gain(int channel, float gain) {
    // AoN player doesn't have per-channel gain; solo is the closest
    (void)channel;
    (void)gain;
}

int player_get_instrument_count(void) {
    if (!g_song) return 0;
    const AonSongMetadata* meta = aon_song_get_metadata(g_song);
    return meta ? meta->num_instruments : 0;
}

float player_get_instrument_param(int inst, const char* param) {
    if (!g_song) return -1.0f;
    return aon_song_get_instrument_param(g_song, inst, param);
}

void player_set_instrument_param(int inst, const char* param, float value) {
    if (!g_song) return;
    aon_song_set_instrument_param(g_song, inst, param, value);
}
