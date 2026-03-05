/**
 * AdPlug C++ bridge for Emscripten WASM.
 * Wraps AdPlug library for OPL2/OPL3 music playback.
 * Supports 60+ sub-formats: RAD, HSC, CMF, D00, DRO, IMF, etc.
 * Build: cd adplug-wasm/build && emcmake cmake .. && emmake make
 */

#include "adplug.h"
#include "emuopl.h"
#include <stdlib.h>
#include <string.h>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

static CPlayer* player = NULL;
static CEmuopl* opl = NULL;
static int sample_rate = 44100;
static char title_buf[256];
static char author_buf[256];
static char desc_buf[256];
static char format_buf[128];
static int position_ms = 0;
static int ended = 0;

/* OPL register snapshot for import */
static unsigned char opl_regs[512]; /* 256 primary + 256 secondary for OPL3 */

extern "C" {

EMSCRIPTEN_KEEPALIVE
int adplug_bridge_open(const void* data, int size, const char* filename) {
    if (player) {
        delete player;
        player = NULL;
    }
    if (opl) {
        delete opl;
        opl = NULL;
    }

    opl = new CEmuopl(sample_rate, true, true); /* stereo, 16-bit */
    if (!opl) return -1;

    /* AdPlug loads from files — we need to write to a memory-backed stream */
    /* For Emscripten, create a temp file in memory FS */
    player = CAdPlug::factory(filename, opl);
    if (!player) {
        delete opl;
        opl = NULL;
        return -1;
    }

    position_ms = 0;
    ended = 0;

    /* Cache metadata */
    strncpy(title_buf, player->gettitle().c_str(), 255);
    strncpy(author_buf, player->getauthor().c_str(), 255);
    strncpy(desc_buf, player->getdesc().c_str(), 255);
    strncpy(format_buf, player->gettype().c_str(), 127);

    return 0;
}

EMSCRIPTEN_KEEPALIVE
void adplug_bridge_close(void) {
    if (player) { delete player; player = NULL; }
    if (opl) { delete opl; opl = NULL; }
    position_ms = 0;
    ended = 0;
}

EMSCRIPTEN_KEEPALIVE
int adplug_bridge_update(void) {
    if (!player || !opl) return -1;
    bool playing = player->update();
    if (!playing) ended = 1;
    /* Each update() call advances by one tick */
    double refresh = player->getrefresh();
    if (refresh > 0) position_ms += (int)(1000.0 / refresh);
    return playing ? 0 : 1;
}

EMSCRIPTEN_KEEPALIVE
int adplug_bridge_render(short* buf, int samples) {
    if (!opl) return -1;
    opl->update(buf, samples);
    return 0;
}

EMSCRIPTEN_KEEPALIVE
const char* adplug_bridge_get_title(void) { return title_buf; }

EMSCRIPTEN_KEEPALIVE
const char* adplug_bridge_get_author(void) { return author_buf; }

EMSCRIPTEN_KEEPALIVE
const char* adplug_bridge_get_desc(void) { return desc_buf; }

EMSCRIPTEN_KEEPALIVE
int adplug_bridge_get_length(void) {
    return player ? (int)player->songlength() : -1;
}

EMSCRIPTEN_KEEPALIVE
int adplug_bridge_get_channels(void) {
    return player ? (int)player->getinstruments() : 0;
}

EMSCRIPTEN_KEEPALIVE
const char* adplug_bridge_get_format(void) { return format_buf; }

EMSCRIPTEN_KEEPALIVE
int adplug_bridge_tell(void) { return position_ms; }

EMSCRIPTEN_KEEPALIVE
int adplug_bridge_track_ended(void) { return ended; }

EMSCRIPTEN_KEEPALIVE
const unsigned char* adplug_bridge_get_opl_regs(void) {
    /* Capture current OPL register state from emulator */
    if (opl) {
        for (int i = 0; i < 256; i++) {
            opl_regs[i] = opl->getRegister(i);
            opl_regs[256 + i] = opl->getRegister(i + 256); /* OPL3 secondary */
        }
    }
    return opl_regs;
}

} /* extern "C" */
