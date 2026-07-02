// cinter4_wrapper.c — Cinter4 host shim
//
// Cinter4 calling convention (global register variables in cinter4.c):
//   CinterInit:   a2=music_data  a4=instrument_space  a6=working_memory
//   CinterPlay1:  a6=working_memory   (called once per 50Hz tick)
//   CinterPlay2:  a6=working_memory   (called immediately after CinterPlay1)
//
// Working memory layout (from cinter4.c EQU constants):
//   c_SampleState  [0]       12 bytes  (mpitch/mod/bpitch as longs)
//   c_PeriodTable  [12]      74 bytes  (37 words; first word also used as
//                                       temp ampdelta storage during synthesis)
//   c_TrackSize    [86]       2 bytes
//   c_InstPointer  [88]       4 bytes
//   c_MusicPointer [92]       4 bytes
//   c_MusicEnd     [96]       4 bytes
//   c_MusicLoop    [100]      4 bytes
//   c_MusicState   [104]     48 bytes  (4*3 longs: 4 tracks × 3 longs each)
//   c_dma          [152]      2 bytes
//   c_waitline     [154]      2 bytes
//   c_Instruments  [156]     256 bytes (32 instruments × 2 longs: length/replength + pointer)
//   c_Sinus        [412]  32768 bytes  (CINTER_DEGREES=16384 words sine table)
//   TOTAL                 33180 bytes
//
// Instrument space:
//   Raw samples (from .raw file, if any) → placed at start of instrument_space
//   by the HOST before calling CinterInit.
//   Generated samples → synthesized by CinterMakeInstruments into instrument_space.
//   Allow at least 2 MB for a typical song.

#include "cinter4.h"
#include "paula_soft.h"
#include <stdint.h>
#include <string.h>
#include <stdlib.h>

// Register file shared with cinter4.c (defined there as static globals)
extern uint32_t a2, a4, a6;

#define CINTER_WORK_SIZE  (412 + 16384*2)   /* 33180 bytes */
#define CINTER_INST_SIZE  (2 * 1024 * 1024) /* 2 MB instrument space */

static uint8_t  s_work[CINTER_WORK_SIZE];
static uint8_t  s_inst[CINTER_INST_SIZE];

static uint8_t* s_music_data     = NULL;
static int      s_loaded         = 0;
static int      s_finished       = 0;
static float    s_tick_accum     = 0.0f;
static float    s_samples_per_tick = 0.0f;

void player_init(int sample_rate) {
    (void)sample_rate;
    s_samples_per_tick = (float)PAULA_RATE_PAL / 50.0f;  /* 50 Hz PAL */

    paula_reset();
    s_loaded   = 0;
    s_finished = 0;
    s_tick_accum = 0.0f;
    if (s_music_data) { free(s_music_data); s_music_data = NULL; }
}

// load() expects the .cinter4 binary.
// If the song has raw (pre-recorded) instruments, they must be prepended to the
// buffer BEFORE this call, OR placed into s_inst[] separately with player_load_raw().
int player_load(const uint8_t* data, int len) {
    if (!data || len <= 0) return 0;

    s_music_data = (uint8_t*)malloc(len);
    if (!s_music_data) return 0;
    memcpy(s_music_data, data, len);

    memset(s_work, 0, sizeof(s_work));
    /* NOTE: if the song has raw instruments, caller must populate s_inst[] first */

    // Set up global register file
    a2 = (uint32_t)(uintptr_t)s_music_data;  /* music data */
    a4 = (uint32_t)(uintptr_t)s_inst;        /* instrument space */
    a6 = (uint32_t)(uintptr_t)s_work;        /* working memory */

    CinterInit();

    s_loaded   = 1;
    s_finished = 0;
    s_tick_accum = 0.0f;
    return 1;
}

// Optional: load raw sample data into the start of instrument space before player_load().
// raw_offset = byte offset within instrument space where these samples should land.
void player_load_raw(const uint8_t* raw_data, int raw_len, int raw_offset) {
    if (!raw_data || raw_len <= 0) return;
    int end = raw_offset + raw_len;
    if (end > CINTER_INST_SIZE) end = CINTER_INST_SIZE;
    memcpy(s_inst + raw_offset, raw_data, end - raw_offset);
}

int player_render(float* buffer, int frames) {
    if (!s_loaded) { memset(buffer, 0, frames * 2 * sizeof(float)); return -1; }
    if (s_finished) { memset(buffer, 0, frames * 2 * sizeof(float)); return 0; }

    int written = 0;
    while (written < frames) {
        int chunk = (frames - written) < 64 ? (frames - written) : 64;
        paula_render(buffer + written * 2, chunk);
        written += chunk;
        s_tick_accum += (float)chunk;
        while (s_tick_accum >= s_samples_per_tick) {
            s_tick_accum -= s_samples_per_tick;
            a6 = (uint32_t)(uintptr_t)s_work;
            CinterPlay1();
            a6 = (uint32_t)(uintptr_t)s_work;
            CinterPlay2();
        }
    }
    return frames;
}

void player_stop(void) {
    paula_reset();
    s_loaded   = 0;
    s_finished = 1;
}

int  player_is_finished(void)        { return s_finished ? 1 : 0; }
int  player_get_subsong_count(void)  { return 1; }
void player_set_subsong(int n)       { (void)n; }
const char* player_get_title(void)   { return "cinter4"; }
double player_detect_duration(void)  { return 0.0; }
