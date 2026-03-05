/**
 * pmdmini C bridge for Emscripten WASM.
 * Wraps pmdmini for PMD (PC-98 YM2608/OPNA) playback.
 * Build: cd pmd-wasm/build && emcmake cmake .. && emmake make
 */

#include "pmdmini.h"
#include <stdlib.h>
#include <string.h>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

static int initialized = 0;
static int sample_rate = 44100;
static char title_buf[256];

EMSCRIPTEN_KEEPALIVE
int pmd_bridge_open(const void* data, int size) {
    if (initialized) {
        pmd_stop();
    }

    pmd_init();
    int result = pmd_play_mem((char*)data, size, sample_rate);
    if (result < 0) return -1;

    initialized = 1;
    return 0;
}

EMSCRIPTEN_KEEPALIVE
void pmd_bridge_close(void) {
    if (initialized) {
        pmd_stop();
        initialized = 0;
    }
}

EMSCRIPTEN_KEEPALIVE
int pmd_bridge_calc(short* buf, int samples) {
    if (!initialized) return -1;
    pmd_renderer(buf, samples);
    return 0;
}

EMSCRIPTEN_KEEPALIVE
const char* pmd_bridge_get_title(void) {
    if (!initialized) return "";
    pmd_get_title(title_buf);
    return title_buf;
}

EMSCRIPTEN_KEEPALIVE
int pmd_bridge_get_length(void) {
    if (!initialized) return -1;
    return pmd_length_sec() * 1000;
}

EMSCRIPTEN_KEEPALIVE
int pmd_bridge_tell(void) {
    if (!initialized) return 0;
    return pmd_get_position();
}

EMSCRIPTEN_KEEPALIVE
int pmd_bridge_track_ended(void) {
    if (!initialized) return 1;
    return pmd_loop_count() > 0;
}
