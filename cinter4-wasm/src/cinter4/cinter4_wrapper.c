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
#include <stdio.h>

// Register file shared with cinter4.c (defined there as static globals)
extern uint32_t a2, a4, a6;

#define CINTER_WORK_SIZE  (412 + 16384*2)   /* 33180 bytes */
#define CINTER_INST_SIZE  (2 * 1024 * 1024) /* 2 MB instrument space */

static uint8_t  s_work[CINTER_WORK_SIZE];
static uint8_t  s_inst[CINTER_INST_SIZE];
/* Pristine tick-0 working memory captured right after CinterInit (music pointers +
   tables, before any tick is played). player_seek restores this and replays ticks,
   so seeking never re-synthesizes instruments (which live in s_inst, untouched). */
static uint8_t  s_work_snapshot[CINTER_WORK_SIZE];
static int      s_have_snapshot  = 0;

static uint8_t* s_music_data     = NULL;
static int      s_loaded         = 0;
static int      s_finished       = 0;
static float    s_tick_accum     = 0.0f;
static float    s_samples_per_tick = 0.0f;
static int      s_sample_rate    = PAULA_RATE_PAL;

void player_set_sample_rate(int sample_rate) {
    if (sample_rate <= 0) return;
    s_sample_rate = sample_rate;
    s_samples_per_tick = (float)sample_rate / 50.0f;
    paula_set_output_rate((float)sample_rate);
}

void player_init(int sample_rate) {
    if (sample_rate > 0) {
        s_sample_rate = sample_rate;
    }
    s_samples_per_tick = (float)s_sample_rate / 50.0f;  /* 50 Hz PAL tick */
    paula_set_output_rate((float)s_sample_rate);

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

    /* Capture the pristine tick-0 state (post-init, pre-play) for player_seek. */
    memcpy(s_work_snapshot, s_work, sizeof(s_work));
    s_have_snapshot = 1;

    /* Prime the first tick — program Paula registers so the very first
       paula_render() call produces audio instead of silence. */
    a6 = (uint32_t)(uintptr_t)s_work;
    CinterPlay1();
    a6 = (uint32_t)(uintptr_t)s_work;
    CinterPlay2();

    s_loaded     = 1;
    s_finished   = 0;
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

/* Seek to a 50 Hz tick: restore the pristine tick-0 state and replay the sequencer
   up to `tick` so the note/period/volume state is correct at that point (no re-synth).
   Used for Play Pattern / mid-song start — the Cinter player is otherwise linear. */
int player_seek(int tick) {
    if (!s_have_snapshot || !s_music_data || tick < 0) return 0;
    memcpy(s_work, s_work_snapshot, sizeof(s_work));
    paula_reset();
    s_tick_accum = 0.0f;
    s_finished   = 0;
    s_loaded     = 1;
    /* Replay ticks 0..tick so accumulated sequencer state (MusicPointer, per-track
       period/volume, Paula register setup) matches normal playback at `tick`. */
    for (int t = 0; t <= tick; t++) {
        a6 = (uint32_t)(uintptr_t)s_work; CinterPlay1();
        a6 = (uint32_t)(uintptr_t)s_work; CinterPlay2();
    }
    return 1;
}

int  player_is_finished(void)        { return s_finished ? 1 : 0; }
int  player_get_subsong_count(void)  { return 1; }
void player_set_subsong(int n)       { (void)n; }
const char* player_get_title(void)   { return "cinter4"; }
double player_detect_duration(void)  { return 0.0; }

static char s_debug_buf[512];

/* byte-swap a 16-bit value (cinter4.c stores words big-endian via WRITE16) */
static uint16_t bswap16(uint16_t v) { return (uint16_t)((v >> 8) | (v << 8)); }

const char* player_get_debug(void) {
    /* Sine table lives at c_Sinus=412 (16384 words, big-endian). Peak should be
       near index CINTER_DEGREES/4 = 4096. If these are all 0, synthesis is dead. */
    int16_t* sinus = (int16_t*)(s_work + 412);
    int16_t s_peak  = (int16_t)bswap16((uint16_t)sinus[4096]);
    int16_t s_mid   = (int16_t)bswap16((uint16_t)sinus[2048]);
    int16_t s_q3    = (int16_t)bswap16((uint16_t)sinus[6144]);

    /* Scan s_inst for the first non-zero byte: proves whether synthesized PCM exists */
    int first_nz = -1; int8_t first_nz_val = 0;
    int peak_abs = 0;
    for (int i = 0; i < CINTER_INST_SIZE; i++) {
        int8_t v = (int8_t)s_inst[i];
        if (v != 0) {
            if (first_nz < 0) { first_nz = i; first_nz_val = v; }
            int a = v < 0 ? -v : v;
            if (a > peak_abs) peak_abs = a;
        }
    }

    uint16_t  dma   = *(uint16_t*)(s_work + 152); /* c_dma (native read of BE store) */
    uint16_t  wl    = *(uint16_t*)(s_work + 154); /* c_waitline */

    snprintf(s_debug_buf, sizeof(s_debug_buf),
        "sinus[2048,4096,6144]=%d,%d,%d | s_inst first_nz@%d=%d peak_abs=%d | "
        "dma(BE)=0x%04x wl=0x%04x",
        s_mid, s_peak, s_q3,
        first_nz, first_nz_val, peak_abs,
        bswap16(dma), wl);
    return s_debug_buf;
}

/* Debug accessors: base addresses so a host harness can read the instrument
   table (c_Instruments at work+156: 32 × [length:replen long, pointer long])
   and the synthesized PCM in instrument space. */
uintptr_t player_work_addr(void) { return (uintptr_t)s_work; }
uintptr_t player_inst_addr(void) { return (uintptr_t)s_inst; }
uintptr_t player_music_addr(void) { return (uintptr_t)s_music_data; }
