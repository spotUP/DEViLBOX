/*
 * SidMon 2.0 WASM harness
 * Wraps RetrovertApp/playback_plugins C API into player_* exports for the worklet.
 */

#include "sd2/sidmon2.h"
#include <stdlib.h>
#include <string.h>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define EXPORT
#endif

static Sd2Module *g_module = NULL;
static float g_sample_rate = 44100.0f;

EXPORT int player_init(const uint8_t *module_data, uint32_t module_size) {
    if (g_module) {
        sd2_destroy(g_module);
        g_module = NULL;
    }
    g_module = sd2_create(module_data, (size_t)module_size, g_sample_rate);
    return g_module ? 0 : -1;
}

EXPORT int player_render(float *buf, int frames) {
    if (!g_module) return 0;
    return (int)sd2_render(g_module, buf, (size_t)frames);
}

EXPORT void player_stop(void) {
    if (g_module) {
        sd2_destroy(g_module);
        g_module = NULL;
    }
}

EXPORT void player_set_sample_rate(int rate) {
    g_sample_rate = (float)rate;
}

EXPORT int player_is_finished(void) {
    if (!g_module) return 1;
    return sd2_has_ended(g_module) ? 1 : 0;
}

EXPORT int player_get_subsong_count(void) {
    if (!g_module) return 1;
    return sd2_subsong_count(g_module);
}

EXPORT void player_set_subsong(int n) {
    if (g_module) sd2_select_subsong(g_module, n);
}

EXPORT const char *player_get_title(void) {
    return "SidMon 2.0";
}

EXPORT double player_detect_duration(void) {
    return 0.0;
}

EXPORT void player_set_channel_gain(int ch, float gain) {
    if (!g_module || ch < 0 || ch >= 4) return;
    /* Use channel_mask for binary mute/unmute */
    uint32_t mask = 0xf; /* start with all enabled */
    /* We need to track per-channel gains to reconstruct the mask */
    static float s_gains[4] = {1.0f, 1.0f, 1.0f, 1.0f};
    s_gains[ch] = gain;
    mask = 0;
    for (int i = 0; i < 4; i++) {
        if (s_gains[i] > 0.0f) mask |= (1U << i);
    }
    sd2_set_channel_mask(g_module, mask);
}

/* ---- Track editing API ---- */

EXPORT int sd2_bridge_get_num_tracks(void) {
    if (!g_module) return 0;
    return sd2_get_num_tracks(g_module);
}

EXPORT int sd2_bridge_get_track_length(int track_idx) {
    if (!g_module) return 0;
    return sd2_get_track_length(g_module, track_idx);
}

EXPORT uint32_t sd2_bridge_get_cell(int track_idx, int row) {
    if (!g_module) return 0;
    return sd2_get_cell(g_module, track_idx, row);
}

EXPORT void sd2_bridge_set_cell(int track_idx, int row,
                                int note, int instrument, int effect, int param) {
    if (!g_module) return;
    sd2_set_cell(g_module, track_idx, row, note, instrument, effect, param);
}

/* ---- Instrument preview API ---- */

static int g_preview_active = 0;

EXPORT void sd2_note_on(int instrument, int note, int velocity) {
    if (!g_module) return;

    /* Validate instrument index (1-based in SidMon II) */
    int inst_idx = instrument;
    if (inst_idx < 0 || inst_idx >= sd2_get_instrument_count(g_module)) return;

    /* Validate note (1-72 range) */
    if (note < 1 || note > 72) note = 25; /* default to C-3 */

    /* Set up voice 0 for preview using sd2_preview_note_on */
    sd2_preview_note_on(g_module, inst_idx, note, velocity);
    g_preview_active = 1;
}

EXPORT void sd2_note_off(void) {
    if (!g_module) return;
    sd2_preview_note_off(g_module);
    g_preview_active = 0;
}

EXPORT int sd2_render_preview(float *buf, int frames) {
    if (!g_module || !g_preview_active) {
        memset(buf, 0, (size_t)frames * 2 * sizeof(float));
        return frames;
    }
    return (int)sd2_render(g_module, buf, (size_t)frames);
}

/* ---- Save/serialize API ---- */

static uint8_t *g_save_buf = NULL;
static uint32_t g_save_size = 0;

EXPORT uint32_t sd2_save(void) {
    if (g_save_buf) { free(g_save_buf); g_save_buf = NULL; g_save_size = 0; }
    if (!g_module) return 0;
    g_save_size = sd2_serialize(g_module, &g_save_buf);
    return g_save_size;
}

EXPORT uint8_t *sd2_save_ptr(void) {
    return g_save_buf;
}

EXPORT void sd2_save_free(void) {
    if (g_save_buf) { free(g_save_buf); g_save_buf = NULL; g_save_size = 0; }
}
