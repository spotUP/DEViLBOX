/*
    SunVoxUI.cpp
    Framebuffer UI WASM for DEViLBOX SunVox integration.

    Design: Fallback pixel-buffer renderer (Option B).

    The sundog window manager requires platform backends (X11, Win32, SDL,
    OpenGL) that cannot be compiled to WASM without substantial porting.
    Instead this module maintains a BGRA framebuffer and renders module
    controls as labelled value-bar rows — giving the "framebuffer concept"
    without the full WM dependency chain.

    Framebuffer format: BGRA 32-bit (0xAA_RR_GG_BB stored little-endian as
    [BB, GG, RR, AA]), matching the PT2/FT2 WASM convention.  The React
    canvas blitter byte-swaps to RGBA.

    API (exported EMSCRIPTEN_KEEPALIVE symbols):
        sunvox_ui_create(width, height)             → int handle
        sunvox_ui_destroy(handle)
        sunvox_ui_set_module(handle, mod_name,      (no engine ref needed –
                             ctls_count,             caller pushes snapshot)
                             ctl_names_flat,
                             ctl_mins_flat,
                             ctl_maxs_flat,
                             ctl_vals_flat)
        sunvox_ui_update_values(handle, ctl_vals)   update only values
        sunvox_ui_mouse_event(handle, type, x, y, btn)
        sunvox_ui_key_event(handle, key, mod)
        sunvox_ui_tick(handle)
        sunvox_ui_get_framebuffer(handle)           → void* (BGRA pixels)
        sunvox_ui_get_clicked_ctl(handle)           → int (-1 = none)
        sunvox_ui_get_clicked_value(handle)         → int

    The JS caller is responsible for:
      1. Calling sunvox_ui_set_module() after binding a SunVox module.
      2. Calling sunvox_ui_update_values() each time control values change.
      3. Calling sunvox_ui_tick() once per rAF frame.
      4. Reading sunvox_ui_get_framebuffer() and blitting to a canvas.
      5. Forwarding mouse events via sunvox_ui_mouse_event().
*/

#ifndef __EMSCRIPTEN__
#define __EMSCRIPTEN__
#endif

#include <emscripten.h>
#include <cstring>
#include <cstdlib>
#include <cstdio>
#include <cstdint>

/* ======================================================================== */
/*  Constants and layout                                                     */
/* ======================================================================== */

#define MAX_UI_INSTANCES  8
#define MAX_CTLS          64
#define CTL_NAME_LEN      32

/* Row layout (pixels) */
#define ROW_H             20   /* height of each control row               */
#define LABEL_W           120  /* width of the label column                */
#define BAR_MARGIN        4    /* gap between label and bar                 */
#define BAR_H             10   /* height of the value bar                  */
#define HEADER_H          28   /* module name header height                 */
#define FOOTER_H          0

/* Packs R, G, B (0-255 each) and A=255 into a little-endian BGRA uint32
   as stored in the framebuffer: memory order [B, G, R, A].                  */
static inline uint32_t rgba_pixel( uint8_t r, uint8_t g, uint8_t b, uint8_t a = 255 )
{
    return ( (uint32_t)a << 24 ) | ( (uint32_t)r << 16 ) | ( (uint32_t)g << 8 ) | b;
}

/* Colors */
static const uint32_t COL_BG          = 0xFF1A1A1A;   /* dark background   */
static const uint32_t COL_HEADER_BG   = 0xFF252525;   /* header bg         */
static const uint32_t COL_HEADER_TXT  = 0xFFE0E0E0;   /* header text       */
static const uint32_t COL_ROW_EVEN    = 0xFF1E1E1E;   /* even row bg       */
static const uint32_t COL_ROW_ODD     = 0xFF232323;   /* odd row bg        */
static const uint32_t COL_ROW_HOVER   = 0xFF2A3A4A;   /* hovered row       */
static const uint32_t COL_ROW_ACTIVE  = 0xFF1E3050;   /* active/pressed row*/
static const uint32_t COL_LABEL       = 0xFFB0B8C0;   /* label text        */
static const uint32_t COL_BAR_TRACK   = 0xFF333333;   /* bar background    */
static const uint32_t COL_BAR_FILL    = 0xFF4080C0;   /* filled portion    */
static const uint32_t COL_BAR_ACTIVE  = 0xFF60B0E0;   /* active bar fill   */
static const uint32_t COL_SEPARATOR   = 0xFF2C2C2C;   /* row separator     */
static const uint32_t COL_VALUE_TXT   = 0xFF90C8E0;   /* value text        */

/* ======================================================================== */
/*  Tiny 5×7 bitmap font (ASCII 32–126)                                     */
/*                                                                           */
/*  Each character is 5 columns × 7 rows, stored as 5 bytes where each     */
/*  byte is a column bitmask (bit 0 = top row, bit 6 = bottom row).         */
/* ======================================================================== */

#define FONT_W  5
#define FONT_H  7
#define FONT_FIRST 32
#define FONT_LAST  126

static const uint8_t g_font[ (FONT_LAST - FONT_FIRST + 1) * FONT_W ] = {
    /* 32 ' '  */ 0x00,0x00,0x00,0x00,0x00,
    /* 33 '!'  */ 0x00,0x00,0x5F,0x00,0x00,
    /* 34 '"'  */ 0x00,0x07,0x00,0x07,0x00,
    /* 35 '#'  */ 0x14,0x7F,0x14,0x7F,0x14,
    /* 36 '$'  */ 0x24,0x2A,0x7F,0x2A,0x12,
    /* 37 '%'  */ 0x23,0x13,0x08,0x64,0x62,
    /* 38 '&'  */ 0x36,0x49,0x55,0x22,0x50,
    /* 39 '''  */ 0x00,0x05,0x03,0x00,0x00,
    /* 40 '('  */ 0x00,0x1C,0x22,0x41,0x00,
    /* 41 ')'  */ 0x00,0x41,0x22,0x1C,0x00,
    /* 42 '*'  */ 0x14,0x08,0x3E,0x08,0x14,
    /* 43 '+'  */ 0x08,0x08,0x3E,0x08,0x08,
    /* 44 ','  */ 0x00,0x50,0x30,0x00,0x00,
    /* 45 '-'  */ 0x08,0x08,0x08,0x08,0x08,
    /* 46 '.'  */ 0x00,0x60,0x60,0x00,0x00,
    /* 47 '/'  */ 0x20,0x10,0x08,0x04,0x02,
    /* 48 '0'  */ 0x3E,0x51,0x49,0x45,0x3E,
    /* 49 '1'  */ 0x00,0x42,0x7F,0x40,0x00,
    /* 50 '2'  */ 0x42,0x61,0x51,0x49,0x46,
    /* 51 '3'  */ 0x21,0x41,0x45,0x4B,0x31,
    /* 52 '4'  */ 0x18,0x14,0x12,0x7F,0x10,
    /* 53 '5'  */ 0x27,0x45,0x45,0x45,0x39,
    /* 54 '6'  */ 0x3C,0x4A,0x49,0x49,0x30,
    /* 55 '7'  */ 0x01,0x71,0x09,0x05,0x03,
    /* 56 '8'  */ 0x36,0x49,0x49,0x49,0x36,
    /* 57 '9'  */ 0x06,0x49,0x49,0x29,0x1E,
    /* 58 ':'  */ 0x00,0x36,0x36,0x00,0x00,
    /* 59 ';'  */ 0x00,0x56,0x36,0x00,0x00,
    /* 60 '<'  */ 0x08,0x14,0x22,0x41,0x00,
    /* 61 '='  */ 0x14,0x14,0x14,0x14,0x14,
    /* 62 '>'  */ 0x00,0x41,0x22,0x14,0x08,
    /* 63 '?'  */ 0x02,0x01,0x51,0x09,0x06,
    /* 64 '@'  */ 0x32,0x49,0x79,0x41,0x3E,
    /* 65 'A'  */ 0x7E,0x11,0x11,0x11,0x7E,
    /* 66 'B'  */ 0x7F,0x49,0x49,0x49,0x36,
    /* 67 'C'  */ 0x3E,0x41,0x41,0x41,0x22,
    /* 68 'D'  */ 0x7F,0x41,0x41,0x22,0x1C,
    /* 69 'E'  */ 0x7F,0x49,0x49,0x49,0x41,
    /* 70 'F'  */ 0x7F,0x09,0x09,0x09,0x01,
    /* 71 'G'  */ 0x3E,0x41,0x49,0x49,0x7A,
    /* 72 'H'  */ 0x7F,0x08,0x08,0x08,0x7F,
    /* 73 'I'  */ 0x00,0x41,0x7F,0x41,0x00,
    /* 74 'J'  */ 0x20,0x40,0x41,0x3F,0x01,
    /* 75 'K'  */ 0x7F,0x08,0x14,0x22,0x41,
    /* 76 'L'  */ 0x7F,0x40,0x40,0x40,0x40,
    /* 77 'M'  */ 0x7F,0x02,0x0C,0x02,0x7F,
    /* 78 'N'  */ 0x7F,0x04,0x08,0x10,0x7F,
    /* 79 'O'  */ 0x3E,0x41,0x41,0x41,0x3E,
    /* 80 'P'  */ 0x7F,0x09,0x09,0x09,0x06,
    /* 81 'Q'  */ 0x3E,0x41,0x51,0x21,0x5E,
    /* 82 'R'  */ 0x7F,0x09,0x19,0x29,0x46,
    /* 83 'S'  */ 0x46,0x49,0x49,0x49,0x31,
    /* 84 'T'  */ 0x01,0x01,0x7F,0x01,0x01,
    /* 85 'U'  */ 0x3F,0x40,0x40,0x40,0x3F,
    /* 86 'V'  */ 0x1F,0x20,0x40,0x20,0x1F,
    /* 87 'W'  */ 0x3F,0x40,0x38,0x40,0x3F,
    /* 88 'X'  */ 0x63,0x14,0x08,0x14,0x63,
    /* 89 'Y'  */ 0x07,0x08,0x70,0x08,0x07,
    /* 90 'Z'  */ 0x61,0x51,0x49,0x45,0x43,
    /* 91 '['  */ 0x00,0x7F,0x41,0x41,0x00,
    /* 92 '\\'  */ 0x02,0x04,0x08,0x10,0x20,
    /* 93 ']'  */ 0x00,0x41,0x41,0x7F,0x00,
    /* 94 '^'  */ 0x04,0x02,0x01,0x02,0x04,
    /* 95 '_'  */ 0x40,0x40,0x40,0x40,0x40,
    /* 96 '`'  */ 0x00,0x01,0x02,0x04,0x00,
    /* 97 'a'  */ 0x20,0x54,0x54,0x54,0x78,
    /* 98 'b'  */ 0x7F,0x48,0x44,0x44,0x38,
    /* 99 'c'  */ 0x38,0x44,0x44,0x44,0x20,
    /* 100 'd' */ 0x38,0x44,0x44,0x48,0x7F,
    /* 101 'e' */ 0x38,0x54,0x54,0x54,0x18,
    /* 102 'f' */ 0x08,0x7E,0x09,0x01,0x02,
    /* 103 'g' */ 0x0C,0x52,0x52,0x52,0x3E,
    /* 104 'h' */ 0x7F,0x08,0x04,0x04,0x78,
    /* 105 'i' */ 0x00,0x44,0x7D,0x40,0x00,
    /* 106 'j' */ 0x20,0x40,0x44,0x3D,0x00,
    /* 107 'k' */ 0x7F,0x10,0x28,0x44,0x00,
    /* 108 'l' */ 0x00,0x41,0x7F,0x40,0x00,
    /* 109 'm' */ 0x7C,0x04,0x18,0x04,0x78,
    /* 110 'n' */ 0x7C,0x08,0x04,0x04,0x78,
    /* 111 'o' */ 0x38,0x44,0x44,0x44,0x38,
    /* 112 'p' */ 0x7C,0x14,0x14,0x14,0x08,
    /* 113 'q' */ 0x08,0x14,0x14,0x18,0x7C,
    /* 114 'r' */ 0x7C,0x08,0x04,0x04,0x08,
    /* 115 's' */ 0x48,0x54,0x54,0x54,0x20,
    /* 116 't' */ 0x04,0x3F,0x44,0x40,0x20,
    /* 117 'u' */ 0x3C,0x40,0x40,0x40,0x3C,
    /* 118 'v' */ 0x1C,0x20,0x40,0x20,0x1C,
    /* 119 'w' */ 0x3C,0x40,0x30,0x40,0x3C,
    /* 120 'x' */ 0x44,0x28,0x10,0x28,0x44,
    /* 121 'y' */ 0x0C,0x50,0x50,0x50,0x3C,
    /* 122 'z' */ 0x44,0x64,0x54,0x4C,0x44,
    /* 123 '{' */ 0x00,0x08,0x36,0x41,0x00,
    /* 124 '|' */ 0x00,0x00,0x7F,0x00,0x00,
    /* 125 '}' */ 0x00,0x41,0x36,0x08,0x00,
    /* 126 '~' */ 0x0A,0x04,0x0A,0x00,0x00,
};

/* ======================================================================== */
/*  Per-instance state                                                        */
/* ======================================================================== */

struct CtlInfo
{
    char  name[ CTL_NAME_LEN ];
    int   val_min;
    int   val_max;
    int   val_cur;
};

struct UiInstance
{
    bool       used;
    int        width;
    int        height;
    uint32_t  *fb;        /* BGRA pixel buffer, width*height uint32_t       */

    char       mod_name[ 64 ];
    int        ctl_count;
    CtlInfo    ctls[ MAX_CTLS ];

    int        hover_row;      /* -1 = none, ≥0 = control index            */
    int        active_row;     /* row being dragged                         */
    bool       dragging;
    int        drag_x_start;   /* x pixel where drag began                  */
    int        drag_val_start; /* ctl value when drag began                 */

    int        clicked_ctl;    /* index of last clicked/dragged ctl (-1=none) */
    int        clicked_value;  /* value after the last interaction           */

    int        scroll_y;       /* pixel scroll offset (0 = top)             */
};

static UiInstance g_instances[ MAX_UI_INSTANCES ];

/* ======================================================================== */
/*  Drawing primitives                                                        */
/* ======================================================================== */

static inline void put_pixel( UiInstance *ui, int x, int y, uint32_t color )
{
    if ( x < 0 || y < 0 || x >= ui->width || y >= ui->height ) return;
    ui->fb[ y * ui->width + x ] = color;
}

static void fill_rect( UiInstance *ui, int x, int y, int w, int h, uint32_t color )
{
    int x0 = x < 0 ? 0 : x;
    int y0 = y < 0 ? 0 : y;
    int x1 = ( x + w ) > ui->width  ? ui->width  : ( x + w );
    int y1 = ( y + h ) > ui->height ? ui->height : ( y + h );
    for ( int ry = y0; ry < y1; ry++ )
    {
        uint32_t *row = ui->fb + ry * ui->width;
        for ( int rx = x0; rx < x1; rx++ )
            row[ rx ] = color;
    }
}

/*
 * draw_glyph — render one character from g_font at pixel (px, py).
 * Scale 1×1 (each font pixel = 1 screen pixel).
 */
static void draw_glyph( UiInstance *ui, int px, int py, char ch, uint32_t color )
{
    int idx = (unsigned char)ch;
    if ( idx < FONT_FIRST || idx > FONT_LAST ) return;
    const uint8_t *col_data = g_font + ( idx - FONT_FIRST ) * FONT_W;
    for ( int cx = 0; cx < FONT_W; cx++ )
    {
        uint8_t col_bits = col_data[ cx ];
        for ( int cy = 0; cy < FONT_H; cy++ )
        {
            if ( col_bits & ( 1 << cy ) )
                put_pixel( ui, px + cx, py + cy, color );
        }
    }
}

static int measure_string( const char *s )
{
    int len = 0;
    while ( *s++ ) len++;
    return len * ( FONT_W + 1 );
}

static void draw_string( UiInstance *ui, int px, int py, const char *s, uint32_t color )
{
    while ( *s )
    {
        draw_glyph( ui, px, py, *s++, color );
        px += FONT_W + 1;
    }
}

/*
 * draw_string_clipped — draw but clip to a maximum pixel width.
 */
static void draw_string_clipped( UiInstance *ui, int px, int py,
                                  const char *s, uint32_t color, int max_w )
{
    int x = px;
    while ( *s )
    {
        if ( ( x + FONT_W ) > ( px + max_w ) ) break;
        draw_glyph( ui, x, py, *s++, color );
        x += FONT_W + 1;
    }
}

/* ======================================================================== */
/*  Frame rendering                                                           */
/* ======================================================================== */

static void render_frame( UiInstance *ui )
{
    /* Clear background */
    fill_rect( ui, 0, 0, ui->width, ui->height, COL_BG );

    /* Header bar */
    fill_rect( ui, 0, 0, ui->width, HEADER_H, COL_HEADER_BG );

    /* Module name — centered vertically in header */
    int name_y = ( HEADER_H - FONT_H ) / 2;
    draw_string_clipped( ui, 6, name_y, ui->mod_name, COL_HEADER_TXT,
                         ui->width - 12 );

    /* Separator line below header */
    fill_rect( ui, 0, HEADER_H - 1, ui->width, 1, COL_SEPARATOR );

    if ( ui->ctl_count == 0 )
    {
        /* No module bound — draw placeholder text */
        draw_string( ui, 6, HEADER_H + 8, "No module selected", COL_LABEL );
        return;
    }

    /* Available height for control rows (with optional scroll) */
    int view_y = HEADER_H;
    int view_h = ui->height - HEADER_H;

    /* Bar area: from LABEL_W+BAR_MARGIN to width-4 */
    int bar_x     = LABEL_W + BAR_MARGIN;
    int bar_w_max = ui->width - bar_x - 4;

    for ( int i = 0; i < ui->ctl_count; i++ )
    {
        int row_y = view_y + i * ROW_H - ui->scroll_y;

        /* Clip rows that are off-screen */
        if ( row_y + ROW_H <= view_y ) continue;
        if ( row_y         >= ui->height ) break;

        /* Row background */
        uint32_t row_bg;
        if ( i == ui->active_row )
            row_bg = COL_ROW_ACTIVE;
        else if ( i == ui->hover_row )
            row_bg = COL_ROW_HOVER;
        else
            row_bg = ( i & 1 ) ? COL_ROW_ODD : COL_ROW_EVEN;

        fill_rect( ui, 0, row_y, ui->width, ROW_H, row_bg );

        /* Separator at bottom of row */
        fill_rect( ui, 0, row_y + ROW_H - 1, ui->width, 1, COL_SEPARATOR );

        /* Label — vertically centred in row */
        int label_y = row_y + ( ROW_H - FONT_H ) / 2;
        draw_string_clipped( ui, 4, label_y, ui->ctls[ i ].name,
                             COL_LABEL, LABEL_W - 6 );

        /* Value bar track */
        int bar_y    = row_y + ( ROW_H - BAR_H ) / 2;
        fill_rect( ui, bar_x, bar_y, bar_w_max, BAR_H, COL_BAR_TRACK );

        /* Filled portion proportional to (val - min) / (max - min) */
        int v_min = ui->ctls[ i ].val_min;
        int v_max = ui->ctls[ i ].val_max;
        int v_cur = ui->ctls[ i ].val_cur;
        if ( v_cur < v_min ) v_cur = v_min;
        if ( v_cur > v_max ) v_cur = v_max;

        int range  = v_max - v_min;
        int fill_w = ( range > 0 )
                     ? ( ( v_cur - v_min ) * bar_w_max / range )
                     : 0;
        if ( fill_w > bar_w_max ) fill_w = bar_w_max;

        uint32_t bar_fill_color = ( i == ui->active_row ) ? COL_BAR_ACTIVE : COL_BAR_FILL;
        if ( fill_w > 0 )
            fill_rect( ui, bar_x, bar_y, fill_w, BAR_H, bar_fill_color );

        /* Numeric value right-justified after the bar */
        char vbuf[ 16 ];
        snprintf( vbuf, sizeof( vbuf ), "%d", v_cur );
        int vw = measure_string( vbuf );
        int vtx = ui->width - vw - 4;
        if ( vtx > bar_x + bar_w_max + 2 )
            draw_string( ui, vtx, label_y, vbuf, COL_VALUE_TXT );
    }
}

/* ======================================================================== */
/*  Mouse hit-testing                                                         */
/* ======================================================================== */

static int row_from_y( UiInstance *ui, int y )
{
    int view_y = HEADER_H;
    if ( y < view_y ) return -1;
    int local_y = y - view_y + ui->scroll_y;
    int row = local_y / ROW_H;
    if ( row < 0 || row >= ui->ctl_count ) return -1;
    return row;
}

/* Given mouse x in bar area, return controller value */
static int bar_x_to_value( UiInstance *ui, int row, int mx )
{
    int bar_x     = LABEL_W + BAR_MARGIN;
    int bar_w_max = ui->width - bar_x - 4;

    int dx = mx - bar_x;
    if ( dx < 0 ) dx = 0;
    if ( dx > bar_w_max ) dx = bar_w_max;

    int v_min  = ui->ctls[ row ].val_min;
    int v_max  = ui->ctls[ row ].val_max;
    int range  = v_max - v_min;
    if ( range <= 0 ) return v_min;

    int val = v_min + ( dx * range / bar_w_max );
    if ( val < v_min ) val = v_min;
    if ( val > v_max ) val = v_max;
    return val;
}

/* ======================================================================== */
/*  Exported API                                                              */
/* ======================================================================== */

extern "C"
{

/*
 * sunvox_ui_create
 * Allocate a new UI instance with the given pixel dimensions.
 * Returns a handle (0..MAX_UI_INSTANCES-1) or -1 on failure.
 */
EMSCRIPTEN_KEEPALIVE
int sunvox_ui_create( int width, int height )
{
    if ( width <= 0 || height <= 0 ) return -1;

    for ( int i = 0; i < MAX_UI_INSTANCES; i++ )
    {
        if ( !g_instances[ i ].used )
        {
            UiInstance *ui = &g_instances[ i ];
            memset( ui, 0, sizeof( UiInstance ) );
            ui->width  = width;
            ui->height = height;
            ui->fb     = (uint32_t *)malloc( (size_t)width * (size_t)height * 4 );
            if ( !ui->fb ) return -1;
            memset( ui->fb, 0x1A, (size_t)width * (size_t)height * 4 );
            ui->used        = true;
            ui->hover_row   = -1;
            ui->active_row  = -1;
            ui->clicked_ctl = -1;
            ui->dragging    = false;
            strncpy( ui->mod_name, "SunVox", sizeof( ui->mod_name ) - 1 );
            render_frame( ui );
            return i;
        }
    }
    return -1;
}

/*
 * sunvox_ui_destroy
 * Free the UI instance.
 */
EMSCRIPTEN_KEEPALIVE
void sunvox_ui_destroy( int handle )
{
    if ( handle < 0 || handle >= MAX_UI_INSTANCES ) return;
    UiInstance *ui = &g_instances[ handle ];
    if ( !ui->used ) return;
    if ( ui->fb ) { free( ui->fb ); ui->fb = nullptr; }
    ui->used = false;
}

/*
 * sunvox_ui_set_module
 * Bind a module snapshot to this UI instance.
 *
 * mod_name      — null-terminated module name string
 * ctls_count    — number of controllers (capped at MAX_CTLS)
 * ctl_names     — pointer to ctls_count * CTL_NAME_LEN bytes (flat packed
 *                 null-terminated strings, each CTL_NAME_LEN bytes wide)
 * ctl_mins      — pointer to ctls_count ints
 * ctl_maxs      — pointer to ctls_count ints
 * ctl_vals      — pointer to ctls_count ints
 */
EMSCRIPTEN_KEEPALIVE
void sunvox_ui_set_module( int handle,
                            const char *mod_name,
                            int ctls_count,
                            const char *ctl_names,
                            const int  *ctl_mins,
                            const int  *ctl_maxs,
                            const int  *ctl_vals )
{
    if ( handle < 0 || handle >= MAX_UI_INSTANCES ) return;
    UiInstance *ui = &g_instances[ handle ];
    if ( !ui->used ) return;

    strncpy( ui->mod_name, mod_name ? mod_name : "Unknown",
             sizeof( ui->mod_name ) - 1 );
    ui->mod_name[ sizeof( ui->mod_name ) - 1 ] = '\0';

    if ( ctls_count < 0 ) ctls_count = 0;
    ui->ctl_count = ctls_count > MAX_CTLS ? MAX_CTLS : ctls_count;

    for ( int i = 0; i < ui->ctl_count; i++ )
    {
        CtlInfo *c = &ui->ctls[ i ];
        if ( ctl_names )
            strncpy( c->name, ctl_names + i * CTL_NAME_LEN, CTL_NAME_LEN - 1 );
        c->name[ CTL_NAME_LEN - 1 ] = '\0';
        c->val_min = ctl_mins  ? ctl_mins[ i ]  : 0;
        c->val_max = ctl_maxs  ? ctl_maxs[ i ]  : 256;
        c->val_cur = ctl_vals  ? ctl_vals[ i ]  : c->val_min;
    }

    ui->hover_row   = -1;
    ui->active_row  = -1;
    ui->clicked_ctl = -1;
    ui->scroll_y    = 0;
    render_frame( ui );
}

/*
 * sunvox_ui_update_values
 * Update only the current values (called each frame from JS after polling
 * the audio engine).  ctl_vals must have at least ctl_count ints.
 */
EMSCRIPTEN_KEEPALIVE
void sunvox_ui_update_values( int handle, const int *ctl_vals )
{
    if ( handle < 0 || handle >= MAX_UI_INSTANCES ) return;
    UiInstance *ui = &g_instances[ handle ];
    if ( !ui->used || !ctl_vals ) return;

    for ( int i = 0; i < ui->ctl_count; i++ )
        ui->ctls[ i ].val_cur = ctl_vals[ i ];
}

/*
 * sunvox_ui_mouse_event
 * type: 0 = move, 1 = button down, 2 = button up, 3 = scroll
 * btn:  MOUSE_BUTTON_LEFT=1, MOUSE_BUTTON_RIGHT=4, SCROLL_UP=8, SCROLL_DOWN=16
 */
EMSCRIPTEN_KEEPALIVE
void sunvox_ui_mouse_event( int handle, int type, int x, int y, int btn )
{
    if ( handle < 0 || handle >= MAX_UI_INSTANCES ) return;
    UiInstance *ui = &g_instances[ handle ];
    if ( !ui->used ) return;

    const int SCROLL_UP_BTN   = 8;
    const int SCROLL_DOWN_BTN = 16;

    switch ( type )
    {
        case 3: /* scroll */
        {
            int scroll_delta = ROW_H * 3;
            if ( btn & SCROLL_UP_BTN )   ui->scroll_y -= scroll_delta;
            if ( btn & SCROLL_DOWN_BTN ) ui->scroll_y += scroll_delta;
            int max_scroll = ( ui->ctl_count * ROW_H ) - ( ui->height - HEADER_H );
            if ( ui->scroll_y < 0 )          ui->scroll_y = 0;
            if ( ui->scroll_y > max_scroll )  ui->scroll_y = max_scroll > 0 ? max_scroll : 0;
            break;
        }

        case 0: /* mouse move */
        {
            ui->hover_row = row_from_y( ui, y );

            if ( ui->dragging && ui->active_row >= 0 )
            {
                int dx  = x - ui->drag_x_start;
                int bar_x     = LABEL_W + BAR_MARGIN;
                int bar_w_max = ui->width - bar_x - 4;
                int range = ui->ctls[ ui->active_row ].val_max -
                            ui->ctls[ ui->active_row ].val_min;
                if ( range > 0 && bar_w_max > 0 )
                {
                    if ( dx < -bar_w_max ) dx = -bar_w_max;
                    if ( dx >  bar_w_max ) dx =  bar_w_max;
                    int delta_val = ( dx * range ) / bar_w_max;
                    int new_val   = ui->drag_val_start + delta_val;
                    int v_min = ui->ctls[ ui->active_row ].val_min;
                    int v_max = ui->ctls[ ui->active_row ].val_max;
                    if ( new_val < v_min ) new_val = v_min;
                    if ( new_val > v_max ) new_val = v_max;
                    ui->ctls[ ui->active_row ].val_cur = new_val;
                    ui->clicked_ctl   = ui->active_row;
                    ui->clicked_value = new_val;
                }
            }
            break;
        }

        case 1: /* button down */
        {
            int row = row_from_y( ui, y );
            if ( row >= 0 && ( btn & 1 ) /* left button */ )
            {
                ui->active_row     = row;
                ui->dragging       = true;
                ui->drag_x_start   = x;
                ui->drag_val_start = ui->ctls[ row ].val_cur;

                /* Also set value from click position immediately */
                int new_val = bar_x_to_value( ui, row, x );
                ui->ctls[ row ].val_cur = new_val;
                ui->clicked_ctl   = row;
                ui->clicked_value = new_val;
                ui->drag_val_start = new_val;
            }
            break;
        }

        case 2: /* button up */
        {
            ui->dragging    = false;
            ui->active_row  = -1;
            break;
        }
    }
}

/*
 * sunvox_ui_key_event
 * key: ASCII / KEY_xxx values.  mod: EVT_FLAG_SHIFT | EVT_FLAG_CTRL | etc.
 * Currently unused — placeholder for future keyboard editing.
 */
EMSCRIPTEN_KEEPALIVE
void sunvox_ui_key_event( int handle, int key, int mod )
{
    (void)handle; (void)key; (void)mod;
}

/*
 * sunvox_ui_tick
 * Advance UI state one frame and re-render the framebuffer.
 * Call once per rAF frame.
 */
EMSCRIPTEN_KEEPALIVE
void sunvox_ui_tick( int handle )
{
    if ( handle < 0 || handle >= MAX_UI_INSTANCES ) return;
    UiInstance *ui = &g_instances[ handle ];
    if ( !ui->used ) return;
    render_frame( ui );
}

/*
 * sunvox_ui_get_framebuffer
 * Returns a pointer to the BGRA pixel buffer (width*height*4 bytes).
 * Valid until sunvox_ui_destroy() is called.
 */
EMSCRIPTEN_KEEPALIVE
void *sunvox_ui_get_framebuffer( int handle )
{
    if ( handle < 0 || handle >= MAX_UI_INSTANCES ) return nullptr;
    UiInstance *ui = &g_instances[ handle ];
    if ( !ui->used ) return nullptr;
    return (void *)ui->fb;
}

/*
 * sunvox_ui_get_clicked_ctl
 * Returns the index of the last control interacted with, or -1 if none.
 * Reset by calling sunvox_ui_set_module().
 */
EMSCRIPTEN_KEEPALIVE
int sunvox_ui_get_clicked_ctl( int handle )
{
    if ( handle < 0 || handle >= MAX_UI_INSTANCES ) return -1;
    UiInstance *ui = &g_instances[ handle ];
    if ( !ui->used ) return -1;
    return ui->clicked_ctl;
}

/*
 * sunvox_ui_get_clicked_value
 * Returns the value corresponding to the last interaction.
 */
EMSCRIPTEN_KEEPALIVE
int sunvox_ui_get_clicked_value( int handle )
{
    if ( handle < 0 || handle >= MAX_UI_INSTANCES ) return 0;
    UiInstance *ui = &g_instances[ handle ];
    if ( !ui->used ) return 0;
    return ui->clicked_value;
}

/*
 * sunvox_ui_get_width / sunvox_ui_get_height
 * Convenience accessors for the JS caller.
 */
EMSCRIPTEN_KEEPALIVE
int sunvox_ui_get_width( int handle )
{
    if ( handle < 0 || handle >= MAX_UI_INSTANCES ) return 0;
    return g_instances[ handle ].used ? g_instances[ handle ].width : 0;
}

EMSCRIPTEN_KEEPALIVE
int sunvox_ui_get_height( int handle )
{
    if ( handle < 0 || handle >= MAX_UI_INSTANCES ) return 0;
    return g_instances[ handle ].used ? g_instances[ handle ].height : 0;
}

} /* extern "C" */
