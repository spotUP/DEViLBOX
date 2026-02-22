/*
 * ft2_sampled.c — FastTracker 2 Instrument/Sample Editor (WASM Canvas 2D)
 *
 * Standalone C module that renders the classic FT2 instrument editor with:
 * - Volume envelope editor (12-point draggable curve)
 * - Panning envelope editor (12-point draggable curve)
 * - Auto-vibrato controls
 * - Sample waveform display with loop pins
 * - Parameter editing (volume, panning, finetune, relative note, fadeout)
 *
 * No SDL dependency — renders to a uint32_t framebuffer and pushes
 * to canvas via EM_JS putImageData. Events forwarded from React.
 *
 * Bitmap font: uses hwui_common shared 4x6 pixel font.
 * Palette: FT2 gray/dark scheme.
 */

#include <emscripten.h>
#include <emscripten/html5.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <math.h>

#include "ft2_sampled.h"
#include "hwui_common.h"

/* ── JS callbacks ──────────────────────────────────────────────── */

EM_JS(void, js_on_param_change, (int param_id, int value), {
    if (Module.onParamChange) Module.onParamChange(param_id, value);
});

EM_JS(void, js_on_loop_change, (int start, int length, int type), {
    if (Module.onLoopChange) Module.onLoopChange(start, length, type);
});

EM_JS(void, js_on_vol_env_change, (int index, int tick, int value), {
    if (Module.onVolEnvChange) Module.onVolEnvChange(index, tick, value);
});

EM_JS(void, js_on_pan_env_change, (int index, int tick, int value), {
    if (Module.onPanEnvChange) Module.onPanEnvChange(index, tick, value);
});

EM_JS(void, js_on_vol_env_flags_change, (int enabled, int sustain_pt, int loop_start, int loop_end, int num_points), {
    if (Module.onVolEnvFlagsChange) Module.onVolEnvFlagsChange(enabled, sustain_pt, loop_start, loop_end, num_points);
});

EM_JS(void, js_on_pan_env_flags_change, (int enabled, int sustain_pt, int loop_start, int loop_end, int num_points), {
    if (Module.onPanEnvFlagsChange) Module.onPanEnvFlagsChange(enabled, sustain_pt, loop_start, loop_end, num_points);
});

/* ── Direct canvas rendering (bypasses SDL) ───────────────────── */

EM_JS(void, js_push_frame, (const uint32_t *fb_ptr, int w, int h), {
    var canvas = Module.canvas;
    if (!canvas) return;
    if (!Module._ft2ctx) {
        Module._ft2ctx = canvas.getContext('2d');
    }
    var ctx = Module._ft2ctx;
    if (!ctx) return;
    var imgData = ctx.createImageData(w, h);
    var src = HEAPU8.subarray(fb_ptr, fb_ptr + w * h * 4);
    var dst = imgData.data;
    /* WASM little-endian: ARGB 0xAARRGGBB stored as [BB,GG,RR,AA] */
    /* Canvas ImageData wants [RR,GG,BB,AA] */
    for (var i = 0; i < w * h; i++) {
        var off = i * 4;
        dst[off]     = src[off + 2];
        dst[off + 1] = src[off + 1];
        dst[off + 2] = src[off];
        dst[off + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
});

/* ── Colours (FT2 gray scheme) ─────────────────────────────────── */

#define COL_DESKTOP   0xFF505050
#define COL_BUTTONS   0xFF6E6E6E
#define COL_FORGRND   0xFFB4B4B4
#define COL_BCKGRND   0xFF3C3C3C
#define COL_TEXTMRK   0xFFFFFFFF
#define COL_DSKTOP1   0xFF787878  /* light border */
#define COL_DSKTOP2   0xFF383838  /* dark border */
#define COL_TEXT      0xFFE0E0E0
#define COL_TEXT_DK   0xFF000000
#define COL_WAVE_BG   0xFF1A1A1A
#define COL_WAVE_FG   0xFF55CC55  /* green waveform */
#define COL_CENTER    0xFF333333
#define COL_LOOP_PIN  0xFFFF4444
#define COL_ENV_BG    0xFF2A2A2A
#define COL_ENV_LINE  0xFF44AAFF  /* blue envelope lines */
#define COL_ENV_PT    0xFFFFFF44  /* yellow points */
#define COL_ENV_PT_SEL 0xFFFF4444 /* red selected point */
#define COL_ENV_SUST  0xFF44FF44  /* green sustain marker */
#define COL_ENV_LOOP  0xFFFF8844  /* orange loop markers */
#define COL_ENV_GRID  0xFF333333
#define COL_CHECKBOX  0xFF44AAFF
#define COL_SLIDER_BG 0xFF404040
#define COL_SLIDER_FG 0xFF88AACC

/* ── Layout constants ──────────────────────────────────────────── */

#define SCREEN_W  632
#define SCREEN_H  400

/* Envelope areas */
#define ENV_X          8
#define ENV_W          325
#define ENV_H          64

#define VOL_ENV_Y      90
#define PAN_ENV_Y      184

/* Envelope max ticks (visual) */
#define ENV_MAX_TICK   325

/* Right panel */
#define RPANEL_X       345
#define RPANEL_W       280

/* Auto-vibrato area */
#define VIB_Y          32
#define VIB_H          44

/* Waveform area */
#define WAVE_X         0
#define WAVE_Y         280
#define WAVE_W         632
#define WAVE_H         100

/* Scrollbar */
#define SCROLL_Y       384
#define SCROLL_H       10
#define SCROLL_X       0
#define SCROLL_W       632

/* Max envelope points */
#define MAX_ENV_POINTS 12

/* ── State ─────────────────────────────────────────────────────── */

static uint32_t      g_fb[SCREEN_W * SCREEN_H];

/* ── Bridge macros: route fb_* calls to hwui_common ────────────── */
#define fb_pixel(x,y,col)            hwui_pixel(g_fb, SCREEN_W, (x), (y), (col))
#define fb_rect(x,y,w,h,col)         hwui_rect(g_fb, SCREEN_W, (x), (y), (w), (h), (col))
#define fb_hline(x,y,w,col)          hwui_hline(g_fb, SCREEN_W, (x), (y), (w), (col))
#define fb_vline(x,y,h,col)          hwui_vline(g_fb, SCREEN_W, (x), (y), (h), (col))
#define fb_char(px,py,ch,col)        hwui_char(g_fb, SCREEN_W, (px), (py), (ch), (col))
#define fb_text(x,y,s,col)           hwui_text(g_fb, SCREEN_W, (x), (y), (s), (col))
#define fb_text_centered(rx,ry,rw,rh,s,col) hwui_text_centered(g_fb, SCREEN_W, (rx), (ry), (rw), (rh), (s), (col))

/* Use hwui_common font constants for any remaining references */
#define FONT_W       HWUI_FONT_W
#define FONT_H       HWUI_FONT_H
#define FONT_SPACING HWUI_FONT_SPACING

/* PCM sample data (signed 16-bit) */
static int16_t *g_pcm     = NULL;
static int      g_pcm_len = 0;

/* Parameters */
static int g_volume        = 64;
static int g_panning       = 128;
static int g_finetune      = 0;   /* -128..+127 */
static int g_relative_note = 0;   /* -48..+48 */
static int g_loop_type     = 0;   /* 0=off, 1=forward, 2=pingpong */
static int g_loop_start    = 0;
static int g_loop_length   = 0;
static int g_fadeout        = 0;   /* 0-4095 */
static int g_vib_type      = 0;   /* 0-3 */
static int g_vib_sweep     = 0;
static int g_vib_depth     = 0;
static int g_vib_rate      = 0;

/* Envelope data */
typedef struct {
    int tick;   /* X position (0-325) */
    int value;  /* Y value (0-64) */
} EnvPoint;

typedef struct {
    int enabled;
    int num_points;
    int sustain_point;    /* -1 = none */
    int loop_start_point; /* -1 = none */
    int loop_end_point;   /* -1 = none */
    EnvPoint points[MAX_ENV_POINTS];
    int selected_point;   /* -1 = none */
} Envelope;

static Envelope g_vol_env = {
    .enabled = 0, .num_points = 2, .sustain_point = -1,
    .loop_start_point = -1, .loop_end_point = -1,
    .points = {{0, 64}, {325, 0}},
    .selected_point = -1
};

static Envelope g_pan_env = {
    .enabled = 0, .num_points = 2, .sustain_point = -1,
    .loop_start_point = -1, .loop_end_point = -1,
    .points = {{0, 32}, {325, 32}},
    .selected_point = -1
};

/* Waveform view state */
static int g_wave_view_start = 0;
static int g_wave_view_size  = 1;

/* Mouse interaction */
static int g_mouse_x = 0, g_mouse_y = 0;
static int g_mouse_down = 0;
static int g_dragging_vol_env = 0;  /* index of point being dragged, -1 = none */
static int g_dragging_pan_env = 0;
static int g_dragging_loop_start = 0;
static int g_dragging_loop_end = 0;
static int g_dragging_scroll = 0;
static int g_scroll_drag_offset = 0;

/* Dirty flag */
static int g_dirty = 1;

/* Active section for keyboard focus */
typedef enum {
    FOCUS_NONE = 0,
    FOCUS_VOL_ENV,
    FOCUS_PAN_ENV,
    FOCUS_WAVEFORM
} FocusArea;
static FocusArea g_focus = FOCUS_NONE;

/* ── FT2-specific widgets (use hwui_common primitives via macros) ── */

/* 3D button */
static void fb_button(int x, int y, int w, int h, const char *label, int pressed) {
    uint32_t face = pressed ? COL_DSKTOP2 : COL_BUTTONS;
    uint32_t hi   = pressed ? COL_DSKTOP2 : COL_DSKTOP1;
    uint32_t sh   = pressed ? COL_DSKTOP1 : COL_DSKTOP2;

    fb_rect(x, y, w, h, face);
    fb_hline(x, y, w, hi);
    fb_vline(x, y, h, hi);
    fb_hline(x, y + h - 1, w, sh);
    fb_vline(x + w - 1, y, h, sh);
    fb_text_centered(x, y, w, h, label, COL_TEXT);
}

/* Checkbox */
static void fb_checkbox(int x, int y, const char *label, int checked) {
    fb_rect(x, y, 10, 10, COL_BCKGRND);
    fb_hline(x, y, 10, COL_DSKTOP2);
    fb_vline(x, y, 10, COL_DSKTOP2);
    fb_hline(x, y + 9, 10, COL_DSKTOP1);
    fb_vline(x + 9, y, 10, COL_DSKTOP1);
    if (checked) {
        fb_rect(x + 2, y + 2, 6, 6, COL_CHECKBOX);
    }
    fb_text(x + 14, y + 2, label, COL_TEXT);
}

/* Horizontal slider */
static void fb_slider(int x, int y, int w, int h, int val, int max_val, const char *label) {
    fb_rect(x, y, w, h, COL_SLIDER_BG);
    fb_hline(x, y, w, COL_DSKTOP2);
    fb_hline(x, y + h - 1, w, COL_DSKTOP1);

    if (max_val > 0) {
        int thumb_x = x + (int)((double)val / max_val * (w - 6));
        fb_rect(thumb_x, y, 6, h, COL_SLIDER_FG);
    }

    if (label) {
        fb_text(x + w + 4, y + (h - FONT_H) / 2, label, COL_TEXT);
    }
}

/* Number display */
static void fb_number(int x, int y, const char *label, int val, int max_digits) {
    fb_text(x, y, label, COL_TEXT);
    int lw = (int)strlen(label) * (FONT_W + FONT_SPACING);
    char buf[16];
    snprintf(buf, sizeof(buf), "%d", val);
    fb_text(x + lw, y, buf, COL_TEXTMRK);
}

/* ── Button definitions ────────────────────────────────────────── */

typedef struct {
    int x, y, w, h;
    const char *label;
    void (*action)(void);
} Button;

static void btn_wave_show_all(void);
static void btn_wave_zoom_in(void);
static void btn_wave_zoom_out(void);
static void btn_vol_env_toggle(void);
static void btn_pan_env_toggle(void);
static void btn_vol_add_point(void);
static void btn_vol_del_point(void);
static void btn_pan_add_point(void);
static void btn_pan_del_point(void);

/* Parameter +/- buttons */
static void btn_vol_up(void);
static void btn_vol_down(void);
static void btn_pan_up(void);
static void btn_pan_down(void);
static void btn_fine_up(void);
static void btn_fine_down(void);
static void btn_fadeout_up(void);
static void btn_fadeout_down(void);
static void btn_vib_type_next(void);
static void btn_vib_sweep_up(void);
static void btn_vib_sweep_down(void);
static void btn_vib_depth_up(void);
static void btn_vib_depth_down(void);
static void btn_vib_rate_up(void);
static void btn_vib_rate_down(void);
static void btn_loop_type_next(void);

static Button g_buttons[] = {
    /* Waveform controls */
    {   4, WAVE_Y - 14, 60, 12, "SHOW ALL",  btn_wave_show_all },
    {  68, WAVE_Y - 14, 48, 12, "ZOOM+",     btn_wave_zoom_in  },
    { 120, WAVE_Y - 14, 48, 12, "ZOOM-",     btn_wave_zoom_out },
    { 172, WAVE_Y - 14, 48, 12, "LOOP:",     btn_loop_type_next },

    /* Volume envelope controls */
    { ENV_X, VOL_ENV_Y - 14, 42, 12, "VOL.E", btn_vol_env_toggle },
    { ENV_X + 46, VOL_ENV_Y - 14, 30, 12, "+PT", btn_vol_add_point },
    { ENV_X + 80, VOL_ENV_Y - 14, 30, 12, "-PT", btn_vol_del_point },

    /* Panning envelope controls */
    { ENV_X, PAN_ENV_Y - 14, 42, 12, "PAN.E", btn_pan_env_toggle },
    { ENV_X + 46, PAN_ENV_Y - 14, 30, 12, "+PT", btn_pan_add_point },
    { ENV_X + 80, PAN_ENV_Y - 14, 30, 12, "-PT", btn_pan_del_point },

    /* Right panel param buttons */
    { RPANEL_X + 80,  36, 20, 12, "+", btn_vol_up   },
    { RPANEL_X + 104, 36, 20, 12, "-", btn_vol_down },
    { RPANEL_X + 80,  52, 20, 12, "+", btn_pan_up   },
    { RPANEL_X + 104, 52, 20, 12, "-", btn_pan_down },
    { RPANEL_X + 80,  68, 20, 12, "+", btn_fine_up   },
    { RPANEL_X + 104, 68, 20, 12, "-", btn_fine_down },
    { RPANEL_X + 80,  100, 20, 12, "+", btn_fadeout_up   },
    { RPANEL_X + 104, 100, 20, 12, "-", btn_fadeout_down },

    /* Auto-vibrato buttons */
    { RPANEL_X + 80,  132, 44, 12, "TYPE>", btn_vib_type_next },
    { RPANEL_X + 80,  148, 20, 12, "+", btn_vib_sweep_up   },
    { RPANEL_X + 104, 148, 20, 12, "-", btn_vib_sweep_down },
    { RPANEL_X + 80,  164, 20, 12, "+", btn_vib_depth_up   },
    { RPANEL_X + 104, 164, 20, 12, "-", btn_vib_depth_down },
    { RPANEL_X + 80,  180, 20, 12, "+", btn_vib_rate_up   },
    { RPANEL_X + 104, 180, 20, 12, "-", btn_vib_rate_down },
};
#define NUM_BUTTONS (sizeof(g_buttons) / sizeof(g_buttons[0]))

/* ── Button actions ────────────────────────────────────────────── */

static void btn_wave_show_all(void) {
    g_wave_view_start = 0;
    g_wave_view_size = g_pcm_len > 0 ? g_pcm_len : 1;
    g_dirty = 1;
}

static void btn_wave_zoom_in(void) {
    if (g_pcm_len <= 0) return;
    int ns = g_wave_view_size / 2;
    if (ns < WAVE_W) ns = WAVE_W;
    int center = g_wave_view_start + g_wave_view_size / 2;
    g_wave_view_start = center - ns / 2;
    if (g_wave_view_start < 0) g_wave_view_start = 0;
    g_wave_view_size = ns;
    if (g_wave_view_start + g_wave_view_size > g_pcm_len)
        g_wave_view_start = g_pcm_len - g_wave_view_size;
    if (g_wave_view_start < 0) g_wave_view_start = 0;
    g_dirty = 1;
}

static void btn_wave_zoom_out(void) {
    if (g_pcm_len <= 0) return;
    int ns = g_wave_view_size * 2;
    if (ns > g_pcm_len) ns = g_pcm_len;
    int center = g_wave_view_start + g_wave_view_size / 2;
    g_wave_view_start = center - ns / 2;
    if (g_wave_view_start < 0) g_wave_view_start = 0;
    g_wave_view_size = ns;
    if (g_wave_view_start + g_wave_view_size > g_pcm_len)
        g_wave_view_start = g_pcm_len - g_wave_view_size;
    if (g_wave_view_start < 0) g_wave_view_start = 0;
    g_dirty = 1;
}

static void btn_loop_type_next(void) {
    g_loop_type = (g_loop_type + 1) % 3;
    js_on_loop_change(g_loop_start, g_loop_length, g_loop_type);
    g_dirty = 1;
}

static void btn_vol_env_toggle(void) {
    g_vol_env.enabled = !g_vol_env.enabled;
    js_on_vol_env_flags_change(g_vol_env.enabled, g_vol_env.sustain_point,
        g_vol_env.loop_start_point, g_vol_env.loop_end_point, g_vol_env.num_points);
    g_dirty = 1;
}

static void btn_pan_env_toggle(void) {
    g_pan_env.enabled = !g_pan_env.enabled;
    js_on_pan_env_flags_change(g_pan_env.enabled, g_pan_env.sustain_point,
        g_pan_env.loop_start_point, g_pan_env.loop_end_point, g_pan_env.num_points);
    g_dirty = 1;
}

static void env_add_point(Envelope *env, int is_vol) {
    if (env->num_points >= MAX_ENV_POINTS) return;
    /* Add a new point between the last two */
    int last = env->num_points - 1;
    if (last < 1) last = 1;
    int new_tick = (env->points[last - 1].tick + env->points[last].tick) / 2;
    int new_val  = (env->points[last - 1].value + env->points[last].value) / 2;

    /* Shift last point right */
    env->points[env->num_points] = env->points[last];
    env->points[last].tick = new_tick;
    env->points[last].value = new_val;
    env->num_points++;

    if (is_vol) {
        js_on_vol_env_flags_change(env->enabled, env->sustain_point,
            env->loop_start_point, env->loop_end_point, env->num_points);
    } else {
        js_on_pan_env_flags_change(env->enabled, env->sustain_point,
            env->loop_start_point, env->loop_end_point, env->num_points);
    }
    g_dirty = 1;
}

static void env_del_point(Envelope *env, int is_vol) {
    if (env->num_points <= 2) return;
    if (env->selected_point <= 0 || env->selected_point >= env->num_points) return;

    /* Remove selected point, shift rest left */
    for (int i = env->selected_point; i < env->num_points - 1; i++)
        env->points[i] = env->points[i + 1];
    env->num_points--;
    env->selected_point = -1;

    /* Adjust sustain/loop indices */
    if (env->sustain_point >= env->num_points) env->sustain_point = env->num_points - 1;
    if (env->loop_start_point >= env->num_points) env->loop_start_point = -1;
    if (env->loop_end_point >= env->num_points) env->loop_end_point = -1;

    if (is_vol) {
        js_on_vol_env_flags_change(env->enabled, env->sustain_point,
            env->loop_start_point, env->loop_end_point, env->num_points);
    } else {
        js_on_pan_env_flags_change(env->enabled, env->sustain_point,
            env->loop_start_point, env->loop_end_point, env->num_points);
    }
    g_dirty = 1;
}

static void btn_vol_add_point(void) { env_add_point(&g_vol_env, 1); }
static void btn_vol_del_point(void) { env_del_point(&g_vol_env, 1); }
static void btn_pan_add_point(void) { env_add_point(&g_pan_env, 0); }
static void btn_pan_del_point(void) { env_del_point(&g_pan_env, 0); }

/* Param buttons */
static void btn_vol_up(void)   { if (g_volume < 64) { g_volume++; js_on_param_change(FT2_VOLUME, g_volume); g_dirty = 1; } }
static void btn_vol_down(void) { if (g_volume > 0) { g_volume--; js_on_param_change(FT2_VOLUME, g_volume); g_dirty = 1; } }
static void btn_pan_up(void)   { if (g_panning < 255) { g_panning++; js_on_param_change(FT2_PANNING, g_panning); g_dirty = 1; } }
static void btn_pan_down(void) { if (g_panning > 0) { g_panning--; js_on_param_change(FT2_PANNING, g_panning); g_dirty = 1; } }
static void btn_fine_up(void)  { if (g_finetune < 127) { g_finetune++; js_on_param_change(FT2_FINETUNE, g_finetune); g_dirty = 1; } }
static void btn_fine_down(void){ if (g_finetune > -128) { g_finetune--; js_on_param_change(FT2_FINETUNE, g_finetune); g_dirty = 1; } }
static void btn_fadeout_up(void)  { if (g_fadeout < 4095) { g_fadeout += 16; if (g_fadeout > 4095) g_fadeout = 4095; js_on_param_change(FT2_FADEOUT, g_fadeout); g_dirty = 1; } }
static void btn_fadeout_down(void){ if (g_fadeout > 0) { g_fadeout -= 16; if (g_fadeout < 0) g_fadeout = 0; js_on_param_change(FT2_FADEOUT, g_fadeout); g_dirty = 1; } }

static void btn_vib_type_next(void) { g_vib_type = (g_vib_type + 1) % 4; js_on_param_change(FT2_VIB_TYPE, g_vib_type); g_dirty = 1; }
static void btn_vib_sweep_up(void)  { if (g_vib_sweep < 255) { g_vib_sweep++; js_on_param_change(FT2_VIB_SWEEP, g_vib_sweep); g_dirty = 1; } }
static void btn_vib_sweep_down(void){ if (g_vib_sweep > 0) { g_vib_sweep--; js_on_param_change(FT2_VIB_SWEEP, g_vib_sweep); g_dirty = 1; } }
static void btn_vib_depth_up(void)  { if (g_vib_depth < 15) { g_vib_depth++; js_on_param_change(FT2_VIB_DEPTH, g_vib_depth); g_dirty = 1; } }
static void btn_vib_depth_down(void){ if (g_vib_depth > 0) { g_vib_depth--; js_on_param_change(FT2_VIB_DEPTH, g_vib_depth); g_dirty = 1; } }
static void btn_vib_rate_up(void)  { if (g_vib_rate < 63) { g_vib_rate++; js_on_param_change(FT2_VIB_RATE, g_vib_rate); g_dirty = 1; } }
static void btn_vib_rate_down(void){ if (g_vib_rate > 0) { g_vib_rate--; js_on_param_change(FT2_VIB_RATE, g_vib_rate); g_dirty = 1; } }

/* ── Envelope rendering ────────────────────────────────────────── */

static void render_envelope(int x, int y, int w, int h, Envelope *env,
                             const char *label, int is_vol) {
    /* Background */
    fb_rect(x, y, w, h, COL_ENV_BG);

    /* Grid lines */
    for (int gx = 0; gx < w; gx += 25)
        fb_vline(x + gx, y, h, COL_ENV_GRID);
    for (int gy = 0; gy < h; gy += 16)
        fb_hline(x, y + gy, w, COL_ENV_GRID);

    /* Center line for panning */
    if (!is_vol)
        fb_hline(x, y + h / 2, w, COL_CENTER);

    /* Border */
    fb_hline(x, y, w, COL_DSKTOP2);
    fb_vline(x, y, h, COL_DSKTOP2);
    fb_hline(x, y + h - 1, w, COL_DSKTOP1);
    fb_vline(x + w - 1, y, h, COL_DSKTOP1);

    /* Draw envelope lines */
    if (env->num_points >= 2) {
        for (int i = 0; i < env->num_points - 1; i++) {
            int x0 = x + env->points[i].tick;
            int y0 = y + h - 1 - (int)((double)env->points[i].value / 64 * (h - 1));
            int x1 = x + env->points[i + 1].tick;
            int y1 = y + h - 1 - (int)((double)env->points[i + 1].value / 64 * (h - 1));

            /* Bresenham line */
            int dx = abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
            int dy = -abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
            int err = dx + dy;
            while (1) {
                fb_pixel(x0, y0, COL_ENV_LINE);
                if (x0 == x1 && y0 == y1) break;
                int e2 = 2 * err;
                if (e2 >= dy) { err += dy; x0 += sx; }
                if (e2 <= dx) { err += dx; y0 += sy; }
            }
        }
    }

    /* Draw sustain marker */
    if (env->sustain_point >= 0 && env->sustain_point < env->num_points) {
        int sx = x + env->points[env->sustain_point].tick;
        for (int dy = 0; dy < h; dy += 3)
            fb_pixel(sx, y + dy, COL_ENV_SUST);
    }

    /* Draw loop markers */
    if (env->loop_start_point >= 0 && env->loop_start_point < env->num_points) {
        int lx = x + env->points[env->loop_start_point].tick;
        for (int dy = 0; dy < h; dy += 2)
            fb_pixel(lx, y + dy, COL_ENV_LOOP);
    }
    if (env->loop_end_point >= 0 && env->loop_end_point < env->num_points) {
        int lx = x + env->points[env->loop_end_point].tick;
        for (int dy = 0; dy < h; dy += 2)
            fb_pixel(lx, y + dy, COL_ENV_LOOP);
    }

    /* Draw points */
    for (int i = 0; i < env->num_points; i++) {
        int px = x + env->points[i].tick;
        int py = y + h - 1 - (int)((double)env->points[i].value / 64 * (h - 1));
        uint32_t col = (i == env->selected_point) ? COL_ENV_PT_SEL : COL_ENV_PT;
        fb_rect(px - 2, py - 2, 5, 5, col);
    }

    /* Label and enabled indicator */
    fb_text(x + w + 4, y + 2, label, COL_TEXT);
    if (env->enabled) {
        fb_text(x + w + 4, y + 12, "ON", COL_ENV_SUST);
    } else {
        fb_text(x + w + 4, y + 12, "OFF", COL_DSKTOP2);
    }

    /* Point count */
    {
        char buf[16];
        snprintf(buf, sizeof(buf), "Pts: %d", env->num_points);
        fb_text(x + w + 4, y + 22, buf, COL_TEXT);
    }
}

/* ── Waveform rendering ───────────────────────────────────────── */

static int wave_sample_to_screen(int samp) {
    if (g_wave_view_size <= 0) return WAVE_X;
    return WAVE_X + (int)(((double)(samp - g_wave_view_start) / g_wave_view_size) * WAVE_W);
}

static int wave_screen_to_sample(int sx) {
    if (g_wave_view_size <= 0) return 0;
    double frac = (double)(sx - WAVE_X) / WAVE_W;
    int sample = g_wave_view_start + (int)(frac * g_wave_view_size);
    if (sample < 0) sample = 0;
    if (sample >= g_pcm_len) sample = g_pcm_len - 1;
    return sample;
}

static void render_waveform(void) {
    int cy = WAVE_Y + WAVE_H / 2;

    fb_rect(WAVE_X, WAVE_Y, WAVE_W, WAVE_H, COL_WAVE_BG);
    fb_hline(WAVE_X, cy, WAVE_W, COL_CENTER);

    if (!g_pcm || g_pcm_len <= 0) return;

    /* Min/max peak detection */
    for (int col = 0; col < WAVE_W; col++) {
        int s0 = g_wave_view_start + (int)((double)col / WAVE_W * g_wave_view_size);
        int s1 = g_wave_view_start + (int)((double)(col + 1) / WAVE_W * g_wave_view_size);
        if (s0 < 0) s0 = 0;
        if (s1 < 0) s1 = 0;
        if (s0 >= g_pcm_len) s0 = g_pcm_len - 1;
        if (s1 >= g_pcm_len) s1 = g_pcm_len - 1;
        if (s1 <= s0) s1 = s0 + 1;

        int vmin = 32767, vmax = -32768;
        for (int i = s0; i < s1 && i < g_pcm_len; i++) {
            int v = g_pcm[i];
            if (v < vmin) vmin = v;
            if (v > vmax) vmax = v;
        }

        int y_max = cy - (int)((double)vmax / 32768.0 * (WAVE_H / 2));
        int y_min = cy - (int)((double)vmin / 32768.0 * (WAVE_H / 2));

        if (y_max < WAVE_Y) y_max = WAVE_Y;
        if (y_min >= WAVE_Y + WAVE_H) y_min = WAVE_Y + WAVE_H - 1;
        if (y_max > y_min) { int t = y_max; y_max = y_min; y_min = t; }

        for (int y = y_max; y <= y_min; y++)
            fb_pixel(WAVE_X + col, y, COL_WAVE_FG);
    }

    /* Loop markers */
    if (g_loop_type > 0 && g_loop_length > 0) {
        int lx_start = wave_sample_to_screen(g_loop_start);
        int lx_end   = wave_sample_to_screen(g_loop_start + g_loop_length);

        /* Loop start pin (small triangle) */
        if (lx_start >= WAVE_X && lx_start < WAVE_X + WAVE_W) {
            fb_vline(lx_start, WAVE_Y, WAVE_H, COL_LOOP_PIN);
            for (int i = 0; i < 5; i++)
                fb_hline(lx_start, WAVE_Y + i, 5 - i, COL_LOOP_PIN);
        }
        /* Loop end pin */
        if (lx_end >= WAVE_X && lx_end < WAVE_X + WAVE_W) {
            fb_vline(lx_end, WAVE_Y, WAVE_H, COL_LOOP_PIN);
            for (int i = 0; i < 5; i++)
                fb_hline(lx_end - (4 - i), WAVE_Y + i, 5 - i, COL_LOOP_PIN);
        }
    }
}

/* ── Scrollbar ─────────────────────────────────────────────────── */

static void render_scrollbar(void) {
    fb_rect(SCROLL_X, SCROLL_Y, SCROLL_W, SCROLL_H, COL_BCKGRND);

    if (g_pcm_len <= 0) return;

    double frac_start = (double)g_wave_view_start / g_pcm_len;
    double frac_size  = (double)g_wave_view_size / g_pcm_len;
    int thumb_x = SCROLL_X + (int)(frac_start * SCROLL_W);
    int thumb_w = (int)(frac_size * SCROLL_W);
    if (thumb_w < 8) thumb_w = 8;
    if (thumb_x + thumb_w > SCROLL_X + SCROLL_W)
        thumb_x = SCROLL_X + SCROLL_W - thumb_w;

    fb_rect(thumb_x, SCROLL_Y, thumb_w, SCROLL_H, COL_BUTTONS);
    fb_hline(thumb_x, SCROLL_Y, thumb_w, COL_DSKTOP1);
    fb_hline(thumb_x, SCROLL_Y + SCROLL_H - 1, thumb_w, COL_DSKTOP2);
}

/* ── Main render ───────────────────────────────────────────────── */

static void ft2_render(void) {
    /* Clear to desktop color */
    for (int i = 0; i < SCREEN_W * SCREEN_H; i++)
        g_fb[i] = COL_DESKTOP;

    /* ── Title bar ──────────────────────────────────────────── */
    fb_rect(0, 0, SCREEN_W, 16, COL_BCKGRND);
    fb_text_centered(0, 0, SCREEN_W, 16, "INSTRUMENT EDITOR", COL_TEXT);
    fb_hline(0, 16, SCREEN_W, COL_DSKTOP1);

    /* ── Section labels ──────────────────────────────────────── */
    fb_text(ENV_X, VOL_ENV_Y - 24, "VOLUME ENVELOPE", COL_TEXT);
    fb_text(ENV_X, PAN_ENV_Y - 24, "PANNING ENVELOPE", COL_TEXT);

    /* ── Volume envelope ─────────────────────────────────────── */
    render_envelope(ENV_X, VOL_ENV_Y, ENV_W, ENV_H, &g_vol_env, "Vol", 1);

    /* ── Panning envelope ────────────────────────────────────── */
    render_envelope(ENV_X, PAN_ENV_Y, ENV_W, ENV_H, &g_pan_env, "Pan", 0);

    /* ── Right panel: Parameters ─────────────────────────────── */
    fb_rect(RPANEL_X - 4, 20, RPANEL_W + 4, 200, COL_BCKGRND);
    fb_hline(RPANEL_X - 4, 20, RPANEL_W + 4, COL_DSKTOP2);
    fb_vline(RPANEL_X - 4, 20, 200, COL_DSKTOP2);
    fb_hline(RPANEL_X - 4, 219, RPANEL_W + 4, COL_DSKTOP1);
    fb_vline(RPANEL_X + RPANEL_W - 1, 20, 200, COL_DSKTOP1);

    fb_text(RPANEL_X, 24, "SAMPLE PARAMETERS", COL_TEXTMRK);

    fb_number(RPANEL_X, 38, "Volume:  ", g_volume, 3);
    fb_number(RPANEL_X, 54, "Panning: ", g_panning, 3);
    fb_number(RPANEL_X, 70, "Finetune:", g_finetune, 4);
    fb_number(RPANEL_X, 86, "RelNote: ", g_relative_note, 3);
    fb_number(RPANEL_X, 102, "Fadeout: ", g_fadeout, 4);

    /* Loop type display */
    {
        const char *lt_str = g_loop_type == 0 ? "Off" :
                             g_loop_type == 1 ? "Forward" : "PingPong";
        fb_text(RPANEL_X, 118, "Loop: ", COL_TEXT);
        fb_text(RPANEL_X + 30, 118, lt_str, COL_TEXTMRK);
    }

    /* Auto-vibrato section */
    fb_text(RPANEL_X, 134, "AUTO-VIBRATO", COL_TEXTMRK);
    {
        const char *vt_names[] = { "Sine", "Square", "RampDn", "RampUp" };
        fb_text(RPANEL_X, 148 - 12, "Type: ", COL_TEXT);
        fb_text(RPANEL_X + 30, 148 - 12, vt_names[g_vib_type & 3], COL_TEXTMRK);
    }
    fb_number(RPANEL_X, 150, "Sweep:   ", g_vib_sweep, 3);
    fb_number(RPANEL_X, 166, "Depth:   ", g_vib_depth, 2);
    fb_number(RPANEL_X, 182, "Rate:    ", g_vib_rate, 2);

    /* ── Buttons ─────────────────────────────────────────────── */
    for (int i = 0; i < (int)NUM_BUTTONS; i++) {
        Button *b = &g_buttons[i];
        fb_button(b->x, b->y, b->w, b->h, b->label, 0);
    }

    /* ── Waveform ────────────────────────────────────────────── */
    fb_text(4, WAVE_Y - 24, "SAMPLE WAVEFORM", COL_TEXT);
    render_waveform();
    render_scrollbar();

    /* ── Status line ─────────────────────────────────────────── */
    fb_rect(0, SCREEN_H - 6, SCREEN_W, 6, COL_BCKGRND);

    /* Push framebuffer to canvas via JS putImageData */
    js_push_frame(g_fb, SCREEN_W, SCREEN_H);
}

/* ── Envelope mouse interaction ────────────────────────────────── */

static int env_hit_test(Envelope *env, int ex, int ey, int env_x, int env_y, int env_h) {
    for (int i = 0; i < env->num_points; i++) {
        int px = env_x + env->points[i].tick;
        int py = env_y + env_h - 1 - (int)((double)env->points[i].value / 64 * (env_h - 1));
        if (abs(ex - px) <= 3 && abs(ey - py) <= 3)
            return i;
    }
    return -1;
}

static void env_drag_point(Envelope *env, int point_idx, int ex, int ey,
                            int env_x, int env_y, int env_w, int env_h, int is_vol) {
    if (point_idx < 0 || point_idx >= env->num_points) return;

    /* X: convert screen to tick */
    int tick = ex - env_x;
    if (tick < 0) tick = 0;
    if (tick >= env_w) tick = env_w - 1;

    /* First point always at tick 0 */
    if (point_idx == 0) tick = 0;

    /* Must be monotonically increasing */
    if (point_idx > 0 && tick <= env->points[point_idx - 1].tick)
        tick = env->points[point_idx - 1].tick + 1;
    if (point_idx < env->num_points - 1 && tick >= env->points[point_idx + 1].tick)
        tick = env->points[point_idx + 1].tick - 1;

    /* Y: convert screen to value */
    int value = (int)((double)(env_y + env_h - 1 - ey) / (env_h - 1) * 64);
    if (value < 0) value = 0;
    if (value > 64) value = 64;

    env->points[point_idx].tick = tick;
    env->points[point_idx].value = value;

    /* Fire callback */
    if (is_vol)
        js_on_vol_env_change(point_idx, tick, value);
    else
        js_on_pan_env_change(point_idx, tick, value);

    g_dirty = 1;
}

/* ── Input handling (exported, called from React) ─────────────── */

void ft2_sampled_on_mouse_down(int mx, int my) {
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

    /* Volume envelope area */
    if (mx >= ENV_X && mx < ENV_X + ENV_W &&
        my >= VOL_ENV_Y && my < VOL_ENV_Y + ENV_H) {
        int idx = env_hit_test(&g_vol_env, mx, my, ENV_X, VOL_ENV_Y, ENV_H);
        if (idx >= 0) {
            g_vol_env.selected_point = idx;
            g_dragging_vol_env = idx + 1;
            g_focus = FOCUS_VOL_ENV;
            g_dirty = 1;
        } else {
            g_vol_env.selected_point = -1;
            g_dirty = 1;
        }
        return;
    }

    /* Panning envelope area */
    if (mx >= ENV_X && mx < ENV_X + ENV_W &&
        my >= PAN_ENV_Y && my < PAN_ENV_Y + ENV_H) {
        int idx = env_hit_test(&g_pan_env, mx, my, ENV_X, PAN_ENV_Y, ENV_H);
        if (idx >= 0) {
            g_pan_env.selected_point = idx;
            g_dragging_pan_env = idx + 1;
            g_focus = FOCUS_PAN_ENV;
            g_dirty = 1;
        } else {
            g_pan_env.selected_point = -1;
            g_dirty = 1;
        }
        return;
    }

    /* Scrollbar */
    if (my >= SCROLL_Y && my < SCROLL_Y + SCROLL_H &&
        mx >= SCROLL_X && mx < SCROLL_X + SCROLL_W) {
        if (g_pcm_len > 0) {
            double frac_start = (double)g_wave_view_start / g_pcm_len;
            int thumb_x = SCROLL_X + (int)(frac_start * SCROLL_W);
            g_scroll_drag_offset = mx - thumb_x;
            g_dragging_scroll = 1;
        }
        return;
    }

    /* Waveform area — loop markers */
    if (my >= WAVE_Y && my < WAVE_Y + WAVE_H &&
        mx >= WAVE_X && mx < WAVE_X + WAVE_W) {
        g_focus = FOCUS_WAVEFORM;

        if (g_loop_type > 0 && g_loop_length > 0) {
            int lx_start = wave_sample_to_screen(g_loop_start);
            int lx_end   = wave_sample_to_screen(g_loop_start + g_loop_length);

            if (abs(mx - lx_start) <= 4) {
                g_dragging_loop_start = 1;
                return;
            }
            if (abs(mx - lx_end) <= 4) {
                g_dragging_loop_end = 1;
                return;
            }
        }
    }
}

void ft2_sampled_on_mouse_up(int mx, int my) {
    (void)mx; (void)my;
    if (g_dragging_loop_start || g_dragging_loop_end) {
        js_on_loop_change(g_loop_start, g_loop_length, g_loop_type);
    }
    g_mouse_down = 0;
    g_dragging_vol_env = 0;
    g_dragging_pan_env = 0;
    g_dragging_loop_start = 0;
    g_dragging_loop_end = 0;
    g_dragging_scroll = 0;
}

void ft2_sampled_on_mouse_move(int mx, int my) {
    g_mouse_x = mx;
    g_mouse_y = my;

    if (g_dragging_vol_env > 0) {
        env_drag_point(&g_vol_env, g_dragging_vol_env - 1,
                       mx, my, ENV_X, VOL_ENV_Y, ENV_W, ENV_H, 1);
    } else if (g_dragging_pan_env > 0) {
        env_drag_point(&g_pan_env, g_dragging_pan_env - 1,
                       mx, my, ENV_X, PAN_ENV_Y, ENV_W, ENV_H, 0);
    } else if (g_dragging_scroll) {
        if (g_pcm_len > 0) {
            double frac = (double)(mx - SCROLL_X - g_scroll_drag_offset) / SCROLL_W;
            g_wave_view_start = (int)(frac * g_pcm_len);
            if (g_wave_view_start < 0) g_wave_view_start = 0;
            if (g_wave_view_start + g_wave_view_size > g_pcm_len)
                g_wave_view_start = g_pcm_len - g_wave_view_size;
            if (g_wave_view_start < 0) g_wave_view_start = 0;
            g_dirty = 1;
        }
    } else if (g_dragging_loop_start) {
        int samp = wave_screen_to_sample(mx);
        int end = g_loop_start + g_loop_length;
        g_loop_start = samp;
        if (g_loop_start < 0) g_loop_start = 0;
        if (g_loop_start >= end) g_loop_start = end - 1;
        g_loop_length = end - g_loop_start;
        g_dirty = 1;
    } else if (g_dragging_loop_end) {
        int samp = wave_screen_to_sample(mx);
        if (samp <= g_loop_start) samp = g_loop_start + 1;
        if (samp > g_pcm_len) samp = g_pcm_len;
        g_loop_length = samp - g_loop_start;
        g_dirty = 1;
    }
}

void ft2_sampled_on_wheel(int delta_y, int mx, int my) {
    g_mouse_x = mx;
    g_mouse_y = my;

    /* Zoom waveform */
    if (my >= WAVE_Y && my < WAVE_Y + WAVE_H) {
        if (delta_y < 0) btn_wave_zoom_in();
        else if (delta_y > 0) btn_wave_zoom_out();
    }
}

/* key_code uses DOM KeyboardEvent.keyCode values */
#define KEY_LEFT  37
#define KEY_RIGHT 39

void ft2_sampled_on_key_down(int key_code) {
    switch (key_code) {
    case KEY_LEFT:
        g_wave_view_start -= g_wave_view_size / 8;
        if (g_wave_view_start < 0) g_wave_view_start = 0;
        g_dirty = 1;
        break;
    case KEY_RIGHT:
        g_wave_view_start += g_wave_view_size / 8;
        if (g_wave_view_start + g_wave_view_size > g_pcm_len)
            g_wave_view_start = g_pcm_len - g_wave_view_size;
        if (g_wave_view_start < 0) g_wave_view_start = 0;
        g_dirty = 1;
        break;
    default:
        break;
    }
}

/* ── Main loop tick ────────────────────────────────────────────── */

static void ft2_sampled_tick(void) {
    if (g_dirty) {
        ft2_render();
        g_dirty = 0;
    }
}

/* ── Public API ────────────────────────────────────────────────── */

void ft2_sampled_init(int w, int h) {
    (void)w; (void)h;

    memset(g_fb, 0, sizeof(g_fb));
    hwui_set_fb_size(SCREEN_W, SCREEN_H);

    g_wave_view_start = 0;
    g_wave_view_size = 1;
    g_dirty = 1;
}

void ft2_sampled_start(void) {
    emscripten_set_main_loop(ft2_sampled_tick, 60, 0);
}

void ft2_sampled_shutdown(void) {
    emscripten_cancel_main_loop();
    if (g_pcm) { free(g_pcm); g_pcm = NULL; }
    g_pcm_len = 0;
}

void ft2_sampled_load_pcm(const int16_t *data, int length) {
    if (g_pcm) free(g_pcm);
    g_pcm = (int16_t *)malloc(length * sizeof(int16_t));
    if (!g_pcm) { g_pcm_len = 0; return; }
    memcpy(g_pcm, data, length * sizeof(int16_t));
    g_pcm_len = length;

    g_wave_view_start = 0;
    g_wave_view_size = length > 0 ? length : 1;
    g_dirty = 1;
}

void ft2_sampled_set_param(int param_id, int value) {
    switch (param_id) {
    case FT2_VOLUME:         g_volume = value < 0 ? 0 : (value > 64 ? 64 : value); break;
    case FT2_PANNING:        g_panning = value < 0 ? 0 : (value > 255 ? 255 : value); break;
    case FT2_FINETUNE:       g_finetune = value < -128 ? -128 : (value > 127 ? 127 : value); break;
    case FT2_RELATIVE_NOTE:  g_relative_note = value; break;
    case FT2_LOOP_TYPE:      g_loop_type = value % 3; break;
    case FT2_FADEOUT:        g_fadeout = value < 0 ? 0 : (value > 4095 ? 4095 : value); break;
    case FT2_VIB_TYPE:       g_vib_type = value % 4; break;
    case FT2_VIB_SWEEP:      g_vib_sweep = value & 0xFF; break;
    case FT2_VIB_DEPTH:      g_vib_depth = value < 0 ? 0 : (value > 15 ? 15 : value); break;
    case FT2_VIB_RATE:       g_vib_rate = value < 0 ? 0 : (value > 63 ? 63 : value); break;
    case FT2_VOL_ENV_ON:     g_vol_env.enabled = value; break;
    case FT2_VOL_ENV_SUSTAIN: g_vol_env.sustain_point = value; break;
    case FT2_VOL_ENV_LOOP_START: g_vol_env.loop_start_point = value; break;
    case FT2_VOL_ENV_LOOP_END:   g_vol_env.loop_end_point = value; break;
    case FT2_VOL_ENV_NUM_POINTS: g_vol_env.num_points = value < 2 ? 2 : (value > 12 ? 12 : value); break;
    case FT2_PAN_ENV_ON:     g_pan_env.enabled = value; break;
    case FT2_PAN_ENV_SUSTAIN: g_pan_env.sustain_point = value; break;
    case FT2_PAN_ENV_LOOP_START: g_pan_env.loop_start_point = value; break;
    case FT2_PAN_ENV_LOOP_END:   g_pan_env.loop_end_point = value; break;
    case FT2_PAN_ENV_NUM_POINTS: g_pan_env.num_points = value < 2 ? 2 : (value > 12 ? 12 : value); break;
    default: break;
    }
    g_dirty = 1;
}

int ft2_sampled_get_param(int param_id) {
    switch (param_id) {
    case FT2_VOLUME:         return g_volume;
    case FT2_PANNING:        return g_panning;
    case FT2_FINETUNE:       return g_finetune;
    case FT2_RELATIVE_NOTE:  return g_relative_note;
    case FT2_LOOP_TYPE:      return g_loop_type;
    case FT2_FADEOUT:        return g_fadeout;
    case FT2_VIB_TYPE:       return g_vib_type;
    case FT2_VIB_SWEEP:      return g_vib_sweep;
    case FT2_VIB_DEPTH:      return g_vib_depth;
    case FT2_VIB_RATE:       return g_vib_rate;
    case FT2_VOL_ENV_ON:     return g_vol_env.enabled;
    case FT2_VOL_ENV_SUSTAIN: return g_vol_env.sustain_point;
    case FT2_VOL_ENV_LOOP_START: return g_vol_env.loop_start_point;
    case FT2_VOL_ENV_LOOP_END:   return g_vol_env.loop_end_point;
    case FT2_VOL_ENV_NUM_POINTS: return g_vol_env.num_points;
    case FT2_PAN_ENV_ON:     return g_pan_env.enabled;
    case FT2_PAN_ENV_SUSTAIN: return g_pan_env.sustain_point;
    case FT2_PAN_ENV_LOOP_START: return g_pan_env.loop_start_point;
    case FT2_PAN_ENV_LOOP_END:   return g_pan_env.loop_end_point;
    case FT2_PAN_ENV_NUM_POINTS: return g_pan_env.num_points;
    default: return 0;
    }
}

void ft2_sampled_set_loop(int loop_start, int loop_length, int loop_type) {
    g_loop_start = loop_start;
    g_loop_length = loop_length;
    g_loop_type = loop_type;
    g_dirty = 1;
}

void ft2_sampled_set_vol_env_point(int index, int tick, int value) {
    if (index < 0 || index >= MAX_ENV_POINTS) return;
    g_vol_env.points[index].tick = tick;
    g_vol_env.points[index].value = value;
    g_dirty = 1;
}

void ft2_sampled_set_pan_env_point(int index, int tick, int value) {
    if (index < 0 || index >= MAX_ENV_POINTS) return;
    g_pan_env.points[index].tick = tick;
    g_pan_env.points[index].value = value;
    g_dirty = 1;
}

void ft2_sampled_load_config(const uint8_t *buf, int len) {
    if (len < 20) return;

    g_volume        = buf[0];
    g_panning       = buf[1];
    g_finetune      = (int16_t)((uint16_t)buf[2] | ((uint16_t)buf[3] << 8));
    g_relative_note = (int8_t)buf[4];
    g_loop_type     = buf[5];
    g_loop_start    = (int32_t)((uint32_t)buf[6] | ((uint32_t)buf[7] << 8) |
                                ((uint32_t)buf[8] << 16) | ((uint32_t)buf[9] << 24));
    g_loop_length   = (int32_t)((uint32_t)buf[10] | ((uint32_t)buf[11] << 8) |
                                ((uint32_t)buf[12] << 16) | ((uint32_t)buf[13] << 24));
    g_fadeout       = (uint16_t)buf[14] | ((uint16_t)buf[15] << 8);
    g_vib_type      = buf[16];
    g_vib_sweep     = buf[17];
    g_vib_depth     = buf[18];
    g_vib_rate      = buf[19];

    /* Volume envelope */
    if (len >= 72) {
        int flags = buf[20];
        g_vol_env.enabled = flags & 1;
        g_vol_env.sustain_point = (int8_t)buf[21];
        g_vol_env.loop_start_point = (int8_t)buf[22];
        g_vol_env.loop_end_point = (int8_t)buf[23];
        for (int i = 0; i < MAX_ENV_POINTS; i++) {
            int off = 24 + i * 4;
            g_vol_env.points[i].tick  = (uint16_t)buf[off] | ((uint16_t)buf[off + 1] << 8);
            g_vol_env.points[i].value = (uint16_t)buf[off + 2] | ((uint16_t)buf[off + 3] << 8);
        }
    }

    /* Panning envelope */
    if (len >= 124) {
        int flags = buf[72];
        g_pan_env.enabled = flags & 1;
        g_pan_env.sustain_point = (int8_t)buf[73];
        g_pan_env.loop_start_point = (int8_t)buf[74];
        g_pan_env.loop_end_point = (int8_t)buf[75];
        for (int i = 0; i < MAX_ENV_POINTS; i++) {
            int off = 76 + i * 4;
            g_pan_env.points[i].tick  = (uint16_t)buf[off] | ((uint16_t)buf[off + 1] << 8);
            g_pan_env.points[i].value = (uint16_t)buf[off + 2] | ((uint16_t)buf[off + 3] << 8);
        }
    }

    /* Num points */
    if (len >= 126) {
        g_vol_env.num_points = buf[124];
        if (g_vol_env.num_points < 2) g_vol_env.num_points = 2;
        if (g_vol_env.num_points > 12) g_vol_env.num_points = 12;
        g_pan_env.num_points = buf[125];
        if (g_pan_env.num_points < 2) g_pan_env.num_points = 2;
        if (g_pan_env.num_points > 12) g_pan_env.num_points = 12;
    }

    g_dirty = 1;
}

int ft2_sampled_dump_config(uint8_t *buf, int max_len) {
    if (max_len < 126) return 0;

    buf[0]  = (uint8_t)g_volume;
    buf[1]  = (uint8_t)g_panning;
    buf[2]  = (uint8_t)(g_finetune & 0xFF);
    buf[3]  = (uint8_t)((g_finetune >> 8) & 0xFF);
    buf[4]  = (uint8_t)g_relative_note;
    buf[5]  = (uint8_t)g_loop_type;
    buf[6]  = (uint8_t)(g_loop_start & 0xFF);
    buf[7]  = (uint8_t)((g_loop_start >> 8) & 0xFF);
    buf[8]  = (uint8_t)((g_loop_start >> 16) & 0xFF);
    buf[9]  = (uint8_t)((g_loop_start >> 24) & 0xFF);
    buf[10] = (uint8_t)(g_loop_length & 0xFF);
    buf[11] = (uint8_t)((g_loop_length >> 8) & 0xFF);
    buf[12] = (uint8_t)((g_loop_length >> 16) & 0xFF);
    buf[13] = (uint8_t)((g_loop_length >> 24) & 0xFF);
    buf[14] = (uint8_t)(g_fadeout & 0xFF);
    buf[15] = (uint8_t)((g_fadeout >> 8) & 0xFF);
    buf[16] = (uint8_t)g_vib_type;
    buf[17] = (uint8_t)g_vib_sweep;
    buf[18] = (uint8_t)g_vib_depth;
    buf[19] = (uint8_t)g_vib_rate;

    /* Volume envelope */
    buf[20] = (uint8_t)(g_vol_env.enabled ? 1 : 0);
    buf[21] = (uint8_t)(g_vol_env.sustain_point & 0xFF);
    buf[22] = (uint8_t)(g_vol_env.loop_start_point & 0xFF);
    buf[23] = (uint8_t)(g_vol_env.loop_end_point & 0xFF);
    for (int i = 0; i < MAX_ENV_POINTS; i++) {
        int off = 24 + i * 4;
        buf[off]     = (uint8_t)(g_vol_env.points[i].tick & 0xFF);
        buf[off + 1] = (uint8_t)((g_vol_env.points[i].tick >> 8) & 0xFF);
        buf[off + 2] = (uint8_t)(g_vol_env.points[i].value & 0xFF);
        buf[off + 3] = (uint8_t)((g_vol_env.points[i].value >> 8) & 0xFF);
    }

    /* Panning envelope */
    buf[72] = (uint8_t)(g_pan_env.enabled ? 1 : 0);
    buf[73] = (uint8_t)(g_pan_env.sustain_point & 0xFF);
    buf[74] = (uint8_t)(g_pan_env.loop_start_point & 0xFF);
    buf[75] = (uint8_t)(g_pan_env.loop_end_point & 0xFF);
    for (int i = 0; i < MAX_ENV_POINTS; i++) {
        int off = 76 + i * 4;
        buf[off]     = (uint8_t)(g_pan_env.points[i].tick & 0xFF);
        buf[off + 1] = (uint8_t)((g_pan_env.points[i].tick >> 8) & 0xFF);
        buf[off + 2] = (uint8_t)(g_pan_env.points[i].value & 0xFF);
        buf[off + 3] = (uint8_t)((g_pan_env.points[i].value >> 8) & 0xFF);
    }

    /* Num points */
    buf[124] = (uint8_t)g_vol_env.num_points;
    buf[125] = (uint8_t)g_pan_env.num_points;

    return 126;
}
