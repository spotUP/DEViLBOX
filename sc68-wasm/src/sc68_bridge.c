/**
 * SC68 C bridge for Emscripten WASM.
 * Wraps sc68 library for SNDH/SC68 (Atari ST) playback.
 * Build: cd sc68-wasm/build && emcmake cmake .. && emmake make
 */

#include "sc68/sc68.h"
#include <stdlib.h>
#include <string.h>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

static sc68_t* sc68 = NULL;
static int sample_rate = 44100;

EMSCRIPTEN_KEEPALIVE
int sc68_bridge_init(void) {
    sc68_init_t init;
    memset(&init, 0, sizeof(init));
    init.sampling_rate = sample_rate;

    if (sc68_init(&init) < 0) return -1;

    sc68_create_t create;
    memset(&create, 0, sizeof(create));
    create.sampling_rate = sample_rate;
    sc68 = sc68_create(&create);

    return sc68 ? 0 : -1;
}

EMSCRIPTEN_KEEPALIVE
int sc68_bridge_load(const void* data, int size) {
    if (!sc68) return -1;
    return sc68_load_mem(sc68, data, size);
}

EMSCRIPTEN_KEEPALIVE
void sc68_bridge_close(void) {
    if (sc68) {
        sc68_destroy(sc68);
        sc68 = NULL;
    }
    sc68_shutdown();
}

EMSCRIPTEN_KEEPALIVE
int sc68_bridge_play(int track) {
    if (!sc68) return -1;
    return sc68_play(sc68, track, 0);
}

EMSCRIPTEN_KEEPALIVE
int sc68_bridge_process(void* buf, int samples) {
    if (!sc68) return -1;
    return sc68_process(sc68, buf, &samples);
}

EMSCRIPTEN_KEEPALIVE
void sc68_bridge_stop(void) {
    if (sc68) sc68_stop(sc68);
}

EMSCRIPTEN_KEEPALIVE
int sc68_bridge_get_tracks(void) {
    if (!sc68) return 0;
    sc68_music_info_t info;
    if (sc68_music_info(sc68, &info, -1, 0) < 0) return 0;
    return info.tracks;
}

EMSCRIPTEN_KEEPALIVE
const char* sc68_bridge_get_title(void) {
    if (!sc68) return "";
    sc68_music_info_t info;
    if (sc68_music_info(sc68, &info, -1, 0) < 0) return "";
    return info.title ? info.title : "";
}

EMSCRIPTEN_KEEPALIVE
const char* sc68_bridge_get_author(void) {
    if (!sc68) return "";
    sc68_music_info_t info;
    if (sc68_music_info(sc68, &info, -1, 0) < 0) return "";
    return info.artist ? info.artist : "";
}

EMSCRIPTEN_KEEPALIVE
int sc68_bridge_get_duration(void) {
    if (!sc68) return -1;
    sc68_music_info_t info;
    if (sc68_music_info(sc68, &info, -1, 0) < 0) return -1;
    return info.trk.time_ms;
}

EMSCRIPTEN_KEEPALIVE
int sc68_bridge_tell(void) {
    /* sc68 doesn't have a direct "tell" — track position from samples rendered */
    return 0;
}

EMSCRIPTEN_KEEPALIVE
int sc68_bridge_track_ended(void) {
    if (!sc68) return 1;
    return sc68_process(sc68, NULL, NULL) == SC68_END;
}
