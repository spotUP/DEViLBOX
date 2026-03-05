/*
 * fp_harness.c — WASM harness for Future Player replayer
 *
 * Provides the exported C API for the WASM module:
 *   fp_wasm_init(data, size) — load module
 *   fp_wasm_render(buf, frames) — render audio frames
 *   fp_wasm_stop() — stop playback
 */

#include "FuturePlayer.h"
#include "paula_soft.h"
#include <stdlib.h>
#include <string.h>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define EXPORT
#endif

static uint8_t* module_copy = NULL;
static int initialized = 0;

/* Ticks per frame at PAL rate:
 * CIA timer fires at ~50Hz (PAL vblank).
 * Paula output rate: 28150 Hz.
 * Frames per tick: 28150 / 50 = 563 frames.
 * But the actual timer rate depends on the module's CIA timer value.
 * Default: ~50Hz = 563 frames per tick. */
static int frames_per_tick = 563;
static int frame_counter = 0;

EXPORT int fp_wasm_init(const uint8_t* data, uint32_t size) {
    if (module_copy) { free(module_copy); module_copy = NULL; }

    module_copy = (uint8_t*)malloc(size);
    if (!module_copy) return -1;
    memcpy(module_copy, data, size);

    paula_reset();

    int ret = fp_init(module_copy, size);
    if (ret != 0) {
        free(module_copy);
        module_copy = NULL;
        return -1;
    }

    initialized = 1;
    frame_counter = 0;
    frames_per_tick = 563;  /* Default 50Hz */

    return 0;
}

EXPORT int fp_wasm_render(float* buffer, int frames) {
    if (!initialized) {
        memset(buffer, 0, frames * 2 * sizeof(float));
        return frames;
    }

    int written = 0;
    while (written < frames) {
        if (frame_counter <= 0) {
            fp_play();
            frame_counter = frames_per_tick;
        }

        int chunk = frames - written;
        if (chunk > frame_counter) chunk = frame_counter;

        int rendered = paula_render(buffer + written * 2, chunk);
        written += rendered;
        frame_counter -= rendered;
    }

    return written;
}

EXPORT void fp_wasm_stop(void) {
    fp_stop();
    initialized = 0;
    if (module_copy) { free(module_copy); module_copy = NULL; }
}

EXPORT int fp_wasm_get_sample_rate(void) {
    return fp_get_sample_rate();
}

EXPORT int fp_wasm_get_num_subsongs(void) {
    return fp_get_num_subsongs();
}

EXPORT void fp_wasm_set_subsong(int subsong) {
    fp_set_subsong(subsong);
}
