// pumatracker_wrapper.c — Emscripten C-linkage wrapper for PumaTracker replay
//
// Bridges the transpiled 68k replayer (pumatracker.c) with paula_soft audio output.
// The transpiled code uses Mt_Data (a global variable) as the module base address.

#include "pumatracker.h"
#include "paula_soft.h"
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

// Defined in pumatracker.c — the module data base address
extern uint32_t g_Mt_Data;

static int   s_loaded         = 0;
static int   s_finished       = 0;
static float s_tick_accum     = 0.0f;
static float s_ticks_per_sec  = 50.0f;  // CIA 50 Hz PAL
static float s_samples_per_tick = 0.0f;
static uint8_t* s_module_buf  = NULL;

// Pattern editing support (forward declarations)
static uint8_t* s_pattern_buf = NULL;
static int      s_num_patterns = 0;
static void decompress_patterns(void);

void player_init(int sample_rate) {
    (void)sample_rate;
    s_ticks_per_sec    = 50.0f;
    s_samples_per_tick = (float)PAULA_RATE_PAL / s_ticks_per_sec;
    paula_reset();
    s_loaded   = 0;
    s_finished = 0;
    s_tick_accum = 0.0f;
}

int player_load(const uint8_t* data, int len) {
    if (!data || len <= 0) return 0;

    // Free previous module and pattern buffers
    if (s_module_buf) { free(s_module_buf); s_module_buf = NULL; }
    if (s_pattern_buf) { free(s_pattern_buf); s_pattern_buf = NULL; }
    s_num_patterns = 0;

    // Allocate and copy module data
    s_module_buf = (uint8_t*)malloc(len);
    if (!s_module_buf) return 0;
    memcpy(s_module_buf, data, len);

    // Set the module base address for the transpiled replayer
    g_Mt_Data = (uint32_t)(uintptr_t)s_module_buf;

    // Decompress pattern data for random access editing
    decompress_patterns();

    // Reset Paula and call the transpiled init
    paula_reset();
    Mt_init();

    s_loaded   = 1;
    s_finished = 0;
    s_tick_accum = 0.0f;
    return 1;
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
            Mt_Music();
        }
    }
    return frames;
}

void player_stop(void) {
    Mt_end();
    paula_reset();
    s_loaded   = 0;
    s_finished = 1;
    if (s_pattern_buf) { free(s_pattern_buf); s_pattern_buf = NULL; }
    s_num_patterns = 0;
}

void player_set_sample_rate(float rate) {
    paula_set_output_rate(rate);
    if (s_ticks_per_sec > 0.0f) {
        s_samples_per_tick = rate / s_ticks_per_sec;
    }
}

int player_is_finished(void) { return s_finished ? 1 : 0; }
int player_get_subsong_count(void) { return 1; }
void player_set_subsong(int n) { (void)n; }
const char* player_get_title(void) { return "PumaTracker"; }
double player_detect_duration(void) { return 0.0; }

void player_get_channel_levels(float* out4) {
    paula_get_channel_levels(out4);
}

void player_set_channel_gain(int ch, float gain) {
    paula_set_channel_gain(ch, gain);
}

// ── Pattern editing support ──────────────────────────────────────────────────
//
// PumaTracker pattern data in the module file uses RLE encoding:
//   {noteX2, instrEffect, param, runLen} groups per pattern (single-channel, 32 rows).
//
// We decompress all patterns into a flat buffer on load for random access.
// Each decompressed cell is 3 bytes: noteX2, instrEffect, param.
// Total buffer size: numPatterns * 32 * 3 bytes.
//
// Pattern pointers in the module are found by scanning for "patt" markers.

#define PUMA_NUM_ROWS     32
#define PUMA_CELL_SIZE    3   // noteX2, instrEffect, param
#define PUMA_ROW_SIZE     (PUMA_NUM_ROWS * PUMA_CELL_SIZE)
#define PUMA_HEADER_SIZE  80
#define PUMA_ORDER_SIZE   14

// Big-endian u16 read
static uint16_t read_u16be(const uint8_t* p) {
    return (uint16_t)((p[0] << 8) | p[1]);
}

// Decompress all patterns from the module buffer into s_pattern_buf.
// Called from player_load() after the module is copied.
static void decompress_patterns(void) {
    if (s_pattern_buf) { free(s_pattern_buf); s_pattern_buf = NULL; }
    s_num_patterns = 0;

    if (!s_module_buf) return;

    uint16_t lastOrder   = read_u16be(s_module_buf + 12);
    uint16_t numPatterns = read_u16be(s_module_buf + 14);
    if (numPatterns == 0 || numPatterns > 128) return;

    int numOrders = lastOrder + 1;

    // Allocate decompressed buffer: numPatterns * 32 rows * 3 bytes
    int buf_size = numPatterns * PUMA_ROW_SIZE;
    s_pattern_buf = (uint8_t*)calloc(1, buf_size);
    if (!s_pattern_buf) return;
    s_num_patterns = numPatterns;

    // Skip header + order list to reach pattern data
    int pos = PUMA_HEADER_SIZE + numOrders * PUMA_ORDER_SIZE;

    for (int p = 0; p < numPatterns; p++) {
        // Expect "patt" marker (0x70617474)
        if (s_module_buf[pos] != 'p' || s_module_buf[pos+1] != 'a' ||
            s_module_buf[pos+2] != 't' || s_module_buf[pos+3] != 't') {
            break;
        }
        pos += 4;

        uint8_t* dst = s_pattern_buf + p * PUMA_ROW_SIZE;
        int row = 0;

        while (row < PUMA_NUM_ROWS) {
            uint8_t noteX2      = s_module_buf[pos];
            uint8_t instrEffect = s_module_buf[pos + 1];
            uint8_t param       = s_module_buf[pos + 2];
            uint8_t runLen      = s_module_buf[pos + 3];
            pos += 4;

            if (runLen == 0) runLen = 1;
            if (row + runLen > PUMA_NUM_ROWS) runLen = PUMA_NUM_ROWS - row;

            for (int r = 0; r < runLen; r++) {
                int off = (row + r) * PUMA_CELL_SIZE;
                dst[off]     = noteX2;
                dst[off + 1] = instrEffect;
                dst[off + 2] = param;
            }
            row += runLen;
        }
    }
}

int player_get_num_patterns(void) {
    return s_num_patterns;
}

// Get cell data at (patternIdx, row, channel).
// Channel is ignored here — PumaTracker patterns are single-channel.
// The order table maps channels to patterns, so the caller uses the right patternIdx.
// Returns packed: (noteX2 << 16) | (instrEffect << 8) | param
uint32_t player_get_cell(int patternIdx, int row, int channel) {
    (void)channel;
    if (!s_pattern_buf) return 0;
    if (patternIdx < 0 || patternIdx >= s_num_patterns) return 0;
    if (row < 0 || row >= PUMA_NUM_ROWS) return 0;

    int off = patternIdx * PUMA_ROW_SIZE + row * PUMA_CELL_SIZE;
    uint8_t noteX2      = s_pattern_buf[off];
    uint8_t instrEffect = s_pattern_buf[off + 1];
    uint8_t param       = s_pattern_buf[off + 2];

    return ((uint32_t)noteX2 << 16) | ((uint32_t)instrEffect << 8) | (uint32_t)param;
}

// Set cell at (patternIdx, row, channel).
// Updates the decompressed buffer. Channel is ignored (patterns are single-channel).
void player_set_cell(int patternIdx, int row, int channel,
                     int noteX2, int instrEffect, int param) {
    (void)channel;
    if (!s_pattern_buf) return;
    if (patternIdx < 0 || patternIdx >= s_num_patterns) return;
    if (row < 0 || row >= PUMA_NUM_ROWS) return;

    int off = patternIdx * PUMA_ROW_SIZE + row * PUMA_CELL_SIZE;
    s_pattern_buf[off]     = (uint8_t)noteX2;
    s_pattern_buf[off + 1] = (uint8_t)instrEffect;
    s_pattern_buf[off + 2] = (uint8_t)param;
}

// ── Note preview ────────────────────────────────────────────────────────────
//
// After Mt_init() runs, the transpiled replayer populates internal tables:
//   MusicData8 (offset 1084 in _ds): sample data pointers [up to 52 entries × 4 bytes]
//   MusicData9 (offset 1292 in _ds): sample lengths in words [up to 52 entries × 2 bytes]
//   MusicData4 (offset  346 in _ds): period lookup table indexed by noteX2
//
// Instruments 0-9 are PCM samples from the module file.
// Instruments 10-51 are built-in 32-sample looping waveforms.
//
// We access these tables from the replayer's internal data section (_ds)
// which is defined in pumatracker.c.

extern uint8_t _ds[];  // Internal data section from pumatracker.c

// Read big-endian u16 from _ds
static uint16_t ds_read_u16(int offset) {
    return (uint16_t)((uint8_t)_ds[offset] << 8) | (uint8_t)_ds[offset + 1];
}

// Read big-endian u32 from _ds
static uint32_t ds_read_u32(int offset) {
    return ((uint32_t)_ds[offset] << 24) | ((uint32_t)_ds[offset+1] << 16) |
           ((uint32_t)_ds[offset+2] << 8) | (uint32_t)_ds[offset+3];
}

// Offsets within _ds (from pumatracker.c #define macros)
#define DS_MUSICDATA4  346   // Period table (u16[] indexed by noteX2 byte offset)
#define DS_MUSICDATA8  1084  // Sample data pointers (u32[] indexed by instrument*4)
#define DS_MUSICDATA9  1292  // Sample lengths in words (u16[] indexed by instrument*2)

// Max valid instrument index (0-9 PCM + 10-51 builtin = 52 total)
#define PUMA_MAX_INSTRUMENTS 52

// Period table has 73 entries (noteX2 from 0 to 144, step 2)
#define PUMA_MAX_NOTE_X2 144

void player_note_on(int instrument, int note, int velocity) {
    if (!s_loaded) return;
    if (instrument < 0 || instrument >= PUMA_MAX_INSTRUMENTS) return;
    if (note < 0 || note > 72) return;  // noteX2 = note*2, max 144

    int noteX2 = note * 2;
    if (noteX2 > PUMA_MAX_NOTE_X2) noteX2 = PUMA_MAX_NOTE_X2;

    // Look up sample data pointer from MusicData8
    uint32_t samplePtr = ds_read_u32(DS_MUSICDATA8 + instrument * 4);
    if (samplePtr == 0) return;

    // Look up sample length (in words) from MusicData9
    uint16_t sampleLenWords = ds_read_u16(DS_MUSICDATA9 + instrument * 2);
    if (sampleLenWords == 0) return;

    // Look up period from MusicData4
    uint16_t period = ds_read_u16(DS_MUSICDATA4 + noteX2);
    if (period == 0) return;

    // Map velocity (0-127) to Paula volume (0-64)
    int vol = (velocity * 64) / 127;
    if (vol > 64) vol = 64;
    if (vol < 1) vol = 1;

    // Disable DMA on channel 0 first (bit 0 = channel 0)
    paula_dma_write(0x0001);

    // Set up Paula channel 0 for preview
    paula_set_sample_ptr(0, (const int8_t*)(uintptr_t)samplePtr);
    paula_set_length(0, sampleLenWords);
    paula_set_period(0, period);
    paula_set_volume(0, (uint8_t)vol);

    // Enable DMA on channel 0 (bit 15 = set mode, bit 0 = channel 0)
    paula_dma_write(0x8001);
}

void player_note_off(void) {
    // Disable DMA on channel 0 (bit 0 = channel 0, no set bit = disable)
    paula_dma_write(0x0001);
    paula_set_volume(0, 0);
}
