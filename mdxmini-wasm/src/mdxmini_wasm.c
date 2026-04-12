/**
 * mdxmini_wasm.c - Emscripten WASM bridge for mdxmini MDX player
 *
 * Provides a simple C API for loading MDX files from memory and rendering
 * S16 stereo audio, suitable for use from an AudioWorklet.
 */

#include <stdlib.h>
#include <string.h>
#include <emscripten/emscripten.h>

#include "mdxmini.h"
#include "mdx.h"
#include "class.h"

static t_mdxmini g_mdx;
static int g_initialized = 0;
static int g_loaded = 0;
static int g_sample_rate = 44100;

/* Temporary buffer for S16 rendering */
#define MAX_RENDER_FRAMES 4096
static short g_render_buf[MAX_RENDER_FRAMES * 2]; /* stereo */

EMSCRIPTEN_KEEPALIVE
void mdxmini_wasm_init(int sample_rate) {
    if (g_loaded) {
        mdx_close(&g_mdx);
        g_loaded = 0;
    }
    g_sample_rate = sample_rate > 0 ? sample_rate : 44100;
    mdx_set_rate(g_sample_rate);
    g_initialized = 1;
}

EMSCRIPTEN_KEEPALIVE
int mdxmini_wasm_load(unsigned char *data, int len) {
    if (!g_initialized) return -1;

    /* Close any previously loaded song */
    if (g_loaded) {
        mdx_close(&g_mdx);
        g_loaded = 0;
    }

    memset(&g_mdx, 0, sizeof(t_mdxmini));

    /* Set rate before opening */
    mdx_set_rate(g_sample_rate);

    /* Allocate songdata */
    g_mdx.songdata = (songdata *)malloc(sizeof(songdata));
    if (!g_mdx.songdata) return -2;
    memset(g_mdx.songdata, 0, sizeof(songdata));

    /* Construct internal instances */
    g_mdx.songdata->mdx2151 = _mdx2151_initialize();
    if (!g_mdx.songdata->mdx2151) { free(g_mdx.songdata); return -3; }
    g_mdx.songdata->mdxmml_ym2151 = _mdxmml_ym2151_initialize();
    if (!g_mdx.songdata->mdxmml_ym2151) { free(g_mdx.songdata); return -3; }
    g_mdx.songdata->pcm8 = _pcm8_initialize();
    if (!g_mdx.songdata->pcm8) { free(g_mdx.songdata); return -3; }

    /* Open MDX from memory */
    g_mdx.mdx = mdx_open_mdx_mem(data, len);
    if (!g_mdx.mdx) {
        free(g_mdx.songdata);
        return -4;
    }

    MDX_DATA *mdx = g_mdx.mdx;
    mdx->is_use_pcm8     = FLAG_TRUE;
    mdx->is_use_fm        = FLAG_TRUE;
    mdx->is_use_opl3      = FLAG_TRUE;
    mdx->is_use_ym2151    = FLAG_TRUE;
    mdx->is_use_fm_voice  = FLAG_FALSE;
    mdx->fm_wave_form     = 0;
    mdx->master_volume    = 127;
    mdx->fm_volume        = 127;
    mdx->pcm_volume       = 127;
    mdx->max_infinite_loops = 3;
    mdx->fade_out_speed   = 5;
    mdx->dsp_speed        = g_sample_rate;

    /* Parse voice data */
    if (mdx_get_voice_parameter(mdx) != 0) {
        mdx_close_mdx(mdx);
        free(g_mdx.songdata);
        g_mdx.mdx = NULL;
        return -5;
    }

    /* No PDX loaded yet */
    g_mdx.pdx = NULL;
    mdx->haspdx = FLAG_FALSE;
    mdx->pdx_enable = FLAG_TRUE;

    /* Initialize MML parser */
    extern void ym2151_set_logging(int flag, songdata *);
    ym2151_set_logging(1, g_mdx.songdata);

    g_mdx.self = mdx_parse_mml_ym2151_async_initialize(mdx, g_mdx.pdx, g_mdx.songdata);
    if (!g_mdx.self) {
        mdx_close_mdx(mdx);
        free(g_mdx.songdata);
        g_mdx.mdx = NULL;
        return -6;
    }

    g_mdx.samples = 0;
    g_mdx.channels = pcm8_get_output_channels(g_mdx.songdata);
    g_mdx.nlg_tempo = -1;

    g_loaded = 1;
    return 0;
}

EMSCRIPTEN_KEEPALIVE
int mdxmini_wasm_load_pdx(unsigned char *data, int len) {
    if (!g_loaded || !g_mdx.mdx) return -1;

    /* Close previously loaded PDX if any */
    if (g_mdx.pdx) {
        mdx_close_pdx(g_mdx.pdx);
        g_mdx.pdx = NULL;
    }

    /* Copy data since mdx_open_pdx may reference it */
    unsigned char *buf = (unsigned char *)malloc(len);
    if (!buf) return -2;
    memcpy(buf, data, len);

    g_mdx.pdx = mdx_open_pdx(buf, (long)len);
    free(buf);

    if (!g_mdx.pdx) return -3;

    g_mdx.mdx->haspdx = FLAG_TRUE;
    g_mdx.mdx->pdx_enable = FLAG_TRUE;

    /* Re-initialize MML parser with PDX */
    if (g_mdx.self) {
        mdx_parse_mml_ym2151_async_finalize(g_mdx.songdata);
    }

    extern void ym2151_set_logging(int flag, songdata *);
    ym2151_set_logging(1, g_mdx.songdata);

    g_mdx.self = mdx_parse_mml_ym2151_async_initialize(g_mdx.mdx, g_mdx.pdx, g_mdx.songdata);
    if (!g_mdx.self) return -4;

    g_mdx.samples = 0;
    g_mdx.channels = pcm8_get_output_channels(g_mdx.songdata);

    return 0;
}

EMSCRIPTEN_KEEPALIVE
int mdxmini_wasm_render(float *output, int frames) {
    if (!g_loaded || !g_mdx.self) return 0;
    if (frames <= 0) return 0;
    if (frames > MAX_RENDER_FRAMES) frames = MAX_RENDER_FRAMES;

    int result = mdx_calc_sample(&g_mdx, g_render_buf, frames);

    /* Convert S16 stereo to float stereo (interleaved LRLRLR) */
    int ch = g_mdx.channels;
    if (ch >= 2) {
        for (int i = 0; i < frames; i++) {
            output[i * 2]     = (float)g_render_buf[i * 2]     / 32768.0f;
            output[i * 2 + 1] = (float)g_render_buf[i * 2 + 1] / 32768.0f;
        }
    } else {
        /* Mono: duplicate to both channels */
        for (int i = 0; i < frames; i++) {
            float s = (float)g_render_buf[i] / 32768.0f;
            output[i * 2]     = s;
            output[i * 2 + 1] = s;
        }
    }

    /* result == 0 means song ended */
    return result == 0 ? 0 : frames;
}

EMSCRIPTEN_KEEPALIVE
int mdxmini_wasm_get_length(void) {
    if (!g_loaded) return 0;
    return mdx_get_length(&g_mdx);
}

EMSCRIPTEN_KEEPALIVE
int mdxmini_wasm_get_tracks(void) {
    if (!g_loaded) return 0;
    return mdx_get_tracks(&g_mdx);
}

EMSCRIPTEN_KEEPALIVE
void mdxmini_wasm_get_title(char *buf, int maxlen) {
    if (!g_loaded || !buf || maxlen <= 0) return;
    mdx_get_title(&g_mdx, buf);
    buf[maxlen - 1] = '\0';
}

EMSCRIPTEN_KEEPALIVE
void mdxmini_wasm_stop(void) {
    if (g_loaded) {
        mdx_close(&g_mdx);
        g_loaded = 0;
    }
    memset(&g_mdx, 0, sizeof(t_mdxmini));
}

EMSCRIPTEN_KEEPALIVE
void mdxmini_wasm_set_max_loop(int loops) {
    if (g_loaded && g_mdx.mdx) {
        mdx_set_max_loop(&g_mdx, loops);
    }
}
