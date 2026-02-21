/*
 * hvl_insed.c — HivelyTracker SDL2 Instrument Editor (Standalone WASM Module)
 *
 * Reproduces the authentic HivelyTracker instrument editor UI using SDL2,
 * compiled to WebAssembly via Emscripten.  Provides bidirectional parameter
 * sync with the host React application through EM_JS callbacks.
 *
 * Layout reference: gui.c from Reference Code/hivelytracker-master/
 * All Y coordinates are bg_insed-relative (original Y minus 120).
 */

#include "hvl_insed.h"

#include <SDL2/SDL.h>
#include <SDL2/SDL_ttf.h>
#include <SDL2/SDL_image.h>
#include <emscripten.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

/* ── Dimensions & Layout ─────────────────────────────────────────────── */

#define CANVAS_W 800
#define CANVAS_H 480

/* Performance list area (bg_insed-relative coords) */
#define PERF_X   291
#define PERF_Y   24
#define PERF_W   146
#define PERF_H   438
#define PERF_ROWS (PERF_H / 16)   /* 27 visible rows */

/* Plus/minus sprite geometry (29×38, 2×2 grid) */
#define PM_W     29
#define PM_H     38
#define PM_BTN_W 14
#define PM_BTN_H 19

/* Numberbox dimensions */
#define NB_W     58
#define NB_H     16
#define NB_BTN_AREA 28  /* last 28px contain +/- buttons */

/* Font */
#define FONT_PT  14
#define CHAR_W   8   /* approx width of DejaVuSansMono at 14pt */

/* Colours — DRAW variants are RGBA (for SDL_SetRenderDrawColor),
   TEXT variants are RGB only (for draw_text) */
#define DRAW_BACK      0x00, 0x00, 0x00, 0xFF
#define DRAW_CURSOR    0xFF, 0xFF, 0x88, 0xC0
#define DRAW_ROW_HL    0x50, 0x00, 0x00, 0xFF
#define DRAW_PLEN_HL   0x00, 0x50, 0x00, 0xFF

#define TEXT_WHITE     0xFF, 0xFF, 0xFF
#define TEXT_DIM       0x80, 0x80, 0x80
#define TEXT_BLACK     0x00, 0x00, 0x00

/* ── Types ───────────────────────────────────────────────────────────── */

typedef struct {
    int x, y;           /* position in canvas coords */
    int min, max;
    int param_id;       /* INSED_* enum value */
    char fmt[8];
} Numberbox;

#define MAX_PLIST 256

typedef struct {
    uint8_t note;
    uint8_t waveform;
    uint8_t fixed;
    uint8_t fx[2];
    uint8_t fxParam[2];
} PlistEntry;

/* ── State ───────────────────────────────────────────────────────────── */

static int params[INSED_PARAM_COUNT];
static PlistEntry plist[MAX_PLIST];

/* Perf list navigation */
static int pcurx  = 0;   /* column 0-7 */
static int pcury  = 0;   /* row    0-255 */
static int ptop   = 0;   /* scroll offset */
static int editing = 0;  /* 1 = edit mode */

/* Numberbox array */
#define NB_COUNT INSED_PARAM_COUNT
static Numberbox nboxes[NB_COUNT];
static int nb_pressed = -1;   /* index of currently pressed numberbox, -1=none */
static int nb_press_dir = 0;  /* 1=plus, -1=minus */

/* SDL resources */
static SDL_Window   *window   = NULL;
static SDL_Renderer *renderer = NULL;
static SDL_Texture  *bg_tex   = NULL;
static SDL_Texture  *pm_tex   = NULL;
static TTF_Font     *font     = NULL;

/* Dirty flag — skip render if nothing changed */
static int dirty = 1;

/* ── Note name table (0=off, 1-60=C-1..B-5) ─────────────────────────── */

static const char *note_names[61] = {
    "---",
    "C-1","C#1","D-1","D#1","E-1","F-1","F#1","G-1","G#1","A-1","A#1","B-1",
    "C-2","C#2","D-2","D#2","E-2","F-2","F#2","G-2","G#2","A-2","A#2","B-2",
    "C-3","C#3","D-3","D#3","E-3","F-3","F#3","G-3","G#3","A-3","A#3","B-3",
    "C-4","C#4","D-4","D#4","E-4","F-4","F#4","G-4","G#4","A-4","A#4","B-4",
    "C-5","C#5","D-5","D#5","E-5","F-5","F#5","G-5","G#5","A-5","A#5","B-5",
};

/* Perf list column pixel offsets (within PERF area, from gui.c line 214) */
static const int perf_xoff[8] = { 32, 72, 88, 96, 104, 120, 128, 136 };

/* ── EM_JS Callbacks (C → JS) ────────────────────────────────────────── */

EM_JS(void, js_on_param_change, (int param_id, int value), {
    if (Module.onParamChange) Module.onParamChange(param_id, value);
});

EM_JS(void, js_on_plist_change, (int index, int note, int waveform, int fixed,
                                  int fx0, int fp0, int fx1, int fp1), {
    if (Module.onPlistChange)
        Module.onPlistChange(index, note, waveform, fixed, fx0, fp0, fx1, fp1);
});

EM_JS(void, js_on_plist_length_change, (int new_length), {
    if (Module.onPlistLengthChange) Module.onPlistLengthChange(new_length);
});

/* ── Utility: render a text string at (x,y) ──────────────────────────── */

static void draw_text(int x, int y, const char *text,
                       uint8_t r, uint8_t g, uint8_t b)
{
    if (!text || !text[0] || !font) return;
    SDL_Color col = { r, g, b, 255 };
    SDL_Surface *surf = TTF_RenderText_Solid(font, text, col);
    if (!surf) return;
    SDL_Texture *tex = SDL_CreateTextureFromSurface(renderer, surf);
    if (tex) {
        SDL_Rect dst = { x, y, surf->w, surf->h };
        SDL_RenderCopy(renderer, tex, NULL, &dst);
        SDL_DestroyTexture(tex);
    }
    SDL_FreeSurface(surf);
}

/* ── Numberbox helpers ───────────────────────────────────────────────── */

static void nb_init(int idx, int x, int y, int min, int max,
                     const char *fmt, int param_id)
{
    Numberbox *nb = &nboxes[idx];
    nb->x = x;
    nb->y = y;
    nb->min = min;
    nb->max = max;
    nb->param_id = param_id;
    strncpy(nb->fmt, fmt, sizeof(nb->fmt) - 1);
    nb->fmt[sizeof(nb->fmt) - 1] = '\0';
}

static void nb_set(int idx, int value)
{
    Numberbox *nb = &nboxes[idx];
    if (value < nb->min) value = nb->min;
    if (value > nb->max) value = nb->max;
    params[nb->param_id] = value;
}

static void nb_adjust(int idx, int delta)
{
    Numberbox *nb = &nboxes[idx];
    int old = params[nb->param_id];
    int val = old + delta;
    if (val < nb->min) val = nb->min;
    if (val > nb->max) val = nb->max;
    if (val != old) {
        params[nb->param_id] = val;
        js_on_param_change(nb->param_id, val);
        dirty = 1;
    }
}

/* Render a single numberbox */
static void nb_render(int idx)
{
    Numberbox *nb = &nboxes[idx];
    char buf[16];
    snprintf(buf, sizeof(buf), nb->fmt, params[nb->param_id]);

    /* Value text — right-aligned in the value area (first 30px) */
    int text_x = nb->x + (NB_W - NB_BTN_AREA) - ((int)strlen(buf) * CHAR_W);
    if (text_x < nb->x) text_x = nb->x;
    draw_text(text_x, nb->y, buf, TEXT_WHITE);

    /* Plus button (left of pair) */
    int plus_x  = nb->x + NB_W - NB_BTN_AREA;
    int minus_x = nb->x + NB_W - PM_BTN_W;

    /* Source rects from plusminus sprite:
       Left col (0..14) = minus, Right col (15..28) = plus
       Top row (0..18) = normal, Bottom row (19..37) = pressed */
    int plus_pressed  = (nb_pressed == idx && nb_press_dir > 0);
    int minus_pressed = (nb_pressed == idx && nb_press_dir < 0);

    /* Plus button from right column of sprite */
    SDL_Rect src_plus = { 15, plus_pressed ? PM_BTN_H : 0, PM_BTN_W, PM_BTN_H };
    SDL_Rect dst_plus = { plus_x, nb->y, PM_BTN_W, NB_H };
    SDL_RenderCopy(renderer, pm_tex, &src_plus, &dst_plus);

    /* Minus button from left column of sprite */
    SDL_Rect src_minus = { 0, minus_pressed ? PM_BTN_H : 0, 15, PM_BTN_H };
    SDL_Rect dst_minus = { minus_x, nb->y, PM_BTN_W, NB_H };
    SDL_RenderCopy(renderer, pm_tex, &src_minus, &dst_minus);
}

/* ── Performance list rendering ──────────────────────────────────────── */

static void render_perf(void)
{
    int plen = params[INSED_PERF_LENGTH];

    /* Clamp cursor/scroll */
    if (pcury < 0)   pcury = 0;
    if (pcury > 255) pcury = 255;
    if (pcurx < 0)   pcurx = 0;
    if (pcurx > 7)   pcurx = 7;
    if (pcury < ptop) ptop = pcury;
    if (pcury >= ptop + PERF_ROWS) ptop = pcury - (PERF_ROWS - 1);
    if (ptop < 0) ptop = 0;
    if (ptop > 255 - PERF_ROWS) ptop = 255 - PERF_ROWS;

    /* Clear the perf area */
    SDL_Rect area = { PERF_X, PERF_Y, PERF_W, PERF_H };
    SDL_SetRenderDrawColor(renderer, DRAW_BACK);
    SDL_RenderFillRect(renderer, &area);

    for (int i = 0; i < PERF_ROWS; i++) {
        int row = i + ptop;
        if (row > 255) break;

        int y = PERF_Y + 4 + i * 16;
        PlistEntry *e = &plist[row];

        /* Row highlight */
        if (row == pcury) {
            SDL_Rect hl = { PERF_X, y - 1, PERF_W, 16 };
            SDL_SetRenderDrawColor(renderer, DRAW_ROW_HL);
            SDL_RenderFillRect(renderer, &hl);
        }

        /* Perf length marker (green line after last entry) */
        if (row == plen) {
            SDL_Rect ln = { PERF_X, y - 1, PERF_W, 1 };
            SDL_SetRenderDrawColor(renderer, DRAW_PLEN_HL);
            SDL_RenderFillRect(renderer, &ln);
        }

        /* Format row text */
        const char *nn = (e->note <= 60) ? note_names[e->note] : "???";
        char fixed_ch = e->fixed ? '*' : ' ';
        char buf[32];
        snprintf(buf, sizeof(buf), "%03d %s%c%d %X%02X %X%02X",
                 row, nn, fixed_ch, e->waveform,
                 e->fx[0] & 0xF, e->fxParam[0] & 0xFF,
                 e->fx[1] & 0xF, e->fxParam[1] & 0xFF);

        uint8_t tr = 0xFF, tg = 0xFF, tb = 0xFF;
        if (row > plen) { tr = 0x80; tg = 0x80; tb = 0x80; }

        draw_text(PERF_X + 2, y, buf, tr, tg, tb);

        /* Cursor highlight on current column */
        if (row == pcury && editing) {
            /* Column cursor widths (chars): note=3, wave=1, fx0=1, fp0h=1, fp0l=1, fx1=1, fp1h=1, fp1l=1 */
            static const int col_widths[] = { 3, 1, 1, 1, 1, 1, 1, 1 };
            int cx = PERF_X + perf_xoff[pcurx];
            int cw = col_widths[pcurx] * CHAR_W + 2;
            SDL_Rect cur = { cx - 1, y - 1, cw, 15 };
            SDL_SetRenderDrawColor(renderer, DRAW_CURSOR);
            SDL_RenderFillRect(renderer, &cur);

            /* Re-draw the cursor text on top so it's visible */
            /* Extract substring for this column */
            int char_off = 0;
            switch (pcurx) {
                case 0: char_off = 4; break;   /* note at char 4 */
                case 1: char_off = 8; break;   /* waveform at char 8 */
                case 2: char_off = 10; break;  /* fx0 */
                case 3: char_off = 11; break;  /* fp0 hi */
                case 4: char_off = 12; break;  /* fp0 lo */
                case 5: char_off = 14; break;  /* fx1 */
                case 6: char_off = 15; break;  /* fp1 hi */
                case 7: char_off = 16; break;  /* fp1 lo */
            }
            char sub[8];
            int slen = col_widths[pcurx];
            if (char_off + slen <= (int)strlen(buf)) {
                memcpy(sub, buf + char_off, slen);
                sub[slen] = '\0';
                draw_text(cx, y, sub, TEXT_BLACK);
            }
        }
    }
}

/* ── Full render ─────────────────────────────────────────────────────── */

static void render(void)
{
    /* Background */
    SDL_RenderCopy(renderer, bg_tex, NULL, NULL);

    /* Numberboxes */
    for (int i = 0; i < NB_COUNT; i++)
        nb_render(i);

    /* Performance list */
    render_perf();

    SDL_RenderPresent(renderer);
    dirty = 0;
}

/* ── Input handling ──────────────────────────────────────────────────── */

static int hit_numberbox(int mx, int my, int *dir)
{
    for (int i = 0; i < NB_COUNT; i++) {
        Numberbox *nb = &nboxes[i];
        if (mx >= nb->x && mx < nb->x + NB_W &&
            my >= nb->y && my < nb->y + NB_H)
        {
            int btn_start = nb->x + NB_W - NB_BTN_AREA;
            int btn_mid   = nb->x + NB_W - PM_BTN_W;
            if (mx >= btn_start && mx < btn_mid) {
                *dir = 1;   /* plus */
                return i;
            } else if (mx >= btn_mid) {
                *dir = -1;  /* minus */
                return i;
            }
            /* Clicked on value area — no action for now */
            return -1;
        }
    }
    return -1;
}

static int hit_perf_row(int mx, int my)
{
    if (mx >= PERF_X && mx < PERF_X + PERF_W &&
        my >= PERF_Y && my < PERF_Y + PERF_H)
    {
        int row = ((my - PERF_Y - 4) / 16);
        if (row < 0) row = 0;
        return row + ptop;
    }
    return -1;
}

static void handle_mouse_down(int mx, int my)
{
    /* Check numberboxes first */
    int dir = 0;
    int nb = hit_numberbox(mx, my, &dir);
    if (nb >= 0) {
        nb_pressed = nb;
        nb_press_dir = dir;
        nb_adjust(nb, dir);
        dirty = 1;
        return;
    }

    /* Check perf list click */
    int row = hit_perf_row(mx, my);
    if (row >= 0 && row <= 255) {
        pcury = row;
        dirty = 1;
    }
}

static void handle_mouse_up(void)
{
    if (nb_pressed >= 0) {
        nb_pressed = -1;
        dirty = 1;
    }
}

static void handle_wheel(int mx, int my, int dy)
{
    /* Wheel on numberbox → adjust value */
    int dir = 0;
    int nb = hit_numberbox(mx, my, &dir);
    /* Even if not on a button, check if we're in the numberbox area */
    for (int i = 0; i < NB_COUNT; i++) {
        Numberbox *n = &nboxes[i];
        if (mx >= n->x && mx < n->x + NB_W &&
            my >= n->y && my < n->y + NB_H)
        {
            nb_adjust(i, -dy);  /* scroll up = increase */
            return;
        }
    }

    /* Wheel on perf list → scroll */
    if (mx >= PERF_X && mx < PERF_X + PERF_W &&
        my >= PERF_Y && my < PERF_Y + PERF_H)
    {
        pcury += dy;
        if (pcury < 0) pcury = 0;
        if (pcury > 255) pcury = 255;
        dirty = 1;
    }
}

static void handle_key(SDL_Keycode key, SDL_Keymod mod)
{
    int plen = params[INSED_PERF_LENGTH];
    PlistEntry *e = &plist[pcury];
    int shift = (mod & KMOD_SHIFT);

    switch (key) {
    case SDLK_UP:
        if (shift)
            pcury -= PERF_ROWS;
        else
            pcury--;
        if (pcury < 0) pcury = 0;
        dirty = 1;
        break;

    case SDLK_DOWN:
        if (shift)
            pcury += PERF_ROWS;
        else
            pcury++;
        if (pcury > 255) pcury = 255;
        dirty = 1;
        break;

    case SDLK_LEFT:
        pcurx--;
        if (pcurx < 0) pcurx = 0;
        dirty = 1;
        break;

    case SDLK_RIGHT:
        pcurx++;
        if (pcurx > 7) pcurx = 7;
        dirty = 1;
        break;

    case SDLK_SPACE:
        editing = !editing;
        dirty = 1;
        break;

    case SDLK_TAB:
        /* Toggle fixed flag */
        if (editing) {
            e->fixed = e->fixed ? 0 : 1;
            js_on_plist_change(pcury, e->note, e->waveform, e->fixed,
                               e->fx[0], e->fxParam[0], e->fx[1], e->fxParam[1]);
            dirty = 1;
        }
        break;

    case SDLK_DELETE:
    case SDLK_BACKSPACE:
        if (editing && pcurx == 0) {
            /* Clear note */
            e->note = 0;
            js_on_plist_change(pcury, e->note, e->waveform, e->fixed,
                               e->fx[0], e->fxParam[0], e->fx[1], e->fxParam[1]);
            pcury++;
            if (pcury > 255) pcury = 255;
            dirty = 1;
        }
        break;

    default:
        if (!editing) break;

        /* Hex input for perf list columns 1-7 */
        if (pcurx >= 1) {
            int hexval = -1;
            if (key >= SDLK_0 && key <= SDLK_9)
                hexval = key - SDLK_0;
            else if (key >= SDLK_a && key <= SDLK_f)
                hexval = 10 + (key - SDLK_a);

            if (hexval >= 0) {
                switch (pcurx) {
                case 1: /* waveform 0-4 */
                    if (hexval <= 4) {
                        e->waveform = hexval;
                    }
                    break;
                case 2: /* fx0 */
                    e->fx[0] = hexval;
                    break;
                case 3: /* fxparam0 high nibble */
                    e->fxParam[0] = (e->fxParam[0] & 0x0F) | (hexval << 4);
                    break;
                case 4: /* fxparam0 low nibble */
                    e->fxParam[0] = (e->fxParam[0] & 0xF0) | hexval;
                    break;
                case 5: /* fx1 */
                    e->fx[1] = hexval;
                    break;
                case 6: /* fxparam1 high nibble */
                    e->fxParam[1] = (e->fxParam[1] & 0x0F) | (hexval << 4);
                    break;
                case 7: /* fxparam1 low nibble */
                    e->fxParam[1] = (e->fxParam[1] & 0xF0) | hexval;
                    break;
                }

                js_on_plist_change(pcury, e->note, e->waveform, e->fixed,
                                   e->fx[0], e->fxParam[0],
                                   e->fx[1], e->fxParam[1]);
                pcury++;
                if (pcury > 255) pcury = 255;
                dirty = 1;
            }
        }
        break;
    }
}

static void handle_event(SDL_Event *ev)
{
    switch (ev->type) {
    case SDL_MOUSEBUTTONDOWN:
        handle_mouse_down(ev->button.x, ev->button.y);
        break;
    case SDL_MOUSEBUTTONUP:
        handle_mouse_up();
        break;
    case SDL_MOUSEWHEEL:
        {
            int mx, my;
            SDL_GetMouseState(&mx, &my);
            handle_wheel(mx, my, ev->wheel.y);
        }
        break;
    case SDL_KEYDOWN:
        handle_key(ev->key.keysym.sym, ev->key.keysym.mod);
        break;
    }
}

/* ── Main loop tick ──────────────────────────────────────────────────── */

static void tick(void)
{
    SDL_Event ev;
    while (SDL_PollEvent(&ev))
        handle_event(&ev);

    if (dirty)
        render();
}

/* ── Numberbox table init ────────────────────────────────────────────── */

static void init_numberboxes(void)
{
    /* Left column (x=72) — Y coords from gui.c minus 120 offset */
    nb_init(INSED_VOLUME,         72,  42,  0,  64, " %02d", INSED_VOLUME);
    nb_init(INSED_WAVELENGTH,     72,  62,  0,   5, " %02X", INSED_WAVELENGTH);
    nb_init(INSED_ATTACK_FRAMES,  72, 100,  1, 255, "%03d",  INSED_ATTACK_FRAMES);
    nb_init(INSED_ATTACK_VOLUME,  72, 120,  0,  64, " %02d", INSED_ATTACK_VOLUME);
    nb_init(INSED_DECAY_FRAMES,   72, 140,  1, 255, "%03d",  INSED_DECAY_FRAMES);
    nb_init(INSED_DECAY_VOLUME,   72, 160,  0,  64, " %02d", INSED_DECAY_VOLUME);
    nb_init(INSED_SUSTAIN_FRAMES, 72, 180,  1, 255, "%03d",  INSED_SUSTAIN_FRAMES);
    nb_init(INSED_RELEASE_FRAMES, 72, 200,  1, 255, "%03d",  INSED_RELEASE_FRAMES);
    nb_init(INSED_RELEASE_VOLUME, 72, 220,  0,  64, " %02d", INSED_RELEASE_VOLUME);
    nb_init(INSED_VIBRATO_DELAY,  72, 258,  0, 255, "%03d",  INSED_VIBRATO_DELAY);
    nb_init(INSED_VIBRATO_DEPTH,  72, 278,  0,  15, " %02d", INSED_VIBRATO_DEPTH);
    nb_init(INSED_VIBRATO_SPEED,  72, 298,  0,  63, " %02d", INSED_VIBRATO_SPEED);
    nb_init(INSED_SQUARE_LOWER,   72, 336,  1,  63, " %02d", INSED_SQUARE_LOWER);
    nb_init(INSED_SQUARE_UPPER,   72, 356,  1,  63, " %02d", INSED_SQUARE_UPPER);
    nb_init(INSED_SQUARE_SPEED,   72, 376,  0, 127, "%03d",  INSED_SQUARE_SPEED);
    nb_init(INSED_FILTER_LOWER,   72, 414,  1,  63, " %02d", INSED_FILTER_LOWER);
    nb_init(INSED_FILTER_UPPER,   72, 434,  1,  63, " %02d", INSED_FILTER_UPPER);
    nb_init(INSED_FILTER_SPEED,   72, 454,  0, 127, "%03d",  INSED_FILTER_SPEED);

    /* Right column (x=208) */
    nb_init(INSED_PERF_SPEED,       208,  42,  0, 255, "%03d",  INSED_PERF_SPEED);
    nb_init(INSED_PERF_LENGTH,      208,  62,  0, 255, "%03d",  INSED_PERF_LENGTH);
    nb_init(INSED_HARDCUT_FRAMES,   208,  82,  0,   7, "  %01d", INSED_HARDCUT_FRAMES);
    nb_init(INSED_HARDCUT_RELEASE,  208, 102,  0,   1, "  %01d", INSED_HARDCUT_RELEASE);
}

/* ── Default instrument values ───────────────────────────────────────── */

static void init_defaults(void)
{
    params[INSED_VOLUME]          = 64;
    params[INSED_WAVELENGTH]      = 3;
    params[INSED_ATTACK_FRAMES]   = 1;
    params[INSED_ATTACK_VOLUME]   = 64;
    params[INSED_DECAY_FRAMES]    = 1;
    params[INSED_DECAY_VOLUME]    = 64;
    params[INSED_SUSTAIN_FRAMES]  = 1;
    params[INSED_RELEASE_FRAMES]  = 1;
    params[INSED_RELEASE_VOLUME]  = 0;
    params[INSED_VIBRATO_DELAY]   = 0;
    params[INSED_VIBRATO_DEPTH]   = 0;
    params[INSED_VIBRATO_SPEED]   = 0;
    params[INSED_SQUARE_LOWER]    = 32;
    params[INSED_SQUARE_UPPER]    = 63;
    params[INSED_SQUARE_SPEED]    = 1;
    params[INSED_FILTER_LOWER]    = 0;
    params[INSED_FILTER_UPPER]    = 0;
    params[INSED_FILTER_SPEED]    = 0;
    params[INSED_PERF_SPEED]      = 1;
    params[INSED_PERF_LENGTH]     = 1;
    params[INSED_HARDCUT_FRAMES]  = 0;
    params[INSED_HARDCUT_RELEASE] = 0;

    memset(plist, 0, sizeof(plist));
    plist[0].waveform = 2;  /* default: square wave */
}

/* ── Public API ──────────────────────────────────────────────────────── */

void insed_init(int canvas_width, int canvas_height)
{
    (void)canvas_width;
    (void)canvas_height;

    init_defaults();
    init_numberboxes();

    SDL_Init(SDL_INIT_VIDEO);
    TTF_Init();
    IMG_Init(IMG_INIT_PNG);

    window = SDL_CreateWindow("HivelyTracker InsEd",
                              SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED,
                              CANVAS_W, CANVAS_H, 0);
    renderer = SDL_CreateRenderer(window, -1,
                                  SDL_RENDERER_ACCELERATED | SDL_RENDERER_PRESENTVSYNC);

    /* Load assets from embedded filesystem */
    SDL_Surface *bg_surf = IMG_Load("/assets/bg_insed.png");
    if (bg_surf) {
        bg_tex = SDL_CreateTextureFromSurface(renderer, bg_surf);
        SDL_FreeSurface(bg_surf);
    }

    SDL_Surface *pm_surf = IMG_Load("/assets/plusminus.png");
    if (pm_surf) {
        pm_tex = SDL_CreateTextureFromSurface(renderer, pm_surf);
        SDL_FreeSurface(pm_surf);
    }

    font = TTF_OpenFont("/assets/DejaVuSansMono.ttf", FONT_PT);

    dirty = 1;
}

void insed_start(void)
{
    emscripten_set_main_loop(tick, 30, 0);
}

void insed_shutdown(void)
{
    emscripten_cancel_main_loop();
    if (font)     { TTF_CloseFont(font);       font = NULL; }
    if (pm_tex)   { SDL_DestroyTexture(pm_tex); pm_tex = NULL; }
    if (bg_tex)   { SDL_DestroyTexture(bg_tex); bg_tex = NULL; }
    if (renderer) { SDL_DestroyRenderer(renderer); renderer = NULL; }
    if (window)   { SDL_DestroyWindow(window);     window = NULL; }
    IMG_Quit();
    TTF_Quit();
    SDL_Quit();
}

void insed_set_param(int param_id, int value)
{
    if (param_id < 0 || param_id >= INSED_PARAM_COUNT) return;
    Numberbox *nb = &nboxes[param_id];
    if (value < nb->min) value = nb->min;
    if (value > nb->max) value = nb->max;
    params[param_id] = value;
    dirty = 1;
}

int insed_get_param(int param_id)
{
    if (param_id < 0 || param_id >= INSED_PARAM_COUNT) return 0;
    return params[param_id];
}

void insed_set_plist_entry(int index, int note, int waveform, int fixed,
                           int fx0, int fxparam0, int fx1, int fxparam1)
{
    if (index < 0 || index >= MAX_PLIST) return;
    PlistEntry *e = &plist[index];
    e->note      = (uint8_t)note;
    e->waveform  = (uint8_t)waveform;
    e->fixed     = (uint8_t)(fixed ? 1 : 0);
    e->fx[0]     = (uint8_t)fx0;
    e->fxParam[0]= (uint8_t)fxparam0;
    e->fx[1]     = (uint8_t)fx1;
    e->fxParam[1]= (uint8_t)fxparam1;
    dirty = 1;
}

void insed_get_plist_entry(int index, int *note, int *waveform, int *fixed,
                           int *fx0, int *fxparam0, int *fx1, int *fxparam1)
{
    if (index < 0 || index >= MAX_PLIST) return;
    PlistEntry *e = &plist[index];
    if (note)     *note     = e->note;
    if (waveform) *waveform = e->waveform;
    if (fixed)    *fixed    = e->fixed;
    if (fx0)      *fx0      = e->fx[0];
    if (fxparam0) *fxparam0 = e->fxParam[0];
    if (fx1)      *fx1      = e->fx[1];
    if (fxparam1) *fxparam1 = e->fxParam[1];
}

void insed_load_from_buffer(const uint8_t *buf, int len)
{
    if (!buf || len < 22) return;

    /* 22-byte header */
    params[INSED_VOLUME]          = buf[0];
    params[INSED_WAVELENGTH]      = buf[1];
    params[INSED_ATTACK_FRAMES]   = buf[2];
    params[INSED_ATTACK_VOLUME]   = buf[3];
    params[INSED_DECAY_FRAMES]    = buf[4];
    params[INSED_DECAY_VOLUME]    = buf[5];
    params[INSED_SUSTAIN_FRAMES]  = buf[6];
    params[INSED_RELEASE_FRAMES]  = buf[7];
    params[INSED_RELEASE_VOLUME]  = buf[8];
    params[INSED_VIBRATO_DELAY]   = buf[9];
    params[INSED_VIBRATO_DEPTH]   = buf[10];
    params[INSED_VIBRATO_SPEED]   = buf[11];
    params[INSED_SQUARE_LOWER]    = buf[12];
    params[INSED_SQUARE_UPPER]    = buf[13];
    params[INSED_SQUARE_SPEED]    = buf[14];
    params[INSED_FILTER_LOWER]    = buf[15];
    params[INSED_FILTER_UPPER]    = buf[16];
    params[INSED_FILTER_SPEED]    = buf[17];
    params[INSED_PERF_SPEED]      = buf[18];
    params[INSED_PERF_LENGTH]     = buf[19];
    params[INSED_HARDCUT_FRAMES]  = buf[20];
    params[INSED_HARDCUT_RELEASE] = buf[21];

    /* Clamp all params to their ranges */
    for (int i = 0; i < INSED_PARAM_COUNT; i++)
        nb_set(i, params[i]);

    /* 5 bytes per plist entry */
    int entry_count = (len - 22) / 5;
    if (entry_count > MAX_PLIST) entry_count = MAX_PLIST;

    memset(plist, 0, sizeof(plist));
    for (int i = 0; i < entry_count; i++) {
        const uint8_t *p = buf + 22 + i * 5;
        plist[i].note     = p[0];
        plist[i].waveform = p[1] & 0x7F;
        plist[i].fixed    = (p[1] >> 7) & 1;
        plist[i].fx[0]    = (p[2] >> 4) & 0x0F;
        plist[i].fx[1]    = p[2] & 0x0F;
        plist[i].fxParam[0] = p[3];
        plist[i].fxParam[1] = p[4];
    }

    pcury = 0;
    pcurx = 0;
    ptop  = 0;
    dirty = 1;
}

int insed_dump_to_buffer(uint8_t *buf, int max_len)
{
    int plen = params[INSED_PERF_LENGTH];
    int needed = 22 + plen * 5;
    if (!buf || max_len < needed) return needed;

    /* Header */
    buf[0]  = (uint8_t)params[INSED_VOLUME];
    buf[1]  = (uint8_t)params[INSED_WAVELENGTH];
    buf[2]  = (uint8_t)params[INSED_ATTACK_FRAMES];
    buf[3]  = (uint8_t)params[INSED_ATTACK_VOLUME];
    buf[4]  = (uint8_t)params[INSED_DECAY_FRAMES];
    buf[5]  = (uint8_t)params[INSED_DECAY_VOLUME];
    buf[6]  = (uint8_t)params[INSED_SUSTAIN_FRAMES];
    buf[7]  = (uint8_t)params[INSED_RELEASE_FRAMES];
    buf[8]  = (uint8_t)params[INSED_RELEASE_VOLUME];
    buf[9]  = (uint8_t)params[INSED_VIBRATO_DELAY];
    buf[10] = (uint8_t)params[INSED_VIBRATO_DEPTH];
    buf[11] = (uint8_t)params[INSED_VIBRATO_SPEED];
    buf[12] = (uint8_t)params[INSED_SQUARE_LOWER];
    buf[13] = (uint8_t)params[INSED_SQUARE_UPPER];
    buf[14] = (uint8_t)params[INSED_SQUARE_SPEED];
    buf[15] = (uint8_t)params[INSED_FILTER_LOWER];
    buf[16] = (uint8_t)params[INSED_FILTER_UPPER];
    buf[17] = (uint8_t)params[INSED_FILTER_SPEED];
    buf[18] = (uint8_t)params[INSED_PERF_SPEED];
    buf[19] = (uint8_t)params[INSED_PERF_LENGTH];
    buf[20] = (uint8_t)params[INSED_HARDCUT_FRAMES];
    buf[21] = (uint8_t)params[INSED_HARDCUT_RELEASE];

    /* Entries */
    for (int i = 0; i < plen; i++) {
        uint8_t *p = buf + 22 + i * 5;
        p[0] = plist[i].note;
        p[1] = (plist[i].waveform & 0x7F) | ((plist[i].fixed & 1) << 7);
        p[2] = ((plist[i].fx[0] & 0x0F) << 4) | (plist[i].fx[1] & 0x0F);
        p[3] = plist[i].fxParam[0];
        p[4] = plist[i].fxParam[1];
    }

    return needed;
}
