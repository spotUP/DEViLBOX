/*
 * Music Assembler WASM harness
 * Wraps RetrovertApp/playback_plugins C API into player_* exports for the worklet.
 */

#include "ma/music_assembler.h"
#include <stdlib.h>
#include <string.h>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define EXPORT
#endif

static MaModule *g_module = NULL;
static float g_sample_rate = 44100.0f;
static int g_preview_active = 0;
static uint8_t *g_save_buf = NULL;
static uint32_t g_save_size = 0;

/* Store the raw module data for save/export */
static uint8_t *g_raw_data = NULL;
static uint32_t g_raw_size = 0;

EXPORT int player_init(const uint8_t *module_data, uint32_t module_size) {
    if (g_module) {
        ma_destroy(g_module);
        g_module = NULL;
    }
    g_preview_active = 0;

    /* Store raw data for save/export */
    if (g_raw_data) { free(g_raw_data); g_raw_data = NULL; }
    g_raw_data = (uint8_t *)malloc(module_size);
    if (g_raw_data) {
        memcpy(g_raw_data, module_data, module_size);
        g_raw_size = module_size;
    }

    g_module = ma_create(module_data, (size_t)module_size, g_sample_rate);
    return g_module ? 0 : -1;
}

EXPORT int player_render(float *buf, int frames) {
    if (!g_module) return 0;
    return (int)ma_render(g_module, buf, (size_t)frames);
}

EXPORT void player_stop(void) {
    g_preview_active = 0;
    if (g_module) {
        ma_destroy(g_module);
        g_module = NULL;
    }
    if (g_raw_data) { free(g_raw_data); g_raw_data = NULL; g_raw_size = 0; }
    if (g_save_buf) { free(g_save_buf); g_save_buf = NULL; g_save_size = 0; }
}

EXPORT void player_set_sample_rate(int rate) {
    g_sample_rate = (float)rate;
}

EXPORT int player_is_finished(void) {
    if (!g_module) return 1;
    return ma_has_ended(g_module) ? 1 : 0;
}

EXPORT int player_get_subsong_count(void) {
    if (!g_module) return 1;
    return ma_subsong_count(g_module);
}

EXPORT void player_set_subsong(int n) {
    if (g_module) ma_select_subsong(g_module, n);
}

EXPORT const char *player_get_title(void) {
    return "Music Assembler";
}

EXPORT double player_detect_duration(void) {
    return 0.0;
}

EXPORT void player_set_channel_gain(int ch, float gain) {
    if (!g_module || ch < 0 || ch >= 4) return;
    static float s_gains[4] = {1.0f, 1.0f, 1.0f, 1.0f};
    s_gains[ch] = gain;
    uint32_t mask = 0;
    for (int i = 0; i < 4; i++) {
        if (s_gains[i] > 0.0f) mask |= (1U << i);
    }
    ma_set_channel_mask(g_module, mask);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Instrument preview
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

EXPORT void ma_note_on_preview(int instrument, int note, int velocity) {
    if (!g_module) return;
    ma_note_on(g_module, instrument, note, velocity);
    g_preview_active = 1;
}

EXPORT void ma_note_off_preview(void) {
    if (!g_module) return;
    ma_note_off(g_module);
    g_preview_active = 0;
}

EXPORT int ma_render_preview_buf(float *buf, int frames) {
    if (!g_module || !g_preview_active) {
        memset(buf, 0, (size_t)frames * 2 * sizeof(float));
        return frames;
    }
    return (int)ma_render_preview(g_module, buf, (size_t)frames);
}

EXPORT int ma_get_instrument_count(void) {
    if (!g_module) return 0;
    return ma_instrument_count(g_module);
}

EXPORT float ma_get_instrument_param(int inst, const char *param) {
    if (!g_module) return -1.0f;
    return ma_instrument_get_param(g_module, inst, param);
}

EXPORT void ma_set_instrument_param(int inst, const char *param, float value) {
    if (!g_module) return;
    ma_instrument_set_param(g_module, inst, param, value);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Save / Export
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

EXPORT uint32_t ma_save(void) {
    /* Return the stored raw module data for export.
     * A full re-serialize from the in-memory module state would be ideal
     * but is complex. For now, return the original binary. */
    if (!g_raw_data || g_raw_size == 0) return 0;

    if (g_save_buf) { free(g_save_buf); g_save_buf = NULL; }
    g_save_buf = (uint8_t *)malloc(g_raw_size);
    if (!g_save_buf) return 0;
    memcpy(g_save_buf, g_raw_data, g_raw_size);
    g_save_size = g_raw_size;
    return g_save_size;
}

EXPORT uint8_t *ma_save_ptr(void) {
    return g_save_buf;
}

EXPORT void ma_save_free(void) {
    if (g_save_buf) { free(g_save_buf); g_save_buf = NULL; }
    g_save_size = 0;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Pattern editing bridge
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/*
 * Decoded cell representation used by get/set cell.
 * note:       0-63 note index (0 = no note for release events)
 * instrument: 0-63 instrument index, or -1 if none
 * release:    1 if release event, 0 otherwise
 * delay:      row delay counter (signed, stored as int8_t in track)
 */
typedef struct MaCellDecoded {
    int note;
    int instrument;
    int release;
    int delay;
} MaCellDecoded;

/*
 * Decode one event from track data starting at *offset.
 * Returns 1 on success, 0 on end-of-track / error.
 * Advances *offset past the consumed bytes.
 */
static int ma_decode_event(const uint8_t *data, size_t length, size_t *offset, MaCellDecoded *cell) {
    size_t off = *offset;
    if (off >= length) return 0;

    uint8_t b0 = data[off++];
    if (b0 == 0xff) return 0; /* track terminator */

    cell->note = 0;
    cell->instrument = -1;
    cell->release = 0;
    cell->delay = 0;

    if ((b0 & 0x80) == 0) {
        /* Note event (no instrument change) */
        cell->note = b0 & 0x3f;

        if (off >= length) { *offset = off; return 0; }
        uint8_t b1 = data[off++];
        uint8_t lastByte = b1;

        if ((b1 & 0x80) != 0) {
            lastByte = b1 & 0x7f;
            if (off >= length) { *offset = off; return 0; }
            off++; /* skip portamento_or_vibrato_value */
        }
        cell->delay = (int)(int8_t)lastByte;
    } else if ((b0 & 0x40) == 0) {
        /* Release event — single byte, bits 5-0 are the delay */
        cell->release = 1;
        cell->delay = (int)(int8_t)(b0 & 0x3f);
    } else {
        /* Instrument + note event */
        cell->instrument = b0 & 0x3f;

        if (off >= length) { *offset = off; return 0; }
        uint8_t b1 = data[off++];
        cell->note = b1 & 0x3f;

        if (off >= length) { *offset = off; return 0; }
        uint8_t b2 = data[off++];
        uint8_t lastByte = b2;

        if ((b2 & 0x80) != 0) {
            lastByte = b2 & 0x7f;
            if (off >= length) { *offset = off; return 0; }
            off++; /* skip portamento_or_vibrato_value */
        }
        cell->delay = (int)(int8_t)lastByte;
    }

    *offset = off;
    return 1;
}

/*
 * Encode one cell back to bytes. Returns number of bytes written (1-4).
 * buf must have room for at least 4 bytes.
 */
static int ma_encode_event(const MaCellDecoded *cell, uint8_t *buf) {
    int n = 0;

    if (cell->release) {
        /* Release: 1 byte — high bits 10, bits 5-0 = delay */
        buf[n++] = (uint8_t)(0x80 | (cell->delay & 0x3f));
    } else if (cell->instrument >= 0) {
        /* Instrument + note: 3 bytes */
        buf[n++] = (uint8_t)(0xc0 | (cell->instrument & 0x3f));
        buf[n++] = (uint8_t)(cell->note & 0x3f);
        buf[n++] = (uint8_t)cell->delay;
    } else {
        /* Note only: 2 bytes */
        buf[n++] = (uint8_t)(cell->note & 0x3f);
        buf[n++] = (uint8_t)cell->delay;
    }

    return n;
}

EXPORT int ma_get_num_tracks(void) {
    if (!g_module) return 0;
    return (int)ma_track_count(g_module);
}

EXPORT int ma_get_track_length(int trackIdx) {
    if (!g_module || trackIdx < 0) return 0;

    size_t length = 0;
    const uint8_t *data = ma_track_data(g_module, (size_t)trackIdx, &length);
    if (!data) return 0;

    size_t offset = 0;
    int count = 0;
    MaCellDecoded cell;

    while (ma_decode_event(data, length, &offset, &cell)) {
        count++;
    }
    return count;
}

EXPORT uint32_t ma_get_cell(int trackIdx, int eventIdx) {
    if (!g_module || trackIdx < 0) return 0;

    size_t length = 0;
    const uint8_t *data = ma_track_data(g_module, (size_t)trackIdx, &length);
    if (!data) return 0;

    size_t offset = 0;
    MaCellDecoded cell;

    for (int i = 0; i <= eventIdx; i++) {
        if (!ma_decode_event(data, length, &offset, &cell)) return 0;
    }

    /* Pack: (note << 24) | (instrument << 16) | (release << 8) | (delay & 0xff) */
    uint32_t instr = (cell.instrument >= 0) ? (uint32_t)cell.instrument : 0xff;
    return ((uint32_t)(cell.note & 0xff) << 24) |
           ((instr & 0xff) << 16) |
           ((uint32_t)(cell.release & 0xff) << 8) |
           ((uint32_t)(cell.delay & 0xff));
}

EXPORT void ma_set_cell(int trackIdx, int eventIdx,
                        int note, int instrument, int release, int delay) {
    if (!g_module || trackIdx < 0) return;

    size_t length = 0;
    const uint8_t *data = ma_track_data(g_module, (size_t)trackIdx, &length);
    if (!data) return;

    /* 1. Decode all events */
    size_t offset = 0;
    MaCellDecoded cells[512]; /* reasonable max */
    int count = 0;

    while (count < 512 && ma_decode_event(data, length, &offset, &cells[count])) {
        count++;
    }

    if (eventIdx < 0 || eventIdx >= count) return;

    /* 2. Modify the target event */
    cells[eventIdx].note = note;
    cells[eventIdx].instrument = instrument;
    cells[eventIdx].release = release;
    cells[eventIdx].delay = delay;

    /* 3. Re-encode all events + terminator */
    uint8_t newbuf[2048]; /* 512 events * max 4 bytes = 2048 */
    size_t newlen = 0;

    for (int i = 0; i < count; i++) {
        uint8_t tmp[4];
        int n = ma_encode_event(&cells[i], tmp);
        if (newlen + n + 1 > sizeof(newbuf)) return; /* overflow guard */
        memcpy(newbuf + newlen, tmp, n);
        newlen += n;
    }
    newbuf[newlen++] = 0xff; /* terminator */

    /* 4. Allocate new buffer and replace track data */
    uint8_t *newdata = (uint8_t *)malloc(newlen);
    if (!newdata) return;
    memcpy(newdata, newbuf, newlen);

    ma_track_replace_data(g_module, (size_t)trackIdx, newdata, newlen);
}
