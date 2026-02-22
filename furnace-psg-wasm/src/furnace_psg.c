/*
 * furnace_psg.c — Furnace PSG Instrument Editor (SDL2/Emscripten)
 *
 * Renders PSG instrument editors for 19 chip types with:
 * - Chip-specific waveform selector buttons + duty cycle knob
 * - Envelope section (NES, GB, C64 ADSR, SNES ADSR/GAIN, AY shape)
 * - C64 SID filter section (cutoff/resonance/LP/BP/HP/ring/sync)
 * - Noise mode, PSG width, AY envelope shape extras
 *
 * Canvas: 480x360
 *
 * Layout:
 *   y=0..14    Header bar with chip name
 *   y=16..90   Waveform selector + duty knob + waveform preview
 *   y=92..200  Envelope section (varies by chip envelope_type)
 *   y=202..300 Filter section (C64/SID only)
 *   y=302..358 Noise mode and chip-specific extras
 */

#include <SDL2/SDL.h>
#include <emscripten.h>
#include <emscripten/html5.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <math.h>

#include "furnace_psg.h"
#include "hwui_common.h"

/* ── JS Callbacks ──────────────────────────────────────────────────────── */

EM_JS(void, js_on_param_change, (int param_id, int value), {
    if (Module.onParamChange) Module.onParamChange(param_id, value);
});

/* ── Param IDs (must match TypeScript side) ────────────────────────────── */

#define PARAM_WAVEFORM       0
#define PARAM_DUTY           1
#define PARAM_NOISE          2
#define PARAM_RING_MOD       3
#define PARAM_OSC_SYNC       4
#define PARAM_TO_FILTER      5
#define PARAM_FILTER_ON      6
#define PARAM_FILTER_LP      7
#define PARAM_FILTER_BP      8
#define PARAM_FILTER_HP      9
#define PARAM_ENV_0         10
#define PARAM_ENV_1         11
#define PARAM_ENV_2         12
#define PARAM_ENV_3         13
#define PARAM_ENV_4         14
#define PARAM_ENV_5         15
#define PARAM_ENV_6         16
#define PARAM_ENV_7         17
#define PARAM_FILTER_CUTOFF 18
#define PARAM_FILTER_RES    19
#define PARAM_NOISE_MODE    20
#define PARAM_PSG_WIDTH     21
#define PARAM_AY_ENV_SHAPE  22
#define PARAM_DUTY_HI       23

/* ── Layout ────────────────────────────────────────────────────────────── */

#define SCREEN_W  480
#define SCREEN_H  360

/* ── Envelope Types ────────────────────────────────────────────────────── */

#define ENV_NONE  0
#define ENV_NES   1
#define ENV_GB    2
#define ENV_C64   3
#define ENV_SNES  4
#define ENV_AY    5

/* ── Chip Info Table ───────────────────────────────────────────────────── */

typedef struct {
    const char *name;
    int has_duty;
    int duty_max;
    int has_noise;
    int has_filter;
    int envelope_type;
    int num_waveforms;
    const char *wave_names[8];
} PSGChipInfo;

static const PSGChipInfo PSG_CHIPS[PSG_CHIP_COUNT] = {
    /* 0  NES      */ { "2A03 NES",       1,   3, 1, 0, ENV_NES,  3, { "Pulse", "Triangle", "Noise", NULL, NULL, NULL, NULL, NULL } },
    /* 1  GB       */ { "Game Boy DMG",   1,   3, 1, 0, ENV_GB,   2, { "Pulse", "Wave", NULL, NULL, NULL, NULL, NULL, NULL } },
    /* 2  C64      */ { "MOS 6581 SID",   1, 255, 1, 1, ENV_C64,  4, { "Triangle", "Sawtooth", "Pulse", "Noise", NULL, NULL, NULL, NULL } },
    /* 3  SID6581  */ { "MOS 6581 SID",   1, 255, 1, 1, ENV_C64,  4, { "Triangle", "Sawtooth", "Pulse", "Noise", NULL, NULL, NULL, NULL } },
    /* 4  SID8580  */ { "MOS 8580 SID",   1, 255, 1, 1, ENV_C64,  4, { "Triangle", "Sawtooth", "Pulse", "Noise", NULL, NULL, NULL, NULL } },
    /* 5  AY       */ { "AY-3-8910",      0,   0, 1, 0, ENV_AY,   3, { "Tone", "Noise", "Envelope", NULL, NULL, NULL, NULL, NULL } },
    /* 6  PSG      */ { "SN76489 PSG",    1,   1, 1, 0, ENV_NONE, 2, { "Tone", "Noise", NULL, NULL, NULL, NULL, NULL, NULL } },
    /* 7  VIC      */ { "VIC-20",         0,   0, 0, 0, ENV_NONE, 1, { "Square", NULL, NULL, NULL, NULL, NULL, NULL, NULL } },
    /* 8  TIA      */ { "Atari TIA",      0,   0, 0, 0, ENV_NONE, 4, { "Tone", "Buzz", "Distort", "Noise", NULL, NULL, NULL, NULL } },
    /* 9  VERA     */ { "VERA PSG",       1,  63, 1, 0, ENV_NONE, 4, { "Pulse", "Saw", "Triangle", "Noise", NULL, NULL, NULL, NULL } },
    /* 10 SAA      */ { "SAA1099",        0,   0, 1, 0, ENV_NONE, 2, { "Tone", "Noise", NULL, NULL, NULL, NULL, NULL, NULL } },
    /* 11 TED      */ { "TED",            0,   0, 0, 0, ENV_NONE, 1, { "Square", NULL, NULL, NULL, NULL, NULL, NULL, NULL } },
    /* 12 VRC6     */ { "Konami VRC6",    1,   7, 0, 0, ENV_NONE, 2, { "Pulse", "Sawtooth", NULL, NULL, NULL, NULL, NULL, NULL } },
    /* 13 MMC5     */ { "MMC5",           1,   3, 0, 0, ENV_NES,  1, { "Pulse", NULL, NULL, NULL, NULL, NULL, NULL, NULL } },
    /* 14 AY8930   */ { "AY-3-8930",      1,  15, 1, 0, ENV_AY,   3, { "Tone", "Noise", "Envelope", NULL, NULL, NULL, NULL, NULL } },
    /* 15 POKEY    */ { "Atari POKEY",    0,   0, 1, 0, ENV_NONE, 3, { "Poly5", "Poly4", "Poly17", NULL, NULL, NULL, NULL, NULL } },
    /* 16 PET      */ { "Commodore PET",  0,   0, 0, 0, ENV_NONE, 1, { "Square", NULL, NULL, NULL, NULL, NULL, NULL, NULL } },
    /* 17 PCSPKR   */ { "PC Speaker",     0,   0, 0, 0, ENV_NONE, 1, { "Square", NULL, NULL, NULL, NULL, NULL, NULL, NULL } },
    /* 18 SNES     */ { "SPC700 SNES",    0,   0, 1, 0, ENV_SNES, 1, { "BRR Sample", NULL, NULL, NULL, NULL, NULL, NULL, NULL } },
};

/* ── Global State ──────────────────────────────────────────────────────── */

static SDL_Window   *g_win;
static SDL_Renderer *g_ren;
static SDL_Texture  *g_tex;
static uint32_t      g_fb[SCREEN_W * SCREEN_H];

/* Config state from buffer layout */
static int g_chip_subtype = PSG_CHIP_NES;
static int g_waveform = 0;
static int g_duty = 0;          /* Low byte of duty/pulse width */
static int g_duty_hi = 0;       /* High byte for C64 12-bit duty */
static int g_flags = 0;         /* Packed flag bits from header byte [3] */

/* Envelope params (indices 0-7 map to buffer bytes 4-11) */
static int g_env[8] = {0};

/* Filter section (C64/SID) */
static int g_filter_cutoff = 0; /* 16-bit: lo | (hi << 8) */
static int g_filter_res = 0;    /* 0-15 */
static int g_filter_flags = 0;  /* bit0=LP, bit1=BP, bit2=HP, bit3=ch3Off */

/* AY/PSG extras */
static int g_noise_mode = 0;
static int g_psg_width = 0;
static int g_ay_env_shape = 0;

/* Mouse and render state */
static int g_mouse_x = 0, g_mouse_y = 0;
static int g_mouse_down = 0;
static int g_dirty = 1;

/* ── Flag Bit Helpers ──────────────────────────────────────────────────── */

#define FLAG_NOISE      0
#define FLAG_RING_MOD   1
#define FLAG_OSC_SYNC   2
#define FLAG_TO_FILTER  3
#define FLAG_FILTER_ON  4
#define FLAG_FILTER_LP  5
#define FLAG_FILTER_BP  6
#define FLAG_FILTER_HP  7

static int flag_get(int bit) { return (g_flags >> bit) & 1; }

static void flag_set(int bit, int val) {
    if (val) g_flags |= (1 << bit);
    else     g_flags &= ~(1 << bit);
}

static void flag_toggle(int bit) {
    g_flags ^= (1 << bit);
}

/* ── Helper: Is this a C64/SID chip? ───────────────────────────────────── */

static int is_sid(void) {
    return g_chip_subtype == PSG_CHIP_C64 ||
           g_chip_subtype == PSG_CHIP_SID6581 ||
           g_chip_subtype == PSG_CHIP_SID8580;
}

/* ── Waveform Section (y=16..90) ───────────────────────────────────────── */

static void render_waveform_section(int x, int y, int w, int h) {
    const PSGChipInfo *chip = &PSG_CHIPS[g_chip_subtype];

    hwui_group_box(g_fb, SCREEN_W, x, y, w, h, "WAVEFORM", HWUI_CYAN);

    /* Waveform selector buttons */
    int btn_x = x + 6;
    int btn_y = y + 12;
    int btn_w = 64;
    int btn_h = 16;

    for (int i = 0; i < chip->num_waveforms && i < 8; i++) {
        if (chip->wave_names[i] == NULL) break;

        int pressed = (g_waveform == i) ? 1 : 0;

        /* C64/SID: waveform is a bitmask, multiple can be active */
        if (is_sid()) {
            pressed = (g_waveform & (1 << i)) ? 1 : 0;
        }

        if (hwui_button(g_fb, SCREEN_W, btn_x, btn_y, btn_w, btn_h,
                        chip->wave_names[i], pressed,
                        g_mouse_x, g_mouse_y, g_mouse_down)) {
            if (is_sid()) {
                g_waveform ^= (1 << i);
            } else {
                g_waveform = i;
            }
            js_on_param_change(PARAM_WAVEFORM, g_waveform);
            g_dirty = 1;
        }

        btn_x += btn_w + 4;
        /* Wrap to next row if needed */
        if (btn_x + btn_w > x + w - 70) {
            btn_x = x + 6;
            btn_y += btn_h + 4;
        }
    }

    /* Duty knob (if this chip supports it) */
    if (chip->has_duty && chip->duty_max > 0) {
        float new_val;
        int duty_full = g_duty;
        int duty_max = chip->duty_max;

        /* C64/SID: combine lo + hi bytes for 12-bit duty */
        if (is_sid()) {
            duty_full = g_duty | (g_duty_hi << 8);
            duty_max = 4095;
        }

        int knob_x = x + w - 50;
        int knob_y = y + 16;

        new_val = (float)duty_full;
        if (hwui_knob(g_fb, SCREEN_W, knob_x, knob_y, 14,
                      (float)duty_full, 0, (float)duty_max, "DUTY",
                      HWUI_AMBER, g_mouse_x, g_mouse_y, g_mouse_down, &new_val)) {
            int new_duty = (int)new_val;
            if (is_sid()) {
                g_duty = new_duty & 0xFF;
                g_duty_hi = (new_duty >> 8) & 0xFF;
                js_on_param_change(PARAM_DUTY, g_duty);
                js_on_param_change(PARAM_DUTY_HI, g_duty_hi);
            } else {
                g_duty = new_duty;
                js_on_param_change(PARAM_DUTY, g_duty);
            }
            g_dirty = 1;
        }

        /* Numeric value display */
        char duty_str[16];
        snprintf(duty_str, sizeof(duty_str), "%d", duty_full);
        hwui_text_centered(g_fb, SCREEN_W, knob_x - 10, knob_y + 36, 48, HWUI_FONT_H,
                           duty_str, HWUI_GRAY_LIGHT);
    }

    /* Noise toggle (if supported) */
    if (chip->has_noise) {
        int noise_on = flag_get(FLAG_NOISE);
        if (hwui_checkbox(g_fb, SCREEN_W, x + 6, y + h - 16,
                          "NOISE", noise_on,
                          g_mouse_x, g_mouse_y, g_mouse_down)) {
            flag_toggle(FLAG_NOISE);
            js_on_param_change(PARAM_NOISE, flag_get(FLAG_NOISE));
            g_dirty = 1;
        }
    }

    /* Waveform preview box */
    {
        int pvx = x + 6;
        int pvy = y + 50;
        int pvw = w - (chip->has_duty && chip->duty_max > 0 ? 80 : 12);
        int pvh = h - 58;
        if (pvh > 6) {
            hwui_panel_sunken(g_fb, SCREEN_W, pvx, pvy, pvw, pvh);

            int cx = pvx + 2, cw = pvw - 4;
            int cy = pvy + 2, ch = pvh - 4;
            int mid = cy + ch / 2;
            uint32_t col = HWUI_CYAN;

            int wave = g_waveform;

            if (is_sid()) {
                /* C64: bitmask waveforms */
                if (wave & 1) {
                    /* Triangle */
                    int qw = cw / 4;
                    hwui_line(g_fb, SCREEN_W, cx, mid, cx + qw, cy + 1, col);
                    hwui_line(g_fb, SCREEN_W, cx + qw, cy + 1, cx + qw * 3, cy + ch - 1, col);
                    hwui_line(g_fb, SCREEN_W, cx + qw * 3, cy + ch - 1, cx + cw, mid, col);
                }
                if (wave & 2) {
                    /* Sawtooth */
                    int half = cw / 2;
                    hwui_line(g_fb, SCREEN_W, cx, cy + ch - 1, cx + half, cy + 1, col);
                    hwui_vline(g_fb, SCREEN_W, cx + half, cy + 1, ch - 2, col);
                    hwui_line(g_fb, SCREEN_W, cx + half, cy + ch - 1, cx + cw, cy + 1, col);
                }
                if (wave & 4) {
                    /* Pulse */
                    int full_duty = g_duty | (g_duty_hi << 8);
                    int duty_pct = full_duty * 100 / 4095;
                    if (duty_pct < 5) duty_pct = 5;
                    int hi_w = cw * duty_pct / 100;
                    hwui_hline(g_fb, SCREEN_W, cx, cy + 1, hi_w, col);
                    hwui_vline(g_fb, SCREEN_W, cx + hi_w, cy + 1, ch - 2, col);
                    hwui_hline(g_fb, SCREEN_W, cx + hi_w, cy + ch - 1, cw - hi_w, col);
                }
                if (wave & 8) {
                    /* Noise */
                    for (int px = 0; px < cw; px += 2) {
                        int ny = cy + 1 + (((px * 7 + 13) * 31337) % (ch - 2));
                        hwui_pixel(g_fb, SCREEN_W, cx + px, ny, col);
                    }
                }
            } else if (g_chip_subtype == PSG_CHIP_NES || g_chip_subtype == PSG_CHIP_MMC5) {
                if (wave == 0) {
                    /* Pulse with NES duty (12.5/25/50/75%) */
                    int duty_pct = 12 + g_duty * 25;
                    int hi_w = cw * duty_pct / 100;
                    hwui_hline(g_fb, SCREEN_W, cx, cy + 1, hi_w, col);
                    hwui_vline(g_fb, SCREEN_W, cx + hi_w, cy + 1, ch - 2, col);
                    hwui_hline(g_fb, SCREEN_W, cx + hi_w, cy + ch - 1, cw - hi_w, col);
                } else if (wave == 1) {
                    /* Triangle */
                    int qw = cw / 4;
                    hwui_line(g_fb, SCREEN_W, cx, mid, cx + qw, cy + 1, col);
                    hwui_line(g_fb, SCREEN_W, cx + qw, cy + 1, cx + qw * 3, cy + ch - 1, col);
                    hwui_line(g_fb, SCREEN_W, cx + qw * 3, cy + ch - 1, cx + cw, mid, col);
                } else {
                    /* Noise */
                    for (int px = 0; px < cw; px += 3) {
                        int ny = cy + 1 + (((px * 7 + 13) * 31337) % (ch - 2));
                        hwui_pixel(g_fb, SCREEN_W, cx + px, ny, col);
                    }
                }
            } else if (g_chip_subtype == PSG_CHIP_GB) {
                if (wave == 0) {
                    int duty_pct = 12 + g_duty * 25;
                    int hi_w = cw * duty_pct / 100;
                    hwui_hline(g_fb, SCREEN_W, cx, cy + 1, hi_w, col);
                    hwui_vline(g_fb, SCREEN_W, cx + hi_w, cy + 1, ch - 2, col);
                    hwui_hline(g_fb, SCREEN_W, cx + hi_w, cy + ch - 1, cw - hi_w, col);
                } else {
                    /* Wave channel placeholder (sine shape) */
                    for (int px = 0; px < cw; px++) {
                        float t = (float)px / (float)cw * 6.28f;
                        int sy = mid - (int)(sinf(t) * (ch / 2 - 1));
                        hwui_pixel(g_fb, SCREEN_W, cx + px, sy, col);
                    }
                }
            } else if (g_chip_subtype == PSG_CHIP_VRC6) {
                if (wave == 0) {
                    int duty_pct = (g_duty + 1) * 100 / 8;
                    int hi_w = cw * duty_pct / 100;
                    hwui_hline(g_fb, SCREEN_W, cx, cy + 1, hi_w, col);
                    hwui_vline(g_fb, SCREEN_W, cx + hi_w, cy + 1, ch - 2, col);
                    hwui_hline(g_fb, SCREEN_W, cx + hi_w, cy + ch - 1, cw - hi_w, col);
                } else {
                    /* Sawtooth */
                    int half = cw / 2;
                    hwui_line(g_fb, SCREEN_W, cx, cy + ch - 1, cx + half, cy + 1, col);
                    hwui_vline(g_fb, SCREEN_W, cx + half, cy + 1, ch - 2, col);
                    hwui_line(g_fb, SCREEN_W, cx + half, cy + ch - 1, cx + cw, cy + 1, col);
                }
            } else if (g_chip_subtype == PSG_CHIP_VERA) {
                if (wave == 0) {
                    /* Pulse */
                    int duty_pct = (g_duty + 1) * 100 / 64;
                    if (duty_pct < 5) duty_pct = 5;
                    int hi_w = cw * duty_pct / 100;
                    hwui_hline(g_fb, SCREEN_W, cx, cy + 1, hi_w, col);
                    hwui_vline(g_fb, SCREEN_W, cx + hi_w, cy + 1, ch - 2, col);
                    hwui_hline(g_fb, SCREEN_W, cx + hi_w, cy + ch - 1, cw - hi_w, col);
                } else if (wave == 1) {
                    /* Saw */
                    int half = cw / 2;
                    hwui_line(g_fb, SCREEN_W, cx, cy + ch - 1, cx + half, cy + 1, col);
                    hwui_vline(g_fb, SCREEN_W, cx + half, cy + 1, ch - 2, col);
                    hwui_line(g_fb, SCREEN_W, cx + half, cy + ch - 1, cx + cw, cy + 1, col);
                } else if (wave == 2) {
                    /* Triangle */
                    int qw = cw / 4;
                    hwui_line(g_fb, SCREEN_W, cx, mid, cx + qw, cy + 1, col);
                    hwui_line(g_fb, SCREEN_W, cx + qw, cy + 1, cx + qw * 3, cy + ch - 1, col);
                    hwui_line(g_fb, SCREEN_W, cx + qw * 3, cy + ch - 1, cx + cw, mid, col);
                } else {
                    /* Noise */
                    for (int px = 0; px < cw; px += 2) {
                        int ny = cy + 1 + (((px * 7 + 13) * 31337) % (ch - 2));
                        hwui_pixel(g_fb, SCREEN_W, cx + px, ny, col);
                    }
                }
            } else {
                /* Default: square wave */
                int half = cw / 2;
                hwui_hline(g_fb, SCREEN_W, cx, cy + 1, half, col);
                hwui_vline(g_fb, SCREEN_W, cx + half, cy + 1, ch - 2, col);
                hwui_hline(g_fb, SCREEN_W, cx + half, cy + ch - 1, half, col);
            }
        }
    }
}

/* ── NES Envelope (y=92..200) ──────────────────────────────────────────── */

static void render_env_nes(int x, int y, int w, int h) {
    hwui_group_box(g_fb, SCREEN_W, x, y, w, h, "NES ENVELOPE", HWUI_RED);

    float new_val;
    int ky = y + 14;

    /* envValue (0-15) — volume or envelope divider period */
    new_val = (float)g_env[0];
    if (hwui_knob(g_fb, SCREEN_W, x + 20, ky, 14,
                  (float)g_env[0], 0, 15, "VOL",
                  HWUI_GREEN, g_mouse_x, g_mouse_y, g_mouse_down, &new_val)) {
        g_env[0] = (int)new_val;
        js_on_param_change(PARAM_ENV_0, g_env[0]);
        g_dirty = 1;
    }

    /* envMode toggle (0=length counter / 1=constant volume) */
    {
        const char *mode_label = g_env[1] ? "CONST" : "DECAY";
        if (hwui_button(g_fb, SCREEN_W, x + 70, ky + 6, 52, 16,
                        mode_label, g_env[1],
                        g_mouse_x, g_mouse_y, g_mouse_down)) {
            g_env[1] = !g_env[1];
            js_on_param_change(PARAM_ENV_1, g_env[1]);
            g_dirty = 1;
        }
    }

    /* Sweep controls */
    hwui_text(g_fb, SCREEN_W, x + 150, y + 10, "SWEEP", HWUI_GRAY_LIGHT);

    int sy = ky + 4;

    /* Sweep enable */
    int sweep_en = g_env[7] & 1;
    if (hwui_checkbox(g_fb, SCREEN_W, x + 150, sy,
                      "ON", sweep_en,
                      g_mouse_x, g_mouse_y, g_mouse_down)) {
        g_env[7] ^= 1;
        js_on_param_change(PARAM_ENV_7, g_env[7]);
        g_dirty = 1;
    }

    /* Sweep negate */
    int sweep_neg = (g_env[7] >> 1) & 1;
    if (hwui_checkbox(g_fb, SCREEN_W, x + 200, sy,
                      "NEG", sweep_neg,
                      g_mouse_x, g_mouse_y, g_mouse_down)) {
        g_env[7] ^= 2;
        js_on_param_change(PARAM_ENV_7, g_env[7]);
        g_dirty = 1;
    }

    /* Sweep period (0-7) */
    new_val = (float)g_env[5];
    if (hwui_knob(g_fb, SCREEN_W, x + 270, ky, 12,
                  (float)g_env[5], 0, 7, "PERIOD",
                  HWUI_CYAN, g_mouse_x, g_mouse_y, g_mouse_down, &new_val)) {
        g_env[5] = (int)new_val;
        js_on_param_change(PARAM_ENV_5, g_env[5]);
        g_dirty = 1;
    }

    /* Sweep shift (0-7) */
    new_val = (float)g_env[6];
    if (hwui_knob(g_fb, SCREEN_W, x + 340, ky, 12,
                  (float)g_env[6], 0, 7, "SHIFT",
                  HWUI_CYAN, g_mouse_x, g_mouse_y, g_mouse_down, &new_val)) {
        g_env[6] = (int)new_val;
        js_on_param_change(PARAM_ENV_6, g_env[6]);
        g_dirty = 1;
    }

    /* Envelope visualization */
    int viz_x = x + w - 120;
    int viz_y = y + h - 50;
    int viz_w = 110;
    int viz_h = 42;
    hwui_panel_sunken(g_fb, SCREEN_W, viz_x, viz_y, viz_w, viz_h);

    int vol = g_env[0];
    int env_mode = g_env[1];
    int level_y = viz_y + viz_h - 2 - (vol * (viz_h - 4)) / 15;

    if (env_mode) {
        /* Constant volume — flat line */
        hwui_hline(g_fb, SCREEN_W, viz_x + 2, level_y, viz_w - 4, HWUI_GREEN);
    } else {
        /* Decay — ramp from level down to zero */
        hwui_line(g_fb, SCREEN_W, viz_x + 2, level_y,
                  viz_x + viz_w - 2, viz_y + viz_h - 2, HWUI_GREEN);
    }
}

/* ── GB Envelope (y=92..200) ───────────────────────────────────────────── */

static void render_env_gb(int x, int y, int w, int h) {
    hwui_group_box(g_fb, SCREEN_W, x, y, w, h, "GB ENVELOPE", HWUI_GREEN);

    float new_val;
    int ky = y + 14;
    int kx = x + 20;

    /* envVol (0-15) */
    new_val = (float)g_env[0];
    if (hwui_knob(g_fb, SCREEN_W, kx, ky, 14,
                  (float)g_env[0], 0, 15, "VOL",
                  HWUI_GREEN, g_mouse_x, g_mouse_y, g_mouse_down, &new_val)) {
        g_env[0] = (int)new_val;
        js_on_param_change(PARAM_ENV_0, g_env[0]);
        g_dirty = 1;
    }
    kx += 60;

    /* envDir toggle (0=decrease, 1=increase) */
    {
        const char *dir_label = g_env[1] ? "UP" : "DOWN";
        if (hwui_button(g_fb, SCREEN_W, kx, ky + 6, 48, 16,
                        dir_label, g_env[1],
                        g_mouse_x, g_mouse_y, g_mouse_down)) {
            g_env[1] = !g_env[1];
            js_on_param_change(PARAM_ENV_1, g_env[1]);
            g_dirty = 1;
        }
    }
    kx += 60;

    /* envLen (0-7) */
    new_val = (float)g_env[2];
    if (hwui_knob(g_fb, SCREEN_W, kx, ky, 14,
                  (float)g_env[2], 0, 7, "LEN",
                  HWUI_AMBER, g_mouse_x, g_mouse_y, g_mouse_down, &new_val)) {
        g_env[2] = (int)new_val;
        js_on_param_change(PARAM_ENV_2, g_env[2]);
        g_dirty = 1;
    }

    /* GB envelope visualization */
    int viz_x = x + w - 160;
    int viz_y = y + 14;
    int viz_w = 150;
    int viz_h = h - 22;
    hwui_panel_sunken(g_fb, SCREEN_W, viz_x, viz_y, viz_w, viz_h);

    int vol = g_env[0];
    int env_dir = g_env[1];
    int env_len = g_env[2];
    int vx = viz_x + 2;

    if (env_len == 0) {
        /* No envelope — constant volume */
        int ly = viz_y + viz_h - 2 - (vol * (viz_h - 4)) / 15;
        hwui_hline(g_fb, SCREEN_W, vx, ly, viz_w - 4, HWUI_GREEN);
    } else {
        /* Stepped envelope */
        int step_w = (viz_w - 4) / 8;
        if (step_w < 4) step_w = 4;
        int cur_vol = vol;
        int prev_ly = viz_y + viz_h - 2 - (cur_vol * (viz_h - 4)) / 15;

        for (int s = 0; s < 8 && vx < viz_x + viz_w - 2; s++) {
            int ly = viz_y + viz_h - 2 - (cur_vol * (viz_h - 4)) / 15;
            hwui_hline(g_fb, SCREEN_W, vx, ly, step_w, HWUI_GREEN);
            if (s > 0) {
                int top = prev_ly < ly ? prev_ly : ly;
                int span = abs(ly - prev_ly) + 1;
                hwui_vline(g_fb, SCREEN_W, vx, top, span, HWUI_GREEN);
            }
            prev_ly = ly;
            vx += step_w;
            if (env_dir) { if (cur_vol < 15) cur_vol++; }
            else         { if (cur_vol > 0)  cur_vol--; }
        }
    }
}

/* ── C64 ADSR Envelope (y=92..200) ─────────────────────────────────────── */

static void render_env_c64(int x, int y, int w, int h) {
    hwui_group_box(g_fb, SCREEN_W, x, y, w, h, "SID ADSR", HWUI_MAGENTA);

    float new_val;
    int ky = y + 14;
    int knob_gap = 56;
    int kx = x + 14;

    /* Attack (0-15) */
    new_val = (float)g_env[0];
    if (hwui_knob(g_fb, SCREEN_W, kx, ky, 14,
                  (float)g_env[0], 0, 15, "ATK",
                  HWUI_GREEN, g_mouse_x, g_mouse_y, g_mouse_down, &new_val)) {
        g_env[0] = (int)new_val;
        js_on_param_change(PARAM_ENV_0, g_env[0]);
        g_dirty = 1;
    }
    kx += knob_gap;

    /* Decay (0-15) */
    new_val = (float)g_env[1];
    if (hwui_knob(g_fb, SCREEN_W, kx, ky, 14,
                  (float)g_env[1], 0, 15, "DEC",
                  HWUI_AMBER, g_mouse_x, g_mouse_y, g_mouse_down, &new_val)) {
        g_env[1] = (int)new_val;
        js_on_param_change(PARAM_ENV_1, g_env[1]);
        g_dirty = 1;
    }
    kx += knob_gap;

    /* Sustain (0-15) */
    new_val = (float)g_env[2];
    if (hwui_knob(g_fb, SCREEN_W, kx, ky, 14,
                  (float)g_env[2], 0, 15, "SUS",
                  HWUI_CYAN, g_mouse_x, g_mouse_y, g_mouse_down, &new_val)) {
        g_env[2] = (int)new_val;
        js_on_param_change(PARAM_ENV_2, g_env[2]);
        g_dirty = 1;
    }
    kx += knob_gap;

    /* Release (0-15) */
    new_val = (float)g_env[3];
    if (hwui_knob(g_fb, SCREEN_W, kx, ky, 14,
                  (float)g_env[3], 0, 15, "REL",
                  HWUI_ORANGE, g_mouse_x, g_mouse_y, g_mouse_down, &new_val)) {
        g_env[3] = (int)new_val;
        js_on_param_change(PARAM_ENV_3, g_env[3]);
        g_dirty = 1;
    }

    /* ADSR visualization */
    int viz_x = x + w - 160;
    int viz_y = y + 14;
    int viz_w = 150;
    int viz_h = h - 22;

    hwui_adsr_viz(g_fb, SCREEN_W, viz_x, viz_y, viz_w, viz_h,
                  g_env[0], g_env[1], g_env[2], 0, g_env[3],
                  15, 15, 15, 15,
                  HWUI_MAGENTA, (HWUI_MAGENTA & 0x00FFFFFF) | 0x30000000);
}

/* ── SNES Envelope (y=92..200) ─────────────────────────────────────────── */

static void render_env_snes(int x, int y, int w, int h) {
    hwui_group_box(g_fb, SCREEN_W, x, y, w, h, "SNES ADSR / GAIN", HWUI_BLUE_LIGHT);

    float new_val;
    int ky = y + 14;

    /* Gain mode selector dropdown */
    static const char *gain_modes[] = {
        "ADSR", "Direct", "DecLin", "DecExp", "IncLin", "IncBent"
    };
    int gain_mode = g_env[4];
    if (gain_mode < 0) gain_mode = 0;
    if (gain_mode > 5) gain_mode = 5;

    int new_mode = gain_mode;
    if (hwui_dropdown(g_fb, SCREEN_W, x + 6, y + 10, 80,
                      gain_modes, 6, gain_mode,
                      g_mouse_x, g_mouse_y, g_mouse_down, &new_mode)) {
        g_env[4] = new_mode;
        js_on_param_change(PARAM_ENV_4, g_env[4]);
        g_dirty = 1;
    }

    if (gain_mode == 0) {
        /* ADSR mode */
        int kx = x + 100;
        int knob_gap = 52;

        /* Attack (0-15) */
        new_val = (float)g_env[0];
        if (hwui_knob(g_fb, SCREEN_W, kx, ky, 12,
                      (float)g_env[0], 0, 15, "ATK",
                      HWUI_GREEN, g_mouse_x, g_mouse_y, g_mouse_down, &new_val)) {
            g_env[0] = (int)new_val;
            js_on_param_change(PARAM_ENV_0, g_env[0]);
            g_dirty = 1;
        }
        kx += knob_gap;

        /* Decay (0-7) */
        new_val = (float)g_env[1];
        if (hwui_knob(g_fb, SCREEN_W, kx, ky, 12,
                      (float)g_env[1], 0, 7, "DEC",
                      HWUI_AMBER, g_mouse_x, g_mouse_y, g_mouse_down, &new_val)) {
            g_env[1] = (int)new_val;
            js_on_param_change(PARAM_ENV_1, g_env[1]);
            g_dirty = 1;
        }
        kx += knob_gap;

        /* Sustain (0-7) */
        new_val = (float)g_env[2];
        if (hwui_knob(g_fb, SCREEN_W, kx, ky, 12,
                      (float)g_env[2], 0, 7, "SUS",
                      HWUI_CYAN, g_mouse_x, g_mouse_y, g_mouse_down, &new_val)) {
            g_env[2] = (int)new_val;
            js_on_param_change(PARAM_ENV_2, g_env[2]);
            g_dirty = 1;
        }
        kx += knob_gap;

        /* Release (0-31) */
        new_val = (float)g_env[3];
        if (hwui_knob(g_fb, SCREEN_W, kx, ky, 12,
                      (float)g_env[3], 0, 31, "REL",
                      HWUI_ORANGE, g_mouse_x, g_mouse_y, g_mouse_down, &new_val)) {
            g_env[3] = (int)new_val;
            js_on_param_change(PARAM_ENV_3, g_env[3]);
            g_dirty = 1;
        }

        /* ADSR visualization */
        int viz_x = x + w - 120;
        int viz_y = y + h - 50;
        int viz_w = 110;
        int viz_h = 42;

        hwui_adsr_viz(g_fb, SCREEN_W, viz_x, viz_y, viz_w, viz_h,
                      g_env[0], g_env[1], g_env[2], 0, g_env[3],
                      15, 7, 7, 31,
                      HWUI_BLUE_LIGHT, (HWUI_BLUE_LIGHT & 0x00FFFFFF) | 0x30000000);
    } else {
        /* GAIN mode: just show the gain value knob */
        new_val = (float)g_env[5];
        if (hwui_knob(g_fb, SCREEN_W, x + 140, ky, 18,
                      (float)g_env[5], 0, 127, "GAIN",
                      HWUI_BLUE_LIGHT, g_mouse_x, g_mouse_y, g_mouse_down, &new_val)) {
            g_env[5] = (int)new_val;
            js_on_param_change(PARAM_ENV_5, g_env[5]);
            g_dirty = 1;
        }

        /* Numeric value */
        char gain_str[16];
        snprintf(gain_str, sizeof(gain_str), "%d", g_env[5]);
        hwui_text_centered(g_fb, SCREEN_W, x + 120, ky + 44, 60, HWUI_FONT_H,
                           gain_str, HWUI_GRAY_LIGHT);

        /* Mode description */
        static const char *gain_descs[] = {
            "", "Set directly", "Linear decrease", "Exp decrease", "Linear increase", "Bent increase"
        };
        if (gain_mode >= 1 && gain_mode <= 5) {
            hwui_text(g_fb, SCREEN_W, x + 240, ky + 20,
                      gain_descs[gain_mode], HWUI_GRAY_MED);
        }
    }
}

/* ── AY Envelope (y=92..200) ──────────────────────────────────────────── */

static void render_env_ay(int x, int y, int w, int h) {
    hwui_group_box(g_fb, SCREEN_W, x, y, w, h, "AY ENVELOPE", HWUI_YELLOW);

    float new_val;
    int ky = y + 16;

    /* Envelope shape (0-15) */
    new_val = (float)g_ay_env_shape;
    if (hwui_knob(g_fb, SCREEN_W, x + 30, ky, 16,
                  (float)g_ay_env_shape, 0, 15, "SHAPE",
                  HWUI_YELLOW, g_mouse_x, g_mouse_y, g_mouse_down, &new_val)) {
        g_ay_env_shape = (int)new_val;
        js_on_param_change(PARAM_AY_ENV_SHAPE, g_ay_env_shape);
        g_dirty = 1;
    }

    /* Numeric shape display */
    char shape_str[8];
    snprintf(shape_str, sizeof(shape_str), "%d", g_ay_env_shape);
    hwui_text_centered(g_fb, SCREEN_W, x + 10, ky + 40, 60, HWUI_FONT_H,
                       shape_str, HWUI_GRAY_LIGHT);

    /* AY envelope shape visualization */
    int viz_x = x + 100;
    int viz_y = y + 14;
    int viz_w = w - 112;
    int viz_h = h - 22;
    hwui_panel_sunken(g_fb, SCREEN_W, viz_x, viz_y, viz_w, viz_h);

    int shape = g_ay_env_shape & 0x0F;
    int half_w = (viz_w - 4) / 2;
    int max_h = viz_h - 4;
    int base_y = viz_y + viz_h - 2;

    /* Decode shape bits: bit3=continue, bit2=attack, bit1=alternate, bit0=hold */
    int attack    = (shape >> 2) & 1;
    int alternate = (shape >> 1) & 1;
    int hold      = shape & 1;

    /* First half: ramp up or down based on attack bit */
    for (int px = 0; px < half_w; px++) {
        int level;
        if (attack)
            level = (px * max_h) / half_w;
        else
            level = max_h - (px * max_h) / half_w;
        hwui_pixel(g_fb, SCREEN_W, viz_x + 2 + px, base_y - level, HWUI_YELLOW);
    }

    /* Second half (continue bit = shape >= 8) */
    if (shape >= 8) {
        int second_attack = attack;
        if (alternate) second_attack = !second_attack;

        if (hold) {
            /* Hold at final level */
            int final_level = second_attack ? max_h : 0;
            hwui_hline(g_fb, SCREEN_W, viz_x + 2 + half_w,
                       base_y - final_level, half_w, HWUI_YELLOW);
        } else {
            /* Repeat the ramp */
            for (int px = 0; px < half_w; px++) {
                int level;
                if (second_attack)
                    level = (px * max_h) / half_w;
                else
                    level = max_h - (px * max_h) / half_w;
                hwui_pixel(g_fb, SCREEN_W, viz_x + 2 + half_w + px,
                           base_y - level, HWUI_YELLOW);
            }
        }
    } else {
        /* Shape < 8: hold at 0 */
        hwui_hline(g_fb, SCREEN_W, viz_x + 2 + half_w, base_y, half_w, HWUI_YELLOW);
    }
}

/* ── Filter Section (y=202..300) — C64/SID only ────────────────────────── */

static void render_filter_section(int x, int y, int w, int h) {
    hwui_group_box(g_fb, SCREEN_W, x, y, w, h, "SID FILTER", HWUI_RED);

    /* Filter ON toggle */
    int filter_on = flag_get(FLAG_FILTER_ON);
    if (hwui_checkbox(g_fb, SCREEN_W, x + w - 48, y + 1,
                      "ON", filter_on,
                      g_mouse_x, g_mouse_y, g_mouse_down)) {
        flag_toggle(FLAG_FILTER_ON);
        js_on_param_change(PARAM_FILTER_ON, flag_get(FLAG_FILTER_ON));
        g_dirty = 1;
    }

    if (!filter_on) {
        hwui_text_centered(g_fb, SCREEN_W, x, y + h / 2 - 3, w, HWUI_FONT_H,
                           "[ FILTER OFF ]", HWUI_GRAY_MED);
        return;
    }

    float new_val;
    int row_y = y + 14;

    /* Cutoff slider (11-bit, 0-2047) */
    hwui_text(g_fb, SCREEN_W, x + 6, row_y + 2, "CUT", HWUI_GRAY_LIGHT);
    new_val = (float)g_filter_cutoff;
    if (hwui_slider_h(g_fb, SCREEN_W, x + 32, row_y, w - 100, 14,
                      (float)g_filter_cutoff, 0, 2047, HWUI_RED,
                      g_mouse_x, g_mouse_y, g_mouse_down, &new_val)) {
        g_filter_cutoff = (int)new_val;
        js_on_param_change(PARAM_FILTER_CUTOFF, g_filter_cutoff);
        g_dirty = 1;
    }
    /* Cutoff value text */
    {
        char cut_str[8];
        snprintf(cut_str, sizeof(cut_str), "%d", g_filter_cutoff);
        hwui_text(g_fb, SCREEN_W, x + w - 60, row_y + 4, cut_str, HWUI_WHITE);
    }

    row_y += 22;

    /* Resonance knob (0-15) */
    new_val = (float)g_filter_res;
    if (hwui_knob(g_fb, SCREEN_W, x + 20, row_y, 14,
                  (float)g_filter_res, 0, 15, "RES",
                  HWUI_ORANGE, g_mouse_x, g_mouse_y, g_mouse_down, &new_val)) {
        g_filter_res = (int)new_val;
        js_on_param_change(PARAM_FILTER_RES, g_filter_res);
        g_dirty = 1;
    }

    /* Filter type toggle buttons: LP / BP / HP */
    int tog_x = x + 80;
    int tog_y = row_y + 6;

    {
        int lp = flag_get(FLAG_FILTER_LP);
        if (hwui_button(g_fb, SCREEN_W, tog_x, tog_y, 36, 16, "LP", lp,
                        g_mouse_x, g_mouse_y, g_mouse_down)) {
            flag_toggle(FLAG_FILTER_LP);
            js_on_param_change(PARAM_FILTER_LP, flag_get(FLAG_FILTER_LP));
            g_dirty = 1;
        }
        tog_x += 40;
    }

    {
        int bp = flag_get(FLAG_FILTER_BP);
        if (hwui_button(g_fb, SCREEN_W, tog_x, tog_y, 36, 16, "BP", bp,
                        g_mouse_x, g_mouse_y, g_mouse_down)) {
            flag_toggle(FLAG_FILTER_BP);
            js_on_param_change(PARAM_FILTER_BP, flag_get(FLAG_FILTER_BP));
            g_dirty = 1;
        }
        tog_x += 40;
    }

    {
        int hp = flag_get(FLAG_FILTER_HP);
        if (hwui_button(g_fb, SCREEN_W, tog_x, tog_y, 36, 16, "HP", hp,
                        g_mouse_x, g_mouse_y, g_mouse_down)) {
            flag_toggle(FLAG_FILTER_HP);
            js_on_param_change(PARAM_FILTER_HP, flag_get(FLAG_FILTER_HP));
            g_dirty = 1;
        }
        tog_x += 44;
    }

    /* Ring mod / Osc sync / Route to filter toggles */
    {
        int ring = flag_get(FLAG_RING_MOD);
        if (hwui_checkbox(g_fb, SCREEN_W, tog_x, tog_y + 1,
                          "RING", ring,
                          g_mouse_x, g_mouse_y, g_mouse_down)) {
            flag_toggle(FLAG_RING_MOD);
            js_on_param_change(PARAM_RING_MOD, flag_get(FLAG_RING_MOD));
            g_dirty = 1;
        }
        tog_x += 48;
    }

    {
        int sync = flag_get(FLAG_OSC_SYNC);
        if (hwui_checkbox(g_fb, SCREEN_W, tog_x, tog_y + 1,
                          "SYNC", sync,
                          g_mouse_x, g_mouse_y, g_mouse_down)) {
            flag_toggle(FLAG_OSC_SYNC);
            js_on_param_change(PARAM_OSC_SYNC, flag_get(FLAG_OSC_SYNC));
            g_dirty = 1;
        }
    }

    /* Route to filter */
    {
        int to_filt = flag_get(FLAG_TO_FILTER);
        if (hwui_checkbox(g_fb, SCREEN_W, x + 80, tog_y + 22,
                          "ROUTE TO FILTER", to_filt,
                          g_mouse_x, g_mouse_y, g_mouse_down)) {
            flag_toggle(FLAG_TO_FILTER);
            js_on_param_change(PARAM_TO_FILTER, flag_get(FLAG_TO_FILTER));
            g_dirty = 1;
        }
    }
}

/* ── Extras Section (y=302..358) ───────────────────────────────────────── */

static void render_extras_section(int x, int y, int w, int h) {
    const PSGChipInfo *chip = &PSG_CHIPS[g_chip_subtype];

    hwui_group_box(g_fb, SCREEN_W, x, y, w, h, "EXTRAS", HWUI_GRAY_LIGHT);

    int cx = x + 8;
    int cy = y + 12;

    /* Noise mode (white / periodic) */
    if (chip->has_noise) {
        static const char *noise_modes[] = { "White", "Periodic" };
        int new_mode = g_noise_mode;
        if (hwui_dropdown(g_fb, SCREEN_W, cx, cy, 90,
                          noise_modes, 2, g_noise_mode,
                          g_mouse_x, g_mouse_y, g_mouse_down, &new_mode)) {
            g_noise_mode = new_mode;
            js_on_param_change(PARAM_NOISE_MODE, g_noise_mode);
            g_dirty = 1;
        }
        cx += 100;
    }

    /* PSG width knob (AY/PSG/AY8930 family) */
    if (g_chip_subtype == PSG_CHIP_PSG ||
        g_chip_subtype == PSG_CHIP_AY ||
        g_chip_subtype == PSG_CHIP_AY8930) {
        float new_val = (float)g_psg_width;
        if (hwui_knob(g_fb, SCREEN_W, cx + 10, cy - 2, 10,
                      (float)g_psg_width, 0, 255, "WIDTH",
                      HWUI_CYAN, g_mouse_x, g_mouse_y, g_mouse_down, &new_val)) {
            g_psg_width = (int)new_val;
            js_on_param_change(PARAM_PSG_WIDTH, g_psg_width);
            g_dirty = 1;
        }
        cx += 60;
    }

    /* Chip info label */
    {
        char info[64];
        snprintf(info, sizeof(info), "Chip: %s", chip->name);
        hwui_text(g_fb, SCREEN_W, cx + 20, cy + 6, info, HWUI_GRAY_MED);
    }
}

/* ── Main Render ───────────────────────────────────────────────────────── */

static void render(void) {
    const PSGChipInfo *chip = &PSG_CHIPS[g_chip_subtype];

    /* Clear framebuffer */
    for (int i = 0; i < SCREEN_W * SCREEN_H; i++)
        g_fb[i] = HWUI_BLACK;

    hwui_frame_begin(g_mouse_x, g_mouse_y, g_mouse_down);

    /* ── Header bar (y=0..14) ─────────────────────────────────────────── */
    hwui_rect(g_fb, SCREEN_W, 0, 0, SCREEN_W, 16, HWUI_BLUE_DARK);
    hwui_text_centered(g_fb, SCREEN_W, 0, 0, SCREEN_W, 16, chip->name, HWUI_WHITE);

    int margin = 4;
    int content_w = SCREEN_W - margin * 2;

    /* ── Waveform section (y=16..90) ──────────────────────────────────── */
    render_waveform_section(margin, 16, content_w, 76);

    /* ── Envelope section (y=92..200) ─────────────────────────────────── */
    {
        int env_x = margin;
        int env_y = 92;
        int env_w = content_w;
        int env_h = 110;

        switch (chip->envelope_type) {
        case ENV_NES:
            render_env_nes(env_x, env_y, env_w, env_h);
            break;
        case ENV_GB:
            render_env_gb(env_x, env_y, env_w, env_h);
            break;
        case ENV_C64:
            render_env_c64(env_x, env_y, env_w, env_h);
            break;
        case ENV_SNES:
            render_env_snes(env_x, env_y, env_w, env_h);
            break;
        case ENV_AY:
            render_env_ay(env_x, env_y, env_w, env_h);
            break;
        default:
            /* No envelope for this chip */
            hwui_group_box(g_fb, SCREEN_W, env_x, env_y, env_w, env_h,
                           "ENVELOPE", HWUI_GRAY_MED);
            hwui_text_centered(g_fb, SCREEN_W, env_x, env_y + env_h / 2 - 3,
                               env_w, HWUI_FONT_H,
                               "[ No envelope for this chip ]", HWUI_GRAY_MED);
            break;
        }
    }

    /* ── Filter section (y=202..300) — C64/SID only ───────────────────── */
    if (chip->has_filter) {
        render_filter_section(margin, 202, content_w, 100);
    } else {
        /* Subtle separator line */
        hwui_hline(g_fb, SCREEN_W, margin, 202, content_w, HWUI_GRAY_DARK);
    }

    /* ── Extras section (y=302..358) ──────────────────────────────────── */
    render_extras_section(margin, 302, content_w, 56);

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

void furnace_psg_init(int w, int h) {
    (void)w; (void)h;
    SDL_Init(SDL_INIT_VIDEO);
    g_win = SDL_CreateWindow("Furnace PSG Editor",
        SDL_WINDOWPOS_UNDEFINED, SDL_WINDOWPOS_UNDEFINED,
        SCREEN_W, SCREEN_H, 0);
    g_ren = SDL_CreateRenderer(g_win, -1, SDL_RENDERER_SOFTWARE);
    g_tex = SDL_CreateTexture(g_ren, SDL_PIXELFORMAT_ARGB8888,
        SDL_TEXTUREACCESS_STREAMING, SCREEN_W, SCREEN_H);
    memset(g_fb, 0, sizeof(g_fb));
    hwui_set_fb_size(SCREEN_W, SCREEN_H);
    memset(g_env, 0, sizeof(g_env));
    g_chip_subtype = PSG_CHIP_NES;
    g_waveform = 0;
    g_duty = 0;
    g_duty_hi = 0;
    g_flags = 0;
    g_filter_cutoff = 0;
    g_filter_res = 0;
    g_filter_flags = 0;
    g_noise_mode = 0;
    g_psg_width = 0;
    g_ay_env_shape = 0;
    hwui_reset_state();
    g_dirty = 1;
}

void furnace_psg_start(void) {
    emscripten_set_main_loop(tick, 60, 0);
}

void furnace_psg_shutdown(void) {
    emscripten_cancel_main_loop();
    if (g_tex) SDL_DestroyTexture(g_tex);
    if (g_ren) SDL_DestroyRenderer(g_ren);
    if (g_win) SDL_DestroyWindow(g_win);
    g_tex = NULL; g_ren = NULL; g_win = NULL;
}

void furnace_psg_load_config(const uint8_t *buf, int len) {
    if (len < PSG_HEADER_SIZE) return;

    /* Header (4 bytes) */
    g_chip_subtype = buf[0];
    if (g_chip_subtype >= PSG_CHIP_COUNT) g_chip_subtype = PSG_CHIP_NES;
    g_waveform = buf[1];
    g_duty     = buf[2];
    g_flags    = buf[3];

    /* Envelope section (8 bytes) */
    if (len >= PSG_HEADER_SIZE + PSG_ENVELOPE_SIZE) {
        for (int i = 0; i < 8; i++)
            g_env[i] = buf[4 + i];
    }

    /* Filter section (6 bytes) */
    if (len >= PSG_HEADER_SIZE + PSG_ENVELOPE_SIZE + PSG_FILTER_SIZE) {
        g_filter_cutoff = buf[12] | (buf[13] << 8);
        g_filter_res    = buf[14] & 0x0F;
        g_filter_flags  = buf[15];
        g_duty_hi       = buf[16];
        /* buf[17] reserved */
    }

    /* AY/PSG section (4 bytes) */
    if (len >= PSG_CONFIG_SIZE) {
        g_noise_mode   = buf[18];
        g_psg_width    = buf[19];
        g_ay_env_shape = buf[20];
        /* buf[21] reserved */
    }

    g_dirty = 1;
}

int furnace_psg_dump_config(uint8_t *buf, int max_len) {
    if (max_len < PSG_CONFIG_SIZE) return 0;

    memset(buf, 0, PSG_CONFIG_SIZE);

    /* Header (4 bytes) */
    buf[0] = (uint8_t)g_chip_subtype;
    buf[1] = (uint8_t)g_waveform;
    buf[2] = (uint8_t)g_duty;
    buf[3] = (uint8_t)g_flags;

    /* Envelope (8 bytes) */
    for (int i = 0; i < 8; i++)
        buf[4 + i] = (uint8_t)g_env[i];

    /* Filter (6 bytes) */
    buf[12] = (uint8_t)(g_filter_cutoff & 0xFF);
    buf[13] = (uint8_t)((g_filter_cutoff >> 8) & 0xFF);
    buf[14] = (uint8_t)(g_filter_res & 0x0F);
    buf[15] = (uint8_t)g_filter_flags;
    buf[16] = (uint8_t)g_duty_hi;
    buf[17] = 0; /* reserved */

    /* AY/PSG (4 bytes) */
    buf[18] = (uint8_t)g_noise_mode;
    buf[19] = (uint8_t)g_psg_width;
    buf[20] = (uint8_t)g_ay_env_shape;
    buf[21] = 0; /* reserved */

    return PSG_CONFIG_SIZE;
}
