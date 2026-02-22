/*
 * furnace_macro.c — Furnace Macro Editor (SDL2/Emscripten)
 *
 * Renders a macro sequence editor with:
 * - Tab bar for 8 macro types (Vol, Arp, Duty, Wave, Pitch, Ex1-Ex3)
 * - Vertical bar sequence editor with up to 256 steps
 * - Loop and release point markers (blue/red vertical lines)
 * - Click/drag editing of macro values
 * - Horizontal scrollbar for long macros
 * - Bottom status bar with loop/release/length/mode display
 *
 * Canvas: 640x200
 */

#include <SDL2/SDL.h>
#include <emscripten.h>
#include <emscripten/html5.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <math.h>

#include "furnace_macro.h"
#include "hwui_common.h"

/* ── JS Callbacks ──────────────────────────────────────────────────────── */

EM_JS(void, js_on_param_change, (int param_id, int value), {
    if (Module.onParamChange) Module.onParamChange(param_id, value);
});

EM_JS(void, js_on_macro_edit, (int index, int value), {
    if (Module.onMacroEdit) Module.onMacroEdit(index, value);
});

EM_JS(void, js_on_tab_change, (int tab), {
    if (Module.onTabChange) Module.onTabChange(tab);
});

/* ── Param IDs (must match TypeScript PARAM_* constants) ───────────────── */

#define PARAM_TAB_SELECT  0
#define PARAM_LOOP_POS    1
#define PARAM_REL_POS     2
#define PARAM_MACRO_LEN   3
#define PARAM_MACRO_MODE  4

/* ── Layout Constants ──────────────────────────────────────────────────── */

#define SCREEN_W 640
#define SCREEN_H 200

#define TAB_BAR_H       18
#define EDITOR_Y        20
#define EDITOR_H        160  /* y=20..179 */
#define SCROLLBAR_H     10   /* y=180..189 */
#define BOTTOM_BAR_Y    190
#define BOTTOM_BAR_H    10   /* y=190..199 */

/* ── Global State ──────────────────────────────────────────────────────── */

static SDL_Window   *g_win;
static SDL_Renderer *g_ren;
static SDL_Texture  *g_tex;
static uint32_t      g_fb[SCREEN_W * SCREEN_H];

static int    g_active_macro = 0;
static int    g_macro_len = 0;
static int    g_loop_pos = 255;    /* 255 = no loop */
static int    g_rel_pos = 255;     /* 255 = no release */
static int8_t g_macro_data[256];
static int    g_min_val = 0;
static int    g_max_val = 15;
static int    g_macro_mode = 0;

static int g_scroll_x = 0;

static int g_mouse_x = 0, g_mouse_y = 0, g_mouse_down = 0;
static int g_dirty = 1;

/* ── Macro Tab Configuration ───────────────────────────────────────────── */

static const char *MACRO_NAMES[MACRO_COUNT] = {
    "Vol", "Arp", "Duty", "Wave", "Pitch", "Ex1", "Ex2", "Ex3"
};

static const uint32_t MACRO_COLORS[MACRO_COUNT] = {
    HWUI_GREEN, HWUI_CYAN, HWUI_AMBER, HWUI_BLUE_LIGHT,
    HWUI_MAGENTA, HWUI_ORANGE, HWUI_RED, HWUI_YELLOW
};

/* ── Mode Names ────────────────────────────────────────────────────────── */

static const char *MODE_NAMES[] = { "SEQ", "ADSR", "LFO" };
#define MODE_COUNT 3

/* ── Tab Bar Rendering ─────────────────────────────────────────────────── */

static void render_tabs(void) {
    int tab_w = SCREEN_W / MACRO_COUNT;

    for (int i = 0; i < MACRO_COUNT; i++) {
        int tx = i * tab_w;
        int tw = (i == MACRO_COUNT - 1) ? (SCREEN_W - tx) : tab_w;

        uint32_t bg = (i == g_active_macro) ? MACRO_COLORS[i] : HWUI_GRAY_DARK;
        uint32_t fg = (i == g_active_macro) ? HWUI_BLACK : HWUI_GRAY_LIGHT;

        hwui_rect(g_fb, SCREEN_W, tx, 0, tw - 1, TAB_BAR_H, bg);
        hwui_text_centered(g_fb, SCREEN_W, tx, 0, tw - 1, TAB_BAR_H, MACRO_NAMES[i], fg);

        /* 1px separator between tabs */
        if (i < MACRO_COUNT - 1) {
            hwui_vline(g_fb, SCREEN_W, tx + tw - 1, 0, TAB_BAR_H, HWUI_BLACK);
        }
    }
}

static void handle_tab_click(void) {
    if (!g_mouse_down || g_mouse_y >= TAB_BAR_H) return;

    int tab_w = SCREEN_W / MACRO_COUNT;
    int clicked = g_mouse_x / tab_w;
    if (clicked < 0) clicked = 0;
    if (clicked >= MACRO_COUNT) clicked = MACRO_COUNT - 1;

    if (g_active_macro != clicked) {
        g_active_macro = clicked;
        js_on_tab_change(clicked);
        js_on_param_change(PARAM_TAB_SELECT, clicked);
        g_dirty = 1;
    }
}

/* ── Macro Editor Area (main editing surface) ──────────────────────────── */

static void render_macro_editor(void) {
    int x = 0;
    int y = EDITOR_Y;
    int w = SCREEN_W;
    int h = EDITOR_H;

    /* Sunken panel background */
    hwui_panel_sunken(g_fb, SCREEN_W, x, y, w, h);

    if (g_macro_len == 0) {
        hwui_text_centered(g_fb, SCREEN_W, x, y, w, h, "Empty macro", HWUI_GRAY_MED);
        return;
    }

    int inner_x = x + 2;
    int inner_y = y + 2;
    int inner_w = w - 4;
    int inner_h = h - 4;

    int range = g_max_val - g_min_val;
    if (range <= 0) range = 1;

    /* Calculate step width: scale to fit, min 3px per step */
    int step_w = inner_w / g_macro_len;
    if (step_w < 3) step_w = 3;
    if (step_w > 20) step_w = 20;
    int visible_steps = inner_w / step_w;

    uint32_t bar_color = MACRO_COLORS[g_active_macro];
    /* Dimmer version for bar fill */
    uint32_t bar_fill = (bar_color & 0xFF000000)
                      | (((bar_color >> 16) & 0xFF) * 3 / 4) << 16
                      | (((bar_color >>  8) & 0xFF) * 3 / 4) << 8
                      | (((bar_color      ) & 0xFF) * 3 / 4);

    /* Gridlines at quarter intervals */
    for (int g = 1; g < 4; g++) {
        int gy = inner_y + inner_h - (g * inner_h / 4);
        hwui_hline(g_fb, SCREEN_W, inner_x, gy, inner_w, 0xFF2A2A2A);
    }

    /* Zero-line for signed macros (pitch, arp) */
    if (g_min_val < 0) {
        int zero_y = inner_y + inner_h - (-g_min_val) * inner_h / range;
        if (zero_y > inner_y && zero_y < inner_y + inner_h) {
            hwui_hline(g_fb, SCREEN_W, inner_x, zero_y, inner_w, HWUI_GRAY_MED);
        }
    }

    /* Draw bars for each visible step */
    for (int i = 0; i < visible_steps; i++) {
        int si = i + g_scroll_x;
        if (si >= g_macro_len) break;

        int val = g_macro_data[si];
        int clamped = val;
        if (clamped < g_min_val) clamped = g_min_val;
        if (clamped > g_max_val) clamped = g_max_val;

        int norm_val = clamped - g_min_val;
        int bar_h = norm_val * inner_h / range;
        if (bar_h < 0) bar_h = 0;

        int bx = inner_x + i * step_w;
        int by = inner_y + inner_h - bar_h;

        /* Bar fill */
        if (bar_h > 0) {
            hwui_rect(g_fb, SCREEN_W, bx, by, step_w - 1, bar_h, bar_fill);
            /* Bright top edge */
            hwui_hline(g_fb, SCREEN_W, bx, by, step_w - 1, bar_color);
        }

        /* Step number labels (every 4th step, or every step if wide enough) */
        if (step_w >= 10 || (si % 4 == 0 && step_w >= 5)) {
            const char *label = hwui_fmt_int(si);
            hwui_text(g_fb, SCREEN_W, bx + 1, inner_y + inner_h - 7, label, 0xFF444444);
        }
    }

    /* Loop marker — blue vertical line with 'L' label */
    if (g_loop_pos != 255 && g_loop_pos < g_macro_len) {
        int loop_screen = g_loop_pos - g_scroll_x;
        if (loop_screen >= 0 && loop_screen < visible_steps) {
            int lx = inner_x + loop_screen * step_w;
            hwui_vline(g_fb, SCREEN_W, lx, inner_y, inner_h, HWUI_BLUE);
            hwui_vline(g_fb, SCREEN_W, lx + 1, inner_y, inner_h, HWUI_BLUE);
            hwui_char(g_fb, SCREEN_W, lx + 3, inner_y + 1, 'L', HWUI_BLUE_LIGHT);
        }
    }

    /* Release marker — red vertical line with 'R' label */
    if (g_rel_pos != 255 && g_rel_pos < g_macro_len) {
        int rel_screen = g_rel_pos - g_scroll_x;
        if (rel_screen >= 0 && rel_screen < visible_steps) {
            int rx = inner_x + rel_screen * step_w;
            hwui_vline(g_fb, SCREEN_W, rx, inner_y, inner_h, HWUI_RED);
            hwui_vline(g_fb, SCREEN_W, rx + 1, inner_y, inner_h, HWUI_RED);
            hwui_char(g_fb, SCREEN_W, rx + 3, inner_y + 1, 'R', 0xFFFF6666);
        }
    }

    /* Mouse editing: click/drag to set values */
    if (g_mouse_down &&
        g_mouse_x >= inner_x && g_mouse_x < inner_x + inner_w &&
        g_mouse_y >= inner_y && g_mouse_y < inner_y + inner_h) {

        int col = (g_mouse_x - inner_x) / step_w;
        int idx = g_scroll_x + col;

        if (idx >= 0 && idx < g_macro_len) {
            /* Map mouse Y to value: top = max_val, bottom = min_val */
            int rel_y = g_mouse_y - inner_y;
            int val = g_max_val - (rel_y * range / inner_h);

            if (val < g_min_val) val = g_min_val;
            if (val > g_max_val) val = g_max_val;

            if (g_macro_data[idx] != (int8_t)val) {
                g_macro_data[idx] = (int8_t)val;
                js_on_macro_edit(idx, val);
                g_dirty = 1;
            }
        }
    }
}

/* ── Horizontal Scrollbar ──────────────────────────────────────────────── */

static void render_scrollbar(void) {
    int sb_y = EDITOR_Y + EDITOR_H;

    /* Only show scrollbar if macro is longer than visible area */
    int step_w = (SCREEN_W - 4) / g_macro_len;
    if (step_w < 3) step_w = 3;
    if (step_w > 20) step_w = 20;
    int visible_steps = (SCREEN_W - 4) / step_w;

    if (g_macro_len <= visible_steps || g_macro_len == 0) {
        /* No scrollbar needed — draw flat bar */
        hwui_rect(g_fb, SCREEN_W, 0, sb_y, SCREEN_W, SCROLLBAR_H, HWUI_GRAY_DARK);
        g_scroll_x = 0;
        return;
    }

    int new_scroll = g_scroll_x;
    if (hwui_scrollbar_h(g_fb, SCREEN_W, 0, sb_y, SCREEN_W, SCROLLBAR_H,
                          g_macro_len, visible_steps, g_scroll_x,
                          g_mouse_x, g_mouse_y, g_mouse_down, &new_scroll)) {
        g_scroll_x = new_scroll;
        g_dirty = 1;
    }
}

/* ── Bottom Status Bar ─────────────────────────────────────────────────── */

static void render_bottom_bar(void) {
    hwui_rect(g_fb, SCREEN_W, 0, BOTTOM_BAR_Y, SCREEN_W, BOTTOM_BAR_H, HWUI_GRAY_DARK);

    int tx = 4;
    int ty = BOTTOM_BAR_Y + 2;

    /* Length display */
    char len_buf[16];
    snprintf(len_buf, sizeof(len_buf), "Len:%d", g_macro_len);
    tx += hwui_text(g_fb, SCREEN_W, tx, ty, len_buf, HWUI_GRAY_LIGHT) + 8;

    /* Loop position */
    char loop_buf[16];
    if (g_loop_pos != 255 && g_loop_pos < g_macro_len)
        snprintf(loop_buf, sizeof(loop_buf), "Loop:%d", g_loop_pos);
    else
        snprintf(loop_buf, sizeof(loop_buf), "Loop:--");
    tx += hwui_text(g_fb, SCREEN_W, tx, ty, loop_buf, HWUI_BLUE_LIGHT) + 8;

    /* Release position */
    char rel_buf[16];
    if (g_rel_pos != 255 && g_rel_pos < g_macro_len)
        snprintf(rel_buf, sizeof(rel_buf), "Rel:%d", g_rel_pos);
    else
        snprintf(rel_buf, sizeof(rel_buf), "Rel:--");
    tx += hwui_text(g_fb, SCREEN_W, tx, ty, rel_buf, 0xFFFF6666) + 8;

    /* Mode display */
    int mode_idx = g_macro_mode;
    if (mode_idx < 0 || mode_idx >= MODE_COUNT) mode_idx = 0;
    char mode_buf[16];
    snprintf(mode_buf, sizeof(mode_buf), "Mode:%s", MODE_NAMES[mode_idx]);
    tx += hwui_text(g_fb, SCREEN_W, tx, ty, mode_buf, HWUI_AMBER) + 8;

    /* Value range on the right */
    char range_buf[24];
    snprintf(range_buf, sizeof(range_buf), "Range:%d..%d", g_min_val, g_max_val);
    hwui_text_right(g_fb, SCREEN_W, SCREEN_W - 4, ty, range_buf, HWUI_GRAY_LIGHT);
}

/* ── Main Render ───────────────────────────────────────────────────────── */

static void render(void) {
    /* Clear framebuffer */
    for (int i = 0; i < SCREEN_W * SCREEN_H; i++)
        g_fb[i] = HWUI_BLACK;

    hwui_frame_begin(g_mouse_x, g_mouse_y, g_mouse_down);

    render_tabs();
    render_macro_editor();
    render_scrollbar();
    render_bottom_bar();

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
        g_dirty = 1;
        handle_tab_click();
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

    case SDL_MOUSEWHEEL:
        /* Horizontal scroll via mouse wheel */
        if (e->wheel.y != 0) {
            int step_w = (SCREEN_W - 4) / (g_macro_len > 0 ? g_macro_len : 1);
            if (step_w < 3) step_w = 3;
            if (step_w > 20) step_w = 20;
            int visible_steps = (SCREEN_W - 4) / step_w;
            int max_scroll = g_macro_len - visible_steps;
            if (max_scroll < 0) max_scroll = 0;

            g_scroll_x -= e->wheel.y * 4;
            if (g_scroll_x < 0) g_scroll_x = 0;
            if (g_scroll_x > max_scroll) g_scroll_x = max_scroll;
            g_dirty = 1;
        }
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

void furnace_macro_init(int w, int h) {
    (void)w; (void)h;

    SDL_Init(SDL_INIT_VIDEO);
    g_win = SDL_CreateWindow("Furnace Macro Editor",
        SDL_WINDOWPOS_UNDEFINED, SDL_WINDOWPOS_UNDEFINED,
        SCREEN_W, SCREEN_H, 0);
    g_ren = SDL_CreateRenderer(g_win, -1, SDL_RENDERER_SOFTWARE);
    g_tex = SDL_CreateTexture(g_ren, SDL_PIXELFORMAT_ARGB8888,
        SDL_TEXTUREACCESS_STREAMING, SCREEN_W, SCREEN_H);

    memset(g_fb, 0, sizeof(g_fb));
    hwui_set_fb_size(SCREEN_W, SCREEN_H);
    memset(g_macro_data, 0, sizeof(g_macro_data));

    g_active_macro = 0;
    g_macro_len = 0;
    g_loop_pos = 255;
    g_rel_pos = 255;
    g_min_val = 0;
    g_max_val = 15;
    g_macro_mode = 0;
    g_scroll_x = 0;

    hwui_reset_state();
    g_dirty = 1;
}

void furnace_macro_start(void) {
    emscripten_set_main_loop(tick, 60, 0);
}

void furnace_macro_shutdown(void) {
    emscripten_cancel_main_loop();
    if (g_tex) SDL_DestroyTexture(g_tex);
    if (g_ren) SDL_DestroyRenderer(g_ren);
    if (g_win) SDL_DestroyWindow(g_win);
    g_tex = NULL;
    g_ren = NULL;
    g_win = NULL;
}

void furnace_macro_load_config(const uint8_t *buf, int len) {
    if (len < MACRO_HEADER_SIZE) return;

    /* Header */
    g_active_macro = buf[0];
    if (g_active_macro >= MACRO_COUNT) g_active_macro = 0;

    g_macro_len = buf[1];
    g_loop_pos  = buf[2];
    g_rel_pos   = buf[3];

    /* Macro data */
    int data_len = len - MACRO_HEADER_SIZE;
    if (data_len > MACRO_DATA_SIZE) data_len = MACRO_DATA_SIZE;
    if (data_len > g_macro_len) data_len = g_macro_len;

    memset(g_macro_data, 0, sizeof(g_macro_data));
    if (data_len > 0 && len >= MACRO_HEADER_SIZE + data_len) {
        memcpy(g_macro_data, buf + MACRO_HEADER_SIZE, data_len);
    }

    /* Range info */
    if (len >= MACRO_CONFIG_SIZE) {
        g_min_val    = (int8_t)buf[260];
        g_max_val    = (int8_t)buf[261];
        g_macro_mode = buf[262];
    } else {
        /* Defaults based on macro type */
        switch (g_active_macro) {
        case MACRO_PITCH:
        case MACRO_ARP:
            g_min_val = -127;
            g_max_val = 127;
            break;
        default:
            g_min_val = 0;
            g_max_val = 15;
            break;
        }
        g_macro_mode = 0;
    }

    /* Clamp scroll position */
    if (g_scroll_x > g_macro_len) g_scroll_x = 0;

    g_dirty = 1;
}

int furnace_macro_dump_config(uint8_t *buf, int max_len) {
    if (max_len < MACRO_CONFIG_SIZE) return 0;

    memset(buf, 0, MACRO_CONFIG_SIZE);

    /* Header */
    buf[0] = (uint8_t)g_active_macro;
    buf[1] = (uint8_t)g_macro_len;
    buf[2] = (uint8_t)g_loop_pos;
    buf[3] = (uint8_t)g_rel_pos;

    /* Macro data */
    if (g_macro_len > 0) {
        memcpy(buf + MACRO_HEADER_SIZE, g_macro_data,
               g_macro_len > MACRO_DATA_SIZE ? MACRO_DATA_SIZE : g_macro_len);
    }

    /* Range info */
    buf[260] = (uint8_t)(int8_t)g_min_val;
    buf[261] = (uint8_t)(int8_t)g_max_val;
    buf[262] = (uint8_t)g_macro_mode;
    buf[263] = 0;

    return MACRO_CONFIG_SIZE;
}
