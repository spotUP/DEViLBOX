/*
 * JamCracker Pro WASM harness
 * Loads .jam module → pp_init → drives pp_play at 50Hz → renders via Paula
 */

#include "JamCrackerProReplay.c"  /* unity build */
#include "paula_soft.h"
#include <stdlib.h>
#include <string.h>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define EXPORT
#endif

/* ---- State ---- */
static int g_initialized = 0;
static double g_frames_per_tick = 0.0;
static double g_accum = 0.0;
static uint8_t *g_song_buf = NULL;
static uint16_t g_song_length = 0;
static uint16_t g_num_patterns = 0;
static uint16_t g_num_instruments = 0;
static uint32_t g_tick_count = 0;

#define VBLANK_HZ 50.0

/* ---- Public API ---- */

EXPORT int jc_init(const uint8_t *module_data, uint32_t module_size) {
    paula_reset();
    g_accum = 0.0;
    g_tick_count = 0;
    g_frames_per_tick = (double)PAULA_RATE_PAL / VBLANK_HZ;

    /* Free previous song data if any */
    if (g_song_buf) { free(g_song_buf); g_song_buf = NULL; }

    g_song_buf = (uint8_t *)malloc(module_size);
    if (!g_song_buf) return -1;
    memcpy(g_song_buf, module_data, module_size);

    /* Read module header for metadata (big-endian) */
    if (module_size >= 10) {
        g_num_instruments = (uint16_t)((module_data[4] << 8) | module_data[5]);
        uint32_t pos = 6 + g_num_instruments * 40;
        if (pos + 2 <= module_size) {
            g_num_patterns = (uint16_t)((module_data[pos] << 8) | module_data[pos + 1]);
            pos += 2 + g_num_patterns * 6;
            if (pos + 2 <= module_size) {
                g_song_length = (uint16_t)((module_data[pos] << 8) | module_data[pos + 1]);
            }
        }
    }

    /* pp_init expects a0 = module data pointer */
    a0 = (uint32_t)(uintptr_t)g_song_buf;
    pp_init();

    g_initialized = 1;
    return 0;
}

EXPORT int jc_render(float *buf, int frames) {
    if (!g_initialized) return 0;
    float *out = buf;
    int remaining = frames;

    while (remaining > 0) {
        double until_tick = g_frames_per_tick - g_accum;
        int n = (int)until_tick;
        if (n < 1) n = 1;
        if (n > remaining) n = remaining;

        int got = paula_render(out, n);
        out += got * 2;
        remaining -= got;
        g_accum += (double)got;

        if (g_accum >= g_frames_per_tick) {
            g_accum -= g_frames_per_tick;
            pp_play();
            g_tick_count++;
        }
    }
    return frames;
}

EXPORT void jc_stop(void) {
    if (!g_initialized) return;
    pp_end();
    g_initialized = 0;
    if (g_song_buf) { free(g_song_buf); g_song_buf = NULL; }
}

/* Position: current song position index (counts down from song_length) */
EXPORT int jc_get_song_pos(void) {
    if (!g_initialized) return 0;
    return (int)g_song_length - (int)READ16((uintptr_t)pp_songcnt);
}

/* Row within current pattern (counts down from pattern row count) */
EXPORT int jc_get_row(void) {
    if (!g_initialized) return 0;
    return (int)READ8((uintptr_t)pp_notecnt);
}

/* Current speed (ticks per row) */
EXPORT int jc_get_speed(void) {
    if (!g_initialized) return 6;
    return (int)READ8((uintptr_t)pp_wait);
}

/* Total tick count since init */
EXPORT uint32_t jc_get_tick(void) {
    return g_tick_count;
}

/* Per-channel mixer gain (0.0 = mute, 1.0 = unity) */
EXPORT void jc_set_channel_gain(int ch, float gain) {
    paula_set_channel_gain(ch, gain);
}

/* Per-channel peak levels (call after render, resets peaks) */
EXPORT void jc_get_channel_levels(float *out4) {
    paula_get_channel_levels(out4);
}

/* Module metadata */
EXPORT int jc_get_song_length(void) { return (int)g_song_length; }
EXPORT int jc_get_num_patterns(void) { return (int)g_num_patterns; }
EXPORT int jc_get_num_instruments(void) { return (int)g_num_instruments; }
EXPORT int jc_get_sample_rate(void) { return PAULA_RATE_PAL; }

/* ---- Per-note instrument preview ---- */

static int g_preview_active = 0;
static double g_preview_accum = 0.0;

/**
 * jc_note_on — trigger a single instrument on voice 0 for preview.
 * @param instr_index  0-based instrument index
 * @param note_index   1-based note (1-36, like JamCracker: C-1=1, B-3=36)
 * @param velocity     0-64 volume
 *
 * Sets up voice 0's Paula channel directly, matching what pp_nnt does
 * when processing a note event, then enables DMA.
 */
EXPORT void jc_note_on(int instr_index, int note_index, int velocity) {
    if (!g_initialized || !g_song_buf) return;
    if (instr_index < 0 || instr_index >= (int)g_num_instruments) return;
    if (note_index < 1 || note_index > 36) note_index = 12;

    /* Look up period from pp_periods table (0-based, 2 bytes per entry) */
    uint16_t period = pp_periods[note_index - 1];

    /* Look up instrument from instable */
    uint32_t inst_base = READ32((uintptr_t)instable) + (uint32_t)(instr_index * it_sizeof);
    uint32_t inst_addr = READ32(inst_base + it_address);
    uint8_t  inst_flags = READ8(inst_base + it_flags);
    uint32_t inst_size = READ32(inst_base + it_size);

    if (inst_addr == 0) return;  /* empty instrument */

    /* Set up voice 0 (pp_variables + 0*pv_sizeof) */
    uint8_t *v = pp_variables;  /* voice 0 */

    /* Set period (all 3 arp slots to same value) */
    WRITE16((uintptr_t)(v + pv_pers), period);
    WRITE16((uintptr_t)(v + pv_pers + 2), period);
    WRITE16((uintptr_t)(v + pv_pers + 4), period);
    WRITE32((uintptr_t)(v + pv_peraddress), (uintptr_t)&pp_periods[note_index - 1]);

    /* Clear portamento and vibrato */
    WRITE16((uintptr_t)(v + pv_por), 0);
    WRITE16((uintptr_t)(v + pv_deltapor), 0);
    WRITE16((uintptr_t)(v + pv_vib), 0);
    WRITE16((uintptr_t)(v + pv_deltavib), 0);
    WRITE8((uintptr_t)(v + pv_vibcnt), 0);

    /* Set instrument */
    uint8_t is_am = (inst_flags & 0x02) ? 1 : 0;
    if (is_am) {
        /* AM instrument: waveform is at inst_addr, length is fixed 32 words */
        WRITE16((uintptr_t)(v + pv_waveoffset), 0);
        WRITE32((uintptr_t)(v + pv_insaddress), inst_addr);
        WRITE16((uintptr_t)(v + pv_inslen), 0x20);  /* 32 words */
    } else {
        /* PCM instrument */
        WRITE32((uintptr_t)(v + pv_insaddress), inst_addr);
        WRITE16((uintptr_t)(v + pv_inslen), (uint16_t)(inst_size >> 1));
    }
    WRITE8((uintptr_t)(v + pv_flags), inst_flags);

    /* Set volume */
    int vol = velocity;
    if (vol < 0) vol = 0;
    if (vol > 64) vol = 64;
    WRITE16((uintptr_t)(v + pv_vol), (uint16_t)vol);
    WRITE16((uintptr_t)(v + pv_vollevel), (uint16_t)vol);
    WRITE16((uintptr_t)(v + pv_deltavol), 0);

    /* Clear phase */
    WRITE16((uintptr_t)(v + pv_phase), 0);
    WRITE16((uintptr_t)(v + pv_deltaphase), 0);
    WRITE16((uintptr_t)(v + pv_waveoffset), 0);

    /* Set up Paula channel 0 directly */
    const int8_t *sample_ptr = (const int8_t *)(uintptr_t)inst_addr;
    uint16_t sample_len = is_am ? 0x20 : (uint16_t)(inst_size >> 1);

    paula_set_sample_ptr(0, sample_ptr);
    paula_set_length(0, sample_len);
    paula_set_period(0, period);
    paula_set_volume(0, (uint8_t)vol);

    /* Enable DMA for channel 0 */
    paula_dma_write(0x8001);

    /* Also store the custbase for pp_uvs to find the channel */
    WRITE32((uintptr_t)(v + pv_custbase), 0xDFF0A0);
    WRITE16((uintptr_t)(v + pv_dmacon), 0x0001);

    g_preview_active = 1;
    g_preview_accum = 0.0;
}

/**
 * jc_note_off — stop preview on voice 0
 */
EXPORT void jc_note_off(void) {
    paula_dma_write(0x0001);  /* disable DMA for ch0 */
    paula_set_volume(0, 0);
    g_preview_active = 0;
}

/**
 * jc_render_preview — render audio for preview mode.
 * Ticks pp_uvs on voice 0 at 50Hz to process AM synthesis / effects.
 */
EXPORT int jc_render_preview(float *buf, int frames) {
    if (!g_preview_active) {
        memset(buf, 0, frames * 2 * sizeof(float));
        return frames;
    }

    float *out = buf;
    int remaining = frames;

    while (remaining > 0) {
        double until_tick = g_frames_per_tick - g_preview_accum;
        int n = (int)until_tick;
        if (n < 1) n = 1;
        if (n > remaining) n = remaining;

        int got = paula_render(out, n);
        out += got * 2;
        remaining -= got;
        g_preview_accum += (double)got;

        if (g_preview_accum >= g_frames_per_tick) {
            g_preview_accum -= g_frames_per_tick;
            /* Run voice update on voice 0 only for AM synthesis */
            a1 = (uint32_t)(uintptr_t)pp_variables;
            pp_uvs();
        }
    }
    return frames;
}

/* ---- Pattern data access ---- */

EXPORT int jc_get_pattern_rows(int patIdx) {
    if (!g_initialized || patIdx < 0 || patIdx >= (int)g_num_patterns) return 0;
    uint32_t pt_base = READ32((uintptr_t)patttable);
    if (!pt_base) return 0;
    uint16_t size_bytes = READ16(pt_base + patIdx * pt_sizeof + pt_size);
    return (int)(size_bytes / (nt_sizeof * 4));
}

EXPORT int jc_get_pattern_cell(int patIdx, int row, int channel, int field) {
    if (!g_initialized || patIdx < 0 || patIdx >= (int)g_num_patterns) return 0;
    if (channel < 0 || channel >= 4) return 0;
    if (field < 0 || field >= nt_sizeof) return 0;
    uint32_t pt_base = READ32((uintptr_t)patttable);
    if (!pt_base) return 0;
    uint16_t size_bytes = READ16(pt_base + patIdx * pt_sizeof + pt_size);
    int num_rows = (int)(size_bytes / (nt_sizeof * 4));
    if (row < 0 || row >= num_rows) return 0;
    uint32_t pat_addr = READ32(pt_base + patIdx * pt_sizeof + pt_address);
    if (!pat_addr) return 0;
    return (int)READ8(pat_addr + (row * 4 + channel) * nt_sizeof + field);
}

EXPORT void jc_set_pattern_cell(int patIdx, int row, int channel, int field, int value) {
    if (!g_initialized || patIdx < 0 || patIdx >= (int)g_num_patterns) return;
    if (channel < 0 || channel >= 4) return;
    if (field < 0 || field >= nt_sizeof) return;
    uint32_t pt_base = READ32((uintptr_t)patttable);
    if (!pt_base) return;
    uint16_t size_bytes = READ16(pt_base + patIdx * pt_sizeof + pt_size);
    int num_rows = (int)(size_bytes / (nt_sizeof * 4));
    if (row < 0 || row >= num_rows) return;
    uint32_t pat_addr = READ32(pt_base + patIdx * pt_sizeof + pt_address);
    if (!pat_addr) return;
    WRITE8(pat_addr + (row * 4 + channel) * nt_sizeof + field, (uint8_t)value);
}

EXPORT int jc_get_song_entry(int pos) {
    if (!g_initialized || pos < 0 || pos >= (int)g_song_length) return 0;
    uint32_t st = READ32((uintptr_t)songtable);
    if (!st) return 0;
    return (int)READ16(st + pos * 2);
}

/* ---- Save/Export ---- */

/**
 * jc_save — create a clean copy of the module suitable for saving.
 * Returns pointer to a malloc'd buffer (caller must free via jc_save_free).
 * Runtime pointer fields (it_address, pt_address) are zeroed since they
 * get re-resolved by pp_init at load time.
 */
static uint8_t *g_save_buf = NULL;
static uint32_t g_save_size = 0;

EXPORT uint32_t jc_save(void) {
    if (!g_initialized || !g_song_buf) return 0;

    /* Calculate total module size by walking the structure */
    uint32_t pos = 4; /* skip "BeEp" magic */
    uint16_t noi = (uint16_t)((g_song_buf[pos] << 8) | g_song_buf[pos + 1]);
    pos += 2;

    /* Skip instrument table */
    uint32_t inst_table_start = pos;
    pos += noi * it_sizeof;

    /* Read NOP */
    uint16_t nop = (uint16_t)((g_song_buf[pos] << 8) | g_song_buf[pos + 1]);
    pos += 2;

    /* Skip pattern table */
    uint32_t pat_table_start = pos;
    pos += nop * pt_sizeof;

    /* Read song length */
    uint16_t sl = (uint16_t)((g_song_buf[pos] << 8) | g_song_buf[pos + 1]);
    pos += 2 + sl * 2;

    /* Pattern data: sum up all pattern sizes */
    for (int i = 0; i < nop; i++) {
        uint32_t pt_off = pat_table_start + i * pt_sizeof;
        uint16_t pt_rows = (uint16_t)((g_song_buf[pt_off] << 8) | g_song_buf[pt_off + 1]);
        pos += pt_rows * nt_sizeof * 4;
    }

    /* Sample data: sum up all instrument sizes */
    for (int i = 0; i < noi; i++) {
        uint32_t it_off = inst_table_start + i * it_sizeof;
        uint32_t size = (uint32_t)(
            (g_song_buf[it_off + 32] << 24) |
            (g_song_buf[it_off + 33] << 16) |
            (g_song_buf[it_off + 34] << 8)  |
             g_song_buf[it_off + 35]
        );
        pos += size;
    }

    g_save_size = pos;

    /* Free previous save buffer */
    if (g_save_buf) { free(g_save_buf); g_save_buf = NULL; }

    g_save_buf = (uint8_t *)malloc(g_save_size);
    if (!g_save_buf) return 0;

    memcpy(g_save_buf, g_song_buf, g_save_size);

    /* Zero out runtime pointer fields in instrument table */
    for (int i = 0; i < noi; i++) {
        uint32_t off = 6 + i * it_sizeof + 36; /* it_address at offset 36 */
        g_save_buf[off] = 0; g_save_buf[off+1] = 0;
        g_save_buf[off+2] = 0; g_save_buf[off+3] = 0;
    }

    /* Zero out runtime pointer fields in pattern table */
    uint32_t pt_start = 6 + noi * it_sizeof + 2;
    for (int i = 0; i < nop; i++) {
        uint32_t off = pt_start + i * pt_sizeof + pt_address;
        g_save_buf[off] = 0; g_save_buf[off+1] = 0;
        g_save_buf[off+2] = 0; g_save_buf[off+3] = 0;
    }

    return g_save_size;
}

EXPORT uint8_t *jc_save_ptr(void) {
    return g_save_buf;
}

EXPORT void jc_save_free(void) {
    if (g_save_buf) { free(g_save_buf); g_save_buf = NULL; }
    g_save_size = 0;
}
