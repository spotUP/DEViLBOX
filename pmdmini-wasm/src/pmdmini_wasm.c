/**
 * pmdmini_wasm.c - WASM bridge for pmdmini PMD replayer
 *
 * Exposes a simple C API for the AudioWorklet to drive the PMD engine.
 * Uses music_load2() for in-memory loading (no filesystem needed).
 */

#include <stdlib.h>
#include <string.h>
#include "pmdmini.h"
#include "pmdwin/pmdwinimport.h"

#include <emscripten/emscripten.h>

static int s_initialized = 0;
static int s_playing = 0;
static int s_sample_rate = 44100;

EMSCRIPTEN_KEEPALIVE
void pmdmini_wasm_init(int sample_rate) {
    s_sample_rate = sample_rate > 0 ? sample_rate : 44100;
    pmd_init();
    pmd_setrate(s_sample_rate);
    s_initialized = 1;
    s_playing = 0;
}

EMSCRIPTEN_KEEPALIVE
int pmdmini_wasm_load(const unsigned char *data, int len) {
    if (!s_initialized || !data || len <= 0) return -1;

    /* Stop any currently playing song */
    if (s_playing) {
        pmd_stop();
        s_playing = 0;
    }

    /* Re-init to clean state */
    pmd_init();
    pmd_setrate(s_sample_rate);

    /* Load from memory buffer */
    int result = music_load2((unsigned char *)data, len);
    if (result != PMDWIN_OK) {
        return result;
    }

    music_start();
    s_playing = 1;
    return 0;
}

EMSCRIPTEN_KEEPALIVE
void pmdmini_wasm_render(short *buf, int frames) {
    if (!s_initialized || !s_playing || !buf || frames <= 0) {
        if (buf && frames > 0) {
            memset(buf, 0, frames * 2 * sizeof(short));
        }
        return;
    }
    pmd_renderer(buf, frames);
}

EMSCRIPTEN_KEEPALIVE
int pmdmini_wasm_get_length(void) {
    if (!s_initialized) return 0;
    return pmd_length_sec();
}

EMSCRIPTEN_KEEPALIVE
int pmdmini_wasm_get_position(void) {
    if (!s_initialized) return 0;
    return getpos2();
}

EMSCRIPTEN_KEEPALIVE
int pmdmini_wasm_get_loop_count(void) {
    if (!s_initialized) return 0;
    return getloopcount();
}

EMSCRIPTEN_KEEPALIVE
int pmdmini_wasm_get_tracks(void) {
    if (!s_initialized) return 0;
    return pmd_get_tracks();
}

EMSCRIPTEN_KEEPALIVE
void pmdmini_wasm_get_notes(int *notes, int len) {
    if (!s_initialized || !notes || len <= 0) return;
    pmd_get_current_notes(notes, len);
}

EMSCRIPTEN_KEEPALIVE
void pmdmini_wasm_stop(void) {
    if (s_playing) {
        pmd_stop();
        s_playing = 0;
    }
}

EMSCRIPTEN_KEEPALIVE
int pmdmini_wasm_is_playing(void) {
    return s_playing;
}
