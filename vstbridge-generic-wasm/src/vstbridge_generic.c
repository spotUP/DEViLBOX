/*
 * vstbridge_generic.c — VSTBridge Generic Hardware UI (SDL2/Emscripten)
 *
 * Parameterized C module that renders a modern-styled control panel for
 * any VSTBridge synth plugin. Parameter metadata (labels, types, ranges,
 * groups) is passed from JavaScript at init time. The module auto-layouts
 * controls into grouped panels with knobs, selectors, and toggles.
 *
 * Canvas: 640x400 — wider than MAME Generic for larger knobs
 * Style: Darker theme (#1A1A1A bg), larger knobs (radius 14), modern panels
 *
 * Differences from MAME Generic (mame_generic.c):
 * - Darker background (#1A1A1A instead of black)
 * - Larger knobs (radius 14 instead of 12)
 * - More spacing between groups (12px instead of 4px)
 * - Group headers use accent color with semi-transparent fill
 * - Subtle gradient header bar
 * - 3 knobs per row (larger cells fit fewer per row)
 * - Modern-style section labels
 * - No subtitle bar (cleaner look)
 * - 128 max params (vs 64 for MAME)
 */

#include <SDL2/SDL.h>
#include <emscripten.h>
#include <emscripten/html5.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <math.h>

#include "vstbridge_generic.h"
#include "hwui_common.h"

/* ── JS Callbacks ──────────────────────────────────────────────────────── */

EM_JS(void, js_on_param_change, (int param_index, float value), {
    if (Module.onParamChange) Module.onParamChange(param_index, value);
});

/* ── Layout Constants ──────────────────────────────────────────────────── */

#define SCREEN_W  640
#define SCREEN_H  400

#define HEADER_H      22   /* Top header bar height */
#define GROUP_PAD     12   /* Padding between groups */
#define GROUP_INNER   6    /* Inner padding within group box */
#define KNOB_R        14   /* Knob radius (larger than MAME's 12) */
#define KNOB_CELL_W   52   /* Width per knob cell */
#define KNOB_CELL_H   52   /* Height per knob cell (knob + label + value) */
#define SELECT_H      12   /* Dropdown height */
#define TOGGLE_H      10   /* Checkbox height */

/* Dark theme background */
#define VB_BG_COLOR   0xFF1A1A1A
#define VB_PANEL_BG   0xFF242424

/* ── Internal Structures ───────────────────────────────────────────────── */

typedef struct {
    float value;
    int label_len;
    char label[32];
} ParamOption;

typedef struct {
    int type;          /* 0=knob, 1=select, 2=toggle */
    char label[32];
    char group[32];
    float min_val, max_val, step, value;
    int option_count;
    ParamOption options[VB_MAX_OPTIONS];
    int group_index;
} Param;

typedef struct {
    char name[32];
    int first_param;
    int param_count;
    /* Layout (computed) */
    int x, y, w, h;
} Group;

/* ── State ─────────────────────────────────────────────────────────────── */

static SDL_Window   *g_win;
static SDL_Renderer *g_ren;
static SDL_Texture  *g_tex;
static uint32_t      g_fb[SCREEN_W * SCREEN_H];

static Param  g_params[VB_MAX_PARAMS];
static int    g_param_count = 0;

static Group  g_groups[VB_MAX_GROUPS];
static int    g_group_count = 0;

static char     g_synth_name[64] = "VSTBridge";
static uint32_t g_accent_color = HWUI_CYAN;

static int g_scroll_y = 0;
static int g_content_height = 0;

static int g_mouse_x = 0, g_mouse_y = 0;
static int g_mouse_down = 0;
static int g_dirty = 1;

/* ── Helper: Read/Write float32 LE from buffer ─────────────────────────── */

static float read_f32_le(const uint8_t *p) {
    float val;
    memcpy(&val, p, 4);
    return val;
}

static void write_f32_le(uint8_t *p, float val) {
    memcpy(p, &val, 4);
}

/* ── Helper: Darken a color (for gradient) ─────────────────────────────── */

static uint32_t darken_color(uint32_t col, float factor) {
    uint8_t r = (col >> 16) & 0xFF;
    uint8_t g = (col >>  8) & 0xFF;
    uint8_t b = (col      ) & 0xFF;
    r = (uint8_t)(r * factor);
    g = (uint8_t)(g * factor);
    b = (uint8_t)(b * factor);
    return HWUI_RGB(r, g, b);
}

/* ── Helper: Blend color with alpha ────────────────────────────────────── */

static uint32_t blend_color(uint32_t col, uint32_t bg, float alpha) {
    uint8_t cr = (col >> 16) & 0xFF, cg = (col >> 8) & 0xFF, cb = col & 0xFF;
    uint8_t br = (bg >> 16) & 0xFF,  bg2 = (bg >> 8) & 0xFF, bb = bg & 0xFF;
    uint8_t rr = (uint8_t)(cr * alpha + br * (1.0f - alpha));
    uint8_t gg = (uint8_t)(cg * alpha + bg2 * (1.0f - alpha));
    uint8_t rb = (uint8_t)(cb * alpha + bb * (1.0f - alpha));
    return HWUI_RGB(rr, gg, rb);
}

/* ── Parse Init Buffer ─────────────────────────────────────────────────── */

static void parse_init_data(const uint8_t *data, int len) {
    if (len < 5) return;

    int pos = 0;
    g_param_count = data[pos++];
    if (g_param_count > VB_MAX_PARAMS) g_param_count = VB_MAX_PARAMS;

    /* Accent color */
    uint8_t r = data[pos++], g = data[pos++], b = data[pos++];
    g_accent_color = HWUI_RGB(r, g, b);

    /* Synth name */
    int name_len = data[pos++];
    if (name_len > 63) name_len = 63;
    if (pos + name_len > len) return;
    memcpy(g_synth_name, data + pos, name_len);
    g_synth_name[name_len] = '\0';
    pos += name_len;

    /* Subtitle (skip — VSTBridge does not use subtitle bar, but must consume it) */
    if (pos < len) {
        int sub_len = data[pos++];
        if (pos + sub_len <= len) pos += sub_len;
    }

    /* Parse parameters */
    g_group_count = 0;
    for (int i = 0; i < g_param_count && pos < len; i++) {
        Param *p = &g_params[i];
        memset(p, 0, sizeof(Param));

        p->type = data[pos++];

        /* Label */
        int ll = data[pos++];
        if (ll > 31) ll = 31;
        if (pos + ll > len) break;
        memcpy(p->label, data + pos, ll);
        p->label[ll] = '\0';
        pos += ll;

        /* Group */
        int gl = data[pos++];
        if (gl > 31) gl = 31;
        if (pos + gl > len) break;
        memcpy(p->group, data + pos, gl);
        p->group[gl] = '\0';
        pos += gl;

        /* min, max, step, value (4 floats = 16 bytes) */
        if (pos + 16 > len) break;
        p->min_val = read_f32_le(data + pos); pos += 4;
        p->max_val = read_f32_le(data + pos); pos += 4;
        p->step    = read_f32_le(data + pos); pos += 4;
        p->value   = read_f32_le(data + pos); pos += 4;

        /* Option count */
        if (pos >= len) break;
        p->option_count = data[pos++];
        if (p->option_count > VB_MAX_OPTIONS) p->option_count = VB_MAX_OPTIONS;

        /* Parse options */
        for (int j = 0; j < p->option_count && pos < len; j++) {
            if (pos + 4 > len) break;
            p->options[j].value = read_f32_le(data + pos); pos += 4;

            if (pos >= len) break;
            int ol = data[pos++];
            if (ol > 31) ol = 31;
            if (pos + ol > len) break;
            memcpy(p->options[j].label, data + pos, ol);
            p->options[j].label[ol] = '\0';
            p->options[j].label_len = ol;
            pos += ol;
        }

        /* Resolve group index */
        int gi = -1;
        for (int g2 = 0; g2 < g_group_count; g2++) {
            if (strcmp(g_groups[g2].name, p->group) == 0) {
                gi = g2;
                break;
            }
        }
        if (gi < 0 && g_group_count < VB_MAX_GROUPS) {
            gi = g_group_count++;
            memset(&g_groups[gi], 0, sizeof(Group));
            strncpy(g_groups[gi].name, p->group, 31);
            g_groups[gi].first_param = i;
            g_groups[gi].param_count = 0;
        }
        p->group_index = gi;
        if (gi >= 0) {
            g_groups[gi].param_count++;
        }
    }
}

/* ── Layout Computation ────────────────────────────────────────────────── */

static void compute_layout(void) {
    int cur_x = GROUP_PAD;
    int cur_y = HEADER_H + GROUP_PAD;
    int col = 0;
    int max_cols = 2;  /* Groups per row */

    for (int gi = 0; gi < g_group_count; gi++) {
        Group *grp = &g_groups[gi];

        /* Count param types for sizing */
        int knob_count = 0, select_count = 0, toggle_count = 0;
        for (int i = 0; i < g_param_count; i++) {
            if (g_params[i].group_index == gi) {
                switch (g_params[i].type) {
                    case 0: knob_count++;   break;
                    case 1: select_count++; break;
                    case 2: toggle_count++; break;
                }
            }
        }

        /* Calculate group box dimensions */
        int knobs_per_row = 3;
        int knob_rows = (knob_count + knobs_per_row - 1) / knobs_per_row;

        int content_h = 0;
        content_h += knob_rows * KNOB_CELL_H;
        content_h += select_count * (SELECT_H + 4);
        content_h += toggle_count * (TOGGLE_H + 4);

        int grp_w = (SCREEN_W - GROUP_PAD * 3) / max_cols;
        int grp_h = HWUI_FONT_H + 8 + GROUP_INNER * 2 + content_h;
        if (grp_h < 36) grp_h = 36;

        grp->x = cur_x;
        grp->y = cur_y;
        grp->w = grp_w;
        grp->h = grp_h;

        col++;
        if (col >= max_cols) {
            col = 0;
            cur_x = GROUP_PAD;
            cur_y += grp_h + GROUP_PAD;
        } else {
            cur_x += grp_w + GROUP_PAD;
        }
    }

    /* Track total content height */
    if (g_group_count > 0) {
        int last_gi = g_group_count - 1;
        int last_bottom = g_groups[last_gi].y + g_groups[last_gi].h + GROUP_PAD;
        /* If last row had two columns, the one before might be taller */
        if (col > 0 && last_gi > 0) {
            int prev_bottom = g_groups[last_gi - 1].y + g_groups[last_gi - 1].h + GROUP_PAD;
            if (prev_bottom > last_bottom) last_bottom = prev_bottom;
        }
        g_content_height = last_bottom;
    } else {
        g_content_height = HEADER_H + GROUP_PAD;
    }
}

/* ── Rendering: Modern Group Box ───────────────────────────────────────── */

static void draw_modern_group_box(int x, int y, int w, int h,
                                  const char *label) {
    /* Dark panel background */
    hwui_rect(g_fb, SCREEN_W, x, y, w, h, VB_PANEL_BG);

    /* 1px border with accent color at reduced alpha */
    uint32_t border_col = blend_color(g_accent_color, VB_PANEL_BG, 0.35f);
    hwui_rect_outline(g_fb, SCREEN_W, x, y, w, h, border_col);

    /* Header strip at top of group with accent tint */
    uint32_t header_bg = blend_color(g_accent_color, VB_PANEL_BG, 0.15f);
    hwui_rect(g_fb, SCREEN_W, x + 1, y + 1, w - 2, HWUI_FONT_H + 6, header_bg);

    /* Separator line below header */
    hwui_hline(g_fb, SCREEN_W, x + 1, y + HWUI_FONT_H + 7, w - 2, border_col);

    /* Label text */
    if (label) {
        hwui_text(g_fb, SCREEN_W, x + 6, y + 4, label, g_accent_color);
    }
}

/* ── Rendering ─────────────────────────────────────────────────────────── */

static void render(void) {
    /* Clear to dark background */
    for (int i = 0; i < SCREEN_W * SCREEN_H; i++)
        g_fb[i] = VB_BG_COLOR;

    hwui_frame_begin(g_mouse_x, g_mouse_y + g_scroll_y, g_mouse_down);

    /* Header bar with gradient */
    for (int row = 0; row < HEADER_H; row++) {
        float t = (float)row / (float)HEADER_H;
        uint32_t c = darken_color(g_accent_color, 0.5f + 0.3f * (1.0f - t));
        hwui_hline(g_fb, SCREEN_W, 0, row, SCREEN_W, c);
    }

    /* Accent stripe at bottom of header */
    hwui_hline(g_fb, SCREEN_W, 0, HEADER_H - 1, SCREEN_W, g_accent_color);

    /* Synth name centered in header */
    hwui_text_centered(g_fb, SCREEN_W, 0, 0, SCREEN_W, HEADER_H - 1,
                       g_synth_name, HWUI_WHITE);

    /* Render groups and their parameters */
    for (int gi = 0; gi < g_group_count; gi++) {
        Group *grp = &g_groups[gi];
        int gy = grp->y - g_scroll_y;

        /* Skip if completely off-screen */
        if (gy + grp->h < HEADER_H || gy > SCREEN_H) continue;

        /* Modern group box */
        draw_modern_group_box(grp->x, gy, grp->w, grp->h, grp->name);

        /* Render params within this group */
        int inner_x = grp->x + GROUP_INNER;
        int inner_y = gy + HWUI_FONT_H + 10 + GROUP_INNER;
        int inner_w = grp->w - GROUP_INNER * 2;

        int knob_col = 0;
        int knobs_per_row = 3;
        int knob_x_start = inner_x;
        int cur_ky = inner_y;

        for (int pi = 0; pi < g_param_count; pi++) {
            Param *p = &g_params[pi];
            if (p->group_index != gi) continue;

            switch (p->type) {
            case 0: { /* Knob */
                int kx = knob_x_start + knob_col * KNOB_CELL_W;
                float new_val = p->value;
                int changed = hwui_knob(g_fb, SCREEN_W,
                    kx + (KNOB_CELL_W - KNOB_R * 2) / 2, cur_ky,
                    KNOB_R, p->value, p->min_val, p->max_val, p->label,
                    g_accent_color, g_mouse_x, g_mouse_y + g_scroll_y,
                    g_mouse_down, &new_val);

                if (changed) {
                    /* Apply step rounding */
                    if (p->step > 0) {
                        new_val = p->min_val + roundf((new_val - p->min_val) / p->step) * p->step;
                        if (new_val > p->max_val) new_val = p->max_val;
                        if (new_val < p->min_val) new_val = p->min_val;
                    }
                    p->value = new_val;
                    js_on_param_change(pi, new_val);
                    g_dirty = 1;
                }

                knob_col++;
                if (knob_col >= knobs_per_row) {
                    knob_col = 0;
                    cur_ky += KNOB_CELL_H;
                }
                break;
            }

            case 1: { /* Select / Dropdown */
                /* Finish any pending knob row */
                if (knob_col > 0) {
                    knob_col = 0;
                    cur_ky += KNOB_CELL_H;
                }

                /* Draw label */
                hwui_text(g_fb, SCREEN_W, inner_x, cur_ky + 2, p->label, HWUI_GRAY_LIGHT);

                /* Build option label array */
                const char *opt_labels[VB_MAX_OPTIONS];
                for (int j = 0; j < p->option_count; j++) {
                    opt_labels[j] = p->options[j].label;
                }

                /* Find current selected index */
                int sel_idx = 0;
                for (int j = 0; j < p->option_count; j++) {
                    if (fabsf(p->value - p->options[j].value) < 0.001f) {
                        sel_idx = j;
                        break;
                    }
                }

                int new_sel = sel_idx;
                int dropdown_x = inner_x + hwui_text_width(p->label) + 8;
                int dropdown_w = inner_w - (dropdown_x - inner_x);
                if (dropdown_w < 60) dropdown_w = 60;

                int changed = hwui_dropdown(g_fb, SCREEN_W,
                    dropdown_x, cur_ky, dropdown_w,
                    opt_labels, p->option_count, sel_idx,
                    g_mouse_x, g_mouse_y + g_scroll_y, g_mouse_down,
                    &new_sel);

                if (changed && new_sel >= 0 && new_sel < p->option_count) {
                    p->value = p->options[new_sel].value;
                    js_on_param_change(pi, p->value);
                    g_dirty = 1;
                }

                cur_ky += SELECT_H + 4;
                break;
            }

            case 2: { /* Toggle / Checkbox */
                /* Finish any pending knob row */
                if (knob_col > 0) {
                    knob_col = 0;
                    cur_ky += KNOB_CELL_H;
                }

                int checked = (p->value >= 0.5f) ? 1 : 0;
                int toggled = hwui_checkbox(g_fb, SCREEN_W,
                    inner_x, cur_ky, p->label, checked,
                    g_mouse_x, g_mouse_y + g_scroll_y, g_mouse_down);

                if (toggled) {
                    p->value = checked ? 0.0f : 1.0f;
                    js_on_param_change(pi, p->value);
                    g_dirty = 1;
                }

                cur_ky += TOGGLE_H + 4;
                break;
            }
            } /* switch */
        }
    }

    /* Scrollbar if content exceeds screen */
    if (g_content_height > SCREEN_H) {
        int view_h = SCREEN_H - HEADER_H;
        int new_scroll = g_scroll_y;
        hwui_scrollbar_v(g_fb, SCREEN_W, SCREEN_W - 10, HEADER_H,
                         10, view_h, g_content_height, view_h, g_scroll_y,
                         g_mouse_x, g_mouse_y, g_mouse_down, &new_scroll);
        if (new_scroll != g_scroll_y) {
            g_scroll_y = new_scroll;
            g_dirty = 1;
        }
    }

    hwui_frame_end();

    /* Push to SDL texture */
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

    case SDL_MOUSEWHEEL:
        if (g_content_height > SCREEN_H) {
            g_scroll_y -= e->wheel.y * 24;
            if (g_scroll_y < 0) g_scroll_y = 0;
            int max_scroll = g_content_height - SCREEN_H + HEADER_H;
            if (max_scroll < 0) max_scroll = 0;
            if (g_scroll_y > max_scroll) g_scroll_y = max_scroll;
            g_dirty = 1;
        }
        break;

    default:
        break;
    }
}

/* ── Main Loop Tick ────────────────────────────────────────────────────── */

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

void vstbridge_generic_init_with_data(const uint8_t *init_buf, int init_len,
                                      int w, int h) {
    (void)w; (void)h; /* Canvas size is fixed at 640x400 */

    SDL_Init(SDL_INIT_VIDEO);

    g_win = SDL_CreateWindow("VSTBridge Generic Hardware UI",
        SDL_WINDOWPOS_UNDEFINED, SDL_WINDOWPOS_UNDEFINED,
        SCREEN_W, SCREEN_H, 0);
    g_ren = SDL_CreateRenderer(g_win, -1, SDL_RENDERER_SOFTWARE);
    g_tex = SDL_CreateTexture(g_ren, SDL_PIXELFORMAT_ARGB8888,
        SDL_TEXTUREACCESS_STREAMING, SCREEN_W, SCREEN_H);

    memset(g_fb, 0, sizeof(g_fb));
    hwui_set_fb_size(SCREEN_W, SCREEN_H);
    hwui_reset_state();

    /* Parse the metadata buffer */
    parse_init_data(init_buf, init_len);
    compute_layout();

    g_dirty = 1;
}

void vstbridge_generic_start(void) {
    emscripten_set_main_loop(tick, 60, 0);
}

void vstbridge_generic_shutdown(void) {
    emscripten_cancel_main_loop();
    if (g_tex) SDL_DestroyTexture(g_tex);
    if (g_ren) SDL_DestroyRenderer(g_ren);
    if (g_win) SDL_DestroyWindow(g_win);
    g_tex = NULL;
    g_ren = NULL;
    g_win = NULL;
}

void vstbridge_generic_load_config(const uint8_t *buf, int len) {
    int count = len / 4;
    if (count > g_param_count) count = g_param_count;
    for (int i = 0; i < count; i++) {
        g_params[i].value = read_f32_le(buf + i * 4);
    }
    g_dirty = 1;
}

int vstbridge_generic_dump_config(uint8_t *buf, int max_len) {
    int count = g_param_count;
    if (count * 4 > max_len) count = max_len / 4;
    for (int i = 0; i < count; i++) {
        write_f32_le(buf + i * 4, g_params[i].value);
    }
    return count * 4;
}
