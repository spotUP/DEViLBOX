/*
    SunVoxWrapper.cpp
    WASM bridge between JavaScript and the SunVox engine.
    Copyright (C) 2025 DEViLBOX contributors.

    Implementation notes
    --------------------
    * g_snd / sound_stream_stop / sound_stream_play are defined here because
      sound_sndout.cpp is intentionally excluded from the CMake sources — we
      pull audio from JS, not from the platform audio device.

    * sunvox_engine_init reads g_snd.freq to pass to psynth_init. We set
      g_snd.freq before calling init.

    * sunvox_load_synth has a known scoping issue in the original source: the
      local variable `retval` inside the 'SEND' block shadows the outer one, so
      the function always returns -1. We work around this by recording
      net->items_num before and after the call to find the newly added module.

    * Modules are stored in pnet->items[]. Index 0 is always the OUTPUT node.
      Valid user modules start at index 1.

    * sunvox_note.synth is 1-indexed: pass module_id + 1.
*/

#ifndef __EMSCRIPTEN__
#define __EMSCRIPTEN__
#endif

#include <emscripten.h>
#include <cstring>
#include <cstdlib>
#include <cstdio>

/* ---- SunDog / SunVox headers ------------------------------------------ */
#include "sound/sound.h"
#include "sunvox_engine/sunvox_engine.h"

/* ======================================================================== */
/* Stub sound system                                                         */
/* ======================================================================== */

/* g_snd is normally defined in sundog_engine/sound/code/sound_sndout.cpp,
   which we do not compile. Provide it here instead. */
sound_struct g_snd;

/* Called by sunvox_engine.cpp around load/save to pause the audio device. */
void sound_stream_stop( void ) { /* no-op in WASM: JS controls audio */ }
void sound_stream_play( void ) { /* no-op in WASM: JS controls audio */ }

/* ======================================================================== */
/* Engine pool                                                               */
/* ======================================================================== */

#define MAX_ENGINES 8

static sunvox_engine g_engines[ MAX_ENGINES ];
static bool          g_engine_used[ MAX_ENGINES ];
static int           g_engine_sample_rate[ MAX_ENGINES ];

/* A temporary interleaved render buffer shared by all engines.
   Allocated once per render call — avoids per-call malloc overhead.
   Max supported block size: 4096 stereo frames = 8192 floats. */
#define MAX_RENDER_FRAMES 4096
static float g_render_buf[ MAX_RENDER_FRAMES * 2 ];

/* ======================================================================== */
/* Helpers                                                                   */
/* ======================================================================== */

static inline bool handle_valid( int h )
{
    return ( h >= 0 && h < MAX_ENGINES && g_engine_used[ h ] );
}

/* Count live items in pnet (items with PSYNTH_FLAG_EXISTS set). */
static int count_live_modules( psynth_net *net )
{
    if ( !net ) return 0;
    int count = 0;
    for ( int i = 0; i < net->items_num; i++ )
    {
        if ( net->items[ i ].flags & PSYNTH_FLAG_EXISTS )
            count++;
    }
    return count;
}

/* ======================================================================== */
/* Exported C API                                                            */
/* ======================================================================== */

extern "C"
{

/*
 * sunvox_wasm_create
 * Initialize a SunVox engine instance and return an opaque handle.
 * Returns -1 on failure (no free slot).
 */
EMSCRIPTEN_KEEPALIVE
int sunvox_wasm_create( int sample_rate )
{
    /* Find a free slot */
    int h = -1;
    for ( int i = 0; i < MAX_ENGINES; i++ )
    {
        if ( !g_engine_used[ i ] )
        {
            h = i;
            break;
        }
    }
    if ( h < 0 )
        return -1;  /* no free slot */

    /* sunvox_engine_init reads g_snd.freq — set it before calling. */
    g_snd.freq     = sample_rate;
    g_snd.channels = 2;
    g_snd.mode     = SOUND_MODE_FLOAT32;

    memset( &g_engines[ h ], 0, sizeof( sunvox_engine ) );
    sunvox_engine_init( 0, &g_engines[ h ] );

    g_engine_used[ h ]        = true;
    g_engine_sample_rate[ h ] = sample_rate;
    return h;
}

/*
 * sunvox_wasm_destroy
 * Shut down the engine and free the slot.
 */
EMSCRIPTEN_KEEPALIVE
void sunvox_wasm_destroy( int handle )
{
    if ( !handle_valid( handle ) )
        return;

    sunvox_engine_close( &g_engines[ handle ] );
    g_engine_used[ handle ] = false;
}

/*
 * sunvox_wasm_load_song
 * Load a .sunvox file from the given path (Emscripten MEMFS path).
 */
EMSCRIPTEN_KEEPALIVE
void sunvox_wasm_load_song( int handle, const char *path )
{
    if ( !handle_valid( handle ) || !path )
        return;

    sunvox_load_song( (const UTF8_CHAR *)path, &g_engines[ handle ] );
}

/*
 * sunvox_wasm_save_song
 * Save the current song to a MEMFS path.
 */
EMSCRIPTEN_KEEPALIVE
void sunvox_wasm_save_song( int handle, const char *path )
{
    if ( !handle_valid( handle ) || !path )
        return;

    sunvox_save_song( (const UTF8_CHAR *)path, &g_engines[ handle ] );
}

/*
 * sunvox_wasm_load_synth
 * Load a single synth module from file and return its module index (0-based).
 * Returns -1 on failure.
 *
 * NOTE: The original sunvox_load_synth() has a scoping bug where the
 * inner 'retval' variable shadows the outer one, causing the function to
 * always return -1. We detect the new module by comparing items_num before
 * and after the call, then scanning for the highest-indexed live item.
 */
EMSCRIPTEN_KEEPALIVE
int sunvox_wasm_load_synth( int handle, const char *path )
{
    if ( !handle_valid( handle ) || !path )
        return -1;

    sunvox_engine *sv  = &g_engines[ handle ];
    psynth_net    *net = sv->net;

    int items_before = net ? net->items_num : 0;

    /* Position 0,0 — layout position does not matter in WASM headless mode. */
    sunvox_load_synth( 0, 0, (const UTF8_CHAR *)path, sv );

    if ( !net )
        return -1;

    /* Find the newly added module: scan backwards from the highest index. */
    for ( int i = net->items_num - 1; i >= items_before; i-- )
    {
        if ( net->items[ i ].flags & PSYNTH_FLAG_EXISTS )
            return i;
    }

    /* Fallback: scan all items for a new EXISTS entry above the old range. */
    for ( int i = items_before; i < net->items_num; i++ )
    {
        if ( net->items[ i ].flags & PSYNTH_FLAG_EXISTS )
            return i;
    }

    return -1;
}

/*
 * sunvox_wasm_save_synth
 * Save a single module to a MEMFS file.
 */
EMSCRIPTEN_KEEPALIVE
void sunvox_wasm_save_synth( int handle, int module_id, const char *path )
{
    if ( !handle_valid( handle ) || !path )
        return;

    sunvox_save_synth( module_id, (const UTF8_CHAR *)path, &g_engines[ handle ] );
}

/*
 * sunvox_wasm_get_module_count
 * Return the number of live modules (items with PSYNTH_FLAG_EXISTS).
 */
EMSCRIPTEN_KEEPALIVE
int sunvox_wasm_get_module_count( int handle )
{
    if ( !handle_valid( handle ) )
        return 0;

    return count_live_modules( g_engines[ handle ].net );
}

/*
 * sunvox_wasm_get_module_name
 * Copy the module's name into 'out' (null-terminated, up to out_len-1 chars).
 */
EMSCRIPTEN_KEEPALIVE
void sunvox_wasm_get_module_name( int handle, int module_id, char *out, int out_len )
{
    if ( !handle_valid( handle ) || !out || out_len <= 0 )
        return;

    out[ 0 ] = '\0';
    psynth_net *net = g_engines[ handle ].net;
    if ( !net )
        return;

    if ( module_id < 0 || module_id >= net->items_num )
        return;

    if ( !( net->items[ module_id ].flags & PSYNTH_FLAG_EXISTS ) )
        return;

    strncpy( out, net->items[ module_id ].item_name, (size_t)( out_len - 1 ) );
    out[ out_len - 1 ] = '\0';
}

/*
 * sunvox_wasm_get_control_count
 * Return the number of controllers for the given module.
 */
EMSCRIPTEN_KEEPALIVE
int sunvox_wasm_get_control_count( int handle, int module_id )
{
    if ( !handle_valid( handle ) )
        return 0;

    psynth_net *net = g_engines[ handle ].net;
    if ( !net )
        return 0;

    if ( module_id < 0 || module_id >= net->items_num )
        return 0;

    if ( !( net->items[ module_id ].flags & PSYNTH_FLAG_EXISTS ) )
        return 0;

    return net->items[ module_id ].ctls_num;
}

/*
 * sunvox_wasm_get_control_name
 * Copy the controller name into 'out'.
 */
EMSCRIPTEN_KEEPALIVE
void sunvox_wasm_get_control_name( int handle, int module_id, int ctl_id, char *out, int out_len )
{
    if ( !handle_valid( handle ) || !out || out_len <= 0 )
        return;

    out[ 0 ] = '\0';
    psynth_net *net = g_engines[ handle ].net;
    if ( !net )
        return;

    if ( module_id < 0 || module_id >= net->items_num )
        return;

    psynth_net_item *item = &net->items[ module_id ];
    if ( !( item->flags & PSYNTH_FLAG_EXISTS ) )
        return;

    if ( ctl_id < 0 || ctl_id >= item->ctls_num )
        return;

    const UTF8_CHAR *name = item->ctls[ ctl_id ].ctl_name;
    if ( !name )
        return;

    strncpy( out, (const char *)name, (size_t)( out_len - 1 ) );
    out[ out_len - 1 ] = '\0';
}

/*
 * sunvox_wasm_get_control_min
 */
EMSCRIPTEN_KEEPALIVE
int sunvox_wasm_get_control_min( int handle, int module_id, int ctl_id )
{
    if ( !handle_valid( handle ) )
        return 0;

    psynth_net *net = g_engines[ handle ].net;
    if ( !net )
        return 0;

    if ( module_id < 0 || module_id >= net->items_num )
        return 0;

    psynth_net_item *item = &net->items[ module_id ];
    if ( !( item->flags & PSYNTH_FLAG_EXISTS ) )
        return 0;

    if ( ctl_id < 0 || ctl_id >= item->ctls_num )
        return 0;

    return (int)item->ctls[ ctl_id ].ctl_min;
}

/*
 * sunvox_wasm_get_control_max
 */
EMSCRIPTEN_KEEPALIVE
int sunvox_wasm_get_control_max( int handle, int module_id, int ctl_id )
{
    if ( !handle_valid( handle ) )
        return 0;

    psynth_net *net = g_engines[ handle ].net;
    if ( !net )
        return 0;

    if ( module_id < 0 || module_id >= net->items_num )
        return 0;

    psynth_net_item *item = &net->items[ module_id ];
    if ( !( item->flags & PSYNTH_FLAG_EXISTS ) )
        return 0;

    if ( ctl_id < 0 || ctl_id >= item->ctls_num )
        return 0;

    return (int)item->ctls[ ctl_id ].ctl_max;
}

/*
 * sunvox_wasm_get_control_value
 * Read the current value of a controller via the ctl_val pointer.
 */
EMSCRIPTEN_KEEPALIVE
int sunvox_wasm_get_control_value( int handle, int module_id, int ctl_id )
{
    if ( !handle_valid( handle ) )
        return 0;

    psynth_net *net = g_engines[ handle ].net;
    if ( !net )
        return 0;

    if ( module_id < 0 || module_id >= net->items_num )
        return 0;

    psynth_net_item *item = &net->items[ module_id ];
    if ( !( item->flags & PSYNTH_FLAG_EXISTS ) )
        return 0;

    if ( ctl_id < 0 || ctl_id >= item->ctls_num )
        return 0;

    CTYPE *val_ptr = item->ctls[ ctl_id ].ctl_val;
    if ( !val_ptr )
        return 0;

    return (int)( *val_ptr );
}

/*
 * sunvox_wasm_set_control
 * Set a controller value via sunvox_send_user_command.
 *
 * Format: n.ctl = (ctl_id + 1) << 8   (CCXX: CC=controller number, XX=std effect)
 *         n.synth = module_id + 1      (1-indexed)
 */
EMSCRIPTEN_KEEPALIVE
void sunvox_wasm_set_control( int handle, int module_id, int ctl_id, int value )
{
    if ( !handle_valid( handle ) )
        return;

    sunvox_note n;
    memset( &n, 0, sizeof( n ) );
    n.note    = 0;
    n.vel     = 0;
    n.synth   = (uchar)( module_id + 1 );
    n.ctl     = (uint16)( ( ctl_id + 1 ) << 8 );  /* CC = ctl_id+1, XX = 0 */
    n.ctl_val = (uint16)value;

    sunvox_send_user_command( &n, 0, &g_engines[ handle ] );
}

/*
 * sunvox_wasm_note_on
 * Send a note-on command to a module.
 * note: 1..120 (SunVox note numbering)
 * vel:  1..129 (0 = default velocity)
 */
EMSCRIPTEN_KEEPALIVE
void sunvox_wasm_note_on( int handle, int module_id, int note, int vel )
{
    if ( !handle_valid( handle ) )
        return;

    sunvox_note n;
    memset( &n, 0, sizeof( n ) );
    n.note  = (uchar)note;
    n.vel   = (uchar)( vel > 0 ? vel : 0x80 );  /* 0x80 = default vel */
    n.synth = (uchar)( module_id + 1 );
    n.ctl   = 0;
    n.ctl_val = 0;

    sunvox_send_user_command( &n, 0, &g_engines[ handle ] );
}

/*
 * sunvox_wasm_note_off
 * Send a note-off command (note = 128) to a module.
 */
EMSCRIPTEN_KEEPALIVE
void sunvox_wasm_note_off( int handle, int module_id )
{
    if ( !handle_valid( handle ) )
        return;

    sunvox_note n;
    memset( &n, 0, sizeof( n ) );
    n.note  = 128;   /* note-off */
    n.vel   = 0;
    n.synth = (uchar)( module_id + 1 );
    n.ctl   = 0;
    n.ctl_val = 0;

    sunvox_send_user_command( &n, 0, &g_engines[ handle ] );
}

/*
 * sunvox_wasm_render
 * Render 'frames' frames into separate float32 L/R buffers.
 * outL and outR must each point to at least 'frames' floats.
 *
 * Internally renders interleaved stereo float32 (buffer_type=1, channels=2),
 * then deinterleaves into outL/outR.
 */
EMSCRIPTEN_KEEPALIVE
void sunvox_wasm_render( int handle, float *outL, float *outR, int frames )
{
    if ( !handle_valid( handle ) || !outL || !outR || frames <= 0 )
        return;

    /* Clamp to our static buffer limit */
    if ( frames > MAX_RENDER_FRAMES )
        frames = MAX_RENDER_FRAMES;

    sunvox_engine *sv = &g_engines[ handle ];

    sunvox_render_piece_of_sound(
        1,               /* buffer_type = 1 (float32) */
        g_render_buf,    /* interleaved stereo output  */
        frames,
        2,               /* channels = 2 (stereo)      */
        g_engine_sample_rate[ handle ],
        0,               /* out_time = 0               */
        sv );

    /* Deinterleave LRLRLR... → separate L/R */
    const float *src = g_render_buf;
    for ( int i = 0; i < frames; i++ )
    {
        outL[ i ] = src[ i * 2 ];
        outR[ i ] = src[ i * 2 + 1 ];
    }
}

/*
 * sunvox_wasm_play
 * Start playback from the current position.
 */
EMSCRIPTEN_KEEPALIVE
void sunvox_wasm_play( int handle )
{
    if ( !handle_valid( handle ) )
        return;

    sunvox_play( &g_engines[ handle ] );
}

/*
 * sunvox_wasm_stop
 * Stop playback.
 */
EMSCRIPTEN_KEEPALIVE
void sunvox_wasm_stop( int handle )
{
    if ( !handle_valid( handle ) )
        return;

    sunvox_stop( &g_engines[ handle ] );
}

} /* extern "C" */
