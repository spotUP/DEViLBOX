/*
 * pt2_sampled.c — ProTracker 2 Sample Editor (WASM Canvas 2D)
 *
 * Standalone C module that renders the classic PT2 sampler screen.
 * Waveform display with min/max peak detection, loop markers,
 * volume/finetune editing, and zoom/scroll navigation.
 *
 * No SDL dependency — renders to a uint32_t framebuffer and pushes
 * to canvas via EM_JS putImageData. Events forwarded from React.
 *
 * Bitmap font derived from pt2-clone (8bitbubsy).
 * Palette: classic Amiga Workbench blue/gray/black.
 */

#include <emscripten.h>
#include <emscripten/html5.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <math.h>

#include "pt2_sampled.h"
#include "hwui_common.h"

/* ── JS callbacks ──────────────────────────────────────────────── */

EM_JS(void, js_on_param_change, (int param_id, int value), {
    if (Module.onParamChange) Module.onParamChange(param_id, value);
});

EM_JS(void, js_on_loop_change, (int loop_start_hi, int loop_start_lo,
                                 int loop_length_hi, int loop_length_lo,
                                 int loop_type), {
    if (Module.onLoopChange) Module.onLoopChange(
        (loop_start_hi << 16) | (loop_start_lo & 0xFFFF),
        (loop_length_hi << 16) | (loop_length_lo & 0xFFFF),
        loop_type);
});

/* ── Direct canvas rendering (bypasses SDL renderer) ──────────── */

/* No EM_JS rendering — React side handles canvas blitting */

/* ── Colours (classic PT2/Amiga Workbench style) ───────────────── */

#define COL_BG          0xFF000000  /* Black background */
#define COL_PANEL       0xFFBBBBBB  /* Light gray panels */
#define COL_PANEL_DK    0xFF888888  /* Darker panel shade */
#define COL_TEXT         0xFF000000  /* Black text on gray */
#define COL_TEXT_BRIGHT 0xFFFFFFFF  /* White text on dark */
#define COL_CURSOR      0xFF4444FF  /* Blue cursor/selection */
#define COL_WAVEFORM    0xFF44BB44  /* Green waveform */
#define COL_LOOP_MARK   0xFFFF4444  /* Red loop markers */
#define COL_CENTER_LINE 0xFF333333  /* Waveform center line */
#define COL_WAVE_BG     0xFF111111  /* Waveform area background */
#define COL_BTN_FACE    0xFFAAAAAA  /* Button face */
#define COL_BTN_HI      0xFFDDDDDD  /* Button highlight */
#define COL_BTN_SH      0xFF666666  /* Button shadow */
#define COL_SELECTION   0x6644AAFF  /* Selection overlay (alpha) */

/* ── Layout constants ──────────────────────────────────────────── */

#define SCREEN_W  320
#define SCREEN_H  255

/* Waveform display area */
#define WAVE_X      3
#define WAVE_Y      100
#define WAVE_W      314
#define WAVE_H      128
#define WAVE_CY     (WAVE_Y + WAVE_H / 2)  /* center Y */

/* Parameter display area */
#define PARAM_Y     26
#define PARAM_X     8

/* Button area */
#define BTN_ROW1_Y  58
#define BTN_ROW2_Y  72
#define BTN_ROW3_Y  86
#define BTN_H       12
#define BTN_PAD     2

/* Scrollbar */
#define SCROLL_Y    232
#define SCROLL_H    10
#define SCROLL_X    WAVE_X
#define SCROLL_W    WAVE_W

/* ── State ─────────────────────────────────────────────────────── */

static uint32_t      g_fb[SCREEN_W * SCREEN_H];  /* framebuffer */

/* PCM sample data (signed 8-bit) */
static int8_t  *g_pcm  = NULL;
static int      g_pcm_len = 0;

/* Parameters */
static int g_volume    = 64;
static int g_finetune  = 0;   /* 0-15, displayed as -8..+7 */
static int g_loop_start  = 0; /* sample frames */
static int g_loop_length = 0;
static int g_loop_type   = 0; /* 0=off, 1=forward */

/* View state */
static int g_view_start = 0;   /* first visible sample frame */
static int g_view_size  = 0;   /* how many samples visible in waveform area */
static int g_zoom_level = 0;   /* 0 = show all */

/* Mouse interaction */
static int g_mouse_x = 0, g_mouse_y = 0;
static int g_mouse_down = 0;
static int g_dragging_loop_start = 0;
static int g_dragging_loop_end   = 0;
static int g_dragging_scroll     = 0;
static int g_scroll_drag_offset  = 0;

/* Selection range */
static int g_sel_start = -1, g_sel_end = -1;

/* Dirty flag for rendering */
static int g_dirty = 1;

/* ── Helpers — thin macros bridging to hwui_common ─────────────── */

#define fb_pixel(x, y, col)                     hwui_pixel(g_fb, SCREEN_W, (x), (y), (col))
#define fb_rect(x, y, w, h, col)                hwui_rect(g_fb, SCREEN_W, (x), (y), (w), (h), (col))
#define fb_hline(x, y, w, col)                  hwui_hline(g_fb, SCREEN_W, (x), (y), (w), (col))
#define fb_vline(x, y, h, col)                  hwui_vline(g_fb, SCREEN_W, (x), (y), (h), (col))
#define fb_char(px, py, ch, col)                hwui_char(g_fb, SCREEN_W, (px), (py), (ch), (col))
#define fb_text(x, y, s, col)                   hwui_text(g_fb, SCREEN_W, (x), (y), (s), (col))
#define fb_text_centered(rx, ry, rw, rh, s, col) hwui_text_centered(g_fb, SCREEN_W, (rx), (ry), (rw), (rh), (s), (col))

/* Format a number as 4-digit hex */
static void hex4(char *buf, int val) {
    const char *hex = "0123456789ABCDEF";
    buf[0] = hex[(val >> 12) & 0xF];
    buf[1] = hex[(val >>  8) & 0xF];
    buf[2] = hex[(val >>  4) & 0xF];
    buf[3] = hex[val & 0xF];
    buf[4] = 0;
}

/* Format a number as 2-digit hex */
static void hex2(char *buf, int val) {
    const char *hex = "0123456789ABCDEF";
    buf[0] = hex[(val >> 4) & 0xF];
    buf[1] = hex[val & 0xF];
    buf[2] = 0;
}

/* Draw a 3D button */
static void fb_button(int x, int y, int w, int h, const char *label, int pressed) {
    uint32_t face = pressed ? COL_BTN_SH : COL_BTN_FACE;
    uint32_t hi   = pressed ? COL_BTN_SH : COL_BTN_HI;
    uint32_t sh   = pressed ? COL_BTN_HI : COL_BTN_SH;

    fb_rect(x, y, w, h, face);
    fb_hline(x, y, w, hi);          /* top highlight */
    fb_vline(x, y, h, hi);          /* left highlight */
    fb_hline(x, y + h - 1, w, sh);  /* bottom shadow */
    fb_vline(x + w - 1, y, h, sh);  /* right shadow */

    fb_text_centered(x, y, w, h, label, COL_TEXT);
}

/* ── Button definitions ────────────────────────────────────────── */

typedef struct {
    int x, y, w, h;
    const char *label;
    void (*action)(void);
} Button;

static void btn_show_all(void);
static void btn_zoom_in(void);
static void btn_zoom_out(void);
static void btn_vol_up(void);
static void btn_vol_down(void);
static void btn_fine_up(void);
static void btn_fine_down(void);

static Button g_buttons[] = {
    {   8, BTN_ROW1_Y, 64, BTN_H, "SHOW ALL",  btn_show_all },
    {  76, BTN_ROW1_Y, 52, BTN_H, "ZOOM IN",   btn_zoom_in  },
    { 132, BTN_ROW1_Y, 56, BTN_H, "ZOOM OUT",  btn_zoom_out },
    /* Volume +/- */
    { 200, BTN_ROW1_Y, 24, BTN_H, "V+", btn_vol_up   },
    { 228, BTN_ROW1_Y, 24, BTN_H, "V-", btn_vol_down },
    /* Finetune +/- */
    { 260, BTN_ROW1_Y, 24, BTN_H, "F+", btn_fine_up   },
    { 288, BTN_ROW1_Y, 24, BTN_H, "F-", btn_fine_down },
};
#define NUM_BUTTONS (sizeof(g_buttons) / sizeof(g_buttons[0]))

/* ── Button actions ────────────────────────────────────────────── */

static void btn_show_all(void) {
    g_view_start = 0;
    g_view_size = g_pcm_len > 0 ? g_pcm_len : 1;
    g_zoom_level = 0;
    g_dirty = 1;
}

static void btn_zoom_in(void) {
    if (g_pcm_len <= 0) return;
    int new_size = g_view_size / 2;
    if (new_size < WAVE_W) new_size = WAVE_W;
    int center = g_view_start + g_view_size / 2;
    g_view_start = center - new_size / 2;
    if (g_view_start < 0) g_view_start = 0;
    g_view_size = new_size;
    if (g_view_start + g_view_size > g_pcm_len)
        g_view_start = g_pcm_len - g_view_size;
    if (g_view_start < 0) g_view_start = 0;
    g_zoom_level++;
    g_dirty = 1;
}

static void btn_zoom_out(void) {
    if (g_pcm_len <= 0) return;
    int new_size = g_view_size * 2;
    if (new_size > g_pcm_len) new_size = g_pcm_len;
    int center = g_view_start + g_view_size / 2;
    g_view_start = center - new_size / 2;
    if (g_view_start < 0) g_view_start = 0;
    g_view_size = new_size;
    if (g_view_start + g_view_size > g_pcm_len)
        g_view_start = g_pcm_len - g_view_size;
    if (g_view_start < 0) g_view_start = 0;
    if (g_zoom_level > 0) g_zoom_level--;
    g_dirty = 1;
}

static void btn_vol_up(void) {
    if (g_volume < 64) {
        g_volume++;
        js_on_param_change(PT2_VOLUME, g_volume);
        g_dirty = 1;
    }
}

static void btn_vol_down(void) {
    if (g_volume > 0) {
        g_volume--;
        js_on_param_change(PT2_VOLUME, g_volume);
        g_dirty = 1;
    }
}

static void btn_fine_up(void) {
    if (g_finetune < 15) {
        g_finetune++;
        js_on_param_change(PT2_FINETUNE, g_finetune);
        g_dirty = 1;
    }
}

static void btn_fine_down(void) {
    if (g_finetune > 0) {
        g_finetune--;
        js_on_param_change(PT2_FINETUNE, g_finetune);
        g_dirty = 1;
    }
}

/* ── Sample-to-screen coordinate mapping ───────────────────────── */

static int sample_to_screen_x(int sample_pos) {
    if (g_view_size <= 0) return WAVE_X;
    return WAVE_X + (int)(((double)(sample_pos - g_view_start) / g_view_size) * WAVE_W);
}

static int screen_x_to_sample(int sx) {
    if (g_view_size <= 0) return 0;
    double frac = (double)(sx - WAVE_X) / WAVE_W;
    int sample = g_view_start + (int)(frac * g_view_size);
    if (sample < 0) sample = 0;
    if (sample >= g_pcm_len) sample = g_pcm_len - 1;
    return sample;
}

/* ── Waveform rendering (min/max peak detection) ───────────────── */

static void render_waveform(void) {
    /* Clear waveform area */
    fb_rect(WAVE_X, WAVE_Y, WAVE_W, WAVE_H, COL_WAVE_BG);

    /* Center line */
    fb_hline(WAVE_X, WAVE_CY, WAVE_W, COL_CENTER_LINE);

    if (!g_pcm || g_pcm_len <= 0) return;

    /* Per-column min/max peak detection */
    for (int col = 0; col < WAVE_W; col++) {
        int s0 = g_view_start + (int)((double)col / WAVE_W * g_view_size);
        int s1 = g_view_start + (int)((double)(col + 1) / WAVE_W * g_view_size);
        if (s0 < 0) s0 = 0;
        if (s1 < 0) s1 = 0;
        if (s0 >= g_pcm_len) s0 = g_pcm_len - 1;
        if (s1 >= g_pcm_len) s1 = g_pcm_len - 1;
        if (s1 <= s0) s1 = s0 + 1;

        int vmin = 127, vmax = -128;
        for (int i = s0; i < s1 && i < g_pcm_len; i++) {
            int v = g_pcm[i];
            if (v < vmin) vmin = v;
            if (v > vmax) vmax = v;
        }

        /* Map -128..127 to waveform area */
        int y_max = WAVE_CY - (int)((double)vmax / 128.0 * (WAVE_H / 2));
        int y_min = WAVE_CY - (int)((double)vmin / 128.0 * (WAVE_H / 2));

        /* Clamp */
        if (y_max < WAVE_Y) y_max = WAVE_Y;
        if (y_min >= WAVE_Y + WAVE_H) y_min = WAVE_Y + WAVE_H - 1;
        if (y_max > y_min) { int t = y_max; y_max = y_min; y_min = t; }

        /* Draw vertical line for this column */
        for (int y = y_max; y <= y_min; y++)
            fb_pixel(WAVE_X + col, y, COL_WAVEFORM);
    }

    /* Loop markers */
    if (g_loop_type > 0 && g_loop_length > 0) {
        int lx_start = sample_to_screen_x(g_loop_start);
        int lx_end   = sample_to_screen_x(g_loop_start + g_loop_length);

        if (lx_start >= WAVE_X && lx_start < WAVE_X + WAVE_W)
            fb_vline(lx_start, WAVE_Y, WAVE_H, COL_LOOP_MARK);
        if (lx_end >= WAVE_X && lx_end < WAVE_X + WAVE_W)
            fb_vline(lx_end, WAVE_Y, WAVE_H, COL_LOOP_MARK);

        /* Shade loop region slightly */
        int x0 = lx_start < WAVE_X ? WAVE_X : lx_start;
        int x1 = lx_end >= WAVE_X + WAVE_W ? WAVE_X + WAVE_W - 1 : lx_end;
        for (int x = x0; x <= x1; x++) {
            /* Just brighten the top and bottom rows as markers */
            fb_pixel(x, WAVE_Y, COL_LOOP_MARK);
            fb_pixel(x, WAVE_Y + WAVE_H - 1, COL_LOOP_MARK);
        }
    }

    /* Selection overlay */
    if (g_sel_start >= 0 && g_sel_end >= 0 && g_sel_start != g_sel_end) {
        int sx0 = sample_to_screen_x(g_sel_start < g_sel_end ? g_sel_start : g_sel_end);
        int sx1 = sample_to_screen_x(g_sel_start < g_sel_end ? g_sel_end : g_sel_start);
        if (sx0 < WAVE_X) sx0 = WAVE_X;
        if (sx1 >= WAVE_X + WAVE_W) sx1 = WAVE_X + WAVE_W - 1;
        for (int x = sx0; x <= sx1; x++)
            for (int y = WAVE_Y; y < WAVE_Y + WAVE_H; y++) {
                /* Simple invert-ish highlight */
                uint32_t c = g_fb[y * SCREEN_W + x];
                g_fb[y * SCREEN_W + x] = c ^ 0x00444444;
            }
    }
}

/* ── Scrollbar rendering & interaction ─────────────────────────── */

static void render_scrollbar(void) {
    /* Track */
    fb_rect(SCROLL_X, SCROLL_Y, SCROLL_W, SCROLL_H, COL_PANEL_DK);

    if (g_pcm_len <= 0) return;

    /* Thumb */
    double frac_start = (double)g_view_start / g_pcm_len;
    double frac_size  = (double)g_view_size / g_pcm_len;
    int thumb_x = SCROLL_X + (int)(frac_start * SCROLL_W);
    int thumb_w = (int)(frac_size * SCROLL_W);
    if (thumb_w < 8) thumb_w = 8;
    if (thumb_x + thumb_w > SCROLL_X + SCROLL_W)
        thumb_x = SCROLL_X + SCROLL_W - thumb_w;

    fb_rect(thumb_x, SCROLL_Y, thumb_w, SCROLL_H, COL_PANEL);
    fb_hline(thumb_x, SCROLL_Y, thumb_w, COL_BTN_HI);
    fb_hline(thumb_x, SCROLL_Y + SCROLL_H - 1, thumb_w, COL_BTN_SH);
}

/* ── Main render ───────────────────────────────────────────────── */

static void pt2_render(void) {
    /* Clear */
    for (int i = 0; i < SCREEN_W * SCREEN_H; i++)
        g_fb[i] = COL_BG;

    /* Title bar */
    fb_rect(0, 0, SCREEN_W, 14, COL_PANEL);
    fb_text_centered(0, 0, SCREEN_W, 14, "SAMPLE EDITOR", COL_TEXT);

    /* Separator */
    fb_hline(0, 14, SCREEN_W, COL_PANEL_DK);
    fb_hline(0, 15, SCREEN_W, COL_BTN_HI);

    /* Parameter panel background */
    fb_rect(0, 16, SCREEN_W, 40, COL_PANEL);

    /* Volume display */
    {
        char buf[32];
        fb_text(PARAM_X, PARAM_Y, "VOL:", COL_TEXT);
        hex2(buf, g_volume);
        fb_text(PARAM_X + 25, PARAM_Y, buf, COL_TEXT);
    }

    /* Finetune display (show as signed: -8..+7) */
    {
        char buf[8];
        int signed_ft = (g_finetune > 7) ? g_finetune - 16 : g_finetune;
        if (signed_ft >= 0) {
            buf[0] = '+';
            buf[1] = '0' + signed_ft;
        } else {
            buf[0] = '-';
            buf[1] = '0' + (-signed_ft);
        }
        buf[2] = 0;
        fb_text(PARAM_X + 60, PARAM_Y, "FINE:", COL_TEXT);
        fb_text(PARAM_X + 90, PARAM_Y, buf, COL_TEXT);
    }

    /* Length display */
    {
        char buf[8];
        fb_text(PARAM_X + 120, PARAM_Y, "LEN:", COL_TEXT);
        hex4(buf, g_pcm_len > 0xFFFF ? 0xFFFF : g_pcm_len);
        fb_text(PARAM_X + 148, PARAM_Y, buf, COL_TEXT);
    }

    /* Loop start / loop length */
    {
        char buf[8];
        fb_text(PARAM_X, PARAM_Y + 12, "RPT:", COL_TEXT);
        hex4(buf, g_loop_start > 0xFFFF ? 0xFFFF : g_loop_start);
        fb_text(PARAM_X + 25, PARAM_Y + 12, buf, COL_TEXT);

        fb_text(PARAM_X + 60, PARAM_Y + 12, "REPLEN:", COL_TEXT);
        hex4(buf, g_loop_length > 0xFFFF ? 0xFFFF : g_loop_length);
        fb_text(PARAM_X + 102, PARAM_Y + 12, buf, COL_TEXT);

        /* Loop type indicator */
        fb_text(PARAM_X + 140, PARAM_Y + 12,
                g_loop_type == 0 ? "LOOP:OFF" : "LOOP:FWD", COL_TEXT);
    }

    /* Separator */
    fb_hline(0, 55, SCREEN_W, COL_PANEL_DK);

    /* Buttons */
    for (int i = 0; i < (int)NUM_BUTTONS; i++) {
        Button *b = &g_buttons[i];
        fb_button(b->x, b->y, b->w, b->h, b->label, 0);
    }

    /* Waveform separator */
    fb_hline(0, WAVE_Y - 2, SCREEN_W, COL_PANEL_DK);
    fb_hline(0, WAVE_Y - 1, SCREEN_W, COL_BTN_HI);

    /* Waveform */
    render_waveform();

    /* Scrollbar */
    render_scrollbar();

    /* Bottom info line */
    fb_rect(0, SCROLL_Y + SCROLL_H + 2, SCREEN_W, 12, COL_PANEL);
    {
        char info[64];
        snprintf(info, sizeof(info), "VIEW: %d - %d  ZOOM: %d",
                 g_view_start, g_view_start + g_view_size, g_zoom_level);
        fb_text(PARAM_X, SCROLL_Y + SCROLL_H + 5, info, COL_TEXT);
    }

    /* Framebuffer is ready — React will blit it via pt2_sampled_get_fb */
}

/* ── Loop marker dragging ──────────────────────────────────────── */

static void fire_loop_change(void) {
    js_on_loop_change(
        (g_loop_start >> 16) & 0xFFFF,
        g_loop_start & 0xFFFF,
        (g_loop_length >> 16) & 0xFFFF,
        g_loop_length & 0xFFFF,
        g_loop_type
    );
}

static void handle_loop_marker_drag(int mx) {
    int sample_pos = screen_x_to_sample(mx);

    if (g_dragging_loop_start) {
        int end = g_loop_start + g_loop_length;
        g_loop_start = sample_pos;
        if (g_loop_start < 0) g_loop_start = 0;
        if (g_loop_start >= end) g_loop_start = end - 1;
        g_loop_length = end - g_loop_start;
        g_dirty = 1;
    } else if (g_dragging_loop_end) {
        int new_end = sample_pos;
        if (new_end <= g_loop_start) new_end = g_loop_start + 1;
        if (new_end > g_pcm_len) new_end = g_pcm_len;
        g_loop_length = new_end - g_loop_start;
        g_dirty = 1;
    }
}

/* ── Scrollbar dragging ────────────────────────────────────────── */

static void handle_scroll_drag(int mx) {
    if (g_pcm_len <= 0) return;
    double frac = (double)(mx - SCROLL_X - g_scroll_drag_offset) / SCROLL_W;
    g_view_start = (int)(frac * g_pcm_len);
    if (g_view_start < 0) g_view_start = 0;
    if (g_view_start + g_view_size > g_pcm_len)
        g_view_start = g_pcm_len - g_view_size;
    if (g_view_start < 0) g_view_start = 0;
    g_dirty = 1;
}

/* ── Input handling (exported, called from React) ─────────────── */

void pt2_sampled_on_mouse_down(int mx, int my) {
    g_mouse_x = mx;
    g_mouse_y = my;
    g_mouse_down = 1;

    /* Check buttons */
    for (int i = 0; i < (int)NUM_BUTTONS; i++) {
        Button *b = &g_buttons[i];
        if (mx >= b->x && mx < b->x + b->w &&
            my >= b->y && my < b->y + b->h) {
            if (b->action) b->action();
            return;
        }
    }

    /* Scrollbar */
    if (my >= SCROLL_Y && my < SCROLL_Y + SCROLL_H &&
        mx >= SCROLL_X && mx < SCROLL_X + SCROLL_W) {
        if (g_pcm_len > 0) {
            double frac_start = (double)g_view_start / g_pcm_len;
            int thumb_x = SCROLL_X + (int)(frac_start * SCROLL_W);
            g_scroll_drag_offset = mx - thumb_x;
            g_dragging_scroll = 1;
        }
        return;
    }

    /* Waveform area — check loop markers first */
    if (my >= WAVE_Y && my < WAVE_Y + WAVE_H &&
        mx >= WAVE_X && mx < WAVE_X + WAVE_W) {

        if (g_loop_type > 0 && g_loop_length > 0) {
            int lx_start = sample_to_screen_x(g_loop_start);
            int lx_end   = sample_to_screen_x(g_loop_start + g_loop_length);

            if (abs(mx - lx_start) <= 3) {
                g_dragging_loop_start = 1;
                return;
            }
            if (abs(mx - lx_end) <= 3) {
                g_dragging_loop_end = 1;
                return;
            }
        }

        /* Start selection */
        g_sel_start = screen_x_to_sample(mx);
        g_sel_end = g_sel_start;
        g_dirty = 1;
    }
}

void pt2_sampled_on_mouse_up(int mx, int my) {
    (void)mx; (void)my;
    if (g_dragging_loop_start || g_dragging_loop_end) {
        fire_loop_change();
    }
    g_mouse_down = 0;
    g_dragging_loop_start = 0;
    g_dragging_loop_end = 0;
    g_dragging_scroll = 0;
}

void pt2_sampled_on_mouse_move(int mx, int my) {
    g_mouse_x = mx;
    g_mouse_y = my;

    if (g_dragging_loop_start || g_dragging_loop_end) {
        handle_loop_marker_drag(mx);
    } else if (g_dragging_scroll) {
        handle_scroll_drag(mx);
    } else if (g_mouse_down &&
               g_mouse_y >= WAVE_Y && g_mouse_y < WAVE_Y + WAVE_H) {
        /* Extend selection */
        g_sel_end = screen_x_to_sample(mx);
        g_dirty = 1;
    }
}

void pt2_sampled_on_wheel(int delta_y, int mx, int my) {
    g_mouse_x = mx;
    g_mouse_y = my;

    /* Zoom with mouse wheel over waveform */
    if (my >= WAVE_Y && my < WAVE_Y + WAVE_H) {
        if (delta_y < 0) btn_zoom_in();
        else if (delta_y > 0) btn_zoom_out();
    }
    /* Volume with wheel on param area */
    if (my >= PARAM_Y && my < PARAM_Y + 10 &&
        mx >= PARAM_X && mx < PARAM_X + 50) {
        if (delta_y < 0) btn_vol_up();
        else if (delta_y > 0) btn_vol_down();
    }
}

/* key_code uses DOM KeyboardEvent.keyCode values */
#define KEY_HOME  36
#define KEY_END   35
#define KEY_LEFT  37
#define KEY_RIGHT 39

void pt2_sampled_on_key_down(int key_code) {
    switch (key_code) {
    case KEY_HOME:
        g_view_start = 0;
        g_dirty = 1;
        break;
    case KEY_END:
        g_view_start = g_pcm_len - g_view_size;
        if (g_view_start < 0) g_view_start = 0;
        g_dirty = 1;
        break;
    case KEY_LEFT:
        g_view_start -= g_view_size / 8;
        if (g_view_start < 0) g_view_start = 0;
        g_dirty = 1;
        break;
    case KEY_RIGHT:
        g_view_start += g_view_size / 8;
        if (g_view_start + g_view_size > g_pcm_len)
            g_view_start = g_pcm_len - g_view_size;
        if (g_view_start < 0) g_view_start = 0;
        g_dirty = 1;
        break;
    default:
        break;
    }
}

/* ── Render-on-demand (called from React rAF loop) ─────────────── */

uint32_t *pt2_sampled_get_fb(void) {
    if (g_dirty) {
        pt2_render();
        g_dirty = 0;
    }
    return g_fb;
}

/* ── Public API ────────────────────────────────────────────────── */

void pt2_sampled_init(int w, int h) {
    (void)w; (void)h;

    memset(g_fb, 0, sizeof(g_fb));
    hwui_set_fb_size(SCREEN_W, SCREEN_H);

    g_view_start = 0;
    g_view_size = 1;
    g_dirty = 1;
}

void pt2_sampled_start(void) {
    /* No-op — rendering is driven by React's rAF loop calling pt2_sampled_get_fb */
}

void pt2_sampled_shutdown(void) {
    if (g_pcm) { free(g_pcm); g_pcm = NULL; }
    g_pcm_len = 0;
}

void pt2_sampled_load_pcm(const int8_t *data, int length) {
    if (g_pcm) free(g_pcm);
    g_pcm = (int8_t *)malloc(length);
    if (!g_pcm) { g_pcm_len = 0; return; }
    memcpy(g_pcm, data, length);
    g_pcm_len = length;

    /* Reset view to show all */
    g_view_start = 0;
    g_view_size = length > 0 ? length : 1;
    g_zoom_level = 0;
    g_sel_start = -1;
    g_sel_end = -1;
    g_dirty = 1;
}

void pt2_sampled_set_param(int param_id, int value) {
    switch (param_id) {
    case PT2_VOLUME:
        g_volume = value;
        if (g_volume < 0) g_volume = 0;
        if (g_volume > 64) g_volume = 64;
        break;
    case PT2_FINETUNE:
        g_finetune = value & 0xF;
        break;
    case PT2_LOOP_START_HI:
        g_loop_start = (g_loop_start & 0xFFFF) | ((value & 0xFFFF) << 16);
        break;
    case PT2_LOOP_START_LO:
        g_loop_start = (g_loop_start & 0xFFFF0000) | (value & 0xFFFF);
        break;
    case PT2_LOOP_LENGTH_HI:
        g_loop_length = (g_loop_length & 0xFFFF) | ((value & 0xFFFF) << 16);
        break;
    case PT2_LOOP_LENGTH_LO:
        g_loop_length = (g_loop_length & 0xFFFF0000) | (value & 0xFFFF);
        break;
    case PT2_LOOP_TYPE:
        g_loop_type = value;
        break;
    default:
        break;
    }
    g_dirty = 1;
}

int pt2_sampled_get_param(int param_id) {
    switch (param_id) {
    case PT2_VOLUME:        return g_volume;
    case PT2_FINETUNE:      return g_finetune;
    case PT2_LOOP_START_HI: return (g_loop_start >> 16) & 0xFFFF;
    case PT2_LOOP_START_LO: return g_loop_start & 0xFFFF;
    case PT2_LOOP_LENGTH_HI: return (g_loop_length >> 16) & 0xFFFF;
    case PT2_LOOP_LENGTH_LO: return g_loop_length & 0xFFFF;
    case PT2_LOOP_TYPE:     return g_loop_type;
    default:                return 0;
    }
}

void pt2_sampled_load_config(const uint8_t *buf, int len) {
    if (len < 11) return;

    g_volume     = buf[0];
    g_finetune   = buf[1] & 0xF;
    g_loop_start = (uint32_t)buf[2] | ((uint32_t)buf[3] << 8) |
                   ((uint32_t)buf[4] << 16) | ((uint32_t)buf[5] << 24);
    g_loop_length = (uint32_t)buf[6] | ((uint32_t)buf[7] << 8) |
                    ((uint32_t)buf[8] << 16) | ((uint32_t)buf[9] << 24);
    g_loop_type  = buf[10];

    g_dirty = 1;
}

int pt2_sampled_dump_config(uint8_t *buf, int max_len) {
    if (max_len < 11) return 0;

    buf[0] = (uint8_t)g_volume;
    buf[1] = (uint8_t)(g_finetune & 0xF);
    buf[2] = (uint8_t)(g_loop_start & 0xFF);
    buf[3] = (uint8_t)((g_loop_start >> 8) & 0xFF);
    buf[4] = (uint8_t)((g_loop_start >> 16) & 0xFF);
    buf[5] = (uint8_t)((g_loop_start >> 24) & 0xFF);
    buf[6] = (uint8_t)(g_loop_length & 0xFF);
    buf[7] = (uint8_t)((g_loop_length >> 8) & 0xFF);
    buf[8] = (uint8_t)((g_loop_length >> 16) & 0xFF);
    buf[9] = (uint8_t)((g_loop_length >> 24) & 0xFF);
    buf[10] = (uint8_t)g_loop_type;

    return 11;
}
