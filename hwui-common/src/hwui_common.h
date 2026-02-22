/*
 * hwui_common.h — Shared Hardware UI primitives for SDL2/Emscripten modules
 *
 * Provides a lightweight widget toolkit for retro-styled instrument editors:
 * - Embedded 4x6 bitmap font (96 ASCII glyphs, no external files needed)
 * - Framebuffer primitives (pixel, rect, line, text)
 * - 3D beveled panels and buttons
 * - Interactive widgets: knob, slider, checkbox, dropdown, scrollbar
 * - ADSR envelope visualization
 *
 * All rendering targets a uint32_t ARGB8888 framebuffer; SDL2 is only needed
 * by the hosting module for event loop + texture upload.
 *
 * Usage: include this header and compile hwui_common.c alongside your module.
 */

#ifndef HWUI_COMMON_H
#define HWUI_COMMON_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/* ── Color Palette ─────────────────────────────────────────────────────── */

#define HWUI_BLACK       0xFF000000
#define HWUI_WHITE       0xFFFFFFFF
#define HWUI_GRAY_DARK   0xFF3C3C3C
#define HWUI_GRAY_MED    0xFF505050
#define HWUI_GRAY_LIGHT  0xFFB4B4B4
#define HWUI_GRAY_BRIGHT 0xFFDDDDDD
#define HWUI_PANEL       0xFFAAAAAA
#define HWUI_PANEL_HI    0xFFDDDDDD
#define HWUI_PANEL_SH    0xFF666666
#define HWUI_BLUE        0xFF4466CC
#define HWUI_BLUE_LIGHT  0xFF6688EE
#define HWUI_BLUE_DARK   0xFF223366
#define HWUI_RED         0xFFCC4444
#define HWUI_GREEN       0xFF44BB44
#define HWUI_AMBER       0xFFDDAA44
#define HWUI_CYAN        0xFF44BBBB
#define HWUI_MAGENTA     0xFFBB44BB
#define HWUI_ORANGE      0xFFEE8833
#define HWUI_YELLOW      0xFFDDDD44

/* Build an ARGB color from components */
#define HWUI_RGB(r, g, b) (0xFF000000u | ((uint32_t)(r) << 16) | ((uint32_t)(g) << 8) | (uint32_t)(b))

/* ── Font Constants ────────────────────────────────────────────────────── */

#define HWUI_FONT_W       4
#define HWUI_FONT_H       6
#define HWUI_FONT_SPACING 1  /* 1px gap between chars → 5px per char cell */
#define HWUI_CHAR_W       (HWUI_FONT_W + HWUI_FONT_SPACING)  /* 5 */

/* ── Framebuffer Bounds ────────────────────────────────────────────────── */

/**
 * Set framebuffer dimensions for bounds checking.
 * Must be called before any drawing to prevent out-of-bounds writes.
 * @param w  Framebuffer width in pixels
 * @param h  Framebuffer height in pixels
 */
void hwui_set_fb_size(int w, int h);

/* ── Primitive Drawing ─────────────────────────────────────────────────── */

/**
 * Set a single pixel. Bounds-checked against framebuffer dimensions.
 * @param fb     Framebuffer pointer (ARGB8888)
 * @param stride Row stride in pixels (== framebuffer width)
 * @param x, y   Pixel coordinates
 * @param col    ARGB color
 */
void hwui_pixel(uint32_t *fb, int stride, int x, int y, uint32_t col);

/** Same as hwui_pixel but also checks max bounds (convenience for variable-size canvases) */
void hwui_pixel_safe(uint32_t *fb, int stride, int max_w, int max_h, int x, int y, uint32_t col);

/** Fill a rectangle */
void hwui_rect(uint32_t *fb, int stride, int x, int y, int w, int h, uint32_t col);

/** Draw a 1px rectangle outline */
void hwui_rect_outline(uint32_t *fb, int stride, int x, int y, int w, int h, uint32_t col);

/** Horizontal line */
void hwui_hline(uint32_t *fb, int stride, int x, int y, int w, uint32_t col);

/** Vertical line */
void hwui_vline(uint32_t *fb, int stride, int x, int y, int h, uint32_t col);

/** Bresenham line between two points */
void hwui_line(uint32_t *fb, int stride, int x0, int y0, int x1, int y1, uint32_t col);

/* ── Text Rendering ────────────────────────────────────────────────────── */

/** Draw a single character at (px, py) */
void hwui_char(uint32_t *fb, int stride, int px, int py, char ch, uint32_t col);

/** Draw a null-terminated string. Returns width in pixels. */
int hwui_text(uint32_t *fb, int stride, int x, int y, const char *str, uint32_t col);

/** Calculate the pixel width of a string (without drawing) */
int hwui_text_width(const char *str);

/** Draw a string centered within a rectangle */
void hwui_text_centered(uint32_t *fb, int stride, int rx, int ry, int rw, int rh,
                        const char *str, uint32_t col);

/** Draw a string right-aligned to (right_x, y) */
void hwui_text_right(uint32_t *fb, int stride, int right_x, int y,
                     const char *str, uint32_t col);

/* ── Format Helpers ────────────────────────────────────────────────────── */

/** Format integer to string. Returns pointer to internal static buffer. */
const char *hwui_fmt_int(int val);

/** Format float to string with N decimal places. Internal static buffer. */
const char *hwui_fmt_float(float val, int decimals);

/** Format integer as 2-digit hex (uppercase). Internal static buffer. */
const char *hwui_fmt_hex2(int val);

/** Format integer as 4-digit hex (uppercase). Internal static buffer. */
const char *hwui_fmt_hex4(int val);

/* ── 3D Panel / Beveled Box ────────────────────────────────────────────── */

/**
 * Draw a 3D beveled panel (raised or sunken).
 * @param face   Fill color
 * @param light  Top/left edge highlight
 * @param shadow Bottom/right edge shadow
 */
void hwui_panel_3d(uint32_t *fb, int stride, int x, int y, int w, int h,
                   uint32_t face, uint32_t light, uint32_t shadow);

/** Convenience: raised panel (standard gray) */
void hwui_panel_raised(uint32_t *fb, int stride, int x, int y, int w, int h);

/** Convenience: sunken panel (standard gray) */
void hwui_panel_sunken(uint32_t *fb, int stride, int x, int y, int w, int h);

/* ── Widget: Button ────────────────────────────────────────────────────── */

/**
 * Draw a labeled 3D button. Returns 1 if the button was clicked this frame.
 * @param pressed  1 = draw in pressed/active state
 * @param mouse_x, mouse_y, mouse_down  Current mouse state for hit testing
 */
int hwui_button(uint32_t *fb, int stride, int x, int y, int w, int h,
                const char *label, int pressed,
                int mouse_x, int mouse_y, int mouse_down);

/* ── Widget: Knob (Rotary Arc) ─────────────────────────────────────────── */

/**
 * Draw a rotary knob with label and value display.
 * @param value     Current value
 * @param min, max  Value range
 * @param label     Text label below the knob (NULL to skip)
 * @param color     Arc color
 * @param mouse_x, mouse_y, mouse_down  Mouse state
 * @param out_value If non-NULL and value changed, receives the new value
 * @return 1 if value was changed by user interaction
 */
int hwui_knob(uint32_t *fb, int stride, int x, int y, int radius,
              float value, float min, float max, const char *label, uint32_t color,
              int mouse_x, int mouse_y, int mouse_down, float *out_value);

/* ── Widget: Horizontal Slider ─────────────────────────────────────────── */

/**
 * Draw a horizontal slider track with draggable thumb.
 * @return 1 if value was changed
 */
int hwui_slider_h(uint32_t *fb, int stride, int x, int y, int w, int h,
                  float value, float min, float max, uint32_t color,
                  int mouse_x, int mouse_y, int mouse_down, float *out_value);

/** Draw a vertical slider. @return 1 if value changed */
int hwui_slider_v(uint32_t *fb, int stride, int x, int y, int w, int h,
                  float value, float min, float max, uint32_t color,
                  int mouse_x, int mouse_y, int mouse_down, float *out_value);

/* ── Widget: Checkbox ──────────────────────────────────────────────────── */

/**
 * Draw a checkbox with label. Returns 1 if toggled this frame.
 * @param checked  Current state (0 or 1)
 */
int hwui_checkbox(uint32_t *fb, int stride, int x, int y,
                  const char *label, int checked,
                  int mouse_x, int mouse_y, int mouse_down);

/* ── Widget: Dropdown Selector ─────────────────────────────────────────── */

/**
 * Draw a dropdown selector (non-expanding — shows current + prev/next arrows).
 * @param options     Array of option label strings
 * @param count       Number of options
 * @param selected    Current selected index
 * @param out_selected  Receives new index if changed
 * @return 1 if selection changed
 */
int hwui_dropdown(uint32_t *fb, int stride, int x, int y, int w,
                  const char **options, int count, int selected,
                  int mouse_x, int mouse_y, int mouse_down, int *out_selected);

/* ── Widget: Scrollbar ─────────────────────────────────────────────────── */

/**
 * Draw a horizontal scrollbar.
 * @param content_size  Total content size (e.g., total samples)
 * @param view_size     Visible portion size
 * @param scroll_pos    Current scroll offset
 * @param out_pos       Receives new scroll position if changed
 * @return 1 if position changed
 */
int hwui_scrollbar_h(uint32_t *fb, int stride, int x, int y, int w, int h,
                     int content_size, int view_size, int scroll_pos,
                     int mouse_x, int mouse_y, int mouse_down, int *out_pos);

/** Vertical scrollbar. Same interface as horizontal. */
int hwui_scrollbar_v(uint32_t *fb, int stride, int x, int y, int w, int h,
                     int content_size, int view_size, int scroll_pos,
                     int mouse_x, int mouse_y, int mouse_down, int *out_pos);

/* ── ADSR Envelope Visualization ───────────────────────────────────────── */

/**
 * Draw a simple ADSR (with optional D2R) envelope curve.
 * All rate/level values are raw chip values; _max params define the scale.
 *
 * @param ar, dr, sl, d2r, rr   Envelope parameters (chip register values)
 * @param ar_max, dr_max, sl_max, rr_max  Maximum values for normalization
 * @param line_color   Envelope curve color
 * @param fill_color   Optional fill below curve (0 to skip)
 */
void hwui_adsr_viz(uint32_t *fb, int stride, int x, int y, int w, int h,
                   int ar, int dr, int sl, int d2r, int rr,
                   int ar_max, int dr_max, int sl_max, int rr_max,
                   uint32_t line_color, uint32_t fill_color);

/* ── Labeled Group Box ─────────────────────────────────────────────────── */

/**
 * Draw a labeled group box (3D sunken panel with label in top-left).
 */
void hwui_group_box(uint32_t *fb, int stride, int x, int y, int w, int h,
                    const char *label, uint32_t label_color);

/* ── Widget Interaction State ──────────────────────────────────────────── */

/**
 * Call once per frame BEFORE rendering any widgets, to reset per-frame state.
 * Pass the current mouse button state (0 = up, 1 = down).
 */
void hwui_frame_begin(int mouse_x, int mouse_y, int mouse_down);

/**
 * Call once per frame AFTER rendering all widgets.
 * Updates internal drag tracking.
 */
void hwui_frame_end(void);

/**
 * Reset all widget interaction state (e.g., on module init or resize).
 */
void hwui_reset_state(void);

#ifdef __cplusplus
}
#endif

#endif /* HWUI_COMMON_H */
