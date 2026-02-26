/*
 * furnace_pcm.c — Furnace PCM Instrument Editor (SDL2/Emscripten)
 *
 * Renders a PCM sample editor with:
 * - Chip name header bar
 * - Sample rate, bit depth, and loop controls
 * - Waveform display with loop markers
 * - ES5506-specific filter controls (K1/K2)
 *
 * Canvas: 480x320
 */

#include <SDL2/SDL.h>
#include <emscripten.h>
#include <emscripten/html5.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <math.h>

#include "furnace_pcm.h"
#include "hwui_common.h"

/* ── JS Callbacks ──────────────────────────────────────────────────────── */

EM_JS(void, js_on_param_change, (int param_id, int value), {
    if (Module.onParamChange) Module.onParamChange(param_id, value);
});

/* ptr   = WASM byte offset of sample data
 * len   = sample count (NOT byte count)
 * loopStart/loopLength = in samples, loopType 0=off 1=fwd 2=bidi
 * is16bit = 1 for 16-bit, 0 for 8-bit */
EM_JS(void, js_onPlaySample, (int ptr, int len, int loopStart, int loopLength, int loopType, int is16bit), {
    if (Module.onPlaySample) Module.onPlaySample(ptr, len, loopStart, loopLength, loopType, is16bit);
});

EM_JS(void, js_onStopSample, (void), {
    if (Module.onStopSample) Module.onStopSample();
});

/* ── Param IDs ─────────────────────────────────────────────────────────── */

#define PARAM_SAMPLE_RATE    0
#define PARAM_BIT_DEPTH      1
#define PARAM_LOOP_ENABLE    2
#define PARAM_LOOP_MODE      3
#define PARAM_LOOP_START     4
#define PARAM_LOOP_END       5
#define PARAM_FILTER_ENABLE  6
#define PARAM_FILTER_K1      7
#define PARAM_FILTER_K2      8

/* ── Chip Info Table ───────────────────────────────────────────────────── */

typedef struct {
    const char *name;
    int default_rate;
    int max_rate;
    int has_filter;     /* ES5506 only */
    int bit_depths;     /* 0=8bit, 1=16bit, 2=both */
} PCMChipInfo;

static const PCMChipInfo PCM_CHIPS[PCM_CHIP_COUNT] = {
    { "Sega PCM",       15625, 32000, 0, 0 },
    { "QSound",         24000, 48000, 0, 0 },
    { "Ensoniq ES5506", 44100, 48000, 1, 2 },
    { "Ricoh RF5C68",   19800, 32000, 0, 0 },
    { "Namco C140",     21390, 32000, 0, 2 },
    { "Konami K007232", 12500, 32000, 0, 0 },
    { "Konami K053260", 14000, 32000, 0, 0 },
    { "Irem GA20",      12000, 24000, 0, 0 },
    { "OKI ADPCM",       7812, 16000, 0, 0 },
    { "Yamaha YMZ280B", 16934, 44100, 0, 2 },
    { "Yamaha MultiPCM",44100, 48000, 0, 2 },
    { "Amiga Paula",    22050, 28836, 0, 0 },
};

/* ── Layout ────────────────────────────────────────────────────────────── */

#define SCREEN_W 480
#define SCREEN_H 320

/* ── Global State ──────────────────────────────────────────────────────── */

static SDL_Window   *g_win;
static SDL_Renderer *g_ren;
static SDL_Texture  *g_tex;
static uint32_t      g_fb[SCREEN_W * SCREEN_H];

static int g_chip_subtype = 0;
static int g_bit_depth = 8;
static int g_loop_enable = 0;
static int g_loop_mode = 0;
static int g_sample_rate = 22050;
static int g_filter_enable = 0;
static int g_loop_start = 0;
static int g_loop_end = 0;
static int g_filter_k1 = 0;
static int g_filter_k2 = 0;

/* PCM waveform display data */
static int8_t *g_pcm_data = NULL;
static int g_pcm_len = 0;
static int g_scroll_x = 0;

static int g_mouse_x, g_mouse_y, g_mouse_down;
static int g_dirty = 1;

/* ── Loop mode names ───────────────────────────────────────────────────── */

static const char *LOOP_MODE_NAMES[] = { "Forward", "PingPong", "Reverse" };
#define LOOP_MODE_COUNT 3

/* ── Waveform Rendering ───────────────────────────────────────────────── */

static void render_waveform(int x, int y, int w, int h) {
    hwui_panel_sunken(g_fb, SCREEN_W, x, y, w, h);

    if (!g_pcm_data || g_pcm_len == 0) {
        hwui_text_centered(g_fb, SCREEN_W, x, y, w, h, "No sample loaded", HWUI_GRAY_MED);
        return;
    }

    /* Calculate visible sample range */
    int view_samples = w - 4;
    int samples_per_pixel = g_pcm_len / view_samples;
    if (samples_per_pixel < 1) samples_per_pixel = 1;
    int mid_y = y + h / 2;

    /* Center line */
    hwui_hline(g_fb, SCREEN_W, x + 2, mid_y, w - 4, 0xFF2A2A2A);

    /* Draw waveform as connected line segments */
    int prev_sy = mid_y;
    for (int px = 0; px < view_samples; px++) {
        int idx = g_scroll_x + px * samples_per_pixel;
        if (idx >= g_pcm_len) break;

        /* For multi-sample pixels, find min/max for proper display */
        int min_val = g_pcm_data[idx];
        int max_val = g_pcm_data[idx];
        for (int s = 1; s < samples_per_pixel && (idx + s) < g_pcm_len; s++) {
            int v = g_pcm_data[idx + s];
            if (v < min_val) min_val = v;
            if (v > max_val) max_val = v;
        }

        int sy_min = mid_y - (max_val * (h / 2 - 4)) / 128;
        int sy_max = mid_y - (min_val * (h / 2 - 4)) / 128;

        /* Draw vertical span for this pixel column */
        if (sy_min > sy_max) { int t = sy_min; sy_min = sy_max; sy_max = t; }
        for (int sy = sy_min; sy <= sy_max; sy++) {
            hwui_pixel(g_fb, SCREEN_W, x + 2 + px, sy, HWUI_GREEN);
        }

        /* Connect to previous column */
        if (px > 0) {
            int cur_mid = (sy_min + sy_max) / 2;
            if (cur_mid != prev_sy) {
                int from = prev_sy < cur_mid ? prev_sy : cur_mid;
                int to = prev_sy > cur_mid ? prev_sy : cur_mid;
                for (int cy = from; cy <= to; cy++) {
                    hwui_pixel(g_fb, SCREEN_W, x + 2 + px, cy, HWUI_GREEN);
                }
            }
            prev_sy = (sy_min + sy_max) / 2;
        } else {
            prev_sy = (sy_min + sy_max) / 2;
        }
    }

    /* Loop markers */
    if (g_loop_enable && samples_per_pixel > 0) {
        int ls_px = (g_loop_start - g_scroll_x) / samples_per_pixel;
        int le_px = (g_loop_end - g_scroll_x) / samples_per_pixel;
        if (ls_px >= 0 && ls_px < view_samples)
            hwui_vline(g_fb, SCREEN_W, x + 2 + ls_px, y + 2, h - 4, HWUI_CYAN);
        if (le_px >= 0 && le_px < view_samples)
            hwui_vline(g_fb, SCREEN_W, x + 2 + le_px, y + 2, h - 4, HWUI_RED);
    }

    /* Sample length indicator */
    char len_label[32];
    snprintf(len_label, sizeof(len_label), "%d smp", g_pcm_len);
    hwui_text(g_fb, SCREEN_W, x + w - hwui_text_width(len_label) - 4, y + 4,
              len_label, HWUI_GRAY_LIGHT);

    /* Scrollbar at bottom if waveform exceeds view */
    if (g_pcm_len > view_samples) {
        int new_scroll = g_scroll_x;
        if (hwui_scrollbar_h(g_fb, SCREEN_W, x + 2, y + h - 10, w - 4, 8,
                             g_pcm_len, view_samples * samples_per_pixel, g_scroll_x,
                             g_mouse_x, g_mouse_y, g_mouse_down, &new_scroll)) {
            g_scroll_x = new_scroll;
            g_dirty = 1;
        }
    }
}

/* ── Main Render ───────────────────────────────────────────────────────── */

static void render(void) {
    const PCMChipInfo *chip = &PCM_CHIPS[g_chip_subtype];

    /* Clear */
    for (int i = 0; i < SCREEN_W * SCREEN_H; i++)
        g_fb[i] = HWUI_BLACK;

    hwui_frame_begin(g_mouse_x, g_mouse_y, g_mouse_down);

    /* ── y=0..14: Header bar with chip name ── */
    hwui_rect(g_fb, SCREEN_W, 0, 0, SCREEN_W, 16, HWUI_BLUE_DARK);
    hwui_text_centered(g_fb, SCREEN_W, 0, 0, SCREEN_W, 16, chip->name, HWUI_WHITE);

    /* ── y=16..52: Controls row ── */
    {
        int cy = 20;
        float new_val;

        /* Sample rate knob */
        new_val = (float)g_sample_rate;
        if (hwui_knob(g_fb, SCREEN_W, 16, cy, 12,
                      (float)g_sample_rate, 4000, (float)chip->max_rate, "RATE",
                      HWUI_CYAN, g_mouse_x, g_mouse_y, g_mouse_down, &new_val)) {
            g_sample_rate = (int)new_val;
            js_on_param_change(PARAM_SAMPLE_RATE, g_sample_rate);
            g_dirty = 1;
        }

        /* Sample rate numeric display */
        char rate_str[16];
        snprintf(rate_str, sizeof(rate_str), "%dHz", g_sample_rate);
        hwui_text(g_fb, SCREEN_W, 38, cy + 22, rate_str, HWUI_GRAY_LIGHT);

        /* Bit depth selector (8/16) */
        int bd_x = 100;
        if (chip->bit_depths == 2) {
            /* Both 8 and 16 bit supported — show toggle buttons */
            if (hwui_button(g_fb, SCREEN_W, bd_x, cy + 2, 26, 14,
                           "8b", g_bit_depth == 8,
                           g_mouse_x, g_mouse_y, g_mouse_down)) {
                g_bit_depth = 8;
                js_on_param_change(PARAM_BIT_DEPTH, g_bit_depth);
                g_dirty = 1;
            }
            if (hwui_button(g_fb, SCREEN_W, bd_x + 28, cy + 2, 26, 14,
                           "16b", g_bit_depth == 16,
                           g_mouse_x, g_mouse_y, g_mouse_down)) {
                g_bit_depth = 16;
                js_on_param_change(PARAM_BIT_DEPTH, g_bit_depth);
                g_dirty = 1;
            }
        } else {
            /* Fixed bit depth */
            const char *bd_label = chip->bit_depths == 1 ? "16-bit" : "8-bit";
            hwui_text(g_fb, SCREEN_W, bd_x, cy + 6, bd_label, HWUI_GRAY_LIGHT);
        }
        hwui_text(g_fb, SCREEN_W, bd_x, cy + 22, "DEPTH", HWUI_GRAY_MED);

        /* Loop enable toggle */
        int loop_x = 180;
        if (hwui_checkbox(g_fb, SCREEN_W, loop_x, cy + 6, "LOOP", g_loop_enable,
                          g_mouse_x, g_mouse_y, g_mouse_down)) {
            g_loop_enable = !g_loop_enable;
            js_on_param_change(PARAM_LOOP_ENABLE, g_loop_enable);
            g_dirty = 1;
        }

        /* PLAY button */
        if (g_pcm_data && g_pcm_len > 0) {
            if (hwui_button(g_fb, SCREEN_W, 260, cy + 2, 90, 18,
                            "PLAY", 0, g_mouse_x, g_mouse_y, g_mouse_down)) {
                int is16bit = (g_bit_depth == 16) ? 1 : 0;
                int sample_count = is16bit ? g_pcm_len / 2 : g_pcm_len;
                int loopLength = (g_loop_enable && g_loop_end > g_loop_start)
                                 ? (g_loop_end - g_loop_start) : 0;
                int loopType = (g_loop_enable && loopLength > 0)
                               ? (g_loop_mode == 1 ? 2 : 1) : 0;
                js_onPlaySample((int)(uintptr_t)g_pcm_data, sample_count,
                                g_loop_start, loopLength, loopType, is16bit);
                g_dirty = 1;
            }

            /* STOP button */
            if (hwui_button(g_fb, SCREEN_W, 356, cy + 2, 90, 18,
                            "STOP", 0, g_mouse_x, g_mouse_y, g_mouse_down)) {
                js_onStopSample();
                g_dirty = 1;
            }
        }
    }

    /* ── y=54..210: Waveform display area ── */
    render_waveform(4, 54, SCREEN_W - 8, 156);

    /* ── y=212..260: Loop controls ── */
    {
        int ly = 216;

        /* Loop start knob */
        float new_val;
        int max_end = g_pcm_len > 0 ? g_pcm_len - 1 : 65535;

        new_val = (float)g_loop_start;
        if (hwui_knob(g_fb, SCREEN_W, 16, ly, 12,
                      (float)g_loop_start, 0, (float)max_end, "START",
                      HWUI_CYAN, g_mouse_x, g_mouse_y, g_mouse_down, &new_val)) {
            g_loop_start = (int)new_val;
            js_on_param_change(PARAM_LOOP_START, g_loop_start);
            g_dirty = 1;
        }

        /* Loop start numeric value */
        char ls_str[16];
        snprintf(ls_str, sizeof(ls_str), "%d", g_loop_start);
        hwui_text(g_fb, SCREEN_W, 38, ly + 22, ls_str, HWUI_GRAY_LIGHT);

        /* Loop end knob */
        new_val = (float)g_loop_end;
        if (hwui_knob(g_fb, SCREEN_W, 120, ly, 12,
                      (float)g_loop_end, 0, (float)max_end, "END",
                      HWUI_RED, g_mouse_x, g_mouse_y, g_mouse_down, &new_val)) {
            g_loop_end = (int)new_val;
            js_on_param_change(PARAM_LOOP_END, g_loop_end);
            g_dirty = 1;
        }

        /* Loop end numeric value */
        char le_str[16];
        snprintf(le_str, sizeof(le_str), "%d", g_loop_end);
        hwui_text(g_fb, SCREEN_W, 142, ly + 22, le_str, HWUI_GRAY_LIGHT);

        /* Loop mode dropdown */
        int new_mode = g_loop_mode;
        if (hwui_dropdown(g_fb, SCREEN_W, 240, ly + 4, 120,
                          LOOP_MODE_NAMES, LOOP_MODE_COUNT, g_loop_mode,
                          g_mouse_x, g_mouse_y, g_mouse_down, &new_mode)) {
            g_loop_mode = new_mode;
            js_on_param_change(PARAM_LOOP_MODE, g_loop_mode);
            g_dirty = 1;
        }
        hwui_text(g_fb, SCREEN_W, 240, ly + 22, "MODE", HWUI_GRAY_MED);
    }

    /* ── y=262..318: ES5506 filter controls ── */
    if (chip->has_filter) {
        int fy = 266;
        hwui_group_box(g_fb, SCREEN_W, 4, fy - 4, SCREEN_W - 8, 56, "ES5506 FILTER", HWUI_AMBER);

        /* Filter enable toggle */
        if (hwui_checkbox(g_fb, SCREEN_W, 16, fy + 6, "ON", g_filter_enable,
                          g_mouse_x, g_mouse_y, g_mouse_down)) {
            g_filter_enable = !g_filter_enable;
            js_on_param_change(PARAM_FILTER_ENABLE, g_filter_enable);
            g_dirty = 1;
        }

        /* K1 knob */
        float new_val;
        new_val = (float)g_filter_k1;
        if (hwui_knob(g_fb, SCREEN_W, 100, fy + 4, 12,
                      (float)g_filter_k1, 0, 65535, "K1",
                      HWUI_MAGENTA, g_mouse_x, g_mouse_y, g_mouse_down, &new_val)) {
            g_filter_k1 = (int)new_val;
            js_on_param_change(PARAM_FILTER_K1, g_filter_k1);
            g_dirty = 1;
        }

        /* K1 hex display */
        hwui_text(g_fb, SCREEN_W, 122, fy + 26, hwui_fmt_hex4(g_filter_k1), HWUI_GRAY_LIGHT);

        /* K2 knob */
        new_val = (float)g_filter_k2;
        if (hwui_knob(g_fb, SCREEN_W, 200, fy + 4, 12,
                      (float)g_filter_k2, 0, 65535, "K2",
                      HWUI_CYAN, g_mouse_x, g_mouse_y, g_mouse_down, &new_val)) {
            g_filter_k2 = (int)new_val;
            js_on_param_change(PARAM_FILTER_K2, g_filter_k2);
            g_dirty = 1;
        }

        /* K2 hex display */
        hwui_text(g_fb, SCREEN_W, 222, fy + 26, hwui_fmt_hex4(g_filter_k2), HWUI_GRAY_LIGHT);
    }

    hwui_frame_end();

    /* Push to SDL */
    SDL_UpdateTexture(g_tex, NULL, g_fb, SCREEN_W * sizeof(uint32_t));
    SDL_RenderClear(g_ren);
    SDL_RenderCopy(g_ren, g_tex, NULL, NULL);
    SDL_RenderPresent(g_ren);
}

/* ── Event Handling ────────────────────────────────────────────────────── */

static void handle_event(SDL_Event *e) {
    switch (e->type) {
    case SDL_MOUSEBUTTONDOWN:
        g_mouse_x = e->button.x;
        g_mouse_y = e->button.y;
        g_mouse_down = 1;
        g_dirty = 1;
        break;
    case SDL_MOUSEBUTTONUP:
        g_mouse_x = e->button.x;
        g_mouse_y = e->button.y;
        g_mouse_down = 0;
        g_dirty = 1;
        break;
    case SDL_MOUSEMOTION:
        g_mouse_x = e->motion.x;
        g_mouse_y = e->motion.y;
        if (g_mouse_down) g_dirty = 1;
        break;
    default:
        break;
    }
}

static void tick(void) {
    SDL_Event e;
    while (SDL_PollEvent(&e))
        handle_event(&e);
    if (g_dirty) {
        render();
        g_dirty = 0;
    }
}

/* ── Public API ────────────────────────────────────────────────────────── */

void furnace_pcm_init(int w, int h) {
    (void)w; (void)h;
    SDL_Init(SDL_INIT_VIDEO);
    g_win = SDL_CreateWindow("Furnace PCM Editor",
        SDL_WINDOWPOS_UNDEFINED, SDL_WINDOWPOS_UNDEFINED,
        SCREEN_W, SCREEN_H, 0);
    g_ren = SDL_CreateRenderer(g_win, -1, SDL_RENDERER_SOFTWARE);
    g_tex = SDL_CreateTexture(g_ren, SDL_PIXELFORMAT_ARGB8888,
        SDL_TEXTUREACCESS_STREAMING, SCREEN_W, SCREEN_H);
    memset(g_fb, 0, sizeof(g_fb));
    hwui_set_fb_size(SCREEN_W, SCREEN_H);

    g_chip_subtype = 0;
    g_bit_depth = 8;
    g_loop_enable = 0;
    g_loop_mode = 0;
    g_sample_rate = 22050;
    g_filter_enable = 0;
    g_loop_start = 0;
    g_loop_end = 0;
    g_filter_k1 = 0;
    g_filter_k2 = 0;
    g_scroll_x = 0;

    if (g_pcm_data) { free(g_pcm_data); g_pcm_data = NULL; }
    g_pcm_len = 0;

    hwui_reset_state();
    g_dirty = 1;
}

void furnace_pcm_start(void) {
    emscripten_set_main_loop(tick, 60, 0);
}

void furnace_pcm_shutdown(void) {
    emscripten_cancel_main_loop();
    if (g_pcm_data) { free(g_pcm_data); g_pcm_data = NULL; }
    g_pcm_len = 0;
    if (g_tex) SDL_DestroyTexture(g_tex);
    if (g_ren) SDL_DestroyRenderer(g_ren);
    if (g_win) SDL_DestroyWindow(g_win);
    g_tex = NULL; g_ren = NULL; g_win = NULL;
}

void furnace_pcm_load_config(const uint8_t *buf, int len) {
    if (len < 8) return;  /* Need at least the header */

    /* Header (8 bytes) */
    g_chip_subtype = buf[0];
    if (g_chip_subtype >= PCM_CHIP_COUNT) g_chip_subtype = 0;
    g_bit_depth = buf[1];
    if (g_bit_depth != 8 && g_bit_depth != 16) g_bit_depth = 8;
    g_loop_enable = buf[2] ? 1 : 0;
    g_loop_mode = buf[3];
    if (g_loop_mode >= LOOP_MODE_COUNT) g_loop_mode = 0;
    g_sample_rate = (int)buf[4] | ((int)buf[5] << 8);
    if (g_sample_rate < 4000) g_sample_rate = 4000;
    if (g_sample_rate > PCM_CHIPS[g_chip_subtype].max_rate)
        g_sample_rate = PCM_CHIPS[g_chip_subtype].max_rate;
    g_filter_enable = buf[6] ? 1 : 0;
    /* buf[7] reserved */

    /* Loop points (8 bytes) */
    if (len >= 16) {
        g_loop_start = (int)buf[8]  | ((int)buf[9]  << 8) |
                       ((int)buf[10] << 16) | ((int)buf[11] << 24);
        g_loop_end   = (int)buf[12] | ((int)buf[13] << 8) |
                       ((int)buf[14] << 16) | ((int)buf[15] << 24);
    }

    /* ES5506 filter (4 bytes) */
    if (len >= 20) {
        g_filter_k1 = (int)buf[16] | ((int)buf[17] << 8);
        g_filter_k2 = (int)buf[18] | ((int)buf[19] << 8);
    }

    g_scroll_x = 0;
    g_dirty = 1;
}

int furnace_pcm_dump_config(uint8_t *buf, int max_len) {
    if (max_len < PCM_CONFIG_SIZE) return 0;

    /* Header (8 bytes) */
    buf[0] = (uint8_t)g_chip_subtype;
    buf[1] = (uint8_t)g_bit_depth;
    buf[2] = (uint8_t)g_loop_enable;
    buf[3] = (uint8_t)g_loop_mode;
    buf[4] = (uint8_t)(g_sample_rate & 0xFF);
    buf[5] = (uint8_t)((g_sample_rate >> 8) & 0xFF);
    buf[6] = (uint8_t)g_filter_enable;
    buf[7] = 0; /* reserved */

    /* Loop points (8 bytes) */
    buf[8]  = (uint8_t)(g_loop_start & 0xFF);
    buf[9]  = (uint8_t)((g_loop_start >> 8) & 0xFF);
    buf[10] = (uint8_t)((g_loop_start >> 16) & 0xFF);
    buf[11] = (uint8_t)((g_loop_start >> 24) & 0xFF);
    buf[12] = (uint8_t)(g_loop_end & 0xFF);
    buf[13] = (uint8_t)((g_loop_end >> 8) & 0xFF);
    buf[14] = (uint8_t)((g_loop_end >> 16) & 0xFF);
    buf[15] = (uint8_t)((g_loop_end >> 24) & 0xFF);

    /* ES5506 filter (4 bytes) */
    buf[16] = (uint8_t)(g_filter_k1 & 0xFF);
    buf[17] = (uint8_t)((g_filter_k1 >> 8) & 0xFF);
    buf[18] = (uint8_t)(g_filter_k2 & 0xFF);
    buf[19] = (uint8_t)((g_filter_k2 >> 8) & 0xFF);

    return PCM_CONFIG_SIZE;
}

void furnace_pcm_load_pcm(const uint8_t *data, int len) {
    if (g_pcm_data) { free(g_pcm_data); g_pcm_data = NULL; }
    g_pcm_len = len;
    if (len > 0) {
        g_pcm_data = (int8_t *)malloc(len);
        memcpy(g_pcm_data, data, len);
    }
    g_scroll_x = 0;
    g_dirty = 1;
}
