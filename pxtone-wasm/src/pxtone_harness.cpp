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
    (void)user; (void)p_src; (void)size; (void)num;
    return false; /* read-only */
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

/* Temporary buffer for S16 -> F32 conversion */
#define CONV_BUF_FRAMES 512
static int16_t g_s16buf[CONV_BUF_FRAMES * PXTONE_CHANNELS];

/* ---- Per-channel muting ---- */

/*
 * PxTone has built-in per-unit muting via pxtnUnit::set_played(bool).
 * We enable moo_set_mute_by_unit(true) so the Moo() function respects
 * per-unit played flags. Then set_channel_gain() toggles individual units.
 *
 * gain == 0 → muted (set_played(false))
 * gain >  0 → active (set_played(true))
 */

#define PXTONE_MAX_UNITS 64
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

    if (!g_pxtn->set_destination_quality(PXTONE_CHANNELS, PXTONE_SAMPLE_RATE)) {
        delete g_pxtn;
        g_pxtn = nullptr;
        return -6;
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

        int bytes = chunk * PXTONE_CHANNELS * 2; /* S16 stereo */
        bool ok = g_pxtn->Moo(g_s16buf, bytes);

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

EXPORT int pxtone_get_sample_rate(void) {
    return PXTONE_SAMPLE_RATE;
}
