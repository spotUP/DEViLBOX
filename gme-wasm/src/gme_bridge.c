/**
 * GME (Game_Music_Emu) C bridge for Emscripten WASM.
 *
 * Wraps the GME library for use from JavaScript/AudioWorklet.
 * Supports all GME formats: NSF, NSFE, SPC, GBS, VGM, VGZ, HES, AY, SAP, KSS, GYM.
 *
 * Build: cd gme-wasm/build && emcmake cmake .. && emmake make
 * Output: public/gme/GME.js + GME.wasm
 */

#include "gme.h"
#include <stdlib.h>
#include <string.h>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

/* ─── State ─── */
static Music_Emu* emu = NULL;
static gme_info_t* current_info = NULL;
static int sample_rate = 44100;

/* ─── Register logging for pattern extraction ─── */
#define MAX_REG_LOG 262144  /* 256K entries */

typedef struct {
    int chip;      /* 0=primary, 1=secondary */
    int addr;      /* register address */
    int data;      /* register data */
    int timestamp; /* sample offset from track start */
} RegLogEntry;

static RegLogEntry* reg_log = NULL;
static int reg_log_count = 0;
static int reg_log_enabled = 0;

/* ─── Core API ─── */

EMSCRIPTEN_KEEPALIVE
int gme_bridge_open(const void* data, int size) {
    if (emu) {
        gme_delete(emu);
        emu = NULL;
    }
    if (current_info) {
        gme_free_info(current_info);
        current_info = NULL;
    }

    gme_err_t err = gme_open_data(data, (long)size, &emu, sample_rate);
    if (err) return -1;

    /* Enable accuracy mode for better register capture */
    gme_enable_accuracy(emu, 1);

    return 0;
}

EMSCRIPTEN_KEEPALIVE
void gme_bridge_close(void) {
    if (emu) {
        gme_delete(emu);
        emu = NULL;
    }
    if (current_info) {
        gme_free_info(current_info);
        current_info = NULL;
    }
    if (reg_log) {
        free(reg_log);
        reg_log = NULL;
    }
    reg_log_count = 0;
}

EMSCRIPTEN_KEEPALIVE
int gme_bridge_track_count(void) {
    return emu ? gme_track_count(emu) : 0;
}

EMSCRIPTEN_KEEPALIVE
int gme_bridge_start_track(int track) {
    if (!emu) return -1;
    gme_err_t err = gme_start_track(emu, track);
    if (err) return -1;

    /* Load track info */
    if (current_info) gme_free_info(current_info);
    gme_track_info(emu, &current_info, track);

    /* Reset register log */
    reg_log_count = 0;

    return 0;
}

EMSCRIPTEN_KEEPALIVE
int gme_bridge_play(short* out, int count) {
    if (!emu) return -1;
    gme_err_t err = gme_play(emu, count, out);
    return err ? -1 : 0;
}

EMSCRIPTEN_KEEPALIVE
int gme_bridge_track_ended(void) {
    return emu ? gme_track_ended(emu) : 1;
}

EMSCRIPTEN_KEEPALIVE
int gme_bridge_tell(void) {
    return emu ? gme_tell(emu) : 0;
}

EMSCRIPTEN_KEEPALIVE
int gme_bridge_seek(int msec) {
    if (!emu) return -1;
    gme_err_t err = gme_seek(emu, msec);
    return err ? -1 : 0;
}

EMSCRIPTEN_KEEPALIVE
void gme_bridge_set_tempo(double tempo) {
    if (emu) gme_set_tempo(emu, tempo);
}

EMSCRIPTEN_KEEPALIVE
int gme_bridge_voice_count(void) {
    return emu ? gme_voice_count(emu) : 0;
}

EMSCRIPTEN_KEEPALIVE
void gme_bridge_mute_voice(int index, int mute) {
    if (emu) gme_mute_voice(emu, index, mute);
}

/* ─── Metadata ─── */

EMSCRIPTEN_KEEPALIVE
const char* gme_bridge_get_title(void) {
    return current_info ? current_info->song : "";
}

EMSCRIPTEN_KEEPALIVE
const char* gme_bridge_get_author(void) {
    return current_info ? current_info->author : "";
}

EMSCRIPTEN_KEEPALIVE
const char* gme_bridge_get_game(void) {
    return current_info ? current_info->game : "";
}

EMSCRIPTEN_KEEPALIVE
const char* gme_bridge_get_system(void) {
    return current_info ? current_info->system : "";
}

EMSCRIPTEN_KEEPALIVE
int gme_bridge_get_length(void) {
    return current_info ? current_info->length : -1;
}

EMSCRIPTEN_KEEPALIVE
int gme_bridge_get_intro_length(void) {
    return current_info ? current_info->intro_length : -1;
}

EMSCRIPTEN_KEEPALIVE
int gme_bridge_get_loop_length(void) {
    return current_info ? current_info->loop_length : -1;
}

/* ─── Register logging for pattern extraction ─── */

EMSCRIPTEN_KEEPALIVE
void gme_bridge_enable_register_log(int enable) {
    reg_log_enabled = enable;
    if (enable && !reg_log) {
        reg_log = (RegLogEntry*)malloc(MAX_REG_LOG * sizeof(RegLogEntry));
    }
    reg_log_count = 0;
}

EMSCRIPTEN_KEEPALIVE
const RegLogEntry* gme_bridge_get_register_log(void) {
    return reg_log;
}

EMSCRIPTEN_KEEPALIVE
int gme_bridge_get_register_log_count(void) {
    return reg_log_count;
}

EMSCRIPTEN_KEEPALIVE
void gme_bridge_clear_register_log(void) {
    reg_log_count = 0;
}
