/**
 * sc68_wrapper.c - WASM wrapper for SC68/SNDH playback
 *
 * Uses wothke's sc68-2.2.1 port (api68 API).
 * Exports EMSCRIPTEN_KEEPALIVE functions for the AudioWorklet.
 */

#include <stdlib.h>
#include <string.h>
#include <stdint.h>

#ifdef EMSCRIPTEN
#include <emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

#include "config68.h"
#include "api68/api68.h"

/* api68_set_replay is already declared in api68.h */

/* Stub for ONDEMAND callback — in our build, replay data is embedded */
int callback_check_replay(const char *name) {
    (void)name;
    return 0;  /* No external replay loading needed */
}

static api68_t *g_sc68 = NULL;
static api68_init_t g_init;
static int g_playing = 0;
static int g_first_init = 1;

/* SC68 renders signed 16-bit stereo PCM (interleaved). We convert to float. */
static int g_pcm_buf[1024]; /* 256 frames * 2 channels * 2 bytes fits in 256 ints */

EMSCRIPTEN_KEEPALIVE
int sc68_wasm_init(uint8_t *data, int len) {
    /* Stop and clean up previous state */
    if (g_sc68) {
        api68_stop(g_sc68);
        api68_close(g_sc68);
        api68_shutdown(g_sc68);
        g_sc68 = NULL;
    }

    /* Reset ONDEMAND replay registration */
    if (!g_first_init) {
        api68_set_replay(0, 0, 0, 0);
    }
    g_first_init = 0;

    /* Initialize api68 */
    memset(&g_init, 0, sizeof(g_init));
    g_init.alloc = malloc;
    g_init.free = free;
    g_init.sampling_rate = 48000;

    g_sc68 = api68_init(&g_init);
    if (!g_sc68) {
        return -1;
    }

    /* Load from memory */
    if (api68_load_mem(g_sc68, data, len)) {
        api68_shutdown(g_sc68);
        g_sc68 = NULL;
        return -2;
    }

    /* Start playing track 1 */
    api68_play(g_sc68, 1);

    /* Prime the player (first process call loads the track) */
    api68_process(g_sc68, NULL, 0);

    g_playing = 1;
    return 0;
}

EMSCRIPTEN_KEEPALIVE
int sc68_wasm_render(float *out, int frames) {
    if (!g_sc68 || !g_playing) {
        memset(out, 0, frames * 2 * sizeof(float));
        return frames;
    }

    /* api68_process takes frame count, fills with signed 16-bit stereo PCM */
    int n = frames;
    if (n > 512) n = 512; /* safety limit */

    int code = api68_process(g_sc68, g_pcm_buf, n);

    /* Convert int16 stereo PCM to interleaved float [-1.0, 1.0] */
    const int16_t *pcm = (const int16_t *)g_pcm_buf;
    const float inv = 1.0f / 32768.0f;
    for (int i = 0; i < n * 2; i++) {
        out[i] = (float)pcm[i] * inv;
    }

    /* Zero-fill remainder */
    if (n < frames) {
        memset(out + n * 2, 0, (frames - n) * 2 * sizeof(float));
    }

    /* If track ended, restart (infinite loop) */
    if (code & API68_END) {
        api68_play(g_sc68, 1);
        api68_process(g_sc68, NULL, 0);
    }

    return n;
}

EMSCRIPTEN_KEEPALIVE
void sc68_wasm_stop(void) {
    g_playing = 0;
    if (g_sc68) {
        api68_stop(g_sc68);
    }
}

EMSCRIPTEN_KEEPALIVE
void sc68_wasm_set_channel_gain(int channel, float gain) {
    /* YM2149 has 3 channels — per-channel gain not supported in sc68 2.2.1 */
    (void)channel;
    (void)gain;
}
