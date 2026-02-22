/*
 * hwui_common.c — Shared Hardware UI primitives for SDL2/Emscripten modules
 *
 * Self-contained widget toolkit for retro-styled instrument editors.
 * No external font files needed — the 4x6 bitmap font is compiled in.
 *
 * Compile with: -O2 (no SDL flags needed — this file doesn't use SDL directly)
 */

#include "hwui_common.h"
#include <string.h>
#include <stdio.h>
#include <math.h>
#include <stdlib.h>

/* ── Embedded 4x6 Bitmap Font ──────────────────────────────────────────── */
/*
 * Minimal pixel font: 4 pixels wide x 6 pixels tall per glyph.
 * Covers ASCII 32-127 (96 glyphs). Stored as 6 bytes per glyph
 * (each byte = 1 row, lower 4 bits used, MSB = leftmost pixel).
 *
 * Derived from the pt2-clone bitmap font (8bitbubsy).
 */

static const uint8_t s_font[96][6] = {
    /* 32 ' ' */ {0x0,0x0,0x0,0x0,0x0,0x0},
    /* 33 '!' */ {0x4,0x4,0x4,0x0,0x4,0x0},
    /* 34 '"' */ {0xA,0xA,0x0,0x0,0x0,0x0},
    /* 35 '#' */ {0xA,0xF,0xA,0xF,0xA,0x0},
    /* 36 '$' */ {0x4,0xE,0x5,0xE,0xA,0x4},
    /* 37 '%' */ {0x9,0x2,0x4,0x8,0x9,0x0},
    /* 38 '&' */ {0x4,0xA,0x4,0xA,0x5,0x0},
    /* 39 ''' */ {0x4,0x4,0x0,0x0,0x0,0x0},
    /* 40 '(' */ {0x2,0x4,0x4,0x4,0x2,0x0},
    /* 41 ')' */ {0x4,0x2,0x2,0x2,0x4,0x0},
    /* 42 '*' */ {0x0,0xA,0x4,0xA,0x0,0x0},
    /* 43 '+' */ {0x0,0x4,0xE,0x4,0x0,0x0},
    /* 44 ',' */ {0x0,0x0,0x0,0x4,0x4,0x8},
    /* 45 '-' */ {0x0,0x0,0xE,0x0,0x0,0x0},
    /* 46 '.' */ {0x0,0x0,0x0,0x0,0x4,0x0},
    /* 47 '/' */ {0x1,0x2,0x4,0x8,0x0,0x0},
    /* 48 '0' */ {0x6,0x9,0x9,0x9,0x6,0x0},
    /* 49 '1' */ {0x4,0xC,0x4,0x4,0xE,0x0},
    /* 50 '2' */ {0x6,0x9,0x2,0x4,0xF,0x0},
    /* 51 '3' */ {0xE,0x1,0x6,0x1,0xE,0x0},
    /* 52 '4' */ {0x2,0x6,0xA,0xF,0x2,0x0},
    /* 53 '5' */ {0xF,0x8,0xE,0x1,0xE,0x0},
    /* 54 '6' */ {0x6,0x8,0xE,0x9,0x6,0x0},
    /* 55 '7' */ {0xF,0x1,0x2,0x4,0x4,0x0},
    /* 56 '8' */ {0x6,0x9,0x6,0x9,0x6,0x0},
    /* 57 '9' */ {0x6,0x9,0x7,0x1,0x6,0x0},
    /* 58 ':' */ {0x0,0x4,0x0,0x4,0x0,0x0},
    /* 59 ';' */ {0x0,0x4,0x0,0x4,0x8,0x0},
    /* 60 '<' */ {0x1,0x2,0x4,0x2,0x1,0x0},
    /* 61 '=' */ {0x0,0xE,0x0,0xE,0x0,0x0},
    /* 62 '>' */ {0x8,0x4,0x2,0x4,0x8,0x0},
    /* 63 '?' */ {0x6,0x9,0x2,0x0,0x2,0x0},
    /* 64 '@' */ {0x6,0x9,0xB,0x8,0x6,0x0},
    /* 65 'A' */ {0x6,0x9,0xF,0x9,0x9,0x0},
    /* 66 'B' */ {0xE,0x9,0xE,0x9,0xE,0x0},
    /* 67 'C' */ {0x6,0x9,0x8,0x9,0x6,0x0},
    /* 68 'D' */ {0xE,0x9,0x9,0x9,0xE,0x0},
    /* 69 'E' */ {0xF,0x8,0xE,0x8,0xF,0x0},
    /* 70 'F' */ {0xF,0x8,0xE,0x8,0x8,0x0},
    /* 71 'G' */ {0x6,0x8,0xB,0x9,0x6,0x0},
    /* 72 'H' */ {0x9,0x9,0xF,0x9,0x9,0x0},
    /* 73 'I' */ {0xE,0x4,0x4,0x4,0xE,0x0},
    /* 74 'J' */ {0x1,0x1,0x1,0x9,0x6,0x0},
    /* 75 'K' */ {0x9,0xA,0xC,0xA,0x9,0x0},
    /* 76 'L' */ {0x8,0x8,0x8,0x8,0xF,0x0},
    /* 77 'M' */ {0x9,0xF,0xF,0x9,0x9,0x0},
    /* 78 'N' */ {0x9,0xD,0xF,0xB,0x9,0x0},
    /* 79 'O' */ {0x6,0x9,0x9,0x9,0x6,0x0},
    /* 80 'P' */ {0xE,0x9,0xE,0x8,0x8,0x0},
    /* 81 'Q' */ {0x6,0x9,0x9,0xA,0x5,0x0},
    /* 82 'R' */ {0xE,0x9,0xE,0xA,0x9,0x0},
    /* 83 'S' */ {0x7,0x8,0x6,0x1,0xE,0x0},
    /* 84 'T' */ {0xE,0x4,0x4,0x4,0x4,0x0},
    /* 85 'U' */ {0x9,0x9,0x9,0x9,0x6,0x0},
    /* 86 'V' */ {0x9,0x9,0x9,0x6,0x6,0x0},
    /* 87 'W' */ {0x9,0x9,0xF,0xF,0x9,0x0},
    /* 88 'X' */ {0x9,0x6,0x6,0x6,0x9,0x0},
    /* 89 'Y' */ {0xA,0xA,0x4,0x4,0x4,0x0},
    /* 90 'Z' */ {0xF,0x2,0x4,0x8,0xF,0x0},
    /* 91 '[' */ {0x6,0x4,0x4,0x4,0x6,0x0},
    /* 92 '\' */ {0x8,0x4,0x2,0x1,0x0,0x0},
    /* 93 ']' */ {0x6,0x2,0x2,0x2,0x6,0x0},
    /* 94 '^' */ {0x4,0xA,0x0,0x0,0x0,0x0},
    /* 95 '_' */ {0x0,0x0,0x0,0x0,0xF,0x0},
    /* 96 '`' */ {0x4,0x2,0x0,0x0,0x0,0x0},
    /* 97 'a' */ {0x0,0x6,0xB,0x9,0x7,0x0},
    /* 98 'b' */ {0x8,0xE,0x9,0x9,0xE,0x0},
    /* 99 'c' */ {0x0,0x7,0x8,0x8,0x7,0x0},
    /*100 'd' */ {0x1,0x7,0x9,0x9,0x7,0x0},
    /*101 'e' */ {0x0,0x6,0xF,0x8,0x6,0x0},
    /*102 'f' */ {0x3,0x4,0xE,0x4,0x4,0x0},
    /*103 'g' */ {0x0,0x7,0x9,0x7,0x1,0x6},
    /*104 'h' */ {0x8,0xE,0x9,0x9,0x9,0x0},
    /*105 'i' */ {0x4,0x0,0x4,0x4,0x4,0x0},
    /*106 'j' */ {0x2,0x0,0x2,0x2,0xA,0x4},
    /*107 'k' */ {0x8,0xA,0xC,0xA,0x9,0x0},
    /*108 'l' */ {0xC,0x4,0x4,0x4,0xE,0x0},
    /*109 'm' */ {0x0,0xF,0xF,0x9,0x9,0x0},
    /*110 'n' */ {0x0,0xE,0x9,0x9,0x9,0x0},
    /*111 'o' */ {0x0,0x6,0x9,0x9,0x6,0x0},
    /*112 'p' */ {0x0,0xE,0x9,0xE,0x8,0x8},
    /*113 'q' */ {0x0,0x7,0x9,0x7,0x1,0x1},
    /*114 'r' */ {0x0,0xB,0xC,0x8,0x8,0x0},
    /*115 's' */ {0x0,0x7,0xC,0x3,0xE,0x0},
    /*116 't' */ {0x4,0xE,0x4,0x4,0x3,0x0},
    /*117 'u' */ {0x0,0x9,0x9,0x9,0x7,0x0},
    /*118 'v' */ {0x0,0x9,0x9,0x6,0x6,0x0},
    /*119 'w' */ {0x0,0x9,0xF,0xF,0x6,0x0},
    /*120 'x' */ {0x0,0x9,0x6,0x6,0x9,0x0},
    /*121 'y' */ {0x0,0x9,0x9,0x7,0x1,0x6},
    /*122 'z' */ {0x0,0xF,0x2,0x4,0xF,0x0},
    /*123 '{' */ {0x2,0x4,0xC,0x4,0x2,0x0},
    /*124 '|' */ {0x4,0x4,0x4,0x4,0x4,0x0},
    /*125 '}' */ {0x4,0x2,0x3,0x2,0x4,0x0},
    /*126 '~' */ {0x0,0x5,0xA,0x0,0x0,0x0},
    /*127 DEL */ {0xF,0xF,0xF,0xF,0xF,0x0},
};

/* ── Internal Widget State ─────────────────────────────────────────────── */

/* Track which widget is being actively dragged */
static int s_drag_id = -1;           /* Unique ID of widget being dragged */
static int s_drag_start_y = 0;       /* Y where drag started (for knobs) */
static float s_drag_start_value = 0; /* Value when drag started */

/* Per-frame mouse state */
static int s_mx = 0, s_my = 0, s_mdown = 0;
static int s_mdown_prev = 0;         /* Previous frame's mouse down state */
static int s_widget_id_counter = 0;  /* Auto-incrementing widget ID per frame */

/* ── Frame Management ──────────────────────────────────────────────────── */

void hwui_frame_begin(int mouse_x, int mouse_y, int mouse_down) {
    s_mx = mouse_x;
    s_my = mouse_y;
    s_mdown = mouse_down;
    s_widget_id_counter = 0;

    /* Release drag on mouse up */
    if (!s_mdown && s_mdown_prev) {
        s_drag_id = -1;
    }
}

void hwui_frame_end(void) {
    s_mdown_prev = s_mdown;
}

void hwui_reset_state(void) {
    s_drag_id = -1;
    s_drag_start_y = 0;
    s_drag_start_value = 0.0f;
    s_mx = s_my = s_mdown = s_mdown_prev = 0;
    s_widget_id_counter = 0;
}

/* ── Framebuffer Bounds ────────────────────────────────────────────────── */

static int s_fb_w = 4096;  /* Default large to not clip if not set */
static int s_fb_h = 4096;

void hwui_set_fb_size(int w, int h) {
    s_fb_w = w;
    s_fb_h = h;
}

/* ── Primitive Drawing ─────────────────────────────────────────────────── */

void hwui_pixel(uint32_t *fb, int stride, int x, int y, uint32_t col) {
    if (x >= 0 && x < s_fb_w && y >= 0 && y < s_fb_h)
        fb[y * stride + x] = col;
}

void hwui_pixel_safe(uint32_t *fb, int stride, int max_w, int max_h, int x, int y, uint32_t col) {
    if (x >= 0 && x < max_w && y >= 0 && y < max_h)
        fb[y * stride + x] = col;
}

void hwui_rect(uint32_t *fb, int stride, int x, int y, int w, int h, uint32_t col) {
    for (int row = y; row < y + h; row++)
        for (int cx = x; cx < x + w; cx++)
            if (cx >= 0 && cx < s_fb_w && row >= 0 && row < s_fb_h)
                fb[row * stride + cx] = col;
}

void hwui_rect_outline(uint32_t *fb, int stride, int x, int y, int w, int h, uint32_t col) {
    hwui_hline(fb, stride, x, y, w, col);
    hwui_hline(fb, stride, x, y + h - 1, w, col);
    hwui_vline(fb, stride, x, y, h, col);
    hwui_vline(fb, stride, x + w - 1, y, h, col);
}

void hwui_hline(uint32_t *fb, int stride, int x, int y, int w, uint32_t col) {
    if (y < 0 || y >= s_fb_h) return;
    for (int i = 0; i < w; i++)
        if (x + i >= 0 && x + i < s_fb_w)
            fb[y * stride + x + i] = col;
}

void hwui_vline(uint32_t *fb, int stride, int x, int y, int h, uint32_t col) {
    if (x < 0 || x >= s_fb_w) return;
    for (int i = 0; i < h; i++)
        if (y + i >= 0 && y + i < s_fb_h)
            fb[(y + i) * stride + x] = col;
}

void hwui_line(uint32_t *fb, int stride, int x0, int y0, int x1, int y1, uint32_t col) {
    int dx = abs(x1 - x0);
    int dy = -abs(y1 - y0);
    int sx = x0 < x1 ? 1 : -1;
    int sy = y0 < y1 ? 1 : -1;
    int err = dx + dy;

    for (;;) {
        hwui_pixel(fb, stride, x0, y0, col);
        if (x0 == x1 && y0 == y1) break;
        int e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
    }
}

/* ── Text Rendering ────────────────────────────────────────────────────── */

void hwui_char(uint32_t *fb, int stride, int px, int py, char ch, uint32_t col) {
    int idx = (int)ch - 32;
    if (idx < 0 || idx >= 96) return;
    const uint8_t *glyph = s_font[idx];
    for (int row = 0; row < HWUI_FONT_H; row++) {
        uint8_t bits = glyph[row];
        for (int cx = 0; cx < HWUI_FONT_W; cx++) {
            if (bits & (0x8 >> cx))
                hwui_pixel(fb, stride, px + cx, py + row, col);
        }
    }
}

int hwui_text(uint32_t *fb, int stride, int x, int y, const char *str, uint32_t col) {
    int cx = x;
    while (*str) {
        hwui_char(fb, stride, cx, y, *str, col);
        cx += HWUI_CHAR_W;
        str++;
    }
    return cx - x;
}

int hwui_text_width(const char *str) {
    int len = (int)strlen(str);
    if (len <= 0) return 0;
    return len * HWUI_CHAR_W - HWUI_FONT_SPACING;
}

void hwui_text_centered(uint32_t *fb, int stride, int rx, int ry, int rw, int rh,
                        const char *str, uint32_t col) {
    int tw = hwui_text_width(str);
    int tx = rx + (rw - tw) / 2;
    int ty = ry + (rh - HWUI_FONT_H) / 2;
    hwui_text(fb, stride, tx, ty, str, col);
}

void hwui_text_right(uint32_t *fb, int stride, int right_x, int y,
                     const char *str, uint32_t col) {
    int tw = hwui_text_width(str);
    hwui_text(fb, stride, right_x - tw, y, str, col);
}

/* ── Format Helpers ────────────────────────────────────────────────────── */

static char s_fmt_buf[32];

const char *hwui_fmt_int(int val) {
    snprintf(s_fmt_buf, sizeof(s_fmt_buf), "%d", val);
    return s_fmt_buf;
}

const char *hwui_fmt_float(float val, int decimals) {
    snprintf(s_fmt_buf, sizeof(s_fmt_buf), "%.*f", decimals, (double)val);
    return s_fmt_buf;
}

const char *hwui_fmt_hex2(int val) {
    static const char hex[] = "0123456789ABCDEF";
    s_fmt_buf[0] = hex[(val >> 4) & 0xF];
    s_fmt_buf[1] = hex[val & 0xF];
    s_fmt_buf[2] = 0;
    return s_fmt_buf;
}

const char *hwui_fmt_hex4(int val) {
    static const char hex[] = "0123456789ABCDEF";
    s_fmt_buf[0] = hex[(val >> 12) & 0xF];
    s_fmt_buf[1] = hex[(val >>  8) & 0xF];
    s_fmt_buf[2] = hex[(val >>  4) & 0xF];
    s_fmt_buf[3] = hex[val & 0xF];
    s_fmt_buf[4] = 0;
    return s_fmt_buf;
}

/* ── 3D Panel ──────────────────────────────────────────────────────────── */

void hwui_panel_3d(uint32_t *fb, int stride, int x, int y, int w, int h,
                   uint32_t face, uint32_t light, uint32_t shadow) {
    hwui_rect(fb, stride, x, y, w, h, face);
    hwui_hline(fb, stride, x, y, w, light);
    hwui_vline(fb, stride, x, y, h, light);
    hwui_hline(fb, stride, x, y + h - 1, w, shadow);
    hwui_vline(fb, stride, x + w - 1, y, h, shadow);
}

void hwui_panel_raised(uint32_t *fb, int stride, int x, int y, int w, int h) {
    hwui_panel_3d(fb, stride, x, y, w, h, HWUI_PANEL, HWUI_PANEL_HI, HWUI_PANEL_SH);
}

void hwui_panel_sunken(uint32_t *fb, int stride, int x, int y, int w, int h) {
    hwui_panel_3d(fb, stride, x, y, w, h, HWUI_GRAY_DARK, HWUI_PANEL_SH, HWUI_PANEL_HI);
}

/* ── Widget: Button ────────────────────────────────────────────────────── */

int hwui_button(uint32_t *fb, int stride, int x, int y, int w, int h,
                const char *label, int pressed,
                int mouse_x, int mouse_y, int mouse_down) {
    int hovered = (mouse_x >= x && mouse_x < x + w &&
                   mouse_y >= y && mouse_y < y + h);
    int active = pressed || (hovered && mouse_down);

    uint32_t face = active ? HWUI_PANEL_SH : HWUI_PANEL;
    uint32_t hi   = active ? HWUI_PANEL_SH : HWUI_PANEL_HI;
    uint32_t sh   = active ? HWUI_PANEL_HI : HWUI_PANEL_SH;

    hwui_panel_3d(fb, stride, x, y, w, h, face, hi, sh);

    /* Text offset when pressed */
    int tx_off = active ? 1 : 0;
    int ty_off = active ? 1 : 0;

    int tw = hwui_text_width(label);
    int tx = x + (w - tw) / 2 + tx_off;
    int ty = y + (h - HWUI_FONT_H) / 2 + ty_off;
    hwui_text(fb, stride, tx, ty, label, HWUI_BLACK);

    /* Click detection: hovered + mouse just released */
    return (hovered && !mouse_down && s_mdown_prev) ? 1 : 0;
}

/* ── Widget: Knob (Rotary Arc) ─────────────────────────────────────────── */

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

static float clampf(float v, float lo, float hi) {
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
}

int hwui_knob(uint32_t *fb, int stride, int x, int y, int radius,
              float value, float min, float max, const char *label, uint32_t color,
              int mouse_x, int mouse_y, int mouse_down, float *out_value) {

    int wid = ++s_widget_id_counter;
    int cx = x + radius;
    int cy = y + radius;
    int changed = 0;
    float range = max - min;
    if (range <= 0) range = 1.0f;

    /* Normalize value to 0..1 */
    float norm = (value - min) / range;
    if (norm < 0.0f) norm = 0.0f;
    if (norm > 1.0f) norm = 1.0f;

    /* Hit test for drag start */
    int dx = mouse_x - cx;
    int dy = mouse_y - cy;
    int in_knob = (dx * dx + dy * dy) <= (radius + 4) * (radius + 4);

    if (in_knob && mouse_down && !s_mdown_prev && s_drag_id < 0) {
        s_drag_id = wid;
        s_drag_start_y = mouse_y;
        s_drag_start_value = norm;
    }

    /* Handle drag */
    if (s_drag_id == wid && mouse_down) {
        float delta = (float)(s_drag_start_y - mouse_y) / 100.0f;
        float new_norm = clampf(s_drag_start_value + delta, 0.0f, 1.0f);
        float new_val = min + new_norm * range;

        /* Snap to step if range suggests integer values */
        if (range == (float)(int)range && range <= 256.0f) {
            new_val = (float)(int)(new_val + 0.5f);
            new_val = clampf(new_val, min, max);
        }

        if (new_val != value) {
            value = new_val;
            norm = (value - min) / range;
            changed = 1;
            if (out_value) *out_value = value;
        }
    }

    /* Draw knob body — filled circle */
    for (int py = -radius; py <= radius; py++) {
        for (int px = -radius; px <= radius; px++) {
            if (px * px + py * py <= radius * radius) {
                uint32_t c = (px + py < 0) ? HWUI_GRAY_LIGHT : HWUI_GRAY_MED;
                hwui_pixel(fb, stride, cx + px, cy + py, c);
            }
        }
    }

    /* Draw arc: sweep from 225deg (min) to -45deg (max) = 270deg range */
    float start_angle = (float)(225.0 * M_PI / 180.0);
    float sweep_angle = (float)(270.0 * M_PI / 180.0);
    float end_angle = start_angle - norm * sweep_angle;

    /* Arc background (dark track) */
    for (int i = 0; i <= 36; i++) {
        float t = (float)i / 36.0f;
        float a = start_angle - t * sweep_angle;
        int ax = cx + (int)((radius - 2) * cosf(a));
        int ay = cy - (int)((radius - 2) * sinf(a));
        hwui_pixel(fb, stride, ax, ay, HWUI_GRAY_DARK);
    }

    /* Arc filled portion */
    for (int i = 0; i <= (int)(norm * 36); i++) {
        float t = (float)i / 36.0f;
        float a = start_angle - t * sweep_angle;
        int ax = cx + (int)((radius - 2) * cosf(a));
        int ay = cy - (int)((radius - 2) * sinf(a));
        hwui_pixel(fb, stride, ax, ay, color);
        /* Thicken the arc */
        hwui_pixel(fb, stride, ax + 1, ay, color);
        hwui_pixel(fb, stride, ax, ay + 1, color);
    }

    /* Pointer dot at current position */
    {
        float a = start_angle - norm * sweep_angle;
        int px2 = cx + (int)((radius - 4) * cosf(a));
        int py2 = cy - (int)((radius - 4) * sinf(a));
        hwui_rect(fb, stride, px2 - 1, py2 - 1, 3, 3, HWUI_WHITE);
    }

    /* Label below knob */
    if (label) {
        hwui_text_centered(fb, stride, x, y + radius * 2 + 2,
                           radius * 2, HWUI_FONT_H, label, HWUI_GRAY_LIGHT);
    }

    /* Value display above knob */
    {
        const char *val_str;
        if (range == (float)(int)range && range <= 256.0f) {
            val_str = hwui_fmt_int((int)value);
        } else {
            val_str = hwui_fmt_float(value, 2);
        }
        hwui_text_centered(fb, stride, x, y + radius * 2 + 2 + HWUI_FONT_H + 1,
                           radius * 2, HWUI_FONT_H, val_str, HWUI_GRAY_BRIGHT);
    }

    return changed;
}

/* ── Widget: Horizontal Slider ─────────────────────────────────────────── */

int hwui_slider_h(uint32_t *fb, int stride, int x, int y, int w, int h,
                  float value, float min, float max, uint32_t color,
                  int mouse_x, int mouse_y, int mouse_down, float *out_value) {

    int wid = ++s_widget_id_counter;
    float range = max - min;
    if (range <= 0) range = 1.0f;
    float norm = clampf((value - min) / range, 0.0f, 1.0f);
    int changed = 0;

    int track_y = y + h / 2 - 1;
    int thumb_w = 6;
    int thumb_x = x + (int)(norm * (w - thumb_w));

    /* Hit test */
    int hovered = (mouse_x >= x && mouse_x < x + w &&
                   mouse_y >= y && mouse_y < y + h);

    if (hovered && mouse_down && !s_mdown_prev && s_drag_id < 0) {
        s_drag_id = wid;
    }

    if (s_drag_id == wid && mouse_down) {
        float new_norm = clampf((float)(mouse_x - x - thumb_w / 2) / (float)(w - thumb_w), 0.0f, 1.0f);
        float new_val = min + new_norm * range;
        if (new_val != value) {
            value = new_val;
            norm = new_norm;
            changed = 1;
            if (out_value) *out_value = value;
        }
    }

    /* Draw track */
    hwui_panel_sunken(fb, stride, x, track_y, w, 3);

    /* Draw filled portion */
    int fill_w = (int)(norm * (w - 2));
    if (fill_w > 0) {
        hwui_rect(fb, stride, x + 1, track_y + 1, fill_w, 1, color);
    }

    /* Draw thumb */
    thumb_x = x + (int)(norm * (w - thumb_w));
    hwui_panel_raised(fb, stride, thumb_x, y, thumb_w, h);

    return changed;
}

/* ── Widget: Vertical Slider ───────────────────────────────────────────── */

int hwui_slider_v(uint32_t *fb, int stride, int x, int y, int w, int h,
                  float value, float min, float max, uint32_t color,
                  int mouse_x, int mouse_y, int mouse_down, float *out_value) {

    int wid = ++s_widget_id_counter;
    float range = max - min;
    if (range <= 0) range = 1.0f;
    float norm = clampf((value - min) / range, 0.0f, 1.0f);
    int changed = 0;

    int track_x = x + w / 2 - 1;
    int thumb_h = 6;
    /* Vertical: top = max, bottom = min */
    int thumb_y = y + h - thumb_h - (int)(norm * (h - thumb_h));

    int hovered = (mouse_x >= x && mouse_x < x + w &&
                   mouse_y >= y && mouse_y < y + h);

    if (hovered && mouse_down && !s_mdown_prev && s_drag_id < 0) {
        s_drag_id = wid;
    }

    if (s_drag_id == wid && mouse_down) {
        float new_norm = clampf(1.0f - (float)(mouse_y - y - thumb_h / 2) / (float)(h - thumb_h), 0.0f, 1.0f);
        float new_val = min + new_norm * range;
        if (new_val != value) {
            value = new_val;
            norm = new_norm;
            changed = 1;
            if (out_value) *out_value = value;
        }
    }

    /* Draw track */
    hwui_panel_sunken(fb, stride, track_x, y, 3, h);

    /* Draw filled portion (from bottom up) */
    int fill_h = (int)(norm * (h - 2));
    if (fill_h > 0) {
        hwui_rect(fb, stride, track_x + 1, y + h - 1 - fill_h, 1, fill_h, color);
    }

    /* Draw thumb */
    thumb_y = y + h - thumb_h - (int)(norm * (h - thumb_h));
    hwui_panel_raised(fb, stride, x, thumb_y, w, thumb_h);

    return changed;
}

/* ── Widget: Checkbox ──────────────────────────────────────────────────── */

int hwui_checkbox(uint32_t *fb, int stride, int x, int y,
                  const char *label, int checked,
                  int mouse_x, int mouse_y, int mouse_down) {

    int box_size = 8;
    int total_w = box_size + 3 + hwui_text_width(label);
    int hovered = (mouse_x >= x && mouse_x < x + total_w &&
                   mouse_y >= y && mouse_y < y + box_size);

    /* Draw box */
    hwui_panel_sunken(fb, stride, x, y, box_size, box_size);

    /* Draw check mark */
    if (checked) {
        hwui_line(fb, stride, x + 2, y + 4, x + 3, y + 6, HWUI_GREEN);
        hwui_line(fb, stride, x + 3, y + 6, x + 6, y + 2, HWUI_GREEN);
    }

    /* Label */
    hwui_text(fb, stride, x + box_size + 3, y + 1, label, HWUI_GRAY_LIGHT);

    /* Click detection */
    return (hovered && !mouse_down && s_mdown_prev) ? 1 : 0;
}

/* ── Widget: Dropdown ──────────────────────────────────────────────────── */

int hwui_dropdown(uint32_t *fb, int stride, int x, int y, int w,
                  const char **options, int count, int selected,
                  int mouse_x, int mouse_y, int mouse_down, int *out_selected) {

    int h = HWUI_FONT_H + 4;
    int arrow_w = 10;
    int changed = 0;

    /* Draw background */
    hwui_panel_sunken(fb, stride, x, y, w, h);

    /* Draw current selection text */
    if (selected >= 0 && selected < count) {
        hwui_text(fb, stride, x + 3, y + 2, options[selected], HWUI_WHITE);
    }

    /* Left arrow button */
    int la_x = x + w - arrow_w * 2;
    int la_clicked = hwui_button(fb, stride, la_x, y, arrow_w, h, "<", 0,
                                 mouse_x, mouse_y, mouse_down);

    /* Right arrow button */
    int ra_x = x + w - arrow_w;
    int ra_clicked = hwui_button(fb, stride, ra_x, y, arrow_w, h, ">", 0,
                                 mouse_x, mouse_y, mouse_down);

    if (la_clicked && selected > 0) {
        selected--;
        changed = 1;
    }
    if (ra_clicked && selected < count - 1) {
        selected++;
        changed = 1;
    }

    if (changed && out_selected) *out_selected = selected;
    return changed;
}

/* ── Widget: Horizontal Scrollbar ──────────────────────────────────────── */

int hwui_scrollbar_h(uint32_t *fb, int stride, int x, int y, int w, int h,
                     int content_size, int view_size, int scroll_pos,
                     int mouse_x, int mouse_y, int mouse_down, int *out_pos) {

    int wid = ++s_widget_id_counter;
    int changed = 0;

    /* Draw track */
    hwui_panel_sunken(fb, stride, x, y, w, h);

    if (content_size <= 0 || view_size >= content_size) return 0;

    /* Calculate thumb */
    float frac_start = (float)scroll_pos / content_size;
    float frac_size  = (float)view_size / content_size;
    int thumb_x = x + (int)(frac_start * w);
    int thumb_w = (int)(frac_size * w);
    if (thumb_w < 8) thumb_w = 8;
    if (thumb_x + thumb_w > x + w)
        thumb_x = x + w - thumb_w;

    /* Hit test */
    int hovered = (mouse_x >= x && mouse_x < x + w &&
                   mouse_y >= y && mouse_y < y + h);

    if (hovered && mouse_down && !s_mdown_prev && s_drag_id < 0) {
        s_drag_id = wid;
    }

    if (s_drag_id == wid && mouse_down) {
        float new_frac = clampf((float)(mouse_x - x - thumb_w / 2) / (float)(w - thumb_w), 0.0f, 1.0f);
        int new_pos = (int)(new_frac * (content_size - view_size));
        if (new_pos < 0) new_pos = 0;
        if (new_pos > content_size - view_size) new_pos = content_size - view_size;
        if (new_pos != scroll_pos) {
            scroll_pos = new_pos;
            changed = 1;
            if (out_pos) *out_pos = scroll_pos;
        }
    }

    /* Draw thumb */
    hwui_panel_raised(fb, stride, thumb_x, y + 1, thumb_w, h - 2);

    return changed;
}

/* ── Widget: Vertical Scrollbar ────────────────────────────────────────── */

int hwui_scrollbar_v(uint32_t *fb, int stride, int x, int y, int w, int h,
                     int content_size, int view_size, int scroll_pos,
                     int mouse_x, int mouse_y, int mouse_down, int *out_pos) {

    int wid = ++s_widget_id_counter;
    int changed = 0;

    hwui_panel_sunken(fb, stride, x, y, w, h);

    if (content_size <= 0 || view_size >= content_size) return 0;

    float frac_start = (float)scroll_pos / content_size;
    float frac_size  = (float)view_size / content_size;
    int thumb_y = y + (int)(frac_start * h);
    int thumb_h = (int)(frac_size * h);
    if (thumb_h < 8) thumb_h = 8;
    if (thumb_y + thumb_h > y + h)
        thumb_y = y + h - thumb_h;

    int hovered = (mouse_x >= x && mouse_x < x + w &&
                   mouse_y >= y && mouse_y < y + h);

    if (hovered && mouse_down && !s_mdown_prev && s_drag_id < 0) {
        s_drag_id = wid;
    }

    if (s_drag_id == wid && mouse_down) {
        float new_frac = clampf((float)(mouse_y - y - thumb_h / 2) / (float)(h - thumb_h), 0.0f, 1.0f);
        int new_pos = (int)(new_frac * (content_size - view_size));
        if (new_pos < 0) new_pos = 0;
        if (new_pos > content_size - view_size) new_pos = content_size - view_size;
        if (new_pos != scroll_pos) {
            scroll_pos = new_pos;
            changed = 1;
            if (out_pos) *out_pos = scroll_pos;
        }
    }

    hwui_panel_raised(fb, stride, x + 1, thumb_y, w - 2, thumb_h);

    return changed;
}

/* ── ADSR Envelope Visualization ───────────────────────────────────────── */

void hwui_adsr_viz(uint32_t *fb, int stride, int x, int y, int w, int h,
                   int ar, int dr, int sl, int d2r, int rr,
                   int ar_max, int dr_max, int sl_max, int rr_max,
                   uint32_t line_color, uint32_t fill_color) {

    /* Background */
    hwui_panel_sunken(fb, stride, x, y, w, h);

    int inner_x = x + 2;
    int inner_y = y + 2;
    int inner_w = w - 4;
    int inner_h = h - 4;

    if (inner_w < 8 || inner_h < 4) return;

    /* Normalize parameters to 0..1 */
    float a_frac = (ar_max > 0) ? (float)ar / ar_max : 0.5f;  /* Attack rate: higher = faster */
    float d_frac = (dr_max > 0) ? (float)dr / dr_max : 0.5f;  /* Decay rate */
    float s_frac = (sl_max > 0) ? 1.0f - (float)sl / sl_max : 0.5f;  /* Sustain level */
    float r_frac = (rr_max > 0) ? (float)rr / rr_max : 0.5f;  /* Release rate */

    /* Calculate segment widths */
    /* Attack width: inversely proportional to rate (faster rate = shorter segment) */
    float a_width_frac = 0.25f * (1.0f - a_frac * 0.8f);
    float d_width_frac = 0.25f * (1.0f - d_frac * 0.8f);
    float d2_width_frac = (d2r > 0 && dr_max > 0) ? 0.15f * (1.0f - (float)d2r / dr_max * 0.8f) : 0.0f;
    float r_width_frac = 0.20f * (1.0f - r_frac * 0.8f);
    float s_width_frac = 1.0f - a_width_frac - d_width_frac - d2_width_frac - r_width_frac;
    if (s_width_frac < 0.05f) s_width_frac = 0.05f;

    /* Normalize so they sum to 1 */
    float total = a_width_frac + d_width_frac + d2_width_frac + s_width_frac + r_width_frac;
    a_width_frac /= total;
    d_width_frac /= total;
    d2_width_frac /= total;
    s_width_frac /= total;
    r_width_frac /= total;

    /* Key points */
    int ax = inner_x;
    int a_end = ax + (int)(a_width_frac * inner_w);
    int d_end = a_end + (int)(d_width_frac * inner_w);
    int d2_end = d_end + (int)(d2_width_frac * inner_w);
    int s_end = d2_end + (int)(s_width_frac * inner_w);
    int r_end = inner_x + inner_w;

    int top_y = inner_y;
    int bot_y = inner_y + inner_h - 1;
    int sus_y = bot_y - (int)(s_frac * (inner_h - 1));
    int d2_end_y = (d2r > 0) ? bot_y - (int)(s_frac * 0.5f * (inner_h - 1)) : sus_y;

    /* Draw envelope lines */
    /* Attack: bottom-left to top */
    hwui_line(fb, stride, ax, bot_y, a_end, top_y, line_color);
    /* Decay: top to sustain level */
    hwui_line(fb, stride, a_end, top_y, d_end, sus_y, line_color);
    /* D2R: sustain level to lower level */
    if (d2r > 0) {
        hwui_line(fb, stride, d_end, sus_y, d2_end, d2_end_y, line_color);
    }
    /* Sustain: flat line */
    hwui_hline(fb, stride, d2_end, d2_end_y, s_end - d2_end, line_color);
    /* Release: sustain to bottom */
    hwui_line(fb, stride, s_end, d2_end_y, r_end, bot_y, line_color);

    /* Optional fill below the envelope */
    if (fill_color != 0) {
        /* Simple scanline fill — for each x, find the envelope y and fill below */
        for (int px = inner_x; px < inner_x + inner_w; px++) {
            int env_y;
            if (px <= a_end) {
                /* Attack segment */
                float t = (a_end > ax) ? (float)(px - ax) / (a_end - ax) : 0;
                env_y = bot_y - (int)(t * (bot_y - top_y));
            } else if (px <= d_end) {
                /* Decay segment */
                float t = (d_end > a_end) ? (float)(px - a_end) / (d_end - a_end) : 0;
                env_y = top_y + (int)(t * (sus_y - top_y));
            } else if (px <= d2_end && d2r > 0) {
                /* D2R segment */
                float t = (d2_end > d_end) ? (float)(px - d_end) / (d2_end - d_end) : 0;
                env_y = sus_y + (int)(t * (d2_end_y - sus_y));
            } else if (px <= s_end) {
                env_y = d2_end_y;
            } else {
                /* Release segment */
                float t = (r_end > s_end) ? (float)(px - s_end) / (r_end - s_end) : 0;
                env_y = d2_end_y + (int)(t * (bot_y - d2_end_y));
            }
            for (int py = env_y + 1; py <= bot_y; py++) {
                hwui_pixel(fb, stride, px, py, fill_color);
            }
        }
    }
}

/* ── Labeled Group Box ─────────────────────────────────────────────────── */

void hwui_group_box(uint32_t *fb, int stride, int x, int y, int w, int h,
                    const char *label, uint32_t label_color) {
    /* 3D sunken border */
    hwui_hline(fb, stride, x, y + 4, w, HWUI_PANEL_SH);
    hwui_hline(fb, stride, x, y + h - 1, w, HWUI_PANEL_HI);
    hwui_vline(fb, stride, x, y + 4, h - 4, HWUI_PANEL_SH);
    hwui_vline(fb, stride, x + w - 1, y + 4, h - 4, HWUI_PANEL_HI);

    /* Inner highlight/shadow */
    hwui_hline(fb, stride, x + 1, y + 5, w - 2, HWUI_PANEL_HI);
    hwui_hline(fb, stride, x + 1, y + h - 2, w - 2, HWUI_PANEL_SH);
    hwui_vline(fb, stride, x + 1, y + 5, h - 6, HWUI_PANEL_HI);
    hwui_vline(fb, stride, x + w - 2, y + 5, h - 6, HWUI_PANEL_SH);

    /* Label in gap */
    if (label) {
        int tw = hwui_text_width(label);
        /* Clear area behind label */
        hwui_rect(fb, stride, x + 6, y, tw + 4, HWUI_FONT_H + 2, HWUI_PANEL);
        hwui_text(fb, stride, x + 8, y + 1, label, label_color);
    }
}
