/*
 * furnace_fm.c — Furnace FM Instrument Editor (SDL2/Emscripten)
 *
 * Renders the classic FM synth instrument editor with:
 * - Algorithm topology diagram with operator boxes and connections
 * - Per-operator ADSR envelope visualization
 * - Knobs for TL, MULT, DT, AR, DR, SL, RR, D2R
 * - Chip-specific controls (SSG, WS, KSL, DT2, etc.)
 * - OPLL preset selector
 *
 * Canvas: 640x480
 */

#include <SDL2/SDL.h>
#include <emscripten.h>
#include <emscripten/html5.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <math.h>

#include "furnace_fm.h"
#include "hwui_common.h"

/* ── JS Callbacks ──────────────────────────────────────────────────────── */

EM_JS(void, js_on_param_change, (int param_id, int value), {
    if (Module.onParamChange) Module.onParamChange(param_id, value);
});

EM_JS(void, js_on_op_param_change, (int op_index, int param_id, int value), {
    if (Module.onOpParamChange) Module.onOpParamChange(op_index, param_id, value);
});

EM_JS(void, js_on_algorithm_change, (int alg), {
    if (Module.onAlgorithmChange) Module.onAlgorithmChange(alg);
});

/* ── Param IDs for global params ───────────────────────────────────────── */
#define PARAM_ALGORITHM  0
#define PARAM_FEEDBACK   1
#define PARAM_FMS        2
#define PARAM_AMS        3
#define PARAM_OPLL_PRESET 4

/* ── Op Param IDs ──────────────────────────────────────────────────────── */
#define OP_ENABLED  0
#define OP_MULT     1
#define OP_TL       2
#define OP_AR       3
#define OP_DR       4
#define OP_D2R      5
#define OP_SL       6
#define OP_RR       7
#define OP_DT       8
#define OP_DT2      9
#define OP_RS       10
#define OP_AM       11
#define OP_KSR      12
#define OP_KSL      13
#define OP_SUS      14
#define OP_VIB      15
#define OP_WS       16
#define OP_SSG      17

/* ── Layout ────────────────────────────────────────────────────────────── */

#define SCREEN_W  640
#define SCREEN_H  480

/* ── Chip Info Table ───────────────────────────────────────────────────── */

typedef struct {
    int ops;             /* 2 or 4 */
    int tl_max;          /* 63 or 127 */
    int ar_max, dr_max;  /* 15 or 31 */
    int rr_max;          /* 15 */
    int sl_max;          /* 15 */
    int has_d2r;
    int has_ssg;
    int has_ws;
    int has_dt2;
    int has_ksl;
    int has_opll_presets;
    const char *name;
} FMChipInfo;

static const FMChipInfo FM_CHIPS[FM_CHIP_COUNT] = {
    /* OPN  */ { 4, 127, 31, 31, 15, 15, 1, 1, 0, 0, 0, 0, "YM2612 OPN2" },
    /* OPM  */ { 4, 127, 31, 31, 15, 15, 1, 0, 0, 1, 0, 0, "YM2151 OPM" },
    /* OPL  */ { 4,  63, 15, 15, 15, 15, 0, 0, 1, 0, 1, 0, "OPL3" },
    /* OPLL */ { 2,  63, 15, 15, 15, 15, 0, 0, 0, 0, 0, 1, "YM2413 OPLL" },
    /* OPZ  */ { 4, 127, 31, 31, 15, 15, 1, 0, 0, 1, 0, 0, "YM2414 OPZ" },
    /* ESFM */ { 4,  63, 15, 15, 15, 15, 0, 0, 1, 0, 1, 0, "ESFM" },
    /* OPNA */ { 4, 127, 31, 31, 15, 15, 1, 1, 0, 0, 0, 0, "YM2608 OPNA" },
    /* OPNB */ { 4, 127, 31, 31, 15, 15, 1, 1, 0, 0, 0, 0, "YM2610 OPNB" },
    /* OPL4 */ { 4,  63, 15, 15, 15, 15, 0, 0, 1, 0, 1, 0, "YMF278 OPL4" },
    /* Y8950*/ { 4,  63, 15, 15, 15, 15, 0, 0, 1, 0, 1, 0, "Y8950" },
    /* 2203 */ { 4, 127, 31, 31, 15, 15, 1, 1, 0, 0, 0, 0, "YM2203 OPN" },
    /* OPNBB*/{ 4, 127, 31, 31, 15, 15, 1, 1, 0, 0, 0, 0, "YM2610B" },
};

/* ── Operator State ────────────────────────────────────────────────────── */

typedef struct {
    int enabled;
    int mult;
    int tl;
    int ar, dr, d2r, sl, rr;
    int dt;     /* signed */
    int dt2;
    int rs;
    int am;
    int ksr, ksl, sus, vib;
    int ws;
    int ssg;
} OpState;

/* ── Global State ──────────────────────────────────────────────────────── */

static SDL_Window   *g_win;
static SDL_Renderer *g_ren;
static SDL_Texture  *g_tex;
static uint32_t      g_fb[SCREEN_W * SCREEN_H];

static int     g_chip_subtype = FM_CHIP_OPN;
static int     g_algorithm = 0;
static int     g_feedback = 0;
static int     g_fms = 0;
static int     g_ams = 0;
static int     g_ops_count = 4;
static int     g_opll_preset = 0;
static int     g_fixed_drums = 0;
static OpState g_ops[FM_MAX_OPS];

static int g_mouse_x = 0, g_mouse_y = 0;
static int g_mouse_down = 0;
static int g_dirty = 1;

/* ── Algorithm Diagram ─────────────────────────────────────────────────── */

/* Each algorithm defines which operators are carriers (output) and
   how operators connect. Simplified topology for 4-op algorithms 0-7. */

typedef struct {
    int is_carrier[4];  /* 1 = carrier (output), 0 = modulator */
    /* Connection list: mod_from -> mod_to (-1 = output) */
    int connections[8][2]; /* [i][0]=from, [i][1]=to, terminated by [-1,-1] */
} AlgTopology;

static const AlgTopology ALG_TOPOLOGIES[8] = {
    /* 0: 1→2→3→4 (serial) */
    { {0,0,0,1}, {{0,1},{1,2},{2,3},{-1,-1},{-1,-1},{-1,-1},{-1,-1},{-1,-1}} },
    /* 1: (1+2)→3→4 */
    { {0,0,0,1}, {{0,2},{1,2},{2,3},{-1,-1},{-1,-1},{-1,-1},{-1,-1},{-1,-1}} },
    /* 2: (1+(2→3))→4 */
    { {0,0,0,1}, {{0,3},{1,2},{2,3},{-1,-1},{-1,-1},{-1,-1},{-1,-1},{-1,-1}} },
    /* 3: ((1→2)+3)→4 */
    { {0,0,0,1}, {{0,1},{1,3},{2,3},{-1,-1},{-1,-1},{-1,-1},{-1,-1},{-1,-1}} },
    /* 4: (1→2)+(3→4) */
    { {0,1,0,1}, {{0,1},{2,3},{-1,-1},{-1,-1},{-1,-1},{-1,-1},{-1,-1},{-1,-1}} },
    /* 5: 1→(2+3+4) */
    { {0,1,1,1}, {{0,1},{0,2},{0,3},{-1,-1},{-1,-1},{-1,-1},{-1,-1},{-1,-1}} },
    /* 6: (1→2)+3+4 */
    { {0,1,1,1}, {{0,1},{-1,-1},{-1,-1},{-1,-1},{-1,-1},{-1,-1},{-1,-1},{-1,-1}} },
    /* 7: 1+2+3+4 (all carriers) */
    { {1,1,1,1}, {{-1,-1},{-1,-1},{-1,-1},{-1,-1},{-1,-1},{-1,-1},{-1,-1},{-1,-1}} },
};

static void render_alg_diagram(int x, int y, int w, int h) {
    /* Background panel */
    hwui_panel_sunken(g_fb, SCREEN_W, x, y, w, h);

    const AlgTopology *alg = &ALG_TOPOLOGIES[g_algorithm & 7];
    int num_ops = g_ops_count;
    if (num_ops > 4) num_ops = 4;

    /* Operator box dimensions */
    int box_w = 24, box_h = 18;
    int gap_x = (w - 4 - num_ops * box_w) / (num_ops + 1);
    if (gap_x < 8) gap_x = 8;

    /* Draw operator boxes */
    int op_cx[4], op_cy[4];
    for (int i = 0; i < num_ops; i++) {
        int bx = x + 2 + gap_x + i * (box_w + gap_x);
        int by = y + (h - box_h) / 2;
        op_cx[i] = bx + box_w / 2;
        op_cy[i] = by + box_h / 2;

        uint32_t box_col = alg->is_carrier[i] ? HWUI_AMBER : HWUI_BLUE;
        hwui_panel_3d(g_fb, SCREEN_W, bx, by, box_w, box_h,
                      box_col, HWUI_PANEL_HI, HWUI_PANEL_SH);

        char label[4];
        snprintf(label, sizeof(label), "OP%d", i + 1);
        hwui_text_centered(g_fb, SCREEN_W, bx, by, box_w, box_h, label, HWUI_WHITE);

        /* Carrier/Mod label below */
        const char *role = alg->is_carrier[i] ? "C" : "M";
        hwui_text_centered(g_fb, SCREEN_W, bx, by + box_h + 1, box_w, HWUI_FONT_H,
                           role, alg->is_carrier[i] ? HWUI_AMBER : HWUI_BLUE_LIGHT);
    }

    /* Draw connections */
    for (int c = 0; c < 8; c++) {
        int from = alg->connections[c][0];
        int to   = alg->connections[c][1];
        if (from < 0) break;
        if (from >= num_ops || to >= num_ops) continue;

        hwui_line(g_fb, SCREEN_W,
                  op_cx[from] + box_w / 2 + 1, op_cy[from],
                  op_cx[to] - box_w / 2 - 1, op_cy[to],
                  HWUI_GRAY_LIGHT);
    }

    /* Feedback loop indicator (on OP1) */
    if (g_feedback > 0) {
        int fbx = op_cx[0];
        int fby = y + 4;
        hwui_line(g_fb, SCREEN_W, fbx, op_cy[0] - box_h / 2, fbx, fby, HWUI_CYAN);
        hwui_line(g_fb, SCREEN_W, fbx, fby, fbx + 10, fby, HWUI_CYAN);
        hwui_line(g_fb, SCREEN_W, fbx + 10, fby, fbx + 10, op_cy[0] - box_h / 2 + 4, HWUI_CYAN);

        char fb_label[8];
        snprintf(fb_label, sizeof(fb_label), "FB%d", g_feedback);
        hwui_text(g_fb, SCREEN_W, fbx + 14, fby - 2, fb_label, HWUI_CYAN);
    }

    /* Algorithm label */
    char alg_label[16];
    snprintf(alg_label, sizeof(alg_label), "ALG %d", g_algorithm);
    hwui_text(g_fb, SCREEN_W, x + w - hwui_text_width(alg_label) - 4, y + 4,
              alg_label, HWUI_WHITE);
}

/* ── Operator Card Rendering ───────────────────────────────────────────── */

static void render_op_card(int op_idx, int x, int y, int w, int h) {
    OpState *op = &g_ops[op_idx];
    const FMChipInfo *chip = &FM_CHIPS[g_chip_subtype];
    const AlgTopology *alg = &ALG_TOPOLOGIES[g_algorithm & 7];

    /* Card background */
    uint32_t card_bg = op->enabled ? HWUI_GRAY_DARK : 0xFF2A2A2A;
    hwui_rect(g_fb, SCREEN_W, x, y, w, h, card_bg);

    /* Header stripe */
    uint32_t header_col = alg->is_carrier[op_idx] ? HWUI_AMBER : HWUI_BLUE;
    if (!op->enabled) header_col = HWUI_GRAY_MED;
    hwui_rect(g_fb, SCREEN_W, x, y, w, 12, header_col);

    char header[32];
    snprintf(header, sizeof(header), "OP%d %s", op_idx + 1,
             alg->is_carrier[op_idx] ? "[CARRIER]" : "[MODULATOR]");
    hwui_text(g_fb, SCREEN_W, x + 4, y + 3, header, HWUI_WHITE);

    /* Enabled toggle */
    int toggled = hwui_checkbox(g_fb, SCREEN_W, x + w - 40, y + 2,
                                "ON", op->enabled,
                                g_mouse_x, g_mouse_y, g_mouse_down);
    if (toggled) {
        op->enabled = !op->enabled;
        js_on_op_param_change(op_idx, OP_ENABLED, op->enabled);
        g_dirty = 1;
    }

    if (!op->enabled) return;  /* Skip rendering controls if disabled */

    int cy = y + 14;  /* Below header */
    int knob_r = 10;
    int knob_cell = 34;
    int col_x = x + 4;

    /* ADSR visualization */
    hwui_adsr_viz(g_fb, SCREEN_W, x + w - 104, cy, 100, 30,
                  op->ar, op->dr, op->sl, chip->has_d2r ? op->d2r : 0, op->rr,
                  chip->ar_max, chip->dr_max, chip->sl_max, chip->rr_max,
                  header_col, (header_col & 0x00FFFFFF) | 0x30000000);

    /* Row 1: TL, MULT, DT */
    {
        float new_val;

        /* TL knob */
        new_val = (float)op->tl;
        if (hwui_knob(g_fb, SCREEN_W, col_x, cy, knob_r,
                      (float)op->tl, 0, (float)chip->tl_max, "TL",
                      HWUI_RED, g_mouse_x, g_mouse_y, g_mouse_down, &new_val)) {
            op->tl = (int)new_val;
            js_on_op_param_change(op_idx, OP_TL, op->tl);
            g_dirty = 1;
        }

        /* MULT knob */
        new_val = (float)op->mult;
        if (hwui_knob(g_fb, SCREEN_W, col_x + knob_cell, cy, knob_r,
                      (float)op->mult, 0, 15, "MULT",
                      HWUI_GREEN, g_mouse_x, g_mouse_y, g_mouse_down, &new_val)) {
            op->mult = (int)new_val;
            js_on_op_param_change(op_idx, OP_MULT, op->mult);
            g_dirty = 1;
        }

        /* DT knob */
        new_val = (float)op->dt;
        if (hwui_knob(g_fb, SCREEN_W, col_x + knob_cell * 2, cy, knob_r,
                      (float)op->dt, -3, 3, "DT",
                      HWUI_CYAN, g_mouse_x, g_mouse_y, g_mouse_down, &new_val)) {
            op->dt = (int)new_val;
            js_on_op_param_change(op_idx, OP_DT, op->dt);
            g_dirty = 1;
        }
    }

    cy += 42;

    /* Row 2: AR, DR, SL, RR */
    {
        float new_val;

        new_val = (float)op->ar;
        if (hwui_knob(g_fb, SCREEN_W, col_x, cy, knob_r,
                      (float)op->ar, 0, (float)chip->ar_max, "AR",
                      HWUI_GREEN, g_mouse_x, g_mouse_y, g_mouse_down, &new_val)) {
            op->ar = (int)new_val;
            js_on_op_param_change(op_idx, OP_AR, op->ar);
            g_dirty = 1;
        }

        new_val = (float)op->dr;
        if (hwui_knob(g_fb, SCREEN_W, col_x + knob_cell, cy, knob_r,
                      (float)op->dr, 0, (float)chip->dr_max, "DR",
                      HWUI_AMBER, g_mouse_x, g_mouse_y, g_mouse_down, &new_val)) {
            op->dr = (int)new_val;
            js_on_op_param_change(op_idx, OP_DR, op->dr);
            g_dirty = 1;
        }

        new_val = (float)op->sl;
        if (hwui_knob(g_fb, SCREEN_W, col_x + knob_cell * 2, cy, knob_r,
                      (float)op->sl, 0, (float)chip->sl_max, "SL",
                      HWUI_MAGENTA, g_mouse_x, g_mouse_y, g_mouse_down, &new_val)) {
            op->sl = (int)new_val;
            js_on_op_param_change(op_idx, OP_SL, op->sl);
            g_dirty = 1;
        }

        new_val = (float)op->rr;
        if (hwui_knob(g_fb, SCREEN_W, col_x + knob_cell * 3, cy, knob_r,
                      (float)op->rr, 0, (float)chip->rr_max, "RR",
                      HWUI_ORANGE, g_mouse_x, g_mouse_y, g_mouse_down, &new_val)) {
            op->rr = (int)new_val;
            js_on_op_param_change(op_idx, OP_RR, op->rr);
            g_dirty = 1;
        }
    }

    cy += 42;

    /* Row 3: Chip-specific extras */
    int extra_x = col_x;

    if (chip->has_d2r) {
        float new_val = (float)op->d2r;
        if (hwui_knob(g_fb, SCREEN_W, extra_x, cy, 8,
                      (float)op->d2r, 0, (float)chip->dr_max, "D2R",
                      HWUI_CYAN, g_mouse_x, g_mouse_y, g_mouse_down, &new_val)) {
            op->d2r = (int)new_val;
            js_on_op_param_change(op_idx, OP_D2R, op->d2r);
            g_dirty = 1;
        }
        extra_x += 28;
    }

    /* RS (Rate Scaling) */
    {
        float new_val = (float)op->rs;
        if (hwui_knob(g_fb, SCREEN_W, extra_x, cy, 8,
                      (float)op->rs, 0, 3, "RS",
                      HWUI_GRAY_LIGHT, g_mouse_x, g_mouse_y, g_mouse_down, &new_val)) {
            op->rs = (int)new_val;
            js_on_op_param_change(op_idx, OP_RS, op->rs);
            g_dirty = 1;
        }
        extra_x += 28;
    }

    if (chip->has_dt2) {
        float new_val = (float)op->dt2;
        if (hwui_knob(g_fb, SCREEN_W, extra_x, cy, 8,
                      (float)op->dt2, 0, 3, "DT2",
                      HWUI_BLUE_LIGHT, g_mouse_x, g_mouse_y, g_mouse_down, &new_val)) {
            op->dt2 = (int)new_val;
            js_on_op_param_change(op_idx, OP_DT2, op->dt2);
            g_dirty = 1;
        }
        extra_x += 28;
    }

    if (chip->has_ksl) {
        float new_val = (float)op->ksl;
        if (hwui_knob(g_fb, SCREEN_W, extra_x, cy, 8,
                      (float)op->ksl, 0, 3, "KSL",
                      HWUI_YELLOW, g_mouse_x, g_mouse_y, g_mouse_down, &new_val)) {
            op->ksl = (int)new_val;
            js_on_op_param_change(op_idx, OP_KSL, op->ksl);
            g_dirty = 1;
        }
        extra_x += 28;
    }

    if (chip->has_ws) {
        float new_val = (float)op->ws;
        if (hwui_knob(g_fb, SCREEN_W, extra_x, cy, 8,
                      (float)op->ws, 0, 7, "WS",
                      HWUI_MAGENTA, g_mouse_x, g_mouse_y, g_mouse_down, &new_val)) {
            op->ws = (int)new_val;
            js_on_op_param_change(op_idx, OP_WS, op->ws);
            g_dirty = 1;
        }
        extra_x += 28;
    }

    /* Toggle flags */
    int flag_y = cy + 22;
    int flag_x = col_x;

    if (hwui_checkbox(g_fb, SCREEN_W, flag_x, flag_y, "AM", op->am,
                      g_mouse_x, g_mouse_y, g_mouse_down)) {
        op->am = !op->am;
        js_on_op_param_change(op_idx, OP_AM, op->am);
        g_dirty = 1;
    }
    flag_x += 30;

    if (chip->has_ssg) {
        /* SSG-EG display */
        char ssg_label[8];
        snprintf(ssg_label, sizeof(ssg_label), "SSG:%d", op->ssg);
        hwui_text(g_fb, SCREEN_W, flag_x, flag_y + 1, ssg_label, HWUI_GRAY_LIGHT);
        flag_x += 40;
    }

    /* OPL-specific flags */
    if (chip->has_ws) {
        if (hwui_checkbox(g_fb, SCREEN_W, flag_x, flag_y, "VIB", op->vib,
                          g_mouse_x, g_mouse_y, g_mouse_down)) {
            op->vib = !op->vib;
            js_on_op_param_change(op_idx, OP_VIB, op->vib);
            g_dirty = 1;
        }
        flag_x += 34;

        if (hwui_checkbox(g_fb, SCREEN_W, flag_x, flag_y, "SUS", op->sus,
                          g_mouse_x, g_mouse_y, g_mouse_down)) {
            op->sus = !op->sus;
            js_on_op_param_change(op_idx, OP_SUS, op->sus);
            g_dirty = 1;
        }
        flag_x += 34;

        if (hwui_checkbox(g_fb, SCREEN_W, flag_x, flag_y, "KSR", op->ksr,
                          g_mouse_x, g_mouse_y, g_mouse_down)) {
            op->ksr = !op->ksr;
            js_on_op_param_change(op_idx, OP_KSR, op->ksr);
            g_dirty = 1;
        }
    }
}

/* ── Main Render ───────────────────────────────────────────────────────── */

static void render(void) {
    const FMChipInfo *chip = &FM_CHIPS[g_chip_subtype];

    /* Clear */
    for (int i = 0; i < SCREEN_W * SCREEN_H; i++)
        g_fb[i] = HWUI_BLACK;

    hwui_frame_begin(g_mouse_x, g_mouse_y, g_mouse_down);

    /* Header bar with chip name */
    hwui_rect(g_fb, SCREEN_W, 0, 0, SCREEN_W, 16, HWUI_BLUE_DARK);
    hwui_text_centered(g_fb, SCREEN_W, 0, 0, SCREEN_W, 16, chip->name, HWUI_WHITE);

    /* Global parameter row */
    int gy = 18;
    {
        float new_val;

        /* ALG knob */
        new_val = (float)g_algorithm;
        if (hwui_knob(g_fb, SCREEN_W, 8, gy, 12,
                      (float)g_algorithm, 0, 7, "ALG",
                      HWUI_AMBER, g_mouse_x, g_mouse_y, g_mouse_down, &new_val)) {
            g_algorithm = (int)new_val;
            js_on_param_change(PARAM_ALGORITHM, g_algorithm);
            js_on_algorithm_change(g_algorithm);
            g_dirty = 1;
        }

        /* FB knob */
        new_val = (float)g_feedback;
        if (hwui_knob(g_fb, SCREEN_W, 48, gy, 12,
                      (float)g_feedback, 0, 7, "FB",
                      HWUI_CYAN, g_mouse_x, g_mouse_y, g_mouse_down, &new_val)) {
            g_feedback = (int)new_val;
            js_on_param_change(PARAM_FEEDBACK, g_feedback);
            g_dirty = 1;
        }

        /* FMS knob */
        new_val = (float)g_fms;
        if (hwui_knob(g_fb, SCREEN_W, 88, gy, 12,
                      (float)g_fms, 0, 7, "FMS",
                      HWUI_GREEN, g_mouse_x, g_mouse_y, g_mouse_down, &new_val)) {
            g_fms = (int)new_val;
            js_on_param_change(PARAM_FMS, g_fms);
            g_dirty = 1;
        }

        /* AMS knob */
        new_val = (float)g_ams;
        if (hwui_knob(g_fb, SCREEN_W, 128, gy, 12,
                      (float)g_ams, 0, 3, "AMS",
                      HWUI_MAGENTA, g_mouse_x, g_mouse_y, g_mouse_down, &new_val)) {
            g_ams = (int)new_val;
            js_on_param_change(PARAM_AMS, g_ams);
            g_dirty = 1;
        }
    }

    /* Algorithm diagram */
    render_alg_diagram(170, gy - 2, SCREEN_W - 178, 50);

    /* OPLL preset selector */
    if (chip->has_opll_presets) {
        static const char *opll_names[] = {
            "User", "Violin", "Guitar", "Piano", "Flute",
            "Clarinet", "Oboe", "Trumpet", "Organ", "Horn",
            "Synth", "Harpsi", "Vibraphone", "S.Bass", "A.Bass", "E.Guitar"
        };
        int new_preset = g_opll_preset;
        if (hwui_dropdown(g_fb, SCREEN_W, 8, gy + 50, 160,
                          opll_names, 16, g_opll_preset,
                          g_mouse_x, g_mouse_y, g_mouse_down, &new_preset)) {
            g_opll_preset = new_preset;
            js_on_param_change(PARAM_OPLL_PRESET, g_opll_preset);
            g_dirty = 1;
        }
    }

    /* Operator cards */
    int card_y = 76;
    int card_h = (SCREEN_H - card_y - 4) / g_ops_count;
    if (card_h > 100) card_h = 100;

    for (int i = 0; i < g_ops_count && i < FM_MAX_OPS; i++) {
        render_op_card(i, 4, card_y + i * card_h, SCREEN_W - 8, card_h - 2);
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

void furnace_fm_init(int w, int h) {
    (void)w; (void)h;
    SDL_Init(SDL_INIT_VIDEO);
    g_win = SDL_CreateWindow("Furnace FM Editor",
        SDL_WINDOWPOS_UNDEFINED, SDL_WINDOWPOS_UNDEFINED,
        SCREEN_W, SCREEN_H, 0);
    g_ren = SDL_CreateRenderer(g_win, -1, SDL_RENDERER_SOFTWARE);
    g_tex = SDL_CreateTexture(g_ren, SDL_PIXELFORMAT_ARGB8888,
        SDL_TEXTUREACCESS_STREAMING, SCREEN_W, SCREEN_H);
    memset(g_fb, 0, sizeof(g_fb));
    hwui_set_fb_size(SCREEN_W, SCREEN_H);
    memset(g_ops, 0, sizeof(g_ops));
    for (int i = 0; i < FM_MAX_OPS; i++) g_ops[i].enabled = 1;
    hwui_reset_state();
    g_dirty = 1;
}

void furnace_fm_start(void) {
    emscripten_set_main_loop(tick, 60, 0);
}

void furnace_fm_shutdown(void) {
    emscripten_cancel_main_loop();
    if (g_tex) SDL_DestroyTexture(g_tex);
    if (g_ren) SDL_DestroyRenderer(g_ren);
    if (g_win) SDL_DestroyWindow(g_win);
    g_tex = NULL; g_ren = NULL; g_win = NULL;
}

void furnace_fm_load_config(const uint8_t *buf, int len) {
    if (len < FM_HEADER_SIZE) return;

    g_chip_subtype = buf[0];
    if (g_chip_subtype >= FM_CHIP_COUNT) g_chip_subtype = FM_CHIP_OPN;
    g_algorithm    = buf[1] & 7;
    g_feedback     = buf[2] & 7;
    g_fms          = buf[3] & 7;
    g_ams          = buf[4] & 3;
    g_ops_count    = buf[5];
    if (g_ops_count < 2) g_ops_count = 2;
    if (g_ops_count > 4) g_ops_count = 4;
    g_opll_preset  = buf[6];
    g_fixed_drums  = buf[7] & 1;

    int ops_to_read = g_ops_count;
    if (ops_to_read > FM_MAX_OPS) ops_to_read = FM_MAX_OPS;

    for (int i = 0; i < ops_to_read; i++) {
        int off = FM_HEADER_SIZE + i * FM_OP_SIZE;
        if (off + FM_OP_SIZE > len) break;

        OpState *op = &g_ops[i];
        op->enabled = buf[off + 0];
        op->mult    = buf[off + 1];
        op->tl      = buf[off + 2];
        op->ar      = buf[off + 3];
        op->dr      = buf[off + 4];
        op->d2r     = buf[off + 5];
        op->sl      = buf[off + 6];
        op->rr      = buf[off + 7];
        op->dt      = (int8_t)buf[off + 8];
        op->dt2     = buf[off + 9];
        op->rs      = buf[off + 10];
        op->am      = buf[off + 11];
        op->ksr     = buf[off + 12];
        op->ksl     = buf[off + 13];
        op->sus     = buf[off + 14];
        op->vib     = buf[off + 15];
        op->ws      = buf[off + 16];
        op->ssg     = buf[off + 17];
    }

    g_dirty = 1;
}

int furnace_fm_dump_config(uint8_t *buf, int max_len) {
    if (max_len < FM_CONFIG_SIZE) return 0;

    buf[0] = (uint8_t)g_chip_subtype;
    buf[1] = (uint8_t)(g_algorithm & 7);
    buf[2] = (uint8_t)(g_feedback & 7);
    buf[3] = (uint8_t)(g_fms & 7);
    buf[4] = (uint8_t)(g_ams & 3);
    buf[5] = (uint8_t)g_ops_count;
    buf[6] = (uint8_t)g_opll_preset;
    buf[7] = (uint8_t)(g_fixed_drums & 1);

    for (int i = 0; i < FM_MAX_OPS; i++) {
        int off = FM_HEADER_SIZE + i * FM_OP_SIZE;
        OpState *op = &g_ops[i];

        buf[off + 0] = (uint8_t)op->enabled;
        buf[off + 1] = (uint8_t)op->mult;
        buf[off + 2] = (uint8_t)op->tl;
        buf[off + 3] = (uint8_t)op->ar;
        buf[off + 4] = (uint8_t)op->dr;
        buf[off + 5] = (uint8_t)op->d2r;
        buf[off + 6] = (uint8_t)op->sl;
        buf[off + 7] = (uint8_t)op->rr;
        buf[off + 8] = (uint8_t)(int8_t)op->dt;
        buf[off + 9] = (uint8_t)op->dt2;
        buf[off + 10] = (uint8_t)op->rs;
        buf[off + 11] = (uint8_t)op->am;
        buf[off + 12] = (uint8_t)op->ksr;
        buf[off + 13] = (uint8_t)op->ksl;
        buf[off + 14] = (uint8_t)op->sus;
        buf[off + 15] = (uint8_t)op->vib;
        buf[off + 16] = (uint8_t)op->ws;
        buf[off + 17] = (uint8_t)op->ssg;
        buf[off + 18] = 0;
        buf[off + 19] = 0;
    }

    return FM_CONFIG_SIZE;
}
