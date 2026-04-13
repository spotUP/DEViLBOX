/**
 * qsf_wasm.c - WASM bridge for QSF (Capcom QSound) playback
 *
 * Uses psflib to parse the PSF container and highly_quixotic (Z80 + QSound DSP)
 * to emulate Capcom CPS1/CPS2 arcade sound hardware.
 *
 * QSF exe data uses a section-based format:
 *   3-byte section name ("KEY", "Z80", "SMP") + 4-byte LE offset + 4-byte LE size + data
 *
 * Native sample rate: 24038 Hz. We resample to the worklet's sample rate.
 */

#include <emscripten.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>

#include "psflib/psflib.h"
#include "highly_quixotic/qsound.h"

/* ── State ─────────────────────────────────────────────────────────────────── */

typedef struct {
    uint8_t* qsound_state;

    /* Accumulated section data from PSF exe blocks */
    uint8_t  key_data[11];
    int      has_key;
    uint8_t* z80_rom;
    size_t   z80_size;
    uint8_t* sample_rom;
    size_t   sample_size;

    /* Playback state */
    int      playing;
    uint32_t target_sample_rate;

    /* Resampling from 24038 Hz to target rate */
    double   resample_pos;     /* fractional position in source stream */
    int16_t  prev_l, prev_r;   /* previous sample for interpolation */

    /* Tag-extracted length in milliseconds (0 = unknown) */
    uint32_t length_ms;
} QsfState;

static QsfState g_state;

/* ── Helpers ───────────────────────────────────────────────────────────────── */

static inline uint32_t get_le32(const uint8_t* p) {
    return (uint32_t)p[0] | ((uint32_t)p[1] << 8) |
           ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
}

/* ── psflib in-memory file I/O ─────────────────────────────────────────────── */

typedef struct {
    const uint8_t* data;
    size_t size;
    size_t pos;
} MemFile;

static void* mem_fopen(void* context, const char* path) {
    /* For _lib references we'd need to load another file.
     * In WASM with a single buffer, we don't support _lib chains.
     * Return NULL to indicate file not found. */
    (void)context;
    (void)path;
    return NULL;
}

static size_t mem_fread(void* buffer, size_t size, size_t count, void* handle) {
    MemFile* f = (MemFile*)handle;
    if (!f || !f->data) return 0;
    size_t total = size * count;
    size_t avail = f->size - f->pos;
    if (total > avail) total = avail;
    size_t items = (size > 0) ? (total / size) : 0;
    size_t bytes = items * size;
    if (bytes > 0) {
        memcpy(buffer, f->data + f->pos, bytes);
        f->pos += bytes;
    }
    return items;
}

static int mem_fseek(void* handle, int64_t offset, int whence) {
    MemFile* f = (MemFile*)handle;
    if (!f) return -1;
    int64_t new_pos;
    switch (whence) {
        case 0: new_pos = offset; break;                           /* SEEK_SET */
        case 1: new_pos = (int64_t)f->pos + offset; break;        /* SEEK_CUR */
        case 2: new_pos = (int64_t)f->size + offset; break;       /* SEEK_END */
        default: return -1;
    }
    if (new_pos < 0 || new_pos > (int64_t)f->size) return -1;
    f->pos = (size_t)new_pos;
    return 0;
}

static int mem_fclose(void* handle) {
    MemFile* f = (MemFile*)handle;
    if (f) free(f);
    return 0;
}

static long mem_ftell(void* handle) {
    MemFile* f = (MemFile*)handle;
    return f ? (long)f->pos : -1;
}

/* Special fopen that wraps our in-memory buffer (for the main file only) */
typedef struct {
    const uint8_t* data;
    size_t size;
    int opened;  /* prevent double-open */
} MainFileCtx;

static void* main_fopen(void* context, const char* path) {
    MainFileCtx* ctx = (MainFileCtx*)context;
    (void)path;
    if (ctx->opened) return NULL;  /* _lib refs not supported */
    ctx->opened = 1;
    MemFile* f = (MemFile*)malloc(sizeof(MemFile));
    if (!f) return NULL;
    f->data = ctx->data;
    f->size = ctx->size;
    f->pos = 0;
    return f;
}

/* ── psflib callbacks ──────────────────────────────────────────────────────── */

/* Load callback: receives decompressed exe data sections */
static int qsf_load_cb(void* context, const uint8_t* exe, size_t exe_size,
                        const uint8_t* reserved, size_t reserved_size) {
    (void)reserved;
    (void)reserved_size;
    QsfState* st = (QsfState*)context;
    if (!exe || exe_size < 11) return 0;

    size_t pos = 0;
    while (pos + 11 <= exe_size) {
        char name[4] = { (char)exe[pos], (char)exe[pos + 1], (char)exe[pos + 2], '\0' };
        uint32_t offset = get_le32(exe + pos + 3);
        uint32_t size   = get_le32(exe + pos + 7);
        pos += 11;

        if (pos + size > exe_size) break;

        if (strcmp(name, "KEY") == 0) {
            if (size <= 11) {
                memcpy(st->key_data, exe + pos, size);
                st->has_key = 1;
            }
        } else if (strcmp(name, "Z80") == 0) {
            size_t needed = (size_t)offset + size;
            if (!st->z80_rom) {
                st->z80_rom = (uint8_t*)calloc(1, needed);
                if (!st->z80_rom) return -1;
                st->z80_size = needed;
            } else if (st->z80_size < needed) {
                uint8_t* nb = (uint8_t*)realloc(st->z80_rom, needed);
                if (!nb) return -1;
                memset(nb + st->z80_size, 0, needed - st->z80_size);
                st->z80_rom = nb;
                st->z80_size = needed;
            }
            memcpy(st->z80_rom + offset, exe + pos, size);
        } else if (strcmp(name, "SMP") == 0) {
            size_t needed = (size_t)offset + size;
            if (!st->sample_rom) {
                st->sample_rom = (uint8_t*)calloc(1, needed);
                if (!st->sample_rom) return -1;
                st->sample_size = needed;
            } else if (st->sample_size < needed) {
                uint8_t* nb = (uint8_t*)realloc(st->sample_rom, needed);
                if (!nb) return -1;
                memset(nb + st->sample_size, 0, needed - st->sample_size);
                st->sample_rom = nb;
                st->sample_size = needed;
            }
            memcpy(st->sample_rom + offset, exe + pos, size);
        }

        pos += size;
    }

    return 0;
}

/* Parse time string like "3:45.67" or "120000" (ms) into milliseconds */
static uint32_t parse_time_tag(const char* value) {
    if (!value) return 0;

    /* Check for mm:ss.ms format */
    int minutes = 0, seconds = 0, millis = 0;
    const char* colon = strchr(value, ':');
    if (colon) {
        minutes = atoi(value);
        const char* dot = strchr(colon + 1, '.');
        if (dot) {
            seconds = atoi(colon + 1);
            /* Parse fractional seconds (up to 3 digits) */
            const char* frac = dot + 1;
            int digits = 0;
            millis = 0;
            while (*frac >= '0' && *frac <= '9' && digits < 3) {
                millis = millis * 10 + (*frac - '0');
                frac++;
                digits++;
            }
            while (digits < 3) { millis *= 10; digits++; }
        } else {
            seconds = atoi(colon + 1);
        }
        return (uint32_t)(minutes * 60000 + seconds * 1000 + millis);
    }

    /* Plain number = milliseconds */
    return (uint32_t)atoi(value);
}

/* Info callback: receives PSF tags */
static int qsf_info_cb(void* context, const char* name, const char* value) {
    QsfState* st = (QsfState*)context;
    if (strcasecmp(name, "length") == 0) {
        st->length_ms = parse_time_tag(value);
    }
    return 0;
}

/* ── Exported API ──────────────────────────────────────────────────────────── */

EMSCRIPTEN_KEEPALIVE
int qsf_wasm_init(uint32_t sample_rate) {
    memset(&g_state, 0, sizeof(g_state));
    g_state.target_sample_rate = sample_rate;
    qsound_init();
    return 0;
}

EMSCRIPTEN_KEEPALIVE
int qsf_wasm_load(const uint8_t* data, uint32_t len) {
    /* Free any previous state */
    free(g_state.qsound_state); g_state.qsound_state = NULL;
    free(g_state.z80_rom); g_state.z80_rom = NULL;
    free(g_state.sample_rom); g_state.sample_rom = NULL;
    g_state.z80_size = 0;
    g_state.sample_size = 0;
    g_state.has_key = 0;
    memset(g_state.key_data, 0, sizeof(g_state.key_data));
    g_state.length_ms = 0;
    g_state.playing = 0;
    g_state.resample_pos = 0.0;
    g_state.prev_l = 0;
    g_state.prev_r = 0;

    /* Set up psflib callbacks with in-memory file I/O */
    MainFileCtx file_ctx = { data, len, 0 };

    psf_file_callbacks cbs;
    cbs.path_separators = "/\\";
    cbs.context = &file_ctx;
    cbs.fopen  = main_fopen;
    cbs.fread  = mem_fread;
    cbs.fseek  = mem_fseek;
    cbs.fclose = mem_fclose;
    cbs.ftell  = mem_ftell;

    /* Parse PSF container — version 0x41 = QSF */
    int result = psf_load("qsf", &cbs, 0x41,
                          qsf_load_cb, &g_state,
                          qsf_info_cb, &g_state,
                          0, NULL, NULL);

    if (result < 0) return -1;

    /* Initialize QSound emulator state */
    g_state.qsound_state = (uint8_t*)malloc(qsound_get_state_size());
    if (!g_state.qsound_state) return -2;

    qsound_clear_state(g_state.qsound_state);

    /* Set Kabuki encryption key if present */
    if (g_state.has_key && g_state.key_data[0]) {
        uint32_t swap_key1 = get_le32(g_state.key_data);
        uint32_t swap_key2 = get_le32(g_state.key_data + 4);
        uint16_t addr_key  = (uint16_t)(g_state.key_data[8] |
                             ((uint16_t)g_state.key_data[9] << 8));
        uint8_t  xor_key   = g_state.key_data[10];
        qsound_set_kabuki_key(g_state.qsound_state, swap_key1, swap_key2, addr_key, xor_key);
    } else {
        qsound_set_kabuki_key(g_state.qsound_state, 0, 0, 0, 0);
    }

    if (g_state.z80_rom) {
        qsound_set_z80_rom(g_state.qsound_state, g_state.z80_rom, (uint32_t)g_state.z80_size);
    }

    if (g_state.sample_rom) {
        qsound_set_sample_rom(g_state.qsound_state, g_state.sample_rom, (uint32_t)g_state.sample_size);
    }

    g_state.playing = 1;
    return 0;
}

EMSCRIPTEN_KEEPALIVE
int qsf_wasm_render(float* output, uint32_t frames) {
    if (!g_state.playing || !g_state.qsound_state) {
        memset(output, 0, frames * 2 * sizeof(float));
        return 0;
    }

    /* QSound native rate is 24038 Hz. We resample to the target rate. */
    const double native_rate = 24038.0;
    const double ratio = native_rate / (double)g_state.target_sample_rate;

    /* Temporary buffer for native-rate rendering (stereo interleaved int16) */
    /* We need at most ceil(frames * ratio) + 2 native frames */
    uint32_t native_needed = (uint32_t)(frames * ratio) + 4;
    int16_t* native_buf = (int16_t*)malloc(native_needed * 2 * sizeof(int16_t));
    if (!native_buf) {
        memset(output, 0, frames * 2 * sizeof(float));
        return 0;
    }

    /* Render from QSound at native rate */
    unsigned int rendered = native_needed;
    qsound_execute(g_state.qsound_state, 0x7fffffff, native_buf, &rendered);

    /* Resample with linear interpolation */
    double pos = g_state.resample_pos;
    int16_t prev_l = g_state.prev_l;
    int16_t prev_r = g_state.prev_r;

    for (uint32_t i = 0; i < frames; i++) {
        uint32_t idx = (uint32_t)pos;
        double frac = pos - (double)idx;

        int16_t cur_l, cur_r, next_l, next_r;
        if (idx < rendered) {
            cur_l = native_buf[idx * 2];
            cur_r = native_buf[idx * 2 + 1];
        } else {
            cur_l = prev_l;
            cur_r = prev_r;
        }

        if (idx + 1 < rendered) {
            next_l = native_buf[(idx + 1) * 2];
            next_r = native_buf[(idx + 1) * 2 + 1];
        } else {
            next_l = cur_l;
            next_r = cur_r;
        }

        /* Linear interpolation */
        float l = (float)((double)cur_l + frac * (double)(next_l - cur_l)) / 32768.0f;
        float r = (float)((double)cur_r + frac * (double)(next_r - cur_r)) / 32768.0f;

        output[i * 2]     = l;
        output[i * 2 + 1] = r;

        pos += ratio;
    }

    /* Save state for continuity across render calls */
    if ((uint32_t)pos < rendered && (uint32_t)pos > 0) {
        g_state.prev_l = native_buf[((uint32_t)pos - 1) * 2];
        g_state.prev_r = native_buf[((uint32_t)pos - 1) * 2 + 1];
    }
    g_state.resample_pos = pos - (double)(uint32_t)pos;

    free(native_buf);
    return (int)frames;
}

EMSCRIPTEN_KEEPALIVE
uint32_t qsf_wasm_get_length(void) {
    return g_state.length_ms;
}

EMSCRIPTEN_KEEPALIVE
void qsf_wasm_stop(void) {
    g_state.playing = 0;
}

EMSCRIPTEN_KEEPALIVE
void qsf_wasm_dispose(void) {
    g_state.playing = 0;
    free(g_state.qsound_state); g_state.qsound_state = NULL;
    free(g_state.z80_rom); g_state.z80_rom = NULL;
    free(g_state.sample_rom); g_state.sample_rom = NULL;
    g_state.z80_size = 0;
    g_state.sample_size = 0;
}
