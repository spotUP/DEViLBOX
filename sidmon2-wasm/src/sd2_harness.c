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
