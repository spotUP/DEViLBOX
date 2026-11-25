/*
 * PxTone WASM harness — PxTone Collage (.ptcop) / PxTone Tune (.pttune)
 *
 * Wraps libpxtone for Emscripten/AudioWorklet.
 * Outputs interleaved stereo F32 at 48000 Hz.
 */

#include "pxtone/pxtnService.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <new>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define EXPORT extern "C" EMSCRIPTEN_KEEPALIVE
#else
#define EXPORT extern "C"
#endif

#define PXTONE_SAMPLE_RATE 48000
#define PXTONE_CHANNELS 2

/* ---- Memory-based I/O for pxtnService ---- */

struct PxToneMemFile {
    const uint8_t *data;
    int32_t size;
    int32_t pos;
    int32_t cap; /* >0 only for the growable write buffer (data is then malloc'd) */
};

static bool pxtone_io_read(void *user, void *p_dst, int32_t size, int32_t num) {
    auto *mf = (PxToneMemFile *)user;
    int32_t total = size * num;
    if (mf->pos + total > mf->size) return false;
    memcpy(p_dst, mf->data + mf->pos, (size_t)total);
    mf->pos += total;
    return true;
}

static bool pxtone_io_write(void *user, const void *p_src, int32_t size, int32_t num) {
    auto *mf = (PxToneMemFile *)user;
    if (mf->cap <= 0) return false; /* the source file is read-only */
    int32_t total = size * num;
    if (mf->pos + total > mf->cap) {
        int32_t ncap = mf->cap * 2;
        while (ncap < mf->pos + total) ncap *= 2;
        void *nb = realloc((void *)mf->data, (size_t)ncap);
        if (!nb) return false;
        mf->data = (uint8_t *)nb;
        mf->cap = ncap;
    }
    memcpy((uint8_t *)mf->data + mf->pos, p_src, (size_t)total);
    mf->pos += total;
    if (mf->pos > mf->size) mf->size = mf->pos;
    return true;
}

static bool pxtone_io_seek(void *user, int32_t mode, int32_t val) {
    auto *mf = (PxToneMemFile *)user;
    switch (mode) {
        case SEEK_SET: mf->pos = val; break;
        case SEEK_CUR: mf->pos += val; break;
        case SEEK_END: mf->pos = mf->size + val; break;
        default: return false;
    }
    return true;
}

static bool pxtone_io_pos(void *user, int32_t *p_pos) {
    auto *mf = (PxToneMemFile *)user;
    *p_pos = mf->pos;
    return true;
}

/* ---- State ---- */

static pxtnService *g_pxtn = nullptr;
static PxToneMemFile g_memfile;
static uint8_t *g_file_data = nullptr;
static bool g_playing = false;
static bool g_is_tune = false;     /* source was .pttune (PTTUNE header) */
static uint16_t g_exe_ver = 0;     /* source's exe version, written back verbatim */
static PxToneMemFile g_outfile;    /* last pxtone_write result */

/* Temporary buffer for S16 -> F32 conversion */
#define CONV_BUF_FRAMES 512
static int16_t g_s16buf[CONV_BUF_FRAMES * PXTONE_CHANNELS];

/* Per-unit scope taps: each unit's own mono mix (L+R)/2 of the last render, -1..1 (before group effects and master volume). */
#define PXTONE_MAX_UNITS 64
static float g_scope[PXTONE_MAX_UNITS][CONV_BUF_FRAMES];

/* ---- Per-channel muting ---- */

/*
 * PxTone has built-in per-unit muting via pxtnUnit::set_played(bool).
 * We enable moo_set_mute_by_unit(true) so the Moo() function respects
 * per-unit played flags. Then set_channel_gain() toggles individual units.
 *
 * gain == 0 → muted (set_played(false))
 * gain >  0 → active (set_played(true))
 */

static float g_channel_gain[PXTONE_MAX_UNITS];
static bool  g_gain_initialized = false;

static void init_gains() {
    for (int i = 0; i < PXTONE_MAX_UNITS; i++) g_channel_gain[i] = 1.0f;
    g_gain_initialized = true;
}

EXPORT void pxtone_set_channel_gain(int ch, float gain) {
    if (ch < 0 || ch >= PXTONE_MAX_UNITS) return;
    g_channel_gain[ch] = gain;
    if (g_pxtn) {
        /* Enable per-unit muting in the Moo engine */
        g_pxtn->moo_set_mute_by_unit(true);
        int unit_num = g_pxtn->Unit_Num();
        if (ch < unit_num) {
            pxtnUnit *unit = g_pxtn->Unit_Get_variable(ch);
            if (unit) unit->set_played(gain > 0.0f);
        }
    }
}

EXPORT int pxtone_get_num_units(void) {
    if (!g_pxtn) return 0;
    return g_pxtn->Unit_Num();
}

/* ---- Public API ---- */

EXPORT int pxtone_init(const uint8_t *data, uint32_t size) {
    /* Clean up previous */
    if (g_pxtn) {
        g_pxtn->clear();
        delete g_pxtn;
        g_pxtn = nullptr;
    }
    if (g_file_data) {
        free(g_file_data);
        g_file_data = nullptr;
    }
    g_playing = false;

    /* Copy file data (caller's buffer may be freed) */
    g_file_data = (uint8_t *)malloc(size);
    if (!g_file_data) return -1;
    memcpy(g_file_data, data, size);

    g_is_tune = size >= 18 && memcmp(data, "PTTUNE", 6) == 0;
    g_exe_ver = size >= 18 ? (uint16_t)(data[16] | (data[17] << 8)) : 0; /* _VERSIONSIZE = 16 */
    g_memfile.data = g_file_data;
    g_memfile.size = (int32_t)size;
    g_memfile.pos = 0;

    g_pxtn = new (std::nothrow) pxtnService(pxtone_io_read, pxtone_io_write, pxtone_io_seek, pxtone_io_pos);
    if (!g_pxtn) return -2;

    pxtnERR err = g_pxtn->init();
    if (err != pxtnOK) {
        delete g_pxtn;
        g_pxtn = nullptr;
        return -3;
    }

    /* Before tones_ready(): envelopes and delays are built at _dst_sps. */
    if (!g_pxtn->set_destination_quality(PXTONE_CHANNELS, PXTONE_SAMPLE_RATE)) {
        delete g_pxtn;
        g_pxtn = nullptr;
        return -6;
    }

    err = g_pxtn->read(&g_memfile);
    if (err != pxtnOK) {
        delete g_pxtn;
        g_pxtn = nullptr;
        return -4;
    }

    err = g_pxtn->tones_ready();
    if (err != pxtnOK) {
        delete g_pxtn;
        g_pxtn = nullptr;
        return -5;
    }

    pxtnVOMITPREPARATION prep;
    memset(&prep, 0, sizeof(prep));
    prep.flags = pxtnVOMITPREPFLAG_loop;
    prep.start_pos_float = 0;
    prep.master_volume = 0.8f;

    if (!g_pxtn->moo_preparation(&prep)) {
        delete g_pxtn;
        g_pxtn = nullptr;
        return -7;
    }

    /* Enable per-unit muting and reset all gains */
    g_pxtn->moo_set_mute_by_unit(true);
    init_gains();

    g_playing = true;
    return 0;
}

EXPORT void pxtone_stop(void) {
    if (g_pxtn) {
        g_pxtn->clear();
        delete g_pxtn;
        g_pxtn = nullptr;
    }
    if (g_file_data) {
        free(g_file_data);
        g_file_data = nullptr;
    }
    g_playing = false;
}

EXPORT int pxtone_render(float *buf, int frames) {
    if (!g_pxtn || !g_playing) {
        memset(buf, 0, (size_t)frames * PXTONE_CHANNELS * sizeof(float));
        return 0;
    }

    int done = 0;
    while (done < frames) {
        int chunk = frames - done;
        if (chunk > CONV_BUF_FRAMES) chunk = CONV_BUF_FRAMES;

        /* One sample per Moo call so each unit's contribution can be read between ticks. */
        bool ok = true;
        int units = g_pxtn->Unit_Num();
        if (units > PXTONE_MAX_UNITS) units = PXTONE_MAX_UNITS;
        for (int i = 0; i < chunk; i++) {
            ok = g_pxtn->Moo(g_s16buf + i * PXTONE_CHANNELS, PXTONE_CHANNELS * 2);
            /* Moo already advanced the pan index: the tick it just rendered is one back. */
            int32_t idx = (g_pxtn->moo_get_time_pan_index() - 1) & (pxtnBUFSIZE_TIMEPAN - 1);
            for (int u = 0; u < units && done + i < CONV_BUF_FRAMES; u++) {
                const pxtnUnit *unit = g_pxtn->Unit_Get(u);
                g_scope[u][done + i] = unit ? (float)(unit->Tone_Peek(0, idx) + unit->Tone_Peek(PXTONE_CHANNELS - 1, idx)) / 65536.0f : 0.0f;
            }
            if (!ok) { chunk = i + 1; break; }
        }

        /* Convert S16 to F32 */
        for (int i = 0; i < chunk * PXTONE_CHANNELS; i++) {
            buf[done * PXTONE_CHANNELS + i] = (float)g_s16buf[i] / 32768.0f;
        }

        done += chunk;
        if (!ok) {
            /* Song ended or error — zero-fill remainder */
            if (done < frames) {
                memset(buf + done * PXTONE_CHANNELS, 0,
                       (size_t)(frames - done) * PXTONE_CHANNELS * sizeof(float));
            }
            break;
        }
    }

    return done;
}

/* Scope tap of unit u after the last pxtone_render (frames rendered); null when out of range. */
EXPORT const float *pxtone_get_scope(int u) { return u >= 0 && u < PXTONE_MAX_UNITS ? g_scope[u] : nullptr; }
EXPORT const char *pxtone_get_unit_name(int u) {
    if (!g_pxtn || u < 0 || u >= g_pxtn->Unit_Num()) return "";
    const pxtnUnit *unit = g_pxtn->Unit_Get(u);
    int32_t n = 0;
    const char *name = unit ? unit->get_name_buf(&n) : nullptr;
    return name ? name : "";
}

EXPORT int pxtone_get_sample_rate(void) {
    return PXTONE_SAMPLE_RATE;
}

/* ---- Event access (EVERECORD: clock, unit, kind, value) ---- */

EXPORT int pxtone_get_event_count(void) {
    return g_pxtn ? g_pxtn->evels->get_Count() : 0;
}

/* out[0..3] = clock, unit_no, kind, value of the i-th event in clock order; 0 ok, -1 out of range */
EXPORT int pxtone_get_event(int i, int32_t *out) {
    if (!g_pxtn || i < 0) return -1;
    const EVERECORD *r = g_pxtn->evels->get_Records();
    for (; r && i > 0; r = r->next) i--;
    if (!r) return -1;
    out[0] = r->clock; out[1] = r->unit_no; out[2] = r->kind; out[3] = r->value;
    return 0;
}

EXPORT int pxtone_add_event(int clock, int unit, int kind, int value) {
    return g_pxtn && g_pxtn->evels->Record_Add_i(clock, (uint8_t)unit, (uint8_t)kind, value) ? 0 : -1;
}

/* Remove every event at this clock with this unit and kind; returns the number removed. */
EXPORT int pxtone_remove_event(int clock, int unit, int kind) {
    return g_pxtn ? g_pxtn->evels->Record_Delete(clock, clock + 1, (uint8_t)unit, (uint8_t)kind) : 0;
}

/* Change the value of the events at this clock/unit/kind; returns the number changed. */
EXPORT int pxtone_set_event(int clock, int unit, int kind, int value) {
    return g_pxtn ? g_pxtn->evels->Record_Value_Set(clock, clock + 1, (uint8_t)unit, (uint8_t)kind, value) : 0;
}

/* ---- Serialize with pxtnService::write (same container kind and exe version as the source) ---- */

EXPORT int pxtone_write(void) {
    if (!g_pxtn) return -1;
    free((void *)g_outfile.data);
    g_outfile.cap = 1 << 16; g_outfile.pos = 0; g_outfile.size = 0;
    g_outfile.data = (uint8_t *)malloc((size_t)g_outfile.cap);
    if (!g_outfile.data) return -2;
    pxtnERR err = g_pxtn->write(&g_outfile, g_is_tune, g_exe_ver);
    return err == pxtnOK ? g_outfile.size : -3 - (int)err;
}
EXPORT const uint8_t *pxtone_write_data(void) { return g_outfile.data; }

/* ---- Beat clock (master) ---- */

EXPORT int pxtone_get_beat_clock(void) { return g_pxtn ? g_pxtn->master->get_beat_clock() : 0; }
EXPORT float pxtone_get_beat_tempo(void) { return g_pxtn ? g_pxtn->master->get_beat_tempo() : 0.0f; }
EXPORT int pxtone_get_beat_num(void) { return g_pxtn ? g_pxtn->master->get_beat_num() : 0; }
EXPORT int pxtone_get_now_clock(void) { return g_pxtn ? g_pxtn->moo_get_now_clock() : 0; }

/*
 * Live swap: replace the whole event list with n records of 4 int32 (clock, unit, kind, value)
 * and re-prepare playback at the clock now playing. Returns the number of events added
 * (less than n if the allocated event capacity ran out).
 */
EXPORT int pxtone_set_events(const int32_t *rec, int n) {
    if (!g_pxtn) return -1;
    int32_t now = g_pxtn->moo_get_now_clock();
    g_pxtn->evels->Clear();
    int added = 0;
    for (int i = 0; i < n; i++, rec += 4)
        if (g_pxtn->evels->Record_Add_i(rec[0], (uint8_t)rec[1], (uint8_t)rec[2], rec[3])) added++;

    float tempo = g_pxtn->master->get_beat_tempo();
    int32_t bclock = g_pxtn->master->get_beat_clock();
    pxtnVOMITPREPARATION prep;
    memset(&prep, 0, sizeof(prep));
    prep.flags = pxtnVOMITPREPFLAG_loop | pxtnVOMITPREPFLAG_unit_mute;
    if (tempo > 0 && bclock > 0)
        prep.start_pos_sample = (int32_t)((double)now * 60.0 * PXTONE_SAMPLE_RATE / ((double)tempo * bclock));
    prep.master_volume = 0.8f;
    if (!g_pxtn->moo_preparation(&prep)) return -2;
    return added;
}

/* ---- Tick grid over the event list (stage 3) ----
 * Grid row = clock * rows_per_beat / beat_clock. A cell is an ON event; its pitch is the KEY in force at
 * that clock (tracker note = key/256 - 38, so 1 = C-0 and the default key 0x6000 = note 58 = A-4. Derived from the replayer:
 * pxtnService_moo.cpp sets ofs_freq = Get(BASICKEY - basic_key), tone step = ofs_freq * Get2(key), so with the
 * default woice basic key 0x4500 (A 440 Hz, MIDI 69) key 0x6000 plays the sample at its own pitch: MIDI = key/256 - 27,
 * note = MIDI - 11), velocity is
 * the VELOCITY in force (0x68 default 104). The EVERECORD list stays the byte carrier: the grid is derived. */
#include <vector>
struct GridCell { int32_t row, unit, note, vel, dur_rows, clock; };
static std::vector<GridCell> g_grid;

static int32_t value_at(int unit, int kind, int clock, int32_t dflt) {
    int32_t v = dflt;
    for (const EVERECORD *r = g_pxtn->evels->get_Records(); r && r->clock <= clock; r = r->next)
        if (r->unit_no == unit && r->kind == kind) v = r->value;
    return v;
}
static bool has_event(int unit, int kind, int clock) {
    for (const EVERECORD *r = g_pxtn->evels->get_Records(); r && r->clock <= clock; r = r->next)
        if (r->clock == clock && r->unit_no == unit && r->kind == kind) return true;
    return false;
}
static int row_clock(int row, int rpb) { return (int)((int64_t)row * g_pxtn->master->get_beat_clock() / rpb); }

/* Rebuild the grid cache; returns the number of cells (ON events). */
EXPORT int pxtone_grid_build(int rpb) {
    g_grid.clear();
    if (!g_pxtn || rpb < 1) return 0;
    int bc = g_pxtn->master->get_beat_clock();
    if (bc < 1) return 0;
    for (const EVERECORD *r = g_pxtn->evels->get_Records(); r; r = r->next) {
        if (r->kind != EVENTKIND_ON) continue;
        GridCell c;
        c.clock = r->clock; c.unit = r->unit_no;
        c.row = (int32_t)((int64_t)r->clock * rpb / bc);
        c.dur_rows = (int32_t)(((int64_t)r->value * rpb + bc - 1) / bc);
        if (c.dur_rows < 1) c.dur_rows = 1;
        int32_t key = value_at(r->unit_no, EVENTKIND_KEY, r->clock, 0x6000);
        c.note = key / 256 - 38;
        if (c.note < 1) c.note = 1;
        if (c.note > 96) c.note = 96;
        c.vel = value_at(r->unit_no, EVENTKIND_VELOCITY, r->clock, 104);
        g_grid.push_back(c);
    }
    return (int)g_grid.size();
}
/* out[0..5] = row, unit, note, velocity, duration in rows, clock */
EXPORT int pxtone_grid_get(int i, int32_t *out) {
    if (i < 0 || i >= (int)g_grid.size()) return -1;
    const GridCell &c = g_grid[i];
    out[0] = c.row; out[1] = c.unit; out[2] = c.note; out[3] = c.vel; out[4] = c.dur_rows; out[5] = c.clock;
    return 0;
}
/* Edit one grid cell into the event list: note 0 removes the ON, 1..96 sets the pitch (adds an ON of one row
 * when the cell is empty). A KEY added for a note that had none of its own is undone for the next note. */
EXPORT int pxtone_grid_set_note(int rpb, int unit, int row, int note) {
    if (!g_pxtn || rpb < 1 || unit < 0 || row < 0) return -1;
    int clock = row_clock(row, rpb);
    if (note <= 0) {
        int n = pxtone_remove_event(clock, unit, EVENTKIND_ON);
        pxtone_remove_event(clock, unit, EVENTKIND_KEY);
        return n;
    }
    int32_t key = (note + 38) * 256;
    int32_t prev = value_at(unit, EVENTKIND_KEY, clock, 0x6000);
    bool own = has_event(clock, unit, EVENTKIND_KEY);
    if (!has_event(clock, unit, EVENTKIND_ON)) {
        int dur = row_clock(row + 1, rpb) - clock;
        if (pxtone_add_event(clock, unit, EVENTKIND_ON, dur < 1 ? 1 : dur) != 0) return -2;
    }
    if (own) pxtone_set_event(clock, unit, EVENTKIND_KEY, key);
    else {
        if (pxtone_add_event(clock, unit, EVENTKIND_KEY, key) != 0) return -3;
        /* restore the earlier pitch at the next ON of this unit unless it carries its own KEY */
        for (const EVERECORD *r = g_pxtn->evels->get_Records(); r; r = r->next)
            if (r->unit_no == unit && r->kind == EVENTKIND_ON && r->clock > clock) {
                if (!has_event(r->clock, unit, EVENTKIND_KEY)) pxtone_add_event(r->clock, unit, EVENTKIND_KEY, prev);
                break;
            }
    }
    return 1;
}
