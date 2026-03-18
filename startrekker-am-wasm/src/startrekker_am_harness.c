// startrekker_am_harness.c — Emscripten WASM wrapper for StarTrekker AM
// Follows the player_init/load/render/stop pattern of other DEViLBOX WASM engines.
// Two-file format: .mod module + .nt instrument companion file.

#include "startrekker_am.h"
#include "paula_soft.h"
#include <emscripten.h>
#include <stdint.h>
#include <string.h>
#include <stdlib.h>

// ─── Playback state ───────────────────────────────────────────────────────────
static int   s_loaded          = 0;
static int   s_finished        = 0;
static float s_tick_accum      = 0.0f;
static float s_ticks_per_sec   = 50.0f;    // PAL CIA rate
static float s_samples_per_tick = 0.0f;

// ─── Module buffers (heap-allocated; owned here) ──────────────────────────────
static uint8_t* s_mod_buf = NULL;
static int      s_mod_len = 0;
static uint8_t* s_nt_buf  = NULL;
static int      s_nt_len  = 0;

// ─── player_init ─────────────────────────────────────────────────────────────
EMSCRIPTEN_KEEPALIVE
void player_init(int sample_rate) {
    int rate = sample_rate > 0 ? sample_rate : PAULA_RATE_PAL;
    s_ticks_per_sec    = 50.0f;
    s_samples_per_tick = (float)rate / s_ticks_per_sec;
    paula_reset();
    paula_set_output_rate((float)rate);
    s_loaded   = 0;
    s_finished = 0;
    s_tick_accum = 0.0f;
}

// ─── player_load_mod — load the .mod module data ─────────────────────────────
// Call this first with the MOD file bytes.
EMSCRIPTEN_KEEPALIVE
int player_load_mod(const uint8_t* data, int len) {
    if (!data || len <= 0) return 0;
    if (s_mod_buf) { free(s_mod_buf); s_mod_buf = NULL; }
    s_mod_buf = (uint8_t*)malloc(len);
    if (!s_mod_buf) return 0;
    memcpy(s_mod_buf, data, len);
    s_mod_len = len;
    s_loaded  = 0;  // not ready until NT is also loaded
    return 1;
}

// ─── player_load_nt — load the .nt companion file ────────────────────────────
// Call this after player_load_mod. When both are loaded, initialises the engine.
EMSCRIPTEN_KEEPALIVE
int player_load_nt(const uint8_t* data, int len) {
    if (!data || len <= 0) return 0;
    if (s_nt_buf) { free(s_nt_buf); s_nt_buf = NULL; }
    s_nt_buf = (uint8_t*)malloc(len);
    if (!s_nt_buf) return 0;
    memcpy(s_nt_buf, data, len);
    s_nt_len = len;

    if (!s_mod_buf) return 0;  // need MOD first

    paula_reset();
    int ok = sam_init(s_mod_buf, s_mod_len, s_nt_buf, s_nt_len);
    if (!ok) return 0;

    s_loaded      = 1;
    s_finished    = 0;
    s_tick_accum  = 0.0f;
    return 1;
}

// ─── player_load — convenience: load MOD only (no NT / PCM-only mode) ─────────
// For .mod files that have no AM instruments, NT file is not required.
EMSCRIPTEN_KEEPALIVE
int player_load(const uint8_t* data, int len) {
    if (!player_load_mod(data, len)) return 0;
    // Provide a minimal NT stub (24-byte header, no instrument blocks)
    static const uint8_t nt_stub[24] = {
        'S','T','1','.','2',' ','M','o','d','u','l','e','I','N','F','O',
        0,0,0,0,0,0,0,0
    };
    return player_load_nt(nt_stub, 24);
}

// ─── player_render ───────────────────────────────────────────────────────────
EMSCRIPTEN_KEEPALIVE
int player_render(float* buffer, int frames) {
    if (!s_loaded)   { memset(buffer, 0, (size_t)frames * 2 * sizeof(float)); return -1; }
    if (s_finished)  { memset(buffer, 0, (size_t)frames * 2 * sizeof(float)); return 0; }

    int written = 0;
    while (written < frames) {
        int chunk = (frames - written) < 64 ? (frames - written) : 64;
        paula_render(buffer + written * 2, chunk);
        written      += chunk;
        s_tick_accum += (float)chunk;
        while (s_tick_accum >= s_samples_per_tick) {
            s_tick_accum -= s_samples_per_tick;
            sam_music();
        }
    }
    return frames;
}

// ─── player_stop ─────────────────────────────────────────────────────────────
EMSCRIPTEN_KEEPALIVE
void player_stop(void) {
    sam_end();
    s_loaded   = 0;
    s_finished = 1;
}

// ─── Metadata / status ───────────────────────────────────────────────────────
EMSCRIPTEN_KEEPALIVE int  player_is_finished(void)         { return s_finished ? 1 : 0; }
EMSCRIPTEN_KEEPALIVE int  player_get_subsong_count(void)   { return 1; }
EMSCRIPTEN_KEEPALIVE void player_set_subsong(int n)        { (void)n; }
EMSCRIPTEN_KEEPALIVE double player_detect_duration(void)   { return 0.0; }

EMSCRIPTEN_KEEPALIVE const char* player_get_title(void) {
    if (!s_mod_buf) return "StarTrekker AM";
    // MOD title is at offset 0, up to 20 bytes, null-padded
    static char title[21];
    int i;
    for (i = 0; i < 20; i++) {
        char c = (char)s_mod_buf[i];
        title[i] = (c >= 32 && c < 127) ? c : ' ';
    }
    title[20] = '\0';
    // Trim trailing spaces
    for (i = 19; i >= 0 && title[i] == ' '; i--) title[i] = '\0';
    return title[0] ? title : "StarTrekker AM";
}

// ─── Channel peak levels (for oscilloscope) ───────────────────────────────────
EMSCRIPTEN_KEEPALIVE
void player_get_channel_levels(float* out4) {
    paula_get_channel_levels(out4);
}

// ─── Set pattern cell ─────────────────────────────────────────────────────────
EMSCRIPTEN_KEEPALIVE
void player_set_pattern_cell(int pattern, int row, int channel, int b0, int b1, int b2, int b3) {
    uint8_t cell[4] = { (uint8_t)b0, (uint8_t)b1, (uint8_t)b2, (uint8_t)b3 };
    sam_set_pattern_cell(pattern, row, channel, cell);
}

// ─── Set NT instrument parameter ──────────────────────────────────────────────
EMSCRIPTEN_KEEPALIVE
void player_set_nt_param(int instr, int offset, int value) {
    sam_set_nt_param(instr, offset, value);
}

// ─── Voice info: instrument + sample position per channel ─────────────────────
// out: [instr0, pos0, instr1, pos1, instr2, pos2, instr3, pos3]
// instr = instrument number (1-31, 0 = none)
// pos = playback position as fraction (0.0 - 1.0)
EMSCRIPTEN_KEEPALIVE
void player_get_voice_info(float* out8) {
    extern void sam_get_voice_info(float* out8);
    sam_get_voice_info(out8);
}
