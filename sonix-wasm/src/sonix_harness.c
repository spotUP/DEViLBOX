/*
 * Sonix WASM harness
 * Wraps the Sonix C library for Emscripten/AudioWorklet playback.
 *
 * Song data + sidecar instrument files are loaded via JS and passed
 * through the WASM API. The harness provides I/O callbacks that serve
 * instrument data from a pre-loaded in-memory filesystem.
 */

#include "sonix/sonix.c"    /* unity build */
#include "sonix/sonix_io.c"

#include <stdlib.h>
#include <string.h>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define EXPORT
#endif

/* ---- In-memory filesystem for sidecar instruments ---- */

#define MAX_MEMFS_FILES 256

typedef struct {
    char path[256];
    uint8_t *data;
    uint32_t size;
} MemFsEntry;

static MemFsEntry g_memfs[MAX_MEMFS_FILES];
static int g_memfs_count = 0;

/* I/O callback: read file from in-memory FS */
static bool memfs_read_file(const char *path, uint8_t **out_data,
                            uint32_t *out_size, void *user_data) {
    (void)user_data;
    for (int i = 0; i < g_memfs_count; i++) {
        if (strcmp(g_memfs[i].path, path) == 0) {
            uint8_t *copy = (uint8_t *)malloc(g_memfs[i].size);
            if (!copy) return false;
            memcpy(copy, g_memfs[i].data, g_memfs[i].size);
            *out_data = copy;
            *out_size = g_memfs[i].size;
            return true;
        }
    }
    return false;
}

/* Visitor context for directory listing */
typedef struct {
    void (*visitor)(const char *filename, void *ctx);
    void *ctx;
    int count;
} ListDirCtx;

static void memfs_list_visitor(const char *dir_prefix, int dir_len,
                               MemFsEntry *entry, ListDirCtx *lctx) {
    /* Check if entry path starts with dir_prefix/ */
    if (strncmp(entry->path, dir_prefix, (size_t)dir_len) != 0)
        return;
    if (entry->path[dir_len] != '/')
        return;
    const char *rest = entry->path + dir_len + 1;
    /* Only direct children (no further slashes) */
    if (strchr(rest, '/') != NULL)
        return;
    lctx->visitor(rest, lctx->ctx);
    lctx->count++;
}

/* I/O callback: list directory from in-memory FS */
static int memfs_list_dir(const char *dir_path,
                          void (*visitor)(const char *filename, void *ctx),
                          void *ctx, void *user_data) {
    (void)user_data;
    int dir_len = (int)strlen(dir_path);
    /* Strip trailing slash */
    while (dir_len > 0 && dir_path[dir_len - 1] == '/')
        dir_len--;

    ListDirCtx lctx = { visitor, ctx, 0 };
    for (int i = 0; i < g_memfs_count; i++) {
        memfs_list_visitor(dir_path, dir_len, &g_memfs[i], &lctx);
    }
    return lctx.count > 0 ? 0 : -1;
}

/* ---- State ---- */

static SonixSong *g_song = NULL;
static uint8_t *g_song_buf = NULL;
static uint32_t g_sample_rate = 48000;

/* ---- Public API ---- */

/* Register a file in the in-memory filesystem (call before sonix_init) */
EXPORT void sonix_memfs_add(const char *path, const uint8_t *data, uint32_t size) {
    if (g_memfs_count >= MAX_MEMFS_FILES) return;
    MemFsEntry *e = &g_memfs[g_memfs_count++];
    strncpy(e->path, path, sizeof(e->path) - 1);
    e->path[sizeof(e->path) - 1] = '\0';
    e->data = (uint8_t *)malloc(size);
    if (e->data) {
        memcpy(e->data, data, size);
        e->size = size;
    }
}

/* Clear the in-memory filesystem */
EXPORT void sonix_memfs_clear(void) {
    for (int i = 0; i < g_memfs_count; i++) {
        free(g_memfs[i].data);
        g_memfs[i].data = NULL;
    }
    g_memfs_count = 0;
}

EXPORT int sonix_init(const uint8_t *module_data, uint32_t module_size) {
    /* Clean up previous */
    if (g_song) {
        sonix_song_destroy(g_song);
        g_song = NULL;
    }
    if (g_song_buf) {
        free(g_song_buf);
        g_song_buf = NULL;
    }

    /* Copy module data (library keeps pointer) */
    g_song_buf = (uint8_t *)malloc(module_size);
    if (!g_song_buf) return -1;
    memcpy(g_song_buf, module_data, module_size);

    /* Create with memfs I/O callbacks */
    SonixIoCallbacks io = {
        .read_file = memfs_read_file,
        .list_dir = memfs_list_dir,
        .user_data = NULL
    };
    g_song = sonix_song_create(g_song_buf, module_size, &io);
    if (!g_song) return -2;

    const SonixSongMetadata *meta = sonix_song_get_metadata(g_song);
    if (!meta || !meta->valid) {
        const char *err = sonix_song_get_error(g_song);
        (void)err; /* could log */
        return -3;
    }

    sonix_song_set_sample_rate(g_song, g_sample_rate);
    sonix_song_set_stereo_mix(g_song, 0.7f); /* moderate stereo separation */

    return 0;
}

/* Load sidecar instruments after init. song_file_path is used to derive
 * instrument directory paths (the memfs must be populated first). */
EXPORT int sonix_load_instruments(const char *song_file_path) {
    if (!g_song) return -1;
    return sonix_song_load_instruments(g_song, song_file_path);
}

EXPORT void sonix_start(void) {
    if (g_song) {
        sonix_song_start(g_song);
    }
}

EXPORT void sonix_stop(void) {
    if (g_song) {
        sonix_song_destroy(g_song);
        g_song = NULL;
    }
    if (g_song_buf) {
        free(g_song_buf);
        g_song_buf = NULL;
    }
}

EXPORT int sonix_render(float *buf, int frames) {
    if (!g_song) return 0;
    return sonix_song_decode(g_song, buf, frames);
}

EXPORT void sonix_set_sample_rate(uint32_t rate) {
    g_sample_rate = rate;
    if (g_song) {
        sonix_song_set_sample_rate(g_song, rate);
    }
}

EXPORT void sonix_set_solo_channel(int32_t channel) {
    if (g_song) {
        sonix_song_set_solo_channel(g_song, channel);
    }
}

EXPORT void sonix_set_stereo_mix(float mix) {
    if (g_song) {
        sonix_song_set_stereo_mix(g_song, mix);
    }
}

EXPORT int sonix_get_format(void) {
    if (!g_song) return 0;
    const SonixSongMetadata *meta = sonix_song_get_metadata(g_song);
    return meta ? (int)meta->format : 0;
}

EXPORT int sonix_get_num_channels(void) {
    if (!g_song) return 0;
    const SonixSongMetadata *meta = sonix_song_get_metadata(g_song);
    return meta ? (int)meta->num_channels : 0;
}

EXPORT int sonix_get_num_instruments(void) {
    if (!g_song) return 0;
    const SonixSongMetadata *meta = sonix_song_get_metadata(g_song);
    return meta ? (int)meta->num_ins_chunks : 0;
}

EXPORT int sonix_get_num_samples(void) {
    if (!g_song) return 0;
    const SonixSongMetadata *meta = sonix_song_get_metadata(g_song);
    return meta ? (int)meta->num_real_samples : 0;
}

EXPORT const char *sonix_get_format_name(void) {
    if (!g_song) return "UNKNOWN";
    const SonixSongMetadata *meta = sonix_song_get_metadata(g_song);
    return meta ? sonix_format_name(meta->format) : "UNKNOWN";
}

EXPORT const char *sonix_get_error(void) {
    if (!g_song) return "";
    return sonix_song_get_error(g_song);
}

EXPORT const char *sonix_get_instrument_name(uint8_t index) {
    if (!g_song) return "";
    return sonix_song_get_instrument_name(g_song, index);
}

EXPORT int sonix_is_finished(void) {
    if (!g_song) return 1;
    return sonix_song_is_finished(g_song) ? 1 : 0;
}
