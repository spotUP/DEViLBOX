/*
 * Organya WASM harness — Cave Story music format
 *
 * Wraps the organya.h single-header library for Emscripten/AudioWorklet.
 * Outputs interleaved stereo F32 audio.
 */

#include "organya_impl.c"

#include <math.h>
#include <stdlib.h>
#include <string.h>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define EXPORT
#endif

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

/* ---- State ---- */

static organya_context g_ctx;
static int g_initialized = 0;
static int g_song_loaded = 0;
static uint32_t g_sample_rate = 48000;

/* Generate default wavetable (basic waveforms for melody channels) */
static void generate_default_wavetable(organya_context *ctx) {
    for (int wave = 0; wave < ORG_WAVETABLE_COUNT; wave++) {
        uint8_t *data = &ctx->melody_wave_data[wave * 0x100];
        if (wave < 6) {
            /* Sine */
            for (int i = 0; i < 256; i++) {
                double phase = (double)i / 256.0 * 2.0 * M_PI;
                data[i] = (uint8_t)(int8_t)(sin(phase) * 64.0);
            }
        } else if (wave < 12) {
            /* Triangle */
            for (int i = 0; i < 256; i++) {
                if (i < 64) data[i] = (uint8_t)(int8_t)(i * 2);
                else if (i < 192) data[i] = (uint8_t)(int8_t)(127 - (i - 64) * 2);
                else data[i] = (uint8_t)(int8_t)(-128 + (i - 192) * 2);
            }
        } else if (wave < 18) {
            /* Square with varying duty */
            int duty = 128 + (wave - 12) * 10;
            if (duty > 230) duty = 230;
            for (int i = 0; i < 256; i++)
                data[i] = (uint8_t)(int8_t)(i < duty ? 64 : -64);
        } else if (wave < 24) {
            /* Sawtooth */
            for (int i = 0; i < 256; i++)
                data[i] = (uint8_t)(int8_t)(i / 2 - 64);
        } else {
            /* Harmonics blend */
            int harmonics = 1 + (wave % 8);
            for (int i = 0; i < 256; i++) {
                double val = 0.0;
                for (int h = 1; h <= harmonics; h++)
                    val += sin((double)i / 256.0 * 2.0 * M_PI * h) / h;
                val = val * 50.0 / harmonics;
                if (val > 127.0) val = 127.0;
                if (val < -128.0) val = -128.0;
                data[i] = (uint8_t)(int8_t)val;
            }
        }
    }
}

/* ---- Per-channel muting ---- */

/*
 * Organya has built-in per-channel muting via organya_context_set_mute().
 * 8 melody channels (0-7) + 8 percussion channels (8-15) = 16 total.
 *
 * gain == 0 → muted
 * gain >  0 → unmuted
 */

#define ORGANYA_MAX_CHANNELS 16
static float g_channel_gain[ORGANYA_MAX_CHANNELS];

static void organya_init_gains(void) {
    for (int i = 0; i < ORGANYA_MAX_CHANNELS; i++) g_channel_gain[i] = 1.0f;
}

EXPORT void organya_set_channel_gain(int ch, float gain) {
    if (ch < 0 || ch >= ORGANYA_MAX_CHANNELS) return;
    g_channel_gain[ch] = gain;
    if (g_initialized && g_song_loaded) {
        organya_context_set_mute(&g_ctx, (size_t)ch, gain <= 0.0f ? ORG_TRUE : ORG_FALSE);
    }
}

/* ---- Soundbank state ---- */
static uint8_t *g_soundbank_data = NULL;
static uint32_t g_soundbank_size = 0;

/* ---- Public API ---- */

EXPORT int organya_load_soundbank(const uint8_t *data, uint32_t size) {
    /* Cache the soundbank so it can be applied on each init */
    if (g_soundbank_data) { free(g_soundbank_data); g_soundbank_data = NULL; }
    g_soundbank_data = (uint8_t *)malloc(size);
    if (!g_soundbank_data) return -1;
    memcpy(g_soundbank_data, data, size);
    g_soundbank_size = size;
    return 0;
}

EXPORT int organya_init(const uint8_t *data, uint32_t size) {
    if (g_song_loaded) {
        organya_context_unload_song(&g_ctx);
        g_song_loaded = 0;
    }
    if (g_initialized) {
        organya_context_deinit(&g_ctx);
        g_initialized = 0;
    }

    organya_result res = organya_context_init(&g_ctx);
    if (res != ORG_RESULT_SUCCESS) return -1;
    g_initialized = 1;

    organya_context_set_sample_rate(&g_ctx, g_sample_rate);
    organya_context_set_interpolation(&g_ctx, ORG_INTERPOLATION_LAGRANGE);

    /* Load soundbank if available, otherwise use procedural waveforms */
    if (g_soundbank_data && g_soundbank_size > 0) {
        res = organya_context_read_soundbank(&g_ctx, g_soundbank_data, g_soundbank_size);
        if (res != ORG_RESULT_SUCCESS) {
            generate_default_wavetable(&g_ctx);
        }
    } else {
        generate_default_wavetable(&g_ctx);
    }

    res = organya_context_read_song(&g_ctx, data, size);
    if (res != ORG_RESULT_SUCCESS) return -2;
    g_song_loaded = 1;

    organya_context_seek(&g_ctx, 0);
    organya_init_gains();
    return 0;
}

EXPORT void organya_stop(void) {
    if (g_song_loaded) {
        organya_context_unload_song(&g_ctx);
        g_song_loaded = 0;
    }
    if (g_initialized) {
        organya_context_deinit(&g_ctx);
        g_initialized = 0;
    }
}

EXPORT int organya_render(float *buf, int frames) {
    if (!g_initialized || !g_song_loaded) {
        memset(buf, 0, (size_t)frames * 2 * sizeof(float));
        return frames;
    }
    return (int)organya_context_generate_samples(&g_ctx, buf, (size_t)frames);
}

EXPORT void organya_set_sample_rate(uint32_t rate) {
    g_sample_rate = rate;
    if (g_initialized) {
        organya_context_set_sample_rate(&g_ctx, rate);
    }
}

EXPORT int organya_get_tempo(void) {
    if (!g_song_loaded) return 0;
    return (int)g_ctx.song.tempo_ms;
}

EXPORT int organya_get_num_channels(void) {
    return 16; /* 8 melody + 8 percussion */
}

/* Per-channel muting block moved above organya_init() */
