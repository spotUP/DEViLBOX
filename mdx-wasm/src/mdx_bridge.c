/**
 * mdxmini C bridge for Emscripten WASM.
 * Wraps mdxmini for MDX (Sharp X68000) playback.
 * Build: cd mdx-wasm/build && emcmake cmake .. && emmake make
 */

#include "mdxmini.h"
#include <stdlib.h>
#include <string.h>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

static t_mdxmini mdx;
static int initialized = 0;
static int sample_rate = 44100;
static char title_buf[256];

EMSCRIPTEN_KEEPALIVE
int mdx_bridge_open(const void* data, int size, const void* pdx_data, int pdx_size) {
    if (initialized) {
        mdx_close(&mdx);
    }
    memset(&mdx, 0, sizeof(t_mdxmini));

    /* mdxmini expects file data in memory */
    int result = mdx_open_mem(&mdx, (char*)data, size, sample_rate);
    if (result < 0) return -1;

    /* Load PDX sample bank if provided */
    if (pdx_data && pdx_size > 0) {
        mdx_set_pdx_mem(&mdx, (char*)pdx_data, pdx_size);
    }

    initialized = 1;
    return 0;
}

EMSCRIPTEN_KEEPALIVE
void mdx_bridge_close(void) {
    if (initialized) {
        mdx_close(&mdx);
        initialized = 0;
    }
}

EMSCRIPTEN_KEEPALIVE
int mdx_bridge_calc(short* buf, int samples) {
    if (!initialized) return -1;
    mdx_calc_sample(&mdx, buf, samples);
    return 0;
}

EMSCRIPTEN_KEEPALIVE
const char* mdx_bridge_get_title(void) {
    if (!initialized) return "";
    mdx_get_title(&mdx, title_buf);
    return title_buf;
}

EMSCRIPTEN_KEEPALIVE
int mdx_bridge_get_length(void) {
    if (!initialized) return -1;
    return mdx_get_length(&mdx);
}

EMSCRIPTEN_KEEPALIVE
int mdx_bridge_get_pos(void) {
    if (!initialized) return 0;
    return mdx_get_position(&mdx);
}

EMSCRIPTEN_KEEPALIVE
void mdx_bridge_set_pos(int pos) {
    if (initialized) {
        mdx_set_position(&mdx, pos);
    }
}

EMSCRIPTEN_KEEPALIVE
int mdx_bridge_track_ended(void) {
    if (!initialized) return 1;
    return mdx_get_ended(&mdx);
}
