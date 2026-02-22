/*
 * furnace_wave.c — Furnace Wavetable Instrument Editor (SDL2/Emscripten)
 *
 * Renders a wavetable editor with:
 * - Chip-aware wavetable draw area (variable length and bit depth)
 * - Wave selector with prev/next navigation
 * - FDS modulation table editor (32-step, modSpeed/modDepth knobs)
 * - N163 settings (wavePos, waveLen, waveMode)
 * - Click/drag waveform drawing with interpolation
 *
 * Canvas: 560x400
 */

#include <SDL2/SDL.h>
#include <emscripten.h>
#include <emscripten/html5.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <math.h>

#include "furnace_wave.h"
#include "hwui_common.h"

/* ── JS Callbacks ──────────────────────────────────────────────────────── */

EM_JS(void, js_on_param_change, (int param_id, int value), {
    if (Module.onParamChange) Module.onParamChange(param_id, value);
});

EM_JS(void, js_on_wave_draw, (int index, int value), {
    if (Module.onWaveDraw) Module.onWaveDraw(index, value);
});

/* ── Param IDs ─────────────────────────────────────────────────────────── */

#define PARAM_WAVE_SELECT   0
#define PARAM_WAVE_LEN      1
#define PARAM_FDS_MOD_SPEED 2
#define PARAM_FDS_MOD_DEPTH 3
#define PARAM_N163_POS      4
#define PARAM_N163_LEN      5
#define PARAM_N163_MODE     6

/* ── Chip Info Table ───────────────────────────────────────────────────── */

typedef struct {
    const char *name;
    int wave_len;       /* default samples per wave */
    int max_val;        /* max sample value */
    int has_fds_mod;    /* FDS modulation table */
    int has_n163;       /* N163 position/length settings */
} WaveChipInfo;

static const WaveChipInfo WAVE_CHIPS[WAVE_CHIP_COUNT] = {
    { "Konami SCC",     32,  255, 0, 0 },
    { "Namco N163",     32,   15, 0, 1 },
    { "Famicom FDS",    64,   63, 1, 0 },
    { "PC Engine",      32,   31, 0, 0 },
    { "Virtual Boy",    32,   63, 0, 0 },
    { "WonderSwan",     32,   15, 0, 0 },
    { "Atari Lynx",     32,  255, 0, 0 },
    { "Sharp X1-010",  128,  255, 0, 0 },
    { "Bubble System",  32,   15, 0, 0 },
    { "Namco WSG",      32,   15, 0, 0 },
};

/* ── Layout ────────────────────────────────────────────────────────────── */

#define SCREEN_W 560
#define SCREEN_H 400

/* ── Global State ──────────────────────────────────────────────────────── */

static SDL_Window   *g_win;
static SDL_Renderer *g_ren;
static SDL_Texture  *g_tex;
static uint32_t      g_fb[SCREEN_W * SCREEN_H];

static int     g_chip_subtype = 0;
static int     g_wave_count = 1;
static int     g_current_wave = 0;
static int     g_wave_len = 32;
static uint8_t g_wave_data[256];

/* FDS modulation */
static int8_t  g_fds_mod_table[32];
static int     g_fds_mod_speed = 0;
static int     g_fds_mod_depth = 0;

/* N163 settings */
static int     g_n163_pos = 0;
static int     g_n163_len = 32;
static int     g_n163_mode = 0;

/* Mouse state */
static int g_mouse_x = 0, g_mouse_y = 0;
static int g_mouse_down = 0;
static int g_prev_draw_x = -1, g_prev_draw_y = -1;
static int g_dirty = 1;

/* ── Waveform Preset Generators ────────────────────────────────────────── */

static void generate_sine(void) {
    const WaveChipInfo *chip = &WAVE_CHIPS[g_chip_subtype];
    int len = g_wave_len;
    int max_val = chip->max_val;
    for (int i = 0; i < len; i++) {
        double phase = (double)i / (double)len * 2.0 * 3.14159265358979;
        double val = (sin(phase) + 1.0) * 0.5 * (double)max_val;
        g_wave_data[i] = (uint8_t)(int)val;
    }
}

static void generate_triangle(void) {
    const WaveChipInfo *chip = &WAVE_CHIPS[g_chip_subtype];
    int len = g_wave_len;
    int max_val = chip->max_val;
    for (int i = 0; i < len; i++) {
        int half = len / 2;
        int val;
        if (i < half) {
            val = max_val * i / (half > 0 ? half : 1);
        } else {
            val = max_val * (len - i) / (half > 0 ? half : 1);
        }
        if (val > max_val) val = max_val;
        g_wave_data[i] = (uint8_t)val;
    }
}

static void generate_saw(void) {
    const WaveChipInfo *chip = &WAVE_CHIPS[g_chip_subtype];
    int len = g_wave_len;
    int max_val = chip->max_val;
    for (int i = 0; i < len; i++) {
        g_wave_data[i] = (uint8_t)(max_val * i / (len > 1 ? len - 1 : 1));
    }
}

static void generate_square(void) {
    const WaveChipInfo *chip = &WAVE_CHIPS[g_chip_subtype];
    int len = g_wave_len;
    int max_val = chip->max_val;
    for (int i = 0; i < len; i++) {
        g_wave_data[i] = (i < len / 2) ? (uint8_t)max_val : 0;
    }
}

/* ── Wavetable Draw Area Rendering ─────────────────────────────────────── */

static void render_wave_editor(int x, int y, int w, int h) {
    const WaveChipInfo *chip = &WAVE_CHIPS[g_chip_subtype];
    int len = g_wave_len;
    int max_val = chip->max_val;

    /* Sunken panel background */
    hwui_panel_sunken(g_fb, SCREEN_W, x, y, w, h);

    /* Grid lines at 25%, 50%, 75% */
    for (int i = 1; i < 4; i++) {
        int gy = y + h * i / 4;
        hwui_hline(g_fb, SCREEN_W, x + 1, gy, w - 2, HWUI_GRAY_DARK);
    }

    /* Vertical grid lines every 8 samples */
    int bar_w = (w - 4) / len;
    if (bar_w < 1) bar_w = 1;
    for (int i = 8; i < len; i += 8) {
        int gx = x + 2 + i * bar_w;
        if (gx < x + w - 2) {
            hwui_vline(g_fb, SCREEN_W, gx, y + 1, h - 2, HWUI_GRAY_DARK);
        }
    }

    /* Draw bars for each sample */
    for (int i = 0; i < len; i++) {
        int bx = x + 2 + i * bar_w;
        int val = g_wave_data[i];
        int bar_h = (val * (h - 4)) / (max_val > 0 ? max_val : 1);
        if (bar_h < 0) bar_h = 0;
        int by = y + h - 2 - bar_h;
        if (bar_w > 2) {
            hwui_rect(g_fb, SCREEN_W, bx, by, bar_w - 1, bar_h, HWUI_GREEN);
        } else {
            hwui_vline(g_fb, SCREEN_W, bx, by, bar_h, HWUI_GREEN);
        }
    }

    /* Connect sample tops with a line for visual clarity */
    for (int i = 0; i < len - 1; i++) {
        int x0 = x + 2 + i * bar_w + bar_w / 2;
        int x1 = x + 2 + (i + 1) * bar_w + bar_w / 2;
        int y0_val = g_wave_data[i];
        int y1_val = g_wave_data[i + 1];
        int py0 = y + h - 2 - (y0_val * (h - 4)) / (max_val > 0 ? max_val : 1);
        int py1 = y + h - 2 - (y1_val * (h - 4)) / (max_val > 0 ? max_val : 1);
        hwui_line(g_fb, SCREEN_W, x0, py0, x1, py1, HWUI_RGB(100, 255, 100));
    }

    /* Handle mouse drawing in wave area */
    if (g_mouse_down && g_mouse_x >= x + 2 && g_mouse_x < x + w - 2 &&
        g_mouse_y >= y + 2 && g_mouse_y < y + h - 2) {
        int idx = (g_mouse_x - x - 2) / bar_w;
        if (idx >= 0 && idx < len) {
            int val = max_val - (g_mouse_y - y - 2) * max_val / (h - 4);
            if (val < 0) val = 0;
            if (val > max_val) val = max_val;

            /* Interpolate between previous and current draw position */
            if (g_prev_draw_x >= 0 && g_prev_draw_x != idx) {
                int start = g_prev_draw_x;
                int end = idx;
                int start_val = g_prev_draw_y;
                int end_val = val;
                if (start > end) {
                    int tmp = start; start = end; end = tmp;
                    tmp = start_val; start_val = end_val; end_val = tmp;
                }
                for (int j = start; j <= end; j++) {
                    if (j >= 0 && j < len) {
                        int interp;
                        if (end != start) {
                            interp = start_val + (end_val - start_val) * (j - start) / (end - start);
                        } else {
                            interp = val;
                        }
                        if (interp < 0) interp = 0;
                        if (interp > max_val) interp = max_val;
                        g_wave_data[j] = (uint8_t)interp;
                        js_on_wave_draw(j, interp);
                    }
                }
            } else {
                g_wave_data[idx] = (uint8_t)val;
                js_on_wave_draw(idx, val);
            }

            g_prev_draw_x = idx;
            g_prev_draw_y = val;
            g_dirty = 1;
        }
    }

    /* Labels: sample count and bit depth */
    char info[32];
    snprintf(info, sizeof(info), "%d smp / %d-lvl", len, max_val + 1);
    hwui_text(g_fb, SCREEN_W, x + 4, y + 4, info, HWUI_GRAY_LIGHT);
}

/* ── FDS Modulation Table Rendering ────────────────────────────────────── */

static void render_fds_mod_editor(int x, int y, int w, int h) {
    hwui_group_box(g_fb, SCREEN_W, x, y, w, h, "FDS Modulation", HWUI_CYAN);

    int table_x = x + 4;
    int table_y = y + 12;
    int table_w = w - 8;
    int table_h = 40;

    /* Sunken panel for mod table */
    hwui_panel_sunken(g_fb, SCREEN_W, table_x, table_y, table_w, table_h);

    /* Center line (zero) */
    int center_y = table_y + table_h / 2;
    hwui_hline(g_fb, SCREEN_W, table_x + 1, center_y, table_w - 2, HWUI_GRAY_MED);

    /* Draw 32 mod table entries (-4 to +3 range, 8 total levels) */
    int step_w = (table_w - 4) / 32;
    if (step_w < 1) step_w = 1;

    for (int i = 0; i < 32; i++) {
        int sx = table_x + 2 + i * step_w;
        int val = g_fds_mod_table[i];  /* -4 to +3 */
        /* Map -4..+3 to pixel offset from center */
        int half_h = (table_h - 4) / 2;
        int bar_h = (val * half_h) / 4;

        uint32_t col = (val >= 0) ? HWUI_CYAN : HWUI_MAGENTA;
        if (bar_h > 0) {
            hwui_rect(g_fb, SCREEN_W, sx, center_y - bar_h, step_w - 1, bar_h, col);
        } else if (bar_h < 0) {
            hwui_rect(g_fb, SCREEN_W, sx, center_y, step_w - 1, -bar_h, col);
        }
    }

    /* Handle mouse drawing in mod table */
    if (g_mouse_down && g_mouse_x >= table_x + 2 && g_mouse_x < table_x + table_w - 2 &&
        g_mouse_y >= table_y + 2 && g_mouse_y < table_y + table_h - 2) {
        int idx = (g_mouse_x - table_x - 2) / step_w;
        if (idx >= 0 && idx < 32) {
            int half_h = (table_h - 4) / 2;
            int val = -(g_mouse_y - center_y) * 4 / (half_h > 0 ? half_h : 1);
            if (val < -4) val = -4;
            if (val > 3) val = 3;
            g_fds_mod_table[idx] = (int8_t)val;
            js_on_param_change(PARAM_FDS_MOD_SPEED, g_fds_mod_speed); /* signal update */
            g_dirty = 1;
        }
    }

    /* ModSpeed and ModDepth knobs */
    int knob_y = table_y + table_h + 4;
    float new_val;

    new_val = (float)g_fds_mod_speed;
    if (hwui_knob(g_fb, SCREEN_W, x + 20, knob_y, 12,
                  (float)g_fds_mod_speed, 0, 4095, "Speed",
                  HWUI_CYAN, g_mouse_x, g_mouse_y, g_mouse_down, &new_val)) {
        g_fds_mod_speed = (int)new_val;
        js_on_param_change(PARAM_FDS_MOD_SPEED, g_fds_mod_speed);
        g_dirty = 1;
    }

    new_val = (float)g_fds_mod_depth;
    if (hwui_knob(g_fb, SCREEN_W, x + 80, knob_y, 12,
                  (float)g_fds_mod_depth, 0, 63, "Depth",
                  HWUI_CYAN, g_mouse_x, g_mouse_y, g_mouse_down, &new_val)) {
        g_fds_mod_depth = (int)new_val;
        js_on_param_change(PARAM_FDS_MOD_DEPTH, g_fds_mod_depth);
        g_dirty = 1;
    }
}

/* ── N163 Settings Rendering ───────────────────────────────────────────── */

static void render_n163_settings(int x, int y, int w, int h) {
    hwui_group_box(g_fb, SCREEN_W, x, y, w, h, "N163 Settings", HWUI_AMBER);

    int knob_y = y + 14;
    float new_val;

    /* Wave position */
    new_val = (float)g_n163_pos;
    if (hwui_knob(g_fb, SCREEN_W, x + 20, knob_y, 12,
                  (float)g_n163_pos, 0, 255, "WavPos",
                  HWUI_AMBER, g_mouse_x, g_mouse_y, g_mouse_down, &new_val)) {
        g_n163_pos = (int)new_val;
        js_on_param_change(PARAM_N163_POS, g_n163_pos);
        g_dirty = 1;
    }

    /* Wave length */
    new_val = (float)g_n163_len;
    if (hwui_knob(g_fb, SCREEN_W, x + 80, knob_y, 12,
                  (float)g_n163_len, 4, 256, "WavLen",
                  HWUI_AMBER, g_mouse_x, g_mouse_y, g_mouse_down, &new_val)) {
        g_n163_len = (int)new_val;
        js_on_param_change(PARAM_N163_LEN, g_n163_len);
        g_dirty = 1;
    }

    /* Wave mode dropdown */
    static const char *n163_modes[] = { "Normal", "One-shot", "Bidirectional" };
    int new_mode = g_n163_mode;
    if (hwui_dropdown(g_fb, SCREEN_W, x + 140, knob_y + 4, 120,
                      n163_modes, 3, g_n163_mode,
                      g_mouse_x, g_mouse_y, g_mouse_down, &new_mode)) {
        g_n163_mode = new_mode;
        js_on_param_change(PARAM_N163_MODE, g_n163_mode);
        g_dirty = 1;
    }
}

/* ── Wave Selector Row ─────────────────────────────────────────────────── */

static void render_wave_selector(int x, int y, int w, int h) {
    hwui_panel_raised(g_fb, SCREEN_W, x, y, w, h);

    /* Prev button */
    int btn_w = 28;
    int btn_h = h - 4;
    int clicked_prev = hwui_button(g_fb, SCREEN_W, x + 4, y + 2, btn_w, btn_h,
                                   "<", 0, g_mouse_x, g_mouse_y, g_mouse_down);
    if (clicked_prev && g_current_wave > 0) {
        g_current_wave--;
        js_on_param_change(PARAM_WAVE_SELECT, g_current_wave);
        g_dirty = 1;
    }

    /* Wave number display */
    char wave_label[32];
    snprintf(wave_label, sizeof(wave_label), "Wave %d / %d", g_current_wave + 1, g_wave_count);
    hwui_text_centered(g_fb, SCREEN_W, x + btn_w + 8, y, w - 2 * btn_w - 16, h,
                       wave_label, HWUI_WHITE);

    /* Next button */
    int clicked_next = hwui_button(g_fb, SCREEN_W, x + w - btn_w - 4, y + 2, btn_w, btn_h,
                                   ">", 0, g_mouse_x, g_mouse_y, g_mouse_down);
    if (clicked_next && g_current_wave < g_wave_count - 1) {
        g_current_wave++;
        js_on_param_change(PARAM_WAVE_SELECT, g_current_wave);
        g_dirty = 1;
    }

    /* Preset buttons */
    int preset_x = x + 140;
    int preset_btn_w = 36;
    int preset_gap = 4;

    if (hwui_button(g_fb, SCREEN_W, preset_x, y + 2, preset_btn_w, btn_h,
                    "SIN", 0, g_mouse_x, g_mouse_y, g_mouse_down)) {
        generate_sine();
        g_dirty = 1;
    }
    preset_x += preset_btn_w + preset_gap;

    if (hwui_button(g_fb, SCREEN_W, preset_x, y + 2, preset_btn_w, btn_h,
                    "TRI", 0, g_mouse_x, g_mouse_y, g_mouse_down)) {
        generate_triangle();
        g_dirty = 1;
    }
    preset_x += preset_btn_w + preset_gap;

    if (hwui_button(g_fb, SCREEN_W, preset_x, y + 2, preset_btn_w, btn_h,
                    "SAW", 0, g_mouse_x, g_mouse_y, g_mouse_down)) {
        generate_saw();
        g_dirty = 1;
    }
    preset_x += preset_btn_w + preset_gap;

    if (hwui_button(g_fb, SCREEN_W, preset_x, y + 2, preset_btn_w, btn_h,
                    "SQR", 0, g_mouse_x, g_mouse_y, g_mouse_down)) {
        generate_square();
        g_dirty = 1;
    }
}

/* ── Main Render ───────────────────────────────────────────────────────── */

static void render(void) {
    const WaveChipInfo *chip = &WAVE_CHIPS[g_chip_subtype];

    /* Clear framebuffer */
    for (int i = 0; i < SCREEN_W * SCREEN_H; i++)
        g_fb[i] = HWUI_BLACK;

    hwui_frame_begin(g_mouse_x, g_mouse_y, g_mouse_down);

    /* Header bar (y=0..14) */
    hwui_rect(g_fb, SCREEN_W, 0, 0, SCREEN_W, 15, HWUI_BLUE_DARK);
    hwui_text_centered(g_fb, SCREEN_W, 0, 0, SCREEN_W, 15, chip->name, HWUI_WHITE);

    /* Wavetable draw editor (y=16..200) */
    render_wave_editor(4, 16, SCREEN_W - 8, 184);

    /* Wave selector row (y=202..230) */
    render_wave_selector(4, 202, SCREEN_W - 8, 28);

    /* Chip-specific sections (y=232..310) */
    if (chip->has_fds_mod) {
        render_fds_mod_editor(4, 232, SCREEN_W - 8, 108);
    } else if (chip->has_n163) {
        render_n163_settings(4, 232, SCREEN_W - 8, 60);
    }

    /* Wave length selector (y=344..370) — shown for chips with variable lengths */
    {
        int len_y = chip->has_fds_mod ? 344 : (chip->has_n163 ? 296 : 236);
        static const char *len_labels[] = { "32", "64", "128", "256" };
        static const int len_values[] = { 32, 64, 128, 256 };

        /* Find current selection index */
        int sel = 0;
        for (int i = 0; i < 4; i++) {
            if (g_wave_len == len_values[i]) { sel = i; break; }
        }

        hwui_text(g_fb, SCREEN_W, 8, len_y + 4, "Length:", HWUI_GRAY_LIGHT);
        for (int i = 0; i < 4; i++) {
            int bx = 60 + i * 44;
            int pressed = (g_wave_len == len_values[i]) ? 1 : 0;
            if (hwui_button(g_fb, SCREEN_W, bx, len_y, 40, 20,
                            len_labels[i], pressed,
                            g_mouse_x, g_mouse_y, g_mouse_down)) {
                if (g_wave_len != len_values[i]) {
                    g_wave_len = len_values[i];
                    /* Clear wave data when changing length */
                    memset(g_wave_data, 0, sizeof(g_wave_data));
                    generate_sine();
                    js_on_param_change(PARAM_WAVE_LEN, g_wave_len);
                    g_dirty = 1;
                }
            }
        }
    }

    hwui_frame_end();

    /* Push framebuffer to SDL texture */
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
        g_prev_draw_x = -1;
        g_prev_draw_y = -1;
        g_dirty = 1;
        break;
    case SDL_MOUSEBUTTONUP:
        g_mouse_x = e->button.x;
        g_mouse_y = e->button.y;
        g_mouse_down = 0;
        g_prev_draw_x = -1;
        g_prev_draw_y = -1;
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

void furnace_wave_init(int w, int h) {
    (void)w; (void)h;
    SDL_Init(SDL_INIT_VIDEO);
    g_win = SDL_CreateWindow("Furnace Wave Editor",
        SDL_WINDOWPOS_UNDEFINED, SDL_WINDOWPOS_UNDEFINED,
        SCREEN_W, SCREEN_H, 0);
    g_ren = SDL_CreateRenderer(g_win, -1, SDL_RENDERER_SOFTWARE);
    g_tex = SDL_CreateTexture(g_ren, SDL_PIXELFORMAT_ARGB8888,
        SDL_TEXTUREACCESS_STREAMING, SCREEN_W, SCREEN_H);

    memset(g_fb, 0, sizeof(g_fb));
    hwui_set_fb_size(SCREEN_W, SCREEN_H);
    memset(g_wave_data, 0, sizeof(g_wave_data));
    memset(g_fds_mod_table, 0, sizeof(g_fds_mod_table));

    g_chip_subtype = 0;
    g_wave_count = 1;
    g_current_wave = 0;
    g_wave_len = WAVE_CHIPS[0].wave_len;
    g_fds_mod_speed = 0;
    g_fds_mod_depth = 0;
    g_n163_pos = 0;
    g_n163_len = 32;
    g_n163_mode = 0;
    g_prev_draw_x = -1;
    g_prev_draw_y = -1;

    /* Initialize with a sine wave */
    generate_sine();

    hwui_reset_state();
    g_dirty = 1;
}

void furnace_wave_start(void) {
    emscripten_set_main_loop(tick, 60, 0);
}

void furnace_wave_shutdown(void) {
    emscripten_cancel_main_loop();
    if (g_tex) SDL_DestroyTexture(g_tex);
    if (g_ren) SDL_DestroyRenderer(g_ren);
    if (g_win) SDL_DestroyWindow(g_win);
    g_tex = NULL; g_ren = NULL; g_win = NULL;
}

void furnace_wave_load_config(const uint8_t *buf, int len) {
    if (len < WAVE_HEADER_SIZE) return;

    /* Header */
    g_chip_subtype = buf[0];
    if (g_chip_subtype >= WAVE_CHIP_COUNT) g_chip_subtype = 0;
    g_wave_count = buf[1];
    if (g_wave_count < 1) g_wave_count = 1;
    g_current_wave = buf[2];
    if (g_current_wave >= g_wave_count) g_current_wave = 0;
    g_wave_len = buf[3];
    if (g_wave_len != 32 && g_wave_len != 64 && g_wave_len != 128) {
        /* Allow 256 only if byte value is 0 (overflow from uint8) or explicit */
        if (buf[3] == 0 && len > WAVE_HEADER_SIZE + 128) {
            g_wave_len = 256;
        } else {
            g_wave_len = WAVE_CHIPS[g_chip_subtype].wave_len;
        }
    }

    /* Wave data */
    int data_to_read = g_wave_len;
    if (data_to_read > 256) data_to_read = 256;
    if (WAVE_HEADER_SIZE + data_to_read > len) data_to_read = len - WAVE_HEADER_SIZE;
    memset(g_wave_data, 0, sizeof(g_wave_data));
    if (data_to_read > 0) {
        memcpy(g_wave_data, buf + WAVE_HEADER_SIZE, data_to_read);
    }

    /* Clamp wave values to chip max */
    const WaveChipInfo *chip = &WAVE_CHIPS[g_chip_subtype];
    for (int i = 0; i < g_wave_len && i < 256; i++) {
        if (g_wave_data[i] > chip->max_val) {
            g_wave_data[i] = (uint8_t)chip->max_val;
        }
    }

    /* FDS modulation (offset 260) */
    if (chip->has_fds_mod && len >= 260 + WAVE_FDS_SIZE) {
        memcpy(g_fds_mod_table, buf + 260, 32);
        /* Clamp mod table values to -4..+3 */
        for (int i = 0; i < 32; i++) {
            if (g_fds_mod_table[i] < -4) g_fds_mod_table[i] = -4;
            if (g_fds_mod_table[i] > 3)  g_fds_mod_table[i] = 3;
        }
        g_fds_mod_speed = (int)buf[292] | ((int)buf[293] << 8);
        g_fds_mod_depth = buf[294];
        if (g_fds_mod_depth > 63) g_fds_mod_depth = 63;
    }

    /* N163 settings (offset 296) */
    if (chip->has_n163 && len >= 296 + WAVE_N163_SIZE) {
        g_n163_pos = buf[296];
        g_n163_len = buf[297];
        if (g_n163_len < 4) g_n163_len = 4;
        g_n163_mode = buf[298];
        if (g_n163_mode > 2) g_n163_mode = 0;
    }

    g_dirty = 1;
}

int furnace_wave_dump_config(uint8_t *buf, int max_len) {
    if (max_len < WAVE_CONFIG_SIZE) return 0;

    memset(buf, 0, WAVE_CONFIG_SIZE);

    /* Header */
    buf[0] = (uint8_t)g_chip_subtype;
    buf[1] = (uint8_t)g_wave_count;
    buf[2] = (uint8_t)g_current_wave;
    /* Store wave_len: 256 wraps to 0 in uint8, handled on load */
    buf[3] = (uint8_t)(g_wave_len & 0xFF);

    /* Wave data */
    int data_to_write = g_wave_len;
    if (data_to_write > 256) data_to_write = 256;
    memcpy(buf + WAVE_HEADER_SIZE, g_wave_data, data_to_write);

    /* FDS modulation */
    const WaveChipInfo *chip = &WAVE_CHIPS[g_chip_subtype];
    if (chip->has_fds_mod) {
        memcpy(buf + 260, g_fds_mod_table, 32);
        buf[292] = (uint8_t)(g_fds_mod_speed & 0xFF);
        buf[293] = (uint8_t)((g_fds_mod_speed >> 8) & 0xFF);
        buf[294] = (uint8_t)g_fds_mod_depth;
        buf[295] = 0;  /* reserved */
    }

    /* N163 settings */
    if (chip->has_n163) {
        buf[296] = (uint8_t)g_n163_pos;
        buf[297] = (uint8_t)g_n163_len;
        buf[298] = (uint8_t)g_n163_mode;
        buf[299] = 0;  /* reserved */
    }

    return WAVE_CONFIG_SIZE;
}
